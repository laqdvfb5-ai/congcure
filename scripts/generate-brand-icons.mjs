import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const publicDir = new URL('../apps/web/public/', import.meta.url);
const source = await readFile(new URL('brand/congcure-mark.svg', publicDir));
await sharp(source).resize(180, 180).png().toFile(fileURLToPath(new URL('apple-touch-icon.png', publicDir)));

const sizes = [16, 32, 48];
const images = [];
for (const size of sizes) images.push(await sharp(source).resize(size, size).png().toBuffer());

// ICO directories can reference PNG images, keeping every size derived from the SVG.
const directory = Buffer.alloc(6 + 16 * sizes.length);
directory.writeUInt16LE(1, 2);
directory.writeUInt16LE(sizes.length, 4);
let imageOffset = directory.length;
for (const [index, size] of sizes.entries()) {
  const entry = 6 + 16 * index;
  directory[entry] = size;
  directory[entry + 1] = size;
  directory.writeUInt16LE(1, entry + 4);
  directory.writeUInt16LE(32, entry + 6);
  directory.writeUInt32LE(images[index].length, entry + 8);
  directory.writeUInt32LE(imageOffset, entry + 12);
  imageOffset += images[index].length;
}
await writeFile(new URL('favicon.ico', publicDir), Buffer.concat([directory, ...images]));
console.log('Generated favicon.ico and apple-touch-icon.png from the brand SVG');
