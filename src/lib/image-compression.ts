/**
 * Canvas-based client-side image compression — no heavy dependency.
 *
 * Used before uploading profile documents so large phone photos are shrunk to a
 * reasonable size (target < 2MB) while staying legible. PDFs and non-image files
 * are returned untouched. Runs only in the browser (uses <canvas> / createImageBitmap).
 */

import { COMPRESSION_TARGET_BYTES } from "@/lib/validation";

interface CompressOptions {
  /** Target maximum size in bytes (best effort). */
  maxBytes?: number;
  /** Longest edge in pixels; larger images are scaled down first. */
  maxDimension?: number;
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality: number
): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

async function loadBitmap(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === "function") {
    try {
      // `from-image` respects EXIF orientation (matters for phone cameras).
      return await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      // Fall through to the <img> path below.
    }
  }

  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read image."));
    };
    img.src = url;
  });
}

/**
 * Compress an image `File` to WebP under `maxBytes` where possible. Returns the
 * original file unchanged if it is not an image, if compression fails, or if the
 * result would not be smaller.
 */
export async function compressImage(
  file: File,
  options: CompressOptions = {}
): Promise<File> {
  const maxBytes = options.maxBytes ?? COMPRESSION_TARGET_BYTES;
  const maxDimension = options.maxDimension ?? 2000;

  if (!file.type.startsWith("image/")) return file;

  let source: ImageBitmap | HTMLImageElement;
  try {
    source = await loadBitmap(file);
  } catch {
    return file;
  }

  const srcWidth = "width" in source ? source.width : 0;
  const srcHeight = "height" in source ? source.height : 0;
  if (!srcWidth || !srcHeight) return file;

  const scale = Math.min(1, maxDimension / Math.max(srcWidth, srcHeight));
  const width = Math.round(srcWidth * scale);
  const height = Math.round(srcHeight * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    if ("close" in source) source.close();
    return file;
  }
  ctx.drawImage(source, 0, 0, width, height);
  if ("close" in source) source.close();

  let quality = 0.9;
  let blob = await canvasToBlob(canvas, "image/webp", quality);
  while (blob && blob.size > maxBytes && quality > 0.4) {
    quality = Math.round((quality - 0.1) * 10) / 10;
    blob = await canvasToBlob(canvas, "image/webp", quality);
  }

  // WebP unsupported, or re-encoding didn't help — keep the original.
  if (!blob || blob.size >= file.size) return file;

  const name = file.name.replace(/\.[^./\\]+$/, "") + ".webp";
  return new File([blob], name, { type: "image/webp" });
}
