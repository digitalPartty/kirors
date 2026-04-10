/**
 * AWS Event Stream decoder with state machine
 * 
 * State machine design (based on kiro-kt):
 * 
 * ┌─────────────────┐
 * │      Ready      │  (Initial state, ready to receive data)
 * └────────┬────────┘
 *          │ feed() provides data
 *          ↓
 * ┌─────────────────┐
 * │     Parsing     │  decode() attempts to parse
 * └────────┬────────┘
 *          │
 *     ┌────┴────────────┐
 *     ↓                 ↓
 *  [Success]         [Failure]
 *     │                 │
 *     ↓                 ├─> error_count++
 * ┌─────────┐           │
 * │  Ready  │           ├─> error_count < max_errors?
 * └─────────┘           │    YES → Recovering → Ready
 *                       │    NO  ↓
 *                  ┌────────────┐
 *                  │   Stopped  │ (Terminal state)
 *                  └────────────┘
 */

import { Frame, parseFrame, PRELUDE_SIZE } from './frame';
import {
  ParseError,
  BufferOverflowError,
  TooManyErrorsError,
  PreludeCrcMismatchError,
  MessageCrcMismatchError,
  MessageTooSmallError,
  MessageTooLargeError,
  HeaderParseError,
} from './errors';

/** Default maximum buffer size (16 MB) */
export const DEFAULT_MAX_BUFFER_SIZE = 16 * 1024 * 1024;

/** Default maximum consecutive errors */
export const DEFAULT_MAX_ERRORS = 5;

/** Default initial buffer capacity */
export const DEFAULT_BUFFER_CAPACITY = 8192;

/**
 * Decoder state
 */
export enum DecoderState {
  /** Ready to receive data */
  Ready = 'Ready',
  /** Currently parsing a frame */
  Parsing = 'Parsing',
  /** Recovering from error (skipping corrupted data) */
  Recovering = 'Recovering',
  /** Stopped due to too many errors (terminal state) */
  Stopped = 'Stopped',
}

/**
 * Event Stream decoder for parsing AWS Event Stream binary protocol
 * 
 * Handles partial frames across chunks, validates checksums, and provides
 * error recovery for corrupted data.
 * 
 * @example
 * ```typescript
 * const decoder = new EventStreamDecoder();
 * 
 * // Feed stream data
 * decoder.feed(chunk);
 * 
 * // Decode all available frames
 * for (const frame of decoder.decodeAll()) {
 *   console.log('Event type:', frame.headers.eventType);
 *   console.log('Payload:', new TextDecoder().decode(frame.payload));
 * }
 * ```
 */
export class EventStreamDecoder {
  private buffer: Uint8Array;
  private bufferLength: number;
  private state: DecoderState;
  private framesDecoded: number;
  private errorCount: number;
  private readonly maxErrors: number;
  private readonly maxBufferSize: number;
  private bytesSkipped: number;

  constructor(
    capacity: number = DEFAULT_BUFFER_CAPACITY,
    maxErrors: number = DEFAULT_MAX_ERRORS,
    maxBufferSize: number = DEFAULT_MAX_BUFFER_SIZE
  ) {
    this.buffer = new Uint8Array(capacity);
    this.bufferLength = 0;
    this.state = DecoderState.Ready;
    this.framesDecoded = 0;
    this.errorCount = 0;
    this.maxErrors = maxErrors;
    this.maxBufferSize = maxBufferSize;
    this.bytesSkipped = 0;
  }

  /**
   * Feed data to the decoder
   * @param data - Binary chunk to add to buffer
   * @throws BufferOverflowError if buffer size would exceed maximum
   */
  feed(data: Uint8Array): void {
    const newSize = this.bufferLength + data.length;
    if (newSize > this.maxBufferSize) {
      throw new BufferOverflowError(newSize, this.maxBufferSize);
    }

    // Expand buffer if needed
    if (newSize > this.buffer.length) {
      const newCapacity = Math.max(this.buffer.length * 2, newSize);
      const newBuffer = new Uint8Array(newCapacity);
      newBuffer.set(this.buffer.subarray(0, this.bufferLength));
      this.buffer = newBuffer;
    }

    // Append data
    this.buffer.set(data, this.bufferLength);
    this.bufferLength += data.length;

    // Recover from Recovering state to Ready
    if (this.state === DecoderState.Recovering) {
      this.state = DecoderState.Ready;
    }
  }

  /**
   * Attempt to decode the next frame
   * @returns Decoded frame or null if insufficient data
   * @throws ParseError if decoding fails
   * @throws TooManyErrorsError if decoder is stopped
   */
  decode(): Frame | null {
    // If stopped, throw error
    if (this.state === DecoderState.Stopped) {
      throw new TooManyErrorsError(this.errorCount, 'Decoder is stopped');
    }

    // Empty buffer, stay in Ready state
    if (this.bufferLength === 0) {
      this.state = DecoderState.Ready;
      return null;
    }

    // Transition to Parsing state
    this.state = DecoderState.Parsing;

    try {
      const result = parseFrame(this.buffer.subarray(0, this.bufferLength));

      if (result.type === 'incomplete') {
        // Insufficient data, return to Ready state
        this.state = DecoderState.Ready;
        return null;
      }

      // Successfully parsed frame
      const { frame, bytesConsumed } = result;
      this.advance(bytesConsumed);
      this.state = DecoderState.Ready;
      this.framesDecoded++;
      this.errorCount = 0; // Reset consecutive error count
      return frame;
    } catch (error) {
      this.errorCount++;
      const errorMsg = error instanceof Error ? error.message : String(error);

      // Check if we've exceeded max errors
      if (this.errorCount >= this.maxErrors) {
        this.state = DecoderState.Stopped;
        throw new TooManyErrorsError(this.errorCount, errorMsg);
      }

      // Attempt recovery based on error type
      this.tryRecover(error);
      this.state = DecoderState.Recovering;
      throw error;
    }
  }

