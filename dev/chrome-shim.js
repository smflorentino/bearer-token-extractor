// Chrome API shim for dev server
// Provides window.chrome so background.js and popup.js run unmodified in a regular browser page.

(function () {
  'use strict';

  const DEV_TAB_ID = 1;
  const DEV_EXTENSION_ID = 'dev-extension-id';

  // --- Storage mock (in-memory) ---
  const storageData = {};

  // --- Message bus ---
  const messageListeners = [];

  // --- WebRequest listener (stored by background.js, invoked by dev toolbar) ---
  let webRequestListener = null;

  window.chrome = {
    storage: {
      local: {
        get(keys, callback) {
          const result = {};
          const keyList = Array.isArray(keys) ? keys : [keys];
          for (const k of keyList) {
            if (k in storageData) result[k] = storageData[k];
          }
          callback(result);
        },
        set(items, callback) {
          Object.assign(storageData, items);
          if (callback) callback();
        }
      }
    },

    runtime: {
      id: DEV_EXTENSION_ID,

      onMessage: {
        addListener(fn) {
          messageListeners.push(fn);
        }
      },

      sendMessage(message, callback) {
        // Dispatch to all registered listeners asynchronously (matches Chrome behavior)
        setTimeout(() => {
          const sender = { id: DEV_EXTENSION_ID };
          let responded = false;

          const sendResponse = (response) => {
            if (responded) return;
            responded = true;
            if (callback) callback(response);
          };

          for (const listener of messageListeners) {
            const result = listener(message, sender, sendResponse);
            // If listener returns true, it will call sendResponse asynchronously
          }
        }, 0);

        // Return object with .catch for fire-and-forget pattern in background.js
        return { catch() {} };
      }
    },

    tabs: {
      query(opts, callback) {
        callback([{ id: DEV_TAB_ID }]);
      },
      update(tabId, props, callback) {
        console.log('[dev] chrome.tabs.update:', props.url);
        if (window.__devShowNotification) {
          window.__devShowNotification('Navigation: ' + props.url, 'info');
        }
        if (callback) callback();
      },
      onRemoved: {
        addListener() { /* no-op in dev */ }
      }
    },

    webRequest: {
      onBeforeSendHeaders: {
        addListener(fn) {
          webRequestListener = fn;
        }
      }
    },

    scripting: {
      executeScript() {
        // Proxy to the dev server's tenant API endpoint, passing token + URL from client state
        const state = window.__getInjectionState ? window.__getInjectionState() : {};
        return fetch('/api/tenants', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: state.token, url: state.url })
        })
          .then(res => res.json())
          .then(data => {
            if (data.tenants) {
              return [{ result: data.tenants }];
            }
            return [{ result: { error: data.error || 'No tenant data' } }];
          })
          .catch(err => {
            return [{ result: { error: err.message } }];
          });
      }
    }
  };

  // --- Client-side injection state (for tenant proxy) ---
  let lastInjectedToken = null;
  let lastInjectedUrl = null;

  // --- Token injection hook ---
  // Called by dev toolbar and WebSocket handler to simulate a captured request
  window.__devInjectToken = function (token, url) {
    if (!webRequestListener) {
      console.warn('[dev] No webRequest listener registered yet');
      return;
    }
    lastInjectedToken = token;
    lastInjectedUrl = url || 'https://cloud.uipath.com/api/dev-injected';
    webRequestListener({
      tabId: DEV_TAB_ID,
      url: lastInjectedUrl,
      requestHeaders: [
        { name: 'Authorization', value: 'Bearer ' + token }
      ]
    });
  };

  // Expose for tenant proxy
  window.__getInjectionState = function () {
    return { token: lastInjectedToken, url: lastInjectedUrl };
  };

  // --- Notification hook (set by dev toolbar) ---
  window.__devShowNotification = null;

  console.log('[dev] Chrome API shim loaded');
})();
