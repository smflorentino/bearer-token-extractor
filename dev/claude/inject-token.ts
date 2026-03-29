#!/usr/bin/env npx tsx
// Extracts token and URL from dev/.dev-token for MCP injection.
// Usage: npx tsx dev/claude/inject-token.ts [--fetch-string]
//
// Default output: JSON with token, url, status, and expiresIn
// --fetch-string: outputs the raw fetch() string (for pasting into dev toolbar)
//
// Output prefixes (non-JSON mode):
//   OK:      — token extracted successfully
//   EXPIRED: — token has expired
//   MISSING: — dev/.dev-token not found
//   INVALID: — file doesn't contain a valid Bearer JWT

import fs from 'fs';
import path from 'path';
import { extractToken, extractUrl, decodeJwt } from './parse-token';

const tokenFile = path.join(__dirname, '..', '.dev-token');
const fetchStringMode = process.argv.includes('--fetch-string');

if (!fs.existsSync(tokenFile)) {
  if (fetchStringMode) { console.log('MISSING: dev/.dev-token not found.'); }
  else { console.log(JSON.stringify({ error: 'MISSING', message: 'dev/.dev-token not found' })); }
  process.exit(0);
}

const content = fs.readFileSync(tokenFile, 'utf8');
const token = extractToken(content);

if (!token) {
  if (fetchStringMode) { console.log('INVALID: No Bearer token found in dev/.dev-token.'); }
  else { console.log(JSON.stringify({ error: 'INVALID', message: 'No Bearer token found' })); }
  process.exit(0);
}

const url = extractUrl(content);

let status = 'valid';
let expiresIn: string | null = null;

const payload = decodeJwt(token);
if (payload?.exp) {
  const remaining = payload.exp - Math.floor(Date.now() / 1000);
  if (remaining <= 0) {
    status = 'expired';
    expiresIn = `${Math.abs(Math.floor(remaining / 60))}m ago`;
  } else {
    expiresIn = `${Math.floor(remaining / 60)}m`;
  }
}

if (fetchStringMode) {
  if (status === 'expired') {
    console.log(`EXPIRED: Token expired ${expiresIn}. Refresh dev/.dev-token.`);
  } else if (url) {
    // Output the raw fetch string for direct pasting into MCP browser_fill
    console.log(content.trim());
  } else {
    // Raw JWT — synthesize a fetch string for the dev toolbar
    console.log(`fetch("https://alpha.uipath.com", {\n  "headers": {\n    "authorization": "Bearer ${token}"\n  }\n})`);
  }
} else {
  console.log(JSON.stringify({ token, url, status, expiresIn }));
}
