import { describe, expect, it } from 'vitest';
import {
  CardState,
  Rating,
  type ReviewInput,
  type SrsCard,
  ratingFor,
  replayCard,
  reviewCard,
} from './index';

const MIN = 60_000;
const DAY = 24 * 60 * MIN;
const T0 = new Date(2026, 9, 8, 9, 0).getTime();

function review(
  ts: number,
  result: ReviewInput['result'],
  extra: Partial<ReviewInput> = {},
): ReviewInput {
  return { ts: new Date(ts), result, hints: 0, timeMs: 5000, ...extra };
}

describe('ratingFor', () => {
  it('maps attempts to FSRS ratings', () => {
    expect(ratingFor({ result: 'correct', hints: 0, timeMs: 1500 })).toBe(Rating.Easy);
    expect(ratingFor({ result: 'correct', hints: 0, timeMs: 2000 })).toBe(Rating.Easy);
    expect(ratingFor({ result: 'correct', hints: 0, timeMs: 2001 })).toBe(Rating.Good);
    expect(ratingFor({ result: 'hint', hints: 1, timeMs: 1000 })).toBe(Rating.Hard);
    expect(ratingFor({ result: 'hint', hints: 2, timeMs: 9000 })).toBe(Rating.Hard);
    expect(ratingFor({ result: 'hint', hints: 3, timeMs: 9000 })).toBe(Rating.Again);
    expect(ratingFor({ result: 'wrong', hints: 0, timeMs: 1000 })).toBe(Rating.Again);
  });

  it('honours a custom fast threshold', () => {
    const a = { result: 'correct' as const, hints: 0, timeMs: 2500 };
    expect(ratingFor(a, { easyMs: 3000 })).toBe(Rating.Easy);
    expect(ratingFor(a, { easyMs: 0 })).toBe(Rating.Good);
  });
});

describe('reviewCard', () => {
  it('creates a card from the first attempt', () => {
    const { card, rating, isNew } = reviewCard(null, review(T0, 'correct'));
    expect(isNew).toBe(true);
    expect(rating).toBe(Rating.Good);
    expect(card.reps).toBe(1);
    expect(card.lapses).toBe(0);
    expect(card.state).toBe(CardState.Learning);
    expect(card.lastReview).toEqual(new Date(T0));
    expect(card.due.getTime()).toBeGreaterThan(T0);
    expect(card.due.getTime()).toBeLessThanOrEqual(T0 + DAY);
  });

  it('a fast correct first answer graduates straight to review', () => {
    const { card } = reviewCard(null, review(T0, 'correct', { timeMs: 800 }));
    expect(card.state).toBe(CardState.Review);
    expect(card.scheduledDays).toBeGreaterThanOrEqual(1);
  });

  it('a wrong answer on a review card is a lapse due again within minutes', () => {
    let card = reviewCard(null, review(T0, 'correct', { timeMs: 800 })).card;
    const ts = card.due.getTime();
    const r = reviewCard(card, review(ts, 'wrong'));
    card = r.card;
    expect(r.isNew).toBe(false);
    expect(card.lapses).toBe(1);
    expect(card.state).toBe(CardState.Relearning);
    expect(card.due.getTime() - ts).toBeLessThanOrEqual(10 * MIN);
  });

  it('good answers on their due dates grow the interval', () => {
    let card: SrsCard | null = null;
    let ts = T0;
    const intervals: number[] = [];
    for (let i = 0; i < 6; i++) {
      card = reviewCard(card, review(ts, 'correct')).card;
      intervals.push(card.due.getTime() - ts);
      ts = card.due.getTime();
    }
    for (let i = 1; i < intervals.length; i++) {
      expect(intervals[i]).toBeGreaterThan(intervals[i - 1]!);
    }
    expect(card!.state).toBe(CardState.Review);
  });

  it('is deterministic', () => {
    const a = reviewCard(null, review(T0, 'hint', { hints: 1 })).card;
    const b = reviewCard(null, review(T0, 'hint', { hints: 1 })).card;
    expect(a).toEqual(b);
  });
});

describe('replayCard', () => {
  it('folds the attempts of a node in order', () => {
    const log = [
      review(T0, 'correct'),
      review(T0 + 10 * MIN, 'wrong'),
      review(T0 + 20 * MIN, 'hint', { hints: 2 }),
      review(T0 + 2 * DAY, 'correct', { timeMs: 1000 }),
    ];
    let card: SrsCard | null = null;
    for (const a of log) card = reviewCard(card, a).card;
    expect(replayCard(log)).toEqual(card);
  });

  it('returns null without attempts', () => {
    expect(replayCard([])).toBeNull();
  });
});
