import type { EditorPlugin, PluginContributionCategory } from "./types";

const CATEGORIES: readonly PluginContributionCategory[] = ["commands", "panels", "inspectorSections", "toolbarButtons", "keyboardShortcuts", "exporters", "aiProviders"];

export class PluginRegistry {
  private readonly plugins = new Map<string, EditorPlugin>();

  register(plugin: EditorPlugin): () => void {
    if (!plugin.id.trim()) throw new Error("Plugin id is required.");
    if (this.plugins.has(plugin.id)) throw new Error(`Plugin "${plugin.id}" is already registered.`);
    for (const category of CATEGORIES) {
      const ids = new Set<string>();
      for (const item of plugin[category] || []) {
        if (ids.has(item.id)) throw new Error(`Plugin "${plugin.id}" has duplicate ${category} id "${item.id}".`);
        ids.add(item.id);
      }
    }
    this.plugins.set(plugin.id, plugin);
    return () => { if (this.plugins.get(plugin.id) === plugin) this.plugins.delete(plugin.id); };
  }

  getPlugin(id: string): EditorPlugin | undefined { return this.plugins.get(id); }
  listPlugins(): readonly EditorPlugin[] { return [...this.plugins.values()]; }

  contributions<K extends PluginContributionCategory>(category: K): NonNullable<EditorPlugin[K]>[number][] {
    return [...this.plugins.values()].flatMap((plugin) => [...(plugin[category] || [])]) as NonNullable<EditorPlugin[K]>[number][];
  }
}

export const defaultPluginRegistry = new PluginRegistry();
