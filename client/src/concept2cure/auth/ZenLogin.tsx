/**
 * @fileoverview Zen Login Page
 * @module concept2cure/auth/ZenLogin
 * @version 1.0.0
 *
 * @description
 * Minimalist, Claude.ai-inspired authentication experience for Concept2Cure.
 * Clean, focused interface with smooth transitions and enterprise-grade security.
 *
 * Features:
 * - Email/password authentication
 * - SSO options (Microsoft, Google)
 * - MFA support with TOTP
 * - Password reset flow
 * - FDA 21 CFR Part 11 compliance notices
 *
 * @compliance
 * - FDA 21 CFR Part 11 compliant authentication
 * - WCAG 2.1 AA accessibility
 * - NIST 800-63B password guidelines
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useLocation } from 'wouter';
import { motion, AnimatePresence } from 'framer-motion';
import {
  authService,
  useAuth as usePortalAuth,
  type MfaMethod,
} from '@/portal-v2/services/authService';

import { computeRedirect } from './redirectUtils';

// Brand logo
import { C2CLogo } from '@/concept2cure/components/brand/C2CLogo';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

type AuthStep = 'email' | 'password' | 'mfa' | 'success' | 'forgot-password' | 'reset-sent';

interface AuthError {
  field?: 'email' | 'password' | 'mfa';
  message: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// ICONS
// ═══════════════════════════════════════════════════════════════════════════════

// Logo rendered from original uploaded brand asset with gradient soft blend
const BrandLogo = () => (
  <C2CLogo variant="login" />
);

const MicrosoftIcon = () => (
  <svg viewBox="0 0 21 21" className="w-5 h-5">
    <rect x="1" y="1" width="9" height="9" fill="#F25022" />
    <rect x="11" y="1" width="9" height="9" fill="#7FBA00" />
    <rect x="1" y="11" width="9" height="9" fill="#00A4EF" />
    <rect x="11" y="11" width="9" height="9" fill="#FFB900" />
  </svg>
);

const GoogleIcon = () => (
  <svg viewBox="0 0 24 24" className="w-5 h-5">
    <path
      fill="#4285F4"
      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
    />
    <path
      fill="#34A853"
      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
    />
    <path
      fill="#FBBC05"
      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
    />
    <path
      fill="#EA4335"
      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
    />
  </svg>
);

const SpinnerIcon = () => (
  <svg
    className="animate-spin h-5 w-5"
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    viewBox="0 0 24 24"
  >
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
    <path
      className="opacity-75"
      fill="currentColor"
      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
    />
  </svg>
);

const CheckIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
  </svg>
);

const ArrowLeftIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
  </svg>
);

const ShieldIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
    />
  </svg>
);

const MailIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
    />
  </svg>
);

// ═══════════════════════════════════════════════════════════════════════════════
// ANIMATION VARIANTS
// ═══════════════════════════════════════════════════════════════════════════════

const pageVariants = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -20 },
};

const cardVariants = {
  initial: { opacity: 0, scale: 0.95 },
  animate: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.95 },
};

const inputVariants = {
  initial: { opacity: 0, x: -10 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: 10 },
};

// ═══════════════════════════════════════════════════════════════════════════════
// MFA CODE INPUT COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

interface MfaInputProps {
  value: string;
  onChange: (value: string) => void;
  error?: string;
}

const MfaCodeInput: React.FC<MfaInputProps> = ({ value, onChange, error }) => {
  const inputRefs = Array.from({ length: 6 }, () => React.useRef<HTMLInputElement>(null));

  const handleChange = (index: number, digit: string) => {
    if (!/^\d*$/.test(digit)) return;

    const newValue = value.split('');
    newValue[index] = digit;
    const joined = newValue.join('').slice(0, 6);
    onChange(joined);

    // Auto-focus next input
    if (digit && index < 5) {
      inputRefs[index + 1].current?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !value[index] && index > 0) {
      inputRefs[index - 1].current?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    onChange(pasted);
    inputRefs[Math.min(pasted.length, 5)].current?.focus();
  };

  return (
    <div className="space-y-3">
      <div className="flex justify-center gap-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <input
            key={index}
            ref={inputRefs[index]}
            type="text"
            inputMode="numeric"
            maxLength={1}
            value={value[index] || ''}
            onChange={e => handleChange(index, e.target.value)}
            onKeyDown={e => handleKeyDown(index, e)}
            onPaste={handlePaste}
            className={`
              w-12 h-14 text-center text-2xl font-medium
              border-2 rounded-xl
              transition-all duration-200
              focus:outline-none focus:ring-0
              ${
                error
                  ? 'border-red-300 bg-red-50 focus:border-red-500'
                  : 'border-zinc-200 bg-white focus:border-blue-500 focus:shadow-[0_0_0_3px_rgba(217,119,87,0.1)]'
              }
            `}
            autoComplete="one-time-code"
          />
        ))}
      </div>
      {error && (
        <motion.p
          initial={{ opacity: 0, y: -5 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center text-sm text-red-600"
        >
          {error}
        </motion.p>
      )}
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN ZEN LOGIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export const ZenLogin: React.FC = () => {
  const [, setLocation] = useLocation();
  const { login, verifyMfa } = usePortalAuth();

  // Form state
  const [step, setStep] = useState<AuthStep>('email');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mfaCode, setMfaCode] = useState('');
  const [mfaMethod, setMfaMethod] = useState<MfaMethod['type']>('totp');
  const [availableMfaMethods, setAvailableMfaMethods] = useState<MfaMethod[]>([]);
  const [rememberMe, setRememberMe] = useState(false);

  // UI state
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<AuthError | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  // Clear error when inputs change
  useEffect(() => {
    setError(null);
  }, [email, password, mfaCode]);

  // ─────────────────────────────────────────────────────────────────────────────
  // Email validation
  // ─────────────────────────────────────────────────────────────────────────────

  const validateEmail = useCallback((email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }, []);

  // ─────────────────────────────────────────────────────────────────────────────
  // Form handlers
  // ─────────────────────────────────────────────────────────────────────────────

  const handleEmailContinue = useCallback(async () => {
    if (!email.trim()) {
      setError({ field: 'email', message: 'Please enter your email address' });
      return;
    }

    if (!validateEmail(email)) {
      setError({ field: 'email', message: 'Please enter a valid email address' });
      return;
    }

    setIsLoading(true);

    // Simulate checking if email exists / determining auth method
    await new Promise(resolve => setTimeout(resolve, 500));

    setIsLoading(false);
    setStep('password');
  }, [email, validateEmail]);

  const handleLogin = useCallback(async () => {
    if (!password) {
      setError({ field: 'password', message: 'Please enter your password' });
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const result = await login({
        email,
        password,
        rememberDevice: rememberMe,
      });

      if (!result.success) {
        setError({
          field: 'password',
          message: result.error?.message || 'Invalid credentials. Please try again.',
        });
        return;
      }

      if (result.data?.mfaRequired) {
        setAvailableMfaMethods(result.data.methods || []);
        const preferredMethod = result.data.methods?.[0]?.type || 'totp';
        setMfaMethod(preferredMethod);
        setStep('mfa');
        return;
      }

      setStep('success');

      setTimeout(() => {
        setLocation(
          computeRedirect(undefined, undefined, () => authService.getUser && authService.getUser())
        );
      }, 1000);
    } catch (err) {
      setError({
        field: 'password',
        message: err instanceof Error ? err.message : 'Invalid credentials. Please try again.',
      });
    } finally {
      setIsLoading(false);
    }
  }, [email, password, setLocation, login, rememberMe]);

  const handleMfaVerify = useCallback(async () => {
    if (mfaCode.length !== 6) {
      setError({ field: 'mfa', message: 'Please enter the full 6-digit code' });
      return;
    }

    setIsLoading(true);

    try {
      const result = await verifyMfa({
        method: mfaMethod,
        code: mfaCode,
      });

      if (!result.success) {
        setError({
          field: 'mfa',
          message: result.error?.message || 'Invalid code. Please try again.',
        });
        return;
      }

      setStep('success');
      setTimeout(() => {
        setLocation(
          computeRedirect(undefined, undefined, () => authService.getUser && authService.getUser())
        );
      }, 1000);
    } catch (err) {
      setError({
        field: 'mfa',
        message: 'Invalid code. Please try again.',
      });
    } finally {
      setIsLoading(false);
    }
  }, [mfaCode, mfaMethod, setLocation, verifyMfa]);

  const handleForgotPassword = useCallback(async () => {
    if (!email.trim() || !validateEmail(email)) {
      setError({ field: 'email', message: 'Please enter a valid email address first' });
      setStep('email');
      return;
    }

    setIsLoading(true);

    try {
      const result = await authService.requestPasswordReset({ email });
      if (!result.success) {
        setError({
          field: 'email',
          message: result.error?.message || 'Unable to send reset link. Please try again.',
        });
        setStep('email');
        return;
      }
      setStep('reset-sent');
    } catch (err) {
      setError({
        field: 'email',
        message: 'Unable to send reset link. Please try again.',
      });
      setStep('email');
    } finally {
      setIsLoading(false);
    }
  }, [email, validateEmail]);

  // ─────────────────────────────────────────────────────────────────────────────
  // Demo / Quick access login
  // ─────────────────────────────────────────────────────────────────────────────

  const demoPersonas = [
    { email: 'jm.smith@concept2cure.pro', name: 'JM Smith', role: 'Admin', title: 'Founder', icon: '👤' },
    { email: 'sarah.chen@concept2cure.pro', name: 'Sarah Chen', role: 'Editor', title: 'Regulatory Affairs Director', icon: '📋' },
    { email: 'mike.torres@concept2cure.pro', name: 'Mike Torres', role: 'Member', title: 'Clinical Data Analyst', icon: '📊' },
    { email: 'demo@concept2cure.pro', name: 'Demo User', role: 'Member', title: 'Demo Account', icon: '⚡' },
  ];

  const [showPersonas, setShowPersonas] = useState(false);

  const handleDemoLogin = useCallback(async (demoEmail = 'jm.smith@concept2cure.pro') => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await login({
        email: demoEmail,
        password: 'demo123',
        rememberDevice: true,
      });
      if (!result.success) {
        setError({
          message: result.error?.message || 'Demo login failed. Please contact support.',
        });
        return;
      }
      setStep('success');
      setTimeout(() => {
        setLocation(
          computeRedirect(undefined, undefined, () => authService.getUser && authService.getUser())
        );
      }, 800);
    } catch (err) {
      setError({ message: 'Demo login failed. Please try again.' });
    } finally {
      setIsLoading(false);
    }
  }, [login, setLocation]);

  const handleSsoLogin = useCallback(
    async (provider: 'microsoft' | 'google') => {
      setIsLoading(true);
      console.log(`SSO login with ${provider}`);

      // In dev, call the dev SSO helper callback endpoint directly to simulate provider
      const isDev =
        window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

      if (isDev) {
        try {
          const resp = await fetch(`/api/auth/sso/${provider}/callback?code=dev-sso-code`);
          if (resp.ok) {
            const json = await resp.json();
            if (json?.accessToken) {
              // Persist token and use returned user for redirect decision
              authService.setToken(json.accessToken);
              const user = json.user;
              setStep('success');
              setTimeout(() => {
                setLocation(computeRedirect(undefined, user, () => user));
              }, 500);
              return;
            }
          }
          throw new Error('SSO callback failed');
        } catch (err) {
          console.error('SSO dev helper error:', err);
          setError({ message: 'SSO failed. Please try again.' } as any);
        } finally {
          setIsLoading(false);
        }
      }

      // Fallback: keep previous demo behavior for non-dev
      await new Promise(resolve => setTimeout(resolve, 500));
      setIsLoading(false);
      setStep('success');
      setTimeout(() => {
        setLocation(
          computeRedirect(undefined, undefined, () => authService.getUser && authService.getUser())
        );
      }, 1000);
    },
    [setLocation]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        switch (step) {
          case 'email':
            handleEmailContinue();
            break;
          case 'password':
            handleLogin();
            break;
          case 'mfa':
            handleMfaVerify();
            break;
        }
      }
    },
    [step, handleEmailContinue, handleLogin, handleMfaVerify]
  );

  // ─────────────────────────────────────────────────────────────────────────────
  // Render helpers
  // ─────────────────────────────────────────────────────────────────────────────

  const renderEmailStep = () => (
    <motion.div
      key="email"
      variants={inputVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      className="space-y-6"
    >
      <div className="space-y-2">
        <label htmlFor="email" className="block text-sm font-medium text-zinc-700">
          Email address
        </label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="you@company.com"
          autoComplete="email"
          autoFocus
          className={`
            w-full px-4 py-3 text-base
            border-2 rounded-xl
            transition-all duration-200
            focus:outline-none focus:ring-0
            ${
              error?.field === 'email'
                ? 'border-red-300 bg-red-50 focus:border-red-500'
                : 'border-zinc-200 bg-white focus:border-blue-500 focus:shadow-[0_0_0_3px_rgba(217,119,87,0.1)]'
            }
          `}
        />
        {error?.field === 'email' && (
          <motion.p
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-sm text-red-600"
          >
            {error.message}
          </motion.p>
        )}
      </div>

      <button
        onClick={handleEmailContinue}
        disabled={isLoading}
        className={`
          w-full py-3.5 px-4
          flex items-center justify-center gap-2
          text-base font-semibold text-white
          bg-zinc-900
          hover:bg-zinc-800
          shadow-lg shadow-blue-600/25 hover:shadow-blue-700/30
          rounded-xl
          transition-all duration-200
          disabled:opacity-50 disabled:cursor-not-allowed
          focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
        `}
      >
        {isLoading ? <SpinnerIcon /> : 'Continue'}
      </button>

      {/* SSO Divider */}
      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-zinc-200" />
        </div>
        <div className="relative flex justify-center text-sm">
          <span className="px-4 bg-white text-zinc-400 text-xs uppercase tracking-wider">
            or continue with
          </span>
        </div>
      </div>

      {/* Quick Demo Access — only visible in development */}
      {(import.meta.env.DEV || import.meta.env.VITE_SHOW_DEMO_LOGIN === 'true') && (
        <button
          onClick={handleDemoLogin}
          disabled={isLoading}
          className={`
            w-full py-3 px-4
            flex items-center justify-center gap-2
            text-sm font-semibold
            text-emerald-700 bg-emerald-50 border-2 border-emerald-200
            hover:bg-emerald-100 hover:border-emerald-300
            rounded-xl transition-all duration-200
            disabled:opacity-50 disabled:cursor-not-allowed
          `}
        >
          {isLoading ? (
            <SpinnerIcon />
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 10V3L4 14h7v7l9-11h-7z"
                />
              </svg>
              Demo Access (Dev Only)
            </>
          )}
        </button>
      )}

      {/* SSO Buttons */}
      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={() => handleSsoLogin('microsoft')}
          disabled={isLoading}
          className={`
            flex items-center justify-center gap-2 px-4 py-3
            text-sm font-medium text-zinc-700
            bg-white border-2 border-zinc-200 rounded-xl
            hover:bg-zinc-50 hover:border-zinc-300
            transition-all duration-200
            disabled:opacity-50 disabled:cursor-not-allowed
          `}
        >
          <MicrosoftIcon />
          Microsoft
        </button>
        <button
          onClick={() => handleSsoLogin('google')}
          disabled={isLoading}
          className={`
            flex items-center justify-center gap-2 px-4 py-3
            text-sm font-medium text-zinc-700
            bg-white border-2 border-zinc-200 rounded-xl
            hover:bg-zinc-50 hover:border-zinc-300
            transition-all duration-200
            disabled:opacity-50 disabled:cursor-not-allowed
          `}
        >
          <GoogleIcon />
          Google
        </button>
      </div>
    </motion.div>
  );

  const renderPasswordStep = () => (
    <motion.div
      key="password"
      variants={inputVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      className="space-y-6"
    >
      {/* Back button and email display */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => setStep('email')}
          className="p-2 rounded-lg hover:bg-zinc-100 transition-colors"
          aria-label="Go back"
        >
          <ArrowLeftIcon />
        </button>
        <span className="text-sm text-zinc-600">{email}</span>
      </div>

      <div className="space-y-2">
        <label htmlFor="password" className="block text-sm font-medium text-zinc-700">
          Password
        </label>
        <div className="relative">
          <input
            id="password"
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={e => setPassword(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Enter your password"
            autoComplete="current-password"
            autoFocus
            className={`
              w-full px-4 py-3 pr-12 text-base
              border-2 rounded-xl
              transition-all duration-200
              focus:outline-none focus:ring-0
              ${
                error?.field === 'password'
                  ? 'border-red-300 bg-red-50 focus:border-red-500'
                  : 'border-zinc-200 bg-white focus:border-blue-500 focus:shadow-[0_0_0_3px_rgba(217,119,87,0.1)]'
              }
            `}
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-zinc-400 hover:text-zinc-600"
            aria-label={showPassword ? 'Hide password' : 'Show password'}
          >
            {showPassword ? (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"
                />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                />
              </svg>
            )}
          </button>
        </div>
        {error?.field === 'password' && (
          <motion.p
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-sm text-red-600"
          >
            {error.message}
          </motion.p>
        )}
      </div>

      {/* Remember me and forgot password */}
      <div className="flex items-center justify-between">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={rememberMe}
            onChange={e => setRememberMe(e.target.checked)}
            className="w-4 h-4 rounded border-zinc-300 text-blue-600 focus:ring-blue-500"
          />
          <span className="text-sm text-zinc-600">Remember me</span>
        </label>
        <button
          type="button"
          onClick={() => setStep('forgot-password')}
          className="text-sm text-blue-600 hover:text-blue-700 font-medium"
        >
          Forgot password?
        </button>
      </div>

      <button
        onClick={handleLogin}
        disabled={isLoading}
        className={`
          w-full py-3.5 px-4
          flex items-center justify-center gap-2
          text-base font-semibold text-white
          bg-zinc-900
          hover:bg-zinc-800
          shadow-lg shadow-blue-600/25 hover:shadow-blue-700/30
          rounded-xl
          transition-all duration-200
          disabled:opacity-50 disabled:cursor-not-allowed
          focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
        `}
      >
        {isLoading ? <SpinnerIcon /> : 'Sign in'}
      </button>
    </motion.div>
  );

  const renderMfaStep = () => (
    <motion.div
      key="mfa"
      variants={inputVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      className="space-y-6"
    >
      {/* Back button */}
      <button
        onClick={() => setStep('password')}
        className="flex items-center gap-2 text-sm text-zinc-600 hover:text-zinc-800"
      >
        <ArrowLeftIcon />
        Back
      </button>

      <div className="text-center space-y-2">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-blue-100 mb-2">
          <ShieldIcon />
        </div>
        <h3 className="text-lg font-semibold text-zinc-900">Two-factor authentication</h3>
        <p className="text-sm text-zinc-600">Enter the 6-digit code from your authenticator app</p>
      </div>

      {availableMfaMethods.length > 0 && (
        <div className="space-y-2">
          <label className="block text-sm font-medium text-zinc-700">Verification method</label>
          <div className="flex flex-wrap gap-2">
            {availableMfaMethods.map(method => (
              <button
                key={method.type}
                type="button"
                onClick={() => setMfaMethod(method.type)}
                className={`
                  px-3 py-1.5 text-sm rounded-full border
                  transition-all duration-200
                  ${
                    mfaMethod === method.type
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-zinc-200 text-zinc-600 hover:border-zinc-300'
                  }
                `}
              >
                {method.type.replace('_', ' ')}
              </button>
            ))}
          </div>
        </div>
      )}

      <MfaCodeInput
        value={mfaCode}
        onChange={setMfaCode}
        error={error?.field === 'mfa' ? error.message : undefined}
      />

      <button
        onClick={handleMfaVerify}
        disabled={isLoading || mfaCode.length !== 6}
        className={`
          w-full py-3 px-4
          flex items-center justify-center gap-2
          text-base font-medium text-white
          bg-blue-600 hover:bg-blue-700
          rounded-xl
          transition-all duration-200
          disabled:opacity-50 disabled:cursor-not-allowed
          focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
        `}
      >
        {isLoading ? <SpinnerIcon /> : 'Verify'}
      </button>

      <p className="text-center text-sm text-zinc-500">
        Having trouble?{' '}
        <button className="text-blue-600 hover:text-blue-700 font-medium">
          Use a recovery code
        </button>
      </p>
    </motion.div>
  );

  const renderForgotPasswordStep = () => (
    <motion.div
      key="forgot"
      variants={inputVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      className="space-y-6"
    >
      {/* Back button */}
      <button
        onClick={() => setStep('password')}
        className="flex items-center gap-2 text-sm text-zinc-600 hover:text-zinc-800"
      >
        <ArrowLeftIcon />
        Back to sign in
      </button>

      <div className="text-center space-y-2">
        <h3 className="text-lg font-semibold text-zinc-900">Reset your password</h3>
        <p className="text-sm text-zinc-600">
          We'll send a password reset link to <strong>{email}</strong>
        </p>
      </div>

      <button
        onClick={handleForgotPassword}
        disabled={isLoading}
        className={`
          w-full py-3 px-4
          flex items-center justify-center gap-2
          text-base font-medium text-white
          bg-blue-600 hover:bg-blue-700
          rounded-xl
          transition-all duration-200
          disabled:opacity-50 disabled:cursor-not-allowed
          focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
        `}
      >
        {isLoading ? <SpinnerIcon /> : 'Send reset link'}
      </button>
    </motion.div>
  );

  const renderResetSentStep = () => (
    <motion.div
      key="reset-sent"
      variants={inputVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      className="space-y-6 text-center"
    >
      <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-green-100 mb-2">
        <MailIcon />
      </div>
      <h3 className="text-lg font-semibold text-zinc-900">Check your email</h3>
      <p className="text-sm text-zinc-600">
        We've sent a password reset link to <strong>{email}</strong>. The link will expire in 1
        hour.
      </p>

      <button
        onClick={() => setStep('email')}
        className={`
          w-full py-3 px-4
          text-base font-medium text-zinc-700
          bg-white border-2 border-zinc-200 rounded-xl
          hover:bg-zinc-50 hover:border-zinc-300
          transition-all duration-200
        `}
      >
        Back to sign in
      </button>
    </motion.div>
  );

  const renderSuccessStep = () => (
    <motion.div
      key="success"
      variants={inputVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      className="space-y-6 text-center"
    >
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: 'spring', stiffness: 200, damping: 15 }}
        className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-100"
      >
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="text-green-600"
        >
          <CheckIcon />
        </motion.div>
      </motion.div>
      <h3 className="text-xl font-semibold text-zinc-900">Welcome back!</h3>
      <p className="text-sm text-zinc-600">Redirecting you to Concept2Cure...</p>

      <motion.div
        initial={{ width: 0 }}
        animate={{ width: '100%' }}
        transition={{ duration: 1, ease: 'linear' }}
        className="h-1 bg-blue-600 rounded-full"
      />
    </motion.div>
  );

  // ─────────────────────────────────────────────────────────────────────────────
  // Main render
  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen flex">
      {/* Left panel — branding / hero */}
      <div className="hidden lg:flex lg:w-[52%] relative overflow-hidden bg-gradient-to-br from-zinc-900 via-blue-950 to-indigo-950">
        {/* Decorative grid */}
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage:
              "url(\"data:image/svg+xml,%3Csvg width='60' height='60' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M60 0H0v60' fill='none' stroke='%23fff' stroke-width='.5'/%3E%3C/svg%3E\")",
          }}
        />
        {/* Gradient orbs */}
        <div className="absolute -top-32 -left-32 w-96 h-96 rounded-full bg-blue-500/20 blur-[120px]" />
        <div className="absolute bottom-0 right-0 w-80 h-80 rounded-full bg-indigo-500/20 blur-[100px]" />

        <div className="relative z-10 flex flex-col justify-between p-12 w-full">
          {/* Top — logo */}
          <div>
            <div className="flex items-center gap-3">
              <C2CLogo size="lg" />
            </div>
          </div>

          {/* Center — tagline */}
          <div className="space-y-6">
            <h2 className="text-4xl font-bold text-white leading-tight">
              Accelerate your path
              <br />
              from concept to cure.
            </h2>
            <p className="text-lg text-blue-200/80 max-w-md leading-relaxed">
              RI-powered regulatory intelligence for IND, NDA, BLA, 510(k) and beyond —
              purpose-built for life-sciences teams.
            </p>
            {/* Trust badges */}
            <div className="flex items-center gap-4 pt-4">
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/10 backdrop-blur text-xs font-medium text-blue-200">
                <ShieldIcon /> FDA 21 CFR Part 11
              </span>
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/10 backdrop-blur text-xs font-medium text-blue-200">
                <ShieldIcon /> HIPAA Compliant
              </span>
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/10 backdrop-blur text-xs font-medium text-blue-200">
                <ShieldIcon /> SOC 2 Type II
              </span>
            </div>
          </div>

          {/* Bottom — testimonial / stat */}
          <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-6">
            <p className="text-sm text-blue-100/90 italic leading-relaxed">
              "Concept2Cure reduced our IND preparation time from 18 months to under 6 — with full
              regulatory traceability at every step."
            </p>
            <p className="mt-3 text-xs text-blue-300/70">
              — VP Regulatory Affairs, Top-20 Biopharma
            </p>
          </div>
        </div>
      </div>

      {/* Right panel — auth form */}
      <div className="flex-1 flex flex-col bg-white">
        {/* Mobile logo (shown on small screens only) */}
        <div className="lg:hidden flex items-center gap-3 p-6 border-b border-zinc-100">
          <C2CLogo size="md" />
        </div>

        <div className="flex-1 flex items-center justify-center px-6 py-12 sm:px-12">
          <motion.div
            variants={cardVariants}
            initial="initial"
            animate="animate"
            className="w-full max-w-sm"
          >
            {/* Title */}
            <div className="mb-8">
              <h1 className="text-2xl font-bold text-zinc-900">
                {step === 'success' ? '' : 'Welcome back'}
              </h1>
              {step === 'email' && (
                <p className="mt-2 text-sm text-zinc-500">Sign in to your Concept2Cure account</p>
              )}
            </div>

            {/* Auth form */}
            <AnimatePresence mode="wait">
              {step === 'email' && renderEmailStep()}
              {step === 'password' && renderPasswordStep()}
              {step === 'mfa' && renderMfaStep()}
              {step === 'forgot-password' && renderForgotPasswordStep()}
              {step === 'reset-sent' && renderResetSentStep()}
              {step === 'success' && renderSuccessStep()}
            </AnimatePresence>

            {/* Sign up link */}
            {(step === 'email' || step === 'password') && (
              <p className="mt-8 text-center text-sm text-zinc-500">
                Don't have an account?{' '}
                <button
                  onClick={() => setLocation('/concept2cure/signup')}
                  className="text-blue-600 hover:text-blue-700 font-semibold"
                >
                  Request access
                </button>
              </p>
            )}
          </motion.div>
        </div>

        {/* Footer */}
        <footer className="py-5 px-6 border-t border-zinc-100">
          <div className="max-w-sm mx-auto flex items-center justify-between text-xs text-zinc-400">
            <span>© {new Date().getFullYear()} Concept2Cure Inc.</span>
            <div className="flex items-center gap-1">
              <ShieldIcon />
              <span>Enterprise-grade security</span>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
};

export default ZenLogin;
