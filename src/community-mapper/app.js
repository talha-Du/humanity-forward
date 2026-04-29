(() => {
  'use strict';

  // ─── Config ───
  const STORAGE_KEY = 'crm_markers_v1';
  const TILE_DB_NAME = 'crm_tiles';
  const TILE_STORE = 'tiles';
  const MAP_CENTER = [52.52, 13.405];   // Berlin default
  const MAP_ZOOM = 13;

  const TYPE_META = {
    water:     { color: '#2980b9', icon: '💧' },
    food:      { color: '#e67e22', icon: '🍞' },
    health:    { color: '#c0392b', icon: '🏥' },
    education: { color: '#27ae60', icon: '📚' },
  };

  // ─── State ───
  let map, markersLayer;
  let markersData = [];
  let editingId = null;
  let tempLatLng = null;

  // ─── IndexedDB tile cache ───
  function openTileDB() {
    return new Promise((res, rej) => {
      const req = indexedDB.open(TILE_DB_NAME, 1);
      req.onerror = () => rej(req.error);
      req.onsuccess = () => res(req.result);
      req.onupgradeneeded = (e) => {
        e.target.result.createObjectStore(TILE_STORE);
      };
    });
  }

  async function cacheTile(url, blob) {
    try {
      const db = await openTileDB();
      const tx = db.transaction(TILE_STORE, 'readwrite');
      tx.objectStore(TILE_STORE).put(blob, url);
    } catch { /* silent */ }
  }

  async function getCachedTile(url) {
    try {
      const db = await openTileDB();
      const tx = db.transaction(TILE_STORE, 'readonly');
      const store = tx.objectStore(TILE_STORE);
      return new Promise((res) => {
        const req = store.get(url);
        req.onsuccess = () => res(req.result || null);
        req.onerror = () => res(null);
      });
    } catch { return null; }
  }

  // ─── Custom tile layer with offline caching ───
  L.TileLayer.Cached = L.TileLayer.extend({
    createTile(coords, done) {
      const url = this.getTileUrl(coords);
      const img = document.createElement('img');

      getCachedTile(url).then((blob) => {
        if (blob) {
          img.src = URL.createObjectURL(blob);
          done(null, img);
        } else {
          fetch(url)
            .then((r) => {
              if (!r.ok) throw new Error('fetch fail');
              return r.blob();
            })
            .then((blob) => {
              cacheTile(url, blob);
              img.src = URL.createObjectURL(blob);
              done(null, img);
            })
            .catch(() => {
              img.src = '';
              done(null, img);
            });
        }
      });

      return img;
    }
  });

  L.tileLayer.cached = (url, opts) => new L.TileLayer.Cached(url, opts);

  // ─── Persistence ───
  function saveMarkers() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(markersData));
  }

  async function loadMarkers() {
    try {
      // Versuche zuerst vom Backend zu laden
      if (window.API && window.API.isOnline()) {
        const resources = await window.API.getResources();
        markersData = resources;
        saveMarkers();
        return;
      }
    } catch (e) {
      console.warn('API load failed, using localStorage', e);
    }
    // Fallback zu localStorage
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) markersData = JSON.parse(raw);
    } catch { markersData = []; }
  }

  // ─── UI helpers ───
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  function openModal(title, showDelete = false) {
    $('#modal-title').textContent = title;
    $('#modal-delete').classList.toggle('hidden', !showDelete);
    $('#modal').classList.remove('hidden');
  }

  function closeModal() {
    $('#modal').classList.add('hidden');
    $('#marker-form').reset();
    editingId = null;
    tempLatLng = null;
  }

  // ─── Marker management ───
  function createPopupContent(m) {
    const meta = TYPE_META[m.type] || TYPE_META.water;
    return `
      <strong>${meta.icon} ${escapeHtml(m.name)}</strong><br>
      <em>${m.type.toUpperCase()}</em><br>
      ${escapeHtml(m.desc || 'No description.')}
    `;
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function getActiveTypes() {
    return Array.from($$('.filter-checkbox'))
      .filter((cb) => cb.checked)
      .map((cb) => cb.value);
  }

  function renderMarkers() {
    markersLayer.clearLayers();
    const query = $('#search-input').value.trim().toLowerCase();
    const activeTypes = getActiveTypes();

    markersData.forEach((m) => {
      if (!activeTypes.includes(m.type)) return;
      if (query && !m.name.toLowerCase().includes(query) && !(m.desc || '').toLowerCase().includes(query)) return;

      const meta = TYPE_META[m.type] || TYPE_META.water;
      const marker = L.circleMarker([m.lat, m.lng], {
        radius: 10,
        fillColor: meta.color,
        color: '#fff',
        weight: 2,
        opacity: 1,
        fillOpacity: 0.85,
      }).addTo(markersLayer);

      marker.bindPopup(createPopupContent(m));
      marker.on('click', () => {
        editingId = m.id;
        tempLatLng = null;
        $('#marker-name').value = m.name;
        $('#marker-type').value = m.type;
        $('#marker-desc').value = m.desc || '';
        openModal('Edit Resource', true);
      });
    });
  }

  async function addMarker(data) {
    const marker = {
      id: data.id || crypto.randomUUID(),
      lat: data.lat,
      lng: data.lng,
      name: data.name,
      type: data.type,
      desc: data.desc || '',
      contact: data.contact || '',
    };
    
    if (window.API && window.API.isOnline()) {
      try {
        await window.API.addResource(marker);
      } catch (e) {
        console.warn('API add failed, queuing for sync', e);
        window.API.queue({ type: 'add', data: marker });
      }
    } else {
      // Offline: in Queue legen
      if (window.API) window.API.queue({ type: 'add', data: marker });
    }
    
    markersData.push(marker);
    saveMarkers();
    renderMarkers();
  }

  async function updateMarker(id, data) {
    const idx = markersData.findIndex((m) => m.id === id);
    if (idx === -1) return;
    
    if (window.API && window.API.isOnline()) {
      try {
        await window.API.updateResource(id, data);
      } catch (e) {
        console.warn('API update failed, queuing for sync', e);
        window.API.queue({ type: 'update', id, data });
      }
    } else {
      if (window.API) window.API.queue({ type: 'update', id, data });
    }
    
    markersData[idx] = { ...markersData[idx], ...data };
    saveMarkers();
    renderMarkers();
  }

  async function deleteMarker(id) {
    if (window.API && window.API.isOnline()) {
      try {
        await window.API.deleteResource(id);
      } catch (e) {
        console.warn('API delete failed, queuing for sync', e);
        window.API.queue({ type: 'delete', id });
      }
    } else {
      if (window.API) window.API.queue({ type: 'delete', id });
    }
    
    markersData = markersData.filter((m) => m.id !== id);
    saveMarkers();
    renderMarkers();
  }

  // ─── Export / Import ───
  function exportJSON() {
    const blob = new Blob([JSON.stringify(markersData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `community-resources-${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function importJSON(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result);
        if (!Array.isArray(data)) throw new Error('Expected array');
        if (confirm(`Import ${data.length} markers? Existing markers will be kept.`)) {
          data.forEach((m) => {
            if (m.lat != null && m.lng != null && m.name && m.type) {
              // Avoid duplicates by id
              if (!markersData.find((x) => x.id === m.id)) {
                markersData.push({
                  id: m.id || crypto.randomUUID(),
                  lat: m.lat,
                  lng: m.lng,
                  name: m.name,
                  type: m.type,
                  desc: m.desc || '',
                });
              }
            }
          });
          saveMarkers();
          renderMarkers();
        }
      } catch (err) {
        alert('Invalid JSON file: ' + err.message);
      }
    };
    reader.readAsText(file);
  }

  // ─── Event wiring ───
  function bindEvents() {
    $('#modal-cancel').addEventListener('click', closeModal);

    $('#marker-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const name = $('#marker-name').value.trim();
      const type = $('#marker-type').value;
      const desc = $('#marker-desc').value.trim();
      if (!name) return;

      if (editingId) {
        updateMarker(editingId, { name, type, desc });
      } else if (tempLatLng) {
        addMarker({ lat: tempLatLng.lat, lng: tempLatLng.lng, name, type, desc });
      }
      closeModal();
    });

    $('#modal-delete').addEventListener('click', () => {
      if (editingId && confirm('Delete this resource?')) {
        deleteMarker(editingId);
        closeModal();
      }
    });

    $('#export-btn').addEventListener('click', exportJSON);

    $('#import-input').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) importJSON(file);
      e.target.value = '';
    });

    $('#search-input').addEventListener('input', renderMarkers);

    $$('.filter-checkbox').forEach((cb) => {
      cb.addEventListener('change', renderMarkers);
    });
  }

  // ─── Init ───
  function initMap() {
    map = L.map('map', { tap: false }).setView(MAP_CENTER, MAP_ZOOM);

    L.tileLayer.cached('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://osm.org">OpenStreetMap</a> contributors',
      maxZoom: 19,
      subdomains: 'abc',
    }).addTo(map);

    markersLayer = L.layerGroup().addTo(map);

    map.on('click', (e) => {
      editingId = null;
      tempLatLng = e.latlng;
      $('#marker-form').reset();
      openModal('Add Resource', false);
    });
  }

  async function init() {
    await loadMarkers();
    initMap();
    renderMarkers();
    bindEvents();
    
    // Sync wenn wir online kommen
    if (window.API) {
      await window.API.syncQueue();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
