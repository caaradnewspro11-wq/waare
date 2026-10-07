import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import User from '../models/User.js';
import { dbReady } from '../config/db.js';
import { requireAuth } from '../middleware/auth.js';

export const auth = express.Router();
auth.use(express.json({ limit: '10kb' }), rateLimit({ windowMs: 15 * 60 * 1000, limit: 20 }));
auth.use((req, res, next) => (dbReady() && process.env.JWT_SECRET ? next() : res.status(503).json({ error: 'Accounts are not enabled on this server.' })));

const sign = (u) => ({ token: jwt.sign({ id: u.id, role: u.role, name: u.name }, process.env.JWT_SECRET, { expiresIn: '7d' }), user: { name: u.name, email: u.email, role: u.role } });
const h = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch((e) => (e.code === 11000 ? res.status(409).json({ error: 'Email already registered.' }) : next(e)));
const adminEmails = () => (process.env.ADMIN_EMAILS || '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
const str = (v) => (typeof v === 'string' ? v.trim() : '');

auth.post('/register', h(async (req, res) => {
  const name = str(req.body.name), email = str(req.body.email).toLowerCase(), pw = str(req.body.password);
  if (!name || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || pw.length < 8) return res.status(400).json({ error: 'Enter a name, a valid email and a password of at least 8 characters.' });
  if (await User.exists({ email })) return res.status(409).json({ error: 'Email already registered.' });
  res.status(201).json(sign(await User.create({ name, email, role: adminEmails().includes(email) ? 'admin' : 'user', passwordHash: await bcrypt.hash(pw, 12) })));
}));
auth.post('/login', h(async (req, res) => {
  const u = await User.findOne({ email: str(req.body.email).toLowerCase() }).select('+passwordHash');
  if (!u || !(await bcrypt.compare(str(req.body.password), u.passwordHash))) return res.status(401).json({ error: 'Invalid email or password.' });
  if (adminEmails().includes(u.email) && u.role !== 'admin') { u.role = 'admin'; await u.save(); }
  res.json(sign(u));
}));
auth.get('/me', requireAuth, (req, res) => res.json({ user: { name: req.user.name } }));
