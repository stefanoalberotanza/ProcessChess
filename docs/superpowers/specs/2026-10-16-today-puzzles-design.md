# Today: a short puzzle session with hearts, combo and streak — design

Date: 2026-10-16
Input: `docs/superpowers/briefs/2026-10-16-learning-appeal.md` (directions 1 and 2).
Status: draft for the user's approval. Items marked **[call]** are the author's choices, not the
user's.

## Intent

The app feels like an archive: the user picks from catalogues, replays whole lines from the first
move, and gets text and tables back. The user wants something closer to Duolingo: open the app with
five minutes, play 3–4 short puzzles, feel progress, come back tomorrow to keep a streak. Knowing an
opening is a puzzle too, in moves that are not very tactical.

The unit of the new experience is a **puzzle**: a position from a line the user is learning or
about to forget, where they must find the right move. A **session** is 3–4 puzzles played in a row.
Wrong moves cost a heart; at zero hearts the session stops.

## Goals

- A new first tab, **Today**, opened at app start, that runs a session of 3–4 puzzles.
- Puzzles mix lines or variations the user does not know yet with moves whose review is due or
  about to be (FSRS).
- Each puzzle starts at the critical position: the earlier moves play by themselves, quickly, then
  the user is prompted ("Black played 5…a6. Your move.").
- Hearts (5 per session), a combo counter, and a daily streak.
- A reward moment on every answer, and a result card at the end of each puzzle and of the session.
- Sound and animation on by default, with a switch to turn them off.
- A placeholder mascot (white bishop), easy to replace.

## Non-goals (for this MVP)

- Paid or free retries, or a second session the same day. Nothing is stored about a session
  beyond the per-day marker below.
- Replacing or changing the **Training** tab (its drill and "Review (n)" stay exactly as they are;
  what happens to it is decided later).
- The opening atlas, "guess the opening", the focus mode (larger board, hidden tools), the
  statistics page redesign.
- A smart selection algorithm in the first cut (see "Selection"), final mascot art, music.

## Anti-goals (failure even if it works)

- Hearts or a stopped session must never make the app unusable or lose data: every other tab keeps
  working.
- A session must not distort mastery: playing the tail of a line must not count as a clean pass of
  the whole line.
- No second source of truth for "known": FSRS stays the only clock (ADR 013).

## What the user decided

- Session of 3–4 puzzles, finished, like a Duolingo lesson. Win streak like Duolingo's.
- Mistakes cost something: hearts. At zero the session stops; the puzzles not played are left.
- Errors are tracked per move and opening (as today), never as a "session" entity.
- A day counts for the streak as soon as the user plays at least one move, even if the hearts end.
- The mix is new lines/variations plus reviews that are due or about to be. The split is random for
  now behind a single function; a simple algorithm follows later, still within the MVP.
- Today is a new tab; the Training tab stays.
- Sound and animation are on, with a switch.
- The bishop mascot is a placeholder for the MVP; the user does not like it as a final design.

## Behaviour

### Entering and the session

- Tab id `today`, first in the tab bar, default when the URL has no `tab`. `?tab=today` deep link.
  Existing links with another tab keep working.
- Empty state: a "Start" button, the streak ("5 days in a row"), hearts. One click starts a
  session of 4 puzzles (3 if fewer are available). **[call]** 4 by default.
