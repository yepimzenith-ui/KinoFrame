import { ASPECT_RATIO_OPTIONS, DEFAULT_BG_REMOVAL, DEFAULT_MASK, DEFAULT_TEXT_3D, FONT_OPTIONS, normalizeTextEffects } from '../data/presets';
import {
  BgRemovalSettings,
  ClipKeyframe,
  DuotoneMapId,
  EditDocument,
  FontFamilyId,
  KeyframeEasing,
  MaskShape,
  OverlayBlendMode,
  OverlayLayerOrder,
  StickerKind,
  Text3DSettings,
  TextStyleTemplateId,
  TimelineOverlayItem,
  TransitionType,
  VelocityPresetId,
  VisualOverlayPresetId,
} from '../types/editor';
import { getSourceSubjectMatte, hexToRgb } from './bgRemoval';
import { resolveFontCssFamily } from './customFonts';
import { clamp, formatTimecode } from './timecode';

const scratchCanvases: Record<string, HTMLCanvasElement> = {};
let chromaticScratch: Uint8ClampedArray | null = null;
const overlayImageCache: Record<string, HTMLImageElement> = {};

export function preloadOverlayImage(src: string, onReady?: () => void): HTMLImageElement | null {
  if (!src) return null;
  const existing = overlayImageCache[src];
  if (existing) {
    if (existing.complete && existing.naturalWidth > 0) return existing;
    return null;
  }
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => {
    onReady?.();
  };
  img.src = src;
  overlayImageCache[src] = img;
  return img.complete && img.naturalWidth > 0 ? img : null;
}

function getScratchCanvas(key: string, width: number, height: number): HTMLCanvasElement {
  let c = scratchCanvases[key];
  if (!c) {
    c = document.createElement('canvas');
    scratchCanvases[key] = c;
  }
  if (c.width !== width || c.height !== height) {
    c.width = width;
    c.height = height;
  }
  return c;
}

function computeAeWiggle(
  time: number,
  amp = 0,
  freq = 3,
  seed = 1
): { dx: number; dy: number; drot: number } {
  if (!amp || amp <= 0.1) return { dx: 0, dy: 0, drot: 0 };
  const t = Math.max(0.15, time) * clamp(freq || 3, 0.25, 24);
  const s = amp / 100;
  const dx =
    (Math.sin(t * 2.13 + seed * 1.7) * 0.62 + Math.cos(t * 4.71 + seed * 3.1) * 0.38) *
    s *
    0.095;
  const dy =
    (Math.cos(t * 2.57 + seed * 2.3) * 0.62 + Math.sin(t * 5.19 + seed * 1.9) * 0.38) *
    s *
    0.095;
  const drot =
    (Math.sin(t * 1.87 + seed * 4.1) * 0.65 + Math.cos(t * 3.93 + seed * 0.8) * 0.35) *
    s *
    14;
  return { dx, dy, drot };
}

export interface RenderOptions {
  edits: EditDocument;
  bypassEdits?: boolean;
  clipProgress?: number;
  clipTime?: number;
  clipDuration?: number;
  globalTime?: number;
  enableKenBurns?: boolean;
  transitionIn?: TransitionType;
  transitionDuration?: number;
  velocityPreset?: VelocityPresetId;
  clipKeyframes?: ClipKeyframe[];
  clipKeyframeEasing?: KeyframeEasing;
  globalOverlays?: TimelineOverlayItem[];
  overlayVideos?: Record<string, HTMLVideoElement>;
  showDrawnGuide?: boolean;
  onAsyncMatteReady?: () => void;
}

export interface HistogramData {
  r: number[];
  g: number[];
  b: number[];
  luma: number[];
}

export function getSourceDimensions(source: HTMLImageElement | HTMLVideoElement): { w: number; h: number } {
  if (source instanceof HTMLVideoElement) {
    return { w: source.videoWidth || 1280, h: source.videoHeight || 720 };
  }
  return { w: source.naturalWidth || 1280, h: source.naturalHeight || 720 };
}

export function computeTargetDimensions(
  sourceW: number,
  sourceH: number,
  edits: EditDocument,
  maxDimension: number,
  overrideAspectRatio?: number | null
): { width: number; height: number } {
  const { crop, rotation, aspectRatio } = edits.transform;
  const isRotatedOdd = rotation === 90 || rotation === 270;
  const baseW = isRotatedOdd ? sourceH : sourceW;
  const baseH = isRotatedOdd ? sourceW : sourceH;

  const croppedW = Math.max(16, baseW * crop.width);
  const croppedH = Math.max(16, baseH * crop.height);

  let effectiveRatio = croppedW / croppedH;

  if (overrideAspectRatio && overrideAspectRatio > 0) {
    effectiveRatio = overrideAspectRatio;
  } else if (aspectRatio !== 'original') {
    const found = ASPECT_RATIO_OPTIONS.find((o) => o.id === aspectRatio);
    if (found && found.ratio) {
      effectiveRatio = found.ratio;
    }
  }

  let outW: number;
  let outH: number;

  if (effectiveRatio >= 1) {
    outW = Math.min(maxDimension, Math.max(360, Math.round(croppedW)));
    if (outW > maxDimension) outW = maxDimension;
    outH = Math.round(outW / effectiveRatio);
    if (outH > maxDimension) {
      outH = maxDimension;
      outW = Math.round(outH * effectiveRatio);
    }
  } else {
    outH = Math.min(maxDimension, Math.max(360, Math.round(croppedH)));
    if (outH > maxDimension) outH = maxDimension;
    outW = Math.round(outH * effectiveRatio);
    if (outW > maxDimension) {
      outW = maxDimension;
      outH = Math.round(outW / effectiveRatio);
    }
  }

  outW = Math.max(2, outW - (outW % 2));
  outH = Math.max(2, outH - (outH % 2));
  return { width: outW, height: outH };
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - clamp(t, 0, 1), 3);
}

export function applyEasing(t: number, easing: KeyframeEasing): number {
  const x = clamp(t, 0, 1);
  if (easing === 'linear') return x;
  if (easing === 'ease-out') return 1 - Math.pow(1 - x, 3);
  if (easing === 'ease-in-out') {
    return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
  }
  if (easing === 'bounce') {
    const n1 = 7.5625;
    const d1 = 2.75;
    if (x < 1 / d1) return n1 * x * x;
    if (x < 2 / d1) {
      const k = x - 1.5 / d1;
      return n1 * k * k + 0.75;
    }
    if (x < 2.5 / d1) {
      const k = x - 2.25 / d1;
      return n1 * k * k + 0.9375;
    }
    const k = x - 2.625 / d1;
    return n1 * k * k + 0.984375;
  }
  // punch (snappy exponential curve)
  return x === 1 ? 1 : 1 - Math.pow(2, -9 * x);
}

export function applyVelocityCurve(progress01: number, preset: VelocityPresetId): number {
  const p = clamp(progress01, 0, 1);
  if (preset === 'linear') return p;
  if (preset === 'hero-time') {
    return p + 0.14 * Math.sin(2 * Math.PI * p);
  }
  if (preset === 'bullet-ramp') {
    return Math.pow(p, 1.85);
  }
  if (preset === 'flash-in') {
    return 1 - Math.pow(1 - p, 2.2);
  }
  if (preset === 'montage-pulse') {
    return clamp(p + 0.08 * Math.sin(4 * Math.PI * p), 0, 1);
  }
  return p;
}

export interface EvaluatedOverlayState {
  x: number;
  y: number;
  scale: number;
  rotation: number;
  opacity: number;
  tiltX: number;
  tiltY: number;
  scaleX: number;
  scaleY: number;
  shadowDepth: number;
  glowIntensity: number;
  effectIntensity: number;
  charPhase: number;
}

export function evaluateOverlayAtTime(
  item: TimelineOverlayItem,
  localTime: number
): EvaluatedOverlayState {
  const baseTiltX = item.text3d?.tiltX ?? 0;
  const baseTiltY = item.text3d?.tiltY ?? 0;
  const baseScaleX = item.text3d?.scaleX ?? 1;
  const baseScaleY = item.text3d?.scaleY ?? 1;
  const baseShadowDepth = item.text3d?.depth ?? DEFAULT_TEXT_3D.depth;
  const baseGlow = item.text3d?.glowIntensity ?? 0;

  const kfs = item.keyframes;
  if (!kfs || kfs.length === 0) {
    return {
      x: item.x,
      y: item.y,
      scale: item.scale,
      rotation: item.rotation,
      opacity: item.opacity,
      tiltX: baseTiltX,
      tiltY: baseTiltY,
      scaleX: baseScaleX,
      scaleY: baseScaleY,
      shadowDepth: baseShadowDepth,
      glowIntensity: baseGlow,
      effectIntensity: 100,
      charPhase: 100,
    };
  }

  const pick = (kf: TimelineOverlayItem['keyframes'][number]): EvaluatedOverlayState => ({
    x: kf.x,
    y: kf.y,
    scale: kf.scale,
    rotation: kf.rotation,
    opacity: kf.opacity,
    tiltX: kf.tiltX ?? baseTiltX,
    tiltY: kf.tiltY ?? baseTiltY,
    scaleX: kf.scaleX ?? baseScaleX,
    scaleY: kf.scaleY ?? baseScaleY,
    shadowDepth: kf.shadowDepth ?? baseShadowDepth,
    glowIntensity: kf.glowIntensity ?? baseGlow,
    effectIntensity: kf.effectIntensity ?? 100,
    charPhase: kf.charPhase ?? 100,
  });

  const sorted = [...kfs].sort((a, b) => a.time - b.time);
  if (localTime <= sorted[0].time) {
    return pick(sorted[0]);
  }
  const last = sorted[sorted.length - 1];
  if (localTime >= last.time) {
    return pick(last);
  }

  for (let i = 0; i < sorted.length - 1; i++) {
    const a = pick(sorted[i]);
    const b = pick(sorted[i + 1]);
    if (localTime >= sorted[i].time && localTime <= sorted[i + 1].time) {
      const span = Math.max(0.001, sorted[i + 1].time - sorted[i].time);
      const t = applyEasing((localTime - sorted[i].time) / span, item.easing || 'ease-in-out');
      return {
        x: a.x + (b.x - a.x) * t,
        y: a.y + (b.y - a.y) * t,
        scale: a.scale + (b.scale - a.scale) * t,
        rotation: a.rotation + (b.rotation - a.rotation) * t,
        opacity: a.opacity + (b.opacity - a.opacity) * t,
        tiltX: a.tiltX + (b.tiltX - a.tiltX) * t,
        tiltY: a.tiltY + (b.tiltY - a.tiltY) * t,
        scaleX: a.scaleX + (b.scaleX - a.scaleX) * t,
        scaleY: a.scaleY + (b.scaleY - a.scaleY) * t,
        shadowDepth: a.shadowDepth + (b.shadowDepth - a.shadowDepth) * t,
        glowIntensity: a.glowIntensity + (b.glowIntensity - a.glowIntensity) * t,
        effectIntensity: a.effectIntensity + (b.effectIntensity - a.effectIntensity) * t,
        charPhase: a.charPhase + (b.charPhase - a.charPhase) * t,
      };
    }
  }

  return {
    x: item.x,
    y: item.y,
    scale: item.scale,
    rotation: item.rotation,
    opacity: item.opacity,
    tiltX: baseTiltX,
    tiltY: baseTiltY,
    scaleX: baseScaleX,
    scaleY: baseScaleY,
    shadowDepth: baseShadowDepth,
    glowIntensity: baseGlow,
    effectIntensity: 100,
    charPhase: 100,
  };
}

export function evaluateClipKeyframes(
  keyframes: ClipKeyframe[] | undefined,
  easing: KeyframeEasing,
  localTime: number
): { scale: number; offsetX: number; offsetY: number; rotation: number } {
  if (!keyframes || keyframes.length === 0) {
    return { scale: 1, offsetX: 0, offsetY: 0, rotation: 0 };
  }
  const sorted = [...keyframes].sort((a, b) => a.time - b.time);
  if (localTime <= sorted[0].time) {
    return {
      scale: sorted[0].scale,
      offsetX: sorted[0].offsetX,
      offsetY: sorted[0].offsetY,
      rotation: sorted[0].rotation,
    };
  }
  const last = sorted[sorted.length - 1];
  if (localTime >= last.time) {
    return {
      scale: last.scale,
      offsetX: last.offsetX,
      offsetY: last.offsetY,
      rotation: last.rotation,
    };
  }
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i];
    const b = sorted[i + 1];
    if (localTime >= a.time && localTime <= b.time) {
      const span = Math.max(0.001, b.time - a.time);
      const t = applyEasing((localTime - a.time) / span, easing);
      return {
        scale: a.scale + (b.scale - a.scale) * t,
        offsetX: a.offsetX + (b.offsetX - a.offsetX) * t,
        offsetY: a.offsetY + (b.offsetY - a.offsetY) * t,
        rotation: a.rotation + (b.rotation - a.rotation) * t,
      };
    }
  }
  return { scale: 1, offsetX: 0, offsetY: 0, rotation: 0 };
}

function resolveFontCss(family: FontFamilyId): string {
  return resolveFontCssFamily(family);
}

