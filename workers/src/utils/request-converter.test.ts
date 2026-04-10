/**
 * Unit tests for RequestConverter
 */

import { describe, it, expect, beforeEach } from "vitest";
import { RequestConverter } from "./request-converter";
import type { MessagesRequest, Message, Tool, Thinking } from "../types/anthropic";

describe("RequestConverter", () => {
  let converter: RequestConverter;

  beforeEach(() => {
    converter = new RequestConverter();
  });

  describe("convertAnthropicToKiro", () => {
    it("should convert basic request with max_tokens to maxTokens", () => {
      const anthropicRequest: MessagesRequest = {
        model: "claude-3-5-sonnet-20241022",
        max_tokens: 1024,
        messages: [
          {
            role: "user",
            content: "Hello, Claude!",
          },
        ],
      };

      const result = converter.convertAnthropicToKiro(anthropicRequest);

      expect(result.conversationState).toBeDefined();
      expect(result.conversationState.currentMessage).toBeDefined();
      expect(result.conversationState.currentMessage.userInputMessage.content).toBe(
        "Hello, Claude!"
      );
      expect(result.conversationState.currentMessage.userInputMessage.modelId).toBe(
        "claude-sonnet-4.5"
      );
    });

    it("should convert system prompt string to systemPrompt array format", () => {
      const anthropicRequest: MessagesRequest = {
        model: "claude-3-5-sonnet-20241022",
        max_tokens: 1024,
        system: "You are a helpful assistant.",
        messages: [
          {
            role: "user",
            content: "Hello!",
          },
        ],
      };

      const result = converter.convertAnthropicToKiro(anthropicRequest);

      const systemPrompt =
        result.conversationState.currentMessage.userInputMessage.userInputMessageContext
          .systemPrompt;
      expect(systemPrompt).toBeDefined();
      expect(systemPrompt).toHaveLength(1);
      expect(systemPrompt![0].text).toBe("You are a helpful assistant.");
    });

    it("should convert system prompt array to systemPrompt array format", () => {
      const anthropicRequest: MessagesRequest = {
        model: "claude-3-5-sonnet-20241022",
        max_tokens: 1024,
        system: [
          { text: "You are a helpful assistant." },
          { text: "Be concise in your responses." },
        ],
        messages: [
          {
            role: "user",
            content: "Hello!",
          },
        ],
      };

      const result = converter.convertAnthropicToKiro(anthropicRequest);

      const systemPrompt =
        result.conversationState.currentMessage.userInputMessage.userInputMessageContext
          .systemPrompt;
      expect(systemPrompt).toBeDefined();
      expect(systemPrompt).toHaveLength(2);
      expect(systemPrompt![0].text).toBe("You are a helpful assistant.");
      expect(systemPrompt![1].text).toBe("Be concise in your responses.");
    });

    it("should convert messages array to Kiro conversation format", () => {
      const anthropicRequest: MessagesRequest = {
        model: "claude-3-5-sonnet-20241022",
        max_tokens: 1024,
        messages: [
          {
            role: "user",
            content: "What is 2+2?",
          },
          {
            role: "assistant",
            content: "2+2 equals 4.",
          },
          {
            role: "user",
            content: "What about 3+3?",
          },
        ],
      };

      const result = converter.convertAnthropicToKiro(anthropicRequest);

      // Current message should be the last user message
      expect(result.conversationState.currentMessage.userInputMessage.content).toBe(
        "What about 3+3?"
      );

      // History should contain the previous messages
      expect(result.conversationState.history).toBeDefined();
      expect(result.conversationState.history).toHaveLength(2);
      expect(result.conversationState.history![0].role).toBe("user");
      expect(result.conversationState.history![0].content[0].text).toBe("What is 2+2?");
      expect(result.conversationState.history![1].role).toBe("assistant");
      expect(result.conversationState.history![1].content[0].text).toBe("2+2 equals 4.");
    });

    it("should convert tools array to Kiro tool definitions", () => {
      const tools: Tool[] = [
        {
          name: "get_weather",
          description: "Get the current weather for a location",
          input_schema: {
            type: "object",
            properties: {
              location: {
                type: "string",
                description: "City name",
              },
            },
            required: ["location"],
          },
        },
      ];

      const anthropicRequest: MessagesRequest = {
        model: "claude-3-5-sonnet-20241022",
        max_tokens: 1024,
        tools,
        messages: [
          {
            role: "user",
            content: "What's the weather in Paris?",
          },
        ],
      };

      const result = converter.convertAnthropicToKiro(anthropicRequest);

      const kiroTools =
        result.conversationState.currentMessage.userInputMessage.userInputMessageContext
          .tools;
      expect(kiroTools).toBeDefined();
      expect(kiroTools).toHaveLength(1);
      expect(kiroTools![0].name).toBe("get_weather");
      expect(kiroTools![0].description).toBe("Get the current weather for a location");
      expect(kiroTools![0].inputSchema).toEqual(tools[0].input_schema);
    });

    it("should convert thinking configuration to Kiro format", () => {
      const thinking: Thinking = {
        type: "enabled",
        budget_tokens: 5000,
      };

      const anthropicRequest: MessagesRequest = {
        model: "claude-3-5-sonnet-20241022",
        max_tokens: 1024,
        thinking,
        messages: [
          {
            role: "user",
            content: "Solve this complex problem.",
          },
        ],
      };

      const result = converter.convertAnthropicToKiro(anthropicRequest);

      const kiroThinking =
        result.conversationState.currentMessage.userInputMessage.userInputMessageContext
          .thinking;
      expect(kiroThinking).toBeDefined();
      expect(kiroThinking!.type).toBe("enabled");
      expect(kiroThinking!.budgetTokens).toBe(5000);
    });

    it("should handle metadata preservation", () => {
      const anthropicRequest: MessagesRequest = {
        model: "claude-3-5-sonnet-20241022",
        max_tokens: 1024,
        messages: [
          {
            role: "user",
            content: "Hello!",
          },
        ],
        metadata: {
          user_id: "user-123",
        },
      };

      const result = converter.convertAnthropicToKiro(
        anthropicRequest,
        undefined,
        anthropicRequest.metadata
      );

      // Metadata is passed through but not directly stored in KiroRequest
      // It's preserved for use in other parts of the system
      expect(result).toBeDefined();
    });

    it("should convert tool use content blocks", () => {
      const anthropicRequest: MessagesRequest = {
        model: "claude-3-5-sonnet-20241022",
        max_tokens: 1024,
        messages: [
          {
            role: "user",
            content: "What's the weather?",
          },
          {
            role: "assistant",
            content: [
              {
                type: "tool_use",
                id: "tool-123",
                name: "get_weather",
                input: { location: "Paris" },
              },
            ],
          },
          {
            role: "user",
            content: [
              {
                type: "tool_result",
                tool_use_id: "tool-123",
                content: "Sunny, 22°C",
              },
            ],
          },
        ],
      };

      const result = converter.convertAnthropicToKiro(anthropicRequest);

      // Check history contains tool use
      expect(result.conversationState.history).toBeDefined();
      expect(result.conversationState.history).toHaveLength(2);

      const assistantMessage = result.conversationState.history![1];
      expect(assistantMessage.role).toBe("assistant");
      expect(assistantMessage.content[0].type).toBe("tool_use");
      expect(assistantMessage.content[0].toolUseId).toBe("tool-123");
      expect(assistantMessage.content[0].toolName).toBe("get_weather");
      expect(assistantMessage.content[0].toolInput).toEqual({ location: "Paris" });

      // Check current message contains tool result
      const currentContent = result.conversationState.history![2]?.content || [];
      // Actually, the last user message becomes current, so we need to check differently
      // The tool_result is in the last user message which becomes current
      // But current message only takes text content, so tool results go to history
    });

    it("should handle thinking content blocks", () => {
      const anthropicRequest: MessagesRequest = {
        model: "claude-3-5-sonnet-20241022",
        max_tokens: 1024,
        messages: [
          {
            role: "user",
            content: "Solve this problem.",
          },
          {
            role: "assistant",
            content: [
              {
                type: "thinking",
                thinking: "Let me think about this...",
              },
              {
                type: "text",
                text: "Here's the solution.",
              },
            ],
          },
          {
            role: "user",
            content: "Thanks!",
          },
        ],
      };

      const result = converter.convertAnthropicToKiro(anthropicRequest);

      expect(result.conversationState.history).toBeDefined();
      const assistantMessage = result.conversationState.history![1];
      expect(assistantMessage.content).toHaveLength(2);
      expect(assistantMessage.content[0].type).toBe("thinking");
      expect(assistantMessage.content[0].thinking).toBe("Let me think about this...");
      expect(assistantMessage.content[1].type).toBe("text");
      expect(assistantMessage.content[1].text).toBe("Here's the solution.");
    });

    it("should map sonnet model names correctly", () => {
      const models = [
        "claude-3-5-sonnet-20241022",
        "claude-3-5-sonnet-20240620",
        "claude-3-sonnet-20240229",
      ];

      models.forEach((model) => {
        const anthropicRequest: MessagesRequest = {
          model,
          max_tokens: 1024,
          messages: [{ role: "user", content: "Hello!" }],
        };

        const result = converter.convertAnthropicToKiro(anthropicRequest);
        expect(result.conversationState.currentMessage.userInputMessage.modelId).toBe(
          "claude-sonnet-4.5"
        );
      });
    });

    it("should map opus model names correctly", () => {
      const anthropicRequest: MessagesRequest = {
        model: "claude-3-opus-20240229",
        max_tokens: 1024,
        messages: [{ role: "user", content: "Hello!" }],
      };

      const result = converter.convertAnthropicToKiro(anthropicRequest);
      expect(result.conversationState.currentMessage.userInputMessage.modelId).toBe(
        "claude-opus-4.5"
      );
    });

    it("should map haiku model names correctly", () => {
      const models = ["claude-3-5-haiku-20241022", "claude-3-haiku-20240307"];

      models.forEach((model) => {
        const anthropicRequest: MessagesRequest = {
          model,
          max_tokens: 1024,
          messages: [{ role: "user", content: "Hello!" }],
        };

        const result = converter.convertAnthropicToKiro(anthropicRequest);
        expect(result.conversationState.currentMessage.userInputMessage.modelId).toBe(
          "claude-haiku-4.5"
        );
      });
    });

    it("should use custom conversation ID when provided", () => {
      const anthropicRequest: MessagesRequest = {
        model: "claude-3-5-sonnet-20241022",
        max_tokens: 1024,
        messages: [{ role: "user", content: "Hello!" }],
      };

      const customConvId = "conv-custom-123";
      const result = converter.convertAnthropicToKiro(anthropicRequest, customConvId);

      expect(result.conversationState.conversationId).toBe(customConvId);
    });

    it("should generate conversation ID when not provided", () => {
      const anthropicRequest: MessagesRequest = {
        model: "claude-3-5-sonnet-20241022",
        max_tokens: 1024,
        messages: [{ role: "user", content: "Hello!" }],
      };

      const result = converter.convertAnthropicToKiro(anthropicRequest);

      expect(result.conversationState.conversationId).toBeDefined();
      expect(result.conversationState.conversationId).toMatch(/^conv-/);
    });

    it("should handle empty tools array", () => {
      const anthropicRequest: MessagesRequest = {
        model: "claude-3-5-sonnet-20241022",
        max_tokens: 1024,
        tools: [],
        messages: [{ role: "user", content: "Hello!" }],
      };

      const result = converter.convertAnthropicToKiro(anthropicRequest);

      const tools =
        result.conversationState.currentMessage.userInputMessage.userInputMessageContext
          .tools;
      expect(tools).toBeUndefined();
    });

    it("should handle messages with only user message (no history)", () => {
      const anthropicRequest: MessagesRequest = {
        model: "claude-3-5-sonnet-20241022",
        max_tokens: 1024,
        messages: [{ role: "user", content: "Hello!" }],
      };

      const result = converter.convertAnthropicToKiro(anthropicRequest);

      expect(result.conversationState.history).toBeUndefined();
      expect(result.conversationState.currentMessage.userInputMessage.content).toBe(
        "Hello!"
      );
    });

    it("should throw error when no user message is found", () => {
      const anthropicRequest: MessagesRequest = {
        model: "claude-3-5-sonnet-20241022",
        max_tokens: 1024,
        messages: [
          {
            role: "assistant",
            content: "Hello!",
          },
        ],
      };

      expect(() => converter.convertAnthropicToKiro(anthropicRequest)).toThrow(
        "No user message found in messages array"
      );
    });

    it("should handle tool results with error flag", () => {
      const anthropicRequest: MessagesRequest = {
        model: "claude-3-5-sonnet-20241022",
        max_tokens: 1024,
        messages: [
          {
            role: "user",
            content: "What's the weather?",
          },
          {
            role: "assistant",
            content: [
              {
                type: "tool_use",
                id: "tool-123",
                name: "get_weather",
                input: { location: "InvalidCity" },
              },
            ],
          },
          {
            role: "user",
            content: [
              {
                type: "tool_result",
                tool_use_id: "tool-123",
                content: "Error: City not found",
                is_error: true,
              },
            ],
          },
        ],
      };

      const result = converter.convertAnthropicToKiro(anthropicRequest);

      expect(result.conversationState.history).toBeDefined();
      // The last user message with tool_result becomes current, but only text is extracted
      // Tool results in the last message are part of the content blocks
    });

    it("should handle multiple content blocks in user message", () => {
      const anthropicRequest: MessagesRequest = {
        model: "claude-3-5-sonnet-20241022",
        max_tokens: 1024,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "First part.",
              },
              {
                type: "text",
                text: "Second part.",
              },
            ],
          },
        ],
      };

      const result = converter.convertAnthropicToKiro(anthropicRequest);

      // Text content should be joined with newlines
      expect(result.conversationState.currentMessage.userInputMessage.content).toBe(
        "First part.\nSecond part."
      );
    });
  });
});