  /**
   * Decode all available frames
   * @returns Iterator of decoded frames
   */
  *decodeAll(): Generator<Frame, void, undefined> {
    while (this.state !== DecoderState.Stopped && this.state !== DecoderState.Recovering) {
      try {
        const frame = this.decode();
        if (frame === null) {
          break;
        }
        yield frame;
      } catch (error) {
        // Error already logged and handled in decode()
        break;
      }
    }
  }

  /**
   * Attempt error recovery based on error type
   * 
   * Recovery strategies (based on kiro-kt design):
   * - Prelude stage errors (CRC failure, length anomaly): Skip 1 byte, try to find next frame boundary
   * - Data stage errors (Message CRC failure, Header parse failure): Skip entire corrupted frame
   */
  private tryRecover(error: unknown): void {
    if (this.bufferLength === 0) {
      return;
    }

    if (
      error instanceof PreludeCrcMismatchError ||
      error instanceof MessageTooSmallError ||
      error instanceof MessageTooLargeError
    ) {
      // Prelude stage error: frame boundary may be misaligned, scan byte-by-byte
      const skippedByte = this.buffer[0];
      this.advance(1);
      this.bytesSkipped++;
      console.warn(
        `Prelude error recovery: skipped byte 0x${skippedByte.toString(16).padStart(2, '0')} (total skipped: ${this.bytesSkipped})`
      );
    } else if (error instanceof MessageCrcMismatchError || error instanceof HeaderParseError) {
      // Data stage error: frame boundary is correct but data is corrupted, skip entire frame
      // Try to read total_length to skip the whole frame
      if (this.bufferLength >= PRELUDE_SIZE) {
        const view = new DataView(this.buffer.buffer, this.buffer.byteOffset);
        const totalLength = view.getUint32(0, false);

        // Ensure total_length is reasonable and we have enough data
        if (totalLength >= 16 && totalLength <= this.bufferLength) {
          console.warn(`Data error recovery: skipping corrupted frame (${totalLength} bytes)`);
          this.advance(totalLength);
          this.bytesSkipped += totalLength;
          return;
        }
      }

      // Can't determine frame length, fall back to byte-by-byte skip
      const skippedByte = this.buffer[0];
      this.advance(1);
      this.bytesSkipped++;
      console.warn(
        `Data error recovery (fallback): skipped byte 0x${skippedByte.toString(16).padStart(2, '0')} (total skipped: ${this.bytesSkipped})`
      );
    } else {
      // Other errors: skip byte-by-byte
      const skippedByte = this.buffer[0];
      this.advance(1);
      this.bytesSkipped++;
      console.warn(
        `Generic error recovery: skipped byte 0x${skippedByte.toString(16).padStart(2, '0')} (total skipped: ${this.bytesSkipped})`
      );
    }
  }

  /**
   * Advance buffer by consuming bytes
   */
  private advance(bytes: number): void {
    if (bytes >= this.bufferLength) {
      this.bufferLength = 0;
    } else {
      this.buffer.copyWithin(0, bytes, this.bufferLength);
      this.bufferLength -= bytes;
    }
  }

  /**
   * Reset decoder to initial state
   */
  reset(): void {
    this.bufferLength = 0;
    this.state = DecoderState.Ready;
    this.framesDecoded = 0;
    this.errorCount = 0;
    this.bytesSkipped = 0;
  }

  /**
   * Get current decoder state
   */
  getState(): DecoderState {
    return this.state;
  }

  /**
   * Check if decoder is in Ready state
   */
  isReady(): boolean {
    return this.state === DecoderState.Ready;
  }

  /**
   * Check if decoder is in Stopped state
   */
  isStopped(): boolean {
    return this.state === DecoderState.Stopped;
  }

  /**
   * Check if decoder is in Recovering state
   */
  isRecovering(): boolean {
    return this.state === DecoderState.Recovering;
  }

  /**
   * Get number of frames decoded
   */
  getFramesDecoded(): number {
    return this.framesDecoded;
  }

  /**
   * Get current consecutive error count
   */
  getErrorCount(): number {
    return this.errorCount;
  }

  /**
   * Get number of bytes skipped during recovery
   */
  getBytesSkipped(): number {
    return this.bytesSkipped;
  }

  /**
   * Get number of bytes in buffer
   */
  getBufferLength(): number {
    return this.bufferLength;
  }

  /**
   * Attempt to resume from Stopped state
   * Resets error count and transitions to Ready state
   * Note: Buffer contents are preserved and may still contain corrupted data
   */
  tryResume(): void {
    if (this.state === DecoderState.Stopped) {
      this.errorCount = 0;
      this.state = DecoderState.Ready;
      console.info('Decoder resumed from Stopped state');
    }
  }
}
