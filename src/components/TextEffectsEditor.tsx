import React, { useEffect, useRef, useState } from 'react';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Copy,
  Layers,
  RotateCcw,
  Sparkles,
  Type,
  Upload,
} from 'lucide-react';
import {
  DEFAULT_TEXT_3D,
  OVERLAY_BLEND_MODES,
  TEXT_3D_STYLE_OPTIONS,
  TEXT_STYLE_TEMPLATES,
  normalizeTextEffects,
} from '../data/presets';
import {
  FontFamilyId,
  OverlayBlendMode,
  OverlayLayerOrder,
  Text3DSettings,
  TextAlignMode,
  TextCharAnimationType,
  TextCharStyle,
  TextStyleTemplateId,
} from '../types/editor';
import {
  FontOptionEntry,
  getAllFontOptions,
  importCustomFontFile,
  subscribeCustomFonts,
} from '../utils/customFonts';
import { clamp } from '../utils/timecode';

export interface UnifiedTextPatch {
  text?: string;
  fontSize?: number;
  fontFamily?: FontFamilyId;
  letterSpacing?: number;
  color?: string;
  backdrop?: boolean;
  styleTemplate?: TextStyleTemplateId;
  text3d?: Text3DSettings;
  layerOrder?: OverlayLayerOrder;
  blendMode?: OverlayBlendMode;
  x?: number;
  y?: number;
  scale?: number;
  rotation?: number;
  tiltX?: number;
  tiltY?: number;
  opacity?: number;
}

interface TextEffectsEditorProps {
  text: string;
  fontSize: number;
  fontFamily: FontFamilyId;
  letterSpacing: number;
  color: string;
  backdrop: boolean;
  styleTemplate: TextStyleTemplateId;
  text3d?: Text3DSettings;
  layerOrder?: OverlayLayerOrder;
  blendMode?: OverlayBlendMode;
  x: number;
  y: number;
  scale?: number;
  rotation?: number;
  tiltX?: number;
  tiltY?: number;
  opacity?: number;
  onChange: (patch: UnifiedTextPatch) => void;
  onDuplicate?: () => void;
}

type EditorSubTab = 'style' | 'fill' | 'transform' | 'letters';

const QUICK_COLORS = ['#ffffff', '#fef08a', '#f59e0b', '#ef4444', '#38bdf8', '#a855f7', '#09090b'];

const CHAR_ANIMATIONS: { id: TextCharAnimationType; label: string }[] = [
  { id: 'none', label: 'Off' },
  { id: 'typewriter', label: 'Typewriter' },
  { id: 'wave', label: 'Wave' },
  { id: 'pop-in', label: 'Pop Stagger' },
  { id: 'slide-stagger', label: 'Slide Up' },
  { id: 'shake', label: 'Kinetic Shake' },
  { id: 'color-pulse', label: 'Color Cycle' },
];

interface MiniSliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  defaultValue?: number;
  onChange: (val: number) => void;
}

const MiniSlider: React.FC<MiniSliderProps> = ({
  label,
  value,
  min,
  max,
  step = 1,
  unit = '',
  defaultValue = 0,
  onChange,
}) => (
  <div className="space-y-1">
    <div className="flex items-center justify-between text-[11px]">
      <span className="text-zinc-300">{label}</span>
      <button
        type="button"
        title="Double-click to reset"
        onDoubleClick={() => onChange(defaultValue)}
        className="font-mono text-zinc-400 hover:text-amber-300 tabular-nums cursor-pointer"
      >
        {step < 1 ? value.toFixed(2) : Math.round(value)}
        {unit}
      </button>
    </div>
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className="w-full"
    />
  </div>
);

