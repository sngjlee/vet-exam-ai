import { createHash } from "node:crypto";

import { getQuestionQualityIssues } from "../admin/question-quality";

import type { AiCommentQuestionInput } from "./schema";

export type AiCommentQuestionSource = Readonly<{
  publicId: string;
  question: string;
  choices: readonly string[];
  answer: string;
  explanation: string;
  category: string;
  subject: string | null;
  topic: string | null;
  isActive: boolean;
  year: number | null;
  session: number | null;
  round: number | null;
  questionImageFiles: readonly string[];
  explanationImageFiles: readonly string[];
  questionImageFilesOriginal: readonly string[] | null;
  explanationImageFilesOriginal: readonly string[] | null;
}>;

export type AiCommentSelection = Readonly<{
  publicId: string;
  inputHash: string;
  input: AiCommentQuestionInput;
}>;

export type AiCommentSelectionOptions = Readonly<{
  questions: readonly AiCommentQuestionSource[];
  visibleCommentQuestionIds: readonly string[];
  currentCandidateQuestionIds: readonly string[];
  existingInputHashes: readonly string[];
  model: string;
  promptVersion: string;
  maxSelections: number;
}>;

type BalancedSelection = Readonly<{
  selection: AiCommentSelection;
  category: string;
  subject: string;
}>;

function normalized(value: string): string {
  return value.replace(/\s+/gu, " ").trim();
}

function toQuestionInput(question: AiCommentQuestionSource): AiCommentQuestionInput | null {
  const choices = question.choices.map(normalized);
  const answer = normalized(question.answer);
  const category = normalized(question.category);
  const subject = normalized(question.subject ?? "");
  const qualityIssues = getQuestionQualityIssues({
    question: question.question,
    choices: [...question.choices],
    answer: question.answer,
    explanation: question.explanation,
    category: question.category,
    subject: question.subject,
    year: question.year,
    session: question.session,
    round: question.round,
    tags: null,
    is_active: question.isActive,
  });
  const metadataIsValid = question.year !== null
    && Number.isInteger(question.year)
    && question.year > 0
    && question.session !== null
    && Number.isInteger(question.session)
    && question.session >= 1
    && question.session <= 4
    && question.round !== null
    && Number.isInteger(question.round)
    && question.round > 0;
  const hasImages = [
    question.questionImageFiles,
    question.explanationImageFiles,
    question.questionImageFilesOriginal,
    question.explanationImageFilesOriginal,
  ].some((files) => files !== null && files.length > 0);

  if (
    !question.isActive
    || normalized(question.publicId) === ""
    || qualityIssues.length > 0
    || !metadataIsValid
    || hasImages
  ) {
    return null;
  }

  const topic = question.topic === null ? null : normalized(question.topic);
  return {
    public_id: normalized(question.publicId),
    category,
    subject,
    topic: topic === "" ? null : topic,
    question: normalized(question.question),
    choices,
    answer,
    explanation: normalized(question.explanation),
  };
}

export function createAiCommentInputHash(
  input: AiCommentQuestionInput,
  model: string,
  promptVersion: string,
): string {
  const canonicalInput = JSON.stringify({
    model,
    prompt_version: promptVersion,
    public_id: input.public_id,
    category: input.category,
    subject: input.subject,
    topic: input.topic,
    question: input.question,
    choices: input.choices,
    answer: input.answer,
    explanation: input.explanation,
  });
  return createHash("sha256").update(canonicalInput, "utf8").digest("hex");
}

export function selectAiCommentQuestions(
  options: AiCommentSelectionOptions,
): readonly AiCommentSelection[] {
  const existingHashes = new Set(options.existingInputHashes);
  const visibleIds = new Set(options.visibleCommentQuestionIds);
  const categoryCounts = new Map<string, number>();
  const subjectCounts = new Map<string, number>();
  const inputsByPublicId = new Map<string, AiCommentQuestionInput>();

  for (const question of options.questions) {
    const input = toQuestionInput(question);
    if (input !== null) inputsByPublicId.set(input.public_id, input);
  }
  for (const publicId of options.currentCandidateQuestionIds) {
    const input = inputsByPublicId.get(publicId);
    if (input === undefined) continue;
    categoryCounts.set(input.category, (categoryCounts.get(input.category) ?? 0) + 1);
    subjectCounts.set(input.subject, (subjectCounts.get(input.subject) ?? 0) + 1);
  }

  const remaining: BalancedSelection[] = [];
  for (const input of inputsByPublicId.values()) {
    const inputHash = createAiCommentInputHash(input, options.model, options.promptVersion);
    if (existingHashes.has(inputHash)) continue;
    remaining.push({
      selection: { publicId: input.public_id, inputHash, input },
      category: input.category,
      subject: input.subject,
    });
  }

  const selected: AiCommentSelection[] = [];
  const limit = Math.max(0, Math.floor(options.maxSelections));
  while (selected.length < limit && remaining.length > 0) {
    remaining.sort((left, right) => {
      const leftHasComments = visibleIds.has(left.selection.publicId) ? 1 : 0;
      const rightHasComments = visibleIds.has(right.selection.publicId) ? 1 : 0;
      return leftHasComments - rightHasComments
        || (categoryCounts.get(left.category) ?? 0) - (categoryCounts.get(right.category) ?? 0)
        || (subjectCounts.get(left.subject) ?? 0) - (subjectCounts.get(right.subject) ?? 0)
        || left.selection.publicId.localeCompare(right.selection.publicId, "en");
    });
    const next = remaining.shift();
    if (next === undefined) break;
    selected.push(next.selection);
    categoryCounts.set(next.category, (categoryCounts.get(next.category) ?? 0) + 1);
    subjectCounts.set(next.subject, (subjectCounts.get(next.subject) ?? 0) + 1);
  }
  return selected;
}
