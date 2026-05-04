// API Client für Community Resource Mapper
// Erkenne ob wir über Tunnel laufen (loca.lt Domain)
const isTunnel = window.location.hostname.includes('loca.lt');
const API_BASE = isTunnel 
  ? 'https://cruel-clowns-drive.loca.lt/api'
  : (window.location.hostname === 'localhost' 
    ? 'http://localhost:3000/api' 
    : '/api');

let _isOnline = navigator.onLine;
let syncQueue = [];
let syncInProgress = false;

// Online/Offline Events
window.addEventListener('online', () => { 
  _isOnline = true; 
  updateSyncStatus('online', 'Online');
  syncQueueOperations(); 
});
window.addEventListener('offline', () => { 
  _isOnline = false; 
  updateSyncStatus('offline', 'Offline');
});

function updateSyncStatus(status, text) {
  const el = document.getElementById('sync-status');
  if (el) {
    el.className = 'sync-indicator ' + status;
    el.querySelector('.sync-text').textContent = text;
  }
}

// API Helper mit Retry-Logik
async function apiRequest(method, endpoint, data = null, retries = 2) {
  const options = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (data) options.body = JSON.stringify(data);
  
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(`${API_BASE}${endpoint}`, options);
      
      if (response.status === 404) {
        throw new Error('NOT_FOUND');
      }
      if (response.status === 500) {
        throw new Error('SERVER_ERROR');
      }
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      // DELETE returns 204 No Content
      if (response.status === 204) return null;
      
      return await response.json();
    } catch (error) {
      lastError = error;
      if (error.message === 'NOT_FOUND' || error.message === 'SERVER_ERROR') {
        throw error; // Don't retry these
      }
      if (attempt < retries) {
        await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
      }
    }
  }
  throw lastError;
}

// Backend-Daten → Frontend-Daten Mapping
function mapBackendToFrontend(resource) {
  return {
    id: String(resource.id),
    name: resource.name,
    type: resource.type,
    lat: resource.lat,
    lng: resource.lng,
    desc: resource.description || '',
    contact: resource.contact || '',
    lastUpdated: resource.lastUpdated
  };
}

function mapFrontendToBackend(marker) {
  return {
    name: marker.name,
    type: marker.type,
    lat: marker.lat,
    lng: marker.lng,
    description: marker.desc || '',
    contact: marker.contact || ''
  };
}

// CRUD Operations
async function apiGetResources() {
  const resources = await apiRequest('GET', '/resources');
  return Array.isArray(resources) ? resources.map(mapBackendToFrontend) : [];
}

async function apiAddResource(marker) {
  const data = mapFrontendToBackend(marker);
  const result = await apiRequest('POST', '/resources', data);
  return mapBackendToFrontend(result);
}

async function apiUpdateResource(id, updates) {
  const data = mapFrontendToBackend(updates);
  const result = await apiRequest('PUT', `/resources/${id}`, data);
  return result;
}

async function apiDeleteResource(id) {
  return apiRequest('DELETE', `/resources/${id}`);
}

// Sync Queue für Offline-Modus
function queueOperation(operation) {
  syncQueue.push({
    ...operation,
    timestamp: Date.now()
  });
  localStorage.setItem('syncQueue', JSON.stringify(syncQueue));
  updateSyncStatus('pending', `${syncQueue.length} ausstehend`);
}

async function syncQueueOperations() {
  if (!_isOnline || syncQueue.length === 0 || syncInProgress) return;
  
  syncInProgress = true;
  updateSyncStatus('syncing', 'Synchronisiere...');
  
  const queue = [...syncQueue];
  let synced = 0;
  let failed = 0;
  
  for (const op of queue) {
    try {
      switch (op.type) {
        case 'add':
          await apiAddResource(op.data);
          break;
        case 'update':
          await apiUpdateResource(op.id, op.data);
          break;
        case 'delete':
          await apiDeleteResource(op.id);
          break;
      }
      syncQueue = syncQueue.filter(q => q.timestamp !== op.timestamp);
      synced++;
    } catch (error) {
      console.error('Sync failed for operation:', op, error);
      failed++;
      // Bei NOT_FOUND oder SERVER_ERROR: Operation überspringen
      if (error.message === 'NOT_FOUND' || error.message === 'SERVER_ERROR') {
        syncQueue = syncQueue.filter(q => q.timestamp !== op.timestamp);
      }
    }
  }
  
  localStorage.setItem('syncQueue', JSON.stringify(syncQueue));
  
  if (failed > 0) {
    updateSyncStatus('pending', `${syncQueue.length} ausstehend`);
  } else if (syncQueue.length > 0) {
    updateSyncStatus('pending', `${syncQueue.length} ausstehend`);
  } else {
    updateSyncStatus('online', 'Synchronisiert');
  }
  
  syncInProgress = false;
  
  // Lade neu von API nach Sync
  try {
    const resources = await apiGetResources();
    localStorage.setItem('crm_markers_v1', JSON.stringify(resources));
    window.dispatchEvent(new CustomEvent('api:synced', { detail: { synced, failed, resources } }));
    return resources;
  } catch (e) {
    console.warn('Could not refresh from API after sync');
    window.dispatchEvent(new CustomEvent('api:synced', { detail: { synced, failed } }));
  }
}

// Initialisiere Queue aus localStorage
try {
  syncQueue = JSON.parse(localStorage.getItem('syncQueue') || '[]');
} catch { syncQueue = []; }

// Export
window.API = {
  getResources: apiGetResources,
  addResource: apiAddResource,
  updateResource: apiUpdateResource,
  deleteResource: apiDeleteResource,
  isOnline: () => _isOnline,
  syncQueue: syncQueueOperations,
  queue: queueOperation,
  getQueueLength: () => syncQueue.length,
  updateSyncStatus
};
