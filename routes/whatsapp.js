const express = require('express');
const { requireAuth } = require('../middleware/auth');
const db = require('../models/db');

let whatsappService = null;
function getWA() {
  if (!whatsappService) whatsappService = require('../services/whatsappService');
  return whatsappService;
}

const router = express.Router();
router.use(requireAuth);

router.get('/status', (req, res) => {
  try {
    getWA().ensureSession(req.user.id);
    const status = getWA().getStatus(req.user.id);
    res.json(status);
  } catch (e) {
    console.log('[WA Route] Status error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

router.post('/connect', (req, res) => {
  try {
    getWA().ensureSession(req.user.id);
    console.log('[WA Route] Starting WhatsApp client...');
    getWA().initClient(req.user.id);
    res.json({ success: true, message: 'Menghubungkan... QR akan muncul dalam beberapa detik' });
  } catch (e) {
    console.log('[WA Route] Connect error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

router.get('/qr', (req, res) => {
  try {
    const status = getWA().getStatus(req.user.id);
    const qr = getWA().getQR();
    res.json({ qr, connected: status.connected, error: status.error });
  } catch (e) {
    console.log('[WA Route] QR error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

router.get('/messages', (req, res) => {
  try {
    const messages = db.prepare(`
      SELECT e.*, c.name as category_name
      FROM expenses e
      JOIN categories c ON e.category_id = c.id
      WHERE e.user_id = ? AND e.source = 'whatsapp'
      ORDER BY e.created_at DESC
      LIMIT 50
    `).all(req.user.id);
    res.json({ messages });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
