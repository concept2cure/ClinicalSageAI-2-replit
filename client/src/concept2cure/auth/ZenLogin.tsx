/// <reference types="vite/client" />
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'wouter';
import {
  AlertCircle,
  CheckCircle2,
  Mail,
  Eye,
  EyeOff,
  ArrowLeft,
  Building2,
  Send,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Spinner } from '@/components/ui/spinner';
import {
  authService,
  useAuth as usePortalAuth,
  type MfaMethod,
} from '@/portal-v2/services/authService';

import { computeRedirect } from './redirectUtils';

/* ═══════════════════════════════════════════════════════════════════════════════
   TYPES
   ═══════════════════════════════════════════════════════════════════════════════ */

type View =
  | 'sign-in'
  | 'mfa'
  | 'forgot-password'
  | 'reset-password'
  | 'reset-sent'
  | 'request-license'
  | 'license-sent'
  | 'success';

interface AuthError {
  field?: 'email' | 'password' | 'mfa' | 'reset' | 'license';
  message: string;
}

/* ═══════════════════════════════════════════════════════════════════════════════
   BRAND ICONS — 18px inline SVGs, no external assets
   ═══════════════════════════════════════════════════════════════════════════════ */

const GoogleIcon = () => (
  <svg className="w-[18px] h-[18px] shrink-0" viewBox="0 0 24 24" aria-hidden="true">
    <path
      fill="#4285F4"
      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
    />
    <path
      fill="#34A853"
      d="M12 23c2.97 0 5.46-1 7.28-2.69l-3.57-2.77c-.99.69-2.26 1.1-3.71 1.1-2.87 0-5.3-1.94-6.16-4.53H2.13v2.84C3.99 20.53 7.7 23 12 23z"
    />
    <path
      fill="#FBBC05"
      d="M5.84 14.09A6.97 6.97 0 015.5 12c0-.72.13-1.43.35-2.09V7.07H2.13A11.99 11.99 0 001 12c0 1.94.46 3.77 1.13 5.41l3.71-3.32z"
    />
    <path
      fill="#EA4335"
      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.13 7.07l3.71 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
    />
  </svg>
);

const MicrosoftIcon = () => (
  <svg className="w-[18px] h-[18px] shrink-0" viewBox="0 0 21 21" aria-hidden="true">
    <rect fill="#f25022" x="1" y="1" width="9" height="9" />
    <rect fill="#7fba00" x="11" y="1" width="9" height="9" />
    <rect fill="#00a4ef" x="1" y="11" width="9" height="9" />
    <rect fill="#ffb900" x="11" y="11" width="9" height="9" />
  </svg>
);

/* ═══════════════════════════════════════════════════════════════════════════════
   PASSWORD FIELD — integrated show/hide
   ═══════════════════════════════════════════════════════════════════════════════ */

interface PasswordFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  autoComplete?: string;
  autoFocus?: boolean;
  disabled?: boolean;
  onSubmit?: () => void;
}

const PasswordField: React.FC<PasswordFieldProps> = ({
  id,
  label,
  value,
  onChange,
  placeholder,
  autoComplete,
  autoFocus,
  disabled,
  onSubmit,
}) => {
  const [show, setShow] = useState(false);
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Label htmlFor={id} className="text-[12px] font-medium text-stone-600">
          {label}
        </Label>
        <button
          type="button"
          className="inline-flex items-center gap-1 text-[11px] text-stone-400 hover:text-stone-700 transition-colors select-none"
          onClick={() => setShow(v => !v)}
          tabIndex={-1}
          aria-label={show ? 'Hide password' : 'Show password'}
        >
          {show ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
          {show ? 'Hide' : 'Show'}
        </button>
      </div>
      <Input
        id={id}
        type={show ? 'text' : 'password'}
        value={value}
        onChange={e => onChange(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter') {
            e.preventDefault();
            onSubmit?.();
          }
        }}
        placeholder={placeholder}
        autoComplete={autoComplete}
        autoFocus={autoFocus}
        disabled={disabled}
        className="h-[44px] rounded-[10px] border-stone-200 bg-white px-3.5 text-[14px] placeholder:text-stone-300 focus-visible:ring-1 focus-visible:ring-stone-300 focus-visible:border-stone-300 transition-shadow"
      />
    </div>
  );
};

