/**
 * AWS Event Stream message frame parsing
 * 
 * Message format:
 * ┌──────────────┬──────────────┬──────────────┬──────────┬──────────┬───────────┐
 * │ Total Length │ Header Length│ Prelude CRC  │ Headers  │ Payload  │ Msg CRC   │
 * │   (4 bytes)  │   (4 bytes)  │   (4 bytes)  │ (variable)│(variable)│ (4 bytes) │
 * └──────────────┴──────────────┴──────────────┴──────────┴──────────┴───────────┘
 */

import { crc32 } from './crc32';
import { Headers, parseHeaders } from './header';
import {
  PreludeCrcMismatchError,
  MessageCrcMismatchError,
  MessageTooSmallError,
  MessageTooLargeError,
  HeaderParseError,
} from './errors';

/** Prelude fixed size (12 bytes) */
export const PRELUDE_SIZE = 12;

/** Minimum message size (Prelude + Message CRC) */
export const MIN_MESSAGE_SIZE = PRELUDE_SIZE + 4;

/** Maximum message size limit (16 MB) */
export const MAX_MESSAGE_SIZE = 16 * 1024 * 1024;

/**
 * Parsed message frame
 */
export interface Frame {
  /** Message headers */
  headers: Headers;
  /** Message payload */
  payload: Uint8Array;
}

/**
 * Parse result for a frame
 */
export type ParseFrameResult =
  | { type: 'complete'; frame: Frame; bytesConsumed: number }
  | { type: 'incomplete' };

/**
 * Attempt to parse a complete frame from buffer
 * 
 * This is a stateless pure function. Buffer management is handled by EventStreamDecoder.
 * 
 * @param buffer - Input buffer
 * @returns Parse result indicating complete frame, incomplete data, or error
 */
export function parseFrame(buffer: Uint8Array): ParseFrameResult {
  // Check if we have enough data to read prelude
  if (buffer.length < PRELUDE_SIZE) {
    return { type: 'incomplete' };
  }

  const view = new DataView(buffer.buffer, buffer.byteOffset);

  // Read prelude
  const totalLength = view.getUint32(0, false);
  const headerLength = view.getUint32(4, false);
  const preludeCrc = view.getUint32(8, false);

  // Validate message length range
  if (totalLength < MIN_MESSAGE_SIZE) {
    throw new MessageTooSmallError(totalLength, MIN_MESSAGE_SIZE);
  }

  if (totalLength > MAX_MESSAGE_SIZE) {
    throw new MessageTooLargeError(totalLength, MAX_MESSAGE_SIZE);
  }

  // Check if we have the complete message
  if (buffer.length < totalLength) {
    return { type: 'incomplete' };
  }

  // Verify Prelude CRC
  const preludeData = buffer.slice(0, 8);
  const actualPreludeCrc = crc32(preludeData);
  if (actualPreludeCrc !== preludeCrc) {
    throw new PreludeCrcMismatchError(preludeCrc, actualPreludeCrc);
  }

  // Read Message CRC
  const messageCrc = view.getUint32(totalLength - 4, false);

  // Verify Message CRC (entire message except last 4 bytes)
  const messageData = buffer.slice(0, totalLength - 4);
  const actualMessageCrc = crc32(messageData);
  if (actualMessageCrc !== messageCrc) {
    throw new MessageCrcMismatchError(messageCrc, actualMessageCrc);
  }

  // Parse headers
  const headersStart = PRELUDE_SIZE;
  const headersEnd = headersStart + headerLength;

  // Validate header boundaries
  if (headersEnd > totalLength - 4) {
    throw new HeaderParseError('Header length exceeds message boundary');
  }

  const headersData = buffer.slice(headersStart, headersEnd);
  const headers = parseHeaders(headersData, headerLength);

  // Extract payload (excluding last 4 bytes of message CRC)
  const payloadStart = headersEnd;
  const payloadEnd = totalLength - 4;
  const payload = buffer.slice(payloadStart, payloadEnd);

  return {
    type: 'complete',
    frame: { headers, payload },
    bytesConsumed: totalLength,
  };
}
