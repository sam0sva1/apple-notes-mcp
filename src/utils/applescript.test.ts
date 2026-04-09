import { describe, it, expect, vi, beforeEach } from 'vitest';
import { escapeAppleScriptString, parseAppleScriptList } from './applescript.js';

describe('escapeAppleScriptString', () => {
  it('returns empty string unchanged', () => {
    expect(escapeAppleScriptString('')).toBe('');
  });

  it('returns plain text unchanged', () => {
    expect(escapeAppleScriptString('hello world')).toBe('hello world');
  });

  it('escapes backslashes first to prevent double escaping', () => {
    expect(escapeAppleScriptString('\\')).toBe('\\\\');
  });

  it('escapes double quotes', () => {
    expect(escapeAppleScriptString('say "hello"')).toBe('say \\"hello\\"');
  });

  it('escapes newlines', () => {
    expect(escapeAppleScriptString('line1\nline2')).toBe('line1\\nline2');
  });

  it('escapes carriage returns', () => {
    expect(escapeAppleScriptString('line1\rline2')).toBe('line1\\rline2');
  });

  it('escapes tabs', () => {
    expect(escapeAppleScriptString('col1\tcol2')).toBe('col1\\tcol2');
  });

  it('handles all special characters together', () => {
    const input = 'path\\to\t"file"\nend\r';
    const expected = 'path\\\\to\\t\\"file\\"\\nend\\r';
    expect(escapeAppleScriptString(input)).toBe(expected);
  });

  it('does not double-escape already escaped sequences', () => {
    // Input contains literal backslash + n (two chars), not a newline
    expect(escapeAppleScriptString('\\n')).toBe('\\\\n');
  });

  it('handles unicode characters without escaping', () => {
    expect(escapeAppleScriptString('привет 你好 🎉')).toBe('привет 你好 🎉');
  });
});

describe('parseAppleScriptList', () => {
  it('returns empty array for empty string', () => {
    expect(parseAppleScriptList('')).toEqual([]);
  });

  it('returns single item when no delimiter present', () => {
    expect(parseAppleScriptList('My Note')).toEqual(['My Note']);
  });

  it('splits on ||| delimiter', () => {
    expect(parseAppleScriptList('Note 1|||Note 2|||Note 3')).toEqual([
      'Note 1',
      'Note 2',
      'Note 3',
    ]);
  });

  it('trims whitespace from items', () => {
    expect(parseAppleScriptList(' Note 1 ||| Note 2 ')).toEqual(['Note 1', 'Note 2']);
  });

  it('handles titles containing commas (the bug we fixed)', () => {
    expect(parseAppleScriptList('Hello, world|||Another, note')).toEqual([
      'Hello, world',
      'Another, note',
    ]);
  });

  it('filters out empty items', () => {
    expect(parseAppleScriptList('|||Note|||')).toEqual(['Note']);
  });
});

// Mock child_process at module level for ESM compatibility
vi.mock('child_process', () => ({
  execFileSync: vi.fn(),
}));

describe('runAppleScript', () => {
  let mockExecFileSync: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    const cp = await import('child_process');
    mockExecFileSync = cp.execFileSync as ReturnType<typeof vi.fn>;
    mockExecFileSync.mockReset();
  });

  it('splits multi-line script into separate -e arguments', async () => {
    mockExecFileSync.mockReturnValue('ok');

    // Re-import to use the mocked version
    const { runAppleScript } = await import('./applescript.js');
    const result = runAppleScript('tell application "Notes"\n  get name\nend tell');

    expect(mockExecFileSync).toHaveBeenCalledWith(
      'osascript',
      ['-e', 'tell application "Notes"', '-e', 'get name', '-e', 'end tell'],
      expect.objectContaining({ encoding: 'utf8', timeout: 10000 }),
    );
    expect(result.success).toBe(true);
    expect(result.output).toBe('ok');
  });

  it('filters out empty lines', async () => {
    mockExecFileSync.mockReturnValue('ok');

    const { runAppleScript } = await import('./applescript.js');
    runAppleScript('\n  tell app "Notes"\n\n  end tell\n');

    expect(mockExecFileSync).toHaveBeenCalledWith(
      'osascript',
      ['-e', 'tell app "Notes"', '-e', 'end tell'],
      expect.anything(),
    );
  });

  it('returns error on failure', async () => {
    mockExecFileSync.mockImplementation(() => {
      throw new Error('script failed');
    });

    const { runAppleScript } = await import('./applescript.js');
    const result = runAppleScript('invalid script');

    expect(result.success).toBe(false);
    expect(result.error).toContain('script failed');
  });
});
