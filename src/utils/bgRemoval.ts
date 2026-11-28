import { FilesetResolver, ImageSegmenter } from '@mediapipe/tasks-vision';
import { BgAutoSubjectType, BgPickPoint, BgRemovalSettings } from '../types/editor';
import { clamp } from './timecode';

const LOCAL_WASM_BASE_URL = '/mediapipe-wasm';
const CDN_WASM_BASE_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.3/wasm';
const SELFIE_MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite';
const DEEPLAB_MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/image_segmenter/deeplab_v3/float32/1/deeplab_v3.tflite';

const DEEPLAB_PERSON_CLASS = 15;

interface MatteCacheEntry {
  canvas: HTMLCanvasElement;
  quality: 'sync' | 'neural';
}

interface NeuralAnalysisRecord {
  selfieMask?: Float32Array;
  selfieW?: number;
  selfieH?: number;
  selfieCoverage: number;
  deeplabCat?: Uint8Array;
  deeplabW?: number;
  deeplabH?: number;
  deeplabPersonCoverage: number;
  deeplabAnyCoverage: number;
  done: boolean;
}

const matteCache = new Map<string, MatteCacheEntry>();
const neuralAnalysisCache = new Map<string, NeuralAnalysisRecord>();
const pendingNeuralJobs = new Set<string>();
const MAX_CACHE_ENTRIES = 80;
const MAX_NEURAL_ENTRIES = 36;

let selfieSegmenterPromise: Promise<ImageSegmenter | null> | null = null;
let deeplabSegmenterPromise: Promise<ImageSegmenter | null> | null = null;
let sharedFilesetPromise: ReturnType<typeof FilesetResolver.forVisionTasks> | null = null;

function getFileset() {
  if (!sharedFilesetPromise) {
    sharedFilesetPromise = FilesetResolver.forVisionTasks(LOCAL_WASM_BASE_URL)
      .catch(() => FilesetResolver.forVisionTasks(CDN_WASM_BASE_URL))
      .catch(() => {
        sharedFilesetPromise = null;
        throw new Error('WASM load failed');
      });
  }
  return sharedFilesetPromise;
}

async function getSelfieSegmenter(): Promise<ImageSegmenter | null> {
  if (!selfieSegmenterPromise) {
    selfieSegmenterPromise = (async () => {
      try {
        const vision = await getFileset();
        return await ImageSegmenter.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: SELFIE_MODEL_URL,
            delegate: 'GPU',
          },
          runningMode: 'IMAGE',
          outputCategoryMask: false,
          outputConfidenceMasks: true,
        });
      } catch {
        try {
          const vision = await getFileset();
          return await ImageSegmenter.createFromOptions(vision, {
            baseOptions: {
              modelAssetPath: SELFIE_MODEL_URL,
              delegate: 'CPU',
            },
            runningMode: 'IMAGE',
            outputCategoryMask: false,
            outputConfidenceMasks: true,
          });
        } catch {
          return null;
        }
      }
    })();
  }
  return selfieSegmenterPromise;
}

async function getDeepLabSegmenter(): Promise<ImageSegmenter | null> {
  if (!deeplabSegmenterPromise) {
    deeplabSegmenterPromise = (async () => {
      try {
        const vision = await getFileset();
        return await ImageSegmenter.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: DEEPLAB_MODEL_URL,
            delegate: 'GPU',
          },
          runningMode: 'IMAGE',
          outputCategoryMask: true,
          outputConfidenceMasks: false,
        });
      } catch {
        try {
          const vision = await getFileset();
          return await ImageSegmenter.createFromOptions(vision, {
            baseOptions: {
              modelAssetPath: DEEPLAB_MODEL_URL,
              delegate: 'CPU',
            },
            runningMode: 'IMAGE',
            outputCategoryMask: true,
            outputConfidenceMasks: false,
          });
        } catch {
          return null;
        }
      }
    })();
  }
  return deeplabSegmenterPromise;
}

function setCacheEntry(key: string, entry: MatteCacheEntry): void {
  if (matteCache.has(key)) {
    matteCache.delete(key);
  }
  matteCache.set(key, entry);
  if (matteCache.size > MAX_CACHE_ENTRIES) {
    const oldestKey = matteCache.keys().next().value;
    if (oldestKey) matteCache.delete(oldestKey);
  }
}

function setNeuralRecord(srcId: string, rec: NeuralAnalysisRecord): void {
  if (neuralAnalysisCache.has(srcId)) {
    neuralAnalysisCache.delete(srcId);
  }
  neuralAnalysisCache.set(srcId, rec);
  if (neuralAnalysisCache.size > MAX_NEURAL_ENTRIES) {
    const oldestKey = neuralAnalysisCache.keys().next().value;
    if (oldestKey) neuralAnalysisCache.delete(oldestKey);
  }
}

export function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '').trim();
  if (clean.length === 3) {
    const r = parseInt(clean[0] + clean[0], 16) || 0;
    const g = parseInt(clean[1] + clean[1], 16) || 0;
    const b = parseInt(clean[2] + clean[2], 16) || 0;
    return [r, g, b];
  }
  const full = clean.padEnd(6, '0').slice(0, 6);
  const num = parseInt(full, 16);
  if (Number.isNaN(num)) return [22, 163, 74];
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

