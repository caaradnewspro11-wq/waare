import express from 'express';
import mongoose from 'mongoose';
import User from '../models/User.js';
import GuestbookEntry from '../models/GuestbookEntry.js';
import ConversionHistory from '../models/ConversionHistory.js';
import { dbReady } from '../config/db.js';
import { requireAuth } from '../middleware/auth.js';

export const admin = express.Router();
const h = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const badId = (req, res) => !mongoose.isValidObjectId(req.params.id) && res.status(400).json({ error: 'Invalid id.' });

// Every admin route: valid token + role re-checked in the database (not trusted from the token)
admin.use(express.json({ limit: '10kb' }), requireAuth, h(async (req, res, next) => {
  if (!dbReady()) return res.status(503).json({ error: 'Database not connected.' });
  const u = await User.findById(req.user.id).select('role').lean();
  if (u?.role !== 'admin') return res.status(403).json({ error: 'Admins only.' });
  next();
}));

admin.get('/stats', h(async (req, res) => {
  const since = new Date(Date.now() - 864e5);
  const [users, total, completed, failed, last24, byTool] = await Promise.all([
    User.countDocuments(), ConversionHistory.countDocuments(),
    ConversionHistory.countDocuments({ status: 'completed' }), ConversionHistory.countDocuments({ status: 'failed' }),
    ConversionHistory.countDocuments({ createdAt: { $gte: since } }),
    ConversionHistory.aggregate([{ $group: { _id: { $concat: ['$originalFormat', ' → ', '$targetFormat'] }, count: { $sum: 1 } } }, { $sort: { count: -1 } }]),
  ]);
  res.json({ users, total, completed, failed, last24, byTool: byTool.map((t) => ({ tool: t._id, count: t.count })) });
}));

admin.get('/users', h(async (req, res) => {
  const [users, counts] = await Promise.all([
    User.find().sort('-createdAt').limit(200).lean(),
    ConversionHistory.aggregate([{ $group: { _id: '$user', n: { $sum: 1 } } }]),
  ]);
  const map = new Map(counts.map((c) => [String(c._id), c.n]));
  res.json(users.map((u) => ({ _id: u._id, name: u.name, email: u.email, role: u.role, createdAt: u.createdAt, conversions: map.get(String(u._id)) || 0 })));
}));

admin.patch('/users/:id', h(async (req, res) => {
  if (badId(req, res)) return;
  if (req.params.id === req.user.id) return res.status(400).json({ error: 'You cannot change your own role.' });
  if (!['user', 'admin'].includes(req.body.role)) return res.status(400).json({ error: 'Invalid role.' });
  const u = await User.findByIdAndUpdate(req.params.id, { role: req.body.role }, { new: true }).lean();
  u ? res.json({ ok: true }) : res.status(404).json({ error: 'User not found.' });
}));

admin.delete('/users/:id', h(async (req, res) => {
  if (badId(req, res)) return;
  if (req.params.id === req.user.id) return res.status(400).json({ error: 'You cannot delete yourself.' });
  const u = await User.findByIdAndDelete(req.params.id);
  if (!u) return res.status(404).json({ error: 'User not found.' });
  await ConversionHistory.deleteMany({ user: req.params.id });
  res.json({ ok: true });
}));

admin.get('/conversions', h(async (req, res) => {
  res.json(await ConversionHistory.find().sort('-createdAt').limit(200).populate('user', 'email').lean());
}));

admin.delete('/conversions/:id', h(async (req, res) => {
  if (badId(req, res)) return;
  await ConversionHistory.findByIdAndDelete(req.params.id);
  res.json({ ok: true });
}));

admin.get('/guestbook', h(async (req, res) => res.json(await GuestbookEntry.find().sort('-createdAt').limit(200).lean())));
admin.delete('/guestbook/:id', h(async (req, res) => {
  if (badId(req, res)) return;
  await GuestbookEntry.findByIdAndDelete(req.params.id);
  res.json({ ok: true });
}));
