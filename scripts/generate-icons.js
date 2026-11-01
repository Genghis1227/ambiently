import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';

const brandDir = path.resolve('assets/brand');
const publicDir = path.resolve('public');

if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

// Master source images
const iconSquareSrc = path.join(brandDir, 'icon-square.jpg');
const bannerSrc = path.join(brandDir, 'banner-ambiently.jpg');

async function generateAssets() {
  console.log('🔄 Generating PWA icon suite & web brand assets...');

  // 1. Favicon (32x32 PNG + 16x16 / 48x48)
  await sharp(iconSquareSrc)
    .resize(32, 32)
    .png()
    .toFile(path.join(publicDir, 'favicon.png'));

  // 2. Standard PWA 192x192 & 512x512
  await sharp(iconSquareSrc)
    .resize(192, 192)
    .png()
    .toFile(path.join(publicDir, 'pwa-192x192.png'));

  await sharp(iconSquareSrc)
    .resize(512, 512)
    .png()
    .toFile(path.join(publicDir, 'pwa-512x512.png'));

  // Also standard icon names
  await sharp(iconSquareSrc)
    .resize(192, 192)
    .png()
    .toFile(path.join(publicDir, 'icon-192.png'));

  await sharp(iconSquareSrc)
    .resize(512, 512)
    .png()
    .toFile(path.join(publicDir, 'icon-512.png'));

  // 3. Apple Touch Icon (180x180)
  await sharp(iconSquareSrc)
    .resize(180, 180)
    .png()
    .toFile(path.join(publicDir, 'apple-touch-icon.png'));

  // 4. Maskable Icons (Android launcher safe zone: 80% inner pad)
  // 512x512 with 410px inner content on background #090d16
  const inner512 = await sharp(iconSquareSrc)
    .resize(410, 410, { fit: 'contain' })
    .toBuffer();

  await sharp({
    create: {
      width: 512,
      height: 512,
      channels: 4,
      background: { r: 9, g: 13, b: 22, alpha: 1 },
    },
  })
    .composite([{ input: inner512, gravity: 'center' }])
    .png()
    .toFile(path.join(publicDir, 'icon-maskable-512.png'));

  // 192x192 maskable
  const inner192 = await sharp(iconSquareSrc)
    .resize(154, 154, { fit: 'contain' })
    .toBuffer();

  await sharp({
    create: {
      width: 192,
      height: 192,
      channels: 4,
      background: { r: 9, g: 13, b: 22, alpha: 1 },
    },
  })
    .composite([{ input: inner192, gravity: 'center' }])
    .png()
    .toFile(path.join(publicDir, 'icon-maskable-192.png'));

  // 5. Logo & Banner for UI / README / OpenGraph
  await sharp(bannerSrc)
    .resize(1200, 630, { fit: 'contain', background: { r: 9, g: 13, b: 22, alpha: 1 } })
    .png()
    .toFile(path.join(publicDir, 'og-banner.png'));

  await sharp(iconSquareSrc)
    .resize(256, 256)
    .png()
    .toFile(path.join(publicDir, 'logo.png'));

  console.log('✅ PWA Icon suite & Brand assets successfully generated!');
}

generateAssets().catch((err) => {
  console.error('Asset generation failed:', err);
  process.exit(1);
});
