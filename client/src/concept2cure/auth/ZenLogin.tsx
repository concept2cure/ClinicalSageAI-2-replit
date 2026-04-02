/// <reference types="vite/client" />
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'wouter';
import {
  authService,
  useAuth as usePortalAuth,
  type MfaMethod,
} from '@/portal-v2/services/authService';
import { computeRedirect } from './redirectUtils';
import { getMfaMethodLabel, normalizeEmail } from './authInputUtils';
import { computeFailedLoginState, getLockoutRemainingSeconds } from './loginLockout';
import { evaluatePasswordPolicy, isPasswordPolicySatisfied } from './passwordPolicy';

const DEMO_PERSONAS = [
  { label: 'JM Smith', email: 'jm.smith@concept2cure.pro', role: 'Admin', initials: 'JS' },
  { label: 'Sarah Chen', email: 'sarah.chen@concept2cure.pro', role: 'Regulatory Affairs', initials: 'SC' },
  { label: 'Michael Torres', email: 'michael.torres@concept2cure.pro', role: 'Medical Writer', initials: 'MT' },
  { label: 'Emily Watson', email: 'emily.watson@concept2cure.pro', role: 'QA Lead', initials: 'EW' },
  { label: 'David Park', email: 'david.park@concept2cure.pro', role: 'Biostatistics', initials: 'DP' },
] as const;

const INDUSTRY_OPTIONS = [
  { value: 'biotech', label: 'Biotech' },
  { value: 'pharma', label: 'Pharma' },
  { value: 'medtech', label: 'MedTech' },
  { value: 'cro', label: 'CRO' },
  { value: 'academic', label: 'Academic' },
  { value: 'regulatory', label: 'Regulatory' },
  { value: 'medical_writing', label: 'Medical Writing' },
] as const;

type View = 'sign-in' | 'sign-up' | 'mfa' | 'forgot-password' | 'reset-password' | 'reset-sent' | 'success';

const isDev =
  typeof globalThis.window !== 'undefined' &&
  (globalThis.window.location.hostname === 'localhost' ||
    globalThis.window.location.hostname.includes('github.dev') ||
    globalThis.window.location.hostname.includes('replit'));

/* ══════════════════════════════════════════════════════════════════
   EMBEDDED STYLE — completely overrides global CSS for this page.
   Uses data-zen-auth attribute for specificity without !important.
   ══════════════════════════════════════════════════════════════════ */
