# OG 카드 / 딥링크 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/questions/[id]`, `/board/announcements/[id]`, `/board/suggestions/[id]` 세 라우트에 동적 OG 이미지 + meta tags를 추가해 카톡/슬랙/X 공유 시 미리보기 카드가 뜨도록 한다.

**Architecture:** Next 16 표준 패턴 (`opengraph-image.tsx` per route + `generateMetadata` per route). 공용 util 3개 (`lib/og/{pretendard,fetch-meta,render-card}`)로 세 라우트 코드 공유. `/questions/[id]` page는 `"use client"`라 server `layout.tsx`를 새로 둬서 metadata 추가, board page는 이미 server이므로 export 추가만.

**Tech Stack:** Next.js 16.1.6, `next/og` (`ImageResponse`), `@supabase/ssr`, Pretendard CDN OTF, React 19.

**Spec:** `vet-exam-ai/docs/superpowers/specs/2026-05-14-og-deeplink-design.md`

**Pre-flight (run before Task 1):**
- 저장소는 이중 nested: outer = `C:\Users\Theriogenology\Desktop\vet-exam-ai\` (git root), inner = `vet-exam-ai\vet-exam-ai\` (Next 앱 root, `package.json`/`tsconfig.json` 위치)
- 모든 파일 절대경로는 `vet-exam-ai\vet-exam-ai\...`로 시작 (memory `subagent_repo_root_path_confusion.md` 함정)
- **모든 npm/npx 명령은 inner 디렉터리에서 실행해야 함**. 각 task 안에서 여러 bash 호출이 있으면 한 번 `cd vet-exam-ai`로 들어간 뒤 그 세션이 잠김 (memory `search_v1_done.md` "bash CWD inner-cd"). 따라서 **각 bash 호출에서 명령을 `&&`로 chain하거나, 첫 명령에서만 `cd vet-exam-ai`를 쓰고 이후 호출은 cwd 가정 유지**.
- `git` 명령은 어디서 호출하든 OK (repo root 기준 path tracking).
- 테스트 러너 없음. 검증 = `npx tsc --noEmit` + `npm run lint` + `npm run build` + 수동 browser 점검
- 새 브랜치: `feat/og-deeplink`

---

### Task 0: 브랜치 생성

**Files:** (no files)

- [ ] **Step 1: 새 브랜치 생성**

```bash
git checkout -b feat/og-deeplink
```

Expected: `Switched to a new branch 'feat/og-deeplink'`

---

### Task 1: Pretendard 폰트 loader

**Files:**
- Create: `vet-exam-ai/vet-exam-ai/lib/og/pretendard.ts`

ImageResponse는 기본 폰트가 한글을 지원하지 않아 □로 렌더된다. CDN에서 Pretendard OTF를 `ArrayBuffer`로 fetch해서 `ImageResponse` 두 번째 인자 `fonts`에 전달. Next가 첫 요청 시 자동 캐싱한다.

- [ ] **Step 1: 파일 작성**

전체 내용 — `vet-exam-ai/vet-exam-ai/lib/og/pretendard.ts`:

```ts
// Pretendard OTF loader for next/og ImageResponse.
// 한글 글리프 제공. Next가 동일 weight 요청 시 자동 캐싱.

const URLS = {
  500: "https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/packages/pretendard/dist/public/static/Pretendard-Medium.otf",
  700: "https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/packages/pretendard/dist/public/static/Pretendard-Bold.otf",
} as const;

export type PretendardWeight = keyof typeof URLS;

export async function loadPretendard(
  weight: PretendardWeight,
): Promise<ArrayBuffer | null> {
  try {
    const res = await fetch(URLS[weight], {
      // 빌드/런타임 둘 다에서 캐시되도록
      cache: "force-cache",
    });
    if (!res.ok) return null;
    return await res.arrayBuffer();
  } catch {
    return null;
  }
}
```

- [ ] **Step 2: typecheck**

```bash
cd vet-exam-ai && npx tsc --noEmit
```

Expected: exit code 0 (출력 없음). 에러 시 fix until 0.

- [ ] **Step 3: commit**

```bash
git add vet-exam-ai/lib/og/pretendard.ts
git commit -m "feat(og): Pretendard 폰트 loader util"
```

---

### Task 2: fetch-meta util

**Files:**
- Create: `vet-exam-ai/vet-exam-ai/lib/og/fetch-meta.ts`

저작권 가드 핵심 — questions에서 `question/explanation/answer/round/year/session` 컬럼은 **절대 select하지 않는다**. SELECT 화이트리스트만 사용.

- [ ] **Step 1: 파일 작성**

전체 내용 — `vet-exam-ai/vet-exam-ai/lib/og/fetch-meta.ts`:

```ts
// OG 카드용 메타 페치. 저작권 가드: questions에서 본문/정답/해설/회차/연도
// 컬럼은 절대 select하지 않는다 (코드 레벨 enforcement).

