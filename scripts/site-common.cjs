const fs = require('node:fs');
const path = require('node:path');
const { decodeHTML, escapeAttribute } = require('entities');
const { readArray } = require('./manifest.cjs');
const imagePattern = /\.(?:jpe?g|png|webp|gif|avif|heic)$/i;
const imageLike = /\.(?:jpe?g|png|webp|gif|avif|heic|bmp|svg|tiff?|ico|jfif|apng)$/i;
const natural = (a, b) => a.replace(/\d+/g, n => n.padStart(30, '0')).localeCompare(b.replace(/\d+/g, n => n.padStart(30, '0')), 'en');
const escape = value => escapeAttribute(String(value));
const exists = p => fs.existsSync(p);
const read = p => fs.readFileSync(p, 'utf8');
const dirs = p => fs.readdirSync(p, { withFileTypes: true });
function diaryDate(id) {
  const date = new Date(Date.UTC(2000 + +id.slice(0, 2), +id.slice(2, 4) - 1, +id.slice(4, 6)));
  if (date.toISOString().slice(0, 10).replace(/-/g, '') !== '20' + id) throw Error(`Invalid diary date in '${id}.html'.`);
  return date;
}
function section(html, name) {
  const open = new RegExp(`<div\\b(?=[^>]*\\bclass\\s*=\\s*["'][^"']*\\b${name}\\b[^"']*["'])[^>]*>`, 'gi');
  const matches = [...html.matchAll(open)];
  if (matches.length > 1) throw Error(`Diary has multiple .${name} sections.`);
  if (!matches.length) return null;
  const start = matches[0].index + matches[0][0].length;
  const tags = /<div\b[^>]*>|<\/div\s*>/gi; tags.lastIndex = start;
  let depth = 1, m;
  while ((m = tags.exec(html))) { depth += /^<\//.test(m[0]) ? -1 : 1; if (!depth) return html.slice(start, m.index); }
  throw Error(`Unclosed ${name} div.`);
}
function assertMarkup(html, file) {
  const allowed = new Set('a abbr article aside b blockquote br cite code dd del div dl dt em figcaption figure footer h1 h2 h3 h4 h5 h6 header hr i img kbd li mark ol p pre q rp rt ruby s samp section small span strong sub sup table tbody td th thead time tr u ul var wbr'.split(' '));
  const voids = new Set('br hr img wbr'.split(' ')), stack = [];
  for (const [tag] of html.matchAll(/<!--[\s\S]*?-->|<![^>]*>|<\/?[a-z][a-z0-9:-]*\b[^>]*>/gi)) {
    if (/^<!/.test(tag)) continue;
    const m = /^<\s*(\/)?\s*([a-z][a-z0-9:-]*)/i.exec(tag), name = m[2].toLowerCase();
    if (!allowed.has(name)) throw Error(`Diary '${file}' has unsupported <${name}>.`);
    if (/\son[a-z]+\s*=|\sstyle\s*=|\ssrcdoc\s*=/i.test(tag) || /\b(?:href|src)\s*=\s*(?:["']\s*)?javascript\s*:/i.test(decodeHTML(tag))) throw Error(`Unsafe attribute in diary '${file}'.`);
    if (!m[1] && ((name === 'a' && !/\bhref\s*=/i.test(tag)) || (name === 'img' && !/\bsrc\s*=/i.test(tag)))) throw Error(`Missing href/src in diary '${file}'.`);
    if (m[1]) { if (voids.has(name) || stack.pop() !== name) throw Error(`Mismatched </${name}> in diary '${file}'.`); }
    else if (!voids.has(name) && !/\/\s*>$/.test(tag)) stack.push(name);
  }
  if (stack.length) throw Error(`Unclosed <${stack.at(-1)}> in diary '${file}'.`);
}
function links(content) {
  const found = [];
  content = content.replace(/\[\[(?:(https?:\/\/[^\]\s]+)|링크\|(https?:\/\/[^|\]\s]+)(?:\|([^\]\r\n]+))?)\]\]/g, (_, bare, url, label) => {
    const href = escape(bare || url); found.push(`<a class="post-reference" href="${href}">${label ? escape(label) : bare ? href : '링크'}</a>`); return '';
  }).replace(/<p>\s*<\/p>/gi, '');
  if (content.includes('[[')) throw Error('Unrecognized [[ link marker.');
  return { content, found };
}
function parseDiary(html, file, id) {
  const full = /<(?:html|head|body)\b|<!doctype/i.test(html);
  let content = section(html, 'post-content'), references = section(html, 'post-references');
  if (full && content === null) throw Error(`Diary '${file}' has no .post-content section.`);
  if (full) for (const tag of ['html', 'head', 'body']) if ((html.match(new RegExp(`<${tag}\\b`, 'gi')) || []).length !== 1 || (html.match(new RegExp(`</${tag}\\s*>`, 'gi')) || []).length !== 1) throw Error(`Incomplete <${tag}> in '${file}'.`);
  content ??= html.trim();
  if (/<[^>]*\[\[[^>]*>/s.test(content)) throw Error(`Link marker inside tag in '${file}'.`);
  assertMarkup(content, file); if (references !== null) assertMarkup(references, file);
  const parsed = links(content); content = parsed.content;
  if (!/<[a-z][^>]*>/i.test(content)) content = content.trim().split(/\r?\n[\t ]*\r?\n+/).filter(x => x.trim()).map(p => `<p>${p.split(/\r?\n/).map(x => escape(x.trim())).join('<br>')}</p>`).join('\n');
  if (references !== null) { const r = links(references); references = r.content + r.found.join(''); }
  if (parsed.found.length) references = (references || '') + parsed.found.join('');
  if (!content.trim()) throw Error(`Diary '${file}' has an empty body.`);
  const date = diaryDate(id), year = date.getUTCFullYear(), month = date.getUTCMonth() + 1, day = date.getUTCDate();
  const iso = date.toISOString().slice(0, 10), label = `${year}년 ${month}월 ${day}일`, longLabel = `${label} ${['일','월','화','수','목','금','토'][date.getUTCDay()]}요일`;
  content = content.replace(/^\s*<p>\s*\d{2}\.\d{2}\.\d{2}\s*<\/p>/, `<p>${id.slice(0,2)}.${id.slice(2,4)}.${id.slice(4,6)}</p>`);
  let summary = decodeHTML(content.replace(/<(?:script|style)\b[\s\S]*?<\/(?:script|style)>/gi, '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim().replace(/^\d{2}\.\d{2}\.\d{2}\s*/, '');
  if (summary.length > 150) summary = summary.slice(0, 150) + '…';
  return { id, content, references, iso, label, longLabel, description: `${label} 일기. ${summary}` };
}
module.exports = { fs, path, decodeHTML, readArray, imagePattern, imageLike, natural, escape, exists, read, dirs, diaryDate, parseDiary };
