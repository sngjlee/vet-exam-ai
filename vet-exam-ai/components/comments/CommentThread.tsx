"use client";

import { useEffect, useState } from "react";
import { createClient } from "../../lib/supabase/client";
import CommentList from "./CommentList";
import CommentComposer from "./CommentComposer";
import type { CommentItemData } from "./CommentItem";
import type { CommentType } from "../../lib/comments/schema";

type Props = {
  questionId: string;
};

type Status = "loading" | "ready" | "error";

type CommentRow = {
  id: string;
  user_id: string | null;
  type: CommentType;
  body_html: string;
  created_at: string;
  status: string;
};

export default function CommentThread({ questionId }: Props) {
  const [status, setStatus] = useState<Status>("loading");
  const [comments, setComments] = useState<CommentItemData[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentUserNickname, setCurrentUserNickname] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setStatus("loading");
      const supabase = createClient();

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (cancelled) return;
      setCurrentUserId(user?.id ?? null);

      if (user) {
        const { data: profile } = await supabase
          .from("user_profiles_public")
          .select("nickname")
          .eq("user_id", user.id)
          .maybeSingle();
        if (cancelled) return;
        setCurrentUserNickname(profile?.nickname ?? null);
      } else {
        setCurrentUserNickname(null);
      }

      const { data: commentRows, error } = await supabase
        .from("comments")
        .select("id, user_id, type, body_html, created_at, status")
        .eq("question_id", questionId)
        .eq("status", "visible")
        .order("created_at", { ascending: false })
        .limit(50);

      if (cancelled) return;
      if (error) {
        console.error("[CommentThread] comments fetch failed", error);
        setStatus("error");
        return;
      }
      const rows = (commentRows ?? []) as CommentRow[];

      const userIds = Array.from(
        new Set(rows.map((r) => r.user_id).filter((v): v is string => !!v))
      );
      const nicknameById = new Map<string, string>();
      if (userIds.length > 0) {
        const { data: profiles, error: profileErr } = await supabase
          .from("user_profiles_public")
          .select("user_id, nickname")
          .in("user_id", userIds);
        if (cancelled) return;
        if (profileErr) {
          console.warn("[CommentThread] profile fetch failed", profileErr);
        } else {
          for (const p of profiles ?? []) {
            nicknameById.set(p.user_id, p.nickname);
          }
        }
      }

      const mapped: CommentItemData[] = rows.map((row) => ({
        id: row.id,
        user_id: row.user_id,
        type: row.type,
        body_html: row.body_html,
        created_at: row.created_at,
        authorNickname: row.user_id ? nicknameById.get(row.user_id) ?? null : null,
      }));
      setComments(mapped);
      setStatus("ready");
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [questionId, reloadKey]);

  function handleSubmitted(newComment: CommentItemData) {
    setComments((prev) => [
      { ...newComment, authorNickname: currentUserNickname },
      ...prev,
    ]);
  }

  async function handleDelete(id: string) {
    if (!window.confirm("이 댓글을 삭제하시겠습니까?")) return;
    const previous = comments;
    setComments((prev) => prev.filter((c) => c.id !== id));
    try {
      const res = await fetch(`/api/comments/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("삭제 실패");
    } catch {
      setComments(previous);
      window.alert("댓글 삭제에 실패했습니다. 다시 시도해주세요.");
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {status === "loading" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              style={{
                height: 64,
                background: "var(--surface-raised)",
                borderRadius: 10,
                opacity: 0.4,
              }}
            />
          ))}
        </div>
      )}

      {status === "error" && (
        <div
          style={{
            padding: "16px 14px",
            background: "var(--wrong-dim)",
            border: "1px solid rgba(192,74,58,0.3)",
            borderRadius: 10,
            fontSize: 13,
            color: "var(--text)",
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}
        >
          댓글을 불러올 수 없습니다.
          <button
            type="button"
            onClick={() => setReloadKey((k) => k + 1)}
            style={{
              marginLeft: "auto",
              background: "transparent",
              border: "1px solid var(--border)",
              color: "var(--text)",
              padding: "4px 12px",
              borderRadius: 999,
              fontSize: 11,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            다시 시도
          </button>
        </div>
      )}

      {status === "ready" && (
        <>
          <CommentList
            comments={comments}
            currentUserId={currentUserId}
            onDelete={handleDelete}
          />
          {currentUserId ? (
            <CommentComposer questionId={questionId} onSubmitted={handleSubmitted} />
          ) : (
            <div
              style={{
                padding: "14px 16px",
                background: "var(--bg)",
                border: "1px dashed var(--border)",
                borderRadius: 10,
                fontSize: 13,
                color: "var(--text-muted)",
                textAlign: "center",
              }}
            >
              로그인하면 의견을 남길 수 있습니다.
            </div>
          )}
        </>
      )}
    </div>
  );
}
