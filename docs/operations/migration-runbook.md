# Supabase 마이그레이션 런북

KVLE의 마이그레이션은 **단일 트리** `vet-exam-ai/supabase/migrations/`에만 존재합니다(2026-07-09 통합).
Supabase 프로젝트 config(`config.toml`)와 `schema.sql`도 `vet-exam-ai/supabase/`에 있습니다.
과거 루트 `supabase/migrations/`(legacy)는 통합 시 이 트리로 흡수되어 은퇴했습니다 — 다시 만들지 않습니다.

> ⚠️ **프로덕션에 `supabase db push` / `db reset`를 돌리지 마세요.** 지금까지 마이그는 대부분
> SQL Editor로 수동 적용되어 prod의 `supabase_migrations.schema_migrations`에 55개 버전이
> 기록돼 있지 않을 가능성이 큽니다. 그 상태에서 push하면 전부 재적용을 시도해 비멱등 DDL에서
> 실패합니다. CLI가 적용 상태를 알게 하려면 먼저 `supabase migration repair --status applied <버전들>`로
> 히스토리를 정합화하세요. 일상 적용은 아래 SQL Editor 흐름을 씁니다.

## 1. 작성 전 확인

- 최신 active migration timestamp를 확인합니다.

```bash
ls vet-exam-ai/supabase/migrations
```

- 새 파일명은 `YYYYMMDDHHMMSS_short_description.sql` 형식으로 만듭니다.
- 같은 timestamp를 재사용하지 않습니다.
- 새 DB 객체를 앱 코드에서 참조한다면 `vet-exam-ai/lib/supabase/types.ts`도 함께 갱신합니다.
- SQL에는 개인정보 원문을 로그나 comment에 남기지 않습니다.

## 2. 로컬/CI 점검

```bash
cd vet-exam-ai
npm run check:migrations
npm run typecheck
```

`check:migrations`는 다음을 확인합니다.

- migration timestamp 중복 없음
- migration 파일명 형식
- 은퇴한 루트 `supabase/migrations/`에 `.sql`이 다시 생기지 않았는지(두 번째 트리 방지 가드)

## 3. SQL Editor 적용

Supabase Dashboard → SQL Editor에서 active migration 파일 내용을 붙여넣고 실행합니다.

적용 전:

- 대상 프로젝트가 Production인지 Preview/Staging인지 확인합니다.
- 파일 경로가 `vet-exam-ai/supabase/migrations/...`인지 확인합니다.
- destructive DDL 또는 대량 UPDATE/DELETE가 있으면 백업 시각을 먼저 확인합니다.

적용 후:

- SQL Editor 결과가 성공인지 확인합니다.
- 아래 검증 SQL 중 해당 항목을 실행합니다.
- `/admin/ops`에서 환경 설정과 cron 로그 조회가 깨지지 않는지 확인합니다.
- 앱 코드가 새 table/RPC/enum을 참조한다면 `npm run ci`를 통과시킵니다.

## 4. 검증 SQL 템플릿

테이블:

```sql
select table_schema, table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in ('cron_run_logs');
```

RLS policy:

```sql
select schemaname, tablename, policyname, cmd
from pg_policies
where schemaname = 'public'
  and tablename in ('cron_run_logs')
order by tablename, policyname;
```

RPC:

```sql
select n.nspname as schema_name, p.proname as function_name
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('purge_signup_proof_paths')
order by p.proname;
```

Enum:

```sql
select t.typname, e.enumlabel
from pg_type t
join pg_enum e on e.enumtypid = t.oid
join pg_namespace n on n.oid = t.typnamespace
where n.nspname = 'public'
  and t.typname in ('audit_action')
order by t.typname, e.enumsortorder;
```

## 5. 실패 시

- `relation does not exist`: migration 파일이 운영 DB에 적용되지 않았거나 다른 프로젝트에 적용했을 가능성이 큽니다.
- `function does not exist`: RPC signature가 SQL과 `types.ts`에서 다를 수 있습니다.
- `permission denied` 또는 RLS 오류: policy와 `public.is_admin()` 조건을 확인합니다.
- `type ... already exists`: 같은 migration을 중복 적용했거나 idempotent guard가 없습니다.

장애 대응 기록에는 SQL 전문보다 영향 범위, 적용 파일명, 검증 결과, 복구 조치를 남깁니다.
