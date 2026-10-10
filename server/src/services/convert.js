import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import path from 'node:path';
import { Document, Packer, Paragraph, HeadingLevel, TextRun, PageBreak, Table, TableRow, TableCell, WidthType, BorderStyle, AlignmentType } from 'docx';
import ExcelJS from 'exceljs';
const run = promisify(execFile);

// Word/Excel -> PDF via LibreOffice (must be installed: `soffice`)
export async function officeToPdf(inPath, outDir, id) {
  const profile = path.join(outDir, `lo-${id}`);
  await run('soffice', [`-env:UserInstallation=file://${profile}`, '--headless', '--convert-to', 'pdf', '--outdir', outDir, inPath], { timeout: 120000 });
  await fs.rm(profile, { recursive: true, force: true });
  const produced = path.join(outDir, path.basename(inPath).replace(/\.[^.]+$/, '.pdf'));
  const final = path.join(outDir, `${id}.pdf`);
  await fs.rename(produced, final);
  return final;
}

// ---------- reading text with positions from a text-based PDF ----------
async function pdfPages(file) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const data = new Uint8Array(await fs.readFile(file));
  const pdf = await pdfjs.getDocument({ data, useSystemFonts: true }).promise;
  const pages = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const { items } = await (await pdf.getPage(p)).getTextContent();
    const rows = new Map();
    for (const it of items) {
      if (!it.str.trim()) continue;
      const k = Math.round(it.transform[5] / 3);
      if (!rows.has(k)) rows.set(k, []);
      rows.get(k).push({ x: it.transform[4], w: it.width, size: Math.abs(it.transform[0]), s: it.str });
    }
    pages.push([...rows.entries()].sort((a, b) => b[0] - a[0]).map(([, r]) => r.sort((a, b) => a.x - b.x)));
  }
  if (!pages.flat().length) throw Object.assign(new Error('No extractable text found. This PDF looks scanned (image-only). Use "Scan to Word (OCR)" instead.'), { status: 422 });
  return pages;
}

// ---------- structure: lines -> paragraphs and real tables ----------
// opts.minGap: smallest horizontal gap (same unit as x) that separates two cells
// opts.ratio : gap must also exceed ratio * font size
// opts.tol   : horizontal tolerance when merging cell spans into columns
const PDF_OPTS = { minGap: 12, ratio: 1.1, tol: 3 };

function lineCells(row, { minGap, ratio }) {
  let cur = { x: row[0].x, end: row[0].x + row[0].w, text: row[0].s, size: row[0].size };
  const cells = [];
  for (const it of row.slice(1)) {
    if (it.x - cur.end > Math.max(minGap, it.size * ratio)) { cells.push(cur); cur = { x: it.x, end: it.x + it.w, text: it.s, size: it.size }; }
    else { cur.text += (it.x - cur.end > minGap * 0.12 ? ' ' : '') + it.s; cur.end = it.x + it.w; cur.size = Math.max(cur.size, it.size); }
  }
  cells.push(cur);
  return cells.map((c) => ({ ...c, text: c.text.trim() }));
}

function toTable(rowsOfCells, { tol }) {
  const spans = rowsOfCells.flatMap((r) => r.map((c) => [c.x, c.end])).sort((a, b) => a[0] - b[0]);
  const cols = [];
  for (const [a, b] of spans) { const last = cols[cols.length - 1]; if (last && a <= last[1] + tol) last[1] = Math.max(last[1], b); else cols.push([a, b]); }
  if (cols.length < 2 || cols.length > 20) return null;
  const rows = rowsOfCells.map((r) => {
    const row = Array(cols.length).fill('');
    for (const c of r) {
      const mid = (c.x + c.end) / 2;
      let i = cols.findIndex(([a, b]) => mid >= a - 1 && mid <= b + 1);
      if (i < 0) i = cols.reduce((best, [a, b], k) => (Math.abs((a + b) / 2 - mid) < Math.abs((cols[best][0] + cols[best][1]) / 2 - mid) ? k : best), 0);
      row[i] = row[i] ? `${row[i]} ${c.text}` : c.text;
    }
    return row;
  });
  if (rows.filter((r) => r.filter(Boolean).length >= 2).length < Math.ceil(rows.length * 0.6)) return null;
  // column widths: from each column's start to the next column's start (the last column keeps its own width)
  const widths = cols.map(([a, b], k) => (k < cols.length - 1 ? cols[k + 1][0] - a : b - a));
  return { type: 'table', rows, widths };
}

