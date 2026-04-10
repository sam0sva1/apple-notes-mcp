import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { z } from 'zod';
import { AppleNotesManager } from './services/appleNotesManager.js';
import { NotesDatabase } from './services/notesDatabase.js';
import { NotesIndex } from './services/notesIndex.js';
import { generateNoteKey } from './utils/noteKey.js';
import type { NoteInfo } from './types.js';

const server = new McpServer(
  {
    name: 'apple-notes',
    version: '0.5.0',
    description: 'MCP server for interacting with Apple Notes',
  },
  {
    instructions:
      'Apple Notes MCP server with full CRUD access.\n\n' +
      'IMPORTANT: Titles returned by search-notes and list-notes are exact strings including any emoji. ' +
      'Always copy the title exactly as shown (inside quotes) when passing to other tools.\n\n' +
      'Workflow:\n' +
      '1. list-accounts — see available accounts (iCloud, etc.)\n' +
      '2. list-folders — see folders in an account\n' +
      '3. list-notes — browse notes (paginated, default 50). Use offset for next page\n' +
      '4. search-notes — find notes by title or content\n' +
      '5. get-note-content — read full note body (returns HTML)\n' +
      '6. create-note — create note (lookup key appended automatically for easy retrieval)\n' +
      '7. update-note — replace note body. rename-note — change title (preserves key)\n' +
      '8. delete-note, move-note, create-folder — manage notes\n\n' +
      'Full-text search: run index-notes once to build the FTS index. ' +
      'After that, search-notes also searches note content, not just titles. ' +
      'Run index-notes again after making changes to update the index.\n\n' +
      'Note keys: each created note gets a 5-char key (e.g. k7x2m) in the title. ' +
      'Search by key for instant lookup. generate-key creates keys for existing notes.\n\n' +
      'If something is unclear, call get-help for full documentation.',
  },
);

const notesManager = new AppleNotesManager();
const notesDb = new NotesDatabase();
const notesIndex = new NotesIndex(notesDb);

if (notesDb.available) {
  console.error(
    `Full Disk Access available. FTS index: ${notesIndex.available ? 'ready' : 'not built (run index-notes)'}`,
  );
} else {
  console.error('Basic mode — no Full Disk Access');
}

// --- Helpers ---

function formatNoteInfo(note: NoteInfo): string {
  const title = note.title || '(untitled)';
  const parts = [`title: "${title}"`];
  if (note.folder) parts.push(`folder: ${note.folder}`);
  if (note.account) parts.push(`account: ${note.account}`);
  if (note.uuid) parts.push(`uuid: ${note.uuid}`);
  if (note.modifiedAt) parts.push(`modified: ${note.modifiedAt}`);
  const header = `- ${parts.join(' | ')}`;
  const preview = note.snippet ? `\n  Preview: ${note.snippet.substring(0, 100)}` : '';
  return header + preview;
}

function formatNoteInfoList(notes: NoteInfo[], context: string): string {
  if (!notes.length) return `No notes found${context}.`;
  return `Found ${notes.length} notes${context}:\n${notes.map(formatNoteInfo).join('\n')}`;
}

const accountParam = z
  .string()
  .optional()
  .describe('Account name (use list-accounts to see available). Defaults to iCloud');

// --- Read tools ---

server.tool(
  'list-accounts',
  'List all Notes accounts available on this Mac',
  {},
  { readOnlyHint: true },
  async () => {
    try {
      const accounts = notesManager.listAccounts();
      const message = accounts.length
        ? `Accounts:\n${accounts.map((a) => `- ${a}`).join('\n')}`
        : 'No accounts found.';
      return { content: [{ type: 'text', text: message }] };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error listing accounts: ${error instanceof Error ? error.message : 'Unknown error'}`,
          },
        ],
        isError: true,
      };
    }
  },
);

server.tool(
  'list-folders',
  'List all folders in a Notes account',
  {
    account: accountParam,
  },
  { readOnlyHint: true },
  async ({ account }) => {
    try {
      const folders = notesDb.available ? notesDb.listFolders() : notesManager.listFolders(account);
      const message = folders.length
        ? `Folders:\n${folders.map((f) => `- ${f}`).join('\n')}`
        : 'No folders found.';
      return { content: [{ type: 'text', text: message }] };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error listing folders: ${error instanceof Error ? error.message : 'Unknown error'}`,
          },
        ],
        isError: true,
      };
    }
  },
);