function getSourceCacheId(source: HTMLImageElement | HTMLVideoElement): string {
  if (source instanceof HTMLVideoElement) {
    const frameBucket = Math.round((source.currentTime || 0) * 10);
    return `vid:${source.currentSrc || source.src || 'blob'}:f${frameBucket}`;
  }
  return `img:${source.currentSrc || source.src || 'inline'}`;
}

function drawScaledSource(
  source: HTMLImageElement | HTMLVideoElement,
  maxDim: number
): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; w: number; h: number } | null {
  const srcW =
    source instanceof HTMLVideoElement
      ? source.videoWidth
      : source.naturalWidth || source.width;
  const srcH =
    source instanceof HTMLVideoElement
      ? source.videoHeight
      : source.naturalHeight || source.height;
  if (!srcW || !srcH) return null;

  const scale = Math.min(1, maxDim / Math.max(srcW, srcH));
  const w = Math.max(24, Math.round(srcW * scale));
  const h = Math.max(24, Math.round(srcH * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  try {
    ctx.drawImage(source, 0, 0, w, h);
  } catch {
    return null;
  }
  return { canvas, ctx, w, h };
}

function safeGetImageData(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number
): ImageData | null {
  try {
    return ctx.getImageData(0, 0, w, h);
  } catch {
    return null;
  }
}

function buildSolidOpaqueMatte(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = 16;
  canvas.height = 16;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 16, 16);
  }
  return canvas;
}

function alphaArrayToCanvas(alpha: Uint8Array, w: number, h: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  const rgba = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const o = i * 4;
    rgba[o] = 255;
    rgba[o + 1] = 255;
    rgba[o + 2] = 255;
    rgba[o + 3] = alpha[i];
  }
  ctx.putImageData(new ImageData(rgba, w, h), 0, 0);
  return canvas;
}

/**
 * Joint color-guided 3x3 edge smoothing along matte boundaries so hair & clothing
 * edges snap to crisp color transitions in the source image.
 */
function refineAlphaWithSourceColor(
  alpha: Uint8Array,
  px: Uint8ClampedArray,
  w: number,
  h: number
): Uint8Array {
  const out = new Uint8Array(alpha);
  for (let y = 1; y < h - 1; y++) {
    const row = y * w;
    for (let x = 1; x < w - 1; x++) {
      const i = row + x;
      const a = alpha[i];
      // Check if pixel is near an alpha transition
      const nMin = Math.min(alpha[i - 1], alpha[i + 1], alpha[i - w], alpha[i + w]);
      const nMax = Math.max(alpha[i - 1], alpha[i + 1], alpha[i - w], alpha[i + w]);
      if (nMax - nMin < 24 && (a <= 6 || a >= 249)) continue;

      const idx = i * 4;
      const r0 = px[idx];
      const g0 = px[idx + 1];
      const b0 = px[idx + 2];

      let wSum = 0;
      let aSum = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const ni = (y + dy) * w + (x + dx);
          const nidx = ni * 4;
          const dr = px[nidx] - r0;
          const dg = px[nidx + 1] - g0;
          const db = px[nidx + 2] - b0;
          const colorDistSq = dr * dr * 0.3 + dg * dg * 0.59 + db * db * 0.11;
          const spatial = dx === 0 && dy === 0 ? 1.4 : 1.0;
          const weight = spatial * Math.exp(-colorDistSq / 420);
          wSum += weight;
          aSum += weight * alpha[ni];
        }
      }
      if (wSum > 0) {
        out[i] = Math.round(clamp(aSum / wSum, 0, 255));
      }
    }
  }
  return out;
}

/**
 * Fast 100% client-side border-connected saliency cutout.
 * Samples border color clusters, computes color distance + person skin/center prior,
 * and flood-fills from borders so interior subjects survive cleanly.
 */
