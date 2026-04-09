import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { AppleNotesManager } from './services/appleNotesManager.js';
import { NotesDatabase } from './services/notesDatabase.js';
import { generateNoteKey } from './utils/noteKey.js';
import type { NoteInfo } from './types.js';

const server = new McpServer(
  {
    name: 'apple-notes',
    version: '0.3.0',
    description: 'MCP server for interacting with Apple Notes',
  },
  {
    instructions:
      'This server provides full CRUD access to Apple Notes. ' +
      'It operates in two modes: full mode (with SQLite direct access for fast reads, metadata, and content search) ' +
      'and basic mode (AppleScript only, when Full Disk Access is not granted). ' +
      'Use list-folders to see available folders. ' +
      'Use list-notes to browse notes (optionally filter by folder or date in full mode). ' +
      'Use search-notes to find notes by title (and content preview in full mode). ' +
      'Use get-note-content to read full content. ' +
      'Use create-note to create new notes (a unique lookup key is appended to the title automatically). ' +
      'Use update-note to modify content, move-note to reorganize, and delete-note to remove notes. ' +
      'Use generate-key to create a key for an existing note (user adds it to the title manually). ' +
      'To find a note by key, use search-notes with the key as query. ' +
      'Note titles cannot be renamed (Apple Notes limitation). ' +
      'When multiple notes share the same title, specify a folder to disambiguate.',
  },
);

const notesManager = new AppleNotesManager();
const notesDb = new NotesDatabase();

if (notesDb.available) {
  console.error('SQLite access available — full mode enabled');
} else {
  console.error('SQLite access unavailable — basic mode (AppleScript only)');
}

// --- Helpers ---

function formatNoteInfo(note: NoteInfo): string {
  const title = note.title || '(untitled)';
  const meta = [note.folder, note.modifiedAt ? `modified ${note.modifiedAt}` : '']
    .filter(Boolean)
    .join(', ');
  const header = meta ? `- ${title} (${meta})` : `- ${title}`;
  const preview = note.snippet ? `\n  Preview: ${note.snippet.substring(0, 100)}` : '';
  return header + preview;
}

function formatNoteInfoList(notes: NoteInfo[], context: string): string {
  if (!notes.length) return `No notes found${context}.`;
  return `Found ${notes.length} notes${context}:\n${notes.map(formatNoteInfo).join('\n')}`;
}

// --- Read tools ---

server.tool(
  'list-folders',
  'List all folders in the Notes account',
  {},
  { readOnlyHint: true },
  async () => {
    try {
      const folders = notesDb.available ? notesDb.listFolders() : notesManager.listFolders();
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
  'List all notes, optionally filtered by folder. With Full Disk Access: includes metadata (dates, preview) and supports date filters',
  {
    folder: z.string().optional().describe('Filter notes by folder name'),
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
  async ({ folder, createdAfter, modifiedAfter }) => {
    try {
      const context = folder ? ` in folder "${folder}"` : '';

      if (notesDb.available) {
        const notes = notesDb.listNotes({ folder, createdAfter, modifiedAfter });
        return { content: [{ type: 'text', text: formatNoteInfoList(notes, context) }] };
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

      const titles = notesManager.listNotes(folder);
      const message = titles.length
        ? `Found ${titles.length} notes${context}:\n${titles.map((t) => `- ${t}`).join('\n')}`
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
  'Search for notes by title. With Full Disk Access, also searches note content previews',
  {
    query: z
      .string()
      .min(1)
      .describe('The search query to match against note titles (and content in full mode)'),
  },
  { readOnlyHint: true },
  async ({ query }) => {
    try {
      if (notesDb.available) {
        const notes = notesDb.searchNotes(query);
        return { content: [{ type: 'text', text: formatNoteInfoList(notes, '') }] };
      }

      const titles = notesManager.searchNotes(query);
      const message = titles.length
        ? `Found ${titles.length} notes:\n${titles.map((t) => `- ${t}`).join('\n')}`
        : 'No notes found matching your query.';
      return { content: [{ type: 'text', text: message }] };
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
  },
  { readOnlyHint: true },
  async ({ title, folder }) => {
    try {
      const content = notesManager.getNoteContent(title, folder);
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
    noKey: z.boolean().optional().describe('If true, do not append a lookup key to the title'),
  },
  { destructiveHint: true },
  async ({ title, content, folder, noKey }) => {
    try {
      const key = noKey ? null : generateNoteKey();
      const fullTitle = key ? `${title} ${key}` : title;
      notesManager.createNote(fullTitle, content, folder);
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
  },
  { destructiveHint: true },
  async ({ title, content, folder }) => {
    try {
      notesManager.updateNote(title, content, folder);
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
  },
  { destructiveHint: true },
  async ({ title, folder }) => {
    try {
      notesManager.deleteNote(title, folder);
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
  },
  { destructiveHint: true },
  async ({ title, targetFolder, sourceFolder }) => {
    try {
      notesManager.moveNote(title, targetFolder, sourceFolder);
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
  'create-folder',
  'Create a new folder in Apple Notes',
  {
    name: z.string().min(1).describe('The name for the new folder'),
  },
  { destructiveHint: true },
  async ({ name }) => {
    try {
      notesManager.createFolder(name);
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

// --- Start ---

try {
  const transport = new StdioServerTransport();
  await server.connect(transport);
} catch (error) {
  console.error('Failed to start Apple Notes MCP server:', error);
  process.exit(1);
}
