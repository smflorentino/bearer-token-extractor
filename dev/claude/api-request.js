#!/usr/bin/env node
// Makes an HTTPS request to a UiPath API using the token from dev/.dev-token.
// Usage: node dev/claude/api-request.js [path]
//
// If no path is given, uses the URL from dev/.dev-token.
// If a path is given, constructs the URL from the token's host + org slug.
//
// Output: raw JSON response body
//
// Examples:
//   node dev/claude/api-request.js
//   node dev/claude/api-request.js /evalsperf/portal_/api/filtering/leftnav/tenantsAndOrganizationInfo

const fs = require('fs');
const https = require('https');
const path = require('path');

const tokenFile = path.join(__dirname, '..', '.dev-token');

if (!fs.existsSync(tokenFile)) {
  console.error('ERROR: dev/.dev-token not found.');
  process.exit(1);
}

const content = fs.readFileSync(tokenFile, 'utf8').trim();

// Try fetch() format first, then raw JWT
const bearerMatch = content.match(/["']?[Aa]uthorization["']?\s*:\s*["']Bearer\s+([^"']+)["']/);
const rawJwt = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(content) ? content : null;
const token = bearerMatch ? bearerMatch[1] : rawJwt;

if (!token) {
  console.error('ERROR: No Bearer token found in dev/.dev-token.');
  process.exit(1);
}

const urlMatch = content.match(/fetch\s*\(\s*["']([^"']+)["']/);

let hostname, requestPath;
const customPath = process.argv[2];

if (customPath) {
  // Extract hostname from the token file's URL, or default to alpha.uipath.com
  hostname = urlMatch ? new URL(urlMatch[1]).hostname : 'alpha.uipath.com';
  requestPath = customPath;
} else if (urlMatch) {
  const parsed = new URL(urlMatch[1]);
  hostname = parsed.hostname;
  requestPath = parsed.pathname + parsed.search;
} else {
  console.error('ERROR: No URL found and no path argument given. Use: node api-request.js /path');
  process.exit(1);
}

const req = https.request({
  hostname,
  path: requestPath,
  method: 'GET',
  headers: {
    'Authorization': 'Bearer ' + token,
    'Accept': 'application/json'
  }
}, (res) => {
  let body = '';
  res.on('data', c => body += c);
  res.on('end', () => {
    try {
      console.log(JSON.stringify(JSON.parse(body), null, 2));
    } catch {
      console.log(body);
    }
  });
});

req.setTimeout(10000, () => {
  req.destroy();
  console.error('ERROR: Request timed out after 10s.');
  process.exit(1);
});

req.on('error', (err) => {
  console.error('ERROR: ' + err.message);
  process.exit(1);
});

req.end();
