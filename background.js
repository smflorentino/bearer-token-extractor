// Store captured tokens per tab (key is token, value is token info)
const tokens = new Map();

// Store cleanup timers per tab
const cleanupTimers = new Map();

// Decode JWT token to get payload
function decodeJWT(token) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const payload = parts[1];
    const decoded = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
    return decoded;
  } catch (e) {
    return null;
  }
}

// Determine token type based on URL and payload
function getTokenType(url, payload) {
  // Check if URL is from a UiPath identity provider (id-*.uipath.com or account.uipath.com)
  if (url.includes('account.uipath.com') || /id(-\w+)?\.uipath\.com/.test(url)) {
    return 'IdToken';
  }

  // Check client_id in payload
  if (payload && payload.client_id) {
    if (payload.client_id === '73ba6224-d591-4a4f-b3ab-508e646f2932') {
      return 'PortalPkceToken';
    } else if (payload.client_id === '1119a927-10ab-4543-bd1a-ad6bfbbc27f4') {
      return 'UserAccessToken';
    }
  }

  return 'Unknown';
}

// Check if token is expired
function isTokenExpired(payload) {
  if (!payload || !payload.exp) {
    return false; // Can't determine expiration
  }
  const now = Math.floor(Date.now() / 1000);
  return payload.exp < now;
}

// Get time until token expires (in seconds)
function getTimeUntilExpiry(payload) {
  if (!payload || !payload.exp) {
    return null;
  }
  const now = Math.floor(Date.now() / 1000);
  return payload.exp - now;
}

// Setup auto-cleanup timer for a tab
function setupAutoCleanup(tabId) {
  chrome.storage.local.get(['autoCleanupEnabled', 'autoCleanupMinutes'], (result) => {
    if (result.autoCleanupEnabled) {
      // Clear existing timer if any
      if (cleanupTimers.has(tabId)) {
        clearTimeout(cleanupTimers.get(tabId));
      }

      const minutes = result.autoCleanupMinutes || 15;
      const timer = setTimeout(() => {
        tokens.delete(tabId);
        cleanupTimers.delete(tabId);
        console.log(`Auto-cleaned tokens for tab ${tabId} after ${minutes} minutes`);
      }, minutes * 60 * 1000);

      cleanupTimers.set(tabId, timer);
    }
  });
}

// Listen for web requests
chrome.webRequest.onBeforeSendHeaders.addListener(
  (details) => {
    if (details.requestHeaders) {
      for (const header of details.requestHeaders) {
        if (header.name.toLowerCase() === 'authorization') {
          const value = header.value || '';
          // Check if it's a bearer token
          if (value.toLowerCase().startsWith('bearer ')) {
            const token = value.substring(7); // Remove 'Bearer ' prefix

            // Store token for this tab
            if (!tokens.has(details.tabId)) {
              tokens.set(details.tabId, new Map());
            }

            const tabTokens = tokens.get(details.tabId);

            // Only add if not already present (using token as key for uniqueness)
            if (!tabTokens.has(token)) {
              const payload = decodeJWT(token);
              const tokenType = getTokenType(details.url, payload);
              const expired = isTokenExpired(payload);
              const expiresIn = getTimeUntilExpiry(payload);

              tabTokens.set(token, {
                token: token,
                url: details.url,
                timestamp: new Date().toISOString(),
                type: tokenType,
                payload: payload,
                expired: expired,
                expiresIn: expiresIn
              });

              // Setup auto-cleanup timer when first token is captured
              setupAutoCleanup(details.tabId);

              // Send notification to popup that a new token was captured
              chrome.runtime.sendMessage({
                action: 'tokenCaptured',
                tabId: details.tabId,
                tokenCount: tabTokens.size
              }).catch(() => {
                // Popup might not be open, ignore error
              });
            }
          }
        }
      }
    }
  },
  { urls: ["<all_urls>"] },
  ["requestHeaders"]
);

// Clean up tokens when tab is closed
chrome.tabs.onRemoved.addListener((tabId) => {
  tokens.delete(tabId);
  // Clear cleanup timer
  if (cleanupTimers.has(tabId)) {
    clearTimeout(cleanupTimers.get(tabId));
    cleanupTimers.delete(tabId);
  }
});

// Validate URL to prevent dangerous protocols
function isValidUrl(url) {
  try {
    const urlObj = new URL(url);
    // Only allow http and https protocols
    if (!['http:', 'https:'].includes(urlObj.protocol)) {
      return false;
    }
    return true;
  } catch (e) {
    return false;
  }
}

// Handle messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // Validate sender - only accept messages from extension pages
  if (!sender.id || sender.id !== chrome.runtime.id) {
    console.warn('Rejected message from unauthorized sender');
    sendResponse({ success: false, error: 'Unauthorized sender' });
    return false;
  }

  if (request.action === 'getTokens') {
    const tabId = request.tabId;
    const tabTokens = tokens.get(tabId) || new Map();
    // Convert Map to array for sending
    const tokensArray = Array.from(tabTokens.values());
    sendResponse({ tokens: tokensArray });
  } else if (request.action === 'clearTokens') {
    const tabId = request.tabId;
    tokens.delete(tabId);
    sendResponse({ success: true });
  } else if (request.action === 'navigateToUrl') {
    // Validate URL before navigation
    if (!isValidUrl(request.url)) {
      console.error('Invalid or dangerous URL:', request.url);
      sendResponse({ success: false, error: 'Invalid URL - only HTTP/HTTPS allowed' });
      return false;
    }
    chrome.tabs.update(request.tabId, { url: request.url }, () => {
      sendResponse({ success: true });
    });
    return true; // Will respond asynchronously
  } else if (request.action === 'getSettings') {
    chrome.storage.local.get(['autoCleanupEnabled', 'autoCleanupMinutes', 'tokenMaskingEnabled'], (result) => {
      sendResponse({
        autoCleanupEnabled: result.autoCleanupEnabled || false,
        autoCleanupMinutes: result.autoCleanupMinutes || 15,
        tokenMaskingEnabled: result.tokenMaskingEnabled || false
      });
    });
    return true;
  } else if (request.action === 'saveSettings') {
    chrome.storage.local.set(request.settings, () => {
      sendResponse({ success: true });
    });
    return true;
  } else if (request.action === 'fetchOrgInfo') {
    chrome.scripting.executeScript({
      target: { tabId: request.tabId },
      world: 'MAIN',
      func: () => {
        try {
          const orgData = PortalShell.AccountAndTenants.getCachedAccount();
          if (orgData && orgData.tenants) {
            const tenants = orgData.tenants.map(t => ({
              tenantName: t.tenantName || t.name || 'Unknown',
              tenantId: t.tenantId || t.id || 'Unknown'
            }));
            const organization = orgData.organization ? {
              name: orgData.organization.name || 'Unknown',
              id: orgData.organization.id || 'Unknown'
            } : null;
            return { tenants, organization };
          }
          return null;
        } catch (e) {
          return { error: e.message };
        }
      }
    }).then((results) => {
      const result = results && results[0] && results[0].result;
      if (result && !result.error) {
        sendResponse({ success: true, tenants: result.tenants, organization: result.organization });
      } else if (result && result.error) {
        sendResponse({ success: false, error: result.error });
      } else {
        sendResponse({ success: false, error: 'No tenant data found' });
      }
    }).catch((error) => {
      sendResponse({ success: false, error: error.message });
    });
    return true;
  }
  return true;
});
