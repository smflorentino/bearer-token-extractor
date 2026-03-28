#!/usr/bin/env node
// Checks if dev/.dev-token exists and contains a non-expired bearer token.
// Usage: node dev/claude/check-token.js [--help]
//
// Output prefixes:
//   OK:      — token is valid, proceed with testing
//   EXPIRED: — token has expired, ask user to refresh dev/.dev-token
//   MISSING: — dev/.dev-token file not found, ask user to create it
//   INVALID: — file exists but contents are not a valid fetch() with a Bearer JWT

if (process.argv.includes('--help')) {
  console.log(`check-token.js — Verify dev/.dev-token has a valid, non-expired bearer token.

Usage: node dev/claude/check-token.js

Reads dev/.dev-token (a "Copy as fetch()" string from browser DevTools),
extracts the Bearer token, decodes the JWT, and checks the exp claim.

Output prefixes:
  OK:      Token is valid and not expired. Proceed with testing.
  EXPIRED: Token has expired. Ask the user to refresh dev/.dev-token.
  MISSING: dev/.dev-token file does not exist. Ask the user to create it.
  INVALID: File exists but doesn't contain a valid Bearer JWT.`);
  return;
}

const fs = require('fs');
const path = require('path');

const tokenFile = path.join(__dirname, '..', '.dev-token');

if (!fs.existsSync(tokenFile)) {
  console.log('MISSING: dev/.dev-token not found. Paste a "Copy as fetch()" from browser DevTools into dev/.dev-token');
  return;
}

const content = fs.readFileSync(tokenFile, 'utf8');
const match = content.match(/["']?[Aa]uthorization["']?\s*:\s*["']Bearer\s+([^"']+)["']/);
if (!match) {
  console.log('INVALID: dev/.dev-token does not contain an Authorization: Bearer header.');
  return;
}

const token = match[1];
const parts = token.split('.');
if (parts.length !== 3) {
  console.log('INVALID: dev/.dev-token contains a bearer token but it is not a valid JWT.');
  return;
}

try {
  const payload = JSON.parse(Buffer.from(parts[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString());
  const now = Math.floor(Date.now() / 1000);

  if (!payload.exp) {
    console.log('OK: Token has no exp claim — cannot verify expiry.');
    return;
  }

  const remaining = payload.exp - now;
  if (remaining <= 0) {
    const ago = Math.abs(Math.floor(remaining / 60));
    console.log(`EXPIRED: Token expired ${ago} minute(s) ago. Ask the user to refresh dev/.dev-token.`);
    return;
  }

  const mins = Math.floor(remaining / 60);
  console.log(`OK: Token valid. Expires in ${mins} minute(s). Environment: ${payload.iss || 'unknown'}`);
} catch (e) {
  console.log('INVALID: Failed to decode JWT payload: ' + e.message);
}
