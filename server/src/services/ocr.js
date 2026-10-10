import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { structurePage, blocksToDocx } from './convert.js';
const run = promisify(execFile);

// Tesseract has no official Somali model; Somali uses plain Latin letters, so it uses the English model.
export const OCR_LANGS = ['eng', 'ara', 'eng+ara'];
const ALIAS = { som: 'eng', 'eng+som': 'eng' };
export const MAX_PAGES = 15;
export const MAX_EDITOR_PAGES = 8;
const err = (message, status) => Object.assign(new Error(message), { status });

let installed;
async function chooseLang(lang) {
  if (!installed) {
    const { stdout } = await run('tesseract', ['--list-langs']);
    installed = new Set(stdout.split('\n').map((l) => l.trim()).filter((l) => /^[a-z_]+$/.test(l)));
  }
  const req = ALIAS[lang] || lang;
  const wanted = (OCR_LANGS.includes(req) ? req : 'eng').split('+').filter((l) => installed.has(l));
  return wanted.length ? wanted.join('+') : 'eng';
}

// PDF -> one PNG per page (Poppler); image -> one auto-rotated, size-limited PNG (sharp)
export async function toPageImages(inPath, work, maxPages) {
  await fs.mkdir(work, { recursive: true });
  if (inPath.toLowerCase().endsWith('.pdf')) {
    await run('pdftoppm', ['-r', '200', '-l', String(maxPages), '-png', inPath, path.join(work, 'p')], { timeout: 180000 });
    const files = (await fs.readdir(work)).filter((f) => f.startsWith('p') && f.endsWith('.png')).sort();
    if (!files.length) throw err('Could not read this PDF.', 422);
    return files.map((f) => path.join(work, f));
  }
  const out = path.join(work, 'p-1.png');
  try {
    await sharp(inPath, { limitInputPixels: 120e6 }).rotate().resize({ width: 4200, height: 4200, fit: 'inside', withoutEnlargement: true }).flatten({ background: '#ffffff' }).png().toFile(out);
  } catch { throw err('Could not read this image. Use a JPG, PNG, TIFF, BMP or WebP file.', 422); }
  return [out];
}

function parseTsv(tsv) {
  const words = [];
  for (const row of tsv.split('\n').slice(1)) {
    const c = row.split('\t');
    if (c.length < 12 || c[0] !== '5') continue;
    const text = c.slice(11).join('\t').trim(); const conf = Number(c[10]);
    if (!text || conf < 0) continue;
    words.push({ block: +c[2], par: +c[3], line: +c[4], x: +c[6], y: +c[7], w: +c[8], h: +c[9], conf: Math.round(conf), text });
  }
  return words;
}

export async function recognize(img, lang) {
  const { stdout } = await run('tesseract', [img, 'stdout', '-l', await chooseLang(lang), '--psm', '3', '--dpi', '200', 'tsv'],
    { timeout: 180000, maxBuffer: 64 * 1024 * 1024, env: { ...process.env, OMP_THREAD_LIMIT: '1' } });
  return parseTsv(stdout);
}

// ---- Scan to Word: group words into visual rows by position, then reuse the text-PDF table detector ----
export function rowsFromWords(words) {
  const sorted = [...words].sort((a, b) => a.y + a.h / 2 - (b.y + b.h / 2));
  const rows = [];
  for (const w of sorted) {
    const cy = w.y + w.h / 2, last = rows[rows.length - 1];
    if (last && Math.abs(cy - last.cy) <= Math.max(last.h, w.h) * 0.5) { last.items.push(w); last.cy = (last.cy * (last.items.length - 1) + cy) / last.items.length; last.h = Math.max(last.h, w.h); }
    else rows.push({ items: [w], cy, h: w.h });
  }
  return rows.map((r) => r.items.sort((a, b) => a.x - b.x).map((w) => ({ x: w.x, w: w.w, size: w.h, s: w.text })));
}

export async function scanToWord(inPath, outDir, id, { lang } = {}) {
  const work = path.join(outDir, `ocr-${id}`);
  try {
    const images = await toPageImages(inPath, work, MAX_PAGES);
    const pages = [];
    for (const img of images) {
      const words = await recognize(img, lang);
      const heights = words.map((w) => w.h).sort((a, b) => a - b);
      const med = heights[Math.floor(heights.length / 2)] || 20;
      pages.push(structurePage(rowsFromWords(words), { minGap: med * 1.3, ratio: 0, tol: med * 0.2 }));
    }
    if (!pages.flat().length) throw err('No text could be recognised. Try a clearer, higher-resolution scan.', 422);
    const out = path.join(outDir, `${id}.docx`);
    await fs.writeFile(out, await blocksToDocx(pages, { headings: false }));
    return out;
  } finally {
    await fs.rm(work, { recursive: true, force: true });
  }
}

// ---- Scan Editor: keep page images + word boxes so the browser can edit text in place ----
export const pageImagePath = (outDir, id, n) => path.join(outDir, `scan-${id}-${n}.png`);

export async function analyzeScan(inPath, outDir, id, { lang } = {}) {
  const work = path.join(outDir, `scanwork-${id}`);
  try {
    const images = await toPageImages(inPath, work, MAX_EDITOR_PAGES);
    const pages = [];
    for (let i = 0; i < images.length; i++) {
      const words = await recognize(images[i], lang);
      const meta = await sharp(images[i]).metadata();
      await fs.copyFile(images[i], pageImagePath(outDir, id, i + 1));
      const byLine = new Map();
      for (const w of words) { const k = `${w.block}-${w.par}-${w.line}`; if (!byLine.has(k)) byLine.set(k, []); byLine.get(k).push(w); }
      const lines = [...byLine.values()].map((ws) => {
        ws.sort((a, b) => a.x - b.x);
        const x = Math.min(...ws.map((w) => w.x)), y = Math.min(...ws.map((w) => w.y));
        return { x, y, w: Math.max(...ws.map((w) => w.x + w.w)) - x, h: Math.max(...ws.map((w) => w.y + w.h)) - y,
          words: ws.map(({ text, x, y, w, h, conf }) => ({ text, x, y, w, h, conf })) };
      }).sort((a, b) => a.y - b.y || a.x - b.x);
      pages.push({ n: i + 1, width: meta.width, height: meta.height, lines });
    }
    if (!pages.some((p) => p.lines.length)) throw err('No text could be recognised. Try a clearer, higher-resolution scan.', 422);
    return { id, pages };
  } finally {
    await fs.rm(work, { recursive: true, force: true });
  }
}
