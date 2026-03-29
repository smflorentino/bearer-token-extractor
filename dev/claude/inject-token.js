#!/usr/bin/env node
// Extracts token and URL from dev/.dev-token for MCP injection.
// Usage: node dev/claude/inject-token.js [--fetch-string]
//
// Default output: JSON with token, url, status, and expiresIn
// --fetch-string: outputs the raw fetch() string (for pasting into dev toolbar)
//
// Output prefixes (non-JSON mode):
//   OK:      — token extracted successfully
//   EXPIRED: — token has expired
//   MISSING: — dev/.dev-token not found
//   INVALID: — file doesn't contain a valid Bearer JWT

const fs = require('fs');
const path = require('path');

const tokenFile = path.join(__dirname, '..', '.dev-token');
const fetchStringMode = process.argv.includes('--fetch-string');

if (!fs.existsSync(tokenFile)) {
  if (fetchStringMode) { console.log('MISSING: dev/.dev-token not found.'); }
  else { console.log(JSON.stringify({ error: 'MISSING', message: 'dev/.dev-token not found' })); }
  return;
}

const content = fs.readFileSync(tokenFile, 'utf8').trim();

const tokenMatch = content.match(/["']?[Aa]uthorization["']?\s*:\s*["']Bearer\s+([^"']+)["']/);
if (!tokenMatch) {
  if (fetchStringMode) { console.log('INVALID: No Bearer token found in dev/.dev-token.'); }
  else { console.log(JSON.stringify({ error: 'INVALID', message: 'No Bearer token found' })); }
  return;
}

const urlMatch = content.match(/fetch\s*\(\s*["']([^"']+)["']/);
const token = tokenMatch[1];
const url = urlMatch ? urlMatch[1] : null;

// Decode JWT to check expiry
const parts = token.split('.');
let status = 'valid';
let expiresIn = null;

if (parts.length === 3) {
  try {
    const payload = JSON.parse(Buffer.from(parts[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString());
    if (payload.exp) {
      const remaining = payload.exp - Math.floor(Date.now() / 1000);
      if (remaining <= 0) {
        status = 'expired';
        expiresIn = `${Math.abs(Math.floor(remaining / 60))}m ago`;
      } else {
        expiresIn = `${Math.floor(remaining / 60)}m`;
      }
    }
  } catch {}
}

if (fetchStringMode) {
  if (status === 'expired') {
    console.log(`EXPIRED: Token expired ${expiresIn}. Refresh dev/.dev-token.`);
  } else {
    // Output the raw fetch string for direct pasting into MCP browser_fill
    console.log(content);
  }
} else {
  console.log(JSON.stringify({ token, url, status, expiresIn }));
}