const STYLE = `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600&display=swap');

[data-zen-auth],
[data-zen-auth] *,
[data-zen-auth] *::before,
[data-zen-auth] *::after {
  box-sizing: border-box !important;
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
}

[data-zen-auth] {
  position: fixed !important;
  inset: 0 !important;
  z-index: 99999 !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  background: #ffffff !important;
  margin: 0 !important;
  padding: 24px !important;
  overflow-y: auto !important;
}

.za-card {
  width: 100%;
  max-width: 400px;
  margin: 0 auto;
}

.za-title {
  font-size: 32px !important;
  font-weight: 300 !important;
  color: #0d0d0d !important;
  letter-spacing: -0.03em !important;
  text-align: center !important;
  margin: 0 0 8px 0 !important;
  line-height: 1.1 !important;
}

.za-subtitle {
  font-size: 15px !important;
  color: #8e8e8e !important;
  text-align: center !important;
  margin: 0 0 40px 0 !important;
  font-weight: 400 !important;
  line-height: 1.4 !important;
}

.za-label {
  display: block !important;
  font-size: 14px !important;
  font-weight: 500 !important;
  color: #3d3d3d !important;
  margin-bottom: 8px !important;
  letter-spacing: 0 !important;
}

.za-input {
  display: block !important;
  width: 100% !important;
  padding: 14px 16px !important;
  font-size: 15px !important;
  line-height: 1.5 !important;
  color: #0d0d0d !important;
  background: #ffffff !important;
  border: 1.5px solid #d4d4d4 !important;
  border-radius: 12px !important;
  outline: none !important;
  transition: border-color 0.2s ease, box-shadow 0.2s ease !important;
  -webkit-appearance: none !important;
}
.za-input::placeholder { color: #b0b0b0 !important; }
.za-input:focus {
  border-color: #a0a0a0 !important;
  box-shadow: 0 0 0 3px rgba(0,0,0,0.04) !important;
}

.za-select {
  display: block !important;
  width: 100% !important;
  padding: 14px 40px 14px 16px !important;
  font-size: 15px !important;
  color: #0d0d0d !important;
  background: #ffffff !important;
  border: 1.5px solid #d4d4d4 !important;
  border-radius: 12px !important;
  outline: none !important;
  -webkit-appearance: none !important;
  appearance: none !important;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23999' stroke-width='2.5'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E") !important;
  background-repeat: no-repeat !important;
  background-position: right 16px center !important;
  transition: border-color 0.2s ease !important;
}
.za-select:focus {
  border-color: #a0a0a0 !important;
  box-shadow: 0 0 0 3px rgba(0,0,0,0.04) !important;
}

.za-field { margin-bottom: 20px !important; }
.za-field-last { margin-bottom: 28px !important; }

.za-btn {
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  width: 100% !important;
  padding: 14px 24px !important;
  font-size: 15px !important;
  font-weight: 500 !important;
  border-radius: 12px !important;
  border: none !important;
  cursor: pointer !important;
  transition: all 0.15s ease !important;
  letter-spacing: 0 !important;
  line-height: 1 !important;
}
.za-btn:disabled {
  opacity: 0.4 !important;
  cursor: not-allowed !important;
}

.za-btn-primary {
  background: #0d0d0d !important;
  color: #ffffff !important;
}
.za-btn-primary:hover:not(:disabled) {
  background: #262626 !important;
}

.za-btn-outline {
  background: #ffffff !important;
  color: #0d0d0d !important;
  border: 1.5px solid #d4d4d4 !important;
}
.za-btn-outline:hover:not(:disabled) {
  background: #f7f7f7 !important;
  border-color: #b0b0b0 !important;
}

.za-link {
  font-size: 14px !important;
  color: #8e8e8e !important;
  background: none !important;
  border: none !important;
  cursor: pointer !important;
  padding: 0 !important;
  transition: color 0.15s ease !important;
  text-decoration: none !important;
}
.za-link:hover { color: #3d3d3d !important; }

.za-divider {
  display: flex !important;
  align-items: center !important;
  gap: 16px !important;
  margin: 28px 0 !important;
  color: #c0c0c0 !important;
  font-size: 13px !important;
}
.za-divider::before,
.za-divider::after {
  content: '' !important;
  flex: 1 !important;
  height: 1px !important;
  background: #e8e8e8 !important;
}

.za-error {
  background: #fef2f2 !important;
  color: #b91c1c !important;
  font-size: 14px !important;
  padding: 14px 16px !important;
  border-radius: 12px !important;
  margin-bottom: 24px !important;
  border: 1px solid #fecaca !important;
  line-height: 1.5 !important;
}

.za-row {
  display: flex !important;
  justify-content: space-between !important;
  align-items: center !important;
  margin-top: 20px !important;
}

.za-pw-toggle {
  font-size: 13px !important;
  color: #8e8e8e !important;
  background: none !important;
  border: none !important;
  cursor: pointer !important;
  padding: 0 !important;
}
.za-pw-toggle:hover { color: #3d3d3d !important; }

.za-grid-2 {
  display: grid !important;
  grid-template-columns: 1fr 1fr !important;
  gap: 12px !important;
}

.za-pw-rule {
  display: flex !important;
  align-items: center !important;
  gap: 8px !important;
  font-size: 13px !important;
  line-height: 1.6 !important;
}
.za-pw-rule-met { color: #16a34a !important; }
.za-pw-rule-unmet { color: #c0c0c0 !important; }

.za-mfa-grid {
  display: flex !important;
  justify-content: center !important;
  gap: 10px !important;
}
.za-mfa-digit {
  width: 48px !important;
  height: 56px !important;
  text-align: center !important;
  font-size: 22px !important;
  font-weight: 500 !important;
  color: #0d0d0d !important;
  background: #ffffff !important;
  border: 1.5px solid #d4d4d4 !important;
  border-radius: 12px !important;
  outline: none !important;
  transition: border-color 0.2s ease, box-shadow 0.2s ease !important;
}
.za-mfa-digit:focus {
  border-color: #a0a0a0 !important;
  box-shadow: 0 0 0 3px rgba(0,0,0,0.04) !important;
}

.za-personas {
  background: #ffffff !important;
  border: 1.5px solid #e8e8e8 !important;
  border-radius: 16px !important;
  box-shadow: 0 8px 40px rgba(0,0,0,0.08), 0 1px 3px rgba(0,0,0,0.04) !important;
  overflow: hidden !important;
  position: absolute !important;
  left: 0 !important;
  right: 0 !important;
  top: calc(100% + 8px) !important;
  z-index: 100 !important;
}
.za-persona-item {
  display: flex !important;
  align-items: center !important;
  gap: 14px !important;
  width: 100% !important;
  padding: 14px 18px !important;
  background: none !important;
  border: none !important;
  cursor: pointer !important;
  text-align: left !important;
  transition: background 0.1s ease !important;
  font-family: inherit !important;
}
.za-persona-item:hover { background: #f7f7f7 !important; }
.za-persona-item + .za-persona-item { border-top: 1px solid #f0f0f0 !important; }

.za-avatar {
  width: 36px !important;
  height: 36px !important;
  border-radius: 50% !important;
  background: #f0f0f0 !important;
  color: #666 !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  font-size: 13px !important;
  font-weight: 600 !important;
  flex-shrink: 0 !important;
}

.za-persona-name {
  font-size: 14px !important;
  font-weight: 500 !important;
  color: #0d0d0d !important;
}
.za-persona-role {
  font-size: 13px !important;
  color: #8e8e8e !important;
}

.za-check-circle {
  width: 52px !important;
  height: 52px !important;
  border-radius: 50% !important;
  background: #f0fdf4 !important;
  color: #16a34a !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  margin: 0 auto 20px !important;
  font-size: 24px !important;
}

.za-mfa-pills {
  display: flex !important;
  flex-wrap: wrap !important;
  justify-content: center !important;
  gap: 8px !important;
  margin-bottom: 24px !important;
}
.za-pill {
  padding: 7px 16px !important;
  border-radius: 999px !important;
  font-size: 13px !important;
  font-weight: 500 !important;
  border: none !important;
  cursor: pointer !important;
  transition: all 0.15s ease !important;
}
.za-pill-active {
  background: #0d0d0d !important;
  color: #ffffff !important;
}
.za-pill-inactive {
  background: #f5f5f5 !important;
  color: #666 !important;
}
.za-pill-inactive:hover { background: #eaeaea !important; }

.za-spinner {
  display: inline-block !important;
  width: 18px !important;
  height: 18px !important;
  border: 2px solid transparent !important;
  border-top-color: currentColor !important;
  border-radius: 50% !important;
  animation: za-spin 0.6s linear infinite !important;
  margin-right: 10px !important;
}
@keyframes za-spin { to { transform: rotate(360deg); } }
`;

