import { test, expect } from '@playwright/test';

// E2E tests for LS-D: leadsheet Apply to Ableton client UI.
//   - Track picker renders in the leadsheet tab
//   - "Apply to Ableton" button renders in the leadsheet tab
//   - Apply button is disabled with a reason when not connected / no track / no stamps
//   - Export .zip button coexists with the Apply button in the leadsheet tab
//   - Lyrics tab Apply button is still present in the lyrics tab (no regression)
//
// Notes on testing environment:
// - Build target = disconnected (no live Ableton). Tests cover disabled/structural
//   states only. Live PNG write + clip placement = manual smoke.
// - The 409 "Save your Ableton set first" path requires a real unsaved Ableton set
//   and is not covered here. Covered by: manual smoke checklist (LS-E).
// - WS handshake state is not easily intercepted. Tests assert stable structural
//   properties (button presence, disabled attribute, tooltip text format).

test.describe('leadsheet-apply — track picker in leadsheet tab', () => {
  test('track picker is visible when in the leadsheet tab', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.app', { timeout: 10000 });

    await page.getByRole('button', { name: /leadsheet/i }).click();

    const picker = page.locator('.live-track-picker');
    await expect(picker).toBeVisible({ timeout: 5000 });
  });

  test('track picker select is present in the leadsheet tab header', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.app', { timeout: 10000 });

    await page.getByRole('button', { name: /leadsheet/i }).click();

    const select = page.locator('.live-track-picker select');
    await expect(select).toBeVisible({ timeout: 5000 });
  });

  test('track picker select is disabled when no tracks are loaded', async ({ page }) => {
    // Intercept tracks endpoint to return 503 (disconnected).
    await page.route('/api/live/tracks', async (route) => {
      await route.fulfill({ status: 503, body: JSON.stringify({ error: 'not connected' }) });
    });

    await page.goto('/');
    await page.waitForSelector('.app', { timeout: 10000 });

    await page.getByRole('button', { name: /leadsheet/i }).click();

    const select = page.locator('.live-track-picker select');
    await expect(select).toBeVisible({ timeout: 5000 });
    // The select is disabled when liveTracks is empty (no tracks loaded yet).
    await expect(select).toBeDisabled({ timeout: 8000 });
  });

  test('track picker in leadsheet tab is the same shared element (not a duplicate)', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.app', { timeout: 10000 });

    // Verify only one picker exists in the DOM at any time.
    const pickerCount = await page.locator('.live-track-picker').count();
    expect(pickerCount).toBe(1);

    await page.getByRole('button', { name: /leadsheet/i }).click();
    // Still only one picker after tab switch.
    const pickerCountAfter = await page.locator('.live-track-picker').count();
    expect(pickerCountAfter).toBe(1);
  });
});

test.describe('leadsheet-apply — Apply to Ableton button', () => {
  test('Apply to Ableton button is present in the leadsheet tab', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.app', { timeout: 10000 });

    await page.getByRole('button', { name: /leadsheet/i }).click();

    const applyBtn = page.locator('button.leadsheet-apply-btn');
    await expect(applyBtn).toBeVisible({ timeout: 5000 });
    await expect(applyBtn).toContainText('Apply to Ableton');
  });

  test('Apply button is disabled when Ableton is not connected', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.app', { timeout: 10000 });

    await page.getByRole('button', { name: /leadsheet/i }).click();

    const applyBtn = page.locator('button.leadsheet-apply-btn');
    await expect(applyBtn).toBeDisabled({ timeout: 5000 });
  });

  test('Apply button has a non-empty title (reason) when disabled', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.app', { timeout: 10000 });

    await page.getByRole('button', { name: /leadsheet/i }).click();

    const applyBtn = page.locator('button.leadsheet-apply-btn');
    await expect(applyBtn).toBeDisabled({ timeout: 5000 });
    const title = await applyBtn.getAttribute('title');
    expect(title).toBeTruthy();
    expect(title!.length).toBeGreaterThan(0);
  });

  test('Apply button title is one of the expected disabled reasons', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.app', { timeout: 10000 });

    await page.getByRole('button', { name: /leadsheet/i }).click();

    const applyBtn = page.locator('button.leadsheet-apply-btn');
    await expect(applyBtn).toBeDisabled({ timeout: 8000 });
    const title = await applyBtn.getAttribute('title');
    const validReasons = [
      'Ableton not connected',
      'Remote script not loaded',
      'Checking remote script',
      'No track selected',
      'No stamps to apply',
      'No PDF loaded',
    ];
    expect(validReasons.some((r) => title?.includes(r))).toBe(true);
  });

  test('Apply button is NOT visible in the lyrics tab (no regression)', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.app', { timeout: 10000 });

    // Should be on lyrics tab by default.
    // The leadsheet-specific Apply button has the extra class leadsheet-apply-btn.
    await expect(page.locator('button.leadsheet-apply-btn')).not.toBeVisible({ timeout: 5000 });
  });

  test('Lyrics tab Apply button is still present in lyrics tab (no regression)', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.app', { timeout: 10000 });

    // Should be on lyrics tab by default.
    const lyricsApplyBtn = page.locator('button.apply-btn:not(.leadsheet-apply-btn)');
    await expect(lyricsApplyBtn).toBeVisible({ timeout: 5000 });
    await expect(lyricsApplyBtn).toContainText('Apply to Ableton');
  });
});

test.describe('leadsheet-apply — Export and Apply coexistence', () => {
  test('Export .zip button and Apply button coexist in leadsheet tab', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.app', { timeout: 10000 });

    await page.getByRole('button', { name: /leadsheet/i }).click();

    // Both buttons should be visible in the leadsheet tab header-actions.
    const exportBtn = page.locator('.header-actions .btn.primary');
    const applyBtn = page.locator('button.leadsheet-apply-btn');

    await expect(exportBtn).toBeVisible({ timeout: 5000 });
    await expect(applyBtn).toBeVisible({ timeout: 5000 });
    // Export button shows ".zip"
    await expect(exportBtn).toContainText('.zip');
  });

  test('POST /api/live/apply-leadsheet endpoint is wired (not 404)', async ({ request }) => {
    // Structural check: the route is registered. When disconnected → 503 (not 404).
    // This confirms the server wiring added in LS-C is in the build under test.
    const response = await request.post('/api/live/apply-leadsheet', {
      data: {
        trackIndex: 0,
        pdfName: 'test.pdf',
        pages: [{ page: 1, pngDataUrl: 'data:image/png;base64,iVBORw0KGgo=' }],
        stamps: [{ page: 1, ts: 1.0 }],
      },
    });
    // Accept 503 (disconnected), 400 (invalid pngDataUrl), 409 (unsaved set),
    // or 500 (OSC timeout when Ableton is connected but fork not installed) — not 404.
    // All non-404 responses confirm the route is registered in the dispatcher.
    expect(response.status()).not.toBe(404);
  });
});
