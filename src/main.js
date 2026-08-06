import { createArchive } from './domain/diary.js';
import { HttpDiaryRepository } from './infrastructure/http-diary-repository.js';
import { ArchiveStore } from './application/archive-store.js';
import { ThemeManager } from './presentation/theme-manager.js';
import { ArchiveApp } from './presentation/archive-app.js';

const diaryFiles = window.DIARY_FILES || [];
const archive = createArchive(diaryFiles);
const repository = new HttpDiaryRepository('./database');
const store = new ArchiveStore(archive);
const themes = new ThemeManager();

new ArchiveApp({ root: document.querySelector('#app'), archive, repository, store, themes }).mount();
