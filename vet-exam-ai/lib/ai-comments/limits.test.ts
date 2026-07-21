import { describe, expect, it } from "vitest";

import {
  DEFAULT_AI_COMMENT_CONFIG,
  readAiCommentGenerationConfig,
  resolveAiCommentCapacity,
  type AiCommentGenerationConfig,
} from "./limits";

function config(overrides: Partial<AiCommentGenerationConfig> = {}): AiCommentGenerationConfig {
  return { ...DEFAULT_AI_COMMENT_CONFIG, enabled: true, apiKeyConfigured: true, ...overrides };
}

describe("readAiCommentGenerationConfig", () => {
  it("defaults to disabled Terra generation with bounded limits", () => {
    // Given
    const env = {};

    // When
    const result = readAiCommentGenerationConfig(env);

    // Then
    expect(result).toEqual(DEFAULT_AI_COMMENT_CONFIG);
  });

  it("parses server configuration without retaining the API key", () => {
    // Given
    const env = {
      OPENAI_API_KEY: "secret-value",
      AI_COMMENT_GENERATION_ENABLED: "true",
      AI_COMMENT_MODEL: "gpt-5.6-sol",
      AI_COMMENT_PROMPT_VERSION: "v2",
      AI_COMMENT_DAILY_LIMIT: "3",
      AI_COMMENT_MONTHLY_REQUEST_LIMIT: "90",
      AI_COMMENT_PENDING_LIMIT: "20",
      AI_COMMENT_MAX_OUTPUT_TOKENS: "600",
    };

    // When
    const result = readAiCommentGenerationConfig(env);

    // Then
    expect(result).toEqual({
      enabled: true,
      apiKeyConfigured: true,
      model: "gpt-5.6-sol",
      promptVersion: "v2",
      dailyLimit: 3,
      monthlyLimit: 90,
      pendingLimit: 20,
      maxOutputTokens: 600,
      perRunLimit: 5,
    });
    expect(JSON.stringify(result)).not.toContain("secret-value");
  });

  it("fails closed and clamps limits to the hard safety ceilings", () => {
    // Given
    const env = {
      AI_COMMENT_GENERATION_ENABLED: "yes",
      AI_COMMENT_DAILY_LIMIT: "99",
      AI_COMMENT_MONTHLY_REQUEST_LIMIT: "999",
      AI_COMMENT_PENDING_LIMIT: "999",
      AI_COMMENT_MAX_OUTPUT_TOKENS: "9999",
    };

    // When
    const result = readAiCommentGenerationConfig(env);

    // Then
    expect(result.enabled).toBe(false);
    expect(result.dailyLimit).toBe(5);
    expect(result.monthlyLimit).toBe(150);
    expect(result.pendingLimit).toBe(50);
    expect(result.maxOutputTokens).toBe(800);
  });
});

describe("resolveAiCommentCapacity", () => {
  it.each([
    ["disabled", config({ enabled: false }), { dailyRequests: 0, monthlyRequests: 0, pendingCandidates: 0 }],
    ["missing_api_key", config({ apiKeyConfigured: false }), { dailyRequests: 0, monthlyRequests: 0, pendingCandidates: 0 }],
    ["pending_cap", config(), { dailyRequests: 0, monthlyRequests: 0, pendingCandidates: 50 }],
    ["monthly_cap", config(), { dailyRequests: 0, monthlyRequests: 150, pendingCandidates: 0 }],
    ["daily_cap", config(), { dailyRequests: 5, monthlyRequests: 5, pendingCandidates: 0 }],
  ])("stops with %s", (reason, generationConfig, counters) => {
    // When
    const capacity = resolveAiCommentCapacity(generationConfig, counters);

    // Then
    expect(capacity).toEqual({ remaining: 0, reason });
  });

  it("returns the smallest remaining daily, monthly, pending, or per-run budget", () => {
    // Given
    const counters = { dailyRequests: 2, monthlyRequests: 148, pendingCandidates: 47 };

    // When
    const capacity = resolveAiCommentCapacity(config(), counters);

    // Then
    expect(capacity).toEqual({ remaining: 2, reason: null });
  });
});
