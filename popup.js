function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

let currentTabId = null;
let lastTokenCount = 0;
let settings = {
  autoCleanupEnabled: false,
  autoCleanupMinutes: 15,
  tokenMaskingEnabled: false
};

// Get current tab ID
chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  if (tabs[0]) {
    currentTabId = tabs[0].id;
    loadSettings();
    loadTokens();
  }
});

// Load settings
function loadSettings() {
  chrome.runtime.sendMessage({ action: 'getSettings' }, (response) => {
    if (response) {
      settings = response;
      document.getElementById('autoCleanupEnabled').checked = settings.autoCleanupEnabled;
      document.getElementById('autoCleanupMinutes').value = settings.autoCleanupMinutes;
      document.getElementById('tokenMaskingEnabled').checked = settings.tokenMaskingEnabled;
      updateAutoCleanupVisibility();
    }
  });
}

// Update visibility of auto-cleanup time input
function updateAutoCleanupVisibility() {
  const enabled = document.getElementById('autoCleanupEnabled').checked;
  const container = document.getElementById('autoCleanupTimeContainer');
  container.style.display = enabled ? 'block' : 'none';
}

// Mask token (show first 8 and last 8 characters)
function maskToken(token) {
  if (!settings.tokenMaskingEnabled || token.length <= 16) {
    return token;
  }
  const firstPart = token.substring(0, 8);
  const lastPart = token.substring(token.length - 8);
  const middleLength = token.length - 16;
  return `${firstPart}${'*'.repeat(Math.min(middleLength, 20))}${lastPart}`;
}

// Format expiration time
function formatExpirationTime(expiresIn) {
  if (expiresIn === null || expiresIn === undefined) {
    return null;
  }

  if (expiresIn < 0) {
    return { text: 'EXPIRED', class: 'token-expired' };
  }

  const minutes = Math.floor(expiresIn / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  // Warn if expiring in less than 1 hour
  if (expiresIn < 3600) {
    return { text: `Expires in ${minutes}m`, class: 'token-expiring-soon' };
  }

  if (days > 0) {
    return { text: `${days}d ${hours % 24}h`, class: '' };
  } else if (hours > 0) {
    return { text: `${hours}h ${minutes % 60}m`, class: '' };
  } else {
    return { text: `${minutes}m`, class: '' };
  }
}

// Listen for token captured messages from background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'tokenCaptured' && message.tabId === currentTabId) {
    showNotification(`Bearer token captured! (${message.tokenCount} total)`, 'success');
    loadTokens();
  }
});

// Show notification function
function showNotification(message, type = 'info') {
  const notification = document.getElementById('notification');
  notification.textContent = message;
  notification.className = `notification ${type}`;

  // Auto-hide after 3 seconds
  setTimeout(() => {
    notification.className = 'notification';
  }, 3000);
}

// Function to navigate to URL
function navigateToUrl(url) {
  // Clear old tokens before navigating to new URL
  chrome.runtime.sendMessage({
    action: 'clearTokens',
    tabId: currentTabId
  }, () => {
    // Navigate to the new URL
    chrome.runtime.sendMessage({
      action: 'navigateToUrl',
      tabId: currentTabId,
      url: url
    }, (response) => {
      if (response && response.success) {
        // Reload tokens display
        loadTokens();
      }
    });
  });
}

// Environment buttons handler
document.querySelectorAll('.env-btn').forEach(btn => {
  btn.addEventListener('click', (e) => {
    const url = e.target.dataset.url;
    navigateToUrl(url);
  });
});

// Navigate button handler
document.getElementById('navigateBtn').addEventListener('click', () => {
  const url = document.getElementById('urlInput').value.trim();
  if (!url) {
    alert('Please enter a URL');
    return;
  }

  // Add https:// if no protocol specified
  let finalUrl = url;
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    finalUrl = 'https://' + url;
  }

  document.getElementById('urlInput').value = '';
  navigateToUrl(finalUrl);
});

// Clear button handler
document.getElementById('clearBtn').addEventListener('click', () => {
  if (confirm('Clear all captured tokens?')) {
    chrome.runtime.sendMessage({
      action: 'clearTokens',
      tabId: currentTabId
    }, () => {
      loadTokens();
      displayOrganization(null);
    });
  }
});

// Load and display tokens
function loadTokens() {
  if (!currentTabId) return;

  chrome.runtime.sendMessage({
    action: 'getTokens',
    tabId: currentTabId
  }, (response) => {
    const tokensList = document.getElementById('tokensList');
    const noTokens = document.getElementById('noTokens');

    if (!response || !response.tokens || response.tokens.length === 0) {
      tokensList.innerHTML = '';
      noTokens.classList.add('visible');
      return;
    }

    noTokens.classList.remove('visible');

    // Sort tokens by priority: UserAccessToken > PortalPkceToken > IdToken > Unknown
    const tokenPriority = {
      'UserAccessToken': 1,
      'PortalPkceToken': 2,
      'IdToken': 3,
      'Unknown': 4
    };

    const sortedTokens = response.tokens.sort((a, b) => {
      return tokenPriority[a.type] - tokenPriority[b.type];
    });

    tokensList.innerHTML = sortedTokens.map((item, index) => {
      const date = new Date(item.timestamp);
      const timeStr = date.toLocaleTimeString();
      const displayToken = maskToken(item.token);
      const expiration = formatExpirationTime(item.expiresIn);

      let expirationHtml = '';
      if (expiration) {
        expirationHtml = `<span class="${expiration.class}">${expiration.text}</span>`;
      }

      // Find original index in response.tokens for copy functionality
      const originalIndex = response.tokens.findIndex(t => t.token === item.token);

      return `
        <div class="token-item ${item.expired ? 'expired' : ''}">
          <div class="token-header">
            <span class="timestamp">${timeStr}${expirationHtml}</span>
            <button class="copy-btn" data-index="${originalIndex}">Copy Token</button>
          </div>
          <div class="token-metadata">
            <span class="token-type ${item.type}">${item.type}</span>
            <span class="token-url">${item.url}</span>
          </div>
          <div class="token-value ${settings.tokenMaskingEnabled ? 'token-masked' : ''}">${displayToken}</div>
        </div>
      `;
    }).join('');

    // Add copy button handlers
    document.querySelectorAll('.copy-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const index = parseInt(e.target.dataset.index);
        const token = response.tokens[index].token;

        navigator.clipboard.writeText(token).then(() => {
          e.target.textContent = 'Copied!';
          e.target.classList.add('copied');
          setTimeout(() => {
            e.target.textContent = 'Copy Token';
            e.target.classList.remove('copied');
          }, 2000);
        });
      });
    });
  });
}

