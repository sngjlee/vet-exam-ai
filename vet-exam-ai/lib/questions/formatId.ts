import type { Question } from "./types";

export function formatPublicId(question: Pick<Question, "publicId" | "id">): string {
  return question.publicId ?? question.id;
}
