// Playwright globalSetup: fetches a fresh bearer token if dev/.dev-token is expired or missing.
// Non-fatal — if it fails, integration tests will just skip as they do today.

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

import { extractToken, decodeJwt } from './parse-token';

const yellow = '\x1b[33m';
const reset = '\x1b[0m';

function checkTokenAfterFetch() {
  const tokenFile = path.join(__dirname, '..', '.dev-token');
  if (!fs.existsSync(tokenFile)) return 'missing';
  const token = extractToken(fs.readFileSync(tokenFile, 'utf8'));
  if (!token) return 'invalid';
  const payload = decodeJwt(token);
  if (!payload) return 'invalid';
  if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return 'expired';
  return 'valid';
}

export default async function globalSetup() {
  try {
    const result = execSync(`npx tsx ${path.join(__dirname, 'fetch-token.ts')}`, {
      encoding: 'utf8',
      timeout: 90_000,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env,
    });
    const output = result.trim();
    if (output && !output.startsWith('SKIPPED:')) console.log(output);
  } catch (err) {
    const error = err as { stderr?: string; message?: string };
    // Non-fatal: if token fetch fails, integration tests will just skip
    console.log('Token fetch skipped or failed:', error.stderr?.trim() || error.message);
  }

  const status = checkTokenAfterFetch();
  if (status !== 'valid') {
    const hasEnvVars = process.env.BEARER_TOKEN_EXTRACTOR_REPO_USERNAME && process.env.BEARER_TOKEN_EXTRACTOR_REPO_PASSWORD;
    const reason = status === 'missing' && !hasEnvVars
      ? 'Set BEARER_TOKEN_EXTRACTOR_REPO_USERNAME and _PASSWORD env vars to auto-fetch.'
      : `dev/.dev-token is ${status}.`;
    console.warn(`${yellow}⚠ Skipping 2 integration tests: ${reason}${reset}`);
  }
}
