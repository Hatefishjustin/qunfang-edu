// 课堂图片上传前的压缩：canvas 缩放 + JPEG 重编码，控制单张 ≤ 400KB
const MAX_EDGE = 1280;
const QUALITY = 0.8;

export type CompressedImage = { mime: string; data: string };

export function compressImage(file: File): Promise<CompressedImage> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      reject(new Error('只支持图片文件'));
      return;
    }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        const scale = Math.min(1, MAX_EDGE / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('无法处理图片');
        ctx.drawImage(img, 0, 0, w, h);
        const dataUrl = canvas.toDataURL('image/jpeg', QUALITY);
        resolve({ mime: 'image/jpeg', data: dataUrl.split(',')[1] ?? '' });
      } catch (err) {
        reject(err instanceof Error ? err : new Error('图片处理失败'));
      } finally {
        URL.revokeObjectURL(url);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('图片读取失败'));
    };
    img.src = url;
  });
}

export function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}
