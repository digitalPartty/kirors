/**
 * AWS Event Stream parsing error types
 */

export class ParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ParseError';
  }
}

export class IncompleteDataError extends ParseError {
  constructor(public needed: number, public available: number) {
    super(`Incomplete data: needed ${needed} bytes, available ${available} bytes`);
    this.name = 'IncompleteDataError';
  }
}

export class PreludeCrcMismatchError extends ParseError {
  constructor(public expected: number, public actual: number) {
    super(`Prelude CRC mismatch: expected 0x${expected.toString(16).padStart(8, '0')}, actual 0x${actual.toString(16).padStart(8, '0')}`);
    this.name = 'PreludeCrcMismatchError';
  }
}

export class MessageCrcMismatchError extends ParseError {
  constructor(public expected: number, public actual: number) {
    super(`Message CRC mismatch: expected 0x${expected.toString(16).padStart(8, '0')}, actual 0x${actual.toString(16).padStart(8, '0')}`);
    this.name = 'MessageCrcMismatchError';
  }
}

export class InvalidHeaderTypeError extends ParseError {
  constructor(public headerType: number) {
    super(`Invalid header type: ${headerType}`);
    this.name = 'InvalidHeaderTypeError';
  }
}

export class HeaderParseError extends ParseError {
  constructor(message: string) {
    super(`Header parse failed: ${message}`);
    this.name = 'HeaderParseError';
  }
}

export class MessageTooLargeError extends ParseError {
  constructor(public length: number, public max: number) {
    super(`Message too large: ${length} bytes (max ${max})`);
    this.name = 'MessageTooLargeError';
  }
}

export class MessageTooSmallError extends ParseError {
  constructor(public length: number, public min: number) {
    super(`Message too small: ${length} bytes (min ${min})`);
    this.name = 'MessageTooSmallError';
  }
}

export class BufferOverflowError extends ParseError {
  constructor(public size: number, public max: number) {
    super(`Buffer overflow: ${size} bytes (max ${max})`);
    this.name = 'BufferOverflowError';
  }
}

export class TooManyErrorsError extends ParseError {
  constructor(public count: number, public lastError: string) {
    super(`Too many consecutive errors (${count}), decoder stopped: ${lastError}`);
    this.name = 'TooManyErrorsError';
  }
}
