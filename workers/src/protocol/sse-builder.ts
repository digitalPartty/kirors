/**
 * SSE Builder - Converts Kiro API events to Anthropic Server-Sent Events
 * 
 * This module implements a state machine that processes Kiro events and generates
 * properly ordered SSE events according to Anthropic's streaming specification.
 */

import type {
  KiroEvent,
  AssistantResponseEvent,
  ToolUseEvent,
  ContextUsageEvent,
} from '../types/kiro';
import type {
  SSEEvent,
  MessageStartEvent,
  ContentBlockStartEvent,
  ContentBlockDeltaEvent,
  ContentBlockStopEvent,
  MessageDeltaEvent,
  MessageStopEvent,
} from '../types/anthropic';

/**
 * State machine states for message lifecycle
 */
enum MessageState {
  IDLE = 'idle',
  MESSAGE_STARTED = 'message_started',
  CONTENT_BLOCK_ACTIVE = 'content_block_active',
  MESSAGE_COMPLETE = 'message_complete',
}

/**
 * Content block state tracking
 */
interface BlockState {
  type: string; // 'text' | 'thinking' | 'tool_use'
  started: boolean;
  stopped: boolean;
}

/**
 * SSE Builder class - manages state machine and event conversion
 */
export class SSEBuilder {
  private state: MessageState = MessageState.IDLE;
  private messageStarted = false;
  private messageDeltaSent = false;
  private activeBlocks = new Map<number, BlockState>();
  private nextBlockIndex = 0;
  private stopReason: string | null = null;
  private hasToolUse = false;
  
  // Usage tracking
  private inputTokens = 0;
  private outputTokens = 0;
  private thinkingTokens = 0;
  
  // Message metadata
  private messageId: string;
  private model: string;

  constructor(model: string, messageId: string) {
    this.model = model;
    this.messageId = messageId;
  }

  /**
   * Process a Kiro event and return corresponding SSE events
   */
  processKiroEvent(event: KiroEvent): SSEEvent[] {
    switch (event.type) {
      case 'assistantResponseEvent':
        return this.processAssistantResponse(event);
      case 'toolUseEvent':
        return this.processToolUse(event);
      case 'contextUsageEvent':
        return this.processContextUsage(event);
      case 'error':
      case 'exception':
        // Error events are handled separately by the caller
        return [];
      default:
        return [];
    }
  }

  /**
   * Process assistant response event
   */
  private processAssistantResponse(event: AssistantResponseEvent): SSEEvent[] {
    const events: SSEEvent[] = [];

    // Handle messageStart
    if (event.messageStart) {
      const messageStartEvent = this.handleMessageStart();
      if (messageStartEvent) {
        events.push(messageStartEvent);
      }
    }

    // Handle contentBlockStart
    if (event.contentBlockStart) {
      const blockStartEvents = this.handleContentBlockStart(
        event.contentBlockStart.blockIndex,
        event.contentBlockStart.contentBlock.type,
        event.contentBlockStart.contentBlock
      );
      events.push(...blockStartEvents);
    }

    // Handle contentBlockDelta
    if (event.contentBlockDelta) {
      const deltaEvent = this.handleContentBlockDelta(
        event.contentBlockDelta.blockIndex,
        event.contentBlockDelta.delta
      );
      if (deltaEvent) {
        events.push(deltaEvent);
      }
    }

    // Handle contentBlockStop
    if (event.contentBlockStop) {
      const stopEvent = this.handleContentBlockStop(event.contentBlockStop.blockIndex);
      if (stopEvent) {
        events.push(stopEvent);
      }
    }

    // Handle messageStop
    if (event.messageStop) {
      if (event.messageStop.stopReason) {
        this.stopReason = event.messageStop.stopReason;
      }
    }

    return events;
  }

  /**
   * Handle message_start event
   */
  private handleMessageStart(): MessageStartEvent | null {
    if (this.messageStarted) {
      return null;
    }

    this.messageStarted = true;
    this.state = MessageState.MESSAGE_STARTED;

    return {
      type: 'message_start',
      message: {
        id: this.messageId,
        type: 'message',
        role: 'assistant',
        content: [],
        model: this.model,
        stop_reason: null,
        stop_sequence: null,
        usage: {
          input_tokens: this.inputTokens,
          output_tokens: 1,
        },
      },
    };
  }

  /**
   * Handle content_block_start event
   */
  private handleContentBlockStart(
    index: number,
    blockType: string,
    contentBlock: any
  ): SSEEvent[] {
    const events: SSEEvent[] = [];

    // If starting a tool_use block, close any open text blocks first
    if (blockType === 'tool_use') {
      this.hasToolUse = true;
      for (const [blockIndex, block] of this.activeBlocks.entries()) {
        if (block.type === 'text' && block.started && !block.stopped) {
          events.push({
            type: 'content_block_stop',
            index: blockIndex,
          });
          block.stopped = true;
        }
      }
    }

    // Check if block already exists
    let block = this.activeBlocks.get(index);
    if (block) {
      if (block.started) {
        return events; // Already started, skip
      }
      block.started = true;
    } else {
      block = {
        type: blockType,
        started: true,
        stopped: false,
      };
      this.activeBlocks.set(index, block);
    }

    this.state = MessageState.CONTENT_BLOCK_ACTIVE;

    // Create content_block_start event
    const startEvent: ContentBlockStartEvent = {
      type: 'content_block_start',
      index,
      content_block: this.createContentBlock(blockType, contentBlock),
    };

    events.push(startEvent);
    return events;
  }

