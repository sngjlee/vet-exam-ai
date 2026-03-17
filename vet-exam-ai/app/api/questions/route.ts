import { NextResponse } from "next/server";
import { createClient } from "../../../lib/supabase/server";
import type { Question } from "../../../lib/questions/types";
import type { QuestionRow } from "../../../lib/supabase/types";

function rowToQuestion(row: QuestionRow): Question {
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

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const category = searchParams.get("category");

  const supabase = await createClient();

  let query = supabase
    .from("questions")
    .select("*")
    .eq("is_active", true)
    .order("id");

  if (category) {
    query = query.eq("category", category);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const questions: Question[] = (data as QuestionRow[]).map(rowToQuestion);
  return NextResponse.json(questions);
}
