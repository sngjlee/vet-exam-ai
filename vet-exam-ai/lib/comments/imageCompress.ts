// vet-exam-ai/lib/comments/imageCompress.ts
// 댓글 이미지 첨부 클라이언트 압축.
// File → Canvas → WebP. EXIF는 canvas 통과로 자동 소거.
// 정책: 장변 ≤ 2000px, quality 0.82 → 1MB 초과 시 0.7 재시도.
// 입력 화이트리스트: image/jpeg | image/png | image/webp.
// HEIC/HEIF/GIF 등은 throw → 호출자가 사용자 안내.

const MAX_LONG_EDGE = 2000;
const TARGET_QUALITY = 0.82;
const FALLBACK_QUALITY = 0.7;
const SIZE_CAP_BYTES = 1_048_576; // 1MB
const ORIGINAL_CAP_BYTES = 20 * 1_048_576; // 20MB
const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);

export type ImageCompressErrorCode =
  | "unsupported_mime"
  | "original_too_large"
  | "decode_failed"
  | "compressed_too_large";

export class ImageCompressError extends Error {
  constructor(public code: ImageCompressErrorCode, message: string) {
    super(message);
    this.name = "ImageCompressError";
  }
}

export async function compressForUpload(file: File): Promise<Blob> {
  if (!ALLOWED_MIME.has(file.type)) {
    throw new ImageCompressError(
      "unsupported_mime",
      "iPhone HEIC/HEIF 또는 지원하지 않는 형식입니다. 갤러리에서 JPEG로 저장 후 다시 시도해주세요."
    );
  }
  if (file.size > ORIGINAL_CAP_BYTES) {
    throw new ImageCompressError(
      "original_too_large",
      "원본 파일이 너무 큽니다 (20MB 이하만 가능)."
    );
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new ImageCompressError("decode_failed", "이미지를 처리할 수 없습니다.");
  }

  try {
    const { width, height } = fitWithinLongEdge(bitmap.width, bitmap.height, MAX_LONG_EDGE);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new ImageCompressError("decode_failed", "이미지를 처리할 수 없습니다.");
    ctx.drawImage(bitmap, 0, 0, width, height);

    let blob = await canvasToBlob(canvas, "image/webp", TARGET_QUALITY);
    if (blob.size > SIZE_CAP_BYTES) {
      blob = await canvasToBlob(canvas, "image/webp", FALLBACK_QUALITY);
    }
    if (blob.size > SIZE_CAP_BYTES) {
      throw new ImageCompressError(
        "compressed_too_large",
        "이미지가 너무 복잡합니다. 더 작은 이미지를 선택해주세요."
      );
    }
    return blob;
  } finally {
    bitmap.close();
  }
}

function fitWithinLongEdge(srcW: number, srcH: number, max: number) {
  const longest = Math.max(srcW, srcH);
  if (longest <= max) return { width: srcW, height: srcH };
  const scale = max / longest;
  return { width: Math.round(srcW * scale), height: Math.round(srcH * scale) };
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new ImageCompressError("decode_failed", "이미지를 처리할 수 없습니다."));
          return;
        }
        resolve(blob);
      },
      type,
      quality
    );
  });
}
