# CLAUDE.md

@AGENTS.md

## Working with Claude Code

Talk with the user in Italian. Code, comments, docs, commit messages and UI strings stay in
English (see Conventions above).

### Workflow: superpowers

This project works with the [superpowers](https://github.com/obra/superpowers) skills. The plugin
is enabled in `.claude/settings.json`; if it is missing, ask the user to run
`/plugin install superpowers@claude-plugins-official`. The skills are the workflow here, not
suggestions:

1. **New feature, UI or behaviour change**: `superpowers:brainstorming` first, with the user,
   before any code. Architectural work ends in a spec,
   `docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md`, then `superpowers:writing-plans`
   writes `docs/superpowers/plans/YYYY-MM-DD-<topic>.md`. Implement only what the user approved.
2. **Implementation**: `superpowers:test-driven-development` (AGENTS.md rule 1). Run a written
   plan with `superpowers:executing-plans` or `superpowers:subagent-driven-development`.
3. **Bug or failing test**: `superpowers:systematic-debugging` before any fix.
4. **Before saying something works**: `superpowers:verification-before-completion`. Run
   `pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm test:e2e` and report the real
   output, failures included.
5. **End of a branch**: `superpowers:finishing-a-development-branch`. Ask before committing,
   pushing or merging.

A decision that outlives its spec goes into `docs/adr/` (amend the ADR with a dated note).
Visual companion sessions write to `.superpowers/brainstorm/`, which git ignores.

### Opening names: `docs/openings.md`

`docs/openings.md` is the name tree the app shows (Opening › Variation › Subvariation, ADR 012),
one line per level: key or label, ECO, side, moves, groups, dataset names. It is generated; run
`pnpm build:openings` after changing `data/openings/` or `packages/core/src/lab/names.ts` (a
test fails while it is stale), and read its diff to see what the change did to the tree.

Use it whenever work involves openings by name: picking examples for a spec or a UI, checking
that an opening or variation exists and how it is spelled, finding its moves, ECO and side,
seeing which variations an opening holds. Search it (grep), do not read it whole. Test
expectations still come from `data/openings/*.tsv` (AGENTS.md rule 4), never from memory.

### Current direction

The app should feel like a place to learn and solve opening puzzles, not an archive.
`docs/superpowers/briefs/2026-10-16-learning-appeal.md` collects observations and proposals.
It is input for brainstorming with the user, not an approved design.
