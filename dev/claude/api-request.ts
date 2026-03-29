#!/usr/bin/env npx tsx
// Makes an HTTPS request to a UiPath API using the token from dev/.dev-token.
// Usage: npx tsx dev/claude/api-request.ts [path]
//
// If no path is given, uses the URL from dev/.dev-token.
// If a path is given, constructs the URL from the token's host + org slug.
//
// Output: raw JSON response body
//
// Examples:
//   npx tsx dev/claude/api-request.ts
//   npx tsx dev/claude/api-request.ts /evalsperf/portal_/api/filtering/leftnav/tenantsAndOrganizationInfo

import fs from 'fs';
import https from 'https';
import path from 'path';
import { extractToken, extractUrl, UIPATH_HOST } from './parse-token';

const tokenFile = path.join(__dirname, '..', '.dev-token');

if (!fs.existsSync(tokenFile)) {
  console.error('ERROR: dev/.dev-token not found.');
  process.exit(1);
}

const content = fs.readFileSync(tokenFile, 'utf8').trim();

const token = extractToken(content);

if (!token) {
  console.error('ERROR: No Bearer token found in dev/.dev-token.');
  process.exit(1);
}

const url = extractUrl(content);

let hostname: string;
let requestPath: string;
const customPath = process.argv[2];

if (customPath) {
  hostname = url ? new URL(url).hostname : UIPATH_HOST;
  requestPath = customPath;
} else if (url) {
  const parsed = new URL(url);
  hostname = parsed.hostname;
  requestPath = parsed.pathname + parsed.search;
} else {
  console.error('ERROR: No URL found and no path argument given. Use: npx tsx api-request.ts /path');
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
  res.on('data', (c: string) => body += c);
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
