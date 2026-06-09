"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  BookOpen,
  ChevronRight,
  Filter,
  Lightbulb,
  ListChecks,
  MessageSquare,
  RotateCcw,
} from "lucide-react";
import LoadingSpinner from "../../components/LoadingSpinner";
import { useAuth } from "../../lib/hooks/useAuth";
import { useFilteredQuestions } from "../../lib/hooks/useFilteredQuestions";
import { useWrongNotes } from "../../lib/hooks/useWrongNotes";
import {
  FIXED_CATEGORIES,
  applyQuestionFiltersGeneric,
  formatPublicId,
  saveQuestionsListContext,
  type RecentYearsWindow,
} from "../../lib/questions";

const PAGE_SIZE = 30;
const RECENT_OPTIONS: ReadonlyArray<RecentYearsWindow> = [5, 7, 10] as const;
const STORAGE_KEY = "kvle:questions-filter:v1";
const STORAGE_TTL_MS = 30 * 60 * 1000;

type FilterState = {
  selectedCategory: string;
  selectedTopic: string;
  recentYears: RecentYearsWindow | "all";
  onlyWrong: boolean;
  skipEasy: boolean;
  forceAll: boolean;
};

type StoredFilter = FilterState & {
  savedAt: number;
};

const DEFAULT_FILTER: FilterState = {
  selectedCategory: "All",
  selectedTopic: "All",
  recentYears: "all",
  onlyWrong: false,
  skipEasy: false,
  forceAll: false,
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

function saveStoredFilter(filter: FilterState) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ ...filter, savedAt: Date.now() }),
    );
  } catch {
    // sessionStorage can be disabled or full.
  }
}

function clearStoredFilter() {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore storage failures.
  }
}

function sanitizeStoredFilter(stored: StoredFilter): FilterState {
  const allowedCategories = FIXED_CATEGORIES as readonly string[];
  const selectedCategory =
    stored.selectedCategory === "All" ||
    allowedCategories.includes(stored.selectedCategory)
      ? stored.selectedCategory
      : "All";
  const recentYears =
    stored.recentYears === "all" ||
    (RECENT_OPTIONS as readonly number[]).includes(stored.recentYears)
      ? stored.recentYears
      : "all";

  return {
    selectedCategory,
    selectedTopic:
      typeof stored.selectedTopic === "string" && stored.selectedTopic.length > 0
        ? stored.selectedTopic
        : "All",
    recentYears,
    onlyWrong: Boolean(stored.onlyWrong),
    skipEasy: Boolean(stored.skipEasy),
    forceAll: Boolean(stored.forceAll),
  };
}

