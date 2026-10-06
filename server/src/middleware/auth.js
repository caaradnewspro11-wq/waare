import jwt from 'jsonwebtoken';
const read = (req) => (req.headers.authorization || '').replace(/^Bearer /, '');
export function optionalAuth(req, res, next) {
  try { if (process.env.JWT_SECRET && read(req)) req.user = jwt.verify(read(req), process.env.JWT_SECRET); } catch {}
  next();
}
export function requireAuth(req, res, next) {
  try { req.user = jwt.verify(read(req), process.env.JWT_SECRET || ''); next(); }
  catch { res.status(401).json({ error: 'Please sign in.' }); }
}
