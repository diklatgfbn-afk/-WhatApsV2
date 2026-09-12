// Expenses page
let categories = [];

async function loadExpenses() {
  categories = (await api('/api/categories'))?.categories || [];
  const expenses = (await api(`/api/expenses?date=${today()}`))?.expenses || [];
  renderExpenseList(expenses);
  renderCategoryChips();
}

function renderExpenseList(expenses) {
  const list = document.getElementById('expenseList');
  if (!expenses.length) {
    list.innerHTML = '<div class="empty-state"><div class="icon">📝</div><p>Tidak ada pengeluaran hari ini</p><p style="margin-top:10px;font-size:12px">Tekan tombol + untuk menambah</p></div>';
    return;
  }
  const total = expenses.reduce((s, e) => s + e.amount, 0);
  list.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:2px solid var(--border)">
      <span style="font-weight:700">Total Hari Ini</span>
      <span style="font-weight:700;color:var(--danger);font-size:18px">${formatCurrency(total)}</span>
    </div>
    ${expenses.map(e => `
      <div class="expense-item">
        <div class="expense-icon" style="background:${e.category_color}20;color:${e.category_color}">💸</div>
        <div class="expense-info">
          <div class="name">${e.note || e.category_name}</div>
          <div class="meta">${e.category_name} · ${e.source} · ${new Date(e.created_at).toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit'})}</div>
        </div>
        <div class="expense-amount">-${formatCurrency(e.amount)}</div>
        <button onclick="deleteExpense(${e.id})" style="background:none;border:none;cursor:pointer;font-size:18px;color:#ccc" title="Hapus">✕</button>
      </div>
    `).join('')}
  `;
}

function renderCategoryChips() {
  const container = document.getElementById('categoryChips');
  container.innerHTML = categories.map(c => `
    <span class="chip" data-id="${c.id}" onclick="selectCategory(${c.id})" style="background:${c.color}15;color:${c.color}">
      <span class="color-dot" style="background:${c.color}"></span>${c.name}
    </span>
  `).join('');
}

let selectedCategoryId = null;
let receiptState = null; // { receipt_path, ocr_raw }

function selectCategory(id) {
  selectedCategoryId = id;
  document.querySelectorAll('.chip').forEach(c => c.classList.toggle('selected', Number(c.dataset.id) === id));
}

function startReceiptScan() {
  document.getElementById('receiptFileInput').click();
}

async function uploadReceipt(file) {
  if (!file) return;
  const preview = document.getElementById('receiptPreview');
  const img = document.getElementById('receiptPreviewImg');
  const status = document.getElementById('receiptStatus');
  const scanArea = document.getElementById('scanArea');

  // Show preview
  const reader = new FileReader();
  reader.onload = (e) => { img.src = e.target.result; };
  reader.readAsDataURL(file);

  preview.style.display = 'block';
  scanArea.style.display = 'none';
  status.textContent = '🧾 Struk diproses...';
  status.style.color = 'var(--text-secondary)';

  try {
    const formData = new FormData();
    formData.append('receipt', file);
    const res = await api('/api/receipt', { method: 'POST', body: formData });

    if (res?.error) throw new Error(res.error);
    if (!res?.success) {
      status.textContent = '❌ Gagal membaca struk';
      status.style.color = 'var(--danger)';
      return;
    }

    // Prefill modal fields from OCR result
    if (res.nominal) document.getElementById('expAmount').value = res.nominal;
    document.getElementById('expNote').value = res.category_suggestion !== 'Lainnya' ? res.category_suggestion : 'Struk belanja';

    // Auto-select suggested category chip
    if (res.category_suggestion && categories.length > 0) {
      const matchCat = categories.find(c => c.name.toLowerCase() === res.category_suggestion.toLowerCase());
      if (matchCat) selectCategory(matchCat.id);
    }

    receiptState = { receipt_path: res.file_path, ocr_raw: res.rawText };
    status.textContent = `✅ Ditemukan: Rp ${res.nominal?.toLocaleString('id-ID') || '???'}`;
    status.style.color = 'var(--success)';
  } catch (err) {
    status.textContent = '❌ Gagal: ' + (err.message || 'Error');
    status.style.color = 'var(--danger)';
  }
}

async function addExpense(e) {
  e.preventDefault();
  const amount = Number(document.getElementById('expAmount').value);
  const note = document.getElementById('expNote').value;
  const date = document.getElementById('expDate').value || today();
  if (!selectedCategoryId || !amount) return toast('Pilih kategori & isi nominal');

  const payload = { category_id: selectedCategoryId, amount, note, date };
  if (receiptState) {
    payload.source = 'ocr';
    payload.receipt_path = receiptState.receipt_path;
    payload.ocr_raw = receiptState.ocr_raw;
  }

  const res = await api('/api/expenses', { method: 'POST', body: JSON.stringify(payload) });
  if (res?.expense) {
    toast(receiptState ? '✅ Struk disimpan' : '✅ Pengeluaran ditambahkan');
    closeModal('addExpenseModal');
    document.getElementById('addExpenseForm').reset();
    selectedCategoryId = null;
    receiptState = null;
    // Reset receipt UI
    document.getElementById('receiptPreview').style.display = 'none';
    document.getElementById('scanArea').style.display = '';
    loadExpenses();
  }
}

async function deleteExpense(id) {
  if (!confirm('Hapus pengeluaran ini?')) return;
  await api(`/api/expenses/${id}`, { method: 'DELETE' });
  toast('🗑️ Dihapus');
  loadExpenses();
}
