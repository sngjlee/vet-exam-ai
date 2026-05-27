# Topic Backfill Runbook

기존 `questions.topic`이 비어 있는 문제에 topic을 채우기 위한 다음 세션 실행 절차입니다.

## 전제

- `pipeline/.env`에 `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `ANTHROPIC_API_KEY`가 있어야 합니다.
- 실제 DB 업데이트는 `--apply`를 붙일 때만 실행됩니다.
- `--apply`에서 `--limit` 없이 전체 적용하려면 `--confirm-all`이 추가로 필요합니다.

## 권장 순서

1. 환경 확인

```powershell
cd C:\Users\Theriogenology\Desktop\vet-exam-ai\pipeline
python -m pip install -r requirements.txt
```

`requirements.txt`가 없으면 현재 파이프라인 기준으로 아래 패키지가 필요합니다.

```powershell
python -m pip install anthropic httpx python-dotenv
```

2. 기존 rewritten JSON에 들어 있는 topic 후보만 확인

```powershell
python backfill_topics.py --from-rewritten --dry-run --limit 20
```

3. 새 topic 생성 preview

```powershell
python backfill_topics.py --generate-missing --dry-run --limit 20 --preview-output output/topic-preview.json
```

4. 과목 단위로 소량 적용

```powershell
python backfill_topics.py --generate-missing --apply --category 내과학 --limit 50
```

5. 전체 적용

```powershell
python backfill_topics.py --generate-missing --apply --confirm-all
```

## 선택 옵션

- `--category 내과학`: 특정 과목만 처리
- `--id <question_id>`: 특정 문제만 처리, 여러 번 지정 가능
- `--from-rewritten`: `pipeline/output/rewritten/*.json`에 이미 있는 topic 사용
- `--generate-missing`: topic 후보가 없으면 Anthropic으로 생성
- `--model claude-haiku-4-5`: topic 생성 모델 지정
- `--preview-output <path>`: 제안 목록을 JSON으로 저장
- `--force`: `--id`로 지정한 문제에 기존 topic이 있어도 새 제안 생성

## 운영 메모

- 현재 기존 rewritten JSON에는 topic이 거의 없을 가능성이 큽니다. 실질적인 backfill은 `--generate-missing` 경로를 쓰게 됩니다.
- 처음에는 `--limit 20` dry-run 결과를 보고 topic 품질을 확인한 뒤, 과목별 50개 단위로 적용하는 것을 권장합니다.
- topic은 필터 용도이므로 너무 세밀한 문장형보다 “질병명/검사법/약물군/처치명/장기계통” 같은 재사용 가능한 명사구가 좋습니다.