function computeBorderSaliencyAlpha(
  px: Uint8ClampedArray,
  w: number,
  h: number,
  tolerance = 42,
  autoSubjectType: BgAutoSubjectType = 'smart'
): Uint8Array {
  const total = w * h;
  const borderBuckets = new Map<number, { r: number; g: number; b: number; weight: number }>();

  const samplePixel = (x: number, y: number, weight: number) => {
    const idx = (y * w + x) * 4;
    const r = px[idx];
    const g = px[idx + 1];
    const b = px[idx + 2];
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const existing = borderBuckets.get(key);
    if (existing) {
      const nw = existing.weight + weight;
      existing.r = (existing.r * existing.weight + r * weight) / nw;
      existing.g = (existing.g * existing.weight + g * weight) / nw;
      existing.b = (existing.b * existing.weight + b * weight) / nw;
      existing.weight = nw;
    } else {
      borderBuckets.set(key, { r, g, b, weight });
    }
  };

  for (let x = 0; x < w; x += 2) {
    const cornerBoost = x < w * 0.18 || x > w * 0.82 ? 2.5 : 1.3;
    samplePixel(x, 0, cornerBoost);
    samplePixel(x, 2, cornerBoost * 0.8);
    samplePixel(x, h - 1, 0.5);
  }
  for (let y = 0; y < h; y += 2) {
    const upperBoost = y < h * 0.65 ? 1.8 : 0.8;
    samplePixel(0, y, upperBoost);
    samplePixel(w - 1, y, upperBoost);
  }

  const bgClusters = Array.from(borderBuckets.values())
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 10);

  const bgDist = new Float32Array(total);
  const tolFactor = clamp(tolerance / 50, 0.35, 1.85);
  const bgThreshold = 34 * tolFactor;

  for (let y = 0; y < h; y++) {
    const ny = (y / h - (autoSubjectType === 'person' ? 0.5 : 0.54)) * 2;
    for (let x = 0; x < w; x++) {
      const nx = (x / w - 0.5) * 2;
      const centerDistSq = nx * nx + ny * ny;
      const i = y * w + x;
      const idx = i * 4;
      const r = px[idx];
      const g = px[idx + 1];
      const b = px[idx + 2];

      let minD = 999;
      for (let k = 0; k < bgClusters.length; k++) {
        const c = bgClusters[k];
        const dr = r - c.r;
        const dg = g - c.g;
        const db = b - c.b;
        const d = Math.sqrt(dr * dr * 0.3 + dg * dg * 0.59 + db * db * 0.11);
        if (d < minD) minD = d;
      }

      // Portrait / skin-tone heuristic boost when isolating people without neural model
      let personPrior = 0;
      if (autoSubjectType === 'person' && centerDistSq < 0.9) {
        const isSkinTone =
          r > 95 &&
          g > 40 &&
          b > 20 &&
          r > g &&
          r > b &&
          Math.abs(r - g) > 15 &&
          Math.max(r, g, b) - Math.min(r, g, b) > 15;
        if (isSkinTone) personPrior = 14;
      }

      const centerBonus = Math.max(0, 1 - centerDistSq * 0.85) * 14;
      bgDist[i] = minD + centerBonus + personPrior;
    }
  }

  const visited = new Uint8Array(total);
  const isBg = new Uint8Array(total);
  const queue = new Int32Array(total);
  let head = 0;
  let tail = 0;

  const trySeed = (i: number) => {
    if (!visited[i] && bgDist[i] < bgThreshold * 1.15) {
      visited[i] = 1;
      isBg[i] = 1;
      queue[tail++] = i;
    }
  };

  for (let x = 0; x < w; x++) {
    trySeed(x);
    trySeed((h - 1) * w + x);
  }
  for (let y = 0; y < h; y++) {
    trySeed(y * w);
    trySeed(y * w + (w - 1));
  }

  while (head < tail) {
    const curr = queue[head++];
    const cx = curr % w;
    const cy = (curr / w) | 0;

    const neighbors = [
      cx > 0 ? curr - 1 : -1,
      cx < w - 1 ? curr + 1 : -1,
      cy > 0 ? curr - w : -1,
      cy < h - 1 ? curr + w : -1,
    ];

    for (let n = 0; n < 4; n++) {
      const ni = neighbors[n];
      if (ni !== -1 && !visited[ni]) {
        visited[ni] = 1;
        if (bgDist[ni] < bgThreshold) {
          isBg[ni] = 1;
          queue[tail++] = ni;
        }
      }
    }
  }

  const alpha = new Uint8Array(total);
  for (let i = 0; i < total; i++) {
    let a = 255;
    if (isBg[i]) {
      const ramp = clamp(
        (bgDist[i] - bgThreshold * 0.86) / Math.max(3, bgThreshold * 0.2),
        0,
        1
      );
      a = Math.round(ramp * 55);
    } else if (bgDist[i] < bgThreshold * 1.2) {
      const edgeT = clamp(
        (bgDist[i] - bgThreshold * 0.85) / Math.max(3, bgThreshold * 0.35),
        0,
        1
      );
      a = Math.round(135 + edgeT * 120);
    }
    alpha[i] = a;
  }

  return refineAlphaWithSourceColor(alpha, px, w, h);
}

