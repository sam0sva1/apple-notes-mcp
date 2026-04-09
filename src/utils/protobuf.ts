import { gunzipSync } from 'zlib';

/**
 * Reads a protobuf varint from a buffer at the given offset.
 * Returns the decoded value and the new offset.
 */
function readVarint(buf: Buffer, offset: number): { value: number; offset: number } {
  let result = 0;
  let shift = 0;
  while (offset < buf.length) {
    const byte = buf[offset++];
    result |= (byte & 0x7f) << shift;
    shift += 7;
    if (!(byte & 0x80)) break;
  }
  return { value: result, offset };
}

/**
 * Extracts a length-delimited field (wire type 2) from a protobuf message.
 * Returns the field's raw bytes, or null if not found.
 */
function extractField(buf: Buffer, targetField: number): Buffer | null {
  let offset = 0;
  while (offset < buf.length) {
    const tag = readVarint(buf, offset);
    offset = tag.offset;
    const fieldNumber = tag.value >> 3;
    const wireType = tag.value & 0x7;

    if (wireType === 0) {
      // Varint — skip
      const val = readVarint(buf, offset);
      offset = val.offset;
    } else if (wireType === 2) {
      // Length-delimited
      const len = readVarint(buf, offset);
      offset = len.offset;
      if (fieldNumber === targetField) {
        return buf.subarray(offset, offset + len.value);
      }
      offset += len.value;
    } else {
      // Unknown wire type — can't safely skip
      return null;
    }
  }
  return null;
}

/**
 * Extracts plaintext content from a gzipped Apple Notes protobuf blob (ZDATA).
 *
 * Apple Notes stores note content as gzip-compressed protobuf with the text
 * at path: root → field 2 (Document) → field 3 (Note) → field 2 (Text).
 *
 * Returns the extracted text, or null if parsing fails (encrypted, corrupted, etc.)
 */
export function extractNoteText(gzippedData: Buffer): string | null {
  try {
    const decompressed = gunzipSync(gzippedData);
    const document = extractField(decompressed, 2);
    if (!document) return null;
    const note = extractField(document, 3);
    if (!note) return null;
    const text = extractField(note, 2);
    if (!text) return null;
    return text.toString('utf8');
  } catch {
    return null;
  }
}
