const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = 'gemini-3.6-flash';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

const Expense = require('../models/Expense');
const Category = require('../models/Category');

/**
 * Get expense context for AI from database
 */
function getExpenseContext(userId) {
  const now = new Date();
  const month = now.toISOString().slice(0, 7); // YYYY-MM
  const today = now.toISOString().split('T')[0]; // YYYY-MM-DD

  // Today's expenses
  const todayExpenses = Expense.getAllByUserAndDate(userId, today);

  // This month's expenses
  const monthExpenses = Expense.getAllByUserAndMonth(userId, month);

  // Monthly summary (includes total and category breakdown)
  const monthSummary = Expense.getMonthlySummary(userId, month);
  const monthTotal = monthSummary.total || 0;
  const categorySummary = monthSummary.by_category || [];

  // Last 7 days
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - 7);
  const weekExpenses = Expense.getAllByUserAndRange(
    userId,
    weekStart.toISOString().split('T')[0],
    today
  );

  // Monthly totals for last 3 months
  const monthlyTrend = [];
  for (let i = 2; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const m = d.toISOString().slice(0, 7);
    const summary = Expense.getMonthlySummary(userId, m);
    monthlyTrend.push({ month: m, total: summary.total || 0 });
  }

  // Average daily spending
  const daysInMonth = now.getDate();
  const avgDaily = daysInMonth > 0 ? Math.round(monthTotal / daysInMonth) : 0;

  return {
    userName: '',
    today,
    todayExpenses: todayExpenses.map(e => ({
      note: e.note || e.category_name,
      amount: e.amount,
      category: e.category_name,
      time: new Date(e.created_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
    })),
    todayTotal: todayExpenses.reduce((sum, e) => sum + e.amount, 0),
    monthTotal,
    avgDaily,
    daysInMonth,
    categorySummary: categorySummary.map(c => ({
      name: c.name,
      amount: c.amount,
      percentage: monthTotal > 0 ? Math.round(c.amount / monthTotal * 100) : 0,
      color: c.color
    })),
    recentExpenses: weekExpenses.slice(0, 10).map(e => ({
      note: e.note || e.category_name,
      amount: e.amount,
      category: e.category_name,
      date: e.date
    })),
    monthlyTrend,
    topExpensesThisMonth: monthExpenses
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5)
      .map(e => ({
        note: e.note || e.category_name,
        amount: e.amount,
        category: e.category_name,
        date: e.date
      }))
  };
}

/**
 * Chat with Gemini AI
 */
