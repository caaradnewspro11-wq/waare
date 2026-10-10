import express from 'express';
import rateLimit from 'express-rate-limit';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import { DIR, TTL_MS } from '../config/storage.js';
import { makeUpload, SCAN_RULE } from '../middleware/upload.js';
import { analyzeScan, pageImagePath, MAX_EDITOR_PAGES } from '../services/ocr.js';

const MAX_MB = Number(process.env.MAX_FILE_MB || 20);
const upload = makeUpload(MAX_MB, () => SCAN_RULE);
export const scan = express.Router();
let running = 0; // OCR is CPU heavy: limit parallel jobs so one busy moment cannot freeze the server

scan.use(rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, message: { error: 'Too many requests. Please try again later.' } }));

// Upload a scan/photo/PDF -> page images (kept 30 min) + recognised words with boxes.
scan.post('/analyze', upload.single('file'), async (req, res, next) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });
  if (running >= 2) { await fs.rm(req.file.path, { force: true }); return res.status(503).json({ error: 'The server is busy. Please try again in a minute.' }); }
  running++;
  try {
    const out = await analyzeScan(req.file.path, DIR, crypto.randomUUID(), { lang: req.body?.lang });
    res.json({ ...out, maxPages: MAX_EDITOR_PAGES, expiresInMinutes: TTL_MS / 60000 });
  } catch (e) {
    next(e.status ? e : Object.assign(new Error('Could not analyse this file. It may be corrupted or unsupported.'), { status: 500, cause: e }));
  } finally {
    running--;
    await fs.rm(req.file.path, { force: true });
  }
});

scan.get('/:id/page/:n', async (req, res) => {
  const n = Number(req.params.n);
  if (!/^[0-9a-f-]{36}$/.test(req.params.id) || !Number.isInteger(n) || n < 1 || n > MAX_EDITOR_PAGES) return res.status(400).json({ error: 'Invalid page.' });
  const file = pageImagePath(DIR, req.params.id, n);
  try { await fs.access(file); } catch { return res.status(404).json({ error: 'Page not found or expired.' }); }
  res.set('Cache-Control', 'private, max-age=1800').type('png').sendFile(file);
});
