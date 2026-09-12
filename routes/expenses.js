const express = require('express');
const Expense = require('../models/Expense');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

router.get('/', (req, res) => {
  try {
    const { date, month } = req.query;
    if (month) {
      const expenses = Expense.getAllByUserAndMonth(req.user.id, month);
      return res.json({ expenses });
    }
    const expenses = Expense.getAllByUserAndDate(req.user.id, date || new Date().toISOString().split('T')[0]);
    res.json({ expenses });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/summary', (req, res) => {
  try {
    const { date } = req.query;
    const summary = Expense.getDailySummary(req.user.id, date || new Date().toISOString().split('T')[0]);
    res.json(summary);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/', (req, res) => {
  try {
    const { category_id, amount, note, date, source, receipt_path, ocr_raw } = req.body;
    if (!category_id || !amount || !date) return res.status(400).json({ error: 'category_id, amount, date required' });
    const expense = Expense.create({ user_id: req.user.id, category_id, amount, note, date, source, receipt_path, ocr_raw });
    res.json({ expense });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/:id', (req, res) => {
  try {
    const expense = Expense.update(req.params.id, req.user.id, req.body);
    if (!expense) return res.status(404).json({ error: 'Expense not found' });
    res.json({ expense });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/:id', (req, res) => {
  try {
    const result = Expense.remove(req.params.id, req.user.id);
    if (result.changes === 0) return res.status(404).json({ error: 'Expense not found' });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
