// OG 카드 1200x630 공용 템플릿. 다크 배경 + 좌상단 워드마크 + 헤드라인 + pill + 메트릭.
// 저작권 가드: 호출자가 안전한 값만 전달. 이 컴포넌트는 받은 값을 그대로 렌더.

import { readFileSync } from "fs";
import { join } from "path";

export type OgCardProps = {
  /** 가장 큰 글자. 문제 = "KVLE-1234", 게시판 = 글 제목. */
  headline: string;
  /** 카테고리/게시판 종류 pill. null이면 생략. */
  pill?: string | null;
  /** 메트릭 한 줄. 예: "댓글 12개", "댓글 12 · 추천 8". 빈 문자열이면 생략. */
  metrics?: string;
  /** 메트릭 옆 "by @닉네임". null이면 생략. */
  byline?: string | null;
};

const BG = "#080D1A";
const FG = "#F5F7FA";
const DIM = "rgba(245,247,250,0.7)";
const PILL_BG = "rgba(245,247,250,0.12)";
const PILL_FG = "#F5F7FA";

function loadLogoDataUrl(): string {
  try {
    const buf = readFileSync(join(process.cwd(), "public/logo.png"));
    return `data:image/png;base64,${buf.toString("base64")}`;
  } catch {
    return "";
  }
}

/**
 * ImageResponse의 첫 번째 인자(JSX)로 넘길 ReactElement 반환.
 * 호출자는 `new ImageResponse(renderOgCard({...}), { width: 1200, height: 630, fonts: [...] })`.
 */
export function renderOgCard(props: OgCardProps): React.ReactElement {
  const { headline, pill, metrics, byline } = props;
  const logoDataUrl = loadLogoDataUrl();

  return (
    <div
      style={{
        width: "1200px",
        height: "630px",
        background: BG,
        color: FG,
        display: "flex",
        flexDirection: "column",
        padding: "72px 96px",
        fontFamily: "Pretendard, sans-serif",
      }}
    >
      {/* 상단 워드마크 */}
      <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
        {logoDataUrl ? (
          <img
            alt="KVLE"
            src={logoDataUrl}
            width={48}
            height={48}
            style={{ objectFit: "contain" }}
          />
        ) : null}
        <span style={{ fontSize: "32px", fontWeight: 700, letterSpacing: "0.04em" }}>
          KVLE
        </span>
      </div>

      {/* 중앙 영역 — flex-grow로 위아래 균형 */}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          gap: "32px",
        }}
      >
        <div
          style={{
            fontSize: headline.length > 30 ? "72px" : "96px",
            fontWeight: 700,
            lineHeight: 1.15,
            display: "-webkit-box",
            // ImageResponse는 line-clamp 지원
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          {headline}
        </div>

        {(pill || metrics || byline) ? (
          <div style={{ display: "flex", alignItems: "center", gap: "24px" }}>
            {pill ? (
              <div
                style={{
                  background: PILL_BG,
                  color: PILL_FG,
                  padding: "12px 28px",
                  borderRadius: "999px",
                  fontSize: "32px",
                  fontWeight: 500,
                  display: "flex",
                }}
              >
                {pill}
              </div>
            ) : null}
            {metrics ? (
              <div style={{ fontSize: "32px", color: DIM, display: "flex" }}>
                {metrics}
              </div>
            ) : null}
            {byline ? (
              <div style={{ fontSize: "28px", color: DIM, display: "flex" }}>
                by @{byline}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      {/* 우하단 도메인 */}
      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          fontSize: "28px",
          color: DIM,
        }}
      >
        kvle.app
      </div>
    </div>
  );
}
