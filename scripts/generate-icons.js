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
  console.log('🔄 Generating PWA icon suite, web brand assets & SEO metadata...');

  const pngOpts = { compressionLevel: 9, palette: true, quality: 85 };

  // 1. Favicon (32x32 PNG)
  await sharp(iconSquareSrc)
    .resize(32, 32)
    .png(pngOpts)
    .toFile(path.join(publicDir, 'favicon.png'));

  // 2. Standard PWA 192x192 & 512x512
  await sharp(iconSquareSrc)
    .resize(192, 192)
    .png(pngOpts)
    .toFile(path.join(publicDir, 'pwa-192x192.png'));

  await sharp(iconSquareSrc)
    .resize(512, 512)
    .png(pngOpts)
    .toFile(path.join(publicDir, 'pwa-512x512.png'));

  // Remove legacy duplicate icon-192.png / icon-512.png if present
  for (const legacyFile of ['icon-192.png', 'icon-512.png']) {
    const legacyPath = path.join(publicDir, legacyFile);
    if (fs.existsSync(legacyPath)) {
      fs.unlinkSync(legacyPath);
    }
  }

  // 3. Apple Touch Icon (180x180)
  await sharp(iconSquareSrc)
    .resize(180, 180)
    .png(pngOpts)
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
    .png(pngOpts)
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
    .png(pngOpts)
    .toFile(path.join(publicDir, 'icon-maskable-192.png'));

  // 5. Logo & Banner for UI / README / OpenGraph
  await sharp(bannerSrc)
    .resize(1200, 630, { fit: 'contain', background: { r: 9, g: 13, b: 22, alpha: 1 } })
    .png(pngOpts)
    .toFile(path.join(publicDir, 'og-banner.png'));

  await sharp(iconSquareSrc)
    .resize(256, 256)
    .png(pngOpts)
    .toFile(path.join(publicDir, 'logo.png'));

  // 6. Auto-sync sitemap.xml <lastmod> and index.html softwareVersion with package.json
  const todayIso = new Date().toISOString().split('T')[0];
  const sitemapPath = path.join(publicDir, 'sitemap.xml');
  if (fs.existsSync(sitemapPath)) {
    const sitemapXml = fs.readFileSync(sitemapPath, 'utf8');
    const updatedSitemap = sitemapXml.replace(
      /<lastmod>.*?<\/lastmod>/,
      `<lastmod>${todayIso}</lastmod>`
    );
    fs.writeFileSync(sitemapPath, updatedSitemap, 'utf8');
  }

  const pkgPath = path.resolve('package.json');
  const indexHtmlPath = path.resolve('index.html');
  if (fs.existsSync(pkgPath) && fs.existsSync(indexHtmlPath)) {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    const indexHtml = fs.readFileSync(indexHtmlPath, 'utf8');
    const updatedHtml = indexHtml.replace(
      /"softwareVersion":\s*"[^"]*"/,
      `"softwareVersion": "${pkg.version}"`
    );
    fs.writeFileSync(indexHtmlPath, updatedHtml, 'utf8');
  }

  console.log('✅ PWA Icon suite, Brand assets & SEO metadata successfully generated!');
}

generateAssets().catch((err) => {
  console.error('Asset generation failed:', err);
  process.exit(1);
});
