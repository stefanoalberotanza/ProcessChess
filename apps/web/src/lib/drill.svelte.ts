import {
  type AutoMove,
  type CardCounts,
  type DrillState,
  type Hint,
  type LineDrillOptions,
  type SubmitResult,
  type Tree,
  cardCounts,
  drillProgress,
  dueNodeIds,
  endOfLocalDay,
  fenAt,
  nextLine,
  parseUci,
  pathTo,
  repeatLine,
  requestHint,
  reviewProgress,
  startLineDrill,
  startReviewDrill,
  submitMove,
  uciToSan,
} from '@processchess/core';
import type { MoveHistory } from '@processchess/db';
import type { BoardShape } from '$lib/Board.svelte';
import { storage } from '$lib/app.svelte';
import { t } from '$lib/i18n/index.svelte';
import { now } from '$lib/time';

export interface LineHistory {
  id: string;
  san: string;
  history: MoveHistory;
  fenBefore: string;
}

/**
 * UI state of a line drill (engine in @processchess/core) plus the logging of sessions,
 * attempts and passes. Lives in the workspace so the drill shares the board.
 */
export class DrillController {
  drill = $state.raw<DrillState | null>(null);
  hint = $state<Hint | null>(null);
  wrongSan = $state<string | null>(null);
  announcement = $state('');
  saving = $state(0);
  lineHistories = $state.raw<LineHistory[]>([]);
  /** Review of the due moves (FSRS) instead of the line drill. */
  review = $state(false);
  /** Review: card counts after the last line (due again / next due date). */
  afterReview = $state.raw<CardCounts | null>(null);
  collectionId: string | null = null;
  private sessionId: string | null = null;
  private options: LineDrillOptions = {};
  private writes: Promise<unknown> = Promise.resolve();

  get active(): boolean {
    return this.drill !== null;
  }

  async start(collectionId: string, tree: Tree, options: LineDrillOptions = {}) {
    await this.stop();
    const db = storage();
    const passes = await db.listLinePasses(collectionId);
    // the session row must exist before the first attempt can be logged
    this.sessionId = (await db.startSession(collectionId, tree.rootId)).id;
    this.collectionId = collectionId;
    this.options = options;
    this.review = false;
    this.drill = startLineDrill({ tree, passes }, options);
    this.reset();
  }

  /** Review of the moves due now; the other moves are played automatically. */
  async startReview(collectionId: string, tree: Tree) {
    await this.stop();
    this.sessionId = (await storage().startSession(collectionId, tree.rootId)).id;
    this.collectionId = collectionId;
    this.review = true;
    await this.beginReview(tree);
  }

  private async beginReview(tree: Tree) {
    await this.writes; // cards are updated by the pending attempt writes
    const cards = await storage().listCards(this.collectionId!);
    this.drill = startReviewDrill({ tree }, dueNodeIds(tree, cards, now()));
    this.reset();
    if (this.drill.phase === 'done') await this.loadAfterReview();
  }

  private async loadAfterReview() {
    await this.writes;
    if (!this.drill || !this.collectionId) return;
    const at = now();
    this.afterReview = cardCounts(
      this.drill.tree,
      await storage().listCards(this.collectionId),
      at,
      endOfLocalDay(at),
    );
  }

  get reviewed() {
    return this.drill ? reviewProgress(this.drill) : { done: 0, total: 0 };
  }

  async stop() {
    if (this.sessionId) {
      const id = this.sessionId;
      this.save(() => storage().endSession(id));
    }
    this.sessionId = null;
    this.drill = null;
    this.review = false;
    this.reset();
    await this.writes;
  }

  get fen(): string | null {
    return this.drill ? fenAt(this.drill.tree, this.drill.currentId) : null;
  }

  get awaitingMove(): boolean {
    return this.drill?.phase === 'user' || this.drill?.phase === 'retry';
  }

  get progress() {
    return this.drill ? drillProgress(this.drill) : { clean: 0, total: 0 };
  }

  get movesSan(): string[] {
    return this.drill
      ? pathTo(this.drill.tree, this.drill.currentId)
          .slice(1)
          .map((n) => n.san!)
      : [];
  }

  get lastMove(): [string, string] | undefined {
    const uci = this.drill?.tree.nodes.get(this.drill.currentId)?.uci;
    if (!uci) return undefined;
    const { from, to } = parseUci(uci);
    return [from, to];
  }

