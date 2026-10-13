import { describe, expect, it } from 'vitest';
import { loadOpeningGraph } from './graph';
import { OpeningsNotLoadedError } from './resolve';
import { nodeNames } from './continuations';

// Separate file: Vitest isolates module state per file, so the dataset is not loaded yet here.
describe('nodeNames without the dataset', () => {
  it('throws until loadOpenings() has resolved', async () => {
    const graph = await loadOpeningGraph();
    expect(() => nodeNames(graph)).toThrow(OpeningsNotLoadedError);
  });
});
