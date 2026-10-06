import express from 'express';
import ConversionHistory from '../models/ConversionHistory.js';
import { requireAuth } from '../middleware/auth.js';
import { dbReady } from '../config/db.js';
export const history = express.Router();
history.get('/', requireAuth, async (req, res) => {
  if (!dbReady()) return res.status(503).json({ error: 'History is not enabled on this server.' });
  res.json(await ConversionHistory.find({ user: req.user.id }).sort('-createdAt').limit(Number(req.query.limit) || 50).lean());
});
