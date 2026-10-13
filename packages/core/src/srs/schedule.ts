import { type Card, type Grade, Rating, State, createEmptyCard, fsrs } from 'ts-fsrs';
import type { AttemptResult } from '../drill/drill';

export { Rating, State as CardState };

/** FSRS state of one user move. Mirrors the `card` table in @processchess/db. */
export interface SrsCard {
  due: Date;
  stability: number;
  difficulty: number;
  elapsedDays: number;
  scheduledDays: number;
  learningSteps: number;
  reps: number;
  lapses: number;
  /** ts-fsrs State: 0 New, 1 Learning, 2 Review, 3 Relearning. */
  state: State;
  lastReview: Date | null;
}

/** The part of an `attempt` row that drives scheduling. */
export interface ReviewInput {
  ts: Date;
  result: AttemptResult;
  hints: number;
  timeMs: number;
}

export interface ScheduleOptions {
  /** A correct answer at most this fast (ms) is rated Easy. Default 2000. */
  easyMs?: number;
}

export const DEFAULT_EASY_MS = 2000;

// ts-fsrs defaults (retention 0.9, short-term steps 1m/10m); fuzz off keeps replays exact.
const scheduler = fsrs({ enable_fuzz: false });

/**
 * correct → Good (Easy when fast), hint → Hard (Again when the whole move was shown),
 * wrong → Again.
 */
export function ratingFor(
  attempt: Pick<ReviewInput, 'result' | 'hints' | 'timeMs'>,
  options: ScheduleOptions = {},
): Grade {
  switch (attempt.result) {
    case 'correct':
      return attempt.timeMs <= (options.easyMs ?? DEFAULT_EASY_MS) ? Rating.Easy : Rating.Good;
    case 'hint':
      return attempt.hints >= 3 ? Rating.Again : Rating.Hard;
    case 'wrong':
      return Rating.Again;
  }
}

function toFsrs(c: SrsCard): Card {
  return {
    due: c.due,
    stability: c.stability,
    difficulty: c.difficulty,
    elapsed_days: c.elapsedDays,
    scheduled_days: c.scheduledDays,
    learning_steps: c.learningSteps,
    reps: c.reps,
    lapses: c.lapses,
    state: c.state,
    ...(c.lastReview ? { last_review: c.lastReview } : {}),
  };
}

function fromFsrs(c: Card): SrsCard {
  return {
    due: c.due,
    stability: c.stability,
    difficulty: c.difficulty,
    elapsedDays: c.elapsed_days,
    scheduledDays: c.scheduled_days,
    learningSteps: c.learning_steps,
    reps: c.reps,
    lapses: c.lapses,
    state: c.state,
    lastReview: c.last_review ?? null,
  };
}

/** Applies one attempt to a card (`null` = the move has never been tried). */
export function reviewCard(
  card: SrsCard | null,
  attempt: ReviewInput,
  options: ScheduleOptions = {},
): { card: SrsCard; rating: Grade; isNew: boolean } {
  const rating = ratingFor(attempt, options);
  const current = card ? toFsrs(card) : createEmptyCard(attempt.ts);
  const next = scheduler.next(current, attempt.ts, rating).card;
  return { card: fromFsrs(next), rating, isNew: card === null };
}

/** The card of a move from its attempts, oldest first; null when there are none. */
export function replayCard(
  attempts: readonly ReviewInput[],
  options: ScheduleOptions = {},
): SrsCard | null {
  let card: SrsCard | null = null;
  for (const a of attempts) card = reviewCard(card, a, options).card;
  return card;
}
