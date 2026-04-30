# 검색 1차 (Search v1) — 문제 / 해설 / 선지 / community_notes 검색

**날짜**: 2026-04-30
**범위**: ROADMAP §H / PRD #44 — 검색 1차 (문제 본문 + 해설 + 카테고리/topic + 선지 + tags + community_notes)
**제외**: 댓글 검색 (2차), 글로벌 omnibox/자동완성 (2차), 외부 SEO 색인 (§24 종속)

## 목표

콘텐츠 발견성 확보 — 학습자가 키워드("PRRSV", "프로프라놀롤", "급성위염")로 관련 문제를 찾고, 시딩 §20 진입 직전까지 운영의 마지막 게이트를 해소한다.

## 핵심 결정 요약

| 항목 | 결정 | 사유 |
|---|---|---|
| 토크나이저 | Postgres `simple` config + `pg_trgm` 보조 | Supabase managed에 mecab-ko 불가, simple+trigram이 의학 약어/외래어/오타에 강함 |
| 검색 대상 컬럼 | `question`, `explanation`, `topic`, `choices`, `subject`, `tags`, `community_notes` | 선지 키워드 역검색 + vet40 수험생 팁 발견성 |
| KVLE-NNNN 직접 입력 | 즉시 `/questions/<KVLE>` redirect | 인덱스 우회, exact match는 라우팅으로 |
| UX 진입 | 신규 `/search` 라우트 + NavBar 검색 아이콘 | `/questions` 필터 게이트와 의도 분리 |
| 랭킹 | `setweight` 가중치 (A=question, B=explanation+topic, C=choices+subject+tags, D=community_notes) | 본문 매칭이 댓글/태그 매칭보다 위 |
| 인덱싱 방식 | `tsvector GENERATED ALWAYS AS (...) STORED` + GIN | 트리거 사고 위험 0, 백필 자동 |
| 결과 카드 | KVLE + 카테고리 + **매칭 라벨** chip + `ts_headline` 스니펫 + 댓글 카운트 | "왜 매칭됐는지" 즉시 파악 |
| 페이지네이션 | 30개/페이지 정수 페이지, URL `?page=` 공유 가능 | `/questions`와 동선 일치 |
| 0건 처리 | `pg_trgm` similarity 기반 "혹시 이 검색어?" 5개 제안 | trigram fallback은 0건 케이스 전용, 점수 합산 안 함 |
| 인증 / 비활성 | auth gate (UX), `is_active=true`만 검색 | 의도된 노출 보류 374건 유지 |
| 저작권 가드 | round/session/year 직접 노출 금지 (정책 유지). 본문 마스킹은 1차 안 함 | vet40 본문에 회차 단어 포함 가능성 거의 0, 발견 시 hotfix |

## 데이터 모델 + 인덱스

```sql
create extension if not exists pg_trgm;

alter table questions
  add column if not exists search_tsv tsvector
  generated always as (
    setweight(to_tsvector('simple', coalesce(question, '')), 'A') ||
    setweight(to_tsvector('simple',
      coalesce(explanation, '') || ' ' || coalesce(topic, '')), 'B') ||
    setweight(to_tsvector('simple',
      coalesce(array_to_string(choices, ' '), '') || ' ' ||
      coalesce(subject, '') || ' ' ||
      coalesce(array_to_string(tags, ' '), '')), 'C') ||
    setweight(to_tsvector('simple', coalesce(community_notes, '')), 'D')
  ) stored;

create index if not exists questions_search_tsv_idx
  on questions using gin (search_tsv);

create index if not exists questions_question_trgm_idx
  on questions using gin (question gin_trgm_ops);
create index if not exists questions_explanation_trgm_idx
  on questions using gin (explanation gin_trgm_ops);
```

- GENERATED STORED는 ALTER TABLE에서 전체 재작성 잡지만 3,201행은 즉시 끝
- 마이그 파일 idempotent (`if not exists`), Supabase Dashboard SQL Editor 한 번 실행
- round/session/year/created_at/source는 의도적으로 인덱스 제외

## 검색 RPC

