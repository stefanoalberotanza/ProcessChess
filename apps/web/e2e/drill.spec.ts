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
  // storage ready, this week's repertoires created
  await expect(
    page
      .getByRole('region', { name: 'Repertoires' })
      .getByRole('button', { name: /^Week \d+ · White/ }),
  ).toBeVisible();
  await expect(page.getByTestId('not-persistent')).toHaveCount(0);
}

/** Archives this week's repertoires, for tests that need a profile without repertoires. */
async function archiveWeek(page: Page) {
  const list = page.getByRole('region', { name: 'Repertoires' });
  for (const color of ['White', 'Black']) {
    const week = list.getByRole('button', { name: new RegExp(String.raw`^Week \d+ · ${color}`) });
    await week.click();
    await list.getByRole('button', { name: 'Archive', exact: true }).click();
    await expect(week).toHaveCount(0);
  }
}

/** Opens the openings panel on the by-name archive. */
async function explore(page: Page) {
  await page.getByRole('tab', { name: 'Practise by name' }).click();
}

/** Enters a family of the opening lab (the roots of the by-name list); returns its list. */
async function enterFamily(page: Page, name = "King's Pawn Games"): Promise<Locator> {
  await explore(page);
  await page
    .getByRole('list', { name: 'Opening families' })
    .getByRole('button', { name: `Open ${name}`, exact: true })
    .click();
  return page.getByRole('list', { name: `Variations of ${name}` });
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
  await expect(page.locator('[data-saving="true"]')).toHaveCount(0);
}

test('the home page always shows the Import PGN button', async ({ page }) => {
  await page.goto('/');
  // visible immediately, even before the database is ready
  await expect(page.getByRole('button', { name: /import pgn/i })).toBeVisible();
  const dialog = await openImport(page);
  await dialog.getByRole('button', { name: 'Close' }).click();
  await expect(dialog).toBeHidden();
});

test('the openings tab has no Today view', async ({ page }) => {
  await ready(page);
  await explore(page);
  await expect(page.getByRole('tab', { name: 'Today' })).toHaveCount(0);
  await expect(page.getByRole('searchbox')).toHaveAttribute(
    'placeholder',
    'Search an opening or paste a FEN',
  );
});

test('a pasted FEN finds the opening whatever move order reached it', async ({ page }) => {
  await ready(page);
  await explore(page);
  // the Scotch Game position, reached here by 1.Nf3 Nc6 2.e4 e5 3.d4
  await page
    .getByRole('searchbox')
    .fill('r1bqkbnr/pppp1ppp/2n5/4p3/3PP3/5N2/PPP2PPP/RNBQKB1R b KQkq - 0 3');
  const found = page.getByRole('list', { name: 'Openings found' });
  await expect(found.getByRole('button').first()).toHaveAccessibleName('Open Scotch Game');
  await expect(
    found.getByRole('button', { name: 'Open Scotch Game: Göring Gambit', exact: true }),
  ).not.toHaveCount(0);
});

