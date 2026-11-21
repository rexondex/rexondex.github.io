const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');
const args = process.argv.slice(2);
const rootOption = args.indexOf('--site-root');
const root = path.resolve(rootOption < 0 ? path.join(__dirname, '..') : args[rootOption + 1]);
const check = args.includes('--check');
(async () => {
  const media = path.join(root, 'media');
  if (!fs.existsSync(media)) return;
  let stale = 0;
  for (const sector of fs.readdirSync(media, { withFileTypes: true }).filter(e => e.isDirectory())) {
    const sourceDir = path.join(media, sector.name);
    const targetDir = path.join(root, 'thumbnails', sector.name);
    for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true }).filter(e => e.isFile() && /\.(jpe?g|png|webp|gif|avif|heic)$/i.test(e.name))) {
      const source = path.join(sourceDir, entry.name), target = path.join(targetDir, entry.name + '.webp');
      if (fs.existsSync(target) && fs.statSync(target).mtimeMs >= fs.statSync(source).mtimeMs) continue;
      stale++;
      if (check) continue;
      fs.mkdirSync(targetDir, { recursive: true });
      const temporary = target + '.tmp';
      try {
        await sharp(source, { animated: false }).rotate().resize({ width: 480, height: 480, fit: 'inside', withoutEnlargement: true }).webp({ quality: 75 }).toFile(temporary);
        fs.renameSync(temporary, target);
        console.log('Created ' + path.relative(root, target));
      } catch (error) {
        fs.rmSync(temporary, { force: true });
        throw new Error(`Could not create thumbnail for ${source}: ${error.message}`);
      }
    }
  }
  if (check && stale) throw new Error(`${stale} thumbnail(s) are missing or out of date. Run the build without --check.`);
})().catch(error => { console.error(error.message); process.exitCode = 1; });
