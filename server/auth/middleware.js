import jwt from 'jsonwebtoken';
const JWT_SECRET = process.env.JWT_SECRET || 'ai-script-kill-dev-secret';
export function signToken(userId) { return jwt.sign({ userId }, JWT_SECRET, { expiresIn: '7d' }); }
export function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return res.status(401).json({ error: '未登录' });
  try { req.user = { userId: jwt.verify(header.slice(7), JWT_SECRET).userId }; next(); }
  catch { res.status(401).json({ error: '登录已过期' }); }
}
