(() => {
'use strict';
// Source: src/domain/diary.js
const parseDiaryId = (id) => {
  if (!/^\d{6}$/.test(String(id))) return null;
  const year = 2000 + Number(id.slice(0, 2));
  const month = Number(id.slice(2, 4)) - 1;
  const day = Number(id.slice(4, 6));
  const date = new Date(year, month, day);
  return date.getFullYear() === year && date.getMonth() === month && date.getDate() === day ? date : null;
};

const dateToDiaryId = (date) => [
  String(date.getFullYear()).slice(-2),
  String(date.getMonth() + 1).padStart(2, '0'),
  String(date.getDate()).padStart(2, '0')
].join('');

const formatDate = (date, weekday = true) => date.toLocaleDateString('ko-KR', {
  year: 'numeric', month: 'long', day: 'numeric', ...(weekday ? { weekday: 'long' } : {})
});

const normalizeLink = (value) => {
  const href = value.trim();
  if (/^(https?:\/\/|mailto:|\/|\.\/|\.\.\/|#)/i.test(href)) return href;
  if (/^(www\.|[a-z0-9.-]+\.[a-z]{2,})/i.test(href)) return `https://${href}`;
  return '';
};

const parseDiaryMarkdown = (source) => {
  const markdown = source.replace(/^\uFEFF/, '');
  const lines = markdown.split(/\r?\n/);
  const first = (lines[0] || '').trim();
  const mdLink = first.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
  const bracketLink = first.match(/^\[([^\]]+)\]$/);
  if (!mdLink && !bracketLink) return { markdown, reference: null };
  const raw = (mdLink ? mdLink[2] : bracketLink[1]).trim();
  const href = normalizeLink(raw);
  if (!href) return { markdown, reference: null };
  let label = mdLink?.[1]?.trim() || raw;
  try { if (label === raw) label = new URL(href).hostname.replace(/^www\./, ''); } catch { /* local URL */ }
  return { markdown: lines.slice(1).join('\n'), reference: { href, label } };
};

const createArchive = (rawIds) => {
  const ids = [...new Set(rawIds.filter((id) => parseDiaryId(id)))].sort();
  const idSet = new Set(ids);
  const dates = ids.map(parseDiaryId);
  return {
    ids, idSet, dates,
    latest: dates.at(-1) || new Date(),
    years: [...new Set(dates.map((date) => date.getFullYear()))].sort((a, b) => b - a),
    count(year, month = null) {
      return dates.filter((date) => date.getFullYear() === year && (month === null || date.getMonth() === month)).length;
    }
  };
};


// Source: src/infrastructure/static-diary-repository.js

class StaticDiaryRepository {
  #cache = new Map();

  constructor(records = {}) {
    this.records = Object.freeze({ ...records });
  }

  async get(id) {
    if (this.#cache.has(id)) return this.#cache.get(id);
    if (!Object.hasOwn(this.records, id)) throw new Error(`Diary ${id}: not found`);
    const entry = { id, ...parseDiaryMarkdown(this.records[id]) };
    this.#cache.set(id, entry);
    return entry;
  }

  async findReferenceIds(ids) {
    const references = await Promise.all(ids.map(async (id) => (await this.get(id)).reference ? id : null));
    return new Set(references.filter(Boolean));
  }
}


// Source: src/application/archive-store.js
class ArchiveStore extends EventTarget {
  constructor(archive) {
    super();
    this.archive = archive;
    this.state = {
      year: archive.latest.getFullYear(), month: archive.latest.getMonth(),
      activeId: null, referenceIds: new Set()
    };
  }
  emit() { this.dispatchEvent(new CustomEvent('change', { detail: this.state })); }
  view(year, month) { this.state.year = year; this.state.month = month; this.emit(); }
  moveMonth(offset) {
    const date = new Date(this.state.year, this.state.month + offset, 1);
    this.view(date.getFullYear(), date.getMonth());
  }
  open(id) {
    if (!this.archive.idSet.has(id)) return;
    const date = this.archive.dates[this.archive.ids.indexOf(id)];
    this.state.activeId = id; this.state.year = date.getFullYear(); this.state.month = date.getMonth(); this.emit();
  }
  close() { this.state.activeId = null; this.emit(); }
  setReferences(ids) { this.state.referenceIds = ids; this.emit(); }
  adjacent(offset) {
    const index = this.archive.ids.indexOf(this.state.activeId);
    return this.archive.ids[index + offset] || null;
  }
}


// Source: src/presentation/theme-manager.js
const THEMES = [
  { id: 'light', name: '밝게', description: '흰색 배경' },
  { id: 'dark', name: '어둡게', description: '검은색 배경' }
];

class ThemeManager extends EventTarget {
  constructor(storage = localStorage) {
    super(); this.storage = storage;
    this.current = THEMES.some((theme) => theme.id === document.documentElement.dataset.theme)
      ? document.documentElement.dataset.theme : 'light';
    this.apply(this.current);
  }
  apply(id) {
    if (!THEMES.some((theme) => theme.id === id)) return;
    this.current = id; document.documentElement.dataset.theme = id;
    this.storage.setItem('archive-theme', id);
    const colors = { light: '#f7f7f5', dark: '#151515' };
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', colors[id]);
    this.dispatchEvent(new CustomEvent('change', { detail: id }));
  }
}


// Source: src/presentation/archive-app.js

const paths = {
  feed: '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v13a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 18.5Z"/><path d="M8 8h8M8 12h8M8 16h5"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4.5 21a7.5 7.5 0 0 1 15 0"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1.03 1.56V21h-4v-.08A1.7 1.7 0 0 0 8.94 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.6 15 1.7 1.7 0 0 0 3.08 14H3v-4h.08A1.7 1.7 0 0 0 4.6 8.94a1.7 1.7 0 0 0-.34-1.88L4.2 7l2.83-2.83.06.06A1.7 1.7 0 0 0 9 4.6 1.7 1.7 0 0 0 10 3.08V3h4v.08A1.7 1.7 0 0 0 15.06 4.6a1.7 1.7 0 0 0 1.88-.34L17 4.2 19.83 7l-.06.06A1.7 1.7 0 0 0 19.4 9c.15.6.7 1 1.52 1H21v4h-.08A1.7 1.7 0 0 0 19.4 15Z"/>',
  left: '<path d="m15 18-6-6 6-6"/>', right: '<path d="m9 18 6-6-6-6"/>',
  external: '<path d="M14 5h5v5M19 5l-9 9"/><path d="M18 13v5a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>'
};
const svg = (name) => `<svg viewBox="0 0 24 24" aria-hidden="true">${paths[name]}</svg>`;
const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const renderMarkdown = (markdown) => window.marked
  ? window.marked.parse(markdown)
  : `<p>${escapeHtml(markdown).replace(/\n{2,}/g, '</p><p>').replace(/\n/g, '<br>')}</p>`;
const profileImage = '<img class="avatar" src="./rexondex.jpg" alt="rexondex 프로필 이미지">';
const socialLinks = (compact = false) => `<div class="social-links ${compact ? 'compact' : ''}">
  <a href="https://rexondex.github.io" target="_blank" rel="noopener"><span>Website<small>rexondex.github.io</small></span>${svg('external')}</a>
  <a href="https://rexondex.tistory.com" target="_blank" rel="noopener"><span>Tistory<small>rexondex.tistory.com</small></span>${svg('external')}</a>
  <a href="https://www.reddit.com/user/rexondex" target="_blank" rel="noopener"><span>Reddit<small>u/rexondex</small></span>${svg('external')}</a>
  <a href="https://www.youtube.com/@rexon-dex" target="_blank" rel="noopener"><span>YouTube<small>@rexon-dex</small></span>${svg('external')}</a>
  <a href="https://x.com/rexon_dex" target="_blank" rel="noopener"><span>X<small>@rexon_dex</small></span>${svg('external')}</a>
</div>`;

class ArchiveApp {
  constructor(deps) { Object.assign(this, deps); this.activeView = 'feed'; }

  mount() {
    this.root.innerHTML = this.shell();
    this.els = Object.fromEntries(['feedView','feedList','calendarView','profileView','settingsView','yearNav','monthNav','calendar','calendarTitle','monthMeta'].map((id) => [id, document.getElementById(id)]));
    this.bind(); this.renderCalendar(); this.renderYears(); this.renderMonths(); this.renderFeed();
    this.repository.findReferenceIds(this.archive.ids).then((ids) => { this.store.setReferences(ids); this.renderCalendar(); });
  }

  navItems() { return [
    ['feed', '일기', 'feed'], ['calendar', '달력', 'calendar'], ['profile', '프로필', 'user'], ['settings', '설정', 'settings']
  ].map(([view, label, icon]) => `<button type="button" data-view="${view}" aria-label="${label}">${svg(icon)}<span>${label}</span></button>`).join(''); }

  shell() { return `
    <div class="social-shell">
      <header class="mobile-header"><a href="./">rexondex</a><span>일기</span></header>
      <aside class="side-nav"><a class="wordmark" href="./">rexondex<small>diary</small></a><nav aria-label="주요 메뉴">${this.navItems()}</nav><p>${this.archive.ids.length}개의 기록</p></aside>
      <main class="main-column">
        <section class="view feed-view" id="feedView" aria-labelledby="feedTitle"><header class="view-header"><h1 id="feedTitle">일기</h1><p>최근 기록부터 표시됩니다.</p></header><div id="feedList"></div></section>
        <section class="view calendar-view" id="calendarView" aria-labelledby="calendarPageTitle" hidden>
          <header class="view-header"><h1 id="calendarPageTitle">달력</h1><p>날짜별 기록을 찾아봅니다.</p></header>
          <div class="calendar-tools"><nav id="yearNav" class="year-nav" aria-label="연도 선택"></nav><div class="month-stepper"><button data-move="-1" aria-label="이전 달">${svg('left')}</button><button data-move="1" aria-label="다음 달">${svg('right')}</button></div></div>
          <div class="calendar-card"><header><h2 id="calendarTitle"></h2><span id="monthMeta"></span></header><nav class="month-nav" id="monthNav" aria-label="월 선택"></nav><div class="weekday-row" aria-hidden="true"><span>월</span><span>화</span><span>수</span><span>목</span><span>금</span><span>토</span><span>일</span></div><div class="calendar-grid" id="calendar" role="grid"></div></div>
        </section>
        <section class="view profile-view" id="profileView" aria-labelledby="profileTitle" hidden><div class="profile-card">${profileImage}<div><h1 id="profileTitle">rexondex</h1><p>@rexondex</p></div></div><dl><div><dt>작성한 날</dt><dd>${this.archive.ids.length}</dd></div><div><dt>수록 연도</dt><dd>${this.archive.years.length}</dd></div><div><dt>최근 기록</dt><dd>${this.archive.ids.at(-1) || '—'}</dd></div></dl><h2 class="profile-section-title">링크</h2>${socialLinks()}</section>
        <section class="view settings-view" id="settingsView" aria-labelledby="settingsTitle" hidden><header class="view-header"><h1 id="settingsTitle">설정</h1><p>화면 표시 방식을 선택합니다.</p></header><div class="setting-group"><h2>화면 모드</h2>${THEMES.map((theme) => `<button type="button" data-theme-id="${theme.id}"><span>${theme.name}<small>${theme.description}</small></span><b>✓</b></button>`).join('')}</div></section>
      </main>
      <aside class="right-panel"><div class="mini-profile">${profileImage}<div><strong>rexondex</strong><span>@rexondex</span></div></div><dl><div><dt>기록</dt><dd>${this.archive.ids.length}</dd></div><div><dt>최근</dt><dd>${this.archive.ids.at(-1) || '—'}</dd></div></dl>${socialLinks(true)}</aside>
      <nav class="bottom-nav" aria-label="주요 메뉴">${this.navItems()}</nav>
    </div>`; }

  bind() {
    document.querySelectorAll('[data-view]').forEach((button) => button.addEventListener('click', () => this.showView(button.dataset.view)));
    document.querySelectorAll('[data-move]').forEach((button) => button.addEventListener('click', () => this.store.moveMonth(Number(button.dataset.move))));
    document.querySelectorAll('[data-theme-id]').forEach((button) => button.addEventListener('click', () => { this.themes.apply(button.dataset.themeId); this.renderThemeState(); }));
    this.store.addEventListener('change', () => { this.renderYears(); this.renderMonths(); this.renderCalendar(); });
    this.els.calendar.addEventListener('click', (event) => { const button = event.target.closest('[data-entry]'); if (button) this.scrollToEntry(button.dataset.entry); });
    this.renderNavState(); this.renderThemeState();
  }

  showView(view) {
    this.activeView = view;
    ['feed','calendar','profile','settings'].forEach((name) => { document.getElementById(`${name}View`).hidden = name !== view; });
    this.renderNavState(); window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  renderNavState() { document.querySelectorAll('[data-view]').forEach((button) => { const active = button.dataset.view === this.activeView; button.classList.toggle('active', active); button.setAttribute('aria-current', active ? 'page' : 'false'); }); }
  renderThemeState() { document.querySelectorAll('[data-theme-id]').forEach((button) => button.classList.toggle('active', button.dataset.themeId === this.themes.current)); }

  async renderFeed() {
    this.els.feedList.innerHTML = '<div class="feed-loading">기록을 정리하는 중...</div>';
    const posts = await Promise.all([...this.archive.ids].reverse().map(async (id) => {
      const entry = await this.repository.get(id), date = parseDiaryId(id);
      return `<article class="diary-post" id="entry-${id}"><header><img class="post-avatar" src="./rexondex.jpg" alt=""><div><strong>rexondex</strong><time datetime="20${id.slice(0,2)}-${id.slice(2,4)}-${id.slice(4,6)}">${escapeHtml(formatDate(date))}</time></div></header>${entry.reference ? `<a class="post-reference" href="${escapeHtml(entry.reference.href)}" target="_blank" rel="noopener"><span>${escapeHtml(entry.reference.label)}</span>${svg('external')}</a>` : ''}<div class="post-content">${renderMarkdown(entry.markdown)}</div><footer><span>${id}</span></footer></article>`;
    }));
    this.els.feedList.innerHTML = posts.join('');
  }

  scrollToEntry(id) { this.showView('feed'); requestAnimationFrame(() => document.getElementById(`entry-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })); }
  renderYears() { this.els.yearNav.innerHTML = this.archive.years.map((year) => `<button class="${year === this.store.state.year ? 'active' : ''}" data-year="${year}">${year}<small>${this.archive.count(year)}</small></button>`).join(''); this.els.yearNav.querySelectorAll('button').forEach((button) => button.addEventListener('click', () => this.store.view(Number(button.dataset.year), this.store.state.month))); }
  renderMonths() { this.els.monthNav.innerHTML = Array.from({ length: 12 }, (_, month) => `<button class="${month === this.store.state.month ? 'active' : ''}" data-month="${month}">${month + 1}월</button>`).join(''); this.els.monthNav.querySelectorAll('button').forEach((button) => button.addEventListener('click', () => this.store.view(this.store.state.year, Number(button.dataset.month)))); }
  renderCalendar() {
    const { year, month, referenceIds } = this.store.state, first = new Date(year, month, 1), start = new Date(year, month, 1 - ((first.getDay() + 6) % 7));
    this.els.calendarTitle.textContent = `${year}년 ${month + 1}월`; this.els.monthMeta.textContent = `${this.archive.count(year, month)}개의 기록`;
    this.els.calendar.innerHTML = Array.from({ length: 42 }, (_, index) => { const date = new Date(start); date.setDate(start.getDate() + index); const id = dateToDiaryId(date), has = this.archive.idSet.has(id); return `<div class="day ${date.getMonth() !== month ? 'outside' : ''}">${has ? `<button data-entry="${id}" class="has-entry ${referenceIds.has(id) ? 'has-reference' : ''}" aria-label="${escapeHtml(formatDate(date))} 기록으로 이동"><span>${date.getDate()}</span></button>` : `<span>${date.getDate()}</span>`}</div>`; }).join('');
  }
}


// Source: src/main.js

const records = window.ARCHIVE_DATABASE || {};
const archive = createArchive(Object.keys(records));
const repository = new StaticDiaryRepository(records);
const store = new ArchiveStore(archive);
const themes = new ThemeManager();

new ArchiveApp({ root: document.querySelector('#app'), archive, repository, store, themes }).mount();

})();
