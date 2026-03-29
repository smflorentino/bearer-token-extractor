// Playwright globalSetup: fetches a fresh bearer token if dev/.dev-token is expired or missing.
// Non-fatal — if it fails, integration tests will just skip as they do today.

import { execSync } from 'child_process';
import path from 'path';

export default async function globalSetup() {
  try {
    const result = execSync(`npx tsx ${path.join(__dirname, 'fetch-token.ts')}`, {
      encoding: 'utf8',
      timeout: 90_000,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env,
    });
    if (result.trim()) console.log(result.trim());
  } catch (err) {
    const error = err as { stderr?: string; message?: string };
    // Non-fatal: if token fetch fails, integration tests will just skip
    console.log('Token fetch skipped or failed:', error.stderr?.trim() || error.message);
  }
}
