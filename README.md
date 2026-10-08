# ProcessChess

Open-source, local-first trainer for chess sequences: play a line again and again, with
spaced repetition (FSRS) and a full history of every attempt. Openings first; famous games,
mates, patterns and endgames later. Web (PWA), desktop and mobile (Tauri 2) from one frontend.

Status: explore the ECO openings graph, build a repertoire from it (or import a PGN) and train
it line by line in the browser, offline, with every attempt saved locally (SQLite in OPFS).

## Development

Requires Node ≥ 22.13 and pnpm 10.

```sh
pnpm install
pnpm --filter @processchess/web dev   # app on http://localhost:5173
pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm test:e2e
```

See [AGENTS.md](AGENTS.md) for structure and conventions and [docs/adr](docs/adr) for design decisions.

## License

GPL-3.0-or-later (see [LICENSE](LICENSE) and [ADR 005](docs/adr/005-licensing.md)).
Opening data in `data/openings/` is CC0 (lichess-org/chess-openings).
