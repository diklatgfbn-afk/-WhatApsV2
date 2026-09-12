// Reports page
let compareChart = null;
let trendChart = null;

function computeRange(period) {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  switch (period) {
    case 'harian': {
      const d = today();
      return [d, d];
    }
    case 'mingguan': {
      const dayOfWeek = (now.getDay() + 6) % 7; // 0=Monday
      const monday = new Date(now);
      monday.setDate(now.getDate() - dayOfWeek);
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      return [toStr(monday), toStr(sunday)];
    }
    case 'bulanan': {
      const first = new Date(y, m, 1);
      const last = new Date(y, m + 1, 0);
      return [toStr(first), toStr(last)];
    }
    case 'custom': {
      const s = document.getElementById('reportStart').value;
      const e = document.getElementById('reportEnd').value;
      if (s && e) return [s <= e ? s : e, e >= s ? e : s];
      // fallback: current month
      const first = new Date(y, m, 1);
      const last = new Date(y, m + 1, 0);
      return [toStr(first), toStr(last)];
    }
    default: {
      const first = new Date(y, m, 1);
      const last = new Date(y, m + 1, 0);
      return [toStr(first), toStr(last)];
    }
  }

  function toStr(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
}

function periodLabel(period) {
  switch (period) {
    case 'harian': return 'Hari Ini';
    case 'mingguan': return 'Minggu Ini';
    case 'bulanan': return 'Bulan Ini';
    case 'custom': return 'Custom';
    default: return 'Ringkasan';
  }
}

function applyReportPeriod() {
  const period = document.getElementById('reportPeriod').value;
  const customVisible = period === 'custom' ? 'inline-block' : 'none';
  document.getElementById('reportStart').style.display = customVisible;
  document.getElementById('reportEnd').style.display = customVisible;
  document.getElementById('reportToSep').style.display = customVisible;
  loadReports(period);
}

async function loadReports(period = 'bulanan') {
  period = period || document.getElementById('reportPeriod')?.value || 'bulanan';
  const [start, end] = computeRange(period);
  const label = periodLabel(period);

  const rangeRes = await api(`/api/reports/range?start=${start}&end=${end}`);
  if (!rangeRes) return;

  document.getElementById('reportPeriodLabel').textContent = '📊 ' + label;
  document.getElementById('monthTotal').textContent = formatCurrency(rangeRes.total || 0);
  document.getElementById('monthAvg').textContent = formatCurrency(rangeRes.avg_daily || 0);
  document.getElementById('monthDays').textContent = rangeRes.days_active || 0;

  // Category breakdown
  const catList = document.getElementById('categoryBreakdown');
  const total = rangeRes.total || 1;
  catList.innerHTML = (rangeRes.by_category || []).map(c => `
    <div style="padding:10px 0;border-bottom:1px solid var(--border)">
      <div style="display:flex;justify-content:space-between;margin-bottom:6px">
        <span><span class="color-dot" style="background:${c.color}"></span>${c.name}</span>
        <span style="font-weight:700">${formatCurrency(c.amount)} <span style="color:var(--text-secondary);font-weight:400">(${(c.amount/total*100).toFixed(1)}%)</span></span>
      </div>
      <div style="background:var(--border);height:6px;border-radius:3px">
        <div style="background:${c.color};height:100%;width:${(c.amount/total*100)}%;border-radius:3px"></div>
      </div>
    </div>
  `).join('') || '<div class="empty-state"><p>Belum ada data untuk periode ini</p></div>';

  // Trend chart
  renderTrendChart(rangeRes.daily || []);

  // Compare chart: only for monthly
  const compareCard = document.getElementById('compareCard');
  const diffBox = document.getElementById('monthDiffBox');
  if (period === 'bulanan') {
    const compareRes = await api(`/api/reports/compare?month=${start.slice(0, 7)}`);
    if (compareRes) {
      const diff = compareRes.diff_percent;
      const diffEl = document.getElementById('monthDiff');
      diffEl.textContent = `${diff >= 0 ? '+' : ''}${diff}%`;
      diffEl.style.color = diff > 0 ? 'var(--danger)' : 'var(--success)';
      renderCompareChart(compareRes);
    }
    compareCard.style.display = '';
    diffBox.style.display = '';
  } else {
    compareCard.style.display = 'none';
    diffBox.style.display = 'none';
  }
}

function renderCompareChart(data) {
  const ctx = document.getElementById('compareChart');
  if (compareChart) compareChart.destroy();
  compareChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: [data.previous_month, data.current_month],
      datasets: [{
        label: 'Total Pengeluaran',
        data: [data.previous_total, data.current_total],
        backgroundColor: ['#ccc', '#25d366'],
        borderRadius: 8, barThickness: 60
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      scales: { y: { beginAtZero: true, ticks: { callback: v => formatCurrency(v) } } },
      plugins: { legend: { display: false } }
    }
  });
}

function renderTrendChart(data) {
  const ctx = document.getElementById('trendChart');
  if (trendChart) trendChart.destroy();
  if (!data?.length) return;
  trendChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: data.map(d => d.date.slice(8)),
      datasets: [{
        label: 'Pengeluaran Harian',
        data: data.map(d => d.total),
        borderColor: '#25d366', backgroundColor: 'rgba(37,211,102,0.1)',
        fill: true, tension: 0.3, pointRadius: 4
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      scales: { y: { beginAtZero: true, ticks: { callback: v => formatCurrency(v) } } },
      plugins: { legend: { display: false } }
    }
  });
}