import type { NameNode, NameTree } from './names';

/** Whose opening it is: White's, Black's, or both sides' (e.g. Ruy Lopez). */
export type OpeningSide = 'w' | 'b' | 'both';

/** Openings whose owner the rules below get wrong; extend freely. */
export const OPENING_SIDE_OVERRIDES: Readonly<Record<string, OpeningSide>> = {
  'Ruy Lopez': 'both',
  'Italian Game': 'both',
};

/**
 * Words of an opening's name that tell whose it is, checked in order: the first match wins
 * ("King's Gambit Accepted" is Black's). Extend freely.
 */
export const OPENING_SIDE_WORDS: readonly (readonly [RegExp, 'w' | 'b'])[] = [
  [/\b(Defen[cs]e|Declined|Accepted|Countergambit)\b/, 'b'],
  [/\b(Opening|Game|Gambit|Attack|System)\b/, 'w'],
];

/**
 * The owner of an opening: the override table first, then the words of its name, then the side of
 * its defining move. (The share of variations per side does not work: a defence's variations are
 * mostly named after White's replies.)
 */
export function openingSide(_tree: Pick<NameTree, 'get'>, opening: NameNode): OpeningSide {
  const override = OPENING_SIDE_OVERRIDES[opening.key];
  if (override) return override;
  for (const [words, side] of OPENING_SIDE_WORDS) if (words.test(opening.key)) return side;
  return opening.side ?? 'w';
}