export function renderFrameToCanvas(
  canvas: HTMLCanvasElement,
  source: HTMLImageElement | HTMLVideoElement | null,
  options: RenderOptions
): void {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return;

  const {
    edits,
    bypassEdits = false,
    clipProgress = 0,
    clipTime = 0,
    clipDuration = 4,
    globalTime = 0,
    enableKenBurns = false,
    transitionIn = 'cut',
    transitionDuration = 0.4,
    velocityPreset = 'linear',
    clipKeyframes = [],
    clipKeyframeEasing = 'ease-out',
    globalOverlays = [],
    overlayVideos = {},
    showDrawnGuide = false,
    onAsyncMatteReady,
  } = options;

  const outW = canvas.width;
  const outH = canvas.height;
  if (outW <= 0 || outH <= 0) return;

  ctx.save();
  ctx.clearRect(0, 0, outW, outH);

  const bgMode = edits.transform.bgMode;
  ctx.fillStyle = bgMode === 'slate' ? '#18181b' : '#09090b';
  ctx.fillRect(0, 0, outW, outH);

  if (!source) {
    ctx.restore();
    if (!bypassEdits && globalOverlays.length > 0) {
      const renderStandaloneOverlayPass = (targetLayer: OverlayLayerOrder) => {
        for (const item of globalOverlays) {
          const layer = item.layerOrder || 'front';
          if (layer !== targetLayer) continue;
          if (globalTime < item.startTime || globalTime > item.startTime + item.duration) continue;
          const localElapsed = globalTime - item.startTime;
          const evaluated = evaluateOverlayAtTime(item, localElapsed);

          let ovOpacity = evaluated.opacity;
          let ovScale = evaluated.scale;
          let ovOffsetY = 0;

          const inDur = Math.min(0.28, item.duration * 0.35);
          if (localElapsed < inDur && item.animationIn && item.animationIn !== 'none') {
            const t = easeOutCubic(localElapsed / Math.max(0.04, inDur));
            if (item.animationIn === 'fade') ovOpacity *= t;
            else if (item.animationIn === 'pop') ovScale *= 0.6 + 0.4 * t;
            else if (item.animationIn === 'slide-up') {
              ovOpacity *= t;
              ovOffsetY = (1 - t) * 28;
            }
          }

          if (item.kind === 'visual' && item.visualOverlayId) {
            drawVisualOverlayEffect(ctx, outW, outH, {
              presetId: item.visualOverlayId,
              blendMode: item.blendMode || 'screen',
              opacity: ovOpacity,
              x: evaluated.x,
              y: evaluated.y + ovOffsetY / outH,
              scale: ovScale,
              rotation: evaluated.rotation,
              globalTime,
            });
          } else if (item.kind === 'image' && item.overlaySrc) {
            drawImageOverlayItem(ctx, outW, outH, {
              src: item.overlaySrc,
              blendMode: item.blendMode || 'normal',
              opacity: ovOpacity,
              x: evaluated.x,
              y: evaluated.y + ovOffsetY / outH,
              scale: ovScale,
              rotation: evaluated.rotation,
            });
          } else if (item.kind === 'video') {
            const vid = overlayVideos[item.id] || (item.overlayAssetId ? overlayVideos[item.overlayAssetId] : undefined);
            if (vid) {
              drawVideoOverlayItem(ctx, outW, outH, vid, {
                blendMode: item.blendMode || 'normal',
                opacity: ovOpacity,
                x: evaluated.x,
                y: evaluated.y + ovOffsetY / outH,
                scale: ovScale,
                rotation: evaluated.rotation,
                bgRemoval: item.bgRemoval,
                onAsyncMatteReady,
              });
            }
          } else if (item.kind === 'mask' && item.maskShape) {
            drawMaskOverlayItem(ctx, outW, outH, {
              shape: item.maskShape,
              x: evaluated.x,
              y: evaluated.y + ovOffsetY / outH,
              width: (item.maskWidth ?? 0.48) * ovScale,
              height: (item.maskHeight ?? 0.48) * ovScale,
              rotation: evaluated.rotation,
              feather: item.maskFeather ?? 16,
              color: item.maskColor || '#050507',
              opacity: ovOpacity,
              border: Boolean(item.maskBorder),
            });
          } else if (item.kind === 'text' && item.text?.trim()) {
            const hasKfs = item.keyframes && item.keyframes.length > 0;
            const baseEffects = item.text3d ? { ...item.text3d } : undefined;
            const animatedEffects = baseEffects
              ? {
                  ...baseEffects,
                  tiltX: hasKfs ? evaluated.tiltX : baseEffects.tiltX,
                  tiltY: hasKfs ? evaluated.tiltY : baseEffects.tiltY,
                  scaleX: evaluated.scaleX,
                  scaleY: evaluated.scaleY,
                  depth: hasKfs ? evaluated.shadowDepth : baseEffects.depth,
                  glowIntensity: hasKfs ? evaluated.glowIntensity : baseEffects.glowIntensity,
                }
              : evaluated.scaleX !== 1 ||
                  evaluated.scaleY !== 1 ||
                  evaluated.tiltX !== 0 ||
                  evaluated.tiltY !== 0
                ? {
                    ...DEFAULT_TEXT_3D,
                    enabled: false,
                    tiltX: evaluated.tiltX,
                    tiltY: evaluated.tiltY,
                    scaleX: evaluated.scaleX,
                    scaleY: evaluated.scaleY,
                  }
                : undefined;
            const wig = computeAeWiggle(globalTime, item.wiggleAmp, item.wiggleFreq, 11);
            drawStyledText(ctx, outW, outH, {
              text: item.text,
              x: evaluated.x + wig.dx,
              y: evaluated.y + wig.dy,
              fontSize: item.fontSize || 46,
              fontFamily: item.fontFamily || 'oswald',
              letterSpacing: item.letterSpacing ?? 0,
              color: item.color || '#ffffff',
              backdrop: item.backdrop ?? false,
              styleTemplate: item.styleTemplate || 'bold-kinetic',
              text3d: animatedEffects,
              blendMode: item.blendMode || 'normal',
              localTime: localElapsed,
              duration: item.duration,
              effectIntensity: hasKfs ? evaluated.effectIntensity / 100 : 1,
              charPhaseOverride: hasKfs ? evaluated.charPhase / 100 : undefined,
              opacity: ovOpacity,
              scale: ovScale,
              rotation: evaluated.rotation + wig.drot,
              offsetY: ovOffsetY,
            });
          } else if (item.kind === 'sticker' && item.stickerKind) {
            drawVectorSticker(ctx, outW, outH, item.stickerKind, {
              x: evaluated.x,
              y: evaluated.y,
              scale: ovScale,
              rotation: evaluated.rotation,
              opacity: ovOpacity,
              globalTime,
            });
          }
        }
      };
      renderStandaloneOverlayPass('behind');
      renderStandaloneOverlayPass('front');
    }
    return;
  }

  const { w: srcW, h: srcH } = getSourceDimensions(source);
  if (srcW <= 0 || srcH <= 0) {
    ctx.restore();
    return;
  }

  const { crop, rotation, straighten, flipH, flipV, kenBurns, fitMode } = edits.transform;
  const sx = bypassEdits ? 0 : clamp(crop.x, 0, 0.95) * srcW;
  const sy = bypassEdits ? 0 : clamp(crop.y, 0, 0.95) * srcH;
  const sw = bypassEdits ? srcW : clamp(crop.width, 0.05, 1) * srcW;
  const sh = bypassEdits ? srcH : clamp(crop.height, 0.05, 1) * srcH;

  if (!bypassEdits && bgMode === 'blur') {
    ctx.save();
    ctx.filter = 'blur(26px) brightness(0.55) saturate(1.15)';
    const bgRatio = sw / sh;
    const outRatio = outW / outH;
    let bgW: number;
    let bgH: number;
    if (bgRatio > outRatio) {
      bgH = outH * 1.15;
      bgW = bgH * bgRatio;
    } else {
      bgW = outW * 1.15;
      bgH = bgW / bgRatio;
    }
    ctx.drawImage(source, sx, sy, sw, sh, (outW - bgW) / 2, (outH - bgH) / 2, bgW, bgH);
    ctx.filter = 'none';
    ctx.restore();
  }

  let transAlpha = 1;
  let transOffsetX = 0;
  let transScale = 1;
  let wipeFraction = 1;
  let flashOverlayAlpha = 0;
  let glitchShift = 0;

  if (!bypassEdits && enableKenBurns && transitionIn !== 'cut' && clipTime < transitionDuration) {
    const t = easeOutCubic(clipTime / Math.max(0.05, transitionDuration));
    if (transitionIn === 'dissolve' || transitionIn === 'fade') {
      transAlpha = t;
    } else if (transitionIn === 'slide-left') {
      transOffsetX = (1 - t) * outW;
    } else if (transitionIn === 'wipe-right') {
      wipeFraction = t;
    } else if (transitionIn === 'zoom') {
      transScale = 1.45 - 0.45 * t;
      transAlpha = t;
    } else if (transitionIn === 'whip-flash') {
      transScale = 1.25 - 0.25 * t;
      flashOverlayAlpha = Math.max(0, (1 - t) * 0.85);
    } else if (transitionIn === 'glitch') {
      glitchShift = Math.sin(clipTime * 95) * (1 - t) * 28;
      transScale = 1 + (1 - t) * 0.08;
    }
  }

  if (!bypassEdits && enableKenBurns && edits.effects.flashIn && clipTime < 0.22) {
    flashOverlayAlpha = Math.max(flashOverlayAlpha, (1 - clipTime / 0.22) * 0.78);
  }

  // Kinetic camera shake
  let shakeX = 0;
  let shakeY = 0;
  let shakeRot = 0;
  if (!bypassEdits && enableKenBurns && edits.effects.shake > 0) {
    const s = edits.effects.shake / 100;
    shakeX = Math.sin(globalTime * 42) * s * outW * 0.018;
    shakeY = Math.cos(globalTime * 37) * s * outH * 0.018;
    shakeRot = Math.sin(globalTime * 29) * s * 2.2;
  }

  // Clip Keyframe Interpolation
  const clipKf =
    !bypassEdits && enableKenBurns
      ? evaluateClipKeyframes(clipKeyframes, clipKeyframeEasing, clipTime)
      : { scale: 1, offsetX: 0, offsetY: 0, rotation: 0 };

  let animAlpha = 1;
  let animScale = 1;
  let animOffsetX = 0;

  if (!bypassEdits && enableKenBurns) {
    const { inType, outType, inDuration, outDuration } = edits.animation;
    if (inType !== 'none' && clipTime < inDuration) {
      const t = easeOutCubic(clipTime / Math.max(0.05, inDuration));
      if (inType === 'fade') animAlpha *= t;
      else if (inType === 'zoom-in') animScale *= 0.76 + 0.24 * t;
      else if (inType === 'zoom-out') animScale *= 1.3 - 0.3 * t;
      else if (inType === 'slide-left') animOffsetX += (1 - t) * outW * 0.45;
      else if (inType === 'slide-right') animOffsetX -= (1 - t) * outW * 0.45;
    }
    const remaining = clipDuration - clipTime;
    if (outType !== 'none' && remaining < outDuration && remaining >= 0) {
      const t = easeOutCubic(remaining / Math.max(0.05, outDuration));
      if (outType === 'fade') animAlpha *= t;
      else if (outType === 'zoom-in') animScale *= 1 + 0.24 * (1 - t);
      else if (outType === 'zoom-out') animScale *= 0.82 + 0.18 * t;
      else if (outType === 'slide-left') animOffsetX -= (1 - t) * outW * 0.45;
      else if (outType === 'slide-right') animOffsetX += (1 - t) * outW * 0.45;
    }
  }

  // Helper to apply clip transforms & draw source or matte canvas into a target 2D context
  const drawTransformedLayer = (
    targetCtx: CanvasRenderingContext2D,
    layerEl: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement,
    extraFilter?: string,
    skipEffectsBlur = false
  ) => {
    const layerDims =
      layerEl instanceof HTMLCanvasElement
        ? { w: layerEl.width, h: layerEl.height }
        : getSourceDimensions(layerEl);
    const lW = Math.max(1, layerDims.w);
    const lH = Math.max(1, layerDims.h);
    const lx = bypassEdits ? 0 : clamp(crop.x, 0, 0.95) * lW;
    const ly = bypassEdits ? 0 : clamp(crop.y, 0, 0.95) * lH;
    const lw = bypassEdits ? lW : clamp(crop.width, 0.05, 1) * lW;
    const lh = bypassEdits ? lH : clamp(crop.height, 0.05, 1) * lH;

    targetCtx.save();
    if (wipeFraction < 1) {
      targetCtx.beginPath();
      targetCtx.rect(0, 0, outW * wipeFraction, outH);
      targetCtx.clip();
    }

    targetCtx.globalAlpha = clamp(transAlpha * animAlpha, 0, 1);

    const blurFilter =
      !bypassEdits && !skipEffectsBlur && edits.effects.blur > 0
        ? `blur(${edits.effects.blur.toFixed(1)}px)`
        : '';
    const combinedFilter = [blurFilter, extraFilter].filter(Boolean).join(' ');
    if (combinedFilter) {
      targetCtx.filter = combinedFilter;
    }

    targetCtx.translate(
      outW / 2 + transOffsetX + animOffsetX + shakeX + glitchShift + clipKf.offsetX * outW,
      outH / 2 + shakeY + clipKf.offsetY * outH
    );
    targetCtx.scale(transScale * animScale * clipKf.scale, transScale * animScale * clipKf.scale);

    if (!bypassEdits) {
      const totalRad = ((rotation + straighten + shakeRot + clipKf.rotation) * Math.PI) / 180;
      targetCtx.rotate(totalRad);
      targetCtx.scale(flipH ? -1 : 1, flipV ? -1 : 1);

      if (Math.abs(straighten) > 0.1) {
        const rad = (Math.abs(straighten) * Math.PI) / 180;
        const straightenScale = Math.cos(rad) + Math.sin(rad) * Math.max(outW / outH, outH / outW);
        targetCtx.scale(straightenScale, straightenScale);
      }

      if (edits.effects.shake > 0) {
        const sZoom = 1 + (edits.effects.shake / 100) * 0.06;
        targetCtx.scale(sZoom, sZoom);
      }

      if (enableKenBurns && kenBurns !== 'none') {
        const p = applyVelocityCurve(clipProgress, velocityPreset);
        if (kenBurns === 'zoom-in') {
          const s = 1 + 0.14 * p;
          targetCtx.scale(s, s);
        } else if (kenBurns === 'zoom-out') {
          const s = 1.14 - 0.14 * p;
          targetCtx.scale(s, s);
        } else if (kenBurns === 'pan-right') {
          targetCtx.scale(1.14, 1.14);
          const shiftX = (0.5 - p) * outW * 0.09;
          targetCtx.translate(shiftX, 0);
        }
      }
    }

    const isRotatedOdd = !bypassEdits && (rotation === 90 || rotation === 270);
    const drawTargetW = isRotatedOdd ? outH : outW;
    const drawTargetH = isRotatedOdd ? outW : outH;

    const cropRatio = sw / sh;
    const targetRatio = drawTargetW / drawTargetH;

    let drawW: number;
    let drawH: number;
    if (fitMode === 'contain' && !bypassEdits) {
      if (cropRatio > targetRatio) {
        drawW = drawTargetW;
        drawH = drawW / cropRatio;
      } else {
        drawH = drawTargetH;
        drawW = drawH * cropRatio;
      }
    } else {
      if (cropRatio > targetRatio) {
        drawH = drawTargetH;
        drawW = drawH * cropRatio;
      } else {
        drawW = drawTargetW;
        drawH = drawW / cropRatio;
      }
    }

    let mappedFromStage: ((sx: number, sy: number) => { x: number; y: number }) | null = null;
    if (layerEl === source && !skipEffectsBlur) {
      const mat = targetCtx.getTransform();
      const cX = bypassEdits ? 0 : clamp(crop.x, 0, 0.95);
      const cY = bypassEdits ? 0 : clamp(crop.y, 0, 0.95);
      const cW = bypassEdits ? 1 : clamp(crop.width, 0.05, 1);
      const cH = bypassEdits ? 1 : clamp(crop.height, 0.05, 1);
      mappedFromStage = (stageNormX: number, stageNormY: number) => {
        try {
          const inv = mat.inverse();
          const pt = inv.transformPoint(new DOMPoint(stageNormX * outW, stageNormY * outH));
          const u = (pt.x + drawW / 2) / Math.max(1, drawW);
          const v = (pt.y + drawH / 2) / Math.max(1, drawH);
          return {
            x: clamp(cX + u * cW, 0, 1),
            y: clamp(cY + v * cH, 0, 1),
          };
        } catch {
          return { x: stageNormX, y: stageNormY };
        }
      };
    }

    targetCtx.drawImage(layerEl, lx, ly, lw, lh, -drawW / 2, -drawH / 2, drawW, drawH);
    targetCtx.filter = 'none';
    targetCtx.restore();
    return mappedFromStage;
  };

  let mapStagePointToSource: ((sx: number, sy: number) => { x: number; y: number }) | null = null;
  const drawTransformedSource = (targetCtx: CanvasRenderingContext2D, extraFilter?: string) => {
    const mapper = drawTransformedLayer(targetCtx, source, extraFilter, false);
    if (mapper) mapStagePointToSource = mapper;
  };

  const activeMask = !bypassEdits ? edits.mask || DEFAULT_MASK : DEFAULT_MASK;
  const hasClipMask = !bypassEdits && activeMask.shape !== 'none';
  const activeBgRemoval = !bypassEdits ? edits.bgRemoval || DEFAULT_BG_REMOVAL : DEFAULT_BG_REMOVAL;
  const hasBgRemoval = !bypassEdits && activeBgRemoval.enabled;

  // If masked (without BG removal) with an outer reveal mode, draw outer background layer first
  if (hasClipMask && !hasBgRemoval) {
    if (activeMask.bgEffect === 'blur') {
      drawTransformedSource(ctx, 'blur(18px) brightness(0.58) saturate(1.1)');
    } else if (activeMask.bgEffect === 'dim') {
      drawTransformedSource(ctx, 'brightness(0.32) saturate(0.75)');
    } else if (activeMask.bgEffect === 'original') {
      drawTransformedSource(ctx);
    }
  }

  const c = edits.color;
  const e = edits.effects;
  const effectiveChromatic = !bypassEdits ? Math.max(e.chromatic, Math.abs(glitchShift) * 2.4) : 0;
  const effPosterize = !bypassEdits ? e.posterize || 0 : 0;
  const effDuotone: DuotoneMapId = !bypassEdits ? e.duotone || 'none' : 'none';

  // Fast GPU filter path when only exposure / contrast / saturation are active
  const canUseGpuColorFilter =
    !bypassEdits &&
    c.highlights === 0 &&
    c.shadows === 0 &&
    c.temperature === 0 &&
    c.tint === 0 &&
    c.fade === 0 &&
    e.grain === 0 &&
    e.sharpen === 0 &&
    effPosterize === 0 &&
    effDuotone === 'none' &&
    effectiveChromatic === 0;

  let gpuColorFilter = '';
  if (canUseGpuColorFilter) {
    const parts: string[] = [];
    if (c.exposure !== 0) {
      parts.push(`brightness(${Math.pow(2, c.exposure / 65).toFixed(3)})`);
    }
    if (c.contrast !== 0) {
      parts.push(`contrast(${((100 + c.contrast * 0.85) / 100).toFixed(3)})`);
    }
    if (c.saturation !== 0) {
      parts.push(`saturate(${Math.max(0, 1 + c.saturation / 100).toFixed(3)})`);
    }
    gpuColorFilter = parts.join(' ');
  }

  // Target foreground context: if masked or BG-removed, render graded layer to scratch canvas then composite
  const useFgScratch = hasClipMask || hasBgRemoval;
  const fgCanvas = useFgScratch ? getScratchCanvas('maskFg', outW, outH) : canvas;
  const fgCtx = useFgScratch
    ? fgCanvas.getContext('2d', { willReadFrequently: true }) || ctx
    : ctx;

  if (useFgScratch) {
    fgCtx.clearRect(0, 0, outW, outH);
  }

  drawTransformedSource(fgCtx, gpuColorFilter || undefined);
  ctx.restore();

  if (!bypassEdits) {
    const needsPixelPass =
      !canUseGpuColorFilter &&
      (c.exposure !== 0 ||
        c.contrast !== 0 ||
        c.highlights !== 0 ||
        c.shadows !== 0 ||
        c.temperature !== 0 ||
        c.tint !== 0 ||
        c.saturation !== 0 ||
        c.fade !== 0 ||
        e.grain > 0 ||
        effPosterize > 0 ||
        effDuotone !== 'none' ||
        effectiveChromatic > 0);

    if (needsPixelPass) {
      applyPixelGrade(fgCtx, outW, outH, edits, effectiveChromatic);
    }

    if (e.sharpen > 0) {
      applySharpen(fgCtx, outW, outH, e.sharpen / 100);
    }

    // AE Mirror / Quad Kaleidoscope Tile
    if (e.mirrorTile && e.mirrorTile !== 'none') {
      const mSrc = getScratchCanvas('aeMirrorSrc', outW, outH);
      const msCtx = mSrc.getContext('2d');
      if (msCtx) {
        msCtx.clearRect(0, 0, outW, outH);
        msCtx.drawImage(fgCanvas, 0, 0, outW, outH);
        const halfW = outW * 0.5;
        const halfH = outH * 0.5;
        fgCtx.save();
        if (e.mirrorTile === 'mirror-h') {
          fgCtx.clearRect(halfW, 0, halfW, outH);
          fgCtx.translate(outW, 0);
          fgCtx.scale(-1, 1);
          fgCtx.drawImage(mSrc, 0, 0, halfW, outH, 0, 0, halfW, outH);
        } else if (e.mirrorTile === 'quad') {
          fgCtx.clearRect(0, 0, outW, outH);
          fgCtx.drawImage(mSrc, 0, 0, halfW, halfH, 0, 0, halfW, halfH);
          fgCtx.save();
          fgCtx.translate(outW, 0);
          fgCtx.scale(-1, 1);
          fgCtx.drawImage(mSrc, 0, 0, halfW, halfH, 0, 0, halfW, halfH);
          fgCtx.restore();
          fgCtx.save();
          fgCtx.translate(0, outH);
          fgCtx.scale(1, -1);
          fgCtx.drawImage(mSrc, 0, 0, halfW, halfH, 0, 0, halfW, halfH);
          fgCtx.restore();
          fgCtx.save();
          fgCtx.translate(outW, outH);
          fgCtx.scale(-1, -1);
          fgCtx.drawImage(mSrc, 0, 0, halfW, halfH, 0, 0, halfW, halfH);
          fgCtx.restore();
        }
        fgCtx.restore();
      }
    }

    // AE Mosaic / Pixelate
    if ((e.pixelate || 0) > 0) {
      const pStrength = clamp((e.pixelate || 0) / 100, 0, 1);
      const blockPx = Math.max(2, 2 + pStrength * Math.min(outW, outH) * 0.055);
      const pw = Math.max(8, Math.round(outW / blockPx));
      const ph = Math.max(8, Math.round(outH / blockPx));
      const pScratch = getScratchCanvas('aePixelate', pw, ph);
      const pCtx = pScratch.getContext('2d');
      if (pCtx) {
        pCtx.clearRect(0, 0, pw, ph);
        pCtx.drawImage(fgCanvas, 0, 0, pw, ph);
        fgCtx.save();
        fgCtx.imageSmoothingEnabled = false;
        fgCtx.clearRect(0, 0, outW, outH);
        fgCtx.drawImage(pScratch, 0, 0, pw, ph, 0, 0, outW, outH);
        fgCtx.restore();
      }
    }

    // AE Directional Motion Blur
    if ((e.motionBlur || 0) > 0) {
      const mb = clamp((e.motionBlur || 0) / 100, 0, 1);
      const mbSrc = getScratchCanvas('aeMotionBlur', outW, outH);
      const mbCtx = mbSrc.getContext('2d');
      if (mbCtx) {
        mbCtx.clearRect(0, 0, outW, outH);
        mbCtx.drawImage(fgCanvas, 0, 0, outW, outH);
        const maxShift = mb * outW * 0.048;
        const taps = [-3, -2, -1, 1, 2, 3];
        fgCtx.save();
        fgCtx.globalAlpha = 0.22;
        for (const t of taps) {
          const ox = (t / 3) * maxShift;
          const oy = ox * 0.14;
          fgCtx.drawImage(mbSrc, ox, oy);
        }
        fgCtx.restore();
      }
    }

    // AE CC Radial Zoom Blur
    if ((e.radialBlur || 0) > 0) {
      const rb = clamp((e.radialBlur || 0) / 100, 0, 1);
      const rbSrc = getScratchCanvas('aeRadialBlur', outW, outH);
      const rbCtx = rbSrc.getContext('2d');
      if (rbCtx) {
        rbCtx.clearRect(0, 0, outW, outH);
        rbCtx.drawImage(fgCanvas, 0, 0, outW, outH);
        fgCtx.save();
        const steps = 6;
        for (let i = 1; i <= steps; i++) {
          const z = 1 + (i / steps) * rb * 0.22;
          fgCtx.save();
          fgCtx.globalAlpha = 0.24 * (1 - (i - 1) / (steps + 1));
          fgCtx.translate(outW * 0.5, outH * 0.5);
          fgCtx.scale(z, z);
          fgCtx.drawImage(rbSrc, -outW * 0.5, -outH * 0.5, outW, outH);
          fgCtx.restore();
        }
        fgCtx.restore();
      }
    }

    // AE Deep Glow / Highlight Bloom
    if ((e.glowBloom || 0) > 0) {
      const gb = clamp((e.glowBloom || 0) / 100, 0, 1);
      const bw = Math.max(64, Math.round(outW * 0.28));
      const bh = Math.max(64, Math.round(outH * 0.28));
      const bloomCanvas = getScratchCanvas('aeDeepGlow', bw, bh);
      const bCtx = bloomCanvas.getContext('2d');
      if (bCtx) {
        bCtx.clearRect(0, 0, bw, bh);
        bCtx.save();
        const blurPx = 4 + gb * 18;
        bCtx.filter = `contrast(1.65) brightness(1.08) blur(${blurPx.toFixed(1)}px)`;
        bCtx.drawImage(fgCanvas, 0, 0, bw, bh);
        bCtx.filter = 'none';
        bCtx.restore();
        fgCtx.save();
        fgCtx.globalCompositeOperation = 'screen';
        fgCtx.globalAlpha = clamp(gb * 0.85, 0, 0.92);
        fgCtx.drawImage(bloomCanvas, 0, 0, bw, bh, 0, 0, outW, outH);
        fgCtx.restore();
      }
    }

    // AE Digital Slice Glitch
    if ((e.glitch || 0) > 0) {
      const gl = clamp((e.glitch || 0) / 100, 0, 1);
      const glSrc = getScratchCanvas('aeGlitchSrc', outW, outH);
      const glCtx = glSrc.getContext('2d');
      if (glCtx) {
        glCtx.clearRect(0, 0, outW, outH);
        glCtx.drawImage(fgCanvas, 0, 0, outW, outH);
        let seed = (Math.floor(Math.max(0.2, globalTime) * 16) + 1) * 6151;
        const rand = () => {
          seed = (seed * 1664525 + 1013904223) >>> 0;
          return seed / 4294967296;
        };
        const sliceCount = 5 + Math.round(gl * 9);
        fgCtx.save();
        for (let s = 0; s < sliceCount; s++) {
          const sy = Math.floor(rand() * (outH - 12));
          const sh = Math.max(4, Math.floor((0.015 + rand() * 0.055) * outH));
          const dx = (rand() - 0.5) * 2 * gl * outW * 0.085;
          fgCtx.drawImage(glSrc, 0, sy, outW, sh, dx, sy, outW, sh);
          if (s % 2 === 0) {
            fgCtx.fillStyle = `rgba(56, 189, 248, ${(0.08 + gl * 0.14).toFixed(3)})`;
            fgCtx.fillRect(0, sy, outW, Math.max(2, sh * 0.25));
          } else {
            fgCtx.fillStyle = `rgba(244, 63, 94, ${(0.07 + gl * 0.12).toFixed(3)})`;
            fgCtx.fillRect(0, sy + sh * 0.5, outW, Math.max(2, sh * 0.2));
          }
        }
        fgCtx.restore();
      }
    }

    if (e.halation > 0) {
      const hStrength = clamp(e.halation / 100, 0, 1);
      fgCtx.save();
      fgCtx.globalCompositeOperation = 'screen';
      const grad = fgCtx.createRadialGradient(
        outW * 0.5,
        outH * 0.45,
        0,
        outW * 0.5,
        outH * 0.45,
        Math.max(outW, outH) * 0.65
      );
      grad.addColorStop(0, `rgba(255, 132, 66, ${(hStrength * 0.24).toFixed(3)})`);
      grad.addColorStop(1, 'rgba(255, 90, 40, 0)');
      fgCtx.fillStyle = grad;
      fgCtx.fillRect(0, 0, outW, outH);
      fgCtx.restore();
    }

    if (e.scanlines > 0) {
      const sAlpha = clamp(e.scanlines / 100, 0, 1) * 0.38;
      fgCtx.save();
      fgCtx.fillStyle = `rgba(0, 0, 0, ${sAlpha.toFixed(3)})`;
      for (let y = 0; y < outH; y += 4) {
        fgCtx.fillRect(0, y, outW, 1.5);
      }
      fgCtx.restore();
    }

    const renderOverlayPass = (targetLayer: OverlayLayerOrder) => {
      // Photo Lab / Clip visual & image overlays
      if (edits.visualOverlays && edits.visualOverlays.length > 0) {
        for (const vov of edits.visualOverlays) {
          const layer = vov.layerOrder || 'front';
          if (layer !== targetLayer) continue;
          if (vov.kind === 'visual' && vov.presetId) {
            drawVisualOverlayEffect(ctx, outW, outH, {
              presetId: vov.presetId,
              blendMode: vov.blendMode,
              opacity: vov.opacity,
              x: vov.x,
              y: vov.y,
              scale: vov.scale,
              rotation: vov.rotation,
              globalTime,
            });
          } else if (vov.kind === 'image' && vov.imageSrc) {
            drawImageOverlayItem(ctx, outW, outH, {
              src: vov.imageSrc,
              blendMode: vov.blendMode,
              opacity: vov.opacity,
              x: vov.x,
              y: vov.y,
              scale: vov.scale,
              rotation: vov.rotation,
              bgRemoval: vov.bgRemoval,
              onAsyncMatteReady,
            });
          }
        }
      }

      // Photo Lab local text overlays
      for (let pIdx = 0; pIdx < edits.overlays.length; pIdx++) {
        const ov = edits.overlays[pIdx];
        if (!ov.text.trim()) continue;
        const layer = ov.layerOrder || 'front';
        if (layer !== targetLayer) continue;
        const wig = computeAeWiggle(globalTime, ov.wiggleAmp, ov.wiggleFreq, pIdx + 3);
        drawStyledText(ctx, outW, outH, {
          text: ov.text,
          x: ov.x + wig.dx,
          y: ov.y + wig.dy,
          fontSize: ov.fontSize,
          fontFamily: ov.fontFamily,
          letterSpacing: ov.letterSpacing ?? 0,
          color: ov.color,
          backdrop: ov.backdrop,
          styleTemplate: ov.styleTemplate || 'clean',
          text3d: ov.text3d,
          opacity: ov.opacity ?? 1,
          scale: ov.scale ?? 1,
          rotation: (ov.rotation ?? 0) + wig.drot,
          offsetY: 0,
          blendMode: ov.blendMode || 'normal',
          localTime: globalTime,
          duration: 10,
        });
      }

      // Global Keyframed Track T1 Overlays
      for (let gIdx = 0; gIdx < globalOverlays.length; gIdx++) {
        const item = globalOverlays[gIdx];
        const layer = item.layerOrder || 'front';
        if (layer !== targetLayer) continue;
        if (globalTime < item.startTime || globalTime > item.startTime + item.duration) continue;
        const localElapsed = globalTime - item.startTime;
        const evaluated = evaluateOverlayAtTime(item, localElapsed);
        const wig = computeAeWiggle(globalTime, item.wiggleAmp, item.wiggleFreq, gIdx + 7);

        let ovOpacity = evaluated.opacity;
        let ovScale = evaluated.scale;
        let ovOffsetY = 0;

        const inDur = Math.min(0.28, item.duration * 0.35);
        if (localElapsed < inDur && item.animationIn && item.animationIn !== 'none') {
          const t = easeOutCubic(localElapsed / Math.max(0.04, inDur));
          if (item.animationIn === 'fade') ovOpacity *= t;
          else if (item.animationIn === 'pop') ovScale *= 0.6 + 0.4 * t;
          else if (item.animationIn === 'slide-up') {
            ovOpacity *= t;
            ovOffsetY = (1 - t) * 28;
          }
        }

        if (item.kind === 'visual' && item.visualOverlayId) {
          drawVisualOverlayEffect(ctx, outW, outH, {
            presetId: item.visualOverlayId,
            blendMode: item.blendMode || 'screen',
            opacity: ovOpacity,
            x: evaluated.x + wig.dx,
            y: evaluated.y + wig.dy + ovOffsetY / outH,
            scale: ovScale,
            rotation: evaluated.rotation + wig.drot,
            globalTime,
          });
        } else if (item.kind === 'image' && item.overlaySrc) {
          drawImageOverlayItem(ctx, outW, outH, {
            src: item.overlaySrc,
            blendMode: item.blendMode || 'normal',
            opacity: ovOpacity,
            x: evaluated.x + wig.dx,
            y: evaluated.y + wig.dy + ovOffsetY / outH,
            scale: ovScale,
            rotation: evaluated.rotation + wig.drot,
            bgRemoval: item.bgRemoval,
            onAsyncMatteReady,
          });
        } else if (item.kind === 'video') {
          const vid = overlayVideos[item.id] || (item.overlayAssetId ? overlayVideos[item.overlayAssetId] : undefined);
          if (vid) {
            drawVideoOverlayItem(ctx, outW, outH, vid, {
              blendMode: item.blendMode || 'normal',
              opacity: ovOpacity,
              x: evaluated.x + wig.dx,
              y: evaluated.y + wig.dy + ovOffsetY / outH,
              scale: ovScale,
              rotation: evaluated.rotation + wig.drot,
              bgRemoval: item.bgRemoval,
              onAsyncMatteReady,
            });
          }
        } else if (item.kind === 'mask' && item.maskShape) {
          drawMaskOverlayItem(ctx, outW, outH, {
            shape: item.maskShape,
            x: evaluated.x + wig.dx,
            y: evaluated.y + wig.dy + ovOffsetY / outH,
            width: (item.maskWidth ?? 0.48) * ovScale,
            height: (item.maskHeight ?? 0.48) * ovScale,
            rotation: evaluated.rotation + wig.drot,
            feather: item.maskFeather ?? 16,
            color: item.maskColor || '#050507',
            opacity: ovOpacity,
            border: Boolean(item.maskBorder),
          });
        } else if (item.kind === 'text' && item.text?.trim()) {
          const hasKfs = item.keyframes && item.keyframes.length > 0;
          const baseEffects = item.text3d ? { ...item.text3d } : undefined;
          const animatedEffects: Text3DSettings | undefined = baseEffects
            ? {
                ...baseEffects,
                tiltX: hasKfs ? evaluated.tiltX : baseEffects.tiltX,
                tiltY: hasKfs ? evaluated.tiltY : baseEffects.tiltY,
                scaleX: evaluated.scaleX,
                scaleY: evaluated.scaleY,
                depth: hasKfs ? evaluated.shadowDepth : baseEffects.depth,
                glowIntensity: hasKfs ? evaluated.glowIntensity : baseEffects.glowIntensity,
              }
            : evaluated.scaleX !== 1 ||
                evaluated.scaleY !== 1 ||
                evaluated.tiltX !== 0 ||
                evaluated.tiltY !== 0
              ? {
                  ...DEFAULT_TEXT_3D,
                  enabled: false,
                  tiltX: evaluated.tiltX,
                  tiltY: evaluated.tiltY,
                  scaleX: evaluated.scaleX,
                  scaleY: evaluated.scaleY,
                }
              : undefined;

          drawStyledText(ctx, outW, outH, {
            text: item.text,
            x: evaluated.x + wig.dx,
            y: evaluated.y + wig.dy,
            fontSize: item.fontSize || 46,
            fontFamily: item.fontFamily || 'oswald',
            letterSpacing: item.letterSpacing ?? 0,
            color: item.color || '#ffffff',
            backdrop: item.backdrop ?? false,
            styleTemplate: item.styleTemplate || 'bold-kinetic',
            text3d: animatedEffects,
            opacity: ovOpacity,
            scale: ovScale,
            rotation: evaluated.rotation + wig.drot,
            offsetY: ovOffsetY,
            blendMode: item.blendMode || 'normal',
            localTime: localElapsed,
            duration: item.duration,
            effectIntensity: hasKfs ? evaluated.effectIntensity / 100 : 1,
            charPhaseOverride: hasKfs ? evaluated.charPhase / 100 : undefined,
          });
        } else if (item.kind === 'sticker' && item.stickerKind) {
          drawVectorSticker(ctx, outW, outH, item.stickerKind, {
            x: evaluated.x + wig.dx,
            y: evaluated.y + wig.dy,
            scale: ovScale,
            rotation: evaluated.rotation + wig.drot,
            opacity: ovOpacity,
            globalTime,
          });
        }
      }
    };

    if (hasClipMask) {
      const maskCanvas = getScratchCanvas('clipMaskAlpha', outW, outH);
      const mCtx = maskCanvas.getContext('2d');
      if (mCtx) {
        mCtx.clearRect(0, 0, outW, outH);
        mCtx.save();
        if (activeMask.feather > 0) {
          const featherPx = (activeMask.feather / 100) * Math.min(outW, outH) * 0.14;
          mCtx.filter = `blur(${featherPx.toFixed(1)}px)`;
        }
        mCtx.fillStyle = '#ffffff';
        drawMaskShapePath(mCtx, activeMask.shape, outW, outH, {
          x: activeMask.x,
          y: activeMask.y,
          width: activeMask.width,
          height: activeMask.height,
          rotation: activeMask.rotation,
          cornerRadius: activeMask.cornerRadius,
        });
        mCtx.fill();
        mCtx.filter = 'none';
        mCtx.restore();

        fgCtx.save();
        fgCtx.globalCompositeOperation = activeMask.invert ? 'destination-out' : 'destination-in';
        fgCtx.drawImage(maskCanvas, 0, 0);
        fgCtx.restore();
      }
      if (!hasBgRemoval) {
        renderOverlayPass('behind');
        ctx.drawImage(fgCanvas, 0, 0);
      }
    }

    if (hasBgRemoval) {
      // 1. Render Backdrop Layer
      ctx.save();
      if (activeBgRemoval.backdropMode === 'transparent') {
        ctx.clearRect(0, 0, outW, outH);
      } else if (activeBgRemoval.backdropMode === 'original') {
        ctx.drawImage(fgCanvas, 0, 0);
      } else if (activeBgRemoval.backdropMode === 'blur') {
        const blurPx = Math.max(4, Math.round((activeBgRemoval.backdropBlur / 100) * 32));
        ctx.fillStyle = '#09090b';
        ctx.fillRect(0, 0, outW, outH);
        ctx.filter = `blur(${blurPx}px) brightness(0.92)`;
        ctx.drawImage(fgCanvas, -blurPx, -blurPx, outW + blurPx * 2, outH + blurPx * 2);
        ctx.filter = 'none';
      } else if (activeBgRemoval.backdropMode === 'gradient') {
        const [br, bg, bb] = hexToRgb(activeBgRemoval.backdropColor || '#f59e0b');
        const grad = ctx.createRadialGradient(
          outW * 0.5,
          outH * 0.42,
          outW * 0.05,
          outW * 0.5,
          outH * 0.5,
          Math.max(outW, outH) * 0.78
        );
        grad.addColorStop(0, `rgb(${br}, ${bg}, ${bb})`);
        grad.addColorStop(1, `rgb(${Math.round(br * 0.16)}, ${Math.round(bg * 0.16)}, ${Math.round(bb * 0.16)})`);
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, outW, outH);
      } else {
        ctx.fillStyle = activeBgRemoval.backdropColor || '#09090b';
        ctx.fillRect(0, 0, outW, outH);
      }
      ctx.restore();

      // 2. Render all overlays marked 'behind' (Text Behind Subject, Behind Glows, etc.)
      renderOverlayPass('behind');

      // When drawing manually with empty strokes/polygons, show dimmed ghost reference underneath so the character is visible to trace
      const hasFreehandData =
        (activeBgRemoval.strokes?.length || 0) > 0 ||
        (activeBgRemoval.drawnPolygons?.length || 0) > 0;
      const isEmptyDrawnGuide =
        activeBgRemoval.mode === 'drawn' &&
        !hasFreehandData &&
        showDrawnGuide;
      if (isEmptyDrawnGuide) {
        ctx.save();
        ctx.globalAlpha = 0.3;
        ctx.drawImage(fgCanvas, 0, 0);
        ctx.restore();
      }

      // 3. Build stage-aligned cutout matte & composite foreground subject on top
      const stageMatte = getScratchCanvas('bgStageMatte', outW, outH);
      const smCtx = stageMatte.getContext('2d', { willReadFrequently: true });
      if (smCtx) {
        smCtx.clearRect(0, 0, outW, outH);
        const softPx = activeBgRemoval.softness > 0 ? (activeBgRemoval.softness / 100) * 9 : 0;

        if (activeBgRemoval.mode !== 'drawn') {
          const sourceBgConf: BgRemovalSettings =
            activeBgRemoval.pickPoints && activeBgRemoval.pickPoints.length > 0 && mapStagePointToSource
              ? {
                  ...activeBgRemoval,
                  pickPoints: activeBgRemoval.pickPoints.map((pt) => {
                    const mapped = mapStagePointToSource!(pt.x, pt.y);
                    return { ...pt, x: mapped.x, y: mapped.y };
                  }),
                }
              : activeBgRemoval;
          const rawMatte = getSourceSubjectMatte(source, sourceBgConf, onAsyncMatteReady);
          drawTransformedLayer(
            smCtx,
            rawMatte,
            softPx > 0.2 ? `blur(${softPx.toFixed(1)}px)` : undefined,
            true
          );

          if (activeBgRemoval.edgeShift !== 0 || activeBgRemoval.invert) {
            const mImg = smCtx.getImageData(0, 0, outW, outH);
            const md = mImg.data;
            const bias = -activeBgRemoval.edgeShift * 2.3;
            const invert = activeBgRemoval.invert;
            for (let i = 3; i < md.length; i += 4) {
              let a = md[i];
              if (activeBgRemoval.edgeShift !== 0) {
                a = clamp((a - bias) * 1.15, 0, 255);
              }
              md[i] = invert ? 255 - a : a;
            }
            smCtx.putImageData(mImg, 0, 0);
          }
        }

        // Draw user freehand lasso polygons
        if (activeBgRemoval.drawnPolygons && activeBgRemoval.drawnPolygons.length > 0) {
          for (const poly of activeBgRemoval.drawnPolygons) {
            if (poly.points.length < 3) continue;
            smCtx.save();
            smCtx.globalCompositeOperation =
              poly.action === 'keep' ? 'source-over' : 'destination-out';
            if (softPx > 0.4) {
              smCtx.filter = `blur(${softPx.toFixed(1)}px)`;
            }
            smCtx.fillStyle = '#ffffff';
            smCtx.beginPath();
            smCtx.moveTo(poly.points[0].x * outW, poly.points[0].y * outH);
            for (let i = 1; i < poly.points.length; i++) {
              smCtx.lineTo(poly.points[i].x * outW, poly.points[i].y * outH);
            }
            smCtx.closePath();
            smCtx.fill();
            smCtx.filter = 'none';
            smCtx.restore();
          }
        }

        // Draw smooth brush strokes (connecting strokes that share a drag groupId)
        if (activeBgRemoval.strokes && activeBgRemoval.strokes.length > 0) {
          const minDim = Math.min(outW, outH);
          const strokes = activeBgRemoval.strokes;
          let idx = 0;
          while (idx < strokes.length) {
            const st = strokes[idx];
            if (st.groupId) {
              let endIdx = idx;
              while (
                endIdx + 1 < strokes.length &&
                strokes[endIdx + 1].groupId === st.groupId &&
                strokes[endIdx + 1].action === st.action
              ) {
                endIdx++;
              }
              smCtx.save();
              smCtx.globalCompositeOperation =
                st.action === 'keep' ? 'source-over' : 'destination-out';
              const strokeBlur = Math.max(softPx * 0.65, activeBgRemoval.mode === 'drawn' ? 1.5 : 2.5);
              smCtx.filter = `blur(${strokeBlur.toFixed(1)}px)`;
              smCtx.strokeStyle = '#ffffff';
              smCtx.fillStyle = '#ffffff';
              smCtx.lineCap = 'round';
              smCtx.lineJoin = 'round';
              smCtx.lineWidth = Math.max(8, st.radius * minDim * 1.65);
              if (endIdx === idx) {
                smCtx.beginPath();
                smCtx.arc(st.x * outW, st.y * outH, Math.max(4, st.radius * minDim * 0.82), 0, Math.PI * 2);
                smCtx.fill();
              } else {
                smCtx.beginPath();
                smCtx.moveTo(st.x * outW, st.y * outH);
                for (let k = idx + 1; k <= endIdx; k++) {
                  smCtx.lineTo(strokes[k].x * outW, strokes[k].y * outH);
                }
                smCtx.stroke();
              }
              smCtx.filter = 'none';
              smCtx.restore();
              idx = endIdx + 1;
              continue;
            }

            const cx = st.x * outW;
            const cy = st.y * outH;
            const rad = Math.max(6, st.radius * minDim);
            smCtx.save();
            smCtx.globalCompositeOperation =
              st.action === 'keep' ? 'source-over' : 'destination-out';
            const rGrad = smCtx.createRadialGradient(cx, cy, rad * 0.45, cx, cy, rad);
            rGrad.addColorStop(0, 'rgba(255,255,255,1)');
            rGrad.addColorStop(1, 'rgba(255,255,255,0)');
            smCtx.fillStyle = rGrad;
            smCtx.beginPath();
            smCtx.arc(cx, cy, rad, 0, Math.PI * 2);
            smCtx.fill();
            smCtx.restore();
            idx++;
          }
        }

        if (activeBgRemoval.mode === 'drawn' && (activeBgRemoval.edgeShift !== 0 || activeBgRemoval.invert)) {
          const mImg = smCtx.getImageData(0, 0, outW, outH);
          const md = mImg.data;
          const bias = -activeBgRemoval.edgeShift * 2.3;
          const invert = activeBgRemoval.invert;
          for (let i = 3; i < md.length; i += 4) {
            let a = md[i];
            if (activeBgRemoval.edgeShift !== 0) {
              a = clamp((a - bias) * 1.15, 0, 255);
            }
            md[i] = invert ? 255 - a : a;
          }
          smCtx.putImageData(mImg, 0, 0);
        }

        fgCtx.save();
        fgCtx.globalCompositeOperation = 'destination-in';
        fgCtx.drawImage(stageMatte, 0, 0);
        fgCtx.restore();
      }

      ctx.drawImage(fgCanvas, 0, 0);
    } else if (!hasClipMask) {
      renderOverlayPass('behind');
    }

    if (e.vignette > 0) {
      const strength = clamp(e.vignette / 100, 0, 1);
      const radius = Math.hypot(outW, outH) * 0.56;
      const grad = ctx.createRadialGradient(
        outW / 2,
        outH / 2,
        radius * 0.35,
        outW / 2,
        outH / 2,
        radius
      );
      grad.addColorStop(0, 'rgba(0,0,0,0)');
      grad.addColorStop(1, `rgba(0,0,0,${(strength * 0.82).toFixed(3)})`);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, outW, outH);
    }

    if (e.letterbox) {
      const barH = Math.max(12, Math.round(outH * 0.115));
      ctx.fillStyle = '#050507';
      ctx.fillRect(0, 0, outW, barH);
      ctx.fillRect(0, outH - barH, outW, barH);
    }

    if (flashOverlayAlpha > 0.01) {
      ctx.fillStyle = `rgba(255, 255, 255, ${flashOverlayAlpha.toFixed(3)})`;
      ctx.fillRect(0, 0, outW, outH);
    }

    // Render all foreground overlays ('front')
    renderOverlayPass('front');
  }
}

