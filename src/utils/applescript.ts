import { execFileSync } from 'child_process';
import type { AppleScriptResult } from '../types.js';

/**
 * Escapes a string for safe embedding inside AppleScript double-quoted strings.
 * Handles all five AppleScript escape sequences.
 */
export function escapeAppleScriptString(str: string): string {
  return str
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t');
}

/**
 * Delimiter used in AppleScript `text item delimiters` to safely split lists.
 * Avoids the default comma separator which breaks on titles containing commas.
 */
export const APPLESCRIPT_LIST_DELIMITER = '|||';

/**
 * Parses a delimited list returned by AppleScript using our custom delimiter.
 */
export function parseAppleScriptList(output: string): string[] {
  if (!output) return [];
  return output
    .split(APPLESCRIPT_LIST_DELIMITER)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Executes an AppleScript and returns the result.
 * Uses execFileSync to bypass the shell entirely (no shell injection possible).
 * Each script line is passed as a separate -e argument to osascript.
 */
export function runAppleScript(script: string): AppleScriptResult {
  try {
    const lines = script
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    const args = lines.flatMap((line) => ['-e', line]);

    const output = execFileSync('osascript', args, {
      encoding: 'utf8',
      timeout: 10000,
    });

    return {
      success: true,
      output: output.trim(),
    };
  } catch (error) {
    console.error('AppleScript execution failed:', error);

    return {
      success: false,
      output: '',
      error:
        error instanceof Error
          ? error.message
          : 'Unknown error occurred while executing AppleScript',
    };
  }
}
