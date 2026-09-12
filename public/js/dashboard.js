// Dashboard
let dailyChart = null;
let weeklyChart = null;

async function loadDashboard() {
  const date = today();
  const [dailyRes, monthlyRes] = await Promise.all([
    api(`/api/reports/daily?date=${date}`),
    api(`/api/reports/monthly?month=${currentMonth()}`)
  ]);

  if (!dailyRes || !monthlyRes) return;

  // KPI cards
  document.getElementById('kpiToday').textContent = formatCurrency(dailyRes.total);
  document.getElementById('kpiMonth').textContent = formatCurrency(monthlyRes.total);
  document.getElementById('kpiAvg').textContent = formatCurrency(monthlyRes.avg_daily);

  // Daily pie chart
  renderDailyChart(dailyRes.by_category);
  // Weekly bar chart
  renderWeeklyChart(monthlyRes.daily);
  // Expense list
  renderRecentExpenses(dailyRes.transactions);
}

function renderDailyChart(data) {
  const ctx = document.getElementById('dailyChart');
  if (dailyChart) dailyChart.destroy();
  if (!data || data.length === 0) {
    ctx.parentElement.innerHTML = '<div class="empty-state"><div class="icon">📊</div><p>Belum ada pengeluaran hari ini</p></div>';
    return;
  }
  ctx.parentElement.style.height = '250px';
  dailyChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: data.map(d => d.name),
      datasets: [{ data: data.map(d => d.amount), backgroundColor: data.map(d => d.color), borderWidth: 0 }]
    },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { padding: 15, font: { size: 12 } } } } }
  });
}

function renderWeeklyChart(data) {
  const ctx = document.getElementById('weeklyChart');
  if (weeklyChart) weeklyChart.destroy();
  if (!data || data.length === 0) return;
  weeklyChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: data.map(d => d.date.slice(8, 10)),
      datasets: [{ label: 'Pengeluaran', data: data.map(d => d.total), backgroundColor: '#25d366', borderRadius: 6 }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      scales: { y: { beginAtZero: true, ticks: { callback: v => formatCurrency(v) } } },
      plugins: { legend: { display: false } }
    }
  });
}

function renderRecentExpenses(expenses) {
  const list = document.getElementById('recentExpenses');
  if (!expenses || expenses.length === 0) {
    list.innerHTML = '<div class="empty-state"><div class="icon">📝</div><p>Belum ada pengeluaran hari ini</p></div>';
    return;
  }
  list.innerHTML = expenses.slice(0, 5).map(e => `
    <div class="expense-item">
      <div class="expense-icon" style="background:${e.category_color}20;color:${e.category_color}">💸</div>
      <div class="expense-info">
        <div class="name">${e.note || e.category_name}</div>
        <div class="meta">${e.category_name} · ${e.source}</div>
      </div>
      <div class="expense-amount">-${formatCurrency(e.amount)}</div>
    </div>
  `).join('');
}
