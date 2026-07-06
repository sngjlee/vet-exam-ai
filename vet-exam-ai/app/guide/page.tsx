import type { Metadata } from "next";
import Link from "next/link";
import {
  BookOpen,
  CheckCircle2,
  Compass,
  Lightbulb,
  MessageSquare,
  RotateCcw,
  Search,
  Sparkles,
} from "lucide-react";

export const metadata: Metadata = {
  title: "처음 이용 가이드 | KVLE",
  description: "KVLE를 처음 이용하는 수험생을 위한 빠른 시작 가이드입니다.",
  alternates: { canonical: "/guide" },
};

const QUICK_STEPS = [
  {
    title: "해설부터 보기",
    body: "처음에는 문제를 많이 풀기보다 해설과 출제 포인트를 먼저 훑어보세요.",
    href: "/questions",
    cta: "해설보기",
    icon: BookOpen,
    tone: "var(--teal)",
    bg: "var(--teal-dim)",
    border: "var(--teal-border)",
  },
  {
    title: "헷갈린 문제 저장",
    body: "틀리거나 애매한 문제는 오답노트에 남기면 복습 일정으로 다시 올라옵니다.",
    href: "/wrong-notes",
    cta: "오답노트",
    icon: RotateCcw,
    tone: "var(--amber)",
    bg: "var(--amber-dim)",
    border: "rgba(200,137,90,0.28)",
  },
  {
    title: "댓글 노하우 확인",
    body: "다른 수험생의 암기법, 정정 제안, 보충 설명을 같이 보면 막힌 지점이 빨리 풀립니다.",
    href: "/comments",
    cta: "노하우 보기",
    icon: Lightbulb,
    tone: "var(--blue)",
    bg: "var(--blue-dim)",
    border: "rgba(74,127,168,0.28)",
  },
] as const;

const FEATURE_MAP = [
  {
    name: "해설보기",
    href: "/questions",
    icon: BookOpen,
    description: "기출 문제와 해설을 과목, topic 기준으로 둘러봅니다.",
  },
  {
    name: "검색",
    href: "/search",
    icon: Search,
    description: "문제 본문, 해설, 과목, tag를 한 번에 찾습니다.",
  },
  {
    name: "문제풀기",
    href: "/quiz",
    icon: CheckCircle2,
    description: "짧은 세션으로 풀고, 결과를 학습 데이터에 쌓습니다.",
  },
  {
    name: "복습",
    href: "/review",
    icon: RotateCcw,
    description: "오답이 일정 간격으로 다시 올라오는 흐름입니다.",
  },
  {
    name: "노하우",
    href: "/comments",
    icon: MessageSquare,
    description: "추천순 댓글과 암기법을 모아 봅니다.",
  },
  {
    name: "공지·건의",
    href: "/board",
    icon: Compass,
    description: "운영 공지 확인과 개선 제안을 남기는 공간입니다.",
  },
] as const;

const ROUTINES = [
  {
    title: "첫날 10분",
    items: ["해설보기에서 익숙한 과목 1개 선택", "문제 3개만 읽고 댓글 노하우 확인", "헷갈린 문제를 오답노트에 저장"],
  },
  {
    title: "매일 15분",
    items: ["대시보드에서 복습 대기 확인", "복습 문제를 먼저 처리", "남는 시간에 랜덤 5문제 풀이"],
  },
  {
    title: "주 1회 점검",
    items: ["통계에서 최약 과목 확인", "약점연습으로 해당 과목 보강", "검색으로 반복해서 틀리는 topic 확인"],
  },
] as const;

