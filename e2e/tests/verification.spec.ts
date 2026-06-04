import { test, expect } from '@playwright/test';
import { gunzipSync } from 'node:zlib';

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

// --- #26: Live 12 compatibility ---

test.describe('#26 — .als export Live 12 compatibility', () => {
  test('exported .als XML contains Live 12 MinorVersion', async ({ request }) => {
    const res = await request.post('/api/export/als', {
      headers: { 'Content-Type': 'application/json' },
      data: {
        song: { name: 'Test', bpm: 120, key: 'C', lines: [{ text: 'Hello' }] },
        stamps: [{ id: 's1', lineIdx: 0, lineText: 'Hello', section: null, ts: 0, beats: 0 }],
      },
    });

    expect(res.status()).toBe(200);
    const buf = Buffer.from(await res.body());
    const xml = gunzipSync(buf).toString('utf-8');
    expect(xml).toContain('MinorVersion="12.0_12402"');
    expect(xml).toContain('Creator="Ableton Live 12.4.1"');
  });

  test('exported .als does NOT contain Live 11 strings', async ({ request }) => {
    const res = await request.post('/api/export/als', {
      headers: { 'Content-Type': 'application/json' },
      data: {
        song: { name: 'Test', bpm: 120, key: 'C', lines: [] },
        stamps: [],
      },
    });

    expect(res.status()).toBe(200);
    const buf = Buffer.from(await res.body());
    const xml = gunzipSync(buf).toString('utf-8');
    expect(xml).not.toContain('MinorVersion="11.0');
    expect(xml).not.toContain('Creator="Ableton Live 11');
  });
});

// --- #27: ChordPro chord preservation ---

test.describe('#27 — ChordPro chords preserved inline', () => {
  test('POST /api/song preserves chords in lyric text', async ({ request }) => {
    const res = await request.post('/api/song', {
      headers: { 'Content-Type': 'application/json' },
      data: { name: 'Amazing Grace', chordpro: CHORD_PRO_SONG },
    });

    expect(res.status()).toBe(200);
    const song = await res.json();

    const lyricLines = song.lines.filter((l: { text?: string }) => l.text);
    const firstLine = lyricLines[0]?.text ?? '';
    // Chorus starts at index 2 in the lines array (after 2 verse lines)
    const chorusLine1 = lyricLines[2]?.text ?? '';
    const chorusLine2 = lyricLines[3]?.text ?? '';

    expect(firstLine).toContain('[G]');
    expect(firstLine).toContain('[G7]');
    expect(firstLine).toContain('[C]');
    expect(chorusLine1).toContain('[C]');
    expect(chorusLine2).toContain('[D]');
  });

  test('POST /api/song returns valid song object with chords', async ({ request }) => {
    const res = await request.post('/api/song', {
      headers: { 'Content-Type': 'application/json' },
      data: { name: 'Test', chordpro: CHORD_PRO_SONG },
    });

    expect(res.status()).toBe(200);
    const song = await res.json();
    expect(song).toMatchObject({
      name: expect.any(String),
      bpm: expect.any(Number),
      key: expect.any(String),
      lines: expect.any(Array),
    });

    const allText = song.lines
      .filter((l: { text?: string }) => l.text)
      .map((l: { text?: string }) => l.text)
      .join('\n');
    expect(allText).toContain('[G]');
  });

  test('ChordPro text without chords still parses correctly', async ({ request }) => {
    const plainLyrics = '{title: Plain}\n{start_of_verse}\nJust lyrics here\n{end_of_verse}';
    const res = await request.post('/api/song', {
      headers: { 'Content-Type': 'application/json' },
      data: { name: 'Plain', chordpro: plainLyrics },
    });

    expect(res.status()).toBe(200);
    const song = await res.json();
    const lyricLines = song.lines.filter((l: { text?: string }) => l.text);
    expect(lyricLines[0]?.text).toBe('Just lyrics here');
  });
});

// --- #28: Stamp preview UX ---

test.describe('#28 — Stamp preview UX labelling', () => {
  test('preview shows "Next to stamp" label', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.workspace', { timeout: 10000 });

    const label = page.locator('.stamp-target-label');
    await expect(label).toBeVisible({ timeout: 5000 });
    await expect(label).toContainText('Next to stamp');
  });

  test('current lyric line has next-up CSS class (not "entering")', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.lyric-current', { timeout: 10000 });

    const current = page.locator('.lyric-current');
    await expect(current).toBeVisible({ timeout: 5000 });
    await expect(current).toHaveClass(/next-up/);
    await expect(current).not.toHaveClass(/entering/);
  });

  test('lyric preview displays text content', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.lyric-current', { timeout: 10000 });

    const current = page.locator('.lyric-current');
    const text = await current.textContent();
    expect(text).toBeTruthy();
    expect(text).not.toBe('—');
  });

  test('hint bar shows keyboard shortcuts', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.hintbar', { timeout: 10000 });

    const hints = page.locator('.hints');
    await expect(hints).toBeVisible({ timeout: 5000 });
    await expect(hints).toContainText('Stamp');
  });
});

// --- App health checks ---

test.describe('App — general health', () => {
  test('health endpoint responds OK', async ({ request }) => {
    const res = await request.get('/api/health');
    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(data).toEqual({ ok: true });
  });

  test('index page loads and is not blank', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.app', { timeout: 10000 });

    const header = page.locator('.wordmark .name');
    await expect(header).toBeVisible({ timeout: 5000 });
    await expect(header).toContainText('Sync');
  });

  test('404 returns JSON error for unknown endpoints', async ({ request }) => {
    const res = await request.get('/api/nonexistent');
    expect(res.status()).toBe(404);
    const data = await res.json();
    expect(data).toHaveProperty('error');
  });
});