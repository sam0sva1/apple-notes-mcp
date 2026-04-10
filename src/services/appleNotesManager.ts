import {
  runAppleScript,
  escapeAppleScriptString,
  parseAppleScriptList,
  APPLESCRIPT_LIST_DELIMITER,
} from '../utils/applescript.js';
import { markdownToHtml } from '../utils/markdown.js';

export class AppleNotesManager {
  private defaultAccountName: string | null = null;

  private getDefaultAccountName(): string {
    if (this.defaultAccountName !== null) {
      return this.defaultAccountName;
    }

    const accounts = this.listAccounts();
    if (accounts.length > 0) {
      this.defaultAccountName = accounts.includes('iCloud') ? 'iCloud' : accounts[0];
    } else {
      console.error('Failed to detect Notes accounts, falling back to "iCloud"');
      this.defaultAccountName = 'iCloud';
    }

    return this.defaultAccountName;
  }

  private resolveAccount(account?: string): string {
    return account ?? this.getDefaultAccountName();
  }

  listAccounts(): string[] {
    const script = `
      set accountNames to name of every account of application "Notes"
      set AppleScript's text item delimiters to "${APPLESCRIPT_LIST_DELIMITER}"
      accountNames as text
    `;

    const result = runAppleScript(script);
    if (!result.success) {
      throw new Error(result.error || 'Failed to list accounts');
    }

    return parseAppleScriptList(result.output);
  }

  createNote(title: string, content: string, folder?: string, account?: string): void {
    const escapedTitle = escapeAppleScriptString(title);
    const htmlContent = markdownToHtml(content);
    const escapedContent = escapeAppleScriptString(htmlContent);
    const escapedAccount = escapeAppleScriptString(this.resolveAccount(account));

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

  searchNotes(query: string, account?: string): string[] {
    const escapedQuery = escapeAppleScriptString(query);
    const escapedAccount = escapeAppleScriptString(this.resolveAccount(account));

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

  getNoteContent(title: string, folder?: string, account?: string): string {
    const escapedTitle = escapeAppleScriptString(title);
    const escapedAccount = escapeAppleScriptString(this.resolveAccount(account));

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

  listNotes(folder?: string, account?: string): string[] {
    const escapedAccount = escapeAppleScriptString(this.resolveAccount(account));

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

  listFolders(account?: string): string[] {
    const escapedAccount = escapeAppleScriptString(this.resolveAccount(account));

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

  deleteNote(title: string, folder?: string, account?: string): void {
    const escapedTitle = escapeAppleScriptString(title);
    const escapedAccount = escapeAppleScriptString(this.resolveAccount(account));

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

  updateNote(title: string, content: string, folder?: string, account?: string): void {
    const escapedTitle = escapeAppleScriptString(title);
    const htmlContent = markdownToHtml(content);
    const escapedContent = escapeAppleScriptString(htmlContent);
    const escapedAccount = escapeAppleScriptString(this.resolveAccount(account));

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

  moveNote(title: string, targetFolder: string, sourceFolder?: string, account?: string): void {
    const escapedTitle = escapeAppleScriptString(title);
    const escapedTarget = escapeAppleScriptString(targetFolder);
    const escapedAccount = escapeAppleScriptString(this.resolveAccount(account));

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

  renameNote(
    currentTitle: string,
    newTitle: string,
    options?: { folder?: string; removeKey?: boolean; account?: string },
  ): string {
    const body = this.getNoteContent(currentTitle, options?.folder, options?.account);

    const keyMatch = currentTitle.match(/\s([a-z0-9]{5})$/);
    const key = keyMatch && !options?.removeKey ? keyMatch[1] : null;

    const fullNewTitle = key ? `${newTitle} ${key}` : newTitle;

    const newBody = body.replace(
      /^<div>.*?<\/div>/,
      `<div>${escapeAppleScriptString(fullNewTitle).replace(/\\"/g, '"')}</div>`,
    );

    const escapedCurrentTitle = escapeAppleScriptString(currentTitle);
    const escapedBody = escapeAppleScriptString(newBody);
    const escapedAccount = escapeAppleScriptString(this.resolveAccount(options?.account));

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

  createFolder(name: string, account?: string): void {
    const escapedName = escapeAppleScriptString(name);
    const escapedAccount = escapeAppleScriptString(this.resolveAccount(account));

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
