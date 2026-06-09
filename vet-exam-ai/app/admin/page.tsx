import Link from "next/link";
import {
  FileText,
  Layers,
  Hash,
  CheckCircle2,
  Image as ImageIcon,
  Users,
  GraduationCap,
  Flag,
  GitPullRequest,
  History,
  ShieldCheck,
  MessageSquareDot,
  Ban,
  Activity,
} from "lucide-react";
import { createClient } from "../../lib/supabase/server";

export const dynamic = "force-dynamic";

type CountResult = number | null;

async function loadCounts(): Promise<{
  total:               CountResult;
  active:              CountResult;
  rounds:              CountResult;
  categories:          CountResult;
  imageQueuePending:   CountResult;
  signupPending:       CountResult;
}> {
  const supabase = await createClient();

  const [total, active, rounds, categories, hasImageTotal, triageCount, signupPendingRpc] = await Promise.all([
    supabase.from("questions").select("*", { count: "exact", head: true }),
    supabase.from("questions").select("*", { count: "exact", head: true }).eq("is_active", true),
    supabase.rpc("count_questions_distinct", { col: "round" }),
    supabase.rpc("count_questions_distinct", { col: "category" }),
    supabase.from("questions").select("*", { count: "exact", head: true }).contains("tags", ["has_image"]),
    supabase.from("question_image_triage").select("*", { count: "exact", head: true }),
    // signup_applications RLS allows own SELECT only; admin path is the SECURITY DEFINER RPC.
    supabase.rpc("list_signup_applications", { p_status: "pending_review", p_page: 1, p_page_size: 1 }),
  ]);

  const imageQueuePending =
    hasImageTotal.count != null && triageCount.count != null
      ? Math.max(0, hasImageTotal.count - triageCount.count)
      : null;

  const signupPending: CountResult = signupPendingRpc.error
    ? null
    : Number(signupPendingRpc.data?.[0]?.total_count ?? 0);

  return {
    total: total.error ? null : total.count ?? 0,
    active: active.error ? null : active.count ?? 0,
    rounds: rounds.error ? null : (rounds.data as number | null) ?? 0,
    categories: categories.error ? null : (categories.data as number | null) ?? 0,
    imageQueuePending,
    signupPending,
  };
}

function CountCard({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: CountResult;
  icon: React.ComponentType<{ size?: number }>;
}) {
  return (
    <div
      className="rounded-lg p-4"
      style={{ background: "var(--surface-raised)", border: "1px solid var(--rule)" }}
    >
      <div
        className="flex items-center gap-2 text-xs"
        style={{ color: "var(--text-muted)" }}
      >
        <Icon size={13} />
        {label}
      </div>
      <div
        className="mt-2 text-2xl font-semibold kvle-mono"
        style={{ color: value == null ? "var(--text-muted)" : "var(--text)" }}
      >
        {value == null ? "—" : value.toLocaleString("ko-KR")}
      </div>
    </div>
  );
}

function HubCard({
  href,
  label,
  desc,
  icon: Icon,
  disabled,
}: {
  href: string;
  label: string;
  desc: string;
  icon: React.ComponentType<{ size?: number }>;
  disabled?: boolean;
}) {
  const inner = (
    <div
      className="rounded-lg p-4 h-full"
      style={{
        background: "var(--surface-raised)",
        border: "1px solid var(--rule)",
        opacity: disabled ? 0.5 : 1,
        cursor: disabled ? "not-allowed" : "pointer",
      }}
    >
      <div
        className="flex items-center gap-2 text-sm font-semibold"
        style={{ color: disabled ? "var(--text-muted)" : "var(--text)" }}
      >
        <Icon size={15} />
        {label}
      </div>
      <p
        className="mt-2 text-xs leading-relaxed"
        style={{ color: "var(--text-muted)" }}
      >
        {desc}
      </p>
      {disabled && (
        <span
          className="mt-3 inline-block text-[10px] uppercase tracking-wider"
          style={{ color: "var(--text-muted)" }}
        >
          다음 단계 예정
        </span>
      )}
    </div>
  );

  if (disabled) return <div aria-disabled>{inner}</div>;
  return (
    <Link href={href} style={{ textDecoration: "none" }}>
      {inner}
    </Link>
  );
}

export default async function AdminDashboardPage() {
  const counts = await loadCounts();

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <header>
        <h1 className="text-xl font-semibold" style={{ color: "var(--text)" }}>
          대시보드
        </h1>
        <p
          className="mt-1 text-sm"
          style={{ color: "var(--text-muted)" }}
        >
          오늘의 운영 점검
        </p>
      </header>

      <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <CountCard label="총 문제"     value={counts.total}      icon={FileText} />
        <CountCard label="활성 문제"   value={counts.active}     icon={CheckCircle2} />
        <CountCard label="회차"         value={counts.rounds}     icon={Hash} />
        <CountCard label="카테고리"     value={counts.categories} icon={Layers} />
      </section>

      <section>
        <h2 className="text-sm font-semibold mb-3" style={{ color: "var(--text-muted)" }}>
          관리 영역
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          <HubCard
            href="/admin/questions"
            label="문제 관리"
            desc="문제 은행 둘러보기, 회차/과목/카테고리 필터, KVLE-ID 검색."
            icon={FileText}
          />
          <HubCard
            href="/admin/image-questions"
            label="이미지 큐"
            desc={
              counts.imageQueuePending == null
                ? "분류 대기 카운트 로드 실패"
                : `미분류 ${counts.imageQueuePending.toLocaleString("ko-KR")}건`
            }
            icon={ImageIcon}
          />
          <HubCard
            href="/admin/users"
            label="회원 관리"
            desc="역할/활성 상태 변경, 뱃지 부여."
            icon={Users}
          />
          <HubCard
            href="/admin/signup-applications"
            label="가입 신청 검토"
            desc={
              counts.signupPending == null
                ? "검토 대기 카운트 로드 실패"
                : `검토 대기 ${counts.signupPending.toLocaleString("ko-KR")}건`
            }
            icon={ShieldCheck}
          />
          <HubCard
            href="/admin/ip-bans"
            label="IP 차단"
            desc="가입/로그인 진입 차단 — 도배·다중 계정 봉합 용도."
            icon={Ban}
          />
          <HubCard
            href="/admin/exams"
            label="시험 회차"
            desc="회차별 문제 수/활성 비율/카테고리 집계."
            icon={GraduationCap}
          />
          <HubCard
            href="/admin/reports"
            label="신고"
            desc="댓글 신고 큐. 24시간 임시조치 결정."
            icon={Flag}
          />
          <HubCard
            href="/admin/corrections"
            label="정정"
            desc="문제 정정 제안 처리."
            icon={GitPullRequest}
          />
          <HubCard
            href="/admin/suggestions"
            label="건의 관리"
            desc="사용자 건의 검토 — 채택/반려, 운영자 코멘트, 신고 처리."
            icon={MessageSquareDot}
          />
          <HubCard href="/admin/audit" label="감사 로그" desc="모든 운영 작업 기록." icon={History} />
          <HubCard
            href="/admin/ops"
            label="운영 점검"
            desc="필수 환경변수, Sentry, cron 보호 설정을 배포 후 확인."
            icon={Activity}
          />
        </div>
      </section>
    </div>
  );
}
