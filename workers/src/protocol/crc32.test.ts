/**
 * Tests for CRC32 checksum implementation
 */

import { describe, it, expect } from 'vitest';
import { crc32 } from './crc32';

describe('crc32', () => {
  it('should return 0 for empty data', () => {
    const result = crc32(new Uint8Array([]));
    expect(result).toBe(0);
  });

  it('should calculate correct CRC32 for known value', () => {
    // "123456789" has CRC32 (ISO-HDLC) value of 0xCBF43926
    const data = new TextEncoder().encode('123456789');
    const result = crc32(data);
    expect(result).toBe(0xCBF43926);
  });

  it('should calculate different checksums for different data', () => {
    const data1 = new TextEncoder().encode('hello');
    const data2 = new TextEncoder().encode('world');
    const crc1 = crc32(data1);
    const crc2 = crc32(data2);
    expect(crc1).not.toBe(crc2);
  });

  it('should be deterministic', () => {
    const data = new TextEncoder().encode('test data');
    const crc1 = crc32(data);
    const crc2 = crc32(data);
    expect(crc1).toBe(crc2);
  });
});
