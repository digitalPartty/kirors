/**
 * CRC32 checksum implementation for AWS Event Stream protocol
 * Uses CRC32 (ISO-HDLC/Ethernet/ZIP standard, polynomial 0xEDB88320)
 */

// CRC32 lookup table (ISO-HDLC standard)
const CRC32_TABLE = new Uint32Array(256);

// Initialize CRC32 lookup table
function initCrc32Table(): void {
  for (let i = 0; i < 256; i++) {
    let crc = i;
    for (let j = 0; j < 8; j++) {
      crc = (crc & 1) ? (0xEDB88320 ^ (crc >>> 1)) : (crc >>> 1);
    }
    CRC32_TABLE[i] = crc;
  }
}

// Initialize table on module load
initCrc32Table();

/**
 * Calculate CRC32 checksum (ISO-HDLC standard)
 * @param data - Data to calculate checksum for
 * @returns CRC32 checksum value
 */
export function crc32(data: Uint8Array): number {
  let crc = 0xFFFFFFFF;
  
  for (let i = 0; i < data.length; i++) {
    const byte = data[i];
    crc = CRC32_TABLE[(crc ^ byte) & 0xFF] ^ (crc >>> 8);
  }
  
  return (crc ^ 0xFFFFFFFF) >>> 0;
}
