export function formatJoinedRelative(iso: string | null): string {
  if (!iso) return "—";
  const diffMs = Date.now() - new Date(iso).getTime();
  const day = Math.round(diffMs / 86_400_000);
  if (day < 1)   return "오늘";
  if (day < 7)   return `${day}일 전`;
  if (day < 30)  return `${Math.round(day / 7)}주 전`;
  if (day < 365) return `${Math.round(day / 30)}개월 전`;
  return new Date(iso).toLocaleDateString("ko-KR");
}

export function truncateEmail(email: string | null): string {
  if (!email) return "—";
  if (email.length <= 28) return email;
  return email.slice(0, 25) + "…";
}
