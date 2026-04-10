import { execFileSync } from 'child_process';
import { existsSync, mkdirSync, unlinkSync, statSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import type { NoteInfo } from '../types.js';
import type { NotesDatabase } from './notesDatabase.js';
import { extractNoteText } from '../utils/protobuf.js';
import { redactSecrets, shouldIndex } from '../utils/contentFilter.js';

const INDEX_DIR = join(homedir(), '.apple-notes-mcp');
const INDEX_PATH = join(INDEX_DIR, 'index.sqlite');

const INIT_SQL = `
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);
CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts4(uuid, title, content, folder, account, createdAt, modifiedAt);
`;

/**
 * Escapes a string for FTS4 MATCH queries.
 * Wraps each word in double quotes for literal matching.
 */
function escapeFtsQuery(query: string): string {
  return query
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => `"${word.replace(/"/g, '""')}"`)
    .join(' ');
}

/**
 * Escapes a string for SQLite single-quoted string literals.
 */
function escapeSql(str: string): string {
  return str.replace(/'/g, "''");
}

export interface IndexStats {
  total: number;
  updated: number;
  skipped: number;
}

export interface IndexStatus {
  path: string;
  sizeBytes: number;
  noteCount: number;
  lastSync: string | null;
}

/**
 * Full-text search index for Apple Notes.
 * Stores extracted plaintext from protobuf ZDATA in an FTS4 SQLite database.
 * Requires NotesDatabase (Full Disk Access) to read source data.
 */
export class NotesIndex {
  private notesDb: NotesDatabase;

  get available(): boolean {
    return existsSync(INDEX_PATH);
  }

  get indexPath(): string {
    return INDEX_PATH;
  }

  constructor(notesDb: NotesDatabase) {
    this.notesDb = notesDb;
  }

  private execSql(sql: string): string {
    return execFileSync('sqlite3', [INDEX_PATH, sql], {
      encoding: 'utf8',
      timeout: 30000,
    }).trim();
  }

  private ensureDir(): void {
    if (!existsSync(INDEX_DIR)) {
      mkdirSync(INDEX_DIR, { recursive: true });
    }
  }

  private initTables(): void {
    this.ensureDir();
    this.execSql(INIT_SQL);
  }

  private getLastSync(): string | null {
    try {
      const result = this.execSql("SELECT value FROM meta WHERE key = 'lastSync';");
      return result || null;
    } catch {
      return null;
    }
  }

  /**
   * Builds or updates the FTS index in chunks.
   * First run: indexes all notes. Subsequent runs: only changed notes.
   * Skips password-protected notes (encrypted ZDATA).
   * lastSync is updated after each chunk, so interrupted runs resume from where they stopped.
   */
  buildIndex(chunkSize = 100): IndexStats {
    if (!this.notesDb.available) {
      throw new Error('Full Disk Access required to build the index');
    }

    this.initTables();

    const lastSync = this.getLastSync();
    let total = 0;
    let updated = 0;
    let skipped = 0;
    let offset = 0;

    // Process notes in chunks to avoid memory/buffer issues
    while (true) {
      const notes = this.notesDb.getNotesForIndexing(lastSync ?? undefined, chunkSize, offset);

      if (notes.length === 0) break;

      total += notes.length;

      for (const note of notes) {
        if (note.isPasswordProtected || !note.hexdata) {
          skipped++;
          continue;
        }

        try {
          const buffer = Buffer.from(note.hexdata, 'hex');
          const content = extractNoteText(buffer);

          if (content === null || !shouldIndex(content)) {
            skipped++;
            continue;
          }

          const safeContent = redactSecrets(content);

          // DELETE then INSERT (FTS4 doesn't support INSERT OR REPLACE by uuid)
          this.execSql(`DELETE FROM notes_fts WHERE uuid = '${escapeSql(note.uuid)}';`);
          this.execSql(
            `INSERT INTO notes_fts (uuid, title, content, folder, account, createdAt, modifiedAt) VALUES ('${escapeSql(note.uuid)}', '${escapeSql(note.title)}', '${escapeSql(safeContent)}', '${escapeSql(note.folder)}', '${escapeSql(note.account)}', '${escapeSql(note.createdAt)}', '${escapeSql(note.modifiedAt)}');`,
          );
          updated++;
        } catch (err) {
          console.error(`Failed to index note ${note.uuid}:`, err);
          skipped++;
        }
      }

      // Update lastSync after each chunk — interrupted runs resume from here
      const now = new Date().toISOString();
      this.execSql(`INSERT OR REPLACE INTO meta (key, value) VALUES ('lastSync', '${now}');`);

      offset += notes.length;
    }

    // Remove notes that no longer exist in NoteStore
    const liveUuids = new Set(this.notesDb.getAllNoteUuids());
    const indexedUuidsRaw = this.execSql('SELECT uuid FROM notes_fts;');
    const indexedUuids = indexedUuidsRaw ? indexedUuidsRaw.split('\n').filter(Boolean) : [];
    const toDelete = indexedUuids.filter((uuid) => !liveUuids.has(uuid));

    if (toDelete.length > 0) {
      const uuidList = toDelete.map((u) => `'${escapeSql(u)}'`).join(',');
      this.execSql(`DELETE FROM notes_fts WHERE uuid IN (${uuidList});`);
    }

    return { total, updated, skipped };
  }

  /**
   * Full-text search across indexed notes.
   * Uses FTS4 MATCH with fallback to LIKE on error.
   */
  search(query: string): NoteInfo[] {
    if (!this.available) return [];

    const ftsQuery = escapeFtsQuery(query);

    try {
      const sql = `SELECT uuid, title, substr(content, 1, 200) as snippet, folder, account, createdAt, modifiedAt FROM notes_fts WHERE notes_fts MATCH '${escapeSql(ftsQuery)}';`;
      const output = execFileSync('sqlite3', ['-json', INDEX_PATH, sql], {
        encoding: 'utf8',
        timeout: 10000,
      }).trim();

      if (!output) return [];
      return JSON.parse(output) as NoteInfo[];
    } catch {
      // Fallback to LIKE if MATCH fails
      try {
        const escaped = escapeSql(query);
        const sql = `SELECT uuid, title, substr(content, 1, 200) as snippet, folder, account, createdAt, modifiedAt FROM notes_fts WHERE content LIKE '%${escaped}%' OR title LIKE '%${escaped}%';`;
        const output = execFileSync('sqlite3', ['-json', INDEX_PATH, sql], {
          encoding: 'utf8',
          timeout: 10000,
        }).trim();

        if (!output) return [];
        return JSON.parse(output) as NoteInfo[];
      } catch {
        return [];
      }
    }
  }

  /**
   * Returns index status information.
   */
  getStatus(): IndexStatus {
    if (!this.available) {
      return { path: INDEX_PATH, sizeBytes: 0, noteCount: 0, lastSync: null };
    }

    let sizeBytes = 0;
    try {
      sizeBytes = statSync(INDEX_PATH).size;
    } catch {
      // ignore
    }

    let noteCount = 0;
    try {
      const result = this.execSql('SELECT COUNT(*) FROM notes_fts;');
      noteCount = parseInt(result, 10) || 0;
    } catch {
      // ignore
    }

    const lastSync = this.getLastSync();

    return { path: INDEX_PATH, sizeBytes, noteCount, lastSync };
  }

  /**
   * Deletes the FTS index file completely.
   */
  deleteIndex(): void {
    if (existsSync(INDEX_PATH)) {
      unlinkSync(INDEX_PATH);
    }
  }
}
