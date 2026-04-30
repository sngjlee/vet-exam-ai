"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "../../lib/hooks/useAuth";
import { useFilteredQuestions } from "../../lib/hooks/useFilteredQuestions";
import { useWrongNotes } from "../../lib/hooks/useWrongNotes";
import {
  applyQuestionFilters,
  formatPublicId,
  saveQuestionsListContext,
  FIXED_CATEGORIES,
  type RecentYearsWindow,
} from "../../lib/questions";
import LoadingSpinner from "../../components/LoadingSpinner";
import { BookOpen, Filter, ChevronRight } from "lucide-react";

const PAGE_SIZE = 30;
const RECENT_OPTIONS: ReadonlyArray<RecentYearsWindow> = [5, 7, 10] as const;

const STORAGE_KEY = "kvle:questions-filter:v1";
const STORAGE_TTL_MS = 30 * 60 * 1000; // 30분

// FIXED_CATEGORIES is imported from "../../lib/questions" — single source of truth.

type StoredFilter = {
  selectedCategory: string;
  recentYears: RecentYearsWindow | "all";
  onlyWrong: boolean;
  skipEasy: boolean;
  forceAll: boolean;
  savedAt: number;
};

function loadStoredFilter(): StoredFilter | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredFilter;
    if (
      typeof parsed.savedAt !== "number" ||
      Date.now() - parsed.savedAt > STORAGE_TTL_MS
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function saveStoredFilter(f: Omit<StoredFilter, "savedAt">) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ ...f, savedAt: Date.now() }),
    );
  } catch {
    /* sessionStorage full or disabled */
  }
}

