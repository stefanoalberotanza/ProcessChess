# Contesto

Stiamo costruendo ProcessChess, un'app open source per allenare sequenze di scacchi
giocandole a ripetizione, con spaced repetition (FSRS) e history di ogni tentativo
in un database. Si parte dalle aperture; in seguito arriveranno partite famose, matti famosi,
pattern e finali. Target: web (PWA), desktop e mobile con interfaccia grafica tramite Tauri 2,
un solo frontend condiviso. Approccio local-first: tutto funziona offline.

Stack deciso:

- Monorepo pnpm, TypeScript strict, test con Vitest
- packages/core (`@processchess/core`): logica pura senza UI, regole e PGN/FEN con
  chess.js (BSD-2), poi drill e FSRS
- packages/db (`@processchess/db`): schema Drizzle ORM su SQLite + interfaccia Storage
  con adapter intercambiabili
- apps/web (`@processchess/web`): SvelteKit con adapter statico; scacchiera chessground (GPL)
  racchiusa in un unico componente `Board.svelte`, così che sostituirla con cm-chessboard
  tocchi un solo file
- apps/native: Tauri 2 (fase successiva, NON in questo task)
- Dataset aperture: lichess-org/chess-openings (CC0), file a.tsv…e.tsv con colonne eco, name, pgn
- Licenza attuale: GPL-3.0-or-later

# Obiettivo di questo task: traguardo M0 "Fondamenta"

Lavora su un branch `m0-foundations`, con commit piccoli e descrittivi.

1. **Scaffold del monorepo**: repository `processchess`, pnpm workspace con packages/core,
   packages/db, apps/web; ESLint + Prettier; tsconfig condiviso; script root `lint`,
   `typecheck`, `test`, `build`. Nome dell'app visualizzato: "ProcessChess".
2. **File di contesto**:
   - `AGENTS.md` in root: visione, stack, struttura, convenzioni, comandi, regole
     (test prima del codice in core, niente nuove dipendenze senza chiedere, nessuna
     dipendenza GPL fuori da Board.svelte).
   - `docs/adr/001-stack.md`
   - `docs/adr/002-storage.md`: SQLite ovunque (OPFS sul web, tauri-plugin-sql su nativo),
     log `attempt` append-only, ID ULID.
   - `docs/adr/003-srs.md`: ts-fsrs, una card per ogni mossa dell'utente in una collezione.
   - `docs/adr/004-content-kinds.md`: tipi di collezione (opening, game, mate, pattern,
     endgame), posizione di partenza da FEN, due modalità di valutazione: `exact`
     (mossa del repertorio, con alternative accettate) e `result` (per i finali, via
     tablebase, implementata più avanti).
   - `docs/adr/005-licensing.md`: GPL oggi, dovuta solo a chessground; strategia per
     poter passare a MIT; decisione da prendere prima dei contributi esterni.
   - `LICENSE` (GPL-3.0-or-later) e `README.md` essenziale.
3. **Dataset aperture**: copia i 5 TSV in `data/openings/` con una nota sulla licenza CC0.
   Scrivi `scripts/build-openings.ts`, che per ogni riga calcola con chess.js EPD (i primi
   4 campi del FEN) e mosse UCI e genera `packages/core/src/openings/openings.json`.
   Se non riesci a scaricare i file, fermati e chiedimeli.
4. **Riconoscimento apertura** in packages/core, **test prima**:
   `resolveOpening(movesSan: string[]): { eco, name, family, variation, ply } | null`.
   Parte dalla posizione finale e torna indietro mossa per mossa fino alla prima EPD presente
   nel dataset, quindi gestisce le trasposizioni.
   `family` e `variation` si ricavano dal formato "Famiglia: Variante, Sottovariante".
   Si applica solo alle sequenze che partono dalla posizione iniziale.
   Casi di test minimi (verifica i nomi esatti sul dataset, non a memoria):
   - 1.e4 e5 2.Nf3 Nc6 3.Bc4 → C50, famiglia Italian Game
   - linea Najdorf fino a 5...a6 → B90, Sicilian Defense: Najdorf Variation
   - 1.d4 Nf6 2.c4 e6 3.Nc3 Bb4 e 1.c4 e6 2.Nc3 Nf6 3.d4 Bb4 → stesso risultato (Nimzo-Indian)
   - linea che esce dalla teoria → restituisce l'ultima apertura nota e il suo ply
   - mossa illegale → errore esplicito
5. **Schema database** in packages/db con Drizzle:
   - `collection`: id, name, kind ('opening' | 'game' | 'mate' | 'pattern' | 'endgame'),
     start_fen, user_color, eval_mode ('exact' | 'result'), source, license
   - `node`: collection_id, parent_id, epd indicizzata, san, uci, is_user_move, comment,
     classificazione opzionale opening_eco/opening_name
   - `card` (campi FSRS), `session` (con collection_id e root_node_id)
   - `attempt`: result in 'correct' | 'hint' | 'wrong', played_uci, hints, time_ms,
     indice su node_id+ts
   - `daily_stat`: per collezione e per categoria
   - `opening`: tabella di riferimento
     Migrazione iniziale generata. Interfaccia `Storage` con una sola implementazione per ora:
     SQLite in memoria per i test. Gli adapter OPFS e Tauri restano come file con TODO.
     Aggiungi un test che crea una collezione `opening` dalla posizione iniziale e una `mate`
     da FEN, con nodi e tentativi.
6. **Pagina di prova in apps/web**: `Board.svelte` con mosse libere e legali.
   Sopra la scacchiera, una barra che mostra ECO, famiglia e variante aggiornate a ogni mossa
   tramite `resolveOpening`, con indicatore "fuori teoria" e pulsante per annullare la mossa.
   Nessun altro design per ora.
7. **CI GitHub Actions**: su push e PR esegue install, lint, typecheck, test e build di apps/web.

# Vincoli

- Non implementare drill, FSRS, finali o tablebase, né UI oltre la pagina di prova.
- Dipendenze ammesse: chess.js, chessground (solo in Board.svelte), drizzle-orm, drizzle-kit,
  ts-fsrs, ulid, vitest, sveltekit e i rispettivi tool. Per altre, chiedi.
- La correttezza scacchistica si verifica solo con chess.js e il dataset, mai a occhio.

# Fine del task

Esegui `pnpm lint && pnpm typecheck && pnpm test && pnpm build` e riportami:
esito dei comandi, albero delle cartelle, decisioni prese che non erano nel prompt,
e cosa resta aperto per M1.
