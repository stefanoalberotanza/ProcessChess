# Today puzzles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A new first tab, "Today", that runs one session a day of 3–4 opening puzzles with hearts, a combo, a daily streak, reward feedback (flash, shake, sound, name reveal) and a placeholder bishop mascot.

**Architecture:** Pure logic (critical ply, selection, hearts/combo reducer, streak) goes in `packages/core/src/today/` with tests first. One new Storage query (`practiceTimes`) feeds the streak. In the web app a `TodayController` drives a `RecallState` that starts at the critical ply (`startRecall` gets a `fromPly` option so logged plies stay the plies of the full line) and logs moves like the lab does, through a `feedRepertoire` function extracted from `LabController`.

**Tech Stack:** TypeScript strict, Vitest, SvelteKit (Svelte 5), chess.js via core only, Web Audio API (no new dependency), Playwright.

**Spec:** `docs/superpowers/specs/2026-10-16-today-puzzles-design.md`

## Global Constraints

- Tests first in `packages/core` (AGENTS.md rule 1); `packages/core` stays pure (no DOM, storage, network).
- No new dependencies. chessground only inside `apps/web/src/lib/Board.svelte`.
- The UI calls only `@processchess/core` and `@processchess/db`; no chess.js in `apps/web`.
- Every UI string goes through `t()`; add keys to `en.ts` and `it.ts` together. Code, comments, docs, UI strings in English.
- `attempt`, `lab_attempt`, `lab_run` are append-only. Today writes `lab_attempt` rows and FSRS attempts, **never a `lab_run`**.
- Moves are UCI; positions are EPD via `toEpd()`; chess expectations come from chess.js and `data/openings/*.tsv`, never from memory.
- Hearts: **5** per session. Session: **4** puzzles (fewer if not available, minimum 1). Fill-ins from `dailyMix` only when fewer than **3** puzzles come from due/new lines.
- One session per day; the day is marked in `localStorage` key `pc.today` (`{ "day": "YYYY-MM-DD" }`) at the first move played. Effects switch key: `pc.effects` (`"true"`/`"false"`, default on). All storage access in try/catch with an in-memory fallback.
- Streak = consecutive local days with at least one practised move in `attempt` or `lab_attempt`; alive if today or yesterday has one.
- Do not touch the Training tab's behaviour. Do not hand-edit generated files.
- Commits: small, conventional (`feat(core): …`), ending with the attribution line the session gives.
- Before the final push: `pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm test:e2e`.

## Review Focus

- Week repertoires missing (graph failed to load, new profile): Today shows the empty message and no Start button, no crash (Task 10, e2e).
- A Black-side puzzle: the critical ply is odd, White's lead-in plays itself, the board is shown from Black (Tasks 2 and 10).
- Day boundary: only yesterday practised keeps the streak alive; a gap of one full day resets it; month and year rollovers (Task 5).
- The last heart is lost on the last move of the last puzzle: the run is `stopped`, not `complete` (Task 4).
- `localStorage` unavailable: the day marker and the effects switch fall back to memory and the app still works (Task 10, e2e).

---

### Task 1: `startRecall` can start mid-line (`fromPly`)

**Files:**
- Modify: `packages/core/src/lab/recall.ts`
- Test: `packages/core/src/lab/recall.test.ts`

**Interfaces:**
- Produces: `startRecall(ucis, opts: { startFen?; clock?; autoSide?; fromPly?: number })`; `RecallState.startPly: number` (the ply the recall began at; 0 by default). `restartRecall` keeps it. Plies in `RecallAttempt` and `fens` stay those of the full line.

- [ ] **Step 1: Write the failing tests** in `recall.test.ts` (use the Najdorf line `e2e4 c7c5 g1f3 d7d6 d2d4 c5d4 f3d4 g8f6 b1c3 a7a6`; confirm its name and moves in `data/openings/*.tsv` and copy them):
  - `starts at fromPly with earlier plies already played`: `startRecall(line, { autoSide: 'b', fromPly: 8 })` → `state.ply === 8`, `state.startPly === 8`, `state.phase === 'play'`, `state.fens.length === 11`.
  - `logs full-line plies`: submit `b1c3` → `result.attempt.ply === 9` and `result.attempt.epd === toEpd(state.fens[8])`.
  - `fromPly on an auto side ply skips ahead`: `startRecall(line, { autoSide: 'b', fromPly: 7 })` → `state.ply === 8`.
  - `restartRecall keeps fromPly`: after a wrong move and a correct one, `restartRecall(state).ply === 8`.
  - `fromPly at or beyond the end is done`: `startRecall(line, { fromPly: 10 }).phase === 'done'`.