async function runNeuralAnalysis(
  srcId: string,
  source: HTMLImageElement | HTMLVideoElement,
  onReady?: () => void
): Promise<void> {
  const existing = neuralAnalysisCache.get(srcId);
  if (existing?.done || pendingNeuralJobs.has(srcId)) return;
  pendingNeuralJobs.add(srcId);

  try {
    const scaled = drawScaledSource(source, 448);
    if (!scaled) return;

    const record: NeuralAnalysisRecord = {
      selfieCoverage: 0,
      deeplabPersonCoverage: 0,
      deeplabAnyCoverage: 0,
      done: false,
    };

    // 1. Selfie Segmenter (dedicated Person / Portrait segmentation with soft hair/edge confidence)
    const selfieSeg = await getSelfieSegmenter();
    if (selfieSeg) {
      const result = selfieSeg.segment(scaled.canvas);
      const mask = result.confidenceMasks?.[0];
      if (mask) {
        const w = mask.width;
        const h = mask.height;
        const rawArr = mask.getAsFloat32Array();
        const copy = new Float32Array(rawArr);
        let fgPixels = 0;
        for (let i = 0; i < copy.length; i++) {
          if (copy[i] > 0.42) fgPixels++;
        }
        record.selfieMask = copy;
        record.selfieW = w;
        record.selfieH = h;
        record.selfieCoverage = fgPixels / Math.max(1, copy.length);
        mask.close?.();
      }
      result.close?.();
    }

    // 2. DeepLab v3 (21 Pascal VOC classes: person=15, animals, vehicles, furniture, bottles, etc.)
    const deeplabSeg = await getDeepLabSegmenter();
    if (deeplabSeg) {
      const result = deeplabSeg.segment(scaled.canvas);
      const cat = result.categoryMask;
      if (cat) {
        const w = cat.width;
        const h = cat.height;
        const rawArr = cat.getAsUint8Array();
        const copy = new Uint8Array(rawArr);
        let personPx = 0;
        let anyPx = 0;
        for (let i = 0; i < copy.length; i++) {
          if (copy[i] !== 0) anyPx++;
          if (copy[i] === DEEPLAB_PERSON_CLASS) personPx++;
        }
        record.deeplabCat = copy;
        record.deeplabW = w;
        record.deeplabH = h;
        record.deeplabPersonCoverage = personPx / Math.max(1, copy.length);
        record.deeplabAnyCoverage = anyPx / Math.max(1, copy.length);
        cat.close?.();
      }
      result.close?.();
    }

    record.done = true;
    setNeuralRecord(srcId, record);
    onReady?.();
  } catch {
    setNeuralRecord(srcId, {
      selfieCoverage: 0,
      deeplabPersonCoverage: 0,
      deeplabAnyCoverage: 0,
      done: true,
    });
  } finally {
    pendingNeuralJobs.delete(srcId);
  }
}

/**
 * Resamples a neural mask buffer onto target (w x h) dimensions cleanly.
 */
function sampleSelfieMaskResized(
  rec: NeuralAnalysisRecord,
  w: number,
  h: number,
  tolerance = 42
): Uint8Array | null {
  if (!rec.selfieMask || !rec.selfieW || !rec.selfieH) return null;
  const sw = rec.selfieW;
  const sh = rec.selfieH;
  const src = rec.selfieMask;
  const out = new Uint8Array(w * h);

  // Higher tolerance slightly tightens background removal around soft halo edges
  const cutoffShift = ((tolerance - 42) / 100) * 0.14;
  const lowCut = clamp(0.18 + cutoffShift, 0.05, 0.45);
  const span = 0.62;

  for (let y = 0; y < h; y++) {
    const sy = clamp((y / Math.max(1, h - 1)) * (sh - 1), 0, sh - 1);
    const y0 = Math.floor(sy);
    const y1 = Math.min(sh - 1, y0 + 1);
    const fy = sy - y0;
    for (let x = 0; x < w; x++) {
      const sx = clamp((x / Math.max(1, w - 1)) * (sw - 1), 0, sw - 1);
      const x0 = Math.floor(sx);
      const x1 = Math.min(sw - 1, x0 + 1);
      const fx = sx - x0;

      const c00 = src[y0 * sw + x0];
      const c10 = src[y0 * sw + x1];
      const c01 = src[y1 * sw + x0];
      const c11 = src[y1 * sw + x1];
      const conf =
        (c00 * (1 - fx) + c10 * fx) * (1 - fy) + (c01 * (1 - fx) + c11 * fx) * fy;

      const shaped = clamp((conf - lowCut) / span, 0, 1);
      out[y * w + x] = Math.round(shaped * 255);
    }
  }
  return out;
}

function sampleDeepLabResized(
  rec: NeuralAnalysisRecord,
  w: number,
  h: number,
  onlyPerson: boolean
): Uint8Array | null {
  if (!rec.deeplabCat || !rec.deeplabW || !rec.deeplabH) return null;
  const sw = rec.deeplabW;
  const sh = rec.deeplabH;
  const src = rec.deeplabCat;
  const out = new Uint8Array(w * h);

  for (let y = 0; y < h; y++) {
    const sy = Math.min(sh - 1, Math.round((y / Math.max(1, h - 1)) * (sh - 1)));
    for (let x = 0; x < w; x++) {
      const sx = Math.min(sw - 1, Math.round((x / Math.max(1, w - 1)) * (sw - 1)));
      const cat = src[sy * sw + sx];
      const keep = onlyPerson ? cat === DEEPLAB_PERSON_CLASS : cat !== 0;
      out[y * w + x] = keep ? 255 : 0;
    }
  }
  return out;
}

/**
 * Extracts a single connected person or semantic object or color+edge region
 * around a user-clicked normalized point (nx, ny).
 */
