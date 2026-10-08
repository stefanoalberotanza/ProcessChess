import { Chess, type Square } from 'chess.js';

export const INITIAL_FEN = new Chess().fen();

export interface PositionInfo {
  turn: 'w' | 'b';
  check: boolean;
  /** Legal moves as origin → destinations, for the board. */
  dests: Map<string, string[]>;
  /** "from+to" pairs (UCI without piece) that are promotions. */
  promotions: string[];
}

export function describePosition(fen: string): PositionInfo {
  const chess = new Chess(fen);
  const dests = new Map<string, string[]>();
  const promotions = new Set<string>();
  for (const m of chess.moves({ verbose: true })) {
    const list = dests.get(m.from) ?? [];
    if (!list.includes(m.to)) list.push(m.to);
    dests.set(m.from, list);
    if (m.promotion) promotions.add(m.from + m.to);
  }
  return { turn: chess.turn(), check: chess.inCheck(), dests, promotions: [...promotions] };
}

/** Plays a UCI move; null if illegal. */
export function playMove(
  fen: string,
  uci: string,
): { uci: string; san: string; fen: string } | null {
  const m = /^([a-h][1-8])([a-h][1-8])([qrbn])?$/.exec(uci);
  if (!m) return null;
  const chess = new Chess(fen);
  try {
    const move = chess.move({ from: m[1] as Square, to: m[2] as Square, promotion: m[3] });
    return { uci: move.lan, san: move.san, fen: chess.fen() };
  } catch {
    return null;
  }
}

export function uciToSan(fen: string, uci: string): string | null {
  return playMove(fen, uci)?.san ?? null;
}

/** Parses SAN typed by the user (annotations allowed); null if illegal or ambiguous. */
export function sanToUci(fen: string, san: string): string | null {
  const clean = san.trim().replace(/[!?]+$/, '');
  if (!clean) return null;
  const chess = new Chess(fen);
  try {
    return chess.move(clean, { strict: false }).lan;
  } catch {
    return null;
  }
}

/** Replays UCI moves from `fen`; null if a move is illegal. */
export function playLine(
  fen: string,
  ucis: readonly string[],
): { san: string[]; fen: string } | null {
  let current = fen;
  const san: string[] = [];
  for (const uci of ucis) {
    const r = playMove(current, uci);
    if (!r) return null;
    san.push(r.san);
    current = r.fen;
  }
  return { san, fen: current };
}

export interface PlacedPiece {
  square: string;
  color: 'w' | 'b';
  /** chess.js piece type: p n b r q k */
  type: string;
}

/** Pieces on the board, from a8 to h1. */
export function piecesOf(fen: string): PlacedPiece[] {
  return new Chess(fen)
    .board()
    .flat()
    .filter((p) => p !== null)
    .map((p) => ({ square: p.square, color: p.color, type: p.type }));
}
