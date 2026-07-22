import { describe, expect, it } from "vitest";

import {
  createAiCommentInputHash,
  selectAiCommentQuestions,
  type AiCommentQuestionSource,
} from "./select";

function question(
  publicId: string,
  overrides: Partial<AiCommentQuestionSource> = {},
): AiCommentQuestionSource {
  return {
    publicId,
    question: "반추위 산증의 특징은 무엇인가?",
    choices: ["젖산 축적", "반추위 pH 상승"],
    answer: "젖산 축적",
    explanation: "젖산 축적으로 반추위 pH가 감소한다.",
    category: "내과학",
    subject: "소화기",
    topic: "반추위 질환",
    isActive: true,
    questionImageFiles: [],
    explanationImageFiles: [],
    questionImageFilesOriginal: [],
    explanationImageFilesOriginal: [],
    year: 2025,
    session: 1,
    round: 69,
    ...overrides,
  };
}

function select(
  questions: readonly AiCommentQuestionSource[],
  overrides: Partial<Parameters<typeof selectAiCommentQuestions>[0]> = {},
) {
  return selectAiCommentQuestions({
    questions,
    visibleCommentQuestionIds: [],
    currentCandidateQuestionIds: [],
    existingInputHashes: [],
    model: "gpt-5.6-terra",
    promptVersion: "v1",
    maxSelections: 5,
    ...overrides,
  });
}

describe("selectAiCommentQuestions", () => {
  it("prioritizes zero-comment questions and uses stable public-id ordering", () => {
    // Given
    const questions = [question("KVLE-0003"), question("KVLE-0001"), question("KVLE-0002")];

    // When
    const selected = select(questions, { visibleCommentQuestionIds: ["KVLE-0001"] });

    // Then
    expect(selected.map((item) => item.publicId)).toEqual([
      "KVLE-0002",
      "KVLE-0003",
      "KVLE-0001",
    ]);
  });

  it("balances categories and subjects against current and newly selected candidates", () => {
    // Given
    const questions = [
      question("KVLE-A0", { category: "내과", subject: "소화기" }),
      question("KVLE-A1", { category: "내과", subject: "소화기" }),
      question("KVLE-B0", { category: "외과", subject: "정형" }),
      question("KVLE-C0", { category: "예방", subject: "전염병" }),
    ];

    // When
    const selected = select(questions, {
      currentCandidateQuestionIds: ["KVLE-A0", "KVLE-A0", "KVLE-B0"],
      maxSelections: 3,
    });

    // Then
    expect(selected.map((item) => item.publicId)).toEqual(["KVLE-C0", "KVLE-B0", "KVLE-A0"]);
  });

  it.each([
    ["inactive", { isActive: false }],
    ["blank question", { question: "  " }],
    ["blank answer", { answer: "" }],
    ["blank explanation", { explanation: "" }],
    ["blank category", { category: "" }],
    ["blank subject", { subject: null }],
    ["one choice", { choices: ["젖산 축적"] }],
    ["blank choice", { choices: ["젖산 축적", ""] }],
    ["answer mismatch", { answer: "운동성 증가" }],
    ["normalized duplicate choices", { choices: ["젖산  축적", " 젖산 축적 "] }],
    ["missing year", { year: null }],
    ["missing session", { session: null }],
    ["missing round", { round: null }],
    ["invalid session", { session: 0 }],
    ["round and year mismatch", { round: 68, year: 2025 }],
    ["question image", { questionImageFiles: ["question.png"] }],
    ["explanation image", { explanationImageFiles: ["answer.png"] }],
    ["original question image", { questionImageFilesOriginal: ["question-original.png"] }],
    ["original explanation image", { explanationImageFilesOriginal: ["answer-original.png"] }],
  ])("excludes quality-incomplete or image-dependent input: %s", (_name, overrides) => {
    // Given
    const source = question("KVLE-BAD", overrides);

    // When
    const selected = select([source]);

    // Then
    expect(selected).toEqual([]);
  });

  it("skips a previously claimed content/model/prompt hash", () => {
    // Given
    const first = select([question("KVLE-0001")], { maxSelections: 1 });
    const firstSelection = first[0];
    expect(firstSelection).toBeDefined();

    // When
    const selected = select([question("KVLE-0001")], {
      existingInputHashes: firstSelection === undefined ? [] : [firstSelection.inputHash],
    });

    // Then
    expect(selected).toEqual([]);
  });

  it("hashes only the approved grounding input plus model and prompt version", () => {
    // Given
    const selected = select([question("KVLE-0001")], { maxSelections: 1 });
    const input = selected[0]?.input;
    expect(input).toBeDefined();
    if (input === undefined) return;

    // When
    const same = createAiCommentInputHash(input, "gpt-5.6-terra", "v1");
    const differentModel = createAiCommentInputHash(input, "gpt-5.6-sol", "v1");
    const differentPrompt = createAiCommentInputHash(input, "gpt-5.6-terra", "v2");

    // Then
    expect(same).toBe(selected[0]?.inputHash);
    expect(differentModel).not.toBe(same);
    expect(differentPrompt).not.toBe(same);
    expect(Object.keys(input).sort()).toEqual([
      "answer", "category", "choices", "explanation", "public_id", "question", "subject", "topic",
    ]);
  });
});
