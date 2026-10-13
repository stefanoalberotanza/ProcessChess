import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Chess } from 'chess.js';
import { describe, expect, it } from 'vitest';
import { counterIds, mainLine, shape } from '../../test/helpers';
import { IllegalMoveError } from '../errors';
import { childrenOf, emptyTree, findChildByUci } from '../tree';
import {
  PgnStartPositionError,
  PgnSyntaxError,
  exportPgn,
  gameStartFen,
  importPgn,
  parsePgn,
  treeFromPgn,
} from './index';

const fixture = (name: string) =>
  readFileSync(join(import.meta.dirname, '../../test/fixtures', name), 'utf8');
const START = new Chess().fen();

describe('parsePgn', () => {
  it('parses several games with headers, comments, NAGs and nested variations', () => {
    const games = parsePgn(fixture('repertoire.pgn'));
    expect(games).toHaveLength(2);
    const [g1, g2] = games;
    expect(g1!.headers.Event).toBe('White repertoire: 1.e4');
    expect(g1!.comment).toBe('Main repertoire with 1.e4.');
    expect(g1!.moves.map((m) => m.san)).toEqual([
      'e4',
      'e5',
      'Nf3',
      'Nc6',
      'Bc4',
      'Bc5',
      'c3',
      'Nf6',
      'd4',
    ]);
    const e5 = g1!.moves[1]!;
    expect(e5.variations).toHaveLength(1);
    const sicilian = e5.variations[0]!;
    expect(sicilian[0]).toMatchObject({ san: 'c5', comment: 'Sicilian: go Open.' });
    expect(sicilian[2]!.variations[0]!.map((m) => m.san)).toEqual(['Nc6', 'Bb5']);
    expect(g1!.moves[4]).toMatchObject({ san: 'Bc4', comment: 'Italian.' }); // "!?" stripped
    expect(g2!.moves.at(-1)).toMatchObject({ san: 'd3', comment: 'the quiet option' });
  });

  it('strips Lichess [%…] commands from comments and drops empty ones', () => {
    const [advance, exchange] = parsePgn(fixture('lichess-study.pgn'));
    expect(advance!.headers.Orientation).toBe('black');
    expect(advance!.moves[4]).toMatchObject({ san: 'e5', comment: 'Advance.' });
    expect(exchange!.moves[6]).toMatchObject({ san: 'Bd3', comment: null });
  });

  it('handles escaped quotes in headers, move numbers without spaces and results', () => {
    const [g] = parsePgn('[Event "A \\"quoted\\" name"]\n\n1.e4 e5 2.Nf3 1/2-1/2');
    expect(g!.headers.Event).toBe('A "quoted" name');
    expect(g!.moves.map((m) => m.san)).toEqual(['e4', 'e5', 'Nf3']);
  });

  it('reports unbalanced variations with the game index', () => {
    const text = '[Event "ok"]\n\n1. e4 *\n\n[Event "bad"]\n\n1. e4 (1. d4 *';
    expect(() => parsePgn(text)).toThrow(PgnSyntaxError);
    try {
      parsePgn(text);
    } catch (e) {
      expect((e as PgnSyntaxError).gameIndex).toBe(1);
    }
  });

  it('returns no games for empty input', () => {
    expect(parsePgn('  \n')).toEqual([]);
  });
});

describe('gameStartFen', () => {
  it('uses the FEN header, otherwise the initial position', () => {
    const [g] = parsePgn('[SetUp "1"]\n[FEN "6k1/5ppp/8/8/8/8/5PPP/4R1K1 w - - 0 1"]\n\n1. Re8# *');
    expect(gameStartFen(g!)).toBe('6k1/5ppp/8/8/8/8/5PPP/4R1K1 w - - 0 1');
    expect(gameStartFen(parsePgn('1. e4 *')[0]!)).toBe(START);
  });
});

describe('treeFromPgn', () => {
  it('builds a tree whose ord follows PGN order and merges overlapping games', () => {
    const { tree } = treeFromPgn(fixture('repertoire.pgn'), {
      userColor: 'w',
      newId: counterIds(),
    });
    expect(mainLine(tree)).toEqual([
      'e4',
      'e5',
      'Nf3',
      'Nc6',
      'Bc4',
      'Bc5',
      'c3',
      'Nf6',
      'd4',
      'exd4',
    ]);
    const e4 = findChildByUci(tree, tree.rootId, 'e2e4')!;
    expect(childrenOf(tree, e4.id).map((n) => [n.san, n.ord])).toEqual([
      ['e5', 0],
      ['c5', 1],
    ]);
    // 5.d4 from game 1 stays main; 5.d3 from game 2 is appended
    let id = tree.rootId;
    for (const uci of ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4', 'f8c5', 'c2c3', 'g8f6']) {
      id = findChildByUci(tree, id, uci)!.id;
    }
    expect(childrenOf(tree, id).map((n) => [n.san, n.ord, n.comment])).toEqual([
      ['d4', 0, null],
      ['d3', 1, 'the quiet option'],
    ]);
    expect(tree.nodes.get(tree.rootId)!.comment).toBe('Main repertoire with 1.e4.');
    const nodeCount = tree.nodes.size;
    // no duplicates: the second game added only d3, exd4
    expect(nodeCount).toBe(1 + 10 + 8 + 2 + 2 + 1);
  });

  it('starts from the FEN header and marks user moves by colour', () => {
    const pgn = '[SetUp "1"]\n[FEN "6k1/5ppp/8/8/8/8/5PPP/4R1K1 w - - 0 1"]\n\n1. Re8# *';
    const { tree } = treeFromPgn(pgn, { userColor: 'w', newId: counterIds() });
    expect(tree.startFen).toBe('6k1/5ppp/8/8/8/8/5PPP/4R1K1 w - - 0 1');
    const [mate] = childrenOf(tree, tree.rootId);
    expect(mate).toMatchObject({ san: 'Re8#', isUserMove: true });
  });

  it('imports a Lichess study export as a black repertoire', () => {
    const { tree } = treeFromPgn(fixture('lichess-study.pgn'), {
      userColor: 'b',
      newId: counterIds(),
    });
    expect(mainLine(tree)).toEqual([
      'e4',
      'c6',
      'd4',
      'd5',
      'e5',
      'Bf5',
      'Nf3',
      'e6',
      'Be2',
      'c5',
      'Be3',
    ]);
    const e4 = childrenOf(tree, tree.rootId)[0]!;
    expect(e4.isUserMove).toBe(false);
    expect(childrenOf(tree, e4.id)[0]!.isUserMove).toBe(true);
  });

  it('reports illegal moves with game index and ply', () => {
    const text = '1. e4 e5 *\n\n1. e4 e5 2. Ke3 *';
    try {
      treeFromPgn(text, { userColor: 'w', newId: counterIds() });
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(IllegalMoveError);
      expect(e).toMatchObject({ move: 'Ke3', ply: 3, gameIndex: 1 });
    }
  });

  it('reports illegal moves inside variations with their ply', () => {
    expect(() =>
      treeFromPgn('1. e4 e5 (1... Nf3) *', { userColor: 'w', newId: counterIds() }),
    ).toThrow(expect.objectContaining({ move: 'Nf3', ply: 2, gameIndex: 0 }));
  });

  it('rejects an empty PGN', () => {
    expect(() => treeFromPgn('', { userColor: 'w', newId: counterIds() })).toThrow(/no games/i);
  });
});

