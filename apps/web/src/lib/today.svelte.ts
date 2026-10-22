import {
  type Hint,
  type OpeningGraph,
  type PuzzleCandidate,
  type RecallAttempt,
  type RecallState,
  type SrsCard,
  type TodayRun,
  buildNameTree,
  criticalPly,
  currentStreak,
  dailyMix,
  dayKey,
  dueCandidates,
  lineSrsState,
  moveCorrect,
  moveWrong,
  newCandidates,
  openingOf,
  openingSide,
  parseUci,
  practiceDays,
  practiceLine,
  puzzleDone,
  recallHint,
  repertoireSession,
  resolveOpening,
  seededRandom,
  selectPuzzles,
  startRecall,
  startRun,
  submitRecall,
  toEpd,
  uciToSan,
  weekId,
  weekOf,
} from '@processchess/core';
import { newId } from '@processchess/db';
import type { BoardShape } from '$lib/Board.svelte';
import { storage } from '$lib/app.svelte';
import { effects } from '$lib/effects.svelte';
import { t } from '$lib/i18n/index.svelte';
import { MASTERED_STREAK, lineKey } from '$lib/lab.svelte';
import { feedRepertoire } from '$lib/practice-log';
import { playCue } from '$lib/sound';
import { markTodayStarted, startedToday } from '$lib/today-day';

/** A puzzle of the session: a line, the side the user plays, and the ply the user starts at. */
export interface Puzzle extends PuzzleCandidate {
  fromPly: number;
}

export type TodayStatus =
  'idle' | 'loading' | 'playing' | 'puzzle-done' | 'finished' | 'done-for-today' | 'empty';

/** The card shown when a puzzle ends. */
export interface PuzzleResult {
  outcome: 'clean' | 'hints' | 'errors';
  name: string | null;
  /** The line turned automatic (FSRS known) with this puzzle. */
  automatic: boolean;
}

/** Delay between the lead-in plies, in ms. */
const LEAD_IN_MS = 300;
const DAY_MS = 24 * 60 * 60 * 1000;
const STREAK_DAYS = 400;

type Cards = Map<string, SrsCard[]>;

function reducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

function nameAt(sans: readonly string[]): string | null {
  try {
    return resolveOpening(sans)?.name ?? null;
  } catch {
    return null; // openings not loaded: no names
  }
}

/** "5…a6" or "5.e4" for the move at 0-based `ply` of a line from the initial position. */
function moveLabel(ply: number, san: string): string {
  const n = Math.floor(ply / 2) + 1;
  return ply % 2 === 0 ? `${n}.${san}` : `${n}…${san}`;
}

/**
 * Today (spec 2026-10-16-today-puzzles): one short session a day of puzzles taken from the
 * repertoire, with hearts, combo and streak. Moves are logged like lab moves (ADR 013), without a
 * `lab_run`, since a puzzle plays only the tail of a line.
 */
export class TodayController {
  status = $state<TodayStatus>('loading');
  run = $state.raw<TodayRun>(startRun(0));
  puzzles = $state.raw<Puzzle[]>([]);
  recall = $state.raw<RecallState | null>(null);
  /** Ply shown on the board: behind `recall.ply` while the lead-in plays. */
  shown = $state(0);
  hint = $state<Hint | null>(null);
  announcement = $state('');
  /** The opening or variation name revealed by the last move. */
  revealed = $state<string | null>(null);
  result = $state.raw<PuzzleResult | null>(null);
  /** Moves answered wrongly in this session ("1…c5 (Sicilian Defense)"), for the summary. */
  review = $state.raw<string[]>([]);
  streak = $state(0);
  flashN = 0;
  flash = $state.raw<{ square: string; kind: 'right' | 'wrong'; n: number } | undefined>();
  shake = $state(0);
  mood = $state<'calm' | 'happy' | 'sorry' | 'proud'>('calm');
  // eslint-disable-next-line svelte/prefer-svelte-reactivity -- not reactive state
  private cards: Cards = new Map();
  private runId = '';
  private sessions: Record<string, string> = {};
  private writes: Promise<unknown> = Promise.resolve();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private marked = false;
  private preparing = false;
  private streakFresh = false;
  private draws = 0;
  private errors = 0;
  private hints = 0;

