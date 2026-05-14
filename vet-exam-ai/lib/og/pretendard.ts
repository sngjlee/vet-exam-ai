// Pretendard OTF loader for next/og ImageResponse.
// 한글 글리프 제공. Next가 동일 weight 요청 시 자동 캐싱.

const URLS = {
  500: "https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/packages/pretendard/dist/public/static/Pretendard-Medium.otf",
  700: "https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/packages/pretendard/dist/public/static/Pretendard-Bold.otf",
} as const;

export type PretendardWeight = keyof typeof URLS;

export async function loadPretendard(
  weight: PretendardWeight,
): Promise<ArrayBuffer | null> {
  try {
    const res = await fetch(URLS[weight], {
      // 빌드/런타임 둘 다에서 캐시되도록
      cache: "force-cache",
    });
    if (!res.ok) return null;
    return await res.arrayBuffer();
  } catch {
    return null;
  }
}
