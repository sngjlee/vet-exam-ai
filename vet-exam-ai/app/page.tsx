import Link from "next/link";
import Image from "next/image";
import AuthRedirect from "../components/AuthRedirect";
import LandingFinalCta from "../components/LandingFinalCta";

// ── Rail items (duplicated for seamless marquee loop) ──────────────────────
const RAIL_ITEMS = [
  { markerColor: "#1ea7bb", mono: null,     text: "수의사 국가시험 대비" },
  { markerColor: "#C8895A", mono: "20과목", text: "전과목 커버" },
  { markerColor: "#F0EDD8", mono: "1,500+", text: "검수된 문제" },
  { markerColor: "#2D9F6B", mono: null,     text: "수험생 토론 + 암기법" },
  { markerColor: "#9B6FD4", mono: "SM-2",   text: "간격 반복 학습" },
  { markerColor: "#4A7FA8", mono: null,     text: "실시간 약점 분석" },
  { markerColor: "#C04A3A", mono: null,     text: "자동 오답노트" },
];

// ── Weak-subject ranking data ──────────────────────────────────────────────
const WEAK_SUBJECTS = [
  { name: "약리학",   pct: 61.5, bar: "var(--wrong)",   color: "var(--wrong)"   },
  { name: "내과학",   pct: 76.5, bar: "var(--amber)",   color: "var(--text)"    },
  { name: "외과학",   pct: 80.7, bar: "var(--blue)",    color: "var(--text)"    },
  { name: "공중보건학",pct: 83.3, bar: "var(--blue)",   color: "var(--text)"    },
  { name: "해부학",   pct: 87.1, bar: "var(--correct)", color: "var(--correct)" },
];

// ── SRS queue rows ─────────────────────────────────────────────────────────
const SRS_ROWS = [
  { day: "D+1",  w: "28%", tag: "지연 1개", tagColor: "var(--wrong)"     },
  { day: "D+3",  w: "62%", tag: "오늘 3개", tagColor: "var(--teal)"      },
  { day: "D+7",  w: "78%", tag: "예정 2개", tagColor: "var(--text-faint)" },
  { day: "D+14", w: "92%", tag: "예정 4개", tagColor: "var(--text-faint)" },
];

// ── Arrow SVG (reused in several buttons) ─────────────────────────────────
function ArrowSVG({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h14M13 5l7 7-7 7" />
    </svg>
  );
}