export function drawMaskShapePath(
  ctx: CanvasRenderingContext2D,
  shape: MaskShape,
  outW: number,
  outH: number,
  opts: {
    x: number;
    y: number;
    width: number;
    height: number;
    rotation: number;
    cornerRadius?: number;
  }
): void {
  const cx = clamp(opts.x, -0.5, 1.5) * outW;
  const cy = clamp(opts.y, -0.5, 1.5) * outH;
  const w = Math.max(12, opts.width * outW);
  const h = Math.max(12, opts.height * outH);

  ctx.save();
  ctx.translate(cx, cy);
  if (opts.rotation !== 0) {
    ctx.rotate((opts.rotation * Math.PI) / 180);
  }
  ctx.beginPath();

  if (shape === 'circle') {
    const r = Math.min(w, h) * 0.5;
    ctx.arc(0, 0, r, 0, Math.PI * 2);
  } else if (shape === 'ellipse') {
    ctx.ellipse(0, 0, w * 0.5, h * 0.5, 0, 0, Math.PI * 2);
  } else if (shape === 'rectangle') {
    const maxR = Math.min(w, h) * 0.5;
    const rad = clamp((opts.cornerRadius ?? 12) / 100, 0, 1) * maxR;
    roundRect(ctx, -w / 2, -h / 2, w, h, rad);
  } else if (shape === 'linear') {
    const big = Math.hypot(outW, outH) * 1.6;
    ctx.rect(-big, -big, big * 2, big);
  } else if (shape === 'mirror') {
    const big = Math.hypot(outW, outH) * 1.6;
    ctx.rect(-big, -h / 2, big * 2, h);
  } else if (shape === 'star') {
    const outer = Math.min(w, h) * 0.5;
    const inner = outer * 0.42;
    const points = 5;
    for (let i = 0; i < points * 2; i++) {
      const ang = (i * Math.PI) / points - Math.PI / 2;
      const rad = i % 2 === 0 ? outer : inner;
      const px = Math.cos(ang) * rad;
      const py = Math.sin(ang) * rad;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
  } else if (shape === 'heart') {
    const size = Math.min(w, h) * 0.52;
    ctx.moveTo(0, size * 0.85);
    ctx.bezierCurveTo(-size * 1.35, size * 0.1, -size * 0.95, -size * 0.95, 0, -size * 0.3);
    ctx.bezierCurveTo(size * 0.95, -size * 0.95, size * 1.35, size * 0.1, 0, size * 0.85);
    ctx.closePath();
  } else {
    ctx.rect(-outW, -outH, outW * 2, outH * 2);
  }

  ctx.restore();
}

function drawMaskOverlayItem(
  ctx: CanvasRenderingContext2D,
  outW: number,
  outH: number,
  opts: {
    shape: Exclude<MaskShape, 'none'>;
    x: number;
    y: number;
    width: number;
    height: number;
    rotation: number;
    feather: number;
    color: string;
    opacity: number;
    border: boolean;
  }
): void {
  const ovCanvas = getScratchCanvas('overlayMaskMatte', outW, outH);
  const oCtx = ovCanvas.getContext('2d');
  if (!oCtx) return;

  oCtx.clearRect(0, 0, outW, outH);
  oCtx.save();
  oCtx.globalAlpha = clamp(opts.opacity, 0, 1);
  oCtx.fillStyle = opts.color;
  oCtx.fillRect(0, 0, outW, outH);

  oCtx.globalCompositeOperation = 'destination-out';
  oCtx.globalAlpha = 1;
  if (opts.feather > 0) {
    const blurPx = (opts.feather / 100) * Math.min(outW, outH) * 0.14;
    oCtx.filter = `blur(${blurPx.toFixed(1)}px)`;
  }
  oCtx.fillStyle = '#ffffff';
  drawMaskShapePath(oCtx, opts.shape, outW, outH, {
    x: opts.x,
    y: opts.y,
    width: opts.width,
    height: opts.height,
    rotation: opts.rotation,
    cornerRadius: 14,
  });
  oCtx.fill();
  oCtx.filter = 'none';
  oCtx.restore();

  ctx.drawImage(ovCanvas, 0, 0);

  if (opts.border) {
    ctx.save();
    ctx.strokeStyle = 'rgba(245, 158, 11, 0.85)';
    ctx.lineWidth = Math.max(1.5, outW * 0.0025);
    drawMaskShapePath(ctx, opts.shape, outW, outH, {
      x: opts.x,
      y: opts.y,
      width: opts.width,
      height: opts.height,
      rotation: opts.rotation,
      cornerRadius: 14,
    });
    ctx.stroke();
    ctx.restore();
  }
}

function rgbaFromHex(hex: string, factor = 1, alpha = 1): string {
  const [r, g, b] = hexToRgb(hex || '#d97706');
  const rr = Math.round(clamp(r * factor, 0, 255));
  const gg = Math.round(clamp(g * factor, 0, 255));
  const bb = Math.round(clamp(b * factor, 0, 255));
  return alpha >= 0.999 ? `rgb(${rr}, ${gg}, ${bb})` : `rgba(${rr}, ${gg}, ${bb}, ${clamp(alpha, 0, 1).toFixed(3)})`;
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const hue = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;
  if (hue < 60) {
    r = c;
    g = x;
  } else if (hue < 120) {
    r = x;
    g = c;
  } else if (hue < 180) {
    g = c;
    b = x;
  } else if (hue < 240) {
    g = x;
    b = c;
  } else if (hue < 300) {
    r = x;
    b = c;
  } else {
    r = c;
    b = x;
  }
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}

interface MeasuredGlyph {
  char: string;
  charIndex: number;
  cx: number;
  cy: number;
  scale: number;
  offsetY: number;
  rotationDeg: number;
  opacity: number;
  colorOverride?: string;
  outlineOverride?: string;
  glowBoost: number;
}

function buildTextLayout(
  measureCtx: CanvasRenderingContext2D,
  text: string,
  fontPx: number,
  letterSpacingPx: number,
  lineHeightMult: number,
  align: 'left' | 'center' | 'right',
  t3d: Text3DSettings,
  localTime: number,
  duration: number,
  charPhaseOverride?: number
): {
  glyphs: MeasuredGlyph[];
  blockWidth: number;
  blockHeight: number;
} {
  const rawLines = text.split('\n');
  const lineSpacing = fontPx * clamp(lineHeightMult, 0.65, 2.5);
  const totalHeight = rawLines.length * lineSpacing;
  const totalCharsNoNewline = Math.max(1, text.replace(/\n/g, '').length);

  const lineWidths: number[] = [];
  const lineGlyphsRaw: { char: string; idx: number; advance: number; halfW: number }[][] = [];

  let globalCharIdx = 0;
  for (let li = 0; li < rawLines.length; li++) {
    const line = rawLines[li];
    const chars = Array.from(line);
    const items: { char: string; idx: number; advance: number; halfW: number }[] = [];
    let lw = 0;
    for (let ci = 0; ci < chars.length; ci++) {
      const ch = chars[ci];
      const cs = t3d.charStyles?.[String(globalCharIdx)];
      const chScale = cs?.scale ?? 1;
      const w = measureCtx.measureText(ch).width * chScale;
      const adv = w + (ci < chars.length - 1 ? letterSpacingPx : 0);
      items.push({ char: ch, idx: globalCharIdx, advance: adv, halfW: w * 0.5 });
      lw += adv;
      globalCharIdx++;
    }
    globalCharIdx++; // account for '\n' index
    lineWidths.push(lw);
    lineGlyphsRaw.push(items);
  }

  const blockWidth = Math.max(fontPx * 0.8, ...lineWidths);
  const charAnim = t3d.charAnimation || 'none';
  const speed = clamp(t3d.charAnimSpeed ?? 1, 0.2, 4);
  const stagger = clamp((t3d.charAnimStagger ?? 55) / 100, 0, 1);

  const glyphs: MeasuredGlyph[] = [];
  let visibleOrdinal = 0;

  for (let li = 0; li < lineGlyphsRaw.length; li++) {
    const items = lineGlyphsRaw[li];
    const lw = lineWidths[li];
    const startX =
      align === 'left' ? -blockWidth / 2 : align === 'right' ? blockWidth / 2 - lw : -lw / 2;
    const baseY = -totalHeight / 2 + lineSpacing * (li + 0.5);

    let cursorX = startX;
    for (let ci = 0; ci < items.length; ci++) {
      const it = items[ci];
      const cs = t3d.charStyles?.[String(it.idx)];
      let scale = cs?.scale ?? 1;
      let offsetY = cs?.offsetY ?? 0;
      let rotationDeg = cs?.rotation ?? 0;
      let opacity = 1;
      let colorOverride = cs?.color;
      const outlineOverride = cs?.outlineColor;
      const glowBoost = cs?.glowBoost ?? 0;

      const frac = totalCharsNoNewline > 1 ? visibleOrdinal / (totalCharsNoNewline - 1) : 0;
      const phaseProgress =
        charPhaseOverride !== undefined
          ? clamp(charPhaseOverride, 0, 1)
          : clamp((localTime * speed) / Math.max(0.4, Math.min(duration, 2.2)), 0, 1);

      if (charAnim === 'typewriter') {
        const threshold = frac * (0.35 + stagger * 0.62);
        if (phaseProgress < threshold) opacity = 0;
      } else if (charAnim === 'wave') {
        const waveVal = Math.sin(localTime * speed * 5.2 - visibleOrdinal * (0.45 + stagger * 0.8));
        offsetY += waveVal * fontPx * 0.16;
        rotationDeg += Math.cos(localTime * speed * 5.2 - visibleOrdinal * 0.6) * 4;
      } else if (charAnim === 'pop-in') {
        const startT = frac * 0.65 * stagger;
        const win = Math.max(0.18, 1 - 0.65 * stagger);
        const p = clamp((phaseProgress - startT) / win, 0, 1);
        const popCurve = p === 0 ? 0 : p < 0.7 ? (p / 0.7) * 1.18 : 1.18 - ((p - 0.7) / 0.3) * 0.18;
        scale *= Math.max(0.01, popCurve);
        opacity *= clamp(p * 2.5, 0, 1);
      } else if (charAnim === 'slide-stagger') {
        const startT = frac * 0.62 * stagger;
        const win = Math.max(0.2, 1 - 0.62 * stagger);
        const p = clamp((phaseProgress - startT) / win, 0, 1);
        const ease = 1 - Math.pow(1 - p, 3);
        offsetY += (1 - ease) * fontPx * 0.65;
        opacity *= ease;
      } else if (charAnim === 'shake') {
        const tTick = Math.floor(localTime * speed * 24) + visibleOrdinal * 7;
        const jx = Math.sin(tTick * 12.9898) * 0.5;
        const jy = Math.cos(tTick * 78.233) * 0.5;
        cursorX += jx * fontPx * 0.06;
        offsetY += jy * fontPx * 0.08;
        rotationDeg += jx * 8;
      } else if (charAnim === 'color-pulse' && !colorOverride) {
        const hue = (localTime * speed * 140 + visibleOrdinal * (18 + stagger * 32)) % 360;
        const [r, g, b] = hslToRgb(hue, 0.9, 0.62);
        colorOverride = `rgb(${r}, ${g}, ${b})`;
      }

      glyphs.push({
        char: it.char,
        charIndex: it.idx,
        cx: cursorX + it.halfW,
        cy: baseY,
        scale,
        offsetY,
        rotationDeg,
        opacity,
        colorOverride,
        outlineOverride,
        glowBoost,
      });

      cursorX += it.advance;
      visibleOrdinal++;
    }
  }

  return { glyphs, blockWidth, blockHeight: totalHeight };
}

function makeFaceFillStyle(
  ctx: CanvasRenderingContext2D,
  style: Text3DSettings['style'],
  baseColor: string,
  t3d: Text3DSettings,
  blockW: number,
  blockH: number,
  fontPx: number
): string | CanvasGradient {
  const halfW = Math.max(fontPx, blockW * 0.55);
  const halfH = Math.max(fontPx * 0.6, blockH * 0.55);

  if (style === 'gradient') {
    const rad = (((t3d.gradientAngle ?? 180) - 90) * Math.PI) / 180;
    const dx = Math.cos(rad) * halfW;
    const dy = Math.sin(rad) * halfH;
    const grad = ctx.createLinearGradient(-dx, -dy, dx, dy);
    grad.addColorStop(0, baseColor);
    grad.addColorStop(1, t3d.gradientColor2 || '#f59e0b');
    return grad;
  }

  if (style === 'metallic') {
    const grad = ctx.createLinearGradient(0, -halfH, 0, halfH);
    grad.addColorStop(0, '#fffbeb');
    grad.addColorStop(0.24, rgbaFromHex(baseColor, 1.15, 1));
    grad.addColorStop(0.5, rgbaFromHex(t3d.extrudeColor || '#b45309', 1.1, 1));
    grad.addColorStop(0.76, '#f59e0b');
    grad.addColorStop(1, '#fef3c7');
    return grad;
  }

  if (style === 'chrome-bevel') {
    const grad = ctx.createLinearGradient(0, -halfH, 0, halfH);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(0.26, '#e2e8f0');
    grad.addColorStop(0.49, '#334155');
    grad.addColorStop(0.53, '#f8fafc');
    grad.addColorStop(0.76, '#94a3b8');
    grad.addColorStop(1, '#ffffff');
    return grad;
  }

  if (style === 'glass') {
    const grad = ctx.createLinearGradient(0, -halfH, 0, halfH);
    grad.addColorStop(0, rgbaFromHex(baseColor, 1.18, 0.72));
    grad.addColorStop(0.48, rgbaFromHex(baseColor, 0.96, 0.42));
    grad.addColorStop(0.52, rgbaFromHex(baseColor, 0.85, 0.28));
    grad.addColorStop(1, rgbaFromHex(baseColor, 1.1, 0.62));
    return grad;
  }

  if (style === 'emboss') {
    const grad = ctx.createLinearGradient(0, -halfH, 0, halfH);
    grad.addColorStop(0, rgbaFromHex(baseColor, 1.12, 1));
    grad.addColorStop(0.5, baseColor);
    grad.addColorStop(1, rgbaFromHex(baseColor, 0.76, 1));
    return grad;
  }

  if (style === 'neon-3d') {
    return '#f8fafc';
  }

  if (t3d.enabled && (style === 'extrude' || style === 'retro-pop')) {
    const grad = ctx.createLinearGradient(0, -halfH, 0, halfH);
    grad.addColorStop(0, rgbaFromHex(baseColor, 1.08, 1));
    grad.addColorStop(0.65, baseColor);
    grad.addColorStop(1, rgbaFromHex(baseColor, 0.88, 1));
    return grad;
  }

  return baseColor;
}

function drawGlyphSet(
  ctx: CanvasRenderingContext2D,
  glyphs: MeasuredGlyph[],
  ox: number,
  oy: number,
  mode: 'fill' | 'stroke',
  uniformStyle?: string | CanvasGradient,
  perCharStyleFn?: (g: MeasuredGlyph) => string | CanvasGradient,
  lineWidth = 2
) {
  for (let i = 0; i < glyphs.length; i++) {
    const g = glyphs[i];
    if (g.opacity <= 0.005) continue;
    ctx.save();
    if (g.opacity < 0.995) ctx.globalAlpha *= g.opacity;
    ctx.translate(g.cx + ox, g.cy + oy + g.offsetY);
    if (g.rotationDeg !== 0) ctx.rotate((g.rotationDeg * Math.PI) / 180);
    if (g.scale !== 1) ctx.scale(g.scale, g.scale);

    const style = perCharStyleFn ? perCharStyleFn(g) : uniformStyle || '#ffffff';
    if (mode === 'stroke') {
      ctx.lineWidth = lineWidth;
      ctx.strokeStyle = style;
      ctx.strokeText(g.char, 0, 0);
    } else {
      ctx.fillStyle = style;
      ctx.fillText(g.char, 0, 0);
    }
    ctx.restore();
  }
}

function drawStyledText(
  ctx: CanvasRenderingContext2D,
  outW: number,
  outH: number,
  cfg: {
    text: string;
    x: number;
    y: number;
    fontSize: number;
    fontFamily: FontFamilyId;
    letterSpacing: number;
    color: string;
    backdrop: boolean;
    styleTemplate: TextStyleTemplateId;
    text3d?: Text3DSettings;
    opacity: number;
    scale: number;
    rotation: number;
    offsetY: number;
    blendMode?: OverlayBlendMode;
    localTime?: number;
    duration?: number;
    effectIntensity?: number;
    charPhaseOverride?: number;
  }
) {
  const scaleFactor = Math.min(outW, outH) / 720;
  const fontPx = Math.max(14, Math.round(cfg.fontSize * scaleFactor * cfg.scale));
  const cssFamily = resolveFontCss(cfg.fontFamily);
  const t3d = normalizeTextEffects(cfg.text3d);
  const effectMult = cfg.effectIntensity ?? 1;
  const isBoldTemplate =
    cfg.fontFamily === 'oswald' ||
    cfg.fontFamily === 'syne' ||
    cfg.styleTemplate === 'bold-kinetic' ||
    cfg.styleTemplate === 'cinema-3d' ||
    cfg.styleTemplate === 'anime-impact' ||
    cfg.styleTemplate === 'triple-layer';
  const weight = isBoldTemplate ? '800' : '600';

  const px = clamp(cfg.x, -0.35, 1.35) * outW;
  const py = clamp(cfg.y, -0.35, 1.35) * outH + cfg.offsetY;

  ctx.save();
  ctx.font = `${weight} ${fontPx}px ${cssFamily}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  const { glyphs, blockWidth, blockHeight } = buildTextLayout(
    ctx,
    cfg.text,
    fontPx,
    (cfg.letterSpacing ?? 0) * scaleFactor * cfg.scale,
    t3d.lineHeight ?? 1.12,
    t3d.align ?? 'center',
    t3d,
    cfg.localTime ?? 0,
    cfg.duration ?? 4,
    cfg.charPhaseOverride
  );
  ctx.restore();

  const rawDepthPx =
    t3d.enabled && t3d.style !== 'none'
      ? clamp((t3d.depth ?? 16) * effectMult, 0, 72) * scaleFactor * Math.max(0.55, cfg.scale)
      : 0;
  const angleRad = ((t3d.angle ?? 135) * Math.PI) / 180;
  const dirX = Math.cos(angleRad);
  const dirY = Math.sin(angleRad);
  const glowInt = clamp((t3d.glowIntensity ?? 0) * effectMult, 0, 100);
  const outlinePx = clamp(
    (t3d.outlineWidth ?? 0) * scaleFactor * Math.max(0.5, cfg.scale),
    0,
    36
  );
  const hasKineticAutoStroke =
    outlinePx === 0 && (cfg.styleTemplate === 'bold-kinetic' || cfg.fontFamily === 'oswald') && !t3d.enabled;

  const padMargin = Math.max(
    90,
    Math.ceil(
      rawDepthPx +
        outlinePx +
        (t3d.dropShadowDistance ?? 0) * scaleFactor +
        (t3d.shadow2Distance ?? 0) * scaleFactor +
        (t3d.layerCount && t3d.layerCount > 1 ? Math.max(Math.abs(t3d.layerOffsetX ?? 6), Math.abs(t3d.layerOffsetY ?? 6)) * 3 * scaleFactor : 0) +
        glowInt * 0.65 +
        fontPx * 0.9
    )
  );

  const scratchW = Math.min(2400, Math.max(64, Math.ceil(blockWidth + padMargin * 2)));
  const scratchH = Math.min(2000, Math.max(64, Math.ceil(blockHeight + padMargin * 2)));
  const stageScratch = getScratchCanvas('styledTextStage', scratchW, scratchH);
  const sCtx = stageScratch.getContext('2d');
  if (!sCtx) return;

  sCtx.clearRect(0, 0, scratchW, scratchH);
  sCtx.save();
  sCtx.translate(scratchW * 0.5, scratchH * 0.5);
  sCtx.font = `${weight} ${fontPx}px ${cssFamily}`;
  sCtx.textAlign = 'center';
  sCtx.textBaseline = 'middle';
  sCtx.lineJoin = 'round';
  sCtx.lineCap = 'round';

  const padX = fontPx * 0.52;
  const padY = fontPx * 0.28;
  if (cfg.styleTemplate === 'amber-tag') {
    const boxW = blockWidth + padX * 2;
    const boxH = blockHeight + padY * 1.4;
    sCtx.fillStyle = '#f59e0b';
    roundRect(sCtx, -boxW / 2, -boxH / 2, boxW, boxH, 6);
    sCtx.fill();
  } else if (cfg.backdrop || cfg.styleTemplate === 'lower-third') {
    const boxW = blockWidth + padX * 2;
    const boxH = blockHeight + padY * 1.4;
    sCtx.fillStyle = 'rgba(9, 9, 11, 0.8)';
    roundRect(sCtx, -boxW / 2, -boxH / 2, boxW, boxH, 6);
    sCtx.fill();
  }

  const faceBaseHex = cfg.color || '#ffffff';
  const extrudeBaseHex = t3d.extrudeColor || '#b45309';
  const bevelRatio = clamp(((t3d.bevel ?? 60) * effectMult) / 100, 0, 1);

  // 1. Dual Directional Drop Shadows
  if (t3d.shadow2Enabled) {
    const s2Ang = ((t3d.shadow2Angle ?? 45) * Math.PI) / 180;
    const s2Dist = (t3d.shadow2Distance ?? 14) * scaleFactor * Math.max(0.5, cfg.scale);
    const s2Ox = Math.cos(s2Ang) * s2Dist;
    const s2Oy = Math.sin(s2Ang) * s2Dist;
    sCtx.save();
    sCtx.shadowColor = t3d.shadow2Color || '#ef4444';
    sCtx.shadowBlur = (t3d.shadow2Blur ?? 0) * scaleFactor;
    drawGlyphSet(sCtx, glyphs, s2Ox, s2Oy, 'fill', t3d.shadow2Color || '#ef4444');
    sCtx.restore();
  }

  if (t3d.dropShadowEnabled !== false) {
    const dAng = ((t3d.dropShadowAngle ?? 90) * Math.PI) / 180;
    const dDist = (t3d.dropShadowDistance ?? 6) * scaleFactor * Math.max(0.5, cfg.scale);
    const dOx = Math.cos(dAng) * dDist + dirX * rawDepthPx * 0.65;
    const dOy = Math.sin(dAng) * dDist + dirY * rawDepthPx * 0.65;
    sCtx.save();
    sCtx.shadowColor = t3d.dropShadowColor || 'rgba(0,0,0,0.86)';
    sCtx.shadowBlur = Math.max(2, (t3d.dropShadowBlur ?? 14) * scaleFactor);
    sCtx.shadowOffsetX = dOx;
    sCtx.shadowOffsetY = dOy;
    drawGlyphSet(sCtx, glyphs, 0, 0, 'fill', 'rgba(0,0,0,0.68)');
    sCtx.restore();
  }

  // 2. Double / Triple Layer Echoes (behind main body)
  const layersCount = t3d.layerCount ?? 1;
  if (layersCount > 1) {
    const lox = (t3d.layerOffsetX ?? 6) * scaleFactor * Math.max(0.5, cfg.scale);
    const loy = (t3d.layerOffsetY ?? 6) * scaleFactor * Math.max(0.5, cfg.scale);
    const echoStrokeW = Math.max(2, outlinePx || fontPx * 0.05);
    for (let li = layersCount; li >= 2; li--) {
      const col = li === 3 ? t3d.layer3Color || '#38bdf8' : t3d.layer2Color || '#f59e0b';
      const dx = lox * (li - 1);
      const dy = loy * (li - 1);
      if (t3d.layerStrokeOnly !== false) {
        drawGlyphSet(sCtx, glyphs, dx, dy, 'stroke', col, undefined, echoStrokeW);
      } else {
        drawGlyphSet(sCtx, glyphs, dx, dy, 'fill', col);
      }
    }
  }

  // 3. Fake 3D Volumetric Extrusion Stack
  if (rawDepthPx >= 0.75) {
    const steps = Math.max(4, Math.min(54, Math.round(rawDepthPx * 1.25)));
    const shadingAmt = clamp((t3d.extrudeShading ?? 70) / 100, 0, 1);
    const sliceStrokeW =
      t3d.style === 'retro-pop'
        ? Math.max(2.5, fontPx * 0.085)
        : Math.max(1.2, fontPx * 0.034);

    for (let i = steps; i >= 1; i--) {
      const progress = 1 - i / steps;
      const dist = (i / steps) * rawDepthPx;
      const ox = dirX * dist;
      const oy = dirY * dist;

      if (t3d.style === 'neon-3d') {
        const alpha = 0.18 + progress * 0.48;
        const lum = 0.48 + progress * 0.52;
        drawGlyphSet(sCtx, glyphs, ox, oy, 'fill', rgbaFromHex(extrudeBaseHex, lum, alpha));
      } else if (t3d.style === 'glass') {
        const alpha = 0.14 + progress * 0.34;
        drawGlyphSet(sCtx, glyphs, ox, oy, 'fill', rgbaFromHex(extrudeBaseHex, 0.9, alpha));
      } else if (t3d.style === 'retro-pop') {
        if (i === steps) {
          drawGlyphSet(sCtx, glyphs, ox + dirX * 2, oy + dirY * 2, 'stroke', 'rgba(9,9,11,0.96)', undefined, sliceStrokeW * 1.45);
        }
        const lum = 0.65 + progress * 0.38;
        drawGlyphSet(sCtx, glyphs, ox, oy, 'stroke', 'rgba(9,9,11,0.9)', undefined, sliceStrokeW);
        drawGlyphSet(sCtx, glyphs, ox, oy, 'fill', rgbaFromHex(extrudeBaseHex, lum, 1));
      } else {
        const minAo = 1 - shadingAmt * 0.68;
        const aoFactor = minAo + progress * (1 - minAo);
        const rimBoost = progress > 0.86 ? (progress - 0.86) * 2.1 * bevelRatio : 0;
        const sliceColor = rgbaFromHex(extrudeBaseHex, aoFactor + rimBoost, 1);
        drawGlyphSet(sCtx, glyphs, ox, oy, 'stroke', rgbaFromHex(extrudeBaseHex, Math.max(0.2, aoFactor * 0.72), 0.9), undefined, sliceStrokeW);
        drawGlyphSet(sCtx, glyphs, ox, oy, 'fill', sliceColor);
      }
    }
  }

  // 4. Outer Neon Glow Pass
  if (glowInt > 1 || t3d.style === 'neon-3d') {
    const effGlow = Math.max(glowInt, t3d.style === 'neon-3d' ? 75 : 0);
    const glowHex = t3d.glowColor || faceBaseHex;
    sCtx.save();
    sCtx.shadowColor = glowHex;
    sCtx.shadowBlur = Math.max(8, (effGlow / 100) * fontPx * 0.62);
    drawGlyphSet(
      sCtx,
      glyphs,
      0,
      0,
      'stroke',
      undefined,
      (g) => g.colorOverride || glowHex,
      Math.max(2, fontPx * 0.045)
    );
    sCtx.restore();
  }

  // 5. Outer Custom Outline (drawn behind crisp front face fill)
  if (outlinePx > 0.25 || hasKineticAutoStroke) {
    const strokeW = hasKineticAutoStroke ? Math.max(2, fontPx * 0.08) : outlinePx * 2;
    const strokeHex = t3d.outlineColor || 'rgba(9, 9, 11, 0.92)';
    drawGlyphSet(
      sCtx,
      glyphs,
      0,
      0,
      'stroke',
      undefined,
      (g) => g.outlineOverride || strokeHex,
      strokeW
    );
  }

  // 6. Front Face Material + Gloss/Glass Sheen + Inner Shadow/Bevel via Scratch Isolation
  const faceScratch = getScratchCanvas('styledTextFace', scratchW, scratchH);
  const fCtx = faceScratch.getContext('2d');
  if (fCtx) {
    fCtx.clearRect(0, 0, scratchW, scratchH);
    fCtx.save();
    fCtx.translate(scratchW * 0.5, scratchH * 0.5);
    fCtx.font = `${weight} ${fontPx}px ${cssFamily}`;
    fCtx.textAlign = 'center';
    fCtx.textBaseline = 'middle';
    fCtx.lineJoin = 'round';
    fCtx.lineCap = 'round';

    const uniformFaceFill = makeFaceFillStyle(
      fCtx,
      t3d.style,
      faceBaseHex,
      t3d,
      blockWidth,
      blockHeight,
      fontPx
    );

    drawGlyphSet(fCtx, glyphs, 0, 0, 'fill', undefined, (g) => {
      if (g.colorOverride) {
        if (t3d.style === 'metallic' || t3d.style === 'chrome-bevel' || t3d.style === 'glass') {
          return makeFaceFillStyle(fCtx, t3d.style, g.colorOverride, t3d, blockWidth, blockHeight, fontPx);
        }
        return g.colorOverride;
      }
      return uniformFaceFill;
    });

    // Glossy diagonal specular highlight for Glass / Glossy or Chrome
    if (t3d.style === 'glass' || t3d.style === 'chrome-bevel') {
      fCtx.save();
      fCtx.globalCompositeOperation = 'source-atop';
      const sheen = fCtx.createLinearGradient(0, -blockHeight * 0.55, 0, fontPx * 0.08);
      sheen.addColorStop(0, t3d.style === 'glass' ? 'rgba(255,255,255,0.68)' : 'rgba(255,255,255,0.32)');
      sheen.addColorStop(0.85, 'rgba(255,255,255,0.06)');
      sheen.addColorStop(1, 'rgba(255,255,255,0)');
      fCtx.fillStyle = sheen;
      fCtx.fillRect(-scratchW * 0.5, -scratchH * 0.5, scratchW, scratchH * 0.5 + fontPx * 0.05);
      fCtx.restore();
    }

    // Genuine Inner Shadow / Emboss Cutout inside face silhouette
    const innerDepth = clamp((t3d.innerShadowDepth ?? 0) * effectMult, 0, 28) * scaleFactor * Math.max(0.55, cfg.scale);
    if (innerDepth > 0.4 || t3d.style === 'emboss') {
      const effInner = Math.max(innerDepth, t3d.style === 'emboss' ? fontPx * 0.09 : 0);
      const innerCut = getScratchCanvas('styledTextInnerCut', scratchW, scratchH);
      const icCtx = innerCut.getContext('2d');
      if (icCtx) {
        icCtx.clearRect(0, 0, scratchW, scratchH);
        icCtx.fillStyle = '#000000';
        icCtx.fillRect(0, 0, scratchW, scratchH);
        icCtx.save();
        icCtx.globalCompositeOperation = 'destination-out';
        icCtx.translate(scratchW * 0.5 + effInner * 0.35, scratchH * 0.5 + effInner * 0.42);
        icCtx.font = `${weight} ${fontPx}px ${cssFamily}`;
        icCtx.textAlign = 'center';
        icCtx.textBaseline = 'middle';
        drawGlyphSet(icCtx, glyphs, 0, 0, 'fill', '#ffffff');
        icCtx.restore();

        fCtx.save();
        fCtx.globalCompositeOperation = 'source-atop';
        fCtx.shadowColor = t3d.innerShadowColor || 'rgba(0, 0, 0, 0.85)';
        fCtx.shadowBlur = Math.max(2, effInner * 0.85);
        fCtx.drawImage(innerCut, -scratchW * 0.5, -scratchH * 0.5);
        fCtx.restore();
      }
    }

    // Per-character glow boost
    if (glyphs.some((g) => g.glowBoost > 0)) {
      fCtx.save();
      fCtx.globalCompositeOperation = 'source-atop';
      for (const g of glyphs) {
        if (g.glowBoost <= 0 || g.opacity <= 0.01) continue;
        fCtx.save();
        fCtx.shadowColor = g.colorOverride || faceBaseHex;
        fCtx.shadowBlur = (g.glowBoost / 100) * fontPx * 0.45;
        fCtx.fillStyle = '#ffffff';
        fCtx.translate(g.cx, g.cy + g.offsetY);
        if (g.rotationDeg !== 0) fCtx.rotate((g.rotationDeg * Math.PI) / 180);
        if (g.scale !== 1) fCtx.scale(g.scale, g.scale);
        fCtx.fillText(g.char, 0, 0);
        fCtx.restore();
      }
      fCtx.restore();
    }

    fCtx.restore();
    sCtx.drawImage(faceScratch, -scratchW * 0.5, -scratchH * 0.5);
  }

  // 7. Front Specular Bevel Highlight Edge
  if (t3d.enabled && bevelRatio > 0.05) {
    sCtx.save();
    const bevAlpha = t3d.style === 'glass' ? 0.45 + bevelRatio * 0.5 : 0.25 + bevelRatio * 0.5;
    drawGlyphSet(
      sCtx,
      glyphs,
      -dirX * 1.15,
      -dirY * 1.15,
      'stroke',
      `rgba(255, 255, 255, ${bevAlpha.toFixed(3)})`,
      undefined,
      Math.max(1, fontPx * 0.024)
    );
    sCtx.restore();
  }

  sCtx.restore();

  // 8. Composite onto target Canvas with After Effects-style X / Y / Z 2.5D Perspective Rotation, Skew, Scale X/Y & Blend Mode
  const sx = clamp(t3d.scaleX ?? 1, 0.25, 3.5);
  const sy = clamp(t3d.scaleY ?? 1, 0.25, 3.5);
  const tiltXRad = ((t3d.tiltX ?? 0) * Math.PI) / 180;
  const tiltYRad = ((t3d.tiltY ?? 0) * Math.PI) / 180;
  const skewXRad = (clamp(t3d.skewX ?? 0, -45, 45) * Math.PI) / 180;
  const skewYRad = (clamp(t3d.skewY ?? 0, -45, 45) * Math.PI) / 180;
  const manualPersp = clamp((t3d.perspective ?? 0) * effectMult, -60, 60);

  const cosX = Math.cos(tiltXRad);
  const sinX = Math.sin(tiltXRad);
  const cosY = Math.cos(tiltYRad);
  const sinY = Math.sin(tiltYRad);
  const absCosX = Math.max(0.02, Math.abs(cosX));
  const absCosY = Math.max(0.02, Math.abs(cosY));
  const flipX = cosX < 0 ? -1 : 1;
  const flipY = cosY < 0 ? -1 : 1;

  // Camera lens perspective factor: active when tilting X/Y or applying perspective taper
  const camK = clamp(0.46 + (manualPersp / 100) * 0.45, 0.16, 0.9);
  const hasXPass = Math.abs(sinX) > 0.004 || cosX < 0 || Math.abs(manualPersp) > 0.6;
  const hasYPass = Math.abs(sinY) > 0.004 || cosY < 0;

  let sourceForY: HTMLCanvasElement = stageScratch;
  let srcW = scratchW;
  let srcH = scratchH;

  // Pass 1: AE X-Axis Pitch + Vertical Perspective Taper into cached scratch canvas
  if (hasXPass) {
    const warpW = Math.min(2600, Math.ceil(scratchW * 1.45));
    const warpH = Math.min(2200, Math.ceil(scratchH * 1.3));
    const warpXCanvas = getScratchCanvas('styledTextWarpX', warpW, warpH);
    const wxCtx = warpXCanvas.getContext('2d');
    if (wxCtx) {
      wxCtx.clearRect(0, 0, warpW, warpH);
      wxCtx.save();
      wxCtx.translate(warpW * 0.5, warpH * 0.5);
      if (flipX < 0) {
        wxCtx.scale(1, -1);
      }
      const effSinX = flipX * sinX;
      const stripH = 2;
      const projectY = (t: number) => {
        const denom = Math.max(0.38, 1 - t * effSinX * camK * 0.62);
        return (t * scratchH * absCosX) / denom;
      };
      for (let syOff = 0; syOff < scratchH; syOff += stripH) {
        const sh = Math.min(stripH, scratchH - syOff);
        const t0 = syOff / scratchH - 0.5;
        const t1 = (syOff + sh) / scratchH - 0.5;
        const tMid = (t0 + t1) * 0.5;
        const denom = Math.max(0.38, 1 - tMid * effSinX * camK * 0.68);
        const manualScale = 1 + (manualPersp / 100) * 0.72 * tMid;
        const rowScaleW = clamp((1 / denom) * manualScale, 0.22, 1.44);
        const dw = scratchW * rowScaleW;
        const y0 = projectY(t0);
        const y1 = projectY(t1);
        const dh = Math.max(0.75, Math.abs(y1 - y0) + 0.55);
        wxCtx.drawImage(
          stageScratch,
          0,
          syOff,
          scratchW,
          sh,
          -dw * 0.5,
          Math.min(y0, y1),
          dw,
          dh
        );
      }
      wxCtx.restore();
      sourceForY = warpXCanvas;
      srcW = warpW;
      srcH = warpH;
    }
  }

  ctx.save();
  // Subtle depth attenuation right as layer approaches 90 deg edge-on without dimming normal angles
  const edgeFade = clamp(Math.min(absCosX, absCosY) * 4.5, 0.45, 1);
  ctx.globalAlpha = clamp(cfg.opacity * edgeFade, 0, 1);
  if (cfg.blendMode && cfg.blendMode !== 'normal') {
    ctx.globalCompositeOperation = resolveBlendComposite(cfg.blendMode);
  }

  ctx.translate(px, py);
  if (cfg.rotation !== 0) {
    ctx.rotate((cfg.rotation * Math.PI) / 180);
  }
  ctx.transform(sx, Math.tan(skewYRad), Math.tan(skewXRad), sy, 0, 0);

  // Pass 2: AE Y-Axis Yaw Turn (horizontal perspective trapezoid & 360-deg spin)
  if (hasYPass) {
    if (flipY < 0) {
      ctx.scale(-1, 1);
    }
    const effSinY = flipY * sinY;
    const stripW = 2;
    const projectX = (u: number) => {
      const denom = Math.max(0.38, 1 + u * effSinY * camK * 0.62);
      return (u * srcW * absCosY) / denom;
    };
    for (let sxOff = 0; sxOff < srcW; sxOff += stripW) {
      const sw = Math.min(stripW, srcW - sxOff);
      const u0 = sxOff / srcW - 0.5;
      const u1 = (sxOff + sw) / srcW - 0.5;
      const uMid = (u0 + u1) * 0.5;
      const denom = Math.max(0.38, 1 + uMid * effSinY * camK * 0.72);
      const colScaleH = clamp(1 / denom, 0.25, 2.2);
      const dh = srcH * colScaleH;
      const x0 = projectX(u0);
      const x1 = projectX(u1);
      const dw = Math.max(0.75, Math.abs(x1 - x0) + 0.55);
      ctx.drawImage(
        sourceForY,
        sxOff,
        0,
        sw,
        srcH,
        Math.min(x0, x1),
        -dh * 0.5,
        dw,
        dh
      );
    }
  } else {
    ctx.drawImage(sourceForY, -srcW * 0.5, -srcH * 0.5);
  }

  ctx.restore();
}

function drawVectorSticker(
  ctx: CanvasRenderingContext2D,
  outW: number,
  outH: number,
  kind: StickerKind,
  opts: {
    x: number;
    y: number;
    scale: number;
    rotation: number;
    opacity: number;
    globalTime: number;
  }
) {
  const unit = Math.min(outW, outH) * 0.14 * opts.scale;
  const px = opts.x * outW;
  const py = opts.y * outH;

  ctx.save();
  ctx.globalAlpha = clamp(opts.opacity, 0, 1);
  ctx.translate(px, py);
  ctx.rotate((opts.rotation * Math.PI) / 180);

  if (kind === 'rec-frame') {
    const w = outW * 0.86 * clamp(opts.scale, 0.5, 1.1);
    const h = outH * 0.84 * clamp(opts.scale, 0.5, 1.1);
    const corner = Math.min(w, h) * 0.08;
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = Math.max(2, outW * 0.003);
    const drawCorner = (cx: number, cy: number, dx: number, dy: number) => {
      ctx.beginPath();
      ctx.moveTo(cx + dx * corner, cy);
      ctx.lineTo(cx, cy);
      ctx.lineTo(cx, cy + dy * corner);
      ctx.stroke();
    };
    drawCorner(-w / 2, -h / 2, 1, 1);
    drawCorner(w / 2, -h / 2, -1, 1);
    drawCorner(-w / 2, h / 2, 1, -1);
    drawCorner(w / 2, h / 2, -1, -1);

    const blink = Math.floor(opts.globalTime * 2) % 2 === 0 ? 1 : 0.35;
    ctx.fillStyle = `rgba(239, 68, 68, ${blink})`;
    ctx.beginPath();
    ctx.arc(-w / 2 + 24, -h / 2 + 22, 6, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.font = `700 ${Math.max(12, Math.round(outH * 0.024))}px "JetBrains Mono", monospace`;
    ctx.textBaseline = 'middle';
    ctx.fillText('REC', -w / 2 + 38, -h / 2 + 22);
  } else if (kind === 'focus-reticle') {
    const r = unit * 0.85;
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = Math.max(2, unit * 0.04);
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.stroke();
    const tick = r * 0.35;
    ctx.beginPath();
    ctx.moveTo(-r - tick * 0.4, 0);
    ctx.lineTo(-r + tick * 0.4, 0);
    ctx.moveTo(r - tick * 0.4, 0);
    ctx.lineTo(r + tick * 0.4, 0);
    ctx.moveTo(0, -r - tick * 0.4);
    ctx.lineTo(0, -r + tick * 0.4);
    ctx.moveTo(0, r - tick * 0.4);
    ctx.lineTo(0, r + tick * 0.4);
    ctx.stroke();
  } else if (kind === 'cinema-stamp') {
    const w = unit * 2.1;
    const h = unit * 0.72;
    ctx.strokeStyle = '#f4f4f5';
    ctx.lineWidth = 2;
    ctx.fillStyle = 'rgba(9, 9, 11, 0.75)';
    roundRect(ctx, -w / 2, -h / 2, w, h, 4);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#f59e0b';
    ctx.font = `700 ${Math.max(12, Math.round(h * 0.48))}px "JetBrains Mono", monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('35MM · KODAK', 0, 1);
  } else if (kind === 'timecode-hud') {
    const tc = formatTimecode(opts.globalTime);
    const fontPx = Math.max(14, Math.round(unit * 0.42));
    ctx.font = `600 ${fontPx}px "JetBrains Mono", monospace`;
    const w = ctx.measureText(`TC ${tc}`).width + 24;
    const h = fontPx + 14;
    ctx.fillStyle = 'rgba(9, 9, 11, 0.78)';
    roundRect(ctx, -w / 2, -h / 2, w, h, 4);
    ctx.fill();
    ctx.fillStyle = '#fafafa';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`TC ${tc}`, 0, 1);
  } else if (kind === 'arrow-accent') {
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = Math.max(3, unit * 0.08);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(-unit * 0.7, unit * 0.35);
    ctx.lineTo(unit * 0.55, -unit * 0.35);
    ctx.lineTo(unit * 0.12, -unit * 0.42);
    ctx.moveTo(unit * 0.55, -unit * 0.35);
    ctx.lineTo(unit * 0.42, unit * 0.08);
    ctx.stroke();
  } else if (kind === 'star-badge') {
    const r = unit * 0.65;
    ctx.fillStyle = '#f59e0b';
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const ang = (i * Math.PI) / 4;
      const rad = i % 2 === 0 ? r : r * 0.28;
      const x = Math.cos(ang) * rad;
      const y = Math.sin(ang) * rad;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
  }

  ctx.restore();
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function applyPixelGrade(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  edits: EditDocument,
  effectiveChromatic: number
) {
  const imgData = ctx.getImageData(0, 0, width, height);
  const data = imgData.data;
  const c = edits.color;
  const grainAmount = edits.effects.grain;
  const chromaticPx = Math.round((effectiveChromatic / 100) * Math.max(2, width * 0.008));

  if (chromaticPx > 0) {
    if (!chromaticScratch || chromaticScratch.length < data.length) {
      chromaticScratch = new Uint8ClampedArray(data.length);
    }
    chromaticScratch.set(data);
    for (let y = 0; y < height; y++) {
      const row = y * width;
      for (let x = 0; x < width; x++) {
        const idx = (row + x) * 4;
        const rx = Math.min(width - 1, x + chromaticPx);
        const bx = Math.max(0, x - chromaticPx);
        data[idx] = chromaticScratch[(row + rx) * 4];
        data[idx + 2] = chromaticScratch[(row + bx) * 4 + 2];
      }
    }
  }

  const exposureMult = Math.pow(2, c.exposure / 65);
  const contrastFactor = (100 + c.contrast * 0.85) / 100;
  const satMult = 1 + c.saturation / 100;
  const tempShift = c.temperature * 0.45;
  const tintShift = c.tint * 0.35;
  const shadowLift = c.shadows * 0.55;
  const highlightAdj = c.highlights * 0.55;
  const fadeLift = (c.fade / 100) * 36;
  const grainStrength = (grainAmount / 100) * 34;

  const len = data.length;
  let seed = 1337;
  const posterizeAmt = edits.effects.posterize ?? 0;
  const postLevels = posterizeAmt > 0 ? Math.max(2, Math.round(24 - (posterizeAmt / 100) * 21)) : 0;
  const postStep = postLevels > 1 ? 255 / (postLevels - 1) : 1;
  const duotone = edits.effects.duotone || 'none';
  const duotoneStops: [[number, number, number], [number, number, number], [number, number, number]] | null =
    duotone === 'cyber'
      ? [[6, 8, 28], [6, 182, 212], [244, 114, 182]]
      : duotone === 'thermal'
        ? [[30, 27, 75], [239, 68, 68], [254, 240, 138]]
        : duotone === 'crimson'
          ? [[9, 5, 8], [220, 38, 38], [254, 242, 242]]
          : duotone === 'noir-gold'
            ? [[9, 9, 11], [180, 83, 9], [254, 243, 199]]
            : null;

  for (let i = 0; i < len; i += 4) {
    let r = data[i];
    let g = data[i + 1];
    let b = data[i + 2];

    r *= exposureMult;
    g *= exposureMult;
    b *= exposureMult;

    r += tempShift;
    b -= tempShift;
    g -= tintShift;

    const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    if (shadowLift !== 0) {
      const shadowWeight = (1 - clamp(lum, 0, 1)) * (1 - clamp(lum, 0, 1));
      const delta = shadowLift * shadowWeight;
      r += delta;
      g += delta;
      b += delta;
    }
    if (highlightAdj !== 0) {
      const highWeight = clamp(lum, 0, 1) * clamp(lum, 0, 1);
      const delta = highlightAdj * highWeight;
      r += delta;
      g += delta;
      b += delta;
    }

    if (contrastFactor !== 1) {
      r = (r - 128) * contrastFactor + 128;
      g = (g - 128) * contrastFactor + 128;
      b = (b - 128) * contrastFactor + 128;
    }

    if (satMult !== 1) {
      const gray = 0.299 * r + 0.587 * g + 0.114 * b;
      r = gray + (r - gray) * satMult;
      g = gray + (g - gray) * satMult;
      b = gray + (b - gray) * satMult;
    }

    if (fadeLift > 0) {
      r = r * (1 - fadeLift / 255) + fadeLift;
      g = g * (1 - fadeLift / 255) + fadeLift;
      b = b * (1 - fadeLift / 255) + fadeLift;
    }

    if (duotoneStops) {
      const dl = clamp((0.299 * r + 0.587 * g + 0.114 * b) / 255, 0, 1);
      const [s0, s1, s2] = duotoneStops;
      if (dl < 0.5) {
        const t = dl * 2;
        r = s0[0] + (s1[0] - s0[0]) * t;
        g = s0[1] + (s1[1] - s0[1]) * t;
        b = s0[2] + (s1[2] - s0[2]) * t;
      } else {
        const t = (dl - 0.5) * 2;
        r = s1[0] + (s2[0] - s1[0]) * t;
        g = s1[1] + (s2[1] - s1[1]) * t;
        b = s1[2] + (s2[2] - s1[2]) * t;
      }
    }

    if (postLevels > 1) {
      r = Math.round(clamp(r, 0, 255) / postStep) * postStep;
      g = Math.round(clamp(g, 0, 255) / postStep) * postStep;
      b = Math.round(clamp(b, 0, 255) / postStep) * postStep;
    }

    if (grainStrength > 0) {
      seed = (seed * 1664525 + 1013904223) | 0;
      const noise = (((seed >>> 16) & 0xff) / 255 - 0.5) * grainStrength;
      r += noise;
      g += noise;
      b += noise;
    }

    data[i] = r < 0 ? 0 : r > 255 ? 255 : r;
    data[i + 1] = g < 0 ? 0 : g > 255 ? 255 : g;
    data[i + 2] = b < 0 ? 0 : b > 255 ? 255 : b;
  }

  ctx.putImageData(imgData, 0, 0);
}

