import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { SAMPLE_MEDIA_ASSETS } from '../data/presets';
import {
  AspectRatioId,
  AudioAsset,
  AudioClip,
  EditDocument,
  MediaAsset,
  TimelineClip,
  TimelineOverlayItem,
} from '../types/editor';
import { clamp } from '../utils/timecode';
import { db, handleFirestoreError, OperationType, User } from './firebase';

export const BLUEPRINT_LIMITS = {
  MAX_ID_LEN: 128,
  ID_REGEX: /^[a-zA-Z0-9_-]+$/,
  USERNAME_MIN: 3,
  USERNAME_MAX: 24,
  USERNAME_REGEX: /^[a-z0-9_-]{3,24}$/,
  MAX_DISPLAY_NAME: 80,
  MAX_EMAIL: 160,
  MAX_PHOTO_URL: 500,
  MAX_PROJECT_NAME: 100,
  MIN_BPM: 40,
  MAX_BPM: 240,
  MAX_CLIPS: 60,
  MAX_OVERLAYS: 40,
  MAX_AUDIO_CLIPS: 20,
  MAX_PHOTO_EDITS: 30,
  MAX_DURATION: 3600,
} as const;

const ALLOWED_SEQUENCE_ASPECTS: AspectRatioId[] = ['16:9', '9:16', '1:1', '4:5', '2.39:1'];
const PENDING_USERNAME_PREFIX = 'kinoframe_pending_username_';

export interface SavedAudioClipRef {
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
}

export interface SavedProjectRecord {
  id: string;
  ownerId: string;
  name: string;
  mode: 'timeline' | 'photo';
  sequenceAspect: AspectRatioId;
  beatBpm: number;
  activeAssetId: string;
  previewAssetId: string;
  clipCount: number;
  totalDuration: number;
  clips: TimelineClip[];
  globalOverlays: TimelineOverlayItem[];
  audioClips: SavedAudioClipRef[];
  photoEdits: Record<string, EditDocument>;
  updatedAtMs: number;
  createdAtMs: number;
}

function stripUndefined<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => stripUndefined(item)) as unknown as T;
  }
  if (value !== null && typeof value === 'object') {
    const clean: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v !== undefined) {
        clean[k] = stripUndefined(v);
      }
    }
    return clean as T;
  }
  return value;
}

function sanitizeSafeId(raw: string, fallback: string): string {
  const cleaned = raw.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, BLUEPRINT_LIMITS.MAX_ID_LEN);
  return cleaned.length >= 1 ? cleaned : fallback;
}

export function normalizeUsername(raw: string): string {
  return raw.trim().replace(/^@+/, '').toLowerCase();
}

export function validateUsernameFormat(raw: string): {
  valid: boolean;
  normalized: string;
  error?: string;
} {
  const normalized = normalizeUsername(raw);
  if (!normalized) {
    return { valid: false, normalized, error: 'Enter a username.' };
  }
  if (normalized.length < BLUEPRINT_LIMITS.USERNAME_MIN) {
    return {
      valid: false,
      normalized,
      error: `Username must be at least ${BLUEPRINT_LIMITS.USERNAME_MIN} characters.`,
    };
  }
  if (normalized.length > BLUEPRINT_LIMITS.USERNAME_MAX) {
    return {
      valid: false,
      normalized,
      error: `Username must be ${BLUEPRINT_LIMITS.USERNAME_MAX} characters or fewer.`,
    };
  }
  if (!BLUEPRINT_LIMITS.USERNAME_REGEX.test(normalized)) {
    return {
      valid: false,
      normalized,
      error: 'Use only lowercase letters, numbers, underscores (_), or hyphens (-).',
    };
  }
  return { valid: true, normalized };
}

export function savePendingUsername(uid: string, rawUsername: string): void {
  const check = validateUsernameFormat(rawUsername);
  if (!check.valid || typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(`${PENDING_USERNAME_PREFIX}${uid}`, check.normalized);
  } catch {
    // Ignore storage quota errors
  }
}

export function getPendingUsername(uid: string): string {
  if (typeof window === 'undefined') return '';
  try {
    return window.localStorage.getItem(`${PENDING_USERNAME_PREFIX}${uid}`) || '';
  } catch {
    return '';
  }
}

export function clearPendingUsername(uid: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(`${PENDING_USERNAME_PREFIX}${uid}`);
  } catch {
    // Ignore storage errors
  }
}

export interface UsernameAvailabilityResult {
  available: boolean;
  normalized: string;
  ownedBySelf?: boolean;
  reason?: string;
}

