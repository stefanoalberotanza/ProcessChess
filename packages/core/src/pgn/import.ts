import { Chess } from 'chess.js';
import { toEpd } from '../fen';
import { TreeDraft, emptyTree } from '../tree/tree';
import type { Color, IdGenerator, Tree, TreeEdit } from '../tree/types';
import { type PgnGame, type PgnMove, parsePgn } from './parse';

const INITIAL_FEN = new Chess().fen();

export class PgnStartPositionError extends Error {
  constructor(readonly gameIndex: number) {
    super(`Game ${gameIndex + 1} does not start from the collection's start position`);
    this.name = 'PgnStartPositionError';
  }
}

/** Start position of a game: its FEN header if present, else the standard initial position. */
export function gameStartFen(game: PgnGame): string {
  const fen = game.headers.FEN?.trim();
  return fen ? new Chess(fen).fen() : INITIAL_FEN;
}

function mergeComment(prev: string | null, next: string | null): string | null {
  if (!next) return prev;
  if (!prev) return next;
  return prev.split('\n').includes(next) ? prev : `${prev}\n${next}`;
}

/**
 * Merges `games` into `tree`: existing moves are reused (no duplicate nodes), new moves are
 * appended after existing siblings in PGN order, comments are added to `node.comment`.
 * All games must start from the tree's start position.
 *
 * @throws IllegalMoveError with `gameIndex` and `ply`
 * @throws PgnStartPositionError
 */
export function importPgn(
  tree: Tree,
  games: readonly PgnGame[],
  opts: { newId: IdGenerator },
): TreeEdit {
  const draft = new TreeDraft(tree, opts.newId);
  const rootEpd = tree.nodes.get(tree.rootId)!.epd;
  games.forEach((game, gameIndex) => {
    const startFen = gameStartFen(game);
    if (toEpd(startFen) !== rootEpd) throw new PgnStartPositionError(gameIndex);
    if (game.comment) {
      const root = draft.get(tree.rootId);
      draft.setComment(root.id, mergeComment(root.comment, game.comment));
    }
    const walk = (line: readonly PgnMove[], parentId: string, chess: Chess, ply: number) => {
      let cur = parentId;
      line.forEach((move, i) => {
        const before = chess.fen();
        const child = draft.ensureChild(cur, chess, move.san, ply + i + 1, gameIndex);
        if (move.comment) draft.setComment(child.id, mergeComment(child.comment, move.comment));
        // variations are alternatives to `move`: same parent, same position, after the main move
        for (const variation of move.variations) {
          walk(variation, cur, new Chess(before), ply + i);
        }
        cur = child.id;
      });
    };
    walk(game.moves, tree.rootId, new Chess(startFen), 0);
  });
  return draft.finish();
}

/**
 * Creates a new tree from PGN text: the start position comes from the first game, user moves
 * are those of `userColor`, sibling `ord` follows PGN order (main line first).
 */
export function treeFromPgn(
  pgn: string | readonly PgnGame[],
  opts: { userColor: Color; newId: IdGenerator },
): TreeEdit {
  const games = typeof pgn === 'string' ? parsePgn(pgn) : pgn;
  const first = games[0];
  if (!first) throw new Error('The PGN contains no games');
  const base = emptyTree(gameStartFen(first), opts.userColor, opts.newId());
  const edit = importPgn(base, games, opts);
  // the root is new as well: report it as inserted
  const root = edit.tree.nodes.get(base.rootId)!;
  const inserted = edit.changes.inserted.some((n) => n.id === root.id)
    ? edit.changes.inserted
    : [root, ...edit.changes.inserted];
  return {
    tree: edit.tree,
    changes: {
      inserted,
      updated: edit.changes.updated.filter((u) => u.id !== root.id),
      deleted: [],
    },
  };
}
