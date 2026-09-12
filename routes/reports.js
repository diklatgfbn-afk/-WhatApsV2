const express = require('express');
const Expense = require('../models/Expense');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

router.get('/daily', (req, res) => {
  try {
    const { date } = req.query;
    const d = date || new Date().toISOString().split('T')[0];
    const summary = Expense.getDailySummary(req.user.id, d);
    const expenses = Expense.getAllByUserAndDate(req.user.id, d);
    res.json({ ...summary, transactions: expenses });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/monthly', (req, res) => {
  try {
    const { month } = req.query;
    const m = month || new Date().toISOString().slice(0, 7);
    const summary = Expense.getMonthlySummary(req.user.id, m);
    res.json(summary);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/compare', (req, res) => {
  try {
    const { month } = req.query;
    const current = month || new Date().toISOString().slice(0, 7);
    const [y, m] = current.split('-').map(Number);
    const prevMonth = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
    const currentData = Expense.getMonthlySummary(req.user.id, current);
    const prevData = Expense.getMonthlySummary(req.user.id, prevMonth);
    const diff_percent = prevData.total > 0
      ? ((currentData.total - prevData.total) / prevData.total * 100).toFixed(1)
      : 0;
    res.json({
      current_month: current,
      previous_month: prevMonth,
      current_total: currentData.total,
      previous_total: prevData.total,
      diff_percent: Number(diff_percent),
      current_by_category: currentData.by_category,
      previous_by_category: prevData.by_category
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/range', (req, res) => {
  try {
    const { start, end } = req.query;
    if (!start || !end) return res.status(400).json({ error: 'start and end required' });
    const datePattern = /^\d{4}-\d{2}-\d{2}$/;
    if (!datePattern.test(start) || !datePattern.test(end)) {
      return res.status(400).json({ error: 'Invalid date format (use YYYY-MM-DD)' });
    }
    const [s, e] = start <= end ? [start, end] : [end, start];
    const summary = Expense.getRangeSummary(req.user.id, s, e);
    const transactions = Expense.getAllByUserAndRange(req.user.id, s, e);
    res.json({ start: s, end: e, ...summary, transactions });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
