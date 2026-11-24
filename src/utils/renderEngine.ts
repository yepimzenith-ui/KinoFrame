import { ASPECT_RATIO_OPTIONS, DEFAULT_MASK, FONT_OPTIONS } from '../data/presets';
import {
  ClipKeyframe,
  EditDocument,
  FontFamilyId,
  KeyframeEasing,
  MaskShape,
  StickerKind,
  TimelineOverlayItem,
  TransitionType,
  VelocityPresetId,
} from '../types/editor';
import { clamp, formatTimecode } from './timecode';

const scratchCanvases: Record<string, HTMLCanvasElement> = {};

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
  // punch (snappy exponential curve)
  return x === 1 ? 1 : 1 - Math.pow(2, -9 * x);
}

export function applyVelocityCurve(progress01: number, preset: VelocityPresetId): number {
  const p = clamp(progress01, 0, 1);
  if (preset === 'linear') return p;
  if (preset === 'hero-time') {
    // Fast entry, slow-mo middle, fast exit
    return p + 0.14 * Math.sin(2 * Math.PI * p);
  }
  if (preset === 'bullet-ramp') {
    // Slow build then rapid acceleration
    return Math.pow(p, 1.85);
  }
  if (preset === 'flash-in') {
    // Rapid snap in then settle
    return 1 - Math.pow(1 - p, 2.2);
  }
  if (preset === 'montage-pulse') {
    return clamp(p + 0.08 * Math.sin(4 * Math.PI * p), 0, 1);
  }
  return p;
}

export function evaluateOverlayAtTime(
  item: TimelineOverlayItem,
  localTime: number
): { x: number; y: number; scale: number; rotation: number; opacity: number } {
  const kfs = item.keyframes;
  if (!kfs || kfs.length === 0) {
    return {
      x: item.x,
      y: item.y,
      scale: item.scale,
      rotation: item.rotation,
      opacity: item.opacity,
    };
  }

  const sorted = [...kfs].sort((a, b) => a.time - b.time);
  if (localTime <= sorted[0].time) {
    return {
      x: sorted[0].x,
      y: sorted[0].y,
      scale: sorted[0].scale,
      rotation: sorted[0].rotation,
      opacity: sorted[0].opacity,
    };
  }
  const last = sorted[sorted.length - 1];
  if (localTime >= last.time) {
    return {
      x: last.x,
      y: last.y,
      scale: last.scale,
      rotation: last.rotation,
      opacity: last.opacity,
    };
  }

  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i];
    const b = sorted[i + 1];
    if (localTime >= a.time && localTime <= b.time) {
      const span = Math.max(0.001, b.time - a.time);
      const t = applyEasing((localTime - a.time) / span, item.easing || 'ease-in-out');
      return {
        x: a.x + (b.x - a.x) * t,
        y: a.y + (b.y - a.y) * t,
        scale: a.scale + (b.scale - a.scale) * t,
        rotation: a.rotation + (b.rotation - a.rotation) * t,
        opacity: a.opacity + (b.opacity - a.opacity) * t,
      };
    }
  }

  return {
    x: item.x,
    y: item.y,
    scale: item.scale,
    rotation: item.rotation,
    opacity: item.opacity,
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
  return FONT_OPTIONS.find((f) => f.id === family)?.cssFamily || '"Plus Jakarta Sans", sans-serif';
}

