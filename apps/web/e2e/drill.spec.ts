import { join } from 'node:path';
import { enumerateLines, treeFromPgn } from '@processchess/core';
import { readFileSync } from 'node:fs';
import { type Page, expect, test } from '@playwright/test';

const FIXTURE = join(import.meta.dirname, '../../../packages/core/test/fixtures/repertoire.pgn');
// The first line of the fixture (main line), user moves only.
const MAIN_LINE_USER_MOVES = ['e4', 'Nf3', 'Bc4', 'c3', 'd4'];
const TOTAL_LINES = enumerateLines(
  treeFromPgn(readFileSync(FIXTURE, 'utf8'), { userColor: 'w', newId: counter() }).tree,
).length;

function counter() {
  let i = 0;
  return () => `n${++i}`;
}

async function ready(page: Page) {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Your collections' })).toBeVisible();
  await expect(page.getByTestId('not-persistent')).toHaveCount(0);
}

async function playSan(page: Page, san: string) {
  const input = page.getByLabel('Your move (SAN)');
  await input.fill(san);
  await input.press('Enter');
}

async function waitSaved(page: Page) {
  await expect(page.locator('[data-saving="false"]')).toBeVisible();
}

test('import the fixture, train a line until clean, reload keeps attempts and state', async ({
  page,
}) => {
  await ready(page);
  await page.getByLabel('Name', { exact: true }).fill('E2E repertoire');
  await page.getByLabel('PGN file').setInputFiles(FIXTURE);
  await page.getByRole('button', { name: 'Import' }).click();
  await expect(page.getByRole('status')).toContainText('Imported 2 game(s)');
  await expect(page.getByRole('row', { name: /E2E repertoire/ })).toContainText('White');

  await page.getByRole('link', { name: 'Train' }).click();
  const cleanCounter = page.getByTestId('clean-counter');
  await expect(cleanCounter).toHaveText(`Clean lines: 0 / ${TOTAL_LINES}`);
  await expect(page.getByTestId('opening-bar')).toContainText('Starting position');

  for (let pass = 1; pass <= 3; pass++) {
    for (const san of MAIN_LINE_USER_MOVES) await playSan(page, san);
    await expect(page.getByTestId('announcement')).toContainText('Line complete without mistakes');
    if (pass < 3) await page.keyboard.press('r'); // repeat the same line
  }
  await expect(cleanCounter).toHaveText(`Clean lines: 1 / ${TOTAL_LINES}`);
  await expect(page.getByTestId('opening-bar')).toContainText('C54');
  await waitSaved(page);

  await page.reload();
  await expect(cleanCounter).toHaveText(`Clean lines: 1 / ${TOTAL_LINES}`);

  await page.getByRole('link', { name: 'E2E repertoire' }).click();
  await page.getByRole('button', { name: '3. Bc4', exact: true }).click();
  const history = page.getByTestId('move-history');
  await expect(history.locator('li[data-result="correct"]')).toHaveCount(3);
  await expect(history.getByTestId('first-try')).toContainText('100%');
});

test('a wrong move is recorded as wrong with the move actually played', async ({ page }) => {
  await ready(page);
  await page.getByLabel('or paste PGN text').fill('1. e4 e5 2. Nf3 Nc6 *');
  await page.getByLabel('Name', { exact: true }).fill('Short');
  await page.getByRole('button', { name: 'Import' }).click();
  await page.getByRole('link', { name: 'Train' }).click();

  await playSan(page, 'd4');
  await expect(page.getByTestId('out-of-repertoire')).toHaveText('Out of repertoire: d4');
  await expect(page.getByTestId('announcement')).toContainText('The right move is e4');
  await playSan(page, 'e4');
  await expect(page.getByTestId('out-of-repertoire')).toHaveCount(0);

  // graded hint with the H key, then the move
  await page.getByLabel('Your move (SAN)').blur();
  await page.keyboard.press('h');
  await expect(page.getByTestId('announcement')).toHaveText('Move a Knight.');
  await playSan(page, 'Nf3');
  await expect(page.getByTestId('announcement')).toContainText('with mistakes or hints');
  await waitSaved(page);

  await page.getByRole('link', { name: 'Short' }).click();
  await page.getByRole('button', { name: '1. e4', exact: true }).click();
  const history = page.getByTestId('move-history');
  await expect(history.locator('li[data-result="wrong"]')).toHaveCount(1);
  await expect(history.getByTestId('most-wrong')).toHaveText('Most frequent mistake: d4 (1×)');
  await expect(history.getByTestId('first-try')).toContainText('0%');

  await page.getByRole('button', { name: '2. Nf3', exact: true }).click();
  await expect(history.locator('li[data-result="hint"]')).toHaveCount(1);
});

test('works offline after the first load', async ({ page, context }) => {
  await ready(page);
  const cached = await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    const keys = await Promise.all(
      (await caches.keys()).map(async (k) =>
        (await (await caches.open(k)).keys()).map((r) => r.url),
      ),
    );
    return keys.flat();
  });
  // shell, SQLite worker and wasm are precached at install time
  expect(cached.some((u) => u.endsWith('/drill'))).toBe(true);
  expect(cached.some((u) => /opfs\.worker-.*\.js$/.test(u))).toBe(true);
  expect(cached.some((u) => u.endsWith('.wasm'))).toBe(true);
  await page.getByLabel('or paste PGN text').fill('1. d4 d5 *');
  await page.getByRole('button', { name: 'Import' }).click();
  await expect(page.getByRole('status')).toContainText('Imported 1 game(s)');

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Your collections' })).toBeVisible();
  await page.getByRole('link', { name: 'Train' }).click();
  await expect(page.getByTestId('clean-counter')).toHaveText('Clean lines: 0 / 1');
  await playSan(page, 'd4');
  await expect(page.getByTestId('announcement')).toContainText('Line complete without mistakes');
});

test('falls back to memory with a visible banner when OPFS is unavailable', async ({ context }) => {
  // The opfs-sahpool VFS is exclusive: a second tab cannot open it and must fall back.
  const first = await context.newPage();
  await ready(first);
  const second = await context.newPage();
  await second.goto('/');
  await expect(second.getByTestId('not-persistent')).toContainText('data will not be saved');
  await expect(second.getByRole('heading', { name: 'Your collections' })).toBeVisible();
});
