# AI 댓글 후보 생성·승인 운영 런북

이 기능은 문제와 공식 정답·해설을 바탕으로 기존 시딩 계정 명의의 댓글 **후보**를 만듭니다. 후보는 `/admin/ai-comments`에서 관리자가 승인해야만 공개 댓글이 됩니다. 생성 직후 자동 게시하지 않으며, 공개 댓글 UI에는 생성 방식이나 검수 상태를 나타내는 별도 표지를 추가하지 않습니다.

## 운영 불변 조건

- 기존 시딩 계정과 닉네임을 재사용합니다. 단일 AI 계정을 새로 만들지 않습니다.
- 생성 결과는 비공개 후보 큐에만 저장합니다. 관리자 승인 전 공개 댓글 수는 증가하지 않아야 합니다.
- 승인과 거절은 `/admin/ai-comments`에서 수행합니다. 승인된 후보만 한 번 게시되고, 거절된 후보는 게시되지 않습니다.
- `AI_COMMENT_GENERATION_ENABLED=false`가 기본값이며, migration·권한·관리자 화면·Cron 검증이 끝날 때까지 유지합니다.
- 이미지가 필요한 문항은 v1 생성 대상에서 제외합니다.
- 기존 수동 시딩 스크립트와 계정은 운영 자산으로 남지만, AI 후보 생성 경로는 자동 게시 경로와 분리합니다.

## 서버 전용 환경변수

모든 값은 서버 런타임에서만 읽습니다. 특히 `OPENAI_API_KEY`를 `NEXT_PUBLIC_` 이름으로 만들거나 클라이언트 번들, 로그, 티켓, 스크린샷에 노출하지 않습니다.

| 변수 | 기본값 | 목적 |
|---|---:|---|
| `OPENAI_API_KEY` | 비어 있음 | 실제 OpenAI 호출에만 필요한 비밀 키 |
| `AI_COMMENT_GENERATION_ENABLED` | `false` | 전체 생성 kill switch |
| `AI_COMMENT_MODEL` | `gpt-5.6-terra` | 후보 생성 모델 |
| `AI_COMMENT_PROMPT_VERSION` | `v1` | 중복 방지와 provenance에 사용하는 프롬프트 버전 |
| `AI_COMMENT_DAILY_LIMIT` | `5` | 하루 예약 가능한 provider 요청 수 |
| `AI_COMMENT_MONTHLY_REQUEST_LIMIT` | `150` | 월간 예약 가능한 provider 요청 수 |
| `AI_COMMENT_PENDING_LIMIT` | `50` | `generating`과 `pending` 후보의 합계 상한 |
| `AI_COMMENT_MAX_OUTPUT_TOKENS` | `800` | 요청당 최대 출력 토큰 |

API 키는 라이브 provider 호출을 실행할 때만 필요합니다. 키가 없어도 기본 비활성 상태의 배포, 정적 검증, 가짜 HTTP provider를 사용한 테스트는 가능합니다. 키가 없거나 스위치가 꺼져 있으면 운영자는 이를 정상적인 비활성 상태로 해석해야 하며, 임의의 대체 키를 넣지 않습니다.

일·월 요청 수와 대기 후보 수 상한은 애플리케이션/DB가 강제합니다. 반면 월 **USD 5** 예산과 알림은 OpenAI 프로젝트 대시보드의 운영 통제입니다. 달러 금액이 코드로 강제된다고 간주하거나 문서에 그렇게 보고하지 않습니다.

## `/admin/ops` 상태 해석

운영 화면은 비밀값이 아니라 상태와 안전한 집계만 표시합니다.

| 상태 | 의미 | 대응 |
|---|---|---|
| `API 키 누락` | 라이브 provider 키가 없음 | 서버 환경 범위에 키를 설정하되 값을 화면·로그에 복사하지 않음 |
| `생성 비활성` | 키는 있지만 kill switch가 꺼짐 | 승인된 rollout 전에는 정상 기본 상태로 유지 |
| `요청 상한 도달` | 일·월 또는 pending 상한 도달 | 자동 재시도하지 않고 UTC 경계 또는 승인 큐 처리로 해제 |
| `생성 가능` | 키·스위치·카운터가 정상 | 최근 집계와 비용 대시보드를 확인한 뒤 예약 실행 유지 |

화면에는 모델, 스위치, 키 설정 여부, 오늘/월간 요청, 승인 대기, 최근 생성 집계와 상한 사유만 표시합니다. `OPENAI_API_KEY` 값과 provider/client request ID는 표시하지 않습니다. 카운터 조회가 실패하면 건강 상태로 간주하지 않고 migration·관리자 권한을 확인합니다.

