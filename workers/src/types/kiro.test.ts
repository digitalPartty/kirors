import { describe, it, expect } from "vitest";
import type {
  KiroRequest,
  ConversationState,
  CallContext,
  Credential,
  AssistantResponseEvent,
} from "./kiro";

describe("Kiro Types", () => {
  it("should create a valid KiroRequest", () => {
    const request: KiroRequest = {
      conversationState: {
        conversationId: "conv-123",
        currentMessage: {
          userInputMessage: {
            content: "Hello",
            modelId: "claude-sonnet-4.5",
            userInputMessageContext: {},
          },
        },
      },
    };

    expect(request.conversationState.conversationId).toBe("conv-123");
    expect(request.conversationState.currentMessage.userInputMessage.content).toBe("Hello");
  });

  it("should create a CallContext", () => {
    const context: CallContext = {
      id: "ctx-123",
      accessToken: "token-abc",
      credentials: {
        id: "cred-1",
        name: "Primary",
        clientId: "client-123",
        clientSecret: "secret-456",
        refreshToken: "refresh-789",
        accessToken: "access-abc",
        expiresAt: Date.now() + 3600000,
        priority: 1,
        disabled: false,
        failureCount: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    };

    expect(context.id).toBe("ctx-123");
    expect(context.credentials.name).toBe("Primary");
    expect(context.credentials.priority).toBe(1);
  });

  it("should create an AssistantResponseEvent with messageStart", () => {
    const event: AssistantResponseEvent = {
      type: "assistantResponseEvent",
      messageStart: {
        conversationId: "conv-123",
        messageId: "msg-456",
        role: "assistant",
      },
    };

    expect(event.type).toBe("assistantResponseEvent");
    expect(event.messageStart?.conversationId).toBe("conv-123");
  });

  it("should create a Credential with all fields", () => {
    const credential: Credential = {
      id: "cred-1",
      name: "Test Credential",
      clientId: "client-123",
      clientSecret: "secret-456",
      refreshToken: "refresh-789",
      accessToken: "access-abc",
      expiresAt: Date.now() + 3600000,
      priority: 1,
      disabled: false,
      failureCount: 0,
      lastUsed: Date.now(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    expect(credential.name).toBe("Test Credential");
    expect(credential.disabled).toBe(false);
    expect(credential.failureCount).toBe(0);
  });
});
