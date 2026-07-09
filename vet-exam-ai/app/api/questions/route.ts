import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "../../../lib/supabase/server";
import type { Question, QuestionSummary } from "../../../lib/questions";
import type { QuestionRow } from "../../../lib/supabase/types";
import { logError } from "../../../lib/utils/logging";

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
  | "question_image_files"
  | "explanation_image_files"
>;

type QuestionSummaryApiRow = Pick<
  QuestionRow,
  | "id"
  | "public_id"
  | "question"
  | "category"
  | "topic"
  | "difficulty"
  | "year"
  | "is_active"
>;

const QUESTION_SELECT =
  "id, public_id, question, choices, answer, explanation, category, subject, topic, difficulty, source, year, tags, is_active, question_image_files, explanation_image_files";
const QUESTION_SUMMARY_SELECT =
  "id, public_id, question, category, topic, difficulty, year, is_active";
const PAGE_SIZE = 1000;
const SESSION_POOL_LIMIT = 300;
// Per-category random pool for balanced sessions. Must be >= MAX_SESSION_COUNT so
// a single-category balanced mock can still fill `count`.
const BALANCED_PER_CATEGORY_POOL = 60;
const MAX_SESSION_COUNT = 50;

function toQuestion(row: QuestionApiRow): Question {
  // B1: never expose the internal id (encodes exam round + subject). The public
  // KVLE id is the sole external identifier — placed in `id` so all existing
  // client consumers (round-trip to attempts/wrong_notes/comments, keys, URLs)
  // work unchanged. `year`/`source` are INTERNAL-only and are omitted here.
  const publicId = row.public_id ?? row.id;
  return {
    id: publicId,
    publicId,
    question: row.question,
    choices: row.choices,
    answer: row.answer,
    explanation: row.explanation,
    category: row.category,
    subject: row.subject ?? undefined,
    topic: row.topic ?? undefined,
    difficulty: row.difficulty ?? undefined,
    tags: row.tags ?? undefined,
    isActive: row.is_active,
    questionImageFiles: row.question_image_files ?? undefined,
    explanationImageFiles: row.explanation_image_files ?? undefined,
  };
}