export const TextEffectsEditor: React.FC<TextEffectsEditorProps> = ({
  text,
  fontSize,
  fontFamily,
  letterSpacing,
  color,
  backdrop,
  styleTemplate,
  text3d,
  layerOrder = 'front',
  blendMode = 'normal',
  x,
  y,
  scale = 1,
  rotation = 0,
  tiltX,
  tiltY,
  opacity = 1,
  onChange,
  onDuplicate,
}) => {
  const [subTab, setSubTab] = useState<EditorSubTab>('style');
  const [fontList, setFontList] = useState<FontOptionEntry[]>(() => getAllFontOptions());
  const [fontError, setFontError] = useState<string | null>(null);
  const [selectedCharIdx, setSelectedCharIdx] = useState<number>(0);
  const fontInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return subscribeCustomFonts(() => {
      setFontList(getAllFontOptions());
    });
  }, []);

  const cfg = normalizeTextEffects(text3d);
  const effectiveTiltX = tiltX ?? cfg.tiltX ?? 0;
  const effectiveTiltY = tiltY ?? cfg.tiltY ?? 0;
  const chars = Array.from(text || '');
  const safeCharIdx = chars.length > 0 ? clamp(selectedCharIdx, 0, chars.length - 1) : 0;
  const activeCharStyle: TextCharStyle = cfg.charStyles?.[String(safeCharIdx)] || {};

  const updateFx = (patch: Partial<Text3DSettings>, extra?: UnifiedTextPatch) => {
    onChange({
      ...extra,
      text3d: {
        ...cfg,
        ...patch,
      },
    });
  };

  const updateCharStyle = (idx: number, patch: Partial<TextCharStyle>) => {
    const nextCharMap: Record<string, TextCharStyle> = { ...(cfg.charStyles || {}) };
    nextCharMap[String(idx)] = { ...(nextCharMap[String(idx)] || {}), ...patch };
    updateFx({ charStyles: nextCharMap });
  };

  const handleImportFont = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      setFontError(null);
      const entry = await importCustomFontFile(file);
      onChange({ fontFamily: entry.id });
    } catch {
      setFontError('Could not load font file. Use .ttf, .otf, .woff, or .woff2.');
    }
  };

  const applyRainbowLetters = () => {
    const palette = ['#fef08a', '#f59e0b', '#fb7185', '#c084fc', '#38bdf8', '#34d399'];
    const nextMap: Record<string, TextCharStyle> = { ...(cfg.charStyles || {}) };
    chars.forEach((ch, idx) => {
      if (ch === '\n' || ch === ' ') return;
      nextMap[String(idx)] = {
        ...(nextMap[String(idx)] || {}),
        color: palette[idx % palette.length],
      };
    });
    updateFx({ charStyles: nextMap });
  };

  return (
    <div className="space-y-3.5">
      {/* Editable Text Area + Duplicate + Layer Depth */}
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <label className="text-xs font-medium text-zinc-200 flex items-center gap-1.5">
            <Type className="w-3.5 h-3.5 text-amber-400" />
            <span>Text Content</span>
          </label>
          <div className="flex items-center gap-1">
            {onDuplicate && (
              <button
                type="button"
                onClick={onDuplicate}
                title="Duplicate text element"
                className="flex items-center gap-1 px-2 py-1 rounded border border-zinc-700 bg-zinc-900 hover:border-amber-400 text-[11px] font-medium text-zinc-200 cursor-pointer whitespace-nowrap"
              >
                <Copy className="w-3 h-3 text-amber-400" />
                <span>Duplicate</span>
              </button>
            )}
          </div>
        </div>

        <textarea
          rows={2}
          value={text}
          onChange={(e) => onChange({ text: e.target.value })}
          placeholder="Type title text..."
          className="w-full px-2.5 py-2 text-xs bg-zinc-950 border border-zinc-800 rounded-md text-zinc-100 focus:outline-none focus:border-amber-500 resize-y"
        />

        <div className="flex items-center justify-between gap-2">
          <div className="grid grid-cols-2 gap-1 p-0.5 bg-zinc-950 rounded border border-zinc-800 flex-1">
            {(
              [
                { id: 'front', label: 'In Front' },
                { id: 'behind', label: 'Behind Subject' },
              ] as { id: OverlayLayerOrder; label: string }[]
            ).map((pos) => (
              <button
                key={pos.id}
                type="button"
                onClick={() => onChange({ layerOrder: pos.id })}
                className={`py-1 text-[10px] font-medium rounded cursor-pointer whitespace-nowrap ${
                  layerOrder === pos.id
                    ? 'bg-amber-500/20 text-amber-300'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {pos.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-0.5 p-0.5 bg-zinc-950 rounded border border-zinc-800">
            {(
              [
                { id: 'left', Icon: AlignLeft },
                { id: 'center', Icon: AlignCenter },
                { id: 'right', Icon: AlignRight },
              ] as { id: TextAlignMode; Icon: typeof AlignLeft }[]
            ).map(({ id, Icon }) => (
              <button
                key={id}
                type="button"
                aria-label={`Align ${id}`}
                onClick={() => updateFx({ align: id })}
                className={`p-1 rounded cursor-pointer ${
                  (cfg.align || 'center') === id
                    ? 'bg-zinc-800 text-amber-300'
                    : 'text-zinc-500 hover:text-zinc-200'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Sub-Tabs for 3D-Style Effects, Fills, Position/Perspective & Per-Letter Controls */}
      <div className="grid grid-cols-4 gap-1 p-1 bg-zinc-950 rounded-md border border-zinc-800">
        {(
          [
            { id: 'style', label: '3D Style' },
            { id: 'fill', label: 'Fill & FX' },
            { id: 'transform', label: 'Position' },
            { id: 'letters', label: 'Letters' },
          ] as { id: EditorSubTab; label: string }[]
        ).map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setSubTab(t.id)}
            className={`py-1.5 text-[10px] font-semibold rounded transition-colors cursor-pointer whitespace-nowrap ${
              subTab === t.id
                ? 'bg-zinc-800 text-amber-300'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* TAB 1: STYLE, FONTS & FAKE 3D EXTRUSION */}
      {subTab === 'style' && (
        <div className="space-y-3.5">
          {/* Font Family + Import Font */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-medium text-zinc-300">Font Family</span>
              <button
                type="button"
                onClick={() => fontInputRef.current?.click()}
                className="flex items-center gap-1 px-2 py-0.5 rounded border border-zinc-700 bg-zinc-900 hover:border-amber-400 text-[10px] font-medium text-amber-300 cursor-pointer whitespace-nowrap"
              >
                <Upload className="w-2.5 h-2.5" />
                <span>Import Font</span>
              </button>
              <input
                ref={fontInputRef}
                type="file"
                accept=".ttf,.otf,.woff,.woff2"
                onChange={handleImportFont}
                className="hidden"
              />
            </div>
            {fontError && <p className="text-[10px] text-red-400">{fontError}</p>}
            <div className="grid grid-cols-2 gap-1">
              {fontList.map((font) => (
                <button
                  key={font.id}
                  type="button"
                  onClick={() => onChange({ fontFamily: font.id })}
                  style={{ fontFamily: font.cssFamily }}
                  className={`px-2 py-1.5 text-[11px] rounded border text-left truncate cursor-pointer ${
                    fontFamily === font.id
                      ? 'border-amber-500 bg-amber-500/15 text-zinc-50'
                      : 'border-zinc-800 bg-zinc-950 text-zinc-300 hover:border-zinc-700'
                  }`}
                >
                  {font.label}
                </button>
              ))}
            </div>
          </div>

          {/* 1-Click 3D-Style Templates */}
          <div className="space-y-1.5">
            <span className="text-[11px] font-medium text-zinc-300">Typography Presets</span>
            <div className="grid grid-cols-2 gap-1">
              {TEXT_STYLE_TEMPLATES.map((tpl) => (
                <button
                  key={tpl.id}
                  type="button"
                  onClick={() =>
                    onChange({
                      styleTemplate: tpl.id,
                      fontFamily: tpl.fontFamily,
                      fontSize: tpl.fontSize,
                      color: tpl.color,
                      backdrop: tpl.backdrop,
                      text3d: tpl.text3d
                        ? { ...DEFAULT_TEXT_3D, ...tpl.text3d }
                        : { ...DEFAULT_TEXT_3D, enabled: false },
                    })
                  }
                  className={`px-2 py-1.5 text-[10px] rounded border text-left truncate cursor-pointer ${
                    styleTemplate === tpl.id
                      ? 'border-amber-500 bg-amber-500/15 text-amber-200 font-medium'
                      : 'border-zinc-800 bg-zinc-950 text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  {tpl.name}
                </button>
              ))}
            </div>
          </div>

          {/* Fake 3D Extrusion Controls */}
          <div className="space-y-2.5 pt-2.5 border-t border-zinc-800/80">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-zinc-200 flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-amber-400" />
                <span>3D Extrusion &amp; Depth</span>
              </span>
              <button
                type="button"
                onClick={() =>
                  updateFx({
                    enabled: !cfg.enabled,
                    style: !cfg.enabled && cfg.style === 'none' ? 'extrude' : cfg.style,
                  })
                }
                className={`px-2.5 py-1 text-[10px] font-semibold rounded border cursor-pointer ${
                  cfg.enabled
                    ? 'border-amber-400 bg-amber-400 text-zinc-950'
                    : 'border-zinc-700 bg-zinc-900 text-zinc-300'
                }`}
              >
                {cfg.enabled ? '3D On' : 'Enable 3D'}
              </button>
            </div>

            {cfg.enabled && (
              <div className="space-y-2.5">
                <MiniSlider
                  label="Extrude Depth"
                  value={cfg.depth}
                  min={0}
                  max={60}
                  unit="px"
                  defaultValue={16}
                  onChange={(v) => updateFx({ enabled: true, depth: v })}
                />
                <MiniSlider
                  label="Depth Direction"
                  value={cfg.angle}
                  min={-180}
                  max={180}
                  unit="°"
                  defaultValue={135}
                  onChange={(v) => updateFx({ enabled: true, angle: v })}
                />
                <MiniSlider
                  label="Depth Shading"
                  value={cfg.extrudeShading ?? 70}
                  min={0}
                  max={100}
                  unit="%"
                  defaultValue={70}
                  onChange={(v) => updateFx({ enabled: true, extrudeShading: v })}
                />
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] text-zinc-400">Extrude Color</span>
                  <div className="flex items-center gap-1">
                    {['#b45309', '#18181b', '#0369a1', '#dc2626', '#6d28d9'].map((hex) => (
                      <button
                        key={hex}
                        type="button"
                        onClick={() => updateFx({ enabled: true, extrudeColor: hex })}
                        aria-label={`Extrude color ${hex}`}
                        className={`w-4 h-4 rounded border cursor-pointer ${
                          cfg.extrudeColor === hex ? 'border-amber-400 scale-110' : 'border-zinc-700'
                        }`}
                        style={{ backgroundColor: hex }}
                      />
                    ))}
                    <input
                      type="color"
                      aria-label="Custom extrude color"
                      value={cfg.extrudeColor}
                      onChange={(e) => updateFx({ enabled: true, extrudeColor: e.target.value })}
                      className="w-5 h-5 rounded border border-zinc-700 bg-transparent cursor-pointer p-0"
                    />
                  </div>
                </div>
                <MiniSlider
                  label="Bevel Specular"
                  value={cfg.bevel}
                  min={0}
                  max={100}
                  unit="%"
                  defaultValue={60}
                  onChange={(v) => updateFx({ enabled: true, bevel: v })}
                />
                <MiniSlider
                  label="Inner Shadow / Emboss"
                  value={cfg.innerShadowDepth ?? 0}
                  min={0}
                  max={24}
                  unit="px"
                  defaultValue={0}
                  onChange={(v) => updateFx({ enabled: true, innerShadowDepth: v })}
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: SURFACE MATERIALS, GRADIENT, OUTLINE, GLOW, DUAL SHADOWS, TRIPLE LAYERS */}
      {subTab === 'fill' && (
        <div className="space-y-3.5">
          {/* Surface Finish Grid */}
          <div className="space-y-1.5">
            <span className="text-[11px] font-medium text-zinc-300">Surface Material</span>
            <div className="grid grid-cols-4 gap-1">
              {TEXT_3D_STYLE_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() =>
                    updateFx(
                      {
                        enabled: true,
                        style: opt.id,
                        extrudeColor: opt.defaultExtrude,
                        depth: opt.defaultDepth,
                        bevel: opt.defaultBevel,
                        ...(opt.defaultGradient2 ? { gradientColor2: opt.defaultGradient2 } : {}),
                        ...(opt.defaultOutlineWidth !== undefined
                          ? { outlineWidth: opt.defaultOutlineWidth }
                          : {}),
                        ...(opt.defaultOutlineColor ? { outlineColor: opt.defaultOutlineColor } : {}),
                        ...(opt.defaultGlow !== undefined ? { glowIntensity: opt.defaultGlow } : {}),
                        ...(opt.defaultGlowColor ? { glowColor: opt.defaultGlowColor } : {}),
                        ...(opt.defaultInnerShadow !== undefined
                          ? { innerShadowDepth: opt.defaultInnerShadow }
                          : {}),
                      },
                      opt.defaultColor ? { color: opt.defaultColor } : undefined
                    )
                  }
                  className={`px-1.5 py-1.5 text-[10px] rounded border text-center truncate cursor-pointer ${
                    cfg.enabled && cfg.style === opt.id
                      ? 'border-amber-500 bg-amber-500/15 text-amber-200 font-medium'
                      : 'border-zinc-800 bg-zinc-950 text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Primary Color + Gradient */}
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] text-zinc-300">Face Color</span>
              <div className="flex items-center gap-1">
                {QUICK_COLORS.map((hex) => (
                  <button
                    key={hex}
                    type="button"
                    onClick={() => onChange({ color: hex })}
                    aria-label={`Color ${hex}`}
                    className={`w-4 h-4 rounded border cursor-pointer ${
                      color === hex ? 'border-amber-400 scale-110' : 'border-zinc-700'
                    }`}
                    style={{ backgroundColor: hex }}
                  />
                ))}
                <input
                  type="color"
                  aria-label="Custom face color"
                  value={color}
                  onChange={(e) => onChange({ color: e.target.value })}
                  className="w-5 h-5 rounded border border-zinc-700 bg-transparent cursor-pointer p-0"
                />
              </div>
            </div>

            {cfg.style === 'gradient' && (
              <div className="space-y-2 p-2 rounded border border-zinc-800 bg-zinc-950/70">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] text-zinc-400">Gradient End Color</span>
                  <input
                    type="color"
                    aria-label="Gradient second color"
                    value={cfg.gradientColor2 || '#f59e0b'}
                    onChange={(e) => updateFx({ enabled: true, gradientColor2: e.target.value })}
                    className="w-6 h-5 rounded border border-zinc-700 bg-transparent cursor-pointer p-0"
                  />
                </div>
                <MiniSlider
                  label="Gradient Angle"
                  value={cfg.gradientAngle ?? 180}
                  min={0}
                  max={360}
                  unit="°"
                  defaultValue={180}
                  onChange={(v) => updateFx({ enabled: true, gradientAngle: v })}
                />
              </div>
            )}
          </div>

          {/* Custom Outline & Neon Glow */}
          <div className="space-y-2.5 pt-2 border-t border-zinc-800/80">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] text-zinc-300">Outline Thickness</span>
              <input
                type="color"
                aria-label="Outline color"
                value={cfg.outlineColor || '#09090b'}
                onChange={(e) => updateFx({ outlineColor: e.target.value })}
                className="w-5 h-5 rounded border border-zinc-700 bg-transparent cursor-pointer p-0"
              />
            </div>
            <MiniSlider
              label="Stroke Width"
              value={cfg.outlineWidth ?? 0}
              min={0}
              max={20}
              step={0.5}
              unit="px"
              defaultValue={0}
              onChange={(v) => updateFx({ outlineWidth: v })}
            />

            <div className="flex items-center justify-between gap-2 pt-1">
              <span className="text-[11px] text-zinc-300">Neon / Outer Glow</span>
              <input
                type="color"
                aria-label="Glow color"
                value={cfg.glowColor || '#38bdf8'}
                onChange={(e) => updateFx({ glowColor: e.target.value })}
                className="w-5 h-5 rounded border border-zinc-700 bg-transparent cursor-pointer p-0"
              />
            </div>
            <MiniSlider
              label="Glow Intensity"
              value={cfg.glowIntensity ?? 0}
              min={0}
              max={100}
              unit="%"
              defaultValue={0}
              onChange={(v) => updateFx({ glowIntensity: v })}
            />
          </div>

          {/* Multiple Shadows */}
          <div className="space-y-2 pt-2 border-t border-zinc-800/80">
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-1.5 text-[11px] text-zinc-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={cfg.dropShadowEnabled !== false}
                  onChange={(e) => updateFx({ dropShadowEnabled: e.target.checked })}
                  className="accent-amber-500"
                />
                <span>Primary Shadow</span>
              </label>
              <input
                type="color"
                aria-label="Primary shadow color"
                value={cfg.dropShadowColor || '#000000'}
                onChange={(e) => updateFx({ dropShadowColor: e.target.value })}
                className="w-5 h-4 rounded border border-zinc-700 bg-transparent cursor-pointer p-0"
              />
            </div>
            {cfg.dropShadowEnabled !== false && (
              <div className="grid grid-cols-2 gap-2">
                <MiniSlider
                  label="Distance"
                  value={cfg.dropShadowDistance ?? 6}
                  min={0}
                  max={50}
                  unit="px"
                  defaultValue={6}
                  onChange={(v) => updateFx({ dropShadowDistance: v })}
                />
                <MiniSlider
                  label="Blur"
                  value={cfg.dropShadowBlur ?? 14}
                  min={0}
                  max={48}
                  unit="px"
                  defaultValue={14}
                  onChange={(v) => updateFx({ dropShadowBlur: v })}
                />
              </div>
            )}

            <div className="flex items-center justify-between pt-1">
              <label className="flex items-center gap-1.5 text-[11px] text-zinc-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={Boolean(cfg.shadow2Enabled)}
                  onChange={(e) => updateFx({ shadow2Enabled: e.target.checked })}
                  className="accent-amber-500"
                />
                <span>2nd Offset Shadow</span>
              </label>
              <input
                type="color"
                aria-label="Secondary shadow color"
                value={cfg.shadow2Color || '#ef4444'}
                onChange={(e) => updateFx({ shadow2Color: e.target.value })}
                className="w-5 h-4 rounded border border-zinc-700 bg-transparent cursor-pointer p-0"
              />
            </div>
            {cfg.shadow2Enabled && (
              <div className="grid grid-cols-2 gap-2">
                <MiniSlider
                  label="Angle"
                  value={cfg.shadow2Angle ?? 45}
                  min={-180}
                  max={180}
                  unit="°"
                  defaultValue={45}
                  onChange={(v) => updateFx({ shadow2Angle: v })}
                />
                <MiniSlider
                  label="Distance"
                  value={cfg.shadow2Distance ?? 14}
                  min={0}
                  max={60}
                  unit="px"
                  defaultValue={14}
                  onChange={(v) => updateFx({ shadow2Distance: v })}
                />
              </div>
            )}
          </div>

          {/* Double & Triple Layer Echoes */}
          <div className="space-y-2 pt-2 border-t border-zinc-800/80">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium text-zinc-300">Double / Triple Layers</span>
              <div className="flex items-center gap-1">
                {([1, 2, 3] as const).map((cnt) => (
                  <button
                    key={cnt}
                    type="button"
                    onClick={() => updateFx({ layerCount: cnt })}
                    className={`px-2 py-0.5 text-[10px] rounded border cursor-pointer ${
                      (cfg.layerCount ?? 1) === cnt
                        ? 'border-amber-400 bg-amber-400 text-zinc-950 font-semibold'
                        : 'border-zinc-800 bg-zinc-950 text-zinc-400'
                    }`}
                  >
                    {cnt}×
                  </button>
                ))}
              </div>
            </div>
            {(cfg.layerCount ?? 1) > 1 && (
              <div className="space-y-2 p-2 rounded border border-zinc-800 bg-zinc-950/60">
                <div className="grid grid-cols-2 gap-2">
                  <MiniSlider
                    label="Offset X"
                    value={cfg.layerOffsetX ?? 6}
                    min={-30}
                    max={30}
                    unit="px"
                    defaultValue={6}
                    onChange={(v) => updateFx({ layerOffsetX: v })}
                  />
                  <MiniSlider
                    label="Offset Y"
                    value={cfg.layerOffsetY ?? 6}
                    min={-30}
                    max={30}
                    unit="px"
                    defaultValue={6}
                    onChange={(v) => updateFx({ layerOffsetY: v })}
                  />
                </div>
                <div className="flex items-center justify-between gap-2 text-[10px] text-zinc-400">
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={cfg.layerStrokeOnly !== false}
                      onChange={(e) => updateFx({ layerStrokeOnly: e.target.checked })}
                      className="accent-amber-500"
                    />
                    <span>Hollow Outline Echo</span>
                  </label>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="color"
                      aria-label="Layer 2 color"
                      value={cfg.layer2Color || '#f59e0b'}
                      onChange={(e) => updateFx({ layer2Color: e.target.value })}
                      className="w-5 h-4 rounded border border-zinc-700 bg-transparent cursor-pointer p-0"
                    />
                    {cfg.layerCount === 3 && (
                      <input
                        type="color"
                        aria-label="Layer 3 color"
                        value={cfg.layer3Color || '#38bdf8'}
                        onChange={(e) => updateFx({ layer3Color: e.target.value })}
                        className="w-5 h-4 rounded border border-zinc-700 bg-transparent cursor-pointer p-0"
                      />
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Blend Mode & Backdrop Box */}
          <div className="space-y-2 pt-2 border-t border-zinc-800/80">
            <div className="flex items-center justify-between gap-2">
              <label className="flex items-center gap-2 text-[11px] text-zinc-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={backdrop}
                  onChange={(e) => onChange({ backdrop: e.target.checked })}
                  className="accent-amber-500"
                />
                <span>Backdrop Pill</span>
              </label>
              <select
                aria-label="Text blend mode"
                value={blendMode}
                onChange={(e) => onChange({ blendMode: e.target.value as OverlayBlendMode })}
                className="px-2 py-1 text-[11px] bg-zinc-950 border border-zinc-800 rounded text-zinc-200"
              >
                {OVERLAY_BLEND_MODES.map((bm) => (
                  <option key={bm.id} value={bm.id}>
                    Blend: {bm.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: UNRESTRICTED POSITION, AE X/Y/Z ROTATION, SCALE X/Y & PERSPECTIVE */}
      {subTab === 'transform' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium text-zinc-300">Exact Placement (Drag Anywhere)</span>
            <button
              type="button"
              onClick={() =>
                updateFx(
                  { scaleX: 1, scaleY: 1, skewX: 0, skewY: 0, perspective: 0, tiltX: 0, tiltY: 0 },
                  { x: 0.5, y: 0.5, rotation: 0, tiltX: 0, tiltY: 0, scale: 1 }
                )
              }
              className="flex items-center gap-1 text-[10px] text-zinc-400 hover:text-amber-300 cursor-pointer"
            >
              <RotateCcw className="w-2.5 h-2.5" />
              <span>Center &amp; Reset</span>
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <MiniSlider
              label="Pos X"
              value={Math.round(x * 100)}
              min={-15}
              max={115}
              unit="%"
              defaultValue={50}
              onChange={(v) => onChange({ x: v / 100 })}
            />
            <MiniSlider
              label="Pos Y"
              value={Math.round(y * 100)}
              min={-15}
              max={115}
              unit="%"
              defaultValue={50}
              onChange={(v) => onChange({ y: v / 100 })}
            />
          </div>

          <MiniSlider
            label="Font Size"
            value={fontSize}
            min={14}
            max={150}
            unit="px"
            defaultValue={56}
            onChange={(v) => onChange({ fontSize: v })}
          />

          <div className="grid grid-cols-2 gap-2">
            <MiniSlider
              label="Letter Space"
              value={letterSpacing}
              min={-6}
              max={36}
              unit="px"
              defaultValue={0}
              onChange={(v) => onChange({ letterSpacing: v })}
            />
            <MiniSlider
              label="Line Height"
              value={cfg.lineHeight ?? 1.12}
              min={0.7}
              max={2.4}
              step={0.05}
              unit="×"
              defaultValue={1.12}
              onChange={(v) => updateFx({ lineHeight: v })}
            />
          </div>

          <div className="space-y-2.5 p-2.5 rounded-md border border-zinc-800 bg-zinc-950/70">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-semibold text-amber-300">
                3D Axis Rotation (X / Y / Z)
              </span>
              <button
                type="button"
                onClick={() => updateFx({ tiltX: 0, tiltY: 0 }, { rotation: 0, tiltX: 0, tiltY: 0 })}
                className="text-[10px] text-zinc-400 hover:text-amber-300 cursor-pointer"
              >
                Zero XYZ
              </button>
            </div>
            <div className="grid grid-cols-5 gap-1">
              {[
                { label: 'Flat', tx: 0, ty: 0, rz: 0 },
                { label: 'Y -35°', tx: 0, ty: -35, rz: rotation },
                { label: 'Y +35°', tx: 0, ty: 35, rz: rotation },
                { label: 'X -25°', tx: -25, ty: effectiveTiltY, rz: rotation },
                { label: 'Flip Y', tx: effectiveTiltX, ty: 180, rz: rotation },
              ].map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() =>
                    updateFx(
                      { tiltX: preset.tx, tiltY: preset.ty },
                      { tiltX: preset.tx, tiltY: preset.ty, rotation: preset.rz }
                    )
                  }
                  className="py-1 rounded border border-zinc-800 bg-zinc-900 text-[10px] text-zinc-300 hover:border-amber-500/70 hover:text-amber-200 cursor-pointer whitespace-nowrap"
                >
                  {preset.label}
                </button>
              ))}
            </div>
            <MiniSlider
              label="X Rotation (Pitch)"
              value={Math.round(effectiveTiltX)}
              min={-360}
              max={360}
              unit="°"
              defaultValue={0}
              onChange={(v) => updateFx({ tiltX: v }, { tiltX: v })}
            />
            <MiniSlider
              label="Y Rotation (Turn Left/Right)"
              value={Math.round(effectiveTiltY)}
              min={-360}
              max={360}
              unit="°"
              defaultValue={0}
              onChange={(v) => updateFx({ tiltY: v }, { tiltY: v })}
            />
            <MiniSlider
              label="Z Rotation (Roll)"
              value={Math.round(rotation)}
              min={-360}
              max={360}
              unit="°"
              defaultValue={0}
              onChange={(v) => onChange({ rotation: v })}
            />
            <MiniSlider
              label="Camera Perspective"
              value={cfg.perspective ?? 0}
              min={-60}
              max={60}
              unit="%"
              defaultValue={0}
              onChange={(v) => updateFx({ perspective: v })}
            />
          </div>

          <div className="grid grid-cols-2 gap-2 pt-1.5 border-t border-zinc-800/80">
            <MiniSlider
              label="Width Scale X"
              value={Math.round((cfg.scaleX ?? 1) * 100)}
              min={30}
              max={260}
              unit="%"
              defaultValue={100}
              onChange={(v) => updateFx({ scaleX: v / 100 })}
            />
            <MiniSlider
              label="Height Scale Y"
              value={Math.round((cfg.scaleY ?? 1) * 100)}
              min={30}
              max={260}
              unit="%"
              defaultValue={100}
              onChange={(v) => updateFx({ scaleY: v / 100 })}
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <MiniSlider
              label="Skew X"
              value={cfg.skewX ?? 0}
              min={-42}
              max={42}
              unit="°"
              defaultValue={0}
              onChange={(v) => updateFx({ skewX: v })}
            />
            <MiniSlider
              label="Skew Y"
              value={cfg.skewY ?? 0}
              min={-42}
              max={42}
              unit="°"
              defaultValue={0}
              onChange={(v) => updateFx({ skewY: v })}
            />
          </div>

          <MiniSlider
            label="Opacity"
            value={Math.round(opacity * 100)}
            min={0}
            max={100}
            unit="%"
            defaultValue={100}
            onChange={(v) => onChange({ opacity: v / 100 })}
          />

          <MiniSlider
            label="Overall Scale"
            value={Math.round(scale * 100)}
            min={30}
            max={280}
            unit="%"
            defaultValue={100}
            onChange={(v) => onChange({ scale: v / 100 })}
          />
        </div>
      )}

      {/* TAB 4: PER-LETTER CUSTOMIZATION & CHARACTER ANIMATIONS */}
      {subTab === 'letters' && (
        <div className="space-y-3.5">
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-medium text-zinc-300">
                Select Letter to Customize
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={applyRainbowLetters}
                  className="flex items-center gap-1 px-2 py-0.5 rounded bg-zinc-900 border border-zinc-700 hover:border-amber-400 text-[10px] text-amber-300 cursor-pointer"
                >
                  <Sparkles className="w-2.5 h-2.5" />
                  <span>Rainbow</span>
                </button>
                <button
                  type="button"
                  onClick={() => updateFx({ charStyles: {} })}
                  className="px-2 py-0.5 rounded bg-zinc-900 border border-zinc-800 hover:text-zinc-100 text-[10px] text-zinc-400 cursor-pointer"
                >
                  Clear
                </button>
              </div>
            </div>

            {chars.length === 0 ? (
              <p className="text-[11px] text-zinc-500">Type words above to style individual letters.</p>
            ) : (
              <>
                <div className="flex flex-wrap gap-1 p-1.5 rounded border border-zinc-800 bg-zinc-950 max-h-24 overflow-y-auto studio-scroll">
                  {chars.map((ch, idx) => {
                    if (ch === '\n') return null;
                    const custom = cfg.charStyles?.[String(idx)];
                    const isActive = idx === safeCharIdx;
                    return (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => setSelectedCharIdx(idx)}
                        className={`min-w-6 h-6 px-1.5 rounded text-[11px] font-mono font-bold border transition-colors cursor-pointer ${
                          isActive
                            ? 'border-amber-400 bg-amber-500/20 text-amber-200'
                            : custom
                              ? 'border-zinc-600 bg-zinc-800 text-zinc-100'
                              : 'border-zinc-800 bg-zinc-900 text-zinc-400 hover:text-zinc-200'
                        }`}
                        style={custom?.color ? { color: custom.color } : undefined}
                      >
                        {ch === ' ' ? '␣' : ch}
                      </button>
                    );
                  })}
                </div>

                <div className="p-2.5 rounded border border-zinc-800 bg-zinc-950/60 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-medium text-zinc-200">
                      Letter #{safeCharIdx + 1} ({chars[safeCharIdx] === ' ' ? 'Space' : chars[safeCharIdx]})
                    </span>
                    <div className="flex items-center gap-1">
                      {['#ffffff', '#fef08a', '#f59e0b', '#ef4444', '#38bdf8'].map((hex) => (
                        <button
                          key={hex}
                          type="button"
                          onClick={() => updateCharStyle(safeCharIdx, { color: hex })}
                          aria-label={`Letter color ${hex}`}
                          className={`w-4 h-4 rounded border cursor-pointer ${
                            activeCharStyle.color === hex ? 'border-amber-400 scale-110' : 'border-zinc-700'
                          }`}
                          style={{ backgroundColor: hex }}
                        />
                      ))}
                      <input
                        type="color"
                        aria-label="Custom letter color"
                        value={activeCharStyle.color || color}
                        onChange={(e) => updateCharStyle(safeCharIdx, { color: e.target.value })}
                        className="w-5 h-4 rounded border border-zinc-700 bg-transparent cursor-pointer p-0"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <MiniSlider
                      label="Letter Scale"
                      value={Math.round((activeCharStyle.scale ?? 1) * 100)}
                      min={50}
                      max={200}
                      unit="%"
                      defaultValue={100}
                      onChange={(v) => updateCharStyle(safeCharIdx, { scale: v / 100 })}
                    />
                    <MiniSlider
                      label="Vertical Offset"
                      value={activeCharStyle.offsetY ?? 0}
                      min={-40}
                      max={40}
                      unit="px"
                      defaultValue={0}
                      onChange={(v) => updateCharStyle(safeCharIdx, { offsetY: v })}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <MiniSlider
                      label="Letter Rotation"
                      value={activeCharStyle.rotation ?? 0}
                      min={-60}
                      max={60}
                      unit="°"
                      defaultValue={0}
                      onChange={(v) => updateCharStyle(safeCharIdx, { rotation: v })}
                    />
                    <MiniSlider
                      label="Letter Glow"
                      value={activeCharStyle.glowBoost ?? 0}
                      min={0}
                      max={100}
                      unit="%"
                      defaultValue={0}
                      onChange={(v) => updateCharStyle(safeCharIdx, { glowBoost: v })}
                    />
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Per-Character Kinetic Animation */}
          <div className="space-y-2 pt-2 border-t border-zinc-800/80">
            <span className="text-[11px] font-medium text-zinc-300">
              Per-Letter Animation
            </span>
            <div className="grid grid-cols-3 gap-1">
              {CHAR_ANIMATIONS.map((anim) => (
                <button
                  key={anim.id}
                  type="button"
                  onClick={() => updateFx({ charAnimation: anim.id })}
                  className={`px-1.5 py-1.5 text-[10px] rounded border text-center truncate cursor-pointer ${
                    (cfg.charAnimation || 'none') === anim.id
                      ? 'border-amber-500 bg-amber-500/15 text-amber-200 font-medium'
                      : 'border-zinc-800 bg-zinc-950 text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  {anim.label}
                </button>
              ))}
            </div>

            {(cfg.charAnimation || 'none') !== 'none' && (
              <div className="grid grid-cols-2 gap-2 pt-1">
                <MiniSlider
                  label="Speed"
                  value={cfg.charAnimSpeed ?? 1}
                  min={0.3}
                  max={3}
                  step={0.1}
                  unit="×"
                  defaultValue={1}
                  onChange={(v) => updateFx({ charAnimSpeed: v })}
                />
                <MiniSlider
                  label="Letter Stagger"
                  value={cfg.charAnimStagger ?? 55}
                  min={0}
                  max={100}
                  unit="%"
                  defaultValue={55}
                  onChange={(v) => updateFx({ charAnimStagger: v })}
                />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
