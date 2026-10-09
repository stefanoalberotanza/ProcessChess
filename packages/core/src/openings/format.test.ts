import { describe, expect, it } from 'vitest';
import { formatLine } from './format';

describe('formatLine', () => {
  it('numbers moves compactly', () => {
    expect(formatLine(['e4', 'e5', 'Nf3'])).toBe('1.e4 e5 2.Nf3');
    expect(formatLine(['e4'])).toBe('1.e4');
    expect(formatLine([])).toBe('');
  });
});
