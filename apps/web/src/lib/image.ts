// Downscales a picked/pasted image before upload so screenshots stay small
// enough to live in the SQLite file without bloating it.
export async function downscaleImage(
  file: File | Blob,
  maxDim = 1280,
  quality = 0.82,
): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas is not available');
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const webp = await canvasToBlob(canvas, 'image/webp', quality);
  if (webp) return webp;
  const jpeg = await canvasToBlob(canvas, 'image/jpeg', quality);
  if (jpeg) return jpeg;
  throw new Error('Could not encode the image');
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality: number,
): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), type, quality));
}
