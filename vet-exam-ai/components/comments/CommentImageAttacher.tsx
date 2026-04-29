// vet-exam-ai/components/comments/CommentImageAttacher.tsx
// 댓글 composer 안에 박히는 첨부 위젯.
// 파일 선택 → 클라이언트 압축 → /api/comments/upload → URL 보유.
// 진행률 표시 + ✕ 버튼(업로드된 건 best-effort delete + onChange 갱신).

"use client";

import { useRef, useState, useCallback } from "react";
import { compressForUpload, ImageCompressError } from "../../lib/comments/imageCompress";
import { MAX_IMAGES_PER_COMMENT } from "../../lib/comments/imageUrlValidate";

type Pending = {
  id: string;
  previewUrl: string;
  progress: number;
  error?: string;
};

type Props = {
  value: string[];
  onChange: (urls: string[]) => void;
  size?: "normal" | "compact";
  disabled?: boolean;
};

const ACCEPT = "image/jpeg,image/png,image/webp";

export default function CommentImageAttacher({
  value,
  onChange,
  size = "normal",
  disabled = false,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<Pending[]>([]);
  const [error, setError] = useState<string | null>(null);
  const thumbSize = size === "compact" ? 80 : 120;

  const total = value.length + pending.length;
  const remaining = MAX_IMAGES_PER_COMMENT - total;
  const canAdd = !disabled && remaining > 0;

  const handleFiles = useCallback(
    async (filesIn: FileList | null) => {
      if (!filesIn || filesIn.length === 0) return;
      setError(null);
      const files = Array.from(filesIn).slice(0, remaining);
      if (filesIn.length > remaining) {
        setError(`최대 ${MAX_IMAGES_PER_COMMENT}장까지만 첨부 가능합니다.`);
      }

      for (const file of files) {
        const localId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        let previewUrl = "";
        try {
          const blob = await compressForUpload(file);
          previewUrl = URL.createObjectURL(blob);
          setPending((prev) => [...prev, { id: localId, previewUrl, progress: 0 }]);
          const url = await uploadOne(blob, (p) =>
            setPending((prev) =>
              prev.map((it) => (it.id === localId ? { ...it, progress: p } : it))
            )
          );
          setPending((prev) => prev.filter((it) => it.id !== localId));
          URL.revokeObjectURL(previewUrl);
          onChange([...value, url]);
        } catch (e) {
          if (previewUrl) URL.revokeObjectURL(previewUrl);
          setPending((prev) => prev.filter((it) => it.id !== localId));
          if (e instanceof ImageCompressError) setError(e.message);
          else if (e instanceof Error) setError(e.message);
          else setError("업로드 실패. 잠시 후 다시 시도해주세요.");
        }
      }
      if (inputRef.current) inputRef.current.value = "";
    },
    [remaining, value, onChange]
  );

  const removeUploaded = useCallback(
    (url: string) => {
      onChange(value.filter((u) => u !== url));
      fetch(`/api/comments/upload?url=${encodeURIComponent(url)}`, { method: "DELETE" }).catch(
        () => {
          // 무시 — sweep이 잡음.
        }
      );
    },
    [value, onChange]
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={!canAdd}
          style={{
            background: canAdd ? "var(--surface-raised)" : "var(--surface)",
            color: canAdd ? "var(--text)" : "var(--text-faint)",
            border: "1px solid var(--border)",
            padding: "4px 10px",
            borderRadius: 999,
            fontSize: 11,
            fontWeight: 600,
            cursor: canAdd ? "pointer" : "not-allowed",
          }}
        >
          📎 이미지 첨부 ({total}/{MAX_IMAGES_PER_COMMENT})
        </button>
        {error && (
          <span style={{ fontSize: 11, color: "var(--wrong)" }} role="alert">
            {error}
          </span>
        )}
      </div>

      {(value.length > 0 || pending.length > 0) && (
        <div
          style={{
            display: "flex",
            gap: 6,
            overflowX: "auto",
            paddingBottom: 4,
          }}
        >
          {value.map((url) => (
            <Thumb
              key={url}
              src={url}
              size={thumbSize}
              onRemove={() => removeUploaded(url)}
              disabled={disabled}
            />
          ))}
          {pending.map((p) => (
            <Thumb
              key={p.id}
              src={p.previewUrl}
              size={thumbSize}
              progress={p.progress}
              error={p.error}
              disabled
            />
          ))}
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        multiple
        hidden
        onChange={(e) => handleFiles(e.target.files)}
      />
    </div>
  );
}

function Thumb({
  src,
  size,
  onRemove,
  progress,
  error,
  disabled,
}: {
  src: string;
  size: number;
  onRemove?: () => void;
  progress?: number;
  error?: string;
  disabled?: boolean;
}) {
  return (
    <div
      style={{
        position: "relative",
        width: size,
        height: size,
        flex: "0 0 auto",
        borderRadius: 8,
        overflow: "hidden",
        background: "var(--surface)",
        border: "1px solid var(--border)",
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt=""
        style={{ width: "100%", height: "100%", objectFit: "cover" }}
      />
      {progress !== undefined && progress < 100 && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "rgba(0,0,0,0.45)",
            color: "#fff",
            fontSize: 11,
            fontWeight: 700,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {progress}%
        </div>
      )}
      {error && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "rgba(120,0,0,0.55)",
            color: "#fff",
            fontSize: 10,
            padding: 4,
          }}
        >
          ⚠ {error}
        </div>
      )}
      {onRemove && !disabled && (
        <button
          type="button"
          onClick={onRemove}
          style={{
            position: "absolute",
            top: 4,
            right: 4,
            width: 20,
            height: 20,
            borderRadius: "50%",
            background: "rgba(0,0,0,0.6)",
            color: "#fff",
            border: "none",
            fontSize: 12,
            lineHeight: 1,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
          aria-label="첨부 이미지 제거"
        >
          ✕
        </button>
      )}
    </div>
  );
}

function uploadOne(blob: Blob, onProgress: (pct: number) => void): Promise<string> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/comments/upload");
    xhr.upload.onprogress = (ev) => {
      if (ev.lengthComputable) onProgress(Math.round((ev.loaded / ev.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const json = JSON.parse(xhr.responseText) as { url: string };
          resolve(json.url);
        } catch {
          reject(new Error("서버 응답 오류"));
        }
      } else {
        let detail = "";
        try {
          const j = JSON.parse(xhr.responseText) as { error?: string };
          detail = j.error ?? "";
        } catch {
          // ignore
        }
        if (xhr.status === 429) reject(new Error("잠시 후 다시 시도해주세요."));
        else if (xhr.status === 401) reject(new Error("로그인이 필요합니다."));
        else reject(new Error(`업로드 실패 (${xhr.status}${detail ? `: ${detail}` : ""})`));
      }
    };
    xhr.onerror = () => reject(new Error("네트워크 오류"));
    const fd = new FormData();
    fd.append("file", blob, "image.webp");
    xhr.send(fd);
  });
}
