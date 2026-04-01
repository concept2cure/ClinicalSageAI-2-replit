/// <reference types="vite/client" />
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'wouter';
import { AlertCircle, ArrowLeft, CheckCircle2, LockKeyhole, Mail, ShieldCheck, XCircle } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label htmlFor={id} className="text-[13px] text-stone-700">
          {label}
        </Label>
        <button
          type="button"
          className="text-[11px] text-stone-500 transition-colors hover:text-stone-700"
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
        className="h-10 rounded-xl border-stone-200 bg-white text-[14px] shadow-none focus-visible:ring-stone-400"
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

    if (digit && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Backspace' && !value[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (event: React.ClipboardEvent<HTMLInputElement>) => {
    event.preventDefault();
    const pasted = event.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    onChange(pasted);
    inputRefs.current[Math.max(0, Math.min(pasted.length - 1, 5))]?.focus();
  };

  return (
    <div className="flex justify-center gap-2">
      {Array.from({ length: 6 }).map((_, index) => (
        <Input
          key={index}
          ref={element => {
            inputRefs.current[index] = element;
          }}
          value={value[index] || ''}
          onChange={event => handleDigitChange(index, event.target.value)}
          onKeyDown={event => handleKeyDown(index, event)}
          onPaste={handlePaste}
          disabled={disabled}
          inputMode="numeric"
          maxLength={1}
          autoComplete="one-time-code"
          className="h-10 w-10 rounded-xl border-stone-200 bg-white px-0 text-center text-[15px] shadow-none focus-visible:ring-stone-400"
        />
      ))}
    </div>
  );
};

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

  useEffect(() => {
    setError(null);
  }, [email, password, mfaCode, newPassword, confirmPassword]);

  useEffect(() => {
    if (!signInLockedUntil) {
      setLockoutSecondsRemaining(0);
      return;
    }

    const updateRemaining = () => {
      const seconds = Math.max(0, Math.ceil((signInLockedUntil - Date.now()) / 1000));
      setLockoutSecondsRemaining(seconds);
      if (seconds === 0) {
        setSignInLockedUntil(null);
        setFailedSignInAttempts(0);
      }
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
        message: `Too many sign-in attempts. Please wait ${Math.max(1, getLockoutRemainingSeconds(signInLockedUntil))} seconds and try again.`,
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
      const result = await login({
        email: normalizedEmail,
        password,
        rememberDevice: rememberMe,
      });

      if (!result.success) {
        const nextState = computeFailedLoginState(failedSignInAttempts);
        setFailedSignInAttempts(nextState.failedAttempts);
        if (nextState.lockedUntil) {
          setSignInLockedUntil(nextState.lockedUntil);
          setError({
            field: 'password',
            message:
              'For security, sign-in is temporarily locked for 30 seconds after repeated failed attempts.',
          });
          return;
        }
        setError({
          field: 'password',
          message: result.error?.message || 'Unable to sign in. Check your credentials and try again.',
        });
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
      setSuccessMessage('Signed in successfully.');
      window.setTimeout(() => {
        setLocation(computeRedirect(undefined, undefined, () => authService.getUser()));
      }, 350);
    } finally {
      setIsLoading(false);
    }
  }, [email, failedSignInAttempts, login, password, rememberMe, setLocation, signInLockedUntil, validateEmail]);

  const handleVerifyMfa = useCallback(async () => {
    const method = mfaMethod;
    const trimmedCode = mfaCode.trim();

    if (!trimmedCode || (method !== 'backup_code' && trimmedCode.length !== 6)) {
      setError({
        field: 'mfa',
        message:
          method === 'backup_code'
            ? 'Enter one of your recovery codes.'
            : 'Enter the full 6-digit verification code.',
      });
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const result = await verifyMfa({ method, code: trimmedCode });
      if (!result.success) {
        setError({
          field: 'mfa',
          message: result.error?.message || 'That verification code was not accepted.',
        });
        return;
      }

      setView('success');
      setSuccessMessage('Verification complete.');
      window.setTimeout(() => {
        setLocation(computeRedirect(undefined, undefined, () => authService.getUser()));
      }, 350);
    } finally {
      setIsLoading(false);
    }
  }, [mfaCode, mfaMethod, setLocation, verifyMfa]);

  const handleForgotPassword = useCallback(async () => {
    const normalizedEmail = normalizeEmail(email);
    if (!validateEmail(normalizedEmail)) {
      setError({ field: 'email', message: 'Enter the email address for your account first.' });
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const result = await authService.requestPasswordReset({ email: normalizedEmail });
      if (!result.success) {
        setError({
          field: 'email',
          message: result.error?.message || 'Unable to send a reset link right now.',
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
      setError({ field: 'reset', message: 'This reset link is missing a valid token.' });
      return;
    }

    if (!newPassword) {
      setError({ field: 'reset', message: 'Enter a new password.' });
      return;
    }

    if (!isPasswordCompliant) {
      setError({
        field: 'reset',
        message:
          'Password does not meet minimum security requirements. Review the policy checklist and try again.',
      });
      return;
    }

    if (!doPasswordsMatch) {
      setError({ field: 'reset', message: 'Passwords do not match.' });
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const result = await authService.confirmPasswordReset({
        token: resetToken,
        newPassword,
      });

      if (!result.success) {
        setError({
          field: 'reset',
          message: result.error?.message || 'Unable to reset your password.',
        });
        return;
      }

      setView('success');
      setSuccessMessage('Password updated. You can sign in now.');
      window.setTimeout(() => {
        setLocation('/concept2cure/login');
      }, 500);
    } finally {
      setIsLoading(false);
    }
  }, [doPasswordsMatch, isPasswordCompliant, newPassword, resetToken, setLocation]);

  const handleResendCode = useCallback(async () => {
    if (resendCountdown > 0 || mfaMethod !== 'email' || isResendingCode) return;

    setIsResendingCode(true);

    try {
      const result = await authService.resendLoginOtp();
      if (!result.success) {
        setError({ field: 'mfa', message: result.error?.message || 'Unable to resend the code.' });
        return;
      }

      setMaskedEmail(result.data?.maskedEmail || maskedEmail);
      setResendCountdown(60);
    } finally {
      setIsResendingCode(false);
    }
  }, [isResendingCode, maskedEmail, mfaMethod, resendCountdown]);

  const title =
    view === 'mfa'
      ? 'Verify your sign-in'
      : view === 'forgot-password' || view === 'reset-sent' || view === 'reset-password'
      ? 'Reset your password'
      : view === 'success'
      ? 'Almost there'
      : 'Sign in to Concept2Cure';

  const description =
    view === 'mfa'
      ? maskedEmail
        ? `Enter the verification code sent to ${maskedEmail}.`
        : 'Enter the verification code for your account.'
      : view === 'forgot-password'
      ? 'Enter your account email and we will send a reset link.'
      : view === 'reset-sent'
      ? 'If the account exists, a reset link has been sent.'
      : view === 'reset-password'
      ? 'Choose a new password for your account.'
      : view === 'success'
      ? successMessage
      : 'Secure access to your regulatory workspace.';

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_right,_#f5f8ff,_#f7f5ef_45%,_#f5f4ef_100%)]">
      <div className="mx-auto grid min-h-screen w-full max-w-5xl items-center gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(380px,420px)]">
        <aside className="hidden rounded-3xl border border-white/60 bg-white/70 p-8 shadow-sm backdrop-blur-sm lg:block">
          <div className="space-y-6">
            <div className="inline-flex items-center gap-2 rounded-full border border-sky-100 bg-sky-50 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.08em] text-sky-700">
              <ShieldCheck className="h-3.5 w-3.5" />
              Trusted Clinical Workspace
            </div>
            <div>
              <h1 className="text-3xl font-semibold tracking-tight text-stone-900">
                Concept2Cure Portal
              </h1>
              <p className="mt-3 max-w-md text-[15px] leading-7 text-stone-600">
                Secure sign-in for regulated trial operations, submission workflows, and governed document delivery.
              </p>
            </div>
            <ul className="space-y-3 text-[14px] text-stone-700">
              <li className="flex items-start gap-3">
                <LockKeyhole className="mt-0.5 h-4 w-4 text-stone-500" />
                <span>Multi-factor verification is enforced for protected workspace access.</span>
              </li>
              <li className="flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 h-4 w-4 text-stone-500" />
                <span>Use your organization-issued credentials to continue.</span>
              </li>
              <li className="flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 h-4 w-4 text-stone-500" />
                <span>Need access help? Contact your trial administrator or security lead.</span>
              </li>
            </ul>
          </div>
        </aside>

        <div className="w-full max-w-[420px] justify-self-center lg:justify-self-end">
          <Card className="border-stone-200/80 bg-white/95 shadow-lg shadow-stone-200/50">
            <CardHeader className="space-y-1 px-5 pt-5 pb-0 sm:px-6 sm:pt-6">
              <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-stone-500">
                Identity verification
              </p>
              <CardTitle className="text-[17px] font-semibold text-stone-900">{title}</CardTitle>
              <CardDescription className="text-[13px] leading-6 text-stone-500">
                {description}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5 p-5 sm:p-6">
              {error && (
                <Alert variant="destructive" className="border-red-200 bg-red-50 text-red-700" role="alert" aria-live="polite">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error.message}</AlertDescription>
                </Alert>
              )}

              {view === 'sign-in' && (
                <form
                  className="space-y-5"
                  onSubmit={event => {
                    event.preventDefault();
                    handleLogin();
                  }}
                >
                  <div className="space-y-2">
                    <Label htmlFor="login-email" className="text-[13px] text-stone-700">
                      Email
                    </Label>
                    <Input
                      id="login-email"
                      type="email"
                      value={email}
                      onChange={event => setEmail(event.target.value)}
                      placeholder="you@company.com"
                      autoComplete="email"
                      autoFocus
                      className="h-10 rounded-xl border-stone-200 bg-white text-[14px] shadow-none focus-visible:ring-stone-400"
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

                  <div className="flex items-center justify-between gap-3">
                    <label className="flex items-center gap-2 text-[13px] text-stone-600">
                      <Checkbox checked={rememberMe} onCheckedChange={checked => setRememberMe(checked === true)} />
                      Keep me signed in
                    </label>

                    <Button
                      type="button"
                      variant="ghost"
                      className="h-8 px-0 text-[13px] font-normal text-stone-500 hover:bg-transparent hover:text-stone-800"
                      onClick={() => setView('forgot-password')}
                    >
                      Forgot password?
                    </Button>
                  </div>

                  <Button
                    type="submit"
                    className="h-10 w-full rounded-xl text-[13px] font-medium"
                    disabled={isLoading || lockoutSecondsRemaining > 0}
                  >
                    {isLoading ? <Spinner size="sm" className="mr-2" /> : null}
                    Sign in
                  </Button>
                  {lockoutSecondsRemaining > 0 ? (
                    <p className="text-center text-[12px] text-amber-700">
                      Sign-in temporarily locked. Try again in {lockoutSecondsRemaining}s.
                    </p>
                  ) : null}
                </form>
              )}

              {view === 'mfa' && (
                <div className="space-y-5">
                  {availableMfaMethods.length > 1 && (
                    <div className="flex flex-wrap gap-2">
                      {availableMfaMethods.map(method => (
                        <Button
                          key={method.type}
                          type="button"
                          variant={mfaMethod === method.type ? 'default' : 'outline'}
                          size="sm"
                          className="h-8 rounded-full px-3 text-[12px]"
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
                    <div className="space-y-2">
                      <Label htmlFor="backup-code" className="text-[13px] text-stone-700">
                        Recovery code
                      </Label>
                      <Input
                        id="backup-code"
                        value={mfaCode}
                        onChange={event => setMfaCode(event.target.value)}
                        placeholder="Enter a recovery code"
                        autoFocus
                        className="h-10 rounded-xl border-stone-200 font-mono text-[14px] shadow-none focus-visible:ring-stone-400"
                      />
                    </div>
                  ) : (
                    <MfaCodeInput value={mfaCode} onChange={setMfaCode} disabled={isLoading} />
                  )}

                  <Button className="h-10 w-full rounded-xl text-[13px] font-medium" onClick={handleVerifyMfa} disabled={isLoading}>
                    {isLoading ? <Spinner size="sm" className="mr-2" /> : null}
                    Verify
                  </Button>

                  <div className="flex items-center justify-between text-[13px] text-stone-500">
                    <Button
                      type="button"
                      variant="ghost"
                      className="h-8 px-0 text-[13px] font-normal text-stone-500 hover:bg-transparent hover:text-stone-800"
                      onClick={() => {
                        setView('sign-in');
                        setPassword('');
                        setMfaCode('');
                      }}
                    >
                      <ArrowLeft className="h-3.5 w-3.5" />
                      Back
                    </Button>

                    {mfaMethod === 'email' ? (
                      resendCountdown > 0 ? (
                        <span>Resend in {resendCountdown}s</span>
                      ) : (
                        <Button
                          type="button"
                          variant="ghost"
                          className="h-8 px-0 text-[13px] font-normal text-stone-500 hover:bg-transparent hover:text-stone-800"
                          onClick={handleResendCode}
                          disabled={isResendingCode}
                        >
                          {isResendingCode ? 'Sending...' : 'Resend code'}
                        </Button>
                      )
                    ) : supportsRecoveryCodes && mfaMethod !== 'backup_code' ? (
                      <Button
                        type="button"
                        variant="ghost"
                        className="h-8 px-0 text-[13px] font-normal text-stone-500 hover:bg-transparent hover:text-stone-800"
                        onClick={() => {
                          setMfaMethod('backup_code');
                          setMfaCode('');
                        }}
                      >
                        Use a recovery code
                      </Button>
                    ) : null}
                  </div>
                </div>
              )}

              {view === 'forgot-password' && (
                <div className="space-y-5">
                  <div className="space-y-2">
                    <Label htmlFor="forgot-email" className="text-[13px] text-stone-700">
                      Account email
                    </Label>
                    <div className="relative">
                      <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
                      <Input
                        id="forgot-email"
                        type="email"
                        value={email}
                        onChange={event => setEmail(event.target.value)}
                        placeholder="you@company.com"
                        autoFocus
                        className="h-10 rounded-xl border-stone-200 bg-white pl-10 text-[14px] shadow-none focus-visible:ring-stone-400"
                      />
                    </div>
                  </div>

                  <Button className="h-10 w-full rounded-xl text-[13px] font-medium" onClick={handleForgotPassword} disabled={isLoading}>
                    {isLoading ? <Spinner size="sm" className="mr-2" /> : null}
                    Send reset link
                  </Button>

                  <Button variant="ghost" className="h-9 w-full text-[12px]" onClick={() => setView('sign-in')}>
                    Back to sign in
                  </Button>
                </div>
              )}

              {view === 'reset-sent' && (
                <div className="space-y-5 text-center">
                  <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
                    <CheckCircle2 className="h-6 w-6" />
                  </div>
                  <p className="text-[14px] leading-6 text-stone-600">
                    If an account exists for <span className="font-medium text-stone-900">{email}</span>, a reset
                    link is on its way.
                  </p>
                  <Button variant="outline" className="h-10 w-full rounded-xl text-[13px]" onClick={() => setView('sign-in')}>
                    Return to sign in
                  </Button>
                </div>
              )}

              {view === 'reset-password' && (
                <div className="space-y-5">
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
                    placeholder="Repeat your new password"
                    autoComplete="new-password"
                    disabled={isLoading}
                  />
                  <div className="rounded-xl border border-stone-200 bg-stone-50 px-3 py-3">
                    <p className="mb-2 text-[12px] font-medium uppercase tracking-[0.05em] text-stone-600">
                      Password policy
                    </p>
                    <ul className="space-y-1.5">
                      {passwordRules.map(rule => (
                        <li key={rule.id} className="flex items-center gap-2 text-[13px] text-stone-700">
                          {rule.met ? (
                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                          ) : (
                            <XCircle className="h-3.5 w-3.5 text-stone-400" />
                          )}
                          <span>{rule.label}</span>
                        </li>
                      ))}
                      <li className="mt-2 flex items-center gap-2 text-[13px] text-stone-700">
                        {doPasswordsMatch ? (
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                        ) : (
                          <XCircle className="h-3.5 w-3.5 text-stone-400" />
                        )}
                        <span>Passwords match</span>
                      </li>
                    </ul>
                  </div>
                  <Button
                    className="h-10 w-full rounded-xl text-[13px] font-medium"
                    onClick={handleResetPassword}
                    disabled={isLoading || !isPasswordCompliant || !doPasswordsMatch}
                  >
                    {isLoading ? <Spinner size="sm" className="mr-2" /> : null}
                    Update password
                  </Button>
                  <Button variant="ghost" className="h-9 w-full text-[12px]" onClick={() => setLocation('/concept2cure/login')}>
                    Back to sign in
                  </Button>
                </div>
              )}

              {view === 'success' && (
                <div className="space-y-5 text-center">
                  <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
                    <CheckCircle2 className="h-6 w-6" />
                  </div>
                  <p className="text-[14px] leading-6 text-stone-600">{successMessage}</p>
                  <Button className="h-10 w-full rounded-xl text-[13px] font-medium" onClick={() => setLocation('/concept2cure')}>
                    Continue
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default ZenLogin;
