import Link from "next/link";
import { Activity, AlertTriangle, CheckCircle2, Clock3, ShieldAlert } from "lucide-react";
import { createClient } from "../../../lib/supabase/server";
import { getIndexingEnabled, getSiteUrl, ROBOTS_PRIVATE_PATHS } from "../../../lib/seo";
import type { Database } from "../../../lib/supabase/types";

export const dynamic = "force-dynamic";

type CheckLevel = "ok" | "warn" | "fail";

type OpsCheck = {
  label: string;
  level: CheckLevel;
  detail: string;
};

type OpsReference = {
  label: string;
  detail: string;
};

type CronRunLog = Pick<
  Database["public"]["Tables"]["cron_run_logs"]["Row"],
  "job_name" | "status" | "duration_ms" | "detail" | "error" | "started_at" | "finished_at"
>;

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

const SERVICE_ROLE_PATHS: OpsReference[] = [
  {
    label: "lib/cron/run.ts",
    detail: "CRON_SECRET 검증 후 cron 작업에서 RLS를 우회하는 시스템 정리 작업을 실행합니다.",
  },
  {
    label: "app/settings/_actions.ts",
    detail: "계정 삭제 시 auth admin API와 데이터 정리 경로에 사용합니다.",
  },
  {
    label: "app/admin/users/_actions.ts",
    detail: "운영자 비밀번호 재설정 링크 발급에 사용합니다.",
  },
  {
    label: "app/admin/signup-applications/_actions.ts",
    detail: "가입 승인/거절과 증빙 파일 처리에 사용합니다.",
  },
  {
    label: "app/api/comments/upload/route.ts",
    detail: "댓글 이미지 업로드 로그와 Storage 정리 보조 경로에 사용합니다.",
  },
  {
    label: "app/api/admin/image-replacement/upload/route.ts",
    detail: "운영자 문항 이미지 교체 업로드에 사용합니다.",
  },
  {
    label: "app/api/comments/correction-status/route.ts",
    detail: "정정 댓글 상태 조회를 관리자 권한으로 집계합니다.",
  },
  {
    label: "scripts/seed-community-comments.cjs",
    detail: "운영자 수동 시딩 스크립트입니다. 로컬/운영 실행 전 대상 DB를 반드시 확인합니다.",
  },
  {
    label: "scripts/update-seed-comment-voices.cjs",
    detail: "시딩 댓글 계정별 문체 보정 스크립트입니다. 로컬/운영 실행 전 대상 DB를 반드시 확인합니다.",
  },
];

function hasEnv(name: string): boolean {
  return Boolean(process.env[name]?.trim());
}

function isValidHttpsUrl(value: string | undefined): boolean {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:";
  } catch {
    return false;
  }
}

