type NullableNumber = number | null | undefined;

export type AdminQuestionSource = "manual" | "past_exam" | "ai_generated" | string | null | undefined;

export function formatAdminExamRef({
  round,
  session,
  year,
}: {
  round: NullableNumber;
  session: NullableNumber;
  year: NullableNumber;
}): string {
  const parts: string[] = [];
  if (round != null) parts.push(`${round}회`);
  if (session != null) parts.push(`${session}교시`);
  if (year != null) parts.push(`${year}년`);
  return parts.length > 0 ? parts.join(" · ") : "—";
}

export function formatQuestionSource(source: AdminQuestionSource): string {
  switch (source) {
    case "past_exam":
      return "기출 기반";
    case "ai_generated":
      return "AI 생성";
    case "manual":
      return "수동";
    case null:
    case undefined:
    case "":
      return "—";
    default:
      return source;
  }
}
