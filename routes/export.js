const express = require('express');
const { Parser } = require('json2csv');
const { requireAuth } = require('../middleware/auth');
const Expense = require('../models/Expense');

const router = express.Router();
router.use(requireAuth);

router.get('/expenses', (req, res) => {
  try {
    const { month } = req.query;
    const m = month || new Date().toISOString().slice(0, 7);
    const expenses = Expense.getAllByUserAndMonth(req.user.id, m);
    const data = expenses.map(e => ({
      tanggal: e.date,
      kategori: e.category_name,
      nominal: e.amount,
      catatan: e.note,
      sumber: e.source,
    }));
    const parser = new Parser({ fields: ['tanggal', 'kategori', 'nominal', 'catatan', 'sumber'] });
    const csv = parser.parse(data);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=pengeluaran_${m}.csv`);
    res.send(csv);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
