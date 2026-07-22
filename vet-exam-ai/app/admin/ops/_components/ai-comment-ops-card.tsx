import {
  deriveAiCommentOpsView,
  type AiCommentOpsSnapshot,
  type AiCommentOpsState,
} from "../_lib/ai-comment-ops";

type StatusStyle = Readonly<{
  color: string;
  background: string;
}>;

const STATUS_STYLES = {
  "missing-key": { color: "var(--wrong)", background: "var(--wrong-dim)" },
  disabled: { color: "var(--amber)", background: "var(--amber-dim)" },
  "cap-reached": { color: "var(--amber)", background: "var(--amber-dim)" },
  healthy: { color: "var(--correct)", background: "var(--correct-dim)" },
  unavailable: { color: "var(--wrong)", background: "var(--wrong-dim)" },
} as const satisfies Record<AiCommentOpsState, StatusStyle>;

type CounterProps = Readonly<{
  label: string;
  value: number;
  limit: number;
}>;

function Counter({ label, value, limit }: CounterProps) {
  return (
    <div
      className="rounded-lg p-3"
      style={{ background: "var(--surface-raised)", border: "1px solid var(--rule)" }}
    >
      <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>
        {label}
      </div>
      <div className="mt-1 text-sm font-semibold kvle-mono" style={{ color: "var(--text)" }}>
        {value} / {limit}
      </div>
    </div>
  );
}

export function AiCommentOpsCard({ snapshot }: { readonly snapshot: AiCommentOpsSnapshot }) {
  const view = deriveAiCommentOpsView(snapshot);
  const statusStyle = STATUS_STYLES[view.state];

  return (
    <section>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold" style={{ color: "var(--text-muted)" }}>
          AI 댓글 후보 생성
        </h2>
        <span
          className="rounded-md px-2 py-1 text-[11px] font-semibold"
          style={{ background: statusStyle.background, color: statusStyle.color }}
        >
          {view.label}
        </span>
      </div>

      <div
        className="rounded-lg p-4"
        style={{ background: "var(--surface)", border: "1px solid var(--rule)" }}
      >
        <p className="text-xs leading-relaxed" style={{ color: "var(--text-muted)" }}>
          {view.detail}
        </p>

        <dl className="mt-4 grid gap-3 text-xs sm:grid-cols-3">
          <div>
            <dt style={{ color: "var(--text-faint)" }}>모델</dt>
            <dd className="mt-1 kvle-mono" style={{ color: "var(--text)" }}>
              {snapshot.config.model}
            </dd>
          </div>
          <div>
            <dt style={{ color: "var(--text-faint)" }}>생성 스위치</dt>
            <dd className="mt-1" style={{ color: "var(--text)" }}>
              {snapshot.config.enabled ? "켜짐" : "꺼짐"}
            </dd>
          </div>
          <div>
            <dt style={{ color: "var(--text-faint)" }}>OpenAI API key</dt>
            <dd className="mt-1" style={{ color: "var(--text)" }}>
              {snapshot.config.apiKeyConfigured ? "설정됨" : "누락"}
            </dd>
          </div>
        </dl>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <Counter
            label="오늘 요청"
            value={snapshot.counters.dailyRequests}
            limit={snapshot.config.dailyLimit}
          />
          <Counter
            label="이번 달 요청"
            value={snapshot.counters.monthlyRequests}
            limit={snapshot.config.monthlyLimit}
          />
          <Counter
            label="승인 대기"
            value={snapshot.counters.pendingCandidates}
            limit={snapshot.config.pendingLimit}
          />
        </div>

        <dl className="mt-4 grid gap-3 text-xs md:grid-cols-2">
          <div>
            <dt style={{ color: "var(--text-faint)" }}>상한 사유</dt>
            <dd className="mt-1" style={{ color: "var(--text)" }}>{view.capReason}</dd>
          </div>
          <div>
            <dt style={{ color: "var(--text-faint)" }}>최근 생성 결과</dt>
            <dd className="mt-1" style={{ color: "var(--text)" }}>{view.latestResult}</dd>
          </div>
        </dl>
      </div>
    </section>
  );
}