function applySharpen(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  amount: number
) {
  if (amount <= 0 || width < 3 || height < 3) return;
  const src = ctx.getImageData(0, 0, width, height);
  const dst = ctx.createImageData(width, height);
  const s = src.data;
  const d = dst.data;
  const k = amount * 0.7;
  d.set(s);

  for (let y = 1; y < height - 1; y++) {
    const rowOffset = y * width;
    for (let x = 1; x < width - 1; x++) {
      const idx = (rowOffset + x) * 4;
      const up = idx - width * 4;
      const down = idx + width * 4;
      const left = idx - 4;
      const right = idx + 4;

      for (let c = 0; c < 3; c++) {
        const center = s[idx + c];
        const neighbors = (s[up + c] + s[down + c] + s[left + c] + s[right + c]) * 0.25;
        const val = center + (center - neighbors) * k * 2.2;
        d[idx + c] = val < 0 ? 0 : val > 255 ? 255 : val;
      }
      d[idx + 3] = s[idx + 3];
    }
  }

  ctx.putImageData(dst, 0, 0);
}

export function computeHistogram(canvas: HTMLCanvasElement): HistogramData {
  const bins = 48;
  const r = new Array<number>(bins).fill(0);
  const g = new Array<number>(bins).fill(0);
  const b = new Array<number>(bins).fill(0);
  const luma = new Array<number>(bins).fill(0);

  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx || canvas.width === 0 || canvas.height === 0) {
    return { r, g, b, luma };
  }

  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  const stride = Math.max(4, Math.floor(data.length / 4 / 10000) * 4);
  let maxVal = 1;

  for (let i = 0; i < data.length; i += stride) {
    const rv = data[i];
    const gv = data[i + 1];
    const bv = data[i + 2];
    const lv = 0.299 * rv + 0.587 * gv + 0.114 * bv;

    r[Math.min(bins - 1, Math.floor((rv / 256) * bins))]++;
    g[Math.min(bins - 1, Math.floor((gv / 256) * bins))]++;
    b[Math.min(bins - 1, Math.floor((bv / 256) * bins))]++;
    luma[Math.min(bins - 1, Math.floor((lv / 256) * bins))]++;
  }

  for (let i = 1; i < bins - 1; i++) {
    maxVal = Math.max(maxVal, r[i], g[i], b[i], luma[i]);
  }
  maxVal = Math.max(maxVal, r[0] * 0.5, r[bins - 1] * 0.5, luma[0] * 0.5);

  for (let i = 0; i < bins; i++) {
    r[i] = Math.min(1, r[i] / maxVal);
    g[i] = Math.min(1, g[i] / maxVal);
    b[i] = Math.min(1, b[i] / maxVal);
    luma[i] = Math.min(1, luma[i] / maxVal);
  }

  return { r, g, b, luma };
}