- [ ] **Step 2:** `pnpm --filter @processchess/core test -- recall` → the new tests FAIL.
- [ ] **Step 3: Implement** in `recall.ts`: add `fromPly` to the options and `startPly` to `RecallState`; the initial `ply` is `skipAuto(state, opts.fromPly ?? 0)`; `restartRecall` passes `fromPly: state.startPly`.
- [ ] **Step 4:** same command → all `recall` tests PASS.
- [ ] **Step 5: Commit** `feat(core): recall can start from a later ply`.

### Task 2: Critical ply and puzzle

**Files:**
- Create: `packages/core/src/today/puzzle.ts`, `packages/core/src/today/puzzle.test.ts`
- Modify: `packages/core/src/index.ts` (export the new module; `today/index.ts` re-exports every file added in Tasks 2–5)

**Interfaces:**
- Consumes: `edgeKeyAfter(epdAfter, uci)` (`srs/line-state.ts`), `SrsCard` (`srs/schedule.ts`: `state`, `due: Date`), `toEpd`, `playMove`.
- Produces:
  ```ts
  export type PuzzleCards = ReadonlyMap<string, readonly Pick<SrsCard, 'state' | 'due'>[]>;
  /** 0-based index in `line` of the first move the user must decide. */
  export function criticalPly(line: readonly string[], side: 'w' | 'b', cards: PuzzleCards, now: Date): number;
  ```

- [ ] **Step 1: Write the failing tests** (build `cards` in a helper that plays the line with `playMove` and keys each user move with `edgeKeyAfter(toEpd(fen), uci)`):
  - `a due move: the most overdue user move decides` (two due cards, the later-in-line one more overdue → its ply).
  - `a learning move that is not due is used when nothing is due` (state 1 or 3).
  - `with no cards: the first user move` (White → 0, Black → 1).
  - `a line with some cards and a user move without one: the first move without a card`.
  - `all known and not due: the first user move`.
  - `only the user's side counts`: a due card on an opponent edge is ignored.
- [ ] **Step 2:** `pnpm --filter @processchess/core test -- puzzle` → FAIL.
- [ ] **Step 3: Implement** `criticalPly`: walk the user's plies; rule order: most overdue due card; else first learning/relearning card; else first user move with no card; else the first user ply.
- [ ] **Step 4:** tests PASS.
- [ ] **Step 5: Commit** `feat(core): critical ply of a puzzle`.

### Task 3: Candidates and selection

**Files:**
- Create: `packages/core/src/today/select.ts`, `packages/core/src/today/select.test.ts`

**Interfaces:**
- Consumes: `SessionLine` (`srs/session.ts`), `Tree`, `CardMap`, `enumerateLines`, `seededRandom` (`lab/mix.ts`).
- Produces:
  ```ts
  export type CandidateKind = 'due' | 'new' | 'fill';
  export interface PuzzleCandidate { line: string[]; side: 'w' | 'b'; kind: CandidateKind }
  export const SESSION_SIZE = 4;
  export const MIN_PUZZLES = 3;
  export function dueCandidates(session: readonly SessionLine[]): PuzzleCandidate[]; // due and learning → 'due'
  export function newCandidates(repertoires: readonly { tree: Tree; cards: CardMap }[]): PuzzleCandidate[];
  export function selectPuzzles(candidates: readonly PuzzleCandidate[], opts: { size?: number; random: () => number }): PuzzleCandidate[];
  ```

- [ ] **Step 1: Write the failing tests:**
  - `newCandidates`: a tree with two lines, one with a card on a user move → only the other is returned; side = `tree.userColor`; a tree with a non-standard `startFen` is skipped.
  - `selectPuzzles`: with 5 due + 5 new and `seededRandom('a')` the result has `SESSION_SIZE` entries and, across seeds `'a'…'h'`, both kinds appear; same seed → same result; a line present as `new` and `due` is returned once, as `due`; `fill` candidates are used only when due+new give fewer than `MIN_PUZZLES` (2 due + 3 fill → 3 puzzles; 3 due + 3 fill → no fill); fewer candidates than `size` → all of them; no candidates → `[]`.