async function chatWithAI(userMessage, expenseContext, userName = 'User') {
  if (!GEMINI_API_KEY) {
    return '⚠️ AI tidak tersedia. API key belum dikonfigurasi.';
  }

  const systemPrompt = `Kamu adalah WhatAps, asisten pencatat pengeluaran yang ramah dan cerdas.
Jawab pertanyaan pengguna tentang pengeluaran mereka berdasarkan data yang diberikan.

Aturan:
- Selalu jawab dalam Bahasa Indonesia
- Gunakan emoji untuk membuat jawaban lebih menarik
- Buat jawaban SINGKAT dan PADAT (maks 150 kata)
- Gunakan format rupiah yang rapi (Rp X.XXX)
- Berikan insights jika relevan
- Jangan mengarang data
- Gunakan gaya bahasa kasual dan friendly`;

  const contextData = `
=== DATA PENGGELUARAN ${userName.toUpperCase()} ===

📅 Hari ini (${expenseContext.today}):
${expenseContext.todayExpenses.length > 0
  ? expenseContext.todayExpenses.map(e => `• ${e.note} - Rp ${e.amount.toLocaleString('id-ID')} (${e.category})`).join('\n')
  : '• Belum ada pengeluaran hari ini'}

📊 Ringkasan Bulan Ini (${expenseContext.monthlyTrend[expenseContext.monthlyTrend.length - 1]?.month || 'N/A'}):
• Total: Rp ${expenseContext.monthTotal.toLocaleString('id-ID')}
• Rata-rata/hari: Rp ${expenseContext.avgDaily.toLocaleString('id-ID')}
• Hari aktif: ${expenseContext.daysInMonth} hari

📂 Per Kategori:
${expenseContext.categorySummary.map(c => `• ${c.name}: Rp ${c.amount.toLocaleString('id-ID')} (${c.percentage}%)`).join('\n') || '• Belum ada data'}

📈 Trend 3 Bulan Terakhir:
${expenseContext.monthlyTrend.map(m => `• ${m.month}: Rp ${m.total.toLocaleString('id-ID')}`).join('\n')}

🔝 Top 5 Pengeluaran Terbesar Bulan Ini:
${expenseContext.topExpensesThisMonth.map(e => `• ${e.note}: Rp ${e.amount.toLocaleString('id-ID')} (${e.date})`).join('\n') || '• Belum ada data'}

📅 Pengeluaran 7 Hari Terakhir:
${expenseContext.recentExpenses.map(e => `• ${e.date}: ${e.note} - Rp ${e.amount.toLocaleString('id-ID')}`).join('\n') || '• Tidak ada data'}
`;

  const prompt = `${systemPrompt}\n\n${contextData}\n\nPertanyaan: ${userMessage}`;

  try {
    const response = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [{ text: prompt }]
        }],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 2048,
          topP: 0.9,
        }
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('[AI Chat] Gemini API error:', response.status, errText);
      return '❌ Maaf, ada error saat menghubungi AI. Coba lagi nanti.';
    }

    const data = await response.json();
    const candidate = data.candidates?.[0];
    let aiResponse = candidate?.content?.parts?.[0]?.text ||
                       '❌ Maaf, tidak bisa memproses pertanyaan Anda.';

    // Check if response was truncated
    if (candidate?.finishReason === 'MAX_TOKENS') {
      console.log('[AI Chat] Response was truncated due to max tokens');
      aiResponse += '\n\n_( jawaban dipotong )_';
    }

    return aiResponse;
  } catch (error) {
    console.error('[AI Chat] Error:', error.message);
    return '❌ Maaf, terjadi kesalahan. Coba lagi nanti.';
  }
}

/**
 * Check if message is a chat/question (not a command)
 */
function isChatMessage(text) {
  const trimmed = text.trim().toLowerCase();

  // Skip commands
  if (/^(laporan|hapus|simpan|batal|help|bantuan|menu|perintah|\?|prediksi|trend|tren|proyeksi|predik)$/i.test(trimmed)) return false;

  // Skip expense format (description + number)
  if (/^(.+?)\s+[\d.]+$/.test(trimmed)) return false;

  // Skip if just a number
  if (/^[\d.]+$/.test(trimmed)) return false;

  return true;
}

/**
 * AI-powered category suggestion
 * Analyzes expense description and suggests the best category
 */
async function suggestCategory(description, userCategories = []) {
  if (!GEMINI_API_KEY) {
    // Fallback to simple keyword matching
    return guessCategoryFallback(description);
  }

  // If no user categories, use default
  const categories = userCategories.length > 0
    ? userCategories.map(c => c.name).join(', ')
    : 'Makanan, Transport, Belanja, Tagihan, Hiburan, Kesehatan, Pendidikan, Lainnya';

  const prompt = `Analisis deskripsi pengeluaran berikut dan pilih kategori yang paling cocok.

Deskripsi: "${description}"

Kategori yang tersedia: ${categories}

Aturan:
- Pilih HANYA satu kategori dari daftar yang tersedia
- Jika tidak yakin, pilih "Lainnya"
- Jawab HANYA dengan nama kategori (tanpa penjelasan)
- Contoh jawaban: Makanan`;

  try {
    const response = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [{ text: prompt }]
        }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 20,
          topP: 0.9,
        }
      })
    });

    if (!response.ok) {
      console.error('[AI Category] Gemini API error:', response.status);
      return guessCategoryFallback(description);
    }

    const data = await response.json();
    const suggestedCategory = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

    // Validate the suggested category exists in user's categories
    if (suggestedCategory && categories.toLowerCase().includes(suggestedCategory.toLowerCase())) {
      console.log(`[AI Category] Suggested: "${suggestedCategory}" for "${description}"`);
      return suggestedCategory;
    }

    // If AI suggested something not in the list, fallback
    console.log(`[AI Category] Invalid suggestion: "${suggestedCategory}", using fallback`);
    return guessCategoryFallback(description);

  } catch (error) {
    console.error('[AI Category] Error:', error.message);
    return guessCategoryFallback(description);
  }
}

