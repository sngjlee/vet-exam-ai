"use client";

import { useState, useTransition } from "react";
import { compressForUpload, ImageCompressError } from "../../../../lib/comments/imageCompress";
import { triageQuestionReplaceAndActivate } from "../../../../lib/admin/triage";

type Slot = {
  preview: string | null;   // local object URL for preview
  blob:    Blob | null;
  filename: string | null;  // server-returned filename after upload
  uploading: boolean;
  error: string | null;
};

function emptySlot(): Slot {
  return { preview: null, blob: null, filename: null, uploading: false, error: null };
}

type Props = {
  questionId: string;
  qSlotCount: number;
  eSlotCount: number;
  qOriginalUrls: (string | null)[]; // signed URLs for thumbnail reference
  eOriginalUrls: (string | null)[];
  note: string;
  onNoteChange: (v: string) => void;
  onError: (msg: string | null) => void;
};

export function TriageReplaceForm({
  questionId,
  qSlotCount,
  eSlotCount,
  qOriginalUrls,
  eOriginalUrls,
  note,
  onNoteChange,
  onError,
}: Props) {
  const [qSlots, setQSlots] = useState<Slot[]>(() => Array.from({ length: qSlotCount }, emptySlot));
  const [eSlots, setESlots] = useState<Slot[]>(() => Array.from({ length: eSlotCount }, emptySlot));
  const [submitting, startTransition] = useTransition();

  async function handleSelect(role: "q" | "e", index: number, file: File) {
    onError(null);
    const setSlots = role === "q" ? setQSlots : setESlots;

    setSlots((prev) =>
      prev.map((s, i) => (i === index ? { ...s, uploading: true, error: null } : s)),
    );

    let blob: Blob;
    try {
      blob = await compressForUpload(file);
    } catch (e) {
      const msg = e instanceof ImageCompressError ? e.message
                : e instanceof Error ? e.message
                : "압축 실패";
      setSlots((prev) =>
        prev.map((s, i) => (i === index ? { ...s, uploading: false, error: msg } : s)),
      );
      return;
    }

    const previewUrl = URL.createObjectURL(blob);

    const fd = new FormData();
    fd.append("file", blob, "replacement.webp");
    fd.append("question_id", questionId);
    fd.append("role", role);
    fd.append("index", String(index));

    try {
      const res = await fetch("/api/admin/image-replacement/upload", {
        method: "POST",
        body:   fd,
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }
      const j = await res.json() as { filename: string };
      setSlots((prev) =>
        prev.map((s, i) =>
          i === index
            ? { preview: previewUrl, blob, filename: j.filename, uploading: false, error: null }
            : s,
        ),
      );
    } catch (e) {
      URL.revokeObjectURL(previewUrl);
      const msg = e instanceof Error ? e.message : "업로드 실패";
      setSlots((prev) =>
        prev.map((s, i) => (i === index ? { ...s, uploading: false, error: msg } : s)),
      );
    }
  }

  async function handleRemove(role: "q" | "e", index: number) {
    const setSlots = role === "q" ? setQSlots : setESlots;
    const slots    = role === "q" ? qSlots    : eSlots;
    const slot = slots[index];
    if (!slot) return;
    if (slot.preview) URL.revokeObjectURL(slot.preview);
    if (slot.filename) {
      // best-effort cleanup
      fetch(`/api/admin/image-replacement/upload?key=${encodeURIComponent(slot.filename)}`, {
        method: "DELETE",
      }).catch(() => {});
    }
    setSlots((prev) =>
      prev.map((s, i) => (i === index ? emptySlot() : s)),
    );
  }

  const allFilled =
    qSlots.every((s) => s.filename !== null) &&
    eSlots.every((s) => s.filename !== null);

  function handleActivate() {
    onError(null);
    startTransition(async () => {
      const result = await triageQuestionReplaceAndActivate({
        questionId,
        questionFiles:    qSlots.map((s) => s.filename!),
        explanationFiles: eSlots.map((s) => s.filename!),
        note:             note.trim() || null,
      });
      if (!result.ok) onError(result.error);
    });
  }

  return (
    <div
      style={{
        marginTop: 12,
        padding: 12,
        background: "var(--surface)",
        border: "1px solid var(--rule)",
        borderRadius: "var(--radius-sm)",
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>
        교체 이미지 업로드
      </div>

      {qSlotCount > 0 && (
        <SlotGroup
          label="문제 이미지"
          slots={qSlots}
          originalUrls={qOriginalUrls}
          role="q"
          onSelect={handleSelect}
          onRemove={handleRemove}
          disabled={submitting}
        />
      )}
      {eSlotCount > 0 && (
        <SlotGroup
          label="해설 이미지"
          slots={eSlots}
          originalUrls={eOriginalUrls}
          role="e"
          onSelect={handleSelect}
          onRemove={handleRemove}
          disabled={submitting}
        />
      )}

      <input
        type="text"
        value={note}
        onChange={(e) => onNoteChange(e.target.value)}
        placeholder="메모 (선택)"
        maxLength={500}
        style={{
          width: "100%",
          marginTop: 8,
          padding: "6px 10px",
          fontSize: 12,
          borderRadius: 4,
          border: "1px solid var(--rule)",
          background: "var(--surface-raised)",
          color: "var(--text)",
        }}
      />

      <button
        type="button"
        onClick={handleActivate}
        disabled={!allFilled || submitting}
        style={{
          marginTop: 10,
          padding: "8px 14px",
          fontSize: 12,
          borderRadius: 4,
          border: "1px solid var(--teal)",
          background: allFilled && !submitting ? "var(--teal)" : "var(--surface-raised)",
          color:      allFilled && !submitting ? "white"        : "var(--text-muted)",
          cursor:     allFilled && !submitting ? "pointer"      : "not-allowed",
        }}
      >
        {submitting ? "활성화 중..." : "교체 활성화"}
      </button>
    </div>
  );
}

function SlotGroup({
  label,
  slots,
  originalUrls,
  role,
  onSelect,
  onRemove,
  disabled,
}: {
  label: string;
  slots: Slot[];
  originalUrls: (string | null)[];
  role: "q" | "e";
  onSelect: (role: "q" | "e", index: number, file: File) => void;
  onRemove: (role: "q" | "e", index: number) => void;
  disabled: boolean;
}) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 6 }}>
        {label} ({slots.length} 슬롯)
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {slots.map((slot, idx) => (
          <div key={idx} style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {/* 원본 thumbnail (참조용) */}
            <div
              style={{
                width: 60, height: 60,
                background: "var(--surface-raised)",
                border: "1px solid var(--rule)",
                borderRadius: 4,
                overflow: "hidden",
                display: "grid",
                placeItems: "center",
                fontSize: 9,
                color: "var(--text-muted)",
                flexShrink: 0,
              }}
            >
              {originalUrls[idx] ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={originalUrls[idx]!}
                  alt={`원본 ${idx + 1}`}
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                />
              ) : (
                <span>원본</span>
              )}
            </div>

            <span style={{ fontSize: 11, color: "var(--text-muted)", minWidth: 36 }}>
              슬롯 {idx + 1}
            </span>

            {/* 교체본 영역 */}
            {slot.preview ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={slot.preview}
                  alt={`교체 ${idx + 1}`}
                  style={{
                    width: 60, height: 60,
                    objectFit: "cover",
                    border: "2px solid var(--teal)",
                    borderRadius: 4,
                  }}
                />
                <button
                  type="button"
                  onClick={() => onRemove(role, idx)}
                  disabled={disabled}
                  style={{
                    fontSize: 11,
                    color: "rgb(185, 28, 28)",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                  }}
                >
                  취소
                </button>
              </>
            ) : (
              <>
                <label
                  style={{
                    display:      "inline-flex",
                    alignItems:   "center",
                    gap:          6,
                    padding:      "6px 12px",
                    fontSize:     12,
                    borderRadius: 4,
                    border:       "1px solid var(--rule)",
                    background:   disabled || slot.uploading ? "var(--surface-raised)" : "var(--surface)",
                    color:        disabled || slot.uploading ? "var(--text-muted)"      : "var(--text)",
                    cursor:       disabled || slot.uploading ? "not-allowed"            : "pointer",
                  }}
                >
                  <span>📁 파일 선택</span>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/heic"
                    disabled={disabled || slot.uploading}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) onSelect(role, idx, f);
                      e.target.value = "";
                    }}
                    style={{ display: "none" }}
                  />
                </label>
                {slot.uploading && (
                  <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                    업로드 중...
                  </span>
                )}
              </>
            )}
            {slot.error && (
              <span style={{ fontSize: 11, color: "rgb(185, 28, 28)" }}>
                {slot.error}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
