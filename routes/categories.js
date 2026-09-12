const express = require('express');
const Category = require('../models/Category');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

router.get('/', (req, res) => {
  try {
    const categories = Category.getAllByUser(req.user.id);
    res.json({ categories });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/', (req, res) => {
  try {
    const { name, type, color, icon } = req.body;
    if (!name) return res.status(400).json({ error: 'Name required' });
    const category = Category.create({ user_id: req.user.id, name, type, color, icon });
    res.json({ category });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/:id', (req, res) => {
  try {
    const category = Category.update(req.params.id, req.body);
    if (!category) return res.status(404).json({ error: 'Category not found' });
    res.json({ category });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/:id', (req, res) => {
  try {
    Category.remove(req.params.id);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
