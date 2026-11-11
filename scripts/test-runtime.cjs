// Run with Node.js 18+; no package installation or network access is needed.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const boot = '  const diaryFiles = window.DIARY_FILES || [];';
assert.ok(source.includes(boot), 'Test hook must precede application startup');
const testSource = source.replace(boot, '  globalThis.testClasses = { ThemeManager, ArchiveApp, HttpDiaryRepository }; return;\n' + boot);
function load(storageDescriptor = { value: null }) {
  const elements = new Map();
  const element = () => ({ hidden: false, disabled: false, textContent: '', innerHTML: '', attributes: {},
    setAttribute(name, value) { this.attributes[name] = value; },
    removeAttribute(name) { delete this.attributes[name]; },
    insertAdjacentHTML(position, html) { this.innerHTML += html; }
  });
  const preference = { matches: false, addEventListener(name, listener) { this.listener = listener; } };
  const window = { matchMedia: () => preference, scrollTo() {} };
  Object.defineProperty(window, 'localStorage', storageDescriptor);
  const document = {
    body: { dataset: {} }, documentElement: { dataset: {} },
    querySelector: () => ({ setAttribute() {} }),
    getElementById(id) { if (!elements.has(id)) elements.set(id, element()); return elements.get(id); }
  };
  // DOM parsing is stubbed only for the small, controlled test diary strings.
  class DOMParser {
    parseFromString(html) {
      const match = html.match(/<div class="post-content">([\s\S]*?)<\/div>/);
      return { querySelector: () => match ? { innerHTML: match[1] } : null, querySelectorAll: () => [] };
    }
  }
  const context = vm.createContext({ window, document, DOMParser, URL, EventTarget, console: { warn() {} } });
  vm.runInContext(testSource, context);
  return { ...context.testClasses, context, window, document, preference, elements };
}

test('blocked storage getter, read and write do not prevent theme changes', () => {
  const blocked = () => { throw new Error('Storage blocked'); };
  for (const descriptor of [{ get: blocked }, { value: { getItem: blocked } },
    { value: { getItem: () => 'dark', setItem: blocked } }]) {
    const env = load(descriptor);
    const manager = new env.ThemeManager();
    manager.apply('light');
    assert.equal(manager.current, 'light');
    assert.equal(env.document.documentElement.dataset.theme, 'light');
    manager.apply('system');
    env.preference.matches = true;
    env.preference.listener();
    assert.equal(env.document.documentElement.dataset.theme, 'dark');
  }
});

test('available storage still restores and persists the theme', () => {
  const values = new Map([['archive-theme', 'dark']]);
  const env = load({ value: { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) } });
  const manager = new env.ThemeManager();
  assert.equal(manager.current, 'dark');
  assert.equal(env.document.documentElement.dataset.theme, 'dark');
  manager.apply('light');
  assert.equal(values.get('archive-theme'), 'light');
});

function makeFeed(env, ids) {
  const app = Object.create(env.ArchiveApp.prototype);
  Object.assign(app, { feedIds: ids, feedCursor: 0, pageSize: 2,
    archive: { files: new Map(ids.map(id => [id, `${id}.html`])) },
    els: { feedList: env.document.getElementById('feedList'), feedMore: env.document.getElementById('feedMore') } });
  return app;
}

test('SSG posts survive startup without diary fetches on home, archive and diary pages', () => {
  for (const [count, entryId, allEntries] of [[8, '', false], [10, '', true], [1, '261111', false]]) {
    const env = load();
    const ids = Array.from({ length: 10 }, (_, i) => `2611${String(11 - i).padStart(2, '0')}`);
    const app = makeFeed(env, entryId ? [entryId] : ids);
    app.entryId = entryId; app.allEntries = allEntries; app.activeView = 'feed';
    app.root = { querySelector: () => null, querySelectorAll: () => app.feedIds.slice(0, count).map(id => ({
      id: `daily-${id}`, outerHTML: `<div class="post-content"><p>SSG ${id}</p></div>`
    })) };
    app.shell = () => '';
    for (const method of ['bind', 'renderPictureSectors', 'renderCalendar', 'renderYears', 'renderMonths', 'showView']) app[method] = () => {};
    app.repository = { get() { assert.fail('Initial diary must not be fetched'); } };
    app.mount();
    assert.equal(app.feedCursor, count);
    assert.equal((app.els.feedList.innerHTML.match(/<article /g) || []).length, count);
    assert.ok(app.els.feedList.innerHTML.includes(`SSG ${app.feedIds[0]}`));
    assert.equal(app.els.feedMore.hidden, entryId !== '' || allEntries);
  }
});

test('failed batch preserves existing posts; retry appends once, in order, using successful cached entries', async () => {
  const env = load();
  const app = makeFeed(env, ['261111', '261110', '261109']);
  app.feedCursor = 1;
  app.els.feedList.innerHTML = '<article>Existing diary</article>';
  let fail = true;
  const requests = [];
  env.context.fetch = async url => {
    requests.push(url);
    return { ok: !(fail && url.includes('261109')), status: 503,
      text: async () => `<div class="post-content"><p>${url}</p></div>` };
  };
  app.repository = new env.HttpDiaryRepository('./database', app.archive.files);
  const pending = app.renderNextFeedPage();
  assert.equal(app.renderNextFeedPage(), pending, 'Concurrent clicks must share one load');
  await pending;
  assert.equal(app.feedCursor, 1);
  assert.equal(app.els.feedList.innerHTML, '<article>Existing diary</article>');
  assert.equal(app.feedLoadPromise, null);
  assert.equal(app.els.feedMore.disabled, false);
  assert.equal(app.els.feedMore.hidden, false);
  assert.equal(app.els.feedList.attributes['aria-busy'], undefined);
  fail = false;
  await app.renderNextFeedPage();
  assert.equal(app.feedCursor, 3);
  assert.equal(app.els.feedMore.hidden, true);
  const html = app.els.feedList.innerHTML;
  assert.equal((html.match(/<article/g) || []).length, 3);
  assert.ok(html.indexOf('daily-261110') < html.indexOf('daily-261109'));
  assert.equal(requests.filter(url => url.includes('261110')).length, 1);
  assert.equal(requests.filter(url => url.includes('261109')).length, 2);
});

test('network and malformed HTML failures leave an empty fallback feed retryable', async () => {
  for (const kind of ['network', 'markup']) {
    const env = load();
    const app = makeFeed(env, ['261111']);
    let fail = true;
    env.context.fetch = async () => {
      if (fail && kind === 'network') throw new Error('Offline');
      return { ok: true, text: async () => fail ? '<p>No diary section</p>' : '<div class="post-content">Recovered</div>' };
    };
    app.repository = new env.HttpDiaryRepository();
    await app.renderNextFeedPage();
    assert.equal(app.feedCursor, 0);
    assert.equal(app.feedLoadPromise, null);
    assert.equal(app.els.feedMore.disabled, false);
    fail = false;
    await app.renderNextFeedPage();
    assert.equal(app.feedCursor, 1);
    assert.ok(app.els.feedList.innerHTML.includes('Recovered'));
  }
});
