const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  makeCacheableSignalKeyStore,
  downloadMediaMessage,
} = require('@whiskeysockets/baileys');
const qrcode = require('qrcode');
const { Boom } = require('@hapi/boom');
const db = require('../models/db');
const Expense = require('../models/Expense');
const Category = require('../models/Category');
const path = require('path');
const fs = require('fs');

let sock = null;
let qrDataUrl = null;
let isReady = false;
let currentUser = null;
let lastError = null;
let reconnectAttempts = 0;
const MAX_RECONNECT = 5;

const CATEGORY_KEYWORDS = {
  'makan': 'Makanan', 'makanan': 'Makanan', 'nasi': 'Makanan', 'coffee': 'Makanan',
  'kopi': 'Makanan', 'minum': 'Makanan', 'warung': 'Makanan', 'restoran': 'Makanan',
  'gojek': 'Transport', 'grab': 'Transport', 'bensin': 'Transport', 'parkir': 'Transport',
  'toll': 'Transport', 'transport': 'Transport', 'ojol': 'Transport',
  'belanja': 'Belanja', 'tokopedia': 'Belanja', 'shopee': 'Belanja',
  'tagihan': 'Tagihan', 'listrik': 'Tagihan', 'air': 'Tagihan', 'internet': 'Tagihan',
  'hiburan': 'Hiburan', 'nonton': 'Hiburan', 'game': 'Hiburan', 'spotify': 'Hiburan',
};

function guessCategory(description) {
  const lower = description.toLowerCase();
  for (const [keyword, categoryName] of Object.entries(CATEGORY_KEYWORDS)) {
    if (lower.includes(keyword)) return categoryName;
  }
  return 'Lainnya';
}

function parseWhatsAppMessage(text) {
  const patterns = [
    /^(?:beli|pengeluaran|expense|catat)\s+(.+?)\s+([\d.]+)$/i,
    /^(.+?)\s+([\d.]+)$/,
  ];
  for (const pattern of patterns) {
    const match = text.trim().match(pattern);
    if (match) {
      const description = match[1];
      const amount = parseInt(match[2].replace(/\./g, ''), 10);
      if (!isNaN(amount) && amount > 0) {
        return { description, amount, categoryName: guessCategory(description) };
      }
    }
  }
  return null;
}

// --- Date helpers ---

function toYYYYMMDD(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseFlexibleDate(str) {
  const s = str.trim();
  // YYYY-MM-DD
  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(s)) {
    const [y, m, d] = s.split('-').map(Number);
    if (m < 1 || m > 12 || d < 1 || d > 31) return null;
    return new Date(y, m - 1, d);
  }
  // DD-MM-YYYY
  if (/^\d{1,2}-\d{1,2}-\d{4}$/.test(s)) {
    const [d, m, y] = s.split('-').map(Number);
    if (m < 1 || m > 12 || d < 1 || d > 31) return null;
    return new Date(y, m - 1, d);
  }
  return null;
}

function getWeekRange(baseDate) {
  const d = new Date(baseDate);
  const dayOfWeek = (d.getDay() + 6) % 7; // 0 = Monday
  const monday = new Date(d);
  monday.setDate(d.getDate() - dayOfWeek);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return [toYYYYMMDD(monday), toYYYYMMDD(sunday)];
}

function getMonthRange(baseDate) {
  const y = baseDate.getFullYear();
  const m = baseDate.getMonth();
  const first = new Date(y, m, 1);
  const last = new Date(y, m + 1, 0);
  return [toYYYYMMDD(first), toYYYYMMDD(last)];
}

function formatRp(n) {
  return 'Rp ' + Math.round(n).toLocaleString('id-ID');
}

function dayLabel(dateStr) {
  // dateStr is YYYY-MM-DD
  const [, m, d] = dateStr.split('-');
  return `${d}-${m}`;
}

// --- Main Help Command ---