  get active(): boolean {
    return this.status === 'playing' || this.status === 'puzzle-done';
  }
  get puzzle(): Puzzle | null {
    return this.puzzles[this.run.puzzle] ?? null;
  }
  get side(): 'w' | 'b' {
    return this.puzzle?.side ?? 'w';
  }
  get awaitingMove(): boolean {
    const r = this.recall;
    return this.status === 'playing' && !!r && r.phase !== 'done' && this.shown === r.ply;
  }
  get fen(): string | null {
    return this.recall ? this.recall.fens[this.shown]! : null;
  }
  get sansPlayed(): string[] {
    return this.recall ? this.recall.sans.slice(0, this.shown) : [];
  }
  get lastMove(): [string, string] | undefined {
    const uci = this.recall && this.shown > 0 ? this.recall.ucis[this.shown - 1] : null;
    if (!uci) return undefined;
    const { from, to } = parseUci(uci);
    return [from, to];
  }
  get shapes(): BoardShape[] {
    if (!this.awaitingMove) return [];
    if (this.recall?.reveal) {
      const { from, to } = parseUci(this.recall.reveal);
      return [{ from, to, color: 'green' }];
    }
    if (this.hint?.uci) {
      const { from, to } = parseUci(this.hint.uci);
      return [{ from, to, color: 'blue' }];
    }
    if (this.hint?.from) return [{ from: this.hint.from, color: 'blue' }];
    return [];
  }

  /** Loads the candidates and the streak; the day's state decides the status. */
  // eslint-disable-next-line svelte/prefer-svelte-reactivity -- the default `now` is not reactive state
  async prepare(graph: OpeningGraph | null, now = new Date()) {
    if (this.active || this.preparing) return;
    this.preparing = true;
    this.status = 'loading';
    try {
      await this.writes;
      const db = storage();
      const [collections, cards, summaries, slots] = await Promise.all([
        db.listCollections(),
        db.repertoireCards(),
        db.labRunSummaries(),
        db.practiceTimes(now.getTime() - STREAK_DAYS * DAY_MS),
      ]);
      this.cards = cards;
      this.streak = currentStreak(practiceDays(slots), now);
      if (startedToday(now)) {
        this.status = 'done-for-today';
        return;
      }
      const repertoires = await Promise.all(
        collections.map(async (c) => ({
          source: c.source,
          tree: await db.loadTree(c.id),
          cards: await db.listCards(c.id),
        })),
      );
      const week = weekId(now);
      const candidates: PuzzleCandidate[] = [
        ...dueCandidates(repertoireSession(repertoires, now)),
        ...newCandidates(repertoires.filter((r) => weekOf(r.source) === week)),
      ];
      if (graph) {
        const names = buildNameTree(graph);
        const lineOf = (n: { ucis: string[] }) => lineKey(practiceLine(graph, n.ucis));
        const mix = dailyMix({
          tree: names,
          summaryOf: (n) => {
            const s = summaries.get(lineOf(n));
            return s && { ...s, lastAt: s.lastAt.getTime() };
          },
          day: dayKey(now),
          shuffle: 0,
          masteredStreak: MASTERED_STREAK,
          lineOf,
        });
        for (const { node, kind } of mix) {
          if (kind !== 'new') continue;
          const owner = openingSide(names, openingOf(names, node));
          const side = owner === 'both' ? (node.side ?? 'w') : owner;
          candidates.push({ line: practiceLine(graph, node.ucis), side, kind: 'fill' });
        }
      }
      // a puzzle needs at least one user move to ask
      const playable = candidates.flatMap((c) => {
        const fromPly = criticalPly(c.line, c.side, cards, now);
        return fromPly < c.line.length ? [{ ...c, fromPly }] : [];
      });
      // eslint-disable-next-line svelte/prefer-svelte-reactivity -- not reactive state
      const byLine = new Map(playable.map((p) => [lineKey(p.line), p]));
      const picked = selectPuzzles(playable, {
        // seeded by the day and a per-page counter: stable within a load, a new draw on each prepare
        random: seededRandom(`${dayKey(now)}:${this.draws++}`),
      });
      this.puzzles = picked.map((c) => byLine.get(lineKey(c.line))!);
      this.status = this.puzzles.length ? 'idle' : 'empty';
    } catch (e) {
      this.puzzles = [];
      this.status = 'empty';
      this.announcement = t('error.generic', { message: (e as Error).message });
    } finally {
      this.preparing = false;
    }
  }

