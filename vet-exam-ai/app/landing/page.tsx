// app/landing/page.tsx
import Link from "next/link";
import {
  BookOpen, BarChart3, RotateCcw, Target,
  CheckCircle2, ArrowRight, Zap, TrendingUp, Clock
} from "lucide-react";

// ── 데이터 ────────────────────────────────────────────────────────────

const features = [
  {
    icon: RotateCcw,
    teal: true,
    title: "스마트 반복 학습",
    desc: "틀린 문제는 자동으로 오답 노트에 저장됩니다. 간격 반복 알고리즘이 기억이 흐려지는 타이밍에 복습 큐를 올려줍니다.",
  },
  {
    icon: BarChart3,
    teal: false,
    title: "과목별 약점 분석",
    desc: "시도 횟수, 정답률, 오답 패턴을 과목별로 집계합니다. 어느 단원에 시간을 써야 할지 숫자로 확인합니다.",
  },
  {
    icon: Target,
    teal: false,
    title: "약점 집중 연습",
    desc: "정답률이 가장 낮은 과목 문제를 우선 출제합니다. 고루 공부하는 대신 취약점부터 보완하는 방식입니다.",
  },
  {
    icon: BookOpen,
    teal: false,
    title: "오답 노트",
    desc: "틀린 문제와 해설이 자동 저장됩니다. 과목 필터로 원하는 단원만 골라 복습하고, 오답 재풀이로 완전히 이해했는지 확인합니다.",
  },
];

const steps = [
  {
    num: "01",
    icon: BookOpen,
    title: "문제 풀기",
    desc: "과목을 선택하고 세션을 시작합니다. 틀린 문제는 자동으로 오답 노트에 저장됩니다.",
    highlight: true,
  },
  {
    num: "02",
    icon: TrendingUp,
    title: "데이터 확인",
    desc: "과목별 정답률과 약점이 실시간 집계됩니다. 어디를 더 공부해야 할지 숫자로 보입니다.",
    highlight: false,
  },
  {
    num: "03",
    icon: Clock,
    title: "복습 완료",
    desc: "간격 반복 알고리즘이 최적 타이밍에 복습 문제를 올려줍니다. 잊기 전에 다시 풀고 장기 기억으로 굳힙니다.",
    highlight: false,
  },
];

// ── 컴포넌트 ──────────────────────────────────────────────────────────

