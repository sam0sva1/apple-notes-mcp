import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('child_process', () => ({
  execFileSync: vi.fn(),
}));

describe('NotesDatabase', () => {
  let mockExecFileSync: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    const cp = await import('child_process');
    mockExecFileSync = cp.execFileSync as ReturnType<typeof vi.fn>;
    mockExecFileSync.mockReset();
  });

  describe('availability', () => {
    it('sets available=true when test query succeeds', async () => {
      mockExecFileSync.mockReturnValueOnce('[{"1":1}]');
      const { NotesDatabase } = await import('./notesDatabase.js');
      const db = new NotesDatabase();
      expect(db.available).toBe(true);
    });

    it('sets available=false when test query fails', async () => {
      mockExecFileSync.mockImplementationOnce(() => {
        throw new Error('Operation not permitted');
      });
      const { NotesDatabase } = await import('./notesDatabase.js');
      const db = new NotesDatabase();
      expect(db.available).toBe(false);
    });
  });

  describe('listNotes', () => {
    it('returns parsed NoteInfo array', async () => {
      // Constructor test query
      mockExecFileSync.mockReturnValueOnce('[{"1":1}]');
      const { NotesDatabase } = await import('./notesDatabase.js');
      const db = new NotesDatabase();

      const jsonOutput = JSON.stringify([
        {
          uuid: 'ABC-123',
          title: 'Test Note',
          snippet: 'Some content',
          folder: 'Notes',
          createdAt: '2024-01-15 10:00:00',
          modifiedAt: '2024-01-16 12:00:00',
        },
      ]);
      mockExecFileSync.mockReturnValueOnce(jsonOutput);

      const notes = db.listNotes();
      expect(notes).toHaveLength(1);
      expect(notes[0].uuid).toBe('ABC-123');
      expect(notes[0].title).toBe('Test Note');
      expect(notes[0].folder).toBe('Notes');
    });

    it('filters by folder', async () => {
      mockExecFileSync.mockReturnValueOnce('[{"1":1}]');
      const { NotesDatabase } = await import('./notesDatabase.js');
      const db = new NotesDatabase();

      mockExecFileSync.mockReturnValueOnce('[]');
      db.listNotes({ folder: 'Work' });

      const sql = mockExecFileSync.mock.calls[1][1][2];
      expect(sql).toContain("f.ZTITLE2 = 'Work'");
    });

    it('filters by date', async () => {
      mockExecFileSync.mockReturnValueOnce('[{"1":1}]');
      const { NotesDatabase } = await import('./notesDatabase.js');
      const db = new NotesDatabase();

      mockExecFileSync.mockReturnValueOnce('[]');
      db.listNotes({ modifiedAfter: '2024-01-01' });

      const sql = mockExecFileSync.mock.calls[1][1][2];
      expect(sql).toContain(">= '2024-01-01'");
    });

    it('returns empty array for empty output', async () => {
      mockExecFileSync.mockReturnValueOnce('[{"1":1}]');
      const { NotesDatabase } = await import('./notesDatabase.js');
      const db = new NotesDatabase();

      mockExecFileSync.mockReturnValueOnce('');
      expect(db.listNotes()).toEqual([]);
    });
  });

  describe('searchNotes', () => {
    it('searches title and snippet', async () => {
      mockExecFileSync.mockReturnValueOnce('[{"1":1}]');
      const { NotesDatabase } = await import('./notesDatabase.js');
      const db = new NotesDatabase();

      mockExecFileSync.mockReturnValueOnce('[]');
      db.searchNotes('meeting');

      const sql = mockExecFileSync.mock.calls[1][1][2];
      expect(sql).toContain("LIKE '%meeting%'");
      expect(sql).toContain('ZTITLE2');
      expect(sql).toContain('ZSNIPPET');
    });

    it('escapes single quotes in query', async () => {
      mockExecFileSync.mockReturnValueOnce('[{"1":1}]');
      const { NotesDatabase } = await import('./notesDatabase.js');
      const db = new NotesDatabase();

      mockExecFileSync.mockReturnValueOnce('[]');
      db.searchNotes("it's");

      const sql = mockExecFileSync.mock.calls[1][1][2];
      expect(sql).toContain("it''s");
    });
  });

  describe('listFolders', () => {
    it('returns folder names', async () => {
      mockExecFileSync.mockReturnValueOnce('[{"1":1}]');
      const { NotesDatabase } = await import('./notesDatabase.js');
      const db = new NotesDatabase();

      mockExecFileSync.mockReturnValueOnce(
        JSON.stringify([{ name: 'Notes' }, { name: 'Work' }, { name: 'Personal' }]),
      );

      const folders = db.listFolders();
      expect(folders).toEqual(['Notes', 'Work', 'Personal']);
    });
  });
});
