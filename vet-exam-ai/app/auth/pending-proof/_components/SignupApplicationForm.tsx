"use client";

import { useState } from "react";
import { createClient } from "../../../../lib/supabase/client";
import { uploadSignupProof } from "../../../../lib/storage/signup-proofs";
import { submitSignupApplicationAction } from "../_actions";

type Mode = "image" | "text";

type Props = {
  userId: string;
  defaultUniversity?: string;
  defaultTargetRound?: number;
  showRejectionBanner?: { reason: string; count: number } | null;
};

export default function SignupApplicationForm({
  userId,
  defaultUniversity = "",
  defaultTargetRound,
  showRejectionBanner = null,
}: Props) {
  const [mode, setMode] = useState<Mode>("image");
  const [university, setUniversity] = useState(defaultUniversity);
  const [targetRound, setTargetRound] = useState<string>(
    defaultTargetRound != null ? String(defaultTargetRound) : "",
  );
  const [realName, setRealName] = useState("");
  const [studentNumber, setStudentNumber] = useState("");
  const [freeNote, setFreeNote] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [proofText, setProofText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const round = Number(targetRound);
    if (!university.trim()) return setError("소속 대학을 입력해 주세요.");
    if (!Number.isFinite(round) || round < 1 || round > 200) {
      return setError("목표 회차를 1~200 사이로 입력해 주세요.");
    }

    setSubmitting(true);
    try {
      let proofStoragePath: string | null = null;
      let proofTextValue: string | null = null;

      if (mode === "image") {
        if (!file) {
          setError("학생증/수험표 이미지를 첨부해 주세요.");
          return;
        }
        const supabase = createClient();
        const up = await uploadSignupProof(supabase, userId, file);
        if (!up.ok) {
          setError(up.message ?? "이미지 업로드에 실패했습니다.");
          return;
        }
        proofStoragePath = up.path;
      } else {
        if (proofText.trim().length === 0) {
          setError("증빙 텍스트를 입력해 주세요.");
          return;
        }
        if (proofText.length > 2000) {
          setError("텍스트 증빙은 2000자 이내로 작성해 주세요.");
          return;
        }
        proofTextValue = proofText;
      }

      const result = await submitSignupApplicationAction({
        university: university.trim(),
        targetRound: round,
        realName: realName.trim() || null,
        studentNumber: studentNumber.trim() || null,
        freeNote: freeNote.trim() || null,
        proofKind: mode,
        proofStoragePath,
        proofText: proofTextValue,
      });

      if (!result.ok) {
        setError(result.message ?? "제출에 실패했습니다.");
        return;
      }
      // Server action revalidates and redirects to /auth/pending-review.
      // Fallback hard reload in case redirect did not fire.
      window.location.href = "/auth/pending-review";
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      style={{ display: "flex", flexDirection: "column", gap: "1rem", width: "100%", maxWidth: 480 }}
    >
      {showRejectionBanner && (
        <div
          role="alert"
          style={{
            padding: "12px 14px",
            borderRadius: 12,
            background: "var(--wrong-dim)",
            border: "1px solid rgba(192,74,58,0.3)",
            color: "var(--wrong)",
            fontSize: 13,
            lineHeight: 1.5,
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: 4 }}>
            지난 신청이 거부되었어요 (총 {showRejectionBanner.count}회)
          </div>
          <div>사유: {showRejectionBanner.reason}</div>
        </div>
      )}

      <div style={{ display: "flex", gap: 8 }}>
        <button
          type="button"
          onClick={() => setMode("image")}
          className={mode === "image" ? "kvle-btn-primary" : "kvle-btn-secondary"}
          style={{ flex: 1 }}
        >
          학생증/수험표 이미지
        </button>
        <button
          type="button"
          onClick={() => setMode("text")}
          className={mode === "text" ? "kvle-btn-primary" : "kvle-btn-secondary"}
          style={{ flex: 1 }}
        >
          텍스트로 신고
        </button>
      </div>

      <div>
        <label className="kvle-label mb-2">소속 대학 *</label>
        <input
          className="kvle-input"
          value={university}
          onChange={(e) => setUniversity(e.target.value)}
          maxLength={100}
          required
          placeholder="예: 서울대학교 수의과대학"
        />
      </div>

      <div>
        <label className="kvle-label mb-2">목표 회차 *</label>
        <input
          className="kvle-input"
          type="number"
          inputMode="numeric"
          value={targetRound}
          onChange={(e) => setTargetRound(e.target.value)}
          min={1}
          max={200}
          required
          placeholder="예: 70"
        />
      </div>

      {mode === "image" ? (
        <div>
          <label className="kvle-label mb-2">학생증/수험표 이미지 *</label>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            required
            style={{ width: "100%" }}
          />
          <div style={{ fontSize: 11, color: "var(--text-faint)", marginTop: 4 }}>
            JPG / PNG / WEBP, 5MB 이하. 운영자만 열람하며 승인 즉시 삭제됩니다.
          </div>
        </div>
      ) : (
        <div>
          <label className="kvle-label mb-2">증빙 설명 *</label>
          <textarea
            className="kvle-input"
            value={proofText}
            onChange={(e) => setProofText(e.target.value)}
            rows={5}
            maxLength={2000}
            required
            placeholder="이미지 첨부가 어려운 사정과 본인 정보(학번/학교)를 자세히 적어 주세요. 운영자가 직접 검토합니다."
          />
        </div>
      )}

      <details style={{ fontSize: 13 }}>
        <summary style={{ cursor: "pointer", color: "var(--text-muted)" }}>선택 입력 (운영자만 열람)</summary>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
          <div>
            <label className="kvle-label mb-2">실명</label>
            <input
              className="kvle-input"
              value={realName}
              onChange={(e) => setRealName(e.target.value)}
              maxLength={50}
            />
          </div>
          <div>
            <label className="kvle-label mb-2">학번</label>
            <input
              className="kvle-input"
              value={studentNumber}
              onChange={(e) => setStudentNumber(e.target.value)}
              maxLength={30}
            />
          </div>
          <div>
            <label className="kvle-label mb-2">자유 메모</label>
            <textarea
              className="kvle-input"
              value={freeNote}
              onChange={(e) => setFreeNote(e.target.value)}
              rows={3}
              maxLength={1000}
            />
          </div>
        </div>
      </details>

      {error && (
        <div
          className="rounded-lg px-3 py-2.5 text-sm"
          style={{
            background: "var(--wrong-dim)",
            border: "1px solid rgba(192,74,58,0.3)",
            color: "var(--wrong)",
          }}
        >
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="kvle-btn-primary w-full"
      >
        {submitting ? "제출 중…" : "제출하기"}
      </button>
    </form>
  );
}
