import { createArchive } from './domain/diary.js';
import { StaticDiaryRepository } from './infrastructure/static-diary-repository.js';
import { ArchiveStore } from './application/archive-store.js';
import { ThemeManager } from './presentation/theme-manager.js';
import { ArchiveApp } from './presentation/archive-app.js';

const records = window.ARCHIVE_DATABASE || {};
const archive = createArchive(Object.keys(records));
const repository = new StaticDiaryRepository(records);
const store = new ArchiveStore(archive);
const themes = new ThemeManager();

new ArchiveApp({ root: document.querySelector('#app'), archive, repository, store, themes }).mount();
