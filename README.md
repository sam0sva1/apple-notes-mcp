# Apple Notes MCP Server

An MCP (Model Context Protocol) server that provides full CRUD access to Apple Notes. Create, read, update, delete, search, and organize notes through a secure interface.

## Tools

### Read operations

#### list-folders
List all folders in the Notes account.

#### list-notes
List all notes, optionally filtered by folder.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `folder` | string | no | Filter notes by folder name |

#### search-notes
Search for notes by title (substring match).

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `query` | string | yes | Search query to match against note titles |

#### get-note-content
Get the full content of a specific note.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `title` | string | yes | The exact title of the note |
| `folder` | string | no | Folder to look in (helps disambiguate duplicate titles) |

### Write operations

#### create-note
Create a new note. Content supports markdown (converted to HTML for Apple Notes).

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `title` | string | yes | The title of the note |
| `content` | string | yes | The content (markdown supported) |
| `folder` | string | no | Folder to save the note to |

#### update-note
Update the body content of an existing note. Note titles cannot be changed (Apple Notes limitation).

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `title` | string | yes | The exact title of the note to update |
| `content` | string | yes | The new content (markdown supported, replaces entire body) |
| `folder` | string | no | Folder to look in (helps disambiguate duplicate titles) |

#### delete-note
Delete a note from Apple Notes.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `title` | string | yes | The exact title of the note to delete |
| `folder` | string | no | Folder to look in (helps disambiguate duplicate titles) |

#### move-note
Move a note to a different folder.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `title` | string | yes | The exact title of the note to move |
| `targetFolder` | string | yes | The destination folder name |
| `sourceFolder` | string | no | The current folder (helps disambiguate duplicate titles) |

#### create-folder
Create a new folder in Apple Notes.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `name` | string | yes | The name for the new folder |

## Limitations

- **Title-based identification**: Notes are identified by title, not by a unique ID. Duplicate titles are ambiguous — use the `folder` parameter to disambiguate
- **Titles are read-only**: Apple Notes does not allow renaming notes via AppleScript
- **No body search**: Search only matches against note titles, not content
- **No tag management**: Tags are not accessible via AppleScript
- **No attachments**: Cannot add or modify attachments

## Prerequisites

- macOS with Apple Notes app configured
- Node.js 20+

## Installation

```bash
git clone <your-repo-url>
cd mcp-apple-notes
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
      "args": ["/absolute/path/to/mcp-apple-notes/build/index.js"]
    }
  }
}
```

### Claude Code

```bash
claude mcp add apple-notes -- node /absolute/path/to/mcp-apple-notes/build/index.js
```

## How it works

The server communicates with Apple Notes via AppleScript (`osascript`). On the first tool call, it auto-detects the Notes account (preferring iCloud, falling back to the first available account).

Notes.app will launch automatically when a tool is first used, not when the server starts.

## Security

- **No shell injection**: uses `execFileSync` instead of `execSync` — arguments are passed directly to `osascript` without a shell
- **AppleScript injection prevention**: all user inputs are escaped via `escapeAppleScriptString()` (handles `\`, `"`, `\n`, `\r`, `\t`)
- **Consistent sanitization**: every interpolated value goes through the same escaping function
- **No stdout pollution**: all logging goes to stderr, keeping the JSON-RPC channel clean

## License

MIT — see [LICENSE](LICENSE).

## Attribution

Based on [mcp-apple-notes](https://github.com/Siddhant-K-code/mcp-apple-notes) by Siddhant-K-code, with ideas from community PRs by pmdusso and jbkjr.