- [ ] **Step 2:** `pnpm --filter @processchess/core test -- select` → FAIL.
- [ ] **Step 3: Implement.** `selectPuzzles`: de-duplicate by `line.join(' ')` with priority due > new > fill; fill each slot by a coin flip (`random() < 0.5`) between the due and the new pool when both are non-empty, else from the non-empty one; take from `fill` only while the result is shorter than `MIN_PUZZLES`.
- [ ] **Step 4:** PASS.
- [ ] **Step 5: Commit** `feat(core): select today's puzzles`.

### Task 4: Hearts and combo reducer

**Files:**
- Create: `packages/core/src/today/run.ts`, `packages/core/src/today/run.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export const HEARTS = 5;
  export interface TodayRun {
    hearts: number; combo: number; bestCombo: number;
    puzzle: number;            // 0-based index of the puzzle in play
    total: number;
    clean: number; hinted: number; errored: number; // finished puzzles by outcome
    status: 'playing' | 'complete' | 'stopped';
  }
  export function startRun(total: number): TodayRun;
  /** A wrong try. `firstTry`: the first wrong try on this move (costs a heart and breaks the combo). */
  export function moveWrong(run: TodayRun, firstTry: boolean): TodayRun;
  /** The right move was played; `result` is the attempt result (`'correct'` extends the combo, `'hint'` leaves it, `'wrong'` leaves it at 0). */
  export function moveCorrect(run: TodayRun, result: 'correct' | 'hint' | 'wrong'): TodayRun;
  export function puzzleDone(run: TodayRun, summary: { errors: number; hints: number }): TodayRun;
  ```

- [ ] **Step 1: Write the failing tests:** `startRun(4)` → 5 hearts, combo 0, `playing`; `moveWrong(run, true)` loses a heart and zeroes the combo; `moveWrong(run, false)` changes nothing; five first-try wrongs → `stopped` with 0 hearts; `moveCorrect(run, 'correct')` ×3 → combo 3, `bestCombo` 3; `'hint'` leaves combo and best unchanged; `puzzleDone` classifies by `errors > 0` (errored) then `hints > 0` (hinted) else clean, advances `puzzle`, and after the last puzzle gives `complete`; **the last heart lost on the last move of the last puzzle** → `stopped` (a stopped run ignores every later call and stays `stopped`).
- [ ] **Step 2:** `pnpm --filter @processchess/core test -- run` → FAIL.
- [ ] **Step 3: Implement** as pure functions returning new objects.
- [ ] **Step 4:** PASS.
- [ ] **Step 5: Commit** `feat(core): hearts and combo for the today run`.

### Task 5: Streak

**Files:**
- Create: `packages/core/src/today/streak.ts`, `packages/core/src/today/streak.test.ts`

**Interfaces:**
- Consumes: `dayKey(date: Date)` (`srs/stats.ts`).
- Produces:
  ```ts
  export const PRACTICE_SLOT_MS = 15 * 60 * 1000;
  /** Distinct local days (YYYY-MM-DD, ascending) of the start timestamps (Unix ms) of 15-minute practice slots. */
  export function practiceDays(slots: readonly number[]): string[];
  /** Consecutive days ending today, or yesterday when today has none yet. */
  export function currentStreak(days: readonly string[], today: Date): number;
  ```

- [ ] **Step 1: Write the failing tests:** `[]` → 0; today only → 1; today + 4 previous days → 5; yesterday + 2 before, nothing today → 3 (alive); a missing day inside resets (today, today−2 → 1); only two days ago → 0; across a month and a year boundary (`2027-01-01` with `2026-12-31`, `2026-12-30` → 3); duplicates in `days` do not inflate; `practiceDays` maps two slots of the same local day to one entry and two slots either side of local midnight to two.
- [ ] **Step 2:** `pnpm --filter @processchess/core test -- streak` → FAIL.
- [ ] **Step 3: Implement.** Step the previous day with `new Date(y, m, d - 1)` (local), never with 24-hour subtraction.
- [ ] **Step 4:** PASS. Run `pnpm --filter @processchess/core test` fully.
- [ ] **Step 5: Commit** `feat(core): practice streak`.

### Task 6: `Storage.practiceTimes`

**Files:**
- Modify: `packages/db/src/storage.ts` (interface), `packages/db/src/sqlite-storage.ts`
- Test: `packages/db/src/practice-times.test.ts` (memory adapter, same set-up as `storage-lab.test.ts`)

