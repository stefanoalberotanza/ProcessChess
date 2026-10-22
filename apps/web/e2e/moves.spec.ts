import { type Page, expect, test } from '@playwright/test';

async function playSan(page: Page, san: string) {
  const input = page.getByLabel('Your move (SAN)');
  await input.fill(san);
  await input.press('Enter');
}

test('the Moves view lists the next moves into openings, by side', async ({ page }) => {
  await page.goto('/?tab=explore');
  await expect(
    page
      .getByRole('region', { name: 'Repertoires' })
      .getByRole('button', { name: /^Week \d+ · White/ }),
  ).toBeVisible();
  await playSan(page, 'e4');
  await playSan(page, 'c5');

  await page.getByRole('radio', { name: 'Moves', exact: true }).click();
  const moves = page.getByRole('region', { name: 'Moves', exact: true });
  await expect(moves).toBeVisible();
  // Alapin Variation: B22 · White · 1.e4 c5 2.c3 (data/openings/b.tsv)
  const white = moves.getByRole('region', { name: /White's openings/ });
  // everything starts collapsed: groups, moves, then each level of names
  await expect(white.getByRole('button', { name: 'Open 2.c3', exact: true })).toHaveCount(0);
  await white.getByRole('button', { expanded: false }).first().click();
  await expect(white.getByRole('button', { name: 'Open 2.c3', exact: true })).toBeVisible();
  await white.getByRole('button', { name: 'Expand or collapse 2.c3' }).click();
  await expect(white.getByText('Sicilian Defense: Alapin Variation').first()).toBeVisible();
  await expect(moves.getByRole('region', { name: /Black's openings/ })).toBeVisible();

  // a move heading plays it on the board
  await white.getByRole('button', { name: 'Open 2.c3', exact: true }).click();
  await expect(page.getByLabel('FEN', { exact: true })).toHaveValue(/ b KQkq - 0 2$/);
});
