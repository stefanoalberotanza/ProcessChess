<script lang="ts">
  import { resolve } from '$app/paths';
  import {
    type DrillState,
    type Hint,
    INITIAL_FEN,
    type SubmitResult,
    drillProgress,
    fenAt,
    nextLine,
    parseUci,
    pathTo,
    repeatLine,
    requestHint,
    sanToUci,
    startLineDrill,
    submitMove,
    toEpd,
    uciToSan,
  } from '@processchess/core';
  import type { Collection, MoveHistory as History } from '@processchess/db';
  import { onDestroy, onMount } from 'svelte';
  import Board, { type BoardShape } from '$lib/Board.svelte';
  import { queryParam, storage } from '$lib/app.svelte';
  import MoveHistory from '$lib/components/MoveHistory.svelte';
  import OpeningBar from '$lib/components/OpeningBar.svelte';
  import { t } from '$lib/i18n/index.svelte';

  let collection = $state<Collection | null>(null);
  let drill = $state.raw<DrillState | null>(null);
  let sessionId: string | null = null;
  let notFound = $state(false);
  let hint = $state<Hint | null>(null);
  let wrongSan = $state<string | null>(null);
  let announcement = $state('');
  let sanInput = $state('');
  let sanError = $state<string | null>(null);
  let saving = $state(0);
  let lineHistories = $state.raw<
    { id: string; san: string; history: History; fenBefore: string }[]
  >([]);
  let writes: Promise<unknown> = Promise.resolve();

  onMount(async () => {
    const id = queryParam('id');
    const db = storage();
    collection = id ? ((await db.getCollection(id)) ?? null) : null;
    if (!collection) {
      notFound = true;
      return;
    }
    const tree = await db.loadTree(collection.id);
    const passes = await db.listLinePasses(collection.id);
    // the session row must exist before the first attempt can be logged
    sessionId = (await db.startSession(collection.id, tree.rootId)).id;
    drill = startLineDrill({ tree, passes });
    announceStart();
  });

  onDestroy(() => {
    if (sessionId) void storage().endSession(sessionId);
  });

  /** Queues a write so that the log keeps the order of the moves. */
  function save(fn: () => Promise<unknown>) {
    saving++;
    writes = writes.then(fn).catch((e) => {
      announcement = t('error.generic', { message: (e as Error).message });
    });
    void writes.finally(() => saving--);
  }

  const tree = $derived(drill?.tree ?? null);
  const fen = $derived(drill ? fenAt(drill.tree, drill.currentId) : INITIAL_FEN);
  const progress = $derived(drill ? drillProgress(drill) : { clean: 0, total: 0 });
  const standardStart = $derived(
    tree ? tree.nodes.get(tree.rootId)!.epd === toEpd(INITIAL_FEN) : true,
  );
  const movesSan = $derived(
    drill && standardStart
      ? pathTo(drill.tree, drill.currentId)
          .slice(1)
          .map((n) => n.san!)
      : null,
  );
  const lastMove = $derived.by((): [string, string] | undefined => {
    const uci = drill ? drill.tree.nodes.get(drill.currentId)?.uci : null;
    if (!uci) return undefined;
    const { from, to } = parseUci(uci);
    return [from, to];
  });
  const shapes = $derived.by((): BoardShape[] => {
    if (drill?.reveal) {
      const { from, to } = parseUci(drill.reveal);
      return [{ from, to, color: 'green' }];
    }
    if (hint?.uci) {
      const { from, to } = parseUci(hint.uci);
      return [{ from, to, color: 'blue' }];
    }
    if (hint?.from) return [{ from: hint.from, color: 'blue' }];
    return [];
  });
  const lineNumber = $derived(drill ? Math.min(drill.queueIndex + 1, drill.queue.length) : 0);
  const awaitingMove = $derived(drill?.phase === 'user' || drill?.phase === 'retry');

  function announceStart() {
    if (!drill) return;
    const opp = drill.lastOpponentMove;
    announcement = opp ? t('drill.announceOpponent', { san: opp.san }) : t('drill.yourMove');
  }

  function handle(r: SubmitResult, playedSan: string) {
    hint = null;
    if (r.outcome === 'wrong') {
      wrongSan = playedSan;
      const correct = uciToSan(fen, r.state.reveal!) ?? r.state.reveal!;
      announcement = t('drill.announceWrong', { san: playedSan, correct });
    } else {
      wrongSan = null;
      const parts = [
        r.outcome === 'alternative'
          ? t('drill.announceAlternative', { san: playedSan })
          : t('drill.announceCorrect', { san: playedSan }),
      ];
      if (r.opponentMove) parts.push(t('drill.announceOpponent', { san: r.opponentMove.san }));
      if (r.pass) parts.push(r.pass.clean ? t('drill.lineClean') : t('drill.lineWithErrors'));
      announcement = parts.join(' ');
    }
    const sid = sessionId!;
    const cid = collection!.id;
    if (r.attempt) {
      const attempt = r.attempt;
      save(() => storage().recordAttempt({ sessionId: sid, ...attempt }));
    }
    if (r.pass) {
      const pass = r.pass;
      save(() => storage().recordLinePass({ sessionId: sid, collectionId: cid, ...pass }));
      save(loadLineHistories);
    }
    drill = r.state;
  }

  async function loadLineHistories() {
    if (!drill) return;
    const t0 = drill.tree;
    const userNodes = drill.pathIds.map((id) => t0.nodes.get(id)!).filter((n) => n.isUserMove);
    lineHistories = await Promise.all(
      userNodes.map(async (n) => ({
        id: n.id,
        san: n.san!,
        history: await storage().getMoveHistory(n.id),
        fenBefore: fenAt(t0, n.parentId!),
      })),
    );
  }

  function play(uci: string): boolean {
    if (!drill || !awaitingMove) return false;
    const san = uciToSan(fen, uci) ?? uci;
    const r = submitMove(drill, uci);
    handle(r, san);
    return r.outcome !== 'wrong';
  }

  function submitSan(event: SubmitEvent) {
    event.preventDefault();
    sanError = null;
    if (!drill || !awaitingMove) return;
    const uci = sanToUci(fen, sanInput);
    if (!uci) {
      sanError = t('drill.sanInvalid', { san: sanInput });
      return;
    }
    play(uci);
    sanInput = '';
  }

  function askHint() {
    if (!drill || !awaitingMove) return;
    const r = requestHint(drill);
    drill = r.state;
    hint = r.hint;
    announcement = hintText(r.hint);
  }

  function hintText(h: Hint): string {
    const piece = t(`piece.${h.piece as 'p'}`);
    if (h.level === 1) return t('drill.hintPiece', { piece });
    if (h.level === 2) return t('drill.hintFrom', { piece, square: h.from! });
    return t('drill.hintMove', { san: uciToSan(fen, h.uci!) ?? h.uci! });
  }

  function repeat() {
    if (!drill) return;
    drill = repeatLine(drill);
    reset();
  }

  function next() {
    if (!drill || drill.phase !== 'line-complete') return;
    drill = nextLine(drill);
    reset();
  }

  function restart() {
    if (!drill) return;
    drill = startLineDrill({ tree: drill.tree, passes: drill.passes });
    reset();
  }

  function reset() {
    hint = null;
    wrongSan = null;
    lineHistories = [];
    announceStart();
  }

  function onkeydown(e: KeyboardEvent) {
    if ((e.target as HTMLElement).closest('input, textarea, select') || e.ctrlKey || e.metaKey)
      return;
    if (e.key === 'h' || e.key === 'H') askHint();
    else if (e.key === 'r' || e.key === 'R') repeat();
    else if (e.key === ' ') next();
    else return;
    e.preventDefault();
  }
