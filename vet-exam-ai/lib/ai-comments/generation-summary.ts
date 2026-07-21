import type { AiCommentProviderMeta } from "./openai";
import type {
  AiCommentGenerationConfig,
  AiCommentGenerationCounters,
  AiCommentLimitReason,
} from "./limits";
import type { AiCommentGenerationSummary } from "./generate";

export type MutableRunCounts = {
  claimed: number;
  generated: number;
  skipped: number;
  failed: number;
  providerRequests: number;
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
};

export const ZERO_COUNTERS: AiCommentGenerationCounters = {
  dailyRequests: 0,
  monthlyRequests: 0,
  pendingCandidates: 0,
};

type SummaryOptions = Readonly<{
  config: AiCommentGenerationConfig;
  counts: MutableRunCounts;
  pendingTotal: number;
  limitReason: AiCommentLimitReason | null;
}>;

export function summarizeGeneration(options: SummaryOptions): AiCommentGenerationSummary {
  return {
    ...options.counts,
    pendingTotal: options.pendingTotal,
    limitReason: options.limitReason,
    model: options.config.model,
    promptVersion: options.config.promptVersion,
  };
}

export function createRunCounts(): MutableRunCounts {
  return {
    claimed: 0,
    generated: 0,
    skipped: 0,
    failed: 0,
    providerRequests: 0,
    inputTokens: 0,
    outputTokens: 0,
    reasoningTokens: 0,
  };
}

export function addProviderUsage(
  counts: MutableRunCounts,
  meta: AiCommentProviderMeta,
): void {
  counts.inputTokens += meta.usage.inputTokens;
  counts.outputTokens += meta.usage.outputTokens;
  counts.reasoningTokens += meta.usage.reasoningTokens;
}