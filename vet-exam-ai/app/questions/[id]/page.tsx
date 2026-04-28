"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { createClient } from "../../../lib/supabase/client";
import { useAuth } from "../../../lib/hooks/useAuth";
import LoadingSpinner from "../../../components/LoadingSpinner";
import QuestionReadOnly from "../../../components/QuestionReadOnly";
import CommentThread from "../../../components/comments/CommentThread";
import type { Question } from "../../../lib/questions";

type Status = "loading" | "ready" | "not_found" | "error";

type QuestionDbRow = {
  id: string;
  public_id: string | null;
  question: string;
  choices: string[];
  answer: string;
  explanation: string;
  category: string;
};

export default function QuestionDetailPage() {
  const params = useParams<{ id: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  const questionId = params?.id ?? "";
  const highlightCommentId = search?.get("comment") ?? undefined;

  const [status, setStatus] = useState<Status>("loading");
  const [question, setQuestion] = useState<Question | null>(null);

  // Auth gate (UX only — RLS is the real boundary).
  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace("/auth/login");
    }
  }, [user, authLoading, router]);

  // Fetch the question.
  useEffect(() => {
    if (authLoading || !user || !questionId) return;
    let cancelled = false;
    async function load() {
      setStatus("loading");
      const supabase = createClient();
      const { data, error } = await supabase
        .from("questions")
        .select("id, public_id, question, choices, answer, explanation, category")
        .eq("id", questionId)
        .maybeSingle<QuestionDbRow>();

      if (cancelled) return;
      if (error) {
        console.error("[QuestionDetailPage] question fetch failed", error);
        setStatus("error");
        return;
      }
      if (!data) {
        setStatus("not_found");
        return;
      }
      setQuestion({
        id: data.id,
        publicId: data.public_id ?? undefined,
        question: data.question,
        choices: data.choices,
        answer: data.answer,
        explanation: data.explanation,
        category: data.category,
      });
      setStatus("ready");
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [questionId, user, authLoading]);

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
          <QuestionReadOnly question={question} />
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
