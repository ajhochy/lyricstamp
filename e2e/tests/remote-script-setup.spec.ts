import { test, expect } from '@playwright/test';

async function mockStatus(page: import('@playwright/test').Page, status: Record<string, unknown>) {
  await page.route('**/api/remote-script/status', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(status) }),
  );
}

const BASE = {
  installed: false,
  installedVersion: null,
  bundledVersion: 'ableset-2',
  upToDate: false,
  userLibFound: true,
  sourceFound: true,
  destPath: '/x/Remote Scripts/AbletonOSC',
};

test.describe('remote-script setup checklist', () => {
  test('shows Install when not up to date', async ({ page }) => {
    await mockStatus(page, { ...BASE });
    await page.goto('/');
    await page.waitForSelector('.workspace', { timeout: 15000 });
    await expect(page.locator('.remote-script-setup')).toBeVisible();
    await expect(page.locator('[data-step="install"] button')).toHaveText(/Install remote script/i);
  });

  test('shows Update when installed but stale', async ({ page }) => {
    await mockStatus(page, { ...BASE, installed: true, installedVersion: 'ableset-1' });
    await page.goto('/');
    await page.waitForSelector('.workspace', { timeout: 15000 });
    await expect(page.locator('[data-step="install"] button')).toHaveText(/Update remote script/i);
  });

  test('shows the open-Live hint when userLib missing (browser mode)', async ({ page }) => {
    await mockStatus(page, { ...BASE, userLibFound: false });
    await page.goto('/');
    await page.waitForSelector('.workspace', { timeout: 15000 });
    await expect(page.locator('[data-step="install"] .rss-hint')).toContainText(/Open Ableton Live once/i);
  });

  test('step 1 is marked done when up to date', async ({ page }) => {
    await mockStatus(page, { ...BASE, installed: true, installedVersion: 'ableset-2', upToDate: true });
    await page.goto('/');
    await page.waitForSelector('.workspace', { timeout: 15000 });
    if (await page.locator('.remote-script-setup').count()) {
      await expect(page.locator('[data-step="install"]')).toHaveClass(/done/);
    }
  });
});
