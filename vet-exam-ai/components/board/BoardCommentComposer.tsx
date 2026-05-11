// vet-exam-ai/components/board/BoardCommentComposer.tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createPostComment } from "@/app/board/[kind]/[id]/_actions";

type Props = {
  postId: string;
  kindSegment: "suggestions" | "announcements";
  parentId?: string | null;
  onDone?: () => void;
};

export function BoardCommentComposer({ postId, kindSegment, parentId, onDone }: Props) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [isAnon, setIsAnon] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!body.trim()) { setError("내용을 입력하세요."); return; }
    startTransition(async () => {
      try {
        await createPostComment({
          post_id: postId,
          parent_id: parentId ?? null,
          body_html: `<p>${escapeHtml(body)}</p>`,
          image_urls: [],
          is_anonymized: isAnon,
          kind_segment: kindSegment,
        });
        setBody("");
        setIsAnon(false);
        router.refresh();
        onDone?.();
      } catch (err) {
        setError(err instanceof Error ? err.message : "댓글 작성 실패");
      }
    });
  };

  return (
    <form onSubmit={submit} className="space-y-2">
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        maxLength={5000}
        placeholder={parentId ? "답글을 입력하세요" : "댓글을 입력하세요"}
        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
        rows={3}
      />
      <div className="flex items-center justify-between gap-2">
        <label className="flex items-center gap-1 text-xs text-gray-600">
          <input type="checkbox" checked={isAnon} onChange={(e) => setIsAnon(e.target.checked)} />
          익명
        </label>
        {error ? <span className="text-xs text-red-600">{error}</span> : null}
        <button type="submit" disabled={pending}
          className="rounded-md bg-blue-600 px-3 py-1 text-sm font-semibold text-white disabled:opacity-50">
          {pending ? "전송 중…" : parentId ? "답글" : "댓글"}
        </button>
      </div>
    </form>
  );
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[c] ?? c);
}
