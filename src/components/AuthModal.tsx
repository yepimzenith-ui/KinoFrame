import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  AtSign,
  Check,
  CheckCircle2,
  Cloud,
  Eye,
  EyeOff,
  Film,
  FolderOpen,
  KeyRound,
  LogIn,
  LogOut,
  Mail,
  RefreshCw,
  ShieldCheck,
  UserPlus,
  X,
} from 'lucide-react';
import { User } from '../lib/firebase';
import {
  normalizeUsername,
  UsernameAvailabilityResult,
  validateUsernameFormat,
} from '../lib/projectsService';

interface AuthModalProps {
  isOpen: boolean;
  initialTab?: 'login' | 'signup';
  featureNotice?: string | null;
  user: User | null;
  studioDisplayName: string;
  studioUsername: string;
  pendingUsername?: string;
  savedProjectsCount: number;
  authLoading: boolean;
  onGoogleAuth: (preferredName?: string, preferredUsername?: string) => Promise<void>;
  onEmailSignIn: (email: string, password: string) => Promise<boolean>;
  onEmailSignUp: (input: {
    email: string;
    password: string;
    username: string;
    displayName?: string;
  }) => Promise<void>;
  onPasswordReset: (email: string) => Promise<void>;
  onCheckUsername: (username: string) => Promise<UsernameAvailabilityResult>;
  onClaimUsername: (username: string) => Promise<void>;
  onUpdateDisplayName: (newName: string) => Promise<void>;
  onRefreshVerification: () => Promise<boolean>;
  onResendVerification: () => Promise<void>;
  onSignOut: () => Promise<void>;
  onClose: () => void;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function isValidEmailFormat(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.length >= 3 && trimmed.length <= 160 && EMAIL_REGEX.test(trimmed);
}

function mapFirebaseAuthError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);

  if (raw.startsWith('{') && raw.includes('"operationType"')) {
    try {
      const parsed = JSON.parse(raw) as { error?: string };
      const inner = parsed.error || '';
      if (inner.includes('permission-denied') || inner.includes('Missing or insufficient permissions')) {
        return 'Cloud profile sync requires a verified email session. Verify your email or sign in again.';
      }
      if (inner.includes('offline')) {
        return 'You appear to be offline. Check your connection and try again.';
      }
    } catch {
      // Fallback below
    }
    return 'Unable to sync your studio profile right now. Please try again.';
  }

  if (raw.includes('auth/operation-not-allowed')) {
    return 'Email/Password login is not enabled in Firebase Authentication yet. Enable the Email/Password provider in Firebase Console (Authentication -> Sign-in method).';
  }
  if (raw.includes('auth/email-already-in-use')) {
    return 'An account with this email already exists. Log in instead or reset your password.';
  }
  if (
    raw.includes('auth/invalid-login-credentials') ||
    raw.includes('auth/invalid-credential') ||
    raw.includes('auth/wrong-password') ||
    raw.includes('auth/user-not-found')
  ) {
    return 'Incorrect email or password. Please check your credentials and try again.';
  }
  if (raw.includes('auth/user-disabled')) {
    return 'This account has been disabled. Please use another account.';
  }
  if (raw.includes('auth/invalid-email')) {
    return 'Please enter a valid email address.';
  }
  if (raw.includes('auth/weak-password')) {
    return 'Password must be at least 6 characters long.';
  }
  if (raw.includes('auth/missing-password')) {
    return 'Please enter your password.';
  }
  if (raw.includes('auth/too-many-requests')) {
    return 'Too many attempts. Please wait a moment and try again.';
  }
  if (raw.includes('auth/network-request-failed')) {
    return 'Network error while connecting. Check your internet connection and try again.';
  }
  if (raw.includes('auth/popup-blocked')) {
    return 'Popup was blocked by your browser. Allow popups for this site and try again.';
  }
  if (raw.includes('auth/account-exists-with-different-credential')) {
    return 'An account already exists with this email using a different sign-in method.';
  }
  if (raw.includes('auth/expired-action-code') || raw.includes('auth/invalid-action-code')) {
    return 'This verification or reset link has expired. Please request a new one.';
  }
  if (raw.includes('auth/requires-recent-login')) {
    return 'Please sign out and sign back in to complete this security change.';
  }
  if (raw.includes('is already taken')) {
    return raw;
  }
  return raw || 'Authentication failed. Please try again.';
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  initialTab = 'login',
  featureNotice = null,
  user,
  studioDisplayName,
  studioUsername,
  pendingUsername = '',
  savedProjectsCount,
  authLoading,
  onGoogleAuth,
  onEmailSignIn,
  onEmailSignUp,
  onPasswordReset,
  onCheckUsername,
  onClaimUsername,
  onUpdateDisplayName,
  onRefreshVerification,
  onResendVerification,
  onSignOut,
  onClose,
}) => {
  const [tab, setTab] = useState<'login' | 'signup'>(initialTab);
  const [resetMode, setResetMode] = useState(false);

  // Login / Signup Form States
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [signupUsername, setSignupUsername] = useState('');
  const [creatorName, setCreatorName] = useState('');

  // Profile Edit States
  const [editUsername, setEditUsername] = useState(studioUsername);
  const [editName, setEditName] = useState(studioDisplayName);

  // Live Username Availability State
  const [checkingHandle, setCheckingHandle] = useState(false);
  const [handleCheck, setHandleCheck] = useState<UsernameAvailabilityResult | null>(null);

  // Action Statuses
  const [submitting, setSubmitting] = useState(false);
  const [savedProfileMsg, setSavedProfileMsg] = useState(false);
  const [savedHandleMsg, setSavedHandleMsg] = useState(false);
  const [infoMsg, setInfoMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setTab(initialTab);
      setResetMode(false);
      setErrorMsg(null);
      setInfoMsg(null);
      setSavedProfileMsg(false);
      setSavedHandleMsg(false);
      setHandleCheck(null);
      setPassword('');
      setConfirmPassword('');
      setShowPassword(false);
    } else {
      setPassword('');
      setConfirmPassword('');
      setShowPassword(false);
    }
  }, [isOpen, initialTab]);

  useEffect(() => {
    if (!isOpen) return;
    setEditName(studioDisplayName || user?.displayName || '');
    setEditUsername(studioUsername || '');
  }, [isOpen, studioDisplayName, studioUsername, user]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !submitting) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, submitting, onClose]);

  // Debounced username availability check for Sign Up or Verified Profile username editor
  const activeHandleInput = user && user.emailVerified ? editUsername : tab === 'signup' ? signupUsername : '';

  useEffect(() => {
    if (!isOpen) return;
    if (user && !user.emailVerified) return;
    if (!user && (tab !== 'signup' || resetMode)) return;

    const trimmed = activeHandleInput.trim();
    if (!trimmed) {
      setHandleCheck(null);
      setCheckingHandle(false);
      return;
    }

    const format = validateUsernameFormat(trimmed);
    if (!format.valid) {
      setHandleCheck({
        available: false,
        normalized: format.normalized,
        reason: format.error,
      });
      setCheckingHandle(false);
      return;
    }

    if (user && format.normalized === studioUsername && studioUsername) {
      setHandleCheck({
        available: true,
        ownedBySelf: true,
        normalized: format.normalized,
        reason: 'This is your current handle.',
      });
      setCheckingHandle(false);
      return;
    }

    let cancelled = false;
    setCheckingHandle(true);
    const timer = window.setTimeout(() => {
      void onCheckUsername(format.normalized)
        .then((res) => {
          if (!cancelled) {
            setHandleCheck(res);
          }
        })
        .finally(() => {
          if (!cancelled) {
            setCheckingHandle(false);
          }
        });
    }, 300);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [isOpen, user, tab, resetMode, activeHandleInput, studioUsername, onCheckUsername]);

  if (!isOpen) return null;

  const handleGoogleAction = async () => {
    setErrorMsg(null);
    setInfoMsg(null);
    let optionalUsername: string | undefined;

    if (!user && tab === 'signup' && signupUsername.trim()) {
      const check = await onCheckUsername(signupUsername);
      if (!check.available && !check.ownedBySelf) {
        setHandleCheck(check);
        setErrorMsg(check.reason || 'That username is already taken.');
        return;
      }
      optionalUsername = check.normalized;
    }

    setSubmitting(true);
    try {
      const preferred = tab === 'signup' ? creatorName.trim() : undefined;
      await onGoogleAuth(preferred || undefined, optionalUsername);
      setCreatorName('');
      setSignupUsername('');
      onClose();
    } catch (err) {
      const raw = err instanceof Error ? err.message : '';
      if (!raw.includes('popup-closed-by-user') && !raw.includes('cancelled-popup-request')) {
        setErrorMsg(mapFirebaseAuthError(err));
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleEmailLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setInfoMsg(null);

    const cleanEmail = email.trim();

    if (resetMode) {
      if (!isValidEmailFormat(cleanEmail)) {
        setErrorMsg('Enter a valid account email to receive a password reset link.');
        return;
      }
      setSubmitting(true);
      try {
        await onPasswordReset(cleanEmail);
        setInfoMsg(`Password reset email sent to ${cleanEmail}. Check your inbox.`);
        setResetMode(false);
      } catch (err) {
        setErrorMsg(mapFirebaseAuthError(err));
      } finally {
        setSubmitting(false);
      }
      return;
    }

    if (!cleanEmail || !password) {
      setErrorMsg('Enter both your email and password.');
      return;
    }
    if (!isValidEmailFormat(cleanEmail)) {
      setErrorMsg('Please enter a valid email address.');
      return;
    }
    if (!password.trim()) {
      setErrorMsg('Password cannot be blank.');
      return;
    }

    setSubmitting(true);
    try {
      const verified = await onEmailSignIn(cleanEmail, password);
      setPassword('');
      if (verified) {
        onClose();
      } else {
        setInfoMsg('Verify the link sent to your email, then press "I\'ve Verified — Activate Account".');
      }
    } catch (err) {
      setErrorMsg(mapFirebaseAuthError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleEmailSignupSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setInfoMsg(null);

    const format = validateUsernameFormat(signupUsername);
    if (!format.valid) {
      setErrorMsg(format.error || 'Choose a valid username (3–24 chars).');
      return;
    }
    const cleanEmail = email.trim();
    if (!isValidEmailFormat(cleanEmail)) {
      setErrorMsg('Enter a valid email address.');
      return;
    }
    if (!password || !password.trim()) {
      setErrorMsg('Password cannot be blank or spaces only.');
      return;
    }
    if (password.length < 6) {
      setErrorMsg('Password must be at least 6 characters.');
      return;
    }
    if (password.length > 128) {
      setErrorMsg('Password must be 128 characters or fewer.');
      return;
    }
    if (password !== confirmPassword) {
      setErrorMsg('Passwords do not match.');
      return;
    }

    setSubmitting(true);
    try {
      const availability = await onCheckUsername(format.normalized);
      setHandleCheck(availability);
      if (!availability.available) {
        setErrorMsg(availability.reason || 'That username is already taken.');
        setSubmitting(false);
        return;
      }

      await onEmailSignUp({
        email: cleanEmail,
        password,
        username: availability.normalized,
        displayName: creatorName.trim() || undefined,
      });

      setPassword('');
      setConfirmPassword('');
      setInfoMsg(
        `Verification link sent to ${cleanEmail}. Verify your email to activate @${availability.normalized}.`
      );
    } catch (err) {
      setErrorMsg(mapFirebaseAuthError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleClaimOrUpdateHandle = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setInfoMsg(null);

    const format = validateUsernameFormat(editUsername);
    if (!format.valid) {
      setErrorMsg(format.error || 'Enter a valid username.');
      return;
    }
    if (format.normalized === studioUsername) {
      return;
    }

    setSubmitting(true);
    try {
      const availability = await onCheckUsername(format.normalized);
      setHandleCheck(availability);
      if (!availability.available && !availability.ownedBySelf) {
        setErrorMsg(availability.reason || 'That username is already taken.');
        setSubmitting(false);
        return;
      }
      await onClaimUsername(availability.normalized);
      setSavedHandleMsg(true);
      setTimeout(() => setSavedHandleMsg(false), 2500);
    } catch (err) {
      setErrorMsg(mapFirebaseAuthError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleSaveName = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = editName.trim();
    if (!trimmed) {
      setErrorMsg('Please enter a studio display name.');
      return;
    }
    setErrorMsg(null);
    setSubmitting(true);
    try {
      await onUpdateDisplayName(trimmed);
      setSavedProfileMsg(true);
      setTimeout(() => setSavedProfileMsg(false), 2500);
    } catch (err) {
      setErrorMsg(mapFirebaseAuthError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleVerifyRefresh = async () => {
    setErrorMsg(null);
    setInfoMsg(null);
    setSubmitting(true);
    try {
      const verified = await onRefreshVerification();
      if (!verified) {
        setInfoMsg(
          'Email not verified yet. Open the verification email in your inbox, click the link, then press refresh again.'
        );
      }
    } catch (err) {
      setErrorMsg(mapFirebaseAuthError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleResendClick = async () => {
    setErrorMsg(null);
    setInfoMsg(null);
    setSubmitting(true);
    try {
      await onResendVerification();
      setInfoMsg('Verification email resent. Check your inbox and spam folder.');
    } catch (err) {
      setErrorMsg(mapFirebaseAuthError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleLogout = async () => {
    setErrorMsg(null);
    setInfoMsg(null);
    setSubmitting(true);
    try {
      await onSignOut();
      onClose();
    } catch (err) {
      setErrorMsg(mapFirebaseAuthError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const renderHandleStatus = (rawVal: string) => {
    if (!rawVal.trim()) {
      return (
        <p className="text-[11px] text-zinc-500">
          3–24 chars: lowercase letters, numbers, underscores (_), or hyphens (-).
        </p>
      );
    }
    if (checkingHandle) {
      return <p className="text-[11px] text-zinc-400">Checking handle availability...</p>;
    }
    if (!handleCheck) return null;
    if (handleCheck.available) {
      return (
        <p className="flex items-center gap-1 text-[11px] text-emerald-400">
          <CheckCircle2 className="w-3 h-3 shrink-0" />
          <span>
            {handleCheck.ownedBySelf
              ? `@${handleCheck.normalized} is your active handle.`
              : `@${handleCheck.normalized} is available!`}
          </span>
        </p>
      );
    }
    return (
      <p className="flex items-center gap-1 text-[11px] text-red-400">
        <AlertCircle className="w-3 h-3 shrink-0" />
        <span>{handleCheck.reason || `@${handleCheck.normalized} is taken.`}</span>
      </p>
    );
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
      <div className="w-full max-w-2xl max-h-[92dvh] overflow-y-auto studio-scroll rounded-xl border border-zinc-800 bg-zinc-950 shadow-2xl grid grid-cols-1 md:grid-cols-12">
        {/* Left Studio Overview Column */}
        <div className="md:col-span-5 bg-zinc-900/70 border-b md:border-b-0 md:border-r border-zinc-800 p-5 sm:p-6 flex flex-col justify-between gap-5">
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-amber-400">
              <Film className="w-4 h-4" />
              <span className="text-xs font-mono uppercase tracking-wider">KinoFrame Cloud</span>
            </div>

            <div className="space-y-2">
              <h2 className="text-lg sm:text-xl font-bold tracking-tight text-zinc-50">
                {user
                  ? user.emailVerified
                    ? 'Studio Account Active'
                    : 'Verify Your Email'
                  : tab === 'signup'
                    ? 'Claim your unique handle & workspace.'
                    : 'Pick up right where you left off.'}
              </h2>
              <p className="text-xs text-zinc-400 leading-relaxed">
                Keep your timeline cuts, keyframes, typography, and color grades synced with your unique handle and password or Google account.
              </p>
            </div>
          </div>

          <div className="hidden sm:block space-y-3 text-xs text-zinc-300">
            <div className="flex items-start gap-2.5">
              <AtSign className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-zinc-100">Unique @Username</p>
                <p className="text-[11px] text-zinc-500">
                  Reserved exclusively to your account—taken handles are blocked.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-2.5">
              <Cloud className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-zinc-100">Save & Reopen Edits</p>
                <p className="text-[11px] text-zinc-500">Store sequences, masks, and color grades.</p>
              </div>
            </div>
            <div className="flex items-start gap-2.5">
              <FolderOpen className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-zinc-100">Email + Password or Google</p>
                <p className="text-[11px] text-zinc-500">
                  Sign in with your password or one-click Google popup.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-2.5">
              <ShieldCheck className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-zinc-100">Unlock Pro Studio FX & Export</p>
                <p className="text-[11px] text-zinc-500">
                  Access Visual FX, Shape Masks, Stickers, Keyframes, Film Stocks, and 1080p HD Export.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Right Interactive Form Column */}
        <div className="md:col-span-7 p-5 sm:p-6 flex flex-col justify-between">
          <div className="flex items-center justify-between gap-2 pb-3 border-b border-zinc-800/80">
            <span className="text-xs font-medium text-zinc-400">
              {user
                ? user.emailVerified
                  ? 'Signed-in Profile'
                  : 'Email Verification Required'
                : resetMode
                  ? 'Reset Password'
                  : tab === 'login'
                    ? 'Sign In'
                    : 'Create Studio Account'}
            </span>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close account modal"
              className="p-1.5 rounded-md text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {featureNotice && (!user || !user.emailVerified) && (
            <div className="mt-3 px-3 py-2 rounded-lg border border-amber-500/35 bg-amber-500/10 text-xs text-amber-200 leading-snug">
              {featureNotice}
            </div>
          )}

          {user && !user.emailVerified ? (
            /* Unverified Email/Password Account View */
            <div className="py-5 space-y-5 flex-1">
              <div className="p-4 rounded-lg border border-amber-500/30 bg-amber-500/10 space-y-2">
                <div className="flex items-center gap-2 text-amber-300 text-xs font-semibold">
                  <Mail className="w-4 h-4 shrink-0" />
                  <span>Check your inbox to verify your email</span>
                </div>
                <p className="text-xs text-zinc-300 leading-relaxed">
                  We sent a verification link to <span className="font-mono text-zinc-100">{user.email}</span>.
                  {pendingUsername ? (
                    <>
                      {' '}
                      Once verified, <span className="font-mono text-amber-300">@{pendingUsername}</span> and cloud project saving will activate automatically.
                    </>
                  ) : (
                    ' Verify your email address to claim a unique @username and save cloud projects.'
                  )}
                </p>
              </div>

              {infoMsg && (
                <p className="text-xs text-emerald-300 bg-emerald-500/10 border border-emerald-500/30 rounded-md px-3 py-2">
                  {infoMsg}
                </p>
              )}
              {errorMsg && (
                <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded-md px-3 py-2">
                  {errorMsg}
                </p>
              )}

              <div className="space-y-2.5">
                <button
                  type="button"
                  disabled={submitting}
                  onClick={handleVerifyRefresh}
                  className="w-full py-2.5 px-4 rounded-md bg-amber-400 text-zinc-950 hover:bg-amber-300 text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${submitting ? 'animate-spin' : ''}`} />
                  <span>I&apos;ve Verified — Activate Account</span>
                </button>

                <button
                  type="button"
                  disabled={submitting}
                  onClick={handleResendClick}
                  className="w-full py-2 px-4 rounded-md border border-zinc-700 bg-zinc-900 text-zinc-200 hover:border-zinc-500 text-xs font-medium transition-colors cursor-pointer disabled:opacity-50"
                >
                  Resend Verification Email
                </button>
              </div>

              <div className="flex justify-end pt-3 border-t border-zinc-800/80">
                <button
                  type="button"
                  disabled={submitting}
                  onClick={handleLogout}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-zinc-800 text-zinc-200 hover:bg-red-500/20 hover:text-red-300 border border-zinc-700 cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Sign Out</span>
                </button>
              </div>
            </div>
          ) : user ? (
            /* Signed-In Verified Profile View */
            <div className="py-4 space-y-4 flex-1">
              <div className="flex items-center gap-3.5 p-3.5 rounded-lg border border-zinc-800 bg-zinc-900/50">
                {user.photoURL ? (
                  <img
                    src={user.photoURL}
                    alt={studioDisplayName || user.displayName || 'Avatar'}
                    referrerPolicy="no-referrer"
                    className="w-11 h-11 rounded-full object-cover border border-zinc-700 shrink-0"
                  />
                ) : (
                  <div className="w-11 h-11 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-400 flex items-center justify-center text-sm font-bold shrink-0">
                    {(studioUsername || studioDisplayName || user.email || 'K')[0].toUpperCase()}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 min-w-0">
                    <p className="text-sm font-semibold text-zinc-100 truncate">
                      {studioDisplayName || user.displayName || 'KinoFrame Creator'}
                    </p>
                    {studioUsername && (
                      <span className="text-[11px] font-mono text-amber-400 shrink-0">
                        @{studioUsername}
                      </span>
                    )}
                  </div>
                  <p className="text-xs font-mono text-zinc-400 truncate">{user.email}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-mono font-semibold text-amber-400 tabular-nums">
                    {savedProjectsCount}
                  </p>
                  <p className="text-[10px] text-zinc-500">Projects</p>
                </div>
              </div>

              {/* Unique Username Claim / Update */}
              <form onSubmit={handleClaimOrUpdateHandle} className="space-y-1.5">
                <label htmlFor="profile-username" className="block text-xs font-medium text-zinc-300">
                  Unique Username Handle
                </label>
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-mono text-zinc-500">
                      @
                    </span>
                    <input
                      id="profile-username"
                      type="text"
                      maxLength={24}
                      value={editUsername}
                      onChange={(e) => setEditUsername(normalizeUsername(e.target.value))}
                      placeholder="your_unique_handle"
                      className="w-full pl-7 pr-3 py-2 text-xs font-mono bg-zinc-900 border border-zinc-700 focus:border-amber-500 rounded-md text-zinc-100 outline-none"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={
                      submitting ||
                      checkingHandle ||
                      !editUsername.trim() ||
                      editUsername === studioUsername ||
                      Boolean(handleCheck && !handleCheck.available && !handleCheck.ownedBySelf)
                    }
                    className="px-3 py-2 text-xs font-medium rounded-md border border-zinc-700 bg-zinc-900 text-zinc-100 hover:border-amber-500 transition-colors cursor-pointer disabled:opacity-50 whitespace-nowrap"
                  >
                    {savedHandleMsg ? (
                      <span className="flex items-center gap-1 text-emerald-400">
                        <Check className="w-3.5 h-3.5" />
                        Saved
                      </span>
                    ) : studioUsername ? (
                      'Change'
                    ) : (
                      'Claim'
                    )}
                  </button>
                </div>
                {renderHandleStatus(editUsername)}
              </form>

              {/* Studio Display Name */}
              <form onSubmit={handleSaveName} className="space-y-1.5">
                <label htmlFor="studio-display-name" className="block text-xs font-medium text-zinc-300">
                  Studio Display Name
                </label>
                <div className="flex items-center gap-2">
                  <input
                    id="studio-display-name"
                    type="text"
                    maxLength={80}
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    placeholder="Your creator or studio name"
                    className="flex-1 px-3 py-2 text-xs bg-zinc-900 border border-zinc-700 focus:border-amber-500 rounded-md text-zinc-100 outline-none"
                  />
                  <button
                    type="submit"
                    disabled={submitting}
                    className="px-3 py-2 text-xs font-medium rounded-md border border-zinc-700 bg-zinc-900 text-zinc-100 hover:border-amber-500 transition-colors cursor-pointer disabled:opacity-50 whitespace-nowrap"
                  >
                    {savedProfileMsg ? (
                      <span className="flex items-center gap-1 text-emerald-400">
                        <Check className="w-3.5 h-3.5" />
                        Saved
                      </span>
                    ) : (
                      'Update'
                    )}
                  </button>
                </div>
              </form>

              {errorMsg && (
                <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded-md px-3 py-2">
                  {errorMsg}
                </p>
              )}

              <div className="flex items-center justify-between gap-2 pt-3 border-t border-zinc-800/80">
                <button
                  type="button"
                  disabled={submitting}
                  onClick={handleGoogleAction}
                  className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-md border border-zinc-700 bg-zinc-900 text-zinc-200 hover:border-zinc-500 cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Switch Google Account</span>
                </button>

                <button
                  type="button"
                  disabled={submitting}
                  onClick={handleLogout}
                  className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-md bg-zinc-800 text-zinc-100 hover:bg-red-500/20 hover:text-red-300 border border-zinc-700 transition-colors cursor-pointer disabled:opacity-50"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>{submitting ? 'Signing out...' : 'Sign Out'}</span>
                </button>
              </div>
            </div>
          ) : (
            /* Logged-Out Login / Sign Up Tabs */
            <div className="py-4 space-y-4 flex-1 flex flex-col justify-between">
              <div className="space-y-4">
                <div className="grid grid-cols-2 rounded-lg bg-zinc-900 p-1 border border-zinc-800">
                  <button
                    type="button"
                    onClick={() => {
                      setTab('login');
                      setResetMode(false);
                      setErrorMsg(null);
                      setInfoMsg(null);
                      setPassword('');
                      setConfirmPassword('');
                    }}
                    className={`flex items-center justify-center gap-1.5 py-2 text-xs font-medium rounded transition-colors cursor-pointer ${
                      tab === 'login'
                        ? 'bg-zinc-800 text-zinc-50'
                        : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    <LogIn className="w-3.5 h-3.5" />
                    <span>Log In</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setTab('signup');
                      setResetMode(false);
                      setErrorMsg(null);
                      setInfoMsg(null);
                      setPassword('');
                      setConfirmPassword('');
                    }}
                    className={`flex items-center justify-center gap-1.5 py-2 text-xs font-medium rounded transition-colors cursor-pointer ${
                      tab === 'signup'
                        ? 'bg-zinc-800 text-zinc-50'
                        : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    <span>Sign Up</span>
                  </button>
                </div>

                {tab === 'login' ? (
                  <form noValidate onSubmit={handleEmailLoginSubmit} className="space-y-3">
                    <div className="space-y-1">
                      <label htmlFor="login-email" className="block text-xs font-medium text-zinc-300">
                        Email
                      </label>
                      <input
                        id="login-email"
                        type="email"
                        autoComplete="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="you@example.com"
                        className="w-full px-3 py-2 text-xs bg-zinc-900 border border-zinc-700 focus:border-amber-500 rounded-md text-zinc-100 outline-none"
                      />
                    </div>

                    {!resetMode && (
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <label htmlFor="login-password" className="block text-xs font-medium text-zinc-300">
                            Password
                          </label>
                          <button
                            type="button"
                            onClick={() => {
                              setResetMode(true);
                              setErrorMsg(null);
                              setInfoMsg(null);
                            }}
                            className="text-[11px] text-amber-400 hover:text-amber-300 cursor-pointer"
                          >
                            Forgot password?
                          </button>
                        </div>
                        <div className="relative">
                          <input
                            id="login-password"
                            type={showPassword ? 'text' : 'password'}
                            autoComplete="current-password"
                            required
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="Enter your password"
                            className="w-full pl-3 pr-9 py-2 text-xs bg-zinc-900 border border-zinc-700 focus:border-amber-500 rounded-md text-zinc-100 outline-none"
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword((v) => !v)}
                            aria-label={showPassword ? 'Hide password' : 'Show password'}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-200 cursor-pointer"
                          >
                            {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      </div>
                    )}

                    <div className="flex items-center gap-2 pt-0.5">
                      <button
                        type="submit"
                        disabled={submitting || authLoading}
                        className="flex-1 py-2 px-4 rounded-md bg-amber-400 text-zinc-950 hover:bg-amber-300 text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-50"
                      >
                        <KeyRound className="w-3.5 h-3.5" />
                        <span>
                          {submitting
                            ? 'Working...'
                            : resetMode
                              ? 'Send Reset Link'
                              : 'Log In with Password'}
                        </span>
                      </button>
                      {resetMode && (
                        <button
                          type="button"
                          onClick={() => {
                            setResetMode(false);
                            setErrorMsg(null);
                          }}
                          className="px-3 py-2 text-xs font-medium rounded-md border border-zinc-700 text-zinc-300 hover:text-zinc-100 cursor-pointer"
                        >
                          Cancel
                        </button>
                      )}
                    </div>
                  </form>
                ) : (
                  <form noValidate onSubmit={handleEmailSignupSubmit} className="space-y-3">
                    <div className="space-y-1">
                      <label htmlFor="signup-username" className="block text-xs font-medium text-zinc-300">
                        Unique Username
                      </label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-mono text-zinc-500">
                          @
                        </span>
                        <input
                          id="signup-username"
                          type="text"
                          required
                          maxLength={24}
                          value={signupUsername}
                          onChange={(e) => setSignupUsername(normalizeUsername(e.target.value))}
                          placeholder="alex_cuts"
                          className="w-full pl-7 pr-3 py-2 text-xs font-mono bg-zinc-900 border border-zinc-700 focus:border-amber-500 rounded-md text-zinc-100 outline-none"
                        />
                      </div>
                      {renderHandleStatus(signupUsername)}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <div className="space-y-1">
                        <label htmlFor="signup-email" className="block text-xs font-medium text-zinc-300">
                          Email
                        </label>
                        <input
                          id="signup-email"
                          type="email"
                          autoComplete="email"
                          required
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          placeholder="you@example.com"
                          className="w-full px-3 py-2 text-xs bg-zinc-900 border border-zinc-700 focus:border-amber-500 rounded-md text-zinc-100 outline-none"
                        />
                      </div>

                      <div className="space-y-1">
                        <label htmlFor="signup-creator-name" className="block text-xs font-medium text-zinc-300">
                          Studio Name <span className="text-zinc-500">(opt.)</span>
                        </label>
                        <input
                          id="signup-creator-name"
                          type="text"
                          maxLength={80}
                          value={creatorName}
                          onChange={(e) => setCreatorName(e.target.value)}
                          placeholder="Alex Cuts"
                          className="w-full px-3 py-2 text-xs bg-zinc-900 border border-zinc-700 focus:border-amber-500 rounded-md text-zinc-100 outline-none"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <div className="space-y-1">
                        <label htmlFor="signup-password" className="block text-xs font-medium text-zinc-300">
                          Password
                        </label>
                        <div className="relative">
                          <input
                            id="signup-password"
                            type={showPassword ? 'text' : 'password'}
                            autoComplete="new-password"
                            required
                            minLength={6}
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="Min 6 characters"
                            className="w-full pl-3 pr-8 py-2 text-xs bg-zinc-900 border border-zinc-700 focus:border-amber-500 rounded-md text-zinc-100 outline-none"
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword((v) => !v)}
                            aria-label={showPassword ? 'Hide password' : 'Show password'}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-200 cursor-pointer"
                          >
                            {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      </div>

                      <div className="space-y-1">
                        <label htmlFor="signup-confirm-password" className="block text-xs font-medium text-zinc-300">
                          Confirm Password
                        </label>
                        <input
                          id="signup-confirm-password"
                          type={showPassword ? 'text' : 'password'}
                          autoComplete="new-password"
                          required
                          minLength={6}
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          placeholder="Repeat password"
                          className="w-full px-3 py-2 text-xs bg-zinc-900 border border-zinc-700 focus:border-amber-500 rounded-md text-zinc-100 outline-none"
                        />
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={
                        submitting ||
                        authLoading ||
                        checkingHandle ||
                        Boolean(handleCheck && !handleCheck.available)
                      }
                      className="w-full py-2 px-4 rounded-md bg-amber-400 text-zinc-950 hover:bg-amber-300 text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-50"
                    >
                      <UserPlus className="w-3.5 h-3.5" />
                      <span>{submitting ? 'Creating Account...' : 'Create Account'}</span>
                    </button>
                  </form>
                )}

                <div className="relative flex items-center py-0.5">
                  <div className="flex-1 border-t border-zinc-800" />
                  <span className="px-2.5 text-[10px] font-mono uppercase tracking-wider text-zinc-500">
                    or
                  </span>
                  <div className="flex-1 border-t border-zinc-800" />
                </div>

                <button
                  type="button"
                  disabled={submitting || authLoading}
                  onClick={handleGoogleAction}
                  className="w-full py-2 px-4 rounded-md bg-zinc-50 text-zinc-950 hover:bg-amber-400 text-xs font-semibold flex items-center justify-center gap-2.5 transition-colors cursor-pointer disabled:opacity-50"
                >
                  <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                    <path
                      fill="#4285F4"
                      d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 24c3.3 0 6.08-1.09 8.1-2.96l-3.88-3.05c-1.1.74-2.51 1.18-4.22 1.18-3.25 0-6-2.19-6.98-5.14H1.01v3.14C3.05 21.22 7.21 24 12 24Z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.02 14.03a7.17 7.17 0 0 1 0-4.06V6.83H1.01a11.98 11.98 0 0 0 0 10.34l4.01-3.14Z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 4.83c1.8 0 3.41.62 4.68 1.83l3.51-3.51C18.07 1.19 15.3 0 12 0 7.21 0 3.05 2.78 1.01 6.83l4.01 3.14C6 7.02 8.75 4.83 12 4.83Z"
                    />
                  </svg>
                  <span>
                    {submitting
                      ? 'Connecting to Google...'
                      : tab === 'login'
                        ? 'Continue with Google'
                        : 'Create Account with Google'}
                  </span>
                </button>

                {infoMsg && (
                  <p className="text-xs text-emerald-300 bg-emerald-500/10 border border-emerald-500/30 rounded-md px-3 py-2">
                    {infoMsg}
                  </p>
                )}

                {errorMsg && (
                  <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded-md px-3 py-2">
                    {errorMsg}
                  </p>
                )}
              </div>

              <div className="pt-3 border-t border-zinc-800/80 flex items-center justify-between text-[11px] text-zinc-500">
                <span>
                  {tab === 'login' ? 'New to KinoFrame?' : 'Already have an account?'}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setTab(tab === 'login' ? 'signup' : 'login');
                    setResetMode(false);
                    setErrorMsg(null);
                    setInfoMsg(null);
                    setPassword('');
                    setConfirmPassword('');
                  }}
                  className="text-amber-400 hover:text-amber-300 font-medium cursor-pointer"
                >
                  {tab === 'login' ? 'Create an account' : 'Log in instead'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
