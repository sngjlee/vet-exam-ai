"use client";

import { useEffect, useRef, useState } from "react";
import { Pin } from "lucide-react";
import { createClient } from "../../lib/supabase/client";
import CommentList, { type RootWithReplies } from "./CommentList";
import type { ReplyRow } from "./CommentReplyGroup";
import CommentComposer from "./CommentComposer";
import CommentItem, { type CommentItemData } from "./CommentItem";
import CommentReportModal from "./CommentReportModal";
import type { CommentType } from "../../lib/comments/schema";
import type { SortMode } from "../../lib/comments/voteSchema";
import type { BadgeType } from "../../lib/profile/badgeMeta";

type VoteValue = 1 | -1;
type CommentStatus = "visible" | "hidden_by_votes" | "blinded_by_report";

type Props = {
  questionId: string;
  highlightCommentId?: string;
};

type Status = "loading" | "ready" | "error";

type CommentRow = {
  id: string;
  user_id: string | null;
  parent_id: string | null;
  type: CommentType;
  body_html: string;
  created_at: string;
  status: CommentStatus;
  vote_score: number;
};

const VISIBLE_STATUSES: CommentStatus[] = [
  "visible",
  "hidden_by_votes",
  "blinded_by_report",
];

export default function CommentThread({ questionId, highlightCommentId }: Props) {
  const [status, setStatus] = useState<Status>("loading");
  const [roots, setRoots] = useState<RootWithReplies[]>([]);
  const [scoreById, setScoreById] = useState<Map<string, number>>(new Map());
  const [myVoteById, setMyVoteById] = useState<Map<string, VoteValue>>(new Map());
  const [reportedIds, setReportedIds] = useState<Set<string>>(new Set());
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [sortMode, setSortMode] = useState<SortMode>("score");
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentUserNickname, setCurrentUserNickname] = useState<string | null>(null);
  const [replyingToId, setReplyingToId] = useState<string | null>(null);
  const [reportingId, setReportingId] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [pinnedCommentId, setPinnedCommentId] = useState<string | null>(null);
  const [authorBadgesById, setAuthorBadgesById] = useState<Map<string, BadgeType[]>>(
    new Map()
  );
  const [pinnedFallback, setPinnedFallback] = useState<{
    item: CommentItemData;
    status: CommentStatus;
    score: number;
  } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimerRef = useRef<number | null>(null);

  function showToast(msg: string) {
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    setToast(msg);
    toastTimerRef.current = window.setTimeout(() => setToast(null), 2400);
  }

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

      let query = supabase
        .from("comments")
        .select("id, user_id, parent_id, type, body_html, created_at, status, vote_score")
        .eq("question_id", questionId)
        .in("status", VISIBLE_STATUSES)
        .limit(50);
      if (sortMode === "score") {
        query = query
          .order("vote_score", { ascending: false })
          .order("created_at", { ascending: false });
      } else {
        query = query.order("created_at", { ascending: false });
      }

      const { data: commentRows, error } = await query;

      if (cancelled) return;
      if (error) {
        console.error("[CommentThread] comments fetch failed", error);
        setStatus("error");
        return;
      }
      const rows = (commentRows ?? []) as CommentRow[];

      const newScores = new Map<string, number>();
      for (const r of rows) newScores.set(r.id, r.vote_score ?? 0);
      setScoreById(newScores);

      const userIds = Array.from(
        new Set(rows.map((r) => r.user_id).filter((v): v is string => !!v))
      );
      const nicknameById = new Map<string, string>();
      const badgesByUser = new Map<string, BadgeType[]>();
      if (userIds.length > 0) {
        const [profilesRes, badgesRes] = await Promise.all([
          supabase
            .from("user_profiles_public")
            .select("user_id, nickname")
            .in("user_id", userIds),
          supabase
            .from("badges")
            .select("user_id, badge_type")
            .in("user_id", userIds)
            .in("badge_type", ["operator", "reviewer", "popular_comment"]),
        ]);
        if (cancelled) return;
        if (profilesRes.error) {
          console.warn("[CommentThread] profile fetch failed", profilesRes.error);
        } else {
          for (const p of profilesRes.data ?? []) {
            nicknameById.set(p.user_id, p.nickname);
          }
        }
        if (badgesRes.error) {
          console.warn("[CommentThread] badges fetch failed", badgesRes.error);
        } else {
          for (const b of badgesRes.data ?? []) {
            const arr = badgesByUser.get(b.user_id) ?? [];
            arr.push(b.badge_type as BadgeType);
            badgesByUser.set(b.user_id, arr);
          }
        }
      }

      const toItem = (row: CommentRow): CommentItemData => ({
        id: row.id,
        user_id: row.user_id,
        type: row.type,
        body_html: row.body_html,
        created_at: row.created_at,
        authorNickname: row.user_id ? nicknameById.get(row.user_id) ?? null : null,
      });

      const rootRows = rows.filter((r) => r.parent_id === null);
      const replyRows = rows.filter((r) => r.parent_id !== null);

      const repliesByParent = new Map<string, CommentRow[]>();
      for (const r of replyRows) {
        const pid = r.parent_id as string;
        const arr = repliesByParent.get(pid) ?? [];
        arr.push(r);
        repliesByParent.set(pid, arr);
      }
      for (const [pid, arr] of repliesByParent) {
        arr.sort(
          (a, b) =>
            new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        );
        repliesByParent.set(pid, arr);
      }

      const knownRootIds = new Set(rootRows.map((r) => r.id));
      const assembled: RootWithReplies[] = rootRows.map((row) => ({
        ...toItem(row),
        status: row.status,
        replies: (repliesByParent.get(row.id) ?? []).map<ReplyRow>((rr) => ({
          ...toItem(rr),
          status: rr.status,
        })),
      }));

      for (const [pid, arr] of repliesByParent) {
        if (!knownRootIds.has(pid)) {
          const oldestReply = arr[0];
          assembled.push({
            id: pid,
            user_id: null,
            type: "discussion",
            body_html: "",
            created_at: oldestReply.created_at,
            authorNickname: null,
            status: "visible",
            replies: arr.map<ReplyRow>((rr) => ({
              ...toItem(rr),
              status: rr.status,
            })),
            isPlaceholder: true,
          });
        }
      }

      if (sortMode === "score") {
        assembled.sort((a, b) => {
          const sa = newScores.get(a.id) ?? 0;
          const sb = newScores.get(b.id) ?? 0;
          if (sb !== sa) return sb - sa;
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        });
      } else {
        assembled.sort(
          (a, b) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
      }

      setRoots(assembled);
      setAuthorBadgesById(badgesByUser);
      setStatus("ready");
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [questionId, sortMode, reloadKey]);

  useEffect(() => {
    let cancelled = false;
    async function loadVotes() {
      if (!currentUserId) {
        setMyVoteById(new Map());
        return;
      }
      try {
        const res = await fetch(
          `/api/comments/votes-mine?question_id=${encodeURIComponent(questionId)}`
        );
        if (!res.ok) return;
        const data = (await res.json()) as Record<string, 1 | -1>;
        if (cancelled) return;
        const m = new Map<string, VoteValue>();
        for (const [id, value] of Object.entries(data)) {
          if (value === 1 || value === -1) m.set(id, value);
        }
        setMyVoteById(m);
      } catch {
        /* silent */
      }
    }
    loadVotes();
    return () => {
      cancelled = true;
    };
  }, [questionId, currentUserId, reloadKey]);

  useEffect(() => {
    let cancelled = false;
    async function loadPin() {
      if (!currentUserId) {
        setPinnedCommentId(null);
        return;
      }
      try {
        const res = await fetch(
          `/api/comments/pins?question_id=${encodeURIComponent(questionId)}`,
        );
        if (!res.ok) return;
        const data = (await res.json()) as { comment_id: string | null };
        if (cancelled) return;
        setPinnedCommentId(data.comment_id);
      } catch {
        /* silent */
      }
    }
    loadPin();
    return () => {
      cancelled = true;
    };
  }, [questionId, currentUserId, reloadKey]);

  useEffect(() => {
    let cancelled = false;
    async function loadReports() {
      if (!currentUserId) {
        setReportedIds(new Set());
        return;
      }
      try {
        const res = await fetch(
          `/api/comments/reports-mine?question_id=${encodeURIComponent(questionId)}`
        );
        if (!res.ok) return;
        const data = (await res.json()) as string[];
        if (cancelled) return;
        setReportedIds(new Set(data));
      } catch {
        /* silent */
      }
    }
    loadReports();
    return () => {
      cancelled = true;
    };
  }, [questionId, currentUserId, reloadKey]);

  const highlightedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!highlightCommentId) {
      highlightedRef.current = null;
      return;
    }
    if (highlightedRef.current === highlightCommentId) return;
    if (status !== "ready") return;
    const el = document.getElementById(`comment-${highlightCommentId}`);
    if (!el) return;

    highlightedRef.current = highlightCommentId;
    el.scrollIntoView({ block: "center", behavior: "smooth" });

    const prev = el.style.boxShadow;
    const prevTransition = el.style.transition;
    el.style.transition = "box-shadow 200ms ease-out";
    el.style.boxShadow = "0 0 0 2px var(--teal)";
    const timer = window.setTimeout(() => {
      el.style.boxShadow = prev;
      el.style.transition = prevTransition;
    }, 1500);
    return () => window.clearTimeout(timer);
  }, [highlightCommentId, status, roots]);

  function handleRootSubmitted(newComment: CommentItemData) {
    setRoots((prev) => [
      {
        ...newComment,
        status: "visible",
        authorNickname: currentUserNickname,
        replies: [],
      },
      ...prev,
    ]);
    setScoreById((prev) => {
      const next = new Map(prev);
      next.set(newComment.id, 0);
      return next;
    });
  }

  function handleSubmitReply(parentId: string, newComment: CommentItemData) {
    setRoots((prev) =>
      prev.map((root) =>
        root.id === parentId
          ? {
              ...root,
              replies: [
                ...root.replies,
                {
                  ...newComment,
                  status: "visible",
                  authorNickname: currentUserNickname,
                },
              ],
            }
          : root
      )
    );
    setScoreById((prev) => {
      const next = new Map(prev);
      next.set(newComment.id, 0);
      return next;
    });
    setReplyingToId(null);
  }

  function handleStartReply(id: string) {
    setReplyingToId(id);
  }
  function handleCancelReply() {
    setReplyingToId(null);
  }

  async function handleDelete(id: string) {
    if (!window.confirm("이 댓글을 삭제하시겠습니까?")) return;
    setRoots((prev) => {
      if (prev.some((r) => r.id === id && !r.isPlaceholder)) {
        return prev.filter((r) => r.id !== id);
      }
      return prev.map((root) => ({
        ...root,
        replies: root.replies.filter((rep) => rep.id !== id),
      }));
    });
    try {
      const res = await fetch(`/api/comments/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("삭제 실패");
    } catch {
      setReloadKey((k) => k + 1);
      window.alert("댓글 삭제에 실패했습니다. 다시 시도해주세요.");
    }
  }

  function handleUnauthedAttempt() {
    showToast("로그인하면 투표할 수 있습니다");
  }

  async function handleVoteChange(
    commentId: string,
    value: VoteValue,
    prev: VoteValue | null
  ) {
    const prevScore = scoreById.get(commentId) ?? 0;
    let optimisticVote: VoteValue | null;
    let scoreDelta: number;
    if (prev === value) {
      optimisticVote = null;
      scoreDelta = -value;
    } else {
      optimisticVote = value;
      scoreDelta = value - (prev ?? 0);
    }

    setMyVoteById((m) => {
      const next = new Map(m);
      if (optimisticVote === null) next.delete(commentId);
      else next.set(commentId, optimisticVote);
      return next;
    });
    setScoreById((m) => {
      const next = new Map(m);
      next.set(commentId, prevScore + scoreDelta);
      return next;
    });

    try {
      const res = await fetch(`/api/comments/${commentId}/vote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value }),
      });
      if (!res.ok) {
        throw new Error(`vote failed: ${res.status}`);
      }
      const data = (await res.json()) as { vote: 1 | -1 | null };
      setMyVoteById((m) => {
        const next = new Map(m);
        if (data.vote === null) next.delete(commentId);
        else next.set(commentId, data.vote);
        return next;
      });
    } catch {
      setMyVoteById((m) => {
        const next = new Map(m);
        if (prev === null) next.delete(commentId);
        else next.set(commentId, prev);
        return next;
      });
      setScoreById((m) => {
        const next = new Map(m);
        next.set(commentId, prevScore);
        return next;
      });
      showToast("투표 처리에 실패했습니다.");
    }
  }

  function handleReport(id: string) {
    if (!currentUserId) {
      showToast("로그인하면 신고할 수 있습니다");
      return;
    }
    setReportingId(id);
  }

  function handleReportSubmitted(id: string) {
    setReportedIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
    showToast("신고가 접수되었습니다.");
  }

  function handleAlreadyReported(id: string) {
    setReportedIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
    showToast("이미 신고하신 댓글입니다.");
  }

  function handleExpand(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }

  async function handleTogglePin(commentId: string) {
    if (!currentUserId) {
      showToast("로그인하면 고정할 수 있습니다");
      return;
    }
    const prevPinned = pinnedCommentId;
    const nextPinned = prevPinned === commentId ? null : commentId;
    setPinnedCommentId(nextPinned);
    try {
      const res = await fetch("/api/comments/pins", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question_id: questionId,
          comment_id: commentId,
        }),
      });
      if (!res.ok) throw new Error("pin failed");
      const data = (await res.json()) as {
        pinned: boolean;
        comment_id: string | null;
      };
      setPinnedCommentId(data.comment_id);
      showToast(data.pinned ? "내 암기팁으로 고정했습니다" : "고정을 해제했습니다");
    } catch {
      setPinnedCommentId(prevPinned);
      showToast("고정 상태 변경에 실패했습니다");
    }
  }

  // Locate the pinned comment within already-loaded roots/replies. If absent,
  // we lazy-fetch it as fallback so old/scrolled-out comments still appear at
  // the top. Plain expression — React Compiler memoizes automatically.
  const pinnedFromList: typeof pinnedFallback = (() => {
    if (!pinnedCommentId) return null;
    for (const root of roots) {
      if (root.id === pinnedCommentId && !root.isPlaceholder) {
        const item: CommentItemData = {
          id: root.id,
          user_id: root.user_id,
          type: root.type,
          body_html: root.body_html,
          created_at: root.created_at,
          authorNickname: root.authorNickname,
        };
        return { item, status: root.status, score: scoreById.get(root.id) ?? 0 };
      }
      for (const reply of root.replies) {
        if (reply.id === pinnedCommentId) {
          const item: CommentItemData = {
            id: reply.id,
            user_id: reply.user_id,
            type: reply.type,
            body_html: reply.body_html,
            created_at: reply.created_at,
            authorNickname: reply.authorNickname,
          };
          return {
            item,
            status: reply.status,
            score: scoreById.get(reply.id) ?? 0,
          };
        }
      }
    }
    return null;
  })();

  // Fallback: pinned comment exists but isn't in the current roots window.
  const pinnedInListSentinel = pinnedFromList !== null;
  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!pinnedCommentId || pinnedInListSentinel) {
        setPinnedFallback(null);
        return;
      }
      const supabase = createClient();
      const { data, error } = await supabase
        .from("comments")
        .select("id, user_id, type, body_html, created_at, status, vote_score")
        .eq("id", pinnedCommentId)
        .maybeSingle();
      if (cancelled || error || !data) {
        if (!cancelled) {
          setPinnedFallback(null);
        }
        return;
      }
      let nickname: string | null = null;
      if (data.user_id) {
        const { data: profile } = await supabase
          .from("user_profiles_public")
          .select("nickname")
          .eq("user_id", data.user_id)
          .maybeSingle();
        if (cancelled) return;
        nickname = profile?.nickname ?? null;
      }
      setPinnedFallback({
        item: {
          id: data.id,
          user_id: data.user_id,
          type: data.type as CommentType,
          body_html: data.body_html,
          created_at: data.created_at,
          authorNickname: nickname,
        },
        status: data.status as CommentStatus,
        score: data.vote_score ?? 0,
      });
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [pinnedCommentId, pinnedInListSentinel]);

  const pinnedDisplay = pinnedFromList ?? pinnedFallback;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, position: "relative" }}>
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
          {pinnedDisplay && (
            <section
              aria-label="내 암기팁"
              style={{
                background: "var(--teal-dim)",
                border: "1px solid var(--teal-border)",
                borderRadius: 12,
                padding: "12px 14px 14px",
                display: "flex",
                flexDirection: "column",
                gap: 10,
              }}
            >
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: "0.04em",
                  color: "var(--teal)",
                }}
              >
                <Pin size={12} />
                내 암기팁
              </div>
              <CommentItem
                comment={pinnedDisplay.item}
                score={pinnedDisplay.score}
                myVote={myVoteById.get(pinnedDisplay.item.id) ?? null}
                status={pinnedDisplay.status}
                isOwner={pinnedDisplay.item.user_id === currentUserId}
                isAuthed={currentUserId !== null}
                isReported={reportedIds.has(pinnedDisplay.item.id)}
                canDelete={pinnedDisplay.item.user_id === currentUserId}
                isPinned
                authorBadges={
                  pinnedDisplay.item.user_id
                    ? authorBadgesById.get(pinnedDisplay.item.user_id) ?? []
                    : []
                }
                onDelete={handleDelete}
                onReport={handleReport}
                onVoteChange={handleVoteChange}
                onUnauthedAttempt={handleUnauthedAttempt}
                onTogglePin={handleTogglePin}
              />
            </section>
          )}
          <CommentList
            questionId={questionId}
            roots={roots}
            scoreById={scoreById}
            myVoteById={myVoteById}
            reportedIds={reportedIds}
            expandedIds={expandedIds}
            currentUserId={currentUserId}
            sortMode={sortMode}
            onSortChange={setSortMode}
            replyingToId={replyingToId}
            onStartReply={handleStartReply}
            onCancelReply={handleCancelReply}
            onSubmitReply={handleSubmitReply}
            onDelete={handleDelete}
            onReport={handleReport}
            onVoteChange={handleVoteChange}
            onUnauthedAttempt={handleUnauthedAttempt}
            onExpand={handleExpand}
            pinnedCommentId={pinnedCommentId}
            onTogglePin={handleTogglePin}
            authorBadgesById={authorBadgesById}
          />
          {currentUserId ? (
            <CommentComposer questionId={questionId} onSubmitted={handleRootSubmitted} />
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

      {reportingId && (
        <CommentReportModal
          commentId={reportingId}
          open={!!reportingId}
          onClose={() => setReportingId(null)}
          onSubmitted={handleReportSubmitted}
          onAlreadyReported={handleAlreadyReported}
        />
      )}

      {toast && (
        <div
          role="status"
          style={{
            position: "fixed",
            bottom: 24,
            left: "50%",
            transform: "translateX(-50%)",
            background: "var(--text)",
            color: "var(--bg)",
            padding: "10px 18px",
            borderRadius: 999,
            fontSize: 13,
            fontWeight: 600,
            boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
            zIndex: 50,
          }}
        >
          {toast}
        </div>
      )}
    </div>
  );
}
