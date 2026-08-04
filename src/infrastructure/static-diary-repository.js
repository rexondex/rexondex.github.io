import { parseDiaryMarkdown } from '../domain/diary.js';

export class StaticDiaryRepository {
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
