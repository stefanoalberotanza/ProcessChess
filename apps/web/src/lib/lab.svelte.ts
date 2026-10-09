import {
  type Hint,
  type RecallResult,
  type RecallState,
  parseUci,
  recallHint,
  recallUserPlies,
  restartRecall,
  startRecall,
  submitRecall,
  toEpd,
  uciToSan,
} from '@processchess/core';
import { type LabEdgeStats, type LabRun, type LabRunSummary, newId } from '@processchess/db';
import type { BoardShape } from '$lib/Board.svelte';
import { storage } from '$lib/app.svelte';
import { t } from '$lib/i18n/index.svelte';

/** An opening to practise: the line (UCI from the initial position) and its name. */
export interface LabItem {
  line: string[];
  eco: string | null;
  name: string | null;
  /** Whose opening it is; the board is shown from that side during practice. */
  side: 'w' | 'b' | null;
}

export const lineKey = (line: readonly string[]) => line.join(' ');
export const edgeKey = (fen: string, uci: string) => `${toEpd(fen)} ${uci}`;

const AUTO_KEY = 'processchess.labAutoOpponent';

function loadAutoOpponent(): boolean {
  try {
    return localStorage.getItem(AUTO_KEY) !== 'false';
  } catch {
    return true; // storage unavailable: the default
  }
}

/** Runs needed in a row without mistakes or hints to call an opening automatic. */
export const MASTERED_STREAK = 3;

/**
 * Opening lab session (ADR 011): the user rebuilds the first moves of an opening, both sides,
 * again and again. Every move is logged per graph edge, every completed recall as a run.
 */
export class LabController {
  recall = $state.raw<RecallState | null>(null);
  item = $state.raw<LabItem | null>(null);
  hint = $state<Hint | null>(null);
  wrongSan = $state<string | null>(null);
  announcement = $state('');
  saving = $state(0);
  /** The opponent's moves are played by themselves; the user plays only the opening's side. */
  autoOpponent = $state(loadAutoOpponent());
  /** Runs of the current item, oldest first. */
  runs = $state.raw<LabRun[]>([]);
  // raw state replaced as a whole on every load, never mutated: plain Maps are enough
  // eslint-disable-next-line svelte/prefer-svelte-reactivity
  summaries = $state.raw<Map<string, LabRunSummary>>(new Map());
  // eslint-disable-next-line svelte/prefer-svelte-reactivity
  edgeStats = $state.raw<Map<string, LabEdgeStats>>(new Map());
  private queue: LabItem[] = [];
  private index = 0;
  private runId = '';
  private writes: Promise<unknown> = Promise.resolve();

