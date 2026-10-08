import type { OpeningIndex, OpeningIndexJson } from './types';

let index: OpeningIndex | undefined;
let pending: Promise<OpeningIndex> | undefined;

/**
 * Loads the openings dataset (a separate lazy chunk in the web build). Memoised; call it once
 * at startup and await it before using `resolveOpening`.
 */
export function loadOpenings(): Promise<OpeningIndex> {
  pending ??= import('./openings.json').then((mod) => {
    const json = mod.default as OpeningIndexJson;
    index = new Map(Object.entries(json));
    return index;
  });
  return pending;
}

export function isOpeningsLoaded(): boolean {
  return index !== undefined;
}

/** The loaded index, or undefined before `loadOpenings()` resolves. */
export function openingIndex(): OpeningIndex | undefined {
  return index;
}
