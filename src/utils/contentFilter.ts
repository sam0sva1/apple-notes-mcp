const SECRET_PATTERNS: Array<{ pattern: RegExp; replacement: string }> = [
  { pattern: /sk-[a-zA-Z0-9]{20,}/g, replacement: '[REDACTED]' },
  { pattern: /key-[a-zA-Z0-9]{20,}/g, replacement: '[REDACTED]' },
  { pattern: /Bearer [a-zA-Z0-9._-]+/g, replacement: 'Bearer [REDACTED]' },
  {
    pattern: /-----BEGIN [\w ]+ PRIVATE KEY-----[\s\S]*?-----END [\w ]+ PRIVATE KEY-----/g,
    replacement: '[REDACTED PRIVATE KEY]',
  },
  {
    pattern: /(?:token|secret|password|api[_-]?key|authorization)[=: ]+\S{10,}/gi,
    replacement: '[REDACTED]',
  },
];

/**
 * Redacts known secret patterns from text before indexing.
 * Only affects FTS index content — original notes are never modified.
 */
export function redactSecrets(text: string): string {
  let result = text;
  for (const { pattern, replacement } of SECRET_PATTERNS) {
    result = result.replace(pattern, replacement);
  }
  return result;
}

/**
 * Determines if note content is worth indexing for full-text search.
 * Filters out: too short, binary/base64 data, null bytes.
 */
export function shouldIndex(text: string): boolean {
  if (text.length < 50) return false;

  if (text.includes('\0')) return false;

  // Check for long runs without whitespace (likely base64/binary)
  const longestRun = text.split(/\s+/).reduce((max, word) => Math.max(max, word.length), 0);
  if (longestRun > 200) return false;

  return true;
}
