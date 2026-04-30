import Link from "next/link";
import { requireAdmin } from "../../../lib/admin/guards";
import { createClient } from "../../../lib/supabase/server";
import { getSignedImageUrls } from "../../../lib/admin/image-triage-storage";
import {
  buildTriageSearchString,
  parseTriageSearchParams,
} from "./_lib/parse-search-params";
import { TriageList, type TriageListItem } from "./_components/triage-list";
import { TriageFilters } from "./_components/triage-filters";
import { TriageImage } from "./_components/triage-image";
import type { TriageCardData } from "./_components/triage-card";
import type { ImageTriageStatus } from "../../../lib/admin/triage-labels";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

type QuestionRow = {
  id: string;
  public_id: string | null;
  round: number | null;
  category: string;
  question: string;
  choices: string[];
  answer: string;
  explanation: string | null;
  question_image_files: string[];
  explanation_image_files: string[];
};

type TriageRow = {
  question_id: string;
  status: ImageTriageStatus;
  note: string | null;
};

async function loadFilterOptions(): Promise<{ categories: string[]; rounds: number[] }> {
  const supabase = await createClient();

  // 모든 has_image 문제의 카테고리/회차 distinct
  const { data } = await supabase
    .from("questions")
    .select("category, round")
    .contains("tags", ["has_image"])
    .order("category");

  const cats = new Set<string>();
  const rounds = new Set<number>();
  for (const r of data ?? []) {
    if (r.category) cats.add(r.category as string);
    if (typeof r.round === "number") rounds.add(r.round);
  }
  return {
    categories: Array.from(cats).sort(),
    rounds:     Array.from(rounds).sort((a, b) => b - a),
  };
}

async function loadQueue(sp: ReturnType<typeof parseTriageSearchParams>): Promise<{
  items: QuestionRow[];
  triageMap: Map<string, TriageRow>;
  total: number;
}> {
  const supabase = await createClient();

  // 1. has_image 문제 + 필터
  let q = supabase
    .from("questions")
    .select(
      "id, public_id, round, category, question, choices, answer, explanation, question_image_files, explanation_image_files",
      { count: "exact" },
    )
    .contains("tags", ["has_image"]);

  if (sp.category) q = q.eq("category", sp.category);
  if (sp.round != null) q = q.eq("round", sp.round);

  // status 필터: triage 테이블과 left join 효과를 두 단계로 처리
  let triageIdsForStatus: string[] | null = null;
  if (sp.status === "unclassified") {
    // triage row 없는 question만 — 첫 쿼리 후 코드에서 필터
  } else if (sp.status === "all") {
    // 필터 없음
  } else {
    // 특정 status 매칭 — triage row 먼저 가져와서 question_id로 in 필터
    const { data: tr } = await supabase
      .from("question_image_triage")
      .select("question_id")
      .eq("status", sp.status);
    triageIdsForStatus = (tr ?? []).map((r) => r.question_id);
    if (triageIdsForStatus.length === 0) {
      return { items: [], triageMap: new Map(), total: 0 };
    }
    q = q.in("id", triageIdsForStatus);
  }

  const offset = (sp.page - 1) * PAGE_SIZE;
  const { data, count, error } = await q
    .order("round", { ascending: true })
    .order("public_id", { ascending: true })
    .range(offset, offset + PAGE_SIZE - 1);

  if (error || !data) {
    return { items: [], triageMap: new Map(), total: 0 };
  }

  // 2. 같은 페이지 question id로 triage rows 일괄 fetch
  const ids = (data as QuestionRow[]).map((r) => r.id);
  let triageMap = new Map<string, TriageRow>();
  if (ids.length > 0) {
    const { data: tr } = await supabase
      .from("question_image_triage")
      .select("question_id, status, note")
      .in("question_id", ids);
    for (const r of (tr ?? []) as TriageRow[]) {
      triageMap.set(r.question_id, r);
    }
  }

  // 3. unclassified 필터 후처리
  let items = data as QuestionRow[];
  if (sp.status === "unclassified") {
    items = items.filter((r) => !triageMap.has(r.id));
  }

  return { items, triageMap, total: count ?? 0 };
}

