import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtemp, readdir, rmdir, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { readProductImage, saveProductImage } from '../src/media';
import { isProductImageUrl, MAX_PRODUCT_IMAGE_BYTES } from '../src/media-rules';
import { createProduct } from '../src/catalog';
import { makeCategory } from './factories';

let directory: string;
const previousDirectory = process.env.PRODUCT_IMAGE_DIR;
beforeAll(async () => {
  directory = await mkdtemp(path.join(tmpdir(), 'web12-images-'));
  process.env.PRODUCT_IMAGE_DIR = directory;
});
afterAll(async () => {
  if (previousDirectory === undefined) delete process.env.PRODUCT_IMAGE_DIR;
  else process.env.PRODUCT_IMAGE_DIR = previousDirectory;
  for (const file of await readdir(directory)) await unlink(path.join(directory, file));
  await rmdir(directory);
});

describe('product images', () => {
  it('stores a resized WebP without source metadata and serves it by generated name', async () => {
    const input = await sharp({ create: { width: 2000, height: 1000, channels: 3, background: '#21734d' } }).withMetadata().png().toBuffer();
    const url = await saveProductImage(input, 'image/png');
    expect(url).toMatch(/^\/uploads\/products\/[a-f0-9-]+\.webp$/);
    const image = await readProductImage(url.split('/').pop()!);
    expect(image).not.toBeNull();
    const metadata = await sharp(image!).metadata();
    expect(metadata).toMatchObject({ format: 'webp', width: 1600, height: 800 });
    expect(metadata.exif).toBeUndefined();
    expect(metadata.icc).toBeUndefined();
    expect(isProductImageUrl(url)).toBe(true);
  });

  it('rejects forged images, mismatched types, SVG and oversized files without storing them', async () => {
    const count = (await readdir(directory)).length;
    const png = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#fff' } }).png().toBuffer();
    for (const [bytes, type] of [[Buffer.from('not an image'), 'image/png'], [png, 'image/jpeg'], [Buffer.from('<svg></svg>'), 'image/svg+xml'], [Buffer.alloc(MAX_PRODUCT_IMAGE_BYTES + 1), 'image/png']] as const) {
      await expect(saveProductImage(bytes, type)).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    }
    expect((await readdir(directory)).length).toBe(count);
  });

  it('does not read arbitrary paths and rejects unsafe product image references', async () => {
    for (const filename of ['../.env', '..\\.env', 'photo.svg', 'C:\\Windows\\win.ini']) expect(await readProductImage(filename)).toBeNull();
    const missing = '00000000-0000-4000-8000-000000000000.webp';
    expect(await readProductImage(missing)).toBeNull();
    const category = await makeCategory();
    const product = { categoryId: category.id, name: 'Image validation', type: 'STOCK' as const, priceMember: 1, priceCtv: 1, priceAgent: 1 };
    for (const images of [['javascript:alert(1)'], ['//example.com/p.png'], ['/uploads/products/../.env'], Array(9).fill('https://example.com/image.png')]) {
      await expect(createProduct({ ...product, images })).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    }
    const saved = await createProduct({ ...product, images: ['https://example.com/image.png'] });
    expect(saved.images).toEqual(['https://example.com/image.png']);
  });
});
