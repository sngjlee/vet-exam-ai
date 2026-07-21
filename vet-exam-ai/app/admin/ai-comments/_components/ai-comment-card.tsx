import Link from "next/link";
import type { AiCommentCandidateItem } from "../_lib/query";
import {
  authorLabel,
  AI_COMMENT_STATUS_LABELS,
  commentTypeLabel,
  formatAiCommentGeneratedAt,
  riskLabel,
} from "../_lib/presentation";
import { AiCommentReviewForm } from "./ai-comment-review-form";

type AiCommentCardProps = {
  readonly item: AiCommentCandidateItem;
};

function MetaChip({ children }: { readonly children: React.ReactNode }) {
  return <span className="kvle-badge">{children}</span>;
}

export function AiCommentCard({ item }: AiCommentCardProps) {
  const isPending = item.status === "pending";

  return (
    <article
      className="overflow-hidden rounded-2xl border shadow-sm"
      style={{ background: "var(--surface)", borderColor: "var(--border)" }}
    >
      <header
        className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-start sm:justify-between"
        style={{ borderColor: "var(--rule)", background: "var(--surface-raised)" }}
      >
        <div className="min-w-0">
          <Link
            href={`/questions/${encodeURIComponent(item.question.publicId)}`}
            className="kvle-mono text-sm font-semibold"
            style={{ color: "var(--teal)" }}
          >
            {item.question.publicId}
          </Link>
          <div className="mt-2 flex flex-wrap gap-2">
            <MetaChip>{item.question.category}</MetaChip>
            {item.question.subject && <MetaChip>{item.question.subject}</MetaChip>}
            {item.question.topic && <MetaChip>{item.question.topic}</MetaChip>}
          </div>
        </div>
        <span
          className="self-start rounded-full border px-3 py-1 text-xs font-semibold"
          style={{
            borderColor: isPending ? "var(--teal-border)" : "var(--border)",
            background: isPending ? "var(--teal-dim)" : "var(--bg)",
            color: isPending ? "var(--teal)" : "var(--text-muted)",
          }}
        >
          {AI_COMMENT_STATUS_LABELS[item.status]}
        </span>
      </header>

      <div className="grid xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
        <section className="grid gap-5 p-4 sm:p-6" aria-label={`문제 ${item.question.publicId} 검수 근거`}>
          <div>
            <p className="mb-2 text-xs font-semibold" style={{ color: "var(--text-muted)" }}>문제</p>
            <h2
              className="text-base font-semibold leading-7"
              style={{ color: "var(--text)" }}
            >
              {item.question.question}
            </h2>
          </div>

          <ol className="grid gap-2" aria-label="선택지">
            {item.question.choices.map((choice, index) => {
              const isAnswer = choice === item.question.answer;
              return (
                <li
                  key={`${index}-${choice}`}
                  className="flex gap-3 rounded-lg border p-3 text-sm leading-6"
                  style={{
                    borderColor: isAnswer ? "var(--teal-border)" : "var(--border)",
                    background: isAnswer ? "var(--teal-dim)" : "var(--bg)",
                    color: "var(--text)",
                  }}
                >
                  <span className="kvle-mono shrink-0" aria-hidden>{index + 1}.</span>
                  <span className="min-w-0 flex-1">{choice}</span>
                  {isAnswer && (
                    <span className="shrink-0 text-xs font-semibold" style={{ color: "var(--correct)" }}>
                      정답
                    </span>
                  )}
                </li>
              );
            })}
          </ol>

          <div
            className="grid gap-3 rounded-xl border p-4"
            style={{ borderColor: "var(--rule)", background: "var(--bg)" }}
          >
            <div>
              <p className="text-xs font-semibold" style={{ color: "var(--text-muted)" }}>정답</p>
              <p className="mt-1 text-sm font-semibold" style={{ color: "var(--correct)" }}>
                {item.question.answer}
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold" style={{ color: "var(--text-muted)" }}>공식 해설</p>
              <p className="mt-1 whitespace-pre-wrap text-sm leading-7" style={{ color: "var(--text)" }}>
                {item.question.explanation}
              </p>
            </div>
          </div>
        </section>

        <aside
          className="grid content-start gap-5 border-t p-4 sm:p-6 xl:border-l xl:border-t-0"
          style={{ borderColor: "var(--rule)", background: "var(--surface-raised)" }}
          aria-label="생성된 댓글 검수"
        >
          <div>
            <p className="text-xs font-semibold" style={{ color: "var(--text-muted)" }}>게시 계정</p>
            <p className="mt-1 text-sm font-semibold" style={{ color: "var(--text)" }}>
              {item.seedNickname ?? "계정 확인 필요"}
            </p>
            <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
              {authorLabel(item.seedAuthorKey)} · {commentTypeLabel(item.commentType)}
            </p>
          </div>

          <div>
            <p className="text-xs font-semibold" style={{ color: "var(--text-muted)" }}>댓글 초안</p>
            <blockquote
              className="mt-2 whitespace-pre-wrap rounded-xl border p-4 text-sm leading-7"
              style={{ background: "var(--surface)", borderColor: "var(--teal-border)", color: "var(--text)" }}
            >
              {item.bodyText}
            </blockquote>
          </div>

          <dl className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <dt style={{ color: "var(--text-muted)" }}>모델</dt>
              <dd className="mt-1 break-words font-medium" style={{ color: "var(--text)" }}>{item.model}</dd>
            </div>
            <div>
              <dt style={{ color: "var(--text-muted)" }}>프롬프트</dt>
              <dd className="mt-1 font-medium" style={{ color: "var(--text)" }}>{item.promptVersion}</dd>
            </div>
            <div className="col-span-2">
              <dt style={{ color: "var(--text-muted)" }}>생성 시각</dt>
              <dd className="mt-1 font-medium" style={{ color: "var(--text)" }}>
                {formatAiCommentGeneratedAt(item.createdAt)}
              </dd>
            </div>
          </dl>

          <div>
            <p className="text-xs font-semibold" style={{ color: "var(--text-muted)" }}>위험 신호</p>
            {item.riskFlags.length === 0 ? (
              <p className="mt-2 text-sm" style={{ color: "var(--correct)" }}>감지된 위험 신호 없음</p>
            ) : (
              <ul className="mt-2 flex flex-wrap gap-2">
                {item.riskFlags.map((flag) => (
                  <li
                    key={flag}
                    className="rounded-full border px-2.5 py-1 text-xs"
                    style={{ borderColor: "var(--amber)", color: "var(--amber)" }}
                  >
                    {riskLabel(flag)}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {isPending ? (
            <AiCommentReviewForm candidateId={item.id} />
          ) : (
            <p
              className="rounded-lg border p-3 text-sm"
              style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}
            >
              이 초안은 이미 처리되었습니다.
            </p>
          )}
        </aside>
      </div>
    </article>
  );
}
