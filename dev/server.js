const express = require('express');
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');
const chokidar = require('chokidar');

const PORT = process.env.PORT || 3000;
const ROOT = path.resolve(__dirname, '..');
const DEV = __dirname;

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

app.use(express.json({ limit: '1mb' }));

// --- Broadcast to all connected WebSocket clients ---
function broadcast(msg) {
  const data = JSON.stringify(msg);
  for (const client of wss.clients) {
    if (client.readyState === 1) client.send(data);
  }
}

// --- HTML injection: serve modified popup.html ---
app.get('/', (req, res) => {
  let html = fs.readFileSync(path.join(ROOT, 'popup.html'), 'utf8');

  // Inject stylesheet into <head> (not <body>)
  html = html.replace(
    '</head>',
    '    <link rel="stylesheet" href="/dev/dev-toolbar.css">\n</head>'
  );

  // Inject shim + background.js BEFORE popup.js
  const injectedScripts = `
    <script src="/dev/chrome-shim.js"></script>
    <script src="/background.js"></script>
    <script src="/dev/dev-toolbar.js"></script>
  `;
  html = html.replace(
    '<script src="popup.js"></script>',
    injectedScripts + '\n    <script src="popup.js"></script>'
  );

  // Inject dev toolbar + live reload before </body>
  const toolbar = fs.readFileSync(path.join(DEV, 'dev-toolbar.html'), 'utf8');
  const liveReload = `
    <script>
      (function() {
        const ws = new WebSocket('ws://' + location.host);
        ws.onmessage = function(e) {
          const msg = JSON.parse(e.data);
          if (msg.type === 'reload') location.reload();
        };
        ws.onclose = function() {
          console.log('[dev] WebSocket closed, will reload on reconnect');
          setTimeout(function() { location.reload(); }, 2000);
        };
      })();
    </script>
  `;
  html = html.replace('</body>', toolbar + liveReload + '\n</body>');

  // Override fixed width for browser tab
  html = html.replace(
    '</head>',
    '<style>body { width: 100% !important; max-width: 600px; margin: 0 auto; }</style>\n</head>'
  );

  res.type('html').send(html);
});

// --- Static files ---
app.use('/dev', express.static(DEV));
app.use(express.static(ROOT));

// --- API: Tenant proxy (stateless — token and URL passed in request body) ---
app.post('/api/tenants', (req, res) => {
  const { token, url } = req.body || {};

  if (!token) {
    return res.json({ error: 'No token provided. Inject a fetch() first.' });
  }

  // Parse and validate the URL
  let hostname = null;
  let orgSlug = null;
  if (url) {
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'https:') {
        return res.json({ error: 'Only HTTPS URLs are supported.' });
      }
      if (!parsed.hostname.endsWith('.uipath.com')) {
        return res.json({ error: 'Tenant proxy is restricted to *.uipath.com hosts.' });
      }
      hostname = parsed.hostname;
      const pathParts = parsed.pathname.split('/').filter(Boolean);
      if (pathParts.length > 0 && !pathParts[0].startsWith('portal_') && !pathParts[0].startsWith('identity')) {
        orgSlug = pathParts[0];
      }
    } catch (e) {
      return res.json({ error: 'Invalid URL.' });
    }
  }

  if (!hostname || !orgSlug) {
    return res.json({ error: 'Could not determine environment/org from URL. Inject a fetch() from a UiPath portal page.' });
  }

  const tenantPath = `/${orgSlug}/portal_/api/filtering/leftnav/tenantsAndOrganizationInfo`;
  const options = {
    hostname,
    path: tenantPath,
    method: 'GET',
    headers: {
      'Authorization': 'Bearer ' + token,
      'Accept': 'application/json',
    }
  };

  const proxyReq = https.request(options, (proxyRes) => {
    let body = '';
    proxyRes.on('data', chunk => { body += chunk; });
    proxyRes.on('end', () => {
      try {
        const data = JSON.parse(body);
        let tenants = [];
        if (Array.isArray(data)) {
          tenants = data.map(t => ({
            tenantName: t.tenantName || t.name || 'Unknown',
            tenantId: t.tenantId || t.id || 'Unknown'
          }));
        } else if (data.tenants && Array.isArray(data.tenants)) {
          tenants = data.tenants.map(t => ({
            tenantName: t.tenantName || t.name || 'Unknown',
            tenantId: t.tenantId || t.id || 'Unknown'
          }));
        } else {
          return res.json({ tenants: null, error: 'Unexpected API response shape', raw: data });
        }
        res.json({ tenants });
      } catch (e) {
        res.json({ error: 'Failed to parse tenant API response: ' + e.message, raw: body.substring(0, 500) });
      }
    });
  });

  proxyReq.setTimeout(10000, () => {
    proxyReq.destroy();
    res.json({ error: 'Tenant API request timed out after 10s.' });
  });

  proxyReq.on('error', (err) => {
    res.json({ error: 'Tenant API request failed: ' + err.message });
  });

  proxyReq.end();
});

// --- File watcher for live reload ---
const watcher = chokidar.watch(
  ['*.js', '*.html', '*.css'].map(g => path.join(ROOT, g)),
  { ignoreInitial: true, ignored: [path.join(ROOT, 'dev/**')] }
);

const devWatcher = chokidar.watch(
  path.join(DEV, '**/*.{js,html,css}'),
  { ignoreInitial: true, ignored: [path.join(DEV, 'node_modules/**')] }
);

function onFileChange(filePath) {
  console.log(`[dev] File changed: ${path.relative(ROOT, filePath)}`);
  broadcast({ type: 'reload' });
}

watcher.on('change', onFileChange);
devWatcher.on('change', onFileChange);

// --- Start server ---
server.listen(PORT, '127.0.0.1', () => {
  console.log(`[dev] Dev server running at http://localhost:${PORT}`);
  console.log(`[dev] Watching for file changes in ${ROOT}`);
});
