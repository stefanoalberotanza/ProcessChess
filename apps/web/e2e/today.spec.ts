import { type Page, expect, test } from '@playwright/test';

// The puzzles depend on the current week, so no test assumes a line: a wrong move is any legal
// move from a short list of odd candidates, and the right move is read from the announcement.

test.setTimeout(90_000);
const LONG = { timeout: 20_000 };

/** Odd moves for either side; illegal ones are rejected by the SAN input and the next is tried. */
const ODD_MOVES = ['h4', 'a3', 'Na3', 'Nh3', 'h5', 'a5', 'Na6', 'Nh6', 'h3', 'a4', 'h6', 'a6'];

const input = (page: Page) => page.locator('#san-input');
const announcement = (page: Page) => page.getByTestId('today-announcement');
const summary = (page: Page) => page.getByTestId('today-summary');
const result = (page: Page) => page.getByTestId('today-result');
const start = (page: Page) => page.getByRole('button', { name: 'Start', exact: true });

async function openToday(page: Page) {
  await page.goto('/');
  await expect(start(page)).toBeVisible(LONG);
}

async function hearts(page: Page): Promise<number> {
  const label = (await page.getByTestId('today-hearts').getAttribute('aria-label')) ?? '';
  return Number(/(\d+) hearts left/.exec(label)![1]);
}

async function startSession(page: Page) {
  await start(page).click();
  await expect(input(page)).toBeEnabled(LONG);
}

/** Types a move and submits it. */
async function type(page: Page, san: string) {
  await input(page).fill(san);
  await input(page).press('Enter');
}

/** Plays an odd legal move that is not the puzzle move; returns the right move. */
async function playWrong(page: Page): Promise<string> {
  await expect(input(page)).toBeEnabled(LONG);
  for (const san of ODD_MOVES) {
    await type(page, san);
    const wrong = announcement(page).filter({ hasText: `${san} is not the move` });
    const illegal = page.getByRole('alert');
    const right = announcement(page).filter({ hasText: `Correct: ${san}.` });
    await expect(wrong.or(illegal).or(right).or(summary(page)).first()).toBeVisible(LONG);
    // the move that costs the last heart ends the session at once
    if (await summary(page).isVisible()) return '';
    if (await wrong.isVisible()) {
      const text = (await announcement(page).textContent()) ?? '';
      return /The right move is (.+?)\.$/.exec(text.trim())![1]!;
    }
    if (await right.isVisible()) {
      throw new Error(`the odd move ${san} happened to be the right one; rerun`);
    }
  }
  throw new Error('no odd move was legal');
}

/** Waits until the next move is asked, the puzzle card shows, or the session ends. */
async function settle(page: Page) {
  await expect(
    input(page).and(page.locator(':enabled')).or(result(page)).or(summary(page)).first(),
  ).toBeVisible(LONG);
}

/** Plays the right move (after a wrong one) and waits for the next state. */
async function playRight(page: Page, san: string) {
  await type(page, san);
  // accepted: the wrong-move announcement is replaced by the correct one or the next prompt
  await expect(announcement(page)).not.toContainText('is not the move', LONG);
  await expect(announcement(page)).not.toContainText('The right move is', LONG);
  await settle(page);
}

/** Plays the whole session wrong at every first try until the hearts are gone. */
async function loseAllHearts(page: Page) {
  for (let i = 0; i < 40 && !(await summary(page).isVisible()); i++) {
    if (await result(page).isVisible()) {
      await page.getByRole('button', { name: 'Next', exact: true }).click();
      await settle(page);
      continue;
    }
    const right = await playWrong(page);
    if (await summary(page).isVisible()) break;
    await playRight(page, right);
  }
  await expect(summary(page)).toBeVisible(LONG);
}

test('a fresh profile opens on Today with the Start button and five hearts', async ({ page }) => {
  await openToday(page);
  await expect(page.getByRole('tab', { name: 'Today' })).toHaveAttribute('aria-selected', 'true');
  expect(await hearts(page)).toBe(5);
  await expect(page.getByTestId('today-streak')).toBeVisible();
});

