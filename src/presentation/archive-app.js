import { dateToDiaryId, formatDate, parseDiaryId } from '../domain/diary.js';
import { THEMES } from './theme-manager.js';

const icon = (name) => ({
  arrowLeft: '<path d="m15 18-6-6 6-6"/>', arrowRight: '<path d="m9 18 6-6-6-6"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>', palette: '<path d="M12 3a9 9 0 1 0 0 18h1.5a1.5 1.5 0 0 0 0-3H12a1.5 1.5 0 0 1 0-3h2a7 7 0 0 0 7-7c0-2.76-4.03-5-9-5Z"/><circle cx="7.5" cy="10" r=".8" fill="currentColor"/><circle cx="10" cy="6.7" r=".8" fill="currentColor"/><circle cx="14.2" cy="6.4" r=".8" fill="currentColor"/>',
  external: '<path d="M14 5h5v5M19 5l-9 9"/><path d="M18 13v5a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>'
}[name]);
const svg = (name) => `<svg viewBox="0 0 24 24" aria-hidden="true">${icon(name)}</svg>`;
const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export class ArchiveApp {
  constructor(deps) { Object.assign(this, deps); this.requestId = 0; }

  mount() {
    this.root.innerHTML = this.shell();
    this.els = Object.fromEntries(['yearNav','monthNav','calendar','calendarTitle','monthMeta','themeMenu','themeButton','reader','readerBody','readerKind','prevEntry','nextEntry'].map((id) => [id, document.getElementById(id)]));
    this.bind(); this.render();
    this.repository.findReferenceIds(this.archive.ids).then((ids) => this.store.setReferences(ids));
  }

  shell() { return `
    <div class="app-shell">
      <aside class="rail">
        <a class="identity" href="./"><span class="identity-mark">R</span><span>REXONDEX<small>PERSONAL ARCHIVE</small></span></a>
        <div class="rail-section"><span class="rail-label">Index / Year</span><nav id="yearNav" class="year-nav"></nav></div>
        <div class="archive-tally"><strong>${String(this.archive.ids.length).padStart(2, '0')}</strong><span>entries<br>preserved</span></div>
        <div class="rail-footer"><span>EST. 2026</span><a href="https://github.com/rexondex" target="_blank" rel="noopener">GITHUB ↗</a></div>
      </aside>
      <main class="workspace">
        <header class="topbar">
          <div><span class="status-dot"></span> ARCHIVE ONLINE</div>
          <button class="theme-trigger" id="themeButton" type="button" aria-haspopup="true" aria-expanded="false">${svg('palette')}<span>THEME</span></button>
          <div class="theme-menu" id="themeMenu" hidden>${THEMES.map((t) => `<button type="button" data-theme-id="${t.id}"><i></i><span>${t.name}<small>${t.description}</small></span><b>✓</b></button>`).join('')}</div>
        </header>
        <section class="hero">
          <p class="kicker">PRIVATE DIGITAL COLLECTION · VOL. 01</p>
          <h1>기억을 위한<br><em>개인 기록 보관소</em></h1>
          <p class="hero-copy">흘러가는 생각과 하루의 단서를 날짜 위에 축적합니다. 오래 남겨두고, 언제든 다시 찾아보기 위한 작은 아카이브입니다.</p>
        </section>
        <section class="archive-board">
          <header class="board-header">
            <div><span class="section-number">01</span><p>CALENDAR INDEX</p><h2 id="calendarTitle"></h2><small id="monthMeta"></small></div>
            <div class="month-stepper"><button data-move="-1" aria-label="이전 달">${svg('arrowLeft')}</button><span>MONTH</span><button data-move="1" aria-label="다음 달">${svg('arrowRight')}</button></div>
          </header>
          <nav class="month-nav" id="monthNav" aria-label="월 선택"></nav>
          <div class="weekday-row"><span>MON</span><span>TUE</span><span>WED</span><span>THU</span><span>FRI</span><span>SAT</span><span>SUN</span></div>
          <div class="calendar-grid" id="calendar" role="grid"></div>
          <footer class="board-legend"><span><i class="legend written"></i>WRITTEN</span><span><i class="legend reference"></i>WITH REFERENCE</span><p>날짜를 선택해 기록 열기</p></footer>
        </section>
        <footer class="site-footer"><span>REXONDEX ARCHIVE © 2026</span><span>KEEPING SMALL THINGS, FOR A LONG TIME.</span></footer>
      </main>
    </div>
    <dialog class="reader" id="reader">
      <div class="reader-frame">
        <header><span id="readerKind">ARCHIVE ENTRY</span><div><button id="prevEntry" aria-label="이전 기록">${svg('arrowLeft')}</button><button id="nextEntry" aria-label="다음 기록">${svg('arrowRight')}</button><button data-close aria-label="닫기">${svg('close')}</button></div></header>
        <div class="reader-body" id="readerBody"></div>
      </div>
    </dialog>`; }

  bind() {
    this.store.addEventListener('change', () => this.render());
    document.querySelectorAll('[data-move]').forEach((el) => el.addEventListener('click', () => this.store.moveMonth(Number(el.dataset.move))));
    this.els.themeButton.addEventListener('click', () => { const open = this.els.themeMenu.hidden; this.els.themeMenu.hidden = !open; this.els.themeButton.setAttribute('aria-expanded', open); });
    this.els.themeMenu.addEventListener('click', (e) => { const button = e.target.closest('[data-theme-id]'); if (button) { this.themes.apply(button.dataset.themeId); this.els.themeMenu.hidden = true; this.renderThemes(); } });
    document.addEventListener('click', (e) => { if (!e.target.closest('.theme-trigger, .theme-menu')) this.els.themeMenu.hidden = true; });
    this.els.reader.querySelector('[data-close]').addEventListener('click', () => this.closeReader());
    this.els.reader.addEventListener('cancel', (e) => { e.preventDefault(); this.closeReader(); });
    this.els.reader.addEventListener('click', (e) => { if (e.target === this.els.reader) this.closeReader(); });
    this.els.prevEntry.addEventListener('click', () => this.openAdjacent(-1));
    this.els.nextEntry.addEventListener('click', () => this.openAdjacent(1));
    window.addEventListener('keydown', (e) => { if (this.els.reader.open && e.key === 'ArrowLeft') this.openAdjacent(-1); if (this.els.reader.open && e.key === 'ArrowRight') this.openAdjacent(1); });
  }

  render() { this.renderYears(); this.renderMonths(); this.renderCalendar(); this.renderThemes(); }
  renderYears() {
    const years = this.archive.years.includes(this.store.state.year) ? this.archive.years : [...this.archive.years, this.store.state.year].sort((a,b) => b-a);
    this.els.yearNav.innerHTML = years.map((year) => `<button class="${year === this.store.state.year ? 'active' : ''}" data-year="${year}"><span>${year}</span><small>${String(this.archive.count(year)).padStart(2,'0')}</small></button>`).join('');
    this.els.yearNav.querySelectorAll('button').forEach((button) => button.addEventListener('click', () => this.store.view(Number(button.dataset.year), this.store.state.month)));
  }
  renderMonths() {
    this.els.monthNav.innerHTML = Array.from({length: 12}, (_, month) => `<button class="${month === this.store.state.month ? 'active' : ''}" data-month="${month}"><span>${String(month + 1).padStart(2,'0')}</span><small>${this.archive.count(this.store.state.year, month) || '—'}</small></button>`).join('');
    this.els.monthNav.querySelectorAll('button').forEach((button) => button.addEventListener('click', () => this.store.view(this.store.state.year, Number(button.dataset.month))));
  }
  renderCalendar() {
    const { year, month, referenceIds } = this.store.state;
    const count = this.archive.count(year, month); const first = new Date(year, month, 1);
    const gridStart = new Date(year, month, 1 - ((first.getDay() + 6) % 7));
    this.els.calendarTitle.textContent = `${year} / ${String(month + 1).padStart(2,'0')}`;
    this.els.monthMeta.textContent = `${String(count).padStart(2,'0')} ENTRIES IN THIS MONTH`;
    this.els.calendar.setAttribute('aria-label', `${year}년 ${month + 1}월`);
    this.els.calendar.innerHTML = Array.from({length: 42}, (_, i) => {
      const date = new Date(gridStart); date.setDate(gridStart.getDate() + i);
      const id = dateToDiaryId(date), has = this.archive.idSet.has(id), outside = date.getMonth() !== month;
      const reference = referenceIds.has(id), today = new Date().toDateString() === date.toDateString();
      return `<div class="day ${outside ? 'outside' : ''} ${today ? 'today' : ''}" role="gridcell">${has
        ? `<button data-entry="${id}" class="has-entry ${reference ? 'has-reference' : ''}" aria-label="${escapeHtml(formatDate(date))} 기록 열기"><span>${String(date.getDate()).padStart(2,'0')}</span><i></i><small>${reference ? 'REF.' : 'NOTE'}</small></button>`
        : `<span class="empty-day">${String(date.getDate()).padStart(2,'0')}</span>`}</div>`;
    }).join('');
    this.els.calendar.querySelectorAll('[data-entry]').forEach((button) => button.addEventListener('click', () => this.openReader(button.dataset.entry)));
  }
  renderThemes() { this.els.themeMenu.querySelectorAll('[data-theme-id]').forEach((b) => b.classList.toggle('active', b.dataset.themeId === this.themes.current)); }

  async openReader(id) {
    this.store.open(id); this.els.readerBody.innerHTML = '<div class="reader-loading"><i></i>기록을 불러오는 중</div>';
    if (!this.els.reader.open) { this.els.reader.showModal(); document.body.classList.add('dialog-open'); }
    const token = ++this.requestId, date = parseDiaryId(id); this.updateReaderNav();
    try {
      const entry = await this.repository.get(id); if (token !== this.requestId) return;
      const rendered = window.marked ? window.marked.parse(entry.markdown) : `<p>${escapeHtml(entry.markdown).replace(/\n/g,'<br>')}</p>`;
      this.els.readerKind.textContent = entry.reference ? 'REFERENCE ENTRY' : 'ARCHIVE ENTRY';
      this.els.readerBody.innerHTML = `<article><header class="entry-heading"><p>ENTRY / ${id}</p><h2>${date.getDate()}일의 기록</h2><time>${escapeHtml(formatDate(date))}</time>${entry.reference ? `<a class="reference-card" href="${escapeHtml(entry.reference.href)}" target="_blank" rel="noopener"><span>REFERENCE</span><strong>${escapeHtml(entry.reference.label)}</strong>${svg('external')}</a>` : ''}</header><div class="entry-content">${rendered}</div></article>`;
      this.els.readerBody.scrollTop = 0;
    } catch { if (token === this.requestId) this.els.readerBody.innerHTML = `<div class="reader-error">기록을 불러오지 못했습니다.<small>daily/${escapeHtml(id)} 또는 daily/${escapeHtml(id)}.md 파일을 확인해주세요.</small></div>`; }
  }
  updateReaderNav() { const i = this.archive.ids.indexOf(this.store.state.activeId); this.els.prevEntry.disabled = i <= 0; this.els.nextEntry.disabled = i < 0 || i === this.archive.ids.length - 1; }
  openAdjacent(offset) { const id = this.store.adjacent(offset); if (id) this.openReader(id); }
  closeReader() { this.requestId++; this.els.reader.close(); document.body.classList.remove('dialog-open'); this.store.close(); }
}
