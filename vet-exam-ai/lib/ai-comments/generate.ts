import type {
  AiCommentGenerationFailureCode,
  AiCommentGenerator,
  AiCommentProviderMeta,
} from "./openai";
import type { AiCommentCandidate } from "./schema";
import { runClaimOperation } from "./claim-finalization";
import {
  resolveAiCommentCapacity,
  type AiCommentGenerationConfig,
  type AiCommentGenerationCounters,
  type AiCommentLimitReason,
} from "./limits";
import {
  addProviderUsage,
  createRunCounts,
  summarizeGeneration,
  ZERO_COUNTERS,
} from "./generation-summary";
import { selectAiCommentQuestions, type AiCommentQuestionSource } from "./select";

export type AiCommentSeedAccountIds = Readonly<{
  memory: string;
  explain: string;
  wrong: string;
  correction: string;
}>;

export type AiCommentGenerationSnapshot = Readonly<{
  counters: AiCommentGenerationCounters;
  questions: readonly AiCommentQuestionSource[];
  visibleCommentQuestionIds: readonly string[];
  currentCandidateQuestionIds: readonly string[];
  existingInputHashes: readonly string[];
}>;

export type AiCommentClaim = Readonly<{
  questionPublicId: string;
  inputHash: string;
  model: string;
  promptVersion: string;
  dailyLimit: number;
  monthlyLimit: number;
  pendingLimit: number;
}>;

export type AiCommentReservationResult =
  | Readonly<{ kind: "claimed"; claimId: string }>
  | Readonly<{ kind: "duplicate" }>
  | Readonly<{ kind: "daily_limit" }>
  | Readonly<{ kind: "monthly_limit" }>
  | Readonly<{ kind: "pending_limit" }>;

export type AiCommentPendingUpdate = Readonly<{
  claimId: string;
  seedUserId: string;
  candidate: AiCommentCandidate;
  meta: AiCommentProviderMeta;
}>;

export type AiCommentClaimFailureCode =
  | AiCommentGenerationFailureCode
  | "seed_account_resolution_failed"
  | "pending_persistence_failed";

export type AiCommentFailureUpdate = Readonly<{
  claimId: string;
  failureCode: AiCommentClaimFailureCode;
  meta?: AiCommentProviderMeta;
}>;

export interface AiCommentGenerationStore {
  loadSnapshot(now: Date): Promise<AiCommentGenerationSnapshot>;
  resolveSeedAccountIds(): Promise<AiCommentSeedAccountIds>;
  claim(input: AiCommentClaim): Promise<AiCommentReservationResult>;
  markPending(update: AiCommentPendingUpdate): Promise<void>;
  markFailed(update: AiCommentFailureUpdate): Promise<void>;
}

export type AiCommentGenerationSummary = Readonly<{
  claimed: number;
  generated: number;
  skipped: number;
  failed: number;
  providerRequests: number;
  pendingTotal: number;
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  limitReason: AiCommentLimitReason | null;
  model: string;
  promptVersion: string;
}>;

export type RunAiCommentGenerationOptions = Readonly<{
  store: AiCommentGenerationStore;
  generator: AiCommentGenerator;
  config: AiCommentGenerationConfig;
  now?: Date;
}>;

class AiCommentOrchestrationInvariantError extends Error {
  readonly name = "AiCommentOrchestrationInvariantError";
  constructor() { super("Unexpected AI comment orchestration variant"); }
}


function assertNever(value: never): never {
  void value;
  throw new AiCommentOrchestrationInvariantError();
}


