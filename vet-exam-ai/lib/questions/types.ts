export type Difficulty = "easy" | "medium" | "hard";
export type QuestionSource = "manual" | "past_exam" | "ai_generated";

export interface Question {
  // --- core fields ---
  id: string;
  question: string;
  choices: string[];
  answer: string;
  explanation: string;
  category: string; // kept for backwards compatibility

  // --- metadata fields (optional — existing data remains valid) ---
  subject?: string;       // broad subject area, e.g. "Reproductive Physiology"
  topic?: string;         // specific topic within subject, e.g. "Ovulation"
  difficulty?: Difficulty;
  source?: QuestionSource;
  year?: number;          // exam year if sourced from a past exam
  tags?: string[];        // free-form labels, e.g. ["cow", "LH", "ovulation"]
  isActive?: boolean;     // soft-delete flag — false means excluded from sessions
}