export function structurePage(lines, opts = PDF_OPTS) {
  const o = { ...PDF_OPTS, ...opts };
  const cellLines = lines.map((l) => lineCells(l, o));
  // A single-cell line sitting between two multi-cell lines and aligned with a column start is a table row with empty cells
  const isRowInTable = (i) => {
    const prev = cellLines[i - 1], next = cellLines[i + 1];
    if (!prev || !next || prev.length < 2 || next.length < 2 || cellLines[i].length !== 1) return false;
    const starts = [...prev, ...next].map((c) => c.x);
    return starts.some((x) => Math.abs(x - cellLines[i][0].x) <= o.tol * 3);
  };
  const blocks = []; let pending = [];
  const para = (cells) => ({ type: 'para', text: cells.map((c) => c.text).join(' '), size: Math.max(...cells.map((c) => c.size)) });
  const flush = () => {
    if (pending.length >= 2) { const t = toTable(pending, o); if (t) { blocks.push(t); pending = []; return; } }
    pending.forEach((cells) => blocks.push(para(cells))); pending = [];
  };
  cellLines.forEach((cells, i) => {
    if (cells.length >= 2 || (pending.length && isRowInTable(i))) pending.push(cells);
    else { flush(); blocks.push(para(cells)); }
  });
  flush();
  return blocks;
}

// ---------- writers ----------
const edge = { style: BorderStyle.SINGLE, size: 4, color: '808080' };
const borders = { top: edge, bottom: edge, left: edge, right: edge, insideHorizontal: edge, insideVertical: edge };
const NUM = /^[-+(]?[$€£]?\s?\d[\d,.\s]*%?\)?$/;
const PAGE_TWIPS = 9026; // A4 text width with default margins

export async function blocksToDocx(pages, { headings = true } = {}) {
  const sizes = pages.flat().filter((b) => b.type === 'para').map((b) => b.size).sort((a, b) => a - b);
  const body = sizes[Math.floor(sizes.length / 2)] || 12;
  const children = [];
  pages.forEach((blocks, pi) => {
    if (pi) children.push(new Paragraph({ children: [new PageBreak()] }));
    for (const b of blocks) {
      if (b.type === 'table') {
        const total = b.widths.reduce((s, w) => s + w, 0) || 1;
        const cw = b.widths.map((w) => Math.max(500, Math.round((w / total) * PAGE_TWIPS)));
        children.push(new Table({
          width: { size: cw.reduce((s, w) => s + w, 0), type: WidthType.DXA }, columnWidths: cw, borders,
          rows: b.rows.map((r) => new TableRow({ children: r.map((t, i) => new TableCell({
            width: { size: cw[i], type: WidthType.DXA },
            children: [new Paragraph({ alignment: NUM.test(t) ? AlignmentType.RIGHT : AlignmentType.LEFT, children: [new TextRun(t)] })],
          })) })),
        }));
        children.push(new Paragraph({ children: [] }));
      } else {
        children.push(headings && b.size > body * 1.25
          ? new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun(b.text)] })
          : new Paragraph({ spacing: { after: 100 }, children: [new TextRun(b.text)] }));
      }
    }
  });
  return Packer.toBuffer(new Document({ sections: [{ children: children.length ? children : [new Paragraph('')] }] }));
}

const asNumber = (t) => (/^-?\d{1,3}(,\d{3})+(\.\d+)?$|^-?\d+(\.\d+)?$/.test(t) ? Number(t.replace(/,/g, '')) : t);

export async function blocksToXlsx(pages) {
  const wb = new ExcelJS.Workbook();
  const thin = { style: 'thin', color: { argb: 'FF808080' } };
  pages.forEach((blocks, i) => {
    const ws = wb.addWorksheet(`Page ${i + 1}`); const width = [];
    for (const b of blocks) {
      if (b.type === 'table') {
        b.rows.forEach((r) => {
          const row = ws.addRow(r.map(asNumber));
          row.eachCell({ includeEmpty: true }, (cell) => { cell.border = { top: thin, bottom: thin, left: thin, right: thin }; });
          r.forEach((t, c) => { width[c] = Math.min(60, Math.max(width[c] || 10, String(t).length + 2)); });
        });
        ws.addRow([]);
      } else ws.addRow([b.text]);
    }
    ws.columns = width.map((w) => ({ width: w }));
  });
  return wb.xlsx.writeBuffer();
}

export async function pdfToWord(inPath, outDir, id) {
  const pages = (await pdfPages(inPath)).map((p) => structurePage(p));
  const out = path.join(outDir, `${id}.docx`);
  await fs.writeFile(out, await blocksToDocx(pages));
  return out;
}

export async function pdfToExcel(inPath, outDir, id) {
  const pages = (await pdfPages(inPath)).map((p) => structurePage(p));
  const out = path.join(outDir, `${id}.xlsx`);
  await fs.writeFile(out, Buffer.from(await blocksToXlsx(pages)));
  return out;
}