/* ── Reusable spinner ── */
const Spin = () => <span className="za-spinner" />;

/* ── MFA digit boxes ── */
const MfaCodeInput: React.FC<{ value: string; onChange: (v: string) => void; disabled?: boolean }> = ({
  value, onChange, disabled,
}) => {
  const refs = useRef<Array<HTMLInputElement | null>>([]);
  return (
    <div className="za-mfa-grid">
      {Array.from({ length: 6 }).map((_, i) => (
        <input
          key={`mfa-${i}`}
          ref={el => { refs.current[i] = el; }}
          className="za-mfa-digit"
          value={value[i] || ''}
          onChange={e => {
            if (!/^\d*$/.test(e.target.value)) return;
            const next = value.split(''); next[i] = e.target.value;
            const joined = next.join('').slice(0, 6); onChange(joined);
            if (e.target.value && i < 5) refs.current[i + 1]?.focus();
          }}
          onKeyDown={e => { if (e.key === 'Backspace' && !value[i] && i > 0) refs.current[i - 1]?.focus(); }}
          onPaste={e => { e.preventDefault(); onChange(e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)); }}
          disabled={disabled}
          inputMode="numeric"
          maxLength={1}
          autoComplete="one-time-code"
          aria-label={`Digit ${i + 1}`}
        />
      ))}
    </div>
  );
};

