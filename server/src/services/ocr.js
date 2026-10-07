import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import path from 'node:path';
import { Document, Packer, Paragraph, TextRun, PageBreak } from 'docx';
const run = promisify(execFile);

// Tesseract has no official Somali model; Somali is written in plain Latin letters, so it uses the English model.
export const OCR_LANGS = ['eng', 'ara', 'eng+ara'];
const ALIAS = { som: 'eng', 'eng+som': 'eng' };
const MAX_PAGES = 15;
let installed; // languages actually present on this server
async function available() {
  if (!installed) {
    const { stdout } = await run('tesseract', ['--list-langs']);
    installed = new Set(stdout.split('\n').map((l) => l.trim()).filter((l) => /^[a-z_]+$/.test(l)));
  }
  return installed;
}

// Scanned PDF / image -> editable DOCX via Tesseract OCR (+ Poppler for PDF pages)
export async function scanToWord(inPath, outDir, id, { lang } = {}) {
  const have = await available();
  const req = ALIAS[lang] || lang;
  const wanted = (OCR_LANGS.includes(req) ? req : 'eng').split('+').filter((l) => have.has(l));
  const useLang = wanted.length ? wanted.join('+') : 'eng';
  const work = path.join(outDir, `ocr-${id}`);
  await fs.mkdir(work);
  try {
    let images = [inPath];
    if (inPath.toLowerCase().endsWith('.pdf')) {
      await run('pdftoppm', ['-r', '200', '-l', String(MAX_PAGES), '-png', inPath, path.join(work, 'p')], { timeout: 120000 });
      images = (await fs.readdir(work)).filter((f) => f.endsWith('.png')).sort().map((f) => path.join(work, f));
    }
    const pages = [];
    for (const img of images) {
      const { stdout } = await run('tesseract', [img, 'stdout', '-l', useLang, '--psm', '3'],
        { timeout: 120000, maxBuffer: 20 * 1024 * 1024, env: { ...process.env, OMP_THREAD_LIMIT: '1' } });
      pages.push(stdout);
    }
    if (!pages.join('').trim()) throw Object.assign(new Error('No text could be recognised. Try a clearer, higher-resolution scan.'), { status: 422 });

    const children = [];
    pages.forEach((text, i) => {
      if (i) children.push(new Paragraph({ children: [new PageBreak()] }));
      for (const block of text.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean)) {
        children.push(new Paragraph({ spacing: { after: 160 }, children: block.split('\n').map((line, n) => new TextRun({ text: line, break: n ? 1 : 0 })) }));
      }
    });
    const out = path.join(outDir, `${id}.docx`);
    await fs.writeFile(out, await Packer.toBuffer(new Document({ sections: [{ children }] })));
    return out;
  } finally {
    await fs.rm(work, { recursive: true, force: true });
  }
}
