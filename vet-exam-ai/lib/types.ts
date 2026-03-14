// lib/types.ts
export type WrongAnswerNote = {
    questionId: string;
    question: string;
    category: string;
    choices: string[];
    correctAnswer: string;
    selectedAnswer: string;
    explanation: string;
    // Spaced-repetition review metadata (optional — absent for guest/localStorage notes)
    reviewCount?: number;
    lastReviewedAt?: string | null;
    nextReviewAt?: string | null;
  };