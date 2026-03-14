// lib/types.ts
export type WrongAnswerNote = {
    questionId: string;
    question: string;
    category: string;
    choices: string[];
    correctAnswer: string;
    selectedAnswer: string;
    explanation: string;
  };