function clearStoredFilter() {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export default function QuestionsListPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { notes: wrongNotes, loading: notesLoading } = useWrongNotes();

  const [selectedCategory, setSelectedCategory] = useState<string>("All");
  const [recentYears, setRecentYears] = useState<RecentYearsWindow | "all">(
    "all",
  );
  const [onlyWrong, setOnlyWrong] = useState(false);
  const [skipEasy, setSkipEasy] = useState(false);
  const [forceAll, setForceAll] = useState(false);
  const [page, setPage] = useState(0);
  const [hydrated, setHydrated] = useState(false);

  // sessionStorage hydrate (1회)
  // FIXED_CATEGORIES가 바뀌면(예: 카테고리 재명명/제거) 이전 세션의 stored 값이 dropdown에 없을 수 있음.
  // 그 경우 "All"로 fallback해 invisible-selected 상태 방지.
  useEffect(() => {
    const stored = loadStoredFilter();
    if (stored) {
      const allowedCategories = (FIXED_CATEGORIES as readonly string[]);
      const safeCategory =
        stored.selectedCategory === "All" ||
        allowedCategories.includes(stored.selectedCategory)
          ? stored.selectedCategory
          : "All";
      const safeRecent =
        stored.recentYears === "all" ||
        (RECENT_OPTIONS as readonly number[]).includes(stored.recentYears as number)
          ? stored.recentYears
          : "all";
      setSelectedCategory(safeCategory);
      setRecentYears(safeRecent);
      setOnlyWrong(stored.onlyWrong);
      setSkipEasy(stored.skipEasy);
      setForceAll(stored.forceAll ?? false);
    }
    setHydrated(true);
  }, []);

  const hasMeaningfulFilter =
    recentYears !== "all" ||
    selectedCategory !== "All" ||
    onlyWrong ||
    skipEasy;

  // 게이트 통과 = 의미있는 필터가 있거나, 사용자가 명시적으로 "전체 보기"를 눌렀거나
  const shouldFetch = hasMeaningfulFilter || forceAll;

  // 서버 필터: recentYears + category만 서버에 보냄 (onlyWrong/skipEasy는 클라)
  const serverFilter = useMemo(() => {
    if (!hydrated || !shouldFetch) return null;
    if (recentYears === "all" && selectedCategory === "All") {
      // forceAll 또는 onlyWrong/skipEasy만 켜진 경우 — 전체 fetch
      return { recentYears: undefined, category: undefined };
    }
    return {
      recentYears: recentYears === "all" ? undefined : recentYears,
      category: selectedCategory === "All" ? undefined : selectedCategory,
    };
  }, [hydrated, shouldFetch, recentYears, selectedCategory]);

  const {
    questions,
    loading: questionsLoading,
    error: questionsError,
  } = useFilteredQuestions(serverFilter);

  // 필터 변경 시 sessionStorage 갱신 + 페이지 0
  useEffect(() => {
    if (!hydrated) return;
    if (shouldFetch) {
      saveStoredFilter({
        selectedCategory,
        recentYears,
        onlyWrong,
        skipEasy,
        forceAll,
      });
    } else {
      clearStoredFilter();
    }
    setPage(0);
  }, [
    hydrated,
    shouldFetch,
    selectedCategory,
    recentYears,
    onlyWrong,
    skipEasy,
    forceAll,
  ]);

  // Auth gate (UX only — RLS is the real boundary).
  useEffect(() => {
    if (authLoading) return;
    if (!user) router.replace("/auth/login");
  }, [user, authLoading, router]);

  const wrongIdSet = useMemo(
    () => new Set(wrongNotes.map((n) => n.questionId)),
    [wrongNotes],
  );

  // 클라사이드 후처리: onlyWrong / skipEasy
  const filtered = useMemo(() => {
    if (!shouldFetch) return [];
    return applyQuestionFilters(questions, {
      categories:
        selectedCategory === "All" ? undefined : [selectedCategory],
      recentYears: recentYears === "all" ? undefined : recentYears,
      onlyWrong,
      skipEasy,
      wrongQuestionIds: wrongIdSet,
    });
  }, [
    shouldFetch,
    questions,
    selectedCategory,
    recentYears,
    onlyWrong,
    skipEasy,
    wrongIdSet,
  ]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const pageItems = filtered.slice(
    safePage * PAGE_SIZE,
    (safePage + 1) * PAGE_SIZE,
  );

  function changeFilter(updater: () => void) {
    updater();
    setPage(0);
  }

  if (authLoading || !user) {
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
          {shouldFetch ? (
            <>
              전체 문제{" "}
              <span style={{ color: "var(--teal)" }}>{filtered.length}</span>
            </>
          ) : (
            "해설보기"
          )}
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
          {shouldFetch && (
            <button
              type="button"
              onClick={() => {
                setSelectedCategory("All");
                setRecentYears("all");
                setOnlyWrong(false);
                setSkipEasy(false);
                setForceAll(false);
                setPage(0);
              }}
              style={{
                marginLeft: "auto",
                background: "transparent",
                border: "none",
                color: "var(--text-faint)",
                cursor: "pointer",
                fontSize: 11,
                padding: 0,
                textDecoration: "underline",
                textUnderlineOffset: 2,
              }}
            >
              초기화
            </button>
          )}
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
              {FIXED_CATEGORIES.map((c) => (
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

      {/* Body */}
      {!shouldFetch ? (
        <section
          className="kvle-card text-center"
          style={{ padding: "3rem 1.5rem" }}
        >
          <Filter
            size={36}
            className="mx-auto mb-3"
            style={{ color: "var(--text-faint)" }}
          />
          <p
            style={{
              color: "var(--text-muted)",
              fontSize: 14,
              margin: "0 0 8px",
              lineHeight: 1.6,
            }}
          >
            과목, 최근 기출 연도, 또는 학습 모드 중 하나를 선택해
            <br />
            볼 문제 범위를 좁혀 주세요.
          </p>
          <p
            style={{
              color: "var(--text-faint)",
              fontSize: 12,
              margin: "0 0 16px",
            }}
          >
            전체를 한 번에 불러오면 로딩이 길어집니다.
          </p>
          <button
            type="button"
            onClick={() => setForceAll(true)}
            className="kvle-btn-ghost text-sm"
            style={{
              minHeight: 40,
              padding: "10px 18px",
              fontSize: 13,
            }}
          >
            그래도 전체 문제 보기
          </button>
        </section>
      ) : questionsLoading || notesLoading ? (
        <section
          className="kvle-card text-center"
          style={{ padding: "3rem 1.5rem" }}
        >
          <LoadingSpinner />
        </section>
      ) : questionsError ? (
        <section
          className="kvle-card text-center"
          style={{ padding: "2rem 1.5rem", color: "var(--wrong)" }}
        >
          문제를 불러올 수 없습니다. 다시 시도해주세요.
        </section>
      ) : filtered.length === 0 ? (
        <section
          className="kvle-card text-center"
          style={{ padding: "3rem 1.5rem" }}
        >
          <BookOpen
            size={36}
            className="mx-auto mb-3"
            style={{ color: "var(--text-faint)" }}
          />
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
              // KVLE public id keeps URLs ASCII-safe and avoids leaking 회차/연도.
              // Falls back to raw id only for legacy rows missing public_id.
              href={`/questions/${encodeURIComponent(q.publicId ?? q.id)}`}
              onClick={() =>
                saveQuestionsListContext(
                  filtered.map((f) => f.publicId ?? f.id),
                )
              }
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
      {hasMeaningfulFilter && filtered.length > PAGE_SIZE && (
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
