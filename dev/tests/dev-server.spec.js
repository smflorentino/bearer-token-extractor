const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

// Helper: inject a sample token via the dev toolbar button
async function injectSampleToken(page, type) {
  await page.getByRole('button', { name: type }).click();
  await page.waitForTimeout(2500);
}

test.describe('UI rendering', () => {
  test('page loads with correct structure', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Bearer Token Extractor' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Alpha' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Staging' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Prod' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Navigate' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Fetch Tenants' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Clear All' })).toBeVisible();
    await expect(page.getByText('No bearer tokens captured yet.')).toBeVisible();
  });

  test('dev toolbar is visible', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('Dev Tools')).toBeVisible();
    await expect(page.locator('#devFetchInput')).toBeVisible();
    await expect(page.getByRole('button', { name: 'UserAccessToken' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'PortalPkceToken' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'IdToken' })).toBeVisible();
  });
});

test.describe('token injection', () => {
  test('sample UserAccessToken appears with correct type', async ({ page }) => {
    await page.goto('/');
    await injectSampleToken(page, 'UserAccessToken');
    await expect(page.locator('#tokensList .token-type.UserAccessToken')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Copy Token' })).toBeVisible();
  });

  test('sample IdToken appears with correct type', async ({ page }) => {
    await page.goto('/');
    await injectSampleToken(page, 'IdToken');
    await expect(page.locator('#tokensList .token-type.IdToken')).toBeVisible();
  });

  test('sample PortalPkceToken appears with correct type', async ({ page }) => {
    await page.goto('/');
    await injectSampleToken(page, 'PortalPkceToken');
    await expect(page.locator('#tokensList .token-type.PortalPkceToken')).toBeVisible();
  });

  test('multiple tokens are sorted by priority', async ({ page }) => {
    await page.goto('/');
    await injectSampleToken(page, 'IdToken');
    await injectSampleToken(page, 'UserAccessToken');

    const typeLabels = await page.locator('.token-type').allTextContents();
    expect(typeLabels[0]).toBe('UserAccessToken');
    expect(typeLabels[1]).toBe('IdToken');
  });

  test('token shows expiration time', async ({ page }) => {
    await page.goto('/');
    await injectSampleToken(page, 'UserAccessToken');

    const timestamp = await page.locator('.timestamp').first().textContent();
    expect(timestamp).toMatch(/\d+h|\d+m/);
  });
});

test.describe('settings', () => {
  test('settings modal opens and closes', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: '⚙️' }).click();
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
    await expect(page.getByText('Auto-cleanup tokens')).toBeVisible();
    await expect(page.getByText('Mask tokens')).toBeVisible();

    await page.getByRole('button', { name: '×' }).click();
    await expect(page.getByRole('heading', { name: 'Settings' })).not.toBeVisible();
  });

  test('token masking works', async ({ page }) => {
    await page.goto('/');
    await injectSampleToken(page, 'UserAccessToken');

    const unmasked = await page.locator('.token-value').first().textContent();
    expect(unmasked).not.toContain('****');

    await page.getByRole('button', { name: '⚙️' }).click();
    await page.getByRole('checkbox', { name: 'Mask tokens' }).check();
    await page.getByRole('button', { name: 'Save Settings' }).click();
    await page.waitForTimeout(2500);

    const masked = await page.locator('.token-value').first().textContent();
    expect(masked).toContain('****');
    expect(masked.length).toBeLessThan(unmasked.length);
  });
});

test.describe('clear tokens', () => {
  test('Clear All removes all tokens', async ({ page }) => {
    await page.goto('/');
    await injectSampleToken(page, 'UserAccessToken');
    await expect(page.getByRole('button', { name: 'Copy Token' }).first()).toBeVisible();

    await page.evaluate(() => { window.confirm = () => true; });
    await page.getByRole('button', { name: 'Clear All' }).click();
    await page.waitForTimeout(2500);

    await expect(page.getByText('No bearer tokens captured yet.')).toBeVisible();
  });
});

test.describe('tenant proxy API', () => {
  test('POST /api/tenants returns error without token', async ({ page }) => {
    await page.goto('/');
    const response = await page.evaluate(() => {
      return fetch('/api/tenants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      }).then((r) => r.json());
    });
    expect(response.error).toBeTruthy();
  });
});

test.describe('real token integration', () => {
  const devTokenPath = path.join(__dirname, '..', '.dev-token');

  function getTokenStatus() {
    if (!fs.existsSync(devTokenPath)) return 'missing';
    const content = fs.readFileSync(devTokenPath, 'utf8');
    const match = content.match(/["']?[Aa]uthorization["']?\s*:\s*["']Bearer\s+([^"']+)["']/);
    if (!match) return 'invalid';
    const parts = match[1].split('.');
    if (parts.length !== 3) return 'invalid';
    try {
      const payload = JSON.parse(Buffer.from(parts[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString());
      if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return 'expired';
      return 'valid';
    } catch { return 'invalid'; }
  }

  const status = getTokenStatus();
  test.skip(status !== 'valid', `Skipped: dev/.dev-token is ${status}`);

  test('inject real token and fetch tenants', async ({ page }) => {
    const fetchString = fs.readFileSync(devTokenPath, 'utf8');

    await page.goto('/');
    await page.waitForTimeout(1000);

    // Paste into the textarea to trigger auto-inject
    await page.locator('#devFetchInput').fill(fetchString);
    await page.waitForTimeout(3000);

    // Verify token appears
    const tokenTypes = await page.locator('.token-type').allTextContents();
    expect(tokenTypes.length).toBeGreaterThan(0);

    // Fetch tenants — must return real data since token is valid
    await page.getByRole('button', { name: 'Fetch Tenants' }).click();
    await page.waitForTimeout(3000);

    const tenantItems = page.locator('.tenant-item');
    const tenantCount = await tenantItems.count();
    expect(tenantCount).toBeGreaterThan(0);

    const tenantName = await tenantItems.first().locator('.tenant-name').textContent();
    expect(tenantName.length).toBeGreaterThan(0);
  });
});
