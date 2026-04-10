/**
 * AWS Event Stream header parsing
 */

import { InvalidHeaderTypeError, HeaderParseError, IncompleteDataError } from './errors';

/**
 * Header value types defined by AWS Event Stream protocol
 */
export enum HeaderValueType {
  BoolTrue = 0,
  BoolFalse = 1,
  Byte = 2,
  Short = 3,
  Integer = 4,
  Long = 5,
  ByteArray = 6,
  String = 7,
  Timestamp = 8,
  Uuid = 9,
}

/**
 * Header value union type
 */
export type HeaderValue =
  | { type: 'bool'; value: boolean }
  | { type: 'byte'; value: number }
  | { type: 'short'; value: number }
  | { type: 'integer'; value: number }
  | { type: 'long'; value: bigint }
  | { type: 'byteArray'; value: Uint8Array }
  | { type: 'string'; value: string }
  | { type: 'timestamp'; value: bigint }
  | { type: 'uuid'; value: Uint8Array };

/**
 * Message headers collection
 */
export class Headers {
  private headers: Map<string, HeaderValue>;

  constructor() {
    this.headers = new Map();
  }

  /**
   * Insert a header
   */
  insert(name: string, value: HeaderValue): void {
    this.headers.set(name, value);
  }

  /**
   * Get a header value
   */
  get(name: string): HeaderValue | undefined {
    return this.headers.get(name);
  }

  /**
   * Get a string header value
   */
  getString(name: string): string | undefined {
    const value = this.headers.get(name);
    return value?.type === 'string' ? value.value : undefined;
  }

  /**
   * Get message type (:message-type header)
   */
  get messageType(): string | undefined {
    return this.getString(':message-type');
  }

  /**
   * Get event type (:event-type header)
   */
  get eventType(): string | undefined {
    return this.getString(':event-type');
  }

  /**
   * Get exception type (:exception-type header)
   */
  get exceptionType(): string | undefined {
    return this.getString(':exception-type');
  }

  /**
   * Get error code (:error-code header)
   */
  get errorCode(): string | undefined {
    return this.getString(':error-code');
  }
}

/**
 * Parse headers from byte array
 * @param data - Header data slice
 * @param headerLength - Total header length
 * @returns Parsed Headers object
 */
export function parseHeaders(data: Uint8Array, headerLength: number): Headers {
  if (data.length < headerLength) {
    throw new IncompleteDataError(headerLength, data.length);
  }

  const headers = new Headers();
  let offset = 0;

  while (offset < headerLength) {
    // Read header name length (1 byte)
    if (offset >= data.length) {
      break;
    }
    const nameLen = data[offset];
    offset += 1;

    if (nameLen === 0) {
      throw new HeaderParseError('Header name length cannot be 0');
    }

    // Read header name
    if (offset + nameLen > data.length) {
      throw new IncompleteDataError(nameLen, data.length - offset);
    }
    const nameBytes = data.slice(offset, offset + nameLen);
    const name = new TextDecoder().decode(nameBytes);
    offset += nameLen;

    // Read value type (1 byte)
    if (offset >= data.length) {
      throw new IncompleteDataError(1, 0);
    }
    const valueType = data[offset];
    offset += 1;

    // Parse value based on type
    const value = parseHeaderValue(data, offset, valueType);
    offset += value.bytesConsumed;
    headers.insert(name, value.value);
  }

  return headers;
}

/**
 * Parse a header value based on its type
 */
function parseHeaderValue(
  data: Uint8Array,
  offset: number,
  valueType: number
): { value: HeaderValue; bytesConsumed: number } {
  const view = new DataView(data.buffer, data.byteOffset + offset);

  switch (valueType) {
    case HeaderValueType.BoolTrue:
      return { value: { type: 'bool', value: true }, bytesConsumed: 0 };

    case HeaderValueType.BoolFalse:
      return { value: { type: 'bool', value: false }, bytesConsumed: 0 };

    case HeaderValueType.Byte:
      ensureBytes(data, offset, 1);
      return { value: { type: 'byte', value: view.getInt8(0) }, bytesConsumed: 1 };

    case HeaderValueType.Short:
      ensureBytes(data, offset, 2);
      return { value: { type: 'short', value: view.getInt16(0, false) }, bytesConsumed: 2 };

    case HeaderValueType.Integer:
      ensureBytes(data, offset, 4);
      return { value: { type: 'integer', value: view.getInt32(0, false) }, bytesConsumed: 4 };

    case HeaderValueType.Long:
      ensureBytes(data, offset, 8);
      return { value: { type: 'long', value: view.getBigInt64(0, false) }, bytesConsumed: 8 };

    case HeaderValueType.Timestamp:
      ensureBytes(data, offset, 8);
      return { value: { type: 'timestamp', value: view.getBigInt64(0, false) }, bytesConsumed: 8 };

    case HeaderValueType.ByteArray: {
      ensureBytes(data, offset, 2);
      const len = view.getUint16(0, false);
      ensureBytes(data, offset, 2 + len);
      const bytes = data.slice(offset + 2, offset + 2 + len);
      return { value: { type: 'byteArray', value: bytes }, bytesConsumed: 2 + len };
    }

    case HeaderValueType.String: {
      ensureBytes(data, offset, 2);
      const len = view.getUint16(0, false);
      ensureBytes(data, offset, 2 + len);
      const bytes = data.slice(offset + 2, offset + 2 + len);
      const str = new TextDecoder().decode(bytes);
      return { value: { type: 'string', value: str }, bytesConsumed: 2 + len };
    }

    case HeaderValueType.Uuid:
      ensureBytes(data, offset, 16);
      const uuid = data.slice(offset, offset + 16);
      return { value: { type: 'uuid', value: uuid }, bytesConsumed: 16 };

    default:
      throw new InvalidHeaderTypeError(valueType);
  }
}

/**
 * Ensure sufficient bytes are available
 */
function ensureBytes(data: Uint8Array, offset: number, needed: number): void {
  const available = data.length - offset;
  if (available < needed) {
    throw new IncompleteDataError(needed, available);
  }
}
