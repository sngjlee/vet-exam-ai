import { ImageResponse } from "next/og";
import { fetchBoardPostMeta } from "@/lib/og/fetch-meta";
import { loadPretendard } from "@/lib/og/pretendard";
import { renderOgCard } from "@/lib/og/render-card";

export const runtime = "nodejs";
export const alt = "KVLE 공지";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function AnnouncementOgImage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [meta, pretendard500, pretendard700] = await Promise.all([
    fetchBoardPostMeta(id, "announcement"),
    loadPretendard(500),
    loadPretendard(700),
  ]);

  // 비공개/blind/삭제 글은 generic 카드로 fallback
  if (!meta || !meta.visible) {
    const fonts: { name: string; data: ArrayBuffer; weight: 500 | 700 }[] = [];
    if (pretendard500) fonts.push({ name: "Pretendard", data: pretendard500, weight: 500 });
    if (pretendard700) fonts.push({ name: "Pretendard", data: pretendard700, weight: 700 });
    return new ImageResponse(
      renderOgCard({ headline: "KVLE 공지", pill: null, metrics: "" }),
      { ...size, fonts: fonts.length > 0 ? fonts : undefined },
    );
  }

  const metrics =
    meta.commentsCount > 0 || meta.upvoteCount > 0
      ? `댓글 ${meta.commentsCount} · 추천 ${meta.upvoteCount}`
      : "";

  const fonts: { name: string; data: ArrayBuffer; weight: 500 | 700 }[] = [];
  if (pretendard500) fonts.push({ name: "Pretendard", data: pretendard500, weight: 500 });
  if (pretendard700) fonts.push({ name: "Pretendard", data: pretendard700, weight: 700 });

  return new ImageResponse(
    renderOgCard({
      headline: meta.title,
      pill: "공지",
      metrics,
      byline: meta.authorNickname,
    }),
    { ...size, fonts: fonts.length > 0 ? fonts : undefined },
  );
}
