#!/usr/bin/env npx tsx
// Fetches a bearer token by logging into alpha.uipath.com via Playwright.
// Writes the raw JWT to dev/.dev-token if the cached token is missing or expired.
//
// Requires env vars:
//   BEARER_TOKEN_EXTRACTOR_REPO_USERNAME
//   BEARER_TOKEN_EXTRACTOR_REPO_PASSWORD
//
// Usage: npx tsx dev/claude/fetch-token.ts

import fs from 'fs';
import path from 'path';
import { chromium } from 'playwright';

const TOKEN_FILE = path.join(__dirname, '..', '.dev-token');
const MIN_REMAINING_SECONDS = 5 * 60; // skip login if token has >5 min left
const LOGIN_TIMEOUT = 60_000;

interface JwtPayload {
  exp?: number;
  iss?: string;
  [key: string]: unknown;
}

function decodeJwt(token: string): JwtPayload | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    return JSON.parse(
      Buffer.from(parts[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString()
    );
  } catch {
    return null;
  }
}

function getCachedToken(): string | null {
  if (!fs.existsSync(TOKEN_FILE)) return null;
  const content = fs.readFileSync(TOKEN_FILE, 'utf8').trim();
  // Try fetch() format first
  const bearerMatch = content.match(/["']?[Aa]uthorization["']?\s*:\s*["']Bearer\s+([^"']+)["']/);
  if (bearerMatch) return bearerMatch[1];
  // Try raw JWT
  if (/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(content)) return content;
  return null;
}

function isTokenFresh(token: string): boolean {
  const payload = decodeJwt(token);
  if (!payload?.exp) return false;
  const remaining = payload.exp - Math.floor(Date.now() / 1000);
  return remaining > MIN_REMAINING_SECONDS;
}

async function main() {
  const username = process.env.BEARER_TOKEN_EXTRACTOR_REPO_USERNAME;
  const password = process.env.BEARER_TOKEN_EXTRACTOR_REPO_PASSWORD;

  if (!username || !password) {
    console.log('SKIPPED: BEARER_TOKEN_EXTRACTOR_REPO_USERNAME / _PASSWORD not set.');
    process.exit(0);
  }

  // Check if cached token is still fresh
  const cached = getCachedToken();
  if (cached && isTokenFresh(cached)) {
    const payload = decodeJwt(cached)!;
    const mins = Math.floor((payload.exp! - Math.floor(Date.now() / 1000)) / 60);
    console.log(`OK: Cached token still valid (${mins}m remaining). Skipping login.`);
    process.exit(0);
  }

  console.log('Fetching new token via Playwright login...');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  let capturedToken: string | null = null;
  let capturedUrl: string | null = null;

  // Listen for requests with Authorization: Bearer headers on alpha.uipath.com.
  // We need a request whose URL contains the org slug (e.g. /bearertokenextractor/)
  // so the dev server's tenant proxy can extract the hostname and org.
  // Skip: identity provider (id-alpha), pre-org paths (portal_, identity_).
  page.on('request', (request) => {
    if (capturedToken) return; // already got one
    const url = request.url();
    if (!url.includes('alpha.uipath.com')) return;
    if (url.includes('id-alpha.uipath.com')) return;
    // Must have org slug in path — skip URLs whose first path segment is portal_ or identity_
    try {
      const parsed = new URL(url);
      const firstSegment = parsed.pathname.split('/').filter(Boolean)[0];
      if (!firstSegment || firstSegment.startsWith('portal_') || firstSegment.startsWith('identity')) return;
    } catch { return; }
    const auth = request.headers()['authorization'];
    if (!auth || !auth.startsWith('Bearer ')) return;
    const token = auth.slice(7);
    const payload = decodeJwt(token);
    if (!payload?.exp) return; // skip tokens without expiry
    capturedToken = token;
    capturedUrl = url;
  });

  try {
    // Navigate to alpha.uipath.com — redirects to id-alpha.uipath.com/login
    await page.goto('https://alpha.uipath.com', { timeout: LOGIN_TIMEOUT });

    // Click "Continue with Email" to reveal email/password form
    await page.getByRole('button', { name: 'Continue with Email' }).click();

    // Fill credentials
    await page.getByRole('textbox', { name: 'Email' }).fill(username);
    await page.getByRole('textbox', { name: 'Password' }).fill(password);

    // Sign in
    await page.getByRole('button', { name: 'Sign In' }).click();

    // Wait for redirect back to alpha.uipath.com after login
    await page.waitForURL('**/alpha.uipath.com/**', { timeout: LOGIN_TIMEOUT });

    // Wait for bearer token to be captured from subsequent API requests
    if (!capturedToken) {
      await page.waitForTimeout(10_000); // give API calls time to fire
    }

    if (!capturedToken) {
      throw new Error('No bearer token captured after login.');
    }

    const payload = decodeJwt(capturedToken)!;
    const mins = Math.floor((payload.exp! - Math.floor(Date.now() / 1000)) / 60);

    // Write as fetch() format so all existing tools work without synthesis
    const fetchString = `fetch("${capturedUrl}", {\n  "headers": {\n    "authorization": "Bearer ${capturedToken}"\n  }\n})`;
    fs.writeFileSync(TOKEN_FILE, fetchString);
    console.log(`FETCHED: Token written to dev/.dev-token. Expires in ${mins}m.`);
  } catch (err) {
    // Save screenshot for debugging
    const screenshotDir = path.join(__dirname, '..', 'test-results');
    if (!fs.existsSync(screenshotDir)) fs.mkdirSync(screenshotDir, { recursive: true });
    await page.screenshot({ path: path.join(screenshotDir, 'login-failure.png') }).catch(() => {});

    console.error('ERROR: Token fetch failed:', (err as Error).message);
    console.error('Screenshot saved to dev/test-results/login-failure.png');
  } finally {
    await browser.close();
  }
}

main();
