// vet-exam-ai/components/comments/CommentImageGallery.tsx
// 댓글 본문 아래에 박히는 갤러리.
// 1장: 단일 썸네일, 2~3장: 그리드. 클릭 시 lightbox (←/→/ESC + swipe).

"use client";

import { useEffect, useState, useCallback } from "react";

type Props = {
  urls: string[];
  size?: "normal" | "compact";
};

export default function CommentImageGallery({ urls, size = "normal" }: Props) {
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  const close = useCallback(() => setOpenIdx(null), []);
  const next = useCallback(
    () => setOpenIdx((i) => (i === null ? null : (i + 1) % urls.length)),
    [urls.length]
  );
  const prev = useCallback(
    () => setOpenIdx((i) => (i === null ? null : (i - 1 + urls.length) % urls.length)),
    [urls.length]
  );

  useEffect(() => {
    if (openIdx === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      else if (e.key === "ArrowRight") next();
      else if (e.key === "ArrowLeft") prev();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openIdx, close, next, prev]);

  if (urls.length === 0) return null;

  const thumbSize = size === "compact" ? 80 : 120;

  return (
    <>
      <div
        style={{
          display: "flex",
          gap: 6,
          flexWrap: "wrap",
          marginTop: 8,
        }}
      >
        {urls.map((url, idx) => (
          <button
            key={url}
            type="button"
            onClick={() => setOpenIdx(idx)}
            style={{
              width: thumbSize,
              height: thumbSize,
              padding: 0,
              border: "1px solid var(--border)",
              borderRadius: 8,
              overflow: "hidden",
              background: "var(--surface)",
              cursor: "zoom-in",
            }}
            aria-label={`댓글 이미지 ${idx + 1}/${urls.length} 크게 보기`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={url}
              alt={`댓글 이미지 ${idx + 1}/${urls.length}`}
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
              loading="lazy"
            />
          </button>
        ))}
      </div>

      {openIdx !== null && (
        <Lightbox
          src={urls[openIdx]}
          index={openIdx}
          total={urls.length}
          onClose={close}
          onNext={urls.length > 1 ? next : undefined}
          onPrev={urls.length > 1 ? prev : undefined}
        />
      )}
    </>
  );
}

function Lightbox({
  src,
  index,
  total,
  onClose,
  onNext,
  onPrev,
}: {
  src: string;
  index: number;
  total: number;
  onClose: () => void;
  onNext?: () => void;
  onPrev?: () => void;
}) {
  const [touchStartX, setTouchStartX] = useState<number | null>(null);

  return (
    <div
      onClick={onClose}
      onTouchStart={(e) => setTouchStartX(e.touches[0].clientX)}
      onTouchEnd={(e) => {
        if (touchStartX === null) return;
        const dx = e.changedTouches[0].clientX - touchStartX;
        if (Math.abs(dx) > 60) {
          if (dx < 0 && onNext) onNext();
          else if (dx > 0 && onPrev) onPrev();
        }
        setTouchStartX(null);
      }}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.85)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
        padding: 16,
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={`댓글 이미지 ${index + 1}/${total}`}
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: "100%",
          maxHeight: "100%",
          objectFit: "contain",
          cursor: "default",
        }}
      />
      {onPrev && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onPrev();
          }}
          aria-label="이전 이미지"
          style={navBtnStyle("left")}
        >
          ‹
        </button>
      )}
      {onNext && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onNext();
          }}
          aria-label="다음 이미지"
          style={navBtnStyle("right")}
        >
          ›
        </button>
      )}
      <div
        style={{
          position: "absolute",
          top: 16,
          right: 20,
          color: "#fff",
          fontSize: 13,
          fontFamily: "var(--font-mono)",
        }}
      >
        {index + 1} / {total}
      </div>
    </div>
  );
}

function navBtnStyle(side: "left" | "right"): React.CSSProperties {
  return {
    position: "absolute",
    top: "50%",
    transform: "translateY(-50%)",
    [side]: 16,
    width: 44,
    height: 44,
    borderRadius: "50%",
    background: "rgba(255,255,255,0.15)",
    color: "#fff",
    border: "none",
    fontSize: 28,
    lineHeight: 1,
    cursor: "pointer",
  };
}
