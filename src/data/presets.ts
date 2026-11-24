import {
  AspectRatioId,
  ClipAnimationSettings,
  ClipAnimationType,
  ColorGrade,
  EditDocument,
  EffectsSettings,
  FilmPreset,
  FontFamilyId,
  MaskOverlayPresetId,
  MaskSettings,
  MaskShape,
  MediaAsset,
  StickerKind,
  TransformSettings,
  TransitionType,
  VelocityPresetId,
} from '../types/editor';

export const DEFAULT_COLOR_GRADE: ColorGrade = {
  presetId: 'neutral',
  exposure: 0,
  contrast: 0,
  highlights: 0,
  shadows: 0,
  temperature: 0,
  tint: 0,
  saturation: 0,
  fade: 0,
};

export const DEFAULT_TRANSFORM: TransformSettings = {
  aspectRatio: 'original',
  crop: { x: 0, y: 0, width: 1, height: 1 },
  straighten: 0,
  rotation: 0,
  flipH: false,
  flipV: false,
  kenBurns: 'zoom-in',
  fitMode: 'contain',
  bgMode: 'blur',
};

export const DEFAULT_MASK: MaskSettings = {
  shape: 'none',
  x: 0.5,
  y: 0.5,
  width: 0.56,
  height: 0.56,
  rotation: 0,
  feather: 10,
  cornerRadius: 16,
  invert: false,
  bgEffect: 'cutout',
};

export const DEFAULT_EFFECTS: EffectsSettings = {
  vignette: 0,
  grain: 0,
  blur: 0,
  sharpen: 0,
  chromatic: 0,
  halation: 0,
  scanlines: 0,
  shake: 0,
  flashIn: false,
  letterbox: false,
};

export const DEFAULT_ANIMATION: ClipAnimationSettings = {
  inType: 'none',
  outType: 'none',
  inDuration: 0.35,
  outDuration: 0.35,
};

export function createDefaultEdits(
  kenBurns: TransformSettings['kenBurns'] = 'none',
  fitMode: TransformSettings['fitMode'] = 'cover'
): EditDocument {
  return {
    color: { ...DEFAULT_COLOR_GRADE },
    transform: {
      ...DEFAULT_TRANSFORM,
      crop: { ...DEFAULT_TRANSFORM.crop },
      kenBurns,
      fitMode,
    },
    mask: { ...DEFAULT_MASK },
    effects: { ...DEFAULT_EFFECTS },
    animation: { ...DEFAULT_ANIMATION },
    overlays: [],
  };
}

export const MASK_SHAPE_OPTIONS: { id: MaskShape; label: string; desc: string }[] = [
  { id: 'none', label: 'Off', desc: 'Full unmasked frame' },
  { id: 'circle', label: 'Circle', desc: 'Radial spotlight cutout' },
  { id: 'ellipse', label: 'Oval', desc: 'Portrait & halo ellipse' },
  { id: 'rectangle', label: 'Box', desc: 'Rounded frame window' },
  { id: 'linear', label: 'Split', desc: 'Rotatable linear reveal' },
  { id: 'mirror', label: 'Slit', desc: 'Cinema horizontal strip' },
  { id: 'star', label: 'Star', desc: 'Crisp star cutout' },
  { id: 'heart', label: 'Heart', desc: 'Heart-shaped matte' },
];

export const MASK_OVERLAY_PRESETS: {
  id: MaskOverlayPresetId;
  name: string;
  desc: string;
  shape: Exclude<MaskShape, 'none'>;
  width: number;
  height: number;
  feather: number;
  color: string;
  opacity: number;
  border: boolean;
}[] = [
  {
    id: 'spotlight-iris',
    name: 'Spotlight Iris',
    desc: 'Animated dark vignette with soft focus cutout',
    shape: 'circle',
    width: 0.44,
    height: 0.44,
    feather: 26,
    color: '#050507',
    opacity: 0.88,
    border: false,
  },
  {
    id: 'cinema-frame',
    name: 'Cinema Frame Matte',
    desc: 'Crisp rounded matte window with fine outline',
    shape: 'rectangle',
    width: 0.78,
    height: 0.74,
    feather: 2,
    color: '#09090b',
    opacity: 0.96,
    border: true,
  },
  {
    id: 'focus-vignette',
    name: 'Portrait Halo',
    desc: 'Tall oval subject isolation matte',
    shape: 'ellipse',
    width: 0.48,
    height: 0.74,
    feather: 30,
    color: '#050507',
    opacity: 0.82,
    border: false,
  },
  {
    id: 'split-curtain',
    name: 'Linear Curtain',
    desc: 'Half-frame rotatable reveal wipe',
    shape: 'linear',
    width: 0.6,
    height: 0.6,
    feather: 24,
    color: '#09090b',
    opacity: 0.92,
    border: false,
  },
  {
    id: 'gradient-scrim',
    name: 'Cinema Slit Strip',
    desc: 'Narrow horizontal letterbox peephole',
    shape: 'mirror',
    width: 0.7,
    height: 0.36,
    feather: 14,
    color: '#050507',
    opacity: 0.94,
    border: false,
  },
  {
    id: 'hud-window',
    name: 'HUD Focus Box',
    desc: 'Framed viewfinder cutout for Track T1',
    shape: 'rectangle',
    width: 0.56,
    height: 0.58,
    feather: 0,
    color: '#09090b',
    opacity: 0.78,
    border: true,
  },
];

