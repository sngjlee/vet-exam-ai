import { ImageResponse } from "next/og";
import { fetchQuestionMeta } from "../../../lib/og/fetch-meta";
import { loadPretendard } from "../../../lib/og/pretendard";
import { renderOgCard } from "../../../lib/og/render-card";

export const runtime = "nodejs";
export const alt = "KVLE 문제";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function QuestionOgImage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  let decoded = id;
  try {
    decoded = decodeURIComponent(id);
  } catch {
    /* keep original */
  }

  const [meta, pretendard500, pretendard700] = await Promise.all([
    fetchQuestionMeta(decoded),
    loadPretendard(500),
    loadPretendard(700),
  ]);

  const headline = meta?.publicId ?? "KVLE";
  const pill = meta?.category || null;
  const metrics =
    meta && meta.commentsCount > 0 ? `댓글 ${meta.commentsCount}개` : "";

  const fonts: { name: string; data: ArrayBuffer; weight: 500 | 700 }[] = [];
  if (pretendard500) fonts.push({ name: "Pretendard", data: pretendard500, weight: 500 });
  if (pretendard700) fonts.push({ name: "Pretendard", data: pretendard700, weight: 700 });

  return new ImageResponse(renderOgCard({ headline, pill, metrics }), {
    ...size,
    fonts: fonts.length > 0 ? fonts : undefined,
  });
}
