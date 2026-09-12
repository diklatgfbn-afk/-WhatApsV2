// Settings page
async function loadSettings() {
  const user = getUser();
  if (!user) return;
  document.getElementById('settingName').value = user.display_name || '';
  document.getElementById('settingCurrency').value = user.currency || 'IDR';
  document.getElementById('manageMonth').value = currentMonth();
  loadReminders();
  loadManageExpenses();
}

async function saveProfile(e) {
  e.preventDefault();
  const display_name = document.getElementById('settingName').value;
  const currency = document.getElementById('settingCurrency').value;
  const res = await api('/api/auth/profile', { method: 'PUT', body: JSON.stringify({ display_name, currency }) });
  if (res?.user) {
    localStorage.setItem('user', JSON.stringify(res.user));
    toast('✅ Profil disimpan');
  }
}

async function loadReminders() {
  const res = await api('/api/reminders');
  const list = document.getElementById('reminderList');
  if (!res?.reminders?.length) {
    list.innerHTML = '<div class="empty-state"><p>Belum ada pengingat</p></div>';
    return;
  }
  list.innerHTML = res.reminders.map(r => `
    <div class="setting-item">
      <div>
        <div style="font-weight:600">⏰ ${r.time}</div>
        <div style="font-size:12px;color:var(--text-secondary)">${r.channel} · ${r.message}</div>
      </div>
      <button class="btn btn-sm btn-outline" onclick="toggleReminder(${r.id}, ${r.enabled ? 0 : 1})">
        ${r.enabled ? '🔴 Mati' : '🟢 Hidup'}
      </button>
    </div>
  `).join('');
}

async function addReminder(e) {
  e.preventDefault();
  const time = document.getElementById('reminderTime').value;
  const channel = document.getElementById('reminderChannel').value;
  const message = document.getElementById('reminderMsg').value || 'Catat pengeluaran hari ini!';
  if (!time) return toast('Pilih waktu pengingat');
  await api('/api/reminders', { method: 'POST', body: JSON.stringify({ time, channel, message }) });
  toast('✅ Pengingat ditambahkan');
  document.getElementById('addReminderForm').reset();
  loadReminders();
}

async function toggleReminder(id, enabled) {
  await api(`/api/reminders/${id}`, { method: 'PUT', body: JSON.stringify({ enabled }) });
  loadReminders();
}

async function exportCSV() {
  const month = currentMonth();
  window.open(`/api/export/expenses?month=${month}`, '_blank');
  toast('📥 Export dimulai');
}

// --- Kelola Pengeluaran ---

async function loadManageExpenses() {
  const month = document.getElementById('manageMonth').value || currentMonth();
  const list = document.getElementById('manageExpenseList');
  try {
    const res = await api(`/api/expenses?month=${month}`);
    const expenses = res?.expenses || [];
    if (!expenses.length) {
      list.innerHTML = '<div class="empty-state"><p>Belum ada pengeluaran bulan ini</p></div>';
      return;
    }

    // Group by date
    const grouped = {};
    for (const e of expenses) {
      if (!grouped[e.date]) grouped[e.date] = [];
      grouped[e.date].push(e);
    }

    const sortedDates = Object.keys(grouped).sort().reverse();
    let total = 0;

    list.innerHTML = sortedDates.map(date => {
      const items = grouped[date];
      const dayTotal = items.reduce((s, e) => s + e.amount, 0);
      total += dayTotal;
      const dateLabel = new Date(date + 'T00:00:00').toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
      return `
        <div style="padding:10px 0;border-bottom:1px solid var(--border)">
          <div style="display:flex;justify-content:space-between;margin-bottom:6px">
            <span style="font-weight:600;font-size:13px">📅 ${dateLabel}</span>
            <span style="font-weight:600;font-size:13px;color:var(--danger)">${formatCurrency(dayTotal)}</span>
          </div>
          ${items.map(e => `
            <div class="expense-item" style="padding:6px 0">
              <div class="expense-icon" style="background:${e.category_color}20;color:${e.category_color};width:28px;height:28px;font-size:12px;flex-shrink:0">💸</div>
              <div class="expense-info" style="flex:1">
                <div class="name" style="font-size:13px">${e.note || e.category_name}</div>
                <div class="meta" style="font-size:11px">${e.category_name} · ${e.source} · ID:${e.id}</div>
              </div>
              <div class="expense-amount" style="font-size:13px">-${formatCurrency(e.amount)}</div>
              <button onclick="manageDeleteExpense(${e.id})" style="background:none;border:none;cursor:pointer;font-size:16px;color:#ccc;margin-left:4px" title="Hapus">✕</button>
            </div>
          `).join('')}
        </div>
      `;
    }).join('');

    // Add total row at top
    list.insertAdjacentHTML('afterbegin', `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:2px solid var(--border)">
        <span style="font-weight:700">Total ${new Date(month + '-01').toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })}</span>
        <span style="font-weight:700;color:var(--danger);font-size:18px">${formatCurrency(total)}</span>
      </div>
    `);
  } catch (err) {
    list.innerHTML = '<div class="empty-state"><p>Gagal memuat data</p></div>';
  }
}

async function manageDeleteExpense(id) {
  if (!confirm('Hapus pengeluaran ini?')) return;
  const res = await api(`/api/expenses/${id}`, { method: 'DELETE' });
  if (res?.success === true) {
    toast('🗑️ Dihapus');
    loadManageExpenses();
  } else {
    toast('❌ Gagal menghapus');
  }
}