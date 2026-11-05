import { PluginRegistry } from "./PluginRegistry";
import type { EditorPlugin } from "./types";

describe("PluginRegistry", () => {
  it("registers plugin contributions across extension points and unregisters", () => {
    const registry = new PluginRegistry();
    const plugin: EditorPlugin = {
      id: "example", version: "1.0.0",
      commands: [{ id: "rename", type: "RenameNode", apply: (document) => document }],
      panels: [{ id: "assets", label: "Assets" }],
      inspectorSections: [{ id: "brand", label: "Brand" }],
      toolbarButtons: [{ id: "action", label: "Action", command: { type: "Run", payload: null } }],
      keyboardShortcuts: [{ id: "shortcut", binding: { action: "plugin:run", key: "k", primary: true }, command: { type: "Run", payload: null } }],
      exporters: [{ id: "format", formats: ["custom"], export: async () => null }],
      aiProviders: [{ id: "provider", capabilities: ["layout"], invoke: async () => null }],
    };
    const unregister = registry.register(plugin);
    expect(registry.getPlugin("example")).toBe(plugin);
    expect(registry.contributions("commands")).toHaveLength(1);
    expect(registry.contributions("panels")).toHaveLength(1);
    expect(registry.contributions("inspectorSections")).toHaveLength(1);
    expect(registry.contributions("toolbarButtons")).toHaveLength(1);
    expect(registry.contributions("keyboardShortcuts")).toHaveLength(1);
    expect(registry.contributions("exporters")).toHaveLength(1);
    expect(registry.contributions("aiProviders")).toHaveLength(1);
    unregister();
    expect(registry.listPlugins()).toHaveLength(0);
  });

  it("rejects duplicate plugin and contribution identifiers", () => {
    const registry = new PluginRegistry();
    const plugin: EditorPlugin = { id: "duplicate", version: "1", panels: [{ id: "same", label: "One" }, { id: "same", label: "Two" }] };
    expect(() => registry.register(plugin)).toThrow(/duplicate panels id/);
    registry.register({ id: "duplicate", version: "1" });
    expect(() => registry.register({ id: "duplicate", version: "2" })).toThrow(/already registered/);
  });
});
