/**
 * TrialSage Enterprise Sign-On Page
 *
 * Concept2Cure AI Platform
 *
 * Features:
 * - Split-panel layout with brand showcase and auth forms
 * - Multi-step flow: Email → Domain Check → Password/SSO → MFA → Org Selection
 * - Enterprise SSO with domain-based routing (SAML 2.0, OAuth/OIDC)
 * - Multi-factor authentication (TOTP, Hardware Keys, Passkeys)
 * - Multi-organization support for CRO liaisons and consultants
 * - 21 CFR Part 11 compliant audit trail integration
 * - Trust badges (FDA, SOC 2, HIPAA)
 *
 * @version 1.0
 * @date January 2026
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useLocation } from 'wouter';
import { useAuth } from '../hooks/use-auth';
import {
  Eye,
  EyeOff,
  Mail,
  Lock,
  Building2,
  ChevronRight,
  Shield,
  CheckCircle2,
  Fingerprint,
  X,
  Search,
  Clock,
  AlertCircle,
  Loader2,
  Smartphone,
  Key,
  ExternalLink,
  Users,
  Globe,
} from 'lucide-react';

// ============================================================================
// CONSTANTS & CONFIGURATION
// ============================================================================

const COLORS = {
  navy: '#1a2e4a',
  gold: '#c9a227',
  trustBlue: '#2563eb',
  success: '#059669',
  error: '#dc2626',
  warning: '#f59e0b',
  background: '#fafbfc',
  border: '#e5e7eb',
  muted: '#6b7280',
};

const AUTH_STEPS = {
  EMAIL: 'email',
  PASSWORD: 'password',
  SSO_REDIRECT: 'sso-redirect',
  MFA: 'mfa',
  ORG_SELECT: 'org-select',
  SUCCESS: 'success',
};

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

/**
 * Animated DNA Helix for brand panel
 */
const DNAHelix = () => (
  <svg
    viewBox="0 0 100 200"
    className="w-32 h-64 opacity-20 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
  >
    <defs>
      <linearGradient id="dnaGradient" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#c9a227" />
        <stop offset="100%" stopColor="#e67e22" />
      </linearGradient>
    </defs>
    {[0, 1, 2, 3, 4, 5, 6, 7].map(i => (
      <g key={i} style={{ animation: `pulse 2s ease-in-out ${i * 0.2}s infinite` }}>
        <ellipse
          cx="50"
          cy={20 + i * 22}
          rx="35"
          ry="8"
          fill="none"
          stroke="url(#dnaGradient)"
          strokeWidth="2"
        />
        <line
          x1={50 - 30 * Math.cos(i * 0.8)}
          y1={20 + i * 22 - 6}
          x2={50 + 30 * Math.cos(i * 0.8)}
          y2={20 + i * 22 + 6}
          stroke="url(#dnaGradient)"
          strokeWidth="1.5"
        />
      </g>
    ))}
    <style>{`
      @keyframes pulse {
        0%, 100% { opacity: 0.3; }
        50% { opacity: 0.7; }
      }
    `}</style>
  </svg>
);

/**
 * Trust Badge Component
 */
const TrustBadge = ({ icon: Icon, label }) => (
  <div className="flex items-center gap-2 bg-white/10 rounded-full px-3 py-1.5 text-xs text-white/90 backdrop-blur-sm">
    <Icon size={14} className="text-amber-400" />
    <span>{label}</span>
  </div>
);

/**
 * Organization Card for multi-org selector
 */
