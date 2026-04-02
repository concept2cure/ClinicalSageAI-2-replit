/// <reference types="vite/client" />
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'wouter';
import { AlertCircle, ArrowLeft, CheckCircle2, Mail, XCircle } from 'lucide-react';

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

import concept2cureIcon from '@/assets/concept2cure-icon.svg';
import { computeRedirect } from './redirectUtils';
import { getMfaMethodLabel, normalizeEmail } from './authInputUtils';
import { computeFailedLoginState, getLockoutRemainingSeconds } from './loginLockout';
import { evaluatePasswordPolicy, isPasswordPolicySatisfied } from './passwordPolicy';

type View = 'sign-in' | 'mfa' | 'forgot-password' | 'reset-password' | 'reset-sent' | 'success';

interface AuthError {
  field?: 'email' | 'password' | 'mfa' | 'reset';
  message: string;
}

interface PasswordFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
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
  const [showPassword, setShowPassword] = useState(false);

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Label htmlFor={id} className="text-sm font-medium text-slate-700">
          {label}
        </Label>
        <button
          type="button"
          className="text-xs text-slate-400 transition-colors hover:text-slate-600"
          onClick={() => setShowPassword(current => !current)}
        >
          {showPassword ? 'Hide' : 'Show'}
        </button>
      </div>
      <Input
        id={id}
        type={showPassword ? 'text' : 'password'}
        value={value}
        onChange={event => onChange(event.target.value)}
        onKeyDown={event => {
          if (event.key === 'Enter') {
            event.preventDefault();
            onSubmit?.();
          }
        }}
        placeholder={placeholder}
        autoComplete={autoComplete}
        autoFocus={autoFocus}
        disabled={disabled}
        className="h-11 rounded-lg border-slate-200 bg-white text-sm focus-visible:ring-2 focus-visible:ring-blue-500/30 focus-visible:border-blue-400"
      />
    </div>
  );
};

const MfaCodeInput: React.FC<{
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}> = ({ value, onChange, disabled }) => {
  const inputRefs = useRef<Array<HTMLInputElement | null>>([]);

  const handleDigitChange = (index: number, digit: string) => {
    if (!/^\d*$/.test(digit)) return;
    const next = value.split('');
    next[index] = digit;
    const joined = next.join('').slice(0, 6);
    onChange(joined);
    if (digit && index < 5) inputRefs.current[index + 1]?.focus();
  };

  const handleKeyDown = (index: number, event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Backspace' && !value[index] && index > 0) inputRefs.current[index - 1]?.focus();
  };

  const handlePaste = (event: React.ClipboardEvent<HTMLInputElement>) => {
    event.preventDefault();
    const pasted = event.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    onChange(pasted);
    inputRefs.current[Math.max(0, Math.min(pasted.length - 1, 5))]?.focus();
  };

  return (
    <div className="flex justify-center gap-2.5">
      {Array.from({ length: 6 }).map((_, index) => (
        <Input
          key={index}
          ref={element => { inputRefs.current[index] = element; }}
          value={value[index] || ''}
          onChange={event => handleDigitChange(index, event.target.value)}
          onKeyDown={event => handleKeyDown(index, event)}
          onPaste={handlePaste}
          disabled={disabled}
          inputMode="numeric"
          maxLength={1}
          autoComplete="one-time-code"
          className="h-11 w-11 rounded-lg border-slate-200 bg-white px-0 text-center text-base font-medium focus-visible:ring-2 focus-visible:ring-blue-500/30 focus-visible:border-blue-400"
        />
      ))}
    </div>
  );
};

const isDev = typeof window !== 'undefined' && (
  window.location.hostname === 'localhost' ||
  window.location.hostname.includes('github.dev') ||
  window.location.hostname.includes('replit')
);