export const FONT_OPTIONS: { id: FontFamilyId; label: string; cssFamily: string }[] = [
  { id: 'sans', label: 'Jakarta Sans', cssFamily: '"Plus Jakarta Sans", sans-serif' },
  { id: 'oswald', label: 'Oswald Impact', cssFamily: '"Oswald", sans-serif' },
  { id: 'syne', label: 'Syne Display', cssFamily: '"Syne", sans-serif' },
  { id: 'serif', label: 'Playfair Serif', cssFamily: '"Playfair Display", Georgia, serif' },
  { id: 'mono', label: 'JetBrains Mono', cssFamily: '"JetBrains Mono", monospace' },
  { id: 'handwritten', label: 'Caveat Brush', cssFamily: '"Caveat", cursive' },
];

export const ASPECT_RATIO_OPTIONS: { id: AspectRatioId; label: string; ratio: number | null }[] = [
  { id: 'original', label: 'Original', ratio: null },
  { id: '9:16', label: '9:16 Reels', ratio: 9 / 16 },
  { id: '16:9', label: '16:9 Wide', ratio: 16 / 9 },
  { id: '4:5', label: '4:5 Social', ratio: 4 / 5 },
  { id: '1:1', label: '1:1 Square', ratio: 1 },
  { id: '4:3', label: '4:3 Classic', ratio: 4 / 3 },
  { id: '2.39:1', label: '2.39:1 Scope', ratio: 2.39 },
];

export const TRANSITION_OPTIONS: { id: TransitionType; label: string }[] = [
  { id: 'cut', label: 'Hard Cut' },
  { id: 'whip-flash', label: 'Whip Flash' },
  { id: 'glitch', label: 'Glitch Cut' },
  { id: 'zoom', label: 'Zoom Punch' },
  { id: 'slide-left', label: 'Whip Slide' },
  { id: 'wipe-right', label: 'Wipe Right' },
  { id: 'dissolve', label: 'Dissolve' },
  { id: 'fade', label: 'Fade Black' },
];

export const VELOCITY_PRESETS: { id: VelocityPresetId; label: string; desc: string }[] = [
  { id: 'linear', label: 'Normal', desc: 'Steady 1:1 timing' },
  { id: 'hero-time', label: 'Hero Ramp', desc: 'Fast entry → slow-mo → snap' },
  { id: 'bullet-ramp', label: 'Bullet Ramp', desc: 'Slow build → rapid exit' },
  { id: 'flash-in', label: 'Flash Snap', desc: 'Whip fast start → settle' },
  { id: 'montage-pulse', label: 'Beat Pulse', desc: 'Rhythmic micro-pump' },
];

export const CLIP_ANIMATION_OPTIONS: { id: ClipAnimationType; label: string }[] = [
  { id: 'none', label: 'None' },
  { id: 'fade', label: 'Fade' },
  { id: 'zoom-in', label: 'Zoom Punch' },
  { id: 'zoom-out', label: 'Zoom Pull' },
  { id: 'slide-left', label: 'Whip Left' },
  { id: 'slide-right', label: 'Whip Right' },
];

export const TEXT_STYLE_TEMPLATES: {
  id: 'clean' | 'bold-kinetic' | 'cinema-sub' | 'lower-third' | 'amber-tag';
  name: string;
  preview: string;
  fontFamily: FontFamilyId;
  fontSize: number;
  color: string;
  backdrop: boolean;
}[] = [
  {
    id: 'bold-kinetic',
    name: 'Oswald Impact',
    preview: 'FAST CUT',
    fontFamily: 'oswald',
    fontSize: 64,
    color: '#ffffff',
    backdrop: false,
  },
  {
    id: 'amber-tag',
    name: 'Syne Highlight',
    preview: 'CHAPTER 01',
    fontFamily: 'syne',
    fontSize: 42,
    color: '#09090b',
    backdrop: true,
  },
  {
    id: 'cinema-sub',
    name: 'Editorial Serif',
    preview: 'Midnight in Tokyo',
    fontFamily: 'serif',
    fontSize: 38,
    color: '#fef08a',
    backdrop: false,
  },
  {
    id: 'lower-third',
    name: 'Tech HUD Bar',
    preview: 'REC · 60FPS',
    fontFamily: 'mono',
    fontSize: 28,
    color: '#f4f4f5',
    backdrop: true,
  },
  {
    id: 'clean',
    name: 'Brush Marker',
    preview: 'Hold the frame',
    fontFamily: 'handwritten',
    fontSize: 52,
    color: '#ffffff',
    backdrop: false,
  },
];