function resolveBlendComposite(mode: OverlayBlendMode): GlobalCompositeOperation {
  if (mode === 'screen') return 'screen';
  if (mode === 'overlay') return 'overlay';
  if (mode === 'soft-light') return 'soft-light';
  if (mode === 'multiply') return 'multiply';
  if (mode === 'color-dodge') return 'color-dodge';
  if (mode === 'difference') return 'difference';
  return 'source-over';
}

function buildOverlayCutoutSource(
  scratchKey: string,
  source: HTMLImageElement | HTMLVideoElement,
  drawW: number,
  drawH: number,
  bgRemoval?: BgRemovalSettings,
  onAsyncMatteReady?: () => void
): HTMLImageElement | HTMLVideoElement | HTMLCanvasElement {
  if (!bgRemoval?.enabled) return source;
  const pw = Math.max(32, Math.round(drawW));
  const ph = Math.max(32, Math.round(drawH));
  const pipScratch = getScratchCanvas(scratchKey, pw, ph);
  const pCtx = pipScratch.getContext('2d', { willReadFrequently: true });
  if (!pCtx) return source;

  pCtx.clearRect(0, 0, pw, ph);
  pCtx.drawImage(source, 0, 0, pw, ph);

  const rawMatte = getSourceSubjectMatte(source, bgRemoval, onAsyncMatteReady);
  const softPx = bgRemoval.softness > 0 ? (bgRemoval.softness / 100) * 6 : 0;
  const matteScratch = getScratchCanvas(`${scratchKey}_matte`, pw, ph);
  const mCtx = matteScratch.getContext('2d', { willReadFrequently: true });
  if (mCtx) {
    mCtx.clearRect(0, 0, pw, ph);
    if (softPx > 0.2) {
      mCtx.filter = `blur(${softPx.toFixed(1)}px)`;
    }
    mCtx.drawImage(rawMatte, 0, 0, pw, ph);
    mCtx.filter = 'none';

    if (bgRemoval.edgeShift !== 0 || bgRemoval.invert) {
      const mImg = mCtx.getImageData(0, 0, pw, ph);
      const md = mImg.data;
      const bias = -bgRemoval.edgeShift * 2.3;
      const invert = bgRemoval.invert;
      for (let i = 3; i < md.length; i += 4) {
        let a = md[i];
        if (bgRemoval.edgeShift !== 0) {
          a = clamp((a - bias) * 1.15, 0, 255);
        }
        md[i] = invert ? 255 - a : a;
      }
      mCtx.putImageData(mImg, 0, 0);
    }

    pCtx.save();
    pCtx.globalCompositeOperation = 'destination-in';
    pCtx.drawImage(matteScratch, 0, 0, pw, ph);
    pCtx.restore();
  } else {
    pCtx.save();
    pCtx.globalCompositeOperation = 'destination-in';
    pCtx.drawImage(rawMatte, 0, 0, pw, ph);
    pCtx.restore();
  }

  return pipScratch;
}