export default function QuestionsListPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { notes: wrongNotes, loading: notesLoading } = useWrongNotes();
  const [filter, setFilter] = useState<FilterState>(DEFAULT_FILTER);
  const [page, setPage] = useState(0);
  const [hydrated, setHydrated] = useState(false);

  const {
    selectedCategory,
    selectedTopic,
    recentYears,
    onlyWrong,
    skipEasy,
    forceAll,
  } = filter;

  useEffect(() => {
    const stored = loadStoredFilter();
    setFilter(stored ? sanitizeStoredFilter(stored) : DEFAULT_FILTER);
    setHydrated(true);
  }, []);

  const hasMeaningfulFilter =
    recentYears !== "all" ||
    selectedCategory !== "All" ||
    selectedTopic !== "All" ||
    onlyWrong ||
    skipEasy;
  const shouldFetch = hasMeaningfulFilter || forceAll;

  useEffect(() => {
    if (!hydrated) return;
    if (shouldFetch) {
      saveStoredFilter(filter);
    } else {
      clearStoredFilter();
    }
  }, [filter, hydrated, shouldFetch]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) router.replace("/auth/login");
  }, [user, authLoading, router]);

  const serverFilter = useMemo(() => {
    if (!hydrated || !shouldFetch) return null;
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

  const wrongIdSet = useMemo(
    () => new Set(wrongNotes.map((note) => note.questionId)),
    [wrongNotes],
  );

  const filtered = useMemo(() => {
    if (!shouldFetch) return [];
    return applyQuestionFiltersGeneric(questions, {
      categories: selectedCategory === "All" ? undefined : [selectedCategory],
      topics: selectedTopic === "All" ? undefined : [selectedTopic],
      recentYears: recentYears === "all" ? undefined : recentYears,
      onlyWrong,
      skipEasy,
      wrongQuestionIds: wrongIdSet,
    });
  }, [
    shouldFetch,
    questions,
    selectedCategory,
    selectedTopic,
    recentYears,
    onlyWrong,
    skipEasy,
    wrongIdSet,
  ]);

  const topicOptions = useMemo(() => {
    const topics = new Set<string>();
    for (const question of questions) {
      if (selectedCategory !== "All" && question.category !== selectedCategory) {
        continue;
      }
      const topic = question.topic?.trim();
      if (topic) topics.add(topic);
    }
    return Array.from(topics).sort((a, b) => a.localeCompare(b, "ko"));
  }, [questions, selectedCategory]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const pageItems = filtered.slice(
    safePage * PAGE_SIZE,
    (safePage + 1) * PAGE_SIZE,
  );
  const isLoading = questionsLoading || notesLoading;

  function updateFilter(patch: Partial<FilterState>) {
    setFilter((current) => ({ ...current, ...patch }));
    setPage(0);
  }

  function resetFilter() {
    setFilter(DEFAULT_FILTER);
    setPage(0);
  }

  function openAllExplanations() {
    updateFilter({ forceAll: true });
  }

  function openRecentExplanations() {
    updateFilter({ recentYears: 5, forceAll: false });
  }

  function openWrongExplanations() {
    updateFilter({ onlyWrong: true, forceAll: false });
  }

  if (authLoading || !user) {
    return (
      <main className="mx-auto max-w-4xl px-6 py-12">
        <LoadingSpinner />
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-4xl px-6 py-10 space-y-6">
      <header>
        <span className="kvle-label">해설보기</span>
        <h1
          style={{
            color: "var(--text)",
            fontFamily: "var(--font-serif)",
            fontSize: "clamp(24px, 4vw, 32px)",
            fontWeight: 800,
            lineHeight: 1.2,
            margin: "8px 0 6px",
          }}
        >
          문제보다 해설과 노하우를 먼저 봅니다
        </h1>
        <p style={{ color: "var(--text-muted)", fontSize: 14, lineHeight: 1.6, margin: 0 }}>
          공식 해설을 읽고, 각 문제 댓글에서 다른 수험생의 암기법과 정정 제안을 함께 확인하세요.
        </p>
      </header>

      <StudyStartPanel
        onShowAll={openAllExplanations}
        onRecent={openRecentExplanations}
        onWrongOnly={openWrongExplanations}
      />

      <FilterPanel
        filter={filter}
        shouldFetch={shouldFetch}
        topicOptions={topicOptions}
        topicSelectDisabled={!shouldFetch || questionsLoading || topicOptions.length === 0}
        onUpdateFilter={updateFilter}
        onReset={resetFilter}
      />

      {!shouldFetch ? (
        <QuietPrompt onShowAll={openAllExplanations} />
      ) : isLoading ? (
        <section className="kvle-card text-center" style={{ padding: "3rem 1.5rem" }}>
          <LoadingSpinner />
        </section>
      ) : questionsError ? (
        <StatusBox tone="error">
          문제를 불러올 수 없습니다. 잠시 후 다시 시도해 주세요.
        </StatusBox>
      ) : filtered.length === 0 ? (
        <StatusBox>
          현재 조건에 맞는 문제가 없습니다. 필터를 조금 넓혀 보세요.
        </StatusBox>
      ) : (
        <>
          <ResultHeader
            count={filtered.length}
            page={safePage + 1}
            totalPages={totalPages}
          />
          <QuestionList
            items={pageItems}
            allIds={filtered.map((question) => question.publicId ?? question.id)}
            wrongIdSet={wrongIdSet}
          />
          {filtered.length > PAGE_SIZE && (
            <Pagination
              page={safePage}
              totalPages={totalPages}
              onPrev={() => setPage(Math.max(0, safePage - 1))}
              onNext={() => setPage(Math.min(totalPages - 1, safePage + 1))}
            />
          )}
        </>
      )}
    </main>
  );
}

function StudyStartPanel({
  onShowAll,
  onRecent,
  onWrongOnly,
}: {
  onShowAll: () => void;
  onRecent: () => void;
  onWrongOnly: () => void;
}) {
  const actions = [
    {
      label: "전체 해설 열기",
      description: "범위를 정하지 않고 공식 해설 카드부터 훑어봅니다.",
      icon: ListChecks,
      onClick: onShowAll,
      tone: "var(--teal)",
    },
    {
      label: "최근 5개년 해설",
      description: "최신 기출 흐름을 먼저 따라갑니다.",
      icon: BookOpen,
      onClick: onRecent,
      tone: "var(--blue)",
    },
    {
      label: "오답 해설만",
      description: "내가 틀린 문제의 해설과 선택지를 다시 봅니다.",
      icon: RotateCcw,
      onClick: onWrongOnly,
      tone: "var(--amber)",
    },
  ];

  return (
    <section
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 12,
        padding: 16,
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: 10,
        }}
      >
        {actions.map(({ label, description, icon: Icon, onClick, tone }) => (
          <button
            key={label}
            type="button"
            onClick={onClick}
            style={{
              minHeight: 104,
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-start",
              justifyContent: "space-between",
              gap: 12,
              padding: 16,
              borderRadius: 10,
              border: "1px solid var(--border)",
              background: "var(--bg)",
              color: "var(--text)",
              cursor: "pointer",
              textAlign: "left",
            }}
          >
            <span
              style={{
                width: 32,
                height: 32,
                display: "grid",
                placeItems: "center",
                borderRadius: 8,
                background: "var(--surface-raised)",
                color: tone,
              }}
            >
              <Icon size={17} />
            </span>
            <span>
              <strong style={{ display: "block", fontSize: 14, marginBottom: 4 }}>
                {label}
              </strong>
              <span style={{ color: "var(--text-muted)", fontSize: 12, lineHeight: 1.4 }}>
                {description}
              </span>
            </span>
          </button>
        ))}
        <Link
          href="/comments"
          style={{
            minHeight: 104,
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            gap: 12,
            padding: 16,
            borderRadius: 10,
            border: "1px solid var(--teal-border)",
            background: "var(--teal-dim)",
            color: "var(--text)",
            textDecoration: "none",
          }}
        >
          <span
            style={{
              width: 32,
              height: 32,
              display: "grid",
              placeItems: "center",
              borderRadius: 8,
              background: "rgba(255,255,255,0.06)",
              color: "var(--teal)",
            }}
          >
            <MessageSquare size={17} />
          </span>
          <span>
            <strong style={{ display: "block", fontSize: 14, marginBottom: 4 }}>
              댓글 노하우 보기
            </strong>
            <span style={{ color: "var(--text-muted)", fontSize: 12, lineHeight: 1.4 }}>
              암기법, 질문, 정정 제안을 모아 봅니다.
            </span>
          </span>
        </Link>
      </div>
    </section>
  );
}

function FilterPanel({
  filter,
  shouldFetch,
  topicOptions,
  topicSelectDisabled,
  onUpdateFilter,
  onReset,
}: {
  filter: FilterState;
  shouldFetch: boolean;
  topicOptions: string[];
  topicSelectDisabled: boolean;
  onUpdateFilter: (patch: Partial<FilterState>) => void;
  onReset: () => void;
}) {
  const topicStatus = !shouldFetch
    ? "과목이나 전체 해설을 먼저 열면 세부 주제를 고를 수 있습니다."
    : topicOptions.length === 0
      ? "이 조건에는 아직 주제 메타데이터가 없습니다."
      : `${topicOptions.length}개 주제`;

  return (
    <section
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 12,
        padding: 16,
        display: "flex",
        flexDirection: "column",
        gap: 14,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Filter size={14} style={{ color: "var(--text-muted)" }} />
        <span className="kvle-label">필터</span>
        {shouldFetch && (
          <button
            type="button"
            onClick={onReset}
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
        <Field label="과목" htmlFor="filter-category">
          <select
            id="filter-category"
            value={filter.selectedCategory}
            onChange={(event) =>
              onUpdateFilter({
                selectedCategory: event.target.value,
                selectedTopic: "All",
                forceAll: false,
              })
            }
            className="kvle-input"
            style={{ minWidth: 160 }}
          >
            <option value="All">전체</option>
            {FIXED_CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
        </Field>

        <Field label="주제" htmlFor="filter-topic">
          <select
            id="filter-topic"
            aria-describedby="filter-topic-status"
            value={filter.selectedTopic}
            onChange={(event) =>
              onUpdateFilter({ selectedTopic: event.target.value, forceAll: false })
            }
            className="kvle-input"
            disabled={topicSelectDisabled}
            style={{ minWidth: 180, opacity: topicSelectDisabled ? 0.55 : 1 }}
          >
            <option value="All">
              {topicOptions.length === 0 && shouldFetch ? "주제 없음" : "전체"}
            </option>
            {filter.selectedTopic !== "All" &&
              !topicOptions.includes(filter.selectedTopic) && (
                <option value={filter.selectedTopic}>{filter.selectedTopic}</option>
              )}
            {topicOptions.map((topic) => (
              <option key={topic} value={topic}>
                {topic}
              </option>
            ))}
          </select>
          <span
            id="filter-topic-status"
            style={{ color: "var(--text-faint)", fontSize: 11, lineHeight: 1.35 }}
          >
            {topicStatus}
          </span>
        </Field>

        <Field label="최근 기출">
          <SegmentedGroup>
            <ChipToggle
              active={filter.recentYears === "all"}
              onClick={() => onUpdateFilter({ recentYears: "all", forceAll: false })}
              label="전체"
            />
            {RECENT_OPTIONS.map((option) => (
              <ChipToggle
                key={option}
                active={filter.recentYears === option}
                onClick={() => onUpdateFilter({ recentYears: option, forceAll: false })}
                label={`${option}개년`}
              />
            ))}
          </SegmentedGroup>
        </Field>

        <Field label="학습 모드">
          <SegmentedGroup>
            <ChipToggle
              active={filter.onlyWrong}
              onClick={() =>
                onUpdateFilter({ onlyWrong: !filter.onlyWrong, forceAll: false })
              }
              label="오답만"
            />
            <ChipToggle
              active={filter.skipEasy}
              onClick={() =>
                onUpdateFilter({ skipEasy: !filter.skipEasy, forceAll: false })
              }
              label="쉬운 문제 제외"
            />
          </SegmentedGroup>
        </Field>
      </div>
    </section>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      <label className="kvle-label" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
    </div>
  );
}

function SegmentedGroup({ children }: { children: React.ReactNode }) {
  return <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>{children}</div>;
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
        padding: "8px 13px",
        minHeight: 36,
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 700,
        cursor: "pointer",
        background: active ? "var(--teal-dim)" : "var(--bg)",
        border: `1px solid ${active ? "var(--teal-border)" : "var(--border)"}`,
        color: active ? "var(--teal)" : "var(--text-muted)",
      }}
    >
      {label}
    </button>
  );
}

function QuietPrompt({ onShowAll }: { onShowAll: () => void }) {
  return (
    <section
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 16,
        padding: "16px 18px",
        background: "var(--bg)",
        border: "1px dashed var(--border)",
        borderRadius: 12,
        flexWrap: "wrap",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <Lightbulb size={18} style={{ color: "var(--teal)" }} />
        <p style={{ color: "var(--text-muted)", fontSize: 13, lineHeight: 1.5, margin: 0 }}>
          위에서 공부 방식을 고르면 해설 목록이 열립니다.
        </p>
      </div>
      <button
        type="button"
        onClick={onShowAll}
        className="kvle-btn-ghost text-sm"
        style={{ minHeight: 40, padding: "9px 15px" }}
      >
        전체 해설 보기
      </button>
    </section>
  );
}

function ResultHeader({
  count,
  page,
  totalPages,
}: {
  count: number;
  page: number;
  totalPages: number;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        color: "var(--text-muted)",
        fontSize: 12,
      }}
    >
      <span>
        해설 <strong style={{ color: "var(--teal)" }}>{count}</strong>개
      </span>
      <span className="kvle-mono">
        {page} / {totalPages}
      </span>
    </div>
  );
}

