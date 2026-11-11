(() => {
  'use strict';
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

  const parseDiaryHtml = (source) => {
    const page = new DOMParser().parseFromString(source, 'text/html');
    const content = page.querySelector('.post-content');
    if (!content) throw new Error('Diary HTML must contain .post-content');
    const references = [...page.querySelectorAll('.post-references a')].map((link) => {
      const href = link.getAttribute('href');
      let label = link.textContent.trim();
      if (label === href) {
        try {
          const url = new URL(href);
          const path = url.pathname.split('/').filter(Boolean).slice(0, 2).join('/');
          label = url.host.replace(/^www\./, '') + (path ? `/${path}` : '');
        } catch { /* Keep the original label. */ }
      }
      return { href, label };
    });
    return { html: content.innerHTML, references };
  };

  const createArchive = (rawIds) => {
    const files = new Map();
    for (const value of rawIds) {
      const file = String(value).trim();
      const match = file.match(/^(\d{6})\.html$/i);
      if (match && parseDiaryId(match[1])) files.set(match[1], file);
    }
    const ids = [...files.keys()].sort();
    const idSet = new Set(ids);
    const dates = ids.map(parseDiaryId);
    return {
      ids, idSet, dates, files,
      latest: dates.at(-1) || new Date(),
      years: [...new Set(dates.map((date) => date.getFullYear()))].sort((a, b) => b - a),
      count(year, month = null) {
        return dates.filter((date) => date.getFullYear() === year && (month === null || date.getMonth() === month)).length;
      }
    };
  };



  class HttpDiaryRepository {
    #cache = new Map();

    constructor(basePath = './database', files = new Map()) {
      this.basePath = basePath;
      this.files = files;
    }

    async get(id) {
      if (this.#cache.has(id)) return this.#cache.get(id);
      const response = await fetch(`${this.basePath}/${this.files.get(id) || `${id}.html`}`);
      if (!response.ok) throw new Error(`Diary ${id}: HTTP ${response.status}`);
      const entry = { id, ...parseDiaryHtml(await response.text()) };
      this.#cache.set(id, entry);
      return entry;
    }

    async findReferenceIds(ids) {
      const references = await Promise.all(ids.map(async (id) => {
        try { return (await this.get(id)).references.length ? id : null; }
        catch { return null; }
      }));
      return new Set(references.filter(Boolean));
    }
  }


  class ArchiveStore extends EventTarget {
    constructor(archive) {
      super();
      this.archive = archive;
      this.state = {
        year: archive.latest.getFullYear(), month: archive.latest.getMonth(),
        referenceIds: new Set()
      };
    }
    emit() { this.dispatchEvent(new CustomEvent('change', { detail: this.state })); }
    view(year, month) { this.state.year = year; this.state.month = month; this.emit(); }
    moveMonth(offset) {
      const date = new Date(this.state.year, this.state.month + offset, 1);
      this.view(date.getFullYear(), date.getMonth());
    }
    setReferences(ids) { this.state.referenceIds = ids; this.emit(); }
  }


  const THEMES = [
    { id: 'system', name: '기기 설정 따르기'},
    { id: 'light', name: '밝게' },
    { id: 'dark', name: '어둡게' }
  ];

  class ThemeManager {
    constructor(storage) {
      let saved;
      try {
        this.storage = storage === undefined ? window.localStorage : storage;
        saved = this.storage?.getItem('archive-theme');
      } catch {
        // Storage access can fail before getItem, or while reading it.
        this.storage = null;
      }
      this.systemPreference = window.matchMedia('(prefers-color-scheme: dark)');
      this.current = THEMES.some((theme) => theme.id === saved) ? saved : 'system';
      const updateSystemTheme = () => {
        if (this.current === 'system') this.apply('system');
      };
      if (this.systemPreference.addEventListener) this.systemPreference.addEventListener('change', updateSystemTheme);
      else this.systemPreference.addListener(updateSystemTheme);
      this.apply(this.current);
    }
    apply(id) {
      if (!THEMES.some((theme) => theme.id === id)) return;
      this.current = id;
      try { this.storage?.setItem('archive-theme', id); }
      catch { this.storage = null; } // Keep the selected theme for this page.
      const resolved = id === 'system' ? (this.systemPreference.matches ? 'dark' : 'light') : id;
      document.documentElement.dataset.theme = resolved;
      const colors = { light: '#f5f6f8', dark: '#0f1115' };
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', colors[resolved]);
    }
  }



  const paths = {
    feed: '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v13a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 18.5Z"/><path d="M8 8h8M8 12h8M8 16h5"/>',
    picture: '<rect x="3" y="3" width="8" height="8" rx="1"/><rect x="13" y="3" width="8" height="8" rx="1"/><rect x="3" y="13" width="8" height="8" rx="1"/><rect x="13" y="13" width="8" height="8" rx="1"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4.5 21a7.5 7.5 0 0 1 15 0"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1.03 1.56V21h-4v-.08A1.7 1.7 0 0 0 8.94 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.6 15 1.7 1.7 0 0 0 3.08 14H3v-4h.08A1.7 1.7 0 0 0 4.6 8.94a1.7 1.7 0 0 0-.34-1.88L4.2 7l2.83-2.83.06.06A1.7 1.7 0 0 0 9 4.6 1.7 1.7 0 0 0 10 3.08V3h4v.08A1.7 1.7 0 0 0 15.06 4.6a1.7 1.7 0 0 0 1.88-.34L17 4.2 19.83 7l-.06.06A1.7 1.7 0 0 0 19.4 9c.15.6.7 1 1.52 1H21v4h-.08A1.7 1.7 0 0 0 19.4 15Z"/>',
    left: '<path d="m15 18-6-6 6-6"/>', right: '<path d="m9 18 6-6-6-6"/>',
    external: '<path d="M14 5h5v5M19 5l-9 9"/><path d="M18 13v5a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>'
  };
  const svg = (name) => `<svg viewBox="0 0 24 24" aria-hidden="true">${paths[name]}</svg>`;
  const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const renderReferences = (references) => references.length ? `<div class="post-references" aria-label="참고 링크">${references.map((reference) => `<a class="post-reference" href="${escapeHtml(reference.href)}" target="_blank" rel="noopener"><span>${escapeHtml(reference.label)}</span>${svg('external')}</a>`).join('')}</div>` : '';
  const profileImage = '<img class="avatar" src="./rexondex.jpg" alt="rexondex 프로필 이미지">';
  const brandLogo = '<img class="brand-logo" src="./favicon.svg" alt="">';
  const socialLinks = (compact = false) => `<div class="social-links ${compact ? 'compact' : ''}">
  <a href="https://github.com/rexondex" target="_blank" rel="noopener"><span>GitHub<small>https://github.com/rexondex</small></span>${svg('external')}</a>
  <a href="https://rexondex.tistory.com" target="_blank" rel="noopener"><span>Tistory<small>https://rexondex.tistory.com</small></span>${svg('external')}</a>
  <a href="https://x.com/rexon_dex" target="_blank" rel="noopener"><span>X<small>https://x.com/rexon_dex</small></span>${svg('external')}</a>
  <a href="https://www.youtube.com/@rexon-dex" target="_blank" rel="noopener"><span>YouTube<small>https://www.youtube.com/@rexon-dex</small></span>${svg('external')}</a>
  <a href="https://bsky.app/profile/rexondex.bsky.social" target="_blank" rel="noopener"><span>BlueSky<small>https://bsky.app/profile/rexondex.bsky.social</small></span>${svg('external')}</a>
  <a href="https://www.reddit.com/user/rexondex" target="_blank" rel="noopener"><span>Reddit<small>https://www.reddit.com/user/rexondex</small></span>${svg('external')}</a>
</div>`;

  class ArchiveApp {
    constructor(deps) {
      Object.assign(this, deps);
      this.entryId = document.body.dataset.diaryId || '';
      this.activeView = document.body.dataset.initialView || 'feed';
      this.feedIds = this.entryId ? [this.entryId] : [...this.archive.ids].reverse();
      this.feedCursor = 0;
      this.allEntries = document.body.dataset.allEntries === 'true';
      this.pageSize = this.allEntries ? this.feedIds.length : 8;
      this.referencesLoaded = false;
      this.pictureSectors = (window.PICTURE_SECTORS || [])
        .filter((sector) => sector && /^[a-z0-9-]+$/i.test(String(sector.id)) && Array.isArray(sector.files))
        .map((sector) => ({
          id: String(sector.id),
          descriptions: sector.descriptions || {},
          files: [...new Set(sector.files.map(String).filter((file) => /^[^/\\]+\.(jpe?g|png|webp|gif|avif|heic)$/i.test(file)))].sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))
        }))
        .sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
      this.activePictureSector = document.body.dataset.pictureSector || this.pictureSectors[0]?.id || '';
    }

    mount() {
      this.entryNavigation = this.entryId ? this.root.querySelector('section > footer')?.innerHTML : '';
      // Reuse the SSG body before replacing the shell. Initial diary rendering
      // must not depend on fetching HTML that is already present in this page.
      const initialPosts = [];
      for (const post of this.root.querySelectorAll('section.feed-view > article.diary-post[id]')) {
        const id = this.feedIds[initialPosts.length];
        if (post.id !== `daily-${id}`) break;
        initialPosts.push(this.renderFeedEntry(id, parseDiaryHtml(post.outerHTML)));
      }
      this.root.innerHTML = this.shell();
      this.els = Object.fromEntries(['feedView', 'pictureView', 'pictureSectorNav', 'pictureCount', 'pictureGrid', 'pictureEmpty', 'pictureDialog', 'pictureDialogImage', 'pictureDialogSector', 'pictureDialogName', 'pictureDialogSize', 'pictureDialogOriginal', 'pictureDialogClose', 'feedList', 'feedMore', 'calendarView', 'profileView', 'settingsView', 'yearNav', 'monthNav', 'calendar', 'calendarTitle', 'monthMeta', 'mobileViewTitle'].map((id) => [id, document.getElementById(id)]));
      this.els.feedList.innerHTML = initialPosts.join('');
      this.feedCursor = initialPosts.length;
      this.els.feedMore.hidden = this.feedCursor >= this.feedIds.length;
      this.bind(); this.renderPictureSectors(); this.renderCalendar(); this.renderYears(); this.renderMonths();
      if (this.activeView === 'feed' && !initialPosts.length) this.renderNextFeedPage();
      this.showView(this.activeView);
      if (this.entryId) document.getElementById('feedTitle').textContent = `${formatDate(parseDiaryId(this.entryId), false)} 일기`;
      else if (this.allEntries) document.getElementById('feedTitle').textContent = '전체 일기';
    }

    navItems() {
      return [
        ['feed', '일기', 'feed'], ['picture', '사진', 'picture'], ['calendar', '달력', 'calendar'], ['profile', '프로필', 'user'], ['settings', '설정', 'settings']
      ].map(([view, label, icon]) => {
        const content = `${svg(icon)}<span>${label}</span>`;
        if (view === 'feed' || view === 'picture') return `<a href="${view === 'feed' ? './' : './pictures.html'}" data-view="${view}" aria-label="${label}">${content}</a>`;
        return `<button type="button" data-view="${view}" aria-label="${label}">${content}</button>`;
      }).join('');
    }

    shell() {
      return `
    <div class="social-shell">
      <header class="mobile-header"><a href="./">${brandLogo}<span>rexondex</span></a><span id="mobileViewTitle" aria-live="polite">일기</span></header>
      <aside class="side-nav"><a class="wordmark" href="./">${brandLogo}<span>rexondex</span><small>archive</small></a><nav aria-label="주요 메뉴">${this.navItems()}</nav><p>${this.archive.ids.length}개의 기록</p></aside>
      <main class="main-column">
        <section class="view feed-view" id="feedView" aria-labelledby="feedTitle"><header class="view-header"><h1 id="feedTitle">일기</h1></header><div id="feedList"></div><button class="feed-more" id="feedMore" type="button">이전 기록 더 보기</button><footer class="diary-post">${this.entryNavigation || '<a href="./archive.html">전체 일기 보기</a>'}</footer></section>
        <section class="view picture-view" id="pictureView" aria-labelledby="pictureTitle" hidden>
          <header class="view-header"><h1 id="pictureTitle">사진</h1></header>
          <div class="picture-toolbar"><nav class="picture-sector-nav" id="pictureSectorNav" aria-label="사진 섹터"></nav><span class="picture-count" id="pictureCount"></span></div>
          <div class="picture-grid" id="pictureGrid" aria-label="사진 목록"></div>
          <p class="picture-empty" id="pictureEmpty" hidden>이 섹터에는 등록된 사진이 없습니다.</p>
        </section>
        <section class="view calendar-view" id="calendarView" aria-labelledby="calendarPageTitle" hidden>
          <header class="view-header"><h1 id="calendarPageTitle">달력</h1></header>
          <div class="calendar-tools"><nav id="yearNav" class="year-nav" aria-label="연도 선택"></nav><div class="month-stepper"><button data-move="-1" aria-label="이전 달">${svg('left')}</button><button data-move="1" aria-label="다음 달">${svg('right')}</button></div></div>
          <div class="calendar-card"><header><h2 id="calendarTitle"></h2><span id="monthMeta"></span></header><nav class="month-nav" id="monthNav" aria-label="월 선택"></nav><div class="weekday-row" aria-hidden="true"><span>월</span><span>화</span><span>수</span><span>목</span><span>금</span><span>토</span><span>일</span></div><div class="calendar-grid" id="calendar" role="grid"></div></div>
        </section>
        <section class="view profile-view" id="profileView" aria-labelledby="profileTitle" hidden><header class="view-header"><h1>프로필</h1></header><div class="profile-card">${profileImage}<div><h2 id="profileTitle">rexondex</h2><p>rexondex</p></div></div><dl><div><dt>작성한 날</dt><dd>${this.archive.ids.length}</dd></div><div><dt>수록 연도</dt><dd>${this.archive.years.length}</dd></div><div><dt>최근 기록</dt><dd>${this.archive.ids.at(-1) || '—'}</dd></div></dl><h2 class="profile-section-title">링크</h2>${socialLinks()}</section>
        <section class="view settings-view" id="settingsView" aria-labelledby="settingsTitle" hidden><header class="view-header"><h1 id="settingsTitle">설정</h1></header><div class="setting-group"><h2>화면 모드</h2>${THEMES.map((theme) => `<button type="button" data-theme-id="${theme.id}"><span>${theme.name}${theme.description ? `<small>${theme.description}</small>` : ''}</span><b>✓</b></button>`).join('')}</div></section>
      </main>
      <aside class="right-panel"><div class="right-card"><div class="mini-profile">${profileImage}<div><strong>rexondex</strong><span>rexondex</span></div></div><dl><div><dt>기록</dt><dd>${this.archive.ids.length}</dd></div><div><dt>최근</dt><dd>${this.archive.ids.at(-1) || '—'}</dd></div></dl>${socialLinks(true)}</div></aside>
      <nav class="bottom-nav" aria-label="주요 메뉴">${this.navItems()}</nav>
    </div>
    <dialog class="picture-dialog" id="pictureDialog" aria-labelledby="pictureDialogSector">
      <div class="picture-dialog-panel">
        <header><div><strong id="pictureDialogSector"></strong><span id="pictureDialogName"></span></div><button type="button" id="pictureDialogClose" aria-label="사진 닫기">×</button></header>
        <div class="picture-dialog-stage"><img id="pictureDialogImage" alt=""></div>
        <footer><span id="pictureDialogSize"></span><a id="pictureDialogOriginal" href="#" target="_blank" rel="noopener">원본 열기</a></footer>
      </div>
    </dialog>`;
    }

    bind() {
      document.querySelectorAll('button[data-view]').forEach((button) => button.addEventListener('click', () => this.showView(button.dataset.view)));
      document.querySelectorAll('[data-move]').forEach((button) => button.addEventListener('click', () => this.store.moveMonth(Number(button.dataset.move))));
      document.querySelectorAll('[data-theme-id]').forEach((button) => button.addEventListener('click', () => { this.themes.apply(button.dataset.themeId); this.renderThemeState(); }));
      this.els.feedMore.addEventListener('click', () => this.renderNextFeedPage());
      this.els.pictureGrid.addEventListener('click', (event) => {
        const button = event.target.closest('[data-picture-index]');
        if (button && event.button === 0 && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey) {
          event.preventDefault();
          this.openPicture(Number(button.dataset.pictureIndex));
        }
      });
      this.els.pictureDialogClose.addEventListener('click', () => this.els.pictureDialog.close());
      this.els.pictureDialog.addEventListener('click', (event) => { if (event.target === this.els.pictureDialog) this.els.pictureDialog.close(); });
      this.els.pictureDialogImage.addEventListener('load', () => {
        const image = this.els.pictureDialogImage;
        const format = image.src.split('.').pop().split(/[?#]/)[0].toUpperCase();
        this.els.pictureDialogSize.textContent = `${image.naturalWidth} × ${image.naturalHeight} px · ${format}`;
      });
      this.els.pictureDialogImage.addEventListener('error', () => {
        const format = this.els.pictureDialogName.textContent.split('.').pop().toUpperCase();
        this.els.pictureDialogSize.textContent = `미리보기를 지원하지 않을 수 있습니다 · ${format}`;
      });
      this.store.addEventListener('change', () => { this.renderYears(); this.renderMonths(); this.renderCalendar(); });
      this.renderNavState(); this.renderThemeState();
    }

    showView(view) {
      this.activeView = view;
      ['feed', 'picture', 'calendar', 'profile', 'settings'].forEach((name) => { document.getElementById(`${name}View`).hidden = name !== view; });
      this.els.mobileViewTitle.textContent = { feed: '일기', picture: '사진', calendar: '달력', profile: '프로필', settings: '설정' }[view];
      if (view === 'calendar') this.loadReferences();
      this.renderNavState(); window.scrollTo({ top: 0, behavior: 'smooth' });
    }
    renderNavState() { document.querySelectorAll('[data-view]').forEach((button) => { const active = button.dataset.view === this.activeView; button.classList.toggle('active', active); if (active) button.setAttribute('aria-current', 'page'); else button.removeAttribute('aria-current'); }); }
    renderThemeState() { document.querySelectorAll('[data-theme-id]').forEach((button) => button.classList.toggle('active', button.dataset.themeId === this.themes.current)); }

    picturePath(sector, file) { return `./media/${encodeURIComponent(sector)}/${encodeURIComponent(file)}`; }
    renderPictureSectors() {
      this.els.pictureSectorNav.innerHTML = this.pictureSectors.map((sector, index) => `<a href="${index === 0 ? './pictures.html' : `./pictures/${encodeURIComponent(sector.id)}.html`}" class="${sector.id === this.activePictureSector ? 'active' : ''}" ${sector.id === this.activePictureSector ? 'aria-current="page"' : ''}>${escapeHtml(sector.id)}<small>${sector.files.length}</small></a>`).join('');
      this.renderPictures();
    }
    renderPictures() {
      const sector = this.pictureSectors.find((item) => item.id === this.activePictureSector);
      if (!sector) {
        this.els.pictureCount.textContent = '0장';
        this.els.pictureGrid.innerHTML = '';
        this.els.pictureEmpty.hidden = false;
        return;
      }
      this.els.pictureCount.textContent = `${sector.files.length}장`;
      this.els.pictureEmpty.hidden = sector.files.length > 0;
      this.els.pictureGrid.innerHTML = sector.files.map((file, index) => `<a href="${escapeHtml(this.picturePath(sector.id, file))}" class="picture-tile" data-picture-index="${index}" aria-label="${escapeHtml(sector.descriptions[file] || `${sector.id}/${file} 사진 크게 보기`)}"><img src="${escapeHtml(this.picturePath(sector.id, file))}" alt="${escapeHtml(sector.descriptions[file] || '')}" loading="lazy" decoding="async"></a>`).join('');
      this.els.pictureGrid.querySelectorAll('img').forEach((image) => image.addEventListener('error', () => {
        const fallback = document.createElement('span');
        fallback.className = 'picture-tile-fallback';
        fallback.textContent = '미리보기 없음';
        image.replaceWith(fallback);
      }, { once: true }));
    }
    openPicture(index) {
      const sector = this.pictureSectors.find((item) => item.id === this.activePictureSector);
      const file = sector?.files[index];
      if (!sector || !file) return;
      const source = this.picturePath(sector.id, file);
      const image = this.els.pictureDialogImage;
      this.els.pictureDialogSector.textContent = sector.id;
      this.els.pictureDialogName.textContent = file;
      this.els.pictureDialogSize.textContent = '이미지 정보를 불러오는 중';
      this.els.pictureDialogOriginal.href = source;
      image.alt = sector.descriptions[file] || '';
      image.src = source;
      if (!this.els.pictureDialog.open) this.els.pictureDialog.showModal();
    }

    renderFeedEntry(id, entry) {
      const date = parseDiaryId(id);
      return `<article class="diary-post" id="daily-${id}" aria-label="${escapeHtml(formatDate(date))} 일기"><header><img class="post-avatar" src="./rexondex.jpg" alt="" width="44" height="44"><div><strong>rexondex</strong><time datetime="20${id.slice(0, 2)}-${id.slice(2, 4)}-${id.slice(4, 6)}">${escapeHtml(formatDate(date))}</time></div></header>${renderReferences(entry.references)}<div class="post-content">${entry.html}</div><footer><a class="post-permalink" href="./database/${this.archive.files.get(id)}" aria-label="${id} 일기 링크">${id} · 링크</a></footer></article>`;
    }

    renderNextFeedPage() {
      if (this.feedLoadPromise) return this.feedLoadPromise;
      if (this.feedCursor >= this.feedIds.length) { this.els.feedMore.hidden = true; return; }
      const ids = this.feedIds.slice(this.feedCursor, this.feedCursor + this.pageSize);
      this.els.feedMore.disabled = true;
      this.els.feedMore.textContent = '기록을 불러오는 중...';
      this.els.feedList.setAttribute('aria-busy', 'true');
      this.feedLoadPromise = (async () => {
        try {
          const posts = await Promise.all(ids.map(async (id) => this.renderFeedEntry(id, await this.repository.get(id))));
          this.els.feedList.insertAdjacentHTML('beforeend', posts.join(''));
          this.feedCursor += ids.length;
          this.els.feedMore.textContent = '이전 기록 더 보기';
        } catch (error) {
          // Keep the existing posts and cursor so the same batch can be retried.
          this.els.feedMore.textContent = '일기를 불러오지 못했습니다. 다시 시도';
          console.warn('Could not load diary entries:', error);
        } finally {
          this.feedLoadPromise = null;
          this.els.feedList.removeAttribute('aria-busy');
          this.els.feedMore.disabled = false;
          this.els.feedMore.hidden = this.feedCursor >= this.feedIds.length;
        }
      })();
      return this.feedLoadPromise;
    }

    async loadReferences() {
      if (this.referencesLoaded) return;
      this.referencesLoaded = true;
      this.store.setReferences(await this.repository.findReferenceIds(this.archive.ids));
    }

    renderYears() { this.els.yearNav.innerHTML = this.archive.years.map((year) => `<button class="${year === this.store.state.year ? 'active' : ''}" data-year="${year}">${year}<small>${this.archive.count(year)}</small></button>`).join(''); this.els.yearNav.querySelectorAll('button').forEach((button) => button.addEventListener('click', () => this.store.view(Number(button.dataset.year), this.store.state.month))); }
    renderMonths() { this.els.monthNav.innerHTML = Array.from({ length: 12 }, (_, month) => `<button class="${month === this.store.state.month ? 'active' : ''}" data-month="${month}">${month + 1}월</button>`).join(''); this.els.monthNav.querySelectorAll('button').forEach((button) => button.addEventListener('click', () => this.store.view(this.store.state.year, Number(button.dataset.month)))); }
    renderCalendar() {
      const { year, month, referenceIds } = this.store.state, first = new Date(year, month, 1), start = new Date(year, month, 1 - ((first.getDay() + 6) % 7));
      this.els.calendarTitle.textContent = `${year}년 ${month + 1}월`; this.els.monthMeta.textContent = `${this.archive.count(year, month)}개의 기록`;
      this.els.calendar.innerHTML = Array.from({ length: 42 }, (_, index) => { const date = new Date(start); date.setDate(start.getDate() + index); const id = dateToDiaryId(date), has = this.archive.idSet.has(id); return `<div class="day ${date.getMonth() !== month ? 'outside' : ''}">${has ? `<a href="./database/${this.archive.files.get(id)}" data-entry="${id}" class="has-entry ${referenceIds.has(id) ? 'has-reference' : ''}" aria-label="${escapeHtml(formatDate(date))} 기록으로 이동"><span>${date.getDate()}</span></a>` : `<span>${date.getDate()}</span>`}</div>`; }).join('');
    }
  }



  const diaryFiles = window.DIARY_FILES || [];
  const archive = createArchive(diaryFiles);
  const repository = new HttpDiaryRepository('./database', archive.files);
  const store = new ArchiveStore(archive);
  const themes = new ThemeManager();

  new ArchiveApp({ root: document.querySelector('#app'), archive, repository, store, themes }).mount();

})();