function toQuestionSummary(row: QuestionSummaryApiRow): QuestionSummary {
  // B1: expose only the public KVLE id; omit internal id and year.
  const publicId = row.public_id ?? row.id;
  return {
    id: publicId,
    publicId,
    question: row.question,
    category: row.category,
    topic: row.topic ?? undefined,
    difficulty: row.difficulty ?? undefined,
    isActive: row.is_active,
  };
}

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const url = new URL(req.url);

  const lookupId = url.searchParams.get("id");
  const metaOnly = url.searchParams.get("meta") === "1";
  const summaryOnly = url.searchParams.get("summary") === "1";
  const sessionMode = url.searchParams.get("session") === "1";
  const balancedSession = url.searchParams.get("balanced") === "1";
  const recentYearsRaw = url.searchParams.get("recent_years");
  const category = url.searchParams.get("category");

  if (lookupId) {
    const question = await loadQuestionById(lookupId);
    if (question.error) {
      return NextResponse.json(
        { error: "Failed to load question" },
        { status: 500 },
      );
    }
    if (!question.data) {
      return NextResponse.json({ error: "Question not found" }, { status: 404 });
    }
    return NextResponse.json(toQuestion(question.data));
  }

  if (metaOnly) {
    const meta = await loadQuestionMeta();
    if (meta.error) {
      return NextResponse.json(
        { error: "Failed to load question metadata" },
        { status: 500 },
      );
    }
    return NextResponse.json(meta.data);
  }

  if (sessionMode) {
    const count = clampSessionCount(url.searchParams.get("count"));
    const categories = parseCategories(url.searchParams.get("categories"));
    const session = await loadSessionQuestions(count, categories, balancedSession);
    if (session.error) {
      logError("[questions] session load failed", session.error);
      return NextResponse.json(
        { error: "Failed to load session questions" },
        { status: 500 },
      );
    }
    return NextResponse.json(session.data.map(toQuestion));
  }

  const yearCutoff = await resolveYearCutoff(recentYearsRaw);
  if (yearCutoff.error) {
    return NextResponse.json(
      { error: "Failed to resolve latest year" },
      { status: 500 },
    );
  }

  if (summaryOnly) {
    const summaries = await loadQuestionSummaries(yearCutoff.value, category);
    if (summaries.error) {
      return NextResponse.json(
        { error: "Failed to load question summaries" },
        { status: 500 },
      );
    }
    return NextResponse.json(summaries.data.map(toQuestionSummary));
  }

  const all: QuestionApiRow[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    let query = supabase
      .from("questions")
      .select(QUESTION_SELECT)
      .eq("is_active", true);

    if (yearCutoff.value !== null) {
      query = query.gte("year", yearCutoff.value);
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
        { status: 500 },
      );
    }

    const page = data ?? [];
    all.push(...page);
    if (page.length < PAGE_SIZE) break;
  }

  return NextResponse.json(all.map(toQuestion));

  async function loadQuestionSummaries(
    cutoff: number | null,
    categoryFilter: string | null,
  ): Promise<{ data: QuestionSummaryApiRow[]; error: unknown }> {
    const allSummaries: QuestionSummaryApiRow[] = [];

    for (let from = 0; ; from += PAGE_SIZE) {
      let query = supabase
        .from("questions")
        .select(QUESTION_SUMMARY_SELECT)
        .eq("is_active", true);

      if (cutoff !== null) {
        query = query.gte("year", cutoff);
      }
      if (categoryFilter) {
        query = query.eq("category", categoryFilter);
      }

      const { data, error } = await query
        .order("category", { ascending: true })
        .order("id", { ascending: true })
        .range(from, from + PAGE_SIZE - 1);

      if (error) return { data: [], error };

      const page = data ?? [];
      allSummaries.push(...page);
      if (page.length < PAGE_SIZE) break;
    }

    return { data: allSummaries, error: null };
  }

  async function loadQuestionById(id: string): Promise<{
    data: QuestionApiRow | null;
    error: unknown;
  }> {
    const byPublicId = await supabase
      .from("questions")
      .select(QUESTION_SELECT)
      .eq("is_active", true)
      .eq("public_id", id)
      .maybeSingle();
    if (byPublicId.error) return { data: null, error: byPublicId.error };
    if (byPublicId.data) return { data: byPublicId.data, error: null };

    return { data: null, error: null };
  }

  async function loadQuestionMeta(): Promise<{
    data: {
      categories: string[];
      countsByCategory: Record<string, number>;
      total: number;
    };
    error: unknown;
  }> {
    const counts = new Map<string, number>();

    for (let from = 0; ; from += PAGE_SIZE) {
      const { data, error } = await supabase
        .from("questions")
        .select("category")
        .eq("is_active", true)
        .order("category", { ascending: true })
        .range(from, from + PAGE_SIZE - 1);

      if (error) {
        return {
          data: { categories: [], countsByCategory: {}, total: 0 },
          error,
        };
      }

      const page = data ?? [];
      for (const row of page) {
        counts.set(row.category, (counts.get(row.category) ?? 0) + 1);
      }
      if (page.length < PAGE_SIZE) break;
    }

    const categories = Array.from(counts.keys()).sort((a, b) =>
      a.localeCompare(b, "ko"),
    );
    return {
      data: {
        categories,
        countsByCategory: Object.fromEntries(counts),
        total: Array.from(counts.values()).reduce((sum, n) => sum + n, 0),
      },
      error: null,
    };
  }

  async function loadSessionQuestions(
    count: number,
    categories: string[],
    balanced: boolean,
  ): Promise<{ data: QuestionApiRow[]; error: unknown }> {
    if (balanced) {
      return loadBalancedSessionQuestions(count, categories);
    }

    let countQuery = supabase
      .from("questions")
      .select("id", { count: "exact", head: true })
      .eq("is_active", true);
    if (categories.length > 0) {
      countQuery = countQuery.in("category", categories);
    }

    const { count: total, error: countError } = await countQuery;
    if (countError) return { data: [], error: countError };
    if (!total) return { data: [], error: null };

    const poolSize = Math.min(SESSION_POOL_LIMIT, total);
    const maxStart = Math.max(0, total - poolSize);
    const from = maxStart > 0 ? Math.floor(Math.random() * (maxStart + 1)) : 0;

    let query = supabase
      .from("questions")
      .select(QUESTION_SELECT)
      .eq("is_active", true)
      .order("id", { ascending: true })
      .range(from, from + poolSize - 1);
    if (categories.length > 0) {
      query = query.in("category", categories);
    }

    const { data, error } = await query;
    if (error) return { data: [], error };
    return { data: shuffle(data ?? []).slice(0, count), error: null };
  }

  async function loadBalancedSessionQuestions(
    count: number,
    categories: string[],
  ): Promise<{ data: QuestionApiRow[]; error: unknown }> {
    // Draw a random pool PER category so every category is represented. A single
    // id-ordered limit only ever returns the first N by id, and since id encodes
    // exam round + subject that silently drops whole categories from the pool,
    // defeating the balance. When no category filter is given we resolve the full
    // category list (and reuse its per-category counts to skip extra COUNT calls).
    let targetCategories = categories;
    let knownCounts: Record<string, number> | null = null;
    if (targetCategories.length === 0) {
      const meta = await loadQuestionMeta();
      if (meta.error) return { data: [], error: meta.error };
      targetCategories = meta.data.categories;
      knownCounts = meta.data.countsByCategory;
    }
    if (targetCategories.length === 0) return { data: [], error: null };

    const samples = await Promise.all(
      targetCategories.map((category) =>
        loadCategorySample(category, knownCounts ? knownCounts[category] ?? 0 : null),
      ),
    );
    const failed = samples.find((sample) => sample.error);
    if (failed) return { data: [], error: failed.error };

    const pool = samples.flatMap((sample) => sample.data);
    return { data: pickBalancedQuestions(pool, count), error: null };
  }

  async function loadCategorySample(
    category: string,
    knownTotal: number | null,
  ): Promise<{ data: QuestionApiRow[]; error: unknown }> {
    let total = knownTotal;
    if (total == null) {
      const { count, error } = await supabase
        .from("questions")
        .select("id", { count: "exact", head: true })
        .eq("is_active", true)
        .eq("category", category);
      if (error) return { data: [], error };
      total = count ?? 0;
    }
    if (total <= 0) return { data: [], error: null };

    const poolSize = Math.min(BALANCED_PER_CATEGORY_POOL, total);
    const maxStart = Math.max(0, total - poolSize);
    const from = maxStart > 0 ? Math.floor(Math.random() * (maxStart + 1)) : 0;

    const { data, error } = await supabase
      .from("questions")
      .select(QUESTION_SELECT)
      .eq("is_active", true)
      .eq("category", category)
      .order("id", { ascending: true })
      .range(from, from + poolSize - 1);
    if (error) return { data: [], error };
    return { data: data ?? [], error: null };
  }

  async function resolveYearCutoff(raw: string | null): Promise<{
    value: number | null;
    error: unknown;
  }> {
    if (!raw) return { value: null, error: null };
    const n = Number.parseInt(raw, 10);
    if (!Number.isFinite(n) || n <= 0 || n >= 100) {
      return { value: null, error: null };
    }

    const { data, error } = await supabase
      .from("questions")
      .select("year")
      .eq("is_active", true)
      .not("year", "is", null)
      .order("year", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) return { value: null, error };
    return { value: data?.year != null ? data.year - n + 1 : null, error: null };
  }
}

