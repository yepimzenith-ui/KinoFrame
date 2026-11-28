export type MediaKind = 'photo' | 'video';

export type WorkspaceMode = 'start' | 'timeline' | 'photo';

export type LeftDrawerTab = 'media' | 'cutout' | 'overlays' | 'audio' | 'text' | 'masks' | 'stickers' | 'effects';

export type InspectorTab = 'color' | 'transform' | 'mask' | 'cutout' | 'effects' | 'animate';

export type AspectRatioId = 'original' | '16:9' | '9:16' | '4:5' | '4:3' | '1:1' | '2.39:1';

export type FontFamilyId = 'sans' | 'oswald' | 'syne' | 'serif' | 'mono' | 'handwritten' | (string & {});

export type TextStyleTemplateId =
  | 'clean'
  | 'bold-kinetic'
  | 'cinema-sub'
  | 'lower-third'
  | 'amber-tag'
  | 'cinema-3d'
  | 'anime-impact'
  | 'chrome-metal'
  | 'glass-gloss'
  | 'neon-cyber'
  | 'gold-emboss'
  | 'triple-layer'
  | 'gradient-punch';

export type Text3DStyleId =
  | 'none'
  | 'extrude'
  | 'gradient'
  | 'metallic'
  | 'chrome-bevel'
  | 'glass'
  | 'neon-3d'
  | 'emboss'
  | 'retro-pop';

export type TextAlignMode = 'left' | 'center' | 'right';

export type TextCharAnimationType =
  | 'none'
  | 'typewriter'
  | 'wave'
  | 'pop-in'
  | 'slide-stagger'
  | 'shake'
  | 'color-pulse';

export interface TextCharStyle {
  color?: string;
  scale?: number; // 0.5..2.0
  offsetY?: number; // -40..40 px
  rotation?: number; // -60..60 deg
  glowBoost?: number; // 0..100
  outlineColor?: string;
}

export interface Text3DSettings {
  enabled: boolean;
  style: Text3DStyleId;
  depth: number;
  angle: number;
  tiltX: number; // -360..360 deg (AE X Rotation)
  tiltY: number; // -360..360 deg (AE Y Rotation)
  extrudeColor: string;
  bevel: number;
  // Extended 2D 3D-style typography controls
  extrudeShading?: number; // 0..100
  gradientColor2?: string;
  gradientAngle?: number; // 0..360
  innerShadowDepth?: number; // 0..24
  innerShadowColor?: string;
  outlineWidth?: number; // 0..24
  outlineColor?: string;
  glowIntensity?: number; // 0..100
  glowColor?: string;
  dropShadowEnabled?: boolean;
  dropShadowColor?: string;
  dropShadowBlur?: number; // 0..48
  dropShadowAngle?: number; // -180..180
  dropShadowDistance?: number; // 0..60
  shadow2Enabled?: boolean;
  shadow2Color?: string;
  shadow2Blur?: number; // 0..48
  shadow2Angle?: number; // -180..180
  shadow2Distance?: number; // 0..60
  layerCount?: 1 | 2 | 3;
  layerOffsetX?: number; // -40..40
  layerOffsetY?: number; // -40..40
  layer2Color?: string;
  layer3Color?: string;
  layerStrokeOnly?: boolean;
  scaleX?: number; // 0.3..3.0
  scaleY?: number; // 0.3..3.0
  skewX?: number; // -45..45 deg
  skewY?: number; // -45..45 deg
  perspective?: number; // -60..60
  lineHeight?: number; // 0.7..2.4
  align?: TextAlignMode;
  charStyles?: Record<string, TextCharStyle>;
  charAnimation?: TextCharAnimationType;
  charAnimSpeed?: number; // 0.25..3.0
  charAnimStagger?: number; // 0..100
}

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

export type KeyframeEasing = 'linear' | 'ease-out' | 'ease-in-out' | 'punch' | 'bounce';

export type CanvasBgMode = 'black' | 'blur' | 'slate';

export type StickerKind =
  | 'rec-frame'
  | 'focus-reticle'
  | 'cinema-stamp'
  | 'arrow-accent'
  | 'star-badge'
  | 'timecode-hud';

export type OverlayBlendMode =
  | 'normal'
  | 'screen'
  | 'overlay'
  | 'soft-light'
  | 'multiply'
  | 'color-dodge'
  | 'difference';

export type VisualOverlayPresetId =
  | 'warm-light-leak'
  | 'prism-flare'
  | 'film-dust'
  | 'bokeh-glow'
  | 'cinema-rain'
  | 'vhs-static'
  | 'frost-frame'
  | 'editorial-frame';

export type OverlayLayerOrder = 'front' | 'behind';

export type BgRemovalMode = 'auto' | 'pick' | 'drawn' | 'chroma' | 'luma';

export type BgBackdropMode = 'original' | 'transparent' | 'color' | 'blur' | 'gradient';

