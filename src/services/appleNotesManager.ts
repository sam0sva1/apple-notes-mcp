import {
  runAppleScript,
  escapeAppleScriptString,
  parseAppleScriptList,
  APPLESCRIPT_LIST_DELIMITER,
} from '../utils/applescript.js';
import { markdownToHtml } from '../utils/markdown.js';

export class AppleNotesManager {
  private accountName: string | null = null;

  /**
   * Lazily detects the Notes account name.
   * Prefers "iCloud" if available, otherwise uses the first account.
   * Falls back to "iCloud" on error.
   */
  private getAccountName(): string {
    if (this.accountName !== null) {
      return this.accountName;
    }

    const script = `
      set accountNames to name of every account of application "Notes"
      set AppleScript's text item delimiters to "${APPLESCRIPT_LIST_DELIMITER}"
      accountNames as text
    `;

    const result = runAppleScript(script);

    if (result.success && result.output) {
      const accounts = parseAppleScriptList(result.output);
      this.accountName = accounts.includes('iCloud') ? 'iCloud' : accounts[0];
    } else {
      console.error('Failed to detect Notes account, falling back to "iCloud":', result.error);
      this.accountName = 'iCloud';
    }

    return this.accountName;
  }

  /**
   * Creates a new note in Apple Notes.
   * Throws on failure with a descriptive error message.
   */
  createNote(title: string, content: string, folder?: string): void {
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
      throw new Error(result.error || 'Failed to create note');
    }
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
          set noteNames to name of notes where name contains "${escapedQuery}"
        end tell
      end tell
      set AppleScript's text item delimiters to "${APPLESCRIPT_LIST_DELIMITER}"
      noteNames as text
    `;

    const result = runAppleScript(script);
    if (!result.success) {
      throw new Error(result.error || 'Failed to search notes');
    }

    return parseAppleScriptList(result.output);
  }

  /**
   * Retrieves the content of a specific note.
   * Returns the note body or empty string if not found.
   */
  getNoteContent(title: string, folder?: string): string {
    const escapedTitle = escapeAppleScriptString(title);
    const escapedAccount = escapeAppleScriptString(this.getAccountName());

    let script: string;

    if (folder) {
      const escapedFolder = escapeAppleScriptString(folder);
      script = `
        tell application "Notes"
          tell account "${escapedAccount}"
            tell folder "${escapedFolder}"
              get body of note "${escapedTitle}"
            end tell
          end tell
        end tell
      `;
    } else {
      script = `
        tell application "Notes"
          tell account "${escapedAccount}"
            get body of note "${escapedTitle}"
          end tell
        end tell
      `;
    }

    const result = runAppleScript(script);
    if (!result.success) {
      throw new Error(result.error || 'Failed to get note content');
    }

    return result.output;
  }

  /**
   * Lists all notes, optionally filtered by folder.
   * Returns an array of note titles.
   */
  listNotes(folder?: string): string[] {
    const escapedAccount = escapeAppleScriptString(this.getAccountName());

    let script: string;

    if (folder) {
      const escapedFolder = escapeAppleScriptString(folder);
      script = `
        tell application "Notes"
          tell account "${escapedAccount}"
            tell folder "${escapedFolder}"
              set noteNames to name of every note
            end tell
          end tell
        end tell
        set AppleScript's text item delimiters to "${APPLESCRIPT_LIST_DELIMITER}"
        noteNames as text
      `;
    } else {
      script = `
        tell application "Notes"
          tell account "${escapedAccount}"
            set noteNames to name of every note
          end tell
        end tell
        set AppleScript's text item delimiters to "${APPLESCRIPT_LIST_DELIMITER}"
        noteNames as text
      `;
    }

    const result = runAppleScript(script);
    if (!result.success) {
      throw new Error(result.error || 'Failed to list notes');
    }

    return parseAppleScriptList(result.output);
  }

  /**
   * Lists all folders in the account.
   * Returns an array of folder names.
   */
  listFolders(): string[] {
    const escapedAccount = escapeAppleScriptString(this.getAccountName());

    const script = `
      tell application "Notes"
        tell account "${escapedAccount}"
          set folderNames to name of every folder
        end tell
      end tell
      set AppleScript's text item delimiters to "${APPLESCRIPT_LIST_DELIMITER}"
      folderNames as text
    `;

    const result = runAppleScript(script);
    if (!result.success) {
      throw new Error(result.error || 'Failed to list folders');
    }

    return parseAppleScriptList(result.output);
  }

  /**
   * Deletes a note by title.
   * If folder is specified, deletes the note from that folder.
   * With duplicate titles, the first match is deleted.
   */
  deleteNote(title: string, folder?: string): void {
    const escapedTitle = escapeAppleScriptString(title);
    const escapedAccount = escapeAppleScriptString(this.getAccountName());

    let script: string;

    if (folder) {
      const escapedFolder = escapeAppleScriptString(folder);
      script = `
        tell application "Notes"
          tell account "${escapedAccount}"
            tell folder "${escapedFolder}"
              delete note "${escapedTitle}"
            end tell
          end tell
        end tell
      `;
    } else {
      script = `
        tell application "Notes"
          tell account "${escapedAccount}"
            delete note "${escapedTitle}"
          end tell
        end tell
      `;
    }

    const result = runAppleScript(script);
    if (!result.success) {
      throw new Error(result.error || 'Failed to delete note');
    }
  }

  /**
   * Updates the body content of an existing note.
   * Note titles cannot be changed (read-only in AppleScript).
   * Content is converted from markdown to HTML.
   */
  updateNote(title: string, content: string, folder?: string): void {
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
              set body of note "${escapedTitle}" to "${escapedContent}"
            end tell
          end tell
        end tell
      `;
    } else {
      script = `
        tell application "Notes"
          tell account "${escapedAccount}"
            set body of note "${escapedTitle}" to "${escapedContent}"
          end tell
        end tell
      `;
    }

    const result = runAppleScript(script);
    if (!result.success) {
      throw new Error(result.error || 'Failed to update note');
    }
  }

  /**
   * Moves a note to a different folder.
   * If sourceFolder is specified, the note is looked up in that folder.
   */
  moveNote(title: string, targetFolder: string, sourceFolder?: string): void {
    const escapedTitle = escapeAppleScriptString(title);
    const escapedTarget = escapeAppleScriptString(targetFolder);
    const escapedAccount = escapeAppleScriptString(this.getAccountName());

    let script: string;

    if (sourceFolder) {
      const escapedSource = escapeAppleScriptString(sourceFolder);
      script = `
        tell application "Notes"
          tell account "${escapedAccount}"
            move note "${escapedTitle}" of folder "${escapedSource}" to folder "${escapedTarget}"
          end tell
        end tell
      `;
    } else {
      script = `
        tell application "Notes"
          tell account "${escapedAccount}"
            move note "${escapedTitle}" to folder "${escapedTarget}"
          end tell
        end tell
      `;
    }

    const result = runAppleScript(script);
    if (!result.success) {
      throw new Error(result.error || 'Failed to move note');
    }
  }

  /**
   * Renames a note by replacing the first line of its HTML body.
   * Preserves the note key from the old title by default.
   * Apple Notes derives the display title from the first line of body.
   */
  renameNote(
    currentTitle: string,
    newTitle: string,
    options?: { folder?: string; removeKey?: boolean },
  ): string {
    // Get current body
    const body = this.getNoteContent(currentTitle, options?.folder);

    // Extract key from current title (last word if it matches [a-z0-9]{5})
    const keyMatch = currentTitle.match(/\s([a-z0-9]{5})$/);
    const key = keyMatch && !options?.removeKey ? keyMatch[1] : null;

    // Build new title with key
    const fullNewTitle = key ? `${newTitle} ${key}` : newTitle;

    // Replace first <div>...</div> in body with new title
    const newBody = body.replace(
      /^<div>.*?<\/div>/,
      `<div>${escapeAppleScriptString(fullNewTitle).replace(/\\"/g, '"')}</div>`,
    );

    // Update body via AppleScript
    const escapedCurrentTitle = escapeAppleScriptString(currentTitle);
    const escapedBody = escapeAppleScriptString(newBody);
    const escapedAccount = escapeAppleScriptString(this.getAccountName());

    let script: string;

    if (options?.folder) {
      const escapedFolder = escapeAppleScriptString(options.folder);
      script = `
        tell application "Notes"
          tell account "${escapedAccount}"
            tell folder "${escapedFolder}"
              set body of note "${escapedCurrentTitle}" to "${escapedBody}"
            end tell
          end tell
        end tell
      `;
    } else {
      script = `
        tell application "Notes"
          tell account "${escapedAccount}"
            set body of note "${escapedCurrentTitle}" to "${escapedBody}"
          end tell
        end tell
      `;
    }

    const result = runAppleScript(script);
    if (!result.success) {
      throw new Error(result.error || 'Failed to rename note');
    }

    return fullNewTitle;
  }

  /**
   * Creates a new folder in the account.
   */
  createFolder(name: string): void {
    const escapedName = escapeAppleScriptString(name);
    const escapedAccount = escapeAppleScriptString(this.getAccountName());

    const script = `
      tell application "Notes"
        tell account "${escapedAccount}"
          make new folder with properties {name:"${escapedName}"}
        end tell
      end tell
    `;

    const result = runAppleScript(script);
    if (!result.success) {
      throw new Error(result.error || 'Failed to create folder');
    }
  }
}
