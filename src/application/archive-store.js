export class ArchiveStore extends EventTarget {
  constructor(archive) {
    super();
    this.archive = archive;
    this.state = {
      year: archive.latest.getFullYear(), month: archive.latest.getMonth(),
      activeId: null, referenceIds: new Set()
    };
  }
  emit() { this.dispatchEvent(new CustomEvent('change', { detail: this.state })); }
  view(year, month) { this.state.year = year; this.state.month = month; this.emit(); }
  moveMonth(offset) {
    const date = new Date(this.state.year, this.state.month + offset, 1);
    this.view(date.getFullYear(), date.getMonth());
  }
  open(id) {
    if (!this.archive.idSet.has(id)) return;
    const date = this.archive.dates[this.archive.ids.indexOf(id)];
    this.state.activeId = id; this.state.year = date.getFullYear(); this.state.month = date.getMonth(); this.emit();
  }
  close() { this.state.activeId = null; this.emit(); }
  setReferences(ids) { this.state.referenceIds = ids; this.emit(); }
  adjacent(offset) {
    const index = this.archive.ids.indexOf(this.state.activeId);
    return this.archive.ids[index + offset] || null;
  }
}
