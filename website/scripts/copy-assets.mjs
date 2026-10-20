import { mkdir, copyFile } from 'node:fs/promises';

const assets = new URL('../../extension/assets/', import.meta.url);
const target = new URL('../public/assets/', import.meta.url);
for (const file of ['brand/logo-original.png', 'icons/icon-32.png', 'fonts/Ubuntu-Regular.ttf', 'fonts/Ubuntu-Medium.ttf', 'fonts/Ubuntu-Bold.ttf', 'fonts/UFL.txt', 'fonts/COPYRIGHT.txt']) {
  const dest = new URL(file, target);
  await mkdir(new URL('.', dest), { recursive: true });
  await copyFile(new URL(file, assets), dest);
}