export async function runAiCommentGeneration(
  options: RunAiCommentGenerationOptions,
): Promise<AiCommentGenerationSummary> {
  const counts = createRunCounts();
  const preflight = resolveAiCommentCapacity(options.config, ZERO_COUNTERS);
  if (preflight.reason === "disabled" || preflight.reason === "missing_api_key") {
    return summarizeGeneration({ config: options.config, counts, pendingTotal: 0, limitReason: preflight.reason });
  }

  const snapshot = await options.store.loadSnapshot(options.now ?? new Date());
  const capacity = resolveAiCommentCapacity(options.config, snapshot.counters);
  if (capacity.reason !== null) {
    return summarizeGeneration({
      config: options.config,
      counts,
      pendingTotal: snapshot.counters.pendingCandidates,
      limitReason: capacity.reason,
    });
  }

  const selections = selectAiCommentQuestions({
    questions: snapshot.questions,
    visibleCommentQuestionIds: snapshot.visibleCommentQuestionIds,
    currentCandidateQuestionIds: snapshot.currentCandidateQuestionIds,
    existingInputHashes: snapshot.existingInputHashes,
    model: options.config.model,
    promptVersion: options.config.promptVersion,
    maxSelections: capacity.remaining,
  });
  if (selections.length === 0) {
    return summarizeGeneration({
      config: options.config,
      counts,
      pendingTotal: snapshot.counters.pendingCandidates,
      limitReason: "no_eligible",
    });
  }

  let seedIds: AiCommentSeedAccountIds | null = null;
  let limitReason: AiCommentLimitReason | null = null;
  generationLoop: for (const selection of selections) {
    const claim = await options.store.claim({
      questionPublicId: selection.publicId,
      inputHash: selection.inputHash,
      model: options.config.model,
      promptVersion: options.config.promptVersion,
      dailyLimit: options.config.dailyLimit,
      monthlyLimit: options.config.monthlyLimit,
      pendingLimit: options.config.pendingLimit,
    });
    let claimId: string;
    switch (claim.kind) {
      case "duplicate":
        counts.skipped += 1;
        continue;
      case "daily_limit":
        limitReason = "daily_cap";
        break generationLoop;
      case "monthly_limit":
        limitReason = "monthly_cap";
        break generationLoop;
      case "pending_limit":
        limitReason = "pending_cap";
        break generationLoop;
      case "claimed":
        claimId = claim.claimId;
        break;
      default:
        assertNever(claim);
    }

    counts.claimed += 1;
    const activeSeedIds: AiCommentSeedAccountIds = seedIds ?? await runClaimOperation(
      () => options.store.resolveSeedAccountIds(),
      options.store,
      { claimId, failureCode: "seed_account_resolution_failed" },
    );
    seedIds = activeSeedIds;

    counts.providerRequests += 1;
    const generated = await runClaimOperation(
      () => options.generator.generate({
        input: selection.input,
        model: options.config.model,
        promptVersion: options.config.promptVersion,
      }),
      options.store,
      { claimId, failureCode: "provider_error" },
    );

    switch (generated.kind) {
      case "candidate":
        addProviderUsage(counts, generated.meta);
        await runClaimOperation(
          () => options.store.markPending({
            claimId,
            seedUserId: activeSeedIds[generated.candidate.authorKey],
            candidate: generated.candidate,
            meta: generated.meta,
          }),
          options.store,
          {
            claimId,
            failureCode: "pending_persistence_failed",
            meta: generated.meta,
          },
        );
        counts.generated += 1;
        continue;
      case "failure": {
        const failureUpdate: AiCommentFailureUpdate = "meta" in generated
          ? { claimId, failureCode: generated.code, meta: generated.meta }
          : { claimId, failureCode: generated.code };
        if (failureUpdate.meta !== undefined) addProviderUsage(counts, failureUpdate.meta);
        await options.store.markFailed(failureUpdate);
        counts.failed += 1;
        if (generated.code === "missing_api_key") limitReason = "missing_api_key";
        break;
      }
      default:
        assertNever(generated);
    }
    if (limitReason !== null) break;
  }

  return summarizeGeneration({
    config: options.config,
    counts,
    pendingTotal: snapshot.counters.pendingCandidates + counts.generated,
    limitReason,
  });
}
