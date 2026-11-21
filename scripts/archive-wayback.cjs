const fs = require('node:fs');
const path = require('node:path');
const { XMLParser, XMLValidator } = require('fast-xml-parser');
const args = process.argv.slice(2);
function option(name, fallback, min, max) {
  const i = args.indexOf(name), value = i < 0 ? fallback : Number(args[i+1]);
  if (!Number.isInteger(value) || value < min || value > max) throw Error(`Invalid ${name}.`);
  return value;
}
async function main() {
  const index = args.indexOf('--site-root'), root = path.resolve(index < 0 ? path.join(__dirname, '..') : args[index+1]);
  const start = option('--start-at', 1, 1, 100000), poll = option('--poll-seconds', 10, 1, 3600), timeout = option('--timeout-seconds', 300, 1, 86400);
  const xml = fs.readFileSync(path.join(root,'sitemap.xml'),'utf8');
  if (XMLValidator.validate(xml) !== true) throw Error('Invalid sitemap.xml.');
  const nodes = [].concat(new XMLParser().parse(xml).urlset?.url || []), urls = [];
  for (const node of nodes) {
    const text = String(node.loc || '').trim(); let url;
    try { url = new URL(text); } catch { throw Error(`Invalid or external sitemap URL: ${text}`); }
    if (url.protocol !== 'https:' || url.hostname !== 'rexondex.github.io' || url.username || url.password || url.hash) throw Error(`Invalid or external sitemap URL: ${text}`);
    if (!urls.includes(text)) urls.push(text);
  }
  if (!urls.length) throw Error('No page URLs found in sitemap.xml.');
  if (start > urls.length) throw Error(`Start-at exceeds the URL count (${urls.length}).`);
  console.log(`Page URLs: ${urls.length}; starting at: ${start}`);
  if (args.includes('--list-only')) { urls.slice(start-1).forEach((url,i) => console.log(`[${i+start}/${urls.length}] ${url}`)); return; }
  if (!process.env.IA_ACCESS_KEY || !process.env.IA_SECRET_KEY) throw Error('Set IA_ACCESS_KEY and IA_SECRET_KEY environment variables first. See README.md.');
  const headers = { Authorization:`LOW ${process.env.IA_ACCESS_KEY}:${process.env.IA_SECRET_KEY}`, Accept:'application/json' };
  async function request(url, options = {}) {
    const response = await fetch(url, { ...options, headers, signal: AbortSignal.timeout(60000) });
    if (!response.ok) throw Error(`Internet Archive returned HTTP ${response.status}.`);
    return response.json();
  }
  for (let i = start-1; i < urls.length; i++) {
    const url = urls[i]; console.log(`[${i+1}/${urls.length}] Submitting ${url}`);
    try {
      const job = await request('https://web.archive.org/save', { method:'POST', body:new URLSearchParams({ url }) });
      if (!/^[a-zA-Z0-9_-]+$/.test(job.job_id || '')) throw Error('The API did not return a valid job_id.');
      console.log(`Job: ${job.job_id}`); const deadline = Date.now() + timeout*1000; let status;
      do {
        await new Promise(resolve => setTimeout(resolve, poll*1000));
        status = await request(`https://web.archive.org/save/status/${job.job_id}`);
        if (status.status === 'success') { console.log(`Saved: ${url} (job ${job.job_id})`); break; }
        if (status.status !== 'pending') throw Error(`Archive job ended with status '${status.status}': ${status.message || ''} ${status.exception || ''}`);
      } while (Date.now() < deadline);
      if (status.status !== 'success') throw Error(`Timed out waiting for job ${job.job_id}; it may still be running.`);
    } catch (error) { throw Error(`Failed at URL ${i+1}: ${url}\n${error.message}\nAfter checking the job, resume with --start-at ${i+1}.`); }
  }
  console.log(`Finished: ${urls.length-start+1} page(s) reported success.`);
}
main().catch(error => { console.error(`FAIL: ${error.message}`); process.exitCode = 1; });
