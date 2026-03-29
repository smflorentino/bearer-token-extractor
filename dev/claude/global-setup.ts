// Playwright globalSetup: fetches a fresh bearer token if dev/.dev-token is expired or missing.
// Non-fatal — if it fails, integration tests will just skip as they do today.

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

import { extractToken, extractUrl, decodeJwt, UIPATH_HOST } from './parse-token';

const yellow = '\x1b[33m';
const reset = '\x1b[0m';

function checkTokenAfterFetch() {
  const tokenFile = path.join(__dirname, '..', '.dev-token');
  if (!fs.existsSync(tokenFile)) return 'missing';
  const content = fs.readFileSync(tokenFile, 'utf8');
  const token = extractToken(content);
  if (!token) return 'invalid';
  const payload = decodeJwt(token);
  if (!payload) return 'invalid';
  if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return 'expired';
  const url = extractUrl(content);
  if (url) {
    try { if (new URL(url).hostname !== UIPATH_HOST) return 'wrong_env'; } catch {}
  }
  return 'valid';
}

export default async function globalSetup() {
  const hasEnvVars = process.env.BEARER_TOKEN_EXTRACTOR_REPO_USERNAME && process.env.BEARER_TOKEN_EXTRACTOR_REPO_PASSWORD;

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
    console.log('Token fetch failed:', error.stderr?.trim() || error.message);
  }

  const finalStatus = checkTokenAfterFetch();
  if (finalStatus !== 'valid') {
    const reasons: Record<string, string> = {
      missing: hasEnvVars
        ? 'dev/.dev-token not found. Token auto-fetch may have failed — check logs above.'
        : 'No dev/.dev-token and no env vars. Set BEARER_TOKEN_EXTRACTOR_REPO_USERNAME and _PASSWORD to auto-fetch.',
      invalid: hasEnvVars
        ? 'dev/.dev-token is invalid. Delete it and re-run to auto-fetch.'
        : 'dev/.dev-token is invalid. Set BEARER_TOKEN_EXTRACTOR_REPO_USERNAME and _PASSWORD env vars, then delete the file and re-run.',
      expired: hasEnvVars
        ? 'dev/.dev-token is expired. Token auto-fetch may have failed — check logs above.'
        : 'dev/.dev-token is expired. Set env vars to auto-fetch, or manually refresh the file.',
      wrong_env: `dev/.dev-token is for a different environment (expected ${UIPATH_HOST}). Delete it to re-fetch.`,
    };
    const reason = reasons[finalStatus] || `dev/.dev-token is ${finalStatus}.`;
    console.warn(`${yellow}⚠ Skipping 2 integration tests: ${reason}${reset}`);
  }
}
