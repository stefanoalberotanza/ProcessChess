import { describe, expect, it } from 'vitest';
import { isOpeningsLoaded, loadOpenings } from './data';
import { OpeningsNotLoadedError, resolveOpening } from './resolve';

// Separate file: Vitest isolates module state per file, so the dataset is not loaded yet here.
describe('lazy openings dataset', () => {
  it('resolveOpening throws until loadOpenings() has resolved', async () => {
    expect(isOpeningsLoaded()).toBe(false);
    expect(() => resolveOpening(['e4'])).toThrow(OpeningsNotLoadedError);
    const index = await loadOpenings();
    expect(isOpeningsLoaded()).toBe(true);
    expect(index.size).toBeGreaterThan(3000);
    expect(resolveOpening(['e4'])?.eco).toMatch(/^B00$/);
  });

  it('loadOpenings is memoised', async () => {
    expect(await loadOpenings()).toBe(await loadOpenings());
  });
});