function extractPickedSubjectAlpha(
  px: Uint8ClampedArray,
  w: number,
  h: number,
  pt: BgPickPoint,
  defaultTolerance: number,
  neural?: NeuralAnalysisRecord
): Uint8Array {
  const total = w * h;
  const alpha = new Uint8Array(total);
  const cx = clamp(Math.round(pt.x * (w - 1)), 0, w - 1);
  const cy = clamp(Math.round(pt.y * (h - 1)), 0, h - 1);
  const seedIdx = cy * w + cx;
  const tol = clamp(pt.tolerance ?? defaultTolerance, 5, 95);

  // 1. Check if click hits a detected Person in SelfieSegmenter (grabs ONLY that clicked person!)
  if (neural?.selfieMask && neural.selfieW && neural.selfieH) {
    const sw = neural.selfieW;
    const sh = neural.selfieH;
    const sx = clamp(Math.round(pt.x * (sw - 1)), 0, sw - 1);
    const sy = clamp(Math.round(pt.y * (sh - 1)), 0, sh - 1);
    const seedConf = neural.selfieMask[sy * sw + sx];
    if (seedConf >= 0.4) {
      const comp = new Uint8Array(sw * sh);
      const queue = new Int32Array(sw * sh);
      let head = 0;
      let tail = 0;
      const start = sy * sw + sx;
      comp[start] = 1;
      queue[tail++] = start;
      while (head < tail) {
        const curr = queue[head++];
        const x = curr % sw;
        const y = (curr / sw) | 0;
        const nbs = [
          x > 0 ? curr - 1 : -1,
          x < sw - 1 ? curr + 1 : -1,
          y > 0 ? curr - sw : -1,
          y < sh - 1 ? curr + sw : -1,
        ];
        for (let k = 0; k < 4; k++) {
          const ni = nbs[k];
          if (ni !== -1 && !comp[ni] && neural.selfieMask[ni] >= 0.26) {
            comp[ni] = 1;
            queue[tail++] = ni;
          }
        }
      }
      if (tail > 12) {
        for (let y = 0; y < h; y++) {
          const py0 = clamp((y / Math.max(1, h - 1)) * (sh - 1), 0, sh - 1);
          const iy = Math.round(py0);
          for (let x = 0; x < w; x++) {
            const px0 = clamp((x / Math.max(1, w - 1)) * (sw - 1), 0, sw - 1);
            const ix = Math.round(px0);
            const si = iy * sw + ix;
            if (comp[si]) {
              const conf = clamp((neural.selfieMask[si] - 0.18) / 0.62, 0, 1);
              alpha[y * w + x] = Math.round(conf * 255);
            }
          }
        }
        return refineAlphaWithSourceColor(alpha, px, w, h);
      }
    }
  }

  // 2. Check if click hits a DeepLab semantic object or person connected component
  if (neural?.deeplabCat && neural.deeplabW && neural.deeplabH) {
    const dw = neural.deeplabW;
    const dh = neural.deeplabH;
    const dx = clamp(Math.round(pt.x * (dw - 1)), 0, dw - 1);
    const dy = clamp(Math.round(pt.y * (dh - 1)), 0, dh - 1);
    const targetCat = neural.deeplabCat[dy * dw + dx];
    if (targetCat !== 0) {
      const comp = new Uint8Array(dw * dh);
      const queue = new Int32Array(dw * dh);
      let head = 0;
      let tail = 0;
      const start = dy * dw + dx;
      comp[start] = 1;
      queue[tail++] = start;
      while (head < tail) {
        const curr = queue[head++];
        const x = curr % dw;
        const y = (curr / dw) | 0;
        const nbs = [
          x > 0 ? curr - 1 : -1,
          x < dw - 1 ? curr + 1 : -1,
          y > 0 ? curr - dw : -1,
          y < dh - 1 ? curr + dw : -1,
        ];
        for (let k = 0; k < 4; k++) {
          const ni = nbs[k];
          if (ni !== -1 && !comp[ni] && neural.deeplabCat[ni] === targetCat) {
            comp[ni] = 1;
            queue[tail++] = ni;
          }
        }
      }
      if (tail > 12) {
        for (let y = 0; y < h; y++) {
          const iy = Math.min(dh - 1, Math.round((y / Math.max(1, h - 1)) * (dh - 1)));
          for (let x = 0; x < w; x++) {
            const ix = Math.min(dw - 1, Math.round((x / Math.max(1, w - 1)) * (dw - 1)));
            alpha[y * w + x] = comp[iy * dw + ix] ? 255 : 0;
          }
        }
        return refineAlphaWithSourceColor(alpha, px, w, h);
      }
    }
  }

  // 3. Fast synchronous edge-aware color region grow from clicked pixel (works for any object/region!)
  let sr = 0;
  let sg = 0;
  let sb = 0;
  let sCount = 0;
  for (let oy = -1; oy <= 1; oy++) {
    for (let ox = -1; ox <= 1; ox++) {
      const sx = clamp(cx + ox, 0, w - 1);
      const sy = clamp(cy + oy, 0, h - 1);
      const idx = (sy * w + sx) * 4;
      sr += px[idx];
      sg += px[idx + 1];
      sb += px[idx + 2];
      sCount++;
    }
  }
  sr /= sCount;
  sg /= sCount;
  sb /= sCount;

  // Compute local Sobel gradient magnitude for edge stopping
  const grad = new Float32Array(total);
  const lumaAt = (ix: number, iy: number) => {
    const p = (clamp(iy, 0, h - 1) * w + clamp(ix, 0, w - 1)) * 4;
    return px[p] * 0.299 + px[p + 1] * 0.587 + px[p + 2] * 0.114;
  };
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const gx =
        -lumaAt(x - 1, y - 1) +
        lumaAt(x + 1, y - 1) -
        2 * lumaAt(x - 1, y) +
        2 * lumaAt(x + 1, y) -
        lumaAt(x - 1, y + 1) +
        lumaAt(x + 1, y + 1);
      const gy =
        -lumaAt(x - 1, y - 1) -
        2 * lumaAt(x, y - 1) -
        lumaAt(x + 1, y - 1) +
        lumaAt(x - 1, y + 1) +
        2 * lumaAt(x, y + 1) +
        lumaAt(x + 1, y + 1);
      grad[y * w + x] = Math.min(255, Math.hypot(gx, gy) * 0.25);
    }
  }

  const seedDistThresh = 14 + (tol / 100) * 86;
  const neighborStepThresh = 18 + (tol / 100) * 62;

  const visited = new Uint8Array(total);
  const mask = new Uint8Array(total);
  const queue = new Int32Array(total);
  let head = 0;
  let tail = 0;

  visited[seedIdx] = 1;
  mask[seedIdx] = 1;
  queue[tail++] = seedIdx;

  while (head < tail) {
    const curr = queue[head++];
    const x = curr % w;
    const y = (curr / w) | 0;
    const cIdx = curr * 4;
    const cr = px[cIdx];
    const cg = px[cIdx + 1];
    const cb = px[cIdx + 2];

    const nbs = [
      x > 0 ? curr - 1 : -1,
      x < w - 1 ? curr + 1 : -1,
      y > 0 ? curr - w : -1,
      y < h - 1 ? curr + w : -1,
    ];

    for (let n = 0; n < 4; n++) {
      const ni = nbs[n];
      if (ni === -1 || visited[ni]) continue;
      visited[ni] = 1;

      const nIdx = ni * 4;
      const nr = px[nIdx];
      const ng = px[nIdx + 1];
      const nb = px[nIdx + 2];

      const drs = nr - sr;
      const dgs = ng - sg;
      const dbs = nb - sb;
      const seedDist = Math.sqrt(drs * drs * 0.3 + dgs * dgs * 0.59 + dbs * dbs * 0.11);

      const drn = nr - cr;
      const dgn = ng - cg;
      const dbn = nb - cb;
      const stepDist =
        Math.sqrt(drn * drn * 0.3 + dgn * dgn * 0.59 + dbn * dbn * 0.11) + grad[ni] * 0.42;

      if (seedDist <= seedDistThresh && stepDist <= neighborStepThresh) {
        mask[ni] = 1;
        queue[tail++] = ni;
      }
    }
  }

  // Fill tiny enclosed specular/shadow holes inside the picked subject (flood outside from borders)
  const outside = new Uint8Array(total);
  head = 0;
  tail = 0;
  const tryBorder = (i: number) => {
    if (!mask[i] && !outside[i]) {
      outside[i] = 1;
      queue[tail++] = i;
    }
  };
  for (let x = 0; x < w; x++) {
    tryBorder(x);
    tryBorder((h - 1) * w + x);
  }
  for (let y = 0; y < h; y++) {
    tryBorder(y * w);
    tryBorder(y * w + (w - 1));
  }
  while (head < tail) {
    const curr = queue[head++];
    const x = curr % w;
    const y = (curr / w) | 0;
    const nbs = [
      x > 0 ? curr - 1 : -1,
      x < w - 1 ? curr + 1 : -1,
      y > 0 ? curr - w : -1,
      y < h - 1 ? curr + w : -1,
    ];
    for (let n = 0; n < 4; n++) {
      const ni = nbs[n];
      if (ni !== -1 && !outside[ni] && !mask[ni]) {
        outside[ni] = 1;
        queue[tail++] = ni;
      }
    }
  }

  for (let i = 0; i < total; i++) {
    alpha[i] = outside[i] ? 0 : 255;
  }

  return refineAlphaWithSourceColor(alpha, px, w, h);
}