test('week repertoires: one per colour, three lines each, selected in Training', async ({
  page,
}) => {
  await ready(page);
  const list = page.getByRole('region', { name: 'Repertoires' });
  const white = list.getByRole('button', { name: /^Week \d+ · White · Random/ });
  const black = list.getByRole('button', { name: /^Week \d+ · Black · Random/ });
  await expect(white).toBeVisible();
  await expect(black).toBeVisible();
  await expect(white).toContainText(/0\/[123] lines clean/);
  await expect(black).toContainText(/0\/[123] lines clean/);
  await expect(white.getByTestId('week-badge')).toHaveText('Week');
  // a reload in the same week creates nothing new
  await page.reload();
  await expect(list.getByRole('button', { name: /^Week \d+ · White/ })).toHaveCount(1);
  // Training selects this week's White repertoire
  await page.getByRole('tab', { name: 'Training' }).click();
  await expect(list.getByRole('button', { name: /^Week \d+ · White/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});

test('explore the ECO graph, save a line, add the book theory and train it', async ({ page }) => {
  await ready(page);
  await explore(page);
  // search the dataset and jump to the opening
  await page.getByRole('searchbox').fill('najdorf');
  await page
    .getByRole('list', { name: 'Openings found' })
    .getByRole('button', { name: 'Open Sicilian Defense: Najdorf Variation', exact: true })
    .first() // shortest line first; the dataset has transpositions with the same name
    .click();
  const bar = page.getByTestId('opening-bar');
  // no ECO codes in the UI, just names
  await expect(bar).not.toContainText('B90');
  await expect(page.getByRole('button', { name: /^Practise [A-E]\d\d /i })).toHaveCount(0);
  await expect(bar).toContainText('Najdorf Variation');

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
  const bar = page.getByTestId('opening-bar');
  await expect(bar).toContainText('Classical Variation, Center Attack');
  // a long name wraps inside the board width instead of pushing the side panel
  const barBox = (await bar.boundingBox())!;
  const boardBox = (await page.locator('.board').first().boundingBox())!;
  // the board's wooden frame is a margin around it (Board.svelte: 0.9rem on each side)
  const frame = await page
    .locator('.board')
    .first()
    .evaluate((el) => parseFloat(getComputedStyle(el).marginLeft) * 2);
  expect(barBox.width).toBeLessThanOrEqual(boardBox.width + frame + 1);
  // the title shows only the deepest level; the full path is under the board
  await expect(bar).not.toContainText('Italian Game');
  const path = page.getByTestId('opening-path');
  await expect(path).toContainText("King's Pawn Games");
  await expect(path).toContainText('Italian Game');
  await expect(path).toContainText('Classical Variation, Center Attack');
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

test('graph view: a board per node, connected to the main board and the repertoire', async ({
  page,
}) => {
  await ready(page);
  await page.getByRole('tab', { name: 'Graph' }).click();
  const nodes = page.getByRole('list', { name: 'Opening graph' });
  await expect(nodes.locator('[aria-current="true"]')).toHaveAccessibleName(/^Start/);
  // every node draws its own board
  await expect(nodes.locator('svg').first()).toBeVisible();

  // clicking a node moves the shared board
  await nodes.getByRole('button', { name: /^e4 — King's Pawn Game/ }).click();
  // a one-move name is a style label, not an opening (ADR 012)
  await expect(page.getByTestId('opening-label')).toHaveText("King's Pawn Games");
  await expect(page.getByTestId('opening-bar')).not.toContainText('B00');
  await expect(nodes.locator('[aria-current="true"]')).toHaveAccessibleName(/^e4/);
  // the previous position stays visible as part of the path
  await expect(nodes.getByRole('button', { name: /^Start/ })).toBeVisible();

  // moves played on the board move the graph
  await playSan(page, 'e5');
  await expect(nodes.locator('[aria-current="true"]')).toHaveAccessibleName(/^e5/);

  // saved lines are marked in the graph
  await page.getByRole('button', { name: 'White repertoire', exact: true }).click();
  await expectSelected(page, 'White repertoire');
  await expect(nodes.locator('[aria-current="true"]')).toHaveAccessibleName(/In your repertoire/);
});

test('opening lab: practise by name, rebuild the moves, history per opening and per move', async ({
  page,
}) => {
  await ready(page);
  await explore(page);
  // the first level lists the three families; inside one, a subfamily (a container), then a
  // variation, the only level that is practised
  const inFamily = await enterFamily(page);
  await inFamily.getByRole('button', { name: 'Open Sicilian Defense', exact: true }).click();
  const focusCard = page.getByTestId('lab-focus');
  await expect(focusCard.getByRole('button', { name: /^Practise/ })).toHaveCount(0);
  const family = 'Sicilian Defense: Najdorf Variation';
  await page
    .getByRole('list', { name: 'Variations of Sicilian Defense' })
    .getByRole('button', { name: `Open ${family}`, exact: true })
    .click();
  await expect(focusCard).toContainText('Najdorf Variation');
  await expect(page.getByRole('navigation', { name: 'Opening levels' })).toContainText(
    'Najdorf Variation',
  );
  await expect(focusCard.getByTestId('mastery')).toHaveAccessibleName('Not practised yet');
  const lineText = (await focusCard.locator('.line').textContent())!.trim();
  // "1.e4 c5 2.Nf3 …" → SAN moves to type
  const sans = lineText.split(' ').map((m) => m.replace(/^\d+\./, ''));
  expect(sans.length).toBeGreaterThanOrEqual(10);
  await focusCard.getByRole('button', { name: `Practise ${family}` }).click();
  // both sides: switch the automatic opponent off
  await page.getByRole('checkbox', { name: 'Play the opponent’s moves automatically' }).uncheck();

  const progress = page.getByTestId('lab-progress');
  await expect(progress).toHaveText(`Move 1 of ${sans.length}`);
  // first run: one mistake on the second move
  await playSan(page, sans[0]!);
  const wrong = sans[1] === 'e5' ? 'c5' : 'e5';
  await playSan(page, wrong);
  await expect(page.getByTestId('out-of-line')).toHaveText(`Not the opening move: ${wrong}`);
  await expect(page.getByTestId('announcement')).toContainText(`The right move is ${sans[1]}`);
  for (const san of sans.slice(1)) await playSan(page, san);
  await expect(progress).toHaveText('Opening complete');
  await expect(page.getByTestId('announcement')).toHaveText(
    'Opening rebuilt with 1 mistake(s) and 0 hint(s).',
  );
  const runs = page.getByTestId('lab-runs');
  await expect(runs.locator('li')).toHaveCount(1);
  await expect(runs.locator('li[data-clean="false"]')).toHaveCount(1);

  // three clean repetitions make it automatic
  for (let i = 0; i < 3; i++) {
    await page.getByLabel('Your move (SAN)').blur();
    await page.keyboard.press('r');
    for (const san of sans) await playSan(page, san);
    await expect(page.getByTestId('announcement')).toHaveText('Opening rebuilt without mistakes.');
  }
  await expect(runs.locator('li')).toHaveCount(4);
  await expect(page.getByRole('row', { name: new RegExp(`^2\\.${sans[2]}`) })).toBeVisible();
  await waitSaved(page);

  // back in the list the opening shows as automatic, and it survives a reload
  await page.getByRole('button', { name: 'Back to the list' }).click();
  await expect(focusCard.getByTestId('mastery')).toHaveAccessibleName(/Automatic/);
  await page.reload();
  await (
    await enterFamily(page)
  )
    .getByRole('button', { name: 'Open Sicilian Defense', exact: true })
    .click();
  const familyRow = page
    .getByRole('list', { name: 'Variations of Sicilian Defense' })
    .getByRole('listitem')
    .filter({ has: page.getByRole('button', { name: `Open ${family}`, exact: true }) });
  await expect(familyRow.getByTestId('mastery')).toHaveAccessibleName(/Automatic/);
  // the family level rolls up its lines: the automatic one counts
  const rollup = page.getByTestId('lab-focus').getByTestId('mastery-rollup');
  await expect(rollup).toHaveAccessibleName(
    /^[1-9]\d* of \d+ lines automatic \([1-9]\d* practised\)$/,
  );
  await expect(rollup).toHaveText(/^[1-9]\d* \/ \d+ lines$/);

  // the per-edge history colours the graph: the practised first move is green
  await page.getByRole('tab', { name: 'Graph' }).click();
  await expect(page.locator('.edges path.good').first()).toBeAttached();
});

test('opening lab: levels follow the board', async ({ page }) => {
  await ready(page);
  await explore(page);
  const levels = page.getByRole('navigation', { name: 'Opening levels' });
  await (
    await enterFamily(page)
  )
    .getByRole('button', { name: 'Open Sicilian Defense', exact: true })
    .click();
  await expect(page.getByTestId('opening-bar')).toContainText('Sicilian Defense');
  await page
    .getByRole('list', { name: 'Variations of Sicilian Defense' })
    .getByRole('button', { name: 'Open Sicilian Defense: Najdorf Variation', exact: true })
    .click();
  await expect(levels).toContainText('Najdorf Variation');
  await expect(page.getByTestId('opening-bar')).toContainText('Najdorf Variation');
  // moves played on the board move the level too: back two plies → the Sicilian level
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft');
  await expect(levels.locator('[aria-current="true"]')).not.toHaveText('Najdorf Variation');
  // the breadcrumb goes back up
  await levels.getByRole('button', { name: 'All openings' }).click();
  await expect(page.getByRole('list', { name: 'Opening families' })).toBeVisible();
  await expect(page.getByTestId('opening-bar')).toContainText('Starting position');
});

test('opening lab: family > subfamily > variation, one-move names are not openings', async ({
  page,
}) => {
  await ready(page);
  await explore(page);
  const families = page.getByRole('list', { name: 'Opening families' });
  const levels = page.getByRole('navigation', { name: 'Opening levels' });
  // the roots are the three families; the style's own name is not an opening
  await expect(
    families.getByRole('button', { name: "Open King's Pawn Games", exact: true }),
  ).toBeVisible();
  await expect(
    families.getByRole('button', { name: "Open Queen's Pawn Games", exact: true }),
  ).toBeVisible();
  await expect(
    families.getByRole('button', { name: "Open King's Pawn Game", exact: true }),
  ).toHaveCount(0);
  await families.getByRole('button', { name: "Open King's Pawn Games", exact: true }).click();
  await expect(page.getByTestId('lab-focus')).toContainText("King's Pawn Games");
  await expect(page.getByRole('button', { name: 'Practise this opening' })).toHaveCount(0);
  // inside: subfamilies and variations side by side
  const inside = page.getByRole('list', { name: "Variations of King's Pawn Games" });
  await expect(
    inside.getByRole('button', { name: 'Open Sicilian Defense', exact: true }),
  ).toContainText('Subfamily');
  await page
    .getByRole('region', { name: 'Practise by name' })
    .getByRole('button', { name: /^Show all/ })
    .click();
  await expect(
    inside.getByRole('button', { name: "Open King's Pawn Game: King's Head Opening", exact: true }),
  ).toContainText('Variation');
  // the breadcrumb goes back to the family level
  await inside.getByRole('button', { name: 'Open Sicilian Defense', exact: true }).click();
  await expect(levels).toContainText("King's Pawn Games");
});

test('exports the FEN of the board position', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await ready(page);
  const fen = page.getByLabel('FEN', { exact: true });
  await expect(fen).toHaveValue('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
  await playSan(page, 'e4');
  await expect(fen).toHaveValue('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1');
  await page.getByRole('button', { name: 'Copy FEN' }).click();
  await expect(page.getByText('Copied.')).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1',
  );
});

test('opening lab: White and Black openings are marked, filtered and practised from their side', async ({
  page,
}) => {
  await ready(page);
  await explore(page);
  const families = await enterFamily(page);
  // data/openings: "Sicilian Defense" is 1.e4 c5 (Black), "Italian Game" ends with 3.Bc4 (White)
  const row = (name: string) =>
    families
      .getByRole('listitem')
      .filter({ has: page.getByRole('button', { name: `Open ${name}`, exact: true }) });
  await expect(row('Sicilian Defense').getByRole('img', { name: 'Black opening' })).toBeVisible();
  await expect(row('Italian Game').getByRole('img', { name: 'White opening' })).toBeVisible();

  await page.getByRole('radio', { name: 'Black' }).click();
  await expect(families.locator('[data-side="w"]')).toHaveCount(0);
  await expect(families.locator('[data-side="b"]').first()).toBeVisible();
  await page.getByRole('radio', { name: 'White' }).click();
  await expect(families.locator('[data-side="b"]')).toHaveCount(0);
  await page.getByRole('radio', { name: 'All', exact: true }).click();

  // practising a Black opening (a variation: subfamilies are containers) shows the board from
  // Black's side
  await families.getByRole('button', { name: 'Open Sicilian Defense', exact: true }).click();
  await page
    .getByRole('list', { name: 'Variations of Sicilian Defense' })
    .getByRole('button', { name: 'Open Sicilian Defense: Najdorf Variation', exact: true })
    .click();
  const plies = ((await page.getByTestId('lab-focus').locator('.line').textContent()) ?? '')
    .trim()
    .split(' ').length;
  await page
    .getByTestId('lab-focus')
    .getByRole('button', { name: 'Practise Sicilian Defense: Najdorf Variation' })
    .click();
  await expect(page.locator('.cg-wrap.orientation-black')).toBeVisible();
  // the automatic opponent (on by default) plays White's moves: 1.e4 is already on the board
  const auto = page.getByRole('checkbox', { name: 'Play the opponent’s moves automatically' });
  await expect(auto).toBeChecked();
  await expect(page.getByTestId('lab-progress')).toHaveText(`Move 2 of ${plies}`);
  await expect(page.getByTestId('announcement')).toHaveText(
    `Play your ${Math.floor(plies / 2)} moves of the opening; the opponent plays by itself. Opponent played e4.`,
  );
  await playSan(page, 'c5');
  await expect(page.getByTestId('lab-progress')).toHaveText(`Move 4 of ${plies}`);
  await expect(page.getByTestId('announcement')).toContainText('Opponent played Nf3.');
  // switched off, the run starts again and both sides are asked
  await auto.uncheck();
  await expect(page.getByTestId('lab-progress')).toHaveText(`Move 1 of ${plies}`);
  await page.getByRole('button', { name: 'Back to the list' }).click();
  await expect(page.locator('.cg-wrap.orientation-white')).toBeVisible();
});

test('"out of theory" only appears off the book, not on unnamed book positions', async ({
  page,
}) => {
  await ready(page);
  await explore(page);
  // an Indian Defense practice line: its positions are on book lines, named or not
  await (
    await enterFamily(page, "Queen's Pawn Games")
  )
    .getByRole('button', { name: 'Open Indian Defense', exact: true })
    .click();
  // Indian Defense is a container: practise its most used variation
  const variation = page
    .getByRole('list', { name: 'Variations of Indian Defense' })
    .getByRole('button', { name: /^Open / })
    .first();
  const name = ((await variation.getAttribute('aria-label')) ?? '').replace(/^Open /, '');
  await variation.click();
  const focusCard = page.getByTestId('lab-focus');
  const sans = ((await focusCard.locator('.line').textContent()) ?? '')
    .trim()
    .split(' ')
    .map((m) => m.replace(/^\d+\./, ''));
  await focusCard.getByRole('button', { name: `Practise ${name}`, exact: true }).click();
  await page.getByRole('checkbox', { name: 'Play the opponent’s moves automatically' }).uncheck();
  for (const san of sans) {
    await playSan(page, san);
    await expect(page.getByTestId('out-of-theory')).toHaveCount(0);
  }
  await expect(page.getByTestId('lab-progress')).toHaveText('Opening complete');

  // a real departure from the book is still flagged
  await page.getByRole('button', { name: 'Back to the list' }).click();
  await page
    .getByRole('navigation', { name: 'Opening levels' })
    .getByRole('button', { name: 'All openings' })
    .click();
  for (const san of ['h4', 'h5', 'Rh3']) await playSan(page, san);
  await expect(page.getByTestId('out-of-theory')).toBeVisible();
});

test('from this position: every dictionary branch, grouped, variations on demand', async ({
  page,
}) => {
  await ready(page);
  // data/openings/c.tsv: after 1.e4 e5 2.Nf3 come 2...Nc6 (King's Knight Opening: Normal
  // Variation), 2...Nf6 (Petrov's Defense), 2...d6 (Philidor Defense)
  for (const san of ['e4', 'e5', 'Nf3']) await playSan(page, san);
  await expect(page.getByRole('tab', { name: /^From this position/ })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  const groups = page.getByRole('list', { name: 'From this position' });
  await expect(
    groups.getByRole('button', { name: "Open Petrov's Defense", exact: true }),
  ).toBeVisible();
  await expect(
    groups.getByRole('button', { name: 'Open Philidor Defense', exact: true }),
  ).toBeVisible();
  const knight = groups.getByRole('button', { name: "Open King's Knight Opening", exact: true });
  await expect(knight).toContainText('2…Nc6');
  // the Ruy Lopez comes one name later (after 2...Nc6)
  await expect(groups.getByRole('button', { name: 'Open Ruy Lopez', exact: true })).toHaveCount(0);

  await page.getByRole('button', { name: /^Show variations/ }).click();
  const variations = page.getByRole('list', { name: 'Variations from this position' });
  const normal = variations.getByRole('button', {
    name: "Open King's Knight Opening: Normal Variation",
    exact: true,
  });
  await expect(normal).toContainText('2…Nc6');
  await normal.click();
  await expect(page.getByTestId('opening-bar')).toContainText('Normal Variation');
  // one move further, the branches follow the board: now the Ruy Lopez is there
  await expect(groups.getByRole('button', { name: 'Open Ruy Lopez', exact: true })).toContainText(
    '3.Bb5',
  );
});

test('from this position works after a transposition (Scotch Game by 1.Nf3)', async ({ page }) => {
  await ready(page);
  // 1.Nf3 Nc6 2.e4 e5 3.d4 is the C44 Scotch Game position, off the dataset's move order
  for (const san of ['Nf3', 'Nc6', 'e4', 'e5', 'd4']) await playSan(page, san);
  await expect(page.getByRole('tab', { name: /^From this position/ })).toBeEnabled();
  await expect(page.getByRole('tab', { name: /^From this position/ })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(page.getByRole('list', { name: 'From this position' })).toContainText('Scotch Game');
});

test('from this position is off for a collection with a custom start', async ({ page }) => {
  await ready(page);
  await explore(page);
  // standard position without the a2 pawn: moves are not from the initial position
  await importPgnText(
    page,
    'Custom start',
    '[SetUp "1"]\n[FEN "rnbqkbnr/pppppppp/8/8/8/8/1PPPPPPP/RNBQKBNR w KQkq - 0 1"]\n\n1. e4 e5 *',
  );
  await page.getByRole('tab', { name: 'Openings' }).click();
  await expect(page.getByRole('heading', { name: 'Practise by name' })).toBeVisible();
  await expect(page.getByRole('list', { name: 'From this position' })).toHaveCount(0);
  await expect(page.getByRole('tab', { name: /^From this position/ })).toBeDisabled();
});

test('subfamilies are containers; a variation run does not tick its neighbours', async ({
  page,
}) => {
  await ready(page);
  await archiveWeek(page);
  await explore(page);
  await page.getByRole('searchbox').fill('Caro-Kann Defense');
  await page
    .getByRole('list', { name: 'Openings found' })
    .getByRole('button', { name: 'Open Caro-Kann Defense', exact: true })
    .first()
    .click();
  const focusCard = page.getByTestId('lab-focus');
  await expect(focusCard).toContainText('Caro-Kann Defense');
  await expect(focusCard.getByRole('button', { name: /^Practise/ })).toHaveCount(0);
  await expect(focusCard.getByTestId('mastery-rollup')).toBeVisible();

  // practise the Advance Variation to the end
  const variations = page.getByRole('list', { name: 'Variations of Caro-Kann Defense' });
  await variations
    .getByRole('button', { name: 'Open Caro-Kann Defense: Advance Variation', exact: true })
    .click();
  const sans = (await focusCard.locator('.line').textContent())!
    .trim()
    .split(' ')
    .map((m) => m.replace(/^\d+\./, ''));
  await focusCard
    .getByRole('button', { name: 'Practise Caro-Kann Defense: Advance Variation' })
    .click();
  await page.getByRole('checkbox', { name: 'Play the opponent’s moves automatically' }).uncheck();
  for (const san of sans) await playSan(page, san);
  await expect(page.getByTestId('lab-progress')).toHaveText('Opening complete');
  await waitSaved(page);
  await page.getByRole('button', { name: 'Back to the list' }).click();
  // its own sub-variations are untouched (the list title uses the level's short label)
  const subs = page.getByRole('list', { name: 'Variations of Advance Variation' });
  for (const m of await subs.getByTestId('mastery').all())
    await expect(m).toHaveAccessibleName('Not practised yet');
});

test('add a variation to the repertoire from the openings panel', async ({ page }) => {
  await ready(page);
  await explore(page);
  await (
    await enterFamily(page)
  )
    .getByRole('button', { name: 'Open Sicilian Defense', exact: true })
    .click();
  // a subfamily is a container: nothing to add
  await expect(
    page.getByTestId('lab-focus').getByRole('button', { name: /to the repertoire$/ }),
  ).toHaveCount(0);
  const name = 'Sicilian Defense: Najdorf Variation';
  const row = page
    .getByRole('list', { name: 'Variations of Sicilian Defense' })
    .getByRole('listitem')
    .filter({ has: page.getByRole('button', { name: `Open ${name}`, exact: true }) });
  await row.getByRole('button', { name: `Add ${name} to the repertoire` }).click();
  // a Black opening goes to the Black repertoire, created and selected
  await expectSelected(page, 'Black repertoire');
  await expect(page.getByRole('status')).toContainText('Line added');
  await expect(row.getByRole('button', { name: `Add ${name} to the repertoire` })).toHaveCount(0);
  await expect(row.getByTitle('In your repertoire')).toBeVisible();
});

test('the album uncovers a variation once practised', async ({ page }) => {
  await ready(page);
  await archiveWeek(page);
  await (
    await enterFamily(page)
  )
    .getByRole('button', { name: 'Open Sicilian Defense', exact: true })
    .click();
  const progress = page.getByTestId('album-progress');
  await expect(progress).toHaveText(/^0 \/ \d+ discovered$/);
  const name = 'Sicilian Defense: Najdorf Variation';
  const tile = page
    .getByRole('list', { name: 'Variations of Sicilian Defense' })
    .getByRole('listitem')
    .filter({ has: page.getByRole('button', { name: `Open ${name}`, exact: true }) });
  // covered until practised: a board and a question mark
  await expect(tile.locator('svg')).toBeVisible();
  await expect(tile.locator('.label')).toHaveText('?');
  // depth: the Najdorf is named after 5.Nc3 a6 (data/openings/b.tsv B90)
  await expect(tile.getByTestId('tile-depth')).toHaveText('move 5');
  await expect(page.getByTestId('album-depth')).toHaveCount(0);

  await tile.getByRole('button', { name: `Open ${name}`, exact: true }).click();
  const focusCard = page.getByTestId('lab-focus');
  const sans = (await focusCard.locator('.line').textContent())!
    .trim()
    .split(' ')
    .map((m) => m.replace(/^\d+\./, ''));
  await focusCard.getByRole('button', { name: `Practise ${name}` }).click();
  await page.getByRole('checkbox', { name: 'Play the opponent’s moves automatically' }).uncheck();
  for (const san of sans) await playSan(page, san);
  await expect(page.getByTestId('lab-progress')).toHaveText('Opening complete');
  await waitSaved(page);
  await page.getByRole('button', { name: 'Back to the list' }).click();
  await page
    .getByRole('navigation', { name: 'Opening levels' })
    .getByRole('button', { name: 'Sicilian Defense', exact: true })
    .click();
  await expect(tile.locator('.label')).toHaveText('Najdorf Variation');
  await expect(progress).toHaveText(/^1 \/ \d+ discovered$/);
  await expect(page.getByTestId('album-depth')).toHaveText('deepest: move 5');
});

test('leaf variations (nothing else follows in the dictionary) are marked', async ({ page }) => {
  await ready(page);
  await (
    await enterFamily(page)
  )
    .getByRole('button', { name: 'Open Sicilian Defense', exact: true })
    .click();
  const tiles = page
    .getByRole('list', { name: 'Variations of Sicilian Defense' })
    .getByRole('listitem');
  const tile = (name: string) =>
    tiles.filter({ has: page.getByRole('button', { name: `Open ${name}`, exact: true }) });
  // the Najdorf has sub-variations (data/openings/b.tsv): not a leaf
  await expect(tile('Sicilian Defense: Najdorf Variation').getByTitle(/^Leaf/)).toHaveCount(0);
  await page
    .getByRole('region', { name: 'Practise by name' })
    .getByRole('button', { name: /^Show all/ })
    .click();
  // data/openings/b.tsv: the Open Sicilian goes on into other Sicilian names; the Bowdler
  // Attack (1.e4 c5 2.Bc4) leads to no other name
  await expect(tile('Sicilian Defense: Open').getByTitle(/^Leaf/)).toHaveCount(0);
  await expect(tile('Sicilian Defense: Bowdler Attack').getByTitle(/^Leaf/)).toBeVisible();
});

test('from this position: a group opens its variations where they diverge; main line', async ({
  page,
}) => {
  await ready(page);
  for (const san of ['e4', 'e5', 'Nf3']) await playSan(page, san);
  const groups = page.getByRole('list', { name: 'From this position' });
  // data/openings/c.tsv: the King's Pawn Game variations diverge at once (2...f6, 2...Bc5, …):
  // the board stays, the group's variations open
  await groups.getByRole('button', { name: "Open King's Pawn Game", exact: true }).click();
  await expect(page.getByTestId('opening-bar')).toContainText("King's Knight Opening");
  const variations = page.getByRole('list', { name: 'Variations from this position' });
  await expect(variations.getByRole('listitem')).toHaveCount(4);
  await expect(
    variations.getByRole('listitem').filter({ hasNotText: "King's Pawn Game" }),
  ).toHaveCount(0);
  // the group's main line is its most played variation
  await groups
    .getByRole('button', { name: "Practise the main line of King's Pawn Game", exact: true })
    .click();
  await expect(page.getByTestId('lab-progress')).toBeVisible();
});

test('from this position: a group shows whose openings it leads to, without a misleading count', async ({
  page,
}) => {
  await ready(page);
  for (const san of ['e4', 'e5']) await playSan(page, san);
  const groups = page.getByRole('list', { name: 'From this position' });
  const knight = groups
    .getByRole('listitem')
    .filter({ has: page.getByRole('button', { name: "Open King's Knight Opening", exact: true }) });
  // the group stops at 2.Nf3, but leads on to many openings: no "1 variation" count
  await expect(knight).not.toContainText(/variation/i);
  // after 2.Nf3 come White openings (Ruy Lopez) and Black ones (Petrov's Defense)
  await expect(knight.getByRole('img', { name: 'White opening' })).toBeVisible();
  await expect(knight.getByRole('img', { name: 'Black opening' })).toBeVisible();
});

test('practising a repertoire variation in the lab reviews its FSRS cards', async ({ page }) => {
  await ready(page);
  await archiveWeek(page);
  await (
    await enterFamily(page)
  )
    .getByRole('button', { name: 'Open Sicilian Defense', exact: true })
    .click();
  const name = 'Sicilian Defense: Najdorf Variation';
  const row = page
    .getByRole('list', { name: 'Variations of Sicilian Defense' })
    .getByRole('listitem')
    .filter({ has: page.getByRole('button', { name: `Open ${name}`, exact: true }) });
  await row.getByRole('button', { name: `Add ${name} to the repertoire` }).click();
  await expectSelected(page, 'Black repertoire');
  await row.getByRole('button', { name: `Open ${name}`, exact: true }).click();
  const focusCard = page.getByTestId('lab-focus');
  const sans = (await focusCard.locator('.line').textContent())!
    .trim()
    .split(' ')
    .map((m) => m.replace(/^\d+\./, ''));
  await focusCard.getByRole('button', { name: `Practise ${name}` }).click();
  await page.getByRole('checkbox', { name: 'Play the opponent’s moves automatically' }).uncheck();
  for (const san of sans) await playSan(page, san);
  await expect(page.getByTestId('lab-progress')).toHaveText('Opening complete');
  await waitSaved(page);
  // every Black move of the line got its first FSRS review
  await page.getByRole('link', { name: 'Statistics' }).click();
  await expect(page.getByTestId('today-new')).toHaveText(String(Math.floor(sans.length / 2)));

  // back in the openings, the variation's progress is its FSRS state (ADR 013): moves answered
  // this fast are rated Easy, so FSRS schedules them as already known (next review in days)
  await page.goto('/');
  await (
    await enterFamily(page)
  )
    .getByRole('button', { name: 'Open Sicilian Defense', exact: true })
    .click();
  await expect(row.getByTestId('mastery')).toHaveAccessibleName('In your repertoire: known');
});