export default function GuidePage() {
  return (
    <main style={{ maxWidth: 1040, margin: "0 auto", padding: "36px 24px 72px" }}>
      <section
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1.2fr) minmax(260px, 0.8fr)",
          gap: 22,
          alignItems: "stretch",
        }}
        className="guide-hero-grid"
      >
        <div
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderTop: "3px solid var(--teal)",
            borderRadius: "var(--radius-md)",
            padding: 28,
          }}
        >
          <span className="kvle-label" style={{ fontSize: 12 }}>
            처음 이용 가이드
          </span>
          <h1
            style={{
              fontFamily: "var(--font-serif)",
              fontSize: 34,
              fontWeight: 800,
              lineHeight: 1.18,
              letterSpacing: 0,
              color: "var(--text)",
              margin: "10px 0 12px",
            }}
          >
            처음엔 세 가지만 해도 충분합니다
          </h1>
          <p style={{ color: "var(--text-muted)", fontSize: 15, lineHeight: 1.7, margin: 0, maxWidth: "62ch" }}>
            KVLE는 문제를 많이 푸는 앱이라기보다, 해설과 오답 복습, 수험생 노하우를 한 흐름으로 묶는 학습 공간입니다.
            첫날에는 메뉴를 전부 익히려 하지 말고 아래 순서대로 시작하세요.
          </p>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 24 }}>
            <Link href="/questions" className="kvle-btn-primary" style={{ textDecoration: "none" }}>
              해설부터 시작
            </Link>
            <Link href="/dashboard" className="kvle-btn-ghost" style={{ textDecoration: "none" }}>
              대시보드로 돌아가기
            </Link>
          </div>
        </div>

        <aside
          style={{
            background: "var(--surface-raised)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-md)",
            padding: 22,
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            gap: 18,
          }}
        >
          <div
            style={{
              width: 42,
              height: 42,
              borderRadius: "var(--radius-md)",
              display: "grid",
              placeItems: "center",
              color: "var(--teal)",
              background: "var(--teal-dim)",
              border: "1px solid var(--teal-border)",
            }}
          >
            <Sparkles size={20} />
          </div>
          <div>
            <h2 style={{ color: "var(--text)", fontSize: 18, fontWeight: 800, margin: "0 0 8px" }}>
              메뉴가 많아 보여도 괜찮습니다
            </h2>
            <p style={{ color: "var(--text-muted)", fontSize: 14, lineHeight: 1.6, margin: 0 }}>
              평소에는 대시보드에서 오늘 할 일만 보고, 필요한 순간에 해설보기·검색·복습으로 들어가면 됩니다.
            </p>
          </div>
        </aside>
      </section>

      <section style={{ marginTop: 22 }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 12,
          }}
        >
          {QUICK_STEPS.map(({ title, body, href, cta, icon: Icon, tone, bg, border }) => (
            <Link
              key={title}
              href={href}
              style={{
                minHeight: 198,
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
                gap: 18,
                padding: 20,
                borderRadius: "var(--radius-md)",
                border: `1px solid ${border}`,
                background: bg,
                color: "var(--text)",
                textDecoration: "none",
              }}
            >
              <span
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: "var(--radius-sm)",
                  display: "grid",
                  placeItems: "center",
                  color: tone,
                  background: "rgba(255,255,255,0.42)",
                }}
              >
                <Icon size={18} />
              </span>
              <span>
                <strong style={{ display: "block", fontSize: 16, marginBottom: 7 }}>{title}</strong>
                <span style={{ display: "block", color: "var(--text-muted)", fontSize: 13, lineHeight: 1.55 }}>
                  {body}
                </span>
              </span>
              <span style={{ color: tone, fontSize: 13, fontWeight: 800 }}>{cta} →</span>
            </Link>
          ))}
        </div>
      </section>

      <section
        style={{
          marginTop: 24,
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-md)",
          padding: 24,
        }}
      >
        <div style={{ marginBottom: 18 }}>
          <span className="kvle-label" style={{ fontSize: 12 }}>
            기능 지도
          </span>
          <h2 style={{ fontFamily: "var(--font-serif)", fontSize: 24, fontWeight: 800, margin: "8px 0 0" }}>
            막힐 때는 목적별로 들어가세요
          </h2>
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
            gap: 10,
          }}
        >
          {FEATURE_MAP.map(({ name, href, icon: Icon, description }) => (
            <Link
              key={name}
              href={href}
              style={{
                display: "grid",
                gridTemplateColumns: "34px minmax(0, 1fr)",
                gap: 12,
                alignItems: "start",
                minHeight: 92,
                padding: 14,
                borderRadius: "var(--radius-sm)",
                border: "1px solid var(--border)",
                background: "var(--bg)",
                color: "var(--text)",
                textDecoration: "none",
              }}
            >
              <span
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: "var(--radius-sm)",
                  display: "grid",
                  placeItems: "center",
                  color: "var(--teal)",
                  background: "var(--teal-dim)",
                }}
              >
                <Icon size={17} />
              </span>
              <span>
                <strong style={{ display: "block", fontSize: 14, marginBottom: 4 }}>{name}</strong>
                <span style={{ color: "var(--text-muted)", fontSize: 12, lineHeight: 1.45 }}>
                  {description}
                </span>
              </span>
            </Link>
          ))}
        </div>
      </section>

      <section
        style={{
          marginTop: 24,
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
          gap: 12,
        }}
      >
        {ROUTINES.map(({ title, items }) => (
          <div
            key={title}
            style={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-md)",
              padding: 20,
            }}
          >
            <h2 style={{ color: "var(--text)", fontSize: 17, fontWeight: 800, margin: "0 0 12px" }}>
              {title}
            </h2>
            <ol style={{ display: "grid", gap: 10, margin: 0, paddingLeft: 20, color: "var(--text-muted)", fontSize: 13, lineHeight: 1.55 }}>
              {items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ol>
          </div>
        ))}
      </section>

      <section
        style={{
          marginTop: 24,
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-md)",
          padding: 22,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        <div>
          <span className="kvle-label" style={{ fontSize: 12 }}>
            커뮤니티 이용
          </span>
          <p style={{ color: "var(--text-muted)", fontSize: 14, lineHeight: 1.6, margin: "8px 0 0", maxWidth: "68ch" }}>
            댓글은 수험생의 학습 보조 자료입니다. 정답 정정이나 오류 제안은 근거를 함께 남기고,
            광고·홍보성 글은 운영 기준에 따라 제한됩니다.
          </p>
        </div>
        <Link href="/community-guidelines" className="kvle-btn-ghost" style={{ textDecoration: "none" }}>
          가이드라인 보기
        </Link>
      </section>
    </main>
  );
}