export async function checkUsernameAvailability(
  rawUsername: string,
  currentUid?: string | null
): Promise<UsernameAvailabilityResult> {
  const format = validateUsernameFormat(rawUsername);
  if (!format.valid) {
    return {
      available: false,
      normalized: format.normalized,
      reason: format.error,
    };
  }

  const normalized = format.normalized;
  try {
    const snap = await getDoc(doc(db, 'usernames', normalized));
    if (!snap.exists()) {
      return { available: true, normalized };
    }
    const ownerId = snap.data()?.ownerId;
    if (currentUid && ownerId === currentUid) {
      return {
        available: true,
        ownedBySelf: true,
        normalized,
        reason: 'This is your current username.',
      };
    }
    return {
      available: false,
      normalized,
      reason: `@${normalized} is already taken.`,
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return {
      available: false,
      normalized,
      reason: msg.includes('offline')
        ? 'Offline — unable to check username availability.'
        : 'Unable to verify username right now.',
    };
  }
}

export interface SyncedUserProfile {
  displayName: string;
  username: string;
}

export async function claimOrUpdateUsername(
  user: User,
  rawUsername: string,
  preferredDisplayName?: string
): Promise<SyncedUserProfile> {
  const format = validateUsernameFormat(rawUsername);
  if (!format.valid) {
    throw new Error(format.error || 'Invalid username format.');
  }
  const newUsername = format.normalized;
  const userRef = doc(db, 'users', user.uid);
  const newUsernameRef = doc(db, 'usernames', newUsername);

  const customName = preferredDisplayName?.trim().slice(0, BLUEPRINT_LIMITS.MAX_DISPLAY_NAME);
  const fallbackName = (user.displayName || newUsername || user.email?.split('@')[0] || 'Creator')
    .trim()
    .slice(0, BLUEPRINT_LIMITS.MAX_DISPLAY_NAME);
  const email = (user.email || 'creator@kinoframe.app')
    .trim()
    .slice(0, BLUEPRINT_LIMITS.MAX_EMAIL);
  const photoURL = (user.photoURL || '').trim().slice(0, BLUEPRINT_LIMITS.MAX_PHOTO_URL);

  try {
    const result = await runTransaction(db, async (tx) => {
      const usernameSnap = await tx.get(newUsernameRef);
      const userSnap = await tx.get(userRef);

      if (usernameSnap.exists() && usernameSnap.data()?.ownerId !== user.uid) {
        throw new Error(`@${newUsername} is already taken. Please choose another username.`);
      }

      const existingData = userSnap.exists() ? userSnap.data() : null;
      const oldUsername =
        typeof existingData?.username === 'string' ? existingData.username : '';

      let oldUsernameSnap = null;
      const oldUsernameRef =
        oldUsername && oldUsername !== newUsername ? doc(db, 'usernames', oldUsername) : null;
      if (oldUsernameRef) {
        oldUsernameSnap = await tx.get(oldUsernameRef);
      }

      const existingName =
        typeof existingData?.displayName === 'string' ? existingData.displayName : '';
      const finalName = customName || existingName || fallbackName || newUsername;

      if (!usernameSnap.exists()) {
        tx.set(newUsernameRef, {
          username: newUsername,
          ownerId: user.uid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }

      if (oldUsernameRef && oldUsernameSnap?.exists() && oldUsernameSnap.data()?.ownerId === user.uid) {
        tx.delete(oldUsernameRef);
      }

      if (!userSnap.exists()) {
        tx.set(userRef, {
          uid: user.uid,
          displayName: finalName,
          username: newUsername,
          email,
          photoURL,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } else {
        tx.update(userRef, {
          displayName: finalName,
          username: newUsername,
          email,
          photoURL,
          updatedAt: serverTimestamp(),
        });
      }

      return { displayName: finalName, username: newUsername };
    });

    clearPendingUsername(user.uid);
    return result;
  } catch (error) {
    if (error instanceof Error && error.message.includes('is already taken')) {
      throw error;
    }
    handleFirestoreError(error, OperationType.WRITE, `usernames/${newUsername}`);
  }
}

export async function syncUserProfile(
  user: User,
  preferredDisplayName?: string,
  preferredUsername?: string
): Promise<SyncedUserProfile> {
  const path = `users/${user.uid}`;
  const userRef = doc(db, 'users', user.uid);
  const customName = preferredDisplayName?.trim().slice(0, BLUEPRINT_LIMITS.MAX_DISPLAY_NAME);
  const fallbackName = (user.displayName || user.email?.split('@')[0] || 'Creator')
    .trim()
    .slice(0, BLUEPRINT_LIMITS.MAX_DISPLAY_NAME);
  const email = (user.email || 'creator@kinoframe.app')
    .trim()
    .slice(0, BLUEPRINT_LIMITS.MAX_EMAIL);
  const photoURL = (user.photoURL || '').trim().slice(0, BLUEPRINT_LIMITS.MAX_PHOTO_URL);

  const pendingOrPreferred = preferredUsername || getPendingUsername(user.uid);

  try {
    const snap = await getDoc(userRef);
    const existingData = snap.exists() ? snap.data() : null;
    const existingUsername =
      typeof existingData?.username === 'string' ? existingData.username : '';

    if (pendingOrPreferred && !existingUsername) {
      try {
        return await claimOrUpdateUsername(
          user,
          pendingOrPreferred,
          preferredDisplayName || fallbackName
        );
      } catch (claimErr) {
        clearPendingUsername(user.uid);
        if (preferredUsername) {
          throw claimErr;
        }
      }
    }

    if (!snap.exists()) {
      const finalName = customName || fallbackName || 'Creator';
      await setDoc(userRef, {
        uid: user.uid,
        displayName: finalName,
        username: '',
        email,
        photoURL,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      return { displayName: finalName, username: '' };
    } else {
      const existingName =
        typeof existingData?.displayName === 'string' ? existingData.displayName : '';
      const finalName = customName || existingName || fallbackName || 'Creator';
      await updateDoc(userRef, {
        displayName: finalName,
        email,
        photoURL,
        updatedAt: serverTimestamp(),
      });
      return { displayName: finalName, username: existingUsername };
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes('is already taken')) {
      throw error;
    }
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export interface SaveProjectInput {
  existingProjectId?: string | null;
  name: string;
  mode: 'timeline' | 'photo';
  sequenceAspect: AspectRatioId;
  beatBpm: number;
  activeAssetId: string;
  totalDuration: number;
  clips: TimelineClip[];
  globalOverlays: TimelineOverlayItem[];
  audioClips: AudioClip[];
  photoEdits: Record<string, EditDocument>;
}

export async function saveProjectToFirestore(
  user: User,
  input: SaveProjectInput
): Promise<{ projectId: string; name: string }> {
  const cleanName = input.name.trim().slice(0, BLUEPRINT_LIMITS.MAX_PROJECT_NAME) || 'Untitled Edit';
  const projectId =
    input.existingProjectId && BLUEPRINT_LIMITS.ID_REGEX.test(input.existingProjectId)
      ? input.existingProjectId
      : `proj_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const safeClips = stripUndefined(input.clips.slice(0, BLUEPRINT_LIMITS.MAX_CLIPS));
  const safeOverlays = stripUndefined(
    input.globalOverlays.slice(0, BLUEPRINT_LIMITS.MAX_OVERLAYS)
  );
  const safeAudioClips: SavedAudioClipRef[] = stripUndefined(
    input.audioClips.slice(0, BLUEPRINT_LIMITS.MAX_AUDIO_CLIPS).map((ac) => ({
      id: sanitizeSafeId(ac.id, `aclip_${Date.now()}`),
      audioAssetId: sanitizeSafeId(ac.audioAssetId, 'audio-lofi'),
      name: (ac.name || 'Audio Track').slice(0, 80),
      startTime: Number(ac.startTime.toFixed(2)),
      trimStart: Number(ac.trimStart.toFixed(2)),
      trimEnd: Number(ac.trimEnd.toFixed(2)),
      volume: Number(clamp(ac.volume, 0, 1).toFixed(2)),
      fadeIn: Number(clamp(ac.fadeIn, 0, 10).toFixed(2)),
      fadeOut: Number(clamp(ac.fadeOut, 0, 10).toFixed(2)),
      muted: Boolean(ac.muted),
    }))
  );

  const photoEditEntries = Object.entries(input.photoEdits).slice(
    0,
    BLUEPRINT_LIMITS.MAX_PHOTO_EDITS
  );
  const safePhotoEdits: Record<string, EditDocument> = {};
  for (const [k, v] of photoEditEntries) {
    safePhotoEdits[k.slice(0, BLUEPRINT_LIMITS.MAX_ID_LEN)] = stripUndefined(v);
  }

  const safeAspect: AspectRatioId = ALLOWED_SEQUENCE_ASPECTS.includes(input.sequenceAspect)
    ? input.sequenceAspect
    : '16:9';

  const firstSampleInClips = safeClips.find((c) =>
    SAMPLE_MEDIA_ASSETS.some((s) => s.id === c.assetId)
  )?.assetId;
  const fallbackSample = SAMPLE_MEDIA_ASSETS[0].id;
  const activeAssetId = (input.activeAssetId || fallbackSample).slice(
    0,
    BLUEPRINT_LIMITS.MAX_ID_LEN
  );
  const previewAssetId =
    input.mode === 'photo'
      ? SAMPLE_MEDIA_ASSETS.some((s) => s.id === activeAssetId)
        ? activeAssetId
        : fallbackSample
      : firstSampleInClips || fallbackSample;

  const basePayload = {
    name: cleanName,
    mode: input.mode,
    sequenceAspect: safeAspect,
    beatBpm: Math.round(
      clamp(input.beatBpm || 120, BLUEPRINT_LIMITS.MIN_BPM, BLUEPRINT_LIMITS.MAX_BPM)
    ),
    activeAssetId,
    previewAssetId,
    clipCount: Math.round(safeClips.length),
    totalDuration: Number(clamp(input.totalDuration || 0, 0, BLUEPRINT_LIMITS.MAX_DURATION).toFixed(2)),
    clips: safeClips,
    globalOverlays: safeOverlays,
    audioClips: safeAudioClips,
    photoEdits: safePhotoEdits,
  };

  const path = `projects/${projectId}`;
  const docRef = doc(db, 'projects', projectId);

  try {
    if (input.existingProjectId) {
      await updateDoc(docRef, {
        ...basePayload,
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(docRef, {
        id: projectId,
        ownerId: user.uid,
        ...basePayload,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
    return { projectId, name: cleanName };
  } catch (error) {
    handleFirestoreError(
      error,
      input.existingProjectId ? OperationType.UPDATE : OperationType.CREATE,
      path
    );
  }
}

export function subscribeToUserProjects(
  userId: string,
  onProjects: (projects: SavedProjectRecord[]) => void
): () => void {
  const projectsRef = collection(db, 'projects');
  const q = query(projectsRef, where('ownerId', '==', userId));

  return onSnapshot(
    q,
    (snapshot) => {
      const items: SavedProjectRecord[] = snapshot.docs.map((d) => {
        const data = d.data();
        const updatedAtMs =
          data.updatedAt instanceof Timestamp ? data.updatedAt.toMillis() : Date.now();
        const createdAtMs =
          data.createdAt instanceof Timestamp ? data.createdAt.toMillis() : Date.now();

        return {
          id: String(data.id || d.id),
          ownerId: String(data.ownerId || userId),
          name: String(data.name || 'Untitled Edit'),
          mode: data.mode === 'photo' ? 'photo' : 'timeline',
          sequenceAspect: (data.sequenceAspect as AspectRatioId) || '16:9',
          beatBpm: Number(data.beatBpm || 120),
          activeAssetId: String(data.activeAssetId || SAMPLE_MEDIA_ASSETS[0].id),
          previewAssetId: String(data.previewAssetId || SAMPLE_MEDIA_ASSETS[0].id),
          clipCount: Number(data.clipCount || 0),
          totalDuration: Number(data.totalDuration || 0),
          clips: Array.isArray(data.clips) ? (data.clips as TimelineClip[]) : [],
          globalOverlays: Array.isArray(data.globalOverlays)
            ? (data.globalOverlays as TimelineOverlayItem[])
            : [],
          audioClips: Array.isArray(data.audioClips)
            ? (data.audioClips as SavedAudioClipRef[])
            : [],
          photoEdits:
            data.photoEdits && typeof data.photoEdits === 'object'
              ? (data.photoEdits as Record<string, EditDocument>)
              : {},
          updatedAtMs,
          createdAtMs,
        };
      });

      items.sort((a, b) => b.updatedAtMs - a.updatedAtMs);
      onProjects(items);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, 'projects');
    }
  );
}

export async function deleteProjectFromFirestore(projectId: string): Promise<void> {
  const path = `projects/${projectId}`;
  try {
    await deleteDoc(doc(db, 'projects', projectId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export function hydrateProjectAssets(
  project: SavedProjectRecord,
  availableAssets: MediaAsset[],
  audioLibrary: AudioAsset[]
): {
  clips: TimelineClip[];
  audioClips: AudioClip[];
  activeAssetId: string;
  missingLocalCount: number;
} {
  let missingLocalCount = 0;
  const assetIds = new Set(availableAssets.map((a) => a.id));
  const fallbackAssetId = SAMPLE_MEDIA_ASSETS[0].id;

  const clips = project.clips.map((c) => {
    if (assetIds.has(c.assetId)) return c;
    missingLocalCount += 1;
    return {
      ...c,
      assetId: fallbackAssetId,
      kind: 'photo' as const,
    };
  });

  const audioClips: AudioClip[] = [];
  for (const ac of project.audioClips) {
    const matched = audioLibrary.find((a) => a.id === ac.audioAssetId);
    if (!matched) {
      missingLocalCount += 1;
      continue;
    }
    audioClips.push({
      ...ac,
      peaks: matched.peaks,
      src: matched.src,
    });
  }

  const activeAssetId = assetIds.has(project.activeAssetId)
    ? project.activeAssetId
    : fallbackAssetId;

  return { clips, audioClips, activeAssetId, missingLocalCount };
}
