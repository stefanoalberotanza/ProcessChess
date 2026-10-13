# Openings panel: goal in focus — design

Date: 2026-10-12

Approved visually (companion mockup "Direction B, in detail"). Builds on the daily mix
(`2026-10-12-daily-mix-design.md`); no change to `dailyMix()` or to storage.

## Goal

Make the Openings panel motivating and readable: one clear goal card with a single
"Practise now" action, a calmer list, and the two browsing lists as tabs.

## Layout (top to bottom)

1. **Goal card** (`DailyMix.svelte`, restyled)
   - Accent gradient card. Top line: "Today's goal" (`mix.goal`) — or "Start here"
     (`mix.start`) when the mix has no practised line — and 🎲 Change on the right.
   - Big line: "{done} of {total} variations done" (`mix.progress`) — first day: "{total} popular
     openings to try" (`mix.firstDay`).
   - Segmented bar: one segment per entry, filled when done today.
   - "Next" (`mix.next`): the first entry not done today, in mix order, with its kind chip and
     name; button **▶ Practise now** (`mix.practiseNow`) → `onpractice(items, indexOfNext)`.
   - All done → the card says "All done for today" (`mix.allDone`) and the button becomes
     🎲 Change.
2. **The other entries** below the card (every entry except "next"): ✓ when done today (no ▶),
   otherwise ▶; name with ellipsis + title; kind chip at the end. **No mastery dots** in mix rows.
   Click on a name still jumps the board.
3. **Search** — placeholder without ECO: "Search an opening (e.g. Najdorf)" /
   "Cerca un’apertura (es. Najdorf)".
4. **Tabs**: "By name" (existing `lab.byName` text) and "Continues into · {n}" (the
   `lab.continuesInto` text followed by the count). Tab state is local to the panel (default By
   name), not persisted. "Continues into" keeps its 3 + show all behaviour and is disabled (still
   shown, count 0) when empty.
5. **By-name roll-up** reads "{mastered} / {total} lines" (`lab.rollupShort`) as plain text
   instead of bar + "0/1833".

## Kind chips

Pill chips with tinted backgrounds: almost (amber), review (green), new (blue). Colours are CSS
custom properties defined once in the app's global stylesheet with a dark-mode override if the
app has one (match what exists; do not introduce a theme system).

## i18n (en / it)

`mix.goal` Today's goal / Obiettivo di oggi · `mix.start` Start here / Inizia da qui ·
`mix.progress` {done} of {total} variations done / {done} di {total} varianti fatte ·
`mix.firstDay` {total} popular openings to try / {total} aperture popolari da provare ·
`mix.next` Next / Prossima · `mix.practiseNow` Practise now / Allena ora ·
`mix.allDone` All done for today / Tutto fatto per oggi · `lab.rollupShort` {mastered} / {total}
lines / {mastered} / {total} linee · updated `explore.searchPlaceholder`. `mix.title` stays as
the accessible name of the mix list; `mix.shuffle` and the `mix.kind.*` keys are unchanged.

## Accessibility

The mix list keeps the accessible name "Daily mix" (`mix.title`); the goal card is a `section`
labelled by its heading; tabs use `role="tablist"`/`tab`/`tabpanel` with `aria-selected`.

## Testing

- Update e2e for the new structure:
  - daily mix test: 5 entries = next + 4 rows (use the list/card accessible names);
    "Practise now" starts the next entry; after a run with a mistake the practised opening shows
    the "almost there" chip;
  - continues-into tests click the "Continues into" tab first;
  - by-name tests unchanged except where the roll-up text is asserted.
- New e2e: after the "next" entry is completed without mistakes, it shows ✓ in the list and
  "next" moves to the following entry. ("All done for today" is not e2e-tested: it needs five
  full runs; it is covered by keeping its condition in a small pure helper with a unit test.)
- Full gate as usual (three known CRLF failures on this checkout).
