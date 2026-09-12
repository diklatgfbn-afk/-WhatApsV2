const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.post('/register', (req, res) => {
  try {
    const { email, password, display_name } = req.body;
    if (!email || !password || !display_name) return res.status(400).json({ error: 'All fields required' });
    if (User.findByEmail(email)) return res.status(400).json({ error: 'Email already registered' });
    const user = User.create({ email, password, display_name });
    User.seedDefaultCategories(user.id);
    const secret = process.env.JWT_SECRET || 'fallback-secret-change-me';
    const token = jwt.sign({ id: user.id, email: user.email }, secret, { expiresIn: '24h' });
    res.cookie('token', token, { httpOnly: true, maxAge: 86400000 });
    res.json({ token, user });
  } catch (e) {
    console.error('[Register Error]', e.message, e.stack);
    res.status(500).json({ error: e.message });
  }
});

router.post('/login', (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'All fields required' });
    const user = User.findByEmail(email);
    if (!user || !User.verifyPassword(password, user.password_hash)) return res.status(401).json({ error: 'Invalid credentials' });
    const secret = process.env.JWT_SECRET || 'fallback-secret-change-me';
    const token = jwt.sign({ id: user.id, email: user.email }, secret, { expiresIn: '24h' });
    res.cookie('token', token, { httpOnly: true, maxAge: 86400000 });
    res.json({ token, user: User.findById(user.id) });
  } catch (e) {
    console.error('[Login Error]', e.message, e.stack);
    res.status(500).json({ error: e.message });
  }
});

router.post('/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ success: true });
});

router.get('/profile', requireAuth, (req, res) => {
  const user = User.findById(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({ user });
});

router.put('/profile', requireAuth, (req, res) => {
  try {
    const user = User.update(req.user.id, req.body);
    res.json({ user });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
