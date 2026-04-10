/**
 * Unit tests for EventStreamDecoder
 */

import { describe, it, expect } from 'vitest';
import { EventStreamDecoder, DecoderState } from './decoder';
import { crc32 } from './crc32';

/**
 * Helper to create a valid AWS Event Stream frame
 */
function createFrame(headers: Array<{ name: string; value: string }>, payload: Uint8Array): Uint8Array {
  // Encode headers
  const headerParts: Uint8Array[] = [];
  for (const { name, value } of headers) {
    const nameBytes = new TextEncoder().encode(name);
    const valueBytes = new TextEncoder().encode(value);
    
    // Header name length (1 byte)
    headerParts.push(new Uint8Array([nameBytes.length]));
    // Header name
    headerParts.push(nameBytes);
    // Header value type (7 = string)
    headerParts.push(new Uint8Array([7]));
    // Header value length (2 bytes, big-endian)
    const valueLenBytes = new Uint8Array(2);
    new DataView(valueLenBytes.buffer).setUint16(0, valueBytes.length, false);
    headerParts.push(valueLenBytes);
    // Header value
    headerParts.push(valueBytes);
  }
  
  // Concatenate all header parts
  const headerLength = headerParts.reduce((sum, part) => sum + part.length, 0);
  const headersData = new Uint8Array(headerLength);
  let offset = 0;
  for (const part of headerParts) {
    headersData.set(part, offset);
    offset += part.length;
  }
  
  // Calculate total length
  const totalLength = 12 + headerLength + payload.length + 4; // prelude + headers + payload + message CRC
  
  // Create prelude
  const prelude = new Uint8Array(8);
  const preludeView = new DataView(prelude.buffer);
  preludeView.setUint32(0, totalLength, false);
  preludeView.setUint32(4, headerLength, false);
  
  // Calculate prelude CRC
  const preludeCrc = crc32(prelude);
  
  // Build complete message (without message CRC yet)
  const messageWithoutCrc = new Uint8Array(totalLength - 4);
  const messageView = new DataView(messageWithoutCrc.buffer);
  messageView.setUint32(0, totalLength, false);
  messageView.setUint32(4, headerLength, false);
  messageView.setUint32(8, preludeCrc, false);
  messageWithoutCrc.set(headersData, 12);
  messageWithoutCrc.set(payload, 12 + headerLength);
  
  // Calculate message CRC
  const messageCrc = crc32(messageWithoutCrc);
  
  // Build final message
  const message = new Uint8Array(totalLength);
  message.set(messageWithoutCrc);
  new DataView(message.buffer, message.byteOffset + totalLength - 4).setUint32(0, messageCrc, false);
  
  return message;
}

