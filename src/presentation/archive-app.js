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
    <div class="site">
      <header class="global-header">
        <a class="identity" href="./"><span class="identity-mark" aria-hidden="true">R</span><span>REXONDEX</span><small>ARCHIVE</small></a>
        <nav aria-label="외부 링크"><a href="https://github.com/rexondex" target="_blank" rel="noopener">GitHub</a></nav>
        <button class="theme-trigger" id="themeButton" type="button" aria-haspopup="true" aria-expanded="false">${svg('palette')}<span>화면 설정</span></button>
        <div class="theme-menu" id="themeMenu" hidden>${THEMES.map((t) => `<button type="button" data-theme-id="${t.id}"><i></i><span>${t.name}<small>${t.description}</small></span><b>✓</b></button>`).join('')}</div>
      </header>
      <div class="archive-layout">
        <aside class="filter-panel" aria-label="아카이브 필터">
          <section class="dataset-summary" aria-labelledby="datasetTitle"><p class="panel-label" id="datasetTitle">데이터셋</p><dl><div><dt>전체 기록</dt><dd>${this.archive.ids.length}</dd></div><div><dt>수록 연도</dt><dd>${this.archive.years.length}</dd></div><div><dt>최종 기록</dt><dd>${this.archive.ids.at(-1) || '—'}</dd></div></dl></section>
          <section class="filter-section"><p class="panel-label">연도</p><nav id="yearNav" class="year-nav" aria-label="연도 선택"></nav></section>
          <div class="panel-note"><span class="status-dot"></span><span>데이터 인덱스 정상</span></div>
        </aside>
        <main class="workspace">
          <header class="content-header"><div><p class="breadcrumb">ARCHIVE / CALENDAR</p><h1>기록 인덱스</h1></div><div class="month-stepper"><button data-move="-1" aria-label="이전 달">${svg('arrowLeft')}</button><button data-move="1" aria-label="다음 달">${svg('arrowRight')}</button></div></header>
          <section class="archive-board" aria-labelledby="calendarTitle">
            <header class="board-header"><div><h2 id="calendarTitle"></h2><small id="monthMeta"></small></div></header>
            <nav class="month-nav" id="monthNav" aria-label="월 선택"></nav>
            <div class="weekday-row" aria-hidden="true"><span>월</span><span>화</span><span>수</span><span>목</span><span>금</span><span>토</span><span>일</span></div>
            <div class="calendar-grid" id="calendar" role="grid"></div>
            <footer class="board-legend"><span><i class="legend written"></i>기록 있음</span><span><i class="legend reference"></i>참고 링크 포함</span></footer>
          </section>
        </main>
      </div>
      <footer class="site-footer"><span>REXONDEX ARCHIVE</span><span>DATA FORMAT: YYMMDD</span><span>${this.archive.ids.length} RECORDS</span></footer>
    </div>
    <dialog class="reader" id="reader">
      <div class="reader-frame">
        <header><span id="readerKind">기록</span><div><button id="prevEntry" aria-label="이전 기록">${svg('arrowLeft')}</button><button id="nextEntry" aria-label="다음 기록">${svg('arrowRight')}</button><button data-close aria-label="닫기">${svg('close')}</button></div></header>
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
    this.els.monthMeta.textContent = `이 달의 기록 ${count}건`;
    this.els.calendar.setAttribute('aria-label', `${year}년 ${month + 1}월`);
    this.els.calendar.innerHTML = Array.from({length: 42}, (_, i) => {
      const date = new Date(gridStart); date.setDate(gridStart.getDate() + i);
      const id = dateToDiaryId(date), has = this.archive.idSet.has(id), outside = date.getMonth() !== month;
      const reference = referenceIds.has(id), today = new Date().toDateString() === date.toDateString();
      return `<div class="day ${outside ? 'outside' : ''} ${today ? 'today' : ''}" role="gridcell">${has
        ? `<button data-entry="${id}" class="has-entry ${reference ? 'has-reference' : ''}" aria-label="${escapeHtml(formatDate(date))} 기록 열기"><span>${String(date.getDate()).padStart(2,'0')}</span><i></i><small>${reference ? '참고 링크' : '기록'}</small></button>`
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
      this.els.readerKind.textContent = entry.reference ? '참고 링크가 있는 기록' : '기록';
      this.els.readerBody.innerHTML = `<article><header class="entry-heading"><p>RECORD / ${id}</p><h2>${date.getDate()}일의 기록</h2><time>${escapeHtml(formatDate(date))}</time>${entry.reference ? `<a class="reference-card" href="${escapeHtml(entry.reference.href)}" target="_blank" rel="noopener"><span>참고 링크</span><strong>${escapeHtml(entry.reference.label)}</strong>${svg('external')}</a>` : ''}</header><div class="entry-content">${rendered}</div></article>`;
      this.els.readerBody.scrollTop = 0;
    } catch { if (token === this.requestId) this.els.readerBody.innerHTML = `<div class="reader-error">기록을 불러오지 못했습니다.<small>daily/${escapeHtml(id)} 또는 daily/${escapeHtml(id)}.md 파일을 확인해주세요.</small></div>`; }
  }
  updateReaderNav() { const i = this.archive.ids.indexOf(this.store.state.activeId); this.els.prevEntry.disabled = i <= 0; this.els.nextEntry.disabled = i < 0 || i === this.archive.ids.length - 1; }
  openAdjacent(offset) { const id = this.store.adjacent(offset); if (id) this.openReader(id); }
  closeReader() { this.requestId++; this.els.reader.close(); document.body.classList.remove('dialog-open'); this.store.close(); }
}
