import { createContext, useContext } from 'react';
import type { Skin } from './types.ts';
import { tailwindSkin } from './tailwind.tsx';

const SkinContext = createContext<Skin>(tailwindSkin);

export const SkinProvider = SkinContext.Provider;
export const useSkin = (): Skin => useContext(SkinContext);