export default function LandingPage() {
  return (
    <main
      className="min-h-screen"
      style={{
        background: "radial-gradient(ellipse at 50% 0%, #0B1828 0%, #080D1A 55%)",
        color: "var(--text)",
        fontFamily: "var(--font-sans)",
      }}
    >

      {/* ━━━━ HERO ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <section className="mx-auto max-w-5xl px-6 pt-24 pb-20 text-center">

        {/* 소속 뱃지 */}
        <div
          className="inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-semibold mb-8"
          style={{
            background: "var(--gold-dim)",
            border: "1px solid var(--gold-border)",
            color: "var(--gold)",
          }}
        >
          <Zap size={12} />
          수의미래연구소 공식 학습 플랫폼
        </div>

        {/* 메인 헤드라인 */}
        <h1
          className="mb-6 text-5xl md:text-6xl lg:text-7xl font-bold tracking-tight leading-[1.1]"
          style={{ fontFamily: "var(--font-serif)", color: "var(--text)" }}
        >
          데이터로 설계하는
          <br />
          <span style={{ color: "var(--gold)" }}>확실한 합격</span>
        </h1>

        {/* 서브카피 */}
        <p
          className="mb-10 text-lg md:text-xl max-w-2xl mx-auto leading-relaxed"
          style={{ color: "var(--text-muted)" }}
        >
          Vexa는 수의사 국가시험 수험생이 시간을 낭비하지 않도록
          틀린 문제와 취약 과목을 데이터로 추적합니다.
          공부 방향을 숫자로 확인하고, 합격에 집중하세요.
        </p>

        {/* CTA 버튼 */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link
            href="/auth/login"
            className="inline-flex items-center justify-center gap-2 rounded-lg px-8 py-3 text-base font-semibold transition-opacity hover:opacity-90"
            style={{
              background: "var(--gold)",
              color: "#fff",
            }}
          >
            무료로 시작하기
            <ArrowRight size={18} />
          </Link>
          <Link
            href="/auth/login?mode=signin"
            className="kvle-btn-ghost px-8 py-3 text-base"
          >
            로그인
          </Link>
        </div>

        {/* 신뢰 지표 */}
        <div className="mt-14 flex flex-col sm:flex-row items-center justify-center gap-10">
          {[
            { value: "5개 과목", label: "수의사 국가시험 전 과목" },
            { value: "SRS", label: "간격 반복 알고리즘" },
            { value: "실시간", label: "약점 데이터 분석" },
          ].map((s) => (
            <div key={s.label} className="text-center">
              <div
                className="text-2xl font-black kvle-mono mb-1"
                style={{ color: "var(--text)" }}
              >
                {s.value}
              </div>
              <div className="text-xs" style={{ color: "var(--text-faint)" }}>{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ━━━━ PLATFORM PREVIEW ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <section className="mx-auto max-w-5xl px-6 pb-16">
        <div
          className="rounded-2xl overflow-hidden"
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            boxShadow: "0 32px 64px rgba(0,0,0,0.45)",
          }}
        >
          {/* 브라우저 크롬 */}
          <div
            className="flex items-center gap-2 px-5 py-3"
            style={{ borderBottom: "1px solid var(--border)", background: "var(--surface-raised)" }}
          >
            <span className="w-2.5 h-2.5 rounded-full bg-[#C04A3A]" />
            <span className="w-2.5 h-2.5 rounded-full bg-[#C8895A]" />
            <span className="w-2.5 h-2.5 rounded-full bg-[#2D9F6B]" />
            <span
              className="ml-4 text-xs kvle-mono px-3 py-1 rounded"
              style={{ background: "var(--bg)", color: "var(--text-faint)" }}
            >
              app.vexa.study
            </span>
          </div>

          {/* 대시보드 콘텐츠 */}
          <div className="p-6 space-y-4">
            {/* stat 카드 4개 */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: "총 시도", value: "312" },
                { label: "정답률", value: "74%" },
                { label: "복습 대기", value: "6" },
                { label: "최약 과목", value: "약리학" },
              ].map((item) => (
                <div
                  key={item.label}
                  className="rounded-xl p-4"
                  style={{
                    background: "var(--surface-raised)",
                    border: "1px solid var(--border)",
                  }}
                >
                  <span
                    className="block text-[0.6rem] font-bold tracking-widest mb-2"
                    style={{ color: "var(--text-faint)" }}
                  >
                    {item.label}
                  </span>
                  <p
                    className="text-xl font-bold kvle-mono"
                    style={{ color: "var(--text)" }}
                  >
                    {item.value}
                  </p>
                </div>
              ))}
            </div>

            {/* 문제 카드 미리보기 */}
            <div
              className="rounded-xl p-5"
              style={{
                background: "var(--bg)",
                border: "1px solid var(--border)",
                borderLeft: "4px solid var(--gold)",
              }}
            >
              <span
                className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold mb-3"
                style={{
                  background: "var(--surface-raised)",
                  border: "1px solid var(--border)",
                  color: "var(--text-muted)",
                }}
              >
                약리학
              </span>
              <p
                className="font-semibold mb-4 text-sm md:text-base"
                style={{ color: "var(--text)" }}
              >
                다음 중 β₂ 수용체 작용제로 기관지 확장에 사용되는 약물은?
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {[
                  { text: "A. 아트로핀", correct: false },
                  { text: "B. 살부타몰", correct: true },
                  { text: "C. 프로프라놀롤", correct: false },
                  { text: "D. 디곡신", correct: false },
                ].map((c) => (
                  <div
                    key={c.text}
                    className="rounded-lg px-4 py-2.5 text-sm flex items-center gap-2"
                    style={
                      c.correct
                        ? {
                            background: "var(--correct-dim)",
                            border: "1px solid rgba(45,159,107,0.4)",
                            color: "var(--text)",
                          }
                        : {
                            background: "var(--surface-raised)",
                            border: "1px solid var(--border)",
                            color: "var(--text-muted)",
                            opacity: 0.45,
                          }
                    }
                  >
                    {c.correct && (
                      <CheckCircle2
                        size={13}
                        style={{ color: "var(--correct)", flexShrink: 0 }}
                      />
                    )}
                    {c.text}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ━━━━ VALUE PROP ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <section className="mx-auto max-w-5xl px-6 py-24">
        <div className="text-center mb-14">
          <span className="kvle-label mb-3 inline-block">왜 Vexa인가</span>
          <h2
            className="text-3xl md:text-4xl font-bold"
            style={{ fontFamily: "var(--font-serif)", color: "var(--text)" }}
          >
            막연하게 공부하지 마세요.
            <br />
            <span style={{ color: "var(--gold)" }}>지금 내 취약점을 먼저</span>
          </h2>
          <p
            className="mt-4 text-base max-w-xl mx-auto"
            style={{ color: "var(--text-muted)" }}
          >
            교재를 처음부터 끝까지 읽는 방식이 아닙니다.
            실제 시험에서 틀릴 가능성이 높은 부분부터 집중합니다.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {features.map(({ icon: Icon, teal, title, desc }) => (
            <div
              key={title}
              className="rounded-xl p-6"
              style={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
              }}
            >
              <div
                className="flex h-10 w-10 items-center justify-center rounded-lg mb-4"
                style={
                  teal
                    ? { background: "var(--gold-dim)", color: "var(--gold)" }
                    : { background: "var(--surface-raised)", color: "var(--text-faint)" }
                }
              >
                <Icon size={20} />
              </div>
              <h3
                className="text-base font-bold mb-2"
                style={{ color: "var(--text)" }}
              >
                {title}
              </h3>
              <p
                className="text-sm leading-relaxed"
                style={{ color: "var(--text-muted)" }}
              >
                {desc}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ━━━━ HOW IT WORKS ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <section
        className="py-24"
        style={{
          background: "var(--surface)",
          borderTop: "1px solid var(--border)",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <div className="mx-auto max-w-5xl px-6">
          <div className="text-center mb-14">
            <span className="kvle-label mb-3 inline-block">사용 흐름</span>
            <h2
              className="text-3xl md:text-4xl font-bold"
              style={{ fontFamily: "var(--font-serif)", color: "var(--text)" }}
            >
              3단계면 됩니다
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
            {steps.map(({ num, icon: Icon, title, desc, highlight }) => (
              <div key={num}>
                <div
                  className="text-5xl font-black kvle-mono mb-4 select-none leading-none"
                  style={{
                    color: highlight
                      ? "var(--gold-dim)"
                      : "rgba(255,255,255,0.04)",
                  }}
                >
                  {num}
                </div>
                <div
                  className="flex h-9 w-9 items-center justify-center rounded-lg mb-3"
                  style={
                    highlight
                      ? { background: "var(--gold-dim)", color: "var(--gold)" }
                      : { background: "var(--surface-raised)", color: "var(--text-faint)" }
                  }
                >
                  <Icon size={18} />
                </div>
                <h3
                  className="text-base font-bold mb-2"
                  style={{ color: "var(--text)" }}
                >
                  {title}
                </h3>
                <p
                  className="text-sm leading-relaxed"
                  style={{ color: "var(--text-muted)" }}
                >
                  {desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ━━━━ FINAL CTA ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <section className="mx-auto max-w-5xl px-6 py-24 text-center">
        <h2
          className="text-4xl md:text-5xl font-bold mb-4"
          style={{ fontFamily: "var(--font-serif)", color: "var(--text)" }}
        >
          지금 바로 시작하세요
        </h2>
        <p className="mb-8 text-base" style={{ color: "var(--text-muted)" }}>
          회원가입은 무료입니다.
        </p>
        <Link
          href="/auth/login"
          className="inline-flex items-center justify-center gap-2 rounded-lg px-10 py-4 text-base font-semibold transition-opacity hover:opacity-90"
          style={{
            background: "var(--gold)",
            color: "#fff",
          }}
        >
          무료로 시작하기
          <ArrowRight size={18} />
        </Link>
      </section>

      {/* ━━━━ FOOTER ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <footer
        className="py-10"
        style={{ borderTop: "1px solid var(--border)" }}
      >
        <div className="mx-auto max-w-5xl px-6 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex flex-col items-center md:items-start">
            <span
              className="font-bold text-lg"
              style={{ fontFamily: "var(--font-serif)", color: "var(--gold)" }}
            >
              Vexa
            </span>
            <span
              className="text-xs kvle-mono mt-0.5"
              style={{ color: "var(--text-faint)" }}
            >
              수의미래연구소
            </span>
          </div>
          <p className="text-xs text-center" style={{ color: "var(--text-faint)" }}>
            © 2026 수의미래연구소. 수록된 문제 및 해설의 저작권은 수의미래연구소에 있습니다.
          </p>
          <div className="flex gap-5 text-sm">
            <Link href="/auth/login" style={{ color: "var(--text-muted)" }}>
              로그인
            </Link>
            <Link href="/auth/login" style={{ color: "var(--text-muted)" }}>
              회원가입
            </Link>
          </div>
        </div>
      </footer>

    </main>
  );
}
