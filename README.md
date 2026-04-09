# Apple Notes MCP Server

An MCP (Model Context Protocol) server that lets AI assistants interact with Apple Notes. Create, search, and read notes through a secure, well-structured interface.

## Tools

### create-note

Create a new note in Apple Notes.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `title` | string | yes | The title of the note |
| `content` | string | yes | The content of the note |
| `tags` | string[] | no | Tags for the note |
| `folder` | string | no | Folder name to save the note to |

### search-notes

Search for notes by title.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `query` | string | yes | Search query to match against note titles |

### get-note-content

Get the full content of a specific note.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `title` | string | yes | The exact title of the note |

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

## Security improvements over the original

This project is based on [Siddhant-K-code/mcp-apple-notes](https://github.com/Siddhant-K-code/mcp-apple-notes). Key security improvements:

- **No shell injection**: uses `execFileSync` instead of `execSync` with string interpolation — arguments are passed directly to `osascript` without a shell
- **AppleScript injection prevention**: all user inputs are escaped via `escapeAppleScriptString()` before embedding in AppleScript commands (handles `\`, `"`, `\n`, `\r`, `\t`)
- **Consistent sanitization**: every interpolated value goes through the same escaping function, including auto-detected account names (defense in depth)
- **No stdout pollution**: all logging goes to stderr, keeping the JSON-RPC channel clean

## License

MIT — see [LICENSE](LICENSE).

## Attribution

Based on [mcp-apple-notes](https://github.com/Siddhant-K-code/mcp-apple-notes) by Siddhant-K-code, with ideas from community PRs by pmdusso and jbkjr.
