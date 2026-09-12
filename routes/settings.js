const express = require('express');
const User = require('../models/User');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

router.get('/currency', (req, res) => {
  const user = User.findById(req.user.id);
  res.json({ currency: user?.currency || 'IDR' });
});

router.put('/currency', (req, res) => {
  const { currency } = req.body;
  if (!currency) return res.status(400).json({ error: 'Currency required' });
  const user = User.update(req.user.id, { currency });
  res.json({ currency: user.currency });
});

module.exports = router;
