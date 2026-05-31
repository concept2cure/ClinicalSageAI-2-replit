/**
 * Minimal intrinsic-dimension reader for the image formats a client logo is
 * realistically stored as (PNG / JPEG / GIF). Used so an embedded logo renders
 * at its true aspect ratio rather than a guessed box.
 *
 * Returns pixel dimensions, or null if the format is unrecognised.
 *
 * @module server/services/templates/imageSize
 */

export interface PixelSize {
  width: number;
  height: number;
}

export function imageSize(buffer: Buffer): PixelSize | null {
  if (buffer.length < 24) return null;

  // PNG: 8-byte signature, then IHDR (width/height as big-endian uint32 at 16/20).
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  }

  // GIF: "GIF8" then logical screen width/height as little-endian uint16 at 6/8.
  if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) {
    return { width: buffer.readUInt16LE(6), height: buffer.readUInt16LE(8) };
  }

  // JPEG: scan markers for the first Start-Of-Frame (SOF0..SOF3, SOF5..SOF15).
  if (buffer[0] === 0xff && buffer[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < buffer.length) {
      if (buffer[offset] !== 0xff) {
        offset++;
        continue;
      }
      const marker = buffer[offset + 1];
      // SOF markers carry the frame dimensions.
      if (
        (marker >= 0xc0 && marker <= 0xc3) ||
        (marker >= 0xc5 && marker <= 0xc7) ||
        (marker >= 0xc9 && marker <= 0xcb) ||
        (marker >= 0xcd && marker <= 0xcf)
      ) {
        const height = buffer.readUInt16BE(offset + 5);
        const width = buffer.readUInt16BE(offset + 7);
        return { width, height };
      }
      const segmentLength = buffer.readUInt16BE(offset + 2);
      if (segmentLength <= 0) break;
      offset += 2 + segmentLength;
    }
  }

  return null;
}

/**
 * Scale `(width, height)` to fit inside `maxW × maxH` preserving aspect ratio.
 * Never upscales beyond the intrinsic size.
 */
export function fitWithin(
  width: number,
  height: number,
  maxW: number,
  maxH: number,
): PixelSize {
  if (width <= 0 || height <= 0) return { width: maxW, height: maxH };
  const scale = Math.min(maxW / width, maxH / height, 1);
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}