async function buildListItems(
  rows: QuestionRow[],
  triageMap: Map<string, TriageRow>,
): Promise<TriageListItem[]> {
  // 모든 페이지의 이미지 파일명 합쳐서 한 번에 signed URL 발급
  const allFiles = Array.from(
    new Set(
      rows.flatMap((r) => [
        ...r.question_image_files,
        ...r.explanation_image_files,
      ]),
    ),
  );
  const signed = await getSignedImageUrls(allFiles);
  const urlMap = new Map(signed.map((s) => [s.filename, s.url]));

  return rows.map((row) => {
    const tr = triageMap.get(row.id) ?? null;

    const data: TriageCardData = {
      id:          row.id,
      publicId:    row.public_id,
      round:       row.round,
      category:    row.category,
      question:    row.question,
      choices:     row.choices,
      answer:      row.answer,
      explanation: row.explanation,
      questionImages:    row.question_image_files.map((f) => ({
        filename: f,
        url:      urlMap.get(f) ?? null,
      })),
      explanationImages: row.explanation_image_files.map((f) => ({
        filename: f,
        url:      urlMap.get(f) ?? null,
      })),
      triageStatus: tr ? tr.status : null,
      triageNote:   tr ? tr.note : null,
    };

    const thumbnailSlot =
      data.questionImages.length + data.explanationImages.length === 0 ? null : (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {data.questionImages.map((img) => (
            <TriageImage
              key={`q-${img.filename}`}
              filename={img.filename}
              url={img.url}
              label="문제"
            />
          ))}
          {data.explanationImages.map((img) => (
            <TriageImage
              key={`e-${img.filename}`}
              filename={img.filename}
              url={img.url}
              label="해설"
            />
          ))}
        </div>
      );

    return { data, thumbnailSlot };
  });
}

export default async function AdminImageQuestionsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  await requireAdmin();

  const raw = await searchParams;
  const sp = parseTriageSearchParams(raw);

  const [{ categories, rounds }, queue] = await Promise.all([
    loadFilterOptions(),
    loadQueue(sp),
  ]);

  const items = await buildListItems(queue.items, queue.triageMap);

  const totalPages = Math.max(1, Math.ceil(queue.total / PAGE_SIZE));
  const prevHref = sp.page > 1
    ? `/admin/image-questions${buildTriageSearchString(sp, { page: sp.page - 1 })}`
    : null;
  const nextHref = sp.page < totalPages
    ? `/admin/image-questions${buildTriageSearchString(sp, { page: sp.page + 1 })}`
    : null;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "200px 1fr", gap: 16 }}>
      <TriageFilters categories={categories} rounds={rounds} />

      <div>
        <header style={{ marginBottom: 16 }}>
          <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 4 }}>
            이미지 큐
          </h1>
          <p style={{ fontSize: 12, color: "var(--text-muted)" }}>
            has_image 문제 {queue.total.toLocaleString("ko-KR")}건 — 현재 페이지 {items.length}건 표시
          </p>
        </header>

        <TriageList items={items} />

        {totalPages > 1 && (
          <nav
            className="flex items-center justify-between mt-4"
            style={{ fontSize: 13 }}
          >
            <div style={{ color: "var(--text-muted)" }}>
              {sp.page} / {totalPages} 페이지
            </div>
            <div className="flex gap-2">
              {prevHref ? (
                <Link href={prevHref} style={{ color: "var(--teal)", textDecoration: "underline" }}>
                  ← 이전
                </Link>
              ) : (
                <span style={{ color: "var(--text-muted)" }}>← 이전</span>
              )}
              {nextHref ? (
                <Link href={nextHref} style={{ color: "var(--teal)", textDecoration: "underline" }}>
                  다음 →
                </Link>
              ) : (
                <span style={{ color: "var(--text-muted)" }}>다음 →</span>
              )}
            </div>
          </nav>
        )}
      </div>
    </div>
  );
}
