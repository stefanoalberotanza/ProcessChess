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
  await page.goto('/?tab=explore');
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

/** The Lines view of the openings panel. */
async function explore(page: Page): Promise<Locator> {
  const lines = page.getByRole('region', { name: 'Lines' });
  await expect(lines).toBeVisible();
  return lines;
}

/** The row of `name` in a group of the Lines view ("Openings" / "Variations"), all rows shown. */
async function lineRow(page: Page, group: 'Openings' | 'Variations', name: string) {
  const lines = await explore(page);
  const section = lines.getByRole('region', { name: new RegExp(`^${group}`) });
  const more = section.getByRole('button', { name: /^Show all/ });
  if (await more.isVisible()) await more.click();
  return section
    .getByRole('listitem')
    .filter({ has: page.getByRole('button', { name: `Open ${name}`, exact: true }) });
}

/** Moves the board to the opening `name` from the Lines view; returns the Lines view. */
async function enterOpening(page: Page, name: string): Promise<Locator> {
  await (
    await lineRow(page, 'Openings', name)
  )
    .getByRole('button', { name: `Open ${name}`, exact: true })
    .click();
  return explore(page);
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

test('Today is a tab of its own: the openings tab has no daily mix', async ({ page }) => {
  await ready(page);
  await expect(page.getByRole('tab', { name: 'Today' })).toHaveCount(1);
  const lines = await explore(page);
  await expect(lines.getByText(/daily mix/i)).toHaveCount(0);
  await expect(page.getByRole('searchbox')).toHaveAttribute(
    'placeholder',
    'Search an opening or paste a FEN',
  );
});

test('the openings tab shows only Lines: openings, then the variations of the board position', async ({
  page,
}) => {
  await ready(page);
  const lines = await explore(page);
  await expect(page.getByRole('tab', { name: /^From this position/ })).toHaveCount(0);
  await expect(page.getByRole('tab', { name: 'Practise by name' })).toHaveCount(0);
  await expect(lines.getByRole('list', { name: 'Openings' })).toBeVisible();
  await expect(lines.getByRole('list', { name: 'Variations' })).toHaveCount(0);
  // no families, no style names
  await expect(await lineRow(page, 'Openings', "King's Pawn Game")).toHaveCount(0);
  await expect(await lineRow(page, 'Openings', 'Sicilian Defense')).toHaveCount(1);
  // inside an opening: its variations, and the other openings reachable from here
  await enterOpening(page, 'Sicilian Defense');
  await expect(lines.getByRole('list', { name: 'Variations' })).toBeVisible();
  await expect(
    await lineRow(page, 'Variations', 'Sicilian Defense: Najdorf Variation'),
  ).toHaveCount(1);
  // no discovery: nothing is covered by "?"
  await expect(page.getByText('?', { exact: true })).toHaveCount(0);
  await expect(page.getByText(/discovered/)).toHaveCount(0);
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
  // the card shows no clean-lines counter
  await expect(white).not.toContainText('lines clean');
  // selected, the week repertoire lists exactly its 3 lines
  await white.click();
  await expect(
    page.getByRole('list', { name: 'Lines of this repertoire' }).getByRole('button'),
  ).toHaveCount(3);
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

test('the selected repertoire opens into its openings and variations', async ({ page }) => {
  await ready(page);
  await archiveWeek(page);
  await importPgnText(page, 'Najdorf', '1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 a6 *');
  const contents = page.getByRole('list', { name: 'Lines of this repertoire' });
  await expect(contents).toBeVisible();
  // one row per line, named where it ends (data/openings/b.tsv: B90 Najdorf Variation)
  await expect(contents.getByRole('button')).toHaveCount(1);
  await contents
    .getByRole('button', { name: 'Sicilian Defense: Najdorf Variation', exact: true })
    .click();
  await expect(page.getByTestId('opening-bar')).toContainText('Najdorf Variation');
  // deselected, it closes again
  await page
    .getByRole('button', { name: /^Najdorf/ })
    .first()
    .click();
  await expect(contents).toHaveCount(0);
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

test('opening lab: practise a line, rebuild the moves, history per opening and per move', async ({
  page,
}) => {
  await ready(page);
  // the week repertoires are random per week: one sharing moves with the line would give it
  // FSRS cards, and those win over the lab streak (ADR 013)
  await archiveWeek(page);
  await enterOpening(page, 'Sicilian Defense');
  const name = 'Sicilian Defense: Najdorf Variation';
  const row = await lineRow(page, 'Variations', name);
  await expect(row.getByTestId('mastery')).toHaveAccessibleName('Not practised yet');
  const sans = ((await row.getAttribute('data-line')) ?? '')
    .trim()
    .split(' ')
    .map((m) => m.replace(/^\d+\./, ''));
  expect(sans.length).toBeGreaterThanOrEqual(10);
  await row.getByRole('button', { name: `Practise ${name}` }).click();
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

  // back in the list the line shows as automatic, and it survives a reload
  await page.getByRole('button', { name: 'Back to the list' }).click();
  await expect(
    (await lineRow(page, 'Variations', name)).getByTestId('mastery'),
  ).toHaveAccessibleName(/Automatic/);
  await page.reload();
  await enterOpening(page, 'Sicilian Defense');
  await expect(
    (await lineRow(page, 'Variations', name)).getByTestId('mastery'),
  ).toHaveAccessibleName(/Automatic/);

  // the per-edge history colours the graph: the practised first move is green
  await page.getByRole('tab', { name: 'Graph' }).click();
  await expect(page.locator('.edges path.good').first()).toBeAttached();
});

test('lines follow the board', async ({ page }) => {
  await ready(page);
  const levels = page.getByRole('navigation', { name: 'Opening levels' });
  await enterOpening(page, 'Sicilian Defense');
  await expect(page.getByTestId('opening-bar')).toContainText('Sicilian Defense');
  const najdorf = 'Sicilian Defense: Najdorf Variation';
  await (
    await lineRow(page, 'Variations', najdorf)
  )
    .getByRole('button', { name: `Open ${najdorf}`, exact: true })
    .click();
  await expect(levels).toContainText('Najdorf Variation');
  await expect(page.getByTestId('opening-bar')).toContainText('Najdorf Variation');
  // moves played on the board move the level too: back two plies → the Sicilian level
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft');
  await expect(levels.locator('[aria-current="true"]')).not.toHaveText('Najdorf Variation');
  // the breadcrumb goes back to the start
  await levels.getByRole('button', { name: 'All openings' }).click();
  await expect(page.getByTestId('opening-bar')).toContainText('Starting position');
  await expect(page.getByRole('list', { name: 'Openings' })).toBeVisible();
  await expect(page.getByRole('list', { name: 'Variations' })).toHaveCount(0);
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

test('openings are marked by owner, filtered by side and practised from their side', async ({
  page,
}) => {
  await ready(page);
  // Sicilian Defense is Black's, Bird Opening White's, Ruy Lopez both sides' (opening-side.ts)
  const sicilian = await lineRow(page, 'Openings', 'Sicilian Defense');
  await expect(sicilian.getByRole('img', { name: 'Black opening' })).toBeVisible();
  const bird = await lineRow(page, 'Openings', 'Bird Opening');
  await expect(bird.getByRole('img', { name: 'White opening' })).toBeVisible();
  const ruy = await lineRow(page, 'Openings', 'Ruy Lopez');
  await expect(ruy.getByRole('img', { name: 'White opening' })).toBeVisible();
  await expect(ruy.getByRole('img', { name: 'Black opening' })).toBeVisible();

  await page.getByRole('radio', { name: 'Black' }).click();
  await expect(await lineRow(page, 'Openings', 'Bird Opening')).toHaveCount(0);
  await expect(await lineRow(page, 'Openings', 'Ruy Lopez')).toHaveCount(1);
  await expect(await lineRow(page, 'Openings', 'Sicilian Defense')).toHaveCount(1);
  await page.getByRole('radio', { name: 'All', exact: true }).click();

  // practising a Black line shows the board from Black's side
  await enterOpening(page, 'Sicilian Defense');
  const name = 'Sicilian Defense: Najdorf Variation';
  const row = await lineRow(page, 'Variations', name);
  const plies = ((await row.getAttribute('data-line')) ?? '').trim().split(' ').length;
  await row.getByRole('button', { name: `Practise ${name}` }).click();
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
  // an Indian Defense practice line: its positions are on book lines, named or not
  const lines = await enterOpening(page, 'Indian Defense');
  const row = lines.getByRole('list', { name: 'Variations' }).getByRole('listitem').first();
  const name = (
    (await row.getByRole('button', { name: /^Open / }).getAttribute('aria-label')) ?? ''
  ).replace(/^Open /, '');
  const sans = ((await row.getAttribute('data-line')) ?? '')
    .trim()
    .split(' ')
    .map((m) => m.replace(/^\d+\./, ''));
  await row.getByRole('button', { name: `Practise ${name}`, exact: true }).click();
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

test('add a variation to the repertoire from the openings panel', async ({ page }) => {
  await ready(page);
  await enterOpening(page, 'Sicilian Defense');
  const name = 'Sicilian Defense: Najdorf Variation';
  const row = await lineRow(page, 'Variations', name);
  await row.getByRole('button', { name: `Add ${name} to the repertoire` }).click();
  // a Black opening goes to the Black repertoire, created and selected
  await expectSelected(page, 'Black repertoire');
  await expect(page.getByRole('status')).toContainText('Line added');
  await expect(row.getByRole('button', { name: `Add ${name} to the repertoire` })).toHaveCount(0);
  await expect(row.getByTitle('In your repertoire')).toBeVisible();
});

test('practising a repertoire variation in the lab reviews its FSRS cards', async ({ page }) => {
  await ready(page);
  await archiveWeek(page);
  await enterOpening(page, 'Sicilian Defense');
  const name = 'Sicilian Defense: Najdorf Variation';
  const row = await lineRow(page, 'Variations', name);
  await row.getByRole('button', { name: `Add ${name} to the repertoire` }).click();
  await expectSelected(page, 'Black repertoire');
  const sans = ((await row.getAttribute('data-line')) ?? '')
    .trim()
    .split(' ')
    .map((m) => m.replace(/^\d+\./, ''));
  await row.getByRole('button', { name: `Practise ${name}` }).click();
  await page.getByRole('checkbox', { name: 'Play the opponent’s moves automatically' }).uncheck();
  for (const san of sans) await playSan(page, san);
  await expect(page.getByTestId('lab-progress')).toHaveText('Opening complete');
  await waitSaved(page);
  // every Black move of the line got its first FSRS review
  await page.getByRole('link', { name: 'Statistics' }).click();
  await expect(page.getByTestId('today-new')).toHaveText(String(Math.floor(sans.length / 2)));

  // back in the openings, the variation's progress is its FSRS state (ADR 013): moves answered
  // this fast are rated Easy, so FSRS schedules them as already known (next review in days)
  await page.goto('/?tab=explore');
  await enterOpening(page, 'Sicilian Defense');
  await expect(
    (await lineRow(page, 'Variations', name)).getByTestId('mastery'),
  ).toHaveAccessibleName('In your repertoire: known');
});

test('Training can be left with no repertoire selected', async ({ page }) => {
  await ready(page);
  await page.getByRole('tab', { name: 'Training' }).click();
  const list = page.getByRole('region', { name: 'Repertoires' });
  const white = list.getByRole('button', { name: /^Week \d+ · White/ });
  await expect(white).toHaveAttribute('aria-pressed', 'true');
  await white.click(); // deselect
  await page.waitForTimeout(300);
  await expect(white).toHaveAttribute('aria-pressed', 'false');
});

test.describe('without the opening graph', () => {
  test.use({ serviceWorkers: 'block' });
  test('the repertoire list still loads', async ({ page }) => {
    // the graph chunk is the one built from opening-graph.json (hashed name: match its content)
    await page.route('**/_app/immutable/chunks/*.js', async (route) => {
      const response = await route.fetch();
      const body = await response.text();
      if (body.startsWith(`const d=JSON.parse('[["`)) return route.abort();
      return route.fulfill({ response, body });
    });
    await page.goto('/');
    await expect(page.getByTestId('empty-state')).toBeVisible();
  });
});

test('training shows the repertoire openings as an album and drills one', async ({ page }) => {
  await ready(page);
  await page.getByRole('tab', { name: 'Training' }).click();
  const album = page.getByRole('region', { name: 'Openings of this repertoire' });
  await expect(album).toBeVisible();
  await expect(album.getByRole('button', { name: /^Open / }).first()).toBeVisible();
  // walk down the levels to a variation and drill it
  const practise = album.getByRole('button', { name: /^Practise / }).first();
  for (let i = 0; i < 8 && !(await practise.isVisible()); i++) {
    await album
      .getByRole('button', { name: /^Open / })
      .first()
      .click();
  }
  await practise.click();
  await expect(page.getByTestId('clean-counter')).toBeVisible();
  await expect(album).toBeHidden();
  await page.getByRole('button', { name: 'Stop', exact: true }).click();
  await expect(album).toBeVisible();
});

test('a custom-start repertoire keeps the plain training screen', async ({ page }) => {
  await ready(page);
  await importPgnText(
    page,
    'Custom start',
    '[SetUp "1"]\n[FEN "rnbqkbnr/pppppppp/8/8/8/8/1PPPPPPP/RNBQKBNR w KQkq - 0 1"]\n\n1. e4 e5 *',
  );
  await page.getByRole('tab', { name: 'Training' }).click();
  await expect(page.getByRole('region', { name: 'Openings of this repertoire' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^Train all lines/ })).toBeVisible();
});

test.describe('training album on a transposed repertoire', () => {
  // 1.Nf3 Nc6 2.e4 e5 3.d4 is the C44 Scotch Game position, off the dataset's move order
  async function openTransposed(page: Page) {
    await ready(page);
    await archiveWeek(page);
    await importPgnText(page, 'Scotch by Nf3', '1. Nf3 Nc6 2. e4 e5 3. d4 *');
    await page.getByRole('tab', { name: 'Training' }).click();
    return page.getByRole('region', { name: 'Openings of this repertoire' });
  }

  test('a family can be drilled as a whole', async ({ page }) => {
    const album = await openTransposed(page);
    await album
      .getByRole('button', { name: /^Practise / })
      .first()
      .click();
    await expect(page.getByTestId('clean-counter')).toBeVisible();
  });

  test('studied openings are never shown as undiscovered', async ({ page }) => {
    const album = await openTransposed(page);
    for (let i = 0; i < 6; i++) {
      const open = album.getByRole('button', { name: /^Open / });
      if ((await open.count()) === 0) break;
      await expect(album.locator('.tile .label', { hasText: /^\?$/ })).toHaveCount(0);
      await open.first().click();
    }
    await expect(album.locator('.tile .label', { hasText: /^\?$/ })).toHaveCount(0);
  });

  test('entering a level keeps the board on the repertoire', async ({ page }) => {
    const album = await openTransposed(page);
    for (let i = 0; i < 6; i++) {
      const open = album.getByRole('button', { name: /^Open / });
      if ((await open.count()) === 0) break;
      await open.first().click();
    }
    await expect(page.getByRole('button', { name: /^Train from this position/ })).toBeVisible();
  });
});
