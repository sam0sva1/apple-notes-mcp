import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../utils/applescript.js', () => ({
  runAppleScript: vi.fn(),
  escapeAppleScriptString: vi.fn((s: string) => s),
  parseAppleScriptList: vi.fn((output: string) => {
    if (!output) return [];
    return output
      .split('|||')
      .map((s) => s.trim())
      .filter(Boolean);
  }),
  APPLESCRIPT_LIST_DELIMITER: '|||',
}));

vi.mock('../utils/markdown.js', () => ({
  markdownToHtml: vi.fn((s: string) => `<p>${s}</p>`),
}));

describe('AppleNotesManager', () => {
  let manager: InstanceType<typeof import('./appleNotesManager.js').AppleNotesManager>;
  let mockRunAppleScript: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    const applescriptMod = await import('../utils/applescript.js');
    mockRunAppleScript = applescriptMod.runAppleScript as ReturnType<typeof vi.fn>;
    mockRunAppleScript.mockReset();

    // First call is always getAccountName — return iCloud
    mockRunAppleScript.mockReturnValueOnce({ success: true, output: 'iCloud' });

    const { AppleNotesManager } = await import('./appleNotesManager.js');
    manager = new AppleNotesManager();
  });

  describe('listNotes', () => {
    it('returns note titles', () => {
      mockRunAppleScript.mockReturnValueOnce({
        success: true,
        output: 'Note 1|||Note 2|||Note 3',
      });

      const result = manager.listNotes();
      expect(result).toEqual(['Note 1', 'Note 2', 'Note 3']);
    });

    it('passes folder to AppleScript when specified', () => {
      mockRunAppleScript.mockReturnValueOnce({ success: true, output: 'Note 1' });

      manager.listNotes('Work');
      const script = mockRunAppleScript.mock.calls[1][0];
      expect(script).toContain('folder');
      expect(script).toContain('Work');
    });

    it('throws on failure', () => {
      mockRunAppleScript.mockReturnValueOnce({
        success: false,
        output: '',
        error: 'No notes',
      });

      expect(() => manager.listNotes()).toThrow('No notes');
    });
  });

  describe('listFolders', () => {
    it('returns folder names', () => {
      mockRunAppleScript.mockReturnValueOnce({
        success: true,
        output: 'Notes|||Work|||Personal',
      });

      const result = manager.listFolders();
      expect(result).toEqual(['Notes', 'Work', 'Personal']);
    });
  });

  describe('deleteNote', () => {
    it('calls delete without folder', () => {
      mockRunAppleScript.mockReturnValueOnce({ success: true, output: '' });

      manager.deleteNote('My Note');
      const script = mockRunAppleScript.mock.calls[1][0];
      expect(script).toContain('delete note');
      expect(script).toContain('My Note');
    });

    it('calls delete with folder', () => {
      mockRunAppleScript.mockReturnValueOnce({ success: true, output: '' });

      manager.deleteNote('My Note', 'Work');
      const script = mockRunAppleScript.mock.calls[1][0];
      expect(script).toContain('folder');
      expect(script).toContain('Work');
    });

    it('throws on failure', () => {
      mockRunAppleScript.mockReturnValueOnce({
        success: false,
        output: '',
        error: 'Note not found',
      });

      expect(() => manager.deleteNote('Missing')).toThrow('Note not found');
    });
  });

  describe('updateNote', () => {
    it('sets body of note', () => {
      mockRunAppleScript.mockReturnValueOnce({ success: true, output: '' });

      manager.updateNote('My Note', 'New content');
      const script = mockRunAppleScript.mock.calls[1][0];
      expect(script).toContain('set body of note');
      expect(script).toContain('My Note');
    });

    it('passes folder when specified', () => {
      mockRunAppleScript.mockReturnValueOnce({ success: true, output: '' });

      manager.updateNote('My Note', 'New content', 'Work');
      const script = mockRunAppleScript.mock.calls[1][0];
      expect(script).toContain('folder');
      expect(script).toContain('Work');
    });
  });

  describe('moveNote', () => {
    it('moves note to target folder', () => {
      mockRunAppleScript.mockReturnValueOnce({ success: true, output: '' });

      manager.moveNote('My Note', 'Archive');
      const script = mockRunAppleScript.mock.calls[1][0];
      expect(script).toContain('move note');
      expect(script).toContain('My Note');
      expect(script).toContain('Archive');
    });

    it('includes source folder when specified', () => {
      mockRunAppleScript.mockReturnValueOnce({ success: true, output: '' });

      manager.moveNote('My Note', 'Archive', 'Work');
      const script = mockRunAppleScript.mock.calls[1][0];
      expect(script).toContain('of folder');
      expect(script).toContain('Work');
      expect(script).toContain('to folder');
      expect(script).toContain('Archive');
    });
  });

  describe('createFolder', () => {
    it('creates folder with given name', () => {
      mockRunAppleScript.mockReturnValueOnce({ success: true, output: '' });

      manager.createFolder('New Folder');
      const script = mockRunAppleScript.mock.calls[1][0];
      expect(script).toContain('make new folder');
      expect(script).toContain('New Folder');
    });

    it('throws on failure', () => {
      mockRunAppleScript.mockReturnValueOnce({
        success: false,
        output: '',
        error: 'Folder exists',
      });

      expect(() => manager.createFolder('Existing')).toThrow('Folder exists');
    });
  });
});
