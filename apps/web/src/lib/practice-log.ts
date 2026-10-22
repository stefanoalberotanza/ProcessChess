import { type RecallAttempt, playMove, toEpd } from '@processchess/core';
import type { Storage } from '@processchess/db';

/**
 * The repertoire is the centre and FSRS the only clock (ADR 013): a practised move that is one of
 * the user's repertoire moves (same position and move, in a non-archived collection of the colour
 * that played it) updates that move's card, as a drill attempt would. `sessions` maps collection
 * id → FSRS session id and is filled as needed.
 */
export async function feedRepertoire(
  db: Storage,
  sessions: Record<string, string>,
  attempt: RecallAttempt,
  fenBefore: string,
): Promise<void> {
  const after = playMove(fenBefore, attempt.uci);
  if (!after) return;
  const epdAfter = toEpd(after.fen);
  const color = attempt.ply % 2 === 1 ? 'w' : 'b';
  for (const m of await db.repertoireMovesAt(epdAfter, attempt.uci, color)) {
    sessions[m.collectionId] ??= (await db.startSession(m.collectionId, m.rootNodeId)).id;
    await db.recordAttempt({
      sessionId: sessions[m.collectionId]!,
      nodeId: m.nodeId,
      result: attempt.result,
      playedUci: attempt.playedUci,
      hints: attempt.hints,
      timeMs: attempt.timeMs,
    });
  }
}
