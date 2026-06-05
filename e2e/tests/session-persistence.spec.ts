import { test, expect } from '@playwright/test';

// Contract for server-backed, origin-independent named sessions.
// The decisive assertion is that a session saved through the UI becomes visible
// via GET /api/sessions — which fails on the unmodified tree (IndexedDB-only,
// no such route) and passes once sessions are stored server-side.
//
// Runs against any target (build / dev / packaged) via baseURL. The webServer
// is configured with a throwaway ABLESET_DATA_DIR so this never touches real
// user sessions.

const CHORD_PRO_SONG = `
{title: Persistence Test}
{key: C}
{start_of_verse}
[C]Line one of the test song
[C]Line two of the test song
{end_of_verse}
`.trim();

async function loadSong(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/');
  await page.waitForSelector('.workspace', { timeout: 15000 });
  await page.locator('.setup-header').click();
  await page.locator('.textarea').fill(CHORD_PRO_SONG);
  await page.getByRole('button', { name: /Reload song/i }).click();
  await expect(page.locator('.lyric-current')).not.toHaveText('—', { timeout: 10000 });
}

test.describe('named sessions persist server-side (origin-independent)', () => {
  test('a session saved in the UI is visible via GET /api/sessions', async ({ page, request }) => {
    await loadSong(page);

    const name = 'E2E Persistence Session';
    // Open the Sessions menu, name it, save.
    await page.locator('.sessions > button').click();
    await page.locator('.sessions-menu .input').fill(name);
    await page.getByRole('button', { name: /^(Save|Update)$/ }).click();

    // Decisive check: the server now knows about it.
    await expect(async () => {
      const res = await request.get('/api/sessions');
      expect(res.status()).toBe(200);
      const list = await res.json();
      expect(Array.isArray(list)).toBe(true);
      expect(list.some((s: { name?: string }) => s.name === name)).toBe(true);
    }).toPass({ timeout: 5000 });
  });

  test('a saved session survives a full page reload (listed in the UI)', async ({ page }) => {
    await loadSong(page);
    const name = 'Reload Survivor';
    await page.locator('.sessions > button').click();
    await page.locator('.sessions-menu .input').fill(name);
    await page.getByRole('button', { name: /^(Save|Update)$/ }).click();
    await expect(page.locator('.sessions-list')).toContainText(name, { timeout: 5000 });

    // Reload from scratch; the session must still be listed (served from API).
    await page.reload();
    await page.waitForSelector('.workspace', { timeout: 15000 });
    await page.locator('.sessions > button').click();
    await expect(page.locator('.sessions-list')).toContainText(name, { timeout: 5000 });
  });
});
