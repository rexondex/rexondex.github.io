import { parseDiaryMarkdown } from '../domain/diary.js';

export class HttpDiaryRepository {
  #cache = new Map();
  constructor(basePath = './daily') { this.basePath = basePath; }

  async get(id) {
    if (this.#cache.has(id)) return this.#cache.get(id);
    const candidates = [`${this.basePath}/${id}`, `${this.basePath}/${id}.md`];
    let response = null;

    for (const path of candidates) {
      const candidate = await fetch(path);
      if (candidate.ok) {
        response = candidate;
        break;
      }
      if (candidate.status !== 404) throw new Error(`Diary ${id}: HTTP ${candidate.status}`);
    }

    if (!response) throw new Error(`Diary ${id}: file not found`);
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
