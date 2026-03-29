#!/usr/bin/env npx tsx
// Checks if dev/.dev-token exists and contains a non-expired bearer token.
// Usage: npx tsx dev/claude/check-token.ts [--help]
//
// Output prefixes:
//   OK:      — token is valid, proceed with testing
//   EXPIRED: — token has expired, ask user to refresh dev/.dev-token
//   MISSING: — dev/.dev-token file not found, ask user to create it
//   INVALID: — file exists but contents are not a valid Bearer JWT (fetch string or raw)

import fs from 'fs';
import path from 'path';
import { extractToken, extractUrl, decodeJwt, UIPATH_HOST } from './parse-token';

if (process.argv.includes('--help')) {
  console.log(`check-token.ts — Verify dev/.dev-token has a valid, non-expired bearer token.

Usage: npx tsx dev/claude/check-token.ts

Reads dev/.dev-token (a "Copy as fetch()" string or raw JWT),
extracts the Bearer token, decodes the JWT, and checks the exp claim.

Output prefixes:
  OK:      Token is valid and not expired. Proceed with testing.
  EXPIRED: Token has expired. Ask the user to refresh dev/.dev-token.
  MISSING: dev/.dev-token file does not exist. Ask the user to create it.
  INVALID: File exists but doesn't contain a valid Bearer JWT.`);
  process.exit(0);
}

const tokenFile = path.join(__dirname, '..', '.dev-token');

if (!fs.existsSync(tokenFile)) {
  console.log('MISSING: dev/.dev-token not found. Paste a "Copy as fetch()" from browser DevTools into dev/.dev-token');
  process.exit(0);
}

const content = fs.readFileSync(tokenFile, 'utf8');
const token = extractToken(content);

if (!token) {
  console.log('INVALID: dev/.dev-token does not contain a Bearer token or raw JWT.');
  process.exit(0);
}

const payload = decodeJwt(token);
if (!payload) {
  console.log('INVALID: dev/.dev-token contains a bearer token but it is not a valid JWT.');
  process.exit(0);
}

const now = Math.floor(Date.now() / 1000);

if (!payload.exp) {
  console.log('OK: Token has no exp claim — cannot verify expiry.');
  process.exit(0);
}

const remaining = payload.exp - now;
if (remaining <= 0) {
  const ago = Math.abs(Math.floor(remaining / 60));
  console.log(`EXPIRED: Token expired ${ago} minute(s) ago. Ask the user to refresh dev/.dev-token.`);
  process.exit(0);
}

// Check if token is for the expected environment
const url = extractUrl(content);
if (url) {
  try {
    const host = new URL(url).hostname;
    if (host !== UIPATH_HOST) {
      console.log(`WRONG_ENV: Token is for ${host}, expected ${UIPATH_HOST}. Delete dev/.dev-token to re-fetch.`);
      process.exit(0);
    }
  } catch {}
}

const mins = Math.floor(remaining / 60);
console.log(`OK: Token valid. Expires in ${mins} minute(s). Environment: ${payload.iss || 'unknown'}`);
