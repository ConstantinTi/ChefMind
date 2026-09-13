/**
 * Renders the PNG app icons from the SVG source.
 *
 * iOS ignores both SVG icons and the web manifest when installing to the home
 * screen, and Android needs a maskable variant or it pillar-boxes the icon on a
 * white square. Run with `npm run icons` after changing public/icon.svg.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import sharp from 'sharp';

const BRAND = '#b4541f';
const GLYPH = `
  <path d="M20 16v14a6 6 0 0 0 4 5.7V48a2 2 0 0 0 4 0V35.7A6 6 0 0 0 32 30V16a1.5 1.5 0 0 0-3 0v10h-2V16a1.5 1.5 0 0 0-3 0v10h-2V16a1.5 1.5 0 0 0-2 0z" fill="#fff"/>
  <path d="M42 16c-3.5 0-6 4.5-6 11 0 5 1.7 8.3 4 9.4V48a2 2 0 0 0 4 0V16z" fill="#fff"/>`;

/** `inset` leaves the safe area a maskable icon needs (content inside ~80%). */
function svg({ radius, inset }) {
  const scale = (64 - inset * 2) / 64;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">
  <rect width="64" height="64" rx="${radius}" fill="${BRAND}"/>
  <g transform="translate(${inset} ${inset}) scale(${scale})">${GLYPH}</g>
</svg>`;
}

const TARGETS = [
  { file: 'icon-192.png', size: 192, radius: 14, inset: 0 },
  { file: 'icon-512.png', size: 512, radius: 14, inset: 0 },
  // Full bleed, glyph pulled well inside the circle Android may crop to.
  { file: 'icon-maskable-512.png', size: 512, radius: 0, inset: 8 },
  // iOS applies its own mask, so this one must be square and fully opaque.
  { file: 'apple-touch-icon.png', size: 180, radius: 0, inset: 4 },
];

await mkdir('public/icons', { recursive: true });

for (const { file, size, radius, inset } of TARGETS) {
  const png = await sharp(Buffer.from(svg({ radius, inset })))
    .resize(size, size)
    .flatten({ background: BRAND })
    .png()
    .toBuffer();
  await writeFile(`public/icons/${file}`, png);
  console.log(`public/icons/${file}  ${size}×${size}  ${(png.byteLength / 1024).toFixed(1)} kB`);
}