function parseCategories(raw: string | null): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((category) => category.trim())
    .filter(Boolean);
}

function clampSessionCount(raw: string | null): number {
  const parsed = Number.parseInt(raw ?? "", 10);
  if (!Number.isFinite(parsed)) return 5;
  return Math.min(MAX_SESSION_COUNT, Math.max(1, parsed));
}

function pickBalancedQuestions(
  questions: QuestionApiRow[],
  targetCount: number,
): QuestionApiRow[] {
  const buckets = new Map<string, QuestionApiRow[]>();
  for (const question of shuffle(questions)) {
    const bucket = buckets.get(question.category) ?? [];
    bucket.push(question);
    buckets.set(question.category, bucket);
  }

  const categories = shuffle(Array.from(buckets.keys()));
  const selected: QuestionApiRow[] = [];

  while (selected.length < targetCount) {
    let changed = false;
    for (const category of categories) {
      if (selected.length >= targetCount) break;
      const bucket = buckets.get(category);
      const next = bucket?.shift();
      if (!next) continue;
      selected.push(next);
      changed = true;
    }
    if (!changed) break;
  }

  return shuffle(selected);
}

function shuffle<T>(items: T[]): T[] {
  const copied = [...items];
  for (let i = copied.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copied[i], copied[j]] = [copied[j], copied[i]];
  }
  return copied;
}
