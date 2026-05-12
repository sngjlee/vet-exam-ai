// vet-exam-ai/lib/utils/datetime.ts
// Vercel 서버 OS 가 UTC 라 `toLocaleString("ko-KR")` 만 호출하면 한국어 포맷으로
// UTC 시간이 그대로 노출된다. 이 모듈의 헬퍼는 항상 Asia/Seoul 로 강제한다.

const KST = "Asia/Seoul";

export function formatKstDateTime(value: string | Date): string {
  return new Date(value).toLocaleString("ko-KR", { timeZone: KST });
}

export function formatKstDate(value: string | Date): string {
  return new Date(value).toLocaleDateString("ko-KR", { timeZone: KST });
}

export function formatKstDateTimeOptions(
  value: string | Date,
  options: Intl.DateTimeFormatOptions,
): string {
  return new Date(value).toLocaleString("ko-KR", { timeZone: KST, ...options });
}

export function formatKstDateOptions(
  value: string | Date,
  options: Intl.DateTimeFormatOptions,
): string {
  return new Date(value).toLocaleDateString("ko-KR", { timeZone: KST, ...options });
}
