import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { AppleNotesManager } from './services/appleNotesManager.js';

const server = new McpServer(
  {
    name: 'apple-notes',
    version: '0.1.0',
    description: 'MCP server for interacting with Apple Notes',
  },
  {
    instructions:
      'This server provides tools to create, search, and read Apple Notes. ' +
      'Use search-notes to find notes by title, then get-note-content to read their full content. ' +
      'Use create-note to create new notes, optionally specifying a folder.',
  },
);

const notesManager = new AppleNotesManager();

// --- Tools ---

server.tool(
  'create-note',
  'Create a new note in Apple Notes',
  {
    title: z.string().min(1).describe('The title of the note'),
    content: z.string().min(1).describe('The content of the note'),
    folder: z.string().optional().describe('Folder name to save the note to'),
  },
  { destructiveHint: true },
  async ({ title, content, folder }) => {
    try {
      notesManager.createNote(title, content, folder);
      return {
        content: [{ type: 'text', text: `Note created: "${title}"` }],
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
  'search-notes',
  'Search for notes by title',
  {
    query: z.string().min(1).describe('The search query to match against note titles'),
  },
  { readOnlyHint: true },
  async ({ query }) => {
    try {
      const titles = notesManager.searchNotes(query);
      const message = titles.length
        ? `Found ${titles.length} notes:\n${titles.map((t) => `- ${t}`).join('\n')}`
        : 'No notes found matching your query.';

      return {
        content: [{ type: 'text', text: message }],
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
  },
  { readOnlyHint: true },
  async ({ title }) => {
    try {
      const content = notesManager.getNoteContent(title);
      return {
        content: [{ type: 'text', text: content || 'Note not found.' }],
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

// --- Start ---

try {
  const transport = new StdioServerTransport();
  await server.connect(transport);
} catch (error) {
  console.error('Failed to start Apple Notes MCP server:', error);
  process.exit(1);
}
