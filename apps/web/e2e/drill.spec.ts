import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { enumerateLines, treeFromPgn } from '@processchess/core';
import { type Locator, type Page, expect, test } from '@playwright/test';

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
  await expect(page.getByTestId('empty-state')).toBeVisible(); // storage ready, fresh profile
  await expect(page.getByTestId('not-persistent')).toHaveCount(0);
}

/** Opens the import dialog with the visible "Import PGN" button. */
async function openImport(page: Page): Promise<Locator> {
  await page.getByRole('button', { name: /import pgn/i }).click();
  const dialog = page.getByRole('dialog', { name: 'Import PGN' });
  await expect(dialog).toBeVisible();
  return dialog;
}

/** Picks a file through the browser file chooser opened by the visible file control. */
async function chooseFile(page: Page, dialog: Locator, path: string) {
  const chooser = page.waitForEvent('filechooser');
  await dialog.getByLabel('PGN file').click();
  await (await chooser).setFiles(path);
}

async function importPgnText(page: Page, name: string, pgn: string) {
  const dialog = await openImport(page);
  await dialog.getByLabel('Name', { exact: true }).fill(name);
  await dialog.getByLabel('or paste PGN text').fill(pgn);
  await dialog.getByRole('button', { name: 'Import', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expectSelected(page, name);
}

/** The imported/created repertoire becomes the selected one. */
async function expectSelected(page: Page, name: string) {
  const reps = page.getByRole('region', { name: 'Repertoires' });
  await expect(reps.getByRole('button', { pressed: true })).toContainText(name);
}

async function playSan(page: Page, san: string) {
  const input = page.getByLabel('Your move (SAN)');
  await input.fill(san);
  await input.press('Enter');
}

async function startTraining(page: Page) {
  await page.getByRole('tab', { name: 'Training' }).click();
  await page.getByRole('button', { name: /train all lines/i }).click();
  await expect(page.getByTestId('clean-counter')).toBeVisible();
}

const moveTree = (page: Page) => page.getByRole('navigation', { name: 'Moves', exact: true });

async function waitSaved(page: Page) {
  await expect(page.locator('[data-saving="false"]')).toBeVisible();
}

test('the home page always shows the Import PGN button, with an empty-state invite', async ({
  page,
}) => {
  await page.goto('/');
  // visible immediately, even before the database is ready
  await expect(page.getByRole('button', { name: /import pgn/i })).toBeVisible();
  await expect(page.getByTestId('empty-state')).toContainText('No collections yet');
  await expect(page.getByTestId('empty-state')).toContainText('Import PGN');
  const dialog = await openImport(page);
  await dialog.getByRole('button', { name: 'Close' }).click();
  await expect(dialog).toBeHidden();
});

test('explore the ECO graph, save a line, add the book theory and train it', async ({ page }) => {
  await ready(page);
  // search the dataset and jump to the opening
  await page.getByRole('searchbox').fill('najdorf');
  await page.getByRole('button', { name: /B90 Sicilian Defense: Najdorf Variation 1\.e4/ }).click();
  const bar = page.getByTestId('opening-bar');
  await expect(bar).toContainText('B90');
  await expect(bar).toContainText('Najdorf Variation');
  // book moves from here come from the graph
  const book = page.getByRole('list', { name: 'Book moves' });
  await expect(book.getByRole('button').first()).toBeVisible();

  // one click saves the line in a new Black repertoire
  await page.getByRole('button', { name: 'Black repertoire', exact: true }).click();
  await expectSelected(page, 'Black repertoire');
  await expect(page.getByRole('status')).toContainText('Line added (10 new moves)');

  // add the theory from the Najdorf for Black
  const addBook = page.getByRole('button', { name: /Add the theory from here/ });
  const label = (await addBook.textContent()) ?? '';
  const lines = Number(/\((?:first )?(\d+) lines\)/.exec(label)![1]);
  await addBook.click();
  await expect(page.getByRole('status')).toContainText(`Added ${lines} book lines`);

  // the repertoire tab shows the tree at the board position
  await page.getByRole('tab', { name: 'Repertoire' }).click();
  await expect(moveTree(page).getByRole('button', { name: 'a6', exact: true })).toHaveAttribute(
    'aria-current',
    'true',
  );

  // training starts from the same repertoire, opponent first
  await page.getByRole('tab', { name: 'Training' }).click();
  await expect(page.getByRole('button', { name: /train all lines/i })).toContainText(`(${lines})`);
  await page.getByRole('button', { name: /train all lines/i }).click();
  await expect(page.getByTestId('clean-counter')).toHaveText(`Clean lines: 0 / ${lines}`);
  await expect(page.getByTestId('announcement')).toContainText('Opponent played e4');
});

test('import the fixture, train a line until clean, reload keeps attempts and state', async ({
  page,
}) => {
  await ready(page);
  const dialog = await openImport(page);
  await dialog.getByLabel('Name', { exact: true }).fill('E2E repertoire');
  await chooseFile(page, dialog, FIXTURE);
  await dialog.getByRole('button', { name: 'Import', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('status')).toContainText('Imported 2 game(s)');
  await expectSelected(page, 'E2E repertoire');
  const rep = page.getByRole('button', { name: /E2E repertoire/ });
  await expect(rep).toContainText(`0/${TOTAL_LINES} lines clean`);

  await startTraining(page);
  const cleanCounter = page.getByTestId('clean-counter');
  await expect(cleanCounter).toHaveText(`Clean lines: 0 / ${TOTAL_LINES}`);
  for (let pass = 1; pass <= 3; pass++) {
    for (const san of MAIN_LINE_USER_MOVES) await playSan(page, san);
    await expect(page.getByTestId('announcement')).toContainText('Line complete without mistakes');
    if (pass < 3) await page.keyboard.press('r'); // repeat the same line
  }
  await expect(cleanCounter).toHaveText(`Clean lines: 1 / ${TOTAL_LINES}`);
  await expect(page.getByTestId('opening-bar')).toContainText('C54');
  await waitSaved(page);

  await page.reload();
  await expect(rep).toContainText(`1/${TOTAL_LINES} lines clean`);
  await startTraining(page);
  await expect(cleanCounter).toHaveText(`Clean lines: 1 / ${TOTAL_LINES}`);
  await page.getByRole('button', { name: 'Stop' }).click();

  await page.getByRole('tab', { name: 'Repertoire' }).click();
  await moveTree(page).getByRole('button', { name: '3. Bc4', exact: true }).click();
  const history = page.getByTestId('move-history');
  await expect(history.locator('li[data-result="correct"]')).toHaveCount(3);
  await expect(history.getByTestId('first-try')).toContainText('100%');
});

test('a wrong move is recorded as wrong with the move actually played', async ({ page }) => {
  await ready(page);
  await importPgnText(page, 'Short', '1. e4 e5 2. Nf3 Nc6 *');
  await startTraining(page);

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

  await page.getByRole('tab', { name: 'Repertoire' }).click();
  await moveTree(page).getByRole('button', { name: '1. e4', exact: true }).click();
  const history = page.getByTestId('move-history');
  await expect(history.locator('li[data-result="wrong"]')).toHaveCount(1);
  await expect(history.getByTestId('most-wrong')).toHaveText('Most frequent mistake: d4 (1×)');
  await expect(history.getByTestId('first-try')).toContainText('0%');

  await moveTree(page).getByRole('button', { name: '2. Nf3', exact: true }).click();
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
  expect(cached.some((u) => u.endsWith('/'))).toBe(true);
  expect(cached.some((u) => /opfs\.worker-.*\.js$/.test(u))).toBe(true);
  expect(cached.some((u) => u.endsWith('.wasm'))).toBe(true);
  await importPgnText(page, 'Queen pawn', '1. d4 d5 *');

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('button', { name: /Queen pawn/ })).toBeVisible();
  await startTraining(page);
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
  await expect(second.getByRole('button', { name: /import pgn/i })).toBeVisible();
});