function applyPickPointsToAlpha(
  baseAlpha: Uint8Array,
  px: Uint8ClampedArray,
  w: number,
  h: number,
  pickPoints: BgPickPoint[],
  tolerance: number,
  mode: 'auto' | 'pick',
  neural?: NeuralAnalysisRecord
): Uint8Array {
  const total = w * h;
  const keepPoints = pickPoints.filter((p) => p.action === 'keep');
  const removePoints = pickPoints.filter((p) => p.action === 'remove');

  const out = new Uint8Array(total);
  if (mode === 'pick') {
    if (keepPoints.length > 0) {
      out.fill(0);
    } else {
      // Only remove-picks clicked (or none yet): start opaque so picked subjects are cleanly removed!
      out.fill(255);
    }
  } else {
    out.set(baseAlpha);
  }

  for (const pt of keepPoints) {
    const pMask = extractPickedSubjectAlpha(px, w, h, pt, tolerance, neural);
    for (let i = 0; i < total; i++) {
      if (pMask[i] > out[i]) out[i] = pMask[i];
    }
  }

  for (const pt of removePoints) {
    const rMask = extractPickedSubjectAlpha(px, w, h, pt, tolerance, neural);
    for (let i = 0; i < total; i++) {
      const remaining = Math.round((out[i] * (255 - rMask[i])) / 255);
      out[i] = remaining;
    }
  }

  return out;
}

