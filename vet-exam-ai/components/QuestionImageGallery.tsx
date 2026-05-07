"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "../lib/supabase/client";

const BUCKET = "question-images-public";

type Props = {
  files:     string[];
  altPrefix: string;
};

export default function QuestionImageGallery({ files, altPrefix }: Props) {
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  const [hidden,  setHidden]  = useState<Set<number>>(() => new Set());

  const supabase = createClient();

  const urls = files.map((f) =>
    supabase.storage.from(BUCKET).getPublicUrl(f).data.publicUrl,
  );
  const visibleIndexes = urls.map((_, i) => i).filter((i) => !hidden.has(i));

  const close = useCallback(() => setOpenIdx(null), []);
  const next  = useCallback(
    () => setOpenIdx((i) => {
      if (i === null) return null;
      const pos = visibleIndexes.indexOf(i);
      return visibleIndexes[(pos + 1) % visibleIndexes.length];
    }),
    [visibleIndexes],
  );
  const prev = useCallback(
    () => setOpenIdx((i) => {
      if (i === null) return null;
      const pos = visibleIndexes.indexOf(i);
      return visibleIndexes[(pos - 1 + visibleIndexes.length) % visibleIndexes.length];
    }),
    [visibleIndexes],
  );

  useEffect(() => {
    if (openIdx === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      else if (e.key === "ArrowRight") next();
      else if (e.key === "ArrowLeft")  prev();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openIdx, close, next, prev]);

  if (visibleIndexes.length === 0) return null;

  const isSingle = visibleIndexes.length === 1;

  return (
    <>
      <div
        style={{
          display:   "grid",
          gridTemplateColumns: isSingle ? "1fr" : "repeat(2, 1fr)",
          gap:       8,
          margin:    "16px 0",
          maxWidth:  isSingle ? 600 : "100%",
        }}
      >
        {urls.map((url, idx) => {
          if (hidden.has(idx)) return null;
          return (
            <button
              key={url}
              type="button"
              onClick={() => setOpenIdx(idx)}
              style={{
                padding: 0,
                border: "1px solid var(--border)",
                borderRadius: 8,
                overflow: "hidden",
                background: "var(--surface)",
                cursor: "zoom-in",
                width: "100%",
              }}
              aria-label={`${altPrefix} ${idx + 1} 크게 보기`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={url}
                alt={`${altPrefix} ${idx + 1}`}
                onError={() => setHidden((prev) => new Set(prev).add(idx))}
                style={{ width: "100%", height: "auto", display: "block" }}
                loading="lazy"
              />
            </button>
          );
        })}
      </div>

      {openIdx !== null && (
        <Lightbox
          src={urls[openIdx]}
          alt={`${altPrefix} ${openIdx + 1}`}
          position={visibleIndexes.indexOf(openIdx) + 1}
          total={visibleIndexes.length}
          onClose={close}
          onNext={visibleIndexes.length > 1 ? next : undefined}
          onPrev={visibleIndexes.length > 1 ? prev : undefined}
        />
      )}
    </>
  );
}

function Lightbox({
  src,
  alt,
  position,
  total,
  onClose,
  onNext,
  onPrev,
}: {
  src: string;
  alt: string;
  position: number;
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
        alt={alt}
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
          onClick={(e) => { e.stopPropagation(); onPrev(); }}
          aria-label="이전 이미지"
          style={navBtnStyle("left")}
        >
          ‹
        </button>
      )}
      {onNext && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onNext(); }}
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
        {position} / {total}
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
