import type { DesignTemplate } from "../types/designTemplate";
import type { Keybinding } from "../core/keybindings";

export interface PluginCommandRequest { type: string; payload: unknown }
export type PluginCommandDispatcher = (command: PluginCommandRequest) => void;

export interface PluginCommandContribution {
  id: string;
  type: string;
  validate?: (payload: unknown) => boolean;
  /** Pure document reducer contract for commands outside the built-in command union. */
  apply: (document: DesignTemplate, payload: unknown) => DesignTemplate;
}

export interface PluginPanelContribution { id: string; label: string; slot?: string; view?: unknown }
export interface PluginInspectorSectionContribution { id: string; label: string; appliesTo?: readonly string[]; schema?: unknown; view?: unknown }
export interface PluginToolbarButtonContribution { id: string; label: string; group?: string; icon?: unknown; command: PluginCommandRequest; shortcutId?: string }
export interface PluginKeyboardShortcutContribution { id: string; binding: Keybinding; command: PluginCommandRequest }
export interface PluginExporterContribution { id: string; formats: readonly string[]; export: (document: unknown, options?: unknown) => Promise<unknown> }
export interface PluginAIProviderContribution { id: string; capabilities: readonly string[]; invoke: (request: unknown) => Promise<unknown> }

export interface EditorPlugin {
  id: string;
  version: string;
  commands?: readonly PluginCommandContribution[];
  panels?: readonly PluginPanelContribution[];
  inspectorSections?: readonly PluginInspectorSectionContribution[];
  toolbarButtons?: readonly PluginToolbarButtonContribution[];
  keyboardShortcuts?: readonly PluginKeyboardShortcutContribution[];
  exporters?: readonly PluginExporterContribution[];
  aiProviders?: readonly PluginAIProviderContribution[];
}

export type PluginContributionCategory = "commands" | "panels" | "inspectorSections" | "toolbarButtons" | "keyboardShortcuts" | "exporters" | "aiProviders";
