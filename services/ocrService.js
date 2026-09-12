const fs = require('fs');
const path = require('path');
const Category = require('../models/Category');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = 'gemini-3.6-flash';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

const CATEGORY_KEYWORDS = {
  'makan': 'Makanan', 'minum': 'Makanan', 'nasi': 'Makanan', 'goreng': 'Makanan',
  'ayam': 'Makanan', 'bakso': 'Makanan', 'mie': 'Makanan', 'roti': 'Makanan',
  'kopi': 'Makanan', 'teh': 'Makanan', 'jus': 'Makanan', 'es': 'Makanan',
  'bensin': 'Transport', 'parkir': 'Transport', 'toll': 'Transport', 'ojek': 'Transport',
  'grab': 'Transport', 'gojek': 'Transport', 'transport': 'Transport',
  'listrik': 'Tagihan', 'air': 'Tagihan', 'internet': 'Tagihan', 'telepon': 'Tagihan',
  'baju': 'Belanja', 'sepatu': 'Belanja', 'sabun': 'Belanja', 'shampo': 'Belanja',
  'belanja': 'Belanja', 'toko': 'Belanja',
};

const TESSDATA_DIR = path.join(__dirname, '..', 'tessdata');
const TESSDATA_URL = 'https://raw.githubusercontent.com/tesseract-ocr/tessdata_fast/main/ind.traineddata';

function guessCategory(text) {
  const lower = text.toLowerCase();
  for (const [keyword, category] of Object.entries(CATEGORY_KEYWORDS)) {
    if (lower.includes(keyword)) return category;
  }
  return 'Lainnya';
}

function extractNominalFromText(text) {
  const patterns = [
    /Rp\.?\s*([\d.,]+)/gi,
    /total\s*:?\s*([\d.,]+)/gi,
    /(?:harga|bayar|jumlah)\s*:?\s*([\d.,]+)/gi,
  ];
  const amounts = [];
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const raw = match[1].replace(/[^0-9]/g, '');
      const num = parseInt(raw, 10);
      if (!isNaN(num) && num > 0) amounts.push(num);
    }
  }
  return amounts.length > 0 ? Math.max(...amounts) : null;
}

async function ocrWithGemini(buffer) {
  const base64Image = buffer.toString('base64');

  const response = await fetch(GEMINI_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        parts: [
          { text: "Ekstrak total nominal (angka) dan kategori dari struk/invoice berikut. Format jawaban: {nominal: angka, kategori: string}. Jika tidak ada nominal, jawab {nominal: 0, kategori: tidak diketahui}. Struk dalam bahasa Indonesia." },
          { inline_data: { mime_type: 'image/jpeg', data: base64Image } }
        ]
      }],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 256,
      }
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Gemini API error ${response.status}: ${errText}`);
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

  // Parse Gemini response
  const nominalMatch = text.match(/nominal[:\s]*(\d+)/i);
  const nominal = nominalMatch ? parseInt(nominalMatch[1], 10) : extractNominalFromText(text);
  const categoryMatch = text.match(/kategori[:\s]*(\w+)/i);
  const categoryName = categoryMatch ? categoryMatch[1] : guessCategory(text);

  return {
    rawText: text,
    nominal,
    category_suggestion: categoryName,
    success: nominal !== null && nominal > 0,
    method: 'gemini',
  };
}

let workerReady = null;

async function getWorker() {
  if (workerReady) return workerReady;
  const { createWorker } = require('tesseract.js');
  const worker = await createWorker('ind', undefined, {
    langPath: fs.existsSync(path.join(TESSDATA_DIR, 'ind.traineddata'))
      ? TESSDATA_DIR
      : undefined,
    logger: () => {},
  });
  workerReady = worker;
  return worker;
}

async function ocrWithTesseract(buffer) {
  const worker = await getWorker();
  const { data } = await worker.recognize(buffer);
  const text = data?.text || '';
  const nominal = extractNominalFromText(text);
  const categoryName = guessCategory(text);
  return {
    rawText: text,
    nominal,
    category_suggestion: categoryName,
    success: nominal !== null,
    method: 'tesseract',
  };
}

async function extractNominalFromBuffer(buffer) {
  try {
    // Try Gemini first if API key is available
    if (GEMINI_API_KEY) {
      try {
        const result = await ocrWithGemini(buffer);
        if (result.success) return result;
        console.log('[OCR] Gemini failed, falling back to Tesseract');
      } catch (e) {
        console.log('[OCR] Gemini error:', e.message);
      }
    }
    // Fallback to Tesseract
    return await ocrWithTesseract(buffer);
  } catch (error) {
    return {
      rawText: '',
      nominal: null,
      category_suggestion: 'Lainnya',
      success: false,
      error: error.message,
      method: 'none',
    };
  }
}

async function extractNominal(imagePath) {
  try {
    const buffer = fs.readFileSync(imagePath);
    return await extractNominalFromBuffer(buffer);
  } catch (error) {
    return {
      rawText: '',
      nominal: null,
      category_suggestion: 'Lainnya',
      success: false,
      error: error.message,
      method: 'none',
    };
  }
}

module.exports = { extractNominal, extractNominalFromText, guessCategory };