  /**
   * Create content block based on type
   */
  private createContentBlock(blockType: string, contentBlock: any): any {
    switch (blockType) {
      case 'text':
        return {
          type: 'text',
          text: contentBlock.text || '',
        };
      case 'thinking':
        return {
          type: 'thinking',
          thinking: contentBlock.thinking || '',
        };
      case 'tool_use':
        return {
          type: 'tool_use',
          id: contentBlock.toolUseId || '',
          name: contentBlock.toolName || '',
          input: {},
        };
      default:
        return { type: blockType };
    }
  }

  /**
   * Handle content_block_delta event
   */
  private handleContentBlockDelta(index: number, delta: any): ContentBlockDeltaEvent | null {
    const block = this.activeBlocks.get(index);
    if (!block || !block.started || block.stopped) {
      return null;
    }

    // Create delta based on type
    const deltaContent: any = { type: delta.type };

    if (delta.text !== undefined) {
      deltaContent.type = 'text_delta';
      deltaContent.text = delta.text;
      // Estimate output tokens (rough approximation)
      this.outputTokens += Math.max(1, Math.floor(delta.text.length / 4));
    } else if (delta.thinking !== undefined) {
      deltaContent.type = 'thinking_delta';
      deltaContent.thinking = delta.thinking;
      // Track thinking tokens separately
      this.thinkingTokens += Math.max(1, Math.floor(delta.thinking.length / 4));
    } else if (delta.toolInput !== undefined) {
      deltaContent.type = 'input_json_delta';
      deltaContent.partial_json = delta.toolInput;
      this.outputTokens += Math.max(1, Math.floor(delta.toolInput.length / 4));
    }

    return {
      type: 'content_block_delta',
      index,
      delta: deltaContent,
    };
  }

  /**
   * Handle content_block_stop event
   */
  private handleContentBlockStop(index: number): ContentBlockStopEvent | null {
    const block = this.activeBlocks.get(index);
    if (!block || block.stopped) {
      return null;
    }

    block.stopped = true;

    return {
      type: 'content_block_stop',
      index,
    };
  }

  /**
   * Process tool use event
   */
  private processToolUse(event: ToolUseEvent): SSEEvent[] {
    const events: SSEEvent[] = [];
    this.hasToolUse = true;

    // Tool use events are typically handled through assistantResponseEvent
    // This is a fallback for direct tool use events
    
    return events;
  }

  /**
   * Process context usage event
   */
  private processContextUsage(event: ContextUsageEvent): SSEEvent[] {
    // Update token counts from context usage event
    if (event.inputTokens !== undefined) {
      this.inputTokens = event.inputTokens;
    }
    if (event.outputTokens !== undefined) {
      this.outputTokens = event.outputTokens;
    }
    if (event.thinkingTokens !== undefined) {
      this.thinkingTokens = event.thinkingTokens;
    }

    return [];
  }

  /**
   * Generate final events (message_delta and message_stop)
   */
  generateFinalEvents(): SSEEvent[] {
    const events: SSEEvent[] = [];

    // Close any open blocks
    for (const [index, block] of this.activeBlocks.entries()) {
      if (block.started && !block.stopped) {
        events.push({
          type: 'content_block_stop',
          index,
        });
        block.stopped = true;
      }
    }

    // Send message_delta
    if (!this.messageDeltaSent) {
      this.messageDeltaSent = true;
      const finalStopReason = this.getFinalStopReason();
      
      const messageDelta: MessageDeltaEvent = {
        type: 'message_delta',
        delta: {
          stop_reason: finalStopReason,
          stop_sequence: null,
        },
        usage: {
          output_tokens: this.outputTokens,
        },
      };
      events.push(messageDelta);
    }

    // Send message_stop
    const messageStop: MessageStopEvent = {
      type: 'message_stop',
    };
    events.push(messageStop);

    this.state = MessageState.MESSAGE_COMPLETE;

    return events;
  }

  /**
   * Get final stop reason
   */
  private getFinalStopReason(): string {
    if (this.stopReason) {
      return this.stopReason;
    }
    if (this.hasToolUse) {
      return 'tool_use';
    }
    return 'end_turn';
  }

  /**
   * Check if a block is open and of the expected type
   */
  private isBlockOpenOfType(index: number, expectedType: string): boolean {
    const block = this.activeBlocks.get(index);
    return block !== undefined && block.started && !block.stopped && block.type === expectedType;
  }

  /**
   * Get the next block index
   */
  getNextBlockIndex(): number {
    return this.nextBlockIndex++;
  }

  /**
   * Get current input tokens
   */
  getInputTokens(): number {
    return this.inputTokens;
  }

  /**
   * Get current output tokens
   */
  getOutputTokens(): number {
    return this.outputTokens;
  }

  /**
   * Get current thinking tokens
   */
  getThinkingTokens(): number {
    return this.thinkingTokens;
  }

  /**
   * Set input tokens (for initial estimation)
   */
  setInputTokens(tokens: number): void {
    this.inputTokens = tokens;
  }
}