import { createClient } from "../supabase/server";

export type QuestionOgMeta = {
  publicId: string;
  category: string;
  commentsCount: number;
};

export type BoardKind = "announcement" | "suggestion";

export type BoardOgMeta = {
  title: string;
  kind: BoardKind;
  authorNickname: string | null;
  commentsCount: number;
  upvoteCount: number;
  visible: boolean;
};

/**
 * publicId(KVLE-NNNN) 또는 raw id로 단일 문제 메타를 조회한다.
 * 못 찾으면 null. 댓글 수는 comments 테이블 count 쿼리로 별도 페치.
 */
export async function fetchQuestionMeta(
  idOrPublicId: string,
): Promise<QuestionOgMeta | null> {
  const supabase = await createClient();

  // SELECT 화이트리스트: public_id, category, id (raw fallback 매칭용).
  // question/answer/explanation/round/year/session 은 절대 포함 금지.
  //
  // publicId 우선 → 실패 시 raw id로 한 번 더. PostgREST or() 필터에
  // template literal을 직접 삽입하면 escape 부담 + 한글 id에서 깨질 수 있어
  // sequential lookup이 안전.
  let row: { id: string; public_id: string | null; category: string | null } | null = null;
  {
    const { data } = await supabase
      .from("questions")
      .select("id, public_id, category")
      .eq("public_id", idOrPublicId)
      .maybeSingle();
    row = data ?? null;
  }
  if (!row) {
    const { data } = await supabase
      .from("questions")
      .select("id, public_id, category")
      .eq("id", idOrPublicId)
      .maybeSingle();
    row = data ?? null;
  }
  if (!row) return null;
  const q = row;

  // 댓글 수 — questions에 denormalized 컬럼 없음. comments.question_id로 count.
  const { count } = await supabase
    .from("comments")
    .select("id", { count: "exact", head: true })
    .eq("question_id", q.id);

  return {
    publicId: q.public_id ?? q.id,
    category: q.category ?? "",
    commentsCount: count ?? 0,
  };
}

/**
 * 게시판 글 메타. visibility !== 'visible'이면 visible=false로 반환 →
 * 호출자가 OG 이미지 생성 스킵 + robots noindex 처리.
 */
