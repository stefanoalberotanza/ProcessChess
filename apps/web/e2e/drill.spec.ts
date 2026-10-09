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
  await expect(page.locator('[data-saving="true"]')).toHaveCount(0);
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
  await page
    .getByRole('list', { name: 'Openings found' })
    .getByRole('button', { name: 'Open Sicilian Defense: Najdorf Variation', exact: true })
    .first() // shortest line first; the dataset has transpositions with the same name
    .click();
  const bar = page.getByTestId('opening-bar');
  await expect(bar).toContainText('B90');
  await expect(bar).toContainText('Najdorf Variation');
  // book moves from here come from the graph
  const book = page.getByRole('list', { name: 'Practise by move' });
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
  const bar = page.getByTestId('opening-bar');
  await expect(bar).toContainText('C54');
  await expect(bar).toContainText('Italian Game');
  await expect(bar).toContainText('Classical Variation');
  await expect(page.getByTestId('opening-label')).toHaveText("King's Pawn Games");
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
  await nodes.getByRole('button', { name: /^e4 — B00 King's Pawn Game/ }).click();
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
  // the first level lists the opening families; a click enters a family
  const families = page.getByRole('list', { name: 'Opening families' });
  const firstFamily = families.getByRole('button', { name: /^Open / }).first();
  const family = ((await firstFamily.getAttribute('aria-label')) ?? '').replace(/^Open /, '');
  await firstFamily.click();
  const focusCard = page.getByTestId('lab-focus');
  await expect(focusCard).toContainText(family);
  await expect(page.getByRole('navigation', { name: 'Opening levels' })).toContainText(family);
  await expect(focusCard.getByTestId('mastery')).toHaveAccessibleName('Not practised yet');
  const lineText = (await focusCard.locator('.line').textContent())!.trim();
  // "1.e4 e5 2.Nf3 …" → SAN moves to type
  const sans = lineText.split(' ').map((m) => m.replace(/^\d+\./, ''));
  expect(sans).toHaveLength(8);
  await focusCard.getByRole('button', { name: `Practise ${family}` }).click();
  // both sides: switch the automatic opponent off
  await page.getByRole('checkbox', { name: 'Play the opponent’s moves automatically' }).uncheck();

  const progress = page.getByTestId('lab-progress');
  await expect(progress).toHaveText('Move 1 of 8');
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
  const familyRow = page
    .getByRole('list', { name: 'Opening families' })
    .getByRole('listitem')
    .filter({ has: page.getByRole('button', { name: `Open ${family}`, exact: true }) });
  await expect(familyRow.getByTestId('mastery')).toHaveAccessibleName(/Automatic/);

  // the per-edge history colours the graph: the practised first move is green
  await page.getByRole('tab', { name: 'Graph' }).click();
  await expect(page.locator('.edges path.good').first()).toBeAttached();
});

test('opening lab: levels follow the board, by name and by move', async ({ page }) => {
  await ready(page);
  const levels = page.getByRole('navigation', { name: 'Opening levels' });
  await page.getByRole('button', { name: 'Open Sicilian Defense', exact: true }).click();
  await expect(page.getByTestId('opening-bar')).toContainText('Sicilian Defense');
  await page
    .getByRole('list', { name: 'Variations of Sicilian Defense' })
    .getByRole('button', { name: 'Open Sicilian Defense: Najdorf Variation', exact: true })
    .click();
  await expect(levels).toContainText('Najdorf Variation');
  await expect(page.getByTestId('opening-bar')).toContainText('B90');
  // moves played on the board move the level too: back two plies → the Sicilian level
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft');
  await expect(levels.locator('[aria-current="true"]')).not.toHaveText('Najdorf Variation');
  // the breadcrumb goes back up
  await levels.getByRole('button', { name: 'All openings' }).click();
  await expect(page.getByRole('list', { name: 'Opening families' })).toBeVisible();
  await expect(page.getByTestId('opening-bar')).toContainText('Starting position');
});

test('opening lab: families filtered by style, one-move names are not openings', async ({
  page,
}) => {
  await ready(page);
  const styles = page.getByRole('radiogroup', { name: 'Openings by style' });
  const families = page.getByRole('list', { name: 'Opening families' });
  await styles.getByRole('radio', { name: "Queen's Pawn Games" }).click();
  await expect(
    families.getByRole('button', { name: "Open Queen's Gambit Declined", exact: true }),
  ).toBeVisible();
  await expect(
    families.getByRole('button', { name: 'Open Sicilian Defense', exact: true }),
  ).toHaveCount(0);
  await styles.getByRole('radio', { name: "King's Pawn Games" }).click();
  await expect(
    families.getByRole('button', { name: 'Open Sicilian Defense', exact: true }),
  ).toBeVisible();
  // King's Pawn Game is entered at 1.e4 e5 (C20), not at the one-move 1.e4
  await families.getByRole('button', { name: "Open King's Pawn Game", exact: true }).click();
  await expect(page.getByTestId('lab-focus')).toContainText('C20');
});

test('opening lab: practise by move from the board position', async ({ page }) => {
  await ready(page);
  const byMove = page.getByRole('list', { name: 'Practise by move' });
  // navigate without practising, then practise a book move from there
  await byMove.getByRole('button', { name: /^Go to e4/ }).click();
  await expect(page.getByTestId('opening-label')).toHaveText("King's Pawn Games");
  await byMove.getByRole('button', { name: /^Practise c5/ }).click();
  await page.getByRole('checkbox', { name: 'Play the opponent’s moves automatically' }).uncheck();
  await expect(page.getByTestId('lab-progress')).toHaveText('Move 1 of 8');
  await playSan(page, 'e4');
  await playSan(page, 'c5');
  await expect(page.getByTestId('lab-progress')).toHaveText('Move 3 of 8');
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
  const families = page.getByRole('list', { name: 'Opening families' });
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

  // practising a Black opening shows the board from Black's side
  await page.getByRole('button', { name: 'Practise Sicilian Defense', exact: true }).click();
  await expect(page.locator('.cg-wrap.orientation-black')).toBeVisible();
  // the automatic opponent (on by default) plays White's moves: 1.e4 is already on the board
  const auto = page.getByRole('checkbox', { name: 'Play the opponent’s moves automatically' });
  await expect(auto).toBeChecked();
  await expect(page.getByTestId('lab-progress')).toHaveText('Move 2 of 8');
  await expect(page.getByTestId('announcement')).toHaveText(
    'Play your 4 moves of the opening; the opponent plays by itself. Opponent played e4.',
  );
  await playSan(page, 'c5');
  await expect(page.getByTestId('lab-progress')).toHaveText('Move 4 of 8');
  await expect(page.getByTestId('announcement')).toContainText('Opponent played Nf3.');
  // switched off, the run starts again and both sides are asked
  await auto.uncheck();
  await expect(page.getByTestId('lab-progress')).toHaveText('Move 1 of 8');
  await page.getByRole('button', { name: 'Back to the list' }).click();
  await expect(page.locator('.cg-wrap.orientation-white')).toBeVisible();
});

test('"out of theory" only appears off the book, not on unnamed book positions', async ({
  page,
}) => {
  await ready(page);
  // Indian Defense practice line: its middle positions are on book lines but have no name
  await page.getByRole('button', { name: 'Open Indian Defense', exact: true }).click();
  const focusCard = page.getByTestId('lab-focus');
  const sans = ((await focusCard.locator('.line').textContent()) ?? '')
    .trim()
    .split(' ')
    .map((m) => m.replace(/^\d+\./, ''));
  await focusCard.getByRole('button', { name: 'Practise Indian Defense' }).click();
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