function computeChromaKeyMatte(
  source: HTMLImageElement | HTMLVideoElement,
  chromaColor: string,
  tolerance: number
): HTMLCanvasElement {
  const scaled = drawScaledSource(source, 320);
  if (!scaled) return buildSolidOpaqueMatte();

  const { ctx, w, h } = scaled;
  const imgData = safeGetImageData(ctx, w, h);
  if (!imgData) return buildSolidOpaqueMatte();
  const px = imgData.data;
  const [kr, kg, kb] = hexToRgb(chromaColor);

  const tolDist = 18 + (clamp(tolerance, 0, 100) / 100) * 145;
  const rampWidth = Math.max(12, tolDist * 0.35);

  const alpha = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const idx = i * 4;
    const dr = px[idx] - kr;
    const dg = px[idx + 1] - kg;
    const db = px[idx + 2] - kb;
    const dist = Math.sqrt(dr * dr * 0.3 + dg * dg * 0.59 + db * db * 0.11);
    const a = clamp((dist - tolDist * 0.72) / rampWidth, 0, 1);
    alpha[i] = Math.round(a * 255);
  }

  return alphaArrayToCanvas(alpha, w, h);
}

function computeLumaKeyMatte(
  source: HTMLImageElement | HTMLVideoElement,
  lumaTarget: 'bright' | 'dark',
  tolerance: number
): HTMLCanvasElement {
  const scaled = drawScaledSource(source, 320);
  if (!scaled) return buildSolidOpaqueMatte();

  const { ctx, w, h } = scaled;
  const imgData = safeGetImageData(ctx, w, h);
  if (!imgData) return buildSolidOpaqueMatte();
  const px = imgData.data;

  const cutoff =
    lumaTarget === 'bright'
      ? 245 - (clamp(tolerance, 0, 100) / 100) * 185
      : 10 + (clamp(tolerance, 0, 100) / 100) * 185;
  const ramp = 36;

  const alpha = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const idx = i * 4;
    const luma = px[idx] * 0.299 + px[idx + 1] * 0.587 + px[idx + 2] * 0.114;
    const fgScore =
      lumaTarget === 'bright'
        ? clamp((cutoff - luma + ramp * 0.5) / ramp, 0, 1)
        : clamp((luma - cutoff + ramp * 0.5) / ramp, 0, 1);
    alpha[i] = Math.round(fgScore * 255);
  }

  return alphaArrayToCanvas(alpha, w, h);
}

let emptyDrawnMatteCanvas: HTMLCanvasElement | null = null;

function getEmptyDrawnMatte(): HTMLCanvasElement {
  if (!emptyDrawnMatteCanvas) {
    emptyDrawnMatteCanvas = document.createElement('canvas');
    emptyDrawnMatteCanvas.width = 16;
    emptyDrawnMatteCanvas.height = 16;
  }
  return emptyDrawnMatteCanvas;
}

export function hasDrawnCutoutData(bg?: BgRemovalSettings | null): boolean {
  if (!bg) return false;
  return (
    (bg.strokes?.length || 0) > 0 ||
    (bg.drawnPolygons?.length || 0) > 0 ||
    (bg.pickPoints?.length || 0) > 0
  );
}

/**
 * Returns a cached or freshly computed source-space alpha matte canvas (white=subject, transparent=background).
 * Always returns immediately synchronously so rendering never stalls; triggers `onReady` when neural refinement finishes.
 */
