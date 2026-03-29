#!/usr/bin/env npx tsx
// Fetches a bearer token by logging into UIPATH_HOST via Playwright.
// Writes a fetch() format string to dev/.dev-token if the cached token is missing or expired.
//
// Requires env vars:
//   BEARER_TOKEN_EXTRACTOR_REPO_USERNAME
//   BEARER_TOKEN_EXTRACTOR_REPO_PASSWORD
//
// Usage: npx tsx dev/claude/fetch-token.ts

import fs from 'fs';
import path from 'path';
import { chromium } from 'playwright';

import { extractToken, extractUrl, decodeJwt, UIPATH_HOST } from './parse-token';

const TOKEN_FILE = path.join(__dirname, '..', '.dev-token');
const MIN_REMAINING_SECONDS = 5 * 60; // skip login if token has >5 min left
const LOGIN_TIMEOUT = 60_000;

function getCachedToken(): string | null {
  if (!fs.existsSync(TOKEN_FILE)) return null;
  const content = fs.readFileSync(TOKEN_FILE, 'utf8');
  return extractToken(content) as string | null;
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

  // Check if cached token is still fresh and for the right environment
  const cached = getCachedToken();
  if (cached && isTokenFresh(cached)) {
    const cachedUrl = extractUrl(fs.readFileSync(TOKEN_FILE, 'utf8'));
    const isCorrectEnv = !cachedUrl || new URL(cachedUrl).hostname === UIPATH_HOST;
    if (isCorrectEnv) {
      const payload = decodeJwt(cached)!;
      const mins = Math.floor((payload.exp! - Math.floor(Date.now() / 1000)) / 60);
      console.log(`OK: Cached token still valid (${mins}m remaining). Skipping login.`);
      process.exit(0);
    }
  }

  console.log('Fetching new token via Playwright login...');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  let capturedToken: string | null = null;
  let capturedUrl: string | null = null;

  let resolveTokenCaptured: () => void;
  const tokenCaptured = new Promise<void>((resolve) => {
    resolveTokenCaptured = resolve;
  });

  // Capture the first *.uipath.com request with a Bearer token and an org slug in the path
  // (e.g. /bearertokenextractor/portal_/api/...). Skip non-org paths like /portal_/ and /identity_/.
  page.on('request', (request) => {
    if (capturedToken) return;
    try {
      const parsed = new URL(request.url());
      if (!parsed.hostname.endsWith('uipath.com')) return;
      const firstSegment = parsed.pathname.split('/').filter(Boolean)[0];
      if (!firstSegment || firstSegment.startsWith('portal_') || firstSegment.startsWith('identity')) return;
    } catch { return; }
    const auth = request.headers()['authorization'];
    if (!auth || !auth.startsWith('Bearer ')) return;
    const token = auth.slice(7);
    const payload = decodeJwt(token);
    if (!payload?.exp) return; // skip tokens without expiry
    capturedToken = token;
    capturedUrl = request.url();
    resolveTokenCaptured();
  });

  try {
    // Navigate to UIPATH_HOST — redirects to the identity provider for login
    await page.goto(`https://${UIPATH_HOST}`, { timeout: LOGIN_TIMEOUT });

    // Click "Continue with Email" to reveal email/password form
    await page.getByRole('button', { name: 'Continue with Email' }).click();

    // Dismiss cookie consent banner if present (blocks clicks on cloud.uipath.com)
    const cookieBanner = page.getByRole('button', { name: 'Ok, got it' });
    if (await cookieBanner.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await cookieBanner.click();
    }

    // Fill credentials
    await page.getByRole('textbox', { name: 'Email' }).fill(username);
    await page.getByRole('textbox', { name: 'Password' }).fill(password);

    // Sign in
    await page.getByRole('button', { name: 'Sign In' }).click();

    // Wait for redirect back to UIPATH_HOST after login
    await page.waitForURL(`**/${UIPATH_HOST}/**`, { timeout: LOGIN_TIMEOUT });

    // Wait for bearer token to be captured from subsequent API requests
    if (!capturedToken) {
      await Promise.race([tokenCaptured, page.waitForTimeout(30_000)]);
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