  get active(): boolean {
    return this.recall !== null;
  }
  get awaitingMove(): boolean {
    return !!this.recall && this.recall.phase !== 'done';
  }
  get fen(): string | null {
    return this.recall ? this.recall.fens[this.recall.ply]! : null;
  }
  get sansPlayed(): string[] {
    return this.recall ? this.recall.sans.slice(0, this.recall.ply) : [];
  }
  get lastMove(): [string, string] | undefined {
    const uci = this.recall && this.recall.ply > 0 ? this.recall.ucis[this.recall.ply - 1] : null;
    if (!uci) return undefined;
    const { from, to } = parseUci(uci);
    return [from, to];
  }
  get shapes(): BoardShape[] {
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
  /** The side the user plays when the opponent is automatic (White for a line with no side). */
  private get autoSide(): 'w' | 'b' | null {
    if (!this.autoOpponent) return null;
    return this.item?.side === 'b' ? 'w' : 'b';
  }

  /** Switches the automatic opponent on or off; the current run starts again. */
  setAutoOpponent(on: boolean) {
    this.autoOpponent = on;
    try {
      localStorage.setItem(AUTO_KEY, String(on));
    } catch {
      // ignore
    }
    if (this.item) this.repeat();
  }

  get hasNext(): boolean {
    return this.index + 1 < this.queue.length;
  }

  /** Loads the lab history (run summaries and per-edge stats). */
  async refresh() {
    await this.writes;
    await this.load();
  }

  private async load() {
    const db = storage();
    [this.summaries, this.edgeStats] = await Promise.all([db.labRunSummaries(), db.labEdgeStats()]);
    if (this.item) this.runs = await db.labRuns(this.item.line);
  }

  /** Starts practising `queue[index]`; Next moves along the queue. */
  async start(queue: LabItem[], index: number) {
    this.queue = queue;
    this.index = index;
    await this.begin();
  }

  private async begin() {
    this.item = this.queue[this.index] ?? null;
    if (!this.item) return this.stop();
    this.recall = startRecall(this.item.line, { autoSide: this.autoSide });
    this.runId = newId();
    this.reset();
    this.runs = await storage().labRuns(this.item.line);
  }

  stop() {
    this.recall = null;
    this.item = null;
    this.runs = [];
    this.reset();
  }

  play(uci: string): boolean {
    const fen = this.fen;
    if (!this.recall || !fen || !this.awaitingMove) return false;
    const san = uciToSan(fen, uci) ?? uci;
    const r = submitRecall(this.recall, uci);
    this.handle(r, san, fen);
    return r.outcome === 'correct';
  }

  askHint() {
    if (!this.recall || !this.awaitingMove) return;
    const r = recallHint(this.recall);
    this.recall = r.state;
    this.hint = r.hint;
    this.announcement = this.hintText(r.hint);
  }

  hintText(h: Hint): string {
    const piece = t(`piece.${h.piece as 'p'}`);
    if (h.level === 1) return t('drill.hintPiece', { piece });
    if (h.level === 2) return t('drill.hintFrom', { piece, square: h.from! });
    return t('drill.hintMove', { san: uciToSan(this.fen!, h.uci!) ?? h.uci! });
  }

  repeat() {
    if (!this.recall || !this.item) return;
    this.recall = restartRecall({ ...this.recall, autoSide: this.autoSide });
    this.runId = newId();
    this.reset();
  }

  async next() {
    if (!this.recall || this.recall.phase !== 'done' || !this.hasNext) return;
    this.index++;
    await this.begin();
  }

  private reset() {
    this.hint = null;
    this.wrongSan = null;
    const r = this.recall;
    if (!r) {
      this.announcement = '';
      return;
    }
    if (!r.autoSide) {
      this.announcement = t('lab.start', { n: r.ucis.length });
      return;
    }
    const parts = [t('lab.startAuto', { n: recallUserPlies(r) })];
    if (r.ply > 0) parts.push(this.opponentText(r.sans.slice(0, r.ply)));
    this.announcement = parts.join(' ');
  }

  private opponentText(sans: readonly string[]): string {
    return t('drill.announceOpponent', { san: sans.join(' ') });
  }

  private handle(r: RecallResult, playedSan: string, fenBefore: string) {
    this.hint = null;
    if (r.outcome === 'wrong') {
      this.wrongSan = playedSan;
      const correct = uciToSan(fenBefore, r.state.reveal!) ?? r.state.reveal!;
      this.announcement = t('lab.wrong', { san: playedSan, correct });
    } else {
      this.wrongSan = null;
      this.announcement = t('drill.announceCorrect', { san: playedSan });
      if (r.autoMoves) {
        const opp = this.opponentText(r.autoMoves.map((m) => m.san));
        this.announcement = `${this.announcement} ${opp}`;
      }
      if (r.run) {
        this.announcement = r.run.clean
          ? t('lab.doneClean')
          : t('lab.doneWithErrors', { errors: r.run.errors, hints: r.run.hints });
      }
    }
    const runId = this.runId;
    if (r.attempt) {
      const attempt = r.attempt;
      this.save(() => storage().recordLabAttempt({ runId, ...attempt }));
    }
    if (r.run && this.item) {
      const run = r.run;
      const { line, eco, name } = this.item;
      this.save(() => storage().recordLabRun({ id: runId, line, eco, name, ...run }));
      this.save(() => this.load()); // inside the write queue: must not await it
    }
    this.recall = r.state;
  }

  private save(fn: () => Promise<unknown>) {
    this.saving++;
    this.writes = this.writes.then(fn).catch((e) => {
      this.announcement = t('error.generic', { message: (e as Error).message });
    });
    void this.writes.finally(() => this.saving--);
  }
}