export async function fetchBoardPostMeta(
  id: string,
  kind: BoardKind,
): Promise<BoardOgMeta | null> {
  const supabase = await createClient();

  const { data: post } = await supabase
    .from("board_posts")
    .select("id, title, kind, visibility, user_id, comment_count, upvote_count")
    .eq("id", id)
    .eq("kind", kind)
    .maybeSingle();

  if (!post) return null;

  const visible = post.visibility === "visible";

  let authorNickname: string | null = null;
  if (visible && post.user_id) {
    const { data: prof } = await supabase
      .from("user_profiles_public")
      .select("nickname")
      .eq("user_id", post.user_id)
      .maybeSingle();
    authorNickname = prof?.nickname ?? null;
  }

  return {
    title: post.title ?? "",
    kind: post.kind as BoardKind,
    authorNickname,
    commentsCount: post.comment_count ?? 0,
    upvoteCount: post.upvote_count ?? 0,
    visible,
  };
}
```

- [ ] **Step 2: typecheck**

```bash
cd vet-exam-ai && npx tsc --noEmit
```

Expected: exit code 0. 에러 시 — `board_posts.title`/`visibility`/`user_id` 컬럼명이 실제와 다른지 `lib/supabase/types.ts` 600-650 라인 부근에서 확인.

- [ ] **Step 3: commit**

```bash
git add vet-exam-ai/lib/og/fetch-meta.ts
git commit -m "feat(og): 저작권-가드 적용한 메타 페치 util"
```

---

### Task 3: render-card 템플릿

**Files:**
- Create: `vet-exam-ai/vet-exam-ai/lib/og/render-card.tsx`

세 라우트 공용 JSX 템플릿. ImageResponse는 `<div>` flex layout 위주만 지원 (CSS Grid 미지원).

- [ ] **Step 1: 파일 작성**

전체 내용 — `vet-exam-ai/vet-exam-ai/lib/og/render-card.tsx`:

```tsx
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
            // @ts-expect-error: vendor prefix
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
```

- [ ] **Step 2: typecheck**

```bash
cd vet-exam-ai && npx tsc --noEmit
```

Expected: exit code 0. `@ts-expect-error` 라인의 주석이 정말 에러를 가리키는지 확인 — 만약 에러 없으면 제거.

- [ ] **Step 3: commit**

```bash
git add vet-exam-ai/lib/og/render-card.tsx
git commit -m "feat(og): 공용 카드 템플릿 (1200x630)"
```

---

### Task 4: `/questions/[id]` — server layout + opengraph-image

**Files:**
- Create: `vet-exam-ai/vet-exam-ai/app/questions/[id]/layout.tsx`
- Create: `vet-exam-ai/vet-exam-ai/app/questions/[id]/opengraph-image.tsx`

`page.tsx`는 `"use client"`라 metadata를 export할 수 없다. 같은 폴더에 server `layout.tsx`를 두면 Next 16이 server-side에서 `generateMetadata`를 실행한다. `layout.tsx`는 `<html>`/`<body>` 없이 children만 pass-through (루트 layout이 이미 둘 다 가지고 있음).

- [ ] **Step 1: `layout.tsx` 작성**

전체 내용 — `vet-exam-ai/vet-exam-ai/app/questions/[id]/layout.tsx`:

```tsx
import type { Metadata } from "next";
import { fetchQuestionMeta } from "../../../lib/og/fetch-meta";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;

  // Next 16 useParams와 동일 — 한글 raw id (legacy `2.4_공보_57회_q001`)는
  // URL 세그먼트가 percent-encoded. 디코드해서 매칭한다.
  let decoded = id;
  try {
    decoded = decodeURIComponent(id);
  } catch {
    // 잘못된 인코딩이면 원본 사용
  }

  const meta = await fetchQuestionMeta(decoded);
  if (!meta) {
    return {
      title: "KVLE — 문제",
      description: "수의사 국가시험 학습 플랫폼 KVLE",
    };
  }

  const title = `${meta.publicId} · ${meta.category} — KVLE`;
  const description =
    meta.commentsCount > 0
      ? `${meta.category} 문제 · 댓글 ${meta.commentsCount}개`
      : `${meta.category} 문제 · 같이 풀어볼까요?`;

  return {
    title,
    description,
    openGraph: { title, description, type: "article" },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default function QuestionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
```

- [ ] **Step 2: `opengraph-image.tsx` 작성**

전체 내용 — `vet-exam-ai/vet-exam-ai/app/questions/[id]/opengraph-image.tsx`:

```tsx
import { ImageResponse } from "next/og";
import { fetchQuestionMeta } from "../../../lib/og/fetch-meta";
import { loadPretendard } from "../../../lib/og/pretendard";
import { renderOgCard } from "../../../lib/og/render-card";

export const runtime = "nodejs";
export const alt = "KVLE 문제";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function QuestionOgImage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  let decoded = id;
  try {
    decoded = decodeURIComponent(id);
  } catch {
    /* keep original */
  }

  const [meta, pretendard500, pretendard700] = await Promise.all([
    fetchQuestionMeta(decoded),
    loadPretendard(500),
    loadPretendard(700),
  ]);

  const headline = meta?.publicId ?? "KVLE";
  const pill = meta?.category || null;
  const metrics =
    meta && meta.commentsCount > 0 ? `댓글 ${meta.commentsCount}개` : "";

  const fonts: { name: string; data: ArrayBuffer; weight: 500 | 700 }[] = [];
  if (pretendard500) fonts.push({ name: "Pretendard", data: pretendard500, weight: 500 });
  if (pretendard700) fonts.push({ name: "Pretendard", data: pretendard700, weight: 700 });

  return new ImageResponse(renderOgCard({ headline, pill, metrics }), {
    ...size,
    fonts: fonts.length > 0 ? fonts : undefined,
  });
}
```

- [ ] **Step 3: typecheck + lint**

```bash
cd vet-exam-ai && npx tsc --noEmit && npm run lint
```

Expected: 둘 다 exit 0.

- [ ] **Step 4: commit**

```bash
git add vet-exam-ai/app/questions/[id]/layout.tsx vet-exam-ai/app/questions/[id]/opengraph-image.tsx
git commit -m "feat(og): /questions/[id] layout + 동적 OG 이미지"
```

---

### Task 5: `/board/announcements/[id]` — generateMetadata + opengraph-image

**Files:**
- Modify: `vet-exam-ai/vet-exam-ai/app/board/announcements/[id]/page.tsx` (import + generateMetadata export 추가)
- Create: `vet-exam-ai/vet-exam-ai/app/board/announcements/[id]/opengraph-image.tsx`

게시판 page.tsx는 이미 server async. import 추가 + `generateMetadata` export만 추가.

- [ ] **Step 1: `page.tsx`에 generateMetadata 추가**

기존 `app/board/announcements/[id]/page.tsx` L1-7 부근:

```tsx
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { BoardPostCard } from "@/components/board/BoardPostCard";
import { BoardCommentList } from "@/components/board/BoardCommentList";
import { BoardCommentComposer } from "@/components/board/BoardCommentComposer";

