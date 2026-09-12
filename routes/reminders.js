const express = require('express');
const db = require('../models/db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

router.get('/', (req, res) => {
  try {
    const reminders = db.prepare('SELECT * FROM reminders WHERE user_id = ?').all(req.user.id);
    res.json({ reminders });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/', (req, res) => {
  try {
    const { time, channel, message, enabled } = req.body;
    if (!time) return res.status(400).json({ error: 'Time required' });
    const info = db.prepare('INSERT INTO reminders (user_id, time, channel, message, enabled) VALUES (?, ?, ?, ?, ?)').run(
      req.user.id, time, channel || 'whatsapp', message || 'Catat pengeluaran hari ini!', enabled !== undefined ? enabled : 1
    );
    res.json({ reminder: db.prepare('SELECT * FROM reminders WHERE id = ?').get(info.lastInsertRowid) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/:id', (req, res) => {
  try {
    const { enabled, time, channel, message } = req.body;
    const fields = [];
    const values = [];
    if (enabled !== undefined) { fields.push('enabled = ?'); values.push(enabled); }
    if (time !== undefined) { fields.push('time = ?'); values.push(time); }
    if (channel !== undefined) { fields.push('channel = ?'); values.push(channel); }
    if (message !== undefined) { fields.push('message = ?'); values.push(message); }
    if (fields.length === 0) return res.status(400).json({ error: 'No fields to update' });
    values.push(req.params.id);
    db.prepare(`UPDATE reminders SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    res.json({ reminder: db.prepare('SELECT * FROM reminders WHERE id = ?').get(req.params.id) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/:id', (req, res) => {
  try {
    db.prepare('DELETE FROM reminders WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