- **One session per day** (the user's decision), also after hearts run out or all puzzles are
  done. Once the day's session has begun, Today shows "Done for today — come back tomorrow", the
  streak, and a pointer to Training for free practice. No Start button until the next local day.
- **[call]** The day's session is marked in `localStorage` (`pc.today`, `{ day }`, try/catch) at
  the first move played, not as a stored session entity. A reload mid-session therefore ends the
  session for the day (the moves already played stay logged). If storage is unavailable the
  marker falls back to memory and the limit holds only until reload.
- During a session: a header with hearts, combo, progress (puzzle k of n) and the streak; the board
  (`Board.svelte`); a feedback area with the mascot.

### A puzzle

- A puzzle is a line plus a **critical ply**: the first position where the user has something to
  decide. **[call]** For a line with a due or learning user move: the position before its most
  overdue such move. For a line with no card yet: the position before its first user move that has
  no card (a wholly new line starts at its first user move). Plies before it play themselves
  quickly (about 300 ms each).
- The prompt names the opponent's last move when there is one ("Black played 5…a6. Your move.").
- The puzzle runs to the end of the line. **[call]** Wrong move: the existing recall behaviour —
  the right move is shown by the arrow and must be played to continue. Hints work as in the lab
  (piece, square, move) and mark the move "with a hint".
- Line sources **[call]**: new = lines of the current week repertoires (`ensureWeek`) whose user
  moves have no card; due = `repertoireSession` lines (due first, then learning). If fewer than 3
  puzzles can be built, fill with `dailyMix` entries of kind `new` (dictionary variations). A line
  that is both new and due is offered once, as due. "About to expire" is not a separate window:
  due now plus learning moves, as `repertoireSession` already gives. The name reveal uses the
  existing `classifyOpening`/`resolveOpening`, no new classifier.

### Hearts, combo, streak

- 5 hearts per session **[call]**. A move answered wrongly the first time costs one heart (further
  wrong tries on the same move are free). A hint costs nothing but the move is "with a hint".
- At zero hearts the session ends at once, even mid-puzzle. Moves already played stay logged; the
  unplayed puzzles are dropped. The end card says what to review (moves/openings with errors) and
  that the streak is safe.
- Combo = consecutive moves answered correctly at the first try, inside the session. A wrong move
  resets it; a move played with a hint neither adds nor resets **[call]**.
- Streak = consecutive local calendar days with at least one practised move. Completing the
  session is not required; the day counts as soon as the first move is played. **[call]** Any
  practised move counts (Today, Lab, Training), so no source marker or migration is needed:
  days come from the timestamps of `lab_attempt` and `attempt`.
- Nothing to practise (new profile with no week repertoire lines, or nothing known and nothing
  due and no dictionary fill-ins): Today shows a message and no Start button. **[call]** A session
  needs at least 1 puzzle.
- Stalling on a move is allowed: further wrong tries on the same move are free, a hint after a
  wrong try still counts as "with errors" (existing recall rule). **[call]**

### Reward moment

- Correct move: the destination square flashes, a short sound, the mascot smiles. If the position
  after the move has a more specific opening or variation name in the dataset than before, the
  name is revealed ("Najdorf Variation") **[call]**.
- Wrong move: the board shakes briefly, a different sound, the arrow shows the right move, a heart
  is lost, the mascot looks sorry.
- End of a puzzle: a result card — clean / with hints / with errors — with the opening name.
- When a line becomes automatic a small celebration is shown. **[call]** Puzzles write no
  `lab_run`, so "automatic" is the FSRS state: the celebration appears when `lineSrsState` of the
  line turns from learning/new to known after the puzzle.
- End of session (all puzzles done): summary (puzzles clean/with hints/with errors, best combo,
  streak). Stopped session: see Hearts.
- Animation and sound have one switch, stored per viewer in `localStorage` (try/catch). Also
  honour `prefers-reduced-motion` for animation **[call]**.

## Constraints

- Follow AGENTS.md: logic (puzzle building, hearts/combo reducer, streak, selection) in
  `packages/core` with tests first; UI calls only core and db; chessground only inside
  `Board.svelte` (the flash and shake are props of `Board.svelte`); every string through `t()` in
  `en.ts` and `it.ts` together; no new dependencies.
- **Sound** is synthesised with the Web Audio API (no audio files, no library). **[call]**
- **Logging** must stay as it is: a move played in a puzzle is recorded like a lab move (the
  `lab_attempt` row with its edge, and the FSRS feed of `feedRepertoire`, ADR 013). The puzzle
  must not write a `lab_run` for a partial line, and the plies it records must stay the plies of
  the full line (the colour is derived from the ply parity). `attempt`, `lab_attempt`, `lab_run`
  stay append-only.
- **Streak source**: dictionary fill-ins feed only `lab_attempt`, not `daily_stat`, so the streak
  is computed from the timestamps of `lab_attempt` and `attempt` together (local day, not UTC).
  `lab_attempt.run_id` is not a foreign key, so attempts without a `lab_run` are valid.
- **Selection** is one pure function in core (input: candidates, day, seed; output: ordered
  puzzles), replaceable by the later algorithm. Random with `seededRandom`.
- Existing e2e tests assume Explore is the default tab; they need updating.
- The ADR 013 amendment says the old Today card was removed in favour of week repertoires and that
  `dailyMix` and `repertoireSession` stay unused; this design uses them again. Add a dated note to
  ADR 013 when implementing.

## Left to the builder

- Names and file layout of the new core module and Svelte components, the reducer shape, the
  mascot's drawing (three expressions, SVG, component with an `expression` prop so art can be
  swapped), sound design, exact animation timings.
- How the puzzle drives `startRecall`/`submitRecall` with a critical ply and how attempts keep
  full-line ply numbers.
- How "about to expire" is computed for lines (the FSRS `due` already marks overdue; learning
  moves are included), and de-duplication of lines across sources.
- Test plan: core unit tests; Playwright for hearts to zero, a clean session, the streak, the
  switch.
