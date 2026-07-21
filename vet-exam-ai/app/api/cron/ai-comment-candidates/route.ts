import type { NextRequest } from "next/server";

import {
  runAiCommentGeneration,
  type AiCommentGenerationSummary,
} from "../../../../lib/ai-comments/generate";
import { readAiCommentGenerationConfig } from "../../../../lib/ai-comments/limits";
import { createOpenAiCommentGenerator } from "../../../../lib/ai-comments/openai";
import { createSupabaseAiCommentGenerationStore } from "../../../../lib/ai-comments/store";
import { runCronJob } from "../../../../lib/cron/run";

class AiCommentGenerationRunFailedError extends Error {
  readonly name = "AiCommentGenerationRunFailedError";

  constructor() {
    super("AI comment candidate generation failed");
  }
}

function toCronResult(summary: AiCommentGenerationSummary): Record<string, unknown> {
  return {
    claimed: summary.claimed,
    generated: summary.generated,
    skipped: summary.skipped,
    failed: summary.failed,
    pendingTotal: summary.pendingTotal,
    inputTokens: summary.inputTokens,
    outputTokens: summary.outputTokens,
    reasoningTokens: summary.reasoningTokens,
    limitReason: summary.limitReason,
    model: summary.model,
    promptVersion: summary.promptVersion,
  };
}

export async function GET(req: NextRequest) {
  return runCronJob(req, "ai-comment-candidates", async (admin) => {
    const config = readAiCommentGenerationConfig();
    const summary = await runAiCommentGeneration({
      store: createSupabaseAiCommentGenerationStore(admin),
      generator: createOpenAiCommentGenerator({ maxOutputTokens: config.maxOutputTokens }),
      config,
    });

    if (summary.failed > 0) throw new AiCommentGenerationRunFailedError();
    return toCronResult(summary);
  });
}
