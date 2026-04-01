/// <reference types="vite/client" />
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'wouter';
import { AlertCircle, ArrowLeft, CheckCircle2, Mail, Shield, Sparkles } from 'lucide-react';

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
        placeholder={placeholder}
        autoComplete={autoComplete}
        autoFocus={autoFocus}
        disabled={disabled}
        className="h-11 rounded-xl border-stone-200 bg-white text-[14px] shadow-none focus-visible:ring-stone-400"
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
          className="h-12 w-11 rounded-xl border-stone-200 bg-white px-0 text-center text-base shadow-none focus-visible:ring-stone-400"
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
  const [error, setError] = useState<AuthError | null>(null);

  const supportsRecoveryCodes = useMemo(
    () => availableMfaMethods.some(method => method.type === 'backup_code'),
    [availableMfaMethods]
  );

  useEffect(() => {
    if (view !== 'mfa' || resendCountdown <= 0) return;
    const timer = window.setTimeout(() => setResendCountdown(current => current - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [view, resendCountdown]);

  useEffect(() => {
    setError(null);
  }, [email, password, mfaCode, newPassword, confirmPassword]);

  const validateEmail = useCallback((value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value), []);

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
      const result = await login({
        email: email.trim(),
        password,
        rememberDevice: rememberMe,
      });

      if (!result.success) {
        setError({
          field: 'password',
          message: result.error?.message || 'Unable to sign in. Check your credentials and try again.',
        });
        return;
      }

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
  }, [email, login, password, rememberMe, setLocation, validateEmail]);

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
    if (!validateEmail(email)) {
      setError({ field: 'email', message: 'Enter the email address for your account first.' });
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const result = await authService.requestPasswordReset({ email: email.trim() });
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

    if (newPassword !== confirmPassword) {
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
  }, [confirmPassword, newPassword, resetToken, setLocation]);

  const handleResendCode = useCallback(async () => {
    if (resendCountdown > 0 || mfaMethod !== 'email') return;

    const result = await authService.resendLoginOtp();
    if (!result.success) {
      setError({ field: 'mfa', message: result.error?.message || 'Unable to resend the code.' });
      return;
    }

    setMaskedEmail(result.data?.maskedEmail || maskedEmail);
    setResendCountdown(60);
  }, [maskedEmail, mfaMethod, resendCountdown]);

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
      : 'A calm, secure sign-in flow for your regulatory workspace.';

  return (
    <div className="min-h-screen bg-[#faf9f5]">
      <div className="mx-auto flex min-h-screen w-full max-w-6xl items-center justify-center px-6 py-12">
        <div className="grid w-full max-w-5xl gap-10 lg:grid-cols-[1.1fr_420px] lg:items-center">
          <div className="hidden lg:block">
            <div className="max-w-xl space-y-6">
              <div className="inline-flex items-center gap-2 rounded-full border border-stone-200 bg-white px-3 py-1 text-[11px] font-medium text-stone-600">
                <Shield className="h-3.5 w-3.5 text-stone-500" />
                Trusted access for regulated work
              </div>
              <div className="space-y-4">
                <h1 className="text-3xl font-semibold tracking-tight text-stone-900">
                  Secure access without the noise.
                </h1>
                <p className="max-w-lg text-[15px] leading-7 text-stone-600">
                  Sign in, verify, and get back to work. No dashboard theater, no fake enterprise chrome,
                  just a clean path into the product.
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-stone-200 bg-white p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-stone-400">
                    Security
                  </p>
                  <p className="mt-2 text-[13px] leading-6 text-stone-700">
                    JWT sessions, MFA verification, and controlled password reset flows.
                  </p>
                </div>
                <div className="rounded-2xl border border-stone-200 bg-white p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-stone-400">
                    Experience
                  </p>
                  <p className="mt-2 text-[13px] leading-6 text-stone-700">
                    One focused card, one decision at a time, and clear next steps.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <Card className="border-stone-200 bg-white shadow-sm">
            <CardHeader className="space-y-3 p-6 pb-0">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-stone-200 bg-stone-50">
                  <Sparkles className="h-4 w-4 text-stone-700" />
                </div>
                <div>
                  <CardTitle className="text-lg font-semibold text-stone-900">{title}</CardTitle>
                  <CardDescription className="mt-1 text-[13px] leading-6 text-stone-500">
                    {description}
                  </CardDescription>
                </div>
              </div>
            </CardHeader>

            <CardContent className="space-y-5 p-6">
              {error && (
                <Alert variant="destructive" className="border-red-200 bg-red-50 text-red-700">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error.message}</AlertDescription>
                </Alert>
              )}

              {view === 'sign-in' && (
                <div className="space-y-5">
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
                      className="h-11 rounded-xl border-stone-200 bg-white text-[14px] shadow-none focus-visible:ring-stone-400"
                    />
                  </div>

                  <PasswordField
                    id="login-password"
                    label="Password"
                    value={password}
                    onChange={setPassword}
                    placeholder="Enter your password"
                    autoComplete="current-password"
                    disabled={isLoading}
                  />

                  <div className="flex items-center justify-between gap-3">
                    <label className="flex items-center gap-2 text-[13px] text-stone-600">
                      <Checkbox checked={rememberMe} onCheckedChange={checked => setRememberMe(checked === true)} />
                      Keep me signed in
                    </label>

                    <button
                      type="button"
                      className="text-[13px] text-stone-500 transition-colors hover:text-stone-800"
                      onClick={() => setView('forgot-password')}
                    >
                      Forgot password?
                    </button>
                  </div>

                  <Button className="h-11 w-full rounded-xl text-[14px]" onClick={handleLogin} disabled={isLoading}>
                    {isLoading ? <Spinner size="sm" className="mr-2" /> : null}
                    Sign in
                  </Button>
                </div>
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
                          className="rounded-full"
                          onClick={() => {
                            setMfaMethod(method.type);
                            setMfaCode('');
                            setResendCountdown(method.type === 'email' ? 60 : 0);
                          }}
                        >
                          {method.type.replace('_', ' ')}
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
                        className="h-11 rounded-xl border-stone-200 font-mono text-[14px] shadow-none focus-visible:ring-stone-400"
                      />
                    </div>
                  ) : (
                    <MfaCodeInput value={mfaCode} onChange={setMfaCode} disabled={isLoading} />
                  )}

                  <Button
                    className="h-11 w-full rounded-xl text-[14px]"
                    onClick={handleVerifyMfa}
                    disabled={isLoading}
                  >
                    {isLoading ? <Spinner size="sm" className="mr-2" /> : null}
                    Verify
                  </Button>

                  <div className="flex items-center justify-between text-[13px] text-stone-500">
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 transition-colors hover:text-stone-800"
                      onClick={() => {
                        setView('sign-in');
                        setPassword('');
                        setMfaCode('');
                      }}
                    >
                      <ArrowLeft className="h-3.5 w-3.5" />
                      Back
                    </button>

                    {mfaMethod === 'email' ? (
                      resendCountdown > 0 ? (
                        <span>Resend in {resendCountdown}s</span>
                      ) : (
                        <button
                          type="button"
                          className="transition-colors hover:text-stone-800"
                          onClick={handleResendCode}
                        >
                          Resend code
                        </button>
                      )
                    ) : supportsRecoveryCodes && mfaMethod !== 'backup_code' ? (
                      <button
                        type="button"
                        className="transition-colors hover:text-stone-800"
                        onClick={() => {
                          setMfaMethod('backup_code');
                          setMfaCode('');
                        }}
                      >
                        Use a recovery code
                      </button>
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
                        className="h-11 rounded-xl border-stone-200 bg-white pl-10 text-[14px] shadow-none focus-visible:ring-stone-400"
                      />
                    </div>
                  </div>

                  <Button
                    className="h-11 w-full rounded-xl text-[14px]"
                    onClick={handleForgotPassword}
                    disabled={isLoading}
                  >
                    {isLoading ? <Spinner size="sm" className="mr-2" /> : null}
                    Send reset link
                  </Button>

                  <Button variant="ghost" className="w-full text-[13px]" onClick={() => setView('sign-in')}>
                    Back to sign in
                  </Button>
                </div>
              )}

              {view === 'reset-sent' && (
                <div className="space-y-5 text-center">
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
                    <CheckCircle2 className="h-6 w-6" />
                  </div>
                  <p className="text-[14px] leading-6 text-stone-600">
                    If an account exists for <span className="font-medium text-stone-900">{email}</span>, a reset
                    link is on its way.
                  </p>
                  <Button variant="outline" className="w-full rounded-xl" onClick={() => setView('sign-in')}>
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
                  <Button
                    className="h-11 w-full rounded-xl text-[14px]"
                    onClick={handleResetPassword}
                    disabled={isLoading}
                  >
                    {isLoading ? <Spinner size="sm" className="mr-2" /> : null}
                    Update password
                  </Button>
                  <Button variant="ghost" className="w-full text-[13px]" onClick={() => setLocation('/concept2cure/login')}>
                    Back to sign in
                  </Button>
                </div>
              )}

              {view === 'success' && (
                <div className="space-y-5 text-center">
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
                    <CheckCircle2 className="h-6 w-6" />
                  </div>
                  <p className="text-[14px] leading-6 text-stone-600">{successMessage}</p>
                  <Button className="w-full rounded-xl" onClick={() => setLocation('/concept2cure')}>
                    Continue
                  </Button>
                </div>
              )}

              <div className="border-t border-stone-100 pt-4 text-center text-[11px] text-stone-400">
                FDA 21 CFR Part 11 aligned access controls
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default ZenLogin;
