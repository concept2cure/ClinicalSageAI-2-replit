/// <reference types="vite/client" />
/**
 * Concept2CureLogin — visual replacement for ZenLogin.
 *
 * Restyles the auth surface to match the Claude Design home aesthetic
 * (warm cream canvas, serif headline, terracotta primary, composer-style
 * inputs). All behavior — login, MFA, forgot password, password reset,
 * dev demo access — is preserved verbatim from ZenLogin so no capability
 * is dropped.
 *
 * Note for the designer: this is implementer-built because no auth UI
 * kit has shipped from the Claude Design canvas. When an auth kit lands
 * in the bundle, replace this with the canvas mirror.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'wouter';
import { AlertCircle, ArrowLeft, CheckCircle2, Mail } from 'lucide-react';

import {
  authService,
  useAuth as usePortalAuth,
  type MfaMethod,
} from '@/services/portal/authService';

import { computeRedirect } from '../../auth/redirectUtils';
import brandIcon from '../../../assets/concept2cure-icon.svg';
import styles from './styles.module.css';

type View = 'sign-in' | 'mfa' | 'forgot-password' | 'reset-password' | 'reset-sent' | 'success';

interface AuthError {
  field?: 'email' | 'password' | 'mfa' | 'reset';
  message: string;
}

const MFA_METHOD_LABELS: Record<MfaMethod['type'], string> = {
  totp: 'Authenticator',
  sms: 'Text message',
  email: 'Email',
  hardware_key: 'Security key',
  biometric: 'Biometric',
  backup_code: 'Recovery code',
};

/* ─── Password field with show/hide toggle ─── */
function PasswordField({
  id, label, value, onChange, placeholder, autoComplete, autoFocus, disabled, onSubmit,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  autoComplete?: string;
  autoFocus?: boolean;
  disabled?: boolean;
  onSubmit?: () => void;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className={styles.field}>
      <div className={styles.fieldLabelRow}>
        <label htmlFor={id} className={styles.label}>{label}</label>
        <button
          type="button"
          className={styles.toggle}
          onClick={() => setShow(s => !s)}
        >
          {show ? 'Hide' : 'Show'}
        </button>
      </div>
      <input
        id={id}
        className={styles.input}
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
      />
    </div>
  );
}

/* ─── 6-digit MFA input — auto-focus + paste handling ─── */
function MfaCodeInput({
  value, onChange, disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const refs = useRef<Array<HTMLInputElement | null>>([]);

  const handleDigit = (i: number, digit: string) => {
    if (!/^\d*$/.test(digit)) return;
    const next = value.split('');
    next[i] = digit;
    const joined = next.join('').slice(0, 6);
    onChange(joined);
    if (digit && i < 5) refs.current[i + 1]?.focus();
  };

  const handleKey = (i: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !value[i] && i > 0) refs.current[i - 1]?.focus();
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    onChange(pasted);
    refs.current[Math.max(0, Math.min(pasted.length - 1, 5))]?.focus();
  };

  return (
    <div className={styles.mfaInputs}>
      {Array.from({ length: 6 }).map((_, i) => (
        <input
          key={i}
          ref={el => { refs.current[i] = el; }}
          className={styles.mfaDigit}
          value={value[i] || ''}
          onChange={e => handleDigit(i, e.target.value)}
          onKeyDown={e => handleKey(i, e)}
          onPaste={handlePaste}
          disabled={disabled}
          inputMode="numeric"
          maxLength={1}
          autoComplete="one-time-code"
        />
      ))}
    </div>
  );
}

