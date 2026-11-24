export type MediaKind = 'photo' | 'video';

export type WorkspaceMode = 'start' | 'timeline' | 'photo';

export type LeftDrawerTab = 'media' | 'audio' | 'text' | 'masks' | 'stickers' | 'effects';

export type InspectorTab = 'color' | 'transform' | 'mask' | 'effects' | 'animate';

export type AspectRatioId = 'original' | '16:9' | '9:16' | '4:5' | '4:3' | '1:1' | '2.39:1';

export type FontFamilyId = 'sans' | 'oswald' | 'syne' | 'serif' | 'mono' | 'handwritten';

export type MaskShape =
  | 'none'
  | 'circle'
  | 'ellipse'
  | 'rectangle'
  | 'linear'
  | 'mirror'
  | 'star'
  | 'heart';

export type MaskBgEffect = 'cutout' | 'dim' | 'blur' | 'original';

export type MaskOverlayPresetId =
  | 'spotlight-iris'
  | 'cinema-frame'
  | 'gradient-scrim'
  | 'split-curtain'
  | 'focus-vignette'
  | 'hud-window';

export interface MaskSettings {
  shape: MaskShape;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  feather: number;
  cornerRadius: number;
  invert: boolean;
  bgEffect: MaskBgEffect;
}

export type TransitionType =
  | 'cut'
  | 'dissolve'
  | 'fade'
  | 'whip-flash'
  | 'slide-left'
  | 'wipe-right'
  | 'zoom'
  | 'glitch';

export type ClipAnimationType = 'none' | 'fade' | 'zoom-in' | 'zoom-out' | 'slide-left' | 'slide-right';

export type VelocityPresetId = 'linear' | 'hero-time' | 'bullet-ramp' | 'flash-in' | 'montage-pulse';

export type OverlayAnimationType = 'none' | 'fade' | 'slide-up' | 'pop';

export type KeyframeEasing = 'linear' | 'ease-out' | 'ease-in-out' | 'punch';

export type CanvasBgMode = 'black' | 'blur' | 'slate';

export type StickerKind =
  | 'rec-frame'
  | 'focus-reticle'
  | 'cinema-stamp'
  | 'arrow-accent'
  | 'star-badge'
  | 'timecode-hud';

export interface OverlayKeyframe {
  id: string;
  time: number; // relative seconds from start of overlay or clip (0..duration)
  x: number; // normalized 0..1
  y: number; // normalized 0..1
  scale: number; // 0.3..3.0
  rotation: number; // -180..180 deg
  opacity: number; // 0..1
}

export interface ClipKeyframe {
  id: string;
  time: number; // relative seconds from start of clip
  scale: number; // 0.5..2.5
  offsetX: number; // normalized -0.5..0.5
  offsetY: number; // normalized -0.5..0.5
  rotation: number; // -45..45 deg
}

export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ColorGrade {
  presetId: string;
  exposure: number;
  contrast: number;
  highlights: number;
  shadows: number;
  temperature: number;
  tint: number;
  saturation: number;
  fade: number;
}

export interface TransformSettings {
  aspectRatio: AspectRatioId;
  crop: CropRect;
  straighten: number;
  rotation: number;
  flipH: boolean;
  flipV: boolean;
  kenBurns: 'none' | 'zoom-in' | 'zoom-out' | 'pan-right';
  fitMode: 'cover' | 'contain';
  bgMode: CanvasBgMode;
}

export interface EffectsSettings {
  vignette: number;
  grain: number;
  blur: number;
  sharpen: number;
  chromatic: number;
  halation: number;
  scanlines: number;
  shake: number; // 0 to 100 kinetic camera shake
  flashIn: boolean; // white impact strobe on clip start
  letterbox: boolean;
}

export interface ClipAnimationSettings {
  inType: ClipAnimationType;
  outType: ClipAnimationType;
  inDuration: number;
  outDuration: number;
}

export interface TextOverlay {
  id: string;
  text: string;
  x: number;
  y: number;
  fontSize: number;
  fontFamily: FontFamilyId;
  color: string;
  backdrop: boolean;
  styleTemplate: 'clean' | 'bold-kinetic' | 'cinema-sub' | 'lower-third' | 'amber-tag';
  animationIn: OverlayAnimationType;
  startTime: number;
  endTime: number;
}

export interface TimelineOverlayItem {
  id: string;
  kind: 'text' | 'sticker' | 'mask';
  startTime: number;
  duration: number;
  x: number;
  y: number;
  scale: number;
  rotation: number;
  opacity: number;
  easing: KeyframeEasing;
  keyframes: OverlayKeyframe[];
  // Text fields
  text?: string;
  fontSize?: number;
  fontFamily?: FontFamilyId;
  letterSpacing?: number;
  color?: string;
  backdrop?: boolean;
  styleTemplate?: 'clean' | 'bold-kinetic' | 'cinema-sub' | 'lower-third' | 'amber-tag';
  animationIn?: OverlayAnimationType;
  // Sticker fields
  stickerKind?: StickerKind;
  // Mask overlay fields
  maskShape?: Exclude<MaskShape, 'none'>;
  maskOverlayStyle?: MaskOverlayPresetId;
  maskWidth?: number;
  maskHeight?: number;
  maskFeather?: number;
  maskColor?: string;
  maskBorder?: boolean;
}

export interface AudioAsset {
  id: string;
  name: string;
  category: 'music' | 'sfx' | 'imported';
  src: string;
  duration: number;
  bpm?: number;
  peaks: number[];
}

export interface AudioClip {
  id: string;
  audioAssetId: string;
  name: string;
  startTime: number;
  trimStart: number;
  trimEnd: number;
  volume: number;
  fadeIn: number;
  fadeOut: number;
  muted: boolean;
  peaks: number[];
  src: string;
}

export interface EditDocument {
  color: ColorGrade;
  transform: TransformSettings;
  mask?: MaskSettings;
  effects: EffectsSettings;
  animation: ClipAnimationSettings;
  overlays: TextOverlay[];
}

export interface MediaAsset {
  id: string;
  name: string;
  kind: MediaKind;
  src: string;
  width: number;
  height: number;
  duration: number;
  isSample?: boolean;
  caption?: string;
}

export interface TimelineClip {
  id: string;
  assetId: string;
  name: string;
  kind: MediaKind;
  trimStart: number;
  trimEnd: number;
  duration: number;
  speed: number;
  velocityPreset: VelocityPresetId;
  volume: number;
  muted: boolean;
  transitionIn: TransitionType;
  transitionDuration: number;
  keyframes: ClipKeyframe[];
  keyframeEasing: KeyframeEasing;
  edits: EditDocument;
}

export interface FilmPreset {
  id: string;
  name: string;
  subtitle: string;
  grade: Partial<ColorGrade>;
  vignette?: number;
  grain?: number;
  halation?: number;
}
