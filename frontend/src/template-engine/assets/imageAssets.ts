import type { AssetResolver, RenderContext } from "../types";

const imageCache = new Map<string, Promise<HTMLImageElement>>();

export const defaultAssetResolver: AssetResolver = {
  resolve(assetRef: string, context: RenderContext): string {
    if (assetRef === "brand.logo") {
      const logoUrl = context.brand?.logoUrl;
      if (!logoUrl) {
        throw new Error("The template references brand.logo but no brand logo URL was provided.");
      }
      return logoUrl;
    }
    if (!assetRef.trim()) {
      throw new Error("An enabled visual component is missing its asset reference.");
    }
    return assetRef;
  },
};

export function loadImage(src: string): Promise<HTMLImageElement> {
  const cached = imageCache.get(src);
  if (cached) return cached;

  const pending = new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Could not load template image asset: ${src}`));
    image.src = src;
  });
  imageCache.set(src, pending);
  pending.catch(() => imageCache.delete(src));
  return pending;
}