**Interfaces:**
- Produces: `practiceTimes(sinceMs: number): Promise<number[]>` — the distinct start timestamps (Unix ms) of the 15-minute slots (`floor(ts / 900000) * 900000`) that hold at least one row of `attempt` or `lab_attempt` with `ts >= sinceMs`, ascending. (15-minute slots keep local-day conversion correct in every time zone.)

- [ ] **Step 1: Write the failing test:** record one FSRS attempt and one lab attempt at known timestamps (use the clock injection the existing storage tests use) in two different slots plus a second row in the first slot, and one before `sinceMs` → exactly two slot starts, ascending.
- [ ] **Step 2:** `pnpm --filter @processchess/db test -- practice-times` → FAIL.
- [ ] **Step 3: Implement** with one SQL `UNION` over both tables grouped by slot (Drizzle `sql` template), in `sqlite-storage.ts`; add the method to the `Storage` interface.
- [ ] **Step 4:** PASS; `pnpm --filter @processchess/db typecheck`.
- [ ] **Step 5: Commit** `feat(db): practice times for the streak`.

### Task 7: Extract `feedRepertoire` from the lab

**Files:**
- Create: `apps/web/src/lib/practice-log.ts`
- Modify: `apps/web/src/lib/lab.svelte.ts` (the private `feedRepertoire`, lines ~328–348)

**Interfaces:**
- Produces:
  ```ts
  /** Feeds FSRS for a practised move (ADR 013): one attempt per matching repertoire node. `sessions` maps collection id → FSRS session id and is filled as needed. */
  export async function feedRepertoire(
    db: Storage, sessions: Record<string, string>, attempt: RecallAttempt, fenBefore: string,
  ): Promise<void>;
  ```

- [ ] **Step 1:** Move the body of `LabController.feedRepertoire` into `feedRepertoire` unchanged in behaviour (the colour still comes from `attempt.ply` parity; `playMove`, `toEpd`, `db.repertoireMovesAt`, `db.startSession`, `db.recordAttempt`).
- [ ] **Step 2:** `LabController.feedRepertoire` becomes `this.save(() => feedRepertoire(storage(), sessions, attempt, fenBefore))`, keeping the `sessions` capture.
- [ ] **Step 3:** `pnpm typecheck && pnpm lint`; then `pnpm build && pnpm test:e2e` — the existing lab/drill e2e must still pass (no behaviour change).
- [ ] **Step 4: Commit** `refactor(web): share the FSRS feed of practised moves`.

### Task 8: Effects — board flash and shake, sound, switch

**Files:**
- Modify: `apps/web/src/lib/Board.svelte`
- Create: `apps/web/src/lib/sound.ts`, `apps/web/src/lib/effects.svelte.ts`, `apps/web/src/lib/components/EffectsSwitch.svelte`
- Modify: `apps/web/src/lib/i18n/en.ts`, `it.ts`

**Interfaces:**
- Produces:
  - `Board.svelte` props `flash?: { square: string; kind: 'right' | 'wrong'; n: number }` (a coloured overlay on that square for ~400 ms, re-triggered when `n` changes) and `shake?: number` (the board shakes ~300 ms when the value changes). Both are plain CSS; no animation when `prefers-reduced-motion: reduce`.
  - `effects.svelte.ts`: `export const effects: { on: boolean; toggle(): void }` (reactive, loaded from `pc.effects`, default `true`, memory fallback).
  - `sound.ts`: `export type Cue = 'right' | 'wrong' | 'name' | 'done' | 'lost'; export function playCue(cue: Cue): void` — synthesised with `AudioContext` (created lazily at the first cue, never when `effects.on` is false or `AudioContext` is missing; resume it on first user gesture).
  - `EffectsSwitch.svelte`: a checkbox/button "Sound and animation" bound to `effects`.

- [ ] **Step 1:** Add the Board props and overlay/shake CSS; verify the other tabs still render the board unchanged (no new prop passed).
- [ ] **Step 2:** Add `effects.svelte.ts`, `sound.ts` (short beeps: right = rising two tones, wrong = low buzz, name = three-tone arpeggio, done = four-tone, lost = falling), the switch, and i18n keys `effects.label`, `effects.on`, `effects.off` in both dictionaries.
- [ ] **Step 3:** `pnpm typecheck && pnpm lint`.
- [ ] **Step 4: Commit** `feat(web): board flash, shake, sound cues and an effects switch`.

### Task 9: Placeholder bishop

**Files:**
- Create: `apps/web/src/lib/components/Bishop.svelte`

