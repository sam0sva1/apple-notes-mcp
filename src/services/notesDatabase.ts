import { execFileSync } from 'child_process';
import { homedir } from 'os';
import { join } from 'path';
import type { NoteInfo } from '../types.js';

const DB_PATH = join(homedir(), 'Library/Group Containers/group.com.apple.notes/NoteStore.sqlite');

const APPLE_EPOCH_OFFSET = 978307200;

const BASE_NOTE_QUERY = `
SELECT
  n.ZIDENTIFIER AS uuid,
  COALESCE(n.ZTITLE2, '') AS title,
  COALESCE(n.ZSNIPPET, '') AS snippet,
  COALESCE(f.ZTITLE2, '') AS folder,
  COALESCE((SELECT ZNAME FROM ZICCLOUDSYNCINGOBJECT WHERE Z_ENT = 13 LIMIT 1), '') AS account,
  datetime(n.ZCREATIONDATE3 + ${APPLE_EPOCH_OFFSET}, 'unixepoch') AS createdAt,
  datetime(n.ZMODIFICATIONDATE1 + ${APPLE_EPOCH_OFFSET}, 'unixepoch') AS modifiedAt
FROM ZICCLOUDSYNCINGOBJECT n
LEFT JOIN ZICCLOUDSYNCINGOBJECT f ON n.ZFOLDER = f.Z_PK
WHERE n.Z_ENT = 11
  AND (n.ZMARKEDFORDELETION = 0 OR n.ZMARKEDFORDELETION IS NULL)
`.trim();

/**
 * Escapes a string for safe embedding in SQLite single-quoted strings.
 */
function escapeSqlString(str: string): string {
  return str.replace(/'/g, "''");
}

export interface ListNotesOptions {
  folder?: string;
  createdAfter?: string;
  modifiedAfter?: string;
}

/**
 * Read-only access to Apple Notes via the NoteStore.sqlite database.
 * Requires Full Disk Access for the running process.
 * Uses the macOS built-in sqlite3 CLI — no npm dependencies needed.
 */
export class NotesDatabase {
  readonly available: boolean;

  constructor() {
    try {
      this.query('SELECT 1');
      this.available = true;
    } catch {
      this.available = false;
    }
  }

  private query<T>(sql: string): T[] {
    const output = execFileSync('sqlite3', ['-json', DB_PATH, sql], {
      encoding: 'utf8',
      timeout: 30000,
    });

    const trimmed = output.trim();
    if (!trimmed) return [];

    return JSON.parse(trimmed) as T[];
  }

  listNotes(options?: ListNotesOptions): NoteInfo[] {
    const conditions: string[] = [];

    if (options?.folder) {
      conditions.push(`f.ZTITLE2 = '${escapeSqlString(options.folder)}'`);
    }
    if (options?.createdAfter) {
      conditions.push(
        `datetime(n.ZCREATIONDATE3 + ${APPLE_EPOCH_OFFSET}, 'unixepoch') >= '${escapeSqlString(options.createdAfter)}'`,
      );
    }
    if (options?.modifiedAfter) {
      conditions.push(
        `datetime(n.ZMODIFICATIONDATE1 + ${APPLE_EPOCH_OFFSET}, 'unixepoch') >= '${escapeSqlString(options.modifiedAfter)}'`,
      );
    }

    const where = conditions.length ? ` AND ${conditions.join(' AND ')}` : '';
    const sql = `${BASE_NOTE_QUERY}${where} ORDER BY n.ZMODIFICATIONDATE1 DESC`;

    return this.query<NoteInfo>(sql);
  }

  searchNotes(query: string): NoteInfo[] {
    const escaped = escapeSqlString(query);
    const sql = `${BASE_NOTE_QUERY}
      AND (COALESCE(n.ZTITLE2,'') LIKE '%${escaped}%' OR COALESCE(n.ZSNIPPET,'') LIKE '%${escaped}%')
      ORDER BY n.ZMODIFICATIONDATE1 DESC`;

    return this.query<NoteInfo>(sql);
  }

  listFolders(): string[] {
    const sql = `
      SELECT ZTITLE2 AS name
      FROM ZICCLOUDSYNCINGOBJECT
      WHERE Z_ENT = 14
        AND (ZMARKEDFORDELETION = 0 OR ZMARKEDFORDELETION IS NULL)
      ORDER BY ZTITLE2
    `;

    return this.query<{ name: string }>(sql).map((r) => r.name);
  }

  /**
   * Returns all note UUIDs from the NoteStore (for sync diffing).
   */
  getAllNoteUuids(): string[] {
    const sql = `
      SELECT ZIDENTIFIER AS uuid
      FROM ZICCLOUDSYNCINGOBJECT
      WHERE Z_ENT = 11
        AND (ZMARKEDFORDELETION = 0 OR ZMARKEDFORDELETION IS NULL)
    `;
    return this.query<{ uuid: string }>(sql).map((r) => r.uuid);
  }

  /**
   * Returns notes with their raw ZDATA hex for protobuf extraction.
   * If afterDate is provided, only returns notes modified after that date.
   */
  getNotesForIndexing(afterDate?: string): Array<{
    uuid: string;
    title: string;
    folder: string;
    account: string;
    createdAt: string;
    modifiedAt: string;
    hexdata: string;
    isPasswordProtected: number;
  }> {
    const dateFilter = afterDate
      ? `AND datetime(n.ZMODIFICATIONDATE1 + ${APPLE_EPOCH_OFFSET}, 'unixepoch') > '${escapeSqlString(afterDate)}'`
      : '';

    const sql = `
      SELECT
        n.ZIDENTIFIER AS uuid,
        COALESCE(n.ZTITLE2, '') AS title,
        COALESCE(f.ZTITLE2, '') AS folder,
        COALESCE((SELECT ZNAME FROM ZICCLOUDSYNCINGOBJECT WHERE Z_ENT = 13 LIMIT 1), '') AS account,
        datetime(n.ZCREATIONDATE3 + ${APPLE_EPOCH_OFFSET}, 'unixepoch') AS createdAt,
        datetime(n.ZMODIFICATIONDATE1 + ${APPLE_EPOCH_OFFSET}, 'unixepoch') AS modifiedAt,
        hex(d.ZDATA) AS hexdata,
        COALESCE(n.ZISPASSWORDPROTECTED, 0) AS isPasswordProtected
      FROM ZICCLOUDSYNCINGOBJECT n
      LEFT JOIN ZICCLOUDSYNCINGOBJECT f ON n.ZFOLDER = f.Z_PK
      LEFT JOIN ZICNOTEDATA d ON d.ZNOTE = n.Z_PK
      WHERE n.Z_ENT = 11
        AND (n.ZMARKEDFORDELETION = 0 OR n.ZMARKEDFORDELETION IS NULL)
        ${dateFilter}
    `;

    return this.query(sql);
  }
}