server.tool(
  'list-notes',
  'List all notes, optionally filtered by folder. With Full Disk Access: includes metadata and supports date filters',
  {
    folder: z.string().optional().describe('Filter notes by folder name'),
    account: accountParam,
    limit: z.number().optional().describe('Max notes to return (default 50)'),
    offset: z.number().optional().describe('Skip this many notes (for pagination)'),
    createdAfter: z
      .string()
      .optional()
      .describe('Filter notes created after this date (YYYY-MM-DD, requires Full Disk Access)'),
    modifiedAfter: z
      .string()
      .optional()
      .describe('Filter notes modified after this date (YYYY-MM-DD, requires Full Disk Access)'),
  },
  { readOnlyHint: true },
  async ({ folder, account, limit, offset, createdAfter, modifiedAfter }) => {
    try {
      const effectiveLimit = limit ?? 50;
      const effectiveOffset = offset ?? 0;
      const context = folder ? ` in folder "${folder}"` : '';
      const paginationInfo =
        effectiveOffset > 0 || limit !== undefined
          ? ` (showing ${effectiveOffset + 1}-${effectiveOffset + effectiveLimit})`
          : '';

      if (notesDb.available) {
        const notes = notesDb.listNotes({
          folder,
          createdAfter,
          modifiedAfter,
          limit: effectiveLimit,
          offset: effectiveOffset,
        });
        return {
          content: [{ type: 'text', text: formatNoteInfoList(notes, context + paginationInfo) }],
        };
      }

      if (createdAfter || modifiedAfter) {
        return {
          content: [
            {
              type: 'text',
              text: 'Date filters require Full Disk Access. Grant it in System Settings > Privacy & Security > Full Disk Access.',
            },
          ],
          isError: true,
        };
      }

      const allTitles = notesManager.listNotes(folder, account);
      const titles = allTitles.slice(effectiveOffset, effectiveOffset + effectiveLimit);
      const message = titles.length
        ? `Found ${allTitles.length} notes${context}${paginationInfo}:\n${titles.map((t) => `- title: "${t}"`).join('\n')}`
        : `No notes found${context}.`;
      return { content: [{ type: 'text', text: message }] };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error listing notes: ${error instanceof Error ? error.message : 'Unknown error'}`,
          },
        ],
        isError: true,
      };
    }
  },
);

server.tool(
  'search-notes',
  'Search notes by title (always live from Notes.app) and optionally by content (with FTS index). Results are merged for completeness',
  {
    query: z.string().min(1).describe('The search query to match against notes'),
    account: accountParam,
  },
  { readOnlyHint: true },
  async ({ query, account }) => {
    try {
      // AppleScript title search — try first, but don't fail if unavailable
      let titleMatches: string[] = [];
      try {
        titleMatches = notesManager.searchNotes(query, account);
      } catch (asErr) {
        console.error('AppleScript search failed, using FTS/SQLite only:', asErr);
      }
      const titleSet = new Set(titleMatches);

      // FTS content search — adds body-only matches if index exists
      let contentMatches: NoteInfo[] = [];
      if (notesIndex.available) {
        contentMatches = notesIndex
          .search(query)
          .filter((n) => !titleSet.has(n.title))
          .filter((n) => !account || n.account === account);
      }

      // SQLite fallback — if no AppleScript and no FTS
      if (titleMatches.length === 0 && contentMatches.length === 0 && notesDb.available) {
        const sqlResults = notesDb.searchNotes(query);
        const filtered = account ? sqlResults.filter((n) => n.account === account) : sqlResults;
        if (filtered.length > 0) {
          return {
            content: [{ type: 'text', text: formatNoteInfoList(filtered, '') }],
          };
        }
      }

      // Format: title matches first (live), then content-only matches (from index)
      const parts: string[] = [];

      if (titleMatches.length > 0) {
        parts.push(
          `Title matches (${titleMatches.length}):\n${titleMatches.map((t) => `- title: "${t}"`).join('\n')}`,
        );
      }

      if (contentMatches.length > 0) {
        parts.push(
          `Content matches (${contentMatches.length}):\n${contentMatches.map(formatNoteInfo).join('\n')}`,
        );
      }

      if (parts.length === 0) {
        return {
          content: [{ type: 'text', text: 'No notes found matching your query.' }],
        };
      }

      return {
        content: [{ type: 'text', text: parts.join('\n\n') }],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error searching notes: ${error instanceof Error ? error.message : 'Unknown error'}`,
          },
        ],
        isError: true,
      };
    }
  },
);

