import { ClientCaptureButton, ClientThrowButton } from "./_components/client-throw";
import { ServerCaptureButton, ServerThrowButton } from "./_components/server-buttons";

export const dynamic = "force-dynamic";

export default function SentryTestPage() {
  const dsnConfigured = Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <h1 className="text-xl font-semibold" style={{ color: "var(--text)" }}>
          Sentry 검증
        </h1>
        <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
          네 가지 트리거로 Sentry에 이벤트가 도착하는지 확인합니다. 모든 이벤트는
          <code className="kvle-mono mx-1 px-1" style={{ background: "var(--surface-raised)" }}>
            [sentry-test]
          </code>
          접두사가 있어 운영 이슈와 구분됩니다.
        </p>
      </header>

      <div
        className="rounded-lg p-4 text-sm"
        style={{
          background: dsnConfigured ? "var(--correct-dim)" : "var(--wrong-dim)",
          border: `1px solid ${
            dsnConfigured
              ? "rgba(45,159,107,0.3)"
              : "rgba(192,74,58,0.3)"
          }`,
          color: dsnConfigured ? "var(--correct)" : "var(--wrong)",
        }}
      >
        {dsnConfigured
          ? "NEXT_PUBLIC_SENTRY_DSN 설정됨 — 이벤트가 Sentry에 전송됩니다."
          : "NEXT_PUBLIC_SENTRY_DSN 미설정 — SDK가 비활성 상태입니다. Vercel env 등록 후 재배포하세요."}
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold" style={{ color: "var(--text)" }}>
          클라이언트
        </h2>
        <div className="flex flex-wrap gap-3">
          <ClientThrowButton />
          <ClientCaptureButton />
        </div>
        <p className="text-xs" style={{ color: "var(--text-muted)" }}>
          • <strong>Throw</strong>: React 렌더 중 throw → <code className="kvle-mono">app/global-error.tsx</code>
          가 캡처. 페이지가 에러 UI로 전환되니 새로고침으로 복귀.<br />
          • <strong>captureException</strong>: 에러는 던지지 않고 Sentry에만 보고. 페이지 유지.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold" style={{ color: "var(--text)" }}>
          서버
        </h2>
        <div className="flex flex-wrap gap-3">
          <ServerThrowButton />
          <ServerCaptureButton />
        </div>
        <p className="text-xs" style={{ color: "var(--text-muted)" }}>
          • <strong>Throw</strong>: server action 안에서 throw → <code className="kvle-mono">onRequestError</code>
          훅이 캡처. 클라이언트에서 fetch 에러로 보이며 페이지는 유지.<br />
          • <strong>captureException</strong>: server action에서 Sentry에만 보고하고 event id 반환.
        </p>
      </section>

      <section
        className="rounded-lg p-4 text-xs"
        style={{
          background: "var(--surface-raised)",
          border: "1px solid var(--rule)",
          color: "var(--text-muted)",
        }}
      >
        <h3 className="text-sm font-semibold mb-2" style={{ color: "var(--text)" }}>
          확인 위치
        </h3>
        Sentry Dashboard → Issues → <code className="kvle-mono">[sentry-test]</code>
        검색. 클라이언트 이벤트는 1~2초, 서버 이벤트는 즉시 도착. Replay가 활성된 클라이언트
        이벤트에는 세션 리플레이가 함께 첨부됩니다.
      </section>
    </div>
  );
}
