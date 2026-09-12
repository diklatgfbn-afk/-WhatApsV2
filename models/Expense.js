const db = require('./db');

class Expense {
  static getAllByUserAndDate(userId, date) {
    return db.prepare(`
      SELECT e.*, c.name as category_name, c.color as category_color
      FROM expenses e
      JOIN categories c ON e.category_id = c.id
      WHERE e.user_id = ? AND e.date = ?
      ORDER BY e.created_at DESC
    `).all(userId, date);
  }

  static getAllByUserAndMonth(userId, yearMonth) {
    return db.prepare(`
      SELECT e.*, c.name as category_name, c.color as category_color
      FROM expenses e
      JOIN categories c ON e.category_id = c.id
      WHERE e.user_id = ? AND strftime('%Y-%m', e.date) = ?
      ORDER BY e.date DESC, e.created_at DESC
    `).all(userId, yearMonth);
  }

  static findById(id) {
    return db.prepare(`
      SELECT e.*, c.name as category_name, c.color as category_color
      FROM expenses e
      JOIN categories c ON e.category_id = c.id
      WHERE e.id = ?
    `).get(id);
  }

  static getAllByUserAndRange(userId, start, end) {
    return db.prepare(`
      SELECT e.*, c.name as category_name, c.color as category_color
      FROM expenses e
      JOIN categories c ON e.category_id = c.id
      WHERE e.user_id = ? AND e.date BETWEEN ? AND ?
      ORDER BY e.date DESC, e.created_at DESC
    `).all(userId, start, end);
  }

  static create({ user_id, category_id, amount, note, date, receipt_path, source, whatsapp_message_id, ocr_raw, confirmed }) {
    const stmt = db.prepare(`
      INSERT INTO expenses (user_id, category_id, amount, note, date, receipt_path, source, whatsapp_message_id, ocr_raw, confirmed)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const info = stmt.run(
      user_id, category_id, amount, note || '',
      date, receipt_path || null, source || 'manual',
      whatsapp_message_id || null, ocr_raw || null, confirmed !== undefined ? confirmed : 1
    );
    return this.findById(info.lastInsertRowid);
  }

  static update(id, userId, { category_id, amount, note, date }) {
    const fields = [];
    const values = [];
    if (category_id !== undefined) { fields.push('category_id = ?'); values.push(category_id); }
    if (amount !== undefined) { fields.push('amount = ?'); values.push(amount); }
    if (note !== undefined) { fields.push('note = ?'); values.push(note); }
    if (date !== undefined) { fields.push('date = ?'); values.push(date); }
    if (fields.length === 0) return this.findById(id);
    values.push(id, userId);
    const result = db.prepare(`UPDATE expenses SET ${fields.join(', ')} WHERE id = ? AND user_id = ?`).run(...values);
    return result.changes > 0 ? this.findById(id) : null;
  }

  static remove(id, userId) {
    return db.prepare('DELETE FROM expenses WHERE id = ? AND user_id = ?').run(id, userId);
  }

  static getDailySummary(userId, date) {
    const total = db.prepare('SELECT SUM(amount) as total FROM expenses WHERE user_id = ? AND date = ?').get(userId, date);
    const by_category = db.prepare(`
      SELECT c.name, c.color, SUM(e.amount) as amount
      FROM expenses e
      JOIN categories c ON e.category_id = c.id
      WHERE e.user_id = ? AND e.date = ?
      GROUP BY e.category_id
      ORDER BY amount DESC
    `).all(userId, date);
    return { total: total?.total || 0, by_category };
  }

  static getMonthlySummary(userId, yearMonth) {
    const total = db.prepare("SELECT SUM(amount) as total FROM expenses WHERE user_id = ? AND strftime('%Y-%m', date) = ?").get(userId, yearMonth);
    const daysActive = db.prepare("SELECT COUNT(DISTINCT date) as count FROM expenses WHERE user_id = ? AND strftime('%Y-%m', date) = ?").get(userId, yearMonth);
    const by_category = db.prepare(`
      SELECT c.name, c.color, SUM(e.amount) as amount
      FROM expenses e
      JOIN categories c ON e.category_id = c.id
      WHERE e.user_id = ? AND strftime('%Y-%m', e.date) = ?
      GROUP BY e.category_id
      ORDER BY amount DESC
    `).all(userId, yearMonth);
    const daily = db.prepare(`
      SELECT date, SUM(amount) as total
      FROM expenses
      WHERE user_id = ? AND strftime('%Y-%m', date) = ?
      GROUP BY date
      ORDER BY date
    `).all(userId, yearMonth);
    return {
      total: total?.total || 0,
      days_active: daysActive?.count || 0,
      avg_daily: daysActive?.count > 0 ? (total?.total || 0) / daysActive.count : 0,
      by_category,
      daily
    };
  }

  static confirm(id) {
    db.prepare('UPDATE expenses SET confirmed = 1 WHERE id = ?').run(id);
    return this.findById(id);
  }

  static getRangeSummary(userId, start, end) {
    const total = db.prepare('SELECT SUM(amount) as total FROM expenses WHERE user_id = ? AND date BETWEEN ? AND ?').get(userId, start, end);
    const daysActive = db.prepare('SELECT COUNT(DISTINCT date) as count FROM expenses WHERE user_id = ? AND date BETWEEN ? AND ?').get(userId, start, end);
    const by_category = db.prepare(`
      SELECT c.name, c.color, SUM(e.amount) as amount
      FROM expenses e
      JOIN categories c ON e.category_id = c.id
      WHERE e.user_id = ? AND e.date BETWEEN ? AND ?
      GROUP BY e.category_id
      ORDER BY amount DESC
    `).all(userId, start, end);
    const daily = db.prepare(`
      SELECT date, SUM(amount) as total
      FROM expenses
      WHERE user_id = ? AND date BETWEEN ? AND ?
      GROUP BY date
      ORDER BY date
    `).all(userId, start, end);
    return {
      total: total?.total || 0,
      days_active: daysActive?.count || 0,
      avg_daily: daysActive?.count > 0 ? (total?.total || 0) / daysActive.count : 0,
      by_category,
      daily
    };
  }

  static findByNoteAndAmount(userId, note, amount) {
    return db.prepare(`
      SELECT e.*, c.name as category_name, c.color as category_color
      FROM expenses e
      JOIN categories c ON e.category_id = c.id
      WHERE e.user_id = ? AND e.note LIKE ? COLLATE NOCASE AND e.amount = ?
      ORDER BY e.created_at DESC, e.id DESC
      LIMIT 1
    `).get(userId, `%${note}%`, amount);
  }
}

module.exports = Expense;