const OrgCard = ({ name, type, role, lastAccessed, logo, selected, onClick }) => {
  const typeColors = {
    Biotech: 'bg-green-100 text-green-700',
    CRO: 'bg-blue-100 text-blue-700',
    'Pharma Enterprise': 'bg-purple-100 text-purple-700',
    PHARMA: 'bg-purple-100 text-purple-700',
    CONSULTING_FIRM: 'bg-amber-100 text-amber-700',
    Consulting: 'bg-amber-100 text-amber-700',
  };

  return (
    <button
      onClick={onClick}
      className={`w-full p-4 rounded-xl border-2 transition-all text-left ${
        selected
          ? 'border-[#c9a227] bg-[#c9a227]/5 shadow-md'
          : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
      }`}
    >
      <div className="flex items-start gap-3">
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-slate-700 to-slate-900 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
          {logo}
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="font-semibold text-[#1a2e4a] truncate">{name}</h4>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <span
              className={`text-xs px-2 py-0.5 rounded-full ${typeColors[type] || 'bg-gray-100 text-gray-700'}`}
            >
              {type}
            </span>
            <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
              {role}
            </span>
          </div>
          {lastAccessed && (
            <div className="flex items-center gap-1 text-xs text-gray-400 mt-2">
              <Clock size={12} /> Last accessed {lastAccessed}
            </div>
          )}
        </div>
        {selected && <CheckCircle2 className="text-[#c9a227] flex-shrink-0" size={22} />}
      </div>
    </button>
  );
};

/**
 * Loading Spinner
 */
const Spinner = ({ size = 20, className = '' }) => (
  <div
    className={`border-2 border-white/30 border-t-white rounded-full animate-spin ${className}`}
    style={{ width: size, height: size }}
  />
);

/**
 * Alert Component
 */
