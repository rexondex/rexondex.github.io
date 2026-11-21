const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const root = path.resolve(__dirname, '..');
(async () => {
  for (const sector of fs.readdirSync(path.join(root, 'media'), { withFileTypes: true }).filter(e => e.isDirectory())) {
    const sourceDir = path.join(root, 'media', sector.name);
    const targetDir = path.join(root, 'thumbnails', sector.name);
    fs.mkdirSync(targetDir, { recursive: true });
    for (const file of fs.readdirSync(sourceDir).filter(name => /\.(jpe?g|png|webp|gif|avif|heic)$/i.test(name))) {
      const source = path.join(sourceDir, file), target = path.join(targetDir, file + '.webp');
      if (fs.existsSync(target) && fs.statSync(target).mtimeMs >= fs.statSync(source).mtimeMs) continue;
      try {
        await sharp(source, { animated: false }).rotate().resize({ width: 480, height: 480, fit: 'inside', withoutEnlargement: true }).webp({ quality: 75 }).toFile(target);
        console.log('Created ' + path.relative(root, target));
      } catch (error) { console.warn('Skipped ' + file + ': ' + error.message); }
    }
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
