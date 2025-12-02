#!/usr/bin/env node
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');

const projectRoot = path.resolve(__dirname, '..');
const iconsDir = path.join(projectRoot, 'public', 'icons');
const src = path.join(iconsDir, 'splash.png');
const out = path.join(iconsDir, 'splash-mobile.png');

async function run() {
  if (!fs.existsSync(src)) {
    console.error('Source splash not found at', src);
    process.exit(1);
  }
  // Target mobile portrait size (cover) — will crop to fill
  const width = 1080;
  const height = 1920;
  await sharp(src).resize(width, height, { fit: 'cover', position: 'center' }).png({ quality: 90 }).toFile(out);
  console.log('Wrote', out);
}

run().catch(err => { console.error(err); process.exit(2); });
