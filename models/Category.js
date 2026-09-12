const db = require('./db');

class Category {
  static getAllByUser(userId) {
    return db.prepare('SELECT * FROM categories WHERE user_id = ? ORDER BY name').all(userId);
  }

  static findById(id) {
    return db.prepare('SELECT * FROM categories WHERE id = ?').get(id);
  }

  static create({ user_id, name, type = 'expense', color = '#4A90D9', icon = 'circle' }) {
    const stmt = db.prepare('INSERT INTO categories (user_id, name, type, color, icon) VALUES (?, ?, ?, ?, ?)');
    const info = stmt.run(user_id, name, type, color, icon);
    return { id: info.lastInsertRowid, user_id, name, type, color, icon };
  }

  static update(id, { name, color, icon }) {
    const fields = [];
    const values = [];
    if (name !== undefined) { fields.push('name = ?'); values.push(name); }
    if (color !== undefined) { fields.push('color = ?'); values.push(color); }
    if (icon !== undefined) { fields.push('icon = ?'); values.push(icon); }
    if (fields.length === 0) return this.findById(id);
    values.push(id);
    db.prepare(`UPDATE categories SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    return this.findById(id);
  }

  static remove(id) {
    return db.prepare('DELETE FROM categories WHERE id = ?').run(id);
  }

  static findByNameAndUser(userId, name) {
    return db.prepare('SELECT * FROM categories WHERE user_id = ? AND LOWER(name) = LOWER(?)').get(userId, name);
  }
}

module.exports = Category;
