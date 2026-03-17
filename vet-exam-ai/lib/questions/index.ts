// Public API for the questions module.
// Data comes from Supabase (via useQuestions hook or /api/questions).
// bank.ts is retained only as a seed reference — do not import it in app code.
export type { Question, Difficulty, QuestionSource } from "./types";
export { getCategories, shuffleArray, createSessionQuestions } from "./utils";
