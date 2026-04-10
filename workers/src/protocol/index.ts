/**
 * AWS Event Stream protocol parser
 * 
 * Exports decoder, frame parser, header parser, CRC32, SSE builder, and error types
 */

export { EventStreamDecoder, DecoderState, DEFAULT_MAX_BUFFER_SIZE, DEFAULT_MAX_ERRORS, DEFAULT_BUFFER_CAPACITY } from './decoder';
export { Frame, parseFrame, PRELUDE_SIZE, MIN_MESSAGE_SIZE, MAX_MESSAGE_SIZE, ParseFrameResult } from './frame';
export { Headers, HeaderValue, HeaderValueType, parseHeaders } from './header';
export { crc32 } from './crc32';
export { SSEBuilder } from './sse-builder';
export {
  ParseError,
  IncompleteDataError,
  PreludeCrcMismatchError,
  MessageCrcMismatchError,
  InvalidHeaderTypeError,
  HeaderParseError,
  MessageTooLargeError,
  MessageTooSmallError,
  BufferOverflowError,
  TooManyErrorsError,
} from './errors';
