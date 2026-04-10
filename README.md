# Apple Notes MCP Server

An MCP (Model Context Protocol) server that provides full CRUD access to Apple Notes. Create, read, update, delete, search, and organize notes through a secure interface.

## Prerequisites

- macOS with Apple Notes app configured
- Node.js 20+

## Installation

```bash
git clone https://github.com/sam0sva1/apple-notes-mcp.git
cd apple-notes-mcp
npm install
npm run build
```

## Configuration

### Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "apple-notes": {
      "command": "node",
      "args": ["/absolute/path/to/apple-notes-mcp/build/index.js"]
    }
  }
}
```

### Claude Code

```bash
claude mcp add apple-notes -- node /absolute/path/to/apple-notes-mcp/build/index.js
```

## Operating modes

The server operates in three modes depending on access level:

| Feature | Basic | Full (FDA) | Indexed (FDA + index) |
|---------|-------|------------|----------------------|
| List notes | Titles only | With metadata | With metadata |
| Search notes | Title only | Title + preview (255 chars) | Full-text content |
| Date filters | No | Yes | Yes |
| Create / update / delete / move | Yes | Yes | Yes |
| Folder operations | Yes | Yes | Yes |

### Enabling full mode

Grant **Full Disk Access** to the application that runs the MCP server:

1. Open **System Settings** > **Privacy & Security** > **Full Disk Access**
2. Add your terminal app (Terminal.app, iTerm, Warp, etc.) or the specific application that launches the server (e.g. Claude Desktop)
3. Restart the MCP server

Full Disk Access allows the server to read (never write) the Apple Notes SQLite database at `~/Library/Group Containers/group.com.apple.notes/NoteStore.sqlite`.

**Important:** Granting Full Disk Access to your terminal does not change how Claude Code operates — Claude Code still asks for permission before every action (file edits, shell commands, etc.) unless you have explicitly disabled that.

### Enabling indexed mode

After enabling full mode, run `index-notes` to build the full-text search index:

1. Make sure Notes.app has finished syncing (open it and wait a moment if you recently edited notes on another device)
2. Use the `index-notes` tool — first run indexes all notes, subsequent runs only update changed notes
3. Use `index-status` to check index size and last sync time
4. Use `index-delete` to remove the index if no longer needed

The index is stored at `~/.apple-notes-mcp/index.sqlite`. Password-protected notes are skipped during indexing.

## Tools

### Read operations

#### list-accounts
List all Notes accounts available on this Mac (iCloud, On My Mac, etc.).

#### list-folders
List all folders in a Notes account.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `account` | string | no | Account name (default: iCloud) |

#### list-notes
List all notes, optionally filtered by folder. Results are paginated (default 50 per page).

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `folder` | string | no | Filter notes by folder name |
| `account` | string | no | Account name (default: iCloud) |
| `limit` | number | no | Max notes to return (default 50) |
| `offset` | number | no | Skip this many notes (for pagination) |

#### search-notes
Search for notes by title (substring match).

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `query` | string | yes | Search query to match against note titles |
| `account` | string | no | Account name (default: iCloud) |

#### get-note-content
Get the full content of a specific note.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `title` | string | yes | The exact title of the note |
| `folder` | string | no | Folder to look in (helps disambiguate duplicate titles) |
| `account` | string | no | Account name (default: iCloud) |

### Write operations

#### create-note
Create a new note. A short unique key (e.g. `k7x2m`) is automatically appended to the title for easy lookup later. Content supports markdown.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `title` | string | yes | The title of the note |
| `content` | string | yes | The content (markdown supported) |
| `folder` | string | no | Folder to save the note to |
| `account` | string | no | Account name (default: iCloud) |
| `noKey` | boolean | no | If true, do not append a lookup key to the title |

#### update-note
Update the body content of an existing note. Note titles cannot be changed (Apple Notes limitation).

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `title` | string | yes | The exact title of the note to update |
| `content` | string | yes | The new content (markdown supported, replaces entire body) |
| `folder` | string | no | Folder to look in (helps disambiguate duplicate titles) |
| `account` | string | no | Account name (default: iCloud) |

#### delete-note
Delete a note from Apple Notes.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `title` | string | yes | The exact title of the note to delete |
| `folder` | string | no | Folder to look in (helps disambiguate duplicate titles) |
| `account` | string | no | Account name (default: iCloud) |

#### move-note
Move a note to a different folder.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `title` | string | yes | The exact title of the note to move |
| `targetFolder` | string | yes | The destination folder name |
| `sourceFolder` | string | no | The current folder (helps disambiguate duplicate titles) |
| `account` | string | no | Account name (default: iCloud) |

#### create-folder
Create a new folder in Apple Notes.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `name` | string | yes | The name for the new folder |
| `account` | string | no | Account name (default: iCloud) |

### Index management

#### index-notes
Build or update the full-text search index. First run indexes all notes, subsequent runs only update changed notes. Password-protected notes are skipped. Requires Full Disk Access.

#### index-status
Show index info: path, size, note count, last sync time.

#### index-delete
Delete the full-text search index completely.

### Utility

#### generate-key
Generate a short unique key for note identification. Use this for existing notes — manually append the key to the note title in Apple Notes, then find the note instantly via `search-notes`.

## Note keys

Every note created with `create-note` automatically gets a short key (5 lowercase alphanumeric characters, e.g. `k7x2m`) appended to the title. This allows instant, unambiguous lookup via `search-notes` — just search for the key.

For existing notes, use `generate-key` to get a key, then manually add it to the note title in Apple Notes.

Keys are designed for easy voice input: only lowercase letters and digits, no special characters, no case sensitivity.

## Sync delay

Apple Notes uses an internal database (NoteStore.sqlite) that updates asynchronously. When you create or modify a note through this server (via AppleScript), the change is immediately visible to AppleScript but may take seconds to minutes to appear in the SQLite database.

**What this means in practice:**

- **Search always works** — `search-notes` always queries AppleScript for title matches (live data), so newly created notes and keys are found immediately
- **FTS content search may lag** — full-text search uses the FTS index, which reflects the SQLite database state. Run `index-notes` to update it after making changes
- **Metadata may be delayed** — `list-notes` in full mode reads from SQLite, so new notes may briefly appear without metadata

The same applies in reverse: if you delete a note in the app, the FTS index may still show it until you run `index-notes`. Attempting to read a deleted note via `get-note-content` will return an error, which is expected.

Additionally, notes created or renamed via AppleScript may have a null title in the SQLite database (the `ZTITLE2` field). Apple Notes stores the display title in the first line of the note's HTML body and caches it in `ZTITLE2` — but this cache is not always updated for notes modified through automation. This is why `search-notes` always uses AppleScript for title matching: it reads the live display title, not the cached database field.

If you edited notes on another device, open Notes.app and wait for iCloud sync to complete before running `index-notes`.

## Limitations

Apple Notes exposes a minimal AppleScript API compared to apps like Mail or Calendar. The following limitations are inherent to Apple's automation interface — not design choices of this server.

### What this server cannot do

These features are frequently requested in the community ([Siddhant-K-code/mcp-apple-notes](https://github.com/Siddhant-K-code/mcp-apple-notes/pulls), [RafalWilinski/mcp-apple-notes](https://github.com/RafalWilinski/mcp-apple-notes/issues)) but are not possible through the AppleScript Notes API:

- **Full-text search by note content** — in basic mode, search only matches titles. In full mode, also matches first ~255 characters. In indexed mode, full-text search across entire content is available via the FTS index
- **Rename notes** — the `name` property is read-only in the AppleScript dictionary. The only workaround is to create a new note and delete the old one, which loses metadata
- **Unique note IDs** — AppleScript identifies notes by title, not by a stable ID. In full mode, internal UUIDs are available for disambiguation. The note key system provides human-friendly identification
- **Add or modify attachments** — attachments can be read and deleted, but there is no AppleScript command to add files or images to a note
- **Manage tags** — hashtag-style tags (#tag) appear as plain text in the note body. There is no dedicated AppleScript API for creating, querying, or filtering by tags
- **Access password-protected notes** — locked notes cannot be read or modified via AppleScript. Only already-unlocked notes are accessible
- **Work with drawings and tables** — these rich content types are stored in a format that AppleScript cannot read or manipulate
- **Rich text formatting control** — while the `body` property accepts HTML, fine-grained control over fonts, colors, and styles is not reliably preserved

## How it works

The server communicates with Apple Notes via AppleScript (`osascript`) for write operations and directly reads the Apple Notes SQLite database for enhanced read operations (when Full Disk Access is granted).

On the first tool call, it auto-detects the Notes account (preferring iCloud, falling back to the first available account). Notes.app will launch automatically when a write tool is first used, not when the server starts.

## Security

- **No shell injection**: uses `execFileSync` instead of `execSync` — arguments are passed directly to `osascript` without a shell
- **AppleScript injection prevention**: all user inputs are escaped via `escapeAppleScriptString()` (handles `\`, `"`, `\n`, `\r`, `\t`)
- **Consistent sanitization**: every interpolated value goes through the same escaping function
- **No stdout pollution**: all logging goes to stderr, keeping the JSON-RPC channel clean

## License

MIT — see [LICENSE](LICENSE).

## Attribution

Based on [mcp-apple-notes](https://github.com/Siddhant-K-code/mcp-apple-notes) by Siddhant-K-code, with ideas from community PRs by pmdusso and jbkjr.