const MAIN_HELP_TEXT =
  `🤖 *WhatAps - Pengeluaran Cerdas*\n\n` +
  `📋 *Cara Mencatat Pengeluaran:*\n` +
  `Ketik: *beli [catatan] [nominal]*\n` +
  `Contoh: beli makan siang 15000\n\n` +
  `📸 *Foto Struk:*\n` +
  `Kirim foto struk → AI otomatis baca\n` +
  `Balas: simpan / simpan [nominal] / batal\n\n` +
  `📊 *Laporan:*\n` +
  `• laporan — bulanan\n` +
  `• laporan harian — hari ini\n` +
  `• laporan mingguan — minggu ini\n` +
  `• laporan [tgl1] sd [tgl2] — custom\n\n` +
  `🔮 *Prediksi & Trend:*\n` +
  `• prediksi — prediksi pengeluaran bulan depan\n` +
  `• trend — analisis trend pengeluaran\n\n` +
  `🗑️ *Hapus:*\n` +
  `• hapus [id]\n` +
  `• hapus [catatan] [nominal]\n\n` +
  `💬 *Tanya AI:*\n` +
  `Ketik pertanyaan bebas, contoh:\n` +
  `• "berapa pengeluaran minggu ini?"\n` +
  `• "kategori mana yang paling besar?"\n` +
  `• "tips hemat dong"\n\n` +
  `Ketik *help* atau *bantuan* kapan saja!`;

function parseMainCommand(text) {
  const raw = text.trim().toLowerCase();

  // Main help command
  if (/^(help|bantuan|menu| Commands|perintah|\?)$/i.test(raw)) {
    return { kind: 'help' };
  }

  return null;
}

// --- Report command ---

function parseReportCommand(text) {
  const raw = text.trim();
  const m = raw.match(/^(?:laporan|lapor|rekap|report)\s*(.*)$/i);
  if (!m) return null;

  const rest = m[1].trim().toLowerCase();

  if (!rest || rest === 'bulanan' || rest === 'monthly') {
    const now = new Date();
    const [start, end] = getMonthRange(now);
    return { kind: 'report', start, end, label: 'Bulan Ini' };
  }

  if (rest === 'harian' || rest === 'daily') {
    const today = toYYYYMMDD(new Date());
    return { kind: 'report', start: today, end: today, label: 'Hari Ini' };
  }

  if (rest === 'mingguan' || rest === 'weekly') {
    const [start, end] = getWeekRange(new Date());
    return { kind: 'report', start, end, label: 'Minggu Ini' };
  }

  if (rest === 'bantuan' || rest === 'help' || rest === '?' || rest === 'cmd') {
    return { kind: 'report-help' };
  }

  // Custom: <date1> sd/sampai/hingga <date2>
  const customMatch = raw.trim().match(
    /^(?:laporan|lapor|rekap|report)\s+(.+?)\s+(?:sampai\s+dengan|sd|s\/d|s\.d|hingga|sejak|-)\s+(.+)$/i
  );
  if (customMatch) {
    const d1 = parseFlexibleDate(customMatch[1]);
    const d2 = parseFlexibleDate(customMatch[2]);
    if (d1 && d2) {
      let [start, end] = [toYYYYMMDD(d1), toYYYYMMDD(d2)];
      if (start > end) [start, end] = [end, start];
      return { kind: 'report', start, end, label: `${dayLabel(start)} s/d ${dayLabel(end)}` };
    }
  }

  return { kind: 'report-help' };
}

