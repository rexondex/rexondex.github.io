export const parseDiaryId = (id) => {
  if (!/^\d{6}$/.test(String(id))) return null;
  const year = 2000 + Number(id.slice(0, 2));
  const month = Number(id.slice(2, 4)) - 1;
  const day = Number(id.slice(4, 6));
  const date = new Date(year, month, day);
  return date.getFullYear() === year && date.getMonth() === month && date.getDate() === day ? date : null;
};

export const dateToDiaryId = (date) => [
  String(date.getFullYear()).slice(-2),
  String(date.getMonth() + 1).padStart(2, '0'),
  String(date.getDate()).padStart(2, '0')
].join('');

export const formatDate = (date, weekday = true) => date.toLocaleDateString('ko-KR', {
  year: 'numeric', month: 'long', day: 'numeric', ...(weekday ? { weekday: 'long' } : {})
});

const normalizeLink = (value) => {
  const href = value.trim();
  if (/^(https?:\/\/|mailto:|\/|\.\/|\.\.\/|#)/i.test(href)) return href;
  if (/^(www\.|[a-z0-9.-]+\.[a-z]{2,})/i.test(href)) return `https://${href}`;
  return '';
};

export const parseDiaryMarkdown = (source) => {
  const markdown = source.replace(/^\uFEFF/, '');
  const lines = markdown.split(/\r?\n/);
  const first = (lines[0] || '').trim();
  const mdLink = first.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
  const bracketLink = first.match(/^\[([^\]]+)\]$/);
  if (!mdLink && !bracketLink) return { markdown, reference: null };
  const raw = (mdLink ? mdLink[2] : bracketLink[1]).trim();
  const href = normalizeLink(raw);
  if (!href) return { markdown, reference: null };
  let label = mdLink?.[1]?.trim() || raw;
  try { if (label === raw) label = new URL(href).hostname.replace(/^www\./, ''); } catch { /* local URL */ }
  return { markdown: lines.slice(1).join('\n'), reference: { href, label } };
};

export const createArchive = (rawIds) => {
  const ids = [...new Set(rawIds.filter((id) => parseDiaryId(id)))].sort();
  const idSet = new Set(ids);
  const dates = ids.map(parseDiaryId);
  return {
    ids, idSet, dates,
    latest: dates.at(-1) || new Date(),
    years: [...new Set(dates.map((date) => date.getFullYear()))].sort((a, b) => b - a),
    count(year, month = null) {
      return dates.filter((date) => date.getFullYear() === year && (month === null || date.getMonth() === month)).length;
    }
  };
};
