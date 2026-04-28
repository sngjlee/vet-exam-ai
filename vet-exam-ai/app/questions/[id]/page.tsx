"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight, ListChecks } from "lucide-react";
import { useAuth } from "../../../lib/hooks/useAuth";
import { useQuestions } from "../../../lib/hooks/useQuestions";
import LoadingSpinner from "../../../components/LoadingSpinner";
import QuestionReadOnly from "../../../components/QuestionReadOnly";
import CommentThread from "../../../components/comments/CommentThread";
import {
  readQuestionsListContext,
  type Question,
  type QuestionsListContext,
} from "../../../lib/questions";

type Status = "loading" | "ready" | "not_found" | "error";

export default function QuestionDetailPage() {
  const params = useParams<{ id: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const {
    questions,
    loading: questionsLoading,
    error: questionsError,
  } = useQuestions();

  // Next 16 useParams returns the URL segment without decoding non-ASCII —
  // `2.4_공보_57회_q001` arrives as `2.4_%EA%B3%B5%EB%B3%B4_57%ED%9A%8C_q001`.
  // Decode here so the lookup matches stored ids regardless of caller (KVLE
  // public ids are ASCII and are no-ops; legacy raw ids in notification/profile
  // links are restored).
  const rawId = params?.id ?? "";
  const questionId = decodeMaybe(rawId);
  const highlightCommentId = search?.get("comment") ?? undefined;

  const [status, setStatus] = useState<Status>("loading");
  const [question, setQuestion] = useState<Question | null>(null);
  const [listContext, setListContext] = useState<QuestionsListContext | null>(null);

  // Read sessionStorage list context (set by /questions card click).
  // sessionStorage is browser-only, so we sync it on mount and whenever the
  // active question id changes. Disabling the lint rule is intentional: this
  // is the canonical pattern for syncing client-only state with a route key.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setListContext(readQuestionsListContext());
  }, [questionId]);

  const navInfo = useMemo(() => {
    if (!listContext) return null;
    // List saves publicId-preferred ids; URL may carry either. Try both keys
    // so legacy raw-id URLs still find their slot in the saved context.
    const candidates = [question?.publicId, question?.id, questionId].filter(
      (v): v is string => Boolean(v),
    );
    let idx = -1;
    for (const candidate of candidates) {
      idx = listContext.ids.indexOf(candidate);
      if (idx >= 0) break;
    }
    if (idx < 0) return null;
    return {
      prevId: idx > 0 ? listContext.ids[idx - 1] : null,
      nextId:
        idx < listContext.ids.length - 1 ? listContext.ids[idx + 1] : null,
      position: idx + 1,
      total: listContext.ids.length,
    };
  }, [listContext, question?.id, question?.publicId, questionId]);

  // Auth gate (UX only — RLS is the real boundary).
  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace("/auth/login");
    }
  }, [user, authLoading, router]);

  // Resolve from the same question payload used by the list. This keeps the
  // list/detail ID contract in one place and also supports public IDs in URLs.
  useEffect(() => {
    if (authLoading || !user || !questionId) return;
    if (questionsLoading) {
      setStatus("loading");
      return;
    }
    if (questionsError) {
      setStatus("error");
      return;
    }

    const found = questions.find(
      (item) => item.id === questionId || item.publicId === questionId,
    );
    if (!found) {
      setQuestion(null);
      setStatus("not_found");
      return;
    }

    setQuestion(found);
    setStatus("ready");
  }, [questionId, user, authLoading, questions, questionsLoading, questionsError]);

  if (authLoading || !user) {
    return (
      <div style={{ padding: "48px 24px", display: "grid", placeItems: "center" }}>
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <main
      style={{
        maxWidth: 880,
        margin: "0 auto",
        padding: "32px 24px 80px",
        display: "flex",
        flexDirection: "column",
        gap: 24,
      }}
    >
      {status === "loading" && (
        <div style={{ padding: "48px 24px", display: "grid", placeItems: "center" }}>
          <LoadingSpinner />
        </div>
      )}

      {status === "error" && (
        <div
          style={{
            padding: "20px 18px",
            background: "var(--wrong-dim)",
            border: "1px solid rgba(192,74,58,0.3)",
            borderRadius: 12,
            color: "var(--text)",
            fontSize: 14,
          }}
        >
          문제를 불러올 수 없습니다. 잠시 후 다시 시도해 주세요.
        </div>
      )}

      {status === "not_found" && (
        <div
          style={{
            padding: "20px 18px",
            background: "var(--bg)",
            border: "1px dashed var(--border)",
            borderRadius: 12,
            color: "var(--text-muted)",
            fontSize: 14,
            textAlign: "center",
          }}
        >
          해당 문제를 찾을 수 없습니다.
        </div>
      )}

      {status === "ready" && question && (
        <>
          <QuestionNavBar navInfo={navInfo} onNavigate={(id) => router.push(`/questions/${encodeURIComponent(id)}`)} />
          <QuestionReadOnly question={question} />
          <QuestionNavBar
            navInfo={navInfo}
            onNavigate={(id) => router.push(`/questions/${encodeURIComponent(id)}`)}
            position="bottom"
          />
          <section
            aria-label="커뮤니티 토론"
            style={{ display: "flex", flexDirection: "column", gap: 12 }}
          >
            <h3
              style={{
                fontSize: 14,
                fontWeight: 700,
                color: "var(--text)",
                margin: 0,
              }}
            >
              커뮤니티 토론
            </h3>
            <CommentThread
              questionId={question.id}
              highlightCommentId={highlightCommentId}
            />
          </section>
        </>
      )}
    </main>
  );
}

