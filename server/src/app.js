import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { DIR, TTL_MS } from './config/storage.js';
import { auth } from './routes/auth.js';
import { history } from './routes/history.js';
import { admin } from './routes/admin.js';
import { guestbook } from './routes/guestbook.js';
import { scan } from './routes/scan.js';
import { optionalAuth } from './middleware/auth.js';
import { makeUpload, SCAN_RULE } from './middleware/upload.js';
import { dbReady } from './config/db.js';
import { record } from './services/history.js';
import { scanToWord } from './services/ocr.js';
import { officeToPdf, pdfToWord, pdfToExcel } from './services/convert.js';

const MAX_MB = Number(process.env.MAX_FILE_MB || 20);
await fs.mkdir(DIR, { recursive: true });

const TOOLS = {
  'word-to-pdf':  { exts: ['.docx'], mimes: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'], fn: officeToPdf },
  'excel-to-pdf': { exts: ['.xlsx', '.xls'], mimes: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel'], fn: officeToPdf },
  'pdf-to-word':  { exts: ['.pdf'], mimes: ['application/pdf'], fn: pdfToWord },
  'pdf-to-excel': { exts: ['.pdf'], mimes: ['application/pdf'], fn: pdfToExcel },
  'scan-to-word': { ...SCAN_RULE, fn: scanToWord },
};
const upload = makeUpload(MAX_MB, (req) => TOOLS[req.params.tool]);

// Delete anything older than TTL
async function cleanup() {
  for (const f of await fs.readdir(DIR).catch(() => [])) {
    const p = path.join(DIR, f);
    const st = await fs.stat(p).catch(() => null);
    if (st && Date.now() - st.mtimeMs > TTL_MS) await fs.rm(p, { recursive: true, force: true });
  }
}
setInterval(cleanup, 5 * 60 * 1000).unref();

export const app = express();
app.set('trust proxy', 1); // Railway sits behind a proxy; needed for correct rate-limit IPs
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } })); // page images are fetched by the Netlify site
const origins = (process.env.CLIENT_ORIGIN || 'http://localhost:5173').split(',').map((o) => o.trim().replace(/\/$/, ''));
app.use(cors({ origin: origins }));
app.use('/api/convert', rateLimit({ windowMs: 15 * 60 * 1000, limit: 30 }));

app.get('/api/health', (req, res) => res.json({ ok: true, db: dbReady(), auth: Boolean(process.env.JWT_SECRET) }));

app.post('/api/convert/:tool', (req, res, next) => {
  if (!TOOLS[req.params.tool]) return res.status(404).json({ error: 'Unknown conversion tool.' });
  next();
}, optionalAuth, upload.single('file'), async (req, res, next) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });
  const id = crypto.randomUUID();
  try {
    await TOOLS[req.params.tool].fn(req.file.path, DIR, id, { lang: req.body?.lang });
    await record(req, { outputId: id, status: 'completed', expiresAt: new Date(Date.now() + TTL_MS) });
    res.json({ id, downloadUrl: `/api/convert/download/${id}`, expiresInMinutes: TTL_MS / 60000 });
  } catch (e) {
    await record(req, { status: 'failed' });
    next(e.status ? e : Object.assign(new Error('Conversion failed. The file may be corrupted or unsupported.'), { status: 500, cause: e }));
  } finally {
    await fs.rm(req.file.path, { force: true }); // upload deleted right after conversion
  }
});

app.get('/api/convert/download/:id', async (req, res) => {
  if (!/^[0-9a-f-]{36}$/.test(req.params.id)) return res.status(400).json({ error: 'Invalid id.' });
  const f = (await fs.readdir(DIR)).find((n) => n.startsWith(req.params.id + '.'));
  if (!f) return res.status(404).json({ error: 'File not found or expired.' });
  res.download(path.join(DIR, f), `converted${path.extname(f)}`);
});

app.use('/api/auth', auth);
app.use('/api/history', history);
app.use('/api/admin', admin);
app.use('/api/guestbook', guestbook);
app.use('/api/scan', scan);

app.use((err, req, res, next) => {
  if (err.cause) console.error(err.cause);
  const big = err.code === 'LIMIT_FILE_SIZE';
  const status = big ? 413 : err.status || 500;
  res.status(status).json({ error: big ? `File exceeds ${MAX_MB} MB.` : status === 500 ? 'Server error.' : err.message });
});