  /** Starts the session; the day is marked at the first move played. */
  start() {
    // another tab, or this one left open past midnight, may have begun today's session
    if (startedToday()) {
      this.status = 'done-for-today';
      return;
    }
    if (this.status !== 'idle' || !this.puzzles.length) return;
    this.run = startRun(this.puzzles.length);
    this.review = [];
    this.marked = false;
    this.streakFresh = false;
    this.status = 'playing';
    this.begin();
  }

  /** Ends the session (leaving the tab); the day stays marked once a move was played. */
  stop() {
    this.clearTimer();
    this.closeSessions();
    this.recall = null;
    this.hint = null;
    if (this.active) this.status = this.marked ? 'done-for-today' : 'idle';
  }

  play(uci: string): boolean {
    const r = this.recall;
    const fen = this.fen;
    if (!r || !fen || !this.awaitingMove) return false;
    if (!this.marked) {
      this.marked = true;
      markTodayStarted();
    }
    const san = uciToSan(fen, uci) ?? uci;
    const firstTry = r.firstWrongUci === null;
    const res = submitRecall(r, uci);
    this.hint = null;
    this.revealed = null;
    if (res.outcome === 'wrong') {
      this.recall = res.state;
      const correct = uciToSan(fen, res.state.reveal!) ?? res.state.reveal!;
      if (firstTry) this.noteError(r.ply, correct);
      this.run = moveWrong(this.run, firstTry);
      this.shake++;
      this.setFlash(uci, 'wrong');
      this.mood = 'sorry';
      playCue('wrong');
      this.announcement = t('lab.wrong', { san, correct });
      if (this.run.status === 'stopped') {
        // the move that cost the last heart is never played right: log it as wrong now
        this.log(
          {
            ply: r.ply + 1,
            epd: toEpd(r.fens[r.ply]!),
            uci: r.ucis[r.ply]!,
            result: 'wrong',
            playedUci: uci.toLowerCase(),
            hints: r.hintLevel,
            timeMs: r.clock() - r.shownAt,
          },
          fen,
        );
        this.finish(); // ends the FSRS sessions after the queued writes
      }
      return false;
    }
    const attempt = res.attempt!;
    if (attempt.result === 'wrong') this.errors++;
    else if (attempt.result === 'hint') this.hints++;
    this.run = moveCorrect(this.run, attempt.result);
    this.log(attempt, fen);
    if (!this.streakFresh) {
      // the day counts for the streak from the first move: refresh it once that move is saved
      this.streakFresh = true;
      this.save(() => this.loadStreak());
    }
    this.setFlash(uci, 'right');
    this.mood = 'happy';
    playCue('right');
    const before = nameAt(r.sans.slice(0, r.ply));
    const after = nameAt(r.sans.slice(0, r.ply + 1));
    const parts = [t('drill.announceCorrect', { san })];
    if (after && after !== before) {
      this.revealed = after;
      parts.push(`${after}.`);
      playCue('name');
    }
    this.recall = res.state;
    this.shown = res.state.ply;
    if (res.state.phase === 'done') this.puzzleEnd();
    else parts.push(this.prompt());
    this.announcement = parts.join(' ');
    return true;
  }

  askHint() {
    if (!this.recall || !this.awaitingMove) return;
    const r = recallHint(this.recall);
    this.recall = r.state;
    this.hint = r.hint;
    const piece = t(`piece.${r.hint.piece as 'p'}`);
    this.announcement =
      r.hint.level === 1
        ? t('drill.hintPiece', { piece })
        : r.hint.level === 2
          ? t('drill.hintFrom', { piece, square: r.hint.from! })
          : t('drill.hintMove', { san: uciToSan(this.fen!, r.hint.uci!) ?? r.hint.uci! });
  }

  /** No restart in a puzzle: one try per session. */
  repeat() {}

  /** After a puzzle card: the next puzzle, or the session summary. */
  next() {
    if (this.status !== 'puzzle-done') return;
    if (this.run.status === 'playing') {
      this.status = 'playing';
      this.begin();
    } else this.finish();
  }

