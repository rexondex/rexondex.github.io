const JSON5 = require('json5');

// Extract data only; never execute the manifest as JavaScript.
function readArray(source, name) {
  const match = new RegExp('window\\.' + name + '\\s*=\\s*\\[').exec(source);
  if (!match) throw Error(`Missing window.${name} array.`);
  let depth = 0, quote = '', line = false, block = false, escape = false;
  const start = match.index + match[0].lastIndexOf('[');
  for (let i = start; i < source.length; i++) {
    const c = source[i], next = source[i + 1];
    if (line) { if (c === '\n') line = false; continue; }
    if (block) { if (c === '*' && next === '/') { block = false; i++; } continue; }
    if (quote) { if (escape) escape = false; else if (c === '\\') escape = true; else if (c === quote) quote = ''; continue; }
    if (c === '/' && next === '/') { line = true; i++; continue; }
    if (c === '/' && next === '*') { block = true; i++; continue; }
    if (c === '"' || c === "'") { quote = c; continue; }
    if (c === '[') depth++;
    if (c === ']' && --depth === 0) return JSON5.parse(source.slice(start, i + 1));
    if (c !== ']') continue;
  }
  throw Error(`Unclosed window.${name} array.`);
}
module.exports = { readArray };