**Interfaces:**
- Produces: `<Bishop expression="happy" | "proud" | "sorry" | "calm" size={n} />`, an inline SVG (white bishop, dark outline, face on the mitre), `role="img"` with an `aria-label` from `t('bishop.<expression>')`. Drawn after the mockup in `.superpowers/brainstorm/*/content/bishop-and-result-card.html` (happy = closed smiling eyes, proud = round eyes and a star, sorry = slanted brows and a sweat drop, calm = round eyes and a flat mouth). All art lives in this one file so it can be replaced.

- [ ] **Step 1:** Create the component; add `bishop.happy`, `bishop.proud`, `bishop.sorry`, `bishop.calm` to `en.ts` and `it.ts`.
- [ ] **Step 2:** `pnpm typecheck && pnpm lint`.
- [ ] **Step 3: Commit** `feat(web): placeholder bishop mascot`.

### Task 10: Today controller, panel and tab

**Files:**
- Create: `apps/web/src/lib/today.svelte.ts`, `apps/web/src/lib/today-day.ts`, `apps/web/src/lib/components/TodayPanel.svelte`
- Modify: `apps/web/src/routes/+page.svelte`, `apps/web/src/lib/i18n/en.ts`, `it.ts`

**Interfaces:**
- Consumes: Tasks 1–9; `repertoireSession`, `dailyMix`, `buildNameTree`, `openingLine`/`practiceLine`, `openingSide`, `weekOf`, `weekId`, `lineSrsState`, `resolveOpening`, `startRecall`/`submitRecall`/`recallHint`, `storage()`.
- Produces:
  - `today-day.ts`: `markTodayStarted(now = new Date()): void` and `startedToday(now = new Date()): boolean` over `pc.today` (memory fallback).
  - `TodayController` (same surface the page uses for `session`, like `LabController`): `active`, `awaitingMove`, `fen`, `lastMove`, `shapes`, `play(uci): boolean`, `askHint()`, `repeat()` (no-op), `next()` (advances after a puzzle card), plus `run: TodayRun`, `puzzle`, `side`, `announcement`, `hint`, `flash`, `shake`, `streak: number`, `status: 'idle' | 'loading' | 'playing' | 'puzzle-done' | 'finished' | 'done-for-today' | 'empty'`, `start()`, `stop()`, `prepare()` (loads candidates and the streak).