describe('importPgn into an existing tree', () => {
  it('merges lines without duplicating nodes and appends new siblings', () => {
    const newId = counterIds();
    const { tree } = treeFromPgn('1. e4 e5 2. Nf3 *', { userColor: 'w', newId });
    const r = importPgn(tree, parsePgn('1. e4 e5 2. Nf3 Nc6 (2... d6) *\n\n1. d4 *'), { newId });
    expect(r.changes.inserted.map((n) => n.san)).toEqual(['Nc6', 'd6', 'd4']);
    expect(childrenOf(r.tree, r.tree.rootId).map((n) => [n.san, n.ord])).toEqual([
      ['e4', 0],
      ['d4', 1],
    ]);
    const again = importPgn(r.tree, parsePgn('1. e4 e5 2. Nf3 Nc6 *'), { newId });
    expect(again.changes.inserted).toEqual([]);
  });

  it('adds a comment to an existing node without repeating it', () => {
    const newId = counterIds();
    const { tree } = treeFromPgn('1. e4 { first } *', { userColor: 'w', newId });
    const r = importPgn(tree, parsePgn('1. e4 { second } *'), { newId });
    expect(childrenOf(r.tree, r.tree.rootId)[0]!.comment).toBe('first\nsecond');
    const again = importPgn(r.tree, parsePgn('1. e4 { second } *'), { newId });
    expect(again.changes.updated).toEqual([]);
  });

  it('rejects games that start from a different position', () => {
    const newId = counterIds();
    const tree = emptyTree(START, 'w', newId());
    const games = parsePgn('1. e4 *\n\n[FEN "6k1/5ppp/8/8/8/8/5PPP/4R1K1 w - - 0 1"]\n\n1. Re8# *');
    expect(() => importPgn(tree, games, { newId })).toThrow(PgnStartPositionError);
  });
});

describe('exportPgn', () => {
  it('writes variations, comments and move numbers', () => {
    const newId = counterIds();
    const { tree } = treeFromPgn(
      '{ Intro } 1. e4 e5 (1... c5 { Sicilian } 2. Nf3) 2. Nf3 { Main } Nc6 *',
      {
        userColor: 'w',
        newId,
      },
    );
    const pgn = exportPgn(tree, { event: 'Test' });
    expect(pgn).toBe(
      '[Event "Test"]\n[Site "ProcessChess"]\n[Result "*"]\n\n' +
        '{ Intro } 1. e4 e5 (1... c5 { Sicilian } 2. Nf3) 2. Nf3 { Main } 2... Nc6 *\n',
    );
  });

  it('writes SetUp/FEN for non-standard start positions', () => {
    const { tree } = treeFromPgn('[FEN "6k1/5ppp/8/8/8/8/5PPP/4R1K1 w - - 0 1"]\n\n1. Re8# *', {
      userColor: 'w',
      newId: counterIds(),
    });
    expect(exportPgn(tree)).toContain('[SetUp "1"]\n[FEN "6k1/5ppp/8/8/8/8/5PPP/4R1K1 w - - 0 1"]');
    expect(exportPgn(tree)).toMatch(/1\. Re8# \*\n$/);
  });

  it('starts black-to-move games with "N..."', () => {
    const { tree } = treeFromPgn('[FEN "4k3/8/8/8/8/8/4P3/4K3 b - - 0 7"]\n\n7... Kd7 8. e4 *', {
      userColor: 'w',
      newId: counterIds(),
    });
    expect(exportPgn(tree)).toMatch(/7\.\.\. Kd7 8\. e4 \*\n$/);
  });

  it.each(['repertoire.pgn', 'lichess-study.pgn'])(
    'round-trips %s: import → export → import',
    (name) => {
      const first = treeFromPgn(fixture(name), { userColor: 'w', newId: counterIds('a') }).tree;
      const exported = exportPgn(first);
      const second = treeFromPgn(exported, { userColor: 'w', newId: counterIds('b') }).tree;
      expect(shape(second)).toEqual(shape(first));
      expect(exportPgn(second)).toBe(exported);
    },
  );
});
