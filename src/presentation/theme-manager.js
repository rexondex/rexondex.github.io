export const THEMES = [
  { id: 'light', name: 'Light', description: '밝은 화면' },
  { id: 'dark', name: 'Dark', description: '어두운 화면' },
  { id: 'contrast', name: 'High contrast', description: '고대비 화면' }
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
    const colors = { light: '#f6f7f9', dark: '#111318', contrast: '#000000' };
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', colors[id]);
    this.dispatchEvent(new CustomEvent('change', { detail: id }));
  }
}
