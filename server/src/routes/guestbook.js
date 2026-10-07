import express from 'express';
import rateLimit from 'express-rate-limit';
import GuestbookEntry from '../models/GuestbookEntry.js';
import { dbReady } from '../config/db.js';

export const guestbook = express.Router();
const h = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const clean = (v, max) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : '');
guestbook.use((req, res, next) => (dbReady() ? next() : res.status(503).json({ error: 'The visitors list is not available right now.' })));

// Public: anyone can read. Only name, message and date are exposed.
guestbook.get('/', h(async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 100);
  const rows = await GuestbookEntry.find().sort('-createdAt').limit(limit).select('name message createdAt -_id').lean();
  res.json(rows);
}));

// Public: anyone can sign. Limited to 5 per IP per hour.
guestbook.post('/', express.json({ limit: '4kb' }), rateLimit({ windowMs: 60 * 60 * 1000, limit: 5, message: { error: 'Too many entries. Please try again later.' } }), h(async (req, res) => {
  if (req.body?.website) return res.status(201).json({ ok: true }); // honeypot: bots fill hidden field, pretend success
  const name = clean(req.body?.name, 60), message = clean(req.body?.message, 200);
  if (name.length < 2) return res.status(400).json({ error: 'Please enter your name (at least 2 characters).' });
  await GuestbookEntry.create({ name, message });
  res.status(201).json({ ok: true });
}));
