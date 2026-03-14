export type AttemptPayload = {
  sessionId: string;
  questionId: string;
  category: string;
  selectedAnswer: string;
  correctAnswer: string;
  isCorrect: boolean;
};
