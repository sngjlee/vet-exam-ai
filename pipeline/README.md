# 기출문제 파이프라인 — 다음 세션 작업 가이드

## 목표
HWP 기출문제 파일 → 파싱 → 재작성(저작권 우회) → Supabase `questions` 테이블 삽입

---

## 폴더 구조

```
vet-exam-ai/                        ← GitHub 레포 루트
├── raw-exams/                      ← 원본 HWP 파일 (.gitignore 처리됨)
│   ├── 1.1 해부/                   ← "교시.순번 축약과목명" 형식
│   │   ├── 2024.hwp
│   │   ├── 2023.hwp
│   │   └── 2022.hwp
│   ├── 1.2 조직/
│   │   ├── 2024.hwp
│   │   └── ...
│   └── ... (20과목, 아래 표 참고)
│
├── pipeline/                       ← 변환 스크립트 (이 폴더)
│   ├── README.md                   ← 이 파일
│   ├── extract.py                  ← HWP → 텍스트 추출 (미작성)
│   ├── parse.py                    ← 텍스트 → 구조화 JSON (미작성)
│   ├── rewrite.py                  ← Claude API로 문제 재작성 (미작성)
│   ├── upload.py                   ← JSON → Supabase 삽입 (미작성)
│   └── output/                     ← 중간 결과물 (.gitignore 처리됨)
│       ├── 1.1_해부_66회.json
│       └── images/
│           └── 1.1_해부_66회_q012_fig1.png
│
└── vet-exam-ai/                    ← Next.js 앱 코드 (건드리지 않음)
```

---

## 수의사 국가시험 20과목 (교시별)

| 폴더명 | 정식 과목명 | 교시 |
|--------|-------------|------|
| `1.1 해부` | 해부학 | 1교시 (기초) |
| `1.2 조직` | 조직학 | 1교시 (기초) |
| `1.3 생리` | 생리학 | 1교시 (기초) |
| `1.4 생화학` | 생화학 | 1교시 (기초) |
| `1.5 약리` | 약리학 | 1교시 (기초) |
| `1.6 독성` | 독성학 | 1교시 (기초) |
| `2.1 미생` | 미생물학 | 2교시 (예방) |
| `2.2 전염` | 전염병학 | 2교시 (예방) |
| `2.3 병리` | 병리학 | 2교시 (예방) |
| `2.4 공보` | 공중보건학 | 2교시 (예방) |
| `2.5 조류` | 조류질병학 | 2교시 (예방) |
| `2.6 수생` | 수생생물의학 | 2교시 (예방) |
| `2.7 기생` | 기생충학 | 2교시 (예방) |
| `2.8 실동` | 실험동물학 | 2교시 (예방) |
| `3.1 내과` | 내과학 | 3교시 (임상) |
| `3.2 임병` | 임상병리학 | 3교시 (임상) |
| `3.3 외과` | 외과학 | 3교시 (임상) |
| `3.4 영상` | 영상진단의학 | 3교시 (임상) |
| `3.5 산과` | 산과학 | 3교시 (임상) |
| `4.1 법규` | 수의법규 | 4교시 (법규, 실제로는 3교시와 동시 시행) |

> ※ 분포: 1교시 6 / 2교시 8 / 3교시 5 / 4교시 1 = 20과목

---

## Supabase `questions` 테이블 스키마

```ts
{
  id: string;                    // 예: "1.1_해부_66회_q001"
  question: string;              // 문제 본문
  choices: string[];             // 선택지 배열 ["①...", "②...", ...]
  answer: string;                // 정답 (choices 중 하나와 일치)
  explanation: string;           // 해설
  category: string;              // 현재 앱에서 쓰는 과목명 (아래 매핑 참고)
  subject: string;               // 세부 과목 (정식 명칭, 예: "해부학")
  session: 1 | 2 | 3 | 4;        // 교시 (※ 신규 컬럼 — 마이그레이션 필요)
  round: number;                 // 국시 회차 (예: 66) — ※ 신규 컬럼
  year: number;                  // 출제 연도 (예: 2022) — round + 1956 파생
  community_notes: string | null;// ※ 신규 — vet40 댓글 (수험생 정정·기억법)
  topic: string | null;          // 주제 키워드
  difficulty: "easy" | "medium" | "hard" | null;
  source: "past_exam";           // 기출 기반이면 이 값
  tags: string[];                // 추가 태그 (※ 4.1 법규는 ["session_3_동시"] 등)
  is_active: boolean;            // true로 삽입 (이미지 필수 문제는 1차에서 false)
}
```

