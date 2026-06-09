# 문제은행 파이프라인 운영 루틴

문제은행 파이프라인은 원천 HWP/이미지 자료를 재작성 JSON으로 만들고, Supabase `questions` 테이블과 이미지 트리아지 큐에 반영하는 반복 운영 절차입니다. 본 문서는 하루 작업 단위로 import batch, 검수 상태, rollback, topic cleanup, migration safety를 묶어 관리합니다.

## 원칙

- 원본 HWP, 추출 텍스트, 중간 JSON, 이미지 원본은 공개 repo와 운영 로그에 올리지 않습니다.
- `pipeline/.env`에는 `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `ANTHROPIC_API_KEY`만 두고, 실행 로그에는 key나 원본 파일 path를 남기지 않습니다.
- Production 적용 전에는 같은 명령을 `--dry-run`, `--limit`, `--filter`로 preview/staging에서 먼저 실행합니다.
- 신규 DB 객체나 RLS 변경이 필요하면 `docs/operations/migration-runbook.md`를 먼저 따릅니다.
- 이미지 포함 문제는 기본적으로 `is_active=false`로 들어가며 `/admin/image-questions`에서 검수 후 활성화합니다.

## 하루 운영 순서

| 순서 | 작업 | 명령/화면 | 완료 기준 |
|---:|---|---|---|
| 1 | 작업 범위 고정 | batch 이름, 과목, 회차, 원천 파일 수 기록 | 예: `66회 1.1 해부 20문항` |
| 2 | 환경 확인 | `cd pipeline`, `python -m pip install -r requirements.txt` | 가상환경과 `.env`가 준비됨 |
| 3 | 재작성 결과 preview | `python upload.py <file> --dry-run --limit 3` | 첫 행 payload, active/inactive count 확인 |
| 4 | 이미지 파일 preview | `python upload_images.py --all --dry-run --filter <batch>` | 대상 파일 수와 content type 확인 |
| 5 | 이미지 업로드 | `python upload_images.py --all --filter <batch>` | failed=0 |
| 6 | 문제 row 업로드 | `python upload.py <file>` 또는 `python upload.py --all --filter <batch>` | files_failed=0, row count 기록 |
| 7 | 관리자 검수 | `/admin/questions`, `/admin/image-questions` | 텍스트 문제 공개, 이미지 문제 큐 진입 확인 |
| 8 | topic 보강 | `python backfill_topics.py ... --dry-run`, 이후 소량 `--apply` | topic 품질 표본 승인 |
| 9 | 검색 확인 | `/search?q=<topic 또는 문항 핵심어>` | 문제/해설/과목/topic 검색 노출 확인 |
| 10 | 작업 기록 | 운영 티켓 또는 내부 노트 | batch, 명령, row count, 실패/rollback 여부 기록 |

## Import Batch 기준

`pipeline/upload.py`는 `pipeline/output/rewritten/*.json`의 `questions[]`만 사용합니다.

권장 명령:

```powershell
cd C:\Users\Theriogenology\Desktop\vet-exam-ai\pipeline
python upload.py output\rewritten\1.1_해부_66회.json --dry-run --limit 3
python upload.py output\rewritten\1.1_해부_66회.json
```

대량 적용은 파일명 필터로 쪼갭니다.

```powershell
python upload.py --all --filter 1.1 --dry-run
python upload.py --all --filter 1.1
```

주의:

- `id` 기준 upsert라 같은 batch 재실행은 가능하지만, 이미지 분류가 시작된 기존 row를 다시 업로드하면 `is_active=false`로 되돌릴 수 있습니다.
- 같은 원천 문제번호가 중복 파싱되면 스크립트가 `b`, `c` suffix를 붙여 보존합니다. 운영 기록에 중복 보정 건수를 남깁니다.
- 업로드 전 `rows_active`, `rows_inactive` 수가 예상과 크게 다르면 적용하지 않습니다.

## 이미지 검수 루틴

이미지는 `question-images-private` bucket에 업로드되고, 파일명은 `_storage_key.py`의 ASCII key 규칙으로 정규화됩니다.

```powershell
python upload_images.py --all --dry-run --filter 1.1
python upload_images.py --all --filter 1.1
```

업로드 뒤 `/admin/image-questions`에서 다음을 처리합니다.

| 상태 | 의미 | 후속 조치 |
|---|---|---|
| 미분류 | `has_image` tag가 있지만 triage row 없음 | 원본 이미지와 문항을 비교합니다. |
| `activate_no_image` | 이미지 없이 공개 가능 | bulk activate 또는 단건 결정합니다. |
| `needs_rewrite` | 문항/해설 재작성 필요 | 공개 전 수정 대기 상태로 둡니다. |
| `needs_replacement` | 대체 이미지 필요 | 이미지 교체 후 활성화합니다. |
| `activate_with_replacement` | 대체 이미지로 공개 | 원본 파일 목록은 original 컬럼에 보존됩니다. |
| `reject` | 공개 부적합 | 공개하지 않고 사유를 note에 남깁니다. |

검수 액션은 `image_triage_decide` 또는 `image_triage_revert` audit으로 남아야 합니다. 누락이 의심되면 `docs/operations/admin-audit-coverage.md`의 SQL 테스트를 실행합니다.

## Topic Cleanup

topic은 검색과 필터 품질에 직접 영향을 줍니다. 먼저 dry-run으로 품질을 보고, 과목별 50개 이하 단위로 적용합니다.

```powershell
python backfill_topics.py --generate-missing --dry-run --category 내과학 --limit 20 --preview-output output\topic-preview.json
python backfill_topics.py --generate-missing --apply --category 내과학 --limit 50
```

전체 정리는 2단계 스크립트를 사용합니다.

```powershell
.\topic_cleanup_2step.ps1 -PreviewBackfill
.\topic_cleanup_2step.ps1 -ApplyBackfill
.\topic_cleanup_2step.ps1 -SuggestAliases
.\topic_cleanup_2step.ps1 -ApplyAliases
```

적용 기준:

- topic은 2~20자 한국어 명사구를 우선합니다.
- 같은 질병/약물군/검사법은 가능한 한 같은 topic으로 모읍니다.
- alias 적용은 high confidence부터 시작하고, 대량 normalize 전 `/search`에서 대표 query를 확인합니다.

## Rollback 기준

| 문제 | 우선 조치 | 복구 방법 |
|---|---|---|
| 잘못된 row upsert | batch 적용 중지 | 해당 `id` 목록을 기준으로 admin edit 또는 수동 SQL update |
| 이미지 파일 오업로드 | 공개 전이면 영향 제한 | `question-images-private`에서 해당 key 삭제 후 재업로드 |
| 이미지 문제 오활성화 | 즉시 비활성화 | `/admin/image-questions`에서 revert 또는 `/admin/questions/{id}/edit`에서 `is_active=false` |
| topic 품질 불량 | 추가 apply 중지 | preview JSON 기준으로 alias 수정 또는 기존 topic 수동 복구 |
| migration 적용 실패 | 앱 배포 중지 | `docs/operations/migration-runbook.md`의 실패 시 절차 기록 |

삭제 SQL을 써야 할 때는 먼저 대상 `id` 목록과 row count를 select로 확인합니다. 운영 사고 기록에는 SQL 전문 대신 batch명, 영향 row 수, 복구 결과를 남깁니다.

## 배포 전 확인

```bash
cd vet-exam-ai
npm run check:migrations
npm run lint
npm run typecheck
```

문제 row나 검색 관련 migration을 바꾼 경우에는 `npm run build`도 실행합니다. 배포 후 `/admin/questions`, `/admin/image-questions`, `/search`, 대표 문제 상세 페이지를 표본 확인합니다.
