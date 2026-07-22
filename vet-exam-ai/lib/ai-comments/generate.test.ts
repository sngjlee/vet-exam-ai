import { describe, expect, it } from "vitest";

import {
  runAiCommentGeneration,
  type AiCommentClaim,
  type AiCommentFailureUpdate,
  type AiCommentGenerationSnapshot,
  type AiCommentGenerationStore,
  type AiCommentPendingUpdate,
  type AiCommentReservationResult,
  type AiCommentSeedAccountIds,
} from "./generate";
import { DEFAULT_AI_COMMENT_CONFIG, type AiCommentGenerationConfig } from "./limits";
import type { AiCommentGenerator, AiCommentProviderMeta } from "./openai";
import type { AiCommentAuthorKey, AiCommentQuestionInput } from "./schema";
import type { AiCommentQuestionSource } from "./select";

const seedIds: AiCommentSeedAccountIds = {
  memory: "user-memory",
  explain: "user-explain",
  wrong: "user-wrong",
  correction: "user-correction",
};

const meta: AiCommentProviderMeta = {
  model: "gpt-5.6-terra",
  promptVersion: "v1",
  clientRequestId: "client-request",
  providerRequestId: "provider-request",
  usage: { inputTokens: 10, outputTokens: 4, reasoningTokens: 2 },
};

