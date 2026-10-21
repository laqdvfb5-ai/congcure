import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { AppError } from './errors';
import { MAX_PRODUCT_IMAGE_BYTES, PRODUCT_IMAGE_FILENAME } from './media-rules';

const MIME_FORMAT: Record<string, string> = {
  'image/jpeg': 'jpeg', 'image/png': 'png', 'image/webp': 'webp',
};

function imageDirectory(): string {
  return path.resolve(/* turbopackIgnore: true */ process.env.PRODUCT_IMAGE_DIR || path.join(process.cwd(), '.uploads', 'products'));
}

export async function saveProductImage(bytes: Buffer, mimeType: string): Promise<string> {
  if (bytes.length === 0 || bytes.length > MAX_PRODUCT_IMAGE_BYTES) {
    throw new AppError('INVALID_INPUT', 'Ảnh phải có dung lượng từ 1 byte đến 5 MB');
  }
  const format = MIME_FORMAT[mimeType];
  if (!format) throw new AppError('INVALID_INPUT', 'Chỉ nhận ảnh JPG, PNG hoặc WebP');

  let image: Buffer;
  try {
    const source = sharp(bytes, { limitInputPixels: 40_000_000, failOn: 'warning' });
    const metadata = await source.metadata();
    if (metadata.format !== format || (metadata.pages ?? 1) > 1) {
      throw new Error('Unsupported image format');
    }
    // Decode and re-encode to discard embedded metadata and any non-image content.
    image = await source.rotate().resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 85 }).toBuffer();
  } catch {
    throw new AppError('INVALID_INPUT', 'Ảnh bị lỗi hoặc không được hỗ trợ. Hãy chọn ảnh JPG, PNG hoặc WebP tĩnh (tối đa 40 megapixel).');
  }
  if (image.length > MAX_PRODUCT_IMAGE_BYTES) {
    throw new AppError('INVALID_INPUT', 'Ảnh sau xử lý quá lớn, vui lòng chọn ảnh nhỏ hơn');
  }
  const directory = imageDirectory();
  const filename = `${randomUUID()}.webp`;
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, filename), image, { flag: 'wx' });
  return `/uploads/products/${filename}`;
}

export async function readProductImage(filename: string): Promise<Buffer | null> {
  if (!PRODUCT_IMAGE_FILENAME.test(filename)) return null;
  try {
    // Uploads are runtime data, not assets to include in the application build.
    return await readFile(/* turbopackIgnore: true */ path.join(/* turbopackIgnore: true */ imageDirectory(), filename));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}
