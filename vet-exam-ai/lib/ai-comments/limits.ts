import { z } from "zod";

export const DEFAULT_AI_COMMENT_CONFIG = {
  enabled: false,
  apiKeyConfigured: false,
  model: "gpt-5.6-terra",
  promptVersion: "v1",
  dailyLimit: 5,
  monthlyLimit: 150,
  pendingLimit: 50,
  maxOutputTokens: 800,
  perRunLimit: 5,
} as const;

export type AiCommentGenerationConfig = Readonly<{
  enabled: boolean;
  apiKeyConfigured: boolean;
  model: string;
  promptVersion: string;
  dailyLimit: number;
  monthlyLimit: number;
  pendingLimit: number;
  maxOutputTokens: number;
  perRunLimit: number;
}>;

export type AiCommentGenerationCounters = Readonly<{
  dailyRequests: number;
  monthlyRequests: number;
  pendingCandidates: number;
}>;

export type AiCommentLimitReason =
  | "disabled"
  | "missing_api_key"
  | "pending_cap"
  | "monthly_cap"
  | "daily_cap"
  | "no_eligible";

export type AiCommentCapacity = Readonly<{
  remaining: number;
  reason: AiCommentLimitReason | null;
}>;

type Environment = Readonly<Record<string, string | undefined>>;
type BoundedIntegerOptions = Readonly<{ fallback: number; ceiling: number }>;

const nonBlankSchema = z.string().trim().min(1);
const positiveIntegerSchema = z.coerce.number().int().positive();

function boundedInteger(
  raw: string | undefined,
  options: BoundedIntegerOptions,
): number {
  if (raw === undefined) return options.fallback;
  const parsed = positiveIntegerSchema.safeParse(raw);
  return parsed.success ? Math.min(parsed.data, options.ceiling) : options.fallback;
}

function nonBlankOrDefault(raw: string | undefined, fallback: string): string {
  const parsed = nonBlankSchema.safeParse(raw);
  return parsed.success ? parsed.data : fallback;
}

export function readAiCommentGenerationConfig(
  env: Environment = process.env,
): AiCommentGenerationConfig {
  return {
    enabled: env.AI_COMMENT_GENERATION_ENABLED === "true",
    apiKeyConfigured: nonBlankSchema.safeParse(env.OPENAI_API_KEY).success,
    model: nonBlankOrDefault(env.AI_COMMENT_MODEL, DEFAULT_AI_COMMENT_CONFIG.model),
    promptVersion: nonBlankOrDefault(
      env.AI_COMMENT_PROMPT_VERSION,
      DEFAULT_AI_COMMENT_CONFIG.promptVersion,
    ),
    dailyLimit: boundedInteger(env.AI_COMMENT_DAILY_LIMIT, {
      fallback: DEFAULT_AI_COMMENT_CONFIG.dailyLimit,
      ceiling: DEFAULT_AI_COMMENT_CONFIG.dailyLimit,
    }),
    monthlyLimit: boundedInteger(env.AI_COMMENT_MONTHLY_REQUEST_LIMIT, {
      fallback: DEFAULT_AI_COMMENT_CONFIG.monthlyLimit,
      ceiling: DEFAULT_AI_COMMENT_CONFIG.monthlyLimit,
    }),
    pendingLimit: boundedInteger(env.AI_COMMENT_PENDING_LIMIT, {
      fallback: DEFAULT_AI_COMMENT_CONFIG.pendingLimit,
      ceiling: DEFAULT_AI_COMMENT_CONFIG.pendingLimit,
    }),
    maxOutputTokens: boundedInteger(env.AI_COMMENT_MAX_OUTPUT_TOKENS, {
      fallback: DEFAULT_AI_COMMENT_CONFIG.maxOutputTokens,
      ceiling: DEFAULT_AI_COMMENT_CONFIG.maxOutputTokens,
    }),
    perRunLimit: DEFAULT_AI_COMMENT_CONFIG.perRunLimit,
  };
}

export function resolveAiCommentCapacity(
  config: AiCommentGenerationConfig,
  counters: AiCommentGenerationCounters,
): AiCommentCapacity {
  if (!config.enabled) return { remaining: 0, reason: "disabled" };
  if (!config.apiKeyConfigured) return { remaining: 0, reason: "missing_api_key" };
  if (counters.pendingCandidates >= config.pendingLimit) {
    return { remaining: 0, reason: "pending_cap" };
  }
  if (counters.monthlyRequests >= config.monthlyLimit) {
    return { remaining: 0, reason: "monthly_cap" };
  }
  if (counters.dailyRequests >= config.dailyLimit) {
    return { remaining: 0, reason: "daily_cap" };
  }

  return {
    remaining: Math.max(0, Math.min(
      DEFAULT_AI_COMMENT_CONFIG.perRunLimit,
      config.perRunLimit,
      config.dailyLimit - counters.dailyRequests,
      config.monthlyLimit - counters.monthlyRequests,
      config.pendingLimit - counters.pendingCandidates,
    )),
    reason: null,
  };
}
