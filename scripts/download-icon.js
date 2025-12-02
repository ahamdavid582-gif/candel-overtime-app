#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const ICON_URL = 'https://ikgxslfmmcgneoivupee.supabase.co/storage/v1/object/public/app-assets/icon4.png';
const projectRoot = path.resolve(__dirname, '..');
const publicIcons = path.join(projectRoot, 'public', 'icons');

async function downloadToBuffer(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

async function ensureDir(p) { if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true }); }

async function run() {
  try {
    await ensureDir(publicIcons);
    console.log('Downloading icon from', ICON_URL);
    const buf = await downloadToBuffer(ICON_URL);

    // Save original as 512 PNG
    const out512 = path.join(publicIcons, 'icon-512.png');
    await sharp(buf).resize(512, 512, { fit: 'contain', background: { r:0,g:0,b:0,alpha:0 } }).png().toFile(out512);
    console.log('Wrote', out512);

    // Save 192 variant
    const out192 = path.join(publicIcons, 'icon-192.png');
    await sharp(buf).resize(192, 192, { fit: 'contain', background: { r:0,g:0,b:0,alpha:0 } }).png().toFile(out192);
    console.log('Wrote', out192);

    // Also write webp copy
    const outWebp = path.join(publicIcons, 'icon.webp');
    await sharp(buf).resize(512,512).webp().toFile(outWebp);
    console.log('Wrote', outWebp);

    console.log('Download and resize complete. Run `npm run prepare-icons` or the remaining scripts to finish icon generation.');
  } catch (e) { console.error('Icon download failed', e); process.exitCode = 2; }
}

run();