```sql
create or replace function search_questions(
  q text,
  category_filter text default null,
  recent_years integer default null,
  page_size integer default 30,
  page_offset integer default 0
) returns table (
  id text, public_id text, question text, category text, year integer, is_active boolean,
  matched_in text, headline text, rank real, total_count bigint
) language plpgsql stable security invoker
set search_path = public as $$
declare
  tsq tsquery;
  year_cutoff integer;
begin
  if length(coalesce(q, '')) < 2 then return; end if;
  tsq := websearch_to_tsquery('simple', q);

  if recent_years is not null then
    select max(year) - recent_years + 1 into year_cutoff
    from questions where is_active = true and year is not null;
  end if;

  return query
  with matches as (
    select
      qs.id, qs.public_id, qs.question, qs.category, qs.year, qs.is_active,
      qs.explanation, qs.choices, qs.topic, qs.community_notes,
      ts_rank_cd(qs.search_tsv, tsq) as rank,
      case
        when to_tsvector('simple', coalesce(qs.question, '')) @@ tsq then 'question'
        when to_tsvector('simple',
          coalesce(qs.explanation, '') || ' ' || coalesce(qs.topic, '')) @@ tsq then 'explanation'
        when to_tsvector('simple',
          coalesce(array_to_string(qs.choices, ' '), '') || ' ' ||
          coalesce(qs.subject, '') || ' ' ||
          coalesce(array_to_string(qs.tags, ' '), '')) @@ tsq then 'choices'
        when to_tsvector('simple', coalesce(qs.community_notes, '')) @@ tsq then 'community_notes'
        else 'question'
      end as matched_in
    from questions qs
    where qs.is_active = true
      and qs.search_tsv @@ tsq
      and (category_filter is null or qs.category = category_filter)
      and (year_cutoff is null or qs.year >= year_cutoff)
  ),
  counted as (
    select *, count(*) over () as total_count from matches
  )
  select
    counted.id, counted.public_id, counted.question, counted.category,
    counted.year, counted.is_active, counted.matched_in,
    ts_headline('simple',
      case counted.matched_in
        when 'explanation' then counted.explanation
        when 'choices' then array_to_string(counted.choices, ' / ')
        when 'community_notes' then counted.community_notes
        when 'topic' then counted.topic
        else counted.question
      end,
      tsq,
      'StartSel=<mark>, StopSel=</mark>, MaxWords=20, MinWords=5, MaxFragments=1'
    ) as headline,
    counted.rank,
    counted.total_count
  from counted
  order by counted.rank desc, counted.year desc nulls last, counted.id
  limit page_size offset page_offset;
end $$;

create or replace function suggest_similar_queries(q text)
returns table (suggestion text, similarity real)
language sql stable security invoker
set search_path = public as $$
  select word, similarity(word, q) as sim
  from (
    select unnest(string_to_array(question, ' ')) as word from questions where is_active
    union all
    select unnest(string_to_array(explanation, ' ')) as word from questions where is_active
  ) w
  where length(word) >= 2 and similarity(word, q) > 0.3
  group by word, sim
  order by sim desc
  limit 5;
$$;
```

- `security invoker` + `set search_path = public` (memory `security_definer_trigger.md` 회피 — 본 RPC는 RLS 통과 read만)
- `total_count`는 window function으로 동일 쿼리에서 계산 (1만 행 도달 시 별도 count RPC로 분리 검토)

## API 라우트

**신규**: `vet-exam-ai/app/api/search/route.ts`

```
GET /api/search?q=...&category=...&recent_years=...&page=0
```

처리 순서:
1. `q` 검증 — 길이 < 2 → `{ items: [], total: 0, suggestions: [], error: 'too_short' }` (200)
2. `q` 정규식 `/^KVLE-\d+$/i` 매치 → `{ redirect: '/questions/<KVLE-NNNN-uppercased>' }` (200)
3. `supabase.rpc('search_questions', { ... })` 호출
4. 결과 0건이면 `supabase.rpc('suggest_similar_queries', { q })` 호출
5. 응답: `{ items: [...], total, page, pageSize: 30, suggestions: [...] | [], redirect: null }`

댓글 카운트는 클라가 결과 hydrate 후 `/api/comments/counts?ids=...` (기존) 별도 호출 — 검색 RPC는 가볍게 유지.

## UI

**신규**:
- `vet-exam-ai/app/search/page.tsx` (클라 컴포넌트, `useSearchParams` 기반, auth gate)
- `vet-exam-ai/components/SearchBar.tsx` (재사용 가능 입력 + Enter 핸들러)
- `vet-exam-ai/lib/hooks/useSearch.ts` (fetch + 결과 캐시 + 최근 검색어 sessionStorage 5개)

**수정**:
- `vet-exam-ai/components/NavBar.tsx` — 검색 아이콘 버튼 추가, `/search` 링크

**흐름**:

1. NavBar 검색 아이콘 클릭 → `/search` (q 없으면 입력 안내 + 최근 검색어 5개 chip)
2. 입력 + Enter → URL `?q=...`로 push, fetch
3. 결과 카드:
   - KVLE-NNNN (mono)
   - 카테고리 chip
   - 매칭 라벨 chip — `matched_in`별로 "본문" / "해설" / "선지" / "주제" / "암기팁"
   - `headline` 안전 렌더링 (`<mark>` 태그만 허용 — `dangerouslySetInnerHTML` + sanitize-html allowlist)
   - 댓글 수 배지 (hydrate 후)
