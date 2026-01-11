/**
 * Service Worker Registration and Management
 * Handles service worker lifecycle and provides utilities for caching and offline support
 */

const isLocalhost = Boolean(
  window.location.hostname === 'localhost' ||
  window.location.hostname === '[::1]' ||
  window.location.hostname.match(
    /^127(?:\.(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)){3}$/
  )
);

/**
 * Register service worker
 */
export function register(config = {}) {
  if ('serviceWorker' in navigator) {
    const publicUrl = new URL(process.env.PUBLIC_URL || '', window.location.href);
    
    if (publicUrl.origin !== window.location.origin) {
      return;
    }

    window.addEventListener('load', () => {
      const swUrl = `${process.env.PUBLIC_URL || ''}/sw.js`;

      if (isLocalhost) {
        checkValidServiceWorker(swUrl, config);
        navigator.serviceWorker.ready.then(() => {
          console.log('Service Worker: Ready in development mode');
        });
      } else {
        registerValidSW(swUrl, config);
      }
    });
  }
}

/**
 * Register valid service worker
 */
function registerValidSW(swUrl, config) {
  navigator.serviceWorker
    .register(swUrl)
    .then((registration) => {
      console.log('Service Worker: Registered successfully');
      
      registration.onupdatefound = () => {
        const installingWorker = registration.installing;
        
        if (installingWorker == null) {
          return;
        }
        
        installingWorker.onstatechange = () => {
          if (installingWorker.state === 'installed') {
            if (navigator.serviceWorker.controller) {
              console.log('Service Worker: New content available, please refresh');
              
              if (config && config.onUpdate) {
                config.onUpdate(registration);
              }
            } else {
              console.log('Service Worker: Content cached for offline use');
              
              if (config && config.onSuccess) {
                config.onSuccess(registration);
              }
            }
          }
        };
      };
    })
    .catch((error) => {
      console.error('Service Worker: Registration failed', error);
    });
}

/**
 * Check if service worker is valid
 */
function checkValidServiceWorker(swUrl, config) {
  fetch(swUrl, {
    headers: { 'Service-Worker': 'script' }
  })
    .then((response) => {
      const contentType = response.headers.get('content-type');
      
      if (
        response.status === 404 ||
        (contentType != null && contentType.indexOf('javascript') === -1)
      ) {
        navigator.serviceWorker.ready.then((registration) => {
          registration.unregister().then(() => {
            window.location.reload();
          });
        });
      } else {
        registerValidSW(swUrl, config);
      }
    })
    .catch(() => {
      console.log('Service Worker: No internet connection, running in offline mode');
    });
}

/**
 * Unregister service worker
 */
export function unregister() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.ready
      .then((registration) => {
        registration.unregister();
        console.log('Service Worker: Unregistered');
      })
      .catch((error) => {
        console.error('Service Worker: Unregistration failed', error);
      });
  }
}

/**
 * Update service worker
 */
export function update() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.ready
      .then((registration) => {
        registration.update();
        console.log('Service Worker: Update requested');
      })
      .catch((error) => {
        console.error('Service Worker: Update failed', error);
      });
  }
}

/**
 * Skip waiting for new service worker
 */
export function skipWaiting() {
  if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
    navigator.serviceWorker.controller.postMessage({ type: 'SKIP_WAITING' });
  }
}

/**
 * Cache specific URLs
 */
export function cacheUrls(urls) {
  if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
    navigator.serviceWorker.controller.postMessage({
      type: 'CACHE_URLS',
      urls
    });
  }
}

/**
 * Check if app is running offline
 */
export function isOffline() {
  return !navigator.onLine;
}

/**
 * Add offline/online event listeners
 */
export function addNetworkListeners(onOnline, onOffline) {
  window.addEventListener('online', onOnline);
  window.addEventListener('offline', onOffline);
  
  return () => {
    window.removeEventListener('online', onOnline);
    window.removeEventListener('offline', onOffline);
  };
}

/**
 * React hook for service worker management
 */
export function useServiceWorker() {
  const [isOnline, setIsOnline] = React.useState(navigator.onLine);
  const [swRegistration, setSwRegistration] = React.useState(null);
  const [updateAvailable, setUpdateAvailable] = React.useState(false);

  React.useEffect(() => {
    // Register service worker
    register({
      onSuccess: (registration) => {
        setSwRegistration(registration);
        console.log('Service Worker: Registration successful');
      },
      onUpdate: (registration) => {
        setSwRegistration(registration);
        setUpdateAvailable(true);
        console.log('Service Worker: Update available');
      }
    });

    // Network status listeners
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    
    const removeListeners = addNetworkListeners(handleOnline, handleOffline);
    
    return removeListeners;
  }, []);

  const updateApp = React.useCallback(() => {
    if (swRegistration && swRegistration.waiting) {
      swRegistration.waiting.postMessage({ type: 'SKIP_WAITING' });
      window.location.reload();
    }
  }, [swRegistration]);

  const cachePages = React.useCallback((urls) => {
    cacheUrls(urls);
  }, []);

  return {
    isOnline,
    updateAvailable,
    updateApp,
    cachePages,
    registration: swRegistration
  };
}

/**
 * React hook for offline detection
 */
export function useOfflineDetection() {
  const [isOnline, setIsOnline] = React.useState(navigator.onLine);
  const [wasOffline, setWasOffline] = React.useState(false);

  React.useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      if (wasOffline) {
        console.log('App: Back online');
        // Trigger data refresh or sync
      }
    };

    const handleOffline = () => {
      setIsOnline(false);
      setWasOffline(true);
      console.log('App: Gone offline');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [wasOffline]);

  return {
    isOnline,
    wasOffline,
    isOffline: !isOnline
  };
}

/**
 * Preload critical resources
 */
export function preloadCriticalResources() {
  const criticalUrls = [
    '/api/recommendations',
    '/api/analytics/dashboard',
    '/css/main.css',
    '/js/main.js'
  ];

  cacheUrls(criticalUrls);
}

export default {
  register,
  unregister,
  update,
  skipWaiting,
  cacheUrls,
  isOffline,
  addNetworkListeners,
  useServiceWorker,
  useOfflineDetection,
  preloadCriticalResources
};
