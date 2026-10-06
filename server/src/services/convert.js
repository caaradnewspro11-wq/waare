import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import path from 'node:path';
import { Document, Packer, Paragraph, HeadingLevel, TextRun, PageBreak } from 'docx';
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

// Extract text lines (with x positions) from a text-based PDF
async function pdfLines(file) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const data = new Uint8Array(await fs.readFile(file));
  const pdf = await pdfjs.getDocument({ data, useSystemFonts: true }).promise;
  const pages = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const { items } = await (await pdf.getPage(p)).getTextContent();
    const rows = new Map();
    for (const it of items) {
      if (!it.str.trim()) continue;
      const y = Math.round(it.transform[5] / 3);
      if (!rows.has(y)) rows.set(y, []);
      rows.get(y).push({ x: it.transform[4], w: it.width, size: Math.abs(it.transform[0]), s: it.str });
    }
    pages.push([...rows.entries()].sort((a, b) => b[0] - a[0]).map(([, r]) => r.sort((a, b) => a.x - b.x)));
  }
  if (!pages.flat().length) throw Object.assign(new Error('No extractable text found. This PDF looks scanned (image-only); OCR is not supported.'), { status: 422 });
  return pages;
}

const cells = (row) => {
  const out = []; let cur = row[0]?.s ?? '', end = row[0] ? row[0].x + row[0].w : 0;
  for (const it of row.slice(1)) {
    if (it.x - end > 12) { out.push(cur.trim()); cur = it.s; } else cur += (it.x - end > 1.5 ? ' ' : '') + it.s;
    end = it.x + it.w;
  }
  out.push(cur.trim()); return out;
};

export async function pdfToWord(inPath, outDir, id) {
  const pages = await pdfLines(inPath);
  const sizes = pages.flat().map(r => Math.max(...r.map(i => i.size)));
  const body = [...sizes].sort((a, b) => a - b)[Math.floor(sizes.length / 2)];
  const children = [];
  pages.forEach((lines, pi) => {
    if (pi) children.push(new Paragraph({ children: [new PageBreak()] }));
    for (const r of lines) {
      const text = r.map(i => i.s).join(' ');
      const big = Math.max(...r.map(i => i.size));
      children.push(big > body * 1.25
        ? new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun(text)] })
        : new Paragraph({ children: [new TextRun(text)] }));
    }
  });
  const out = path.join(outDir, `${id}.docx`);
  await fs.writeFile(out, await Packer.toBuffer(new Document({ sections: [{ children }] })));
  return out;
}

export async function pdfToExcel(inPath, outDir, id) {
  const pages = await pdfLines(inPath);
  const wb = new ExcelJS.Workbook();
  pages.forEach((lines, i) => {
    const ws = wb.addWorksheet(`Page ${i + 1}`);
    lines.forEach(r => ws.addRow(cells(r)));
    ws.columns.forEach(c => { c.width = 22; });
  });
  const out = path.join(outDir, `${id}.xlsx`);
  await wb.xlsx.writeFile(out);
  return out;
}
