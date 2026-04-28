import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, AlertCircle } from "lucide-react";
import { createClient } from "../../../../../lib/supabase/server";
import { getFilterOptions } from "../../../../../lib/admin/filter-options";
import { updateQuestion } from "./_actions";

export const dynamic = "force-dynamic";

type EditQuestion = {
  id: string;
  public_id: string;
  question: string;
  choices: string[];
  answer: string;
  explanation: string;
  category: string;
  subject: string | null;
  topic: string | null;
  difficulty: "easy" | "medium" | "hard" | null;
  community_notes: string | null;
  tags: string[] | null;
  is_active: boolean;
  round: number | null;
  session: number | null;
  year: number | null;
  created_at: string;
};

const ERROR_MESSAGES: Record<string, string> = {
  not_found:        "문제를 찾을 수 없습니다.",
  choices_empty:    "선지가 비어 있습니다. 5개를 모두 입력하세요.",
  answer_mismatch:  "정답이 선지 중 하나와 정확히 일치해야 합니다.",
  question_empty:   "문제 본문이 비어 있습니다.",
  category_empty:   "카테고리는 필수입니다.",
  db_error:         "저장 중 오류가 발생했습니다. 다시 시도하세요.",
};

function decodeMaybe(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

async function loadQuestion(rawId: string): Promise<EditQuestion | null> {
  const id = decodeMaybe(rawId);
  const supabase = await createClient();
  const { data } = await supabase
    .from("questions")
    .select(
      "id, public_id, question, choices, answer, explanation, category, subject, topic, difficulty, community_notes, tags, is_active, round, session, year, created_at",
    )
    .or(`id.eq.${id},public_id.eq.${id}`)
    .limit(1)
    .maybeSingle();
  return (data as EditQuestion | null) ?? null;
}

const inputStyle: React.CSSProperties = {
  background: "var(--bg)",
  border: "1px solid var(--rule)",
  color: "var(--text)",
  borderRadius: 6,
  padding: "8px 10px",
  fontSize: 13,
  width: "100%",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 12,
  fontWeight: 600,
  color: "var(--text-muted)",
  marginBottom: 4,
};

const sectionStyle: React.CSSProperties = {
  background: "var(--surface-raised)",
  border: "1px solid var(--rule)",
  borderRadius: 8,
  padding: 20,
  marginBottom: 16,
};

function MetaRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div
      className="grid grid-cols-[100px_1fr] gap-3 py-1.5 text-xs"
      style={{ color: "var(--text-muted)" }}
    >
      <div>{label}</div>
      <div style={{ color: "var(--text)" }}>{value ?? "—"}</div>
    </div>
  );
}