### Provider request ID 지원 절차

1. `/admin/ops`와 Sentry에는 request ID를 노출하지 않습니다.
2. provider 지원이 필요할 때만 권한이 제한된 내부 후보 provenance에서 해당 request ID와 UTC 발생 시각을 조회합니다.
3. 지원 티켓에는 request ID, 발생 시각, 모델, 일반화된 실패 코드만 전달합니다.
4. API 키, prompt/response, 문제·정답·해설 전문, 댓글 본문, 사용자 식별자는 첨부하지 않습니다.
5. 지원 종료 뒤 티켓 접근 범위와 보존 기간을 확인합니다.
## 배포 전 게이트

다음 항목을 모두 통과하기 전에는 생성 스위치를 켜지 않습니다.

1. `vet-exam-ai/supabase/migrations/`의 후보 큐·예약·승인 migration을 먼저 staging에 적용합니다.
2. `npm run check:migrations`, `npm run lint`, `npm run typecheck`, `npm run build`가 통과합니다.
3. Vercel Production/Preview 환경 범위를 분리하고, `OPENAI_API_KEY`와 service-role 비밀값이 Preview에 불필요하게 공유되지 않았는지 확인합니다.
4. OpenAI 전용 프로젝트에 월 USD 5 예산과 사용량 알림을 설정합니다. 요청 수 상한과 별개인 대시보드 통제임을 운영 기록에 남깁니다.
5. 현재 Vercel 플랜의 Cron 허용 개수와 최소 실행 간격을 확인합니다. 배포 후 등록될 전체 Cron 수가 플랜 한도를 넘지 않아야 하며, 실제 후보 생성 route와 `vercel.json` 경로가 일치해야 합니다.
6. Cron route가 `Authorization: Bearer <CRON_SECRET>`을 검증하고, 무인증 요청은 401로 거절되는지 확인합니다. 비밀값 자체는 명령 기록에 남기지 않습니다.
7. 브라우저 기반 검수 도구를 사용할 수 있는지 확인합니다. `/admin/ai-comments`를 데스크톱과 모바일 폭에서 열어 긴 문제·선지·댓글, 위험 표시, 승인·거절 버튼, 빈 상태와 오류 상태를 시각 검수합니다. 브라우저/visual QA 환경을 사용할 수 없으면 활성화를 보류하고 제한 사항을 배포 기록에 남깁니다.
8. 관리자와 비관리자 세션을 각각 준비합니다. 관리자는 승인 큐를 볼 수 있고 비관리자는 route와 mutation에 접근할 수 없어야 합니다.

## staging 검증 순서

1. migration 적용 후 모든 AI 환경변수를 넣되 `AI_COMMENT_GENERATION_ENABLED=false`로 배포합니다.
2. 비활성 상태에서 인증된 Cron 요청을 보내 provider 호출·후보 생성·공개 댓글 생성이 모두 0인지 확인합니다.
3. 운영 책임자의 명시적 승인을 받은 뒤에만 staging의 `AI_COMMENT_DAILY_LIMIT=1`과 생성 스위치를 일시 적용해 인증된 Cron을 수동 호출합니다. 후보 1개, 공개 댓글 0개, provider 요청 1개인지 확인합니다.
4. `/admin/ai-comments`에서 후보의 문항, 선지, 정답, 공식 해설, 댓글 본문, 시딩 계정, 유형, 위험 표시, 모델과 프롬프트 버전을 확인합니다. 원시 provider 응답, API 키, 내부 request ID가 화면에 보이면 실패입니다.
5. staging 후보 한 건을 거절해 공개 댓글이 생기지 않는지 확인합니다. 별도 승인된 테스트 후보 한 건을 생성한 뒤 승인해 해당 시딩 닉네임의 댓글이 정확히 한 번만 공개되는지 확인합니다.
6. 같은 후보의 승인 버튼을 두 번 누르거나 두 관리자 세션에서 동시에 승인해도 댓글이 한 건만 생기고 감사 로그가 모순되지 않는지 확인합니다.
7. 공개 문제 화면과 댓글 API/DOM에서 모델, 프롬프트, request ID, 위험 신호, 검수자 정보, 생성·검수 표지가 노출되지 않는지 확인합니다.
8. 테스트 후 생성 스위치를 다시 `false`로 내리고 staging 테스트 후보·댓글의 처리 결과를 기록합니다. 임시 provider나 세션을 사용했다면 종료합니다.

### 두 세션 예약 경쟁 검증

staging에서 서로 독립된 두 관리자/운영 세션으로 인증된 Cron 요청을 최대한 동시에 보냅니다. 실행 전후 후보와 provider 사용량을 비교해 다음을 확인합니다.

