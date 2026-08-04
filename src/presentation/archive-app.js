import { dateToDiaryId, formatDate, parseDiaryId } from '../domain/diary.js';
import { THEMES } from './theme-manager.js';

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

export class ArchiveApp {
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
