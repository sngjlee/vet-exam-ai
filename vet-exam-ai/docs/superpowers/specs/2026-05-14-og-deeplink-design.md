# OG 카드 / 딥링크 — 설계 문서

- 날짜: 2026-05-14
- 관련: PRD §L (런칭 보강 / M5 — T1으로 끌어옴), ROADMAP T2 → P1 승격
- 선행: KVLE-NNNN 채번 (PR #22), comment deep link (`?comment=<id>` — CommentThread.tsx L338-361, 이미 구현됨)

## 목적

시딩 시 외부 채널(카톡/슬랙/디스코드/X)에 KVLE 링크를 공유할 때, **이미지 미리보기 + 메타 텍스트**가 자동으로 뜨도록 한다. 클릭률 차이가 크고 시딩 ROI에 직결.

## 범위

- `/questions/[id]` — 문제 상세
- `/board/announcements/[id]` — 공지
- `/board/suggestions/[id]` — 건의

(프로필·검색·랜딩은 본 spec 범위 밖. 랜딩은 `app/layout.tsx`의 기본값 사용.)

## 비-목적

- 한국어 입력 동적 라우팅(검색·프로필 OG)은 별 PR
- OG 이미지 안에 정답·해설·문제 본문 노출 — **저작권 가드 위반**

## 저작권 가드 (확정)

OG 이미지 및 meta 텍스트에 **노출 금지** 정보:

- 회차 / 연도 / 교시 — memory `p0_feedback_done.md` 원칙. PRD §L의 "회차 노출"은 **이 spec에서 폐기**한다.
- 문제 본문 (`questions.question`)
- 정답 (`questions.correct`, `questions.answer_*`)
- 해설 (`questions.explanation`)

OG 이미지·meta에 노출 **허용**:

- KVLE-NNNN 공개 ID
- 카테고리 (예: "내과", "외과")
- 댓글 수 (`comments_count`)
- 추천 수 (`upvote_count`)
- 게시판 글의 경우: 제목, 작성자 닉네임 (익명/blind 글 제외)

## 아키텍처

Next 16 표준 패턴 — `opengraph-image.tsx` per route + `generateMetadata` per route.

```
app/
├── questions/[id]/
│   ├── layout.tsx            ← NEW (server, generateMetadata)
│   ├── opengraph-image.tsx   ← NEW (ImageResponse)
│   └── page.tsx              ← 기존 client, 변경 없음
├── board/announcements/[id]/
│   ├── page.tsx              ← 기존 server, generateMetadata export 추가
│   └── opengraph-image.tsx   ← NEW
└── board/suggestions/[id]/
    ├── page.tsx              ← 기존 server, generateMetadata export 추가
    └── opengraph-image.tsx   ← NEW

lib/og/
├── fetch-meta.ts             ← NEW: 세 라우트 공용 SELECT
├── render-card.tsx           ← NEW: ImageResponse JSX 템플릿 공용
└── pretendard.ts             ← NEW: 한글 폰트 arrayBuffer loader
```

`/questions/[id]/page.tsx`는 `"use client"`라 직접 metadata export 불가 — server `layout.tsx`로 우회.

`/board/announcements/[id]/page.tsx`는 이미 server async라 metadata export 직접 추가 가능.

## 데이터 페치

### 문제 (`lib/og/fetch-meta.ts` → `fetchQuestionMeta`)

```ts
type QuestionOgMeta = {
  publicId: string;   // KVLE-NNNN
  category: string;   // "내과"
  commentsCount: number;
};
```

- `questions` 테이블에서 `publicId` 또는 raw `id`로 단일 row.
- SELECT 컬럼 **화이트리스트**: `public_id, category`.
  `question`, `explanation`, `answer_*`, `round`, `year`, `session` 컬럼은 select하지 않는다 — 코드 레벨에서 저작권 가드 강제.
- 댓글 수는 별 쿼리: `comments` 테이블 `count('*', { count: 'exact', head: true }).eq('question_id', id)`. `questions`에 denormalized 카운트 컬럼 없음 (스키마 확인 완료).
- 문제 추천(upvote)은 현재 모델에 없음 — `comments`만 추천. OG에는 댓글 수만 노출.
- 못 찾으면 `null` 반환 → 호출자가 fallback meta로 처리.

### 게시판 (`fetchBoardPostMeta`)

```ts
type BoardOgMeta = {
  title: string;
  kind: "announcement" | "suggestion";
  authorNickname: string | null;   // 익명/blind 글은 null
  commentsCount: number;
  upvoteCount: number;
  visible: boolean;                // false면 OG 생성 스킵
};
```

- `board_posts` + `user_profiles_public` join 1회.
- `visibility !== 'visible'`이면 `visible: false` 반환 → 호출자가 noindex + 기본 OG 사용.

## OG 이미지 렌더링

### 템플릿 (`lib/og/render-card.tsx`)

브레인스토밍에서 확정한 "카드 형" 레이아웃 — 1200×630, `#080D1A` 다크 배경.

```
┌───────────────────────────────────────────┐
│ KVLE                                       │  ← 상단 좌측 로고 + 워드마크
│                                            │
│   KVLE-1234                                │  ← 큰 헤드라인 (96px bold)
│                                            │
│   ┌────────┐                               │
│   │  내과  │   댓글 12개                  │  ← 카테고리 pill + 메트릭
│   └────────┘                               │
│                                            │
│                                kvle.app    │  ← 우하단 도메인
└───────────────────────────────────────────┘
```

문제 카드: 문제 자체에 추천 시스템이 없으므로 댓글 수만 노출.

게시판 글의 경우 동일 템플릿에서:
- 헤드라인: 글 제목 (긴 제목은 2-line clip + ellipsis)
- pill: "공지" 또는 "건의"
- 메트릭: 댓글 수 · 추천 수 (board_posts는 둘 다 존재)
- (optional) 메트릭 옆 "by @닉네임" — 익명/blind 글은 생략

### Korean 폰트 로딩

`ImageResponse`는 기본적으로 한글 폰트가 없어 □ 박스로 뜬다. Pretendard subset을 fetch해서 폰트 데이터로 전달.

```ts
// lib/og/pretendard.ts
export async function loadPretendard(weight: 500 | 700): Promise<ArrayBuffer> {
  const url =
    weight === 700
      ? "https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/packages/pretendard/dist/public/static/Pretendard-Bold.otf"
      : "https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/packages/pretendard/dist/public/static/Pretendard-Medium.otf";
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Pretendard ${weight} fetch failed`);
  return res.arrayBuffer();
}
```

Next는 `ImageResponse` 두 번째 인자에 `fonts: [{ name, data, weight }]`를 받음. ArrayBuffer는 빌드 시 외부 호출이 아니라 **첫 요청 시** 받아 자동 캐싱.

### Runtime / 캐싱

- `export const runtime = "nodejs"` — Supabase fetch와 호환 (edge는 한글 폰트 사이즈 + Supabase JS edge 호환성 변수 많음).
- Next 16이 동일 params의 OG 이미지를 자동 캐싱 (`stale-while-revalidate`).
- 댓글/추천 카운트가 5분 stale해도 OK — 공유 미리보기 용도.

## 메타 태그

### 문제 (`/questions/[id]/layout.tsx`)

```ts
export async function generateMetadata({
  params,
}: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const meta = await fetchQuestionMeta(decodeURIComponent(id));
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
```

### 게시판

```ts
// announcements
export async function generateMetadata({ params }) {
  const { id } = await params;
  const meta = await fetchBoardPostMeta(id, "announcement");
  if (!meta?.visible) return { title: "KVLE — 공지", robots: { index: false } };
  const title = `${meta.title} — KVLE 공지`;
  const description = `댓글 ${meta.commentsCount}개 · 추천 ${meta.upvoteCount}`;
  return { title, description, openGraph: { title, description, type: "article" }, twitter: { card: "summary_large_image", title, description } };
}
```

`suggestions`도 동일 패턴, kind/copy만 다름.

## 딥링크 (확인)

- `?comment=<id>` 스크롤 + 1.5s highlight — **이미 구현됨** (CommentThread.tsx L338-361). 본 spec에서 코드 변경 없음.
- 본 spec 작업이 끝나면 게시판 댓글 deep link도 같은 패턴이 필요한지 별 issue로 검토. (게시판 댓글은 양이 적어 우선순위 낮음.)

## 엣지 케이스

| 상황 | 동작 |
|---|---|
| 문제 ID 못 찾음 (오타 / 삭제) | meta = generic, OG image = `/opengraph-image.tsx` 루트 fallback (Next 자동) |
| 한글 raw ID (legacy `2.4_공보_57회_q001`) | layout 안에서 `decodeURIComponent` (page.tsx와 동일 처리) |
| 게시판 글 soft-delete (visibility ≠ visible) | meta = "KVLE 공지" generic + `robots.index: false`, OG image도 루트 fallback |
| 카테고리 누락 | pill 생략, 헤드라인만 표시 |
| 댓글/추천 0개 | "같이 풀어볼까요?" copy, 메트릭 영역 생략 |
| Pretendard CDN 일시 실패 | catch → fonts 옵션 생략. Next 기본 폰트(라틴)만 렌더, 한글은 □로 뜸. 로그 남김. |
| 매우 긴 글 제목 | CSS `display: -webkit-box; -webkit-line-clamp: 2; overflow: hidden` |
| 익명 / blind 게시글 작성자 | `authorNickname = null`, "by @..." 라인 생략 |

## 검증 전략

1. **로컬**:
   - `npm run dev` → 브라우저 view-source에서 `<meta property="og:*">` 확인
   - `/questions/KVLE-1/opengraph-image` 직접 GET → PNG 1200×630 응답 확인
2. **Stage (Vercel Preview)**:
   - 실 URL을 Facebook Sharing Debugger / Twitter Card Validator에 입력
   - 카톡 채팅창에 직접 붙여넣어 미리보기 확인 (한글 폰트 렌더)
3. **저작권 가드 자동 점검**:
   - `fetch-meta.ts`에 SELECT 화이트리스트만 사용 — 코드 리뷰 시 column literal 검증
   - 시각 점검: OG 이미지에 회차/연도/문제 본문 없는지

## 마이그레이션

없음. 컬럼 추가 불요 — 기존 `comments_count`, `upvote_count`, `public_id`, `category_name`, `board_posts.comment_count` 모두 존재.

## 작업 분량

- `lib/og/fetch-meta.ts` (60 line)
- `lib/og/render-card.tsx` (120 line)
- `lib/og/pretendard.ts` (20 line)
- `app/questions/[id]/layout.tsx` (30 line)
- `app/questions/[id]/opengraph-image.tsx` (20 line)
- `app/board/announcements/[id]/page.tsx` generateMetadata 추가 (20 line)
- `app/board/announcements/[id]/opengraph-image.tsx` (20 line)
- `app/board/suggestions/[id]/page.tsx` generateMetadata 추가 (20 line)
- `app/board/suggestions/[id]/opengraph-image.tsx` (20 line)

총 ~330 line, 단일 PR, 마이그 없음. 예상 ~1.5h.

## 함정 (예상)

1. **client page + server layout** — page.tsx가 client일 때 layout.tsx가 server인 패턴은 Next 16에서 합법. layout.tsx가 children pass-through만 하면 hydration 충돌 없음. layout이 `<html>/<body>`를 가지면 안 됨 (루트 layout 1회만).
2. **Pretendard CDN** — `cdn.jsdelivr.net`은 빌드 환경 outbound 허용돼야 함. Vercel은 기본 허용. 첫 요청 한글 폰트 사이즈 ~500KB 로드 → Next이 이미지와 함께 캐싱.
3. **publicId 라우팅** — KVLE 라우팅이 publicId 우선이지만 URL에는 raw id가 올 수 있음. `fetchQuestionMeta`는 `publicId` OR `id` 둘 다 시도.
4. **board comment_count** — `board_posts.comment_count`는 trigger로 유지되는 denormalized 컬럼. OG는 이걸 그대로 사용 (실시간 정확도 불요).
6. **questions 댓글 수 카운트** — denormalized 컬럼 없음. `count('*', { count: 'exact', head: true })` 별 쿼리 1회. fetch-meta.ts에서 2개 쿼리(`questions` row + `comments` count) Promise.all로 묶어 latency 최소화.
5. **opengraph-image.tsx 라우트가 client page와 같은 폴더** — Next 16 routing rule상 OK. opengraph-image는 자동으로 server-only로 빌드됨.
