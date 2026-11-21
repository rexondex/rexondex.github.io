const { fs, path, readArray, imagePattern, imageLike, natural, escape, exists, read, dirs, diaryDate, parseDiary } = require('./site-common.cjs');
const { spawnSync } = require('node:child_process');
const { validate } = require('./validate-static-site.cjs');
const argv = process.argv.slice(2), rootIndex = argv.indexOf('--site-root');
const root = path.resolve(rootIndex < 0 ? path.join(__dirname, '..') : argv[rootIndex + 1]);
const check = argv.includes('--check');
const pending = new Map(), file = p => path.join(root, p), load = p => read(file(p));
function fail(message) { throw Error(message); }
function shell(heading, body, nav) { return `<div class="social-shell">
  <header class="mobile-header"><a href="./">rexondex</a></header>
  <aside class="side-nav"><a class="wordmark" href="./"><img class="brand-logo" src="./favicon.svg" alt=""><span>rexondex</span><small>archive</small></a><nav aria-label="주요 메뉴"><a href="./">일기</a><a href="./pictures.html">사진</a></nav></aside>
  <main class="main-column"><section class="view feed-view" aria-labelledby="static-title">
    <header class="view-header"><h1 id="static-title">${heading}</h1></header>
    ${body}
    <footer class="diary-post">${nav}</footer>
  </section></main>
</div>`; }
function commit() {
  const id = `${process.pid}-${Date.now()}`, transactions = [];
  let complete = false, restored = true;
  try {
    for (const [name, content] of pending) {
      const target = file(name), temp = `${target}.seo-tmp-${id}`, backup = `${target}.seo-backup-${id}`;
      if (exists(target) && fs.statSync(target).isDirectory()) fail(`Cannot write generated file '${name}' because a folder exists there.`);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      const item = { target, temp, backup, had: exists(target), applied: false }; transactions.push(item);
      fs.writeFileSync(temp, content); if (item.had) fs.copyFileSync(target, backup);
    }
    for (const item of transactions) { fs.renameSync(item.temp, item.target); item.applied = true; }
    complete = true;
  } catch (error) {
    for (const item of transactions.reverse()) if (item.applied) try { if (item.had) fs.copyFileSync(item.backup, item.target); else fs.rmSync(item.target, { force: true }); } catch { restored = false; }
    if (!restored) throw Error(`Could not write generated files: ${error.message}. Rollback incomplete; backups retained: ${transactions.filter(x => exists(x.backup)).map(x => x.backup).join(', ')}`);
    throw Error(`Could not write generated files: ${error.message}. Existing outputs restored.`);
  } finally {
    for (const item of transactions) { try { fs.rmSync(item.temp, { force: true }); if (complete || restored) fs.rmSync(item.backup, { force: true }); } catch (e) { console.warn(e.message); } }
  }
}
try {
  console.log('[1/4] Generating thumbnails and reading sources...');
  const thumb = spawnSync(process.execPath, [path.join(__dirname, 'generate-thumbnails.cjs'), '--site-root', root, ...(check ? ['--check'] : [])], { stdio: 'inherit' });
  if (thumb.status !== 0) fail('Thumbnail generation failed. Run npm install and check the reported error.');
  if (!exists(file('database'))) fail('Diary folder not found: database/');
  const diaryEntries = dirs(file('database'));
  if (diaryEntries.some(e => e.isDirectory() && /^\d{6}\.html$/.test(e.name))) fail('Diary entry is a folder. Use an HTML file.');
  const ids = diaryEntries.filter(e => e.isFile() && /^\d{6}\.html$/.test(e.name)).map(e => e.name.slice(0, 6)).sort().reverse();
  for (const id of ids) diaryDate(id);
  if (!ids.length) fail('No publishable diaries found.');
  const previous = exists(file('pictures.js')) ? readArray(load('pictures.js'), 'PICTURE_SECTORS') : [];
  if (!exists(file('media'))) fail('Missing media/ folder.');
  for (const old of ['picture', 'picutre']) if (exists(file(old))) fail(`Obsolete '${old}/' folder found.`);
  const entries = dirs(file('media'));
  if (entries.some(e => e.isFile() && imageLike.test(e.name))) fail('Photos must be inside a sector folder.');
  const folders = entries.filter(e => e.isDirectory()).map(e => e.name).sort(natural);
  if (!folders.length) fail('No photo sectors found.');
  const sectors = folders.map(id => {
    if (!/^[a-zA-Z0-9-]+$/.test(id)) fail(`Invalid photo sector '${id}'.`);
    const direct = dirs(file(`media/${id}`));
    const unsupported = direct.find(e => e.isFile() && imageLike.test(e.name) && !imagePattern.test(e.name));
    if (unsupported) fail(`Unsupported photo format '${unsupported.name}'.`);
    function nested(dir) { return dirs(dir).some(e => e.isDirectory() ? nested(path.join(dir,e.name)) : imageLike.test(e.name)); }
    if (direct.some(e => e.isDirectory() && nested(file(`media/${id}/${e.name}`)))) fail(`Nested photo folders are not supported: ${id}.`);
    const files = direct.filter(e => e.isFile() && imagePattern.test(e.name)).map(e => e.name).sort(natural).reverse();
    const prior = previous.find(x => x.id === id)?.descriptions || {}, descriptions = {};
    for (const name of Object.keys(prior).sort()) if (files.includes(name)) descriptions[name] = prior[name];
    return { id, descriptions, files, thumbnails: files.filter(name => exists(file(`thumbnails/${id}/${name}.webp`))) };
  });
  pending.set('database.js', `// Generated from database/ by scripts/build-static-site.cjs. Add HTML files to the folder.\nwindow.DIARY_FILES = [\n${ids.slice().reverse().map(id => `  '${id}.html',`).join('\n')}\n];\n`);
  pending.set('pictures.js', `// File lists are generated from media/sector folders. Photo descriptions are preserved.\nwindow.PICTURE_SECTORS = ${JSON.stringify(sectors, null, 2)};\n`);
  const home = load('index.html'), headMatch = /<head>([\s\S]*?)<\/head>/i.exec(home);
  if (!headMatch) fail("Home template 'index.html' has no complete <head> section.");
  let template = headMatch[1], site = /<link rel="canonical" href="([^"]+)"/.exec(template)?.[1];
  if (!site || !site.endsWith('/') || !/^https:\/\//.test(site) || new URL(site).search || new URL(site).hash) fail('Home canonical must be an absolute HTTPS URL ending in /.');
  for (const pattern of [/<title\b[\s\S]*?<\/title>/gi, /<meta\s+name="description"\s+content="[^"]*"\s*\/?>/gi, /<meta\s+name="robots"\s+content="[^"]*"\s*\/?>/gi, /<meta\s+property="og:url"\s+content="[^"]*"\s*\/?>/gi, /<meta\s+name="twitter:title"\s+content="[^"]*"\s*\/?>/gi]) if ([...template.matchAll(pattern)].length !== 1) fail('Home template is missing a required metadata tag.');
  const graph = JSON.parse(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(template)?.[1] || '{}')['@graph'];
  if (!Array.isArray(graph)) fail('Home template has no JSON-LD @graph.');
  template = template.replace(/\s*<script\b[\s\S]*?<\/script>/gi, '').replace(/\s*<base\b[^>]*>/gi, '').trim();
  function page(name, title, description, body, attributes = '', entity = null) {
    const url = name === 'index.html' ? site : site + name;
    let head = template.replace(/<title>.*?<\/title>/, () => `<title>${escape(title)}</title>`).replace(/(<meta\s+name="viewport"\s+content=")[^"]*(")/i, '$1width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no$2');
    for (const key of ['description','og:description','twitter:description']) head = head.replace(new RegExp(`((?:name|property)="${key}" content=")[^"]*`), (_, p) => p + escape(description));
    for (const key of ['og:title','twitter:title']) head = head.replace(new RegExp(`((?:name|property)="${key}" content=")[^"]*`), (_, p) => p + escape(title));
    head = head.replace(/(rel="canonical" href=")[^"]*/, (_, p) => p + url).replace(/(property="og:url" content=")[^"]*/, (_, p) => p + url);
    if (entity?.['@type'] === 'BlogPosting') head = head.replace('property="og:type" content="website"', 'property="og:type" content="article"') + `\n<meta property="article:published_time" content="${entity.datePublished}">`;
    const json = JSON.stringify({ '@context': 'https://schema.org', '@graph': entity ? [...graph, entity] : graph }, null, 2).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');
    const scripts = '<script src="./legacy-links.js"></script><script src="./theme-init.js"></script><script defer src="./database.js"></script><script defer src="./pictures.js"></script><script defer src="./app.js"></script>';
    const noscript = '<noscript><p>달력과 테마 설정은 JavaScript를 활성화하면 사용할 수 있습니다. <a href="./">메인</a> · <a href="./archive.html">전체 일기</a> · <a href="./pictures.html">사진</a></p></noscript>';
    pending.set(name, `<!doctype html>\n<html lang="ko">\n<head>\n${name.includes('/') ? '<base href="../">' : ''}${head}\n<script type="application/ld+json">${json}</script>\n${scripts}\n</head>\n<body ${attributes}><div id="app">\n<!-- STATIC-ARCHIVE:START -->\n${body}\n<!-- STATIC-ARCHIVE:END -->\n</div>${noscript}</body>\n</html>\n`);
  }
  console.log('[2/4] Rendering static pages in memory...');
  const posts = ids.map((id, i) => {
    const name = `database/${id}.html`, d = parseDiary(load(name), name, id), reference = d.references === null ? '' : `<div class="post-references" aria-label="참고 링크">${d.references}</div>`;
    const post = `<article class="diary-post" id="daily-${id}" aria-label="${escape(d.longLabel)}">\n  <header><img class="post-avatar" src="./rexondex.jpg" alt="" width="44" height="44" loading="lazy"><div><strong>rexondex</strong><time datetime="${d.iso}">${escape(d.longLabel)}</time></div></header>\n  ${reference}\n  <div class="post-content">${d.content}</div>\n  <footer><a class="post-permalink" href="./${name}">${id} &#183; &#47553;&#53356;</a></footer>\n</article>`;
    let nav = '<a href="./">메인</a> · <a href="./archive.html">전체 일기</a>';
    if (i > 0) nav += ` · <a href="./database/${ids[i-1]}.html">다음 일기</a>`;
    if (i < ids.length-1) nav += ` · <a href="./database/${ids[i+1]}.html">이전 일기</a>`;
    const entity = { '@type': 'BlogPosting', '@id': `${site}${name}#article`, headline: `${d.label} 일기`, description: d.description, datePublished: d.iso, inLanguage: 'ko', author: { '@id': `${site}#author` }, mainEntityOfPage: site + name };
    page(name, `${d.label} 일기 | rexondex Archive`, d.description, shell(`${d.label} 일기`, post, nav), `data-diary-id="${id}"`, entity); return post;
  });
  page('index.html', 'rexondex Archive', 'rexondex의 일기와 사진을 모은 개인 디지털 아카이브입니다. 일상의 기록과 참고 링크를 달력으로 탐색할 수 있습니다.', shell('일기', posts.slice(0,8).join('\n'), '<a href="./archive.html">전체 일기 보기</a> · <a href="./pictures.html">사진 보기</a>'));
  page('archive.html', '전체 일기 | rexondex Archive', 'rexondex의 전체 일기를 최신 날짜순으로 읽고, 각 날짜의 일기와 참고 링크를 찾아볼 수 있습니다.', shell('전체 일기', posts.join('\n'), '<a href="./">일기장으로 돌아가기</a>'), 'data-all-entries="true"');
  const urls = [`<url><loc>${site}</loc></url>`, `<url><loc>${site}archive.html</loc></url>`, ...ids.map(id => `<url><loc>${site}database/${id}.html</loc></url>`)];
  sectors.forEach((sector, i) => {
    const name = i ? `pictures/${sector.id}.html` : 'pictures.html';
    const navigation = sectors.map((s, j) => `<a href="${j ? `./pictures/${s.id}.html` : './pictures.html'}">${escape(s.id)}</a>`).join('');
    const images = [...sector.files].sort().reverse().map(f => {
      const src = `./media/${sector.id}/${encodeURIComponent(f)}`, thumb = sector.thumbnails.includes(f) ? `./thumbnails/${sector.id}/${encodeURIComponent(f)}.webp` : src, alt = escape(sector.descriptions[f] || ''), label = alt || escape(`${sector.id}/${f} 사진 크게 보기`);
      return `<a class="picture-tile" href="${src}" aria-label="${label}"><img src="${thumb}" alt="${alt}" loading="lazy" decoding="async"></a>`;
    });
    const content = `<div class="picture-toolbar"><nav class="picture-sector-nav" aria-label="사진 섹터">${navigation}</nav><span>${sector.files.length}장</span></div><div class="picture-grid">${images.join('\n')}</div>`;
    const entity = { '@type':'CollectionPage', name:`rexondex 사진 ${sector.id}`, url:site+name, inLanguage:'ko' };
    page(name, `사진 ${sector.id} | rexondex Archive`, `rexondex의 ${sector.id} 사진 아카이브입니다. ${sector.files.length}장의 사진을 둘러보고 원본을 열어볼 수 있습니다.`, shell('사진', content, '<a href="./">일기장으로 돌아가기</a>').replace('view feed-view','view picture-view'), `data-initial-view="picture" data-picture-sector="${sector.id}"`, entity);
    urls.push(`<url><loc>${site}${name}</loc>${sector.files.filter(f => !/\.heic$/i.test(f)).map(f => `<image:image><image:loc>${site}media/${sector.id}/${encodeURIComponent(f)}</image:loc></image:image>`).join('')}</url>`);
  });
  pending.set('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n${urls.join('\n')}\n</urlset>\n`);
  console.log('[3/4] Checking pages, manifests, media and local links...'); validate(root, pending);
  if (check) {
    const changed = [...pending].filter(([name, content]) => !exists(file(name)) || load(name) !== content).map(([name]) => name);
    if (changed.length) fail(`Generated output is out of date: ${changed.join(', ')}. Run the builder without --check.`);
    console.log('[4/4] PASS: generated files are current; no files changed.');
  } else { console.log('[4/4] Saving validated pages with rollback protection...'); commit(); console.log(`Updated snapshots and sitemap for ${ids.length} diaries and ${sectors.length} galleries.`); }
} catch (error) { console.error(`FAIL: ${error.message}`); process.exitCode = 1; }
