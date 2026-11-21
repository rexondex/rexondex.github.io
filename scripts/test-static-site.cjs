const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const project = path.resolve(__dirname, '..'), fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'archive-test-'));
const target = name => path.join(fixture, name), put = (name, text) => fs.writeFileSync(target(name), text);
function snapshot() {
  return ['index.html','archive.html','pictures.html','database.js','pictures.js','sitemap.xml','database/261101.html'].map(name => fs.existsSync(target(name)) ? crypto.createHash('sha256').update(fs.readFileSync(target(name))).digest('hex') : '').join(':');
}
function build(expected = '', check = false) {
  const before = snapshot(), result = spawnSync(process.execPath, [path.join(__dirname,'build-static-site.cjs'),'--site-root',fixture,...(check ? ['--check'] : [])], { encoding:'utf8' });
  const output = result.stdout + result.stderr;
  if (expected) {
    if (result.status === 0 || !output.includes(expected)) throw Error(`Expected failure '${expected}': ${output}`);
    if (snapshot() !== before) throw Error(`Failed build modified generated files: ${expected}`);
  } else if (result.status !== 0) throw Error(`Build failed: ${output}`);
  if (check && snapshot() !== before) throw Error('Check mode wrote generated files.');
}
try {
  for (const name of ['database','media/PIC-1','pictures']) fs.mkdirSync(target(name), { recursive:true });
  for (const entry of fs.readdirSync(project,{withFileTypes:true})) if (entry.isFile()) fs.copyFileSync(path.join(project,entry.name),target(entry.name));
  const photo = fs.readdirSync(path.join(project,'media/PIC-1')).find(name => name.endsWith('.jpg'));
  fs.copyFileSync(path.join(project,'media/PIC-1',photo),target('media/PIC-1/photo.jpg'));
  put('database/261101.html','<p>Fixture diary.</p>');
  build(); if (!fs.existsSync(target('thumbnails/PIC-1/photo.jpg.webp'))) throw Error('Thumbnail not created.');
  build('',true);
  const image = target('media/PIC-1/photo.jpg');
  fs.utimesSync(image, new Date(Date.now() + 10000), new Date(Date.now() + 10000));
  build('thumbnail(s) are missing or out of date', true);
  fs.utimesSync(image, new Date(), new Date());
  const runtime = fs.readFileSync(target('app.js'),'utf8');
  put('app.js',runtime.replace("['picture',", "['media',")); build('Navigation view');
  put('app.js',runtime.replace("picture: '<rect", "missingIcon: '<rect")); build('Navigation icon');
  put('app.js',runtime.replace("['feed', 'picture', 'calendar'", "['feed', 'media', 'calendar'")); build('showView list');
  put('app.js',runtime);
  put('database/261332.html','<p>Invalid date.</p>'); build('Invalid diary date'); fs.rmSync(target('database/261332.html'));
  const cleanDiary = fs.readFileSync(target('database/261101.html'),'utf8');
  put('database/261101.html',cleanDiary.replaceAll('Fixture diary.','<script>alert(1)</script>')); build('unsupported'); put('database/261101.html',cleanDiary);
  const diary = fs.readFileSync(target('database/261101.html'),'utf8');
  put('database/261101.html',diary.replaceAll('Fixture diary.',"Fixture diary.<img src='./media/PIC-1/missing.jpg' alt=''>")); build('Broken link');
  put('database/261101.html',diary.replaceAll('Fixture diary.',"Fixture diary.<img src='./media/pic-1/photo.jpg' alt=''>")); build('Broken link');
  put('database/261101.html',diary); put('pictures/obsolete.html','<p>Old gallery.</p>'); build('Obsolete gallery'); fs.rmSync(target('pictures/obsolete.html'));
  put('database.js','window.DIARY_FILES = [];'); build('out of date',true); build();
  fs.mkdirSync(target('picture')); build("Obsolete 'picture/'"); fs.rmSync(target('picture'),{recursive:true});
  fs.rmSync(target('media/PIC-1/photo.jpg')); build(); build('',true);
  fs.rmSync(target('media/PIC-1'),{recursive:true}); build('No photo sectors');
  console.log('PASS: generation, thumbnails, check mode, navigation, invalid dates, missing/case-sensitive links, stale galleries, stale output and legacy folders; failed builds preserve outputs.');
} catch (error) { console.error(error.message); process.exitCode = 1; }
finally { fs.rmSync(fixture,{recursive:true,force:true}); }
