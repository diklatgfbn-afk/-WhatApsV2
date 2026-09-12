const jwt = require('jsonwebtoken');
require('dotenv').config();

function requireAuth(req, res, next) {
  const token = req.cookies?.token || req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const secret = process.env.JWT_SECRET || 'fallback-secret-change-me';
    req.user = jwt.verify(token, secret);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

module.exports = { requireAuth };