export default function LandingPage() {
  return (
    <>
      <AuthRedirect />
      {/* ── Background ambient orbs ─────────────────────────────────────── */}
      <div aria-hidden="true" style={{
        position: "fixed", inset: 0, pointerEvents: "none", overflow: "hidden", zIndex: 0,
      }}>
        <div style={{ position: "absolute", width: "900px", height: "900px", top: "-320px", right: "-180px", borderRadius: "50%", background: "radial-gradient(circle, rgba(30,167,187,0.06) 0%, transparent 65%)" }} />
        <div style={{ position: "absolute", width: "700px", height: "700px", top: "55%", left: "-180px", borderRadius: "50%", background: "radial-gradient(circle, rgba(74,127,168,0.04) 0%, transparent 65%)" }} />
      </div>

      {/* ── 1. STICKY NAV ───────────────────────────────────────────────── */}
      <nav style={{
        position: "sticky", top: 0, zIndex: 50,
        background: "rgba(8,13,26,0.7)", backdropFilter: "blur(20px)",
        borderBottom: "1px solid var(--border)",
      }}>
        <div className="landing-nav-inner" style={{
          maxWidth: "1240px", margin: "0 auto", padding: "16px 32px",
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: "24px",
        }}>
          {/* Logo */}
          <a href="#" className="landing-logo-wrap" aria-label="KVLE 수의미래연구소 홈">
            <Image
              src="/logo.png"
              alt="KVLE 수의미래연구소"
              width={120}
              height={40}
              style={{ display: "block", height: "40px", width: "120px", objectFit: "contain" }}
              priority
            />
          </a>

          {/* Section links */}
          <div className="landing-section-links" style={{ display: "flex", gap: "28px", fontSize: "13px", fontWeight: 500 }}>
            <a href="#how" className="landing-nav-link">사용 흐름</a>
            <a href="#features" className="landing-nav-link">기능</a>
            <a href="#community" className="landing-nav-link">수험생 토론</a>
            <a href="#problem" className="landing-nav-link">왜 KVLE?</a>
          </div>

          {/* CTA buttons */}
          <div className="landing-nav-actions" style={{ display: "flex", gap: "10px", alignItems: "center" }}>
            <Link href="/auth/login" className="btn-ghost-pill" style={{
              display: "inline-flex", alignItems: "center",
              padding: "8px 16px", borderRadius: "999px",
              border: "1px solid var(--border)", color: "var(--text-muted)",
              fontSize: "13px", fontWeight: 600, background: "transparent",
            }}>로그인</Link>
            <Link href="/auth/login?mode=signup" className="btn-primary-pill landing-nav-primary" style={{
              display: "inline-flex", alignItems: "center", gap: "8px",
              padding: "8px 8px 8px 16px", borderRadius: "999px",
              background: "var(--teal)", color: "#061218",
              fontSize: "13px", fontWeight: 700,
              boxShadow: "0 8px 20px rgba(30,167,187,0.2), inset 0 1px 0 rgba(255,255,255,0.2)",
            }}>
              무료로 시작
              <span style={{ width: "26px", height: "26px", borderRadius: "999px", background: "rgba(0,0,0,0.18)", display: "grid", placeItems: "center" }}>
                <ArrowSVG size={11} />
              </span>
            </Link>
          </div>
        </div>
      </nav>

      <main style={{ position: "relative", zIndex: 1 }}>

        {/* ── 2. HERO ─────────────────────────────────────────────────────── */}
        <section className="landing-hero-section" style={{ maxWidth: "1240px", margin: "0 auto", padding: "80px 32px 40px", position: "relative" }}>
          <div className="hero-grid">

            {/* LEFT: copy */}
            <div>
              {/* Eyebrow pill */}
              <div style={{
                display: "inline-flex", alignItems: "center", gap: "8px",
                padding: "6px 12px 6px 10px", borderRadius: "999px",
                background: "var(--teal-dim)", border: "1px solid var(--teal-border)",
                color: "var(--teal)", fontSize: "11px", fontWeight: 700, letterSpacing: "0.14em",
                marginBottom: "28px",
              }}>
                <span className="pulse-dot" style={{ width: "6px", height: "6px", borderRadius: "999px", background: "var(--teal)", display: "block", flexShrink: 0 }} />
                수의미래연구소 공식 학습 플랫폼
              </div>

              {/* Headline */}
              <h1 className="landing-hero-title" style={{ fontSize: "clamp(40px, 6vw, 76px)", lineHeight: 1.02, letterSpacing: "-0.035em", fontWeight: 800, margin: "0 0 24px" }}>
                검수된 문제 +<br />
                <em style={{ fontStyle: "normal", color: "var(--teal)", position: "relative", whiteSpace: "nowrap" }}>수험생이 외우는 방식</em>
              </h1>

              {/* Sub-copy */}
              <p className="landing-hero-copy" style={{ fontSize: "17px", lineHeight: 1.65, color: "var(--text-muted)", maxWidth: "48ch", margin: "0 0 32px" }}>
                수의미래연구소가 직접 검수한 1,500+ 문제와 수험생들의 실제 암기법·토론을 함께 학습합니다.
                공식 해설로 부족할 때, 다른 수험생이 어떻게 외웠는지 바로 확인하세요.
              </p>

              {/* CTA row */}
              <div className="landing-hero-actions" style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                <Link href="/auth/login?mode=signup" className="btn-primary-pill" style={{
                  display: "inline-flex", alignItems: "center", gap: "10px",
                  padding: "12px 12px 12px 22px", borderRadius: "999px",
                  background: "var(--teal)", color: "#061218",
                  fontSize: "14px", fontWeight: 700,
                  boxShadow: "0 8px 20px rgba(30,167,187,0.2), inset 0 1px 0 rgba(255,255,255,0.2)",
                }}>
                  무료로 시작하기
                  <span style={{ width: "32px", height: "32px", borderRadius: "999px", background: "rgba(0,0,0,0.18)", display: "grid", placeItems: "center" }}>
                    <ArrowSVG />
                  </span>
                </Link>
                <Link href="/auth/login" className="btn-ghost-pill" style={{
                  display: "inline-flex", alignItems: "center", gap: "8px",
                  padding: "12px 22px", borderRadius: "999px",
                  border: "1px solid var(--border)", color: "var(--text-muted)",
                  fontSize: "14px", fontWeight: 600, background: "transparent",
                }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M10 8l6 4-6 4z" fill="currentColor" /></svg>
                  로그인
                </Link>
              </div>

              {/* Stats strip */}
              <div className="landing-stats-strip" style={{ marginTop: "32px", display: "inline-flex", gap: "22px", fontSize: "12px", color: "var(--text-faint)", fontFamily: "var(--font-mono)" }}>
                <span><span style={{ color: "var(--text-muted)", fontWeight: 700 }}>20</span> 과목</span>
                <span style={{ color: "var(--border)" }}>·</span>
                <span><span style={{ color: "var(--text-muted)", fontWeight: 700 }}>1,500+</span> 검수 문제</span>
                <span style={{ color: "var(--border)" }}>·</span>
                <span><span style={{ color: "var(--text-muted)", fontWeight: 700 }}>수험생</span> 토론 + 암기법</span>
              </div>
            </div>

            {/* RIGHT: viz-card */}
            <div>
            <div style={{
              background: "linear-gradient(180deg, rgba(26,37,64,0.5) 0%, rgba(15,23,41,0.6) 100%)",
              border: "1px solid var(--border)", borderRadius: "16px",
              padding: "22px", position: "relative", overflow: "hidden",
            }}>
              {/* Top shimmer line */}
              <div aria-hidden="true" style={{ position: "absolute", top: 0, left: 0, right: 0, height: "1px", background: "linear-gradient(90deg, transparent, var(--teal-border), transparent)" }} />

              {/* Card header */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "4px", gap: "12px" }}>
                <div>
                  <div style={{ fontSize: "10px", letterSpacing: "0.14em", fontWeight: 700, color: "var(--teal)" }}>망각 곡선 · 14일 추적</div>
                  <h3 style={{ fontSize: "15px", fontWeight: 700, margin: "6px 0 2px", color: "var(--text)", letterSpacing: "-0.01em" }}>잊기 직전에 다시 보여드립니다</h3>
                  <div style={{ marginTop: "10px", display: "flex", gap: "14px" }}>
                    {[
                      { bg: "var(--teal)", label: "KVLE 복습" },
                      { bg: "var(--wrong)", label: "그냥 두면", opacity: 0.6 },
                    ].map(({ bg, label, opacity }) => (
                      <span key={label} style={{ display: "inline-flex", gap: "6px", alignItems: "center", fontSize: "11px", color: "var(--text-muted)", fontWeight: 500 }}>
                        <span style={{ width: "10px", height: "10px", borderRadius: "2px", background: bg, opacity, display: "block", flexShrink: 0 }} />
                        {label}
                      </span>
                    ))}
                  </div>
                </div>
                <div style={{ textAlign: "right", fontFamily: "var(--font-mono)", flexShrink: 0 }}>
                  <div style={{ fontSize: "34px", fontWeight: 800, color: "var(--teal)", lineHeight: 1 }}>84<span style={{ fontSize: "18px" }}>%</span></div>
                  <div style={{ fontSize: "9px", color: "var(--text-faint)", letterSpacing: "0.14em", fontWeight: 600 }}>유지율</div>
                </div>
              </div>

              {/* Forgetting-curve SVG — verbatim from KVLE Landing.html */}
              <svg viewBox="0 0 560 220" width="100%" style={{ marginTop: "14px", display: "block" }}>
                <defs>
                  <linearGradient id="tealFill" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="#1ea7bb" stopOpacity="0.22" />
                    <stop offset="100%" stopColor="#1ea7bb" stopOpacity="0" />
                  </linearGradient>
                </defs>
                <g stroke="rgba(255,255,255,0.04)">
                  <line x1="50" x2="540" y1="30"  y2="30"  />
                  <line x1="50" x2="540" y1="75"  y2="75"  />
                  <line x1="50" x2="540" y1="120" y2="120" />
                  <line x1="50" x2="540" y1="165" y2="165" />
                </g>
                <g fontFamily="IBM Plex Mono, monospace" fontSize="10" fill="#4A5568">
                  <text x="42"  y="33"  textAnchor="end">100</text>
                  <text x="42"  y="78"  textAnchor="end">75</text>
                  <text x="42"  y="123" textAnchor="end">50</text>
                  <text x="42"  y="168" textAnchor="end">25</text>
                  <text x="50"  y="200" textAnchor="middle">D+0</text>
                  <text x="120" y="200" textAnchor="middle">D+1</text>
                  <text x="225" y="200" textAnchor="middle">D+3</text>
                  <text x="365" y="200" textAnchor="middle">D+7</text>
                  <text x="540" y="200" textAnchor="middle">D+14</text>
                </g>
                {/* Naked forgetting curve (dashed red) */}
                <path d="M50,30 C80,90 100,130 130,148 C180,160 250,170 540,182"
                  fill="none" stroke="#C04A3A" strokeWidth="1.5" strokeDasharray="3 4" opacity="0.55" />
                {/* KVLE SRS fill areas */}
                <path d="M50,30 C65,55 85,72 120,88 L120,165 L50,165 Z"   fill="url(#tealFill)" />
                <path d="M120,30 C160,45 195,60 225,78 L225,165 L120,165 Z" fill="url(#tealFill)" />
                <path d="M225,30 C270,40 320,50 365,65 L365,165 L225,165 Z" fill="url(#tealFill)" />
                <path d="M365,30 C410,38 470,45 540,55 L540,165 L365,165 Z" fill="url(#tealFill)" />
                {/* SRS curve lines */}
                <path d="M50,30 C65,55 85,72 120,88"  fill="none" stroke="#1ea7bb" strokeWidth="2.2" strokeLinecap="round" />
                <path d="M120,30 C160,45 195,60 225,78" fill="none" stroke="#1ea7bb" strokeWidth="2.2" strokeLinecap="round" />
                <path d="M225,30 C270,40 320,50 365,65" fill="none" stroke="#1ea7bb" strokeWidth="2.2" strokeLinecap="round" />
                <path d="M365,30 C410,38 470,45 540,55" fill="none" stroke="#1ea7bb" strokeWidth="2.2" strokeLinecap="round" />
                {/* Review markers at D+1, D+3, D+7 */}
                {([120, 225, 365] as const).map((x) => (
                  <g key={x}>
                    <line x1={x} x2={x} y1="30" y2="175" stroke="#1ea7bb" strokeWidth="1" strokeDasharray="2 3" opacity="0.4" />
                    <circle cx={x} cy="30" r="6" fill="#080D1A" stroke="#1ea7bb" strokeWidth="2" />
                    <circle cx={x} cy="30" r="2.5" fill="#1ea7bb" />
                    <text x={x} y="20" textAnchor="middle" fontSize="9" fill="#1ea7bb"
                      fontFamily="IBM Plex Mono, monospace" fontWeight="700" letterSpacing="0.1em">복습</text>
                  </g>
                ))}
              </svg>

              {/* 3-stat summary row */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", marginTop: "18px", borderTop: "1px solid var(--border)", paddingTop: "14px" }}>
                <div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: "20px", fontWeight: 800, color: "var(--text)" }}>84<span style={{ fontSize: "13px", color: "var(--text-muted)" }}>%</span></div>
                  <div style={{ fontSize: "10px", color: "var(--text-faint)", letterSpacing: "0.12em", fontWeight: 600, marginTop: "2px" }}>KVLE 14일차</div>
                </div>
                <div style={{ borderLeft: "1px solid var(--border)", paddingLeft: "16px" }}>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: "20px", fontWeight: 800, color: "var(--wrong)" }}>15<span style={{ fontSize: "13px", color: "var(--text-muted)" }}>%</span></div>
                  <div style={{ fontSize: "10px", color: "var(--text-faint)", letterSpacing: "0.12em", fontWeight: 600, marginTop: "2px" }}>복습 없이 14일차</div>
                </div>
                <div style={{ borderLeft: "1px solid var(--border)", paddingLeft: "16px" }}>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: "20px", fontWeight: 800, color: "var(--teal)" }}>5.6x</div>
                  <div style={{ fontSize: "10px", color: "var(--text-faint)", letterSpacing: "0.12em", fontWeight: 600, marginTop: "2px" }}>기억 효율</div>
                </div>
              </div>
            </div>
            </div>
          </div>
        </section>

        {/* ── 3. MARQUEE RAIL ─────────────────────────────────────────────── */}
        <div style={{
          borderTop: "1px solid var(--border)", borderBottom: "1px solid var(--border)",
          padding: "24px 0", marginTop: "60px", overflow: "hidden", position: "relative",
        }}>
          <div className="rail-track">
            {/* Items × 2 for seamless loop */}
            {[0, 1].flatMap((set) =>
              RAIL_ITEMS.map(({ markerColor, mono, text }, i) => (
                <span key={`${set}-${i}`} style={{
                  color: "var(--text-faint)", fontSize: "14px", fontWeight: 500,
                  display: "inline-flex", alignItems: "baseline", gap: "12px",
                }}>
                  <span style={{ color: markerColor, textShadow: `0 0 12px ${markerColor}66` }}>◆</span>
                  {mono && (
                    <span style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)", fontSize: "13px", fontWeight: 600 }}>{mono}</span>
                  )}
                  <span>{text}</span>
                </span>
              ))
            )}
          </div>
        </div>

        {/* ── 4. PROBLEM SECTION ──────────────────────────────────────────── */}
        <section id="problem" style={{
          background: "var(--surface)",
          borderTop: "1px solid var(--border)", borderBottom: "1px solid var(--border)",
          position: "relative",
        }}>
          <div style={{ maxWidth: "1240px", margin: "0 auto", padding: "120px 32px 80px" }}>
            <div className="landing-section-label">왜 KVLE인가</div>
            <h2 style={{ fontSize: "clamp(32px, 4vw, 48px)", fontWeight: 800, letterSpacing: "-0.025em", lineHeight: 1.1, margin: "14px 0 0", color: "var(--text)" }}>
              같은 시간 공부해도<br />
              <span style={{ color: "var(--text-muted)" }}>결과가 다른 이유가 있습니다</span>
            </h2>

            <div className="problem-grid" style={{ marginTop: "52px" }}>
              {[
                {
                  num: "문제 01",
                  head: "어느 단원이 약한지 감으로만 안다",
                  body: "\"약리학이 약한 것 같다\"와 \"약리학 정답률 61.5%, 목표까지 7문제 부족\"은 다른 정보입니다. 숫자가 없으면 공부 방향도 막연합니다.",
                },
                {
                  num: "문제 02",
                  head: "틀린 문제는 대부분 다시 안 푼다",
                  body: "오답 노트를 수기로 정리하는 순간부터 관리가 부담이 됩니다. 결국 한 번 틀린 문제는 시험장에서 또 틀립니다.",
                },
                {
                  num: "문제 03",
                  head: "혼자 외우면 한 줄에서 막힌다",
                  body: "공식 해설만으론 이해가 안 되는 문제, 다른 수험생은 어떻게 외웠는지 알 길이 없습니다. 결국 같은 문제에서 매번 막힙니다.",
                },
              ].map(({ num, head, body }) => (
                <div key={num} className="problem-cell">
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: "13px", fontWeight: 700, color: "var(--wrong)", letterSpacing: "0.12em", marginBottom: "14px" }}>{num}</div>
                  <h3 style={{ fontSize: "22px", fontWeight: 700, letterSpacing: "-0.02em", color: "var(--text)", lineHeight: 1.3, margin: "0 0 14px" }}>{head}</h3>
                  <p style={{ fontSize: "14px", lineHeight: 1.7, color: "var(--text-muted)", margin: 0 }}>{body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── 5. FEATURE DUO ──────────────────────────────────────────────── */}
        <section id="features" style={{ maxWidth: "1240px", margin: "0 auto", padding: "120px 32px", position: "relative" }}>
          <div className="landing-section-label">핵심 기능</div>
          <h2 style={{ fontSize: "clamp(32px, 4vw, 48px)", fontWeight: 800, letterSpacing: "-0.025em", lineHeight: 1.1, margin: "14px 0 0", color: "var(--text)" }}>
            시간을 낭비하지 않는 두 가지 장치
          </h2>
          <p style={{ fontSize: "16px", color: "var(--text-muted)", lineHeight: 1.75, margin: "18px 0 0", maxWidth: "58ch" }}>
            <span style={{ display: "block" }}>KVLE의 모든 기능은 결국 세 질문에 답합니다.</span>
            <strong style={{ color: "var(--text)", display: "block", marginTop: "6px" }}>
              지금 뭘 풀어야 하지? 뭘 언제 다시 봐야 하지? 막힐 때 어디서 답을 찾지?
            </strong>
          </p>

          <div className="duo-grid">
            {/* SRS card — featured, teal top border */}
            <div style={{
              background: "var(--surface)", border: "1px solid var(--border)",
              borderTop: "3px solid var(--teal)", borderRadius: "20px",
              padding: "40px", position: "relative", overflow: "hidden",
              display: "flex", flexDirection: "column", minHeight: "440px",
            }}>
              <div style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}>
                <span style={{ fontSize: "10px", fontWeight: 800, letterSpacing: "0.14em", color: "var(--teal)", padding: "4px 9px", borderRadius: "4px", background: "var(--teal-dim)", border: "1px solid var(--teal-border)" }}>SRS</span>
                <span style={{ fontSize: "10px", color: "var(--text-faint)", letterSpacing: "0.12em", fontWeight: 600 }}>SPACED REPETITION</span>
              </div>
              <h3 style={{ fontSize: "26px", fontWeight: 700, letterSpacing: "-0.02em", color: "var(--text)", margin: "14px 0 12px", lineHeight: 1.25 }}>
                기억이 흐려지기 직전에<br />복습을 올려드립니다
              </h3>
              <p style={{ color: "var(--text-muted)", fontSize: "14px", lineHeight: 1.7, margin: "0 0 24px", maxWidth: "36ch" }}>
                SM-2 기반 간격 반복 알고리즘이 문제마다 기억 곡선을 추적합니다.
                맞힌 문제는 긴 간격으로, 틀린 문제는 짧은 간격으로. 잊기 전에 만나면 노력 대비 기억이 몇 배 길어집니다.
              </p>
              {/* 4-row mini queue viz */}
              <div style={{ marginTop: "auto", background: "var(--bg)", border: "1px solid var(--border)", borderRadius: "12px", padding: "16px", display: "flex", flexDirection: "column", gap: "10px" }}>
                {SRS_ROWS.map(({ day, w, tag, tagColor }) => (
                  <div key={day} style={{ display: "grid", gridTemplateColumns: "40px 1fr 60px", alignItems: "center", gap: "12px" }}>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: "11px", fontWeight: 700, color: "var(--text-muted)" }}>{day}</span>
                    <div style={{ height: "4px", background: "var(--surface-raised)", borderRadius: "999px", overflow: "hidden" }}>
                      <span style={{ display: "block", height: "100%", width: w, background: "var(--teal)", borderRadius: "999px" }} />
                    </div>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: "10px", textAlign: "right", color: tagColor, fontWeight: 600 }}>{tag}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Weak-point targeting card */}
            <div style={{
              background: "var(--surface)", border: "1px solid var(--border)",
              borderRadius: "20px", padding: "40px", position: "relative", overflow: "hidden",
              display: "flex", flexDirection: "column", minHeight: "440px",
            }}>
              <div style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}>
                <span style={{ fontSize: "10px", fontWeight: 800, letterSpacing: "0.14em", color: "var(--wrong)", padding: "4px 9px", borderRadius: "4px", background: "var(--wrong-dim)", border: "1px solid rgba(192,74,58,0.25)" }}>TARGETING</span>
                <span style={{ fontSize: "10px", color: "var(--text-faint)", letterSpacing: "0.12em", fontWeight: 600 }}>WEAK-POINT FOCUS</span>
              </div>
              <h3 style={{ fontSize: "26px", fontWeight: 700, letterSpacing: "-0.02em", color: "var(--text)", margin: "14px 0 12px", lineHeight: 1.25 }}>
                약점부터 좁혀<br />점수를 효율적으로 올립니다
              </h3>
              <p style={{ color: "var(--text-muted)", fontSize: "14px", lineHeight: 1.7, margin: "0 0 24px", maxWidth: "36ch" }}>
                전 과목을 고르게 공부하는 건 가장 비효율적인 전략입니다.
                KVLE는 정답률이 낮은 과목을 자동으로 상위에 배치하고, 약점 집중 세션에서 우선 출제합니다.
              </p>
              {/* 5-subject ranking bars */}
              <div style={{ marginTop: "auto", background: "var(--bg)", border: "1px solid var(--border)", borderRadius: "12px", padding: "18px", display: "flex", flexDirection: "column", gap: "12px" }}>
                {WEAK_SUBJECTS.map(({ name, pct, bar, color }) => (
                  <div key={name} style={{ display: "grid", gridTemplateColumns: "90px 1fr 44px", alignItems: "center", gap: "12px" }}>
                    <span style={{ fontSize: "12.5px", fontWeight: 600, color: "var(--text)" }}>{name}</span>
                    <div style={{ height: "6px", background: "var(--surface-raised)", borderRadius: "999px", overflow: "hidden" }}>
                      <span style={{ display: "block", height: "100%", width: `${pct}%`, background: bar, borderRadius: "999px" }} />
                    </div>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: "12px", fontWeight: 700, textAlign: "right", color }}>{pct}%</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ── 6. COMMUNITY EXAMPLES ───────────────────────────────────────── */}
        <section id="community" style={{
          background: "var(--surface)",
          borderTop: "1px solid var(--border)", borderBottom: "1px solid var(--border)",
          position: "relative",
        }}>
          <div style={{ maxWidth: "1240px", margin: "0 auto", padding: "120px 32px" }}>
            <div className="landing-section-label">수험생 토론</div>
            <h2 style={{ fontSize: "clamp(32px, 4vw, 48px)", fontWeight: 800, letterSpacing: "-0.025em", lineHeight: 1.1, margin: "14px 0 0", color: "var(--text)" }}>
              한 문제, 여러 수험생의 시야
            </h2>
            <p style={{ fontSize: "16px", color: "var(--text-muted)", lineHeight: 1.75, margin: "18px 0 0", maxWidth: "58ch" }}>
              모든 문제 페이지에 공식 해설 + 수험생 토론 탭이 함께 있습니다. 암기법·정정·질문이 추천 순으로 정렬되어 학습 흐름을 끊지 않습니다.
            </p>

            <div style={{ marginTop: "52px", display: "grid", gap: "20px", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
              {[
                {
                  type: "암기법",
                  typeColor: "var(--teal)",
                  typeBg: "var(--teal-dim)",
                  typeBorder: "var(--teal-border)",
                  nickname: "수의2025",
                  badge: "인기 댓글",
                  badgeColor: "var(--amber, #C8895A)",
                  body: "베타 작용제 외울 때 'BAR' (Beta-Adrenergic-Receptor) → 'BAR에서 한 잔 = 기관지 확장'으로 외우면 한 번 보고 안 잊혀요.",
                  votes: 47,
                  replies: 3,
                  ago: "2일 전",
                },
                {
                  type: "정정 제안",
                  typeColor: "var(--wrong)",
                  typeBg: "var(--wrong-dim)",
                  typeBorder: "rgba(192,74,58,0.25)",
                  nickname: "도와줄게요",
                  badge: "검수자",
                  badgeColor: "var(--correct)",
                  body: "해설에 \"아드레날린은 항상 알파 우선\"이라고 적혀 있는데, 실제로는 농도 의존적입니다. 저용량은 베타-2 우선이라 혈관 확장이 먼저 나타납니다.",
                  votes: 32,
                  replies: 5,
                  ago: "5일 전",
                },
                {
                  type: "질문",
                  typeColor: "var(--blue, #4A7FA8)",
                  typeBg: "rgba(74,127,168,0.1)",
                  typeBorder: "rgba(74,127,168,0.3)",
                  nickname: "본3당해",
                  badge: "새내기",
                  badgeColor: "var(--text-faint)",
                  body: "5번 선택지가 왜 답이 아닌가요? 알파-2 작용 부분이 헷갈려서 다시 정리하고 싶어요. 작용 기전이 잘 정리된 자료 있으신 분?",
                  votes: 18,
                  replies: 8,
                  ago: "1주 전",
                },
              ].map(({ type, typeColor, typeBg, typeBorder, nickname, badge, badgeColor, body, votes, replies, ago }) => (
                <div key={nickname} style={{
                  background: "var(--bg)", border: "1px solid var(--border)",
                  borderRadius: "14px", padding: "22px",
                  display: "flex", flexDirection: "column", gap: "14px",
                  minHeight: "240px",
                }}>
                  {/* Header: type label + nickname + badge */}
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                    <span style={{
                      fontSize: "10px", fontWeight: 800, letterSpacing: "0.1em",
                      color: typeColor, padding: "3px 8px", borderRadius: "4px",
                      background: typeBg, border: `1px solid ${typeBorder}`,
                    }}>{type}</span>
                    <span style={{ fontSize: "13px", fontWeight: 700, color: "var(--text)" }}>{nickname}</span>
                    <span style={{
                      fontSize: "10px", fontWeight: 700, padding: "2px 7px", borderRadius: "999px",
                      color: badgeColor, border: `1px solid ${badgeColor}`,
                      opacity: 0.85,
                    }}>{badge}</span>
                  </div>

                  {/* Body */}
                  <p style={{ fontSize: "13.5px", lineHeight: 1.65, color: "var(--text-muted)", margin: 0, flex: 1 }}>
                    {body}
                  </p>

                  {/* Footer: votes + replies + time */}
                  <div style={{
                    display: "flex", alignItems: "center", gap: "16px",
                    fontFamily: "var(--font-mono)", fontSize: "11.5px",
                    color: "var(--text-faint)", borderTop: "1px solid var(--border)", paddingTop: "12px",
                  }}>
                    <span style={{ color: "var(--correct)", fontWeight: 700 }}>▲ {votes}</span>
                    <span>답글 {replies}</span>
                    <span style={{ marginLeft: "auto" }}>{ago}</span>
                  </div>
                </div>
              ))}
            </div>

            <div style={{ marginTop: "32px", fontSize: "11px", color: "var(--text-faint)", letterSpacing: "0.08em", fontFamily: "var(--font-mono)" }}>
              ※ 위 댓글은 베타 런칭 시점 시안입니다. 실제 콘텐츠는 운영 시작 후 수험생들이 작성합니다.
            </div>
          </div>
        </section>

        {/* ── 7. HOW IT WORKS ─────────────────────────────────────────────── */}
        <section id="how" style={{
          borderTop: "1px solid var(--border)", borderBottom: "1px solid var(--border)",
          background: "linear-gradient(180deg, rgba(15,23,41,0.4) 0%, transparent 100%)",
          position: "relative",
        }}>
          <div style={{ maxWidth: "1240px", margin: "0 auto", padding: "120px 32px" }}>
            <div className="landing-section-label">사용 흐름</div>
            <h2 style={{ fontSize: "clamp(32px, 4vw, 48px)", fontWeight: 800, letterSpacing: "-0.025em", lineHeight: 1.1, margin: "14px 0 0", color: "var(--text)" }}>
              네 단계로 충분합니다
            </h2>

            <div className="steps-grid">
              {[
                {
                  num: "01", active: true,
                  head: "문제를 풉니다",
                  body: "과목을 고르거나 복습 큐에서 시작합니다. 틀린 문제는 자동으로 오답 노트와 SRS 큐에 들어갑니다. 별도 정리가 필요 없습니다.",
                  preview: (
                    <>
                      <div style={{ color: "var(--teal)", fontWeight: 700, marginBottom: "4px", fontFamily: "var(--font-mono)", fontSize: "11.5px" }}>→ 약리학 · Q042</div>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: "11.5px" }}>β₂ 수용체 작용제로…</div>
                    </>
                  ),
                },
                {
                  num: "02", active: false,
                  head: "데이터가 쌓입니다",
                  body: "과목별 정답률, 누적 시도 횟수, 약점 패턴이 실시간으로 집계됩니다. 어디에 시간을 써야 할지 숫자가 알려줍니다.",
                  preview: (
                    <>
                      <div style={{ marginBottom: "4px", fontFamily: "var(--font-mono)", fontSize: "11.5px" }}>정답률 <span style={{ color: "var(--text)" }}>74.3%</span> <span style={{ color: "var(--correct)" }}>▲2.1</span></div>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: "11.5px" }}>최약점 <span style={{ color: "var(--wrong)" }}>약리학</span></div>
                    </>
                  ),
                },
                {
                  num: "03", active: false,
                  head: "잊기 전에 다시 만납니다",
                  body: "간격 반복 알고리즘이 D+1, D+3, D+7 타이밍에 복습을 띄웁니다. 하루 10분으로도 장기 기억이 쌓입니다.",
                  preview: (
                    <>
                      <div style={{ color: "var(--teal)", marginBottom: "4px", fontFamily: "var(--font-mono)", fontSize: "11.5px" }}>복습 대기 <span style={{ fontWeight: 700 }}>6문제</span></div>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: "11.5px" }}>약 6분 소요</div>
                    </>
                  ),
                },
                {
                  num: "04", active: false,
                  head: "막힐 때 커뮤니티에서 답을 찾습니다",
                  body: "공식 해설로 부족한 문제는 커뮤니티 토론 탭에서 다른 수험생의 암기법·정정·질문을 바로 봅니다. 좋은 댓글에 추천을 누르면 다음 회독 시에도 함께 보입니다.",
                  preview: (
                    <>
                      <div style={{ color: "var(--teal)", marginBottom: "4px", fontFamily: "var(--font-mono)", fontSize: "11.5px" }}>커뮤니티 토론 <span style={{ fontWeight: 700 }}>12개</span></div>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: "11.5px" }}>인기 댓글 <span style={{ color: "var(--correct)" }}>+47</span></div>
                    </>
                  ),
                },
              ].map(({ num, active, head, body, preview }) => (
                <div key={num} className="step-item">
                  {/* Giant monospace numeral */}
                  <div style={{
                    fontFamily: "var(--font-mono)", fontSize: "72px", fontWeight: 800,
                    letterSpacing: "-0.04em", lineHeight: 1, marginBottom: "20px",
                    color: active ? "var(--teal)" : "var(--text)",
                    opacity: active ? 0.2 : 0.06,
                  }}>{num}</div>
                  <h3 style={{ fontSize: "20px", fontWeight: 700, color: "var(--text)", letterSpacing: "-0.015em", margin: "0 0 10px" }}>{head}</h3>
                  <p style={{ fontSize: "14px", color: "var(--text-muted)", lineHeight: 1.7, margin: 0 }}>{body}</p>
                  <div style={{ marginTop: "24px", padding: "14px 16px", background: "var(--bg)", border: "1px solid var(--border)", borderRadius: "10px", color: "var(--text-muted)" }}>
                    {preview}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── 7. PULL QUOTE ───────────────────────────────────────────────── */}
        <section style={{ maxWidth: "900px", margin: "0 auto", padding: "100px 32px", textAlign: "center", position: "relative" }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: "64px", color: "var(--teal)", opacity: 0.3, lineHeight: 0.8, marginBottom: "16px" }}>&ldquo;</div>
          <p style={{ fontSize: "clamp(22px, 3vw, 32px)", fontWeight: 600, letterSpacing: "-0.02em", lineHeight: 1.45, color: "var(--text)", margin: 0 }}>
            <span style={{ display: "block" }}>혼자 외울 때는 그 한 줄에서 매번 막혔어요.</span>
            <span style={{ display: "block", marginTop: "10px" }}>다른 수험생이 같은 문제를 어떻게 외웠는지 보면서 비로소 풀리는 게 많아요.</span>
          </p>
          <div style={{ marginTop: "28px", fontSize: "13px", color: "var(--text-muted)", fontWeight: 500, display: "inline-flex", alignItems: "center", gap: "12px" }}>
            <span style={{
              width: "32px", height: "32px", borderRadius: "999px", flexShrink: 0,
              background: "linear-gradient(135deg, #4A7FA8, #1ea7bb)",
              color: "#fff", display: "grid", placeItems: "center", fontWeight: 700, fontSize: "13px",
            }}>박</span>
            <span>
              <strong style={{ color: "var(--text)", fontWeight: 600 }}>박수의</strong>
              <span style={{ color: "var(--text-faint)" }}> · 수의학과 본4 · 국가시험 준비 중</span>
            </span>
          </div>
        </section>

        {/* ── 8. FINAL CTA ────────────────────────────────────────────────── */}
        <LandingFinalCta />

        {/* ── 9. FOOTER ───────────────────────────────────────────────────── */}
        <footer style={{ borderTop: "1px solid var(--border)", padding: "32px", marginTop: "60px" }}>
          <div style={{
            maxWidth: "1240px", margin: "0 auto",
            display: "flex", justifyContent: "space-between", alignItems: "center",
            gap: "20px", flexWrap: "wrap", fontSize: "12px", color: "var(--text-faint)",
          }}>
            <a href="#" style={{ display: "inline-flex", alignItems: "center", gap: "10px", color: "inherit", textDecoration: "none" }}>
              <Image src="/logo.png" alt="KVLE 수의미래연구소" width={90} height={30} style={{ objectFit: "contain" }} />
            </a>
            <div>© 2026 수의미래연구소. 수록된 문제 및 해설의 저작권은 수의미래연구소에 있습니다.</div>
            <div style={{ display: "flex", gap: "20px" }}>
              <Link href="/auth/login" className="foot-link">로그인</Link>
              <Link href="/auth/login?mode=signup" className="foot-link">회원가입</Link>
            </div>
          </div>
        </footer>
      </main>
    </>
  );
}
