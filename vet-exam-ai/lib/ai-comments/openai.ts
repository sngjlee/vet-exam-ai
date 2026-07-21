import "server-only";

import { randomUUID } from "node:crypto";

import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z, ZodError } from "zod";

import { buildAiCommentPrompt } from "./prompt";
import {
  aiCommentOutputSchema,
  aiCommentQuestionInputSchema,
  validateAiCommentOutput,
  type AiCommentCandidate,
  type AiCommentQuestionInput,
  type AiCommentValidationFailureCode,
} from "./schema";

export const DEFAULT_AI_COMMENT_MODEL = "gpt-5.6-terra" as const;
export const DEFAULT_AI_COMMENT_MAX_OUTPUT_TOKENS = 800 as const;

export type AiCommentUsage = Readonly<{
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
}>;

export type AiCommentProviderMeta = Readonly<{
  model: string;
  promptVersion: string;
  clientRequestId: string;
  providerRequestId: string | null;
  usage: AiCommentUsage;
}>;

export type AiCommentGenerationFailureCode =
  | "missing_api_key"
  | "invalid_input"
  | "provider_error"
  | "refusal"
  | "incomplete"
  | AiCommentValidationFailureCode;

export type AiCommentGenerationResult =
  | Readonly<{ kind: "candidate"; candidate: AiCommentCandidate; meta: AiCommentProviderMeta }>
  | Readonly<{ kind: "failure"; code: "missing_api_key" | "invalid_input" }>
  | Readonly<{
      kind: "failure";
      code: Exclude<AiCommentGenerationFailureCode, "missing_api_key" | "invalid_input">;
      meta: AiCommentProviderMeta;
    }>;

export type AiCommentGenerationRequest = Readonly<{
  input: AiCommentQuestionInput;
  model: string;
  promptVersion: string;
}>;

export type AiCommentGenerator = Readonly<{
  generate(request: AiCommentGenerationRequest): Promise<AiCommentGenerationResult>;
}>;

export type OpenAiCommentGeneratorConfig = Readonly<{
  apiKey?: string;
  baseURL?: string;
  maxOutputTokens?: number;
  timeoutMs?: number;
}>;

const generationRequestSchema = z.object({
  input: aiCommentQuestionInputSchema,
  model: z.string().trim().min(1),
  promptVersion: z.string().trim().min(1).max(100),
}).strict();

const ZERO_USAGE: AiCommentUsage = {
  inputTokens: 0,
  outputTokens: 0,
  reasoningTokens: 0,
};

export function createOpenAiCommentGenerator(
  config: OpenAiCommentGeneratorConfig = {},
): AiCommentGenerator {
  const apiKey = config.apiKey ?? process.env.OPENAI_API_KEY;
  if (apiKey === undefined || apiKey.trim() === "") {
    return {
      generate: async () => ({ kind: "failure", code: "missing_api_key" }),
    };
  }

  const maxOutputTokens = z.number().int().min(128).max(DEFAULT_AI_COMMENT_MAX_OUTPUT_TOKENS).parse(
    config.maxOutputTokens
      ?? (process.env.AI_COMMENT_MAX_OUTPUT_TOKENS === undefined
        ? DEFAULT_AI_COMMENT_MAX_OUTPUT_TOKENS
        : Number(process.env.AI_COMMENT_MAX_OUTPUT_TOKENS)),
  );
  const timeout = z.number().int().positive().max(120_000).parse(config.timeoutMs ?? 30_000);
  const client = new OpenAI({ apiKey, baseURL: config.baseURL, maxRetries: 0, timeout });

  return {
    async generate(request: AiCommentGenerationRequest): Promise<AiCommentGenerationResult> {
      const parsedRequest = generationRequestSchema.safeParse(request);
      if (!parsedRequest.success) return { kind: "failure", code: "invalid_input" };
      const { input, model, promptVersion } = parsedRequest.data;
      const clientRequestId = randomUUID();

      try {
        const result = await client.responses.parse({
          model,
          input: [...buildAiCommentPrompt(input, promptVersion)],
          max_output_tokens: maxOutputTokens,
          reasoning: { effort: "medium" },
          store: false,
          text: { format: zodTextFormat(aiCommentOutputSchema, "ai_comment_candidate") },
        }, {
          headers: { "X-Client-Request-Id": clientRequestId },
        }).withResponse();
        const response = result.data;
        const usage = response.usage;
        const meta: AiCommentProviderMeta = {
          model,
          promptVersion,
          clientRequestId,
          providerRequestId: result.request_id,
          usage: usage === undefined ? ZERO_USAGE : {
            inputTokens: usage.input_tokens,
            outputTokens: usage.output_tokens,
            reasoningTokens: usage.output_tokens_details.reasoning_tokens,
          },
        };

        if (response.status === "incomplete") return { kind: "failure", code: "incomplete", meta };
        if (response.status !== "completed") return { kind: "failure", code: "provider_error", meta };
        const refused = response.output.some((item) =>
          item.type === "message" && item.content.some((content) => content.type === "refusal"),
        );
        if (refused) return { kind: "failure", code: "refusal", meta };
        if (response.output_parsed === null) return { kind: "failure", code: "parse_error", meta };

        const validation = validateAiCommentOutput(response.output_parsed);
        return validation.kind === "failure"
          ? { ...validation, meta }
          : { ...validation, meta };
      } catch (error) {
        const failureMeta: AiCommentProviderMeta = {
          model,
          promptVersion,
          clientRequestId,
          providerRequestId: error instanceof OpenAI.APIError ? (error.requestID ?? null) : null,
          usage: ZERO_USAGE,
        };
        if (error instanceof SyntaxError || error instanceof ZodError) {
          return { kind: "failure", code: "parse_error", meta: failureMeta };
        }
        if (error instanceof OpenAI.APIError) {
          return { kind: "failure", code: "provider_error", meta: failureMeta };
        }
        throw error;
      }
    },
  };
}
