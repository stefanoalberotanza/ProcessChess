/** 32-bit FNV-1a hash of an EPD as 8 hex digits; identifies opening-graph nodes compactly. */
export function epdHash(epd: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < epd.length; i++) {
    h ^= epd.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}