  get shapes(): BoardShape[] {
    if (this.drill?.reveal) {
      const { from, to } = parseUci(this.drill.reveal);
      return [{ from, to, color: 'green' }];
    }
    if (this.hint?.uci) {
      const { from, to } = parseUci(this.hint.uci);
      return [{ from, to, color: 'blue' }];
    }
    if (this.hint?.from) return [{ from: this.hint.from, color: 'blue' }];
    return [];
  }

  /** Plays a UCI move; false when it was wrong (the board snaps back). */
  play(uci: string): boolean {
    const fen = this.fen;
    if (!this.drill || !fen || !this.awaitingMove) return false;
    const san = uciToSan(fen, uci) ?? uci;
    const r = submitMove(this.drill, uci);
    this.handle(r, san, fen);
    return r.outcome !== 'wrong';
  }

  askHint() {
    if (!this.drill || !this.awaitingMove) return;
    const r = requestHint(this.drill);
    this.drill = r.state;
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
    if (!this.drill) return;
    this.drill = repeatLine(this.drill);
    this.reset();
  }

  next() {
    if (!this.drill || this.drill.phase !== 'line-complete') return;
    this.drill = nextLine(this.drill);
    this.reset();
    if (this.review && this.drill.phase === 'done') {
      this.announcement = t('review.allDone');
      void this.loadAfterReview();
    }
  }

  restart() {
    if (!this.drill) return;
    if (this.review) {
      void this.beginReview(this.drill.tree);
      return;
    }
    this.drill = startLineDrill({ tree: this.drill.tree, passes: this.drill.passes }, this.options);
    this.reset();
  }

  private reset() {
    this.afterReview = null;
    this.hint = null;
    this.wrongSan = null;
    this.lineHistories = [];
    const d = this.drill;
    if (!d) this.announcement = '';
    else if (d.phase === 'done') {
      this.announcement = this.review ? t('review.nothingDue') : t('drill.allDone');
    } else if (this.review && d.lastAutoMoves.length) {
      this.announcement = `${this.autoText(d.lastAutoMoves)} ${t('drill.yourMove')}`;
    } else {
      const opp = d.lastOpponentMove;
      this.announcement = opp ? t('drill.announceOpponent', { san: opp.san }) : t('drill.yourMove');
    }
  }

  private autoText(moves: readonly AutoMove[]): string {
    return t('review.auto', { moves: moves.map((m) => m.san).join(' ') });
  }

  private handle(r: SubmitResult, playedSan: string, fenBefore: string) {
    this.hint = null;
    if (r.outcome === 'wrong') {
      this.wrongSan = playedSan;
      const correct = uciToSan(fenBefore, r.state.reveal!) ?? r.state.reveal!;
      this.announcement = t('drill.announceWrong', { san: playedSan, correct });
    } else {
      this.wrongSan = null;
      const parts = [
        r.outcome === 'alternative'
          ? t('drill.announceAlternative', { san: playedSan })
          : t('drill.announceCorrect', { san: playedSan }),
      ];
      if (this.review && r.autoMoves) parts.push(this.autoText(r.autoMoves));
      else if (r.opponentMove) {
        parts.push(t('drill.announceOpponent', { san: r.opponentMove.san }));
      }
      if (r.pass) parts.push(r.pass.clean ? t('drill.lineClean') : t('drill.lineWithErrors'));
      else if (this.review && r.state.phase === 'line-complete') parts.push(t('review.lineDone'));
      this.announcement = parts.join(' ');
    }
    const sid = this.sessionId!;
    const cid = this.collectionId!;
    if (r.attempt) {
      const attempt = r.attempt;
      this.save(() => storage().recordAttempt({ sessionId: sid, ...attempt }));
    }
    if (r.pass) {
      const pass = r.pass;
      this.save(() => storage().recordLinePass({ sessionId: sid, collectionId: cid, ...pass }));
    }
    if (r.state.phase === 'line-complete') {
      const state = r.state;
      this.save(() => this.loadLineHistories(state));
    }
    this.drill = r.state;
  }

  private async loadLineHistories(state: DrillState) {
    const tree = state.tree;
    const userNodes = state.pathIds.map((id) => tree.nodes.get(id)!).filter((n) => n.isUserMove);
    this.lineHistories = await Promise.all(
      userNodes.map(async (n) => ({
        id: n.id,
        san: n.san!,
        history: await storage().getMoveHistory(n.id),
        fenBefore: fenAt(tree, n.parentId!),
      })),
    );
  }

  /** Queues a write so that the log keeps the order of the moves. */
  private save(fn: () => Promise<unknown>) {
    this.saving++;
    this.writes = this.writes.then(fn).catch((e) => {
      this.announcement = t('error.generic', { message: (e as Error).message });
    });
    void this.writes.finally(() => this.saving--);
  }
}
