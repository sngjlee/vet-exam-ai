# 검색 1차 운영 기준

검색 1차의 기본 범위는 문제 본문, 해설, 선지, 과목, topic, tag입니다. 댓글 검색은 `/api/search?include_comments=1`로만 포함하고, 기본 검색 화면에서는 문제은행 결과를 먼저 안정화합니다.

## 범위

- 기본 검색: `questions.search_tsv` 기반 FTS
- 포함 필드: `question`, `explanation`, `choices`, `subject`, `topic`, `tags`, `community_notes`
- 필터: 과목, 최근 5/7/10개년
- 단축 이동: `KVLE-숫자`
- 댓글 검색: 후속 단계에서 visible/RLS/SEO 기준을 확정한 뒤 UI에 노출

## 정렬과 표시

- 정렬은 FTS rank, 연도 내림차순, question id 순서입니다.
- `matched_in`은 `question`, `explanation`, `choices`, `subject`, `topic`, `tags`, `community_notes`로 분리합니다.
- 결과 headline은 매칭된 필드에서 생성합니다.

## 검증

1. 문제 본문 키워드가 본문 라벨로 표시된다.
2. 해설 키워드가 해설 라벨로 표시된다.
3. 과목, topic, tag 키워드가 각각 과목/주제/태그 라벨로 표시된다.
4. 과목 및 최근 연도 필터가 `total_count`와 페이지네이션을 깨뜨리지 않는다.
5. 기본 `/api/search` 응답에는 댓글 결과가 섞이지 않는다.
6. 댓글 포함 확인이 필요하면 `/api/search?include_comments=1`로 별도 확인한다.
