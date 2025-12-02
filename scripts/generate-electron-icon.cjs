#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const toIco = require('to-ico');
const sharp = require('sharp');

const projectRoot = path.resolve(__dirname, '..');
const publicIcons = path.join(projectRoot, 'public', 'icons');
const buildDir = path.join(projectRoot, 'build');

async function ensureDir(p) { if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true }); }

async function run() {
  try {
    await ensureDir(buildDir);
    const src512 = path.join(publicIcons, 'icon-512.png');
    if (!fs.existsSync(src512)) throw new Error('Source icon not found: ' + src512 + '. Run scripts/download-icon.cjs first.');

    // Prepare a large and medium PNG for ICO packaging
    const png256buf = await sharp(src512).resize(256,256).png().toBuffer();
    const png128buf = await sharp(src512).resize(128,128).png().toBuffer();

    const buffer = await toIco([png256buf, png128buf]);
    const outIco = path.join(buildDir, 'icon.ico');
    fs.writeFileSync(outIco, Buffer.from(buffer));
    console.log('Wrote', outIco);

    // cleanup intermediates
    try { fs.unlinkSync(pngLarge); fs.unlinkSync(pngSmall); } catch(e){}
    console.log('Electron icon generation complete. electron-builder will use', outIco);
  } catch (e) { console.error('generate-electron-icon failed', e); process.exitCode = 2; }
}

run();
