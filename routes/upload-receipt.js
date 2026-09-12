const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { requireAuth } = require('../middleware/auth');
const ocrService = require('../services/ocrService');
const Expense = require('../models/Expense');
const Category = require('../models/Category');

const router = express.Router();
router.use(requireAuth);

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '..', 'uploads', String(req.user.id));
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}${path.extname(file.originalname)}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|webp/;
    const ext = allowed.test(path.extname(file.originalname).toLowerCase());
    const mime = allowed.test(file.mimetype);
    if (ext && mime) return cb(null, true);
    cb(new multer.MulterError('LIMIT_UNEXPECTED_FILE', file.fieldname));
  }
});

function handleMulterError(err, req, res, next) {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File terlalu besar (maks 5MB)' });
    }
    return res.status(400).json({ error: 'Format file tidak didukung (jpeg/jpg/png/webp)' });
  }
  next(err);
}

router.post('/', upload.single('receipt'), handleMulterError, async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'File required (jpeg/jpg/png/webp)' });
    const result = await ocrService.extractNominal(req.file.path);
    res.json({
      ...result,
      file_path: `/uploads/${req.user.id}/${req.file.filename}`,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/confirm', (req, res) => {
  try {
    const { category_id, amount, note, date, receipt_path, ocr_raw } = req.body;
    if (!category_id || !amount || !date) return res.status(400).json({ error: 'Required fields missing' });
    const expense = Expense.create({
      user_id: req.user.id, category_id, amount, note, date,
      source: 'ocr', receipt_path, ocr_raw, confirmed: 1
    });
    res.json({ expense });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