export const dynamic = "force-dynamic";
```

위 import 블록 바로 뒤에 다음을 삽입:

```tsx
import type { Metadata } from "next";
import { fetchBoardPostMeta } from "@/lib/og/fetch-meta";

export async function generateMetadata({
  params,
}: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const meta = await fetchBoardPostMeta(id, "announcement");
  if (!meta || !meta.visible) {
    return {
      title: "KVLE — 공지",
      robots: { index: false },
    };
  }
  const title = `${meta.title} — KVLE 공지`;
  const description =
    meta.commentsCount > 0
      ? `댓글 ${meta.commentsCount}개 · 추천 ${meta.upvoteCount}`
      : `KVLE 공지 — 추천 ${meta.upvoteCount}`;
  return {
    title,
    description,
    openGraph: { title, description, type: "article" },
    twitter: { card: "summary_large_image", title, description },
  };
}
```

`export const dynamic = "force-dynamic";` 라인은 그대로 둔다.

- [ ] **Step 2: `opengraph-image.tsx` 작성**

전체 내용 — `vet-exam-ai/vet-exam-ai/app/board/announcements/[id]/opengraph-image.tsx`:

```tsx
import { ImageResponse } from "next/og";
import { fetchBoardPostMeta } from "@/lib/og/fetch-meta";
import { loadPretendard } from "@/lib/og/pretendard";
import { renderOgCard } from "@/lib/og/render-card";

