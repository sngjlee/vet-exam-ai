import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink, Pencil } from "lucide-react";
import { createClient } from "../../../../lib/supabase/server";

export const dynamic = "force-dynamic";

function decodeMaybe(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

type QuestionFull = {
  id: string;
  public_id: string;
  question: string;
  choices: string[];
  answer: string;
  explanation: string;
  category: string;
  subject: string | null;
  topic: string | null;
  difficulty: string | null;
  source: string | null;
  year: number | null;
  session: number | null;
  round: number | null;
  community_notes: string | null;
  tags: string[] | null;
  is_active: boolean;
  created_at: string;
};

async function loadQuestion(rawId: string): Promise<QuestionFull | null> {
  const id = decodeMaybe(rawId);
  const supabase = await createClient();
  const { data } = await supabase
    .from("questions")
    .select("*")
    .or(`id.eq.${id},public_id.eq.${id}`)
    .limit(1)
    .maybeSingle();
  return (data as QuestionFull | null) ?? null;
}

function MetaRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div
      className="grid grid-cols-[120px_1fr] gap-3 py-2 text-sm"
      style={{ borderBottom: "1px solid var(--rule)" }}
    >
      <div style={{ color: "var(--text-muted)" }}>{label}</div>
      <div style={{ color: "var(--text)" }}>{value ?? "—"}</div>
    </div>
  );
}

export default async function AdminQuestionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: rawId } = await params;
  const q = await loadQuestion(rawId);
  if (!q) notFound();

  const publicHref = `/questions/${encodeURIComponent(q.public_id ?? q.id)}`;

  const correctIndex = q.choices.findIndex((c) => c === q.answer);

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4 flex items-center justify-between">
        <Link
          href="/admin/questions"
          className="inline-flex items-center gap-1.5 text-xs"
          style={{ color: "var(--text-muted)", textDecoration: "none" }}
        >
          <ArrowLeft size={13} />
          목록으로
        </Link>

        <div className="flex items-center gap-3">
          <Link
            href={`/admin/questions/${encodeURIComponent(q.id)}/edit`}
            className="inline-flex items-center gap-1.5 text-xs"
            style={{ color: "var(--teal)", textDecoration: "none" }}
          >
            <Pencil size={12} />
            수정
          </Link>
          <a
            href={publicHref}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs"
            style={{ color: "var(--text-muted)", textDecoration: "none" }}
          >
            공개 페이지로 이동
            <ExternalLink size={12} />
          </a>
        </div>
      </div>

      <header className="mb-6">
        <div className="text-xs uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
          문제 상세
        </div>
        <h1 className="mt-1 text-2xl font-semibold kvle-mono" style={{ color: "var(--text)" }}>
          {q.public_id}
        </h1>
      </header>

      <section
        className="rounded-lg p-5 mb-4"
        style={{ background: "var(--surface-raised)", border: "1px solid var(--rule)" }}
      >
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
          운영 메타
        </h2>
        <MetaRow label="raw id" value={<span className="kvle-mono text-xs">{q.id}</span>} />
        <MetaRow label="회차" value={q.round != null ? `${q.round}회` : null} />
        <MetaRow label="교시" value={q.session != null ? `${q.session}교시` : null} />
        <MetaRow label="연도" value={q.year} />
        <MetaRow label="과목" value={q.subject} />
        <MetaRow label="카테고리" value={q.category} />
        <MetaRow label="토픽" value={q.topic} />
        <MetaRow label="난이도" value={q.difficulty} />
        <MetaRow label="출처" value={q.source} />
        <MetaRow label="태그" value={q.tags && q.tags.length > 0 ? q.tags.join(", ") : null} />
        <MetaRow
          label="상태"
          value={q.is_active ? <span style={{ color: "var(--teal)" }}>활성</span> : <span style={{ color: "var(--text-muted)" }}>비활성</span>}
        />
        <MetaRow label="등록일" value={new Date(q.created_at).toLocaleString("ko-KR")} />
      </section>

      <section
        className="rounded-lg p-5 mb-4"
        style={{ background: "var(--surface-raised)", border: "1px solid var(--rule)" }}
      >
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
          문제
        </h2>
        <p className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: "var(--text)" }}>
          {q.question}
        </p>
      </section>

      <section
        className="rounded-lg p-5 mb-4"
        style={{ background: "var(--surface-raised)", border: "1px solid var(--rule)" }}
      >
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
          선지
        </h2>
        <ol className="space-y-1.5 text-sm" style={{ color: "var(--text)" }}>
          {q.choices.map((c, i) => {
            const isCorrect = i === correctIndex;
            return (
              <li
                key={i}
                className="rounded px-3 py-2 flex items-start gap-2"
                style={{
                  background: isCorrect ? "var(--teal-dim)" : "transparent",
                  border: isCorrect ? "1px solid var(--teal)" : "1px solid var(--rule)",
                }}
              >
                <span
                  className="kvle-mono text-xs"
                  style={{ color: isCorrect ? "var(--teal)" : "var(--text-muted)", minWidth: 20 }}
                >
                  {i + 1}.
                </span>
                <span style={{ color: "var(--text)" }}>{c}</span>
                {isCorrect && (
                  <span
                    className="ml-auto text-[10px] font-medium"
                    style={{ color: "var(--teal)" }}
                  >
                    정답
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      </section>

      <section
        className="rounded-lg p-5 mb-4"
        style={{ background: "var(--surface-raised)", border: "1px solid var(--rule)" }}
      >
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
          해설
        </h2>
        <p className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: "var(--text)" }}>
          {q.explanation || "—"}
        </p>
      </section>

      {q.community_notes && (
        <section
          className="rounded-lg p-5"
          style={{ background: "var(--surface-raised)", border: "1px solid var(--rule)" }}
        >
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
            커뮤니티 노트 (vet40)
          </h2>
          <p className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: "var(--text-muted)" }}>
            {q.community_notes}
          </p>
        </section>
      )}
    </div>
  );
}