function buildReportText(start, end, summary, label) {
  const lines = [
    `📊 *Laporan Pengeluaran*`,
    `📅 ${dayLabel(start)} s/d ${dayLabel(end)}${label ? ' (' + label + ')' : ''}`,
    `────────────────`,
    `💰 Total: *${formatRp(summary.total)}*`,
    `📅 Hari aktif: ${summary.days_active}`,
    `📈 Rata-rata/hari: *${formatRp(summary.avg_daily)}*`,
  ];

  if (summary.by_category.length > 0) {
    lines.push(``, `📂 *Per Kategori:*`);
    for (const c of summary.by_category) {
      const pct = summary.total > 0 ? (c.amount / summary.total * 100).toFixed(1) : 0;
      lines.push(`  ${c.name}: ${formatRp(c.amount)} (${pct}%)`);
    }
  }

  if (summary.daily.length > 0) {
    const topDays = [...summary.daily].sort((a, b) => b.total - a.total).slice(0, 3);
    lines.push(``, `🔥 *Top hari terbesar:*`);
    for (const d of topDays) {
      lines.push(`  ${dayLabel(d.date)}: ${formatRp(d.total)}`);
    }
  }

  lines.push(``, `_Dari WhatAps Expense Tracker_`);
  return lines.join('\n');
}

const REPORT_HELP_TEXT =
  `📊 *Perintah Laporan*\n\n` +
  `Ketik:\n` +
  `• laporan — laporan bulanan\n` +
  `• laporan harian — hari ini\n` +
  `• laporan mingguan — minggu ini (Sen-Min)\n` +
  `• laporan bulanan — bulan ini\n` +
  `• laporan <tgl1> sd <tgl2> — rentang custom\n\n` +
  `Contoh:\n` +
  `  laporan 01-09-2026 sd 10-09-2026\n` +
  `  laporan 2026-09-01 s/d 2026-09-10`;

// --- Delete command ---

function parseDeleteCommand(text) {
  const raw = text.trim();

  // Help
  if (/^(?:hapus|delete)\s+(?:bantuan|help|\?)$/i.test(raw)) {
    return { kind: 'delete-help' };
  }

  // By ID: "hapus <numeric id>"
  const idMatch = raw.match(/^(?:hapus|delete)\s+(\d+)$/i);
  if (idMatch) {
    return { kind: 'delete', mode: 'id', id: Number(idMatch[1]) };
  }

  // By note + amount: "hapus <description> <amount>"
  const matchMatch = raw.match(/^(?:hapus|delete)\s+(.+?)\s+([\d.]+)$/i);
  if (matchMatch) {
    const note = matchMatch[1].trim();
    const amount = parseInt(matchMatch[2].replace(/\./g, ''), 10);
    if (!isNaN(amount) && amount > 0 && note.length > 0) {
      return { kind: 'delete', mode: 'note', note, amount };
    }
  }

  return null;
}

const DELETE_HELP_TEXT =
  `🗑️ *Perintah Hapus*\n\n` +
  `Ketik:\n` +
  `• hapus <id> — hapus by ID (nomor)\n` +
  `• hapus <catatan> <nominal> — hapus by catatan & nominal\n\n` +
  `Contoh:\n` +
  `  hapus 12\n` +
  `  hapus nasi 15000`;

// --- Receipt parsers ---

const lastReceipts = new Map(); // remoteJid → { amount, category_suggestion, rawText, receipt_path, ts }
const RECEIPT_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes

function parseReceiptReplyCommand(text) {
  const raw = text.trim();

  if (/^(?:simpan|save|catat)$/i.test(raw)) {
    return { kind: 'receipt-save' };
  }

  if (/^(?:batal|cancel)$/i.test(raw)) {
    return { kind: 'receipt-cancel' };
  }

  // "simpan <amount>" or "simpan <amount> <category>"
  const m = raw.match(/^simpan\s+([\d.]+)(?:\s+(.+))?$/i);
  if (m) {
    const amount = parseInt(m[1].replace(/\./g, ''), 10);
    const categoryName = m[2]?.trim() || null;
    if (!isNaN(amount) && amount > 0) {
      return { kind: 'receipt-save', amount, categoryName };
    }
  }

  return null;
}

// --- Prediksi/Trend command ---

function parsePrediksiCommand(text) {
  const raw = text.trim().toLowerCase();
  if (/^(prediksi|trend|tren|proyeksi|predik)$/i.test(raw)) {
    return { kind: 'prediksi' };
  }
  return null;
}

