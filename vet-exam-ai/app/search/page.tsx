"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Filter, Search as SearchIcon, BookOpen } from "lucide-react";
import { useAuth } from "../../lib/hooks/useAuth";
import { useSearch } from "../../lib/hooks/useSearch";
import {
  decodeQueryParam,
  normalizeQuery,
  parseKvleId,
  pushRecentSearch,
  readRecentSearches,
  sanitizeHeadline,
  SEARCH_PAGE_SIZE,
  type MatchedIn,
} from "../../lib/search";
import {
  FIXED_CATEGORIES,
  saveQuestionsListContext,
  type RecentYearsWindow,
} from "../../lib/questions";
import SearchBar from "../../components/SearchBar";
import LoadingSpinner from "../../components/LoadingSpinner";

const RECENT_OPTIONS: ReadonlyArray<RecentYearsWindow> = [5, 7, 10] as const;

const MATCHED_LABEL: Record<MatchedIn, string> = {
  question:        "본문",
  explanation:     "해설",
  choices:         "선지",
  community_notes: "암기팁",
};

export default function SearchPageRoot() {
  return (
    <Suspense fallback={
      <main className="mx-auto max-w-4xl px-6 py-12">
        <LoadingSpinner />
      </main>
    }>
      <SearchPage />
    </Suspense>
  );
}