### `community_notes` 필드 배경
원본이 vet40 기출 아카이빙 사이트인데, 그 사이트 특성상:
- 원본 문제/해설이 불완전하게 복원된 경우가 있어 수험생들이 **댓글로 정정·보완**
- 수험생들이 **외우기 쉬운 암기 팁**을 댓글로 공유
- 추천 많은 댓글을 모아서 공부하는 문화

→ HWP 테이블의 `댓글` 셀 내용을 버리지 말고 `community_notes`로 보존.
→ UI에서 "수험생 팁" 섹션으로 노출하는 기능 향후 구현 예정.

### 회차 ↔ 연도 매핑
- 공식: **`year = round + 1956`**  (66회 = 2022, 70회 = 2026 기준)
- 현재 아카이브 범위: 57회 (2013) ~ 66회 (2022), 총 10년
- 파일명의 `NN회`를 `round`에 저장하고 `year`는 계산으로 파생

### 현재 앱 category 값 (기존 문제와 일치시켜야 함)
```
"약리학" | "내과학" | "외과학" | "생화학" | "병리학"
```
> 20과목으로 확장 시 category 값 추가 필요 — `lib/questions.ts` 및 컬러 팔레트도 업데이트

---

## 파이프라인 단계별 계획

### Step 1: HWP 텍스트 추출 (`extract.py`)
```bash
pip install hwp5
hwp5txt 파일.hwp > 출력.txt
```
- 이미지가 포함된 문제: 텍스트 추출 후 `[IMAGE]` 플레이스홀더 삽입
- 이미지 파일은 별도 추출 (`hwp5` 라이브러리 지원)

### Step 2: 구조화 파싱 (`parse.py`)
- 추출된 텍스트에서 문제번호 / 문제 / 선택지 / 정답 분리
- Claude API 활용 권장 (HWP 포맷이 과목마다 다를 수 있음)
- 출력: JSON 배열

```json
[
  {
    "raw_question": "...",
    "choices": ["①...", "②...", "③...", "④...", "⑤..."],
    "answer": "③...",
    "has_image": false,
    "year": 2024,
    "subject": "해부학"
  }
]
```

### Step 3: 문제 재작성 (`rewrite.py`) ← 저작권 우회 핵심
- Claude API로 문제 표현을 바꾸되 지식/내용은 유지
- 해설도 새로 생성
- 프롬프트 예시:
  ```
  다음 수의사 국가시험 문제를 동일한 지식을 묻되
  표현을 완전히 바꿔서 새 문제로 재작성해줘.
  선택지 순서도 바꾸고, 해설도 새로 작성해줘.
  ```

### Step 4: Supabase 삽입 (`upload.py`)
- `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` 환경변수 필요
- 중복 방지: `id` 기준으로 upsert
- 이미지: Supabase Storage에 업로드 후 URL을 question 본문에 삽입

---

## 이미지가 있는 문제 처리 전략

**1차 (단기):** 이미지 문제는 건너뛰고 텍스트 문제만 먼저 처리
**2차 (중기):** 이미지를 Supabase Storage에 업로드, 문제 본문에 `<img>` URL 삽입
**3차 (장기):** `QuestionCard` 컴포넌트에 이미지 렌더링 지원 추가

---

## 환경 설정 (다음 세션 시작 전 준비)

```bash
# Python 환경
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install hwp5 anthropic supabase python-dotenv

# .env 파일 (pipeline/.env)
SUPABASE_URL=...
SUPABASE_SERVICE_KEY=...   # anon key 아닌 service_role key
ANTHROPIC_API_KEY=...
```

---

## 다음 세션 시작 시 할 일

1. `raw-exams/` 아래 20개 과목 폴더 이미 존재 (`1.1 해부/`, `2.1 미생/`, …) — 각 폴더에 연도별 HWP 복사만 하면 됨
2. Supabase `questions` 테이블에 `session` 컬럼 추가 마이그레이션 작성·실행
3. 이미지 포함 문제 비율 파악 (전략 결정)
4. `extract.py` 작성 시작 — `raw-exams/*/` 글롭으로 과목 폴더 순회, 폴더명에서 교시·과목 파싱
5. 샘플 1~2개 과목으로 전체 파이프라인 테스트 (권장: `1.1 해부` + `4.1 법규` — 기초/법규 양 극단 커버)
6. 검증 후 전체 과목 배치 실행
