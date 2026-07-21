import { NextRequest } from "next/server";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AiCommentGenerationSummary } from "../../../../lib/ai-comments/generate";
import type { AiCommentGenerationConfig } from "../../../../lib/ai-comments/limits";

const mocks = vi.hoisted(() => ({
  captureOperationalError: vi.fn(),
  createAdminClient: vi.fn(),
  createGenerator: vi.fn(),
  createStore: vi.fn(),
  readConfig: vi.fn(),
  runGeneration: vi.fn(),
}));

vi.mock("../../../../lib/supabase/admin", () => ({
  createAdminClient: mocks.createAdminClient,
}));
vi.mock("../../../../lib/utils/logging", () => ({
  captureOperationalError: mocks.captureOperationalError,
}));
vi.mock("../../../../lib/ai-comments/generate", () => ({
  runAiCommentGeneration: mocks.runGeneration,
}));
vi.mock("../../../../lib/ai-comments/limits", () => ({
  readAiCommentGenerationConfig: mocks.readConfig,
}));
vi.mock("../../../../lib/ai-comments/openai", () => ({
  createOpenAiCommentGenerator: mocks.createGenerator,
}));
vi.mock("../../../../lib/ai-comments/store", () => ({
  createSupabaseAiCommentGenerationStore: mocks.createStore,
}));

import { GET } from "./route";

const ENABLED_CONFIG: AiCommentGenerationConfig = {
  enabled: true,
  apiKeyConfigured: true,
  model: "gpt-5.6-terra",
  promptVersion: "v1",
  dailyLimit: 5,
  monthlyLimit: 150,
  pendingLimit: 50,
  maxOutputTokens: 800,
  perRunLimit: 5,
};

function summary(
  overrides: Partial<AiCommentGenerationSummary> = {},
): AiCommentGenerationSummary {
  return {
    claimed: 0,
    generated: 0,
    skipped: 0,
    failed: 0,
    providerRequests: 0,
    pendingTotal: 0,
    inputTokens: 0,
    outputTokens: 0,
    reasoningTokens: 0,
    limitReason: null,
    model: "gpt-5.6-terra",
    promptVersion: "v1",
    ...overrides,
  };
}

function request(authorization?: string): NextRequest {
  const headers = authorization === undefined ? undefined : { authorization };
  return new NextRequest("http://localhost/api/cron/ai-comment-candidates", { headers });
}

describe("GET /api/cron/ai-comment-candidates", () => {
  const logRows: unknown[] = [];
  const insertLog = vi.fn(async (row: unknown) => {
    logRows.push(row);
    return { error: null };
  });
  const admin = {
    from: vi.fn(() => ({ insert: insertLog })),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    logRows.length = 0;
    vi.stubEnv("CRON_SECRET", "test-secret");
    mocks.createAdminClient.mockReturnValue(admin);
    mocks.createStore.mockReturnValue({ kind: "store" });
    mocks.createGenerator.mockReturnValue({ kind: "generator" });
    mocks.readConfig.mockReturnValue(ENABLED_CONFIG);
    mocks.runGeneration.mockResolvedValue(summary());
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("rejects a missing cron secret before generation", async () => {
    // Given: a request without authorization.
    const req = request();

    // When: the candidate cron route is called.
    const response = await GET(req);

    // Then: authentication fails before any generation or run log.
    expect(response.status).toBe(401);
    expect(mocks.runGeneration).not.toHaveBeenCalled();
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
    expect(logRows).toEqual([]);
  });

  it("rejects an incorrect cron secret before generation", async () => {
    // Given: a request with the wrong bearer secret.
    const req = request("Bearer wrong-secret");

    // When: the candidate cron route is called.
    const response = await GET(req);

    // Then: authentication fails without touching generation.
    expect(response.status).toBe(401);
    expect(mocks.runGeneration).not.toHaveBeenCalled();
    expect(logRows).toEqual([]);
  });

  it("returns an explicit disabled no-op aggregate", async () => {
    // Given: generation is disabled and the orchestrator reports no work.
    mocks.readConfig.mockReturnValue({ ...ENABLED_CONFIG, enabled: false });
    mocks.runGeneration.mockResolvedValue(summary({ limitReason: "disabled" }));

    // When: an authenticated cron request runs.
    const response = await GET(request("Bearer test-secret"));
    const body: unknown = await response.json();

    // Then: the route succeeds with only aggregate operational fields.
    expect(response.status).toBe(200);
    expect(body).toEqual({
      claimed: 0,
      generated: 0,
      skipped: 0,
      failed: 0,
      pendingTotal: 0,
      inputTokens: 0,
      outputTokens: 0,
      reasoningTokens: 0,
      limitReason: "disabled",
      model: "gpt-5.6-terra",
      promptVersion: "v1",
    });
    expect(mocks.createGenerator).toHaveBeenCalledWith({ maxOutputTokens: 800 });
    expect(logRows).toHaveLength(1);
  });

  it("returns at most five generated candidates without comment data", async () => {
    // Given: an enabled bounded run produces five private candidates.
    mocks.runGeneration.mockResolvedValue(summary({
      claimed: 5,
      generated: 5,
      providerRequests: 5,
      pendingTotal: 5,
      inputTokens: 500,
      outputTokens: 250,
      reasoningTokens: 100,
    }));

    // When: an authenticated cron request runs.
    const response = await GET(request("Bearer test-secret"));
    const body: unknown = await response.json();

    // Then: only bounded aggregate candidate counters are returned.
    expect(response.status).toBe(200);
    expect(body).toEqual({
      claimed: 5,
      generated: 5,
      skipped: 0,
      failed: 0,
      pendingTotal: 5,
      inputTokens: 500,
      outputTokens: 250,
      reasoningTokens: 100,
      limitReason: null,
      model: "gpt-5.6-terra",
      promptVersion: "v1",
    });
    expect(admin.from).toHaveBeenCalledTimes(1);
    expect(admin.from).toHaveBeenCalledWith("cron_run_logs");
  });

  it("records a first-class cron failure for provider or validation failures", async () => {
    // Given: a claimed candidate fails provider-side validation.
    mocks.runGeneration.mockResolvedValue(summary({
      claimed: 1,
      failed: 1,
      providerRequests: 1,
      inputTokens: 50,
    }));

    // When: the authenticated cron request runs.
    const response = await GET(request("Bearer test-secret"));
    const body: unknown = await response.json();

    // Then: the route fails safely and records a redacted failure run.
    expect(response.status).toBe(500);
    expect(body).toEqual({ ok: false, error: "AI comment candidate generation failed" });
    expect(logRows).toEqual([
      expect.objectContaining({
        job_name: "ai-comment-candidates",
        status: "failure",
        detail: null,
        error: "AI comment candidate generation failed",
      }),
    ]);
    expect(mocks.captureOperationalError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        area: "cron",
        operation: "run_cron_job",
        failureKind: "cron_handler_failed",
        tags: { cron_job: "ai-comment-candidates" },
      }),
    );
  });
});