// --- End parsers ---

function destroyClient() {
  if (sock) {
    try {
      sock.end(undefined);
    } catch (e) {
      console.log('[WA] Error destroying client:', e.message);
    }
    sock = null;
  }
  isReady = false;
  qrDataUrl = null;
}

function getSessionDir(userId) {
  const dir = path.join(__dirname, '..', '.wwebjs_auth', `user_${userId}`);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

async function initClient(userId) {
  console.log(`[WA] Initializing Baileys client for user ${userId}...`);
  destroyClient();

  currentUser = userId;
  qrDataUrl = null;
  isReady = false;
  lastError = null;
  reconnectAttempts = 0;

  const sessionDir = getSessionDir(userId);
  const { state, saveCreds } = await useMultiFileAuthState(sessionDir);

  // Check if already authenticated
  if (state.creds?.me) {
    console.log('[WA] Found existing auth, connecting...');
  }

  sock = makeWASocket({
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, undefined),
    },
    printQRInTerminal: false,
    browser: ['WhatAps Expense Tracker', 'Chrome', '120.0.0.0'],
    connectTimeoutMs: 30000,
    emitOwnEvents: true,
  });

  // Save credentials on update
  sock.ev.on('creds.update', saveCreds);

  // QR code event
  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log('[WA] QR code received');
      try {
        qrDataUrl = await qrcode.toDataURL(qr, { width: 300, margin: 2 });
        db.prepare('UPDATE whatsapp_sessions SET qr_code = ? WHERE user_id = ?').run(qrDataUrl, userId);
        console.log('[WA] QR data URL generated');
      } catch (e) {
        console.log('[WA] QR generate error:', e.message);
      }
    }

    if (connection === 'close') {
      const statusCode = new Boom(lastDisconnect?.error)?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

      console.log(`[WA] Connection closed. Status: ${statusCode}. Reconnect: ${shouldReconnect}`);

      if (statusCode === DisconnectReason.loggedOut) {
        console.log('[WA] Logged out - clearing session');
        lastError = 'Logged out by user';
        isReady = false;
        // Clear session files
        try { fs.rmSync(sessionDir, { recursive: true, force: true }); } catch (e) {}
        db.prepare('UPDATE whatsapp_sessions SET connected = 0, qr_code = NULL, phone_number = NULL WHERE user_id = ?').run(userId);
      } else if (shouldReconnect && reconnectAttempts < MAX_RECONNECT) {
        reconnectAttempts++;
        console.log(`[WA] Reconnecting... (attempt ${reconnectAttempts}/${MAX_RECONNECT})`);
        lastError = `Reconnecting (${reconnectAttempts}/${MAX_RECONNECT})...`;
        setTimeout(() => initClient(userId), 3000);
      } else {
        lastError = 'Connection failed after max retries';
        isReady = false;
        db.prepare('UPDATE whatsapp_sessions SET connected = 0 WHERE user_id = ?').run(userId);
      }
    }

    if (connection === 'open') {
      console.log('[WA] Connection opened!');
      isReady = true;
      qrDataUrl = null;
      lastError = null;
      reconnectAttempts = 0;

      const phone = sock.user?.id?.replace(/:.*@/, '@')?.split('@')[0] || 'unknown';
      console.log('[WA] Connected! Phone:', phone);

      db.prepare('UPDATE whatsapp_sessions SET connected = 1, qr_code = NULL, phone_number = ?, last_sync = CURRENT_TIMESTAMP WHERE user_id = ?').run(phone, userId);
    }
  });

  // Message handler - process ALL messages (including self-sent)
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;

    for (const msg of messages) {
      if (!msg.message) continue;

      // Log every message for debugging
      const from = msg.key.fromMe ? 'SELF' : 'OTHER';
      const remoteJid = msg.key.remoteJid || '';
      const myJid = sock.user?.id || '';
      console.log(`[WA] Message ${from} | remoteJid: ${remoteJid} | myJid: ${myJid}`);

      try {
        const text = msg.message.conversation || msg.message.extendedTextMessage?.text || '';

        // Handle image messages (receipt/struk photos)
        const imageMsg = msg.message.imageMessage;
        if (imageMsg) {
          try {
            const uploadsDir = path.join(__dirname, '..', 'uploads', String(userId));
            if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

            const buffer = await downloadMediaMessage(msg, 'buffer', {});
            const filename = `whatsapp_${Date.now()}.jpg`;
            const filePath = path.join(uploadsDir, filename);
            fs.writeFileSync(filePath, buffer);

            const ocrService = require('../services/ocrService');
            const result = await ocrService.extractNominal(filePath);

            lastReceipts.set(msg.key.remoteJid, {
              amount: result.nominal,
              category_suggestion: result.category_suggestion,
              rawText: result.rawText,
              receipt_path: `/uploads/${userId}/${filename}`,
              ts: Date.now(),
            });

            const amountStr = result.nominal ? formatRp(result.nominal) : '❌ tidak terbaca';
            await sock.sendMessage(msg.key.remoteJid, {
              text:
                `🧾 *Struk terdeteksi!*\n` +
                `💰 Perkiraan total: *${amountStr}*\n` +
                `📂 Kategori saran: ${result.category_suggestion}\n\n` +
                `Balas:\n` +
                `• *simpan* → catat ${result.nominal ? formatRp(result.nominal) : '(total)' + ' (kategori saran)'}\n` +
                `• *simpan <nominal>* → ganti nominal\n` +
                `• *simpan <nominal> <kategori>* → nominal+kategori\n` +
                `• *batal* → buang`
            });
            console.log('[WA] Receipt OCR processed:', result.nominal, result.category_suggestion);
          } catch (ocrErr) {
            console.error('[WA] Receipt OCR error:', ocrErr.message);
            await sock.sendMessage(msg.key.remoteJid, { text: '❌ Gagal membaca struk. Coba kirim ulang dengan gambar yang lebih jelas.' });
          }
          continue;
        }

        if (!text.trim()) continue;

        // Main help command (before other parsers)
        const mainCmd = parseMainCommand(text);
        if (mainCmd) {
          if (mainCmd.kind === 'help') {
            await sock.sendMessage(msg.key.remoteJid, { text: MAIN_HELP_TEXT });
          }
          console.log('[WA] Main command processed:', text);
          continue;
        }

        // Report command (before expense parser)
        const reportCmd = parseReportCommand(text);
        if (reportCmd) {
          if (reportCmd.kind === 'report-help') {
            await sock.sendMessage(msg.key.remoteJid, { text: REPORT_HELP_TEXT });
          } else {
            const summary = Expense.getRangeSummary(userId, reportCmd.start, reportCmd.end);
            await sock.sendMessage(msg.key.remoteJid, {
              text: buildReportText(reportCmd.start, reportCmd.end, summary, reportCmd.label)
            });
          }
          console.log('[WA] Report command processed:', text);
          continue;
        }

        // Prediksi/Trend command
        const prediksiCmd = parsePrediksiCommand(text);
        if (prediksiCmd) {
          try {
            await sock.sendMessage(msg.key.remoteJid, { text: '🔮 Menganalisis trend pengeluaran...' });
            const aiChatService = require('../services/aiChatService');
            const prediction = await aiChatService.getTrendPrediction(userId);
            await sock.sendMessage(msg.key.remoteJid, { text: prediction });
          } catch (predErr) {
            console.error('[WA] Prediksi error:', predErr.message);
            await sock.sendMessage(msg.key.remoteJid, {
              text: '❌ Gagal membuat prediksi. Coba lagi nanti.'
            });
          }
          console.log('[WA] Prediksi command processed:', text);
          continue;
        }

        // Delete command (before expense parser)
        const deleteCmd = parseDeleteCommand(text);
        if (deleteCmd) {
          if (deleteCmd.kind === 'delete-help') {
            await sock.sendMessage(msg.key.remoteJid, { text: DELETE_HELP_TEXT });
          } else if (deleteCmd.mode === 'id') {
            const result = Expense.remove(deleteCmd.id, userId);
            if (result.changes > 0) {
              const exp = Expense.findById(deleteCmd.id);
              await sock.sendMessage(msg.key.remoteJid, {
                text: `🗑️ Pengeluaran dihapus!\n\n📝 ${exp?.note || '-'}\n💰 ${formatRp(exp?.amount || 0)}\n📅 ${exp?.date || '-'}`
              });
            } else {
              await sock.sendMessage(msg.key.remoteJid, {
                text: `❌ Pengeluaran dengan ID ${deleteCmd.id} tidak ditemukan.`
              });
            }
          } else if (deleteCmd.mode === 'note') {
            const exp = Expense.findByNoteAndAmount(userId, deleteCmd.note, deleteCmd.amount);
            if (exp) {
              Expense.remove(exp.id, userId);
              await sock.sendMessage(msg.key.remoteJid, {
                text: `🗑️ Pengeluaran dihapus!\n\n📝 ${exp.note || '-'}\n💰 ${formatRp(exp.amount)}\n📅 ${exp.date}`
              });
            } else {
              await sock.sendMessage(msg.key.remoteJid, {
                text: `❌ Pengeluaran "${deleteCmd.note}" ${formatRp(deleteCmd.amount)} tidak ditemukan.`
              });
            }
          }
          console.log('[WA] Delete command processed:', text);
          continue;
        }

        // Receipt save/cancel command
        const receiptCmd = parseReceiptReplyCommand(text);
        if (receiptCmd) {
          // Clean expired receipts
          for (const [jid, r] of lastReceipts.entries()) {
            if (Date.now() - r.ts > RECEIPT_EXPIRY_MS) lastReceipts.delete(jid);
          }

          const pending = lastReceipts.get(msg.key.remoteJid);
          if (!pending) {
            await sock.sendMessage(msg.key.remoteJid, {
              text: '❌ Tidak ada struk yang menunggu. Kirim foto struk terlebih dahulu.'
            });
          } else if (receiptCmd.kind === 'receipt-cancel') {
            lastReceipts.delete(msg.key.remoteJid);
            await sock.sendMessage(msg.key.remoteJid, { text: '🗑️ Struk dibuang.' });
          } else if (receiptCmd.kind === 'receipt-save') {
            const amount = receiptCmd.amount || pending.amount;
            if (!amount) {
              await sock.sendMessage(msg.key.remoteJid, {
                text: '❌ Total tidak terdeteksi. Kirim: *simpan <nominal>* (contoh: simpan 45000)'
              });
              continue;
            }
            let catName = receiptCmd.categoryName || pending.category_suggestion || 'Lainnya';
            // Use AI to suggest better category from receipt OCR text
            if (!receiptCmd.categoryName && pending.rawText) {
              try {
                const aiChatService = require('../services/aiChatService');
                const userCategories = Category.getAllByUser(userId);
                const aiCategory = await aiChatService.suggestCategory(pending.rawText.slice(0, 200), userCategories);
                if (aiCategory) catName = aiCategory;
              } catch (e) {
                console.log('[WA] AI category fallback for receipt:', e.message);
              }
            }
            const cat = Category.findByNameAndUser(userId, catName) ||
              Category.create({ user_id: userId, name: catName });

            const expense = Expense.create({
              user_id: userId,
              category_id: cat.id,
              amount,
              note: `Struk (${catName})`,
              date: new Date().toISOString().split('T')[0],
              source: 'ocr',
              receipt_path: pending.receipt_path,
              ocr_raw: pending.rawText,
              confirmed: 1
            });

            lastReceipts.delete(msg.key.remoteJid);
            await sock.sendMessage(msg.key.remoteJid, {
              text:
                `✅ Struk disimpan!\n\n` +
                `💰 *${formatRp(amount)}*\n` +
                `📂 ${catName}\n` +
                `📅 ${expense.date}\n\n` +
                `_Dikonfirmasi dari struk_`
            });
            console.log(`[WA] Receipt expense created: ${catName} ${formatRp(amount)}`);
          }
          continue;
        }

        const parsed = parseWhatsAppMessage(text);
        if (!parsed) {
          // If not an expense format, treat as AI chat question
          const aiChatService = require('../services/aiChatService');
          if (aiChatService.isChatMessage(text)) {
            try {
              await sock.sendMessage(msg.key.remoteJid, { text: '🤖 Memproses...' });
              const context = aiChatService.getExpenseContext(userId);
              const aiResponse = await aiChatService.chatWithAI(text, context);
              await sock.sendMessage(msg.key.remoteJid, { text: aiResponse });
              console.log('[WA] AI Chat processed:', text.substring(0, 50));
            } catch (aiErr) {
              console.error('[WA] AI Chat error:', aiErr.message);
              await sock.sendMessage(msg.key.remoteJid, {
                text: '❌ Maaf, ada error saat memproses pertanyaan. Coba lagi.'
              });
            }
          }
          continue;
        }

        console.log('[WA] Parsed expense from WhatsApp:', parsed);

        // Use AI to suggest category based on description
        let suggestedCategory = parsed.categoryName;
        try {
          const aiChatService = require('../services/aiChatService');
          const userCategories = Category.getAllByUser(userId);
          suggestedCategory = await aiChatService.suggestCategory(parsed.description, userCategories);
          console.log(`[WA] AI suggested category: "${suggestedCategory}" for "${parsed.description}"`);
        } catch (aiErr) {
          console.error('[WA] AI Category error, using fallback:', aiErr.message);
          // Keep the original category from guessCategory
        }

        const cat = Category.findByNameAndUser(userId, suggestedCategory) ||
          Category.create({ user_id: userId, name: suggestedCategory });

        const expense = Expense.create({
          user_id: userId,
          category_id: cat.id,
          amount: parsed.amount,
          note: parsed.description,
          date: new Date().toISOString().split('T')[0],
          source: 'whatsapp',
          whatsapp_message_id: msg.key.id,
          confirmed: 1
        });

        await sock.sendMessage(msg.key.remoteJid, {
          text:
            `✅ Pengeluaran tercatat!\n\n` +
            `📝 ${parsed.description}\n` +
            `💰 Rp ${parsed.amount.toLocaleString('id-ID')}\n` +
            `📂 ${suggestedCategory}\n` +
            `📅 ${expense.date}\n\n` +
            `_Dikonfirmasi otomatis_`
        });

        console.log(`[WA] Expense created: ${parsed.description} Rp${parsed.amount}`);
      } catch (e) {
        console.log('[WA] Error processing message:', e.message);
      }
    }
  });

  console.log('[WA] Client created, connection starts automatically...');
}

function getStatus(userId) {
  const session = db.prepare('SELECT * FROM whatsapp_sessions WHERE user_id = ?').get(userId);
  return {
    connected: isReady && currentUser === userId,
    phone_number: session?.phone_number || '',
    last_sync: session?.last_sync || null,
    error: lastError,
  };
}

function getQR() {
  return qrDataUrl;
}

function ensureSession(userId) {
  const exists = db.prepare('SELECT id FROM whatsapp_sessions WHERE user_id = ?').get(userId);
  if (!exists) {
    db.prepare('INSERT INTO whatsapp_sessions (user_id) VALUES (?)').run(userId);
  }
}

module.exports = { initClient, getStatus, getQR, ensureSession, parseReportCommand, parseDeleteCommand, parseReceiptReplyCommand, buildReportText, REPORT_HELP_TEXT, DELETE_HELP_TEXT, MAIN_HELP_TEXT };
