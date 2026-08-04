export const THEMES = [
  { id: 'light', name: '밝게', description: '흰색 배경' },
  { id: 'dark', name: '어둡게', description: '검은색 배경' }
];

export class ThemeManager extends EventTarget {
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
