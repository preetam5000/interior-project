import type { BrandKit, BrandRenderTokens, BrandResolutionResult } from "./types";

function lookupToken(token: string, brand: BrandKit): string | undefined {
  const normalized = token.replace(/^\$\{?/, "").replace(/\}?$/, "").replace(/^brand\./, "");
  const [group, key, ...rest] = normalized.split(".");
  if (!rest.length && group === "colors") return brand.colors?.[key];
  if (!rest.length && group === "fonts") return brand.fonts?.[key];
  if (group === "colors" && !key) return undefined;
  if (group === "colors" && !rest.length) return brand.colors?.[group] || brand.colors?.[key];
  if (group === "fonts" && !rest.length) return brand.fonts?.[group] || brand.fonts?.[key];
  if (normalized.startsWith("colors.")) return brand.colors?.[normalized.slice(7)];
  if (normalized.startsWith("fonts.")) return brand.fonts?.[normalized.slice(6)];
  if (normalized.startsWith("font.")) return brand.fonts?.[normalized.slice(5)];
  if (normalized === "logo") return brand.logo;
  if (normalized === "watermark") return brand.watermark;
  if (normalized === "website") return brand.website;
  if (normalized === "phone") return brand.phone;
  if (normalized === "instagramHandle" || normalized === "instagram") return brand.instagramHandle;
  const tokenGroups: Record<string, Record<string, string | number> | undefined> = {
    spacing: brand.spacing, radius: brand.radius, shadows: brand.shadows, borderWidths: brand.borderWidths,
    opacity: brand.opacity, typographyScale: brand.typographyScale, grid: brand.grid, iconSizes: brand.iconSizes,
  };
  if (rest.length === 0 && tokenGroups[group]?.[key] !== undefined) return String(tokenGroups[group]![key]);
  if (group === "buttonStyles" && key && rest.length) {
    const value = brand.buttonStyles?.[key]?.[rest.join(".")];
    if (value !== undefined) return String(value);
  }
  if (group === "animationPresets" && key && rest.length) {
    const value = brand.animationPresets?.[key]?.[rest.join(".")];
    if (value !== undefined) return String(value);
  }
  return brand.colors?.[normalized] || brand.fonts?.[normalized];
}

export function resolveBrandToken(token: string, brand: BrandKit): string | undefined {
  if (!token.startsWith("$") && !token.startsWith("${")) return undefined;
  return lookupToken(token, brand);
}

function resolveValue<T>(input: T, brand: BrandKit, unresolved: Set<string>): T {
  if (typeof input === "string") {
    const resolved = resolveBrandToken(input, brand);
    if (resolved !== undefined) return resolved as T;
    if (input.startsWith("$") || input.startsWith("${")) unresolved.add(input);
    return input;
  }
  if (Array.isArray(input)) return input.map((item) => resolveValue(item, brand, unresolved)) as T;
  if (!input || typeof input !== "object") return input;
  return Object.fromEntries(Object.entries(input as Record<string, unknown>).map(([key, value]) => [key, resolveValue(value, brand, unresolved)])) as T;
}

export class BrandEngine {
  resolve<T>(document: T, brand: BrandKit): BrandResolutionResult<T> {
    const unresolved = new Set<string>();
    const value = resolveValue(document, brand, unresolved);
    return { value, unresolvedTokens: [...unresolved] };
  }

  resolveTokens<T>(document: T, brand: BrandKit): T {
    return this.resolve(document, brand).value;
  }

  renderTokens(brand: BrandKit): BrandRenderTokens {
    return {
      ...brand.colors,
      ...Object.fromEntries(Object.entries(brand.colors || {}).map(([key, value]) => [`colors.${key}`, value])),
      ...Object.fromEntries(Object.entries(brand.fonts || {}).map(([key, value]) => [`fonts.${key}`, value])),
      ...Object.fromEntries(Object.entries(brand.fonts || {}).map(([key, value]) => [`font.${key}`, value])),
      ...Object.fromEntries(Object.entries(brand.spacing || {}).map(([key, value]) => [`spacing.${key}`, String(value)])),
      ...Object.fromEntries(Object.entries(brand.radius || {}).map(([key, value]) => [`radius.${key}`, String(value)])),
      ...Object.fromEntries(Object.entries(brand.shadows || {}).map(([key, value]) => [`shadows.${key}`, value])),
      ...Object.fromEntries(Object.entries(brand.opacity || {}).map(([key, value]) => [`opacity.${key}`, String(value)])),
      ...Object.fromEntries(Object.entries(brand.typographyScale || {}).map(([key, value]) => [`typographyScale.${key}`, String(value)])),
      ...Object.fromEntries(Object.entries(brand.borderWidths || {}).map(([key, value]) => [`borderWidths.${key}`, String(value)])),
      ...Object.fromEntries(Object.entries(brand.grid || {}).map(([key, value]) => [`grid.${key}`, String(value)])),
      ...Object.fromEntries(Object.entries(brand.iconSizes || {}).map(([key, value]) => [`iconSizes.${key}`, String(value)])),
      ...(brand.logo ? { logo: brand.logo, logoUrl: brand.logo } : {}),
      ...(brand.watermark ? { watermark: brand.watermark } : {}),
      ...(brand.website ? { website: brand.website } : {}),
      ...(brand.phone ? { phone: brand.phone } : {}),
      ...(brand.instagramHandle ? { instagramHandle: brand.instagramHandle, instagram: brand.instagramHandle } : {}),
    };
  }
}

export const defaultBrandEngine = new BrandEngine();
