import { describe, expect, it } from "vitest";

import {
  runAiCommentGeneration,
  type AiCommentFailureUpdate,
  type AiCommentGenerationSnapshot,
  type AiCommentGenerationStore,
  type AiCommentReservationResult,
  type AiCommentSeedAccountIds,
} from "./generate";
import { DEFAULT_AI_COMMENT_CONFIG } from "./limits";
import type { AiCommentGenerator, AiCommentProviderMeta } from "./openai";
import type { AiCommentQuestionSource } from "./select";

const meta: AiCommentProviderMeta = {
  model: "gpt-5.6-terra",
  promptVersion: "v1",
  clientRequestId: "client-request",
  providerRequestId: "provider-request",
  usage: { inputTokens: 10, outputTokens: 4, reasoningTokens: 2 },
};

const seedIds: AiCommentSeedAccountIds = {
  memory: "user-memory",
  explain: "user-explain",
  wrong: "user-wrong",
  correction: "user-correction",
};

const question: AiCommentQuestionSource = {
  publicId: "KVLE-FINALIZE",
  question: "반추위 산증의 특징은 무엇인가?",
  choices: ["젖산 축적", "반추위 pH 상승"],
  answer: "젖산 축적",
  explanation: "젖산 축적으로 반추위 pH가 감소한다.",
  category: "내과학",
  subject: "소화기",
  topic: null,
  isActive: true,
  year: 2025,
  session: 1,
  round: 69,
  questionImageFiles: [],
  explanationImageFiles: [],
  questionImageFilesOriginal: [],
  explanationImageFilesOriginal: [],
};

class FinalizationStore implements AiCommentGenerationStore {
  readonly failed: AiCommentFailureUpdate[] = [];

  async loadSnapshot(): Promise<AiCommentGenerationSnapshot> {
    return {
      counters: { dailyRequests: 0, monthlyRequests: 0, pendingCandidates: 0 },
      questions: [question],
      visibleCommentQuestionIds: [],
      currentCandidateQuestionIds: [],
      existingInputHashes: [],
    };
  }

  async resolveSeedAccountIds(): Promise<AiCommentSeedAccountIds> {
    return seedIds;
  }

  async claim(): Promise<AiCommentReservationResult> {
    return { kind: "claimed", claimId: "claim-1" };
  }

  async markPending(): Promise<void> {}

  async markFailed(update: AiCommentFailureUpdate): Promise<void> {
    this.failed.push(update);
  }
}

function successfulGenerator(calls: string[]): AiCommentGenerator {
  return {
    async generate() {
      calls.push("generate");
      return {
        kind: "candidate",
        candidate: {
          authorKey: "memory",
          commentType: "memorization",
          bodyText: "젖산 축적과 반추위 산도 감소를 연결해서 기억하면 정답을 고르기 쉽습니다.",
          riskFlags: [],
          reason: "공식 해설에 근거했습니다.",
        },
        meta,
      };
    },
  };
}

const config = {
  ...DEFAULT_AI_COMMENT_CONFIG,
  enabled: true,
  apiKeyConfigured: true,
};

describe("AI comment claim failure finalization", () => {
  it("marks a claimed candidate failed when seed account resolution throws", async () => {
    // Given
    const store = new FinalizationStore();
    store.resolveSeedAccountIds = async () => {
      throw new Error("seed account unavailable");
    };
    const calls: string[] = [];

    // When
    const run = runAiCommentGeneration({ store, generator: successfulGenerator(calls), config });

    // Then
    await expect(run).rejects.toThrow("seed account unavailable");
    expect(store.failed).toEqual([{
      claimId: "claim-1",
      failureCode: "seed_account_resolution_failed",
    }]);
    expect(calls).toEqual([]);
  });

  it("attempts a typed failure transition when pending persistence throws", async () => {
    // Given
    const store = new FinalizationStore();
    store.markPending = async () => {
      throw new Error("pending persistence unavailable");
    };

    // When
    const run = runAiCommentGeneration({ store, generator: successfulGenerator([]), config });

    // Then
    await expect(run).rejects.toThrow("pending persistence unavailable");
    expect(store.failed).toEqual([{
      claimId: "claim-1",
      failureCode: "pending_persistence_failed",
      meta,
    }]);
  });
});