- 같은 `question + model + prompt version` 조합이 두 번 예약되지 않습니다.
- 두 실행의 합계가 일·월 요청 상한과 대기 후보 상한을 넘지 않습니다.
- 예약에 실패한 실행은 provider를 호출하지 않습니다.
- 이미 예약된 실패 요청을 자동 재시도하지 않습니다.

이 검증은 운영 DB에서 수행하지 않습니다. 두 세션이나 staging provider 사용량 확인 수단을 준비할 수 없으면 활성화를 보류합니다.

## Production 활성화

1. staging 증거와 관리자 승인·거절 결과를 운영 기록에 첨부합니다. 질문 원문과 후보 본문 전체는 외부 티켓에 복사하지 않습니다.
2. Production migration이 먼저 적용됐는지 다시 확인합니다.
3. Production 환경변수는 기본값으로 배포하고 `AI_COMMENT_GENERATION_ENABLED=false` 상태에서 smoke를 완료합니다.
4. Vercel 배포 화면에서 Cron 등록 수, 경로, UTC 실행 시각, 최근 호출 로그를 확인합니다. Preview 배포에서는 예약 실행을 기대하지 않습니다.
5. 운영 책임자가 활성화를 승인하면 `AI_COMMENT_GENERATION_ENABLED=true`로 바꾸고 해당 환경변수가 반영된 새 Production 배포를 만듭니다.
6. 첫 예약 실행 뒤 후보 수, 요청 수, 실패 코드, pending 상한을 확인합니다. 댓글 공개 수는 관리자가 승인하기 전 0이어야 합니다.
7. 첫 주에는 매일 `/admin/ai-comments`, Cron 집계, OpenAI 프로젝트 사용량·예산 알림을 함께 확인합니다.

## Kill switch와 rollback

이상 징후가 있으면 먼저 `AI_COMMENT_GENERATION_ENABLED=false`로 변경하고 Production에 반영합니다. 필요하면 Vercel에서 Cron을 일시 중단하되 다른 개인정보 삭제·이미지 정리 Cron은 함께 끄지 않습니다.

| 상황 | 조치 |
|---|---|
| 비용 또는 요청 수 급증 | kill switch를 내리고 OpenAI 프로젝트 키·사용량·예산 알림을 확인합니다. |
| 부정확하거나 부적절한 후보 | 미승인 후보를 거절하고 모델/프롬프트를 수정하기 전 재활성화하지 않습니다. |
| 승인 중복 또는 권한 이상 | kill switch를 내리고 승인 RPC·RLS·감사 로그를 조사합니다. 기존 후보를 직접 삭제하지 않습니다. |
| Cron 반복 실패 | 인증, migration, 환경변수, provider 상태를 확인합니다. 실패한 예약을 수동으로 재사용하지 않습니다. |
| 공개 댓글 문제 | 관리자 댓글 숨김/삭제 절차로 audit을 남깁니다. 후보 provenance는 조사 목적에 맞게 보존합니다. |

rollback은 새 후보 생성을 멈추는 조치입니다. 이미 승인된 댓글을 자동 삭제하거나 pending 후보를 자동 게시하지 않습니다. 재활성화 전 staging에서 원인을 재현하고 배포 전 게이트를 다시 통과합니다.

## 로그·개인정보 기준

- 운영 로그에는 실행 상태, 후보/요청/실패 집계, 일반화된 실패 코드만 남깁니다.
- `OPENAI_API_KEY`, `CRON_SECRET`, service-role key, 원시 prompt/response, 정답·해설 전문, 댓글 본문, 사용자 식별자를 console·Sentry·외부 티켓에 남기지 않습니다.
- provider request ID와 토큰 사용량이 필요하면 제한된 내부 후보 provenance에만 저장하고 공개 API/UI로 반환하지 않습니다.
- 관리자 화면에는 검수에 필요한 내용만 표시하고 원시 provider 오류와 내부 식별자는 숨깁니다.
- 시딩 계정의 기존 닉네임을 유지하며, 운영 소개 문구 이외의 생성 provenance는 비공개로 유지합니다.

## 정기 점검

- 매일: 새 후보 수, pending 수, 실패 코드, 중복 예약 여부, 승인 전 공개 댓글 0건 여부를 확인합니다.
- 매주: OpenAI 프로젝트 사용량과 USD 5 예산 알림, Vercel Cron 성공률, 관리자 감사 로그를 확인합니다.
- 매월: 요청 수가 `AI_COMMENT_MONTHLY_REQUEST_LIMIT` 이하인지 확인하고, 모델·가격·예산 정책 변경이 필요하면 비활성 상태에서 먼저 검토합니다.