4. 클릭 → `/questions/<publicId>?from=search&q=...` (prev/next list context = 검색 결과 publicId 배열 sessionStorage, 30분 TTL — `p1_mobile_ux_done.md` 패턴 재사용)
5. 0건 + suggestions ≥ 1 → "혹시 이 검색어를 찾으시나요?" 5개 chip (클릭 시 그 검색어로 재조회)
6. KVLE-NNNN 정확 입력 → 서버 응답 `redirect` 필드 따라 즉시 `router.push`
7. 사이드 필터:
   - 과목 select (현 18 카테고리, `app/questions/page.tsx`의 FIXED_CATEGORIES 재사용 — 추출해서 공용 모듈로)
   - 최근기출 chip (전체 / 5 / 7 / 10개년)
   - 변경 시 URL 동기화

저작권 가드: 결과 카드는 `/questions` 카드와 1:1 — round/session/year 직접 노출 안 함 (year는 정렬 용도로 RPC가 받지만 클라 매핑에서 제외).

## 에러 / 엣지 / 테스트

**에러 처리**:
- RPC 실패 → 500 + "검색 중 오류가 발생했습니다" UI + 재시도 버튼
- 네트워크 실패 → 재시도 가능
- `q` 길이 < 2 → 클라 사이드에서 안내 문구 ("2자 이상 입력해 주세요")

**엣지**:
- 한글/영문 혼용 ("PRRSV 백신") — `simple` config가 단어 단위로 분리
- 약어/숫자 ("CHF", "5HT") — 그대로 토큰화
- URL `?q=` URI 인코딩 — `decodeURIComponent` try/catch (memory `question_detail_decode_done.md` 한글 미디코드 트라우마 회피)
- 매우 긴 쿼리 (> 200자) — 클라에서 200자 자르고 안내
- SQL 인젝션 — `websearch_to_tsquery`가 자체 파싱, RPC 파라미터 바인딩 안전
- `<mark>` 외 태그 — sanitize-html allowlist `{ allowedTags: ['mark'], allowedAttributes: {} }`로 strip

**저작권 가드**:
- round/session/year 화면 비노출 정책 그대로 유지
- 본문/해설에 회차 단어 노출되는지 시딩 §20 단계에서 모니터, 발견 시 사후 마스킹 hotfix

**성능**:
- 3,201행에서 GIN + 가중치 정렬 즉시 (~수십 ms)
- `total_count` window function은 매 쿼리 전체 매칭 카운트 — 매칭 1만 건 미만에서 무시 가능
- 1만 행 도달 시 `total_count`를 별도 count RPC로 분리 검토

**테스트**:
- vitest 단위: `formatSearchUrl(qs)`, `decodeQueryParam(raw)`, `parseKvleId(input)`, sanitize-html allowlist
- RPC: 마이그 후 SQL Editor에서 수동 verify (3~5건 샘플 쿼리 — "PRRSV", "프로프라놀롤", "급성위염", "KVLE-0001", 0건 케이스)
- 빌드: `npx tsc --noEmit` (`npm run typecheck` 미존재 — memory `vote_sort_done.md`)
- 수동 UX: NavBar → /search → 검색 → 결과 클릭 → prev/next 동작 → 카테고리 필터 좁히기 → 0건 시 suggestion → KVLE 정확 입력 → redirect

## 마이그 + 작업 순서

1. 마이그 SQL 파일 작성 (`20260430000000_search_v1.sql` — extension + tsvector + 인덱스 + RPC 2종)
2. Supabase Dashboard SQL Editor에서 한 번 실행 (memory `community_tables_done.md` 함정: CLI `db push`가 "up to date" 거짓말 함 → SQL Editor 우회)
3. typed schema 갱신 (`vet-exam-ai/lib/supabase/types.ts`에 `search_questions`, `suggest_similar_queries` Functions 추가)
4. API route → hook → 페이지 → NavBar 순으로 구현
5. 수동 UX 검증 후 PR

## 범위 외 (1차 명시 제외)

- 댓글 검색 (2차 — RLS/블라인드/스니펫 정책 확정 후)
- 글로벌 omnibox / 자동완성 / debounce drop-down (2차)
- SEO meta / OG 카드 (§24 SEO 결정 + L. 딥링크 단계)
- 검색 분석 (어떤 쿼리가 0건인지 로깅) — 시딩 후 검토
- mecab-ko / pg_bigm 형태소 업그레이드 — 1차 운영 데이터 보고 결정

## 후속 폴리시 후보 (별건)

- 매우 흔한 쿼리 캐시 (Redis / Supabase Edge cache)
- "최근 검색어" 서버측 (사용자별, 기기 동기화)
- 즐겨찾기 검색어 — 시딩 §20 진행 시 학습자 관찰 후 결정
