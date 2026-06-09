import Link from "next/link";
import { Activity, AlertTriangle, CheckCircle2, Clock3, ShieldAlert } from "lucide-react";

export const dynamic = "force-dynamic";

type CheckLevel = "ok" | "warn" | "fail";

type OpsCheck = {
  label: string;
  level: CheckLevel;
  detail: string;
};

const CRON_JOBS = [
  {
    path: "/api/cron/comment-image-sweep",
    schedule: "매일 04:00 UTC",
    purpose: "24시간 이상 지난 미참조 댓글 이미지를 정리합니다.",
  },
  {
    path: "/api/cron/signup-proof-purge",
    schedule: "매일 04:30 UTC",
    purpose: "거절 후 30일 지난 가입 증빙 자료를 정리하고 일일 댓글 시딩을 실행합니다.",
  },
];

function hasEnv(name: string): boolean {
  return Boolean(process.env[name]?.trim());
}

function siteUrlCheck(): OpsCheck {
  if (hasEnv("NEXT_PUBLIC_SITE_URL")) {
    return {
      label: "사이트 기준 URL",
      level: "ok",
      detail: "NEXT_PUBLIC_SITE_URL이 설정되어 canonical URL과 OG URL 기준값으로 사용됩니다.",
    };
  }

  if (hasEnv("VERCEL_URL")) {
    return {
      label: "사이트 기준 URL",
      level: "warn",
      detail: "VERCEL_URL fallback을 사용 중입니다. 프로덕션 도메인이 확정되면 NEXT_PUBLIC_SITE_URL을 설정하세요.",
    };
  }

  return {
    label: "사이트 기준 URL",
    level: "warn",
    detail: "기본 vet-exam-ai.vercel.app fallback을 사용 중입니다. 프로덕션 도메인 변경 시 누락 위험이 있습니다.",
  };
}

function loadChecks(): OpsCheck[] {
  const checks: OpsCheck[] = [
    {
      label: "Supabase URL",
      level: hasEnv("NEXT_PUBLIC_SUPABASE_URL") ? "ok" : "fail",
      detail: "앱 라우트, 서버 컴포넌트, 업로드 URL 검증에 필요합니다.",
    },
    {
      label: "Supabase anon key",
      level: hasEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY") ? "ok" : "fail",
      detail: "브라우저와 서버의 일반 Supabase 세션 클라이언트에 필요합니다.",
    },
    {
      label: "Supabase service role key",
      level: hasEnv("SUPABASE_SERVICE_ROLE_KEY") ? "ok" : "fail",
      detail: "운영자 기능, cron 정리 작업, 계정 삭제 처리에 필요합니다.",
    },
    {
      label: "Cron secret",
      level: hasEnv("CRON_SECRET") ? "ok" : "fail",
      detail: "Vercel Cron 엔드포인트의 Bearer 인증에 필요합니다.",
    },
    {
      label: "Sentry DSN",
      level: hasEnv("NEXT_PUBLIC_SENTRY_DSN") ? "ok" : "warn",
      detail: "오류 추적을 위해 설정을 권장합니다. 누락 시 Sentry 테스트 페이지가 비활성 상태로 보입니다.",
    },
    siteUrlCheck(),
  ];

  return checks;
}

function levelLabel(level: CheckLevel): string {
  if (level === "ok") return "정상";
  if (level === "warn") return "확인";
  return "필수";
}

function levelColor(level: CheckLevel): string {
  if (level === "ok") return "var(--correct)";
  if (level === "warn") return "var(--amber)";
  return "var(--wrong)";
}

function levelBackground(level: CheckLevel): string {
  if (level === "ok") return "var(--correct-dim)";
  if (level === "warn") return "var(--amber-dim)";
  return "var(--wrong-dim)";
}

