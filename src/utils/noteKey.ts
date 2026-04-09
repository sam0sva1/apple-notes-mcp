import { randomBytes } from 'crypto';

const KEY_LENGTH = 5;
const CHARSET = 'abcdefghijklmnopqrstuvwxyz0123456789';

/**
 * Generates a short unique key for note identification.
 * Format: 5 lowercase alphanumeric characters (e.g. "k7x2m").
 * ~60M combinations (36^5) — sufficient for personal note collections.
 */
export function generateNoteKey(): string {
  const bytes = randomBytes(KEY_LENGTH);
  let key = '';
  for (let i = 0; i < KEY_LENGTH; i++) {
    key += CHARSET[bytes[i] % CHARSET.length];
  }
  return key;
}
