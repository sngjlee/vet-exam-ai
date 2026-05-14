import type { Metadata } from "next";
import { fetchQuestionMeta } from "../../../lib/og/fetch-meta";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;

  // Next 16 useParams와 동일 — 한글 raw id (legacy `2.4_공보_57회_q001`)는
  // URL 세그먼트가 percent-encoded. 디코드해서 매칭한다.
  let decoded = id;
  try {
    decoded = decodeURIComponent(id);
  } catch {
    // 잘못된 인코딩이면 원본 사용
  }

  const meta = await fetchQuestionMeta(decoded);
  if (!meta) {
    return {
      title: "KVLE — 문제",
      description: "수의사 국가시험 학습 플랫폼 KVLE",
    };
  }

  const title = `${meta.publicId} · ${meta.category} — KVLE`;
  const description =
    meta.commentsCount > 0
      ? `${meta.category} 문제 · 댓글 ${meta.commentsCount}개`
      : `${meta.category} 문제 · 같이 풀어볼까요?`;

  return {
    title,
    description,
    openGraph: { title, description, type: "article" },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default function QuestionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