/**
 * Fallback keyword-based category matching
 */
function guessCategoryFallback(description) {
  const lower = description.toLowerCase();
  const CATEGORY_KEYWORDS = {
    'makan': 'Makanan', 'minum': 'Makanan', 'nasi': 'Makanan', 'goreng': 'Makanan',
    'ayam': 'Makanan', 'bakso': 'Makanan', 'mie': 'Makanan', 'roti': 'Makanan',
    'kopi': 'Makanan', 'teh': 'Makanan', 'jus': 'Makanan', 'es': 'Makanan',
    'bensin': 'Transport', 'parkir': 'Transport', 'toll': 'Transport', 'ojek': 'Transport',
    'grab': 'Transport', 'gojek': 'Transport', 'transport': 'Transport',
    'listrik': 'Tagihan', 'air': 'Tagihan', 'internet': 'Tagihan', 'telepon': 'Tagihan',
    'baju': 'Belanja', 'sepatu': 'Belanja', 'sabun': 'Belanja', 'shampo': 'Belanja',
    'belanja': 'Belanja', 'toko': 'Belanja',
    'obat': 'Kesehatan', 'dokter': 'Kesehatan', 'rumah sakit': 'Kesehatan', 'apotek': 'Kesehatan',
    'sekolah': 'Pendidikan', 'kuliah': 'Pendidikan', 'buku': 'Pendidikan', 'kursus': 'Pendidikan',
    'nonton': 'Hiburan', 'game': 'Hiburan', 'spotify': 'Hiburan', 'film': 'Hiburan',
  };

  for (const [keyword, category] of Object.entries(CATEGORY_KEYWORDS)) {
    if (lower.includes(keyword)) return category;
  }
  return 'Lainnya';
}

/**
 * Get trend prediction from AI
 * Analyzes last 6 months of data and predicts next month
 */
