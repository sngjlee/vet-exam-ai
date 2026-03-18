// app/landing/page.tsx
import Link from "next/link";
import {
  BookOpen, BarChart3, RotateCcw, Target,
  CheckCircle2, ArrowRight, Zap, TrendingUp, Clock,
} from "lucide-react";

// ── 데이터 ────────────────────────────────────────────────────────────

const features = [
  {
    icon: RotateCcw,
    label: "SRS",
    title: "스마트 반복 학습",
    desc: "틀린 문제는 자동으로 오답 노트에 저장됩니다. 간격 반복 알고리즘이 기억이 흐려지는 타이밍에 복습 큐를 올려줍니다.",
    highlight: true,
  },
  {
    icon: BarChart3,
    label: "분석",
    title: "과목별 약점 분석",
    desc: "시도 횟수, 정답률, 오답 패턴을 과목별로 집계합니다. 어느 단원에 시간을 써야 할지 숫자로 확인합니다.",
    highlight: false,
  },
  {
    icon: Target,
    label: "연습",
    title: "약점 집중 연습",
    desc: "정답률이 가장 낮은 과목 문제를 우선 출제합니다. 고루 공부하는 대신 취약점부터 보완하는 방식입니다.",
    highlight: false,
  },
  {
    icon: BookOpen,
    label: "오답",
    title: "오답 노트",
    desc: "틀린 문제와 해설이 자동 저장됩니다. 과목 필터로 원하는 단원만 골라 복습하고, 오답 재풀이로 완전히 이해했는지 확인합니다.",
    highlight: false,
  },
];

const steps = [
  {
    num: "01",
    icon: BookOpen,
    title: "문제 풀기",
    desc: "과목을 선택하고 세션을 시작합니다. 틀린 문제는 자동으로 오답 노트에 저장됩니다.",
    active: true,
  },
  {
    num: "02",
    icon: TrendingUp,
    title: "데이터 확인",
    desc: "과목별 정답률과 약점이 실시간 집계됩니다. 어디를 더 공부해야 할지 숫자로 보입니다.",
    active: false,
  },
  {
    num: "03",
    icon: Clock,
    title: "복습 완료",
    desc: "간격 반복 알고리즘이 최적 타이밍에 복습 문제를 올려줍니다. 잊기 전에 다시 풀고 장기 기억으로 굳힙니다.",
    active: false,
  },
];

// ── 컴포넌트 ──────────────────────────────────────────────────────────

