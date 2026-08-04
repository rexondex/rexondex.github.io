import { createArchive } from './domain/diary.js';
import { HttpDiaryRepository } from './infrastructure/diary-repository.js';
import { ArchiveStore } from './application/archive-store.js';
import { ThemeManager } from './presentation/theme-manager.js';
import { ArchiveApp } from './presentation/archive-app.js';

const archive = createArchive(window.__DIARY_FILES__ || []);
const repository = new HttpDiaryRepository('./daily');
const store = new ArchiveStore(archive);
const themes = new ThemeManager();

new ArchiveApp({ root: document.querySelector('#app'), archive, repository, store, themes }).mount();