server.tool(
  'get-note-content',
  'Get the full content of a specific note',
  {
    title: z.string().min(1).describe('The exact title of the note to retrieve'),
    folder: z
      .string()
      .optional()
      .describe('Folder to look in (helps disambiguate duplicate titles)'),
    account: accountParam,
  },
  { readOnlyHint: true },
  async ({ title, folder, account }) => {
    try {
      const content = notesManager.getNoteContent(title, folder, account);
      return {
        content: [{ type: 'text', text: content || 'Note has no content.' }],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error retrieving note: ${error instanceof Error ? error.message : 'Unknown error'}`,
          },
        ],
        isError: true,
      };
    }
  },
);

// --- Write tools ---

server.tool(
  'create-note',
  'Create a new note in Apple Notes. A short unique key is appended to the title for easy lookup later',
  {
    title: z.string().min(1).describe('The title of the note'),
    content: z.string().min(1).describe('The content of the note (markdown supported)'),
    folder: z.string().optional().describe('Folder to save the note to'),
    account: accountParam,
    noKey: z.boolean().optional().describe('If true, do not append a lookup key to the title'),
  },
  { destructiveHint: true },
  async ({ title, content, folder, account, noKey }) => {
    try {
      const key = noKey ? null : generateNoteKey();
      const fullTitle = key ? `${title} ${key}` : title;
      notesManager.createNote(fullTitle, content, folder, account);
      const keyInfo = key ? ` (key: ${key})` : '';
      return {
        content: [{ type: 'text', text: `Note created: "${fullTitle}"${keyInfo}` }],
      };
    } catch (error) {
      const hint = folder ? ` Folder "${folder}" may not exist.` : '';
      return {
        content: [
          {
            type: 'text',
            text: `Error creating note: ${error instanceof Error ? error.message : 'Unknown error'}.${hint}`,
          },
        ],
        isError: true,
      };
    }
  },
);

server.tool(
  'update-note',
  'Update the body content of an existing note. Note titles cannot be changed (Apple Notes limitation)',
  {
    title: z.string().min(1).describe('The exact title of the note to update'),
    content: z
      .string()
      .min(1)
      .describe('The new content (markdown supported, replaces entire body)'),
    folder: z
      .string()
      .optional()
      .describe('Folder to look in (helps disambiguate duplicate titles)'),
    account: accountParam,
  },
  { destructiveHint: true },
  async ({ title, content, folder, account }) => {
    try {
      notesManager.updateNote(title, content, folder, account);
      return {
        content: [{ type: 'text', text: `Note updated: "${title}"` }],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error updating note: ${error instanceof Error ? error.message : 'Unknown error'}`,
          },
        ],
        isError: true,
      };
    }
  },
);

server.tool(
  'delete-note',
  'Delete a note from Apple Notes',
  {
    title: z.string().min(1).describe('The exact title of the note to delete'),
    folder: z
      .string()
      .optional()
      .describe('Folder to look in (helps disambiguate duplicate titles)'),
    account: accountParam,
  },
  { destructiveHint: true },
  async ({ title, folder, account }) => {
    try {
      notesManager.deleteNote(title, folder, account);
      return {
        content: [{ type: 'text', text: `Note deleted: "${title}"` }],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error deleting note: ${error instanceof Error ? error.message : 'Unknown error'}`,
          },
        ],
        isError: true,
      };
    }
  },
);

server.tool(
  'move-note',
  'Move a note to a different folder',
  {
    title: z.string().min(1).describe('The exact title of the note to move'),
    targetFolder: z.string().min(1).describe('The destination folder name'),
    sourceFolder: z
      .string()
      .optional()
      .describe('The current folder (helps disambiguate duplicate titles)'),
    account: accountParam,
  },
  { destructiveHint: true },
  async ({ title, targetFolder, sourceFolder, account }) => {
    try {
      notesManager.moveNote(title, targetFolder, sourceFolder, account);
      return {
        content: [{ type: 'text', text: `Note "${title}" moved to folder "${targetFolder}"` }],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error moving note: ${error instanceof Error ? error.message : 'Unknown error'}`,
          },
        ],
        isError: true,
      };
    }
  },
);

