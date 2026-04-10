/**
 * Unit tests for SSEBuilder
 */

import { describe, it, expect } from 'vitest';
import { SSEBuilder } from './sse-builder';
import type {
  AssistantResponseEvent,
  ToolUseEvent,
  ContextUsageEvent,
} from '../types/kiro';

describe('SSEBuilder', () => {
  describe('State Machine', () => {
    it('should handle message_start event', () => {
      const builder = new SSEBuilder('claude-sonnet-4.5', 'msg_123');
      
      const event: AssistantResponseEvent = {
        type: 'assistantResponseEvent',
        messageStart: {
          conversationId: 'conv_123',
          messageId: 'msg_123',
          role: 'assistant',
        },
      };

      const sseEvents = builder.processKiroEvent(event);
      
      expect(sseEvents).toHaveLength(1);
      expect(sseEvents[0].type).toBe('message_start');
      expect(sseEvents[0]).toHaveProperty('message');
      
      const messageStart = sseEvents[0] as any;
      expect(messageStart.message.id).toBe('msg_123');
      expect(messageStart.message.role).toBe('assistant');
      expect(messageStart.message.model).toBe('claude-sonnet-4.5');
    });

    it('should skip duplicate message_start events', () => {
      const builder = new SSEBuilder('claude-sonnet-4.5', 'msg_123');
      
      const event: AssistantResponseEvent = {
        type: 'assistantResponseEvent',
        messageStart: {
          conversationId: 'conv_123',
          messageId: 'msg_123',
          role: 'assistant',
        },
      };

      // First call should return event
      const firstEvents = builder.processKiroEvent(event);
      expect(firstEvents).toHaveLength(1);

      // Second call should skip
      const secondEvents = builder.processKiroEvent(event);
      expect(secondEvents).toHaveLength(0);
    });

    it('should handle content_block_start for text', () => {
      const builder = new SSEBuilder('claude-sonnet-4.5', 'msg_123');
      
      const event: AssistantResponseEvent = {
        type: 'assistantResponseEvent',
        contentBlockStart: {
          blockIndex: 0,
          contentBlock: {
            type: 'text',
            text: '',
          },
        },
      };

      const sseEvents = builder.processKiroEvent(event);
      
      expect(sseEvents).toHaveLength(1);
      expect(sseEvents[0].type).toBe('content_block_start');
      
      const blockStart = sseEvents[0] as any;
      expect(blockStart.index).toBe(0);
      expect(blockStart.content_block.type).toBe('text');
      expect(blockStart.content_block.text).toBe('');
    });

    it('should handle content_block_delta for text', () => {
      const builder = new SSEBuilder('claude-sonnet-4.5', 'msg_123');
      
      // Start block first
      const startEvent: AssistantResponseEvent = {
        type: 'assistantResponseEvent',
        contentBlockStart: {
          blockIndex: 0,
          contentBlock: {
            type: 'text',
            text: '',
          },
        },
      };
      builder.processKiroEvent(startEvent);

      // Send delta
      const deltaEvent: AssistantResponseEvent = {
        type: 'assistantResponseEvent',
        contentBlockDelta: {
          blockIndex: 0,
          delta: {
            type: 'text',
            text: 'Hello',
          },
        },
      };

      const sseEvents = builder.processKiroEvent(deltaEvent);
      
      expect(sseEvents).toHaveLength(1);
      expect(sseEvents[0].type).toBe('content_block_delta');
      
      const blockDelta = sseEvents[0] as any;
      expect(blockDelta.index).toBe(0);
      expect(blockDelta.delta.type).toBe('text_delta');
      expect(blockDelta.delta.text).toBe('Hello');
    });

    it('should handle content_block_stop', () => {
      const builder = new SSEBuilder('claude-sonnet-4.5', 'msg_123');
      
      // Start block first
      const startEvent: AssistantResponseEvent = {
        type: 'assistantResponseEvent',
        contentBlockStart: {
          blockIndex: 0,
          contentBlock: {
            type: 'text',
            text: '',
          },
        },
      };
      builder.processKiroEvent(startEvent);

      // Stop block
      const stopEvent: AssistantResponseEvent = {
        type: 'assistantResponseEvent',
        contentBlockStop: {
          blockIndex: 0,
        },
      };

      const sseEvents = builder.processKiroEvent(stopEvent);
      
      expect(sseEvents).toHaveLength(1);
      expect(sseEvents[0].type).toBe('content_block_stop');
      
      const blockStop = sseEvents[0] as any;
      expect(blockStop.index).toBe(0);
    });

    it('should skip duplicate content_block_stop', () => {
      const builder = new SSEBuilder('claude-sonnet-4.5', 'msg_123');
      
      // Start block
      const startEvent: AssistantResponseEvent = {
        type: 'assistantResponseEvent',
        contentBlockStart: {
          blockIndex: 0,
          contentBlock: {
            type: 'text',
            text: '',
          },
        },
      };
      builder.processKiroEvent(startEvent);

      // Stop block
      const stopEvent: AssistantResponseEvent = {
        type: 'assistantResponseEvent',
        contentBlockStop: {
          blockIndex: 0,
        },
      };

      const firstStop = builder.processKiroEvent(stopEvent);
      expect(firstStop).toHaveLength(1);

      const secondStop = builder.processKiroEvent(stopEvent);
      expect(secondStop).toHaveLength(0);
    });
  });

  describe('Thinking Block Processing', () => {
    it('should handle thinking content block', () => {
      const builder = new SSEBuilder('claude-sonnet-4.5', 'msg_123');
      
      const startEvent: AssistantResponseEvent = {
        type: 'assistantResponseEvent',
        contentBlockStart: {
          blockIndex: 0,
          contentBlock: {
            type: 'thinking',
            thinking: '',
          },
        },
      };

      const sseEvents = builder.processKiroEvent(startEvent);
      
      expect(sseEvents).toHaveLength(1);
      expect(sseEvents[0].type).toBe('content_block_start');
      
      const blockStart = sseEvents[0] as any;
      expect(blockStart.content_block.type).toBe('thinking');
    });

    it('should handle thinking_delta', () => {
      const builder = new SSEBuilder('claude-sonnet-4.5', 'msg_123');
      
      // Start thinking block
      const startEvent: AssistantResponseEvent = {
        type: 'assistantResponseEvent',
        contentBlockStart: {
          blockIndex: 0,
          contentBlock: {
            type: 'thinking',
            thinking: '',
          },
        },
      };
      builder.processKiroEvent(startEvent);

      // Send thinking delta
      const deltaEvent: AssistantResponseEvent = {
        type: 'assistantResponseEvent',
        contentBlockDelta: {
          blockIndex: 0,
          delta: {
            type: 'thinking',
            thinking: 'Let me think...',
          },
        },
      };

      const sseEvents = builder.processKiroEvent(deltaEvent);
      
      expect(sseEvents).toHaveLength(1);
      expect(sseEvents[0].type).toBe('content_block_delta');
      
      const blockDelta = sseEvents[0] as any;
      expect(blockDelta.delta.type).toBe('thinking_delta');
      expect(blockDelta.delta.thinking).toBe('Let me think...');
    });

    it('should track thinking token usage separately from output tokens', () => {
      const builder = new SSEBuilder('claude-sonnet-4.5', 'msg_123');
      
      // Start thinking block
      const startEvent: AssistantResponseEvent = {
        type: 'assistantResponseEvent',
        contentBlockStart: {
          blockIndex: 0,
          contentBlock: {
            type: 'thinking',
            thinking: '',
          },
        },
      };
      builder.processKiroEvent(startEvent);

      // Send thinking delta
      const deltaEvent: AssistantResponseEvent = {
        type: 'assistantResponseEvent',
        contentBlockDelta: {
          blockIndex: 0,
          delta: {
            type: 'thinking',
            thinking: 'This is a thinking block with some content',
          },
        },
      };

      builder.processKiroEvent(deltaEvent);
      
      // Thinking tokens should be updated, not output tokens
      expect(builder.getThinkingTokens()).toBeGreaterThan(0);
      expect(builder.getOutputTokens()).toBe(0);
    });

    it('should handle thinking block stop event', () => {
      const builder = new SSEBuilder('claude-sonnet-4.5', 'msg_123');
      
      // Start thinking block
      const startEvent: AssistantResponseEvent = {
        type: 'assistantResponseEvent',
        contentBlockStart: {
          blockIndex: 0,
          contentBlock: {
            type: 'thinking',
            thinking: '',
          },
        },
      };
      builder.processKiroEvent(startEvent);

      // Stop thinking block
      const stopEvent: AssistantResponseEvent = {
        type: 'assistantResponseEvent',
        contentBlockStop: {
          blockIndex: 0,
        },
      };

      const sseEvents = builder.processKiroEvent(stopEvent);
      
      expect(sseEvents).toHaveLength(1);
      expect(sseEvents[0].type).toBe('content_block_stop');
      expect((sseEvents[0] as any).index).toBe(0);
    });

    it('should process thinking tokens from context usage event', () => {
      const builder = new SSEBuilder('claude-sonnet-4.5', 'msg_123');
      
      const usageEvent: ContextUsageEvent = {
        type: 'contextUsageEvent',
        inputTokens: 100,
        outputTokens: 50,
        thinkingTokens: 200,
      };

      builder.processKiroEvent(usageEvent);
      
      expect(builder.getInputTokens()).toBe(100);
      expect(builder.getOutputTokens()).toBe(50);
      expect(builder.getThinkingTokens()).toBe(200);
    });

    it('should handle complete thinking block flow', () => {
      const builder = new SSEBuilder('claude-sonnet-4.5', 'msg_123');
      const allEvents: any[] = [];

      // Start thinking block
      const startEvent: AssistantResponseEvent = {
        type: 'assistantResponseEvent',
        contentBlockStart: {
          blockIndex: 0,
          contentBlock: {
            type: 'thinking',
            thinking: '',
          },
        },
      };
      allEvents.push(...builder.processKiroEvent(startEvent));

      // Send multiple thinking deltas
      const delta1: AssistantResponseEvent = {
        type: 'assistantResponseEvent',
        contentBlockDelta: {
          blockIndex: 0,
          delta: {
            type: 'thinking',
            thinking: 'Let me analyze this problem...',
          },
        },
      };
      allEvents.push(...builder.processKiroEvent(delta1));

      const delta2: AssistantResponseEvent = {
        type: 'assistantResponseEvent',
        contentBlockDelta: {
          blockIndex: 0,
          delta: {
            type: 'thinking',
            thinking: ' I need to consider multiple factors.',
          },
        },
      };
      allEvents.push(...builder.processKiroEvent(delta2));

      // Stop thinking block
      const stopEvent: AssistantResponseEvent = {
        type: 'assistantResponseEvent',
        contentBlockStop: {
          blockIndex: 0,
        },
      };
      allEvents.push(...builder.processKiroEvent(stopEvent));

      // Verify event sequence
      expect(allEvents).toHaveLength(4);
      expect(allEvents[0].type).toBe('content_block_start');
      expect(allEvents[0].content_block.type).toBe('thinking');
      expect(allEvents[1].type).toBe('content_block_delta');
      expect(allEvents[1].delta.type).toBe('thinking_delta');
      expect(allEvents[2].type).toBe('content_block_delta');
      expect(allEvents[2].delta.type).toBe('thinking_delta');
      expect(allEvents[3].type).toBe('content_block_stop');

      // Verify thinking tokens were tracked
      expect(builder.getThinkingTokens()).toBeGreaterThan(0);
      expect(builder.getOutputTokens()).toBe(0);
    });

    it('should transition from thinking to text content blocks', () => {
      const builder = new SSEBuilder('claude-sonnet-4.5', 'msg_123');
      const allEvents: any[] = [];

      // Start thinking block
      const thinkingStart: AssistantResponseEvent = {
        type: 'assistantResponseEvent',
        contentBlockStart: {
          blockIndex: 0,
          contentBlock: {
            type: 'thinking',
            thinking: '',
          },
        },
      };
      allEvents.push(...builder.processKiroEvent(thinkingStart));

      // Thinking delta
      const thinkingDelta: AssistantResponseEvent = {
        type: 'assistantResponseEvent',
        contentBlockDelta: {
          blockIndex: 0,
          delta: {
            type: 'thinking',
            thinking: 'Analyzing...',
          },
        },
      };
      allEvents.push(...builder.processKiroEvent(thinkingDelta));

      // Stop thinking block
      const thinkingStop: AssistantResponseEvent = {
        type: 'assistantResponseEvent',
        contentBlockStop: {
          blockIndex: 0,
        },
      };
      allEvents.push(...builder.processKiroEvent(thinkingStop));

      // Start text block
      const textStart: AssistantResponseEvent = {
        type: 'assistantResponseEvent',
        contentBlockStart: {
          blockIndex: 1,
          contentBlock: {
            type: 'text',
            text: '',
          },
        },
      };
      allEvents.push(...builder.processKiroEvent(textStart));

      // Text delta
      const textDelta: AssistantResponseEvent = {
        type: 'assistantResponseEvent',
        contentBlockDelta: {
          blockIndex: 1,
          delta: {
            type: 'text',
            text: 'Here is my response',
          },
        },
      };
      allEvents.push(...builder.processKiroEvent(textDelta));

      // Verify thinking and output tokens are tracked separately
      expect(builder.getThinkingTokens()).toBeGreaterThan(0);
      expect(builder.getOutputTokens()).toBeGreaterThan(0);

      // Verify event types
      expect(allEvents[0].content_block.type).toBe('thinking');
      expect(allEvents[1].delta.type).toBe('thinking_delta');
      expect(allEvents[3].content_block.type).toBe('text');
      expect(allEvents[4].delta.type).toBe('text_delta');
    });
  });

  describe('Tool Use Block Processing', () => {
    it('should handle tool_use content block', () => {
      const builder = new SSEBuilder('claude-sonnet-4.5', 'msg_123');
      
      const startEvent: AssistantResponseEvent = {
        type: 'assistantResponseEvent',
        contentBlockStart: {
          blockIndex: 0,
          contentBlock: {
            type: 'tool_use',
            toolUseId: 'tool_123',
            toolName: 'calculator',
          },
        },
      };

      const sseEvents = builder.processKiroEvent(startEvent);
      
      expect(sseEvents).toHaveLength(1);
      expect(sseEvents[0].type).toBe('content_block_start');
      
      const blockStart = sseEvents[0] as any;
      expect(blockStart.content_block.type).toBe('tool_use');
      expect(blockStart.content_block.id).toBe('tool_123');
      expect(blockStart.content_block.name).toBe('calculator');
    });

    it('should close text block when tool_use starts', () => {
      const builder = new SSEBuilder('claude-sonnet-4.5', 'msg_123');
      
      // Start text block
      const textStartEvent: AssistantResponseEvent = {
        type: 'assistantResponseEvent',
        contentBlockStart: {
          blockIndex: 0,
          contentBlock: {
            type: 'text',
            text: '',
          },
        },
      };
      builder.processKiroEvent(textStartEvent);

      // Start tool_use block (should close text block)
      const toolStartEvent: AssistantResponseEvent = {
        type: 'assistantResponseEvent',
        contentBlockStart: {
          blockIndex: 1,
          contentBlock: {
            type: 'tool_use',
            toolUseId: 'tool_123',
            toolName: 'calculator',
          },
        },
      };

      const sseEvents = builder.processKiroEvent(toolStartEvent);
      
      // Should have content_block_stop for text and content_block_start for tool_use
      expect(sseEvents.length).toBeGreaterThanOrEqual(2);
      expect(sseEvents[0].type).toBe('content_block_stop');
      expect((sseEvents[0] as any).index).toBe(0);
      expect(sseEvents[1].type).toBe('content_block_start');
      expect((sseEvents[1] as any).content_block.type).toBe('tool_use');
    });

    it('should handle input_json_delta', () => {
      const builder = new SSEBuilder('claude-sonnet-4.5', 'msg_123');
      
      // Start tool_use block
      const startEvent: AssistantResponseEvent = {
        type: 'assistantResponseEvent',
        contentBlockStart: {
          blockIndex: 0,
          contentBlock: {
            type: 'tool_use',
            toolUseId: 'tool_123',
            toolName: 'calculator',
          },
        },
      };
      builder.processKiroEvent(startEvent);

      // Send input delta
      const deltaEvent: AssistantResponseEvent = {
        type: 'assistantResponseEvent',
        contentBlockDelta: {
          blockIndex: 0,
          delta: {
            type: 'toolInput',
            toolInput: '{"operation": "add"}',
          },
        },
      };

      const sseEvents = builder.processKiroEvent(deltaEvent);
      
      expect(sseEvents).toHaveLength(1);
      expect(sseEvents[0].type).toBe('content_block_delta');
      
      const blockDelta = sseEvents[0] as any;
      expect(blockDelta.delta.type).toBe('input_json_delta');
      expect(blockDelta.delta.partial_json).toBe('{"operation": "add"}');
    });

    it('should set stop_reason to tool_use', () => {
      const builder = new SSEBuilder('claude-sonnet-4.5', 'msg_123');
      
      // Start tool_use block
      const startEvent: AssistantResponseEvent = {
        type: 'assistantResponseEvent',
        contentBlockStart: {
          blockIndex: 0,
          contentBlock: {
            type: 'tool_use',
            toolUseId: 'tool_123',
            toolName: 'calculator',
          },
        },
      };
      builder.processKiroEvent(startEvent);

      // Generate final events
      const finalEvents = builder.generateFinalEvents();
      
      const messageDelta = finalEvents.find(e => e.type === 'message_delta') as any;
      expect(messageDelta).toBeDefined();
      expect(messageDelta.delta.stop_reason).toBe('tool_use');
    });

    it('should accumulate tool input JSON across multiple delta events', () => {
      const builder = new SSEBuilder('claude-sonnet-4.5', 'msg_123');
      
      // Start tool_use block
      const startEvent: AssistantResponseEvent = {
        type: 'assistantResponseEvent',
        contentBlockStart: {
          blockIndex: 0,
          contentBlock: {
            type: 'tool_use',
            toolUseId: 'tool_123',
            toolName: 'calculator',
          },
        },
      };
      builder.processKiroEvent(startEvent);

      // Send multiple input deltas
      const delta1: AssistantResponseEvent = {
        type: 'assistantResponseEvent',
        contentBlockDelta: {
          blockIndex: 0,
          delta: {
            type: 'toolInput',
            toolInput: '{"operation": "',
          },
        },
      };
      const events1 = builder.processKiroEvent(delta1);
      expect(events1).toHaveLength(1);
      expect((events1[0] as any).delta.partial_json).toBe('{"operation": "');

      const delta2: AssistantResponseEvent = {
        type: 'assistantResponseEvent',
        contentBlockDelta: {
          blockIndex: 0,
          delta: {
            type: 'toolInput',
            toolInput: 'add", "a": 5',
          },
        },
      };
      const events2 = builder.processKiroEvent(delta2);
      expect(events2).toHaveLength(1);
      expect((events2[0] as any).delta.partial_json).toBe('add", "a": 5');

      const delta3: AssistantResponseEvent = {
        type: 'assistantResponseEvent',
        contentBlockDelta: {
          blockIndex: 0,
          delta: {
            type: 'toolInput',
            toolInput: ', "b": 3}',
          },
        },
      };
      const events3 = builder.processKiroEvent(delta3);
      expect(events3).toHaveLength(1);
      expect((events3[0] as any).delta.partial_json).toBe(', "b": 3}');
    });

    it('should handle complete tool use flow with all event types', () => {
      const builder = new SSEBuilder('claude-sonnet-4.5', 'msg_123');
      const allEvents: any[] = [];

      // Message start
      const messageStart: AssistantResponseEvent = {
        type: 'assistantResponseEvent',
        messageStart: {
          conversationId: 'conv_123',
          messageId: 'msg_123',
          role: 'assistant',
        },
      };
      allEvents.push(...builder.processKiroEvent(messageStart));

      // Start tool_use block
      const toolStart: AssistantResponseEvent = {
        type: 'assistantResponseEvent',
        contentBlockStart: {
          blockIndex: 0,
          contentBlock: {
            type: 'tool_use',
            toolUseId: 'tool_abc123',
            toolName: 'get_weather',
          },
        },
      };
      allEvents.push(...builder.processKiroEvent(toolStart));

      // Send tool input deltas
      const delta1: AssistantResponseEvent = {
        type: 'assistantResponseEvent',
        contentBlockDelta: {
          blockIndex: 0,
          delta: {
            type: 'toolInput',
            toolInput: '{"location": "',
          },
        },
      };
      allEvents.push(...builder.processKiroEvent(delta1));

      const delta2: AssistantResponseEvent = {
        type: 'assistantResponseEvent',
        contentBlockDelta: {
          blockIndex: 0,
          delta: {
            type: 'toolInput',
            toolInput: 'San Francisco", "unit": "celsius"}',
          },
        },
      };
      allEvents.push(...builder.processKiroEvent(delta2));

      // Stop tool_use block
      const toolStop: AssistantResponseEvent = {
        type: 'assistantResponseEvent',
        contentBlockStop: {
          blockIndex: 0,
        },
      };
      allEvents.push(...builder.processKiroEvent(toolStop));

      // Message stop
      const messageStop: AssistantResponseEvent = {
        type: 'assistantResponseEvent',
        messageStop: {
          stopReason: 'tool_use',
        },
      };
      builder.processKiroEvent(messageStop);

      // Generate final events
      allEvents.push(...builder.generateFinalEvents());

      // Verify event sequence
      expect(allEvents[0].type).toBe('message_start');
      expect(allEvents[1].type).toBe('content_block_start');
      expect(allEvents[1].content_block.type).toBe('tool_use');
      expect(allEvents[1].content_block.id).toBe('tool_abc123');
      expect(allEvents[1].content_block.name).toBe('get_weather');
      expect(allEvents[1].content_block.input).toEqual({});
      
      expect(allEvents[2].type).toBe('content_block_delta');
      expect(allEvents[2].delta.type).toBe('input_json_delta');
      expect(allEvents[2].delta.partial_json).toBe('{"location": "');
      
      expect(allEvents[3].type).toBe('content_block_delta');
      expect(allEvents[3].delta.type).toBe('input_json_delta');
      expect(allEvents[3].delta.partial_json).toBe('San Francisco", "unit": "celsius"}');
      
      expect(allEvents[4].type).toBe('content_block_stop');
      expect(allEvents[4].index).toBe(0);
      
      expect(allEvents[5].type).toBe('message_delta');
      expect(allEvents[5].delta.stop_reason).toBe('tool_use');
      
      expect(allEvents[6].type).toBe('message_stop');
    });

    it('should handle tool_use block stop event', () => {
      const builder = new SSEBuilder('claude-sonnet-4.5', 'msg_123');
      
      // Start tool_use block
      const startEvent: AssistantResponseEvent = {
        type: 'assistantResponseEvent',
        contentBlockStart: {
          blockIndex: 0,
          contentBlock: {
            type: 'tool_use',
            toolUseId: 'tool_123',
            toolName: 'calculator',
          },
        },
      };
      builder.processKiroEvent(startEvent);

      // Stop tool_use block
      const stopEvent: AssistantResponseEvent = {
        type: 'assistantResponseEvent',
        contentBlockStop: {
          blockIndex: 0,
        },
      };

      const sseEvents = builder.processKiroEvent(stopEvent);
      
      expect(sseEvents).toHaveLength(1);
      expect(sseEvents[0].type).toBe('content_block_stop');
      expect((sseEvents[0] as any).index).toBe(0);
    });

    it('should emit SSE events with type tool_use', () => {
      const builder = new SSEBuilder('claude-sonnet-4.5', 'msg_123');
      
      const startEvent: AssistantResponseEvent = {
        type: 'assistantResponseEvent',
        contentBlockStart: {
          blockIndex: 0,
          contentBlock: {
            type: 'tool_use',
            toolUseId: 'tool_123',
            toolName: 'search',
          },
        },
      };

      const sseEvents = builder.processKiroEvent(startEvent);
      
      // Verify the SSE event has type: "tool_use" in content_block
      expect(sseEvents).toHaveLength(1);
      expect(sseEvents[0].type).toBe('content_block_start');
      const blockStart = sseEvents[0] as any;
      expect(blockStart.content_block.type).toBe('tool_use');
    });
  });

  describe('Usage Statistics', () => {
    it('should track context usage', () => {
      const builder = new SSEBuilder('claude-sonnet-4.5', 'msg_123');
      
      const usageEvent: ContextUsageEvent = {
        type: 'contextUsageEvent',
        inputTokens: 100,
        outputTokens: 50,
      };

      builder.processKiroEvent(usageEvent);
      
      expect(builder.getInputTokens()).toBe(100);
      expect(builder.getOutputTokens()).toBe(50);
    });

    it('should accumulate output tokens from deltas', () => {
      const builder = new SSEBuilder('claude-sonnet-4.5', 'msg_123');
      
      // Start text block
      const startEvent: AssistantResponseEvent = {
        type: 'assistantResponseEvent',
        contentBlockStart: {
          blockIndex: 0,
          contentBlock: {
            type: 'text',
            text: '',
          },
        },
      };
      builder.processKiroEvent(startEvent);

      // Send multiple deltas
      const delta1: AssistantResponseEvent = {
        type: 'assistantResponseEvent',
        contentBlockDelta: {
          blockIndex: 0,
          delta: {
            type: 'text',
            text: 'Hello world',
          },
        },
      };
      builder.processKiroEvent(delta1);

      const delta2: AssistantResponseEvent = {
        type: 'assistantResponseEvent',
        contentBlockDelta: {
          blockIndex: 0,
          delta: {
            type: 'text',
            text: ' and more text',
          },
        },
      };
      builder.processKiroEvent(delta2);

      // Output tokens should accumulate
      expect(builder.getOutputTokens()).toBeGreaterThan(0);
    });
  });

  describe('Final Events Generation', () => {
    it('should generate message_delta and message_stop', () => {
      const builder = new SSEBuilder('claude-sonnet-4.5', 'msg_123');
      
      const finalEvents = builder.generateFinalEvents();
      
      expect(finalEvents.length).toBeGreaterThanOrEqual(2);
      
      const messageDelta = finalEvents.find(e => e.type === 'message_delta');
      expect(messageDelta).toBeDefined();
      
      const messageStop = finalEvents.find(e => e.type === 'message_stop');
      expect(messageStop).toBeDefined();
    });

    it('should close open blocks before final events', () => {
      const builder = new SSEBuilder('claude-sonnet-4.5', 'msg_123');
      
      // Start a text block but don't close it
      const startEvent: AssistantResponseEvent = {
        type: 'assistantResponseEvent',
        contentBlockStart: {
          blockIndex: 0,
          contentBlock: {
            type: 'text',
            text: '',
          },
        },
      };
      builder.processKiroEvent(startEvent);

      const finalEvents = builder.generateFinalEvents();
      
      // Should have content_block_stop, message_delta, message_stop
      const blockStop = finalEvents.find(e => e.type === 'content_block_stop');
      expect(blockStop).toBeDefined();
    });

    it('should use end_turn as default stop_reason', () => {
      const builder = new SSEBuilder('claude-sonnet-4.5', 'msg_123');
      
      const finalEvents = builder.generateFinalEvents();
      
      const messageDelta = finalEvents.find(e => e.type === 'message_delta') as any;
      expect(messageDelta.delta.stop_reason).toBe('end_turn');
    });

    it('should use custom stop_reason when provided', () => {
      const builder = new SSEBuilder('claude-sonnet-4.5', 'msg_123');
      
      const stopEvent: AssistantResponseEvent = {
        type: 'assistantResponseEvent',
        messageStop: {
          stopReason: 'max_tokens',
        },
      };
      builder.processKiroEvent(stopEvent);

      const finalEvents = builder.generateFinalEvents();
      
      const messageDelta = finalEvents.find(e => e.type === 'message_delta') as any;
      expect(messageDelta.delta.stop_reason).toBe('max_tokens');
    });
  });

  describe('Event Ordering', () => {
    it('should maintain correct event order for complete message flow', () => {
      const builder = new SSEBuilder('claude-sonnet-4.5', 'msg_123');
      const allEvents: any[] = [];

      // message_start
      const messageStart: AssistantResponseEvent = {
        type: 'assistantResponseEvent',
        messageStart: {
          conversationId: 'conv_123',
          messageId: 'msg_123',
          role: 'assistant',
        },
      };
      allEvents.push(...builder.processKiroEvent(messageStart));

      // content_block_start
      const blockStart: AssistantResponseEvent = {
        type: 'assistantResponseEvent',
        contentBlockStart: {
          blockIndex: 0,
          contentBlock: {
            type: 'text',
            text: '',
          },
        },
      };
      allEvents.push(...builder.processKiroEvent(blockStart));

      // content_block_delta
      const blockDelta: AssistantResponseEvent = {
        type: 'assistantResponseEvent',
        contentBlockDelta: {
          blockIndex: 0,
          delta: {
            type: 'text',
            text: 'Hello',
          },
        },
      };
      allEvents.push(...builder.processKiroEvent(blockDelta));

      // content_block_stop
      const blockStop: AssistantResponseEvent = {
        type: 'assistantResponseEvent',
        contentBlockStop: {
          blockIndex: 0,
        },
      };
      allEvents.push(...builder.processKiroEvent(blockStop));

      // Final events
      allEvents.push(...builder.generateFinalEvents());

      // Verify order
      expect(allEvents[0].type).toBe('message_start');
      expect(allEvents[1].type).toBe('content_block_start');
      expect(allEvents[2].type).toBe('content_block_delta');
      expect(allEvents[3].type).toBe('content_block_stop');
      expect(allEvents[4].type).toBe('message_delta');
      expect(allEvents[5].type).toBe('message_stop');
    });

    it('should handle complex multi-block flow: thinking → text → tool_use', () => {
      const builder = new SSEBuilder('claude-sonnet-4.5', 'msg_123');
      const allEvents: any[] = [];

      // Message start
      allEvents.push(...builder.processKiroEvent({
        type: 'assistantResponseEvent',
        messageStart: {
          conversationId: 'conv_123',
          messageId: 'msg_123',
          role: 'assistant',
        },
      }));

      // Thinking block
      allEvents.push(...builder.processKiroEvent({
        type: 'assistantResponseEvent',
        contentBlockStart: {
          blockIndex: 0,
          contentBlock: { type: 'thinking', thinking: '' },
        },
      }));
      allEvents.push(...builder.processKiroEvent({
        type: 'assistantResponseEvent',
        contentBlockDelta: {
          blockIndex: 0,
          delta: { type: 'thinking', thinking: 'Analyzing...' },
        },
      }));
      allEvents.push(...builder.processKiroEvent({
        type: 'assistantResponseEvent',
        contentBlockStop: { blockIndex: 0 },
      }));

      // Text block
      allEvents.push(...builder.processKiroEvent({
        type: 'assistantResponseEvent',
        contentBlockStart: {
          blockIndex: 1,
          contentBlock: { type: 'text', text: '' },
        },
      }));
      allEvents.push(...builder.processKiroEvent({
        type: 'assistantResponseEvent',
        contentBlockDelta: {
          blockIndex: 1,
          delta: { type: 'text', text: 'I need to use a tool.' },
        },
      }));

      // Tool use block (should auto-close text block)
      allEvents.push(...builder.processKiroEvent({
        type: 'assistantResponseEvent',
        contentBlockStart: {
          blockIndex: 2,
          contentBlock: {
            type: 'tool_use',
            toolUseId: 'tool_123',
            toolName: 'search',
          },
        },
      }));
      allEvents.push(...builder.processKiroEvent({
        type: 'assistantResponseEvent',
        contentBlockDelta: {
          blockIndex: 2,
          delta: { type: 'toolInput', toolInput: '{"query":"test"}' },
        },
      }));
      allEvents.push(...builder.processKiroEvent({
        type: 'assistantResponseEvent',
        contentBlockStop: { blockIndex: 2 },
      }));

      // Final events
      allEvents.push(...builder.generateFinalEvents());

      // Verify sequence
      expect(allEvents[0].type).toBe('message_start');
      expect(allEvents[1].type).toBe('content_block_start');
      expect(allEvents[1].content_block.type).toBe('thinking');
      expect(allEvents[2].type).toBe('content_block_delta');
      expect(allEvents[2].delta.type).toBe('thinking_delta');
      expect(allEvents[3].type).toBe('content_block_stop');
      expect(allEvents[4].type).toBe('content_block_start');
      expect(allEvents[4].content_block.type).toBe('text');
      expect(allEvents[5].type).toBe('content_block_delta');
      expect(allEvents[5].delta.type).toBe('text_delta');
      // Text block should be auto-closed when tool_use starts
      expect(allEvents[6].type).toBe('content_block_stop');
      expect(allEvents[6].index).toBe(1);
      expect(allEvents[7].type).toBe('content_block_start');
      expect(allEvents[7].content_block.type).toBe('tool_use');
      expect(allEvents[8].type).toBe('content_block_delta');
      expect(allEvents[8].delta.type).toBe('input_json_delta');
      expect(allEvents[9].type).toBe('content_block_stop');
      expect(allEvents[10].type).toBe('message_delta');
      expect(allEvents[10].delta.stop_reason).toBe('tool_use');
      expect(allEvents[11].type).toBe('message_stop');
    });

    it('should handle multiple tool use blocks in sequence', () => {
      const builder = new SSEBuilder('claude-sonnet-4.5', 'msg_123');
      const allEvents: any[] = [];

      // Message start
      allEvents.push(...builder.processKiroEvent({
        type: 'assistantResponseEvent',
        messageStart: {
          conversationId: 'conv_123',
          messageId: 'msg_123',
          role: 'assistant',
        },
      }));

      // First tool use
      allEvents.push(...builder.processKiroEvent({
        type: 'assistantResponseEvent',
        contentBlockStart: {
          blockIndex: 0,
          contentBlock: {
            type: 'tool_use',
            toolUseId: 'tool_1',
            toolName: 'search',
          },
        },
      }));
      allEvents.push(...builder.processKiroEvent({
        type: 'assistantResponseEvent',
        contentBlockDelta: {
          blockIndex: 0,
          delta: { type: 'toolInput', toolInput: '{"q":"test1"}' },
        },
      }));
      allEvents.push(...builder.processKiroEvent({
        type: 'assistantResponseEvent',
        contentBlockStop: { blockIndex: 0 },
      }));

      // Second tool use
      allEvents.push(...builder.processKiroEvent({
        type: 'assistantResponseEvent',
        contentBlockStart: {
          blockIndex: 1,
          contentBlock: {
            type: 'tool_use',
            toolUseId: 'tool_2',
            toolName: 'calculator',
          },
        },
      }));
      allEvents.push(...builder.processKiroEvent({
        type: 'assistantResponseEvent',
        contentBlockDelta: {
          blockIndex: 1,
          delta: { type: 'toolInput', toolInput: '{"op":"add"}' },
        },
      }));
      allEvents.push(...builder.processKiroEvent({
        type: 'assistantResponseEvent',
        contentBlockStop: { blockIndex: 1 },
      }));

      // Final events
      allEvents.push(...builder.generateFinalEvents());

      // Verify both tool use blocks are present
      const toolStarts = allEvents.filter(e => 
        e.type === 'content_block_start' && e.content_block.type === 'tool_use'
      );
      expect(toolStarts).toHaveLength(2);
      expect(toolStarts[0].content_block.id).toBe('tool_1');
      expect(toolStarts[1].content_block.id).toBe('tool_2');
      
      // Verify stop reason is tool_use
      const messageDelta = allEvents.find(e => e.type === 'message_delta');
      expect(messageDelta.delta.stop_reason).toBe('tool_use');
    });
  });

  describe('Format Compliance', () => {
    it('should emit message_start with correct Anthropic format', () => {
      const builder = new SSEBuilder('claude-sonnet-4.5', 'msg_abc123');
      
      const event: AssistantResponseEvent = {
        type: 'assistantResponseEvent',
        messageStart: {
          conversationId: 'conv_123',
          messageId: 'msg_abc123',
          role: 'assistant',
        },
      };

      const sseEvents = builder.processKiroEvent(event);
      const messageStart = sseEvents[0] as any;

      // Verify exact structure matches Anthropic spec
      expect(messageStart).toEqual({
        type: 'message_start',
        message: {
          id: 'msg_abc123',
          type: 'message',
          role: 'assistant',
          content: [],
          model: 'claude-sonnet-4.5',
          stop_reason: null,
          stop_sequence: null,
          usage: {
            input_tokens: 0,
            output_tokens: 1,
          },
        },
      });
    });

    it('should emit content_block_start with correct format for text', () => {
      const builder = new SSEBuilder('claude-sonnet-4.5', 'msg_123');
      
      const event: AssistantResponseEvent = {
        type: 'assistantResponseEvent',
        contentBlockStart: {
          blockIndex: 0,
          contentBlock: {
            type: 'text',
            text: '',
          },
        },
      };

      const sseEvents = builder.processKiroEvent(event);
      
      expect(sseEvents[0]).toEqual({
        type: 'content_block_start',
        index: 0,
        content_block: {
          type: 'text',
          text: '',
        },
      });
    });

    it('should emit content_block_delta with correct format for text_delta', () => {
      const builder = new SSEBuilder('claude-sonnet-4.5', 'msg_123');
      
      // Start block first
      builder.processKiroEvent({
        type: 'assistantResponseEvent',
        contentBlockStart: {
          blockIndex: 0,
          contentBlock: { type: 'text', text: '' },
        },
      });

      const deltaEvent: AssistantResponseEvent = {
        type: 'assistantResponseEvent',
        contentBlockDelta: {
          blockIndex: 0,
          delta: {
            type: 'text',
            text: 'Hello world',
          },
        },
      };

      const sseEvents = builder.processKiroEvent(deltaEvent);
      
      expect(sseEvents[0]).toEqual({
        type: 'content_block_delta',
        index: 0,
        delta: {
          type: 'text_delta',
          text: 'Hello world',
        },
      });
    });

    it('should emit message_delta with correct format', () => {
      const builder = new SSEBuilder('claude-sonnet-4.5', 'msg_123');
      
      const finalEvents = builder.generateFinalEvents();
      const messageDelta = finalEvents.find(e => e.type === 'message_delta') as any;

      expect(messageDelta).toMatchObject({
        type: 'message_delta',
        delta: {
          stop_reason: expect.any(String),
          stop_sequence: null,
        },
        usage: {
          output_tokens: expect.any(Number),
        },
      });
    });

    it('should emit content_block_start with correct format for tool_use', () => {
      const builder = new SSEBuilder('claude-sonnet-4.5', 'msg_123');
      
      const event: AssistantResponseEvent = {
        type: 'assistantResponseEvent',
        contentBlockStart: {
          blockIndex: 0,
          contentBlock: {
            type: 'tool_use',
            toolUseId: 'toolu_abc123',
            toolName: 'get_weather',
          },
        },
      };

      const sseEvents = builder.processKiroEvent(event);
      
      expect(sseEvents[0]).toEqual({
        type: 'content_block_start',
        index: 0,
        content_block: {
          type: 'tool_use',
          id: 'toolu_abc123',
          name: 'get_weather',
          input: {},
        },
      });
    });
  });

  describe('Edge Cases', () => {
    it('should handle delta for non-existent block gracefully', () => {
      const builder = new SSEBuilder('claude-sonnet-4.5', 'msg_123');
      
      // Send delta without starting block
      const deltaEvent: AssistantResponseEvent = {
        type: 'assistantResponseEvent',
        contentBlockDelta: {
          blockIndex: 0,
          delta: {
            type: 'text',
            text: 'Hello',
          },
        },
      };

      const sseEvents = builder.processKiroEvent(deltaEvent);
      
      // Should return empty array (no event emitted)
      expect(sseEvents).toHaveLength(0);
    });

    it('should handle stop for non-existent block gracefully', () => {
      const builder = new SSEBuilder('claude-sonnet-4.5', 'msg_123');
      
      // Send stop without starting block
      const stopEvent: AssistantResponseEvent = {
        type: 'assistantResponseEvent',
        contentBlockStop: {
          blockIndex: 0,
        },
      };

      const sseEvents = builder.processKiroEvent(stopEvent);
      
      // Should return empty array (no event emitted)
      expect(sseEvents).toHaveLength(0);
    });

    it('should handle delta for already stopped block gracefully', () => {
      const builder = new SSEBuilder('claude-sonnet-4.5', 'msg_123');
      
      // Start and stop block
      builder.processKiroEvent({
        type: 'assistantResponseEvent',
        contentBlockStart: {
          blockIndex: 0,
          contentBlock: { type: 'text', text: '' },
        },
      });
      builder.processKiroEvent({
        type: 'assistantResponseEvent',
        contentBlockStop: { blockIndex: 0 },
      });

      // Try to send delta after stop
      const deltaEvent: AssistantResponseEvent = {
        type: 'assistantResponseEvent',
        contentBlockDelta: {
          blockIndex: 0,
          delta: { type: 'text', text: 'Late text' },
        },
      };

      const sseEvents = builder.processKiroEvent(deltaEvent);
      
      // Should return empty array (block is already stopped)
      expect(sseEvents).toHaveLength(0);
    });

    it('should handle empty text delta', () => {
      const builder = new SSEBuilder('claude-sonnet-4.5', 'msg_123');
      
      builder.processKiroEvent({
        type: 'assistantResponseEvent',
        contentBlockStart: {
          blockIndex: 0,
          contentBlock: { type: 'text', text: '' },
        },
      });

      const deltaEvent: AssistantResponseEvent = {
        type: 'assistantResponseEvent',
        contentBlockDelta: {
          blockIndex: 0,
          delta: { type: 'text', text: '' },
        },
      };

      const sseEvents = builder.processKiroEvent(deltaEvent);
      
      expect(sseEvents).toHaveLength(1);
      expect(sseEvents[0].type).toBe('content_block_delta');
      expect((sseEvents[0] as any).delta.text).toBe('');
    });

    it('should handle very large token counts', () => {
      const builder = new SSEBuilder('claude-sonnet-4.5', 'msg_123');
      
      const usageEvent: ContextUsageEvent = {
        type: 'contextUsageEvent',
        inputTokens: 1000000,
        outputTokens: 500000,
        thinkingTokens: 250000,
      };

      builder.processKiroEvent(usageEvent);
      
      expect(builder.getInputTokens()).toBe(1000000);
      expect(builder.getOutputTokens()).toBe(500000);
      expect(builder.getThinkingTokens()).toBe(250000);
    });

    it('should handle zero token counts', () => {
      const builder = new SSEBuilder('claude-sonnet-4.5', 'msg_123');
      
      const usageEvent: ContextUsageEvent = {
        type: 'contextUsageEvent',
        inputTokens: 0,
        outputTokens: 0,
        thinkingTokens: 0,
      };

      builder.processKiroEvent(usageEvent);
      
      expect(builder.getInputTokens()).toBe(0);
      expect(builder.getOutputTokens()).toBe(0);
      expect(builder.getThinkingTokens()).toBe(0);
    });

    it('should not emit events for error type', () => {
      const builder = new SSEBuilder('claude-sonnet-4.5', 'msg_123');
      
      const errorEvent = {
        type: 'error' as const,
        errorCode: 'invalid_request',
        errorMessage: 'Test error',
      };

      const sseEvents = builder.processKiroEvent(errorEvent);
      
      // Error events should not produce SSE events (handled by caller)
      expect(sseEvents).toHaveLength(0);
    });

    it('should not emit events for exception type', () => {
      const builder = new SSEBuilder('claude-sonnet-4.5', 'msg_123');
      
      const exceptionEvent = {
        type: 'exception' as const,
        exceptionType: 'RuntimeException',
        message: 'Test exception',
      };

      const sseEvents = builder.processKiroEvent(exceptionEvent);
      
      // Exception events should not produce SSE events (handled by caller)
      expect(sseEvents).toHaveLength(0);
    });

    it('should handle messageStop without explicit stopReason', () => {
      const builder = new SSEBuilder('claude-sonnet-4.5', 'msg_123');
      
      const stopEvent: AssistantResponseEvent = {
        type: 'assistantResponseEvent',
        messageStop: {
          stopReason: '',
        },
      };

      builder.processKiroEvent(stopEvent);
      const finalEvents = builder.generateFinalEvents();
      
      const messageDelta = finalEvents.find(e => e.type === 'message_delta') as any;
      // Should default to 'end_turn' when stopReason is empty
      expect(messageDelta.delta.stop_reason).toBe('end_turn');
    });

    it('should handle multiple generateFinalEvents calls idempotently', () => {
      const builder = new SSEBuilder('claude-sonnet-4.5', 'msg_123');
      
      const firstCall = builder.generateFinalEvents();
      const secondCall = builder.generateFinalEvents();
      
      // First call should generate events
      expect(firstCall.length).toBeGreaterThan(0);
      
      // Second call should not generate duplicate events
      // (blocks already closed, message_delta already sent)
      expect(secondCall.length).toBeLessThanOrEqual(1); // Only message_stop
    });
  });
});
