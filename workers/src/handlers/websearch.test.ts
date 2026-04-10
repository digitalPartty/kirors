/**
 * Unit tests for WebSearch MCP Tool Integration
 * 
 * **Validates: Requirements 9.1, 9.2, 9.3, 9.4, 9.5**
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  isWebSearchRequest,
  convertToJsonRpc,
  convertFromJsonRpc,
  handleMcpError,
  executeWebSearch,
} from "./websearch";
import type { Tool } from "../types/anthropic";
import type { JsonRpcRequest, JsonRpcResponse } from "./websearch";

describe("WebSearch MCP Tool Integration", () => {
  describe("isWebSearchRequest", () => {
    /**
     * **Validates: Requirement 9.1**
     * Test web_search tool detection
     */
    it("should return true when tools array contains exactly one web_search tool", () => {
      const tools: Tool[] = [
        {
          name: "web_search",
          description: "Search the web",
        },
      ];
      
      expect(isWebSearchRequest(tools)).toBe(true);
    });

    it("should return false when tools array is undefined", () => {
      expect(isWebSearchRequest(undefined)).toBe(false);
    });

    it("should return false when tools array is empty", () => {
      expect(isWebSearchRequest([])).toBe(false);
    });

    it("should return false when tools array contains multiple tools", () => {
      const tools: Tool[] = [
        { name: "web_search", description: "Search" },
        { name: "calculator", description: "Calculate" },
      ];
      
      expect(isWebSearchRequest(tools)).toBe(false);
    });

    it("should return false when single tool is not web_search", () => {
      const tools: Tool[] = [
        { name: "calculator", description: "Calculate" },
      ];
      
      expect(isWebSearchRequest(tools)).toBe(false);
    });

    /**
     * **Validates: Requirement 9.5**
     * Test that multiple tools or different tool names use standard endpoint
     */
    it("should return false for multiple tools (standard Kiro API)", () => {
      const tools: Tool[] = [
        { name: "web_search", description: "Search" },
        { name: "file_reader", description: "Read files" },
      ];
      
      expect(isWebSearchRequest(tools)).toBe(false);
    });
  });

  describe("convertToJsonRpc", () => {
    /**
     * **Validates: Requirement 9.2**
     * Test conversion from Anthropic tool format to JSON-RPC format
     */
    it("should convert Anthropic tool to JSON-RPC format", () => {
      const tool: Tool = {
        name: "web_search",
        description: "Search the web for information",
      };
      
      const toolInput = {
        query: "Cloudflare Workers",
        max_results: 5,
      };
      
      const result = convertToJsonRpc(tool, toolInput);
      
      expect(result.jsonrpc).toBe("2.0");
      expect(result.id).toBeDefined();
      expect(typeof result.id).toBe("string");
      expect(result.method).toBe("tools/call");
      expect(result.params.name).toBe("web_search");
      expect(result.params.arguments).toEqual(toolInput);
    });

    it("should handle empty tool input", () => {
      const tool: Tool = {
        name: "web_search",
      };
      
      const result = convertToJsonRpc(tool, {});
      
      expect(result.params.arguments).toEqual({});
    });

    it("should handle complex nested arguments", () => {
      const tool: Tool = {
        name: "web_search",
      };
      
      const toolInput = {
        query: "test",
        filters: {
          date_range: "last_week",
          domains: ["example.com"],
        },
      };
      
      const result = convertToJsonRpc(tool, toolInput);
      
      expect(result.params.arguments).toEqual(toolInput);
    });
  });

  describe("convertFromJsonRpc", () => {
    /**
     * **Validates: Requirement 9.3**
     * Test conversion from JSON-RPC response to Anthropic tool result format
     */
    it("should convert successful JSON-RPC response to Anthropic format", () => {
      const jsonRpcResponse: JsonRpcResponse = {
        jsonrpc: "2.0",
        id: "rpc-123",
        result: {
          content: [
            {
              type: "text",
              text: "Search result 1",
            },
            {
              type: "text",
              text: "Search result 2",
            },
          ],
        },
      };
      
      const result = convertFromJsonRpc(jsonRpcResponse);
      
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        type: "text",
        text: "Search result 1",
      });
      expect(result[1]).toEqual({
        type: "text",
        text: "Search result 2",
      });
    });

    /**
     * **Validates: Requirement 9.4**
     * Test error handling for MCP API failures
     */
    it("should convert JSON-RPC error to Anthropic error format", () => {
      const jsonRpcResponse: JsonRpcResponse = {
        jsonrpc: "2.0",
        id: "rpc-123",
        error: {
          code: -32600,
          message: "Invalid request",
        },
      };
      
      const result = convertFromJsonRpc(jsonRpcResponse);
      
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe("text");
      expect(result[0].text).toContain("Error: Invalid request");
    });

    it("should handle empty result content", () => {
      const jsonRpcResponse: JsonRpcResponse = {
        jsonrpc: "2.0",
        id: "rpc-123",
        result: {
          content: [],
        },
      };
      
      const result = convertFromJsonRpc(jsonRpcResponse);
      
      expect(result).toHaveLength(0);
    });

    it("should handle missing result field", () => {
      const jsonRpcResponse: JsonRpcResponse = {
        jsonrpc: "2.0",
        id: "rpc-123",
      };
      
      const result = convertFromJsonRpc(jsonRpcResponse);
      
      expect(result).toHaveLength(1);
      expect(result[0].text).toBe("No results returned");
    });

    it("should handle content items without text field", () => {
      const jsonRpcResponse: JsonRpcResponse = {
        jsonrpc: "2.0",
        id: "rpc-123",
        result: {
          content: [
            {
              type: "text",
            },
          ],
        },
      };
      
      const result = convertFromJsonRpc(jsonRpcResponse);
      
      expect(result[0].text).toBe("");
    });
  });

  describe("handleMcpError", () => {
    /**
     * **Validates: Requirement 9.4, 13.1, 13.4, 13.5**
     * Test MCP API error handling
     */
    it("should convert Error object to Anthropic error response", async () => {
      const error = new Error("Connection timeout");
      const response = handleMcpError(error);
      
      expect(response.status).toBe(500);
      
      const body = await response.json();
      expect(body.error.type).toBe("api_error");
      expect(body.error.message).toContain("Connection timeout");
    });

    it("should handle unknown error types", async () => {
      const error = "Unknown error string";
      const response = handleMcpError(error);
      
      expect(response.status).toBe(500);
      
      const body = await response.json();
      expect(body.error.type).toBe("api_error");
      expect(body.error.message).toBe("An unexpected error occurred");
    });

    it("should handle null error", async () => {
      const response = handleMcpError(null);
      
      expect(response.status).toBe(500);
      
      const body = await response.json();
      expect(body.error.message).toBe("An unexpected error occurred");
    });
  });

  describe("executeWebSearch", () => {
    const mockEnv = {
      KIRO_REGION: "us-east-1",
      KIRO_VERSION: "0.8.0",
      SYSTEM_VERSION: "darwin#24.6.0",
      NODE_VERSION: "22.21.1",
    };

    const mockContext = {
      id: "cred-123",
      accessToken: "test-token",
      credentials: {} as any,
    };

    beforeEach(() => {
      vi.clearAllMocks();
      global.fetch = vi.fn();
    });

    /**
     * **Validates: Requirements 9.1, 9.2**
     * Test routing to MCP API endpoint
     */
    it("should route WebSearch request to MCP API endpoint", async () => {
      const body = {
        model: "claude-3-5-sonnet-20241022",
        max_tokens: 1024,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "tool_use",
                id: "tool-123",
                name: "web_search",
                input: {
                  query: "Cloudflare Workers",
                },
              },
            ],
          },
        ],
        tools: [
          {
            name: "web_search",
            description: "Search the web",
          },
        ],
      };

      const mockMcpResponse = {
        ok: true,
        status: 200,
        json: async () => ({
          jsonrpc: "2.0",
          id: "rpc-123",
          result: {
            content: [
              {
                type: "text",
                text: "Search results",
              },
            ],
          },
        }),
      };

      (global.fetch as any).mockResolvedValue(mockMcpResponse);

      const response = await executeWebSearch(body as any, mockContext, mockEnv as any);

      expect(global.fetch).toHaveBeenCalledWith(
        "https://mcp.kiro.us-east-1.prod.service.aws.dev",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            "Content-Type": "application/json",
            "Authorization": "Bearer test-token",
          }),
        })
      );

      expect(response.status).toBe(200);
    });

    /**
     * **Validates: Requirement 9.3**
     * Test JSON-RPC to Anthropic format conversion
     */
    it("should convert MCP API response to Anthropic format", async () => {
      const body = {
        model: "claude-3-5-sonnet-20241022",
        max_tokens: 1024,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "tool_use",
                id: "tool-456",
                name: "web_search",
                input: {
                  query: "test query",
                },
              },
            ],
          },
        ],
        tools: [
          {
            name: "web_search",
          },
        ],
      };

      const mockMcpResponse = {
        ok: true,
        status: 200,
        json: async () => ({
          jsonrpc: "2.0",
          id: "rpc-123",
          result: {
            content: [
              {
                type: "text",
                text: "Result 1",
              },
              {
                type: "text",
                text: "Result 2",
              },
            ],
          },
        }),
      };

      (global.fetch as any).mockResolvedValue(mockMcpResponse);

      const response = await executeWebSearch(body as any, mockContext, mockEnv as any);
      const responseBody = await response.json();

      expect(responseBody.type).toBe("message");
      expect(responseBody.role).toBe("assistant");
      expect(responseBody.content).toHaveLength(1);
      expect(responseBody.content[0].type).toBe("tool_result");
      expect(responseBody.content[0].tool_use_id).toBe("tool-456");
      expect(responseBody.content[0].content).toHaveLength(2);
    });

    /**
     * **Validates: Requirement 9.4**
     * Test error handling for MCP API failures
     */
    it("should handle MCP API HTTP errors", async () => {
      const body = {
        model: "claude-3-5-sonnet-20241022",
        max_tokens: 1024,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "tool_use",
                id: "tool-789",
                name: "web_search",
                input: { query: "test" },
              },
            ],
          },
        ],
        tools: [{ name: "web_search" }],
      };

      const mockMcpResponse = {
        ok: false,
        status: 500,
        text: async () => "Internal Server Error",
      };

      (global.fetch as any).mockResolvedValue(mockMcpResponse);

      const response = await executeWebSearch(body as any, mockContext, mockEnv as any);

      expect(response.status).toBe(500);
      
      const responseBody = await response.json();
      expect(responseBody.error.type).toBe("api_error");
      expect(responseBody.error.message).toContain("Internal Server Error");
    });

    it("should handle missing tool_use block", async () => {
      const body = {
        model: "claude-3-5-sonnet-20241022",
        max_tokens: 1024,
        messages: [
          {
            role: "user",
            content: "Just a text message",
          },
        ],
        tools: [{ name: "web_search" }],
      };

      const response = await executeWebSearch(body as any, mockContext, mockEnv as any);

      expect(response.status).toBe(400);
      
      const responseBody = await response.json();
      expect(responseBody.error.type).toBe("invalid_request_error");
    });

    it("should handle network errors", async () => {
      const body = {
        model: "claude-3-5-sonnet-20241022",
        max_tokens: 1024,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "tool_use",
                id: "tool-999",
                name: "web_search",
                input: { query: "test" },
              },
            ],
          },
        ],
        tools: [{ name: "web_search" }],
      };

      (global.fetch as any).mockRejectedValue(new Error("Network error"));

      const response = await executeWebSearch(body as any, mockContext, mockEnv as any);

      expect(response.status).toBe(500);
      
      const responseBody = await response.json();
      expect(responseBody.error.message).toContain("Network error");
    });
  });
});
