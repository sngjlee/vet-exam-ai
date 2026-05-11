"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Database } from "@/lib/supabase/types";
import { createPost, updatePost } from "@/app/board/_actions";

type Kind = Database["public"]["Enums"]["board_post_kind"];

type Mode =
  | { mode: "create"; kind: Kind }
  | {
      mode: "edit";
      postId: string;
      kind: Kind;
      initialTitle: string;
      initialBodyText: string;
      initialImageUrls: string[];
      initialAnonymized: boolean;
    };

const TITLE_MAX = 200;
const BODY_MAX = 20_000;

export function BoardPostComposer(props: Mode) {
  const router = useRouter();
  const [title, setTitle] = useState(props.mode === "edit" ? props.initialTitle : "");
  const [body, setBody] = useState(props.mode === "edit" ? props.initialBodyText : "");
  const [imageUrls] = useState<string[]>(props.mode === "edit" ? props.initialImageUrls : []);
  const [isAnonymized, setIsAnonymized] = useState(
    props.mode === "edit" ? props.initialAnonymized : false
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!title.trim()) {
      setError("제목을 입력하세요.");
      return;
    }
    if (title.length > TITLE_MAX) {
      setError(`제목은 ${TITLE_MAX}자 이내`);
      return;
    }
    if (!body.trim()) {
      setError("내용을 입력하세요.");
      return;
    }
    if (body.length > BODY_MAX) {
      setError(`본문은 ${BODY_MAX}자 이내`);
      return;
    }

    const html = `<p>${escapeHtml(body)}</p>`;
    startTransition(async () => {
      try {
        if (props.mode === "create") {
          const { id } = await createPost({
            kind: props.kind,
            title: title.trim(),
            body_html: html,
            image_urls: imageUrls,
            is_anonymized: isAnonymized,
          });
          const seg = props.kind === "suggestion" ? "suggestions" : "announcements";
          router.push(`/board/${seg}/${id}`);
          router.refresh();
        } else {
          await updatePost({
            id: props.postId,
            title: title.trim(),
            body_html: html,
            image_urls: imageUrls,
            is_anonymized: isAnonymized,
          });
          const seg = props.kind === "suggestion" ? "suggestions" : "announcements";
          router.push(`/board/${seg}/${props.postId}`);
          router.refresh();
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "저장 실패");
      }
    });
  };

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={TITLE_MAX}
          placeholder="제목"
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-base"
        />
        <div className="mt-1 text-right text-xs text-gray-500">
          {title.length}/{TITLE_MAX}
        </div>
      </div>

      <div>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={BODY_MAX}
          placeholder="내용을 입력하세요"
          rows={10}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
        />
        <div className="mt-1 text-right text-xs text-gray-500">
          {body.length}/{BODY_MAX}
        </div>
      </div>

      {props.kind === "suggestion" ? (
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={isAnonymized}
            onChange={(e) => setIsAnonymized(e.target.checked)}
          />
          익명으로 작성 (운영자에게는 보입니다)
        </label>
      ) : null}

      {error ? <div className="text-sm text-red-600">{error}</div> : null}

      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
      >
        {pending ? "저장 중…" : props.mode === "create" ? "작성" : "수정 저장"}
      </button>
    </form>
  );
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[c] ?? c)
  );
}
