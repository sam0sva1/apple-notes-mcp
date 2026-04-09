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
  });

  describe('getStatus', () => {
    it('returns status with note count and size', async () => {
      mockExistsSync.mockReturnValue(true);
      mockStatSync.mockReturnValue({ size: 1024 });
      // First call: COUNT, second call: lastSync
      mockExecFileSync.mockReturnValueOnce('42').mockReturnValueOnce('2024-01-15T10:00:00Z');

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
