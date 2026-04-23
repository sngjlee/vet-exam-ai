import Link from "next/link";
import Image from "next/image";
import AuthRedirect from "../components/AuthRedirect";

// ── Rail items (duplicated for seamless marquee loop) ──────────────────────
const RAIL_ITEMS = [
  { bullet: true,  mono: null,     text: "수의사 국가고시 대비" },
  { bullet: false, mono: "5과목",  text: "전과목 커버" },
  { bullet: true,  mono: null,     text: "간격 반복 학습" },
  { bullet: false, mono: "SM-2",   text: "알고리즘 기반" },
  { bullet: true,  mono: null,     text: "실시간 약점 분석" },
  { bullet: false, mono: "2,400+", text: "검증된 문제" },
  { bullet: true,  mono: null,     text: "자동 오답노트" },
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
        <div style={{
          maxWidth: "1240px", margin: "0 auto", padding: "16px 32px",
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: "24px",
        }}>
          {/* Logo */}
          <a href="#" style={{ display: "inline-flex", alignItems: "center", gap: "10px", color: "inherit", textDecoration: "none" }}>
            <span style={{
              width: "28px", height: "28px", borderRadius: "8px", flexShrink: 0,
              background: "linear-gradient(135deg, var(--teal) 0%, #1689a0 100%)",
              display: "grid", placeItems: "center", color: "#fff", fontWeight: 800, fontSize: "15px",
              boxShadow: "inset 0 1px 0 rgba(255,255,255,0.2), 0 2px 8px rgba(30,167,187,0.28)",
            }}>V</span>
            <span style={{ display: "flex", flexDirection: "column", lineHeight: 1 }}>
              <span style={{ fontWeight: 800, fontSize: "16px", letterSpacing: "-0.01em" }}>Vexa</span>
              <span style={{ fontSize: "9px", color: "var(--text-faint)", letterSpacing: "0.14em", marginTop: "3px", fontWeight: 600 }}>수의미래연구소</span>
            </span>
          </a>

          {/* Section links */}
          <div style={{ display: "flex", gap: "28px", fontSize: "13px", fontWeight: 500 }}>
            <a href="#how" className="landing-nav-link">사용 흐름</a>
            <a href="#features" className="landing-nav-link">기능</a>
            <a href="#problem" className="landing-nav-link">왜 Vexa?</a>
          </div>

          {/* CTA buttons */}
          <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
            <Link href="/auth/login" className="btn-ghost-pill" style={{
              display: "inline-flex", alignItems: "center",
              padding: "8px 16px", borderRadius: "999px",
              border: "1px solid var(--border)", color: "var(--text-muted)",
              fontSize: "13px", fontWeight: 600, background: "transparent",
            }}>로그인</Link>
            <Link href="/auth/login?mode=signup" className="btn-primary-pill" style={{
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
        <section style={{ maxWidth: "1240px", margin: "0 auto", padding: "80px 32px 40px", position: "relative" }}>
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
              <h1 style={{ fontSize: "clamp(40px, 6vw, 76px)", lineHeight: 1.02, letterSpacing: "-0.035em", fontWeight: 800, margin: "0 0 24px" }}>
                막연한 공부는<br />
                <em style={{ fontStyle: "normal", color: "var(--teal)", position: "relative", whiteSpace: "nowrap" }}>숫자로</em> 바꿉니다
              </h1>

              {/* Sub-copy */}
              <p style={{ fontSize: "17px", lineHeight: 1.65, color: "var(--text-muted)", maxWidth: "48ch", margin: "0 0 32px" }}>
                Vexa는 수의사 국가고시 준비생이 어디에 시간을 써야 하는지 데이터로 알려드립니다.
                망각 곡선에 맞춘 복습, 약점 과목 우선 출제, 실시간 정답률 추적.
              </p>

              {/* CTA row */}
              <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
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
              <div style={{ marginTop: "32px", display: "inline-flex", gap: "22px", fontSize: "12px", color: "var(--text-faint)", fontFamily: "var(--font-mono)" }}>
                <span><span style={{ color: "var(--text-muted)", fontWeight: 700 }}>5</span> 과목</span>
                <span style={{ color: "var(--border)" }}>·</span>
                <span><span style={{ color: "var(--text-muted)", fontWeight: 700 }}>2,400+</span> 문제</span>
                <span style={{ color: "var(--border)" }}>·</span>
                <span><span style={{ color: "var(--text-muted)", fontWeight: 700 }}>SM-2</span> SRS 알고리즘</span>
              </div>
            </div>

            {/* RIGHT: viz-card */}
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
        </section>

        {/* ── 3. MARQUEE RAIL ─────────────────────────────────────────────── */}
        <div style={{
          borderTop: "1px solid var(--border)", borderBottom: "1px solid var(--border)",
          padding: "24px 0", marginTop: "60px", overflow: "hidden", position: "relative",
        }}>
          <div className="rail-track">
            {/* Items × 2 for seamless loop */}
            {[0, 1].flatMap((set) =>
              RAIL_ITEMS.map(({ bullet, mono, text }, i) => (
                <span key={`${set}-${i}`} style={{
                  color: "var(--text-faint)", fontSize: "14px", fontWeight: 500,
                  display: "inline-flex", alignItems: "baseline", gap: "12px",
                }}>
                  {bullet
                    ? <span style={{ color: "var(--teal)" }}>◆</span>
                    : <span style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)", fontSize: "13px", fontWeight: 600 }}>{mono}</span>
                  }
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
            <div style={{ fontSize: "11px", letterSpacing: "0.16em", fontWeight: 700, color: "var(--teal)" }}>왜 Vexa인가</div>
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
                  head: "복습 타이밍을 놓쳐 기억이 증발한다",
                  body: "한 번 본 내용의 70%는 24시간 안에 잊힙니다. 적절한 간격으로 다시 만나지 못하면, 공부한 시간이 사라집니다.",
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
          <div style={{ fontSize: "11px", letterSpacing: "0.16em", fontWeight: 700, color: "var(--teal)" }}>핵심 기능</div>
          <h2 style={{ fontSize: "clamp(32px, 4vw, 48px)", fontWeight: 800, letterSpacing: "-0.025em", lineHeight: 1.1, margin: "14px 0 0", color: "var(--text)" }}>
            시간을 낭비하지 않는 두 가지 장치
          </h2>
          <p style={{ fontSize: "16px", color: "var(--text-muted)", lineHeight: 1.6, margin: "18px 0 0", maxWidth: "58ch" }}>
            Vexa의 모든 기능은 결국 두 질문에 답합니다 —{" "}
            <strong style={{ color: "var(--text)" }}>지금 뭘 풀어야 하지?</strong>,{" "}
            <strong style={{ color: "var(--text)" }}>뭘 언제 다시 봐야 하지?</strong>
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
                Vexa는 정답률이 낮은 과목을 자동으로 상위에 배치하고, 약점 집중 세션에서 우선 출제합니다.
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

        {/* ── 6. HOW IT WORKS ─────────────────────────────────────────────── */}
        <section id="how" style={{
          borderTop: "1px solid var(--border)", borderBottom: "1px solid var(--border)",
          background: "linear-gradient(180deg, rgba(15,23,41,0.4) 0%, transparent 100%)",
          position: "relative",
        }}>
          <div style={{ maxWidth: "1240px", margin: "0 auto", padding: "120px 32px" }}>
            <div style={{ fontSize: "11px", letterSpacing: "0.16em", fontWeight: 700, color: "var(--teal)" }}>사용 흐름</div>
            <h2 style={{ fontSize: "clamp(32px, 4vw, 48px)", fontWeight: 800, letterSpacing: "-0.025em", lineHeight: 1.1, margin: "14px 0 0", color: "var(--text)" }}>
              3단계로 충분합니다
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
            막연히 책을 반복해서 읽던 때랑은 공부의 감각이 완전히 달라졌어요.
            내가 뭘 모르는지 숫자로 보이니까, 뭘 해야 할지 매일 분명합니다.
          </p>
          <div style={{ marginTop: "28px", fontSize: "13px", color: "var(--text-muted)", fontWeight: 500, display: "inline-flex", alignItems: "center", gap: "12px" }}>
            <span style={{
              width: "32px", height: "32px", borderRadius: "999px", flexShrink: 0,
              background: "linear-gradient(135deg, #4A7FA8, #1ea7bb)",
              color: "#fff", display: "grid", placeItems: "center", fontWeight: 700, fontSize: "13px",
            }}>김</span>
            <span>
              <strong style={{ color: "var(--text)", fontWeight: 600 }}>김수의</strong>
              <span style={{ color: "var(--text-faint)" }}> · 수의예과 본4 · 국시 준비 중</span>
            </span>
          </div>
        </section>

        {/* ── 8. FINAL CTA ────────────────────────────────────────────────── */}
        <section style={{ maxWidth: "1100px", margin: "0 auto", padding: "32px", position: "relative" }}>
          <div style={{
            borderRadius: "24px",
            background: "linear-gradient(135deg, #0F2A33 0%, #0F1729 100%)",
            border: "1px solid var(--teal-border)",
            padding: "72px 48px", textAlign: "center",
            position: "relative", overflow: "hidden",
          }}>
            {/* Radial glow */}
            <div aria-hidden="true" style={{
              position: "absolute", inset: "-1px",
              background: "radial-gradient(circle at 50% 100%, rgba(30,167,187,0.18) 0%, transparent 60%)",
              pointerEvents: "none",
            }} />
            <div style={{ position: "relative" }}>
              <div style={{ fontSize: "11px", letterSpacing: "0.16em", fontWeight: 700, color: "var(--teal)" }}>D-41</div>
              <h2 style={{ fontSize: "clamp(32px, 4vw, 44px)", fontWeight: 800, letterSpacing: "-0.025em", lineHeight: 1.1, margin: "0 0 14px" }}>
                다음 시험까지<br />
                <span style={{ color: "var(--teal)" }}>41일</span> 남았습니다
              </h2>
              <p style={{ color: "var(--text-muted)", fontSize: "15px", margin: "0 0 32px" }}>
                지금 계정을 만들면 오늘 밤 복습 큐부터 설계됩니다. 카드 없이 무료.
              </p>
              <Link href="/auth/login?mode=signup" className="btn-primary-pill" style={{
                display: "inline-flex", alignItems: "center", gap: "10px",
                padding: "14px 14px 14px 26px", borderRadius: "999px",
                background: "var(--teal)", color: "#061218",
                fontSize: "15px", fontWeight: 700,
                boxShadow: "0 8px 20px rgba(30,167,187,0.2), inset 0 1px 0 rgba(255,255,255,0.2)",
              }}>
                무료로 시작하기
                <span style={{ width: "32px", height: "32px", borderRadius: "999px", background: "rgba(0,0,0,0.18)", display: "grid", placeItems: "center" }}>
                  <ArrowSVG />
                </span>
              </Link>
              {/* Meta row with ✓ checks */}
              <div style={{ marginTop: "28px", display: "inline-flex", gap: "24px", fontSize: "11px", color: "var(--text-faint)", fontFamily: "var(--font-mono)", fontWeight: 500 }}>
                <span className="cta-check">회원가입 무료</span>
                <span className="cta-check">카드 정보 불필요</span>
                <span className="cta-check">60초 안에 시작</span>
              </div>
            </div>
          </div>
        </section>

        {/* ── 9. FOOTER ───────────────────────────────────────────────────── */}
        <footer style={{ borderTop: "1px solid var(--border)", padding: "32px", marginTop: "60px" }}>
          <div style={{
            maxWidth: "1240px", margin: "0 auto",
            display: "flex", justifyContent: "space-between", alignItems: "center",
            gap: "20px", flexWrap: "wrap", fontSize: "12px", color: "var(--text-faint)",
          }}>
            <a href="#" style={{ display: "inline-flex", alignItems: "center", gap: "10px", color: "inherit", textDecoration: "none" }}>
              <Image src="/logo.png" alt="Vexa 수의미래연구소" width={90} height={30} style={{ objectFit: "contain" }} />
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
