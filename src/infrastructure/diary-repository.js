import { parseDiaryMarkdown } from '../domain/diary.js';

export class HttpDiaryRepository {
  #cache = new Map();
  constructor(basePath = './daily') { this.basePath = basePath; }

  async get(id) {
    if (this.#cache.has(id)) return this.#cache.get(id);
    const response = await fetch(`${this.basePath}/${id}.md`);
    if (!response.ok) throw new Error(`Diary ${id}: HTTP ${response.status}`);
    const entry = { id, ...parseDiaryMarkdown(await response.text()) };
    this.#cache.set(id, entry);
    return entry;
  }

  async findReferenceIds(ids) {
    const results = await Promise.all(ids.map(async (id) => {
      try { return (await this.get(id)).reference ? id : null; } catch { return null; }
    }));
    return new Set(results.filter(Boolean));
  }
}
