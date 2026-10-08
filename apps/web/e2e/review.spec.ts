import { type Page, expect, test } from '@playwright/test';

const DAY = 86_400_000;

async function playSan(page: Page, san: string) {
  const input = page.getByLabel('Your move (SAN)');
  await input.fill(san);
  await input.press('Enter');
}

async function waitSaved(page: Page) {
  await expect(page.locator('[data-saving="false"]')).toBeVisible();
}

test('trained moves become due, are reviewed and show up in the statistics', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('empty-state')).toBeVisible();
  await page.getByRole('button', { name: /import pgn/i }).click();
  const dialog = page.getByRole('dialog', { name: 'Import PGN' });
  await dialog.getByLabel('Name', { exact: true }).fill('Italian');
  await dialog.getByLabel('or paste PGN text').fill('1. e4 e5 2. Nf3 Nc6 3. Bc4 *');
  await dialog.getByRole('button', { name: 'Import', exact: true }).click();
  await expect(dialog).toBeHidden();
  const reps = page.getByRole('region', { name: 'Repertoires' });
  await expect(reps.getByRole('button', { pressed: true })).toContainText('Italian');
  await expect(page.getByTestId('due-count')).toHaveCount(0);
  await expect(page.getByTestId('due-summary')).toHaveText('Nothing to review right now.');

  // learn the line once: every move gets a card
  await page.getByRole('tab', { name: 'Training' }).click();
  await page.getByRole('button', { name: /train all lines/i }).click();
  await expect(page.getByTestId('clean-counter')).toBeVisible();
  for (const san of ['e4', 'Nf3', 'Bc4']) await playSan(page, san);
  await expect(page.getByTestId('announcement')).toContainText('Line complete without mistakes');
  await waitSaved(page);

  // a month later everything is due
  const later = Date.now() + 30 * DAY;
  await page.clock.setFixedTime(later);
  await page.goto('/');
  await expect(page.getByTestId('due-summary')).toHaveText('3 move(s) to review now.');
  await expect(page.getByTestId('due-count')).toHaveText('3 to review');
  await reps.getByRole('button', { name: /Italian/ }).click();
  await page.getByRole('tab', { name: 'Training' }).click();
  await page.getByRole('button', { name: 'Review (3)' }).click();

  const counter = page.getByTestId('review-counter');
  await expect(counter).toHaveText('Reviewed: 0 / 3');
  await playSan(page, 'd4');
  await expect(page.getByTestId('announcement')).toContainText('The right move is e4');
  await playSan(page, 'e4');
  await expect(counter).toHaveText('Reviewed: 1 / 3');
  await playSan(page, 'Nf3');
  await playSan(page, 'Bc4');
  await expect(page.getByTestId('announcement')).toContainText('Line reviewed.');
  await expect(counter).toHaveText('Reviewed: 3 / 3');
  await page.getByLabel('Your move (SAN)').blur();
  await page.keyboard.press(' ');
  const done = page.getByTestId('review-done');
  await expect(done).toContainText('Review complete.');
  // the forgotten move comes back within minutes; the clock is frozen, so it is not due yet
  await expect(page.getByTestId('next-due')).toContainText('Next review:');
  await waitSaved(page);

  await page.getByRole('link', { name: 'Statistics' }).click();
  await expect(page.getByRole('heading', { name: 'Statistics', level: 1 })).toBeVisible();
  await expect(page.getByTestId('today-played')).toHaveText('3');
  await expect(page.getByTestId('today-first-try')).toHaveText('67%');
  await expect(page.getByTestId('today-new')).toHaveText('0');
  await expect(page.getByTestId('streak')).toHaveText('1 day(s)');
  await expect(page.getByRole('img', { name: /moves played per day/i })).toBeVisible();
  await expect(page.getByRole('row', { name: /Italian/ })).toBeVisible();

  // nothing else is due now
  await page.goto('/');
  await expect(page.getByTestId('due-summary')).toHaveText('Nothing to review right now.');
  await expect(page.getByTestId('due-count')).toHaveCount(0);
});
