import React, { useEffect, useState } from 'react';
import { CopyPlus, Save, X } from 'lucide-react';

interface SaveProjectModalProps {
  isOpen: boolean;
  currentProjectId: string | null;
  defaultName: string;
  mode: 'timeline' | 'photo';
  clipCount: number;
  saving: boolean;
  onSave: (name: string, asNewCopy: boolean) => Promise<void>;
  onClose: () => void;
}

export const SaveProjectModal: React.FC<SaveProjectModalProps> = ({
  isOpen,
  currentProjectId,
  defaultName,
  mode,
  clipCount,
  saving,
  onSave,
  onClose,
}) => {
  const [name, setName] = useState(defaultName);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setName(defaultName);
      setError(null);
    }
  }, [isOpen, defaultName]);

  if (!isOpen) return null;

  const handleSubmit = async (asNewCopy: boolean) => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Please enter a project title.');
      return;
    }
    setError(null);
    try {
      await onSave(trimmed, asNewCopy);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save project.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-xl border border-zinc-800 bg-zinc-950 shadow-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-zinc-800 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-zinc-50">
              {currentProjectId ? 'Save Project' : 'Save New Project'}
            </h2>
            <p className="text-xs text-zinc-400">
              {mode === 'timeline'
                ? `Video timeline (${clipCount} clips, keyframes & audio cues)`
                : 'Photo grading session & color adjustments'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close save dialog"
            className="p-1.5 rounded-md text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void handleSubmit(false);
          }}
          className="p-5 space-y-4"
        >
          <div className="space-y-1.5">
            <label htmlFor="project-name-input" className="block text-xs font-medium text-zinc-300">
              Project Name
            </label>
            <input
              id="project-name-input"
              type="text"
              maxLength={100}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Tokyo Velocity Cut"
              autoFocus
              className="w-full px-3 py-2 text-sm bg-zinc-900 border border-zinc-700 focus:border-amber-500 rounded-md text-zinc-100 outline-none"
            />
          </div>

          {error && (
            <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded-md px-3 py-2">
              {error}
            </p>
          )}

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-800">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 text-xs font-medium rounded-md border border-zinc-700 bg-zinc-900 text-zinc-200 hover:border-zinc-500 cursor-pointer"
            >
              Cancel
            </button>
            {currentProjectId && (
              <button
                type="button"
                disabled={saving}
                onClick={() => void handleSubmit(true)}
                className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-md border border-zinc-700 bg-zinc-900 text-zinc-100 hover:border-amber-500 cursor-pointer disabled:opacity-50"
              >
                <CopyPlus className="w-3.5 h-3.5" />
                <span>Save as Copy</span>
              </button>
            )}
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-md bg-zinc-50 text-zinc-950 hover:bg-amber-400 transition-colors cursor-pointer disabled:opacity-50"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{saving ? 'Saving...' : currentProjectId ? 'Update Project' : 'Save Project'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
