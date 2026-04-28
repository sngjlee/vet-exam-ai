"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "../../lib/hooks/useAuth";
import { useQuestions } from "../../lib/hooks/useQuestions";
import { useWrongNotes } from "../../lib/hooks/useWrongNotes";
import {
  applyQuestionFilters,
  formatPublicId,
  getCategories,
  type RecentYearsWindow,
} from "../../lib/questions";
import LoadingSpinner from "../../components/LoadingSpinner";
import { BookOpen, Filter, ChevronRight } from "lucide-react";

const PAGE_SIZE = 30;
const RECENT_OPTIONS: ReadonlyArray<RecentYearsWindow> = [5, 7, 10] as const;

export default function QuestionsListPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { questions, loading: questionsLoading } = useQuestions();
  const { notes: wrongNotes, loading: notesLoading } = useWrongNotes();

  const [selectedCategory, setSelectedCategory] = useState<string>("All");
  const [recentYears, setRecentYears] = useState<RecentYearsWindow | "all">("all");
  const [onlyWrong, setOnlyWrong] = useState(false);
  const [skipEasy, setSkipEasy] = useState(false);
  const [page, setPage] = useState(0);

  // Auth gate (UX only — RLS is the real boundary).
  useEffect(() => {
    if (authLoading) return;
    if (!user) router.replace("/auth/login");
  }, [user, authLoading, router]);

  const categories = useMemo(() => getCategories(questions), [questions]);
  const wrongIdSet = useMemo(
    () => new Set(wrongNotes.map((n) => n.questionId)),
    [wrongNotes],
  );

  const filtered = useMemo(() => {
    return applyQuestionFilters(questions, {
      categories: selectedCategory === "All" ? undefined : [selectedCategory],
      recentYears: recentYears === "all" ? undefined : recentYears,
      onlyWrong,
      skipEasy,
      wrongQuestionIds: wrongIdSet,
    });
  }, [questions, selectedCategory, recentYears, onlyWrong, skipEasy, wrongIdSet]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const pageItems = filtered.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);

  function changeFilter(updater: () => void) {
    updater();
    setPage(0);
  }

  if (authLoading || !user || questionsLoading || notesLoading) {
    return (
      <main className="mx-auto max-w-4xl px-6 py-12">
        <LoadingSpinner />
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-4xl px-6 py-12 space-y-6">
      <header>
        <span className="kvle-label">해설보기</span>
        <h1
          style={{
            fontFamily: "var(--font-serif)",
            fontSize: "clamp(22px, 4vw, 28px)",
            fontWeight: 800,
            margin: "8px 0 4px",
            letterSpacing: "-0.01em",
            color: "var(--text)",
          }}
        >
          전체 문제 <span style={{ color: "var(--teal)" }}>{filtered.length}</span>
        </h1>
        <p style={{ color: "var(--text-muted)", fontSize: 13, margin: 0 }}>
          개념별로 살펴보고, 최근 기출만 골라 회독하세요. 정답과 해설은 카드를 열어 확인합니다.
        </p>
      </header>

      {/* Filter bar */}
      <section
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 12,
          padding: 16,
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--text-muted)" }}>
          <Filter size={14} />
          <span style={{ fontSize: 12, fontWeight: 600, letterSpacing: "0.04em" }}>필터</span>
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
          {/* Category */}
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <label className="kvle-label" htmlFor="filter-category">과목</label>
            <select
              id="filter-category"
              value={selectedCategory}
              onChange={(e) => changeFilter(() => setSelectedCategory(e.target.value))}
              className="kvle-input"
              style={{ minWidth: 160 }}
            >
              <option value="All">전체</option>
              {categories.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          {/* Recent years */}
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <label className="kvle-label">최근 기출</label>
            <div style={{ display: "flex", gap: 6 }}>
              <ChipToggle
                active={recentYears === "all"}
                onClick={() => changeFilter(() => setRecentYears("all"))}
                label="전체"
              />
              {RECENT_OPTIONS.map((n) => (
                <ChipToggle
                  key={n}
                  active={recentYears === n}
                  onClick={() => changeFilter(() => setRecentYears(n))}
                  label={`${n}개년`}
                />
              ))}
            </div>
          </div>

          {/* Toggles */}
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <label className="kvle-label">학습 모드</label>
            <div style={{ display: "flex", gap: 6 }}>
              <ChipToggle
                active={onlyWrong}
                onClick={() => changeFilter(() => setOnlyWrong((v) => !v))}
                label="오답문제만"
              />
              <ChipToggle
                active={skipEasy}
                onClick={() => changeFilter(() => setSkipEasy((v) => !v))}
                label="쉬운문제 생략"
              />
            </div>
          </div>
        </div>
      </section>

      {/* List */}
      {filtered.length === 0 ? (
        <section
          className="kvle-card text-center"
          style={{ padding: "3rem 1.5rem" }}
        >
          <BookOpen size={36} className="mx-auto mb-3" style={{ color: "var(--text-faint)" }} />
          <p style={{ color: "var(--text-muted)", fontSize: 14, margin: 0 }}>
            현재 필터에 해당하는 문제가 없습니다. 조건을 완화해 보세요.
          </p>
        </section>
      ) : (
        <section
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: 12,
            overflow: "hidden",
          }}
        >
          {pageItems.map((q, i) => (
            <Link
              key={q.id}
              href={`/questions/${encodeURIComponent(q.id)}`}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 14,
                padding: "16px 20px",
                borderBottom:
                  i < pageItems.length - 1 ? "1px solid var(--border)" : "none",
                color: "inherit",
                textDecoration: "none",
                cursor: "pointer",
                minHeight: 56,
              }}
            >
              <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 6 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span
                    style={{
                      fontSize: 10,
                      fontFamily: "var(--font-mono)",
                      color: "var(--text-faint)",
                      letterSpacing: "0.08em",
                      fontWeight: 600,
                    }}
                  >
                    {formatPublicId(q)}
                  </span>
                  <span
                    style={{
                      fontSize: 10,
                      padding: "2px 8px",
                      borderRadius: 999,
                      background: "var(--surface-raised)",
                      border: "1px solid var(--border)",
                      color: "var(--text-muted)",
                      fontWeight: 700,
                      letterSpacing: "0.04em",
                    }}
                  >
                    {q.category}
                  </span>
                  {wrongIdSet.has(q.id) && (
                    <span
                      style={{
                        fontSize: 10,
                        padding: "2px 8px",
                        borderRadius: 999,
                        background: "var(--wrong-dim)",
                        border: "1px solid rgba(192,74,58,0.3)",
                        color: "var(--wrong)",
                        fontWeight: 700,
                      }}
                    >
                      오답
                    </span>
                  )}
                </div>
                <div
                  style={{
                    fontSize: 14,
                    color: "var(--text)",
                    fontWeight: 500,
                    lineHeight: 1.4,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    display: "-webkit-box",
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: "vertical",
                  }}
                >
                  {q.question}
                </div>
              </div>
              <ChevronRight size={16} style={{ color: "var(--text-faint)", flexShrink: 0 }} />
            </Link>
          ))}
        </section>
      )}

      {/* Pagination */}
      {filtered.length > PAGE_SIZE && (
        <nav
          aria-label="페이지 이동"
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
          }}
        >
          <button
            onClick={() => setPage(Math.max(0, safePage - 1))}
            disabled={safePage === 0}
            className="kvle-btn-ghost text-sm"
            style={{ minHeight: 44, padding: "10px 16px" }}
          >
            이전
          </button>
          <span style={{ fontSize: 12, color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
            {safePage + 1} / {totalPages}
          </span>
          <button
            onClick={() => setPage(Math.min(totalPages - 1, safePage + 1))}
            disabled={safePage >= totalPages - 1}
            className="kvle-btn-ghost text-sm"
            style={{ minHeight: 44, padding: "10px 16px" }}
          >
            다음
          </button>
        </nav>
      )}
    </main>
  );
}

function ChipToggle({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: "8px 14px",
        minHeight: 36,
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 600,
        cursor: "pointer",
        background: active ? "var(--teal-dim)" : "var(--bg)",
        border: `1px solid ${active ? "var(--teal-border)" : "var(--border)"}`,
        color: active ? "var(--teal)" : "var(--text-muted)",
        transition: "all 150ms",
      }}
    >
      {label}
    </button>
  );
}