export const runtime = "nodejs";
export const alt = "KVLE 공지";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function AnnouncementOgImage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [meta, pretendard500, pretendard700] = await Promise.all([
    fetchBoardPostMeta(id, "announcement"),
    loadPretendard(500),
    loadPretendard(700),
  ]);

  // 비공개/blind/삭제 글은 generic 카드로 fallback
  if (!meta || !meta.visible) {
    const fonts: { name: string; data: ArrayBuffer; weight: 500 | 700 }[] = [];
    if (pretendard500) fonts.push({ name: "Pretendard", data: pretendard500, weight: 500 });
    if (pretendard700) fonts.push({ name: "Pretendard", data: pretendard700, weight: 700 });
    return new ImageResponse(
      renderOgCard({ headline: "KVLE 공지", pill: null, metrics: "" }),
      { ...size, fonts: fonts.length > 0 ? fonts : undefined },
    );
  }

  const metrics =
    meta.commentsCount > 0 || meta.upvoteCount > 0
      ? `댓글 ${meta.commentsCount} · 추천 ${meta.upvoteCount}`
      : "";

  const fonts: { name: string; data: ArrayBuffer; weight: 500 | 700 }[] = [];
  if (pretendard500) fonts.push({ name: "Pretendard", data: pretendard500, weight: 500 });
  if (pretendard700) fonts.push({ name: "Pretendard", data: pretendard700, weight: 700 });

  return new ImageResponse(
    renderOgCard({
      headline: meta.title,
      pill: "공지",
      metrics,
      byline: meta.authorNickname,
    }),
    { ...size, fonts: fonts.length > 0 ? fonts : undefined },
  );
}
```

- [ ] **Step 3: typecheck + lint**

```bash
cd vet-exam-ai && npx tsc --noEmit && npm run lint
```

Expected: exit 0.

- [ ] **Step 4: commit**

```bash
git add vet-exam-ai/app/board/announcements/[id]/page.tsx vet-exam-ai/app/board/announcements/[id]/opengraph-image.tsx
git commit -m "feat(og): /board/announcements/[id] meta + 동적 OG 이미지"
```

---

### Task 6: `/board/suggestions/[id]` — generateMetadata + opengraph-image

**Files:**
- Modify: `vet-exam-ai/vet-exam-ai/app/board/suggestions/[id]/page.tsx`
- Create: `vet-exam-ai/vet-exam-ai/app/board/suggestions/[id]/opengraph-image.tsx`

Task 5와 동일한 패턴. kind = `"suggestion"`, pill 라벨 = `"건의"`, 제목 suffix = `"KVLE 건의"`.

- [ ] **Step 1: `page.tsx` 확인 + generateMetadata 추가**

먼저 기존 `app/board/suggestions/[id]/page.tsx` 의 import 블록 구조를 확인 (announcements와 동일한 구조일 것). 그 후 import 블록 뒤에 다음을 삽입:

```tsx
import type { Metadata } from "next";
import { fetchBoardPostMeta } from "@/lib/og/fetch-meta";

export async function generateMetadata({
  params,
}: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const meta = await fetchBoardPostMeta(id, "suggestion");
  if (!meta || !meta.visible) {
    return {
      title: "KVLE — 건의",
      robots: { index: false },
    };
  }
  const title = `${meta.title} — KVLE 건의`;
  const description =
    meta.commentsCount > 0
      ? `댓글 ${meta.commentsCount}개 · 추천 ${meta.upvoteCount}`
      : `KVLE 건의 — 추천 ${meta.upvoteCount}`;
  return {
    title,
    description,
    openGraph: { title, description, type: "article" },
    twitter: { card: "summary_large_image", title, description },
  };
}
```

만약 `page.tsx`가 이미 별도 `export const metadata` 또는 다른 `generateMetadata`를 갖고 있다면 — 그것을 위 함수로 **교체**한다 (두 export가 충돌하면 빌드 실패).

- [ ] **Step 2: `opengraph-image.tsx` 작성**

전체 내용 — `vet-exam-ai/vet-exam-ai/app/board/suggestions/[id]/opengraph-image.tsx`:

```tsx
import { ImageResponse } from "next/og";
import { fetchBoardPostMeta } from "@/lib/og/fetch-meta";
import { loadPretendard } from "@/lib/og/pretendard";
import { renderOgCard } from "@/lib/og/render-card";

