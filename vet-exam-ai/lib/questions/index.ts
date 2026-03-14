// Barrel export — drop-in replacement for the old lib/ai import path.
// Import from "@/lib/questions" instead of "@/lib/ai".
export type { Question, Difficulty, QuestionSource } from "./types";
export { questions } from "./bank";
export { getCategories, shuffleArray, createSessionQuestions } from "./utils";