async function getTrendPrediction(userId) {
  if (!GEMINI_API_KEY) {
    return '⚠️ AI tidak tersedia. API key belum dikonfigurasi.';
  }

  const now = new Date();
  const currentMonth = now.toISOString().slice(0, 7);

  // Gather last 6 months of data
  const monthlyData = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const month = d.toISOString().slice(0, 7);
    const summary = Expense.getMonthlySummary(userId, month);
    const monthName = d.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });

    // Get daily data for pattern analysis
    const dailyData = summary.daily || [];
    const weekdayTotals = [0, 0, 0, 0, 0, 0, 0]; // Mon-Sun
    const weekdayCounts = [0, 0, 0, 0, 0, 0, 0];
    for (const day of dailyData) {
      const dateObj = new Date(day.date);
      const dayOfWeek = (dateObj.getDay() + 6) % 7; // 0=Mon, 6=Sun
      weekdayTotals[dayOfWeek] += day.total;
      weekdayCounts[dayOfWeek]++;
    }
    const weekdayAvg = weekdayTotals.map((total, i) =>
      weekdayCounts[i] > 0 ? Math.round(total / weekdayCounts[i]) : 0
    );

    // Top categories this month
    const topCategories = (summary.by_category || [])
      .slice(0, 5)
      .map(c => `${c.name}: Rp ${c.amount.toLocaleString('id-ID')}`)
      .join(', ');

    monthlyData.push({
      month,
      monthName,
      total: summary.total || 0,
      daysActive: summary.days_active || 0,
      avgDaily: Math.round(summary.avg_daily || 0),
      topCategories,
      weekdayAvg,
    });
  }

  // Calculate growth rates
  const growthRates = [];
  for (let i = 1; i < monthlyData.length; i++) {
    const prev = monthlyData[i - 1].total;
    const curr = monthlyData[i].total;
    if (prev > 0) {
      growthRates.push(((curr - prev) / prev * 100).toFixed(1));
    } else {
      growthRates.push('N/A');
    }
  }

  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const nextMonthName = nextMonth.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });

  const systemPrompt = `Kamu adalah WhatAps, asisten analisis keuangan cerdas.
Buat prediksi pengeluaran bulan depan berdasarkan data historis.

Aturan:
- Selalu jawab dalam Bahasa Indonesia dengan emoji
- Buat jawaban SINGKAT dan PADAT (maks 200 kata)
- Sertakan angka prediksi yang realistis
- Berikan insight tentang pola pengeluaran
- Berikan tips hemat jika relevan
- Gunakan format rupiah yang rapi (Rp X.XXX)`;

  const dataStr = `
=== DATA HISTORIS 6 BULAN TERAKHIR ===
${monthlyData.map(m =>
    `📅 ${m.monthName}:\n` +
    `   Total: Rp ${m.total.toLocaleString('id-ID')}\n` +
    `   Rata-rata/hari: Rp ${m.avgDaily.toLocaleString('id-ID')}\n` +
    `   Hari aktif: ${m.daysActive}\n` +
    `   Top kategori: ${m.topCategories || '-'}\n` +
    `   Avg per hari (Sen-Min): ${m.weekdayAvg.map(v => 'Rp' + v.toLocaleString('id-ID')).join(', ')}`
  ).join('\n\n')}

=== PERTUMBUHAN BULANAN ===
${monthlyData.slice(1).map((m, i) => `${m.monthName}: ${growthRates[i] !== 'N/A' ? growthRates[i] + '%' : 'N/A (data sebelumnya 0)'}`).join('\n')}

=== PREDIKSI BULAN DEPAN ===
Target: ${nextMonthName}`;

  const prompt = `${systemPrompt}\n\n${dataStr}\n\nBuat prediksi pengeluaran ${nextMonthName} berdasarkan data di atas. Sertakan:\n1. Estimasi total pengeluaran\n2. Pola yang terlihat\n3. Kategori yang perlu diperhatikan\n4. Tips hemat`;

  try {
    const response = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [{ text: prompt }]
        }],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 2048,
          topP: 0.9,
        }
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('[AI Trend] Gemini API error:', response.status, errText);
      return '❌ Maaf, ada error saat menghubungi AI untuk prediksi.';
    }

    const data = await response.json();
    const candidate = data.candidates?.[0];
    let aiResponse = candidate?.content?.parts?.[0]?.text ||
      '❌ Maaf, tidak bisa membuat prediksi saat ini.';

    // Check if response was truncated
    if (candidate?.finishReason === 'MAX_TOKENS') {
      console.log('[AI Trend] Response was truncated due to max tokens');
      aiResponse += '\n\n_( jawaban dipotong )_';
    }

    return `🔮 *Prediksi Pengeluaran ${nextMonthName}*\n\n${aiResponse}`;
  } catch (error) {
    console.error('[AI Trend] Error:', error.message);
    return '❌ Maaf, terjadi kesalahan saat membuat prediksi.';
  }
}

module.exports = { chatWithAI, getExpenseContext, isChatMessage, suggestCategory, guessCategoryFallback, getTrendPrediction };
