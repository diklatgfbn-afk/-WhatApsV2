// WhatsApp page
let qrInterval = null;

async function loadWhatsApp() {
  const status = await api('/api/whatsapp/status');
  updateStatusUI(status);
}

function updateStatusUI(status) {
  const indicator = document.getElementById('waIndicator');
  const statusText = document.getElementById('waStatusText');
  if (status?.connected) {
    indicator.style.background = 'var(--success)';
    statusText.textContent = `✅ Terhubung (${status.phone_number})`;
    document.getElementById('waQrContainer').style.display = 'none';
  } else {
    indicator.style.background = 'var(--danger)';
    statusText.textContent = status?.error ? `❌ ${status.error}` : '❌ Belum terhubung';
  }
}

async function connectWhatsApp() {
  const qrContainer = document.getElementById('waQrContainer');
  qrContainer.style.display = 'block';
  qrContainer.innerHTML = '<p class="qr-status">🔄 Memulai koneksi WhatsApp...</p><p style="font-size:12px;color:var(--text-secondary)">Browser akan terbuka secara otomatis, mohon tunggu 10-30 detik</p>';

  const connectRes = await api('/api/whatsapp/connect', { method: 'POST' });
  if (connectRes?.error) {
    qrContainer.innerHTML = `<p class="qr-status" style="color:var(--danger)">❌ Gagal: ${connectRes.error}</p>`;
    return;
  }

  // Poll for QR code - fast polling
  if (qrInterval) clearInterval(qrInterval);
  let attempts = 0;
  let lastQR = null;
  qrInterval = setInterval(async () => {
    attempts++;
    const qrRes = await api('/api/whatsapp/qr');

    if (qrRes?.connected) {
      clearInterval(qrInterval);
      updateStatusUI({ connected: true, phone_number: 'Connected' });
      toast('✅ WhatsApp terhubung!');
      return;
    }

    if (qrRes?.error && !qrRes?.qr) {
      if (attempts > 5) {
        clearInterval(qrInterval);
        qrContainer.innerHTML = `
          <p class="qr-status" style="color:var(--danger)">❌ Error: ${qrRes.error}</p>
          <p style="font-size:12px;color:var(--text-secondary);margin-top:10px">
            Coba hubungkan lagi. Pastikan Chrome/Chromium bisa berjalan di PC Anda.
          </p>
          <button class="btn btn-outline btn-sm" onclick="connectWhatsApp()" style="margin-top:15px">🔄 Coba Lagi</button>
        `;
      }
      return;
    }

    if (qrRes?.qr) {
      // Only update DOM if QR changed (avoid flickering)
      if (lastQR !== qrRes.qr) {
        lastQR = qrRes.qr;
        qrContainer.innerHTML = `
          <div class="qr-container">
            <img src="${qrRes.qr}" alt="QR Code" style="max-width:280px;border-radius:12px;border:2px solid var(--border)">
            <p class="qr-status" style="margin-top:15px;font-weight:600">📱 Scan QR ini dengan WhatsApp</p>
            <div style="font-size:13px;color:var(--text-secondary);margin-top:12px;text-align:left;background:var(--bg);padding:15px;border-radius:10px">
              <p style="margin-bottom:8px"><strong>Cara menghubungkan:</strong></p>
              <p>1. Buka <strong>WhatsApp</strong> di HP</p>
              <p>2. Ketuk <strong>⋮ (Menu)</strong> → <strong>Linked Devices</strong></p>
              <p>3. Ketuk <strong>Link a Device</strong></p>
              <p>4. <strong>Scan</strong> QR code di atas</p>
            </div>
            <p style="font-size:11px;color:var(--text-secondary);margin-top:10px">⏳ QR akan refresh otomatis jika expired</p>
          </div>
        `;
      }
      return;
    }

    // No QR yet - show loading
    if (attempts <= 10 && attempts % 3 === 0) {
      qrContainer.innerHTML = `<p class="qr-status">🔄 Menunggu QR code... (${attempts}s)</p>`;
    }

    if (attempts > 60) {
      clearInterval(qrInterval);
      qrContainer.innerHTML = `
        <p class="qr-status" style="color:var(--danger)">⏱️ Timeout - QR tidak muncul</p>
        <p style="font-size:12px;color:var(--text-secondary);margin-top:10px">
          Browser mungkin lambat memuat WhatsApp Web. Coba lagi.
        </p>
        <button class="btn btn-outline btn-sm" onclick="connectWhatsApp()" style="margin-top:15px">🔄 Coba Lagi</button>
      `;
    }
  }, 500);
}

async function loadWhatsAppMessages() {
  const res = await api('/api/whatsapp/messages');
  const list = document.getElementById('waMessages');
  if (!res?.messages?.length) {
    list.innerHTML = '<div class="empty-state"><div class="icon">💬</div><p>Belum ada pesan dari WhatsApp</p><p style="font-size:12px;margin-top:5px">Ketik format: <code>beli makan 15000</code></p></div>';
    return;
  }
  list.innerHTML = res.messages.map(m => `
    <div class="expense-item">
      <div class="expense-icon" style="background:#25d36620;color:#25d366">💬</div>
      <div class="expense-info">
        <div class="name">${m.note || m.category_name}</div>
        <div class="meta">${m.category_name} · ${new Date(m.created_at).toLocaleString('id-ID')}</div>
      </div>
      <div class="expense-amount">-${formatCurrency(m.amount)}</div>
    </div>
  `).join('');
}