export function getSourceSubjectMatte(
  source: HTMLImageElement | HTMLVideoElement,
  bgRemoval: BgRemovalSettings,
  onReady?: () => void
): HTMLCanvasElement {
  if (bgRemoval.mode === 'drawn') {
    return getEmptyDrawnMatte();
  }

  const srcId = getSourceCacheId(source);

  if (bgRemoval.mode === 'chroma') {
    const key = `chroma:${srcId}:${bgRemoval.chromaColor}:${Math.round(bgRemoval.tolerance)}`;
    const hit = matteCache.get(key);
    if (hit) return hit.canvas;
    const matte = computeChromaKeyMatte(source, bgRemoval.chromaColor, bgRemoval.tolerance);
    setCacheEntry(key, { canvas: matte, quality: 'sync' });
    return matte;
  }

  if (bgRemoval.mode === 'luma') {
    const key = `luma:${srcId}:${bgRemoval.lumaTarget}:${Math.round(bgRemoval.tolerance)}`;
    const hit = matteCache.get(key);
    if (hit) return hit.canvas;
    const matte = computeLumaKeyMatte(source, bgRemoval.lumaTarget, bgRemoval.tolerance);
    setCacheEntry(key, { canvas: matte, quality: 'sync' });
    return matte;
  }

  const pickPoints = bgRemoval.pickPoints || [];
  const pickSig =
    pickPoints.length === 0
      ? 'none'
      : pickPoints
          .map((p) => `${p.action[0]}@${p.x.toFixed(3)},${p.y.toFixed(3)}`)
          .join('|');
  const autoType: BgAutoSubjectType = bgRemoval.autoSubjectType || 'smart';
  const neural = neuralAnalysisCache.get(srcId);
  const neuralTag = neural?.done ? 'n1' : 'n0';

  if (bgRemoval.mode === 'pick') {
    if (pickPoints.length === 0) {
      return buildSolidOpaqueMatte();
    }
    const pickKey = `pick:${srcId}:${Math.round(bgRemoval.tolerance)}:${neuralTag}:${pickSig}`;
    const hit = matteCache.get(pickKey);
    if (hit) {
      if (!neural?.done) void runNeuralAnalysis(srcId, source, onReady);
      return hit.canvas;
    }

    const scaled = drawScaledSource(source, 256);
    const imgData = scaled ? safeGetImageData(scaled.ctx, scaled.w, scaled.h) : null;
    if (!scaled || !imgData) return buildSolidOpaqueMatte();

    const emptyBase = new Uint8Array(scaled.w * scaled.h);
    const combined = applyPickPointsToAlpha(
      emptyBase,
      imgData.data,
      scaled.w,
      scaled.h,
      pickPoints,
      bgRemoval.tolerance,
      'pick',
      neural
    );
    const matteCanvas = alphaArrayToCanvas(combined, scaled.w, scaled.h);
    setCacheEntry(pickKey, { canvas: matteCanvas, quality: neural?.done ? 'neural' : 'sync' });
    if (!neural?.done) {
      void runNeuralAnalysis(srcId, source, onReady);
    }
    return matteCanvas;
  }

  // Auto Subject Mode (Person-aware + Object detection + Optional Pick Refinements)
  const autoKey = `auto:${srcId}:${autoType}:${Math.round(bgRemoval.tolerance)}:${neuralTag}:${pickSig}`;
  const hit = matteCache.get(autoKey);
  if (hit) {
    if (!neural?.done) {
      void runNeuralAnalysis(srcId, source, onReady);
    }
    return hit.canvas;
  }

  const maxWorkDim = neural?.done ? 360 : 224;
  const scaled = drawScaledSource(source, maxWorkDim);
  const imgData = scaled ? safeGetImageData(scaled.ctx, scaled.w, scaled.h) : null;
  if (!scaled || !imgData) {
    return buildSolidOpaqueMatte();
  }

  const { w, h } = scaled;
  const px = imgData.data;

  let baseAlpha: Uint8Array | null = null;

  if (neural?.done) {
    if (autoType === 'person') {
      if (neural.selfieCoverage > 0.008 && neural.selfieCoverage < 0.985) {
        baseAlpha = sampleSelfieMaskResized(neural, w, h, bgRemoval.tolerance);
      } else if (
        neural.deeplabPersonCoverage > 0.008 &&
        neural.deeplabPersonCoverage < 0.985
      ) {
        baseAlpha = sampleDeepLabResized(neural, w, h, true);
      }
    } else if (autoType === 'object') {
      if (neural.deeplabAnyCoverage > 0.008 && neural.deeplabAnyCoverage < 0.985) {
        baseAlpha = sampleDeepLabResized(neural, w, h, false);
      }
    } else {
      // 'smart': prioritize SelfieSegmenter (people) -> DeepLab person -> DeepLab any object
      if (neural.selfieCoverage > 0.01 && neural.selfieCoverage < 0.975) {
        baseAlpha = sampleSelfieMaskResized(neural, w, h, bgRemoval.tolerance);
      } else if (
        neural.deeplabPersonCoverage > 0.01 &&
        neural.deeplabPersonCoverage < 0.975
      ) {
        baseAlpha = sampleDeepLabResized(neural, w, h, true);
      } else if (
        neural.deeplabAnyCoverage > 0.01 &&
        neural.deeplabAnyCoverage < 0.975
      ) {
        baseAlpha = sampleDeepLabResized(neural, w, h, false);
      }
    }

    if (baseAlpha) {
      baseAlpha = refineAlphaWithSourceColor(baseAlpha, px, w, h);
    }
  }

  if (!baseAlpha) {
    baseAlpha = computeBorderSaliencyAlpha(px, w, h, bgRemoval.tolerance, autoType);
  }

  if (pickPoints.length > 0) {
    baseAlpha = applyPickPointsToAlpha(
      baseAlpha,
      px,
      w,
      h,
      pickPoints,
      bgRemoval.tolerance,
      'auto',
      neural
    );
  }

  const matteCanvas = alphaArrayToCanvas(baseAlpha, w, h);
  setCacheEntry(autoKey, { canvas: matteCanvas, quality: neural?.done ? 'neural' : 'sync' });
  if (!neural?.done) {
    void runNeuralAnalysis(srcId, source, onReady);
  }
  return matteCanvas;
}