/* ═══════════════════════════════════════════════════════════════════════════════
   MFA CODE INPUT — 6 individual digit boxes
   ═══════════════════════════════════════════════════════════════════════════════ */

const MfaCodeInput: React.FC<{
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}> = ({ value, onChange, disabled }) => {
  const refs = useRef<Array<HTMLInputElement | null>>([]);

  const handleDigit = (i: number, d: string) => {
    if (!/^\d*$/.test(d)) return;
    const arr = value.split('');
    arr[i] = d;
    const joined = arr.join('').slice(0, 6);
    onChange(joined);
    if (d && i < 5) refs.current[i + 1]?.focus();
  };

  const handleKey = (i: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !value[i] && i > 0) refs.current[i - 1]?.focus();
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const p = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    onChange(p);
    refs.current[Math.min(p.length, 5)]?.focus();
  };

  return (
    <div className="flex justify-center gap-2.5" role="group" aria-label="Verification code">
      {Array.from({ length: 6 }).map((_, i) => (
        <Input
          key={i}
          ref={el => {
            refs.current[i] = el;
          }}
          value={value[i] || ''}
          onChange={e => handleDigit(i, e.target.value)}
          onKeyDown={e => handleKey(i, e)}
          onPaste={handlePaste}
          disabled={disabled}
          inputMode="numeric"
          maxLength={1}
          autoComplete="one-time-code"
          className="h-[48px] w-[44px] rounded-[10px] border-stone-200 bg-white text-center text-[18px] font-medium placeholder:text-stone-200 focus-visible:ring-1 focus-visible:ring-stone-300"
        />
      ))}
    </div>
  );
};

/* ═══════════════════════════════════════════════════════════════════════════════
   SSO HANDLER
   ═══════════════════════════════════════════════════════════════════════════════ */

function handleSsoRedirect(provider: 'google' | 'microsoft') {
  window.location.href = `/api/auth/sso/${provider}/initiate`;
}

/* ═══════════════════════════════════════════════════════════════════════════════
   ZenLogin — MAIN EXPORT
   ═══════════════════════════════════════════════════════════════════════════════ */