const Alert = ({ type = 'error', message, onClose }) => {
  const styles = {
    error: 'bg-red-50 border-red-200 text-red-800',
    warning: 'bg-amber-50 border-amber-200 text-amber-800',
    success: 'bg-green-50 border-green-200 text-green-800',
    info: 'bg-blue-50 border-blue-200 text-blue-800',
  };

  const icons = {
    error: AlertCircle,
    warning: AlertCircle,
    success: CheckCircle2,
    info: AlertCircle,
  };

  const Icon = icons[type];

  return (
    <div className={`flex items-start gap-3 p-4 rounded-xl border ${styles[type]} mb-6`}>
      <Icon size={20} className="flex-shrink-0 mt-0.5" />
      <p className="text-sm flex-1">{message}</p>
      {onClose && (
        <button onClick={onClose} className="hover:opacity-70">
          <X size={18} />
        </button>
      )}
    </div>
  );
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function TrialSageSignOn() {
  const [, setLocation] = useLocation();
  const { refreshUser } = useAuth();

  // Auth flow state
  const [step, setStep] = useState(AUTH_STEPS.EMAIL);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mfaCode, setMfaCode] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberDevice, setRememberDevice] = useState(false);

  // UI state
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [ssoProvider, setSsoProvider] = useState(null);
  const [lockoutTime, setLockoutTime] = useState(null);

  // Organization state
  const [organizations, setOrganizations] = useState([]);
  const [selectedOrg, setSelectedOrg] = useState(null);
  const [showOrgModal, setShowOrgModal] = useState(false);
  const [orgSearch, setOrgSearch] = useState('');

  // Refs
  const emailInputRef = useRef(null);
  const passwordInputRef = useRef(null);
  const mfaInputRef = useRef(null);

  // Debug: Log step changes
  useEffect(() => {
    console.log('[AUTH] Current step:', step);
  }, [step]);

  // Fallback organizations - only used if API returns empty list
  // In production, organizations always come from the enterprise API
  const fallbackOrganizations = [];

  // Focus management
  useEffect(() => {
    if (step === AUTH_STEPS.EMAIL && emailInputRef.current) {
      emailInputRef.current.focus();
    } else if (step === AUTH_STEPS.PASSWORD && passwordInputRef.current) {
      passwordInputRef.current.focus();
    } else if (step === AUTH_STEPS.MFA && mfaInputRef.current) {
      mfaInputRef.current.focus();
    }
  }, [step]);

  // Lockout countdown
  useEffect(() => {
    if (lockoutTime && lockoutTime > 0) {
      const timer = setInterval(() => {
        setLockoutTime(prev => {
          if (prev <= 1) {
            clearInterval(timer);
            return null;
          }
          return prev - 1;
        });
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [lockoutTime]);

  // Generate device fingerprint for secure auth
  const generateDeviceFingerprint = useCallback(async () => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    ctx.textBaseline = 'top';
    ctx.font = '14px Arial';
    ctx.fillText('trialsage-auth', 2, 2);
    const canvasHash = canvas.toDataURL();

    const components = [
      navigator.userAgent,
      navigator.language,
      screen.width + 'x' + screen.height,
      screen.colorDepth,
      new Date().getTimezoneOffset(),
      navigator.hardwareConcurrency || 0,
      navigator.deviceMemory || 0,
      canvasHash.slice(-50),
    ].join('|');

    // Simple hash using SubtleCrypto
    const encoder = new TextEncoder();
    const data = encoder.encode(components);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }, []);

  // Check for SSO domain via API
  const checkSSODomain = useCallback(async emailAddress => {
    const domain = emailAddress.split('@')[1]?.toLowerCase();
    if (!domain) return null;

    try {
      // Call enterprise API to check SSO configuration for domain
      const response = await fetch(
        `/api/auth/enterprise/check-sso-domain?domain=${encodeURIComponent(domain)}`,
        {
          method: 'GET',
          credentials: 'include',
        }
      );

      if (response.ok) {
        const data = await response.json();
        if (data.ssoEnabled && data.provider) {
          return { provider: data.provider, name: data.providerName };
        }
      }
      return null;
    } catch (err) {
      console.warn('SSO domain check failed, continuing with password auth');
      return null;
    }
  }, []);

  // Handle email submission - check if user exists and determine auth method
  const handleEmailSubmit = async e => {
    e.preventDefault();
    if (!email.trim()) return;

    setError('');
    setIsLoading(true);

    try {
      // Check for SSO domain first
      const sso = await checkSSODomain(email);

      if (sso) {
        setSsoProvider(sso);
        setStep(AUTH_STEPS.SSO_REDIRECT);
        return;
      }

      // Call enterprise API to check email and user status
      console.log('[AUTH] Checking email:', email.trim().toLowerCase());
      const response = await fetch('/api/auth/enterprise/check-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });

      const data = await response.json();
      console.log('[AUTH] Response:', data);

      if (!response.ok) {
        throw new Error(data.message || 'Unable to verify email');
      }

      // Check for SSO redirect
      if (data.authFlow === 'sso') {
        console.log('[AUTH] SSO flow detected');
        setSsoProvider({ provider: data.ssoProvider, name: data.ssoProviderName });
        setStep(AUTH_STEPS.SSO_REDIRECT);
        return;
      }

      // Password auth flow - proceed to password step
      if (data.authFlow === 'password') {
        console.log('[AUTH] Password flow - transitioning to PASSWORD step');
        setStep(AUTH_STEPS.PASSWORD);
      } else {
        console.log('[AUTH] Unknown authFlow:', data.authFlow);
        setError('Unable to verify email. Please contact your administrator.');
      }
    } catch (err) {
      console.error('[AUTH] Error:', err);
      setError(err.message || 'Unable to verify email. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  // Handle password submission via enterprise auth API
  const handlePasswordSubmit = async e => {
    e.preventDefault();
    if (!password) return;

    setError('');
    setIsLoading(true);

    try {
      // Generate secure device fingerprint
      const deviceFingerprint = await generateDeviceFingerprint();

      const response = await fetch('/api/auth/enterprise/verify-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          password,
          rememberDevice,
          deviceFingerprint,
          clientInfo: {
            userAgent: navigator.userAgent,
            language: navigator.language,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            screenResolution: `${screen.width}x${screen.height}`,
          },
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        // Handle account lockout
        if (response.status === 429 || data.lockoutSeconds) {
          setLockoutTime(data.lockoutSeconds || 900);
          throw new Error(
            `Account temporarily locked. Try again in ${Math.ceil((data.lockoutSeconds || 900) / 60)} minutes.`
          );
        }

        // Handle remaining attempts warning
        if (data.remainingAttempts !== undefined && data.remainingAttempts <= 2) {
          throw new Error(
            `Invalid credentials. ${data.remainingAttempts} attempts remaining before lockout.`
          );
        }

        throw new Error(data.message || 'Invalid email or password');
      }

      // Check if MFA is required
      if (data.mfaRequired) {
        setStep(AUTH_STEPS.MFA);
        return;
      }

      // Check if user has multiple organizations
      if (data.organizations && data.organizations.length > 1) {
        setOrganizations(data.organizations);
        setShowOrgModal(true);
        return;
      }

      // Single org - redirect to portal
      handleAuthSuccess(data);
    } catch (err) {
      setError(err.message || 'Authentication failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  // Handle MFA submission via enterprise auth API
  const handleMFASubmit = async e => {
    e.preventDefault();
    if (mfaCode.length !== 6) return;

    setError('');
    setIsLoading(true);

    try {
      const deviceFingerprint = await generateDeviceFingerprint();

      const response = await fetch('/api/auth/enterprise/verify-mfa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          code: mfaCode,
          rememberDevice,
          deviceFingerprint,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Invalid verification code');
      }

      // Check for multi-org
      if (data.organizations && data.organizations.length > 1) {
        setOrganizations(data.organizations);
        setShowOrgModal(true);
        return;
      }

      handleAuthSuccess(data);
    } catch (err) {
      setError(err.message || 'Verification failed. Please try again.');
      setMfaCode('');
    } finally {
      setIsLoading(false);
    }
  };

  // Handle organization selection via enterprise auth API
  const handleOrgSelect = async () => {
    if (!selectedOrg) {
      setError('Please select an organization');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const response = await fetch('/api/auth/enterprise/select-organization', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ organizationId: selectedOrg.id }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Failed to select organization');
      }

      setShowOrgModal(false);
      handleAuthSuccess({ ...data, organization: selectedOrg });
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  // Handle successful authentication
  const handleAuthSuccess = async data => {
    if (data.token) {
      localStorage.setItem('token', data.token);
    }
    if (data.organization) {
      localStorage.setItem('currentOrg', JSON.stringify(data.organization));
    }

    // Update the auth context so ProtectedRoute knows we're logged in
    await refreshUser();

    setStep(AUTH_STEPS.SUCCESS);

    // Redirect after brief success display
    setTimeout(() => {
      setLocation('/client-portal');
    }, 1500);
  };

  // Handle SSO login
  const handleSSOLogin = provider => {
    setIsLoading(true);
    // In production: window.location.href = `/api/auth/sso/${provider}/initiate`;
    window.location.href = `/api/auth/sso/${provider}/initiate`;
  };

  // Filter organizations by search - only from API results
  const filteredOrgs = (organizations.length > 0 ? organizations : fallbackOrganizations).filter(
    org =>
      org.name.toLowerCase().includes(orgSearch.toLowerCase()) ||
      org.type.toLowerCase().includes(orgSearch.toLowerCase())
  );

  // ============================================================================
  // RENDER METHODS
  // ============================================================================

  const renderEmailStep = () => (
    <form onSubmit={handleEmailSubmit} className="space-y-6">
      {/* Enterprise SSO Button */}
      <button
        type="button"
        onClick={() => handleSSOLogin('enterprise')}
        className="w-full flex items-center justify-center gap-3 bg-[#2563eb] hover:bg-[#1d4ed8] text-white font-medium py-3.5 px-4 rounded-xl transition-all shadow-sm hover:shadow-md"
      >
        <Building2 size={20} />
        Continue with Enterprise SSO
      </button>

      {/* Divider */}
      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-gray-200" />
        </div>
        <div className="relative flex justify-center text-sm">
          <span className="px-4 bg-[#fafbfc] text-gray-400">or continue with email</span>
        </div>
      </div>

      {/* Email Input */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Work Email</label>
        <div className="relative">
          <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
          <input
            ref={emailInputRef}
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="name@company.com"
            className="w-full h-12 pl-11 pr-4 border border-gray-300 rounded-xl focus:ring-2 focus:ring-[#c9a227] focus:border-[#c9a227] outline-none transition-all"
            required
            autoComplete="email"
          />
        </div>
      </div>

      {/* Submit Button */}
      <button
        type="submit"
        disabled={isLoading || !email.trim()}
        className="w-full h-12 bg-[#1a2e4a] hover:bg-[#0f1a2a] text-white font-medium rounded-xl transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm hover:shadow-md"
      >
        {isLoading ? (
          <Spinner />
        ) : (
          <>
            Continue <ChevronRight size={18} />
          </>
        )}
      </button>
    </form>
  );

  const renderPasswordStep = () => (
    <form onSubmit={handlePasswordSubmit} className="space-y-6">
      {/* Email Display */}
      <div className="flex items-center gap-2 text-sm text-gray-600 bg-gray-50 rounded-xl p-3.5 border border-gray-100">
        <Mail size={16} className="text-gray-400" />
        <span className="flex-1 truncate">{email}</span>
        <button
          type="button"
          onClick={() => {
            setStep(AUTH_STEPS.EMAIL);
            setPassword('');
            setError('');
          }}
          className="text-[#c9a227] hover:text-[#b8911f] font-medium"
        >
          Change
        </button>
      </div>

      {/* Password Input */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Password</label>
        <div className="relative">
          <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
          <input
            ref={passwordInputRef}
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="Enter your password"
            className="w-full h-12 pl-11 pr-12 border border-gray-300 rounded-xl focus:ring-2 focus:ring-[#c9a227] focus:border-[#c9a227] outline-none transition-all"
            required
            autoComplete="current-password"
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
            tabIndex={-1}
          >
            {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
          </button>
        </div>
      </div>

      {/* Remember Device & Forgot Password */}
      <div className="flex items-center justify-between">
        <label className="flex items-center gap-2 cursor-pointer group">
          <input
            type="checkbox"
            checked={rememberDevice}
            onChange={e => setRememberDevice(e.target.checked)}
            className="w-4 h-4 rounded border-gray-300 text-[#c9a227] focus:ring-[#c9a227] cursor-pointer"
          />
          <span className="text-sm text-gray-600 group-hover:text-gray-800 transition-colors">
            Remember this device
          </span>
        </label>
        <button
          type="button"
          className="text-sm text-[#c9a227] hover:text-[#b8911f] font-medium transition-colors"
        >
          Forgot password?
        </button>
      </div>

      {/* Submit Button */}
      <button
        type="submit"
        disabled={isLoading || !password || lockoutTime}
        className="w-full h-12 bg-[#1a2e4a] hover:bg-[#0f1a2a] text-white font-medium rounded-xl transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm hover:shadow-md"
      >
        {isLoading ? (
          <Spinner />
        ) : lockoutTime ? (
          `Locked (${Math.floor(lockoutTime / 60)}:${String(lockoutTime % 60).padStart(2, '0')})`
        ) : (
          <>
            Sign In <ChevronRight size={18} />
          </>
        )}
      </button>
    </form>
  );

  const renderMFAStep = () => (
    <form onSubmit={handleMFASubmit} className="space-y-6">
      {/* MFA Icon & Description */}
      <div className="text-center">
        <div className="w-16 h-16 bg-[#c9a227]/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <Fingerprint className="w-8 h-8 text-[#c9a227]" />
        </div>
        <h3 className="text-lg font-semibold text-[#1a2e4a] mb-1">Two-Factor Authentication</h3>
        <p className="text-sm text-gray-500">Enter the 6-digit code from your authenticator app</p>
      </div>

      {/* MFA Code Input */}
      <div>
        <input
          ref={mfaInputRef}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          value={mfaCode}
          onChange={e => setMfaCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
          placeholder="000000"
          className="w-full h-16 text-center text-3xl tracking-[0.5em] font-mono border border-gray-300 rounded-xl focus:ring-2 focus:ring-[#c9a227] focus:border-[#c9a227] outline-none transition-all"
          maxLength={6}
          autoComplete="one-time-code"
        />
      </div>

      {/* Remember Device */}
      <div className="flex items-center justify-center">
        <label className="flex items-center gap-2 cursor-pointer group">
          <input
            type="checkbox"
            checked={rememberDevice}
            onChange={e => setRememberDevice(e.target.checked)}
            className="w-4 h-4 rounded border-gray-300 text-[#c9a227] focus:ring-[#c9a227] cursor-pointer"
          />
          <span className="text-sm text-gray-600 group-hover:text-gray-800 transition-colors">
            Trust this device for 30 days
          </span>
        </label>
      </div>

      {/* Submit Button */}
      <button
        type="submit"
        disabled={isLoading || mfaCode.length !== 6}
        className="w-full h-12 bg-[#1a2e4a] hover:bg-[#0f1a2a] text-white font-medium rounded-xl transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm hover:shadow-md"
      >
        {isLoading ? <Spinner /> : 'Verify'}
      </button>

      {/* Alternative Methods */}
      <div className="text-center space-y-2">
        <button
          type="button"
          className="text-sm text-[#c9a227] hover:text-[#b8911f] font-medium transition-colors"
        >
          Use a backup code instead
        </button>
        <div className="flex items-center justify-center gap-4 text-xs text-gray-400">
          <button
            type="button"
            className="flex items-center gap-1 hover:text-gray-600 transition-colors"
          >
            <Key size={12} /> Hardware key
          </button>
          <button
            type="button"
            className="flex items-center gap-1 hover:text-gray-600 transition-colors"
          >
            <Smartphone size={12} /> Resend code
          </button>
        </div>
      </div>
    </form>
  );

  const renderSSORedirect = () => (
    <div className="text-center py-8">
      <div className="w-16 h-16 bg-[#2563eb]/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
        <Building2 className="w-8 h-8 text-[#2563eb]" />
      </div>
      <h3 className="text-lg font-semibold text-[#1a2e4a] mb-2">
        Redirecting to {ssoProvider?.name || 'SSO Provider'}
      </h3>
      <p className="text-sm text-gray-500 mb-6">
        You'll be redirected to your organization's sign-in page
      </p>
      <div className="flex justify-center">
        <Spinner size={24} className="border-[#2563eb]/30 border-t-[#2563eb]" />
      </div>
      <button
        type="button"
        onClick={() => {
          setStep(AUTH_STEPS.EMAIL);
          setSsoProvider(null);
        }}
        className="mt-6 text-sm text-gray-500 hover:text-gray-700 transition-colors"
      >
        Cancel and use password instead
      </button>
    </div>
  );

  const renderSuccessStep = () => (
    <div className="text-center py-8">
      <div className="w-16 h-16 bg-green-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
        <CheckCircle2 className="w-8 h-8 text-green-600" />
      </div>
      <h3 className="text-lg font-semibold text-[#1a2e4a] mb-2">Authentication Successful</h3>
      <p className="text-sm text-gray-500 mb-4">Redirecting to your dashboard...</p>
      {selectedOrg && (
        <div className="bg-gray-50 rounded-xl p-4 inline-block">
          <p className="text-sm text-gray-600">
            Organization: <span className="font-semibold text-[#1a2e4a]">{selectedOrg.name}</span>
          </p>
        </div>
      )}
      <div className="flex justify-center mt-6">
        <Spinner size={24} className="border-green-200 border-t-green-600" />
      </div>
    </div>
  );

  const renderCurrentStep = () => {
    switch (step) {
      case AUTH_STEPS.EMAIL:
        return renderEmailStep();
      case AUTH_STEPS.PASSWORD:
        return renderPasswordStep();
      case AUTH_STEPS.MFA:
        return renderMFAStep();
      case AUTH_STEPS.SSO_REDIRECT:
        return renderSSORedirect();
      case AUTH_STEPS.SUCCESS:
        return renderSuccessStep();
      default:
        return renderEmailStep();
    }
  };

  // ============================================================================
  // MAIN RENDER
  // ============================================================================

  return (
    <div className="min-h-screen flex bg-[#fafbfc]">
      {/* ===== LEFT BRAND PANEL ===== */}
      <div className="hidden lg:flex lg:w-[42%] bg-gradient-to-br from-[#1a2e4a] via-[#1a2e4a] to-[#0f1a2a] relative overflow-hidden flex-col justify-between p-10">
        {/* Background Pattern */}
        <div className="absolute inset-0 opacity-5">
          <div
            className="absolute inset-0"
            style={{
              backgroundImage: `radial-gradient(circle at 2px 2px, white 1px, transparent 0)`,
              backgroundSize: '40px 40px',
            }}
          />
        </div>

        {/* DNA Animation */}
        <DNAHelix />

        {/* Logo & Tagline */}
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center shadow-lg">
              <svg
                viewBox="0 0 24 24"
                className="w-7 h-7 text-white"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z" />
                <path d="M12 6v12M6 12h12" />
              </svg>
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">Concept2Cure</h1>
              <p className="text-amber-400 text-sm font-medium">TrialSage Platform</p>
            </div>
          </div>
        </div>

        {/* Middle Content */}
        <div className="relative z-10 flex-1 flex flex-col justify-center max-w-lg">
          <h2 className="text-3xl font-light text-white leading-tight mb-4">
            Transform regulatory filings into{' '}
            <span className="text-amber-400 font-semibold">intelligence</span>
          </h2>
          <p className="text-white/70 text-base leading-relaxed">
            The enterprise platform for regulatory authoring, impact analysis, and submission
            intelligence.
          </p>

          {/* Feature List */}
          <div className="mt-8 space-y-3">
            {[
              'AI-powered eCTD document generation',
              'Real-time regulatory compliance monitoring',
              'Multi-agency submission management',
              'Intelligent workflow automation',
            ].map((feature, i) => (
              <div key={i} className="flex items-center gap-3 text-white/80">
                <CheckCircle2 size={18} className="text-amber-400 flex-shrink-0" />
                <span className="text-sm">{feature}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Trust Badges */}
        <div className="relative z-10">
          <p className="text-white/50 text-xs uppercase tracking-wider mb-3">
            Trusted by regulated industries
          </p>
          <div className="flex flex-wrap gap-2">
            <TrustBadge icon={Shield} label="21 CFR Part 11" />
            <TrustBadge icon={CheckCircle2} label="SOC 2 Type II" />
            <TrustBadge icon={Globe} label="HIPAA Ready" />
          </div>
        </div>
      </div>

      {/* ===== RIGHT AUTH PANEL ===== */}
      <div className="flex-1 flex items-center justify-center p-6 lg:p-12">
        <div className="w-full max-w-md">
          {/* Mobile Logo */}
          <div className="lg:hidden flex items-center gap-3 mb-8 justify-center">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center">
              <svg
                viewBox="0 0 24 24"
                className="w-6 h-6 text-white"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z" />
              </svg>
            </div>
            <span className="text-xl font-bold text-[#1a2e4a]">TrialSage</span>
          </div>

          {/* Header */}
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-[#1a2e4a] mb-2">
              {step === AUTH_STEPS.SUCCESS
                ? 'Welcome back!'
                : step === AUTH_STEPS.MFA
                  ? 'Verify your identity'
                  : 'Sign in to TrialSage'}
            </h2>
            <p className="text-gray-500">
              {step === AUTH_STEPS.EMAIL && 'Enter your work email to continue'}
              {step === AUTH_STEPS.PASSWORD && 'Enter your password to access your account'}
              {step === AUTH_STEPS.MFA && 'Complete two-factor authentication'}
              {step === AUTH_STEPS.SSO_REDIRECT && 'Connecting to your identity provider'}
              {step === AUTH_STEPS.SUCCESS && `Signed in as ${email}`}
            </p>
          </div>

          {/* Error Display */}
          {error && (
            <Alert
              type={lockoutTime ? 'warning' : 'error'}
              message={error}
              onClose={() => setError('')}
            />
          )}

          {/* Step Content */}
          {renderCurrentStep()}

          {/* Footer */}
          {step !== AUTH_STEPS.SUCCESS && step !== AUTH_STEPS.SSO_REDIRECT && (
            <div className="mt-8 pt-6 border-t border-gray-200">
              <p className="text-center text-sm text-gray-500 mb-4">
                New to TrialSage?{' '}
                <button className="text-[#c9a227] hover:text-[#b8911f] font-medium transition-colors">
                  Request access
                </button>
              </p>
              <div className="flex justify-center gap-6 text-xs text-gray-400">
                <a href="/terms" className="hover:text-gray-600 transition-colors">
                  Terms
                </a>
                <a href="/privacy" className="hover:text-gray-600 transition-colors">
                  Privacy
                </a>
                <a href="/security" className="hover:text-gray-600 transition-colors">
                  Security
                </a>
              </div>
            </div>
          )}

          {/* Mobile Trust Badges */}
          <div className="lg:hidden mt-8 flex items-center justify-center gap-4 text-xs text-gray-400">
            <span className="flex items-center gap-1">
              <Shield size={14} /> 21 CFR Part 11
            </span>
            <span className="flex items-center gap-1">
              <CheckCircle2 size={14} /> SOC 2
            </span>
          </div>
        </div>
      </div>

      {/* ===== ORGANIZATION SELECTOR MODAL ===== */}
      {showOrgModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col animate-in fade-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="p-6 border-b border-gray-100">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-xl font-bold text-[#1a2e4a]">Select Organization</h3>
                  <p className="text-sm text-gray-500 mt-1">Choose which organization to access</p>
                </div>
                <button
                  onClick={() => setShowOrgModal(false)}
                  className="w-8 h-8 rounded-lg hover:bg-gray-100 flex items-center justify-center text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <X size={20} />
                </button>
              </div>

              {/* Search */}
              <div className="relative">
                <Search
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400"
                  size={18}
                />
                <input
                  type="text"
                  value={orgSearch}
                  onChange={e => setOrgSearch(e.target.value)}
                  placeholder="Search organizations..."
                  className="w-full h-11 pl-11 pr-4 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#c9a227] focus:border-[#c9a227] outline-none transition-all"
                />
              </div>
            </div>

            {/* Organization List */}
            <div className="flex-1 overflow-y-auto p-6">
              {filteredOrgs.some(org => org.lastAccessed) && (
                <>
                  <p className="text-xs uppercase tracking-wider text-gray-400 mb-3 font-medium">
                    Recent Organizations
                  </p>
                  <div className="space-y-3 mb-6">
                    {filteredOrgs
                      .filter(org => org.lastAccessed)
                      .map(org => (
                        <OrgCard
                          key={org.id}
                          {...org}
                          selected={selectedOrg?.id === org.id}
                          onClick={() => setSelectedOrg(org)}
                        />
                      ))}
                  </div>
                </>
              )}

              {filteredOrgs.some(org => !org.lastAccessed) && (
                <>
                  <p className="text-xs uppercase tracking-wider text-gray-400 mb-3 font-medium">
                    All Organizations
                  </p>
                  <div className="space-y-3">
                    {filteredOrgs
                      .filter(org => !org.lastAccessed)
                      .map(org => (
                        <OrgCard
                          key={org.id}
                          {...org}
                          selected={selectedOrg?.id === org.id}
                          onClick={() => setSelectedOrg(org)}
                        />
                      ))}
                  </div>
                </>
              )}

              {filteredOrgs.length === 0 && (
                <div className="text-center py-8">
                  <Users className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500">No organizations found</p>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-6 border-t border-gray-100 bg-gray-50/50 rounded-b-2xl">
              {error && <p className="text-sm text-red-600 mb-3 text-center">{error}</p>}
              <button
                onClick={handleOrgSelect}
                disabled={!selectedOrg || isLoading}
                className="w-full h-12 bg-[#1a2e4a] hover:bg-[#0f1a2a] disabled:bg-gray-300 text-white font-medium rounded-xl transition-all flex items-center justify-center gap-2 shadow-sm hover:shadow-md disabled:cursor-not-allowed"
              >
                {isLoading ? (
                  <Spinner />
                ) : (
                  <>
                    Continue to {selectedOrg?.name || 'Dashboard'}
                    <ChevronRight size={18} />
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