</script>

<svelte:window {onkeydown} />

{#if notFound}
  <p>{t('collection.notFound')} <a href={resolve('/')}>{t('common.back')}</a></p>
{:else if collection && drill}
  <div class="drill" data-saving={saving > 0 ? 'true' : 'false'}>
    <div class="head">
      <h1><a href={`${resolve('/collection')}?id=${collection.id}`}>{collection.name}</a></h1>
      <span data-testid="clean-counter" class="counter"
        >{t('drill.cleanCounter', { clean: progress.clean, total: progress.total })}</span
      >
      {#if drill.phase !== 'done'}
        <span class="muted">{t('drill.lineOf', { n: lineNumber, total: drill.queue.length })}</span>
      {/if}
    </div>

    <div class="layout">
      <div class="left">
        <OpeningBar {movesSan} outOfRepertoire={drill.phase === 'retry' ? wrongSan : null} />
        <Board
          {fen}
          orientation={collection.userColor === 'w' ? 'white' : 'black'}
          interactive={awaitingMove}
          {lastMove}
          {shapes}
          onmove={play}
        />
        <form class="san" onsubmit={submitSan}>
          <label for="san-input">{t('drill.sanLabel')}</label>
          <input
            id="san-input"
            type="text"
            autocomplete="off"
            autocapitalize="off"
            spellcheck="false"
            bind:value={sanInput}
            disabled={!awaitingMove}
            aria-describedby="san-help"
          />
          <button type="submit" disabled={!awaitingMove}>{t('drill.play')}</button>
          <span id="san-help" class="sr-only">{t('drill.sanHelp')}</span>
          {#if sanError}<span class="error" role="alert">{sanError}</span>{/if}
        </form>
      </div>

      <div class="right">
        <p class="live" aria-live="polite" data-testid="announcement">{announcement}</p>

        {#if drill.phase === 'retry'}
          <p class="feedback wrong" role="alert">{t('drill.replay')}</p>
        {/if}
        {#if hint && drill.phase === 'user'}
          <p class="feedback hint">{hintText(hint)}</p>
        {/if}

        <div class="buttons">
          <button type="button" onclick={askHint} disabled={!awaitingMove}
            >{t('drill.hint')} <kbd>H</kbd></button
          >
          <button type="button" onclick={repeat} disabled={drill.phase === 'done'}
            >{t('drill.repeat')} <kbd>R</kbd></button
          >
          <button type="button" onclick={next} disabled={drill.phase !== 'line-complete'}
            >{t('drill.next')} <kbd>{t('drill.space')}</kbd></button
          >
        </div>

        {#if drill.phase === 'line-complete'}
          <section class="complete" aria-label={t('drill.lineComplete')}>
            <h2>
              {drill.passes.at(-1)?.clean ? t('drill.lineClean') : t('drill.lineWithErrors')}
            </h2>
            {#each lineHistories as h (h.id)}
              <div class="node-history">
                <strong>{h.san}</strong>
                <MoveHistory history={h.history} fenBefore={h.fenBefore} />
              </div>
            {/each}
          </section>
        {:else if drill.phase === 'done'}
          <section class="complete">
            <h2>{t('drill.allDone')}</h2>
            <button type="button" onclick={restart}>{t('drill.restart')}</button>
          </section>
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  .head {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 1rem;
  }
  .head h1 {
    margin: 0.3rem 0;
    font-size: 1.4rem;
  }
  .head a {
    color: inherit;
  }
  .counter {
    font-weight: 600;
  }
  .layout {
    display: flex;
    flex-wrap: wrap;
    gap: 1.5rem;
    margin-top: 0.5rem;
  }
  .left {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .right {
    flex: 1;
    min-width: 260px;
  }
  .san {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    align-items: center;
  }
  .san input {
    width: 7rem;
  }
  .buttons {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin: 0.75rem 0;
  }
  kbd {
    font-size: 0.75em;
    border: 1px solid var(--border);
    border-radius: 3px;
    padding: 0 0.25rem;
  }
  .feedback {
    padding: 0.4rem 0.6rem;
    border-radius: 6px;
  }
  .wrong {
    background: #f8d7da;
    color: #7a1020;
  }
  .hint {
    background: #e3f0fb;
    color: #0b3a66;
  }
  .live {
    min-height: 1.5rem;
  }
  .node-history {
    margin-bottom: 0.5rem;
  }
  .muted {
    color: var(--muted);
  }
  .error {
    color: #b00020;
  }
</style>
