import { describe, it, expect } from "vitest";
import type {
  MessagesRequest,
  Tool,
  Message,
  ContentBlock,
  ErrorResponse,
} from "./anthropic";

describe("Anthropic Types", () => {
  it("should create a valid MessagesRequest", () => {
    const request: MessagesRequest = {
      model: "claude-sonnet-4",
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: "Hello, Claude!",
        },
      ],
      stream: false,
    };

    expect(request.model).toBe("claude-sonnet-4");
    expect(request.max_tokens).toBe(1024);
    expect(request.messages).toHaveLength(1);
  });

  it("should create a Tool with WebSearch type", () => {
    const tool: Tool = {
      type: "web_search_20250305",
      name: "web_search",
      max_uses: 8,
    };

    expect(tool.type).toBe("web_search_20250305");
    expect(tool.name).toBe("web_search");
    expect(tool.max_uses).toBe(8);
  });

  it("should create a Message with ContentBlock array", () => {
    const message: Message = {
      role: "assistant",
      content: [
        {
          type: "text",
          text: "Hello!",
        },
        {
          type: "thinking",
          thinking: "Let me think...",
        },
      ],
    };

    expect(message.role).toBe("assistant");
    expect(Array.isArray(message.content)).toBe(true);
    expect((message.content as ContentBlock[]).length).toBe(2);
  });

  it("should create an ErrorResponse", () => {
    const error: ErrorResponse = {
      error: {
        type: "authentication_error",
        message: "Invalid API key",
      },
    };

    expect(error.error.type).toBe("authentication_error");
    expect(error.error.message).toBe("Invalid API key");
  });
});
