import { PREMIUM_TEMPLATES } from "./premiumTemplates";
import { fromLegacyTemplateConfig } from "./legacyTemplateAdapter";
import { parseDesignTemplate } from "./validateDesignTemplate";
import type { DesignTemplate } from "../types/designTemplate";
import type { TemplateConfig } from "../types";

export class TemplateRegistry {
  private readonly templates = new Map<string, DesignTemplate>();

  register(template: DesignTemplate): DesignTemplate {
    const parsed = parseDesignTemplate(template);
    if (this.templates.has(parsed.id)) {
      throw new Error(`Template "${parsed.id}" is already registered.`);
    }
    this.templates.set(parsed.id, parsed);
    return parsed;
  }

  registerLegacy(config: TemplateConfig): DesignTemplate {
    return this.register(fromLegacyTemplateConfig(config));
  }

  get(id: string): DesignTemplate {
    const template = this.templates.get(id);
    if (!template) throw new Error(`Unknown design template "${id}".`);
    return template;
  }

  list(filters: { category?: string; query?: string } = {}): DesignTemplate[] {
    const category = filters.category?.toLocaleLowerCase();
    const query = filters.query?.trim().toLocaleLowerCase();
    return [...this.templates.values()].filter((template) => {
      if (category && template.category.toLocaleLowerCase() !== category) return false;
      if (!query) return true;
      return [
        template.name,
        template.category,
        template.description,
        ...template.tags,
      ].some((value) => value.toLocaleLowerCase().includes(query));
    });
  }

  getCategories(): string[] {
    return [...new Set([...this.templates.values()].map(({ category }) => category))].sort();
  }
}

export function registerTemplates(
  configs: readonly TemplateConfig[],
  registry = new TemplateRegistry(),
): TemplateRegistry {
  configs.forEach((config) => registry.registerLegacy(config));
  return registry;
}

export const TEMPLATE_REGISTRY = registerTemplates(PREMIUM_TEMPLATES);
