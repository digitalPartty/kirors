/**
 * Request converter for transforming Anthropic API requests to Kiro API format
 * 
 * This module handles the conversion of request structures between the Anthropic
 * API format (used by clients) and the Kiro API format (used by the upstream service).
 */

import type {
  MessagesRequest,
  Message,
  ContentBlock,
  Tool,
  Thinking,
  Metadata,
} from "../types/anthropic";
import type {
  KiroRequest,
  ConversationState,
  CurrentMessage,
  UserInputMessage,
  UserInputMessageContext,
  SystemPrompt,
  KiroTool,
  KiroThinking,
  HistoryMessage,
  KiroContent,
} from "../types/kiro";
import { mapModelName } from "../constants";
import { normalizeSystemPrompt } from "./helpers";
import { generateId } from "./helpers";

/**
 * RequestConverter class handles conversion from Anthropic to Kiro format
 */
export class RequestConverter {
  /**
   * Convert Anthropic MessagesRequest to Kiro KiroRequest
   * 
   * @param anthropicRequest - The Anthropic API request
   * @param conversationId - Optional conversation ID (generated if not provided)
   * @param metadata - Optional metadata to preserve
   * @returns KiroRequest object
   */
  convertAnthropicToKiro(
    anthropicRequest: MessagesRequest,
    conversationId?: string,
    metadata?: Metadata
  ): KiroRequest {
    const convId = conversationId || generateId("conv");
    
    // Map model name from Anthropic to Kiro format
    const kiroModelId = mapModelName(anthropicRequest.model);
    
    // Convert system prompt to Kiro format
    const systemPrompt = this.convertSystemPrompt(anthropicRequest.system);
    
    // Convert tools to Kiro format
    const tools = this.convertTools(anthropicRequest.tools);
    
    // Convert thinking configuration to Kiro format
    const thinking = this.convertThinking(anthropicRequest.thinking);
    
    // Split messages into current message and history
    const { currentMessage, history } = this.convertMessages(
      anthropicRequest.messages,
      kiroModelId,
      anthropicRequest.max_tokens,
      systemPrompt,
      tools,
      thinking
    );
    
    // Build conversation state
    const conversationState: ConversationState = {
      conversationId: convId,
      currentMessage,
    };
    
    // Add history if present
    if (history && history.length > 0) {
      conversationState.history = history;
    }
    
    // Build Kiro request
    const kiroRequest: KiroRequest = {
      conversationState,
    };
    
    return kiroRequest;
  }
  
  /**
   * Convert system prompt from Anthropic to Kiro format
   * 
   * @param system - Anthropic system prompt (string or array)
   * @returns Array of SystemPrompt objects or undefined
   */
  private convertSystemPrompt(
    system: string | Array<{ text: string }> | undefined
  ): SystemPrompt[] | undefined {
    if (!system) return undefined;
    
    const normalized = normalizeSystemPrompt(system);
    if (!normalized) return undefined;
    
    return normalized.map((item) => ({
      text: item.text,
    }));
  }
  
  /**
   * Convert tools from Anthropic to Kiro format
   * 
   * @param tools - Anthropic tools array
   * @returns Array of KiroTool objects or undefined
   */
  private convertTools(tools: Tool[] | undefined): KiroTool[] | undefined {
    if (!tools || tools.length === 0) return undefined;
    
    return tools.map((tool) => ({
      name: tool.name,
      description: tool.description || "",
      inputSchema: tool.input_schema || {},
    }));
  }
  
  /**
   * Convert thinking configuration from Anthropic to Kiro format
   * 
   * @param thinking - Anthropic thinking configuration
   * @returns KiroThinking object or undefined
   */
  private convertThinking(thinking: Thinking | undefined): KiroThinking | undefined {
    if (!thinking) return undefined;
    
    const kiroThinking: KiroThinking = {
      type: thinking.type,
    };
    
    if (thinking.budget_tokens !== undefined) {
      kiroThinking.budgetTokens = thinking.budget_tokens;
    }
    
    return kiroThinking;
  }
  
