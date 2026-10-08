import { Chess } from 'chess.js';
import { toEpd } from '../fen';
import type { Tree, TreeNode } from '../tree/types';

const INITIAL_EPD = toEpd(new Chess().fen());

function escapeHeader(v: string): string {
  return v.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function commentToken(c: string): string {
  return `{ ${c.replace(/[{}]/g, '').replace(/\s*\n\s*/g, ' / ')} }`;
}

/**
 * Exports the tree as a single PGN game with nested variations (siblings in `ord` order, the
 * first one as the main line) and comments.
 */
export function exportPgn(tree: Tree, opts: { event?: string } = {}): string {
  const headers: [string, string][] = [
    ['Event', opts.event ?? 'ProcessChess'],
    ['Site', 'ProcessChess'],
    ['Result', '*'],
  ];
  const root = tree.nodes.get(tree.rootId)!;
  if (root.epd !== INITIAL_EPD) headers.push(['SetUp', '1'], ['FEN', tree.startFen]);

  const fields = tree.startFen.split(' ');
  const startWhite = fields[1] === 'w';
  const startMove = Number(fields[5] ?? '1') || 1;
  // ply 1 = first move after the start position
  const moveNumber = (ply: number) => startMove + Math.floor((ply - 1 + (startWhite ? 0 : 1)) / 2);
  const isWhite = (ply: number) => (ply % 2 === 1) === startWhite;

  const out: string[] = [];
  if (root.comment) out.push(commentToken(root.comment));

  const kids = (id: string): TreeNode[] =>
    (tree.children.get(id) ?? []).map((c) => tree.nodes.get(c)!);

  // writes `node` (at `ply`) with a number if needed, then its comment
  const writeMove = (node: TreeNode, ply: number, forceNumber: boolean) => {
    if (isWhite(ply)) out.push(`${moveNumber(ply)}. ${node.san}`);
    else out.push(forceNumber ? `${moveNumber(ply)}... ${node.san}` : node.san!);
    if (node.comment) out.push(commentToken(node.comment));
  };

  // writes the line continuing from `parentId`, whose first move is at `ply`
  const writeLine = (parentId: string, ply: number, forceNumber: boolean) => {
    let parent = parentId;
    let p = ply;
    let force = forceNumber;
    for (;;) {
      const [main, ...alts] = kids(parent);
      if (!main) return;
      writeMove(main, p, force);
      force = !!main.comment;
      for (const alt of alts) {
        out.push('(');
        writeMove(alt, p, true);
        writeLine(alt.id, p + 1, !!alt.comment);
        out.push(')');
        force = true;
      }
      parent = main.id;
      p++;
    }
  };
  writeLine(tree.rootId, 1, true);
  out.push('*');

  const movetext = out.join(' ').replace(/\( /g, '(').replace(/ \)/g, ')');
  const head = headers.map(([k, v]) => `[${k} "${escapeHeader(v)}"]`).join('\n');
  return `${head}\n\n${movetext}\n`;
}
