export interface BrandKit {
  id: string;
  name: string;
  logo?: string;
  fonts?: Record<string, string>;
  colors?: Record<string, string>;
  watermark?: string;
  website?: string;
  phone?: string;
  instagramHandle?: string;
  metadata?: Record<string, unknown>;
  spacing?: Record<string, number>;
  radius?: Record<string, number>;
  shadows?: Record<string, string>;
  borderWidths?: Record<string, number>;
  opacity?: Record<string, number>;
  typographyScale?: Record<string, number>;
  grid?: Record<string, number>;
  iconSizes?: Record<string, number>;
  buttonStyles?: Record<string, Record<string, string | number>>;
  animationPresets?: Record<string, Record<string, string | number>>;
}

export interface BrandResolutionResult<T> {
  value: T;
  unresolvedTokens: string[];
}

export interface BrandRenderTokens {
  logo?: string;
  logoUrl?: string;
  watermark?: string;
  website?: string;
  phone?: string;
  instagramHandle?: string;
  [key: string]: string | undefined;
}