export default async function AdminQuestionEditPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id: rawId } = await params;
  const { error: errorCode } = await searchParams;
  const q = await loadQuestion(rawId);
  if (!q) notFound();

  const options = await getFilterOptions();
  const errorMsg =
    errorCode && ERROR_MESSAGES[errorCode] ? ERROR_MESSAGES[errorCode] : null;

  // Pad choices to length 5 so the form always renders 5 inputs
  const padded = [...q.choices];
  while (padded.length < 5) padded.push("");

  const detailHref = `/admin/questions/${encodeURIComponent(q.id)}`;

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4">
        <Link
          href={detailHref}
          className="inline-flex items-center gap-1.5 text-xs"
          style={{ color: "var(--text-muted)", textDecoration: "none" }}
        >
          <ArrowLeft size={13} />
          상세로
        </Link>
      </div>

      <header className="mb-6">
        <div
          className="text-xs uppercase tracking-wider"
          style={{ color: "var(--text-muted)" }}
        >
          문제 수정
        </div>
        <h1
          className="mt-1 text-2xl font-semibold kvle-mono"
          style={{ color: "var(--text)" }}
        >
          {q.public_id}
        </h1>
      </header>

      {errorMsg && (
        <div
          className="rounded-lg p-3 mb-4 flex items-center gap-2 text-sm"
          style={{
            background: "var(--surface-raised)",
            border: "1px solid var(--danger, #c53030)",
            color: "var(--danger, #c53030)",
          }}
          role="alert"
        >
          <AlertCircle size={14} />
          {errorMsg}
        </div>
      )}

      <form action={updateQuestion}>
        <input type="hidden" name="id" value={q.id} />

        <section style={sectionStyle}>
          <h2
            className="mb-3 text-xs font-semibold uppercase tracking-wider"
            style={{ color: "var(--text-muted)" }}
          >
            잠금 (편집 불가)
          </h2>
          <MetaRow label="raw id" value={<span className="kvle-mono">{q.id}</span>} />
          <MetaRow label="회차" value={q.round != null ? `${q.round}회` : null} />
          <MetaRow label="교시" value={q.session != null ? `${q.session}교시` : null} />
          <MetaRow label="연도" value={q.year} />
          <MetaRow label="등록일" value={new Date(q.created_at).toLocaleString("ko-KR")} />
        </section>

        <section style={sectionStyle}>
          <h2
            className="mb-3 text-xs font-semibold uppercase tracking-wider"
            style={{ color: "var(--text-muted)" }}
          >
            문제
          </h2>
          <label style={labelStyle} htmlFor="question">문제 본문</label>
          <textarea
            id="question"
            name="question"
            defaultValue={q.question}
            rows={6}
            required
            style={{ ...inputStyle, resize: "vertical" }}
          />
        </section>

        <section style={sectionStyle}>
          <h2
            className="mb-3 text-xs font-semibold uppercase tracking-wider"
            style={{ color: "var(--text-muted)" }}
          >
            선지 + 정답
          </h2>
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="mb-2">
              <label style={labelStyle} htmlFor={`choice_${i + 1}`}>{i + 1}번 선지</label>
              <input
                id={`choice_${i + 1}`}
                name={`choice_${i + 1}`}
                defaultValue={padded[i]}
                style={inputStyle}
              />
            </div>
          ))}
          <div className="mt-3">
            <label style={labelStyle} htmlFor="answer">정답 (선지 본문과 정확히 일치)</label>
            <input
              id="answer"
              name="answer"
              defaultValue={q.answer}
              required
              style={inputStyle}
            />
          </div>
        </section>

        <section style={sectionStyle}>
          <h2
            className="mb-3 text-xs font-semibold uppercase tracking-wider"
            style={{ color: "var(--text-muted)" }}
          >
            해설 + 메모
          </h2>
          <label style={labelStyle} htmlFor="explanation">해설</label>
          <textarea
            id="explanation"
            name="explanation"
            defaultValue={q.explanation}
            rows={5}
            style={{ ...inputStyle, resize: "vertical", marginBottom: 12 }}
          />
          <label style={labelStyle} htmlFor="community_notes">커뮤니티 노트 (vet40)</label>
          <textarea
            id="community_notes"
            name="community_notes"
            defaultValue={q.community_notes ?? ""}
            rows={3}
            style={{ ...inputStyle, resize: "vertical" }}
          />
        </section>

        <section style={sectionStyle}>
          <h2
            className="mb-3 text-xs font-semibold uppercase tracking-wider"
            style={{ color: "var(--text-muted)" }}
          >
            메타
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label style={labelStyle} htmlFor="category">카테고리 (필수)</label>
              <select id="category" name="category" defaultValue={q.category} required style={inputStyle}>
                {!options.categories.includes(q.category) && (
                  <option value={q.category}>{q.category}</option>
                )}
                {options.categories.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            <div>
              <label style={labelStyle} htmlFor="subject">과목</label>
              <select id="subject" name="subject" defaultValue={q.subject ?? ""} style={inputStyle}>
                <option value="">—</option>
                {q.subject && !options.subjects.includes(q.subject) && (
                  <option value={q.subject}>{q.subject}</option>
                )}
                {options.subjects.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>

            <div>
              <label style={labelStyle} htmlFor="topic">토픽</label>
              <input id="topic" name="topic" defaultValue={q.topic ?? ""} style={inputStyle} />
            </div>

            <div>
              <label style={labelStyle} htmlFor="difficulty">난이도</label>
              <select id="difficulty" name="difficulty" defaultValue={q.difficulty ?? ""} style={inputStyle}>
                <option value="">—</option>
                <option value="easy">easy</option>
                <option value="medium">medium</option>
                <option value="hard">hard</option>
              </select>
            </div>

            <div className="md:col-span-2">
              <label style={labelStyle} htmlFor="tags">태그 (쉼표로 구분)</label>
              <input
                id="tags"
                name="tags"
                defaultValue={(q.tags ?? []).join(", ")}
                style={inputStyle}
              />
            </div>
          </div>
        </section>

        <section style={sectionStyle}>
          <h2
            className="mb-3 text-xs font-semibold uppercase tracking-wider"
            style={{ color: "var(--text-muted)" }}
          >
            운영
          </h2>
          <label className="inline-flex items-center gap-2 text-sm" htmlFor="is_active">
            <input
              type="checkbox"
              id="is_active"
              name="is_active"
              defaultChecked={q.is_active}
            />
            <span style={{ color: "var(--text)" }}>활성 (체크 해제 시 공개 페이지에서 비공개)</span>
          </label>
        </section>

        <div className="flex items-center justify-end gap-2 mt-6">
          <Link
            href={detailHref}
            className="text-xs"
            style={{
              padding: "8px 16px",
              border: "1px solid var(--rule)",
              borderRadius: 6,
              color: "var(--text-muted)",
              textDecoration: "none",
            }}
          >
            취소
          </Link>
          <button
            type="submit"
            className="text-xs font-medium"
            style={{
              padding: "8px 16px",
              borderRadius: 6,
              background: "var(--teal)",
              color: "white",
              border: "none",
              cursor: "pointer",
            }}
          >
            저장
          </button>
        </div>
      </form>
    </div>
  );
}