function QuestionList({
  items,
  allIds,
  wrongIdSet,
}: {
  items: Array<{
    id: string;
    publicId?: string;
    question: string;
    category: string;
    topic?: string;
  }>;
  allIds: string[];
  wrongIdSet: Set<string>;
}) {
  return (
    <section
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 12,
        overflow: "hidden",
      }}
    >
      {items.map((question, index) => (
        <Link
          key={question.id}
          href={`/questions/${encodeURIComponent(question.publicId ?? question.id)}`}
          onClick={() => saveQuestionsListContext(allIds)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 14,
            padding: "15px 18px",
            borderBottom:
              index < items.length - 1 ? "1px solid var(--border)" : "none",
            color: "inherit",
            textDecoration: "none",
            minHeight: 58,
          }}
        >
          <div
            style={{
              flex: 1,
              minWidth: 0,
              display: "flex",
              flexDirection: "column",
              gap: 7,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span
                className="kvle-mono"
                style={{
                  fontSize: 10,
                  color: "var(--text-faint)",
                  letterSpacing: "0.04em",
                  fontWeight: 700,
                }}
              >
                {formatPublicId(question)}
              </span>
              <Pill>{question.category}</Pill>
              {question.topic && <Pill>{question.topic}</Pill>}
              {wrongIdSet.has(question.id) && <Pill tone="wrong">오답</Pill>}
            </div>
            <div
              style={{
                color: "var(--text)",
                fontSize: 14,
                fontWeight: 500,
                lineHeight: 1.45,
                overflow: "hidden",
                textOverflow: "ellipsis",
                display: "-webkit-box",
                WebkitLineClamp: 2,
                WebkitBoxOrient: "vertical",
              }}
            >
              {question.question}
            </div>
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              color: "var(--text-faint)",
              flexShrink: 0,
            }}
          >
            <MessageSquare size={14} />
            <ChevronRight size={16} />
          </div>
        </Link>
      ))}
    </section>
  );
}

