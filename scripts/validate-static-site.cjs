const { fs, path, decodeHTML, readArray, imagePattern, read, dirs } = require('./site-common.cjs');
const { XMLParser, XMLValidator } = require('fast-xml-parser');
const assert = (value, message) => { if (!value) throw Error(message); };
const same = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
function validate(root, overlay = new Map()) {
  const load = name => overlay.has(name) ? overlay.get(name) : read(path.join(root, name));
  function leaf(name) {
    if (overlay.has(name)) return true;
    let current = root;
    for (const part of name.split('/')) {
      if (!part || part === '.') continue;
      if (part === '..' || !fs.existsSync(current) || !fs.statSync(current).isDirectory() || !fs.readdirSync(current).includes(part)) return false;
      current = path.join(current, part);
    }
    return fs.existsSync(current) && fs.statSync(current).isFile();
  }
  const home = load('index.html'), site = /rel="canonical" href="([^"]+)"/.exec(home)?.[1];
  assert(site, 'Home canonical missing.');
  const xml = load('sitemap.xml'); assert(XMLValidator.validate(xml) === true, 'Invalid sitemap XML.');
  const parsed = new XMLParser({ ignoreAttributes: false }).parse(xml), nodes = [].concat(parsed.urlset?.url || []);
  const locations = nodes.map(x => x.loc);
  assert(new Set(locations).size === locations.length, 'Duplicate sitemap URLs.');
  const diaries = readArray(load('database.js'), 'DIARY_FILES');
  assert(diaries.every(x => /^\d{6}\.html$/.test(x)), 'Invalid diary manifest.');
  const diskDiaries = dirs(path.join(root,'database')).filter(x => x.isFile() && /^\d{6}\.html$/.test(x.name)).map(x => x.name);
  assert(same(diaries, diskDiaries), 'Diary manifest differs from database/.');
  const sectors = readArray(load('pictures.js'), 'PICTURE_SECTORS');
  assert(same(sectors.map(x => x.id), dirs(path.join(root,'media')).filter(x => x.isDirectory()).map(x => x.name)), 'Photo manifest differs from media/ sectors.');
  const pages = ['index.html','archive.html',...diaries.map(x => `database/${x}`)], expectedImages = [];
  sectors.forEach((sector,i) => {
    const gallery = i ? `pictures/${sector.id}.html` : 'pictures.html'; pages.push(gallery);
    const html = load(gallery), photos = dirs(path.join(root,'media',sector.id)).filter(e => e.isFile() && imagePattern.test(e.name)).map(e => e.name);
    assert(html.includes(`data-picture-sector="${sector.id}"`), `Wrong gallery state: ${gallery}`);
    assert(same(sector.files, photos), `Photo list differs from media/${sector.id}/.`);
    assert([...html.matchAll(/<img\b[^>]*src="\.\/(?:media|thumbnails)\//g)].length === photos.length, `Gallery photo count mismatch: ${gallery}`);
    for (const photo of sector.files) {
      const src = `./media/${sector.id}/${encodeURIComponent(photo)}`, preview = (sector.thumbnails || []).includes(photo) ? `./thumbnails/${sector.id}/${encodeURIComponent(photo)}.webp` : src;
      assert(leaf(`media/${sector.id}/${photo}`), `Missing photo or incorrect path case: ${photo}`);
      assert(html.includes(`href="${src}"`) && html.includes(`src="${preview}"`), `Photo missing from gallery: ${photo}`);
      if (!/\.heic$/i.test(photo)) expectedImages.push(site + src.slice(2));
    }
  });
  assert(same(locations, pages.map(p => p === 'index.html' ? site : site+p)), 'Sitemap does not match current pages.');
  if (fs.existsSync(path.join(root,'pictures'))) for (const e of dirs(path.join(root,'pictures'))) if (e.isFile() && e.name.endsWith('.html')) assert(pages.includes(`pictures/${e.name}`), `Obsolete gallery: pictures/${e.name}`);
  const runtime = load('app.js');
  assert(runtime.includes('./media/${encodeURIComponent(sector)}/${encodeURIComponent(file)}'), 'app.js photo path must use media/<sector>/<file>.');
  const nav = /navItems\(\)\s*\{\s*return\s*\[([\s\S]*?)\]\.map/.exec(runtime)?.[1] || '';
  const navItems = [...nav.matchAll(/\['([^']+)',\s*'[^']+',\s*'([^']+)'\]/g)];
  assert(navItems.length, 'Cannot validate app.js navigation configuration.');
  const icons = /const paths = \{([\s\S]*?)\n  \};/.exec(runtime)?.[1] || '', viewSource = /showView\(view\)\s*\{[\s\S]*?\[([^\]]*)\]\.forEach/.exec(runtime)?.[1] || '';
  const views = navItems.map(x => x[1]);
  for (const [,view,icon] of navItems) { assert(runtime.includes(`id="${view}View"`), `Navigation view '${view}' has no matching section in app.js.`); assert(new RegExp(`\\b${icon}\\s*:`).test(icons), `Navigation icon '${icon}' is missing.`); }
  assert(same(views, [...viewSource.matchAll(/'([^']+)'/g)].map(x=>x[1])), 'app.js showView list does not match navigation views.');
  const titles = new Set(); let checkedLinks = 0;
  for (const location of locations) {
    assert(location.startsWith(site), `Sitemap URL outside site: ${location}`);
    const url = new URL(location); assert(!url.hash && !url.search, `Non-canonical sitemap URL: ${location}`);
    const relative = decodeURIComponent(location.slice(site.length)) || 'index.html';
    assert(leaf(relative), `Missing page: ${relative}`);
    const html = load(relative), initial = /data-initial-view="([^"]+)"/.exec(html)?.[1];
    if (initial) assert(views.includes(initial), `Unknown initial view in ${relative}`);
    assert([...html.matchAll(/<link rel="canonical"/g)].length === 1 && html.includes(`rel="canonical" href="${location}"`), `Wrong canonical: ${relative}`);
    assert(html.includes(`property="og:url" content="${location}"`), `Wrong sharing URL: ${relative}`);
    assert(html.includes('<meta name="robots" content="index, follow, max-image-preview:large">'), `Robots mismatch: ${relative}`);
    assert(html.includes('src="./legacy-links.js"'), `Legacy fallback missing: ${relative}`);
    assert([...html.matchAll(/<h1\b/g)].length === 1, `Expected one static heading: ${relative}`);
    const title = /<title>(.*?)<\/title>/.exec(html)?.[1]; assert(title && !titles.has(title), `Empty or duplicate title: ${relative}`); titles.add(title);
    const structured = JSON.parse(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html)?.[1] || '{}');
    const diary = /^database\/(\d{6})\.html$/.exec(relative);
    if (diary) {
      assert(html.includes(`data-diary-id="${diary[1]}"`) && [...html.matchAll(/<article\b/g)].length === 1 && html.includes('<div class="post-content">'), `Wrong diary state: ${relative}`);
      const articles = (structured['@graph'] || []).filter(x => x['@type'] === 'BlogPosting');
      assert(articles.length === 1 && articles[0].mainEntityOfPage === location, `Wrong article data: ${relative}`);
    }
    const base = new URL(/<base href="([^"]+)"/.exec(html)?.[1] || location, location);
    for (const match of html.matchAll(/\b(?:href|src)\s*=\s*["']([^"']+)["']/gi)) {
      const href = decodeHTML(match[1]); assert(!/^\.\/(?:archive\.html)?#daily-/.test(href), `Legacy diary link emitted: ${relative}`);
      if (/^https?:\/\//i.test(href)) continue;
      const target = new URL(href, base); if (!['http:','https:'].includes(target.protocol) || target.host !== new URL(site).host) continue;
      let local = decodeURIComponent(target.pathname.slice(new URL(site).pathname.length)); if (!local || local.endsWith('/')) local += 'index.html';
      assert(leaf(local), `Broken link in ${relative} -> ${href}`); checkedLinks++;
    }
  }
  const imageNodes = nodes.flatMap(n => [].concat(n['image:image'] || []).map(x => x['image:loc']));
  assert(same(expectedImages, imageNodes), 'Image sitemap does not match current media files.');
  for (const image of imageNodes) assert(leaf(decodeURIComponent(image.slice(site.length))), `Missing sitemap image: ${image}`);
  console.log(`PASS: ${locations.length} pages, ${diaries.length} diaries, ${imageNodes.length} sitemap images and ${checkedLinks} local links.`);
}
module.exports = { validate };