- [ ] **Step 1 (candidates):** `prepare()` loads non-archived collections (`db.listCollections()`, `db.loadTree`, `db.listCards`) and `db.repertoireCards()`. Due = `dueCandidates(repertoireSession(all, now))`; new = `newCandidates(week collections only, i.e. those with `weekOf(c.source) === weekId(now)`)`; fill = `dailyMix` entries of kind `new` mapped to `PuzzleCandidate` (line from `practiceLine(graph, node.ucis)`, side from `openingSide` of the node's opening — mirror how `ExplorePanel.svelte` builds a `LabItem`), `summaryOf` from `lab.summaries`. `selectPuzzles(..., { random: seededRandom(`${dayKey(now)}:${Date.now()}`) })`. Streak = `currentStreak(practiceDays(await db.practiceTimes(now − 400 days)), now)`. Status: `done-for-today` if `startedToday()`, `empty` if there are no puzzles, else `idle`.
- [ ] **Step 2 (play):** `start()` calls `markTodayStarted` only at the first move played (not at Start). Each puzzle: `startRecall(line, { autoSide: side === 'w' ? 'b' : 'w', fromPly: criticalPly(...) })`; the lead-in plies (0 … startPly−1) are shown one by one every ~300 ms (instant when effects are off or reduced motion) while `awaitingMove` is false; the prompt names the opponent's last move ("Black played 5…a6. Your move.") from `recall.sans`.
- [ ] **Step 3 (moves):** `play(uci)` uses `submitRecall`; a wrong result → `moveWrong(run, firstTry = recall.firstWrongUci === null before the call)`, `shake++`, `flash` wrong, `playCue('wrong')`; a correct result → `moveCorrect(run, attempt.result)`, `flash` right, `playCue('right')`, then the name reveal: `resolveOpening(sans)?.name` after the move, shown with `playCue('name')` when it is non-null and differs from the name before the move. Every attempt is written with `storage().recordLabAttempt({ runId, ...attempt })` (one `runId` per puzzle, `newId()`) and `feedRepertoire(...)`, queued like `LabController.save`. When a heart reaches 0 the run is `stopped` at once (`playCue('lost')`), the in-progress puzzle is abandoned, FSRS sessions are ended.
- [ ] **Step 4 (puzzle end):** on `recall.phase === 'done'`: `puzzleDone(run, { errors, hints })`; after the writes are flushed reload `db.repertoireCards()` and show the automatic celebration when `lineSrsState(line, side, before) !== 'known'` and after is `'known'`; the result card shows clean / with hints / with errors and the opening name. When the run is `complete` or `stopped`: `status = 'finished'`, summary (puzzles by outcome, best combo, streak, and for `stopped` the moves/openings with errors to review).
- [ ] **Step 5 (panel and page):** `TodayPanel.svelte` shows, by status: Start button + streak + hearts (`idle`), the empty message (`empty`), the header (hearts ♥ ×5 with `data-testid="today-hearts"` and an `aria-label` with the count, `today-combo`, `today-streak`, progress "puzzle k of n"), the mascot and the announcement, the result card with a Next button, the final summary, and "Done for today — come back tomorrow" with a hint to the Training tab (`done-for-today`); the `EffectsSwitch` is always visible. In `+page.svelte`: `Tab` gains `'today'`, `TABS = ['today', 'explore', 'graph', 'repertoire', 'train']`, default `tab = 'today'`, the URL effect writes `tab` only when it is not `'today'`, `todaying = tab === 'today' && today.active`, `session` includes the Today controller, the board orientation follows `today.side`, `<Board>` receives `flash`/`shake` (only while `todaying`), leaving the tab stops the session (`$effect` like the lab's), `{#if tab === 'today'}<TodayPanel …/>` first in the tabpanel chain, `today.prepare()` runs after `ensureWeek` in the startup effect and again whenever the tab becomes `today`.
- [ ] **Step 6 (strings):** add `tabs.today` ("Today"/"Oggi") and `today.*` keys (start, empty, doneForToday, comeBack, streak, hearts, combo, progress, yourTurn, opponentPlayed, clean, withHints, withErrors, stopped, review, summary, automatic, next) to `en.ts` and `it.ts` together.
- [ ] **Step 7:** `pnpm lint && pnpm typecheck && pnpm test && pnpm build`.
- [ ] **Step 8: Commit** `feat(web): Today tab with puzzle sessions`.

### Task 11: End-to-end tests, ADR note, docs

**Files:**
- Create: `apps/web/e2e/today.spec.ts`
- Modify: `apps/web/e2e/drill.spec.ts`, `apps/web/e2e/review.spec.ts` (and any other e2e that assumes Openings is the default tab), `docs/adr/013-repertoire-backbone.md`, `AGENTS.md` (layout list)

- [ ] **Step 1: Update existing e2e.** Tests that rely on the Openings tab right after `page.goto('/')` now `goto('/?tab=explore')`. Rewrite `the openings tab has no Today view` (drill.spec.ts ~line 125) to assert that a `Today` tab exists and the Openings tab has no daily mix. Run `pnpm build && pnpm test:e2e` and fix every remaining failure caused by the new default tab.
- [ ] **Step 2: Write `today.spec.ts`.** The puzzles depend on the week, so tests never assume a line: a wrong move is any legal move typed in `#san-input`; the right move is read from the announcement ("The right move is X") and typed in. Tests: (a) fresh profile → Today is the selected tab, Start shows with 5 hearts; (b) five first-try wrong moves → hearts 0, the "stopped" summary shows, Start is gone and the streak is at least 1; (c) a wrong then a right move on one move costs exactly one heart and the combo is 0, then a right move at the first try makes it 1; (d) after the first move, reload → "Done for today"; (e) the effects switch persists across reload and, when off, no `AudioContext` is constructed (stub it with `addInitScript`); (f) with `localStorage` throwing (`addInitScript` override) Today still starts and plays; (g) Training and Openings tabs still open and work after a stopped session.
- [ ] **Step 3: Docs.** Add a dated note to ADR 013 (2026-10-16: Today returns as a puzzle session built on `repertoireSession`, week repertoires and `dailyMix` fill-ins; one session per day; no `lab_run` for puzzles). Add the new files to the AGENTS.md layout (`src/today/` in core; `today.svelte.ts`, `TodayPanel`, `Bishop` in web).
- [ ] **Step 4: Full gate:** `pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm test:e2e` — all green.
- [ ] **Step 5: Commit** `test(web): e2e for the Today puzzles; docs: ADR 013 note`.