export const ZenLogin: React.FC = () => {
  const [, setLocation] = useLocation();
  const { login, verifyMfa } = usePortalAuth();

  const search = typeof window !== 'undefined' ? window.location.search : '';
  const params = useMemo(() => new URLSearchParams(search), [search]);
  const resetToken = params.get('token')?.trim() || '';

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
  const [successMessage, setSuccessMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isDemoLoading, setIsDemoLoading] = useState(false);
  const [isResendingCode, setIsResendingCode] = useState(false);
  const [failedSignInAttempts, setFailedSignInAttempts] = useState(0);
  const [signInLockedUntil, setSignInLockedUntil] = useState<number | null>(null);
  const [lockoutSecondsRemaining, setLockoutSecondsRemaining] = useState(0);
  const [error, setError] = useState<AuthError | null>(null);

  const supportsRecoveryCodes = useMemo(
    () => availableMfaMethods.some(method => method.type === 'backup_code'),
    [availableMfaMethods]
  );
  const passwordRules = useMemo(() => evaluatePasswordPolicy(newPassword), [newPassword]);
  const isPasswordCompliant = useMemo(
    () => isPasswordPolicySatisfied(newPassword),
    [newPassword]
  );
  const doPasswordsMatch = newPassword.length > 0 && newPassword === confirmPassword;

  useEffect(() => {
    if (view !== 'mfa' || resendCountdown <= 0) return;
    const timer = window.setTimeout(() => setResendCountdown(current => current - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [view, resendCountdown]);

  useEffect(() => { setError(null); }, [email, password, mfaCode, newPassword, confirmPassword]);

  useEffect(() => {
    if (!signInLockedUntil) { setLockoutSecondsRemaining(0); return; }
    const updateRemaining = () => {
      const seconds = Math.max(0, Math.ceil((signInLockedUntil - Date.now()) / 1000));
      setLockoutSecondsRemaining(seconds);
      if (seconds === 0) { setSignInLockedUntil(null); setFailedSignInAttempts(0); }
    };
    updateRemaining();
    const timer = window.setInterval(updateRemaining, 1000);
    return () => window.clearInterval(timer);
  }, [signInLockedUntil]);

  const validateEmail = useCallback((value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value), []);

  const handleLogin = useCallback(async () => {
    if (signInLockedUntil && signInLockedUntil > Date.now()) {
      setError({
        field: 'password',
        message: `Too many attempts. Wait ${Math.max(1, getLockoutRemainingSeconds(signInLockedUntil))}s.`,
      });
      return;
    }
    const normalizedEmail = normalizeEmail(email);
    if (!validateEmail(normalizedEmail)) {
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
      const result = await login({ email: normalizedEmail, password, rememberDevice: rememberMe });
      if (!result.success) {
        const nextState = computeFailedLoginState(failedSignInAttempts);
        setFailedSignInAttempts(nextState.failedAttempts);
        if (nextState.lockedUntil) {
          setSignInLockedUntil(nextState.lockedUntil);
          setError({ field: 'password', message: 'Too many failed attempts. Locked for 30 seconds.' });
          return;
        }
        setError({ field: 'password', message: result.error?.message || 'Invalid credentials.' });
        return;
      }
      setFailedSignInAttempts(0);
      setSignInLockedUntil(null);
      if (result.data?.mfaRequired) {
        const methods = result.data.methods || [{ type: 'email', isEnabled: true, isPrimary: true }];
        setAvailableMfaMethods(methods);
        setMfaMethod(methods[0]?.type || 'email');
        setMaskedEmail(result.data.maskedEmail || '');
        setResendCountdown(methods[0]?.type === 'email' ? 60 : 0);
        setView('mfa');
        return;
      }
      setView('success');
      setSuccessMessage('Signed in.');
      window.setTimeout(() => {
        setLocation(computeRedirect(undefined, undefined, () => authService.getUser()));
      }, 300);
    } finally { setIsLoading(false); }
  }, [email, failedSignInAttempts, login, password, rememberMe, setLocation, signInLockedUntil, validateEmail]);

  const handleDemoLogin = useCallback(async () => {
    setIsDemoLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/dev-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'jm.smith@concept2cure.pro' }),
      });
      const data = await res.json();
      if (data.token || data.accessToken) {
        const token = data.token || data.accessToken;
        localStorage.setItem('trialsage_access_token', token);
        if (data.refreshToken) localStorage.setItem('trialsage_refresh_token', data.refreshToken);
        if (data.user) localStorage.setItem('trialsage_user', JSON.stringify(data.user));
        setView('success');
        setSuccessMessage('Demo access granted.');
        window.setTimeout(() => { setLocation('/concept2cure'); }, 300);
      } else {
        setError({ message: data.message || 'Demo login failed.' });
      }
    } catch {
      setError({ message: 'Could not reach the server.' });
    } finally { setIsDemoLoading(false); }
  }, [setLocation]);

  const handleVerifyMfa = useCallback(async () => {
    const method = mfaMethod;
    const trimmedCode = mfaCode.trim();
    if (!trimmedCode || (method !== 'backup_code' && trimmedCode.length !== 6)) {
      setError({
        field: 'mfa',
        message: method === 'backup_code' ? 'Enter a recovery code.' : 'Enter the full 6-digit code.',
      });
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const result = await verifyMfa({ method, code: trimmedCode });
      if (!result.success) {
        setError({ field: 'mfa', message: result.error?.message || 'Code not accepted.' });
        return;
      }
      setView('success');
      setSuccessMessage('Verified.');
      window.setTimeout(() => {
        setLocation(computeRedirect(undefined, undefined, () => authService.getUser()));
      }, 300);
    } finally { setIsLoading(false); }
  }, [mfaCode, mfaMethod, setLocation, verifyMfa]);

  const handleForgotPassword = useCallback(async () => {
    const normalizedEmail = normalizeEmail(email);
    if (!validateEmail(normalizedEmail)) {
      setError({ field: 'email', message: 'Enter your account email first.' });
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const result = await authService.requestPasswordReset({ email: normalizedEmail });
      if (!result.success) {
        setError({ field: 'email', message: result.error?.message || 'Unable to send reset link.' });
        return;
      }
      setView('reset-sent');
    } finally { setIsLoading(false); }
  }, [email, validateEmail]);

  const handleResetPassword = useCallback(async () => {
    if (!resetToken) { setError({ field: 'reset', message: 'Missing reset token.' }); return; }
    if (!newPassword) { setError({ field: 'reset', message: 'Enter a new password.' }); return; }
    if (!isPasswordCompliant) {
      setError({ field: 'reset', message: 'Password does not meet requirements.' });
      return;
    }
    if (!doPasswordsMatch) { setError({ field: 'reset', message: 'Passwords do not match.' }); return; }
    setIsLoading(true);
    setError(null);
    try {
      const result = await authService.confirmPasswordReset({ token: resetToken, newPassword });
      if (!result.success) {
        setError({ field: 'reset', message: result.error?.message || 'Unable to reset password.' });
        return;
      }
      setView('success');
      setSuccessMessage('Password updated. You can sign in now.');
      window.setTimeout(() => { setLocation('/concept2cure/login'); }, 500);
    } finally { setIsLoading(false); }
  }, [doPasswordsMatch, isPasswordCompliant, newPassword, resetToken, setLocation]);

  const handleResendCode = useCallback(async () => {
    if (resendCountdown > 0 || mfaMethod !== 'email' || isResendingCode) return;
    setIsResendingCode(true);
    try {
      const result = await authService.resendLoginOtp();
      if (!result.success) {
        setError({ field: 'mfa', message: result.error?.message || 'Unable to resend code.' });
        return;
      }
      setMaskedEmail(result.data?.maskedEmail || maskedEmail);
      setResendCountdown(60);
    } finally { setIsResendingCode(false); }
  }, [isResendingCode, maskedEmail, mfaMethod, resendCountdown]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm">
        {/* Logo + Brand */}
        <div className="mb-8 flex flex-col items-center">
          <img
            src={concept2cureIcon}
            alt="Concept2Cure"
            className="h-14 w-14 rounded-2xl shadow-md"
          />
          <h1 className="mt-4 text-xl font-semibold text-slate-900">Concept2Cure</h1>
          {view === 'sign-in' && (
            <p className="mt-1 text-sm text-slate-500">Sign in to your account</p>
          )}
          {view === 'mfa' && (
            <p className="mt-1 text-sm text-slate-500">
              {maskedEmail ? `Code sent to ${maskedEmail}` : 'Enter your verification code'}
            </p>
          )}
          {(view === 'forgot-password' || view === 'reset-sent' || view === 'reset-password') && (
            <p className="mt-1 text-sm text-slate-500">Reset your password</p>
          )}
          {view === 'success' && (
            <p className="mt-1 text-sm text-slate-500">{successMessage}</p>
          )}
        </div>

        {/* Card */}
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          {error && (
            <Alert variant="destructive" className="mb-4 border-red-200 bg-red-50 text-red-700" role="alert" aria-live="polite">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="text-sm">{error.message}</AlertDescription>
            </Alert>
          )}

          {/* Sign In */}
          {view === 'sign-in' && (
            <form
              className="space-y-4"
              onSubmit={event => { event.preventDefault(); handleLogin(); }}
            >
              <div className="space-y-1.5">
                <Label htmlFor="login-email" className="text-sm font-medium text-slate-700">Email</Label>
                <Input
                  id="login-email"
                  type="email"
                  value={email}
                  onChange={event => setEmail(event.target.value)}
                  placeholder="you@company.com"
                  autoComplete="email"
                  autoFocus
                  className="h-11 rounded-lg border-slate-200 bg-white text-sm focus-visible:ring-2 focus-visible:ring-blue-500/30 focus-visible:border-blue-400"
                />
              </div>

              <PasswordField
                id="login-password"
                label="Password"
                value={password}
                onChange={setPassword}
                onSubmit={handleLogin}
                placeholder="Password"
                autoComplete="current-password"
                disabled={isLoading}
              />

              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
                  <Checkbox checked={rememberMe} onCheckedChange={checked => setRememberMe(checked === true)} />
                  Remember me
                </label>
                <button
                  type="button"
                  className="text-sm text-blue-600 hover:text-blue-700 transition-colors"
                  onClick={() => setView('forgot-password')}
                >
                  Forgot password?
                </button>
              </div>

              <Button
                type="submit"
                className="h-11 w-full rounded-lg bg-blue-600 text-sm font-medium hover:bg-blue-700 transition-colors"
                disabled={isLoading || lockoutSecondsRemaining > 0}
              >
                {isLoading ? <Spinner size="sm" className="mr-2" /> : null}
                Sign in
              </Button>

              {lockoutSecondsRemaining > 0 && (
                <p className="text-center text-xs text-amber-600">
                  Locked. Try again in {lockoutSecondsRemaining}s.
                </p>
              )}

              {isDev && (
                <div className="pt-2 border-t border-slate-100">
                  <Button
                    type="button"
                    variant="outline"
                    className="h-10 w-full rounded-lg text-sm text-slate-600 border-slate-200 hover:bg-slate-50 transition-colors"
                    onClick={handleDemoLogin}
                    disabled={isDemoLoading}
                  >
                    {isDemoLoading ? <Spinner size="sm" className="mr-2" /> : null}
                    Demo Access
                  </Button>
                </div>
              )}
            </form>
          )}

          {/* MFA */}
          {view === 'mfa' && (
            <div className="space-y-4">
              {availableMfaMethods.length > 1 && (
                <div className="flex flex-wrap gap-2">
                  {availableMfaMethods.map(method => (
                    <Button
                      key={method.type}
                      type="button"
                      variant={mfaMethod === method.type ? 'default' : 'outline'}
                      size="sm"
                      className="h-8 rounded-lg px-3 text-xs"
                      onClick={() => {
                        setMfaMethod(method.type);
                        setMfaCode('');
                        setResendCountdown(method.type === 'email' ? 60 : 0);
                      }}
                    >
                      {getMfaMethodLabel(method.type)}
                    </Button>
                  ))}
                </div>
              )}

              {mfaMethod === 'backup_code' ? (
                <div className="space-y-1.5">
                  <Label htmlFor="backup-code" className="text-sm font-medium text-slate-700">Recovery code</Label>
                  <Input
                    id="backup-code"
                    value={mfaCode}
                    onChange={event => setMfaCode(event.target.value)}
                    placeholder="Enter recovery code"
                    autoFocus
                    className="h-11 rounded-lg border-slate-200 font-mono text-sm focus-visible:ring-2 focus-visible:ring-blue-500/30 focus-visible:border-blue-400"
                  />
                </div>
              ) : (
                <MfaCodeInput value={mfaCode} onChange={setMfaCode} disabled={isLoading} />
              )}

              <Button
                className="h-11 w-full rounded-lg bg-blue-600 text-sm font-medium hover:bg-blue-700"
                onClick={handleVerifyMfa}
                disabled={isLoading}
              >
                {isLoading ? <Spinner size="sm" className="mr-2" /> : null}
                Verify
              </Button>

              <div className="flex items-center justify-between text-sm">
                <button
                  type="button"
                  className="flex items-center gap-1 text-slate-500 hover:text-slate-700 transition-colors"
                  onClick={() => { setView('sign-in'); setPassword(''); setMfaCode(''); }}
                >
                  <ArrowLeft className="h-3.5 w-3.5" /> Back
                </button>
                {mfaMethod === 'email' ? (
                  resendCountdown > 0 ? (
                    <span className="text-slate-400">Resend in {resendCountdown}s</span>
                  ) : (
                    <button
                      type="button"
                      className="text-blue-600 hover:text-blue-700 transition-colors"
                      onClick={handleResendCode}
                      disabled={isResendingCode}
                    >
                      {isResendingCode ? 'Sending...' : 'Resend code'}
                    </button>
                  )
                ) : supportsRecoveryCodes && mfaMethod !== 'backup_code' ? (
                  <button
                    type="button"
                    className="text-blue-600 hover:text-blue-700 transition-colors"
                    onClick={() => { setMfaMethod('backup_code'); setMfaCode(''); }}
                  >
                    Use recovery code
                  </button>
                ) : null}
              </div>
            </div>
          )}

          {/* Forgot Password */}
          {view === 'forgot-password' && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="forgot-email" className="text-sm font-medium text-slate-700">Email</Label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <Input
                    id="forgot-email"
                    type="email"
                    value={email}
                    onChange={event => setEmail(event.target.value)}
                    placeholder="you@company.com"
                    autoFocus
                    className="h-11 rounded-lg border-slate-200 bg-white pl-10 text-sm focus-visible:ring-2 focus-visible:ring-blue-500/30 focus-visible:border-blue-400"
                  />
                </div>
              </div>
              <Button
                className="h-11 w-full rounded-lg bg-blue-600 text-sm font-medium hover:bg-blue-700"
                onClick={handleForgotPassword}
                disabled={isLoading}
              >
                {isLoading ? <Spinner size="sm" className="mr-2" /> : null}
                Send reset link
              </Button>
              <button
                type="button"
                className="w-full text-center text-sm text-slate-500 hover:text-slate-700 transition-colors"
                onClick={() => setView('sign-in')}
              >
                Back to sign in
              </button>
            </div>
          )}

          {/* Reset Sent */}
          {view === 'reset-sent' && (
            <div className="space-y-4 text-center">
              <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
                <CheckCircle2 className="h-5 w-5" />
              </div>
              <p className="text-sm text-slate-600">
                If an account exists for <span className="font-medium text-slate-900">{email}</span>, a reset link is on its way.
              </p>
              <Button
                variant="outline"
                className="h-11 w-full rounded-lg text-sm"
                onClick={() => setView('sign-in')}
              >
                Return to sign in
              </Button>
            </div>
          )}

          {/* Reset Password */}
          {view === 'reset-password' && (
            <div className="space-y-4">
              <PasswordField
                id="reset-password"
                label="New password"
                value={newPassword}
                onChange={setNewPassword}
                placeholder="Create a strong password"
                autoComplete="new-password"
                autoFocus
                disabled={isLoading}
              />
              <PasswordField
                id="reset-password-confirm"
                label="Confirm password"
                value={confirmPassword}
                onChange={setConfirmPassword}
                placeholder="Repeat your password"
                autoComplete="new-password"
                disabled={isLoading}
              />
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">Password policy</p>
                <ul className="space-y-1">
                  {passwordRules.map(rule => (
                    <li key={rule.id} className="flex items-center gap-2 text-sm text-slate-700">
                      {rule.met ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                      ) : (
                        <XCircle className="h-3.5 w-3.5 text-slate-300" />
                      )}
                      {rule.label}
                    </li>
                  ))}
                  <li className="mt-1.5 flex items-center gap-2 text-sm text-slate-700">
                    {doPasswordsMatch ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                    ) : (
                      <XCircle className="h-3.5 w-3.5 text-slate-300" />
                    )}
                    Passwords match
                  </li>
                </ul>
              </div>
              <Button
                className="h-11 w-full rounded-lg bg-blue-600 text-sm font-medium hover:bg-blue-700"
                onClick={handleResetPassword}
                disabled={isLoading || !isPasswordCompliant || !doPasswordsMatch}
              >
                {isLoading ? <Spinner size="sm" className="mr-2" /> : null}
                Update password
              </Button>
              <button
                type="button"
                className="w-full text-center text-sm text-slate-500 hover:text-slate-700 transition-colors"
                onClick={() => setLocation('/concept2cure/login')}
              >
                Back to sign in
              </button>
            </div>
          )}

          {/* Success */}
          {view === 'success' && (
            <div className="space-y-4 text-center">
              <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
                <CheckCircle2 className="h-5 w-5" />
              </div>
              <p className="text-sm text-slate-600">{successMessage}</p>
              <Button
                className="h-11 w-full rounded-lg bg-blue-600 text-sm font-medium hover:bg-blue-700"
                onClick={() => setLocation('/concept2cure')}
              >
                Continue
              </Button>
            </div>
          )}
        </div>

        <p className="mt-6 text-center text-xs text-slate-400">
          Concept2Cure.RI &mdash; Regulatory Intelligence Platform
        </p>
      </div>
    </div>
  );
};

export default ZenLogin;
