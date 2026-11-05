import type { TemplateCatalogEntry } from "./professionalCatalog";
export type TemplateSort = "relevance" | "most-used" | "newest" | "trending" | "name";
export interface TemplateSearchOptions { query?: string; categories?: readonly string[]; tags?: readonly string[]; favorites?: ReadonlySet<string>; favoriteOnly?: boolean; pinned?: ReadonlySet<string>; recent?: readonly string[]; sort?: TemplateSort; offset?: number; limit?: number }
const score = (entry: TemplateCatalogEntry, query: string) => {
  if (!query) return 0;
  if (entry.name.toLocaleLowerCase().startsWith(query)) return 100;
  if (entry.name.toLocaleLowerCase().includes(query)) return 60;
  if (entry.category.toLocaleLowerCase().includes(query)) return 40;
  return entry.tags.some((tag) => tag.toLocaleLowerCase().includes(query)) ? 20 : 0;
}
export function searchTemplates(entries: readonly TemplateCatalogEntry[], options: TemplateSearchOptions = {}): TemplateCatalogEntry[] {
  const query = options.query?.trim().toLocaleLowerCase() || "", categories = new Set(options.categories || []), tags = new Set((options.tags || []).map((tag) => tag.toLocaleLowerCase()));
  const recent = new Map((options.recent || []).map((id, index) => [id, index]));
  const filtered = entries.filter((entry) => (!query || score(entry, query) > 0)
    && (!categories.size || categories.has(entry.category))
    && (!tags.size || entry.tags.some((tag) => tags.has(tag.toLocaleLowerCase())))
    && (!options.favoriteOnly || options.favorites?.has(entry.id)));
  if (options.sort === "most-used") filtered.sort((a, b) => b.usageCount - a.usageCount);
  else if (options.sort === "newest") filtered.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  else if (options.sort === "trending") filtered.sort((a, b) => (recent.get(a.id) ?? Infinity) - (recent.get(b.id) ?? Infinity) || b.usageCount - a.usageCount);
  else if (options.sort === "name") filtered.sort((a, b) => a.name.localeCompare(b.name));
  else filtered.sort((a, b) => Number(options.pinned?.has(b.id) || false) - Number(options.pinned?.has(a.id) || false) || score(b, query) - score(a, query));
  const offset = Math.max(0, options.offset || 0);
  return filtered.slice(offset, options.limit === undefined ? undefined : offset + Math.max(0, options.limit));
}

export interface TemplateLibraryState { favorites: string[]; recent: string[]; pinned: string[]; duplicates: TemplateCatalogEntry[] }
export interface KeyValueStorage { getItem(key: string): string | null; setItem(key: string, value: string): void }
let duplicateSequence = 0;
export class TemplateLibrary {
  private state: TemplateLibraryState = { favorites: [], recent: [], pinned: [], duplicates: [] };
  constructor(private readonly storage?: KeyValueStorage, private readonly key = "interior-social-template-library") {
    try { const value = storage?.getItem(key); if (value) this.state = { ...this.state, ...JSON.parse(value) }; } catch { /* keep an empty library if storage is unavailable */ }
  }
  snapshot(): TemplateLibraryState { return { ...this.state, favorites: [...this.state.favorites], recent: [...this.state.recent], pinned: [...this.state.pinned], duplicates: [...this.state.duplicates] }; }
  private save() { try { this.storage?.setItem(this.key, JSON.stringify(this.state)); } catch { /* storage quota/private-mode failure is non-fatal */ } }
  favorite(id: string, active = true) { this.state.favorites = active ? [...new Set([...this.state.favorites, id])] : this.state.favorites.filter((value) => value !== id); this.save(); }
  pin(id: string, active = true) { this.state.pinned = active ? [...new Set([...this.state.pinned, id])] : this.state.pinned.filter((value) => value !== id); this.save(); }
  use(id: string) { this.state.recent = [id, ...this.state.recent.filter((value) => value !== id)].slice(0, 100); this.save(); }
  duplicate(entry: TemplateCatalogEntry): TemplateCatalogEntry { const copy = JSON.parse(JSON.stringify(entry)) as TemplateCatalogEntry; copy.id = `${entry.id}-copy-${Date.now().toString(36)}-${(++duplicateSequence).toString(36)}`; copy.name = `${entry.name} Copy`; this.state.duplicates.push(copy); this.save(); return copy; }
}

export function getVirtualWindow<T>(items: readonly T[], scrollTop: number, viewportHeight: number, itemHeight: number, overscan = 3) {
  const size = Math.max(1, itemHeight), start = Math.max(0, Math.floor(scrollTop / size) - overscan), end = Math.min(items.length, Math.ceil((scrollTop + viewportHeight) / size) + overscan);
  return { start, end, totalSize: items.length * size, items: items.slice(start, end) };
}