export const ZenLogin: React.FC = () => {
  const [, setLocation] = useLocation();
  const { login, devLogin, verifyMfa } = usePortalAuth();

  const search = typeof window !== 'undefined' ? window.location.search : '';
  const params = useMemo(() => new URLSearchParams(search), [search]);
  const resetToken = params.get('token')?.trim() || '';

  /* ── state ─────────────────────────────────────────────────────────────── */
  const [view, setView] = useState<View>(resetToken ? 'reset-password' : 'sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [mfaCode, setMfaCode] = useState('');
  const [mfaMethod, setMfaMethod] = useState<MfaMethod['type']>('email');
  const [availableMfaMethods, setAvailableMfaMethods] = useState<MfaMethod[]>([]);
  const [maskedEmail, setMaskedEmail] = useState('');
  const [resendCountdown, setResendCountdown] = useState(0);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isDevLoading, setIsDevLoading] = useState(false);
  const [error, setError] = useState<AuthError | null>(null);

  // License request state
  const [licName, setLicName] = useState('');
  const [licEmail, setLicEmail] = useState('');
  const [licOrg, setLicOrg] = useState('');
  const [licMessage, setLicMessage] = useState('');

  const supportsRecoveryCodes = useMemo(
    () => availableMfaMethods.some(m => m.type === 'backup_code'),
    [availableMfaMethods]
  );

  /* ── side effects ──────────────────────────────────────────────────────── */

  // SSO callback: consume token from redirect query params
  useEffect(() => {
    const ssoToken = params.get('sso_token');
    const ssoProvider = params.get('sso_provider');
    if (!ssoToken || !ssoProvider) return;

    // Clean query params from URL immediately to prevent token leakage on refresh
    const cleanUrl = window.location.pathname;
    window.history.replaceState({}, '', cleanUrl);

    // Store token and user info via authService
    const ssoEmail = params.get('sso_email') || `sso-user@${ssoProvider}.com`;
    const ssoOrgId = params.get('sso_org_id') || '';
    const ssoOrgName = params.get('sso_org_name') || '';
    const ssoName = params.get('sso_name') || 'SSO User';
    const [firstName, ...lastParts] = ssoName.split(' ');
    const lastName = lastParts.join(' ') || '';

    authService.setToken(
      ssoToken,
      {
        id: 0,
        email: ssoEmail,
        firstName,
        lastName,
        organizationId: ssoOrgId ? Number(ssoOrgId) : undefined,
        organizationName: ssoOrgName || undefined,
        roles: ['client_user'],
      } as any,
      undefined,
      86400
    );

    setView('success');
    window.setTimeout(() => {
      setLocation(computeRedirect(undefined, undefined, () => authService.getUser()));
    }, 400);
  }, [params, setLocation]);

  useEffect(() => {
    if (view !== 'mfa' || resendCountdown <= 0) return;
    const t = window.setTimeout(() => setResendCountdown(c => c - 1), 1000);
    return () => window.clearTimeout(t);
  }, [view, resendCountdown]);

  useEffect(() => {
    setError(null);
  }, [email, password, mfaCode, newPassword, confirmPassword]);

  const validateEmail = useCallback((v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), []);

  /* ── handlers ──────────────────────────────────────────────────────────── */

  const handleLogin = useCallback(async () => {
    if (!validateEmail(email)) {
      setError({ field: 'email', message: 'Enter a valid email address.' });
      return;
    }
    if (!password) {
      setError({ field: 'password', message: 'Enter your password.' });
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const result = await login({ email: email.trim(), password, rememberDevice: rememberMe });

      if (!result.success) {
        setError({
          field: 'password',
          message: result.error?.message || 'Unable to sign in. Check your credentials.',
        });
        return;
      }

      if (result.data?.mfaRequired) {
        const methods = result.data.methods || [
          { type: 'email', isEnabled: true, isPrimary: true },
        ];
        setAvailableMfaMethods(methods);
        setMfaMethod(methods[0]?.type || 'email');
        setMaskedEmail(result.data.maskedEmail || '');
        setResendCountdown(methods[0]?.type === 'email' ? 60 : 0);
        setView('mfa');
        return;
      }

      setView('success');
      window.setTimeout(() => {
        setLocation(computeRedirect(undefined, undefined, () => authService.getUser()));
      }, 400);
    } finally {
      setIsLoading(false);
    }
  }, [email, login, password, rememberMe, setLocation, validateEmail]);

  const handleVerifyMfa = useCallback(async () => {
    const code = mfaCode.trim();
    if (!code || (mfaMethod !== 'backup_code' && code.length !== 6)) {
      setError({
        field: 'mfa',
        message:
          mfaMethod === 'backup_code' ? 'Enter a recovery code.' : 'Enter the full 6-digit code.',
      });
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const result = await verifyMfa({ method: mfaMethod, code });
      if (!result.success) {
        setError({ field: 'mfa', message: result.error?.message || 'Code not accepted.' });
        return;
      }
      setView('success');
      window.setTimeout(() => {
        setLocation(computeRedirect(undefined, undefined, () => authService.getUser()));
      }, 400);
    } finally {
      setIsLoading(false);
    }
  }, [mfaCode, mfaMethod, setLocation, verifyMfa]);

  const handleForgotPassword = useCallback(async () => {
    if (!validateEmail(email)) {
      setError({ field: 'email', message: 'Enter the email for your account.' });
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const result = await authService.requestPasswordReset({ email: email.trim() });
      if (!result.success) {
        setError({
          field: 'email',
          message: result.error?.message || 'Unable to send reset link.',
        });
        return;
      }
      setView('reset-sent');
    } finally {
      setIsLoading(false);
    }
  }, [email, validateEmail]);

  const handleResetPassword = useCallback(async () => {
    if (!resetToken) {
      setError({ field: 'reset', message: 'Reset link is missing a valid token.' });
      return;
    }
    if (!newPassword) {
      setError({ field: 'reset', message: 'Enter a new password.' });
      return;
    }
    if (newPassword !== confirmPassword) {
      setError({ field: 'reset', message: 'Passwords do not match.' });
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const result = await authService.confirmPasswordReset({ token: resetToken, newPassword });
      if (!result.success) {
        setError({ field: 'reset', message: result.error?.message || 'Unable to reset password.' });
        return;
      }
      setView('success');
      window.setTimeout(() => {
        setLocation('/concept2cure/login');
      }, 600);
    } finally {
      setIsLoading(false);
    }
  }, [confirmPassword, newPassword, resetToken, setLocation]);

  const handleResendCode = useCallback(async () => {
    if (resendCountdown > 0 || mfaMethod !== 'email') return;
    const result = await authService.resendLoginOtp();
    if (!result.success) {
      setError({ field: 'mfa', message: result.error?.message || 'Unable to resend.' });
      return;
    }
    setMaskedEmail(result.data?.maskedEmail || maskedEmail);
    setResendCountdown(60);
  }, [maskedEmail, mfaMethod, resendCountdown]);

  const handleLicenseRequest = useCallback(async () => {
    if (!licName.trim()) {
      setError({ field: 'license', message: 'Enter your name.' });
      return;
    }
    if (!validateEmail(licEmail)) {
      setError({ field: 'license', message: 'Enter a valid email.' });
      return;
    }
    if (!licOrg.trim()) {
      setError({ field: 'license', message: 'Enter your organization.' });
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/license-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: licName.trim(),
          email: licEmail.trim(),
          organization: licOrg.trim(),
          message: licMessage.trim(),
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error?.message || 'Request failed.');
      }
      setView('license-sent');
    } catch (err) {
      setError({
        field: 'license',
        message: err instanceof Error ? err.message : 'Unable to submit request.',
      });
    } finally {
      setIsLoading(false);
    }
  }, [licName, licEmail, licOrg, licMessage, validateEmail]);

  /* ── heading text per view ─────────────────────────────────────────────── */

  const headingText: Record<View, string> = {
    'sign-in': 'Sign in to your account',
    mfa: 'Verify your identity',
    'forgot-password': 'Reset your password',
    'reset-password': 'Create new password',
    'reset-sent': 'Check your inbox',
    'request-license': 'Request a license',
    'license-sent': 'Request submitted',
    success: 'Welcome back',
  };

  const subtitleText: Record<View, string> = {
    'sign-in': '',
    mfa: maskedEmail ? `Code sent to ${maskedEmail}` : 'Enter your verification code',
    'forgot-password': "We'll send you a link to reset your password.",
    'reset-password': 'Choose a strong password for your account.',
    'reset-sent': "If the account exists, you'll receive a reset link.",
    'request-license': "Tell us about your organization and we'll be in touch.",
    'license-sent': "We've received your request and will respond within one business day.",
    success: 'Redirecting you now...',
  };

  /* ══════════════════════════════════════════════════════════════════════════
     RENDER
     ══════════════════════════════════════════════════════════════════════════ */

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-[#f5f4f1] font-sans antialiased text-stone-900 p-0 sm:p-6 lg:p-10">
      {/* ── Auth Shell ─────────────────────────────────────────────────────── */}
      <div className="flex w-full max-w-[1120px] min-h-[700px] overflow-hidden bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04),0_8px_30px_rgba(0,0,0,0.06)] sm:rounded-2xl flex-col lg:flex-row">
        {/* ── LEFT PANEL — Dark Brand ────────────────────────────────────── */}
        <div className="relative flex w-full lg:w-[40%] shrink-0 flex-col justify-between bg-stone-950 p-10 lg:p-14 overflow-hidden">
          {/* Subtle background texture */}
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.03]"
            style={{
              backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)',
              backgroundSize: '24px 24px',
            }}
          />

          {/* Top — Brand name */}
          <div className="relative z-10">
            <div className="inline-flex items-center gap-2.5 rounded-lg bg-white/[0.06] px-3 py-1.5 mb-10">
              <div className="h-2 w-2 rounded-full bg-emerald-400" />
              <span className="text-[11px] font-medium tracking-wide text-stone-400 uppercase">
                Regulatory Intelligence Platform
              </span>
            </div>
          </div>

          {/* Center — Headline */}
          <div className="relative z-10 flex-1 flex flex-col justify-center -mt-8">
            <h1 className="text-[38px] lg:text-[44px] font-semibold tracking-[-0.02em] leading-[1.1] text-white">
              AnA 1.0 RI
            </h1>
            <p className="mt-4 max-w-[260px] text-[15px] leading-relaxed text-stone-400">
              Regulatory intelligence for governed document work.
            </p>
          </div>

          {/* Bottom — Trust signals */}
          <div className="relative z-10 flex items-center gap-4 pt-8 border-t border-white/[0.06]">
            <span className="text-[11px] text-stone-500">21 CFR Part 11</span>
            <span className="text-stone-700">·</span>
            <span className="text-[11px] text-stone-500">SOC 2 Type II</span>
            <span className="text-stone-700">·</span>
            <span className="text-[11px] text-stone-500">HIPAA</span>
          </div>
        </div>

        {/* ── RIGHT PANEL — Form ─────────────────────────────────────────── */}
        <div className="flex flex-1 flex-col justify-center px-6 sm:px-14 lg:px-20 py-12 lg:py-0">
          <div className="mx-auto w-full max-w-[360px]">
            {/* ── Header ───────────────────────────────────────────────── */}
            <div className="mb-8">
              {view !== 'sign-in' && view !== 'success' && (
                <button
                  type="button"
                  className="inline-flex items-center gap-1.5 text-[12px] text-stone-400 hover:text-stone-700 transition-colors mb-5"
                  onClick={() => setView('sign-in')}
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  Back to sign in
                </button>
              )}
              <h2 className="text-[22px] font-semibold tracking-[-0.01em] text-stone-900">
                {headingText[view]}
              </h2>
              {subtitleText[view] && (
                <p className="mt-1.5 text-[13px] text-stone-400 leading-relaxed">
                  {subtitleText[view]}
                </p>
              )}
              {view === 'sign-in' && (
                <p className="mt-1.5 text-[13px] text-stone-400">
                  New here?{' '}
                  <button
                    type="button"
                    className="font-medium text-stone-700 hover:text-stone-900 underline underline-offset-2 decoration-stone-300 hover:decoration-stone-500 transition-colors"
                    onClick={() => setLocation('/concept2cure/signup')}
                  >
                    Create an account
                  </button>{' '}
                  or{' '}
                  <button
                    type="button"
                    className="font-medium text-stone-700 hover:text-stone-900 underline underline-offset-2 decoration-stone-300 hover:decoration-stone-500 transition-colors"
                    onClick={() => setView('request-license')}
                  >
                    request a license
                  </button>
                </p>
              )}
            </div>

            {/* ── Error Display ─────────────────────────────────────────── */}
            {error && (
              <div
                className="mb-6 flex items-start gap-2.5 rounded-[10px] border border-red-100 bg-red-50/60 px-3.5 py-3"
                role="alert"
              >
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
                <p className="text-[13px] leading-snug text-red-600">{error.message}</p>
              </div>
            )}

            {/* ══════════════════════════════════════════════════════════════
               VIEW: SIGN IN
               ══════════════════════════════════════════════════════════════ */}
            {view === 'sign-in' && (
              <div className="space-y-5">
                {/* SSO Buttons */}
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => handleSsoRedirect('google')}
                    className="group flex h-[44px] items-center justify-center gap-2.5 rounded-[10px] border border-stone-200 bg-white text-[13px] font-medium text-stone-600 transition-all hover:border-stone-300 hover:bg-stone-50 hover:shadow-sm active:scale-[0.98]"
                  >
                    <GoogleIcon />
                    <span>Google</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSsoRedirect('microsoft')}
                    className="group flex h-[44px] items-center justify-center gap-2.5 rounded-[10px] border border-stone-200 bg-white text-[13px] font-medium text-stone-600 transition-all hover:border-stone-300 hover:bg-stone-50 hover:shadow-sm active:scale-[0.98]"
                  >
                    <MicrosoftIcon />
                    <span>Microsoft</span>
                  </button>
                </div>

                {/* OR divider */}
                <div className="relative flex items-center py-1">
                  <div className="flex-1 border-t border-stone-100" />
                  <span className="mx-4 text-[11px] font-medium uppercase tracking-wider text-stone-300 select-none">
                    or
                  </span>
                  <div className="flex-1 border-t border-stone-100" />
                </div>

                {/* Email/Password Form */}
                <form
                  className="space-y-4"
                  onSubmit={e => {
                    e.preventDefault();
                    handleLogin();
                  }}
                >
                  <div className="space-y-1.5">
                    <Label htmlFor="login-email" className="text-[12px] font-medium text-stone-600">
                      Email
                    </Label>
                    <Input
                      id="login-email"
                      type="email"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      placeholder="name@company.com"
                      autoComplete="email"
                      autoFocus
                      className="h-[44px] rounded-[10px] border-stone-200 bg-white px-3.5 text-[14px] placeholder:text-stone-300 focus-visible:ring-1 focus-visible:ring-stone-300 focus-visible:border-stone-300 transition-shadow"
                    />
                  </div>

                  <PasswordField
                    id="login-password"
                    label="Password"
                    value={password}
                    onChange={setPassword}
                    onSubmit={handleLogin}
                    placeholder="Enter your password"
                    autoComplete="current-password"
                    disabled={isLoading}
                  />

                  <div className="flex items-center justify-between pt-0.5">
                    <label className="flex items-center gap-2 text-[12px] text-stone-500 select-none cursor-pointer">
                      <Checkbox
                        checked={rememberMe}
                        onCheckedChange={c => setRememberMe(c === true)}
                        className="h-3.5 w-3.5 rounded-[4px] border-stone-300 data-[state=checked]:bg-stone-900 data-[state=checked]:border-stone-900"
                      />
                      Remember me
                    </label>
                    <button
                      type="button"
                      className="text-[12px] font-medium text-stone-400 hover:text-stone-700 transition-colors"
                      onClick={() => setView('forgot-password')}
                    >
                      Forgot password?
                    </button>
                  </div>

                  <Button
                    type="submit"
                    disabled={isLoading}
                    className="h-[44px] w-full rounded-[10px] bg-stone-900 text-[13px] font-semibold text-white shadow-sm hover:bg-stone-800 active:bg-stone-950 transition-all mt-1"
                  >
                    {isLoading ? <Spinner size="sm" className="mr-2" /> : null}
                    Sign in
                  </Button>
                </form>

                {/* Dev-only Demo Access */}
                {import.meta.env.MODE === 'development' && (
                  <>
                    <div className="relative flex items-center pt-2">
                      <div className="flex-1 border-t border-dashed border-stone-100" />
                      <span className="mx-3 text-[10px] text-stone-300 uppercase tracking-wider select-none">
                        dev
                      </span>
                      <div className="flex-1 border-t border-dashed border-stone-100" />
                    </div>
                    <button
                      type="button"
                      disabled={isLoading || isDevLoading}
                      className="flex h-[36px] w-full items-center justify-center rounded-[8px] text-[12px] font-medium text-stone-400 hover:text-stone-600 hover:bg-stone-50 transition-all disabled:opacity-40"
                      onClick={async () => {
                        setIsDevLoading(true);
                        setError(null);
                        try {
                          const result = await devLogin?.();
                          if (result?.success) {
                            setView('success');
                            setTimeout(() => {
                              setLocation(
                                computeRedirect(undefined, undefined, () => authService.getUser())
                              );
                            }, 400);
                          } else {
                            setError({ message: 'Dev login failed.' });
                          }
                        } catch {
                          setError({ message: 'Dev login failed.' });
                        } finally {
                          setIsDevLoading(false);
                        }
                      }}
                    >
                      {isDevLoading ? <Spinner size="sm" className="mr-1.5" /> : null}
                      Demo Access
                    </button>
                  </>
                )}
              </div>
            )}

            {/* ══════════════════════════════════════════════════════════════
               VIEW: MFA
               ══════════════════════════════════════════════════════════════ */}
            {view === 'mfa' && (
              <div className="space-y-6">
                <MfaCodeInput value={mfaCode} onChange={setMfaCode} disabled={isLoading} />
                <Button
                  className="h-[44px] w-full rounded-[10px] bg-stone-900 text-[13px] font-semibold text-white hover:bg-stone-800 transition-all"
                  onClick={handleVerifyMfa}
                  disabled={isLoading}
                >
                  {isLoading ? <Spinner size="sm" className="mr-2" /> : null}
                  Verify
                </Button>
                <div className="flex flex-col items-center gap-1.5 pt-1">
                  {mfaMethod === 'email' && (
                    <button
                      type="button"
                      className="text-[12px] text-stone-400 hover:text-stone-700 disabled:opacity-40 transition-colors"
                      onClick={handleResendCode}
                      disabled={resendCountdown > 0 || isLoading}
                    >
                      {resendCountdown > 0 ? `Resend code (${resendCountdown}s)` : 'Resend code'}
                    </button>
                  )}
                  {supportsRecoveryCodes && mfaMethod !== 'backup_code' && (
                    <button
                      type="button"
                      className="text-[12px] text-stone-400 hover:text-stone-700 transition-colors"
                      onClick={() => {
                        setMfaMethod('backup_code');
                        setMfaCode('');
                      }}
                    >
                      Use a recovery code
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* ══════════════════════════════════════════════════════════════
               VIEW: FORGOT PASSWORD
               ══════════════════════════════════════════════════════════════ */}
            {view === 'forgot-password' && (
              <div className="space-y-5">
                <div className="space-y-1.5">
                  <Label htmlFor="reset-email" className="text-[12px] font-medium text-stone-600">
                    Email address
                  </Label>
                  <Input
                    id="reset-email"
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="name@company.com"
                    autoFocus
                    className="h-[44px] rounded-[10px] border-stone-200 bg-white px-3.5 text-[14px] placeholder:text-stone-300 focus-visible:ring-1 focus-visible:ring-stone-300"
                  />
                </div>
                <Button
                  className="h-[44px] w-full rounded-[10px] bg-stone-900 text-[13px] font-semibold text-white hover:bg-stone-800 transition-all"
                  onClick={handleForgotPassword}
                  disabled={isLoading}
                >
                  {isLoading ? <Spinner size="sm" className="mr-2" /> : null}
                  Send reset link
                </Button>
              </div>
            )}

            {/* ══════════════════════════════════════════════════════════════
               VIEW: RESET SENT
               ══════════════════════════════════════════════════════════════ */}
            {view === 'reset-sent' && (
              <div className="flex flex-col items-center space-y-5 pt-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-stone-100">
                  <Mail className="h-6 w-6 text-stone-500" />
                </div>
                <Button
                  variant="outline"
                  className="h-[44px] w-full rounded-[10px] border-stone-200 text-[13px] font-medium"
                  onClick={() => setView('sign-in')}
                >
                  Return to sign in
                </Button>
              </div>
            )}

            {/* ══════════════════════════════════════════════════════════════
               VIEW: RESET PASSWORD
               ══════════════════════════════════════════════════════════════ */}
            {view === 'reset-password' && (
              <div className="space-y-5">
                <PasswordField
                  id="new-pwd"
                  label="New password"
                  value={newPassword}
                  onChange={setNewPassword}
                  placeholder="At least 12 characters"
                  disabled={isLoading}
                />
                <PasswordField
                  id="confirm-pwd"
                  label="Confirm password"
                  value={confirmPassword}
                  onChange={setConfirmPassword}
                  placeholder="Re-enter password"
                  onSubmit={handleResetPassword}
                  disabled={isLoading}
                />
                <Button
                  className="h-[44px] w-full rounded-[10px] bg-stone-900 text-[13px] font-semibold text-white hover:bg-stone-800 transition-all"
                  onClick={handleResetPassword}
                  disabled={isLoading}
                >
                  {isLoading ? <Spinner size="sm" className="mr-2" /> : null}
                  Save and continue
                </Button>
              </div>
            )}

            {/* ══════════════════════════════════════════════════════════════
               VIEW: REQUEST LICENSE
               ══════════════════════════════════════════════════════════════ */}
            {view === 'request-license' && (
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="lic-name" className="text-[12px] font-medium text-stone-600">
                    Full name
                  </Label>
                  <Input
                    id="lic-name"
                    value={licName}
                    onChange={e => setLicName(e.target.value)}
                    placeholder="Jane Smith"
                    autoFocus
                    className="h-[44px] rounded-[10px] border-stone-200 bg-white px-3.5 text-[14px] placeholder:text-stone-300 focus-visible:ring-1 focus-visible:ring-stone-300"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="lic-email" className="text-[12px] font-medium text-stone-600">
                    Work email
                  </Label>
                  <Input
                    id="lic-email"
                    type="email"
                    value={licEmail}
                    onChange={e => setLicEmail(e.target.value)}
                    placeholder="jane@pharma.com"
                    className="h-[44px] rounded-[10px] border-stone-200 bg-white px-3.5 text-[14px] placeholder:text-stone-300 focus-visible:ring-1 focus-visible:ring-stone-300"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="lic-org" className="text-[12px] font-medium text-stone-600">
                    Organization
                  </Label>
                  <Input
                    id="lic-org"
                    value={licOrg}
                    onChange={e => setLicOrg(e.target.value)}
                    placeholder="Acme Pharmaceuticals"
                    className="h-[44px] rounded-[10px] border-stone-200 bg-white px-3.5 text-[14px] placeholder:text-stone-300 focus-visible:ring-1 focus-visible:ring-stone-300"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="lic-msg" className="text-[12px] font-medium text-stone-600">
                    Message <span className="text-stone-300 font-normal">(optional)</span>
                  </Label>
                  <textarea
                    id="lic-msg"
                    value={licMessage}
                    onChange={e => setLicMessage(e.target.value)}
                    placeholder="Tell us about your use case..."
                    rows={3}
                    className="flex w-full rounded-[10px] border border-stone-200 bg-white px-3.5 py-3 text-[14px] placeholder:text-stone-300 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-stone-300 focus-visible:border-stone-300 transition-shadow resize-none"
                  />
                </div>
                <Button
                  className="h-[44px] w-full rounded-[10px] bg-stone-900 text-[13px] font-semibold text-white hover:bg-stone-800 transition-all mt-1"
                  onClick={handleLicenseRequest}
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <Spinner size="sm" className="mr-2" />
                  ) : (
                    <Send className="w-4 h-4 mr-2" />
                  )}
                  Submit request
                </Button>
              </div>
            )}

            {/* ══════════════════════════════════════════════════════════════
               VIEW: LICENSE SENT
               ══════════════════════════════════════════════════════════════ */}
            {view === 'license-sent' && (
              <div className="flex flex-col items-center space-y-5 pt-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50">
                  <CheckCircle2 className="h-6 w-6 text-emerald-500" />
                </div>
                <p className="text-center text-[13px] text-stone-500 max-w-[280px]">
                  We'll review your request and reach out to{' '}
                  <span className="font-medium text-stone-700">{licEmail}</span> shortly.
                </p>
                <Button
                  variant="outline"
                  className="h-[44px] w-full rounded-[10px] border-stone-200 text-[13px] font-medium"
                  onClick={() => setView('sign-in')}
                >
                  Return to sign in
                </Button>
              </div>
            )}

            {/* ══════════════════════════════════════════════════════════════
               VIEW: SUCCESS
               ══════════════════════════════════════════════════════════════ */}
            {view === 'success' && (
              <div className="flex flex-col items-center pt-6">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 mb-4">
                  <CheckCircle2 className="h-6 w-6 text-emerald-500" />
                </div>
                <div className="flex items-center gap-2 text-[13px] text-stone-400">
                  <Spinner size="sm" />
                  Redirecting...
                </div>
              </div>
            )}

            {/* ── Footer ─────────────────────────────────────────────────── */}
            <div className="mt-10 pt-6 border-t border-stone-100">
              <p className="text-[11px] text-stone-300 text-center leading-relaxed">
                By signing in, you agree to our{' '}
                <a
                  href="/terms"
                  className="underline underline-offset-2 hover:text-stone-500 transition-colors"
                >
                  Terms
                </a>{' '}
                and{' '}
                <a
                  href="/privacy"
                  className="underline underline-offset-2 hover:text-stone-500 transition-colors"
                >
                  Privacy Policy
                </a>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
