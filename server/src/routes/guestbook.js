import express from 'express';
import mongoose from 'mongoose';
import crypto from 'node:crypto';
import rateLimit from 'express-rate-limit';
import GuestbookEntry from '../models/GuestbookEntry.js';
import { dbReady } from '../config/db.js';

export const guestbook = express.Router();
const h = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const clean = (v, max) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : '');
const hash = (t) => crypto.createHash('sha256').update(t).digest('hex');
const same = (a, b) => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
const limit = (n, message) => rateLimit({ windowMs: 60 * 60 * 1000, limit: n, message: { error: message } });
guestbook.use((req, res, next) => (dbReady() ? next() : res.status(503).json({ error: 'The visitors list is not available right now.' })));

async function owned(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) { res.status(400).json({ error: 'Invalid id.' }); return null; }
  const token = String(req.get('x-edit-token') || '');
  const entry = await GuestbookEntry.findById(req.params.id).select('+editTokenHash');
  if (!entry?.editTokenHash || !token || !same(hash(token), entry.editTokenHash)) {
    res.status(403).json({ error: 'You can only change entries you wrote in this browser.' }); return null;
  }
  return entry;
}

guestbook.get('/', h(async (req, res) => {
  const n = Math.min(Number(req.query.limit) || 50, 100);
  res.json(await GuestbookEntry.find().sort('-createdAt').limit(n).select('name message edited createdAt').lean());
}));

guestbook.post('/', express.json({ limit: '4kb' }), limit(5, 'Too many entries. Please try again later.'), h(async (req, res) => {
  if (req.body?.website) return res.status(201).json({ ok: true }); // honeypot
  const name = clean(req.body?.name, 60), message = clean(req.body?.message, 200);
  if (name.length < 2) return res.status(400).json({ error: 'Please enter your name (at least 2 characters).' });
  const editToken = crypto.randomBytes(24).toString('hex');
  const e = await GuestbookEntry.create({ name, message, editTokenHash: hash(editToken) });
  res.status(201).json({ ok: true, id: e.id, editToken });
}));

guestbook.patch('/:id', express.json({ limit: '4kb' }), limit(30, 'Too many changes. Please try again later.'), h(async (req, res) => {
  const entry = await owned(req, res); if (!entry) return;
  const name = clean(req.body?.name, 60), message = clean(req.body?.message, 200);
  if (name.length < 2) return res.status(400).json({ error: 'Please enter your name (at least 2 characters).' });
  entry.name = name; entry.message = message; entry.edited = true;
  await entry.save();
  res.json({ ok: true });
}));

guestbook.delete('/:id', limit(30, 'Too many changes. Please try again later.'), h(async (req, res) => {
  const entry = await owned(req, res); if (!entry) return;
  await entry.deleteOne();
  res.json({ ok: true });
}));
