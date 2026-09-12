// Auth + Navigation
const API = '';

function getToken() { return localStorage.getItem('token'); }
function getUser() { try { return JSON.parse(localStorage.getItem('user')); } catch { return null; } }
function logout() {
  fetch(`${API}/api/auth/logout`, { method: 'POST', credentials: 'include' });
  localStorage.clear();
  window.location.href = '/login.html';
}

// Auth guard
if (!getToken() && !window.location.pathname.includes('login')) {
  window.location.href = '/login.html';
}

// Fetch wrapper
async function api(path, options = {}) {
  const isFormData = options.body instanceof FormData;
  const baseHeaders = isFormData
    ? { Authorization: `Bearer ${getToken()}` }
    : { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` };
  const res = await fetch(`${API}${path}`, {
    ...options,
    credentials: 'include',
    headers: { ...baseHeaders, ...options.headers }
  });
  if (res.status === 401) { logout(); return null; }
  return res.json();
}

// Toast
function toast(msg) {
  const el = document.createElement('div');
  el.className = 'toast'; el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

// Format currency
function formatCurrency(amount, currency = 'IDR') {
  const symbols = { IDR: 'Rp', USD: '$', EUR: '€', GBP: '£', JPY: '¥', MYR: 'RM', THB: '฿' };
  const sym = symbols[currency] || currency + ' ';
  return `${sym}${Number(amount).toLocaleString('id-ID')}`;
}

// Navigation
function navigateTo(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const target = document.getElementById(`page-${page}`);
  if (target) target.classList.add('active');
  const navBtn = document.querySelector(`[data-page="${page}"]`);
  if (navBtn) navBtn.classList.add('active');
  // Trigger page load
  if (page === 'dashboard' && typeof loadDashboard === 'function') loadDashboard();
  if (page === 'expenses' && typeof loadExpenses === 'function') loadExpenses();
  if (page === 'reports' && typeof loadReports === 'function') loadReports();
  if (page === 'settings' && typeof loadSettings === 'function') loadSettings();
}

// Modal helpers
function openModal(id) { document.getElementById(id).style.display = 'flex'; }
function closeModal(id) { document.getElementById(id).style.display = 'none'; }

// Date helpers
function today() { return new Date().toISOString().split('T')[0]; }
function currentMonth() { return new Date().toISOString().slice(0, 7); }

// Init
document.addEventListener('DOMContentLoaded', () => {
  const user = getUser();
  if (user) {
    document.getElementById('userName').textContent = user.display_name || 'User';
  }
  navigateTo('dashboard');
});
