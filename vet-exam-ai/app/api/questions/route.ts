import { NextResponse } from "next/server";
import { createClient } from "../../../lib/supabase/server";
import type { Question } from "../../../lib/questions";
import type { QuestionRow } from "../../../lib/supabase/types";

type QuestionApiRow = Pick<
  QuestionRow,
  | "id"
  | "question"
  | "choices"
  | "answer"
  | "explanation"
  | "category"
  | "subject"
  | "topic"
  | "difficulty"
  | "source"
  | "year"
  | "tags"
  | "is_active"
>;

function toQuestion(row: QuestionApiRow): Question {
  return {
    id: row.id,
    question: row.question,
    choices: row.choices,
    answer: row.answer,
    explanation: row.explanation,
    category: row.category,
    subject: row.subject ?? undefined,
    topic: row.topic ?? undefined,
    difficulty: row.difficulty ?? undefined,
    source: row.source ?? undefined,
    year: row.year ?? undefined,
    tags: row.tags ?? undefined,
    isActive: row.is_active,
  };
}

export async function GET() {
  const supabase = await createClient();

  // Supabase 기본 limit은 1000행 — questions 풀 전체(현재 ~2k, 추후 증가)를 받기 위해 명시적으로 상한 확장.
  const { data, error } = await supabase
    .from("questions")
    .select(
      "id, question, choices, answer, explanation, category, subject, topic, difficulty, source, year, tags, is_active"
    )
    .eq("is_active", true)
    .order("category", { ascending: true })
    .order("id", { ascending: true })
    .range(0, 49999);

  if (error) {
    return NextResponse.json(
      { error: "Failed to load questions" },
      { status: 500 }
    );
  }

  return NextResponse.json((data ?? []).map(toQuestion));
}