function CheckRow({ check }: { check: OpsCheck }) {
  const Icon = check.level === "ok" ? CheckCircle2 : AlertTriangle;
  return (
    <li
      className="rounded-lg p-4"
      style={{ background: "var(--surface-raised)", border: "1px solid var(--rule)" }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-semibold" style={{ color: "var(--text)" }}>
            <Icon size={15} style={{ color: levelColor(check.level) }} />
            {check.label}
          </div>
          <p className="mt-2 text-xs leading-relaxed" style={{ color: "var(--text-muted)" }}>
            {check.detail}
          </p>
        </div>
        <span
          className="shrink-0 rounded-md px-2 py-1 text-[11px] font-semibold"
          style={{ background: levelBackground(check.level), color: levelColor(check.level) }}
        >
          {levelLabel(check.level)}
        </span>
      </div>
    </li>
  );
}

export default function AdminOpsPage() {
  const checks = loadChecks();
  const failCount = checks.filter((check) => check.level === "fail").length;
  const warnCount = checks.filter((check) => check.level === "warn").length;

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <header>
        <h1 className="flex items-center gap-2 text-xl font-semibold" style={{ color: "var(--text)" }}>
          <Activity size={20} />
          운영 점검
        </h1>
        <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
          배포 직후 필수 설정, cron 보호, 오류 추적 상태를 빠르게 확인합니다.
        </p>
      </header>

      <section className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg p-4" style={{ background: "var(--surface-raised)", border: "1px solid var(--rule)" }}>
          <div className="text-xs" style={{ color: "var(--text-muted)" }}>필수 누락</div>
          <div className="mt-2 text-2xl font-semibold kvle-mono" style={{ color: failCount > 0 ? "var(--wrong)" : "var(--text)" }}>
            {failCount}
          </div>
        </div>
        <div className="rounded-lg p-4" style={{ background: "var(--surface-raised)", border: "1px solid var(--rule)" }}>
          <div className="text-xs" style={{ color: "var(--text-muted)" }}>확인 권장</div>
          <div className="mt-2 text-2xl font-semibold kvle-mono" style={{ color: warnCount > 0 ? "var(--amber)" : "var(--text)" }}>
            {warnCount}
          </div>
        </div>
        <div className="rounded-lg p-4" style={{ background: "var(--surface-raised)", border: "1px solid var(--rule)" }}>
          <div className="text-xs" style={{ color: "var(--text-muted)" }}>예약 작업</div>
          <div className="mt-2 text-2xl font-semibold kvle-mono" style={{ color: "var(--text)" }}>
            {CRON_JOBS.length}
          </div>
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold" style={{ color: "var(--text-muted)" }}>
          환경 설정
        </h2>
        <ul className="grid gap-3 md:grid-cols-2">
          {checks.map((check) => (
            <CheckRow key={check.label} check={check} />
          ))}
        </ul>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold" style={{ color: "var(--text-muted)" }}>
          Cron 작업
        </h2>
        <div className="grid gap-3 md:grid-cols-2">
          {CRON_JOBS.map((job) => (
            <div
              key={job.path}
              className="rounded-lg p-4"
              style={{ background: "var(--surface-raised)", border: "1px solid var(--rule)" }}
            >
              <div className="flex items-center gap-2 text-sm font-semibold" style={{ color: "var(--text)" }}>
                <Clock3 size={15} />
                <code className="kvle-mono">{job.path}</code>
              </div>
              <p className="mt-2 text-xs" style={{ color: "var(--text-muted)" }}>
                {job.schedule}
              </p>
              <p className="mt-2 text-xs leading-relaxed" style={{ color: "var(--text-muted)" }}>
                {job.purpose}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section
        className="rounded-lg p-4 text-sm"
        style={{ background: "var(--surface-raised)", border: "1px solid var(--rule)" }}
      >
        <div className="flex items-center gap-2 font-semibold" style={{ color: "var(--text)" }}>
          <ShieldAlert size={16} />
          배포 후 수동 확인
        </div>
        <div className="mt-3 grid gap-2 text-xs leading-relaxed" style={{ color: "var(--text-muted)" }}>
          <p>Vercel Cron 요청이 401이 아닌 200으로 끝나는지 확인합니다.</p>
          <p>
            <Link href="/admin/sentry-test" style={{ color: "var(--teal)", textDecoration: "underline" }}>
              Sentry 검증 페이지
            </Link>
            에서 클라이언트와 서버 이벤트가 모두 수집되는지 확인합니다.
          </p>
          <p>가입 증빙, 댓글 이미지, 계정 삭제처럼 개인정보가 섞인 경로는 운영 로그에 원문 값이 남지 않는지 확인합니다.</p>
        </div>
      </section>
    </div>
  );
}