// Reload tokens every 2 seconds
setInterval(loadTokens, 2000);

// Allow Enter key to navigate
document.getElementById('urlInput').addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    document.getElementById('navigateBtn').click();
  }
});

// Settings modal handlers
document.getElementById('settingsBtn').addEventListener('click', () => {
  document.getElementById('settingsModal').classList.add('visible');
});

document.getElementById('closeSettings').addEventListener('click', () => {
  document.getElementById('settingsModal').classList.remove('visible');
});

document.getElementById('autoCleanupEnabled').addEventListener('change', updateAutoCleanupVisibility);

document.getElementById('saveSettings').addEventListener('click', () => {
  const newSettings = {
    autoCleanupEnabled: document.getElementById('autoCleanupEnabled').checked,
    autoCleanupMinutes: parseInt(document.getElementById('autoCleanupMinutes').value),
    tokenMaskingEnabled: document.getElementById('tokenMaskingEnabled').checked
  };

  chrome.runtime.sendMessage({
    action: 'saveSettings',
    settings: newSettings
  }, (response) => {
    if (response && response.success) {
      settings = newSettings;
      document.getElementById('settingsModal').classList.remove('visible');
      showNotification('Settings saved successfully', 'success');
      loadTokens(); // Reload to apply masking changes
    }
  });
});

// Close modal on background click
document.getElementById('settingsModal').addEventListener('click', (e) => {
  if (e.target.id === 'settingsModal') {
    document.getElementById('settingsModal').classList.remove('visible');
  }
});

// Fetch tenants button handler
document.getElementById('fetchTenantsBtn').addEventListener('click', () => {
  const btn = document.getElementById('fetchTenantsBtn');
  btn.textContent = 'Fetching...';
  btn.disabled = true;

  chrome.runtime.sendMessage({
    action: 'fetchTenants',
    tabId: currentTabId
  }, (response) => {
    btn.textContent = 'Fetch Account Info';
    btn.disabled = false;

    if (response && response.success && response.tenants) {
      if (response.tenants.error) {
        showNotification('Error: ' + response.tenants.error, 'info');
        return;
      }
      displayOrganization(response.organization);
      displayTenants(response.tenants);
      const orgMsg = response.organization ? ` for ${response.organization.name}` : '';
      showNotification(`Found ${response.tenants.length} tenant(s)${orgMsg}`, 'success');
    } else {
      const errorMsg = response?.error || 'Could not fetch account info. Make sure you are on a UiPath portal page.';
      showNotification(errorMsg, 'info');
    }
  });
});

// Display organization info
function displayOrganization(org) {
  const orgInfo = document.getElementById('orgInfo');
  if (!org) {
    orgInfo.innerHTML = '';
    return;
  }

  orgInfo.innerHTML = `
    <div class="org-item">
      <div class="org-label">Organization</div>
      <div class="org-name">${escapeHtml(org.name)}</div>
      <div class="org-id-row">
        <span class="org-id">${escapeHtml(org.id)}</span>
        <button class="copy-org-btn" data-org-id="${escapeHtml(org.id)}">Copy ID</button>
      </div>
    </div>
  `;

  orgInfo.querySelector('.copy-org-btn').addEventListener('click', (e) => {
    const orgId = e.target.dataset.orgId;
    navigator.clipboard.writeText(orgId).then(() => {
      e.target.textContent = 'Copied!';
      e.target.classList.add('copied');
      setTimeout(() => {
        e.target.textContent = 'Copy ID';
        e.target.classList.remove('copied');
      }, 2000);
    });
  });
}

// Display tenants
function displayTenants(tenants) {
  const tenantsList = document.getElementById('tenantsList');
  const noTenants = document.getElementById('noTenants');

  if (!tenants || tenants.length === 0) {
    tenantsList.innerHTML = '';
    noTenants.classList.add('visible');
    return;
  }

  noTenants.classList.remove('visible');

  tenantsList.innerHTML = `
    <div class="tenants-label">Tenants</div>
  ` + tenants.map((tenant, index) => `
    <div class="tenant-item">
      <div class="tenant-name">${escapeHtml(tenant.tenantName)}</div>
      <div class="tenant-id-row">
        <span class="tenant-id">${escapeHtml(tenant.tenantId)}</span>
        <button class="copy-tenant-btn" data-tenant-id="${escapeHtml(tenant.tenantId)}">Copy ID</button>
      </div>
    </div>
  `).join('');

  // Add copy button handlers for tenant IDs
  document.querySelectorAll('.copy-tenant-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const tenantId = e.target.dataset.tenantId;
      navigator.clipboard.writeText(tenantId).then(() => {
        e.target.textContent = 'Copied!';
        e.target.classList.add('copied');
        setTimeout(() => {
          e.target.textContent = 'Copy ID';
          e.target.classList.remove('copied');
        }, 2000);
      });
    });
  });
}
