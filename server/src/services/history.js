import ConversionHistory from '../models/ConversionHistory.js';
import { dbReady } from '../config/db.js';
// Only authenticated users get history; guests are never recorded.
export async function record(req, { outputId, status, expiresAt }) {
  if (!req.user || !dbReady()) return;
  const [from, to] = req.params.tool.split('-to-');
  try { await ConversionHistory.create({ user: req.user.id, originalName: req.file?.originalname, originalFormat: from, targetFormat: to, status, outputId, expiresAt }); }
  catch (e) { console.error('history error', e.message); }
}