export const STICKER_OPTIONS: { id: StickerKind; label: string; desc: string }[] = [
  { id: 'rec-frame', label: 'REC Viewfinder', desc: 'Camera viewfinder corners + REC' },
  { id: 'focus-reticle', label: 'AF Reticle', desc: 'Center optical focus brackets' },
  { id: 'cinema-stamp', label: '35MM Stamp', desc: 'Film stock frame stamp' },
  { id: 'timecode-hud', label: 'Timecode HUD', desc: 'Live running timecode overlay' },
  { id: 'arrow-accent', label: 'Callout Arrow', desc: 'Hand-styled pointer arrow' },
  { id: 'star-badge', label: 'Sparkle Star', desc: 'Crisp vector four-point star' },
];

export const FILM_PRESETS: FilmPreset[] = [
  {
    id: 'neutral',
    name: 'Neutral Raw',
    subtitle: 'Uncorrected sensor curve',
    grade: { ...DEFAULT_COLOR_GRADE },
    vignette: 0,
    grain: 0,
    halation: 0,
  },
  {
    id: 'portra',
    name: 'Portra 400',
    subtitle: 'Warm skin tones · soft roll-off',
    grade: {
      exposure: 6,
      contrast: 8,
      highlights: -12,
      shadows: 14,
      temperature: 16,
      tint: 4,
      saturation: 8,
      fade: 10,
    },
    vignette: 14,
    grain: 12,
    halation: 10,
  },
  {
    id: 'cinestill',
    name: 'Cinestill 800T',
    subtitle: 'Tungsten night · halation glow',
    grade: {
      exposure: 4,
      contrast: 18,
      highlights: 10,
      shadows: -8,
      temperature: -22,
      tint: -6,
      saturation: 14,
      fade: 6,
    },
    vignette: 24,
    grain: 18,
    halation: 36,
  },
  {
    id: 'velvia',
    name: 'Velvia 50',
    subtitle: 'Deep slide contrast · vivid chroma',
    grade: {
      exposure: -2,
      contrast: 24,
      highlights: -8,
      shadows: -14,
      temperature: 6,
      tint: 2,
      saturation: 28,
      fade: 0,
    },
    vignette: 18,
    grain: 6,
    halation: 0,
  },
  {
    id: 'noir',
    name: 'Tri-X Silver',
    subtitle: 'Monochrome · crisp halide grain',
    grade: {
      exposure: 4,
      contrast: 32,
      highlights: 12,
      shadows: -16,
      temperature: 0,
      tint: 0,
      saturation: -100,
      fade: 8,
    },
    vignette: 28,
    grain: 26,
    halation: 0,
  },
  {
    id: 'nordic',
    name: 'Nordic Slate',
    subtitle: 'Muted greens · matte overcast curve',
    grade: {
      exposure: -4,
      contrast: 12,
      highlights: -18,
      shadows: 10,
      temperature: -14,
      tint: -4,
      saturation: -22,
      fade: 16,
    },
    vignette: 20,
    grain: 10,
    halation: 0,
  },
];

export const SAMPLE_MEDIA_ASSETS: MediaAsset[] = [
  {
    id: 'sample-tokyo',
    name: 'Shinjuku Rain Alley',
    kind: 'photo',
    src: '/src/assets/images/sample_tokyo_neon_1795417884087.jpg',
    width: 1408,
    height: 768,
    duration: 3.8,
    isSample: true,
    caption: '35mm Twilight Study',
  },
  {
    id: 'sample-alpine',
    name: 'Alpine Ridge Dawn',
    kind: 'photo',
    src: '/src/assets/images/sample_alpine_ridge_1795417883939.jpg',
    width: 1408,
    height: 768,
    duration: 3.8,
    isSample: true,
    caption: 'Medium Format Landscape',
  },
  {
    id: 'sample-portrait',
    name: 'Ceramics Studio Light',
    kind: 'photo',
    src: '/src/assets/images/sample_portrait_studio_1795417883912.jpg',
    width: 896,
    height: 1152,
    duration: 3.8,
    isSample: true,
    caption: 'Natural Window Portrait',
  },
  {
    id: 'sample-coastal',
    name: 'Basalt Coast Highway',
    kind: 'photo',
    src: '/src/assets/images/sample_coastal_road_1795417883900.jpg',
    width: 1152,
    height: 896,
    duration: 3.8,
    isSample: true,
    caption: 'Nordic Aerial Frame',
  },
];