function drawImageOverlayItem(
  ctx: CanvasRenderingContext2D,
  outW: number,
  outH: number,
  opts: {
    src: string;
    blendMode: OverlayBlendMode;
    opacity: number;
    x: number;
    y: number;
    scale: number;
    rotation: number;
    bgRemoval?: BgRemovalSettings;
    onAsyncMatteReady?: () => void;
  }
): void {
  const img = preloadOverlayImage(opts.src, opts.onAsyncMatteReady);
  if (!img || img.naturalWidth <= 0 || img.naturalHeight <= 0) return;

  const baseSize = Math.min(outW, outH) * 0.46 * clamp(opts.scale, 0.15, 3);
  const ratio = img.naturalWidth / img.naturalHeight;
  const drawW = ratio >= 1 ? baseSize : baseSize * ratio;
  const drawH = ratio >= 1 ? baseSize / ratio : baseSize;

  const drawSource = buildOverlayCutoutSource(
    'pipImageCutout',
    img,
    drawW,
    drawH,
    opts.bgRemoval,
    opts.onAsyncMatteReady
  );

  ctx.save();
  ctx.globalCompositeOperation = resolveBlendComposite(opts.blendMode);
  ctx.globalAlpha = clamp(opts.opacity, 0, 1);
  ctx.translate(clamp(opts.x, -0.2, 1.2) * outW, clamp(opts.y, -0.2, 1.2) * outH);
  if (opts.rotation !== 0) {
    ctx.rotate((opts.rotation * Math.PI) / 180);
  }
  ctx.drawImage(drawSource, -drawW / 2, -drawH / 2, drawW, drawH);
  ctx.restore();
}

