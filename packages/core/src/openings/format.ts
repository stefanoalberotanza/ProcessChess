/** Compact numbered line from SAN moves: ["e4","e5","Nf3"] → "1.e4 e5 2.Nf3". */
export function formatLine(movesSan: readonly string[]): string {
  return movesSan.map((san, i) => (i % 2 === 0 ? `${i / 2 + 1}.${san}` : san)).join(' ');
}
