# 댓글 이미지 첨부 운영 기준

댓글 이미지 첨부는 시딩 댓글, 실제 사용자 질문, 해설 보강에 쓰이는 운영 중요 기능입니다. 본 문서는 업로드 제한, 삭제/정리 동작, 실패 UX, 배포 전 확인 기준을 고정합니다.

## 사용자 입력 제한

| 단계 | 기준 | 구현 경로 |
|---|---|---|
| 허용 형식 | JPEG, PNG, WebP | `components/comments/CommentImageAttacher.tsx` |
| 원본 크기 | 20MB 이하 | `lib/comments/imageCompress.ts` |
| 변환 형식 | Canvas를 거친 WebP | `lib/comments/imageCompress.ts` |
| EXIF 제거 | Canvas 변환 과정에서 원본 메타데이터 제거 | `lib/comments/imageCompress.ts` |
| 클라이언트 장변 | 2000px 이하로 축소 | `lib/comments/imageCompress.ts` |
| 업로드 파일 크기 | 1MB 이하 | `lib/comments/imageCompress.ts`, `app/api/comments/upload/route.ts` |
| 댓글당 첨부 수 | 최대 3장 | `lib/comments/imageUrlValidate.ts` |

HEIC/HEIF/GIF 등 지원하지 않는 형식은 클라이언트에서 차단하고, 서버는 WebP가 아닌 파일과 WebP magic number가 맞지 않는 파일을 다시 거부합니다.

## 서버 검증

`/api/comments/upload`는 다음 순서로 단건 업로드를 검증합니다.

1. 로그인 여부를 확인합니다.
2. `content-length`, multipart payload, file 존재 여부를 확인합니다.
3. MIME type이 `image/webp`인지 확인합니다.
4. RIFF/WEBP magic number를 확인합니다.
5. WebP width/height를 읽어 2200px 초과 이미지를 거부합니다.
6. 사용자별 최근 1시간 업로드가 10건 이상이면 429를 반환합니다.
7. `comment-images/{userId}/{yyyymm}/{nanoid}.webp` 경로에 저장하고 public URL을 반환합니다.

댓글 생성/수정 API는 `comments.image_urls` 입력이 현재 사용자 소유의 `comment-images` public URL인지 다시 확인합니다. 다른 사용자의 Storage path를 댓글에 꽂는 입력은 저장하지 않습니다.

## 삭제와 정리

| 상황 | 동작 | 운영 확인 |
|---|---|---|
| 사용자가 첨부 직후 제거 | `DELETE /api/comments/upload?url=...`로 본인 path만 best-effort 삭제 | 삭제 실패는 사용자 작업을 막지 않고 Sentry warning으로 남깁니다. |
| 업로드 후 댓글에 저장하지 않음 | 24시간 이후 `comment-image-sweep`가 미참조 객체 삭제 | `/admin/ops`와 Vercel Cron 로그에서 deleted counter를 확인합니다. |
| 업로드 로그 | 24시간 이후 삭제 | `comment_image_upload_log` row count가 누적되지 않는지 확인합니다. |
| 댓글에 연결된 이미지 | 댓글 row가 URL을 참조하는 동안 보존 | 블라인드/삭제 상태 댓글도 참조가 있으면 sweep 대상이 아닙니다. |
| cron 실행 로그 | 90일 이후 삭제 | `cron_run_logs.detail`에는 aggregate counter만 남깁니다. |

## 실패 UX 기준

서버 error code를 화면에 그대로 노출하지 않습니다. 사용자는 다음 분류의 안내만 봅니다.

| 분류 | 사용자 안내 |
|---|---|
| 로그인 만료 | 로그인이 필요합니다. |
| rate limit | 이미지 업로드가 잠시 제한되었습니다. 1시간 뒤 다시 시도해주세요. |
| 형식/손상/디코딩 실패 | 다른 이미지를 선택하도록 안내합니다. |
| 용량/해상도 초과 | 더 작은 이미지를 선택하도록 안내합니다. |
| Storage 또는 일시 장애 | 잠시 후 다시 시도하도록 안내합니다. |
| 네트워크 오류 | 네트워크 오류로 업로드 실패를 안내합니다. |

운영자는 동일 사용자의 반복 실패가 보이면 Sentry tag `area=storage`, `storage_bucket=comment-images`, `operation=comment_image_upload` 또는 `comment_image_delete`를 기준으로 확인합니다.

## 배포 전 확인

1. 로그인 사용자로 JPEG/PNG/WebP 각 1장을 첨부해 WebP URL이 댓글에 저장되는지 확인합니다.
2. 3장 초과 선택 시 추가 파일이 차단되고 화면 안내가 뜨는지 확인합니다.
3. 20MB 초과 또는 HEIC 파일을 선택했을 때 클라이언트 안내가 뜨는지 확인합니다.
4. 업로드 후 댓글 작성 전에 이미지를 제거하면 Storage 객체가 삭제되거나 sweep 대상이 되는지 확인합니다.
5. 다른 사용자 URL을 `image_urls`에 넣은 API 요청이 400으로 거부되는지 확인합니다.
6. `/api/cron/comment-image-sweep`가 `CRON_SECRET` 없이 401, 올바른 secret으로 200을 반환하는지 확인합니다.
7. `/admin/ops`에서 `comment-image-sweep` 최근 성공 시각과 deleted/log_deleted counters를 확인합니다.
