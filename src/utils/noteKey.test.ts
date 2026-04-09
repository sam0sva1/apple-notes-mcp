import { describe, it, expect } from 'vitest';
import { generateNoteKey } from './noteKey.js';

describe('generateNoteKey', () => {
  it('returns a 5-character string', () => {
    const key = generateNoteKey();
    expect(key).toHaveLength(5);
  });

  it('contains only lowercase letters and digits', () => {
    for (let i = 0; i < 100; i++) {
      const key = generateNoteKey();
      expect(key).toMatch(/^[a-z0-9]{5}$/);
    }
  });

  it('generates different keys on successive calls', () => {
    const keys = new Set(Array.from({ length: 50 }, () => generateNoteKey()));
    // With 36^5 = 60M combinations, 50 keys should all be unique
    expect(keys.size).toBe(50);
  });
});
