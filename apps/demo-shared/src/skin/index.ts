import type { Skin } from './types.ts';
import { plainSkin } from './plain.tsx';
import { tailwindSkin } from './tailwind.tsx';

export * from './types.ts';
export { SkinProvider, useSkin } from './context.tsx';
export { tailwindSkin, plainSkin };

/** Skins in display order. Add a skin here and it appears in the settings panel. */
export const skins: readonly Skin[] = [tailwindSkin, plainSkin];
export const skinIds: readonly string[] = skins.map((s) => s.id);
