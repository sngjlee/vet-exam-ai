import { z } from "zod";

export const REPORT_REASONS = [
  "spam",
  "misinformation",
  "privacy",
  "hate_speech",
  "advertising",
  "copyright",
  "defamation",
  "other",
] as const;

export const ReportReasonSchema = z.enum(REPORT_REASONS);
export type ReportReason = z.infer<typeof ReportReasonSchema>;

export const REPORT_REASON_LABEL: Record<ReportReason, string> = {
  spam: "스팸",
  misinformation: "오답 / 잘못된 정보 전파",
  privacy: "개인정보 노출",
  hate_speech: "욕설 / 혐오 / 차별",
  advertising: "광고 / 홍보",
  copyright: "저작권 침해",
  defamation: "명예훼손 (정보통신망법 임시조치 요청)",
  other: "기타",
};

export const ReportRequestSchema = z.object({
  reason: ReportReasonSchema,
  description: z.string().max(500, "500자를 초과할 수 없습니다").optional(),
});
export type ReportRequest = z.infer<typeof ReportRequestSchema>;