function decodeMaybe(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

type NavInfo = {
  prevId: string | null;
  nextId: string | null;
  position: number;
  total: number;
};

function QuestionNavBar({
  navInfo,
  onNavigate,
  position = "top",
}: {
  navInfo: NavInfo | null;
  onNavigate: (id: string) => void;
  position?: "top" | "bottom";
}) {
  // Direct-link visits (no list context): show only "목록으로" so users can
  // still reach the list. Don't render at all on the bottom in that case to
  // avoid duplicate empty bars.
  if (!navInfo) {
    if (position === "bottom") return null;
    return (
      <nav
        aria-label="문제 탐색"
        style={{ display: "flex", justifyContent: "flex-start" }}
      >
        <Link
          href="/questions"
          className="kvle-btn-ghost text-sm"
          style={{ minHeight: 44, padding: "10px 16px" }}
        >
          <ListChecks size={14} />
          해설보기 목록
        </Link>
      </nav>
    );
  }

  const { prevId, nextId, position: pos, total } = navInfo;

  return (
    <nav
      aria-label="문제 탐색"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        flexWrap: "wrap",
      }}
    >
      <button
        type="button"
        onClick={() => prevId && onNavigate(prevId)}
        disabled={!prevId}
        className="kvle-btn-ghost text-sm"
        style={{ minHeight: 44, padding: "10px 16px" }}
      >
        <ChevronLeft size={16} />
        이전 문제
      </button>

      <div
        style={{
          display: "inline-flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 4,
        }}
      >
        <Link
          href="/questions"
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: "var(--text-muted)",
            textDecoration: "none",
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
          }}
        >
          <ListChecks size={12} />
          해설보기 목록
        </Link>
        <span
          style={{
            fontSize: 11,
            fontFamily: "var(--font-mono)",
            color: "var(--text-faint)",
          }}
        >
          {pos} / {total}
        </span>
      </div>

      <button
        type="button"
        onClick={() => nextId && onNavigate(nextId)}
        disabled={!nextId}
        className="kvle-btn-ghost text-sm"
        style={{ minHeight: 44, padding: "10px 16px" }}
      >
        다음 문제
        <ChevronRight size={16} />
      </button>
    </nav>
  );
}
