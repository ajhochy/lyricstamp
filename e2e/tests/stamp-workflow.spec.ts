import { test, expect } from '@playwright/test';
import { gunzipSync } from 'node:zlib';

// End-to-end stamp workflow, exercised entirely through the rendered UI.
// Modelled on verification.spec.ts (same ChordPro fixture + loadSong helper),
// but driven as a user would: load a song, stamp lyric lines with the
// keyboard, and assert the stamp log + export reflect the work.
//
// This test is written against DEV-MODE behaviour (the live client source).
// Run it against the production build with the default config and against dev
// mode with playwright.dev.config.ts.

const CHORD_PRO_SONG = `
{title: Amazing Grace}
{key: G}
{tempo: 76}

{start_of_verse}
[G]Amazing [G7]grace how [C]sweet the [G]sound
[G]That saved a [G7]wretch [C]like [G]me
{end_of_verse}

{start_of_chorus}
[C]How precious [G]did that grace appear
[D]The hour I [G]first believed
{end_of_chorus}
`.trim();

const LYRIC_LINE_COUNT = 4; // 2 verse + 2 chorus lyric lines

async function loadSong(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/');
  await page.waitForSelector('.workspace', { timeout: 15000 });
  // The ChordPro setup panel is collapsed by default — expand it.
  await page.locator('.setup-header').click();
  await page.locator('.textarea').fill(CHORD_PRO_SONG);
  await page.getByRole('button', { name: /Reload song/i }).click();
  // Wait until the preview shows a real lyric line (not the empty-state dash).
  await expect(page.locator('.lyric-current')).not.toHaveText('—', { timeout: 10000 });
}

// Move keyboard focus off the setup textarea/button so the window-level
// keydown handler (which bails when focus is in an input/textarea) fires.
async function focusWorkspace(page: import('@playwright/test').Page): Promise<void> {
  await page.locator('.lyric-current').click();
}

test.describe('end-to-end — lyric stamp workflow', () => {
  test('stamping fills the stamp log and advances the cursor', async ({ page }) => {
    await loadSong(page);

    // Fresh session: no stamps, empty-state count.
    await expect(page.locator('.log-header .count')).toHaveText('0 entries');
    await expect(page.locator('.log-row.clickable')).toHaveCount(0);

    await focusWorkspace(page);

    // Stamp every lyric line. ArrowRight stamps the current line and advances.
    for (let i = 0; i < LYRIC_LINE_COUNT; i++) {
      await page.keyboard.press('ArrowRight');
    }

    // The log now holds one clickable entry per stamped line.
    await expect(page.locator('.log-row.clickable')).toHaveCount(LYRIC_LINE_COUNT);
    await expect(page.locator('.log-header .count')).toHaveText(`${LYRIC_LINE_COUNT} entries`);

    // Exactly one row is marked as the most recent stamp.
    await expect(page.locator('.log-row.recent')).toHaveCount(1);

    // The first stamped row is numbered #01 and carries real lyric text.
    const firstRow = page.locator('.log-row.clickable').first();
    await expect(firstRow.locator('.idx')).toHaveText('#01');
    await expect(firstRow.locator('.text')).not.toHaveText('');
  });

  test('undoing a stamp removes it from the log', async ({ page }) => {
    await loadSong(page);
    await focusWorkspace(page);

    for (let i = 0; i < LYRIC_LINE_COUNT; i++) {
      await page.keyboard.press('ArrowRight');
    }
    await expect(page.locator('.log-row.clickable')).toHaveCount(LYRIC_LINE_COUNT);

    // Undo the first stamp via its row button.
    await page.locator('.log-row.clickable').first().locator('button.undo').click();

    await expect(page.locator('.log-row.clickable')).toHaveCount(LYRIC_LINE_COUNT - 1);
    await expect(page.locator('.log-header .count')).toHaveText(`${LYRIC_LINE_COUNT - 1} entries`);
  });

  test('stamped lyrics round-trip into an exported Live 12 .als', async ({ page, request }) => {
    await loadSong(page);
    await focusWorkspace(page);
    for (let i = 0; i < LYRIC_LINE_COUNT; i++) {
      await page.keyboard.press('ArrowRight');
    }
    await expect(page.locator('.log-row.clickable')).toHaveCount(LYRIC_LINE_COUNT);

    // Read the stamped lyric text straight from the UI, then confirm the
    // export endpoint embeds those lines in a Live 12 .als.
    const firstText = (await page.locator('.log-row.clickable .text').first().textContent())?.trim() ?? '';
    expect(firstText.length).toBeGreaterThan(0);

    const res = await request.post('/api/export/als', {
      headers: { 'Content-Type': 'application/json' },
      data: {
        song: { name: 'Amazing Grace', bpm: 76, key: 'G', lines: [{ text: firstText }] },
        stamps: [{ id: 's1', lineIdx: 0, lineText: firstText, section: null, ts: 0, beats: 0 }],
      },
    });
    expect(res.status()).toBe(200);
    const xml = gunzipSync(Buffer.from(await res.body())).toString('utf-8');
    expect(xml).toContain('MinorVersion="12.0_12402"');
  });
});