function siteUrlCheck(): OpsCheck {
  const raw = process.env.NEXT_PUBLIC_SITE_URL?.trim();

  if (raw && isValidHttpsUrl(raw)) {
    return {
      label: "사이트 기준 URL",
      level: "ok",
      detail: "NEXT_PUBLIC_SITE_URL이 설정되어 canonical URL과 OG URL 기준값으로 사용됩니다.",
    };
  }

  if (raw) {
    return {
      label: "사이트 기준 URL",
      level: "fail",
      detail: "NEXT_PUBLIC_SITE_URL은 https 절대 URL이어야 합니다. metadataBase, robots host, OG URL 기준값으로 쓰입니다.",
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

function indexingCheck(): OpsCheck {
  const raw = process.env.NEXT_PUBLIC_INDEXING_ENABLED?.trim();
  if (raw === "true") {
    return {
      label: "검색엔진 색인",
      level: "ok",
      detail: "NEXT_PUBLIC_INDEXING_ENABLED=true입니다. robots는 운영/인증 경로를 제외하고 색인을 허용합니다.",
    };
  }

  if (raw === "false") {
    return {
      label: "검색엔진 색인",
      level: "warn",
      detail: "NEXT_PUBLIC_INDEXING_ENABLED=false입니다. robots와 전역 metadata가 noindex 상태입니다.",
    };
  }

  return {
    label: "검색엔진 색인",
    level: "warn",
    detail: "NEXT_PUBLIC_INDEXING_ENABLED가 명시되지 않았습니다. 기본값은 noindex이며 정식 공개 전 true/false를 명시하세요.",
  };
}

function environmentScopeCheck(): OpsCheck {
  if (process.env.VERCEL_ENV === "production") {
    return {
      label: "Vercel 환경",
      level: "ok",
      detail: "VERCEL_ENV=production입니다. Production env와 cron 설정이 실제 공개 배포에 적용됩니다.",
    };
  }

  if (process.env.VERCEL_ENV) {
    return {
      label: "Vercel 환경",
      level: "warn",
      detail: `VERCEL_ENV=${process.env.VERCEL_ENV}입니다. Preview/Development에서는 Production env와 색인 정책을 별도로 확인하세요.`,
    };
  }

  return {
    label: "Vercel 환경",
    level: "warn",
    detail: "VERCEL_ENV가 없습니다. 로컬 실행 또는 비-Vercel 환경이면 Production/Preview env scope를 대시보드에서 별도 확인하세요.",
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
    indexingCheck(),
    environmentScopeCheck(),
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

async function loadCronRuns(): Promise<{ rows: CronRunLog[]; error: string | null }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("cron_run_logs")
    .select("job_name, status, duration_ms, detail, error, started_at, finished_at")
    .order("finished_at", { ascending: false })
    .limit(10);

  return {
    rows: (data ?? []) as CronRunLog[],
    error: error?.message ?? null,
  };
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function summarizeDetail(detail: CronRunLog["detail"]): string {
  if (!detail) return "요약 없음";

  const parts: string[] = [];
  for (const key of ["scanned", "deleted", "inserted", "remaining", "limit"]) {
    const value = detail[key];
    if (typeof value === "number" || typeof value === "string") {
      parts.push(`${key}=${value}`);
    }
  }

  const commentSeeding = detail.commentSeeding;
  if (
    commentSeeding &&
    typeof commentSeeding === "object" &&
    "ok" in commentSeeding &&
    commentSeeding.ok === false
  ) {
    parts.push("commentSeeding=failed");
  }

  return parts.length > 0 ? parts.join(" · ") : "집계 값 없음";
}

function CronRunRows({ rows, error }: { rows: CronRunLog[]; error: string | null }) {
  if (error) {
    return (
      <div
        className="rounded-lg p-4 text-sm"
        style={{ background: "var(--wrong-dim)", border: "1px solid rgba(192,74,58,0.25)", color: "var(--wrong)" }}
      >
        cron_run_logs를 읽지 못했습니다. 운영 DB에 최신 마이그레이션이 적용되었는지 확인하세요.
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div
        className="rounded-lg p-4 text-sm"
        style={{ background: "var(--surface-raised)", border: "1px solid var(--rule)", color: "var(--text-muted)" }}
      >
        아직 기록된 cron 실행 이력이 없습니다.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg" style={{ border: "1px solid var(--rule)" }}>
      <table className="w-full text-left text-xs">
        <thead style={{ background: "var(--surface-raised)", color: "var(--text-muted)" }}>
          <tr>
            <th className="px-3 py-2 font-semibold">작업</th>
            <th className="px-3 py-2 font-semibold">상태</th>
            <th className="px-3 py-2 font-semibold">종료</th>
            <th className="px-3 py-2 font-semibold">시간</th>
            <th className="px-3 py-2 font-semibold">요약</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const failed = row.status === "failure";
            return (
              <tr key={`${row.job_name}-${row.finished_at}`} style={{ borderTop: "1px solid var(--rule)" }}>
                <td className="px-3 py-2 kvle-mono" style={{ color: "var(--text)" }}>
                  {row.job_name}
                </td>
                <td className="px-3 py-2">
                  <span
                    className="rounded-md px-2 py-1 font-semibold"
                    style={{
                      background: failed ? "var(--wrong-dim)" : "var(--correct-dim)",
                      color: failed ? "var(--wrong)" : "var(--correct)",
                    }}
                  >
                    {failed ? "실패" : "성공"}
                  </span>
                </td>
                <td className="px-3 py-2 kvle-mono" style={{ color: "var(--text-muted)" }}>
                  {formatDateTime(row.finished_at)}
                </td>
                <td className="px-3 py-2 kvle-mono" style={{ color: "var(--text-muted)" }}>
                  {row.duration_ms}ms
                </td>
                <td className="px-3 py-2" style={{ color: failed ? "var(--wrong)" : "var(--text-muted)" }}>
                  {failed ? row.error ?? "오류 메시지 없음" : summarizeDetail(row.detail)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default async function AdminOpsPage() {
  const checks = loadChecks();
  const cronRuns = await loadCronRuns();
  const siteUrl = getSiteUrl();
  const indexingEnabled = getIndexingEnabled();
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
          공개 URL / robots
        </h2>
        <div className="grid gap-3 md:grid-cols-2">
          <div
            className="rounded-lg p-4"
            style={{ background: "var(--surface-raised)", border: "1px solid var(--rule)" }}
          >
            <div className="text-sm font-semibold" style={{ color: "var(--text)" }}>
              metadataBase
            </div>
            <p className="mt-2 break-all text-xs kvle-mono" style={{ color: "var(--text-muted)" }}>
              {siteUrl.origin}
            </p>
            <p className="mt-2 text-xs leading-relaxed" style={{ color: "var(--text-muted)" }}>
              NEXT_PUBLIC_SITE_URL이 우선 적용되고, 없으면 VERCEL_URL 또는 기본 Vercel URL을 사용합니다.
            </p>
          </div>
          <div
            className="rounded-lg p-4"
            style={{ background: "var(--surface-raised)", border: "1px solid var(--rule)" }}
          >
            <div className="text-sm font-semibold" style={{ color: "var(--text)" }}>
              robots / noindex
            </div>
            <p className="mt-2 text-xs" style={{ color: indexingEnabled ? "var(--correct)" : "var(--amber)" }}>
              {indexingEnabled ? "색인 허용" : "전체 noindex"}
            </p>
            <p className="mt-2 text-xs leading-relaxed" style={{ color: "var(--text-muted)" }}>
              색인 허용 상태에서도 운영/인증/API 경로는 robots에서 제외합니다.
            </p>
            <p className="mt-2 break-all text-[11px] kvle-mono" style={{ color: "var(--text-faint)" }}>
              disallow: {ROBOTS_PRIVATE_PATHS.join(", ")}
            </p>
          </div>
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold" style={{ color: "var(--text-muted)" }}>
          Service role 사용 경로
        </h2>
        <div className="grid gap-3 md:grid-cols-2">
          {SERVICE_ROLE_PATHS.map((item) => (
            <div
              key={item.label}
              className="rounded-lg p-4"
              style={{ background: "var(--surface-raised)", border: "1px solid var(--rule)" }}
            >
              <code className="text-xs font-semibold kvle-mono" style={{ color: "var(--text)" }}>
                {item.label}
              </code>
              <p className="mt-2 text-xs leading-relaxed" style={{ color: "var(--text-muted)" }}>
                {item.detail}
              </p>
            </div>
          ))}
        </div>
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

      <section>
        <h2 className="mb-3 text-sm font-semibold" style={{ color: "var(--text-muted)" }}>
          최근 Cron 실행
        </h2>
        <CronRunRows rows={cronRuns.rows} error={cronRuns.error} />
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