function drawVideoOverlayItem(
  ctx: CanvasRenderingContext2D,
  outW: number,
  outH: number,
  vid: HTMLVideoElement,
  opts: {
    blendMode: OverlayBlendMode;
    opacity: number;
    x: number;
    y: number;
    scale: number;
    rotation: number;
    bgRemoval?: BgRemovalSettings;
    onAsyncMatteReady?: () => void;
  }
): void {
  const vw = vid.videoWidth;
  const vh = vid.videoHeight;
  if (vw <= 0 || vh <= 0 || vid.readyState < 2) return;

  const baseSize = Math.min(outW, outH) * 0.68 * clamp(opts.scale, 0.15, 3);
  const ratio = vw / vh;
  const drawW = ratio >= 1 ? baseSize : baseSize * ratio;
  const drawH = ratio >= 1 ? baseSize / ratio : baseSize;

  const drawSource = buildOverlayCutoutSource(
    'pipVideoCutout',
    vid,
    drawW,
    drawH,
    opts.bgRemoval,
    opts.onAsyncMatteReady
  );

  ctx.save();
  ctx.globalCompositeOperation = resolveBlendComposite(opts.blendMode);
  ctx.globalAlpha = clamp(opts.opacity, 0, 1);
  ctx.translate(clamp(opts.x, -0.2, 1.2) * outW, clamp(opts.y, -0.2, 1.2) * outH);
  if (opts.rotation !== 0) {
    ctx.rotate((opts.rotation * Math.PI) / 180);
  }
  ctx.drawImage(drawSource, -drawW / 2, -drawH / 2, drawW, drawH);
  ctx.restore();
}