/* ─── Main component ─── */
export const Concept2CureLogin: React.FC = () => {
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
    () => availableMfaMethods.some(m => m.type === 'backup_code'),
    [availableMfaMethods]
  );

  useEffect(() => {
    if (view !== 'mfa' || resendCountdown <= 0) return;
    const t = window.setTimeout(() => setResendCountdown(c => c - 1), 1000);
    return () => window.clearTimeout(t);
  }, [view, resendCountdown]);

  useEffect(() => { setError(null); }, [email, password, mfaCode, newPassword, confirmPassword]);

  const validateEmail = useCallback(
    (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
    []
  );

  const isDev = import.meta.env.DEV || import.meta.env.MODE === 'development';

  /* Handlers — preserved verbatim from ZenLogin to keep capability parity */

  const handleDemoAccess = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/dev-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'jm.smith@concept2cure.pro' }),
      });
      const data = await res.json();
      if (data.success && data.accessToken) {
        const expiry = new Date(Date.now() + (data.expiresIn || 86400) * 1000).toISOString();
        localStorage.setItem('trialsage_access_token', data.accessToken);
        localStorage.setItem('trialsage_refresh_token', data.refreshToken || '');
        localStorage.setItem('trialsage_token_expiry', expiry);
        localStorage.setItem('trialsage_user', JSON.stringify(data.user || {}));
        sessionStorage.setItem('trialsage_access_token', data.accessToken);
        sessionStorage.setItem('trialsage_refresh_token', data.refreshToken || '');
        sessionStorage.setItem('trialsage_token_expiry', expiry);
        sessionStorage.setItem('trialsage_user', JSON.stringify(data.user || {}));
        window.location.href = '/concept2cure';
        return;
      }
      setError({ message: data.error?.message || 'Demo login failed.' });
    } catch {
      setError({ message: 'Demo login request failed.' });
    } finally {
      setIsLoading(false);
    }
  }, []);

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
    const trimmed = mfaCode.trim();
    if (!trimmed || (method !== 'backup_code' && trimmed.length !== 6)) {
      setError({
        field: 'mfa',
        message: method === 'backup_code'
          ? 'Enter one of your recovery codes.'
          : 'Enter the full 6-digit verification code.',
      });
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const result = await verifyMfa({ method, code: trimmed });
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
      const result = await authService.confirmPasswordReset({ token: resetToken, newPassword });
      if (!result.success) {
        setError({
          field: 'reset',
          message: result.error?.message || 'Unable to reset your password.',
        });
        return;
      }
      setView('success');
      setSuccessMessage('Password updated. You can sign in now.');
      window.setTimeout(() => setLocation('/concept2cure/login'), 500);
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

  /* ─── Copy ─── */

  const title =
    view === 'mfa' ? 'Verify it’s you'
    : view === 'forgot-password' ? 'Reset your password'
    : view === 'reset-sent' ? 'Check your email'
    : view === 'reset-password' ? 'Set a new password'
    : view === 'success' ? 'Signed in'
    : 'Sign in';

  const subtitle =
    view === 'mfa'
      ? maskedEmail
        ? `Enter the verification code sent to ${maskedEmail}.`
        : 'Enter the verification code for your account.'
    : view === 'forgot-password'
      ? 'Enter your account email and we will send a reset link.'
    : view === 'reset-sent'
      ? 'If the account exists, a reset link is on its way.'
    : view === 'reset-password'
      ? 'Choose a strong password you have not used before.'
    : view === 'success'
      ? successMessage || 'Taking you to your workspace.'
    : 'Regulatory intelligence for biotech, pharma and medical-device teams.';

  return (
    <div className={styles.page}>
      <div className={styles.column}>
        <div className={styles.brand}>
          <img src={brandIcon} alt="" className={styles.brandIcon} />
          <span className={styles.brandText}>Concept2Cure<span>.RI</span></span>
        </div>

        <div className={styles.card}>
          <span className={styles.star} aria-hidden="true">✻</span>
          <h1 className={styles.title}>{title}</h1>
          <p className={styles.subtitle}>{subtitle}</p>

          {error && (
            <div className={styles.alert} role="alert">
              <AlertCircle size={14} strokeWidth={1.75} />
              <span>{error.message}</span>
            </div>
          )}

          {/* ─── Sign in ─── */}
          {view === 'sign-in' && (
            <form
              className={styles.form}
              onSubmit={e => { e.preventDefault(); handleLogin(); }}
            >
              <div className={styles.field}>
                <label htmlFor="login-email" className={styles.label}>Email</label>
                <input
                  id="login-email"
                  className={styles.input}
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  autoComplete="email"
                  autoFocus
                  disabled={isLoading}
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

              <div className={styles.row}>
                <label className={styles.remember}>
                  <input
                    type="checkbox"
                    className={styles.checkbox}
                    checked={rememberMe}
                    onChange={e => setRememberMe(e.target.checked)}
                  />
                  Keep me signed in
                </label>
                <button
                  type="button"
                  className={styles.ghost}
                  onClick={() => setView('forgot-password')}
                >
                  Forgot password?
                </button>
              </div>

              <button
                type="submit"
                className={styles.primary}
                disabled={isLoading}
              >
                {isLoading && <span className={styles.spin} aria-hidden="true" />}
                Sign in
              </button>

              {isDev && (
                <>
                  <div className={styles.demoDivider}>Dev only</div>
                  <button
                    type="button"
                    className={styles.demo}
                    onClick={handleDemoAccess}
                    disabled={isLoading}
                  >
                    Demo access
                  </button>
                </>
              )}
            </form>
          )}

          {/* ─── MFA ─── */}
          {view === 'mfa' && (
            <div className={styles.form}>
              {availableMfaMethods.length > 1 && (
                <div className={styles.methodRow}>
                  {availableMfaMethods.map(m => (
                    <button
                      key={m.type}
                      type="button"
                      className={styles.methodChip}
                      data-on={mfaMethod === m.type || undefined}
                      onClick={() => {
                        setMfaMethod(m.type);
                        setMfaCode('');
                        setResendCountdown(m.type === 'email' ? 60 : 0);
                      }}
                    >
                      {MFA_METHOD_LABELS[m.type] || m.type.replace('_', ' ')}
                    </button>
                  ))}
                </div>
              )}

              {mfaMethod === 'backup_code' ? (
                <div className={styles.field}>
                  <label htmlFor="backup-code" className={styles.label}>Recovery code</label>
                  <input
                    id="backup-code"
                    className={`${styles.input} ${styles.inputCode}`}
                    value={mfaCode}
                    onChange={e => setMfaCode(e.target.value)}
                    placeholder="Enter a recovery code"
                    autoFocus
                  />
                </div>
              ) : (
                <MfaCodeInput value={mfaCode} onChange={setMfaCode} disabled={isLoading} />
              )}

              <button
                type="button"
                className={styles.primary}
                onClick={handleVerifyMfa}
                disabled={isLoading}
              >
                {isLoading && <span className={styles.spin} aria-hidden="true" />}
                Verify
              </button>

              <div className={styles.row}>
                <button
                  type="button"
                  className={styles.ghost}
                  onClick={() => {
                    setView('sign-in');
                    setPassword('');
                    setMfaCode('');
                  }}
                >
                  <ArrowLeft size={12} strokeWidth={1.75} />
                  Back
                </button>

                {mfaMethod === 'email' ? (
                  resendCountdown > 0 ? (
                    <span className={styles.hint}>Resend in {resendCountdown}s</span>
                  ) : (
                    <button type="button" className={styles.ghost} onClick={handleResendCode}>
                      Resend code
                    </button>
                  )
                ) : supportsRecoveryCodes && mfaMethod !== 'backup_code' ? (
                  <button
                    type="button"
                    className={styles.ghost}
                    onClick={() => { setMfaMethod('backup_code'); setMfaCode(''); }}
                  >
                    Use a recovery code
                  </button>
                ) : null}
              </div>
            </div>
          )}

          {/* ─── Forgot password ─── */}
          {view === 'forgot-password' && (
            <div className={styles.form}>
              <div className={styles.field}>
                <label htmlFor="forgot-email" className={styles.label}>Account email</label>
                <div className={styles.inputWithIcon}>
                  <Mail size={14} strokeWidth={1.75} className={styles.inputIcon} />
                  <input
                    id="forgot-email"
                    className={styles.input}
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="you@company.com"
                    autoFocus
                    disabled={isLoading}
                  />
                </div>
              </div>

              <button
                type="button"
                className={styles.primary}
                onClick={handleForgotPassword}
                disabled={isLoading}
              >
                {isLoading && <span className={styles.spin} aria-hidden="true" />}
                Send reset link
              </button>

              <button
                type="button"
                className={styles.secondary}
                onClick={() => setView('sign-in')}
              >
                Back to sign in
              </button>
            </div>
          )}

          {/* ─── Reset link sent ─── */}
          {view === 'reset-sent' && (
            <div className={styles.form}>
              <div className={styles.successIcon}>
                <CheckCircle2 size={20} strokeWidth={1.75} />
              </div>
              <p className={styles.subtitle} style={{ marginBottom: 0 }}>
                If an account exists for <strong>{email}</strong>, a reset link is on its way.
              </p>
              <button
                type="button"
                className={styles.secondary}
                onClick={() => setView('sign-in')}
              >
                Return to sign in
              </button>
            </div>
          )}

          {/* ─── Reset password (token flow) ─── */}
          {view === 'reset-password' && (
            <div className={styles.form}>
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
              <button
                type="button"
                className={styles.primary}
                onClick={handleResetPassword}
                disabled={isLoading}
              >
                {isLoading && <span className={styles.spin} aria-hidden="true" />}
                Update password
              </button>
              <button
                type="button"
                className={styles.secondary}
                onClick={() => setLocation('/concept2cure/login')}
              >
                Back to sign in
              </button>
            </div>
          )}

          {/* ─── Success ─── */}
          {view === 'success' && (
            <div className={styles.form}>
              <div className={styles.successIcon}>
                <CheckCircle2 size={20} strokeWidth={1.75} />
              </div>
              <button
                type="button"
                className={styles.primary}
                onClick={() => setLocation('/concept2cure')}
              >
                Continue
              </button>
            </div>
          )}
        </div>

        {view === 'sign-in' && (
          <div className={styles.footerRow}>
            <span>New to Concept2Cure?</span>
            <button
              type="button"
              className={styles.link}
              onClick={() => setLocation('/concept2cure/signup')}
            >
              Create an account
            </button>
          </div>
        )}

        <div className={styles.trust}>
          <span>FDA</span><span>EMA</span><span>PMDA</span><span>Health Canada</span><span>MHRA</span>
        </div>
      </div>
    </div>
  );
};

export default Concept2CureLogin;
