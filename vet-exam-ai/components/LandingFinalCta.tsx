"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

function ArrowSVG({ size = 14 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M5 12h14M13 5l7 7-7 7" />
    </svg>
  );
}

function getDaysLeft(dateValue: string) {
  const target = new Date(`${dateValue}T00:00:00`);
  if (Number.isNaN(target.getTime())) return null;

  const today = new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const startOfTarget = new Date(target.getFullYear(), target.getMonth(), target.getDate());
  return Math.ceil((startOfTarget.getTime() - startOfToday.getTime()) / 86400000);
}

function formatKoreanDate(dateValue: string) {
  const target = new Date(`${dateValue}T00:00:00`);
  if (Number.isNaN(target.getTime())) return "날짜 미정";
  return target.toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  });
}

export default function LandingFinalCta() {
  const [examDate, setExamDate] = useState("2027-01-15");
  const daysLeft = useMemo(() => getDaysLeft(examDate), [examDate]);
  const dateLabel = useMemo(() => formatKoreanDate(examDate), [examDate]);

  const dDayLabel =
    daysLeft === null ? "D-day" : daysLeft === 0 ? "D-day" : daysLeft > 0 ? `D-${daysLeft}` : `D+${Math.abs(daysLeft)}`;

  return (
    <section style={{ maxWidth: "1100px", margin: "0 auto", padding: "32px", position: "relative" }}>
      <div
        style={{
          borderRadius: "24px",
          background: "linear-gradient(135deg, #0F2A33 0%, #0F1729 100%)",
          border: "1px solid var(--teal-border)",
          padding: "68px 48px",
          textAlign: "center",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: "-1px",
            background: "radial-gradient(circle at 50% 100%, rgba(30,167,187,0.18) 0%, transparent 60%)",
            pointerEvents: "none",
          }}
        />
        <div style={{ position: "relative" }}>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "12px",
              padding: "8px 14px",
              borderRadius: "999px",
              background: "rgba(30,167,187,0.12)",
              border: "1px solid var(--teal-border)",
              marginBottom: "18px",
            }}
          >
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "18px",
                fontWeight: 800,
                color: "var(--teal)",
                letterSpacing: "0.02em",
                lineHeight: 1,
              }}
            >
              {dDayLabel}
            </span>
            <span style={{ color: "var(--text-muted)", fontSize: "13px", fontWeight: 600 }}>{dateLabel}</span>
          </div>

          <h2
            style={{
              fontSize: "clamp(34px, 4vw, 48px)",
              fontWeight: 800,
              letterSpacing: "-0.025em",
              lineHeight: 1.1,
              margin: "0 0 14px",
            }}
          >
            다음 시험까지
            <br />
            <span style={{ color: "var(--teal)" }}>
              {daysLeft === null ? "날짜를 입력해 주세요" : daysLeft > 0 ? `${daysLeft}일` : daysLeft === 0 ? "오늘" : `${Math.abs(daysLeft)}일 지났습니다`}
            </span>{" "}
            {daysLeft !== null && daysLeft > 0 ? "남았습니다" : ""}
          </h2>

          <p style={{ color: "var(--text-muted)", fontSize: "15px", margin: "0 auto 28px", maxWidth: "58ch", lineHeight: 1.65 }}>
            다음 국가시험 날짜가 공식 발표되면 아래 날짜만 바꾸세요. D-day와 복습 계획 기준이 즉시 갱신됩니다.
          </p>

          <div className="final-cta-controls">
            <label className="exam-date-control">
              <span>예상 시험일</span>
              <input type="date" value={examDate} onChange={(event) => setExamDate(event.target.value)} />
            </label>

            <Link
              href="/auth/login?mode=signup"
              className="final-cta-button"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "12px",
                padding: "14px 14px 14px 26px",
                borderRadius: "999px",
                background: "var(--teal)",
                color: "#061218",
                fontSize: "15px",
                fontWeight: 800,
                boxShadow: "0 8px 20px rgba(30,167,187,0.2), inset 0 1px 0 rgba(255,255,255,0.2)",
                textDecoration: "none",
              }}
            >
              무료로 시작하기
              <span
                style={{
                  width: "32px",
                  height: "32px",
                  borderRadius: "999px",
                  background: "rgba(0,0,0,0.18)",
                  display: "grid",
                  placeItems: "center",
                }}
              >
                <ArrowSVG />
              </span>
            </Link>
          </div>

          <div className="final-cta-checks">
            <span className="cta-check">회원가입 무료</span>
            <span className="cta-check">카드 정보 불필요</span>
            <span className="cta-check">60초 안에 시작</span>
          </div>
        </div>
      </div>
    </section>
  );
}
