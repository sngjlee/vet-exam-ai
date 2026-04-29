// vet-exam-ai/lib/webp-dimensions.ts
// WebP RIFF 헤더에서 width/height 추출 (외부 의존성 없음).
// 지원: VP8 (lossy), VP8L (lossless), VP8X (extended).
// 잘못된 헤더 / 비지원 청크 → null 반환 (호출자가 거부 처리).

const RIFF = 0x46464952; // "RIFF" little-endian
const WEBP = 0x50424557; // "WEBP" little-endian
const VP8_ = 0x20385056; // "VP8 "
const VP8L = 0x4c385056; // "VP8L"
const VP8X = 0x58385056; // "VP8X"

export type WebpDimensions = { width: number; height: number };

export function readWebpDimensions(buffer: Buffer): WebpDimensions | null {
  if (buffer.length < 30) return null;
  if (buffer.readUInt32LE(0) !== RIFF) return null;
  if (buffer.readUInt32LE(8) !== WEBP) return null;

  const chunk = buffer.readUInt32LE(12);

  if (chunk === VP8_) {
    if (buffer.length < 30) return null;
    const w = buffer.readUInt16LE(26) & 0x3fff;
    const h = buffer.readUInt16LE(28) & 0x3fff;
    return w > 0 && h > 0 ? { width: w, height: h } : null;
  }

  if (chunk === VP8L) {
    if (buffer.length < 25) return null;
    if (buffer.readUInt8(20) !== 0x2f) return null;
    const b0 = buffer.readUInt8(21);
    const b1 = buffer.readUInt8(22);
    const b2 = buffer.readUInt8(23);
    const b3 = buffer.readUInt8(24);
    const w = 1 + (((b1 & 0x3f) << 8) | b0);
    const h = 1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6));
    return w > 0 && h > 0 ? { width: w, height: h } : null;
  }

  if (chunk === VP8X) {
    if (buffer.length < 30) return null;
    const w = 1 + (buffer.readUInt8(24) | (buffer.readUInt8(25) << 8) | (buffer.readUInt8(26) << 16));
    const h = 1 + (buffer.readUInt8(27) | (buffer.readUInt8(28) << 8) | (buffer.readUInt8(29) << 16));
    return w > 0 && h > 0 ? { width: w, height: h } : null;
  }

  return null;
}