/* ══════════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ══════════════════════════════════════════════════════════════════ */
export const ZenLogin: React.FC = () => {
  const [, setLocation] = useLocation();
  const { login, verifyMfa } = usePortalAuth();

  const search = typeof globalThis.window !== 'undefined' ? globalThis.window.location.search : '';
  const params = useMemo(() => new URLSearchParams(search), [search]);
  const resetToken = params.get('token')?.trim() || '';

  const [view, setView] = useState<View>(resetToken ? 'reset-password' : 'sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [mfaCode, setMfaCode] = useState('');
  const [mfaMethod, setMfaMethod] = useState<MfaMethod['type']>('email');
  const [availableMfaMethods, setAvailableMfaMethods] = useState<MfaMethod[]>([]);
  const [maskedEmail, setMaskedEmail] = useState('');
  const [resendCountdown, setResendCountdown] = useState(0);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);
  const [demoOpen, setDemoOpen] = useState(false);
  const [isResendingCode, setIsResendingCode] = useState(false);
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [lockedUntil, setLockedUntil] = useState<number | null>(null);
  const [lockSecs, setLockSecs] = useState(0);
  const [error, setError] = useState('');

  const [suFirstName, setSuFirstName] = useState('');
  const [suLastName, setSuLastName] = useState('');
  const [suEmail, setSuEmail] = useState('');
  const [suPassword, setSuPassword] = useState('');
  const [suConfirm, setSuConfirm] = useState('');
  const [suCompany, setSuCompany] = useState('');
  const [suIndustry, setSuIndustry] = useState('biotech');

  const supportsRecoveryCodes = useMemo(() => availableMfaMethods.some(m => m.type === 'backup_code'), [availableMfaMethods]);
  const suPwRules = useMemo(() => evaluatePasswordPolicy(suPassword), [suPassword]);
  const suPwOk = useMemo(() => isPasswordPolicySatisfied(suPassword), [suPassword]);
  const suPwMatch = suPassword.length > 0 && suPassword === suConfirm;
  const resetPwRules = useMemo(() => evaluatePasswordPolicy(newPassword), [newPassword]);
  const resetPwOk = useMemo(() => isPasswordPolicySatisfied(newPassword), [newPassword]);
  const resetPwMatch = newPassword.length > 0 && newPassword === confirmPassword;

  useEffect(() => {
    if (view !== 'mfa' || resendCountdown <= 0) return;
    const t = setTimeout(() => setResendCountdown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [view, resendCountdown]);

  useEffect(() => { setError(''); }, [email, password, mfaCode, newPassword, confirmPassword, suEmail, suPassword, suConfirm]);

  useEffect(() => {
    if (!lockedUntil) { setLockSecs(0); return; }
    const tick = () => {
      const s = Math.max(0, Math.ceil((lockedUntil - Date.now()) / 1000));
      setLockSecs(s);
      if (s === 0) { setLockedUntil(null); setFailedAttempts(0); }
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [lockedUntil]);

  const validEmail = useCallback((v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), []);

  /* ── handlers ── */
  const handleLogin = useCallback(async () => {
    if (lockedUntil && lockedUntil > Date.now()) { setError(`Account locked. Try again in ${Math.max(1, getLockoutRemainingSeconds(lockedUntil))}s.`); return; }
    const norm = normalizeEmail(email);
    if (!validEmail(norm)) { setError('Enter a valid email address.'); return; }
    if (!password) { setError('Enter your password.'); return; }
    setLoading(true); setError('');
    try {
      const r = await login({ email: norm, password, rememberDevice: true });
      if (!r.success) {
        const ns = computeFailedLoginState(failedAttempts);
        setFailedAttempts(ns.failedAttempts);
        if (ns.lockedUntil) { setLockedUntil(ns.lockedUntil); setError('Too many attempts. Account temporarily locked.'); return; }
        setError(r.error?.message || 'Invalid email or password.'); return;
      }
      setFailedAttempts(0); setLockedUntil(null);
      if (r.data?.mfaRequired) {
        const methods = r.data.methods || [{ type: 'email', isEnabled: true, isPrimary: true }];
        setAvailableMfaMethods(methods); setMfaMethod(methods[0]?.type || 'email');
        setMaskedEmail(r.data.maskedEmail || ''); setResendCountdown(methods[0]?.type === 'email' ? 60 : 0);
        setView('mfa'); return;
      }
      setView('success'); setSuccessMessage('Welcome back.');
      setTimeout(() => setLocation(computeRedirect(undefined, undefined, () => authService.getUser())), 300);
    } finally { setLoading(false); }
  }, [email, failedAttempts, login, password, setLocation, lockedUntil, validEmail]);

  const handleSignup = useCallback(async () => {
    const norm = suEmail.trim().toLowerCase();
    if (!validEmail(norm)) { setError('Enter a valid email address.'); return; }
    if (!suCompany.trim() || suCompany.trim().length < 2) { setError('Company name is required.'); return; }
    if (!suPwOk) { setError('Password does not meet all requirements.'); return; }
    if (!suPwMatch) { setError('Passwords do not match.'); return; }
    setLoading(true); setError('');
    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: norm, password: suPassword, companyName: suCompany.trim(), industryMode: suIndustry, firstName: suFirstName.trim() || undefined, lastName: suLastName.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) { setError(data.error?.message || 'Could not create account.'); return; }
      if (data.token) { localStorage.setItem('trialsage_access_token', data.token); if (data.user) localStorage.setItem('trialsage_user', JSON.stringify(data.user)); }
      setView('success'); setSuccessMessage('Account created.');
      setTimeout(() => setLocation('/concept2cure'), 400);
    } catch { setError('Unable to reach the server.'); }
    finally { setLoading(false); }
  }, [suEmail, suPassword, suConfirm, suCompany, suIndustry, suFirstName, suLastName, suPwOk, suPwMatch, validEmail, setLocation]);

  const handleDemoLogin = useCallback(async (personaEmail: string) => {
    setDemoLoading(true); setError(''); setDemoOpen(false);
    try {
      const res = await fetch('/api/auth/dev-login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: personaEmail }) });
      const data = await res.json();
      if (data.accessToken || data.token) {
        const tok = data.accessToken || data.token;
        localStorage.setItem('trialsage_access_token', tok);
        if (data.refreshToken) localStorage.setItem('trialsage_refresh_token', data.refreshToken);
        if (data.user) localStorage.setItem('trialsage_user', JSON.stringify(data.user));
        setView('success'); setSuccessMessage('Welcome.');
        setTimeout(() => setLocation('/concept2cure'), 300);
      } else { setError(data.error?.message || data.message || 'Persona not found.'); }
    } catch { setError('Unable to reach the server.'); } finally { setDemoLoading(false); }
  }, [setLocation]);

  const handleVerifyMfa = useCallback(async () => {
    const code = mfaCode.trim();
    if (!code || (mfaMethod !== 'backup_code' && code.length !== 6)) { setError(mfaMethod === 'backup_code' ? 'Enter your recovery code.' : 'Enter the 6-digit code.'); return; }
    setLoading(true); setError('');
    try {
      const r = await verifyMfa({ method: mfaMethod, code });
      if (!r.success) { setError(r.error?.message || 'Invalid code.'); return; }
      setView('success'); setSuccessMessage('Verified.');
      setTimeout(() => setLocation(computeRedirect(undefined, undefined, () => authService.getUser())), 300);
    } finally { setLoading(false); }
  }, [mfaCode, mfaMethod, setLocation, verifyMfa]);

  const handleForgotPassword = useCallback(async () => {
    const norm = normalizeEmail(email);
    if (!validEmail(norm)) { setError('Enter your email address.'); return; }
    setLoading(true); setError('');
    try { const r = await authService.requestPasswordReset({ email: norm }); if (!r.success) { setError(r.error?.message || 'Unable to send reset link.'); return; } setView('reset-sent'); }
    finally { setLoading(false); }
  }, [email, validEmail]);

  const handleResetPassword = useCallback(async () => {
    if (!resetToken) { setError('Missing reset token.'); return; }
    if (!resetPwOk) { setError('Password does not meet requirements.'); return; }
    if (!resetPwMatch) { setError('Passwords do not match.'); return; }
    setLoading(true); setError('');
    try { const r = await authService.confirmPasswordReset({ token: resetToken, newPassword }); if (!r.success) { setError(r.error?.message || 'Reset failed.'); return; } setView('success'); setSuccessMessage('Password updated.'); setTimeout(() => setLocation('/concept2cure/login'), 500); }
    finally { setLoading(false); }
  }, [resetPwMatch, resetPwOk, newPassword, resetToken, setLocation]);

  const handleResendCode = useCallback(async () => {
    if (resendCountdown > 0 || mfaMethod !== 'email' || isResendingCode) return;
    setIsResendingCode(true);
    try { const r = await authService.resendLoginOtp(); if (!r.success) { setError(r.error?.message || 'Resend failed.'); return; } setMaskedEmail(r.data?.maskedEmail || maskedEmail); setResendCountdown(60); }
    finally { setIsResendingCode(false); }
  }, [isResendingCode, maskedEmail, mfaMethod, resendCountdown]);

  /* ══════════════════════════════════
     RENDER
     ══════════════════════════════════ */
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: STYLE }} />
      <div data-zen-auth="">
        <div className="za-card">

          {/* ── SIGN IN ── */}
          {view === 'sign-in' && (
            <>
              <h1 className="za-title">AnA 1.0 RI</h1>
              <p className="za-subtitle">Regulatory intelligence platform</p>

              {error && <div className="za-error" role="alert">{error}</div>}

              <form onSubmit={e => { e.preventDefault(); handleLogin(); }}>
                <div className="za-field">
                  <label className="za-label" htmlFor="za-email">Email address</label>
                  <input id="za-email" type="email" className="za-input" value={email}
                    onChange={e => setEmail(e.target.value)} placeholder="name@company.com"
                    autoComplete="email" autoFocus />
                </div>
                <div className="za-field-last">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
                    <label className="za-label" htmlFor="za-pw" style={{ marginBottom: 0 }}>Password</label>
                    <button type="button" className="za-pw-toggle" onClick={() => setShowPw(p => !p)}>{showPw ? 'Hide' : 'Show'}</button>
                  </div>
                  <input id="za-pw" type={showPw ? 'text' : 'password'} className="za-input" value={password}
                    onChange={e => setPassword(e.target.value)} placeholder="Enter your password"
                    autoComplete="current-password" />
                </div>

                <button type="submit" className="za-btn za-btn-primary" disabled={loading || lockSecs > 0}>
                  {loading && <Spin />}
                  {lockSecs > 0 ? `Locked (${lockSecs}s)` : 'Continue'}
                </button>

                <div className="za-row">
                  <button type="button" className="za-link" onClick={() => setView('forgot-password')}>Forgot password?</button>
                  <button type="button" className="za-link" onClick={() => setView('sign-up')}>Create account</button>
                </div>
              </form>

              {/* Demo access — prominent, always visible in dev */}
              {isDev && (
                <>
                  <div className="za-divider">or</div>
                  <div style={{ position: 'relative' }}>
                    <button type="button" className="za-btn za-btn-outline" onClick={() => setDemoOpen(o => !o)} disabled={demoLoading}>
                      {demoLoading ? <Spin /> : 'Continue with Demo Account'}
                      {!demoLoading && (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                          style={{ marginLeft: 8, opacity: 0.5, transform: demoOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s ease' }}>
                          <path d="M6 9l6 6 6-6" />
                        </svg>
                      )}
                    </button>
                    {demoOpen && (
                      <div className="za-personas">
                        {DEMO_PERSONAS.map(p => (
                          <button key={p.email} type="button" className="za-persona-item" onClick={() => handleDemoLogin(p.email)}>
                            <div className="za-avatar">{p.initials}</div>
                            <div>
                              <div className="za-persona-name">{p.label}</div>
                              <div className="za-persona-role">{p.role}</div>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}
            </>
          )}

          {/* ── SIGN UP ── */}
          {view === 'sign-up' && (
            <>
              <h1 className="za-title">Create account</h1>
              <p className="za-subtitle">Get started with AnA 1.0 RI</p>

              {error && <div className="za-error" role="alert">{error}</div>}

              <form onSubmit={e => { e.preventDefault(); handleSignup(); }}>
                <div className="za-grid-2" style={{ marginBottom: 20 }}>
                  <div>
                    <label className="za-label" htmlFor="za-fn">First name</label>
                    <input id="za-fn" className="za-input" value={suFirstName} onChange={e => setSuFirstName(e.target.value)} placeholder="First" autoFocus />
                  </div>
                  <div>
                    <label className="za-label" htmlFor="za-ln">Last name</label>
                    <input id="za-ln" className="za-input" value={suLastName} onChange={e => setSuLastName(e.target.value)} placeholder="Last" />
                  </div>
                </div>
                <div className="za-field">
                  <label className="za-label" htmlFor="za-su-email">Email address</label>
                  <input id="za-su-email" type="email" className="za-input" value={suEmail} onChange={e => setSuEmail(e.target.value)} placeholder="name@company.com" autoComplete="email" />
                </div>
                <div className="za-field">
                  <label className="za-label" htmlFor="za-co">Company</label>
                  <input id="za-co" className="za-input" value={suCompany} onChange={e => setSuCompany(e.target.value)} placeholder="Company name" />
                </div>
                <div className="za-field">
                  <label className="za-label" htmlFor="za-ind">Industry</label>
                  <select id="za-ind" className="za-select" value={suIndustry} onChange={e => setSuIndustry(e.target.value)}>
                    {INDUSTRY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div className="za-field">
                  <label className="za-label" htmlFor="za-su-pw">Password</label>
                  <input id="za-su-pw" type="password" className="za-input" value={suPassword} onChange={e => setSuPassword(e.target.value)} placeholder="Minimum 12 characters" autoComplete="new-password" />
                </div>
                <div className="za-field">
                  <label className="za-label" htmlFor="za-su-cpw">Confirm password</label>
                  <input id="za-su-cpw" type="password" className="za-input" value={suConfirm} onChange={e => setSuConfirm(e.target.value)} placeholder="Re-enter password" autoComplete="new-password" />
                </div>

                <div style={{ marginBottom: 24 }}>
                  {suPwRules.map(r => (
                    <div key={r.id} className={`za-pw-rule ${r.met ? 'za-pw-rule-met' : 'za-pw-rule-unmet'}`}>
                      <span>{r.met ? '✓' : '○'}</span><span>{r.label}</span>
                    </div>
                  ))}
                  <div className={`za-pw-rule ${suPwMatch ? 'za-pw-rule-met' : 'za-pw-rule-unmet'}`}>
                    <span>{suPwMatch ? '✓' : '○'}</span><span>Passwords match</span>
                  </div>
                </div>

                <button type="submit" className="za-btn za-btn-primary" disabled={loading || !suPwOk || !suPwMatch}>
                  {loading && <Spin />}Create account
                </button>
                <div style={{ textAlign: 'center', marginTop: 20 }}>
                  <button type="button" className="za-link" onClick={() => setView('sign-in')}>Already have an account? Sign in</button>
                </div>
              </form>
            </>
          )}

          {/* ── MFA ── */}
          {view === 'mfa' && (
            <>
              <h1 className="za-title" style={{ fontSize: 24 }}>Verification</h1>
              <p className="za-subtitle">{maskedEmail ? `Code sent to ${maskedEmail}` : 'Enter your verification code'}</p>

              {error && <div className="za-error" role="alert">{error}</div>}

              {availableMfaMethods.length > 1 && (
                <div className="za-mfa-pills">
                  {availableMfaMethods.map(m => (
                    <button key={m.type} type="button"
                      className={`za-pill ${mfaMethod === m.type ? 'za-pill-active' : 'za-pill-inactive'}`}
                      onClick={() => { setMfaMethod(m.type); setMfaCode(''); setResendCountdown(m.type === 'email' ? 60 : 0); }}>
                      {getMfaMethodLabel(m.type)}
                    </button>
                  ))}
                </div>
              )}

              {mfaMethod === 'backup_code' ? (
                <div className="za-field-last">
                  <input className="za-input" value={mfaCode} onChange={e => setMfaCode(e.target.value)}
                    placeholder="Recovery code" autoFocus style={{ fontFamily: 'monospace', textAlign: 'center', letterSpacing: '0.1em' }} />
                </div>
              ) : (
                <div style={{ marginBottom: 28 }}><MfaCodeInput value={mfaCode} onChange={setMfaCode} disabled={loading} /></div>
              )}

              <button type="button" className="za-btn za-btn-primary" onClick={handleVerifyMfa} disabled={loading}>
                {loading && <Spin />}Verify
              </button>

              <div className="za-row">
                <button type="button" className="za-link" onClick={() => { setView('sign-in'); setPassword(''); setMfaCode(''); }}>&#8592; Back</button>
                {mfaMethod === 'email' && (
                  resendCountdown > 0
                    ? <span style={{ fontSize: 13, color: '#b0b0b0' }}>Resend in {resendCountdown}s</span>
                    : <button type="button" className="za-link" onClick={handleResendCode} disabled={isResendingCode}>{isResendingCode ? 'Sending...' : 'Resend code'}</button>
                )}
                {mfaMethod !== 'email' && mfaMethod !== 'backup_code' && supportsRecoveryCodes && (
                  <button type="button" className="za-link" onClick={() => { setMfaMethod('backup_code'); setMfaCode(''); }}>Use recovery code</button>
                )}
              </div>
            </>
          )}

          {/* ── Forgot Password ── */}
          {view === 'forgot-password' && (
            <>
              <h1 className="za-title" style={{ fontSize: 24 }}>Reset password</h1>
              <p className="za-subtitle">We'll send a reset link to your email</p>

              {error && <div className="za-error" role="alert">{error}</div>}

              <div className="za-field-last">
                <label className="za-label" htmlFor="za-fp-email">Email address</label>
                <input id="za-fp-email" type="email" className="za-input" value={email}
                  onChange={e => setEmail(e.target.value)} placeholder="name@company.com" autoFocus />
              </div>
              <button type="button" className="za-btn za-btn-primary" onClick={handleForgotPassword} disabled={loading}>
                {loading && <Spin />}Send reset link
              </button>
              <div style={{ textAlign: 'center', marginTop: 20 }}>
                <button type="button" className="za-link" onClick={() => setView('sign-in')}>&#8592; Back to sign in</button>
              </div>
            </>
          )}

          {/* ── Reset Sent ── */}
          {view === 'reset-sent' && (
            <div style={{ textAlign: 'center' }}>
              <div className="za-check-circle">&#10003;</div>
              <h1 className="za-title" style={{ fontSize: 24, marginBottom: 12 }}>Check your email</h1>
              <p className="za-subtitle">We sent a reset link. It may take a minute to arrive.</p>
              <button type="button" className="za-link" onClick={() => setView('sign-in')}>Back to sign in</button>
            </div>
          )}

          {/* ── Reset Password ── */}
          {view === 'reset-password' && (
            <>
              <h1 className="za-title" style={{ fontSize: 24 }}>New password</h1>
              <p className="za-subtitle">Choose a strong password for your account</p>

              {error && <div className="za-error" role="alert">{error}</div>}

              <div className="za-field">
                <label className="za-label" htmlFor="za-np">New password</label>
                <input id="za-np" type="password" className="za-input" value={newPassword}
                  onChange={e => setNewPassword(e.target.value)} placeholder="New password" autoComplete="new-password" autoFocus />
              </div>
              <div className="za-field">
                <label className="za-label" htmlFor="za-cnp">Confirm password</label>
                <input id="za-cnp" type="password" className="za-input" value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)} placeholder="Re-enter password" autoComplete="new-password" />
              </div>

              <div style={{ marginBottom: 24 }}>
                {resetPwRules.map(r => (
                  <div key={r.id} className={`za-pw-rule ${r.met ? 'za-pw-rule-met' : 'za-pw-rule-unmet'}`}>
                    <span>{r.met ? '✓' : '○'}</span><span>{r.label}</span>
                  </div>
                ))}
                <div className={`za-pw-rule ${resetPwMatch ? 'za-pw-rule-met' : 'za-pw-rule-unmet'}`}>
                  <span>{resetPwMatch ? '✓' : '○'}</span><span>Passwords match</span>
                </div>
              </div>

              <button type="button" className="za-btn za-btn-primary" onClick={handleResetPassword} disabled={loading || !resetPwOk || !resetPwMatch}>
                {loading && <Spin />}Update password
              </button>
              <div style={{ textAlign: 'center', marginTop: 20 }}>
                <button type="button" className="za-link" onClick={() => setLocation('/concept2cure/login')}>&#8592; Back</button>
              </div>
            </>
          )}

          {/* ── Success ── */}
          {view === 'success' && (
            <div style={{ textAlign: 'center' }}>
              <div className="za-check-circle">&#10003;</div>
              <p style={{ fontSize: 16, color: '#3d3d3d', fontWeight: 400 }}>{successMessage}</p>
            </div>
          )}

        </div>
      </div>
    </>
  );
};

export default ZenLogin;
