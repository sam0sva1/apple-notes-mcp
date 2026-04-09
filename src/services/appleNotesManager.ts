import { runAppleScript, escapeAppleScriptString } from '../utils/applescript.js';
import { markdownToHtml } from '../utils/markdown.js';

export class AppleNotesManager {
  private accountName: string | null = null;

  /**
   * Lazily detects the Notes account name.
   * Prefers "iCloud" if available, otherwise uses the first account.
   * Falls back to "iCloud" on error.
   *
   * Lazy initialization avoids launching Notes.app on server startup —
   * important when the MCP server is auto-started by Claude Desktop / VS Code.
   */
  private getAccountName(): string {
    if (this.accountName !== null) {
      return this.accountName;
    }

    const result = runAppleScript(
      'tell application "Notes" to get name of every account'
    );

    if (result.success && result.output) {
      const accounts = result.output.split(', ').map(a => a.trim());
      this.accountName = accounts.includes('iCloud') ? 'iCloud' : accounts[0];
    } else {
      console.error('Failed to detect Notes account, falling back to "iCloud":', result.error);
      this.accountName = 'iCloud';
    }

    return this.accountName;
  }

  /**
   * Creates a new note in Apple Notes.
   * Returns true on success, false on failure.
   */
  createNote(title: string, content: string, tags: string[] = [], folder?: string): boolean {
    const escapedTitle = escapeAppleScriptString(title);
    const htmlContent = markdownToHtml(content);
    const escapedContent = escapeAppleScriptString(htmlContent);
    const escapedAccount = escapeAppleScriptString(this.getAccountName());

    let script: string;

    if (folder) {
      const escapedFolder = escapeAppleScriptString(folder);
      script = `
        tell application "Notes"
          tell account "${escapedAccount}"
            tell folder "${escapedFolder}"
              make new note with properties {name:"${escapedTitle}", body:"${escapedContent}"}
            end tell
          end tell
        end tell
      `;
    } else {
      script = `
        tell application "Notes"
          tell account "${escapedAccount}"
            make new note with properties {name:"${escapedTitle}", body:"${escapedContent}"}
          end tell
        end tell
      `;
    }

    const result = runAppleScript(script);
    if (!result.success) {
      console.error('Failed to create note:', result.error);
      return false;
    }

    return true;
  }

  /**
   * Searches for notes by title.
   * Returns an array of matching note titles.
   */
  searchNotes(query: string): string[] {
    const escapedQuery = escapeAppleScriptString(query);
    const escapedAccount = escapeAppleScriptString(this.getAccountName());

    const script = `
      tell application "Notes"
        tell account "${escapedAccount}"
          get name of notes where name contains "${escapedQuery}"
        end tell
      end tell
    `;

    const result = runAppleScript(script);
    if (!result.success) {
      console.error('Failed to search notes:', result.error);
      return [];
    }

    if (!result.output) {
      return [];
    }

    return result.output.split(', ').map(title => title.trim()).filter(Boolean);
  }

  /**
   * Retrieves the content of a specific note.
   * Returns the note body or empty string if not found.
   */
  getNoteContent(title: string): string {
    const escapedTitle = escapeAppleScriptString(title);
    const escapedAccount = escapeAppleScriptString(this.getAccountName());

    const script = `
      tell application "Notes"
        tell account "${escapedAccount}"
          get body of note "${escapedTitle}"
        end tell
      end tell
    `;

    const result = runAppleScript(script);
    if (!result.success) {
      console.error('Failed to get note content:', result.error);
      return '';
    }

    return result.output;
  }
}