function SearchPage() {
  const router = useRouter();
  const params = useSearchParams();
  const { user, loading: authLoading } = useAuth();

  // URL → state
  const urlQ        = decodeQueryParam(params.get("q"));
  const urlCategory = decodeQueryParam(params.get("category"));
  const urlRecentRaw = params.get("recent_years");
  const urlPageRaw   = params.get("page");

  const recentYears = useMemo<RecentYearsWindow | null>(() => {
    if (!urlRecentRaw) return null;
    const n = Number.parseInt(urlRecentRaw, 10);
    if (n === 5 || n === 7 || n === 10) return n;
    return null;
  }, [urlRecentRaw]);

  const page = useMemo(() => {
    const n = urlPageRaw ? Number.parseInt(urlPageRaw, 10) : 0;
    return Number.isFinite(n) && n >= 0 ? n : 0;
  }, [urlPageRaw]);

  const category = urlCategory && (FIXED_CATEGORIES as readonly string[]).includes(urlCategory)
    ? urlCategory
    : "";

  const { q, searchable } = normalizeQuery(urlQ);

  // recent searches sidebar
  const [recents, setRecents] = useState<string[]>([]);
  useEffect(() => {
    setRecents(readRecentSearches());
  }, [q]);

  // KVLE-NNNN shortcut: bypass /api/search round-trip on the client too.
  useEffect(() => {
    if (!q) return;
    const kvle = parseKvleId(q);
    if (kvle) router.replace(`/questions/${encodeURIComponent(kvle)}`);
  }, [q, router]);

  // Fetch only when searchable AND not a KVLE shortcut.
  const fetchInput = searchable && !parseKvleId(q)
    ? { q, category: category || null, recentYears, page }
    : null;
  const { data, loading, error } = useSearch(fetchInput);

  // Push recent search on successful fetch.
  useEffect(() => {
    if (data && !data.error && !data.redirect && data.items.length > 0) {
      pushRecentSearch(q);
    }
  }, [data, q]);

  // Server-side redirect signal (defensive — KVLE handled above already).
  useEffect(() => {
    if (data?.redirect) router.replace(data.redirect);
  }, [data, router]);

  // Auth gate (UX only — RLS is the real boundary).
  useEffect(() => {
    if (authLoading) return;
    if (!user) router.replace("/auth/login");
  }, [user, authLoading, router]);

  function pushUrl(next: { q?: string; category?: string; recentYears?: number | null; page?: number }) {
    const sp = new URLSearchParams();
    const nq = next.q ?? q;
    if (nq) sp.set("q", nq);
    const nc = next.category ?? category;
    if (nc) sp.set("category", nc);
    const nr = next.recentYears !== undefined ? next.recentYears : recentYears;
    if (nr) sp.set("recent_years", String(nr));
    const np = next.page ?? 0;
    if (np > 0) sp.set("page", String(np));
    router.push(`/search?${sp.toString()}`);
  }

  function handleSubmit(raw: string) {
    const { q: cleaned, searchable: ok } = normalizeQuery(raw);
    if (!ok) return;
    pushUrl({ q: cleaned, page: 0 });
  }

  const total = data?.total ?? 0;
  const items = data?.items ?? [];
  const suggestions = data?.suggestions ?? [];
  const totalPages = Math.max(1, Math.ceil(total / SEARCH_PAGE_SIZE));
  const safePage = Math.min(page, Math.max(0, totalPages - 1));

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
        <span className="kvle-label">검색</span>
        <h1
          style={{
            fontFamily:    "var(--font-serif)",
            fontSize:      "clamp(22px, 4vw, 28px)",
            fontWeight:    800,
            margin:        "8px 0 4px",
            letterSpacing: "-0.01em",
            color:         "var(--text)",
          }}
        >
          {searchable ? (
            <>
              검색 결과{" "}
              <span style={{ color: "var(--teal)" }}>{total}</span>
            </>
          ) : (
            "문제 검색"
          )}
        </h1>
        <p style={{ color: "var(--text-muted)", fontSize: 13, margin: 0 }}>
          문제 본문, 해설, 선지, 암기팁에서 키워드로 찾습니다. KVLE-숫자로 바로 이동도 가능합니다.
        </p>
      </header>

      <SearchBar
        initialQuery={q}
        onSubmit={handleSubmit}
        autoFocus={!searchable}
      />

      {/* Filter bar (only when there is a query) */}
      {searchable && (
        <section
          style={{
            background:    "var(--surface)",
            border:        "1px solid var(--border)",
            borderRadius:  12,
            padding:       16,
            display:       "flex",
            flexDirection: "column",
            gap:           12,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--text-muted)" }}>
            <Filter size={14} />
            <span style={{ fontSize: 12, fontWeight: 600, letterSpacing: "0.04em" }}>결과 좁히기</span>
            {(category || recentYears) && (
              <button
                type="button"
                onClick={() => pushUrl({ category: "", recentYears: null, page: 0 })}
                style={{
                  marginLeft:         "auto",
                  background:         "transparent",
                  border:             "none",
                  color:              "var(--text-faint)",
                  cursor:             "pointer",
                  fontSize:           11,
                  padding:            0,
                  textDecoration:     "underline",
                  textUnderlineOffset: 2,
                }}
              >
                필터 초기화
              </button>
            )}
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
            {/* Category */}
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <label className="kvle-label" htmlFor="search-category">과목</label>
              <select
                id="search-category"
                value={category}
                onChange={(e) => pushUrl({ category: e.target.value, page: 0 })}
                className="kvle-input"
                style={{ minWidth: 160 }}
              >
                <option value="">전체</option>
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
                  active={recentYears === null}
                  onClick={() => pushUrl({ recentYears: null, page: 0 })}
                  label="전체"
                />
                {RECENT_OPTIONS.map((n) => (
                  <ChipToggle
                    key={n}
                    active={recentYears === n}
                    onClick={() => pushUrl({ recentYears: n, page: 0 })}
                    label={`${n}개년`}
                  />
                ))}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Body */}
      {!searchable ? (
        <EmptyLanding recents={recents} onPick={(s) => pushUrl({ q: s, page: 0 })} />
      ) : loading ? (
        <section className="kvle-card text-center" style={{ padding: "3rem 1.5rem" }}>
          <LoadingSpinner />
        </section>
      ) : error ? (
        <section
          className="kvle-card text-center"
          style={{ padding: "2rem 1.5rem", color: "var(--wrong)" }}
        >
          검색 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.
        </section>
      ) : items.length === 0 ? (
        <NoResults
          q={q}
          suggestions={suggestions.map((s) => s.suggestion)}
          onPick={(s) => pushUrl({ q: s, page: 0 })}
        />
      ) : (
        <ResultList
          items={items}
          allPublicIds={items.map((i) => i.publicId)}
        />
      )}

      {/* Pagination */}
      {searchable && total > SEARCH_PAGE_SIZE && (
        <nav
          aria-label="검색 결과 페이지 이동"
          style={{
            display:        "flex",
            justifyContent: "space-between",
            alignItems:     "center",
            gap:            12,
          }}
        >
          <button
            onClick={() => pushUrl({ page: Math.max(0, safePage - 1) })}
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
            onClick={() => pushUrl({ page: Math.min(totalPages - 1, safePage + 1) })}
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

function ResultList({
  items,
  allPublicIds,
}: {
  items:        Array<{ id: string; publicId: string; question: string; category: string; matchedIn: MatchedIn; headline: string }>;
  allPublicIds: string[];
}) {
  return (
    <section
      style={{
        background:    "var(--surface)",
        border:        "1px solid var(--border)",
        borderRadius:  12,
        overflow:      "hidden",
      }}
    >
      {items.map((it, i) => (
        <Link
          key={it.id}
          href={`/questions/${encodeURIComponent(it.publicId)}`}
          onClick={() => saveQuestionsListContext(allPublicIds)}
          style={{
            display:       "flex",
            alignItems:    "flex-start",
            gap:           14,
            padding:       "16px 20px",
            borderBottom:  i < items.length - 1 ? "1px solid var(--border)" : "none",
            color:         "inherit",
            textDecoration: "none",
            cursor:        "pointer",
            minHeight:     56,
          }}
        >
          <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span
                style={{
                  fontSize:      10,
                  fontFamily:    "var(--font-mono)",
                  color:         "var(--text-faint)",
                  letterSpacing: "0.08em",
                  fontWeight:    600,
                }}
              >
                {it.publicId}
              </span>
              <span
                style={{
                  fontSize:      10,
                  padding:       "2px 8px",
                  borderRadius:  999,
                  background:    "var(--surface-raised)",
                  border:        "1px solid var(--border)",
                  color:         "var(--text-muted)",
                  fontWeight:    700,
                  letterSpacing: "0.04em",
                }}
              >
                {it.category}
              </span>
              <span
                style={{
                  fontSize:      10,
                  padding:       "2px 8px",
                  borderRadius:  999,
                  background:    "var(--teal-dim)",
                  border:        "1px solid var(--teal-border)",
                  color:         "var(--teal)",
                  fontWeight:    700,
                }}
                title={`${MATCHED_LABEL[it.matchedIn]}에서 매칭`}
              >
                {MATCHED_LABEL[it.matchedIn]}
              </span>
            </div>
            <div
              style={{
                fontSize:   14,
                color:      "var(--text)",
                fontWeight: 500,
                lineHeight: 1.5,
              }}
              dangerouslySetInnerHTML={{ __html: sanitizeHeadline(it.headline) }}
            />
            {it.matchedIn !== "question" && (
              <div
                style={{
                  fontSize:     12,
                  color:        "var(--text-muted)",
                  lineHeight:   1.4,
                  overflow:     "hidden",
                  textOverflow: "ellipsis",
                  display:      "-webkit-box",
                  WebkitLineClamp: 1,
                  WebkitBoxOrient: "vertical",
                }}
              >
                {it.question}
              </div>
            )}
          </div>
        </Link>
      ))}
    </section>
  );
}

function EmptyLanding({
  recents,
  onPick,
}: {
  recents: string[];
  onPick:  (q: string) => void;
}) {
  return (
    <section className="kvle-card text-center" style={{ padding: "3rem 1.5rem" }}>
      <SearchIcon size={36} className="mx-auto mb-3" style={{ color: "var(--text-faint)" }} />
      <p style={{ color: "var(--text-muted)", fontSize: 14, margin: "0 0 8px", lineHeight: 1.6 }}>
        키워드를 입력해 문제 / 해설 / 선지 / 암기팁을 찾아보세요.
      </p>
      <p style={{ color: "var(--text-faint)", fontSize: 12, margin: "0 0 16px" }}>
        2자 이상 입력하면 검색됩니다. KVLE-숫자로 바로 이동도 가능합니다.
      </p>
      {recents.length > 0 && (
        <div style={{ marginTop: 24, display: "flex", flexDirection: "column", gap: 8, alignItems: "center" }}>
          <span className="kvle-label">최근 검색어</span>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "center" }}>
            {recents.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => onPick(r)}
                className="kvle-btn-ghost text-sm"
                style={{ minHeight: 36, padding: "6px 14px", fontSize: 12 }}
              >
                {r}
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function NoResults({
  q,
  suggestions,
  onPick,
}: {
  q:           string;
  suggestions: string[];
  onPick:      (q: string) => void;
}) {
  return (
    <section className="kvle-card text-center" style={{ padding: "3rem 1.5rem" }}>
      <BookOpen size={36} className="mx-auto mb-3" style={{ color: "var(--text-faint)" }} />
      <p style={{ color: "var(--text-muted)", fontSize: 14, margin: "0 0 8px" }}>
        &ldquo;{q}&rdquo;에 해당하는 결과가 없습니다.
      </p>
      {suggestions.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <p style={{ color: "var(--text-faint)", fontSize: 12, margin: "0 0 10px" }}>
            혹시 이 검색어를 찾으시나요?
          </p>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "center" }}>
            {suggestions.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => onPick(s)}
                className="kvle-btn-ghost text-sm"
                style={{ minHeight: 36, padding: "6px 14px", fontSize: 12 }}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function ChipToggle({
  active,
  onClick,
  label,
}: {
  active:  boolean;
  onClick: () => void;
  label:   string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding:      "8px 14px",
        minHeight:    36,
        borderRadius: 999,
        fontSize:     12,
        fontWeight:   600,
        cursor:       "pointer",
        background:   active ? "var(--teal-dim)" : "var(--bg)",
        border:       `1px solid ${active ? "var(--teal-border)" : "var(--border)"}`,
        color:        active ? "var(--teal)" : "var(--text-muted)",
        transition:   "all 150ms",
      }}
    >
      {label}
    </button>
  );
}