server.tool(
  'rename-note',
  'Rename a note by changing its title. The note key is preserved by default. Works by replacing the first line of the note body',
  {
    title: z.string().min(1).describe('The current exact title of the note'),
    newTitle: z.string().min(1).describe('The new title for the note'),
    folder: z
      .string()
      .optional()
      .describe('Folder to look in (helps disambiguate duplicate titles)'),
    removeKey: z
      .boolean()
      .optional()
      .describe('If true, do not preserve the lookup key from the old title'),
    account: accountParam,
  },
  { destructiveHint: true },
  async ({ title, newTitle, folder, removeKey, account }) => {
    try {
      const fullNewTitle = notesManager.renameNote(title, newTitle, {
        folder,
        removeKey,
        account,
      });
      return {
        content: [
          {
            type: 'text',
            text: `Note renamed: "${title}" → "${fullNewTitle}"`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error renaming note: ${error instanceof Error ? error.message : 'Unknown error'}`,
          },
        ],
        isError: true,
      };
    }
  },
);

server.tool(
  'create-folder',
  'Create a new folder in Apple Notes',
  {
    name: z.string().min(1).describe('The name for the new folder'),
    account: accountParam,
  },
  { destructiveHint: true },
  async ({ name, account }) => {
    try {
      notesManager.createFolder(name, account);
      return {
        content: [{ type: 'text', text: `Folder created: "${name}"` }],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error creating folder: ${error instanceof Error ? error.message : 'Unknown error'}`,
          },
        ],
        isError: true,
      };
    }
  },
);

// --- Utility tools ---

server.tool(
  'generate-key',
  'Generate a short unique key for note identification. The user can manually append it to an existing note title for easy lookup later',
  {},
  { readOnlyHint: true },
  async () => {
    const key = generateNoteKey();
    return {
      content: [
        {
          type: 'text',
          text: `Generated key: ${key}\n\nAppend this to a note title to enable quick lookup via search.`,
        },
      ],
    };
  },
);

server.tool(
  'get-help',
  'Get full documentation for this Apple Notes MCP server — operating modes, tools, limitations, sync behavior',
  {},
  { readOnlyHint: true },
  async () => {
    try {
      const thisDir = dirname(fileURLToPath(import.meta.url));
      const readmePath = join(thisDir, '..', 'README.md');
      const readme = readFileSync(readmePath, 'utf8');
      return { content: [{ type: 'text', text: readme }] };
    } catch {
      return {
        content: [
          {
            type: 'text',
            text: 'README not found. Check that the server is installed correctly.',
          },
        ],
        isError: true,
      };
    }
  },
);

// --- Index management tools ---

server.tool(
  'index-notes',
  'Build or update the full-text search index. Requires Full Disk Access. First run indexes all notes, subsequent runs only update changed notes. Password-protected notes are skipped',
  {},
  { destructiveHint: true },
  async () => {
    try {
      const stats = notesIndex.buildIndex();
      return {
        content: [
          {
            type: 'text',
            text: `Index updated: ${stats.updated} notes indexed, ${stats.skipped} skipped, ${stats.total} total processed.`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error building index: ${error instanceof Error ? error.message : 'Unknown error'}`,
          },
        ],
        isError: true,
      };
    }
  },
);

server.tool(
  'index-status',
  'Show full-text search index info: path, size, note count, last sync time',
  {},
  { readOnlyHint: true },
  async () => {
    const status = notesIndex.getStatus();
    const sizeKb = Math.round(status.sizeBytes / 1024);
    const message =
      status.noteCount > 0
        ? `Index path: ${status.path}\nSize: ${sizeKb} KB\nNotes indexed: ${status.noteCount}\nLast sync: ${status.lastSync || 'never'}`
        : `Index not built. Run index-notes to create it.\nIndex path: ${status.path}`;
    return { content: [{ type: 'text', text: message }] };
  },
);

server.tool(
  'index-delete',
  'Delete the full-text search index completely',
  {},
  { destructiveHint: true },
  async () => {
    try {
      notesIndex.deleteIndex();
      return {
        content: [{ type: 'text', text: 'Index deleted.' }],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error deleting index: ${error instanceof Error ? error.message : 'Unknown error'}`,
          },
        ],
        isError: true,
      };
    }
  },
);

// --- Start ---

try {
  const transport = new StdioServerTransport();
  await server.connect(transport);
} catch (error) {
  console.error('Failed to start Apple Notes MCP server:', error);
  process.exit(1);
}
