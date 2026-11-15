// Generates PWA icons into public/icons from src/assets/tofu-wave.png.
// Run: node scripts/make-icons.mjs  (needs Playwright chromium installed)
import { chromium } from '@playwright/test';
import { readFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(path.join(root, 'src/assets/tofu-wave.png'));
const dataUri = `data:image/png;base64,${src.toString('base64')}`;
const out = path.join(root, 'public/icons');
mkdirSync(out, { recursive: true });

const BG = '#FFDDE5';
const targets = [
  { file: 'icon-192.png', size: 192, ratio: 0.78 },
  { file: 'icon-512.png', size: 512, ratio: 0.78 },
  { file: 'icon-512-maskable.png', size: 512, ratio: 0.62 },
  { file: 'apple-touch-icon.png', size: 180, ratio: 0.78 },
  { file: 'favicon-32.png', size: 32, ratio: 0.9 },
];

const browser = await chromium.launch();
for (const { file, size, ratio } of targets) {
  const page = await browser.newPage({
    viewport: { width: size, height: size },
    deviceScaleFactor: 1,
  });
  const img = Math.round(size * ratio);
  await page.setContent(`<!doctype html><html><body style="margin:0;width:${size}px;height:${size}px;background:${BG};display:flex;align-items:center;justify-content:center;overflow:hidden">
<img src="${dataUri}" style="width:${img}px;height:${img}px;image-rendering:auto;display:block"></body></html>`);
  await page.evaluate(() => Promise.all([...document.images].map((i) => i.decode())));
  await page.screenshot({ path: path.join(out, file), omitBackground: false });
  await page.close();
  console.log('wrote', file, size);
}
await browser.close();
