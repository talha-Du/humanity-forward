
// ─── Dashboard Logic – Humanity Forward ───

const HF_VERSION = '1.0.0';

// API Base Detection
const isTunnel = window.location.hostname.includes('loca.lt');
const API_BASE = isTunnel
  ? `https://${window.location.hostname}/api`
  : (window.location.hostname === 'localhost'
    ? 'http://localhost:3000/api'
    : '/api');

// ─── Connection Status ───
function updateConnectionStatus() {
  const dot = document.getElementById('status-dot');
  const text = document.getElementById('status-text');
  const isOnline = navigator.onLine;

  if (dot) {
    dot.className = `status-dot ${isOnline ? 'online' : 'offline'}`;
  }
  if (text) {
    text.textContent = isOnline ? 'Online' : 'Offline';
  }

  // Show/hide offline banner if it exists
  let banner = document.getElementById('offline-banner');
  if (!isOnline) {
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'offline-banner';
      banner.className = 'offline-banner';
      banner.textContent = '⚠️ Du bist offline. Es werden zwischengespeicherte Daten angezeigt.';
      document.body.insertBefore(banner, document.body.firstChild);
    }
  } else if (banner) {
    banner.remove();
  }
}

window.addEventListener('online', updateConnectionStatus);
window.addEventListener('offline', updateConnectionStatus);

// ─── Fetch Statistics ───
async function fetchStats() {
  const els = {
    total: document.getElementById('total-count'),
    water: document.getElementById('water-count'),
    food: document.getElementById('food-count'),
    health: document.getElementById('health-count'),
    education: document.getElementById('education-count'),
    mapperCount: document.getElementById('mapper-resource-count'),
  };

  function setCounts(data, source = '') {
    const total = data.length;
    const water = data.filter(r => r.type === 'water').length;
    const food = data.filter(r => r.type === 'food').length;
    const health = data.filter(r => r.type === 'health').length;
    const education = data.filter(r => r.type === 'education').length;

    if (els.total) els.total.textContent = total;
    if (els.water) els.water.textContent = water;
    if (els.food) els.food.textContent = food;
    if (els.health) els.health.textContent = health;
    if (els.education) els.education.textContent = education;
    if (els.mapperCount) els.mapperCount.textContent = `${total} Ressource${total !== 1 ? 'n' : ''}${source}`;
  }

  try {
    if (navigator.onLine) {
      const response = await fetch(`${API_BASE}/resources`);
      if (!response.ok) throw new Error('API Error');
      const resources = await response.json();
      // Cache for offline
      localStorage.setItem('crm_markers_v1', JSON.stringify(resources));
      setCounts(resources);
      return;
    }
  } catch (error) {
    console.warn('API fetch failed:', error);
  }

  // Offline fallback
  try {
    const raw = localStorage.getItem('crm_markers_v1') || '[]';
    const data = JSON.parse(raw);
    setCounts(data, ' (lokal)');
  } catch (e) {
    console.error('No data available');
    if (els.total) els.total.textContent = '0';
    if (els.water) els.water.textContent = '0';
    if (els.food) els.food.textContent = '0';
    if (els.health) els.health.textContent = '0';
    if (els.education) els.education.textContent = '0';
    if (els.mapperCount) els.mapperCount.textContent = '0 Ressourcen';
  }
}

// ─── Export All Data ───
async function exportAllData() {
  const btn = document.getElementById('export-all-btn');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span>⏳</span> Exportiere...';
  }

  try {
    let data = [];

    // Try API first
    if (navigator.onLine) {
      try {
        const response = await fetch(`${API_BASE}/resources`);
        if (response.ok) {
          data = await response.json();
        }
      } catch (e) {
        console.warn('API export failed, falling back to localStorage');
      }
    }

    // Fallback to localStorage
    if (data.length === 0) {
      const raw = localStorage.getItem('crm_markers_v1') || '[]';
      data = JSON.parse(raw);
    }

    const exportObj = {
      version: HF_VERSION,
      exportedAt: new Date().toISOString(),
      resources: data,
      syncQueue: JSON.parse(localStorage.getItem('syncQueue') || '[]'),
    };

    const blob = new Blob([JSON.stringify(exportObj, null, 2)], { type: 'application/json' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `humanity-forward-export-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    window.URL.revokeObjectURL(url);

    showToast('✅ Export erfolgreich!');
  } catch (error) {
    console.error('Export failed:', error);
    showToast('❌ Export fehlgeschlagen');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<span>💾</span> Alle Daten exportieren';
    }
  }
}

// ─── Sync Now ───
async function syncNow() {
  const btn = document.getElementById('sync-now-btn');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span>⏳</span> Synchronisiere...';
  }

  try {
    if (!navigator.onLine) {
      showToast('⚠️ Du bist offline. Synchronisation nicht möglich.');
      return;
    }

    if (window.API && window.API.syncQueue) {
      await window.API.syncQueue();
      await fetchStats();
      showToast('✅ Synchronisation abgeschlossen!');
    } else {
      // Fallback: try to re-register api-client
      showToast('⚠️ Sync-Modul nicht verfügbar. Lade Seite neu.');
    }
  } catch (error) {
    console.error('Sync failed:', error);
    showToast('❌ Synchronisation fehlgeschlagen');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<span>🔄</span> Jetzt synchronisieren';
    }
  }
}

// ─── Toast Notifications ───
function showToast(message, duration = 3000) {
  let toast = document.getElementById('toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toast';
    toast.style.cssText = `
      position: fixed;
      bottom: 2rem;
      left: 50%;
      transform: translateX(-50%);
      background: #333;
      color: white;
      padding: 0.75rem 1.5rem;
      border-radius: 8px;
      font-size: 0.95rem;
      z-index: 10000;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      transition: opacity 0.3s;
    `;
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.style.opacity = '1';
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => {
    toast.style.opacity = '0';
  }, duration);
}

// ─── Event Listeners ───
document.addEventListener('DOMContentLoaded', () => {
  updateConnectionStatus();
  fetchStats();

  const exportBtn = document.getElementById('export-all-btn');
  if (exportBtn) exportBtn.addEventListener('click', exportAllData);

  const syncBtn = document.getElementById('sync-now-btn');
  if (syncBtn) syncBtn.addEventListener('click', syncNow);

  // Refresh stats every 30 seconds
  setInterval(fetchStats, 30000);
});
