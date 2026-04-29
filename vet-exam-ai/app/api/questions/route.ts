import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "../../../lib/supabase/server";
import type { Question } from "../../../lib/questions";
import type { QuestionRow } from "../../../lib/supabase/types";

type QuestionApiRow = Pick<
  QuestionRow,
  | "id"
  | "public_id"
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
    publicId: row.public_id ?? undefined,
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

export async function GET(req: NextRequest) {
  const supabase = await createClient();

  const url = new URL(req.url);
  const recentYearsRaw = url.searchParams.get("recent_years");
  const category = url.searchParams.get("category");

  // Resolve year cutoff for `recent_years` if present.
  let yearCutoff: number | null = null;
  if (recentYearsRaw) {
    const n = Number.parseInt(recentYearsRaw, 10);
    if (Number.isFinite(n) && n > 0 && n < 100) {
      const { data: latest, error: latestErr } = await supabase
        .from("questions")
        .select("year")
        .eq("is_active", true)
        .not("year", "is", null)
        .order("year", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (latestErr) {
        return NextResponse.json(
          { error: "Failed to resolve latest year" },
          { status: 500 }
        );
      }
      if (latest?.year != null) {
        yearCutoff = latest.year - n + 1;
      }
    }
  }

  // Supabase PostgREST가 db-max-rows=1000으로 응답을 자른다 (.range만으로는 우회 불가).
  // 풀 전체(현재 ~2k+, 추후 증가)를 받기 위해 page 단위 반복.
  const PAGE_SIZE = 1000;
  const all: QuestionApiRow[] = [];

  for (let from = 0; ; from += PAGE_SIZE) {
    let query = supabase
      .from("questions")
      .select(
        "id, public_id, question, choices, answer, explanation, category, subject, topic, difficulty, source, year, tags, is_active"
      )
      .eq("is_active", true);

    if (yearCutoff !== null) {
      query = query.gte("year", yearCutoff);
    }
    if (category) {
      query = query.eq("category", category);
    }

    const { data, error } = await query
      .order("category", { ascending: true })
      .order("id", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);

    if (error) {
      return NextResponse.json(
        { error: "Failed to load questions" },
        { status: 500 }
      );
    }

    const page = data ?? [];
    all.push(...page);
    if (page.length < PAGE_SIZE) break;
  }

  return NextResponse.json(all.map(toQuestion));
}
