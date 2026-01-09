import { useUIStore } from '@/stores/useUIStore';
import type { MonoFontOption, UiFontOption } from '@/lib/fontOptions';

interface FontPreferences {
    uiFont: UiFontOption;
    monoFont: MonoFontOption;
}

export const useFontPreferences = (): FontPreferences => {
    const uiFont = useUIStore(state => state.uiFont);
    const monoFont = useUIStore(state => state.monoFont);
    return { uiFont, monoFont };
};
