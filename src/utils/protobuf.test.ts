import { describe, it, expect } from 'vitest';
import { gzipSync } from 'zlib';
import { extractNoteText } from './protobuf.js';

/**
 * Build a minimal Apple Notes protobuf structure:
 * Root { field1: 0, field2: Document { field1: 0, field2: 0, field3: Note { field2: text } } }
 */
function buildTestProtobuf(text: string): Buffer {
  const textBuf = Buffer.from(text, 'utf8');

  // field 2 (wire type 2) = tag byte 0x12, then varint length, then text bytes
  const noteField2 = Buffer.concat([Buffer.from([0x12]), encodeVarint(textBuf.length), textBuf]);

  // Note message (field 3 of Document) = tag 0x1a
  const noteMsg = Buffer.concat([Buffer.from([0x1a]), encodeVarint(noteField2.length), noteField2]);

  // Document fields: field1=0, field2=0, then field3=noteMsg
  const docContent = Buffer.concat([
    Buffer.from([0x08, 0x00]), // field 1 = 0
    Buffer.from([0x10, 0x00]), // field 2 = 0
    noteMsg,
  ]);

  // Document (field 2 of Root) = tag 0x12
  const docMsg = Buffer.concat([Buffer.from([0x12]), encodeVarint(docContent.length), docContent]);

  // Root: field 1 = 0, field 2 = docMsg
  const root = Buffer.concat([Buffer.from([0x08, 0x00]), docMsg]);

  return root;
}

function encodeVarint(value: number): Buffer {
  const bytes: number[] = [];
  while (value > 0x7f) {
    bytes.push((value & 0x7f) | 0x80);
    value >>>= 7;
  }
  bytes.push(value & 0x7f);
  return Buffer.from(bytes);
}

describe('extractNoteText', () => {
  it('extracts text from valid gzipped protobuf', () => {
    const proto = buildTestProtobuf('Hello, world!');
    const gzipped = gzipSync(proto);
    expect(extractNoteText(gzipped)).toBe('Hello, world!');
  });

  it('extracts unicode text', () => {
    const proto = buildTestProtobuf('Привет мир 你好');
    const gzipped = gzipSync(proto);
    expect(extractNoteText(gzipped)).toBe('Привет мир 你好');
  });

  it('extracts multiline text', () => {
    const proto = buildTestProtobuf('Line 1\nLine 2\nLine 3');
    const gzipped = gzipSync(proto);
    expect(extractNoteText(gzipped)).toBe('Line 1\nLine 2\nLine 3');
  });

  it('returns null for empty buffer', () => {
    expect(extractNoteText(Buffer.alloc(0))).toBeNull();
  });

  it('returns null for invalid gzip data', () => {
    expect(extractNoteText(Buffer.from('not gzip'))).toBeNull();
  });

  it('returns null for valid gzip but invalid protobuf structure', () => {
    const gzipped = gzipSync(Buffer.from('random bytes here'));
    expect(extractNoteText(gzipped)).toBeNull();
  });
});
