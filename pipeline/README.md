# 기출문제 파이프라인 — 다음 세션 작업 가이드

## 목표
HWP 기출문제 파일 → 파싱 → 재작성(저작권 우회) → Supabase `questions` 테이블 삽입

---

## 폴더 구조

```
vet-exam-ai/                        ← GitHub 레포 루트
├── raw-exams/                      ← 원본 HWP 파일 (.gitignore 처리됨)
│   ├── 2024/
│   │   ├── 01_해부학.hwp
│   │   ├── 02_생리학.hwp
│   │   └── ... (20과목)
│   ├── 2023/
│   └── 2022/
│
├── pipeline/                       ← 변환 스크립트 (이 폴더)
│   ├── README.md                   ← 이 파일
│   ├── extract.py                  ← HWP → 텍스트 추출 (미작성)
│   ├── parse.py                    ← 텍스트 → 구조화 JSON (미작성)
│   ├── rewrite.py                  ← Claude API로 문제 재작성 (미작성)
│   ├── upload.py                   ← JSON → Supabase 삽입 (미작성)
│   └── output/                     ← 중간 결과물 (.gitignore 처리됨)
│       ├── 2024_01_해부학.json
│       └── images/
│           └── 2024_q012_fig1.png
│
└── vet-exam-ai/                    ← Next.js 앱 코드 (건드리지 않음)
```

---

## 수의사 국가시험 20과목

| # | 과목명 |
|---|--------|
| 01 | 해부학 |
| 02 | 생리학 |
| 03 | 생화학 |
| 04 | 약리학 |
| 05 | 병리학 |
| 06 | 미생물학 |
| 07 | 기생충학 |
| 08 | 면역학 |
| 09 | 내과학 |
| 10 | 외과학 |
| 11 | 산과학 |
| 12 | 영상진단학 |
| 13 | 임상병리학 |
| 14 | 예방수의학 |
| 15 | 수의공중보건학 |
| 16 | 식품위생학 |
| 17 | 수의법규 |
| 18 | 가축전염병학 |
| 19 | 독성학 |
| 20 | 야생동물학 |

> ※ 실제 HWP 파일 이름에 맞게 위 표를 수정할 것

---

## Supabase `questions` 테이블 스키마

```ts
{
  id: string;           // 예: "2024_01_q001"
  question: string;     // 문제 본문
  choices: string[];    // 선택지 배열 ["①...", "②...", ...]
  answer: string;       // 정답 (choices 중 하나와 일치)
  explanation: string;  // 해설
  category: string;     // 현재 앱에서 쓰는 과목명 (아래 매핑 참고)
  subject: string;      // 세부 과목
  topic: string | null; // 주제 키워드
  difficulty: "easy" | "medium" | "hard" | null;
  source: "past_exam";  // 기출 기반이면 이 값
  year: number;         // 출제 연도
  tags: string[];       // 추가 태그
  is_active: boolean;   // true로 삽입
}
```

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

1. `raw-exams/` 에 HWP 파일 복사 (과목별 연도별 정리)
2. 20과목 파일명 목록 확인 → 위 표 업데이트
3. 이미지 포함 문제 비율 파악 (전략 결정)
4. `extract.py` 작성 시작
5. 샘플 1~2개 과목으로 전체 파이프라인 테스트
6. 검증 후 전체 과목 배치 실행
