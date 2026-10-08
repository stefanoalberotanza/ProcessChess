/** A move in PGN movetext with the comment that follows it and its alternatives (RAV). */
export interface PgnMove {
  san: string;
  comment: string | null;
  /** Alternatives to this move; each starts at the same position as this move. */
  variations: PgnMove[][];
}

export interface PgnGame {
  headers: Record<string, string>;
  /** Comment before the first move. */
  comment: string | null;
  moves: PgnMove[];
}

export class PgnSyntaxError extends Error {
  constructor(
    message: string,
    /** 0-based index of the game in the file. */
    readonly gameIndex: number,
  ) {
    super(`PGN syntax error in game ${gameIndex + 1}: ${message}`);
    this.name = 'PgnSyntaxError';
  }
}

type Token =
  | { t: 'header'; key: string; value: string }
  | { t: 'comment'; text: string }
  | { t: 'open' }
  | { t: 'close' }
  | { t: 'result' }
  | { t: 'san'; san: string };

const RESULT = /^(1-0|0-1|1\/2-1\/2|\*)$/;
const MOVE_NUMBER = /^\d+\.+/;
const NAG = /^\$\d+$/;

function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const n = text.length;
  while (i < n) {
    const c = text[i]!;
    // "%" escape: the whole line is ignored when it starts at column 0
    if (c === '%' && (i === 0 || text[i - 1] === '\n')) {
      while (i < n && text[i] !== '\n') i++;
    } else if (/\s/.test(c)) {
      i++;
    } else if (c === '[') {
      const end = findHeaderEnd(text, i);
      const m = /^\[\s*([A-Za-z0-9_]+)\s+"((?:[^"\\]|\\.)*)"\s*\]$/s.exec(text.slice(i, end + 1));
      if (!m) throw new Error(`malformed header ${text.slice(i, Math.min(end + 1, i + 40))}`);
      tokens.push({ t: 'header', key: m[1]!, value: m[2]!.replace(/\\(.)/g, '$1') });
      i = end + 1;
    } else if (c === '{') {
      const end = text.indexOf('}', i);
      if (end === -1) throw new Error('unterminated comment');
      tokens.push({ t: 'comment', text: text.slice(i + 1, end) });
      i = end + 1;
    } else if (c === ';') {
      let end = text.indexOf('\n', i);
      if (end === -1) end = n;
      tokens.push({ t: 'comment', text: text.slice(i + 1, end) });
      i = end;
    } else if (c === '(') {
      tokens.push({ t: 'open' });
      i++;
    } else if (c === ')') {
      tokens.push({ t: 'close' });
      i++;
    } else {
      let j = i;
      while (j < n && !/[\s{}();[\]]/.test(text[j]!)) j++;
      let word = text.slice(i, j);
      i = j;
      if (RESULT.test(word)) {
        tokens.push({ t: 'result' });
        continue;
      }
      if (NAG.test(word)) continue;
      word = word.replace(MOVE_NUMBER, '');
      if (word === '') continue;
      word = word.replace(/[!?]+$/, '');
      if (word) tokens.push({ t: 'san', san: word });
    }
  }
  return tokens;
}

function findHeaderEnd(text: string, start: number): number {
  let inString = false;
  for (let i = start + 1; i < text.length; i++) {
    const c = text[i];
    if (c === '\\' && inString) i++;
    else if (c === '"') inString = !inString;
    else if (c === ']' && !inString) return i;
  }
  throw new Error('unterminated header');
}

/** Removes Lichess/ChessBase `[%cal …]`-style commands and normalises whitespace. */
export function cleanComment(raw: string): string | null {
  const text = raw
    .replace(/\[%[^\]]*\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text === '' ? null : text;
}

function appendComment(prev: string | null, next: string | null): string | null {
  if (!next) return prev;
  return prev ? `${prev} ${next}` : next;
}

/**
 * Parses PGN text with any number of games. Supports nested variations, `{}` and `;` comments,
 * NAGs and move-quality suffixes (ignored), `%` escape lines and all result tokens.
 * Moves are not validated here; see `importPgn`.
 */
export function parsePgn(text: string): PgnGame[] {
  let tokens: Token[];
  try {
    tokens = tokenize(text);
  } catch (e) {
    throw new PgnSyntaxError((e as Error).message, 0);
  }

  const games: PgnGame[] = [];
  let game: PgnGame | null = null;
  // stack of open lines; the bottom one is the main line
  let stack: PgnMove[][] = [];
  // a comment waiting for the next move (start of game or of a variation)
  let pending: string | null = null;
  let hasMoves = false;

  const finishGame = () => {
    if (!game) return;
    if (stack.length > 1) throw new PgnSyntaxError('unclosed variation', games.length);
    games.push(game);
    game = null;
    stack = [];
    pending = null;
    hasMoves = false;
  };
  const ensureGame = (): PgnGame => {
    if (!game) {
      game = { headers: {}, comment: null, moves: [] };
      stack = [game.moves];
    }
    return game;
  };

  for (const tok of tokens) {
    if (tok.t === 'header') {
      if (game && hasMoves) finishGame();
      ensureGame().headers[tok.key] = tok.value;
      continue;
    }
    const g = ensureGame();
    const line = stack[stack.length - 1]!;
    switch (tok.t) {
      case 'comment': {
        const c = cleanComment(tok.text);
        const last = line[line.length - 1];
        if (last) last.comment = appendComment(last.comment, c);
        else if (stack.length === 1) g.comment = appendComment(g.comment, c);
        else pending = appendComment(pending, c);
        break;
      }
      case 'san': {
        hasMoves = true;
        line.push({ san: tok.san, comment: pending, variations: [] });
        pending = null;
        break;
      }
      case 'open': {
        const last = line[line.length - 1];
        if (!last) throw new PgnSyntaxError('variation without a preceding move', games.length);
        const variation: PgnMove[] = [];
        last.variations.push(variation);
        stack.push(variation);
        break;
      }
      case 'close': {
        if (stack.length === 1) throw new PgnSyntaxError('unexpected ")"', games.length);
        const closed = stack.pop()!;
        if (closed.length === 0) throw new PgnSyntaxError('empty variation', games.length);
        pending = null;
        break;
      }
      case 'result':
        hasMoves = true;
        finishGame();
        break;
    }
  }
  if (game) {
    const g: PgnGame = game;
    if (g.moves.length > 0 || Object.keys(g.headers).length > 0 || g.comment) finishGame();
  }
  return games;
}
