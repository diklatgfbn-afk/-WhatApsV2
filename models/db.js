const Database = require('better-sqlite3');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const db = new Database(process.env.DB_PATH || './whataps.db');

// Enable WAL mode for better concurrent read performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Create all tables
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    display_name TEXT NOT NULL,
    currency TEXT DEFAULT 'IDR',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    type TEXT DEFAULT 'expense',
    color TEXT DEFAULT '#4A90D9',
    icon TEXT DEFAULT 'circle',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS expenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    category_id INTEGER NOT NULL,
    amount REAL NOT NULL,
    note TEXT DEFAULT '',
    date DATE NOT NULL,
    receipt_path TEXT DEFAULT NULL,
    source TEXT DEFAULT 'manual',
    whatsapp_message_id TEXT DEFAULT NULL,
    ocr_raw TEXT DEFAULT NULL,
    confirmed INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS whatsapp_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL UNIQUE,
    session_data TEXT DEFAULT NULL,
    connected INTEGER DEFAULT 0,
    phone_number TEXT DEFAULT '',
    qr_code TEXT DEFAULT NULL,
    last_sync DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS reminders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    time TEXT NOT NULL,
    enabled INTEGER DEFAULT 1,
    channel TEXT DEFAULT 'whatsapp',
    message TEXT DEFAULT 'Catat pengeluaran hari ini!',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
`);

// === Migrations: ensure columns exist ===
function ensureColumn(table, column, type) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all().map(c => c.name);
  if (!cols.includes(column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
    console.log(`[Migration] Added column ${table}.${column}`);
  }
}

// Add email column if missing (was added later)
ensureColumn('users', 'email', "TEXT DEFAULT ''");

// Add display_name column if missing
ensureColumn('users', 'display_name', "TEXT DEFAULT 'User'");

// Add currency column if missing
ensureColumn('users', 'currency', "TEXT DEFAULT 'IDR'");

// Ensure unique constraint on email (rebuild table if needed)
const userIndexes = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='users' AND sql LIKE '%email%'").all();
const hasUniqueEmail = userIndexes.length > 0;
if (!hasUniqueEmail) {
  try {
    db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email) WHERE email != ''");
    console.log('[Migration] Added unique index on users.email');
  } catch (e) {
    console.log('[Migration] Email index already exists or skipped:', e.message);
  }
}

module.exports = db;