export default function LandingPage() {
  return (
    <main
      style={{
        background: "#080D1A",
        color: "var(--text)",
        fontFamily: "var(--font-sans)",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* ━━━━ 배경 gradient orbs — pointer-events-none, GPU-safe ━━━━━━━ */}
      <div
        aria-hidden="true"
        style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}
      >
        {/* 우상단 틸 orb */}
        <div
          style={{
            position: "absolute",
            width: "900px",
            height: "900px",
            top: "-320px",
            right: "-180px",
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(30,167,187,0.045) 0%, transparent 65%)",
          }}
        />
        {/* 중하단 슬레이트 orb */}
        <div
          style={{
            position: "absolute",
            width: "700px",
            height: "700px",
            top: "55%",
            left: "-180px",
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(74,127,168,0.03) 0%, transparent 65%)",
          }}
        />
        {/* CTA 섹션 저하단 orb */}
        <div
          style={{
            position: "absolute",
            width: "600px",
            height: "600px",
            bottom: "-200px",
            right: "10%",
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(30,167,187,0.03) 0%, transparent 65%)",
          }}
        />
      </div>

      {/* ━━━━ HERO ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <section
        className="mx-auto max-w-7xl px-6 grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center min-h-[100dvh] py-24 lg:py-0"
        style={{ position: "relative" }}
      >
        {/* LEFT: 카피 */}
        <div className="flex flex-col items-start">

          {/* Eyebrow badge */}
          <div
            className="fade-in inline-flex items-center gap-2 mb-8"
            style={{
              background: "var(--gold-dim)",
              border: "1px solid var(--gold-border)",
              color: "var(--gold)",
              borderRadius: "9999px",
              padding: "6px 14px 6px 10px",
              fontSize: "0.65rem",
              fontWeight: 700,
              letterSpacing: "0.14em",
              animationDelay: "0ms",
            }}
          >
            <Zap size={10} />
            수의미래연구소 공식 학습 플랫폼
          </div>

          {/* 헤드라인 */}
          <h1
            className="fade-in text-5xl lg:text-6xl font-bold tracking-tighter leading-[1.05] mb-6"
            style={{
              fontFamily: "var(--font-serif)",
              color: "var(--text)",
              animationDelay: "80ms",
            }}
          >
            데이터로 설계하는
            <br />
            <span style={{ color: "var(--gold)" }}>확실한 합격</span>
          </h1>

          {/* 서브카피 */}
          <p
            className="fade-in text-base lg:text-lg leading-relaxed mb-10"
            style={{
              color: "var(--text-muted)",
              maxWidth: "38ch",
              animationDelay: "160ms",
            }}
          >
            틀린 문제와 취약 과목을 데이터로 추적합니다.
            공부 방향을 숫자로 확인하고 합격에 집중하세요.
          </p>

          {/* CTA 버튼 — Button-in-Button + pill */}
          <div
            className="fade-in flex flex-col sm:flex-row items-start sm:items-center gap-3"
            style={{ animationDelay: "240ms" }}
          >
            {/* Primary — Button-in-Button */}
            <Link
              href="/auth/login?mode=signup"
              className="inline-flex items-center gap-3 font-semibold active:scale-[0.98]"
              style={{
                background: "var(--gold)",
                color: "#fff",
                borderRadius: "9999px",
                padding: "10px 10px 10px 22px",
                fontSize: "0.9rem",
                transition: "opacity 300ms cubic-bezier(0.32,0.72,0,1), transform 200ms cubic-bezier(0.32,0.72,0,1)",
              }}
            >
              무료로 시작하기
              <span
                style={{
                  width: "32px",
                  height: "32px",
                  borderRadius: "50%",
                  background: "rgba(0,0,0,0.18)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <ArrowRight size={14} />
              </span>
            </Link>

            {/* Ghost — pill */}
            <Link
              href="/auth/login?mode=signin"
              className="inline-flex items-center gap-2 font-medium active:scale-[0.98] hover:text-[var(--text)] hover:border-[var(--gold-border)]"
              style={{
                color: "var(--text-muted)",
                border: "1px solid var(--border)",
                borderRadius: "9999px",
                padding: "10px 22px",
                fontSize: "0.9rem",
                transition: "color 300ms cubic-bezier(0.32,0.72,0,1), border-color 300ms cubic-bezier(0.32,0.72,0,1), transform 200ms cubic-bezier(0.32,0.72,0,1)",
              }}
            >
              로그인
            </Link>
          </div>
        </div>

        {/* RIGHT: 앱 프리뷰 — Double-Bezel */}
        <div
          className="fade-in w-full"
          style={{ animationDelay: "300ms" }}
        >
          {/* Outer Shell */}
          <div
            style={{
              padding: "6px",
              borderRadius: "22px",
              background: "rgba(255,255,255,0.02)",
              border: "1px solid rgba(255,255,255,0.07)",
            }}
          >
            {/* Inner Core */}
            <div
              style={{
                borderRadius: "16px",
                overflow: "hidden",
                background: "var(--surface)",
                boxShadow: "inset 0 1px 0 rgba(255,255,255,0.06), 0 32px 64px rgba(0,0,0,0.5)",
              }}
            >
              {/* 브라우저 크롬 */}
              <div
                className="flex items-center gap-2 px-4 py-3"
                style={{
                  borderBottom: "1px solid var(--border)",
                  background: "var(--surface-raised)",
                }}
              >
                <span className="w-2.5 h-2.5 rounded-full bg-[#C04A3A]" />
                <span className="w-2.5 h-2.5 rounded-full bg-[#C8895A]" />
                <span className="w-2.5 h-2.5 rounded-full bg-[#2D9F6B]" />
                <span
                  className="ml-3 text-xs kvle-mono px-3 py-1 rounded"
                  style={{ background: "var(--bg)", color: "var(--text-faint)" }}
                >
                  app.vexa.study
                </span>
              </div>

              {/* 대시보드 */}
              <div className="p-5 space-y-3">
                {/* 스탯 카드 */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[
                    { label: "총 시도", value: "312", accent: false },
                    { label: "정답률", value: "74.3%", accent: true },
                    { label: "복습 대기", value: "6", accent: false },
                    { label: "최약 과목", value: "약리학", accent: false },
                  ].map((item) => (
                    <div
                      key={item.label}
                      className="rounded-lg p-3"
                      style={{
                        background: "var(--surface-raised)",
                        border: "1px solid var(--border)",
                        borderTop: item.accent
                          ? "2px solid var(--gold)"
                          : "1px solid var(--border)",
                      }}
                    >
                      <span
                        className="block text-[0.6rem] tracking-widest mb-1.5"
                        style={{ color: "var(--text-faint)" }}
                      >
                        {item.label}
                      </span>
                      <p
                        className="text-base font-bold kvle-mono"
                        style={{ color: item.accent ? "var(--gold)" : "var(--text)" }}
                      >
                        {item.value}
                      </p>
                    </div>
                  ))}
                </div>

                {/* 문제 카드 미리보기 */}
                <div
                  className="rounded-xl p-4"
                  style={{
                    background: "var(--bg)",
                    border: "1px solid var(--border)",
                    borderLeft: "3px solid var(--gold)",
                  }}
                >
                  <span
                    className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold mb-3"
                    style={{
                      background: "var(--surface-raised)",
                      border: "1px solid var(--border)",
                      color: "var(--text-muted)",
                    }}
                  >
                    약리학
                  </span>
                  <p
                    className="text-sm font-semibold mb-3 leading-snug"
                    style={{ color: "var(--text)" }}
                  >
                    다음 중 β₂ 수용체 작용제로 기관지 확장에 사용되는 약물은?
                  </p>
                  <div className="grid grid-cols-2 gap-1.5">
                    {[
                      { text: "A. 아트로핀", correct: false },
                      { text: "B. 살부타몰", correct: true },
                      { text: "C. 프로프라놀롤", correct: false },
                      { text: "D. 디곡신", correct: false },
                    ].map((c) => (
                      <div
                        key={c.text}
                        className="rounded-md px-3 py-1.5 text-xs flex items-center gap-1.5"
                        style={
                          c.correct
                            ? {
                                background: "var(--correct-dim)",
                                border: "1px solid rgba(45,159,107,0.35)",
                                color: "var(--text)",
                              }
                            : {
                                background: "var(--surface-raised)",
                                border: "1px solid var(--border)",
                                color: "var(--text-muted)",
                                opacity: 0.5,
                              }
                        }
                      >
                        {c.correct && (
                          <CheckCircle2 size={11} style={{ color: "var(--correct)", flexShrink: 0 }} />
                        )}
                        {c.text}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ━━━━ TRUST BAR ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <div
        className="scroll-reveal"
        style={{
          borderTop: "1px solid var(--border)",
          borderBottom: "1px solid var(--border)",
          position: "relative",
        }}
      >
        <div className="mx-auto max-w-7xl px-6 py-5 flex items-stretch justify-center flex-wrap gap-0">
          {[
            { value: "5개 과목", label: "수의사 국가시험 전 과목 커버" },
            { value: "SRS", label: "간격 반복 알고리즘 내장" },
            { value: "실시간", label: "약점 데이터 집계 및 분석" },
          ].map((s, i) => (
            <div
              key={s.label}
              className="flex flex-col items-center justify-center px-6 md:px-12 py-3"
              style={i > 0 ? { borderLeft: "1px solid var(--border)" } : undefined}
            >
              <div
                className="text-xl font-black kvle-mono mb-0.5"
                style={{ color: "var(--text)" }}
              >
                {s.value}
              </div>
              <div className="text-xs text-center" style={{ color: "var(--text-faint)" }}>
                {s.label}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ━━━━ FEATURES ZIG-ZAG ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <section className="scroll-reveal mx-auto max-w-7xl px-6 py-28" style={{ position: "relative" }}>
        <div className="mb-16">
          <span className="kvle-label mb-3 inline-block">왜 Vexa인가</span>
          <h2
            className="text-3xl lg:text-4xl font-bold tracking-tight"
            style={{ fontFamily: "var(--font-serif)", color: "var(--text)" }}
          >
            막연하게 공부하지 마세요.
            <br />
            <span style={{ color: "var(--gold)" }}>지금 내 취약점을 먼저</span>
          </h2>
        </div>

        <div style={{ borderTop: "1px solid var(--border)" }}>
          {features.map(({ icon: Icon, label, title, desc, highlight }, i) => (
            <div
              key={title}
              className="grid grid-cols-1 md:grid-cols-2 gap-8 lg:gap-24 py-14"
              style={{ borderBottom: "1px solid var(--border)" }}
            >
              {/* 아이콘 + 제목 — 짝수/홀수 교번 */}
              <div className={`flex flex-col justify-center ${i % 2 === 1 ? "md:order-last" : ""}`}>
                {/* Icon Double-Bezel */}
                <div
                  className="mb-5"
                  style={{
                    display: "inline-flex",
                    padding: "4px",
                    borderRadius: "14px",
                    background: highlight ? "rgba(30,167,187,0.06)" : "rgba(255,255,255,0.02)",
                    border: `1px solid ${highlight ? "rgba(30,167,187,0.16)" : "rgba(255,255,255,0.05)"}`,
                    alignSelf: "flex-start",
                  }}
                >
                  <div
                    style={{
                      width: "40px",
                      height: "40px",
                      borderRadius: "10px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      background: highlight ? "var(--gold-dim)" : "var(--surface-raised)",
                      color: highlight ? "var(--gold)" : "var(--text-muted)",
                      boxShadow: "inset 0 1px 0 rgba(255,255,255,0.07)",
                    }}
                  >
                    <Icon size={18} />
                  </div>
                </div>

                <span
                  className="text-xs font-bold tracking-widest mb-2"
                  style={{ color: highlight ? "var(--gold)" : "var(--text-faint)" }}
                >
                  {label}
                </span>
                <h3
                  className="text-xl font-bold tracking-tight"
                  style={{ color: "var(--text)" }}
                >
                  {title}
                </h3>
              </div>

              {/* 설명 */}
              <div className="flex items-center">
                <p
                  className="text-base leading-relaxed"
                  style={{ color: "var(--text-muted)", maxWidth: "46ch" }}
                >
                  {desc}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ━━━━ HOW IT WORKS ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <section
        className="scroll-reveal py-28"
        style={{
          background: "var(--surface)",
          borderTop: "1px solid var(--border)",
          borderBottom: "1px solid var(--border)",
          position: "relative",
        }}
      >
        <div className="mx-auto max-w-7xl px-6">
          <div className="mb-14">
            <span className="kvle-label mb-3 inline-block">사용 흐름</span>
            <h2
              className="text-3xl lg:text-4xl font-bold tracking-tight"
              style={{ fontFamily: "var(--font-serif)", color: "var(--text)" }}
            >
              3단계면 됩니다
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3">
            {steps.map(({ num, icon: Icon, title, desc, active }, i) => (
              <div
                key={num}
                className={[
                  "py-10 md:py-0",
                  i > 0 ? "border-t md:border-t-0 md:border-l md:pl-12" : "md:pr-12",
                  i === 1 ? "md:px-12" : "",
                ].join(" ")}
                style={{ borderColor: "var(--border)" }}
              >
                <div
                  className="text-7xl font-black kvle-mono leading-none mb-6 select-none"
                  style={{
                    color: active
                      ? "rgba(30,167,187,0.13)"
                      : "rgba(255,255,255,0.03)",
                  }}
                >
                  {num}
                </div>
                {/* Step icon — Double-Bezel */}
                <div
                  className="mb-4"
                  style={{
                    display: "inline-flex",
                    padding: "3px",
                    borderRadius: "12px",
                    background: active ? "rgba(30,167,187,0.06)" : "rgba(255,255,255,0.02)",
                    border: `1px solid ${active ? "rgba(30,167,187,0.16)" : "rgba(255,255,255,0.05)"}`,
                  }}
                >
                  <div
                    style={{
                      width: "34px",
                      height: "34px",
                      borderRadius: "8px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      background: active ? "var(--gold-dim)" : "var(--surface-raised)",
                      color: active ? "var(--gold)" : "var(--text-faint)",
                      boxShadow: "inset 0 1px 0 rgba(255,255,255,0.06)",
                    }}
                  >
                    <Icon size={16} />
                  </div>
                </div>
                <h3
                  className="text-base font-bold mb-3 tracking-tight"
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
      <section className="scroll-reveal mx-auto max-w-7xl px-6 py-28" style={{ position: "relative" }}>
        {/* Double-Bezel CTA container */}
        <div
          style={{
            padding: "8px",
            borderRadius: "28px",
            background: "rgba(30,167,187,0.025)",
            border: "1px solid rgba(30,167,187,0.09)",
          }}
        >
          <div
            className="px-6 py-14 sm:px-12 sm:py-20 lg:px-16 lg:py-24"
            style={{
              borderRadius: "20px",
              textAlign: "center",
              background: "var(--surface)",
              boxShadow: "inset 0 1px 0 rgba(255,255,255,0.05)",
              position: "relative",
              overflow: "hidden",
            }}
          >
            {/* 내부 배경 bloom */}
            <div
              aria-hidden="true"
              style={{
                position: "absolute",
                inset: 0,
                pointerEvents: "none",
                background:
                  "radial-gradient(ellipse 70% 60% at 50% 110%, rgba(30,167,187,0.07) 0%, transparent 70%)",
              }}
            />
            <div style={{ position: "relative" }}>
              <h2
                className="text-4xl lg:text-5xl font-bold tracking-tight mb-4"
                style={{ fontFamily: "var(--font-serif)", color: "var(--text)" }}
              >
                지금 바로 시작하세요
              </h2>
              <p className="mb-10 text-base" style={{ color: "var(--text-muted)" }}>
                회원가입은 무료입니다. 카드 정보가 필요 없습니다.
              </p>
              {/* Button-in-Button */}
              <Link
                href="/auth/login?mode=signup"
                className="inline-flex items-center gap-3 font-semibold active:scale-[0.98]"
                style={{
                  background: "var(--gold)",
                  color: "#fff",
                  borderRadius: "9999px",
                  padding: "12px 12px 12px 26px",
                  fontSize: "0.95rem",
                  transition: "opacity 300ms cubic-bezier(0.32,0.72,0,1), transform 200ms cubic-bezier(0.32,0.72,0,1)",
                }}
              >
                무료로 시작하기
                <span
                  style={{
                    width: "34px",
                    height: "34px",
                    borderRadius: "50%",
                    background: "rgba(0,0,0,0.18)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <ArrowRight size={15} />
                </span>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ━━━━ FOOTER ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <footer
        className="py-10"
        style={{ borderTop: "1px solid var(--border)" }}
      >
        <div className="mx-auto max-w-7xl px-6 flex flex-col md:flex-row items-center justify-between gap-4">
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
            <Link
              href="/auth/login"
              style={{
                color: "var(--text-muted)",
                transition: "color 300ms cubic-bezier(0.32,0.72,0,1)",
              }}
            >
              로그인
            </Link>
            <Link
              href="/auth/login?mode=signup"
              style={{
                color: "var(--text-muted)",
                transition: "color 300ms cubic-bezier(0.32,0.72,0,1)",
              }}
            >
              회원가입
            </Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