export function renderFrameToCanvas(
  canvas: HTMLCanvasElement,
  source: HTMLImageElement | HTMLVideoElement,
  options: RenderOptions
): void {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return;

  const { w: srcW, h: srcH } = getSourceDimensions(source);
  if (srcW <= 0 || srcH <= 0) return;

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
  } = options;

  const outW = canvas.width;
  const outH = canvas.height;

  ctx.save();
  ctx.clearRect(0, 0, outW, outH);

  const bgMode = edits.transform.bgMode;
  ctx.fillStyle = bgMode === 'slate' ? '#18181b' : '#09090b';
  ctx.fillRect(0, 0, outW, outH);

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

  // Helper to apply clip transforms & draw source image into a target 2D context
  const drawTransformedSource = (targetCtx: CanvasRenderingContext2D, extraFilter?: string) => {
    targetCtx.save();
    if (wipeFraction < 1) {
      targetCtx.beginPath();
      targetCtx.rect(0, 0, outW * wipeFraction, outH);
      targetCtx.clip();
    }

    targetCtx.globalAlpha = clamp(transAlpha * animAlpha, 0, 1);

    const blurFilter =
      !bypassEdits && edits.effects.blur > 0 ? `blur(${edits.effects.blur.toFixed(1)}px)` : '';
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

    targetCtx.drawImage(source, sx, sy, sw, sh, -drawW / 2, -drawH / 2, drawW, drawH);
    targetCtx.filter = 'none';
    targetCtx.restore();
  };

  const activeMask = !bypassEdits ? edits.mask || DEFAULT_MASK : DEFAULT_MASK;
  const hasClipMask = !bypassEdits && activeMask.shape !== 'none';

  // If masked with an outer reveal mode (dim / blur / original), draw outer background layer first
  if (hasClipMask) {
    if (activeMask.bgEffect === 'blur') {
      drawTransformedSource(ctx, 'blur(18px) brightness(0.58) saturate(1.1)');
    } else if (activeMask.bgEffect === 'dim') {
      drawTransformedSource(ctx, 'brightness(0.32) saturate(0.75)');
    } else if (activeMask.bgEffect === 'original') {
      drawTransformedSource(ctx);
    }
  }

  // Target foreground context: if masked, render graded layer to scratch canvas then composite mask
  const fgCanvas = hasClipMask ? getScratchCanvas('maskFg', outW, outH) : canvas;
  const fgCtx = hasClipMask
    ? fgCanvas.getContext('2d', { willReadFrequently: true }) || ctx
    : ctx;

  if (hasClipMask) {
    fgCtx.clearRect(0, 0, outW, outH);
  }

  drawTransformedSource(fgCtx);
  ctx.restore();

  if (!bypassEdits) {
    const c = edits.color;
    const e = edits.effects;

    const effectiveChromatic = Math.max(e.chromatic, Math.abs(glitchShift) * 2.4);
    const needsPixelPass =
      c.exposure !== 0 ||
      c.contrast !== 0 ||
      c.highlights !== 0 ||
      c.shadows !== 0 ||
      c.temperature !== 0 ||
      c.tint !== 0 ||
      c.saturation !== 0 ||
      c.fade !== 0 ||
      e.grain > 0 ||
      effectiveChromatic > 0;

    if (needsPixelPass) {
      applyPixelGrade(fgCtx, outW, outH, edits, effectiveChromatic);
    }

    if (e.sharpen > 0) {
      applySharpen(fgCtx, outW, outH, e.sharpen / 100);
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
      ctx.drawImage(fgCanvas, 0, 0);
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

    // Photo Lab local overlays
    for (const ov of edits.overlays) {
      if (!ov.text.trim()) continue;
      drawStyledText(ctx, outW, outH, {
        text: ov.text,
        x: ov.x,
        y: ov.y,
        fontSize: ov.fontSize,
        fontFamily: ov.fontFamily,
        letterSpacing: 0,
        color: ov.color,
        backdrop: ov.backdrop,
        styleTemplate: ov.styleTemplate || 'clean',
        opacity: 1,
        scale: 1,
        rotation: 0,
        offsetY: 0,
      });
    }

    // Global Keyframed Track T1 Overlays (Mask Overlays, Text & Stickers)
    for (const item of globalOverlays) {
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

      if (item.kind === 'mask' && item.maskShape) {
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
        drawStyledText(ctx, outW, outH, {
          text: item.text,
          x: evaluated.x,
          y: evaluated.y,
          fontSize: item.fontSize || 46,
          fontFamily: item.fontFamily || 'oswald',
          letterSpacing: item.letterSpacing ?? 0,
          color: item.color || '#ffffff',
          backdrop: item.backdrop ?? false,
          styleTemplate: item.styleTemplate || 'bold-kinetic',
          opacity: ovOpacity,
          scale: ovScale,
          rotation: evaluated.rotation,
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
    styleTemplate: 'clean' | 'bold-kinetic' | 'cinema-sub' | 'lower-third' | 'amber-tag';
    opacity: number;
    scale: number;
    rotation: number;
    offsetY: number;
  }
) {
  const scaleFactor = Math.min(outW, outH) / 720;
  const fontPx = Math.max(14, Math.round(cfg.fontSize * scaleFactor * cfg.scale));
  const cssFamily = resolveFontCss(cfg.fontFamily);
  const weight = cfg.fontFamily === 'oswald' || cfg.fontFamily === 'syne' || cfg.styleTemplate === 'bold-kinetic' ? '700' : '600';

  ctx.save();
  ctx.globalAlpha = clamp(cfg.opacity, 0, 1);

  const px = clamp(cfg.x, 0.04, 0.96) * outW;
  const py = clamp(cfg.y, 0.04, 0.96) * outH + cfg.offsetY;

  ctx.translate(px, py);
  if (cfg.rotation !== 0) {
    ctx.rotate((cfg.rotation * Math.PI) / 180);
  }

  ctx.font = `${weight} ${fontPx}px ${cssFamily}`;
  if ('letterSpacing' in ctx && cfg.letterSpacing) {
    (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${cfg.letterSpacing}px`;
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const metrics = ctx.measureText(cfg.text);
  const padX = fontPx * 0.52;
  const padY = fontPx * 0.28;

  if (cfg.styleTemplate === 'amber-tag') {
    const boxW = metrics.width + padX * 2;
    const boxH = fontPx + padY * 2;
    ctx.fillStyle = '#f59e0b';
    roundRect(ctx, -boxW / 2, -boxH / 2, boxW, boxH, 6);
    ctx.fill();
  } else if (cfg.backdrop || cfg.styleTemplate === 'lower-third') {
    const boxW = metrics.width + padX * 2;
    const boxH = fontPx + padY * 2;
    ctx.fillStyle = 'rgba(9, 9, 11, 0.8)';
    roundRect(ctx, -boxW / 2, -boxH / 2, boxW, boxH, 6);
    ctx.fill();
  } else {
    ctx.shadowColor = 'rgba(0, 0, 0, 0.88)';
    ctx.shadowBlur = Math.max(6, fontPx * 0.28);
    ctx.shadowOffsetY = 2;
  }

  if (cfg.styleTemplate === 'bold-kinetic' || cfg.fontFamily === 'oswald') {
    ctx.lineWidth = Math.max(2, fontPx * 0.08);
    ctx.strokeStyle = 'rgba(9, 9, 11, 0.88)';
    ctx.strokeText(cfg.text, 0, 0);
  }

  ctx.fillStyle = cfg.color || '#ffffff';
  ctx.fillText(cfg.text, 0, 0);
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
    const copy = new Uint8ClampedArray(data);
    for (let y = 0; y < height; y++) {
      const row = y * width;
      for (let x = 0; x < width; x++) {
        const idx = (row + x) * 4;
        const rx = Math.min(width - 1, x + chromaticPx);
        const bx = Math.max(0, x - chromaticPx);
        data[idx] = copy[(row + rx) * 4];
        data[idx + 2] = copy[(row + bx) * 4 + 2];
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
