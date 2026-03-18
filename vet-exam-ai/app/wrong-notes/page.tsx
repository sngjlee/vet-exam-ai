"use client";

import { useRouter } from "next/navigation";
import { RETRY_SESSION_KEY } from "../../lib/storage";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useWrongNotes } from "../../lib/hooks/useWrongNotes";
import { BookOpen } from "lucide-react";
import LoadingSpinner from "../../components/LoadingSpinner";
import ConfirmDialog from "../../components/ConfirmDialog";

export default function WrongNotesPage() {
  const { notes: wrongNotes, loading, deleteNote, clearAll } = useWrongNotes();
  const [selectedCategory, setSelectedCategory] = useState<string>("All");
  const [confirmOpen, setConfirmOpen] = useState(false);

  const categories = useMemo(() => [...new Set(wrongNotes.map((n) => n.category))], [wrongNotes]);
  const filteredNotes = selectedCategory === "All"
    ? wrongNotes
    : wrongNotes.filter((n) => n.category === selectedCategory);

  const router = useRouter();

  function handleRetryWrongAnswers() {
    const retryQuestions = filteredNotes.map((note) => ({
      id: note.questionId,
      question: note.question,
      choices: note.choices,
      answer: note.correctAnswer,
      explanation: note.explanation,
      category: note.category,
    }));
    localStorage.setItem(RETRY_SESSION_KEY, JSON.stringify(retryQuestions));
    router.push("/retry-wrong");
  }

  if (loading) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-12">
        <LoadingSpinner />
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-12 space-y-8">
      <ConfirmDialog
        open={confirmOpen}
        title="전체 삭제"
        description="저장된 오답 노트를 모두 삭제합니다. 이 작업은 되돌릴 수 없습니다."
        confirmLabel="전체 삭제"
        onConfirm={() => { setConfirmOpen(false); void clearAll(); }}
        onCancel={() => setConfirmOpen(false)}
      />
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold" style={{ fontFamily: "var(--font-serif)", color: "var(--text)" }}>
            오답 노트
          </h1>
          <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>틀린 문제와 해설을 복습하세요</p>
        </div>
        <Link href="/" className="kvle-btn-ghost text-sm">홈으로</Link>
      </div>

      {/* Filter & actions */}
      <section
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: "12px",
          padding: "1.5rem",
        }}
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <label className="kvle-label mb-2">과목으로 필터</label>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="kvle-input"
              style={{ width: "auto", minWidth: "180px" }}
            >
              <option value="All">전체</option>
              {categories.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="flex gap-3">
            <button
              onClick={handleRetryWrongAnswers}
              disabled={filteredNotes.length === 0}
              className="kvle-btn-primary text-sm"
            >
              오답 재풀이
            </button>
            <button onClick={() => setConfirmOpen(true)} className="kvle-btn-danger text-sm">
              전체 삭제
            </button>
          </div>
        </div>
      </section>

      {/* Notes list */}
      {filteredNotes.length === 0 ? (
        <section className="kvle-card text-center py-12">
          <BookOpen size={40} className="mx-auto mb-3" style={{ color: "var(--text-faint)" }} />
          <p style={{ color: "var(--text-muted)" }}>저장된 오답이 없습니다.</p>
        </section>
      ) : (
        <section className="space-y-4">
          {filteredNotes.map((note) => (
            <article
              key={note.questionId}
              className="rounded-xl p-6"
              style={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderLeft: "4px solid rgba(192,74,58,0.5)",
              }}
            >
              <span className="kvle-badge mb-3 inline-block">{note.category}</span>
              <h2 className="mb-4 text-lg font-semibold leading-relaxed" style={{ color: "var(--text)" }}>
                {note.question}
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4 text-sm">
                <div className="rounded-lg p-3" style={{ background: "var(--wrong-dim)", border: "1px solid rgba(192,74,58,0.2)" }}>
                  <span className="kvle-label mb-1" style={{ color: "var(--wrong)" }}>내 답변</span>
                  <p style={{ color: "var(--text-muted)" }}>{note.selectedAnswer}</p>
                </div>
                <div className="rounded-lg p-3" style={{ background: "var(--correct-dim)", border: "1px solid rgba(45,159,107,0.2)" }}>
                  <span className="kvle-label mb-1" style={{ color: "var(--correct)" }}>정답</span>
                  <p style={{ color: "var(--text-muted)" }}>{note.correctAnswer}</p>
                </div>
              </div>
              <div className="rounded-lg p-3 mb-4 text-sm" style={{ background: "var(--surface-raised)", border: "1px solid var(--border)" }}>
                <span className="kvle-label mb-1" style={{ color: "var(--blue)" }}>해설</span>
                <p style={{ color: "var(--text-muted)" }}>{note.explanation}</p>
              </div>
              <button
                onClick={() => void deleteNote(note.questionId)}
                className="kvle-btn-danger text-sm"
                style={{ padding: "0.375rem 0.875rem" }}
              >
                삭제
              </button>
            </article>
          ))}
        </section>
      )}
    </main>
  );
}
