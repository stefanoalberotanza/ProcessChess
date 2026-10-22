# Brief — from archive to learning place

- Date: 2026-10-16
- Status: input for `superpowers:brainstorming`, **not** an approved design. Nothing here is decided;
  each direction needs its own brainstorming, spec and plan with the user.

## What the user said

The app "looks more like an archive than a place to learn or solve these puzzles". Knowing an
opening is a puzzle too, just in moves that are not very tactical.

## Observations (code as of 2026-10-16)

- **Entry through catalogues.** The workspace (`apps/web/src/routes/+page.svelte`) has three
  columns: collections list, board, and four tabs named after data (Openings, Graph, Repertoire,
  Training). Explore shows the Lines view: up to 180 openings as tiles (`LinesView.svelte`). The
  user has to pick from a list before learning anything.
- **Practice replays whole lines.** The lab recall (`core/src/lab/recall.ts`, `LabPanel.svelte`)
  starts from the initial position and asks every move of the line ("Move n of m", hidden
  moves as "?"). The drill does the same per repertoire line.
- **Feedback is text.** A wrong move shows "Not the move of this opening. Play the move shown
  by the arrow."; the only motion is the 150 ms piece animation in `Board.svelte`; no sound.
- **Progress is numbers.** Dots, ✓/✗ run history, a first-try % table, and a statistics page
  made of tables (`routes/stats/+page.svelte`).
- **Tools sit next to practice.** SAN input, FEN export, breadcrumb and "save line" buttons stay
  around the board in every tab.

## Building blocks already in core / db

- `repertoireSession` (`srs/session.ts`) and `dailyMix` (`lab/mix.ts`): a daily queue of due
  repertoire lines plus new variations. ADR 013 keeps them in core, unused by the UI.
- `startRecall(ucis, { startFen, autoSide })`: a recall can start from any position and let one
  side play by itself.
- FSRS cards per user move, review of due moves (the "Review (n)" button in Training).
- `rollupMastery` (`lab/names.ts`) and `lineSrsState` (`srs/line-state.ts`): progress per opening
  and variation.
- `daily_stat` (db): attempts per day, enough for streaks.
- `docs/openings.md`: the 180 openings and their variations, to pick names and examples.

## Directions to brainstorm (ranked by expected impact)

1. **"Today" puzzle session.** One big "Train" entry: 8–10 puzzles from due moves and new
   variations of the week repertoire. Each puzzle starts at the critical position: earlier moves
   play by themselves quickly, then the prompt ("Black played 5…a6. Your move."). Reuses
   `repertoireSession` / `dailyMix` and `startRecall`.
2. **Reward moment per answer.** Right move: square flash, sound, the name revealed ("Najdorf
   Variation"). Wrong move: shake and arrow. End of line: result card (clean / hint / errors).
   A line becoming automatic (3 clean runs): a small celebration.
3. **Opening atlas to complete.** The opening list as an album: unstudied openings as
   silhouettes, coloured by mastery (`rollupMastery`), "12 of 180" as a goal.
4. **Guess the opening.** Position → pick its name among sibling variations, or name → play the
   moves. Uses only the dataset and the existing mini-boards.
5. **Focus mode while training.** Larger board; collections column, SAN input, FEN export and
   breadcrumb hidden; Graph and FEN in a "Tools" menu.
6. **Daily streak.** "5 days in a row · 7 moves today" from `daily_stat`.

Suggested first brainstorm: 1 and 2 together, since they turn practice into a game and most of
the logic exists.

## Open questions for the user

- Who is the main player: a beginner learning first openings, or a club player keeping a
  repertoire sharp?
- How long should a session be (one 5-minute set, or open-ended)?
- Sound and animation: welcome by default, or opt-in?
- Should "Today" replace the current Training tab, or sit above the existing tabs as the home?
