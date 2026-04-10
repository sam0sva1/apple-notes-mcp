import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('child_process', () => ({
  execFileSync: vi.fn(),
}));

vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs');
  return {
    ...actual,
    existsSync: vi.fn(),
    mkdirSync: vi.fn(),
    unlinkSync: vi.fn(),
    statSync: vi.fn(),
  };
});

vi.mock('../utils/protobuf.js', () => ({
  extractNoteText: vi.fn(),
}));

describe('NotesIndex', () => {
  let mockExecFileSync: ReturnType<typeof vi.fn>;
  let mockExistsSync: ReturnType<typeof vi.fn>;
  let mockStatSync: ReturnType<typeof vi.fn>;
  let mockUnlinkSync: ReturnType<typeof vi.fn>;
  let mockMkdirSync: ReturnType<typeof vi.fn>;
  let mockExtractNoteText: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    const cp = await import('child_process');
    mockExecFileSync = cp.execFileSync as ReturnType<typeof vi.fn>;
    mockExecFileSync.mockReset();

    const fs = await import('fs');
    mockExistsSync = fs.existsSync as ReturnType<typeof vi.fn>;
    mockExistsSync.mockReset();
    mockStatSync = fs.statSync as ReturnType<typeof vi.fn>;
    mockStatSync.mockReset();
    mockUnlinkSync = fs.unlinkSync as ReturnType<typeof vi.fn>;
    mockUnlinkSync.mockReset();
    mockMkdirSync = fs.mkdirSync as ReturnType<typeof vi.fn>;
    mockMkdirSync.mockReset();

    const proto = await import('../utils/protobuf.js');
    mockExtractNoteText = proto.extractNoteText as ReturnType<typeof vi.fn>;
    mockExtractNoteText.mockReset();
  });

  describe('available', () => {
    it('returns true when index file exists', async () => {
      mockExistsSync.mockReturnValue(true);
      const { NotesIndex } = await import('./notesIndex.js');
      const mockDb = { available: true } as never;
      const index = new NotesIndex(mockDb);
      expect(index.available).toBe(true);
    });

    it('returns false when index file does not exist', async () => {
      mockExistsSync.mockReturnValue(false);
      const { NotesIndex } = await import('./notesIndex.js');
      const mockDb = { available: true } as never;
      const index = new NotesIndex(mockDb);
      expect(index.available).toBe(false);
    });
  });

  describe('buildIndex', () => {
    function createMockDb(notes: unknown[], liveUuids: string[] = []) {
      return {
        available: true,
        getNotesForIndexing: vi.fn().mockReturnValue(notes),
        getAllNoteUuids: vi.fn().mockReturnValue(liveUuids),
      };
    }

    it('indexes notes and returns stats', async () => {
      // existsSync: false for dir check, then whatever for others
      mockExistsSync.mockReturnValue(false);
      // execSql calls: initTables, getLastSync (throws = no lastSync), DELETE, INSERT, SELECT uuids, UPDATE meta
      mockExecFileSync
        .mockReturnValueOnce('') // initTables
        .mockImplementationOnce(() => {
          throw new Error('no such table');
        }) // getLastSync (no table yet)
        .mockReturnValueOnce('') // DELETE
        .mockReturnValueOnce('') // INSERT
        .mockReturnValueOnce('uuid-1') // SELECT uuid from notes_fts
        .mockReturnValueOnce(''); // UPDATE meta lastSync

      mockExtractNoteText.mockReturnValue('Hello world content');

      const { NotesIndex } = await import('./notesIndex.js');
      const mockDb = createMockDb(
        [
          {
            uuid: 'uuid-1',
            title: 'Test',
            folder: 'Notes',
            account: 'iCloud',
            createdAt: '2024-01-01',
            modifiedAt: '2024-01-02',
            hexdata: '1f8b0800',
            isPasswordProtected: 0,
          },
        ],
        ['uuid-1'],
      );

      const index = new NotesIndex(mockDb as never);
      const stats = index.buildIndex();

      expect(stats.total).toBe(1);
      expect(stats.updated).toBe(1);
      expect(stats.skipped).toBe(0);
      expect(mockExtractNoteText).toHaveBeenCalledOnce();
    });

    it('skips password-protected notes', async () => {
      mockExistsSync.mockReturnValue(false);
      mockExecFileSync
        .mockReturnValueOnce('') // initTables
        .mockImplementationOnce(() => {
          throw new Error('no table');
        }) // getLastSync
        .mockReturnValueOnce('') // SELECT uuids from FTS
        .mockReturnValueOnce(''); // UPDATE meta

      const { NotesIndex } = await import('./notesIndex.js');
      const mockDb = createMockDb(
        [
          {
            uuid: 'uuid-locked',
            title: 'Secret',
            folder: 'Notes',
            account: 'iCloud',
            createdAt: '2024-01-01',
            modifiedAt: '2024-01-02',
            hexdata: 'deadbeef',
            isPasswordProtected: 1,
          },
        ],
        ['uuid-locked'],
      );

      const index = new NotesIndex(mockDb as never);
      const stats = index.buildIndex();

      expect(stats.skipped).toBe(1);
      expect(stats.updated).toBe(0);
      expect(mockExtractNoteText).not.toHaveBeenCalled();
    });

    it('skips notes with null protobuf extraction', async () => {
      mockExistsSync.mockReturnValue(false);
      mockExecFileSync
        .mockReturnValueOnce('') // initTables
        .mockImplementationOnce(() => {
          throw new Error('no table');
        }) // getLastSync
        .mockReturnValueOnce('') // SELECT uuids
        .mockReturnValueOnce(''); // UPDATE meta

      mockExtractNoteText.mockReturnValue(null);

      const { NotesIndex } = await import('./notesIndex.js');
      const mockDb = createMockDb(
        [
          {
            uuid: 'uuid-corrupt',
            title: 'Broken',
            folder: 'Notes',
            account: 'iCloud',
            createdAt: '2024-01-01',
            modifiedAt: '2024-01-02',
            hexdata: 'baddata',
            isPasswordProtected: 0,
          },
        ],
        ['uuid-corrupt'],
      );

      const index = new NotesIndex(mockDb as never);
      const stats = index.buildIndex();

      expect(stats.skipped).toBe(1);
      expect(stats.updated).toBe(0);
    });

    it('removes deleted notes from index', async () => {
      mockExistsSync.mockReturnValue(false);
      mockExecFileSync
        .mockReturnValueOnce('') // initTables
        .mockImplementationOnce(() => {
          throw new Error('no table');
        }) // getLastSync
        .mockReturnValueOnce('uuid-old\nuuid-deleted') // SELECT uuids from FTS
        .mockReturnValueOnce('') // DELETE uuid-deleted
        .mockReturnValueOnce(''); // UPDATE meta

      const { NotesIndex } = await import('./notesIndex.js');
      // No notes to index, but live UUIDs don't include uuid-deleted
      const mockDb = createMockDb([], ['uuid-old']);

      const index = new NotesIndex(mockDb as never);
      index.buildIndex();

      // Should have called DELETE for uuid-deleted
      const deleteCalls = mockExecFileSync.mock.calls.filter(
        (c: string[][]) => typeof c[1]?.[1] === 'string' && c[1][1].includes('DELETE') && c[1][1].includes('uuid-deleted'),
      );
      expect(deleteCalls.length).toBe(1);
    });

    it('throws when NotesDatabase is not available', async () => {
      const { NotesIndex } = await import('./notesIndex.js');
      const mockDb = { available: false } as never;
      const index = new NotesIndex(mockDb);

      expect(() => index.buildIndex()).toThrow('Full Disk Access required');
    });

    it('passes lastSync to getNotesForIndexing for incremental sync', async () => {
      mockExistsSync.mockReturnValue(false);
      mockExecFileSync
        .mockReturnValueOnce('') // initTables
        .mockReturnValueOnce('2024-01-10T00:00:00Z') // getLastSync returns a date
        .mockReturnValueOnce('') // SELECT uuids from FTS
        .mockReturnValueOnce(''); // UPDATE meta

      const { NotesIndex } = await import('./notesIndex.js');
      const mockDb = createMockDb([], []);

      const index = new NotesIndex(mockDb as never);
      index.buildIndex();

      expect(mockDb.getNotesForIndexing).toHaveBeenCalledWith('2024-01-10T00:00:00Z');
    });
  });

  describe('search', () => {
    it('returns parsed results from FTS query', async () => {
      mockExistsSync.mockReturnValue(true);
      mockExecFileSync.mockReturnValue(
        JSON.stringify([
          {
            uuid: 'abc',
            title: 'Test',
            snippet: '...match...',
            folder: 'Notes',
            account: 'iCloud',
            createdAt: '2024-01-01',
            modifiedAt: '2024-01-02',
          },
        ]),
      );

      const { NotesIndex } = await import('./notesIndex.js');
      const mockDb = { available: true } as never;
      const index = new NotesIndex(mockDb);
      const results = index.search('match');

      expect(results).toHaveLength(1);
      expect(results[0].title).toBe('Test');
    });

    it('returns empty array when index not available', async () => {
      mockExistsSync.mockReturnValue(false);
      const { NotesIndex } = await import('./notesIndex.js');
      const mockDb = { available: true } as never;
      const index = new NotesIndex(mockDb);
      expect(index.search('test')).toEqual([]);
    });

    it('falls back to LIKE when MATCH fails', async () => {
      mockExistsSync.mockReturnValue(true);
      // First call (MATCH) throws, second call (LIKE) succeeds
      mockExecFileSync
        .mockImplementationOnce(() => {
          throw new Error('MATCH failed');
        })
        .mockReturnValueOnce(
          JSON.stringify([
            {
              uuid: 'def',
              title: 'Fallback',
              snippet: 'content here',
              folder: 'Notes',
              account: 'iCloud',
              createdAt: '2024-01-01',
              modifiedAt: '2024-01-02',
            },
          ]),
        );

      const { NotesIndex } = await import('./notesIndex.js');
      const mockDb = { available: true } as never;
      const index = new NotesIndex(mockDb);
      const results = index.search('content');

      expect(results).toHaveLength(1);
      expect(results[0].title).toBe('Fallback');
    });

    it('returns empty when both MATCH and LIKE fail', async () => {
      mockExistsSync.mockReturnValue(true);
      mockExecFileSync.mockImplementation(() => {
        throw new Error('both failed');
      });

      const { NotesIndex } = await import('./notesIndex.js');
      const mockDb = { available: true } as never;
      const index = new NotesIndex(mockDb);
      expect(index.search('broken')).toEqual([]);
    });
  });

  describe('getStatus', () => {
    it('returns status with note count and size', async () => {
      mockExistsSync.mockReturnValue(true);
      mockStatSync.mockReturnValue({ size: 1024 });
      mockExecFileSync
        .mockReturnValueOnce('42')
        .mockReturnValueOnce('2024-01-15T10:00:00Z');

      const { NotesIndex } = await import('./notesIndex.js');
      const mockDb = { available: true } as never;
      const index = new NotesIndex(mockDb);
      const status = index.getStatus();

      expect(status.noteCount).toBe(42);
      expect(status.sizeBytes).toBe(1024);
      expect(status.lastSync).toBe('2024-01-15T10:00:00Z');
    });

    it('returns zero counts when index not built', async () => {
      mockExistsSync.mockReturnValue(false);
      const { NotesIndex } = await import('./notesIndex.js');
      const mockDb = { available: true } as never;
      const index = new NotesIndex(mockDb);
      const status = index.getStatus();

      expect(status.noteCount).toBe(0);
      expect(status.sizeBytes).toBe(0);
      expect(status.lastSync).toBeNull();
    });
  });

  describe('deleteIndex', () => {
    it('deletes the index file', async () => {
      mockExistsSync.mockReturnValue(true);
      const { NotesIndex } = await import('./notesIndex.js');
      const mockDb = { available: true } as never;
      const index = new NotesIndex(mockDb);
      index.deleteIndex();
      expect(mockUnlinkSync).toHaveBeenCalled();
    });

    it('does nothing if index does not exist', async () => {
      mockExistsSync.mockReturnValue(false);
      const { NotesIndex } = await import('./notesIndex.js');
      const mockDb = { available: true } as never;
      const index = new NotesIndex(mockDb);
      index.deleteIndex();
      expect(mockUnlinkSync).not.toHaveBeenCalled();
    });
  });
});