export const runtime = "nodejs";
export const alt = "KVLE 건의";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function SuggestionOgImage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [meta, pretendard500, pretendard700] = await Promise.all([
    fetchBoardPostMeta(id, "suggestion"),
    loadPretendard(500),
    loadPretendard(700),
  ]);

  if (!meta || !meta.visible) {
    const fonts: { name: string; data: ArrayBuffer; weight: 500 | 700 }[] = [];
    if (pretendard500) fonts.push({ name: "Pretendard", data: pretendard500, weight: 500 });
    if (pretendard700) fonts.push({ name: "Pretendard", data: pretendard700, weight: 700 });
    return new ImageResponse(
      renderOgCard({ headline: "KVLE 건의", pill: null, metrics: "" }),
      { ...size, fonts: fonts.length > 0 ? fonts : undefined },
    );
  }

  const metrics =
    meta.commentsCount > 0 || meta.upvoteCount > 0
      ? `댓글 ${meta.commentsCount} · 추천 ${meta.upvoteCount}`
      : "";

  const fonts: { name: string; data: ArrayBuffer; weight: 500 | 700 }[] = [];
  if (pretendard500) fonts.push({ name: "Pretendard", data: pretendard500, weight: 500 });
  if (pretendard700) fonts.push({ name: "Pretendard", data: pretendard700, weight: 700 });

  return new ImageResponse(
    renderOgCard({
      headline: meta.title,
      pill: "건의",
      metrics,
      byline: meta.authorNickname,
    }),
    { ...size, fonts: fonts.length > 0 ? fonts : undefined },
  );
}
```

- [ ] **Step 3: typecheck + lint**

```bash
cd vet-exam-ai && npx tsc --noEmit && npm run lint
```

Expected: exit 0.

- [ ] **Step 4: commit**

```bash
git add vet-exam-ai/app/board/suggestions/[id]/page.tsx vet-exam-ai/app/board/suggestions/[id]/opengraph-image.tsx
git commit -m "feat(og): /board/suggestions/[id] meta + 동적 OG 이미지"
```

---

### Task 7: 빌드 검증 + 수동 smoke

**Files:** (no files)

코드베이스는 unit 테스트가 없으므로 `npm run build` + dev server browser 점검으로 검증.

- [ ] **Step 1: 빌드 검증**

```bash
cd vet-exam-ai && npm run build
```

Expected: `Compiled successfully`. opengraph-image 라우트가 `λ` (dynamic) 또는 `ƒ`로 표시되면 정상. 빌드 에러 발생 시 fix until clean.

- [ ] **Step 2: dev server 띄우기**

```bash
cd vet-exam-ai && npm run dev
```

Background 실행. http://localhost:3000 접근 가능 확인.

- [ ] **Step 3: 문제 OG meta — view-source 점검**

브라우저에서 `http://localhost:3000/questions/<유효한_KVLE_ID>` 진입 후 `Ctrl+U` (view-source).

다음 meta 태그가 보여야 함:
- `<meta property="og:title" content="KVLE-XXXX · <카테고리> — KVLE">`
- `<meta property="og:description" content="<카테고리> 문제 · 댓글 ...">`
- `<meta property="og:type" content="article">`
- `<meta property="og:image" content=".../questions/<id>/opengraph-image">`
- `<meta name="twitter:card" content="summary_large_image">`

**저작권 가드 점검**: title/description/image URL 어디에도 회차, 연도, 교시, 문제 본문, 정답, 해설이 없는지 확인.

- [ ] **Step 4: 문제 OG image — 직접 GET**

브라우저 새 탭: `http://localhost:3000/questions/<유효한_KVLE_ID>/opengraph-image`

기대: 1200×630 PNG가 렌더링. KVLE-NNNN, 카테고리 pill, 댓글 수가 보여야 함. **한글이 □가 아닌 정상 글리프**로 보여야 함.

- [ ] **Step 5: 게시판 OG meta + image 점검**

같은 방식으로 공지/건의 글 점검:
- `http://localhost:3000/board/announcements/<id>` view-source — og:title이 `<제목> — KVLE 공지`
- `http://localhost:3000/board/announcements/<id>/opengraph-image` — 헤드라인 = 제목, pill = "공지"
- 건의 글도 동일하게 점검

- [ ] **Step 6: 없는 ID fallback 점검**

`http://localhost:3000/questions/존재하지않는ID/opengraph-image` 접근 시 fallback meta + 루트 OG 이미지 (KVLE 로고) 응답 확인. 500 에러가 아니어야 함.

- [ ] **Step 7: dev server 종료 + final commit**

dev server 종료. 만약 검증 중 수정 필요했다면 그 commit 별도. smoke 통과 후:

```bash
git log --oneline feat/og-deeplink ^main
```

Expected: 6개 commit (Task 1-6 각 1개). 추가 fix commit이 있어도 OK.

- [ ] **Step 8: push + PR 생성**

```bash
git push -u origin feat/og-deeplink
```

PR 본문에 다음 포함:
- 범위: 3개 라우트 (questions / announcements / suggestions)
- 저작권 가드: OG 어디에도 회차/연도/본문/정답/해설 없음
- Smoke checklist (위 Step 3-6 결과)
- 사용자가 카톡 미리보기 한 번 점검 부탁 (Vercel Preview URL을 카톡에 붙여넣기)
