<script lang="ts">
  import {
    INITIAL_FEN,
    type OpeningGraph,
    SubtreeHasAttemptsError,
    type Tree,
    type TreeEdit,
    addLine,
    cardCounts,
    childrenOf,
    deleteSubtree,
    endOfLocalDay,
    enumerateLines,
    exportPgn,
    lineStatus,
    loadOpeningGraph,
    nodeAtPath,
    parseUci,
    pathTo,
    playLine,
    sanToUci,
    setComment,
    setMainLine,
    toEpd,
  } from '@processchess/core';
  import { type Collection, type MoveHistory as History, newId } from '@processchess/db';
  import { onDestroy } from 'svelte';
  import Board from '$lib/Board.svelte';
  import { app, storage } from '$lib/app.svelte';
  import DrillPanel from '$lib/components/DrillPanel.svelte';
  import ExplorePanel from '$lib/components/ExplorePanel.svelte';
  import FenExport from '$lib/components/FenExport.svelte';
  import LabPanel from '$lib/components/LabPanel.svelte';
  import GraphPanel from '$lib/components/GraphPanel.svelte';
  import ImportForm from '$lib/components/ImportForm.svelte';
  import OpeningBar from '$lib/components/OpeningBar.svelte';
  import RepertoireList, { type RepertoireRow } from '$lib/components/RepertoireList.svelte';
  import RepertoirePanel from '$lib/components/RepertoirePanel.svelte';
  import { DrillController } from '$lib/drill.svelte';
  import { LabController, edgeKey } from '$lib/lab.svelte';
  import { t } from '$lib/i18n/index.svelte';

  type Tab = 'explore' | 'graph' | 'repertoire' | 'train';
  const TABS: Tab[] = ['explore', 'graph', 'repertoire', 'train'];

  // ---- data ---------------------------------------------------------------------------
  let graph = $state.raw<OpeningGraph | null>(null);
  let rows = $state<RepertoireRow[]>([]);
  let loaded = $state(false);
  let showArchived = $state(false);
  let selectedId = $state<string | null>(null);
  let tree = $state.raw<Tree | null>(null);

  // ---- shared board position: moves from the start position ----------------------------
  let ucis = $state<string[]>([]);
  let redo = $state<string[]>([]);
  let tab = $state<Tab>('explore');
  let sanInput = $state('');
  let sanError = $state<string | null>(null);
  let message = $state<string | null>(null);
  let history = $state.raw<History | null>(null);
  let dialog: HTMLDialogElement;
  let importOpen = $state(false);
  const ctl = new DrillController();
  const lab = new LabController();

  const selected = $derived<Collection | null>(
    rows.find((r) => r.collection.id === selectedId)?.collection ?? null,
  );
  const startFen = $derived(tree?.startFen ?? INITIAL_FEN);
  const standardStart = $derived(toEpd(startFen) === toEpd(INITIAL_FEN));
  const line = $derived(playLine(startFen, ucis) ?? { san: [], fen: startFen });
  const repAt = $derived(tree ? nodeAtPath(tree, ucis) : null);
  const inRepertoire = $derived(!!repAt && repAt.depth === ucis.length);
  const training = $derived(tab === 'train' && ctl.active);
  const labbing = $derived(tab === 'explore' && lab.active);
  /** The session that owns the board, if any: line drill/review or opening lab. */
  const session = $derived(training ? ctl : labbing ? lab : null);
  const repertoireMoves = $derived(
    tree && repAt && inRepertoire ? childrenOf(tree, repAt.nodeId).map((n) => n.uci!) : [],
  );
  const offRepertoireSan = $derived(
    tree && repAt && !inRepertoire ? (line.san[repAt.depth] ?? null) : null,
  );
  const dueTotal = $derived(
    rows.filter((r) => !r.collection.archivedAt).reduce((n, r) => n + r.due, 0),
  );
  const totalLines = $derived(tree ? enumerateLines(tree).length : 0);
  const linesHere = $derived(
    tree && repAt && inRepertoire
      ? enumerateLines(tree).filter(
          (l) => repAt.nodeId === tree!.rootId || l.nodeIds.includes(repAt.nodeId),
        ).length
      : 0,
  );

  // ---- startup -------------------------------------------------------------------------
  // deep link /?c=<collection>&tab=<tab>, read before the URL-sync effect rewrites it
  const initialParams = new URLSearchParams(window.location.search);
  const tabParam = initialParams.get('tab') as Tab | null;
  if (tabParam && TABS.includes(tabParam)) tab = tabParam;

  let started = false;
  $effect(() => {
    if (!app.ready || started) return;
    started = true;
    void loadOpeningGraph().then((g) => (graph = g));
    void lab.refresh();
    void refresh().then(() => {
      const c = initialParams.get('c');
      if (c && rows.some((r) => r.collection.id === c)) {
        void select(c).then(() => {
          if (tab === 'train' && initialParams.get('mode') === 'review') void startReview();
        });
      }
    });
  });

  // keep the URL shareable: /?c=<collection>&tab=<tab>
  $effect(() => {
    // eslint-disable-next-line svelte/prefer-svelte-reactivity -- built once, not reactive state
    const params = new URLSearchParams();
    if (selectedId) params.set('c', selectedId);
    if (tab !== 'explore') params.set('tab', tab);
    const qs = params.toString();
    replaceUrl(qs ? `?${qs}` : window.location.pathname);
  });
  function replaceUrl(url: string) {
    window.history.replaceState(window.history.state, '', url);
  }

  onDestroy(() => void ctl.stop());

  async function refresh() {
    const db = storage();
    const summaries = await db.collectionSummaries({ includeArchived: showArchived });
    const now = new Date();
    rows = await Promise.all(
      summaries.map(async (s) => {
        const [t0, passes, cards] = await Promise.all([
          db.loadTree(s.collection.id),
          db.listLinePasses(s.collection.id),
          db.listCards(s.collection.id),
        ]);
        const lines = enumerateLines(t0);
        return {
          collection: s.collection,
          lastTrainedAt: s.lastTrainedAt,
          lines: lines.length,
          clean: lines.filter((l) => lineStatus(passes, l.id).clean).length,
          due: cardCounts(t0, cards, now, endOfLocalDay(now)).dueNow,
        };
      }),
    );
    loaded = true;
  }

  let lastShowArchived = false;
  $effect(() => {
    if (showArchived !== lastShowArchived && app.ready) {
      lastShowArchived = showArchived;
      void refresh();
    }
  });

  async function select(id: string | null) {
    await ctl.stop();
    message = null;
    if (!id) {
      selectedId = null;
      tree = null;
      return;
    }
    const next = await storage().loadTree(id);
    const keepPath = tree === null || toEpd(next.startFen) === toEpd(startFen);
    selectedId = id;
    tree = next;
    if (!keepPath || !playLine(next.startFen, ucis)) {
      ucis = [];
      redo = [];
    }
  }

  // ---- position ------------------------------------------------------------------------
  function goTo(next: string[]) {
    ucis = next;
    redo = [];
    sanError = null;
    message = null;
  }
  function back() {
    if (!ucis.length) return;
    redo = [ucis.at(-1)!, ...redo];
    ucis = ucis.slice(0, -1);
  }
  function forward() {
    if (!redo.length) return;
    ucis = [...ucis, redo[0]!];
    redo = redo.slice(1);
  }
  function playFree(uci: string): boolean {
    if (redo[0] === uci) forward();
    else goTo([...ucis, uci]);
    return true;
  }

  function onboardmove(uci: string): boolean {
    return session ? session.play(uci) : playFree(uci);
  }

  function submitSan(e: SubmitEvent) {
    e.preventDefault();
    sanError = null;
    const fen = session ? session.fen : line.fen;
    if (!fen || (session && !session.awaitingMove)) return;
    const uci = sanToUci(fen, sanInput);
    if (!uci) {
      sanError = t('drill.sanInvalid', { san: sanInput });
      return;
    }
    onboardmove(uci);
    sanInput = '';
  }

  // move history of the selected node (repertoire tab)
  $effect(() => {
    const id = tab === 'repertoire' && inRepertoire && repAt ? repAt.nodeId : null;
    const node = id && tree ? tree.nodes.get(id) : null;
    if (!node?.isUserMove) {
      history = null;
      return;
    }
    void storage()
      .getMoveHistory(node.id)
      .then((h) => (history = h));
  });

  // ---- repertoire edits ------------------------------------------------------------------
  async function apply(edit: TreeEdit) {
    if (!selectedId) return;
    tree = edit.tree;
    try {
      await storage().applyTreeChanges(selectedId, edit.changes);
    } catch (e) {
      message = t('error.generic', { message: (e as Error).message });
      tree = await storage().loadTree(selectedId);
    }
    await refresh();
  }

  async function ensureRepertoire(color: 'w' | 'b'): Promise<void> {
    const name = t(color === 'w' ? 'rep.defaultWhite' : 'rep.defaultBlack');
    const existing = rows.find(
      (r) =>
        !r.collection.archivedAt && r.collection.userColor === color && r.collection.name === name,
    );
    if (existing) {
      await select(existing.collection.id);
      return;
    }
    await create(name, color);
  }

  async function create(name: string, color: 'w' | 'b') {
    const { collection } = await storage().createCollection({
      name,
      kind: 'opening',
      userColor: color,
      evalMode: 'exact',
      source: 'explorer',
    });
    await refresh();
    await select(collection.id);
  }

  async function addCurrentLine(color?: 'w' | 'b') {
    if (color) await ensureRepertoire(color);
    if (!tree) return;
    const r = addLine(tree, tree.rootId, ucis, { newId });
    await apply(r);
    message = t('rep.lineAdded', { n: r.changes.inserted.length });
  }

  async function addBook(lines: string[][]) {
    if (!tree) return;
    let edit: TreeEdit = { tree, changes: { inserted: [], updated: [], deleted: [] } };
    const inserted = [];
    for (const l of lines) {
      const r = addLine(edit.tree, edit.tree.rootId, [...ucis, ...l], { newId });
      inserted.push(...r.changes.inserted);
      edit = r;
    }
    await apply({ tree: edit.tree, changes: { inserted, updated: [], deleted: [] } });
    message = t('rep.bookAdded', { lines: lines.length, n: inserted.length });
  }

  async function makeMain() {
    if (tree && repAt) await apply(setMainLine(tree, repAt.nodeId));
  }
  async function saveComment(text: string) {
    if (!tree || !repAt) return;
    await apply(setComment(tree, repAt.nodeId, text));
    message = t('collection.commentSaved');
  }
  async function removeHere() {
    if (!tree || !repAt || !selectedId) return;
    const node = tree.nodes.get(repAt.nodeId);
    if (!node?.parentId) return;
    try {
      const edit = deleteSubtree(tree, node.id, await storage().nodeIdsWithAttempts(selectedId));
      goTo(ucis.slice(0, -1));
      await apply(edit);
    } catch (e) {
      if (e instanceof SubtreeHasAttemptsError) message = t('collection.deleteRefused');
      else throw e;
    }
  }
  function download() {
    if (!tree || !selected) return;
    const blob = new Blob([exportPgn(tree, { event: selected.name })], {
      type: 'application/x-chess-pgn',
    });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${selected.name.replace(/[^\w.-]+/g, '_')}.pgn`;
    a.click();
    URL.revokeObjectURL(a.href);
  }
  async function toggleArchive(row: RepertoireRow) {
    if (row.collection.archivedAt) await storage().unarchiveCollection(row.collection.id);
    else {
      await storage().archiveCollection(row.collection.id);
      if (row.collection.id === selectedId) await select(null);
    }
    await refresh();
  }

  // ---- training --------------------------------------------------------------------------
  async function startTraining(here: boolean) {
    if (!tree || !selectedId) return;
    await ctl.start(selectedId, tree, here && repAt ? { throughNodeId: repAt.nodeId } : {});
  }
  async function startReview() {
    if (!tree || !selectedId) return;
    await ctl.startReview(selectedId, tree);
  }
  async function stopTraining() {
    await ctl.stop();
    await refresh();
  }
  $effect(() => {
    // leaving the training tab ends the session
    if (tab !== 'train' && ctl.active) void stopTraining();
  });
  $effect(() => {
    // leaving the openings tab ends the lab session
    if (tab !== 'explore' && lab.active) lab.stop();
  });
  // a completed pass changes the clean counts in the list
  let passesSeen = 0;
  $effect(() => {
    const n = ctl.drill?.passes.length ?? 0;
    if (n !== passesSeen) {
      passesSeen = n;
      if (ctl.drill) void refresh();
    }
  });

  // ---- import --------------------------------------------------------------------------
  function openImport() {
    importOpen = true;
    dialog.showModal();
  }
  async function imported(id: string, msg: string) {
    dialog.close();
    tab = 'repertoire';
    message = msg;
    await refresh();
    await select(id);
    message = msg;
  }

  // ---- keyboard ------------------------------------------------------------------------
  function onkeydown(e: KeyboardEvent) {
    if (
      (e.target as HTMLElement).closest('input, textarea, select, dialog') ||
      e.ctrlKey ||
      e.metaKey
    )
      return;
    if (session) {
      if (e.key === 'h' || e.key === 'H') session.askHint();
      else if (e.key === 'r' || e.key === 'R') session.repeat();
      else if (e.key === ' ') void session.next();
      else return;
    } else if (e.key === 'ArrowLeft') back();
    else if (e.key === 'ArrowRight') forward();
    else return;
    e.preventDefault();
  }

  // ---- board props -----------------------------------------------------------------------
  const boardFen = $derived(session ? (session.fen ?? line.fen) : line.fen);
  const lastMove = $derived.by((): [string, string] | undefined => {
    if (session) return session.lastMove;
    const last = ucis.at(-1);
    if (!last) return undefined;
    const { from, to } = parseUci(last);
    return [from, to];
  });
  const barMoves = $derived(
    labbing ? lab.sansPlayed : standardStart ? (training ? ctl.movesSan : line.san) : null,
  );
  const outOfRepertoire = $derived(
    training
      ? ctl.drill?.phase === 'retry'
        ? ctl.wrongSan
        : null
      : labbing
        ? null
        : offRepertoireSan,
  );
  const outOfLine = $derived(labbing && lab.recall?.phase === 'retry' ? lab.wrongSan : null);
  /** Graph colouring from the lab history of each edge. */
  function edgeState(fen: string, uci: string): 'good' | 'bad' | null {
    const s = lab.edgeStats.get(edgeKey(fen, uci));
    if (!s) return null;
    if (s.recent.at(-1) === 'wrong') return 'bad';
    const last3 = s.recent.slice(-3);
    return last3.length === 3 && last3.every((r) => r === 'correct') ? 'good' : null;
  }
  const breadcrumb = $derived(
    line.san.map((san, i) => ({ i, label: i % 2 === 0 ? `${i / 2 + 1}. ${san}` : san })),
  );
</script>

<svelte:window {onkeydown} />

<div class="workspace" class:wide={tab === 'graph'}>
  <aside class="left">
    {#if dueTotal > 0 || rows.length > 0}
      <p class="due-summary" data-testid="due-summary">
        {dueTotal ? t('home.dueSummary', { n: dueTotal }) : t('home.nothingDue')}
      </p>
    {/if}
    <RepertoireList
      {rows}
      {loaded}
      {selectedId}
      bind:showArchived
      onselect={(id) => void select(id)}
      oncreate={(name, color) => void create(name, color)}
      onimport={openImport}
      ontogglearchive={(row) => void toggleArchive(row)}
    />
  </aside>

  <section class="center" aria-label={t('board.label')}>
    <OpeningBar movesSan={barMoves} {outOfRepertoire} {outOfLine} />
    <Board
      maxSize={tab === 'graph' ? 380 : 520}
      fen={boardFen}
      orientation={(labbing ? lab.item?.side === 'b' : selected?.userColor === 'b')
        ? 'black'
        : 'white'}
      interactive={session ? session.awaitingMove : true}
      {lastMove}
      shapes={session ? session.shapes : []}
      onmove={onboardmove}
    />
    <div class="under">
      {#if !session}
        <div class="nav">
          <button
            type="button"
            onclick={() => goTo([])}
            disabled={!ucis.length}
            aria-label={t('nav.start')}>⏮</button
          >
          <button type="button" onclick={back} disabled={!ucis.length} aria-label={t('nav.back')}
            >◀</button
          >
          <button
            type="button"
            onclick={forward}
            disabled={!redo.length}
            aria-label={t('nav.forward')}>▶</button
          >
        </div>
      {/if}
      <form class="san" onsubmit={submitSan}>
        <label for="san-input">{t('drill.sanLabel')}</label>
        <input
          id="san-input"
          type="text"
          autocomplete="off"
          autocapitalize="off"
          spellcheck="false"
          bind:value={sanInput}
          disabled={!!session && !session.awaitingMove}
        />
        <button type="submit" disabled={!!session && !session.awaitingMove}
          >{t('drill.play')}</button
        >
        {#if sanError}<span class="error" role="alert">{sanError}</span>{/if}
      </form>
    </div>
    <FenExport fen={boardFen} />
    {#if !session}
      <ol class="breadcrumb" aria-label={t('nav.moves')}>
        {#each breadcrumb as b (b.i)}
          <li>
            <button
              type="button"
              aria-current={b.i === ucis.length - 1 ? 'true' : undefined}
              onclick={() => goTo(ucis.slice(0, b.i + 1))}>{b.label}</button
            >
          </li>
        {/each}
      </ol>
      {#if ucis.length > 0}
        {#if selected && !inRepertoire}
          <button type="button" class="primary" onclick={() => void addCurrentLine()}>
            {t('rep.addLine', { name: selected.name })}
          </button>
        {:else if !selected}
          <div class="save-line">
            <span>{t('rep.saveLine')}</span>
            <button type="button" onclick={() => void addCurrentLine('w')}
              >{t('rep.saveWhite')}</button
            >
            <button type="button" onclick={() => void addCurrentLine('b')}
              >{t('rep.saveBlack')}</button
            >
          </div>
        {/if}
      {/if}
      {#if message && tab !== 'repertoire'}<p role="status" class="msg">{message}</p>{/if}
    {/if}
  </section>

  <section class="right">
    <div class="tabs" role="tablist" aria-label={t('tabs.label')}>
      {#each TABS as id (id)}
        <button
          type="button"
          role="tab"
          id={`tab-${id}`}
          aria-selected={tab === id}
          aria-controls={`panel-${id}`}
          onclick={() => (tab = id)}>{t(`tabs.${id}`)}</button
        >
      {/each}
    </div>
    <div class="tabpanel" role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
      {#if tab === 'explore' && lab.active}
        <LabPanel {lab} onstop={() => lab.stop()} />
      {:else if tab === 'explore'}
        <ExplorePanel
          {graph}
          fen={line.fen}
          {ucis}
          {repertoireMoves}
          userColor={standardStart ? (selected?.userColor ?? null) : null}
          summaries={lab.summaries}
          onpractice={(queue, i) => void lab.start(queue, i)}
          onjump={(u) => goTo(u)}
          onaddbook={(lines) => void addBook(lines)}
        />
      {:else if tab === 'graph'}
        <GraphPanel
          {graph}
          {ucis}
          orientation={selected?.userColor === 'b' ? 'black' : 'white'}
          inRepertoire={(path) => !!tree && nodeAtPath(tree, path).depth === path.length}
          {edgeState}
          onjump={(u) => goTo(u)}
        />
      {:else if !selected || !tree}
        <p class="muted">{t('rep.selectFirst')}</p>
      {:else if tab === 'repertoire'}
        <RepertoirePanel
          {tree}
          nodeId={repAt?.nodeId ?? tree.rootId}
          exact={inRepertoire}
          {history}
          {message}
          onselect={(id) =>
            goTo(
              pathTo(tree!, id)
                .slice(1)
                .map((n) => n.uci!),
            )}
          onmain={() => void makeMain()}
          ondelete={() => void removeHere()}
          oncomment={(text) => void saveComment(text)}
          onexport={download}
        />
      {:else}
        <DrillPanel
          {ctl}
          {totalLines}
          {linesHere}
          canStartHere={inRepertoire && ucis.length > 0}
          dueNow={rows.find((r) => r.collection.id === selectedId)?.due ?? 0}
          onstart={(here) => startTraining(here)}
          onreview={() => startReview()}
          onstop={() => void stopTraining()}
        />
      {/if}
    </div>
  </section>
</div>

<dialog
  bind:this={dialog}
  aria-labelledby="import-title"
  onclose={() => (importOpen = false)}
  class="import-dialog"
>
  {#if importOpen}
    <div class="dialog-head">
      <h2 id="import-title">{t('import.title')}</h2>
      <button type="button" onclick={() => dialog.close()}>{t('common.close')}</button>
    </div>
    <ImportForm
      collections={rows.filter((r) => !r.collection.archivedAt).map((r) => r.collection)}
      onimported={(id, msg) => void imported(id, msg)}
    />
  {/if}
</dialog>

<style>
  .workspace {
    display: grid;
    grid-template-columns: minmax(200px, 250px) auto minmax(280px, 1fr);
    gap: 1.25rem;
    align-items: start;
  }
  /* graph tab: smaller board, the graph takes the room */
  .workspace.wide {
    grid-template-columns: minmax(180px, 220px) auto minmax(0, 1fr);
  }
  @media (max-width: 1100px) {
    .workspace,
    .workspace.wide {
      grid-template-columns: 1fr;
    }
  }
  .center {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .under {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
    align-items: center;
  }
  .nav {
    display: flex;
    gap: 0.25rem;
  }
  .san {
    display: flex;
    gap: 0.4rem;
    align-items: center;
  }
  .san input {
    width: 6rem;
  }
  .breadcrumb {
    display: flex;
    flex-wrap: wrap;
    gap: 0.15rem;
    list-style: none;
    padding: 0;
    margin: 0;
    max-width: min(92vw, 520px);
  }
  .breadcrumb button {
    border: none;
    background: none;
    padding: 0.05rem 0.25rem;
    border-radius: 4px;
  }
  .breadcrumb button:hover {
    background: var(--hover);
  }
  .breadcrumb button[aria-current='true'] {
    background: var(--accent);
    color: white;
  }
  .primary {
    align-self: flex-start;
    background: var(--accent);
    color: white;
    border: none;
    border-radius: 6px;
    padding: 0.4rem 0.8rem;
    font-weight: 600;
  }
  .save-line {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
    align-items: center;
  }
  .tabs {
    display: flex;
    border-bottom: 1px solid var(--border);
    margin-bottom: 0.75rem;
  }
  .tabs button {
    border: none;
    background: none;
    padding: 0.5rem 0.9rem;
    border-bottom: 3px solid transparent;
    font-weight: 600;
    color: var(--muted);
  }
  .tabs button[aria-selected='true'] {
    color: var(--fg);
    border-bottom-color: var(--accent);
  }
  .due-summary {
    font-weight: 600;
    margin: 0 0 0.6rem;
  }
  .muted,
  .msg {
    color: var(--muted);
  }
  .error {
    color: #b00020;
  }
  .import-dialog {
    width: min(92vw, 42rem);
    border: none;
    border-radius: 10px;
    padding: 1.25rem;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
  }
  .import-dialog::backdrop {
    background: rgba(0, 0, 0, 0.4);
  }
  .dialog-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .dialog-head h2 {
    margin: 0;
  }
</style>
