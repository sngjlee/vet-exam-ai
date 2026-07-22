import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
}));

vi.mock("../../../lib/supabase/server", () => ({
  createClient: mocks.createClient,
}));

import AdminOpsPage from "./page";

type TestCounts = Readonly<{
  daily: number;
  monthly: number;
  pending: number;
}>;

type CronFixture = Readonly<{
  job_name: string;
  status: "success" | "failure";
  duration_ms: number;
  detail: Record<string, unknown> | null;
  error: string | null;
  started_at: string;
  finished_at: string;
}>;

function createTestClient(counts: TestCounts, cronRows: readonly CronFixture[]) {
  let rangeQueryIndex = 0;
  return {
    from: vi.fn((table: string) => {
      if (table === "cron_run_logs") {
        return {
          select: vi.fn(() => ({
            order: vi.fn(() => ({
              limit: vi.fn(async () => ({ data: cronRows, error: null })),
            })),
          })),
        };
      }

      return {
        select: vi.fn(() => ({
          gte: vi.fn(async () => {
            rangeQueryIndex += 1;
            return {
              count: rangeQueryIndex === 1 ? counts.daily : counts.monthly,
              error: null,
            };
          }),
          eq: vi.fn(async () => ({ count: counts.pending, error: null })),
        })),
      };
    }),
  };
}

async function renderPage(
  counts: TestCounts = { daily: 0, monthly: 0, pending: 0 },
  cronRows: readonly CronFixture[] = [],
): Promise<string> {
  mocks.createClient.mockResolvedValue(createTestClient(counts, cronRows));
  return renderToStaticMarkup(await AdminOpsPage());
}

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe("AdminOpsPage AI comment operations", () => {
  it("shows missing-key state without exposing a key value", async () => {
    // Given: generation is disabled and no provider key exists.
    vi.stubEnv("AI_COMMENT_GENERATION_ENABLED", "false");
    vi.stubEnv("OPENAI_API_KEY", "");

    // When: the administrator operations page is rendered.
    const html = await renderPage();

    // Then: the missing key is explicit, while no secret value is rendered.
    expect(html).toContain("OpenAI API key");
    expect(html).toContain("API 키 누락");
    expect(html).not.toContain("sk-live-secret");
  });

  it("distinguishes the disabled state when the key is configured", async () => {
    // Given: a provider key exists but the kill switch is disabled.
    vi.stubEnv("OPENAI_API_KEY", "sk-live-secret");
    vi.stubEnv("AI_COMMENT_GENERATION_ENABLED", "false");

    // When: the administrator operations page is rendered.
    const html = await renderPage();

    // Then: disabled is distinct from a missing key and the key is redacted.
    expect(html).toContain("생성 비활성");
    expect(html).not.toContain("API 키 누락");
    expect(html).not.toContain("sk-live-secret");
  });

  it("shows cap reason and bounded counters when a limit is reached", async () => {
    // Given: generation is enabled and today's request allowance is exhausted.
    vi.stubEnv("OPENAI_API_KEY", "sk-live-secret");
    vi.stubEnv("AI_COMMENT_GENERATION_ENABLED", "true");

    // When: the administrator operations page is rendered.
    const html = await renderPage({ daily: 5, monthly: 12, pending: 3 });

    // Then: the cap state names the reason and all counters.
    expect(html).toContain("요청 상한 도달");
    expect(html).toContain("일일 요청 상한");
    expect(html).toContain("5 / 5");
    expect(html).toContain("12 / 150");
    expect(html).toContain("3 / 50");
  });

  it("shows a healthy recent result without provider request identifiers", async () => {
    // Given: capacity remains and the latest generation run succeeded.
    vi.stubEnv("OPENAI_API_KEY", "sk-live-secret");
    vi.stubEnv("AI_COMMENT_GENERATION_ENABLED", "true");
    const latestRun: CronFixture = {
      job_name: "ai-comment-candidates",
      status: "success",
      duration_ms: 123,
      detail: {
        generated: 2,
        failed: 0,
        limitReason: null,
        openai_request_id: "provider-private-id",
        client_request_id: "client-private-id",
      },
      error: null,
      started_at: "2026-07-13T05:00:00.000Z",
      finished_at: "2026-07-13T05:00:01.000Z",
    };

    // When: the administrator operations page is rendered.
    const html = await renderPage({ daily: 2, monthly: 20, pending: 4 }, [latestRun]);

    // Then: the safe aggregate is visible and private identifiers stay hidden.
    expect(html).toContain("생성 가능");
    expect(html).toContain("gpt-5.6-terra");
    expect(html).toContain("최근 생성 결과");
    expect(html).toContain("성공 · 생성 2 · 실패 0");
    expect(html).not.toContain("provider-private-id");
    expect(html).not.toContain("client-private-id");
    expect(html).not.toContain("sk-live-secret");
  });
});
