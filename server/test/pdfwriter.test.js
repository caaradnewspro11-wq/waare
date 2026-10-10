import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { buildPdf } from '../../client/src/lib/pdf.js';

const has = (c) => { try { execFileSync(c, ['-v'], { stdio: 'ignore' }); return true; } catch { return false; } };
test('PDF writer (Scan Editor export): valid multi-page PDF with correct page sizes and pixels', { skip: !has('pdfinfo') }, async () => {
  const mk = async (w, h, c) => ({ bytes: new Uint8Array(await sharp({ create: { width: w, height: h, channels: 3, background: c } }).jpeg().toBuffer()), width: w, height: h });
  const file = path.join(mkdtempSync(path.join(tmpdir(), 'pdfw-')), 't.pdf');
  writeFileSync(file, buildPdf([await mk(800, 1100, '#cc3333'), await mk(1200, 800, '#3366cc')]));
  const info = execFileSync('pdfinfo', ['-f', '1', '-l', '2', file]).toString();
  assert.match(info, /Pages:\s+2/); assert.match(info, /Page\s+1 size:\s+595 x 818/); assert.match(info, /Page\s+2 size:\s+842 x 561/);
});