  private begin() {
    const p = this.puzzle;
    if (!p) return this.finish();
    this.clearTimer();
    this.closeSessions();
    this.runId = newId();
    this.errors = 0;
    this.hints = 0;
    this.hint = null;
    this.result = null;
    this.revealed = null;
    this.mood = 'calm';
    this.recall = startRecall(p.line, {
      autoSide: p.side === 'w' ? 'b' : 'w',
      fromPly: p.fromPly,
    });
    this.shown = 0;
    this.announcement = '';
    this.leadIn();
  }

  /** Plays the plies before the critical one by themselves, then prompts the user. */
  private leadIn() {
    const r = this.recall;
    if (!r) return;
    if (!effects.on || reducedMotion()) this.shown = r.ply;
    if (this.shown >= r.ply) {
      // the clock of the first move starts when it is asked
      this.recall = { ...r, shownAt: r.clock() };
      this.announcement = this.prompt();
      return;
    }
    this.timer = setTimeout(() => {
      this.timer = null;
      this.shown++;
      this.leadIn();
    }, LEAD_IN_MS);
  }

  private prompt(): string {
    const r = this.recall;
    if (!r || r.ply === 0) return t('today.yourTurn');
    const ply = r.ply - 1;
    return t('today.opponentPlayed', {
      color: t(`color.${ply % 2 === 0 ? 'w' : 'b'}`),
      move: moveLabel(ply, r.sans[ply]!),
    });
  }

  private puzzleEnd() {
    const p = this.puzzle!;
    const { errors, hints } = this;
    this.run = puzzleDone(this.run, { errors, hints });
    const name = nameAt(this.recall!.sans);
    this.result = {
      outcome: errors > 0 ? 'errors' : hints > 0 ? 'hints' : 'clean',
      name,
      automatic: false,
    };
    this.status = 'puzzle-done';
    this.mood = errors > 0 ? 'calm' : 'proud';
    playCue('done');
    const wasKnown = lineSrsState(p.line, p.side, this.cards) === 'known';
    const runId = this.runId; // a late write must not reach the next puzzle's card
    this.closeSessions();
    this.save(async () => {
      this.cards = await storage().repertoireCards();
      const automatic = !wasKnown && lineSrsState(p.line, p.side, this.cards) === 'known';
      if (automatic && this.result && this.runId === runId)
        this.result = { ...this.result, automatic };
    });
  }

  private finish() {
    this.clearTimer();
    this.closeSessions();
    if (this.run.status === 'stopped') {
      this.mood = 'sorry';
      playCue('lost');
    } else this.mood = 'proud';
    this.status = 'finished';
    this.recall = null;
    this.hint = null;
    this.save(() => this.loadStreak());
  }

  private async loadStreak() {
    // eslint-disable-next-line svelte/prefer-svelte-reactivity -- not reactive state
    const now = new Date();
    const slots = await storage().practiceTimes(now.getTime() - STREAK_DAYS * DAY_MS);
    this.streak = currentStreak(practiceDays(slots), now);
  }

  private noteError(ply: number, correctSan: string) {
    const name = nameAt(this.recall!.sans);
    const label = moveLabel(ply, correctSan);
    const entry = name ? `${label} (${name})` : label;
    if (!this.review.includes(entry)) this.review = [...this.review, entry];
  }

  private setFlash(uci: string, kind: 'right' | 'wrong') {
    this.flash = { square: parseUci(uci).to, kind, n: ++this.flashN };
  }

  private clearTimer() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  /** Logs a move like a lab move (ADR 013): the `lab_attempt` row and the FSRS feed. */
  private log(attempt: RecallAttempt, fenBefore: string) {
    const runId = this.runId;
    const sessions = this.sessions;
    this.save(() => storage().recordLabAttempt({ runId, ...attempt }));
    this.save(() => feedRepertoire(storage(), sessions, attempt, fenBefore));
  }

  /** Ends the FSRS sessions of the current puzzle, once its queued writes are done. */
  private closeSessions() {
    const open = this.sessions;
    this.sessions = {};
    this.save(async () => {
      const db = storage();
      for (const id of Object.values(open)) await db.endSession(id);
    });
  }

  private save(fn: () => Promise<unknown>) {
    this.writes = this.writes.then(fn).catch((e) => {
      this.announcement = t('error.generic', { message: (e as Error).message });
    });
  }
}
