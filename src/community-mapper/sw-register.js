// Service Worker Registration for Humanity Forward - Community Mapper
// This script registers the service worker to enable offline functionality

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    const swPath = './service-worker.js';

    navigator.serviceWorker
      .register(swPath)
      .then((registration) => {
        console.log('[SW Register] Service Worker registered:', registration.scope);

        // Listen for updates
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          console.log('[SW Register] New Service Worker installing...');

          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              // New SW is waiting - show update notification
              console.log('[SW Register] New version available, waiting for activation');
              showUpdateNotification(newWorker);
            }
          });
        });

        // Check for updates periodically
        setInterval(() => {
          console.log('[SW Register] Checking for updates...');
          registration.update().catch((err) => {
            console.warn('[SW Register] Update check failed:', err);
          });
        }, 60 * 60 * 1000); // Check every hour

        // Register for background sync if supported
        registerBackgroundSync(registration);

        // Register for push notifications if supported
        registerPushNotifications(registration);
      })
      .catch((error) => {
        console.error('[SW Register] Service Worker registration failed:', error);
      });

    // Listen for messages from service worker
    navigator.serviceWorker.addEventListener('message', (event) => {
      console.log('[SW Register] Message from SW:', event.data);

      if (event.data && event.data.type === 'SYNC_RESOURCES') {
        syncPendingResources();
      }
    });

    // Handle connection status changes
    window.addEventListener('online', () => {
      console.log('[SW Register] App is online');
      updateConnectionStatus(true);
      triggerBackgroundSync();
    });

    window.addEventListener('offline', () => {
      console.log('[SW Register] App is offline');
      updateConnectionStatus(false);
    });
  });
} else {
  console.warn('[SW Register] Service Workers not supported in this browser');
}

// ==================== BACKGROUND SYNC ====================
function registerBackgroundSync(registration) {
  if ('sync' in registration) {
    registration.sync
      .register('resource-sync')
      .then(() => {
        console.log('[SW Register] Background sync registered');
      })
      .catch((err) => {
        console.warn('[SW Register] Background sync registration failed:', err);
      });
  } else {
    console.warn('[SW Register] Background sync not supported');
  }

  // Register periodic sync if supported
  if ('periodicSync' in registration) {
    registration.periodicSync
      .register('resource-sync', {
        minInterval: 24 * 60 * 60 * 1000 // Once per day
      })
      .then(() => {
        console.log('[SW Register] Periodic sync registered');
      })
      .catch((err) => {
        console.warn('[SW Register] Periodic sync registration failed:', err);
      });
  }
}

function triggerBackgroundSync() {
  if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
    navigator.serviceWorker.controller.postMessage({
      type: 'REGISTER_SYNC'
    });
  }
}

// ==================== PUSH NOTIFICATIONS ====================
function registerPushNotifications(registration) {
  if (!('PushManager' in window)) {
    console.warn('[SW Register] Push notifications not supported');
    return;
  }

  // Check current subscription status
  registration.pushManager.getSubscription().then((subscription) => {
    if (subscription) {
      console.log('[SW Register] Already subscribed to push notifications');
    } else {
      console.log('[SW Register] Not subscribed to push notifications (optional)');
    }
  });
}

// Request push notification permission (optional - call when user enables it)
async function subscribeToPushNotifications(registration) {
  if (!('PushManager' in window)) {
    console.warn('[SW Register] Push notifications not supported');
    return;
  }

  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      console.warn('[SW Register] Push notification permission denied');
      return;
    }

    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(
        'BEl62i0nM0w8K0b9lZ8L1m2n3o4p5q6r7s8t9u0v1w2x3y4z5A6B7C8D9E0F1G2' // Replace with your actual VAPID public key
      )
    });

    console.log('[SW Register] Push subscription created:', subscription);
    // Send subscription to server
    await sendSubscriptionToServer(subscription);
  } catch (error) {
    console.error('[SW Register] Push subscription failed:', error);
  }
}

// Convert VAPID key string to Uint8Array
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/\-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }

  return outputArray;
}

// Send subscription to your server
async function sendSubscriptionToServer(subscription) {
  // Placeholder - implement when you have a push notification server
  console.log('[SW Register] Push subscription:', JSON.stringify(subscription));
  // fetch('/api/subscribe', {
  //   method: 'POST',
  //   headers: { 'Content-Type': 'application/json' },
  //   body: JSON.stringify(subscription)
  // });
}

// ==================== UPDATE NOTIFICATION ====================
function showUpdateNotification(worker) {
  console.log('[SW Register] Showing update notification');
  // You can implement a UI notification here
  if (confirm('A new version of the app is available. Reload to update?')) {
    worker.postMessage({ type: 'SKIP_WAITING' });
    window.location.reload();
  }
}

// ==================== CONNECTION STATUS ====================
function updateConnectionStatus(isOnline) {
  const statusElement = document.getElementById('connection-status');
  if (statusElement) {
    const dot = statusElement.querySelector('.status-dot');
    if (dot) {
      dot.className = 'status-dot ' + (isOnline ? 'online' : 'offline');
    }
    const text = statusElement.childNodes[statusElement.childNodes.length - 1];
    if (text) {
      text.textContent = isOnline ? ' Online' : ' Offline';
    }
  }

  document.body.classList.toggle('offline', !isOnline);
}

// Initialize connection status on load
function initConnectionStatus() {
  updateConnectionStatus(navigator.onLine);
}

// ==================== RESOURCE SYNC ====================
function syncPendingResources() {
  console.log('[SW Register] Syncing pending resources...');
  // Implement your sync logic here
  // e.g., send pending changes to server when back online
}

// ==================== CACHE MANAGEMENT ====================
// Clear tile cache (useful when map data needs refresh)
async function clearTileCache() {
  if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
    navigator.serviceWorker.controller.postMessage({
      type: 'CLEAR_TILE_CACHE'
    });
  }
}

// ==================== INSTALL PROMPT (PWA Install) ====================
let deferredPrompt = null;

window.addEventListener('beforeinstallprompt', (event) => {
  console.log('[SW Register] Install prompt available');
  event.preventDefault();
  deferredPrompt = event;

  // You can show a custom install button here
  const installButton = document.getElementById('install-button');
  if (installButton) {
    installButton.style.display = 'block';
    installButton.addEventListener('click', promptInstall);
  }
});

window.addEventListener('appinstalled', () => {
  console.log('[SW Register] App was installed');
  deferredPrompt = null;

  const installButton = document.getElementById('install-button');
  if (installButton) {
    installButton.style.display = 'none';
  }
});

function promptInstall() {
  if (deferredPrompt) {
    deferredPrompt.prompt();
    deferredPrompt.userChoice.then((choiceResult) => {
      if (choiceResult.outcome === 'accepted') {
        console.log('[SW Register] User accepted install');
      } else {
        console.log('[SW Register] User dismissed install');
      }
      deferredPrompt = null;
    });
  }
}

// Initialize on load
window.addEventListener('DOMContentLoaded', initConnectionStatus);
