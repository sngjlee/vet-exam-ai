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

  const { data, error } = await supabase
    .from("questions")
    .select(
      "id, question, choices, answer, explanation, category, subject, topic, difficulty, source, year, tags, is_active"
    )
    .eq("is_active", true)
    .order("category", { ascending: true })
    .order("id", { ascending: true });

  if (error) {
    return NextResponse.json(
      { error: "Failed to load questions" },
      { status: 500 }
    );
  }

  return NextResponse.json((data ?? []).map(toQuestion));
}
