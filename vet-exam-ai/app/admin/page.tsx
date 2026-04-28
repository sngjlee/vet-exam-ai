import Link from "next/link";
import { FileText, Layers, Hash, CheckCircle2, Users, GraduationCap, Flag, History } from "lucide-react";
import { createClient } from "../../lib/supabase/server";

export const dynamic = "force-dynamic";

type CountResult = number | null;

async function loadCounts(): Promise<{
  total: CountResult;
  active: CountResult;
  rounds: CountResult;
  categories: CountResult;
}> {
  const supabase = await createClient();

  const [total, active, rounds, categories] = await Promise.all([
    supabase.from("questions").select("*", { count: "exact", head: true }),
    supabase.from("questions").select("*", { count: "exact", head: true }).eq("is_active", true),
    supabase.rpc("count_questions_distinct", { col: "round" }),
    supabase.rpc("count_questions_distinct", { col: "category" }),
  ]);

  return {
    total: total.error ? null : total.count ?? 0,
    active: active.error ? null : active.count ?? 0,
    rounds: rounds.error ? null : (rounds.data as number | null) ?? 0,
    categories: categories.error ? null : (categories.data as number | null) ?? 0,
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
          <HubCard href="#" label="회원 관리" desc="역할/활성 상태 변경, 뱃지 부여." icon={Users} disabled />
          <HubCard href="#" label="시험 회차" desc="회차별 문제 수/공개 상태 집계." icon={GraduationCap} disabled />
          <HubCard href="#" label="신고/정정" desc="댓글 신고 큐, 문제 정정 제안 처리." icon={Flag} disabled />
          <HubCard href="#" label="감사 로그" desc="모든 운영 작업 기록." icon={History} disabled />
        </div>
      </section>
    </div>
  );
}
