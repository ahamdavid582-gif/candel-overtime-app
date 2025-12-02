#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const projectRoot = path.resolve(__dirname, '..');
const publicIcons = path.join(projectRoot, 'public', 'icons');
const androidRes = path.join(projectRoot, 'android', 'app', 'src', 'main', 'res');

const sourceCandidates = [
  path.join(publicIcons, 'icon-512.png'),
  path.join(publicIcons, 'icon-192.png'),
  path.join(publicIcons, 'icon.webp'),
];

function findSource() {
  for (const p of sourceCandidates) {
    try {
      const stat = fs.statSync(p);
      if (stat && stat.size > 0) return p;
    } catch (e) {}
  }
  throw new Error('No source icon found in public/icons (icon-512.png, icon-192.png, or icon.webp)');
}

const sizes = {
  'mdpi': 48,
  'hdpi': 72,
  'xhdpi': 96,
  'xxhdpi': 144,
  'xxxhdpi': 192,
};

async function ensureFolder(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

async function generate() {
  const src = findSource();
  console.log('Using source icon:', src);

  for (const [density, px] of Object.entries(sizes)) {
    const folder = path.join(androidRes, `mipmap-${density}`);
    await ensureFolder(folder);
    const outLegacy = path.join(folder, 'ic_launcher.png');
    const outFg = path.join(folder, 'ic_launcher_foreground.png');
    // Resize for legacy and foreground (same size)
    await sharp(src).resize(px, px, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toFile(outLegacy);
    await sharp(src).resize(px, px, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toFile(outFg);
    console.log(`Wrote ${outLegacy} (${px}x${px})`);
  }

  // Also write anydpi adaptive foreground (as ic_launcher_foreground.png in mipmap-anydpi-v26)
  const anydpi = path.join(androidRes, 'mipmap-anydpi-v26');
  await ensureFolder(anydpi);
  const anyOut = path.join(anydpi, 'ic_launcher_foreground.png');
  await sharp(src).resize(432, 432, { fit: 'contain', background: { r:0,g:0,b:0,alpha:0 } }).png().toFile(anyOut);
  console.log(`Wrote adaptive foreground ${anyOut} (432x432)`);

  // Leave adaptive background as color (values/ic_launcher_background.xml exists).
  console.log('Icon generation complete.');
}

generate().catch(err => { console.error(err); process.exitCode = 2; });
