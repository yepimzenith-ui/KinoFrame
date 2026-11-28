import { FONT_OPTIONS } from '../data/presets';
import { FontFamilyId } from '../types/editor';

export interface FontOptionEntry {
  id: FontFamilyId;
  label: string;
  cssFamily: string;
  isCustom?: boolean;
}

const customFontRegistry: FontOptionEntry[] = [];
const listeners = new Set<() => void>();

function notifyFontListeners() {
  listeners.forEach((fn) => fn());
}

export function subscribeCustomFonts(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getCustomFontOptions(): FontOptionEntry[] {
  return [...customFontRegistry];
}

export function getAllFontOptions(): FontOptionEntry[] {
  return [...FONT_OPTIONS, ...customFontRegistry];
}

export function resolveFontCssFamily(family: FontFamilyId): string {
  const builtIn = FONT_OPTIONS.find((f) => f.id === family);
  if (builtIn) return builtIn.cssFamily;
  const custom = customFontRegistry.find((f) => f.id === family);
  if (custom) return custom.cssFamily;
  if (typeof family === 'string' && family.startsWith('custom-')) {
    return '"Plus Jakarta Sans", sans-serif';
  }
  return '"Plus Jakarta Sans", sans-serif';
}

export async function importCustomFontFile(file: File): Promise<FontOptionEntry> {
  const rawName = file.name.replace(/\.(ttf|otf|woff2?|eot)$/i, '').trim() || 'Custom Font';
  const cleanLabel = rawName.replace(/[_-]+/g, ' ').slice(0, 28);
  const safeFamily = `KinoCustom_${Date.now()}_${rawName.replace(/[^a-zA-Z0-9]/g, '').slice(0, 16) || 'Font'}`;
  const buffer = await file.arrayBuffer();

  const fontFace = new FontFace(safeFamily, buffer);
  const loadedFace = await fontFace.load();
  document.fonts.add(loadedFace);
  await document.fonts.ready;

  const entry: FontOptionEntry = {
    id: `custom-${safeFamily}`,
    label: cleanLabel,
    cssFamily: `"${safeFamily}", "Plus Jakarta Sans", sans-serif`,
    isCustom: true,
  };
  customFontRegistry.push(entry);
  notifyFontListeners();
  return entry;
}