describe('EventStreamDecoder', () => {
  describe('Basic frame parsing', () => {
    it('should parse a complete frame with valid CRC32', () => {
      const decoder = new EventStreamDecoder();
      const payload = new TextEncoder().encode('Hello, World!');
      const frame = createFrame(
        [
          { name: ':message-type', value: 'event' },
          { name: ':event-type', value: 'messageStart' },
        ],
        payload
      );
      
      decoder.feed(frame);
      const decoded = decoder.decode();
      
      expect(decoded).not.toBeNull();
      expect(decoded!.headers.messageType).toBe('event');
      expect(decoded!.headers.eventType).toBe('messageStart');
      expect(new TextDecoder().decode(decoded!.payload)).toBe('Hello, World!');
      expect(decoder.getFramesDecoded()).toBe(1);
      expect(decoder.getState()).toBe(DecoderState.Ready);
    });

    it('should handle empty payload', () => {
      const decoder = new EventStreamDecoder();
      const frame = createFrame(
        [{ name: ':message-type', value: 'event' }],
        new Uint8Array(0)
      );
      
      decoder.feed(frame);
      const decoded = decoder.decode();
      
      expect(decoded).not.toBeNull();
      expect(decoded!.payload.length).toBe(0);
    });
  });

  describe('Partial frame buffering', () => {
    it('should buffer partial frames across multiple chunks', () => {
      const decoder = new EventStreamDecoder();
      const payload = new TextEncoder().encode('Test payload');
      const frame = createFrame(
        [{ name: ':message-type', value: 'event' }],
        payload
      );
      
      // Split frame into two chunks
      const chunk1 = frame.slice(0, 20);
      const chunk2 = frame.slice(20);
      
      // Feed first chunk - should return null (incomplete)
      decoder.feed(chunk1);
      expect(decoder.decode()).toBeNull();
      expect(decoder.getState()).toBe(DecoderState.Ready);
      expect(decoder.getBufferLength()).toBe(20);
      
      // Feed second chunk - should decode successfully
      decoder.feed(chunk2);
      const decoded = decoder.decode();
      
      expect(decoded).not.toBeNull();
      expect(new TextDecoder().decode(decoded!.payload)).toBe('Test payload');
      expect(decoder.getBufferLength()).toBe(0);
    });

    it('should handle multiple complete frames in buffer', () => {
      const decoder = new EventStreamDecoder();
      const frame1 = createFrame(
        [{ name: ':event-type', value: 'first' }],
        new TextEncoder().encode('Frame 1')
      );
      const frame2 = createFrame(
        [{ name: ':event-type', value: 'second' }],
        new TextEncoder().encode('Frame 2')
      );
      
      // Feed both frames at once
      const combined = new Uint8Array(frame1.length + frame2.length);
      combined.set(frame1);
      combined.set(frame2, frame1.length);
      decoder.feed(combined);
      
      // Decode first frame
      const decoded1 = decoder.decode();
      expect(decoded1).not.toBeNull();
      expect(decoded1!.headers.eventType).toBe('first');
      
      // Decode second frame
      const decoded2 = decoder.decode();
      expect(decoded2).not.toBeNull();
      expect(decoded2!.headers.eventType).toBe('second');
      
      // No more frames
      expect(decoder.decode()).toBeNull();
    });
  });

  describe('CRC32 validation', () => {
    it('should reject frames with invalid prelude CRC', () => {
      const decoder = new EventStreamDecoder();
      const frame = createFrame(
        [{ name: ':message-type', value: 'event' }],
        new TextEncoder().encode('payload')
      );
      
      // Corrupt prelude CRC
      const view = new DataView(frame.buffer, frame.byteOffset);
      view.setUint32(8, 0xDEADBEEF, false);
      
      decoder.feed(frame);
      expect(() => decoder.decode()).toThrow(/Prelude CRC mismatch/);
      expect(decoder.getErrorCount()).toBe(1);
      expect(decoder.getState()).toBe(DecoderState.Recovering);
    });

    it('should reject frames with invalid message CRC', () => {
      const decoder = new EventStreamDecoder();
      const frame = createFrame(
        [{ name: ':message-type', value: 'event' }],
        new TextEncoder().encode('payload')
      );
      
      // Corrupt message CRC
      const view = new DataView(frame.buffer, frame.byteOffset + frame.length - 4);
      view.setUint32(0, 0xBADC0FFE, false);
      
      decoder.feed(frame);
      expect(() => decoder.decode()).toThrow(/Message CRC mismatch/);
      expect(decoder.getErrorCount()).toBe(1);
    });
  });

  describe('Error handling and recovery', () => {
    it('should track error count and enter Recovering state on parse errors', () => {
      const decoder = new EventStreamDecoder();
      
      // Feed garbage that looks like a frame header but has bad CRC
      const garbage = new Uint8Array(16);
      const view = new DataView(garbage.buffer);
      view.setUint32(0, 16, false); // total length
      view.setUint32(4, 0, false); // header length
      view.setUint32(8, 0xDEADBEEF, false); // bad prelude CRC
      
      decoder.feed(garbage);
      
      // First decode attempt should fail with bad CRC
      expect(() => decoder.decode()).toThrow(/Prelude CRC mismatch/);
      expect(decoder.getState()).toBe(DecoderState.Recovering);
      expect(decoder.getErrorCount()).toBe(1);
      expect(decoder.getBytesSkipped()).toBeGreaterThan(0);
    });

    it('should stop after too many consecutive errors', () => {
      const decoder = new EventStreamDecoder(8192, 3); // max 3 errors
      
      // Feed garbage that will cause multiple errors
      const garbage = new Uint8Array(100).fill(0xFF);
      decoder.feed(garbage);
      
      // Trigger errors until stopped
      expect(() => decoder.decode()).toThrow();
      expect(() => decoder.decode()).toThrow();
      expect(() => decoder.decode()).toThrow(/Too many consecutive errors/);
      
      expect(decoder.getState()).toBe(DecoderState.Stopped);
      expect(decoder.isStopped()).toBe(true);
    });

    it('should reset error count on successful decode', () => {
      const decoder = new EventStreamDecoder();
      
      // Create two valid frames
      const frame1 = createFrame(
        [{ name: ':message-type', value: 'event' }],
        new TextEncoder().encode('first')
      );
      const frame2 = createFrame(
        [{ name: ':message-type', value: 'event' }],
        new TextEncoder().encode('second')
      );
      
      // Feed and decode first frame successfully
      decoder.feed(frame1);
      const decoded1 = decoder.decode();
      expect(decoded1).not.toBeNull();
      expect(decoder.getErrorCount()).toBe(0);
      
      // Feed and decode second frame successfully
      decoder.feed(frame2);
      const decoded2 = decoder.decode();
      expect(decoded2).not.toBeNull();
      
      // Error count should remain 0 after successful decodes
      expect(decoder.getErrorCount()).toBe(0);
    });
  });

  describe('decodeAll iterator', () => {
    it('should decode all available frames', () => {
      const decoder = new EventStreamDecoder();
      
      // Create multiple frames
      const frames = [
        createFrame([{ name: ':event-type', value: 'first' }], new TextEncoder().encode('1')),
        createFrame([{ name: ':event-type', value: 'second' }], new TextEncoder().encode('2')),
        createFrame([{ name: ':event-type', value: 'third' }], new TextEncoder().encode('3')),
      ];
      
      // Feed all frames
      for (const frame of frames) {
        decoder.feed(frame);
      }
      
      // Decode all
      const decoded = Array.from(decoder.decodeAll());
      expect(decoded.length).toBe(3);
      expect(decoded[0].headers.eventType).toBe('first');
      expect(decoded[1].headers.eventType).toBe('second');
      expect(decoded[2].headers.eventType).toBe('third');
    });

    it('should stop iteration on error', () => {
      const decoder = new EventStreamDecoder();
      
      // Feed valid frame, then corrupted frame
      const frame1 = createFrame([{ name: ':event-type', value: 'first' }], new Uint8Array(0));
      
      // Create a corrupted frame with bad CRC
      const corruptedFrame = createFrame([{ name: ':event-type', value: 'bad' }], new Uint8Array(5));
      const view = new DataView(corruptedFrame.buffer, corruptedFrame.byteOffset + 8);
      view.setUint32(0, 0xBADBAD, false); // corrupt prelude CRC
      
      decoder.feed(frame1);
      decoder.feed(corruptedFrame);
      
      // Should decode first frame, then stop on error
      const decoded = Array.from(decoder.decodeAll());
      expect(decoded.length).toBe(1);
      expect(decoded[0].headers.eventType).toBe('first');
      expect(decoder.getState()).toBe(DecoderState.Recovering);
    });
  });

  describe('State management', () => {
    it('should track decoder state correctly', () => {
      const decoder = new EventStreamDecoder();
      
      expect(decoder.getState()).toBe(DecoderState.Ready);
      expect(decoder.isReady()).toBe(true);
      
      // Empty decode stays in Ready
      expect(decoder.decode()).toBeNull();
      expect(decoder.getState()).toBe(DecoderState.Ready);
    });

    it('should allow resuming from Stopped state', () => {
      const decoder = new EventStreamDecoder(8192, 2); // max 2 errors
      
      // Trigger errors until stopped
      decoder.feed(new Uint8Array(50).fill(0xFF));
      expect(() => decoder.decode()).toThrow();
      expect(() => decoder.decode()).toThrow(/Too many consecutive errors/);
      expect(decoder.isStopped()).toBe(true);
      
      // Resume
      decoder.tryResume();
      expect(decoder.isReady()).toBe(true);
      expect(decoder.getErrorCount()).toBe(0);
    });

    it('should reset decoder to initial state', () => {
      const decoder = new EventStreamDecoder();
      
      // Feed data and decode
      const frame = createFrame([{ name: ':message-type', value: 'event' }], new Uint8Array(10));
      decoder.feed(frame);
      decoder.decode();
      
      expect(decoder.getFramesDecoded()).toBe(1);
      
      // Reset
      decoder.reset();
      expect(decoder.getFramesDecoded()).toBe(0);
      expect(decoder.getBufferLength()).toBe(0);
      expect(decoder.getErrorCount()).toBe(0);
      expect(decoder.getBytesSkipped()).toBe(0);
      expect(decoder.getState()).toBe(DecoderState.Ready);
    });
  });
});