export type BgBrushToolMode =
  | 'none'
  | 'pick-keep'
  | 'pick-remove'
  | 'keep'
  | 'erase'
  | 'lasso';

export type BgAutoSubjectType = 'smart' | 'person' | 'object';

export interface BgPickPoint {
  id: string;
  x: number;
  y: number;
  action: 'keep' | 'remove';
  tolerance?: number;
}

export interface BgRemovalStroke {
  id: string;
  x: number;
  y: number;
  radius: number;
  action: 'keep' | 'erase';
  groupId?: string;
}

export interface BgDrawnPolygon {
  id: string;
  action: 'keep' | 'erase';
  points: { x: number; y: number }[];
}

export interface BgRemovalSettings {
  enabled: boolean;
  mode: BgRemovalMode;
  autoSubjectType?: BgAutoSubjectType;
  backdropMode: BgBackdropMode;
  backdropColor: string;
  backdropBlur: number;
  chromaColor: string;
  tolerance: number;
  softness: number;
  edgeShift: number;
  lumaTarget: 'bright' | 'dark';
  invert: boolean;
  pickPoints?: BgPickPoint[];
  strokes?: BgRemovalStroke[];
  drawnPolygons?: BgDrawnPolygon[];
}

export interface PhotoVisualOverlay {
  id: string;
  kind: 'visual' | 'image';
  name: string;
  presetId?: VisualOverlayPresetId;
  imageSrc?: string;
  blendMode: OverlayBlendMode;
  opacity: number;
  x: number;
  y: number;
  scale: number;
  rotation: number;
  layerOrder?: OverlayLayerOrder;
  bgRemoval?: BgRemovalSettings;
}

export interface OverlayKeyframe {
  id: string;
  time: number; // relative seconds from start of overlay or clip (0..duration)
  x: number; // normalized 0..1 (unrestricted)
  y: number; // normalized 0..1 (unrestricted)
  scale: number; // 0.3..3.0
  rotation: number; // -360..360 deg (AE Z Rotation)
  opacity: number; // 0..1
  tiltX?: number; // -360..360 deg (AE X Rotation)
  tiltY?: number; // -360..360 deg (AE Y Rotation)
  scaleX?: number; // 0.3..3.0
  scaleY?: number; // 0.3..3.0
  shadowDepth?: number; // 0..64 px
  glowIntensity?: number; // 0..100
  effectIntensity?: number; // 0..200 (%)
  charPhase?: number; // 0..100 (%)
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

export type MirrorTileMode = 'none' | 'mirror-h' | 'quad';

export type DuotoneMapId = 'none' | 'cyber' | 'thermal' | 'crimson' | 'noir-gold';

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
  // After Effects Optical & Stylized FX
  glowBloom?: number; // 0..100 AE Deep Glow
  radialBlur?: number; // 0..100 CC Radial Zoom Blur
  motionBlur?: number; // 0..100 Directional Motion Blur
  glitch?: number; // 0..100 Digital Slice Glitch
  pixelate?: number; // 0..100 Mosaic Pixelate
  posterize?: number; // 0..100 Color Posterize
  mirrorTile?: MirrorTileMode; // AE Mirror / Quad Symmetry
  duotone?: DuotoneMapId; // AE Gradient Map / Tritone
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
  letterSpacing?: number;
  color: string;
  backdrop: boolean;
  styleTemplate: TextStyleTemplateId;
  text3d?: Text3DSettings;
  scale?: number;
  rotation?: number;
  opacity?: number;
  blendMode?: OverlayBlendMode;
  animationIn: OverlayAnimationType;
  startTime: number;
  endTime: number;
  layerOrder?: OverlayLayerOrder;
  wiggleAmp?: number; // 0..60 AE wiggle amplitude
  wiggleFreq?: number; // 0.5..16 Hz AE wiggle frequency
}

export interface TimelineOverlayItem {
  id: string;
  kind: 'text' | 'sticker' | 'mask' | 'visual' | 'image' | 'video';
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
  styleTemplate?: TextStyleTemplateId;
  text3d?: Text3DSettings;
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
  // Visual, Image & Video PiP overlay fields
  visualOverlayId?: VisualOverlayPresetId;
  blendMode?: OverlayBlendMode;
  overlaySrc?: string;
  overlayName?: string;
  overlayAssetId?: string;
  sourceTrimStart?: number;
  sourceSpeed?: number;
  sourceDuration?: number;
  muted?: boolean;
  bgRemoval?: BgRemovalSettings;
  layerOrder?: OverlayLayerOrder;
  wiggleAmp?: number; // 0..60 AE wiggle amplitude
  wiggleFreq?: number; // 0.5..16 Hz AE wiggle frequency
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
  bgRemoval?: BgRemovalSettings;
  effects: EffectsSettings;
  animation: ClipAnimationSettings;
  overlays: TextOverlay[];
  visualOverlays?: PhotoVisualOverlay[];
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
  isCutoutOverlay?: boolean;
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