export function extractCutoutAsPngOverlay(
  source: HTMLImageElement | HTMLVideoElement,
  edits: EditDocument,
  maxEdge = 1080
): { dataUrl: string; width: number; height: number } | null {
  const { w: srcW, h: srcH } = getSourceDimensions(source);
  if (srcW <= 0 || srcH <= 0) return null;

  const dims = computeTargetDimensions(srcW, srcH, edits, maxEdge);
  const fullCanvas = document.createElement('canvas');
  fullCanvas.width = dims.width;
  fullCanvas.height = dims.height;

  const bgConf: BgRemovalSettings = {
    ...(edits.bgRemoval || DEFAULT_BG_REMOVAL),
    enabled: true,
    backdropMode: 'transparent',
  };

  renderFrameToCanvas(fullCanvas, source, {
    edits: {
      ...edits,
      bgRemoval: bgConf,
      overlays: [],
      visualOverlays: [],
    },
    globalOverlays: [],
    showDrawnGuide: false,
  });

  const ctx = fullCanvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;

  const { data } = ctx.getImageData(0, 0, dims.width, dims.height);
  let minX = dims.width;
  let minY = dims.height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < dims.height; y++) {
    const rowOffset = y * dims.width;
    for (let x = 0; x < dims.width; x++) {
      const a = data[(rowOffset + x) * 4 + 3];
      if (a > 12) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX < minX || maxY < minY) {
    return null;
  }

  const pad = 8;
  const cx = Math.max(0, minX - pad);
  const cy = Math.max(0, minY - pad);
  const cw = Math.min(dims.width - cx, maxX - minX + 1 + pad * 2);
  const ch = Math.min(dims.height - cy, maxY - minY + 1 + pad * 2);

  const cropped = document.createElement('canvas');
  cropped.width = cw;
  cropped.height = ch;
  const cCtx = cropped.getContext('2d');
  if (!cCtx) return null;
  cCtx.drawImage(fullCanvas, cx, cy, cw, ch, 0, 0, cw, ch);

  return {
    dataUrl: cropped.toDataURL('image/png'),
    width: cw,
    height: ch,
  };
}

function drawVisualOverlayEffect(
  ctx: CanvasRenderingContext2D,
  outW: number,
  outH: number,
  opts: {
    presetId: VisualOverlayPresetId;
    blendMode: OverlayBlendMode;
    opacity: number;
    x: number;
    y: number;
    scale: number;
    rotation: number;
    globalTime: number;
  }
): void {
  const op = clamp(opts.opacity, 0, 1);
  if (op <= 0.01) return;

  const t = opts.globalTime;
  const diag = Math.hypot(outW, outH);

  ctx.save();
  ctx.globalCompositeOperation = resolveBlendComposite(opts.blendMode);
  ctx.globalAlpha = op;
  ctx.translate(opts.x * outW, opts.y * outH);
  if (opts.rotation !== 0) {
    ctx.rotate((opts.rotation * Math.PI) / 180);
  }
  if (opts.scale !== 1) {
    ctx.scale(opts.scale, opts.scale);
  }
  ctx.translate(-outW / 2, -outH / 2);

  if (opts.presetId === 'warm-light-leak') {
    const driftX = Math.sin(t * 1.1) * outW * 0.05;
    const driftY = Math.cos(t * 0.85) * outH * 0.04;
    const g1 = ctx.createRadialGradient(
      outW * 0.12 + driftX,
      outH * 0.25 + driftY,
      0,
      outW * 0.18 + driftX,
      outH * 0.3,
      diag * 0.62
    );
    g1.addColorStop(0, 'rgba(255, 198, 108, 0.92)');
    g1.addColorStop(0.28, 'rgba(249, 115, 22, 0.58)');
    g1.addColorStop(0.62, 'rgba(220, 38, 38, 0.22)');
    g1.addColorStop(1, 'rgba(220, 38, 38, 0)');
    ctx.fillStyle = g1;
    ctx.fillRect(-outW * 0.2, -outH * 0.2, outW * 1.4, outH * 1.4);

    const g2 = ctx.createRadialGradient(
      outW * 0.92 - driftX * 0.6,
      outH * 0.85,
      0,
      outW * 0.88,
      outH * 0.82,
      diag * 0.48
    );
    g2.addColorStop(0, 'rgba(251, 146, 60, 0.72)');
    g2.addColorStop(0.45, 'rgba(234, 88, 12, 0.24)');
    g2.addColorStop(1, 'rgba(234, 88, 12, 0)');
    ctx.fillStyle = g2;
    ctx.fillRect(-outW * 0.2, -outH * 0.2, outW * 1.4, outH * 1.4);
  } else if (opts.presetId === 'prism-flare') {
    const cx = outW * (0.38 + Math.sin(t * 0.7) * 0.04);
    const cy = outH * (0.34 + Math.cos(t * 0.6) * 0.03);
    const streak = ctx.createLinearGradient(0, cy - outH * 0.14, outW, cy + outH * 0.14);
    streak.addColorStop(0, 'rgba(56, 189, 248, 0)');
    streak.addColorStop(0.25, 'rgba(56, 189, 248, 0.35)');
    streak.addColorStop(0.5, 'rgba(254, 240, 138, 0.82)');
    streak.addColorStop(0.72, 'rgba(244, 114, 182, 0.38)');
    streak.addColorStop(1, 'rgba(244, 114, 182, 0)');
    ctx.fillStyle = streak;
    ctx.fillRect(0, cy - outH * 0.18, outW, outH * 0.36);

    const discs = [
      { f: 0.25, r: outW * 0.06, c: 'rgba(253, 224, 71, 0.32)' },
      { f: 0.55, r: outW * 0.09, c: 'rgba(56, 189, 248, 0.24)' },
      { f: 0.85, r: outW * 0.045, c: 'rgba(244, 114, 182, 0.28)' },
    ];
    for (const d of discs) {
      const dx = cx + (outW * 0.5 - cx) * d.f * 1.6;
      const dy = cy + (outH * 0.5 - cy) * d.f * 1.6;
      const rg = ctx.createRadialGradient(dx, dy, 0, dx, dy, d.r);
      rg.addColorStop(0, d.c);
      rg.addColorStop(0.75, d.c);
      rg.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = rg;
      ctx.beginPath();
      ctx.arc(dx, dy, d.r, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (opts.presetId === 'film-dust') {
    let seed = (Math.floor(t * 10) + 1) * 7919;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    ctx.fillStyle = 'rgba(255, 252, 240, 0.65)';
    for (let i = 0; i < 42; i++) {
      const px = rand() * outW;
      const py = rand() * outH;
      const r = 0.8 + rand() * 2.1;
      ctx.beginPath();
      ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = 'rgba(255, 250, 235, 0.38)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 6; i++) {
      const sx = rand() * outW;
      ctx.beginPath();
      ctx.moveTo(sx, 0);
      ctx.lineTo(sx + (rand() - 0.5) * 4, outH);
      ctx.stroke();
    }
  } else if (opts.presetId === 'bokeh-glow') {
    for (let i = 0; i < 12; i++) {
      const bx = (((i * 0.37 + 0.1) % 1) + Math.sin(t * 0.55 + i) * 0.03) * outW;
      const by = (((i * 0.53 + 0.14) % 1) + Math.cos(t * 0.45 + i * 1.4) * 0.03) * outH;
      const br = (0.035 + (i % 4) * 0.022) * Math.min(outW, outH);
      const warm = i % 3 !== 0;
      const rg = ctx.createRadialGradient(bx, by, br * 0.15, bx, by, br);
      rg.addColorStop(0, warm ? 'rgba(254, 240, 138, 0.14)' : 'rgba(186, 230, 253, 0.14)');
      rg.addColorStop(0.76, warm ? 'rgba(251, 146, 60, 0.38)' : 'rgba(56, 189, 248, 0.34)');
      rg.addColorStop(1, 'rgba(255, 255, 255, 0)');
      ctx.fillStyle = rg;
      ctx.beginPath();
      ctx.arc(bx, by, br, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (opts.presetId === 'cinema-rain') {
    ctx.strokeStyle = 'rgba(205, 235, 255, 0.42)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    const fall = (t * 480) % (outH + 80);
    for (let i = 0; i < 68; i++) {
      const rx = ((i * 97 + i * i * 13) % outW);
      const ry = ((i * 61 + fall + (i % 5) * 45) % (outH + 80)) - 40;
      const len = 18 + (i % 4) * 10;
      ctx.moveTo(rx, ry);
      ctx.lineTo(rx - len * 0.24, ry + len);
    }
    ctx.stroke();
  } else if (opts.presetId === 'vhs-static') {
    let seed = (Math.floor(t * 24) + 1) * 4999;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    const bandY = ((t * 140) % outH);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.14)';
    ctx.fillRect(0, bandY, outW, Math.max(8, outH * 0.04));
    ctx.fillStyle = 'rgba(56, 189, 248, 0.12)';
    ctx.fillRect(0, (bandY + outH * 0.48) % outH, outW, 4);
    for (let i = 0; i < 55; i++) {
      const sx = rand() * outW;
      const sy = rand() * outH;
      ctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.42)' : 'rgba(186,230,253,0.34)';
      ctx.fillRect(sx, sy, 3 + rand() * 14, 1.5);
    }
  } else if (opts.presetId === 'frost-frame') {
    const rg = ctx.createRadialGradient(
      outW * 0.5,
      outH * 0.5,
      Math.min(outW, outH) * 0.34,
      outW * 0.5,
      outH * 0.5,
      diag * 0.56
    );
    rg.addColorStop(0, 'rgba(224, 242, 254, 0)');
    rg.addColorStop(0.68, 'rgba(186, 230, 253, 0.22)');
    rg.addColorStop(1, 'rgba(240, 249, 255, 0.72)');
    ctx.fillStyle = rg;
    ctx.fillRect(0, 0, outW, outH);
  } else if (opts.presetId === 'editorial-frame') {
    const borderW = Math.max(18, Math.round(outW * 0.045));
    const borderH = Math.max(14, Math.round(outH * 0.04));
    ctx.fillStyle = '#070709';
    ctx.fillRect(0, 0, outW, borderH);
    ctx.fillRect(0, outH - borderH, outW, borderH);
    ctx.fillRect(0, 0, borderW, outH);
    ctx.fillRect(outW - borderW, 0, borderW, outH);

    ctx.strokeStyle = 'rgba(245, 158, 11, 0.65)';
    ctx.lineWidth = Math.max(1.5, outW * 0.002);
    ctx.strokeRect(borderW, borderH, outW - borderW * 2, outH - borderH * 2);

    ctx.fillStyle = 'rgba(244, 244, 245, 0.75)';
    const holeW = Math.max(6, Math.round(borderW * 0.42));
    const holeH = Math.max(8, Math.round(outH * 0.042));
    const stepY = holeH * 2.2;
    for (let y = borderH + 8; y < outH - borderH - holeH; y += stepY) {
      roundRect(ctx, (borderW - holeW) / 2, y, holeW, holeH, 2);
      ctx.fill();
      roundRect(ctx, outW - borderW + (borderW - holeW) / 2, y, holeW, holeH, 2);
      ctx.fill();
    }
  }

  ctx.restore();
}