function Pill({
  children,
  tone = "default",
}: {
  children: React.ReactNode;
  tone?: "default" | "wrong";
}) {
  const isWrong = tone === "wrong";
  return (
    <span
      style={{
        fontSize: 10,
        padding: "2px 8px",
        borderRadius: 999,
        background: isWrong ? "var(--wrong-dim)" : "var(--surface-raised)",
        border: isWrong ? "1px solid rgba(192,74,58,0.3)" : "1px solid var(--border)",
        color: isWrong ? "var(--wrong)" : "var(--text-muted)",
        fontWeight: 700,
        lineHeight: 1.5,
      }}
    >
      {children}
    </span>
  );
}

function StatusBox({
  children,
  tone = "default",
}: {
  children: React.ReactNode;
  tone?: "default" | "error";
}) {
  const isError = tone === "error";
  return (
    <section
      className="text-center"
      style={{
        padding: "2rem 1.5rem",
        background: isError ? "var(--wrong-dim)" : "var(--bg)",
        border: `1px ${isError ? "solid rgba(192,74,58,0.3)" : "dashed var(--border)"}`,
        borderRadius: 12,
        color: isError ? "var(--wrong)" : "var(--text-muted)",
        fontSize: 14,
      }}
    >
      {children}
    </section>
  );
}

function Pagination({
  page,
  totalPages,
  onPrev,
  onNext,
}: {
  page: number;
  totalPages: number;
  onPrev: () => void;
  onNext: () => void;
}) {
  return (
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
        type="button"
        onClick={onPrev}
        disabled={page === 0}
        className="kvle-btn-ghost text-sm"
        style={{ minHeight: 44, padding: "10px 16px" }}
      >
        이전
      </button>
      <span
        className="kvle-mono"
        style={{ fontSize: 12, color: "var(--text-muted)" }}
      >
        {page + 1} / {totalPages}
      </span>
      <button
        type="button"
        onClick={onNext}
        disabled={page >= totalPages - 1}
        className="kvle-btn-ghost text-sm"
        style={{ minHeight: 44, padding: "10px 16px" }}
      >
        다음
      </button>
    </nav>
  );
}