function question(publicId: string, category = "내과", subject = "소화기"): AiCommentQuestionSource {
  return {
    publicId,
    question: "반추위 산증의 특징은 무엇인가?",
    choices: ["젖산 축적", "반추위 pH 상승"],
    answer: "젖산 축적",
    explanation: "젖산이 축적되어 반추위 pH가 감소한다.",
    category,
    subject,
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
}

function config(overrides: Partial<AiCommentGenerationConfig> = {}): AiCommentGenerationConfig {
  return {
    ...DEFAULT_AI_COMMENT_CONFIG,
    enabled: true,
    apiKeyConfigured: true,
    ...overrides,
  };
}

class MemoryStore implements AiCommentGenerationStore {
  readonly claims = new Map<string, AiCommentClaim>();
  readonly pending: AiCommentPendingUpdate[] = [];
  readonly failed: AiCommentFailureUpdate[] = [];
  seedResolutionCount = 0;

  constructor(readonly snapshot: AiCommentGenerationSnapshot) {}

  async loadSnapshot(): Promise<AiCommentGenerationSnapshot> {
    return this.snapshot;
  }

  async resolveSeedAccountIds(): Promise<AiCommentSeedAccountIds> {
    this.seedResolutionCount += 1;
    return seedIds;
  }

  async claim(input: AiCommentClaim): Promise<AiCommentReservationResult> {
    if (this.claims.has(input.inputHash)) return { kind: "duplicate" } as const;
    const claimId = `claim-${this.claims.size + 1}`;
    this.claims.set(input.inputHash, input);
    return { kind: "claimed", claimId } as const;
  }

  async markPending(update: AiCommentPendingUpdate): Promise<void> {
    this.pending.push(update);
  }

  async markFailed(update: AiCommentFailureUpdate): Promise<void> {
    this.failed.push(update);
  }
}

function snapshot(questions: readonly AiCommentQuestionSource[], counters = { dailyRequests: 0, monthlyRequests: 0, pendingCandidates: 0 }): AiCommentGenerationSnapshot {
  return {
    counters,
    questions,
    visibleCommentQuestionIds: [],
    currentCandidateQuestionIds: [],
    existingInputHashes: [],
  };
}

function successfulGenerator(authorKey: AiCommentAuthorKey = "memory"): AiCommentGenerator & { readonly calls: AiCommentQuestionInput[] } {
  const calls: AiCommentQuestionInput[] = [];
  return {
    calls,
    async generate(input) {
      calls.push(input.input);
      const commentType = authorKey === "memory"
        ? "memorization"
        : authorKey === "correction" ? "correction" : "explanation";
      return {
        kind: "candidate",
        candidate: {
          authorKey,
          commentType,
          bodyText: "젖산 축적과 반추위 산도 감소를 연결해서 기억하면 정답을 고르기 쉽습니다.",
          riskFlags: [],
          reason: "공식 해설에 근거했습니다.",
        },
        meta,
      };
    },
  };
}

describe("runAiCommentGeneration", () => {

  it("generates at most five private pending candidates and sums exact usage", async () => {
    // Given
    const store = new MemoryStore(snapshot(Array.from({ length: 6 }, (_value, index) =>
      question(`KVLE-000${index + 1}`, `분류-${index % 3}`, `과목-${index % 2}`),
    )));
    const generator = successfulGenerator();

    // When
    const result = await runAiCommentGeneration({ store, generator, config: config() });

    // Then
    expect(result).toMatchObject({
      claimed: 5,
      generated: 5,
      failed: 0,
      providerRequests: 5,
      inputTokens: 50,
      outputTokens: 20,
      reasoningTokens: 10,
      pendingTotal: 5,
    });
    expect(store.pending).toHaveLength(5);
    expect(store.pending.every((item) => item.seedUserId === seedIds.memory)).toBe(true);
  });

  it.each([
    ["disabled", config({ enabled: false }), { dailyRequests: 0, monthlyRequests: 0, pendingCandidates: 0 }],
    ["missing_api_key", config({ apiKeyConfigured: false }), { dailyRequests: 0, monthlyRequests: 0, pendingCandidates: 0 }],
    ["daily_cap", config(), { dailyRequests: 5, monthlyRequests: 5, pendingCandidates: 0 }],
    ["monthly_cap", config(), { dailyRequests: 0, monthlyRequests: 150, pendingCandidates: 0 }],
    ["pending_cap", config(), { dailyRequests: 0, monthlyRequests: 0, pendingCandidates: 50 }],
  ])("stops at %s without claims, account provisioning, or provider calls", async (reason, generationConfig, counters) => {
    // Given
    const store = new MemoryStore(snapshot([question("KVLE-0001")], counters));
    const generator = successfulGenerator();

    // When
    const result = await runAiCommentGeneration({ store, generator, config: generationConfig });

    // Then
    expect(result.limitReason).toBe(reason);
    expect(store.claims.size).toBe(0);
    expect(store.seedResolutionCount).toBe(0);
    expect(generator.calls).toHaveLength(0);
  });

  it("lets only one concurrent run spend on the same input hash", async () => {
    // Given
    const store = new MemoryStore(snapshot([question("KVLE-0001")]));
    const generator = successfulGenerator();

    // When
    const results = await Promise.all([
      runAiCommentGeneration({ store, generator, config: config() }),
      runAiCommentGeneration({ store, generator, config: config() }),
    ]);

    // Then
    expect(generator.calls).toHaveLength(1);
    expect(store.claims.size).toBe(1);
    expect(results.reduce((total, item) => total + item.skipped, 0)).toBe(1);
    expect(store.seedResolutionCount).toBe(1);
  });

  it("marks provider validation failures failed and never marks them pending", async () => {
    // Given
    const store = new MemoryStore(snapshot([question("KVLE-0001")]));
    const generator: AiCommentGenerator = {
      async generate() {
        return { kind: "failure", code: "ungrounded", meta };
      },
    };

    // When
    const result = await runAiCommentGeneration({ store, generator, config: config() });

    // Then
    expect(result).toMatchObject({ claimed: 1, generated: 0, failed: 1, providerRequests: 1 });
    expect(store.failed).toEqual([{ claimId: "claim-1", failureCode: "ungrounded", meta }]);
    expect(store.pending).toEqual([]);
  });

  it.each([
    ["memory", "user-memory"],
    ["explain", "user-explain"],
    ["wrong", "user-wrong"],
    ["correction", "user-correction"],
  ] as const)("maps the %s voice to its existing seed account", async (authorKey, seedUserId) => {
    // Given
    const store = new MemoryStore(snapshot([question("KVLE-0001")]));

    // When
    await runAiCommentGeneration({ store, generator: successfulGenerator(authorKey), config: config() });

    // Then
    expect(store.pending[0]?.seedUserId).toBe(seedUserId);
  });
});

describe("atomic reservation outcomes", () => {
  it("stops before seed provisioning and provider generation on a reservation limit", async () => {
    // Given
    const store = new MemoryStore(snapshot([question("KVLE-LIMIT")]));
    store.claim = async () => ({ kind: "daily_limit" });
    const generator = successfulGenerator();

    // When
    const result = await runAiCommentGeneration({ store, generator, config: config() });

    // Then
    expect(result.limitReason).toBe("daily_cap");
    expect(store.seedResolutionCount).toBe(0);
    expect(generator.calls).toHaveLength(0);
  });

  it("serializes different hashes so concurrent runs spend at most five provider calls", async () => {
    // Given
    let reservations = 0;
    const reserve = async () => {
      if (reservations >= 5) return { kind: "daily_limit" } as const;
      reservations += 1;
      return { kind: "claimed", claimId: `atomic-${reservations}` } as const;
    };
    const firstStore = new MemoryStore(snapshot(Array.from({ length: 5 }, (_value, index) =>
      question(`KVLE-A-${index}`),
    )));
    const secondStore = new MemoryStore(snapshot(Array.from({ length: 5 }, (_value, index) =>
      question(`KVLE-B-${index}`),
    )));
    firstStore.claim = reserve;
    secondStore.claim = reserve;
    const firstGenerator = successfulGenerator();
    const secondGenerator = successfulGenerator();

    // When
    const results = await Promise.all([
      runAiCommentGeneration({ store: firstStore, generator: firstGenerator, config: config() }),
      runAiCommentGeneration({ store: secondStore, generator: secondGenerator, config: config() }),
    ]);

    // Then
    expect(firstGenerator.calls.length + secondGenerator.calls.length).toBe(5);
    expect(results.some((result) => result.limitReason === "daily_cap")).toBe(true);
  });

  it("does not refund or retry a failed reservation slot", async () => {
    // Given
    let reservationUsed = false;
    const reserve = async () => {
      if (reservationUsed) return { kind: "daily_limit" } as const;
      reservationUsed = true;
      return { kind: "claimed", claimId: "failed-slot" } as const;
    };
    const failedStore = new MemoryStore(snapshot([question("KVLE-FAIL")]));
    const nextStore = new MemoryStore(snapshot([question("KVLE-NEXT")]));
    failedStore.claim = reserve;
    nextStore.claim = reserve;
    const failedGenerator: AiCommentGenerator = {
      async generate() {
        return { kind: "failure", code: "provider_error", meta };
      },
    };
    const nextGenerator = successfulGenerator();

    // When
    const first = await runAiCommentGeneration({
      store: failedStore,
      generator: failedGenerator,
      config: config({ dailyLimit: 1 }),
    });
    const second = await runAiCommentGeneration({
      store: nextStore,
      generator: nextGenerator,
      config: config({ dailyLimit: 1 }),
    });

    // Then
    expect(first.failed).toBe(1);
    expect(second.limitReason).toBe("daily_cap");
    expect(nextGenerator.calls).toHaveLength(0);
  });
});