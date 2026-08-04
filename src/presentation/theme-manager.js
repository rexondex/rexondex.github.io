export const THEMES = [
  { id: 'paper', name: 'Paper', description: '따뜻한 종이' },
  { id: 'midnight', name: 'Midnight', description: '깊은 밤' },
  { id: 'terminal', name: 'Terminal', description: '디지털 기록실' }
];

export class ThemeManager extends EventTarget {
  constructor(storage = localStorage) {
    super(); this.storage = storage;
    this.current = THEMES.some((theme) => theme.id === document.documentElement.dataset.theme)
      ? document.documentElement.dataset.theme : 'paper';
    this.apply(this.current);
  }
  apply(id) {
    if (!THEMES.some((theme) => theme.id === id)) return;
    this.current = id; document.documentElement.dataset.theme = id;
    this.storage.setItem('archive-theme', id);
    const colors = { paper: '#f0eee8', midnight: '#111317', terminal: '#07120d' };
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', colors[id]);
    this.dispatchEvent(new CustomEvent('change', { detail: id }));
  }
}
