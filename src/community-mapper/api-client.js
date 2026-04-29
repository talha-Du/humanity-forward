// API Client für Community Resource Mapper
const API_BASE = window.location.hostname === 'localhost' 
  ? 'http://localhost:3000/api' 
  : '/api';

let isOnline = navigator.onLine;
let syncQueue = [];

// Online/Offline Events
window.addEventListener('online', () => { isOnline = true; syncQueueOperations(); });
window.addEventListener('offline', () => { isOnline = false; });

// API Helper
async function apiRequest(method, endpoint, data = null) {
  const options = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (data) options.body = JSON.stringify(data);
  
  try {
    const response = await fetch(`${API_BASE}${endpoint}`, options);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } catch (error) {
    console.warn(`API Error: ${error.message}`);
    throw error;
  }
}

// CRUD Operations
async function apiGetResources() {
  return apiRequest('GET', '/resources');
}

async function apiAddResource(resource) {
  return apiRequest('POST', '/resources', resource);
}

async function apiUpdateResource(id, resource) {
  return apiRequest('PUT', `/resources/${id}`, resource);
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
}

async function syncQueueOperations() {
  if (!isOnline || syncQueue.length === 0) return;
  
  console.log(`Syncing ${syncQueue.length} operations...`);
  
  for (const op of [...syncQueue]) {
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
      localStorage.setItem('syncQueue', JSON.stringify(syncQueue));
    } catch (error) {
      console.error('Sync failed for operation:', op, error);
      break;
    }
  }
  
  // Lade neu von API
  try {
    const resources = await apiGetResources();
    localStorage.setItem('crm_markers_v1', JSON.stringify(resources));
    return resources;
  } catch (e) {
    console.warn('Could not refresh from API after sync');
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
  isOnline: () => isOnline,
  syncQueue: syncQueueOperations,
  queue: queueOperation
};
