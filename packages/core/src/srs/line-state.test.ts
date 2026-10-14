import { describe, expect, it } from 'vitest';
import { INITIAL_FEN, playLine } from '../position';
import { toEpd } from '../fen';
import { edgeKeyAfter, lineReviewedOn, lineSrsState } from './line-state';

const LINE = ['e2e4', 'c7c5', 'g1f3', 'd7d6']; // Black plays c5 and d6
const keyAt = (i: number) =>
  edgeKeyAfter(toEpd(playLine(INITIAL_FEN, LINE.slice(0, i + 1))!.fen), LINE[i]!);

describe('lineSrsState', () => {
  it('is null when no user move has a card', () => {
    expect(lineSrsState(LINE, 'b', new Map())).toBeNull();
  });
  it('is known when every user move is in review', () => {
    const cards = new Map([
      [keyAt(1), [{ state: 2 }]],
      [keyAt(3), [{ state: 2 }]],
    ]);
    expect(lineSrsState(LINE, 'b', cards)).toBe('known');
  });
  it('is learning when a user move is missing or in learning', () => {
    expect(lineSrsState(LINE, 'b', new Map([[keyAt(1), [{ state: 2 }]]]))).toBe('learning');
    const cards = new Map([
      [keyAt(1), [{ state: 2 }]],
      [keyAt(3), [{ state: 1 }]],
    ]);
    expect(lineSrsState(LINE, 'b', cards)).toBe('learning');
  });
  it('ignores the other side', () => {
    expect(lineSrsState(LINE, 'w', new Map([[keyAt(1), [{ state: 2 }]]]))).toBeNull();
  });
});

describe('lineSrsState cost', () => {
  it('answers at once for lines with no move in the repertoire', () => {
    const cards = new Map([[keyAt(1), [{ state: 2 }]]]); // only 1...c5 is in the repertoire
    const other = ['d2d4', 'd7d5', 'c2c4', 'e7e6', 'b1c3', 'g8f6', 'c1g5', 'f8e7', 'e2e3', 'e8g8'];
    const t0 = performance.now();
    for (let i = 0; i < 3000; i++) {
      lineSrsState(other, 'b', cards);
      lineSrsState(LINE, 'b', new Map());
    }
    expect(performance.now() - t0).toBeLessThan(100);
  });
});

describe('lineReviewedOn', () => {
  const day = new Date(2026, 9, 13).getTime();
  const at = (ms: number) => [{ state: 2, lastReview: new Date(ms) }];
  it('is true when every user move was reviewed on that day', () => {
    const cards = new Map([
      [keyAt(1), at(day + 3_600_000)],
      [keyAt(3), at(day + 7_200_000)],
    ]);
    expect(lineReviewedOn(LINE, 'b', cards, day)).toBe(true);
  });
  it('is false when a user move was reviewed earlier, or has no card', () => {
    expect(
      lineReviewedOn(
        LINE,
        'b',
        new Map([
          [keyAt(1), at(day + 1)],
          [keyAt(3), at(day - 1)],
        ]),
        day,
      ),
    ).toBe(false);
    expect(lineReviewedOn(LINE, 'b', new Map([[keyAt(1), at(day + 1)]]), day)).toBe(false);
  });
});
