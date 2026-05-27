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
import {
  TRIAGE_STATUS_COLOR,
  TRIAGE_STATUS_ORDER,
  TRIAGE_STATUS_SHORT,
  type ImageTriageStatus,
} from "../../../lib/admin/triage-labels";

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
  question_image_files_original:    string[] | null;
  explanation_image_files_original: string[] | null;
  tags: string[] | null;
};

type TriageRow = {
  question_id: string;
  status: ImageTriageStatus;
  note: string | null;
};

type TriageSummary = {
  total: number;
  unclassified: number;
  counts: Record<ImageTriageStatus, number>;
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
  summary: TriageSummary;
  total: number;
}> {
  const supabase = await createClient();

  const allRows: QuestionRow[] = [];
  const batchSize = 1000;
  for (let offset = 0; ; offset += batchSize) {
    let q = supabase
      .from("questions")
      .select(
        "id, public_id, round, category, question, choices, answer, explanation, question_image_files, explanation_image_files, question_image_files_original, explanation_image_files_original, tags",
      )
      .contains("tags", ["has_image"]);

    if (sp.category) q = q.eq("category", sp.category);
    if (sp.round != null) q = q.eq("round", sp.round);

    const { data, error } = await q
      .order("round", { ascending: true })
      .order("public_id", { ascending: true })
      .range(offset, offset + batchSize - 1);

    if (error || !data) {
      return {
        items: [],
        triageMap: new Map(),
        summary: emptySummary(),
        total: 0,
      };
    }

    allRows.push(...(data as QuestionRow[]));
    if (data.length < batchSize) break;
  }

  const ids = allRows.map((r) => r.id);
  const triageMap = new Map<string, TriageRow>();
  if (ids.length > 0) {
    for (let offset = 0; offset < ids.length; offset += 500) {
      const idBatch = ids.slice(offset, offset + 500);
      const { data: tr } = await supabase
        .from("question_image_triage")
        .select("question_id, status, note")
        .in("question_id", idBatch);
      for (const r of (tr ?? []) as TriageRow[]) {
        triageMap.set(r.question_id, r);
      }
    }
  }

  const summary = summarizeTriage(allRows, triageMap);
  let filtered = allRows;
  if (sp.status === "unclassified") {
    filtered = allRows.filter((r) => !triageMap.has(r.id));
  } else if (sp.status !== "all") {
    filtered = allRows.filter((r) => triageMap.get(r.id)?.status === sp.status);
  }

  const offset = (sp.page - 1) * PAGE_SIZE;
  return {
    items: filtered.slice(offset, offset + PAGE_SIZE),
    triageMap,
    summary,
    total: filtered.length,
  };
}

function emptySummary(): TriageSummary {
  return {
    total: 0,
    unclassified: 0,
    counts: Object.fromEntries(TRIAGE_STATUS_ORDER.map((status) => [status, 0])) as Record<ImageTriageStatus, number>,
  };
}

function summarizeTriage(rows: QuestionRow[], triageMap: Map<string, TriageRow>): TriageSummary {
  const summary = emptySummary();
  summary.total = rows.length;
  for (const row of rows) {
    const triage = triageMap.get(row.id);
    if (!triage) {
      summary.unclassified += 1;
    } else {
      summary.counts[triage.status] += 1;
    }
  }
  return summary;
}

async function buildListItems(
  rows: QuestionRow[],
  triageMap: Map<string, TriageRow>,
): Promise<TriageListItem[]> {
  // 원본을 admin 참조용으로 표시 (교체 후에도 비교 가능). _original이 있으면 거기서, 없으면 active 컬럼.
  const originalQ = (row: QuestionRow) => row.question_image_files_original ?? row.question_image_files;
  const originalE = (row: QuestionRow) => row.explanation_image_files_original ?? row.explanation_image_files;

  const allFiles = Array.from(
    new Set(
      rows.flatMap((r) => [...originalQ(r), ...originalE(r)]),
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
      questionImages:    originalQ(row).map((f) => ({ filename: f, url: urlMap.get(f) ?? null })),
      explanationImages: originalE(row).map((f) => ({ filename: f, url: urlMap.get(f) ?? null })),
      originalSlotCounts: {
        question:    originalQ(row).length,
        explanation: originalE(row).length,
      },
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
            선택 조건 {queue.total.toLocaleString("ko-KR")}건 — 현재 페이지 {items.length}건 표시
          </p>
        </header>

        <TriageSummaryBar summary={queue.summary} current={sp} />
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

function TriageSummaryBar({
  summary,
  current,
}: {
  summary: TriageSummary;
  current: ReturnType<typeof parseTriageSearchParams>;
}) {
  const entries: Array<{ status: "unclassified" | "all" | ImageTriageStatus; label: string; count: number }> = [
    { status: "all", label: "전체", count: summary.total },
    { status: "unclassified", label: "미분류", count: summary.unclassified },
    ...TRIAGE_STATUS_ORDER.filter((status) => status !== "pending").map((status) => ({
      status,
      label: TRIAGE_STATUS_SHORT[status],
      count: summary.counts[status],
    })),
  ];

  return (
    <section
      className="mb-4 rounded-lg p-3"
      style={{ background: "var(--surface-raised)", border: "1px solid var(--rule)" }}
      aria-label="이미지 큐 상태 요약"
    >
      <div className="mb-2 text-xs font-medium" style={{ color: "var(--text-muted)" }}>
        현재 범위 상태 요약
      </div>
      <div className="flex flex-wrap gap-2">
        {entries.map((entry) => {
          const active = current.status === entry.status;
          const color =
            entry.status === "unclassified" || entry.status === "all"
              ? TRIAGE_STATUS_COLOR.pending
              : TRIAGE_STATUS_COLOR[entry.status];
          const href = `/admin/image-questions${buildTriageSearchString(current, {
            status: entry.status === "unclassified" ? undefined : entry.status,
            page: undefined,
          })}`;

          return (
            <Link
              key={entry.status}
              href={href}
              className="inline-flex items-center gap-1.5 rounded-full text-xs"
              style={{
                padding: "5px 9px",
                background: active ? color.bg : "var(--surface)",
                border: active ? `1px solid ${color.fg}` : "1px solid var(--rule)",
                color: active ? color.fg : "var(--text-muted)",
                textDecoration: "none",
              }}
            >
              <span>{entry.label}</span>
              <span className="kvle-mono" style={{ color: active ? color.fg : "var(--text)" }}>
                {entry.count.toLocaleString("ko-KR")}
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