  /**
   * Convert messages array to Kiro format
   * Splits into current message (last user message) and history (all previous messages)
   * 
   * @param messages - Anthropic messages array
   * @param modelId - Kiro model ID
   * @param maxTokens - Maximum tokens for response
   * @param systemPrompt - Converted system prompt
   * @param tools - Converted tools
   * @param thinking - Converted thinking configuration
   * @returns Object with currentMessage and history
   */
  private convertMessages(
    messages: Message[],
    modelId: string,
    maxTokens: number,
    systemPrompt?: SystemPrompt[],
    tools?: KiroTool[],
    thinking?: KiroThinking
  ): { currentMessage: CurrentMessage; history?: HistoryMessage[] } {
    // Find the last user message
    let lastUserMessageIndex = -1;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "user") {
        lastUserMessageIndex = i;
        break;
      }
    }
    
    if (lastUserMessageIndex === -1) {
      throw new Error("No user message found in messages array");
    }
    
    // Convert history (all messages before the last user message)
    const history: HistoryMessage[] = [];
    for (let i = 0; i < lastUserMessageIndex; i++) {
      const msg = messages[i];
      history.push({
        role: msg.role,
        content: this.convertMessageContent(msg.content),
      });
    }
    
    // Convert current message (last user message)
    const lastUserMessage = messages[lastUserMessageIndex];
    const userContent = this.convertMessageContent(lastUserMessage.content);
    
    // Extract text content for the user input message
    const textContent = userContent
      .filter((block) => block.type === "text")
      .map((block) => block.text || "")
      .join("\n");
    
    // Build user input message context
    const userInputMessageContext: UserInputMessageContext = {};
    
    if (systemPrompt) {
      userInputMessageContext.systemPrompt = systemPrompt;
    }
    
    if (tools) {
      userInputMessageContext.tools = tools;
    }
    
    if (thinking) {
      userInputMessageContext.thinking = thinking;
    }
    
    // Build user input message
    const userInputMessage: UserInputMessage = {
      content: textContent,
      modelId,
      userInputMessageContext,
    };
    
    // Build current message
    const currentMessage: CurrentMessage = {
      userInputMessage,
    };
    
    return {
      currentMessage,
      history: history.length > 0 ? history : undefined,
    };
  }
  
  /**
   * Convert message content from Anthropic to Kiro format
   * 
   * @param content - Anthropic message content (string or ContentBlock array)
   * @returns Array of KiroContent objects
   */
  private convertMessageContent(content: string | ContentBlock[]): KiroContent[] {
    // Handle string content
    if (typeof content === "string") {
      return [
        {
          type: "text",
          text: content,
        },
      ];
    }
    
    // Handle ContentBlock array
    return content.map((block) => this.convertContentBlock(block));
  }
  
  /**
   * Convert a single content block from Anthropic to Kiro format
   * 
   * @param block - Anthropic ContentBlock
   * @returns KiroContent object
   */
  private convertContentBlock(block: ContentBlock): KiroContent {
    const kiroContent: KiroContent = {
      type: block.type,
    };
    
    // Handle text content
    if (block.type === "text" && block.text !== undefined) {
      kiroContent.text = block.text;
    }
    
    // Handle thinking content
    if (block.type === "thinking" && block.thinking !== undefined) {
      kiroContent.thinking = block.thinking;
    }
    
    // Handle tool use content
    if (block.type === "tool_use") {
      kiroContent.toolUseId = block.id;
      kiroContent.toolName = block.name;
      kiroContent.toolInput = block.input;
    }
    
    // Handle tool result content
    if (block.type === "tool_result") {
      kiroContent.toolUseId = block.tool_use_id;
      kiroContent.toolResult = block.content;
      kiroContent.isError = block.is_error;
    }
    
    return kiroContent;
  }
}
