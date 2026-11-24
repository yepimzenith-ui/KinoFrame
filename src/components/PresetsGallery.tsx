import React, { useEffect, useRef, useState } from 'react';
import { Lock, X } from 'lucide-react';
import { DEFAULT_COLOR_GRADE, FILM_PRESETS, SAMPLE_MEDIA_ASSETS } from '../data/presets';
import { EditDocument, FilmPreset } from '../types/editor';
import { renderFrameToCanvas } from '../utils/renderEngine';

interface PresetsGalleryProps {
  isOpen: boolean;
  isAuthenticated: boolean;
  activePresetId: string;
  sourceElement: HTMLImageElement | HTMLVideoElement | null;
  baseEdits: EditDocument;
  onApplyPreset: (presetId: string) => void;
  onRequireAuth: (reason: string) => void;
  onClose: () => void;
}

const PresetPreviewCard: React.FC<{
  preset: FilmPreset;
  isActive: boolean;
  isLocked: boolean;
  sourceElement: HTMLImageElement | HTMLVideoElement | null;
  baseEdits: EditDocument;
  onSelect: () => void;
}> = ({ preset, isActive, isLocked, sourceElement, baseEdits, onSelect }) => {
  const thumbCanvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = thumbCanvasRef.current;
    if (!canvas || !sourceElement) return;
    const previewEdits: EditDocument = {
      ...baseEdits,
      color: {
        ...DEFAULT_COLOR_GRADE,
        ...preset.grade,
        presetId: preset.id,
      },
      effects: {
        ...baseEdits.effects,
        vignette: preset.vignette ?? baseEdits.effects.vignette,
        grain: preset.grain ?? baseEdits.effects.grain,
      },
      overlays: [],
    };
    renderFrameToCanvas(canvas, sourceElement, { edits: previewEdits });
  }, [preset, sourceElement, baseEdits]);

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`text-left rounded-lg border overflow-hidden transition-colors cursor-pointer ${
        isActive
          ? 'border-amber-500 bg-zinc-900'
          : 'border-zinc-800 bg-zinc-900/50 hover:border-zinc-600'
      }`}
    >
      <div className="relative aspect-video w-full bg-zinc-950 overflow-hidden">
        <canvas ref={thumbCanvasRef} width={320} height={180} className="w-full h-full block" />
        {isLocked && (
          <span className="absolute top-2 right-2 px-1.5 py-0.5 rounded bg-zinc-950/85 border border-zinc-700 text-[10px] font-medium text-amber-300 flex items-center gap-1">
            <Lock className="w-2.5 h-2.5" />
            <span>Sign in</span>
          </span>
        )}
      </div>
      <div className="p-3">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-semibold text-zinc-100">{preset.name}</span>
          {isActive && (
            <span className="text-[11px] font-mono text-amber-400">Active</span>
          )}
        </div>
        <p className="text-xs text-zinc-400 mt-0.5">{preset.subtitle}</p>
      </div>
    </button>
  );
};

export const PresetsGallery: React.FC<PresetsGalleryProps> = ({
  isOpen,
  isAuthenticated,
  activePresetId,
  sourceElement,
  baseEdits,
  onApplyPreset,
  onRequireAuth,
  onClose,
}) => {
  const [fallbackImg, setFallbackImg] = useState<HTMLImageElement | null>(null);

  useEffect(() => {
    if (!isOpen || sourceElement) return;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => setFallbackImg(img);
    img.src = SAMPLE_MEDIA_ASSETS[0].src;
  }, [isOpen, sourceElement]);

  if (!isOpen) return null;

  const previewSource = sourceElement || fallbackImg;

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-6">
      <div className="w-full max-w-3xl rounded-xl border border-zinc-800 bg-zinc-950 shadow-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-zinc-800 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-zinc-50">Film Stock Presets</h2>
            <p className="text-xs text-zinc-400 mt-0.5">
              {!isAuthenticated
                ? 'Log in to apply Film Stock Presets to your clips and photos.'
                : sourceElement
                  ? 'Live previews rendered from your active frame'
                  : 'Preview looks before applying to your clip or photo'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {!isAuthenticated && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onRequireAuth('Sign in or create a free account to apply Film Stock Presets.');
                }}
                className="px-3 py-1.5 text-xs font-semibold rounded-md bg-amber-400 text-zinc-950 hover:bg-amber-300 transition-colors cursor-pointer whitespace-nowrap"
              >
                Log In to Unlock
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close presets"
              className="p-2 rounded-md text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="p-6 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 max-h-[75vh] overflow-y-auto studio-scroll">
          {FILM_PRESETS.map((preset) => (
            <PresetPreviewCard
              key={preset.id}
              preset={preset}
              isActive={activePresetId === preset.id}
              isLocked={!isAuthenticated}
              sourceElement={previewSource}
              baseEdits={baseEdits}
              onSelect={() => {
                if (!isAuthenticated) {
                  onClose();
                  onRequireAuth(`Sign in to apply the ${preset.name} Film Stock Preset.`);
                  return;
                }
                onApplyPreset(preset.id);
                onClose();
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
};
