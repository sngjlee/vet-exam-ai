import {
  readAiCommentGenerationConfig,
  resolveAiCommentCapacity,
  type AiCommentGenerationConfig,
  type AiCommentGenerationCounters,
  type AiCommentLimitReason,
} from "../../../../lib/ai-comments/limits";
import { createClient } from "../../../../lib/supabase/server";

export type AiCommentOpsRun = Readonly<{
  job_name: string;
  status: "success" | "failure";
  detail: Record<string, unknown> | null;
  finished_at: string;
}>;

export type AiCommentOpsSnapshot = Readonly<{
  config: AiCommentGenerationConfig;
  counters: AiCommentGenerationCounters;
  latestRun: AiCommentOpsRun | null;
  countersAvailable: boolean;
}>;

export type AiCommentOpsState =
  | "missing-key"
  | "disabled"
  | "cap-reached"
  | "healthy"
  | "unavailable";

export type AiCommentOpsView = Readonly<{
  state: AiCommentOpsState;
  label: string;
  detail: string;
  capReason: string;
  latestResult: string;
}>;

function utcStarts(now: Date): Readonly<{ day: string; month: string }> {
  return {
    day: new Date(Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
    )).toISOString(),
    month: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString(),
  };
}

export async function loadAiCommentOpsSnapshot(
  cronRuns: readonly AiCommentOpsRun[],
  now: Date = new Date(),
): Promise<AiCommentOpsSnapshot> {
  const config = readAiCommentGenerationConfig();
  const starts = utcStarts(now);
  const supabase = await createClient();
  const [daily, monthly, pending] = await Promise.all([
    supabase
      .from("ai_comment_candidates")
      .select("id", { count: "exact", head: true })
      .gte("created_at", starts.day),
    supabase
      .from("ai_comment_candidates")
      .select("id", { count: "exact", head: true })
      .gte("created_at", starts.month),
    supabase
      .from("ai_comment_candidates")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending"),
  ]);
  const countersAvailable = daily.error === null
    && monthly.error === null
    && pending.error === null;

  return {
    config,
    counters: {
      dailyRequests: daily.count ?? 0,
      monthlyRequests: monthly.count ?? 0,
      pendingCandidates: pending.count ?? 0,
    },
    latestRun: cronRuns.find((run) => run.job_name === "ai-comment-candidates") ?? null,
    countersAvailable,
  };
}

function capReasonLabel(reason: AiCommentLimitReason | null): string {
  switch (reason) {
    case "pending_cap":
      return "대기 후보 상한";
    case "monthly_cap":
      return "월간 요청 상한";
    case "daily_cap":
      return "일일 요청 상한";
    case "disabled":
      return "생성 비활성";
    case "missing_api_key":
      return "API 키 누락";
    case "no_eligible":
      return "생성 가능 문항 없음";
    case null:
      return "없음";
  }
}

function safeCount(detail: Record<string, unknown> | null, key: string): number {
  if (detail === null || Array.isArray(detail) || typeof detail !== "object") return 0;
  const value = detail[key];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function latestResult(run: AiCommentOpsRun | null): string {
  if (run === null) return "기록 없음";
  if (run.status === "failure") return "실패 · 일반화된 오류만 운영 로그에서 확인";
  return `성공 · 생성 ${safeCount(run.detail, "generated")} · 실패 ${safeCount(run.detail, "failed")}`;
}

export function deriveAiCommentOpsView(snapshot: AiCommentOpsSnapshot): AiCommentOpsView {
  const latest = latestResult(snapshot.latestRun);
  if (!snapshot.countersAvailable) {
    return {
      state: "unavailable",
      label: "카운터 조회 실패",
      detail: "후보 카운터를 읽지 못했습니다. migration과 관리자 권한을 확인하세요.",
      capReason: "판단 불가",
      latestResult: latest,
    };
  }
  if (!snapshot.config.apiKeyConfigured) {
    return {
      state: "missing-key",
      label: "API 키 누락",
      detail: "라이브 provider 호출에 필요한 서버 전용 키가 없습니다.",
      capReason: "API 키 누락",
      latestResult: latest,
    };
  }
  if (!snapshot.config.enabled) {
    return {
      state: "disabled",
      label: "생성 비활성",
      detail: "kill switch가 꺼져 있어 provider 호출과 후보 생성이 중지됩니다.",
      capReason: "생성 비활성",
      latestResult: latest,
    };
  }

  const capacity = resolveAiCommentCapacity(snapshot.config, snapshot.counters);
  if (capacity.reason !== null) {
    return {
      state: "cap-reached",
      label: "요청 상한 도달",
      detail: "상한이 해제될 때까지 자동 재시도하지 않습니다.",
      capReason: capReasonLabel(capacity.reason),
      latestResult: latest,
    };
  }

  return {
    state: "healthy",
    label: "생성 가능",
    detail: `다음 실행에서 최대 ${capacity.remaining}개 후보를 예약할 수 있습니다.`,
    capReason: "없음",
    latestResult: latest,
  };
}
