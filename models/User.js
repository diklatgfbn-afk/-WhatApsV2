const db = require('./db');
const bcrypt = require('bcryptjs');

class User {
  static findByEmail(email) {
    return db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  }

  static findById(id) {
    return db.prepare('SELECT id, email, display_name, currency, created_at, updated_at FROM users WHERE id = ?').get(id);
  }

  static create({ email, password, display_name }) {
    const password_hash = bcrypt.hashSync(password, 10);
    const stmt = db.prepare('INSERT INTO users (email, password_hash, display_name) VALUES (?, ?, ?)');
    const info = stmt.run(email, password_hash, display_name);
    return this.findById(info.lastInsertRowid);
  }

  static update(id, { display_name, currency }) {
    const fields = [];
    const values = [];
    if (display_name !== undefined) { fields.push('display_name = ?'); values.push(display_name); }
    if (currency !== undefined) { fields.push('currency = ?'); values.push(currency); }
    if (fields.length === 0) return this.findById(id);
    fields.push('updated_at = CURRENT_TIMESTAMP');
    values.push(id);
    db.prepare(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    return this.findById(id);
  }

  static verifyPassword(plain, hash) {
    return bcrypt.compareSync(plain, hash);
  }

  static seedDefaultCategories(userId) {
    const defaults = [
      { name: 'Makanan', color: '#FF6B6B' },
      { name: 'Transport', color: '#4ECDC4' },
      { name: 'Hiburan', color: '#45B7D1' },
      { name: 'Belanja', color: '#96CEB4' },
      { name: 'Tagihan', color: '#FFEAA7' },
      { name: 'Lainnya', color: '#DDA0DD' }
    ];
    const stmt = db.prepare('INSERT INTO categories (user_id, name, type, color) VALUES (?, ?, ?, ?)');
    for (const cat of defaults) {
      stmt.run(userId, cat.name, 'expense', cat.color);
    }
  }
}

module.exports = User;