test('five first-try mistakes end the session: the summary shows and Start is gone', async ({
  page,
}) => {
  await openToday(page);
  await startSession(page);
  await loseAllHearts(page);
  expect(await hearts(page)).toBe(0);
  await expect(summary(page)).toContainText('Out of hearts');
  await expect(start(page)).toHaveCount(0);
  const streak = (await page.getByTestId('today-streak').textContent()) ?? '';
  expect(Number(/(\d+) day/.exec(streak)![1])).toBeGreaterThanOrEqual(1);
});

test('a wrong then a right move costs one heart and keeps the combo at 0', async ({ page }) => {
  await openToday(page);
  await startSession(page);
  const right = await playWrong(page);
  expect(await hearts(page)).toBe(4);
  await expect(page.getByTestId('today-combo')).toHaveText('Combo ×0');
  await playRight(page, right);
  expect(await hearts(page)).toBe(4);
  await expect(page.getByTestId('today-combo')).toHaveText('Combo ×0');

  // The combo extension (a right first try makes it 1) is covered by the core reducer unit tests
  // (packages/core/src/today/run.test.ts): a first-try right move needs foreknowledge of the move.
});

test('after the first move, a reload shows Done for today', async ({ page }) => {
  await openToday(page);
  await startSession(page);
  await playWrong(page);
  await page.reload();
  await expect(page.getByTestId('today-done')).toContainText('Done for today', LONG);
  await expect(start(page)).toHaveCount(0);
});

test('the effects switch persists and, off, no AudioContext is ever built', async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as { __ac: number; AudioContext: unknown };
    w.__ac = 0;
    w.AudioContext = function () {
      w.__ac++;
      throw new Error('stubbed AudioContext');
    };
  });
  const count = () => page.evaluate(() => (window as unknown as { __ac: number }).__ac);
  const sw = page.getByRole('checkbox', { name: /Sound and animation/ });

  await openToday(page);
  await expect(sw).toBeChecked();
  await sw.uncheck();
  await page.reload();
  await expect(start(page)).toBeVisible(LONG);
  await expect(sw).not.toBeChecked();
  await startSession(page);
  await playWrong(page);
  expect(await count()).toBe(0);

  // switched on again, the context is built lazily at the first cue
  await sw.check();
  // the day is marked, so the session cannot be restarted; clear the mark for a new session
  await page.evaluate(() => localStorage.removeItem('pc.today'));
  await page.reload();
  await expect(start(page)).toBeVisible(LONG);
  await expect(sw).toBeChecked();
  expect(await count()).toBe(0);
  await startSession(page);
  expect(await count()).toBe(0);
  await playWrong(page);
  expect(await count()).toBeGreaterThanOrEqual(1);
});

test('Today starts and plays with localStorage unavailable', async ({ page }) => {
  await page.addInitScript(() => {
    const fail = () => {
      throw new Error('storage unavailable');
    };
    Storage.prototype.getItem = fail;
    Storage.prototype.setItem = fail;
  });
  await openToday(page);
  await startSession(page);
  const right = await playWrong(page);
  await playRight(page, right);
  expect(await hearts(page)).toBe(4);
});

test('Training and Openings still work after a stopped session', async ({ page }) => {
  await openToday(page);
  await startSession(page);
  await loseAllHearts(page);

  await page.getByRole('tab', { name: 'Training' }).click();
  await page.getByRole('button', { name: /train all lines/i }).click();
  await expect(page.getByTestId('clean-counter')).toBeVisible();
  await page.getByRole('button', { name: 'Stop', exact: true }).click();

  await page.getByRole('tab', { name: 'Openings' }).click();
  await expect(page.getByRole('region', { name: 'Lines' })).toBeVisible();
  await expect(page.getByRole('list', { name: 'Openings' })).toBeVisible();
});
