// Dev toolbar logic: fetch() paste handling, sample token generation, WebSocket client

(function () {
  'use strict';

  // --- Sample JWT generator ---
  // Creates a valid-structure JWT (not cryptographically signed, but decodable)
  function createSampleJWT(payload) {
    const header = { alg: 'RS256', typ: 'JWT' };
    const encode = (obj) => btoa(JSON.stringify(obj)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
    return encode(header) + '.' + encode(payload) + '.fake-signature-for-dev';
  }

  const SAMPLE_TOKENS = {
    UserAccessToken: {
      token: () => createSampleJWT({
        sub: 'dev-user-123',
        client_id: '1119a927-10ab-4543-bd1a-ad6bfbbc27f4',
        exp: Math.floor(Date.now() / 1000) + 3600,
        iat: Math.floor(Date.now() / 1000),
        scope: 'openid profile email',
        iss: 'https://id.uipath.com'
      }),
      url: 'https://cloud.uipath.com/api/account/sample'
    },
    PortalPkceToken: {
      token: () => createSampleJWT({
        sub: 'dev-user-123',
        client_id: '73ba6224-d591-4a4f-b3ab-508e646f2932',
        exp: Math.floor(Date.now() / 1000) + 7200,
        iat: Math.floor(Date.now() / 1000),
        scope: 'openid profile',
        iss: 'https://id.uipath.com'
      }),
      url: 'https://cloud.uipath.com/portal_/api/sample'
    },
    IdToken: {
      token: () => createSampleJWT({
        sub: 'dev-user-123',
        exp: Math.floor(Date.now() / 1000) + 1800,
        iat: Math.floor(Date.now() / 1000),
        iss: 'https://id.uipath.com',
        aud: 'uipath-portal'
      }),
      url: 'https://id.uipath.com/oauth/token'
    }
  };

  // --- Client-side fetch parser (regex-based) ---
  function parseFetchClient(fetchStr) {
    const urlMatch = fetchStr.match(/fetch\s*\(\s*["']([^"']+)["']/);
    if (!urlMatch) throw new Error('Could not extract URL');
    const url = urlMatch[1];

    const authMatch = fetchStr.match(/["']?[Aa]uthorization["']?\s*:\s*["']Bearer\s+([^"']+)["']/);
    if (!authMatch) throw new Error('No Bearer token found');
    const token = authMatch[1];

    return { url, token };
  }

  // --- Status display ---
  function showStatus(message, type) {
    const el = document.getElementById('devStatus');
    if (!el) return;
    el.textContent = message;
    el.className = 'dev-status ' + type;
    setTimeout(() => { el.textContent = ''; el.className = 'dev-status'; }, 5000);
  }

  // --- Hook into chrome shim notification ---
  window.__devShowNotification = function (message, type) {
    showStatus(message, type === 'success' ? 'success' : 'error');
  };

  // --- Initialize toolbar when DOM is ready ---
  function initToolbar() {
    // Toggle collapse
    const toggle = document.getElementById('devToolbarToggle');
    const body = document.getElementById('devToolbarBody');
    const chevron = document.getElementById('devToolbarChevron');
    if (toggle && body) {
      toggle.addEventListener('click', () => {
        body.classList.toggle('hidden');
        chevron.classList.toggle('collapsed');
      });
    }

    // Auto-inject on paste into fetch() textarea
    const fetchInput = document.getElementById('devFetchInput');
    if (fetchInput) {
      let debounceTimer = null;
      fetchInput.addEventListener('input', () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          const fetchStr = fetchInput.value.trim();
          if (!fetchStr || !fetchStr.match(/fetch\s*\(/)) return;

          try {
            const parsed = parseFetchClient(fetchStr);
            window.__devInjectToken(parsed.token, parsed.url);
            showStatus('Token injected from ' + new URL(parsed.url).hostname, 'success');
            fetchInput.value = '';
          } catch (e) {
            showStatus('Error: ' + e.message, 'error');
          }
        }, 300);
      });
    }

    // Sample token buttons
    document.querySelectorAll('.dev-btn-sample').forEach(btn => {
      btn.addEventListener('click', () => {
        const type = btn.dataset.type;
        const sample = SAMPLE_TOKENS[type];
        if (!sample) return;
        const token = sample.token();
        window.__devInjectToken(token, sample.url);
        showStatus('Injected sample ' + type, 'success');
      });
    });
  }

  // Run init after DOM is loaded (toolbar HTML is injected before </body>)
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initToolbar);
  } else {
    // DOM already ready (script loaded after toolbar HTML)
    setTimeout(initToolbar, 0);
  }
})();
