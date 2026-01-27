/**
 * TrialSage Client Portal V2 - Enterprise Login Page
 *
 * FDA 21 CFR Part 11 compliant authentication with:
 * - Two-factor authentication (TOTP, hardware key, biometric)
 * - Session management and concurrent session control
 * - Failed login attempt tracking and lockout
 * - Audit trail logging per 11.10(e)
 *
 * @version 2.0.0
 * @compliance FDA 21 CFR Part 11.10(d), EU Annex 11
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { authLogger } from '../../utils/logger';
import {
  Eye,
  EyeOff,
  Lock,
  Mail,
  Shield,
  ShieldCheck,
  AlertTriangle,
  Loader2,
  Key,
  Smartphone,
  Fingerprint,
  Building2,
  ArrowRight,
  HelpCircle,
  RefreshCw,
  CheckCircle,
  XCircle,
  Clock,
  Globe,
  Info,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import type { MfaMethod } from '../../core/securityTypes';

// ─────────────────────────────────────────────────────────────────────────────
// TYPES & INTERFACES
// ─────────────────────────────────────────────────────────────────────────────

type LoginStep = 'credentials' | 'mfa' | 'tenant_select' | 'session_warning' | 'success';

interface LoginState {
  step: LoginStep;
  email: string;
  password: string;
  mfaCode: string;
  mfaMethod: MfaMethod | null;
  availableMfaMethods: MfaMethod[];
  selectedTenantId: string | null;
  rememberDevice: boolean;
  isLoading: boolean;
  error: string | null;
  failedAttempts: number;
  lockoutUntil: Date | null;
  sessionWarningData: SessionWarningData | null;
}

interface SessionWarningData {
  activeSessions: ActiveSession[];
  maxAllowed: number;
}

interface ActiveSession {
  id: string;
  deviceName: string;
  ipAddress: string;
  location: string;
  lastActivity: Date;
  isCurrent: boolean;
}

interface TenantOption {
  id: string;
  name: string;
  logoUrl?: string;
  role: string;
  lastAccess?: Date;
}

interface LoginCredentialsResponse {
  requiresMfa: boolean;
  availableMfaMethods: MfaMethod[];
  tenants?: TenantOption[];
  userId?: string;
}

interface MfaVerificationResponse {
  verified: boolean;
  tenants: TenantOption[];
  sessionWarning?: SessionWarningData;
}

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MINUTES = 30;

const MFA_METHOD_CONFIG: Record<
  MfaMethod,
  { label: string; description: string; icon: React.ComponentType<{ className?: string }> }
> = {
  totp: {
    label: 'Authenticator App',
    description: 'Use Google Authenticator, Authy, or similar',
    icon: Smartphone,
  },
  hardware_key: {
    label: 'Hardware Security Key',
    description: 'Use YubiKey or FIDO2 compatible device',
    icon: Key,
  },
  biometric: {
    label: 'Biometric',
    description: 'Use fingerprint or face recognition',
    icon: Fingerprint,
  },
  sms: {
    label: 'SMS Code',
    description: 'Receive verification code via text message',
    icon: Smartphone,
  },
  email: {
    label: 'Email Code',
    description: 'Receive verification code via email',
    icon: Mail,
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// PASSWORD VISIBILITY TOGGLE
// ─────────────────────────────────────────────────────────────────────────────

const PasswordInput: React.FC<{
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  autoComplete?: string;
  id?: string;
}> = ({ value, onChange, placeholder = 'Enter password', disabled, autoComplete, id }) => {
  const [showPassword, setShowPassword] = useState(false);

  return (
    <div className="relative">
      <Input
        id={id}
        type={showPassword ? 'text' : 'password'}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        autoComplete={autoComplete}
        className="pr-10"
      />
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
        onClick={() => setShowPassword(!showPassword)}
        disabled={disabled}
      >
        {showPassword ? (
          <EyeOff className="h-4 w-4 text-muted-foreground" />
        ) : (
          <Eye className="h-4 w-4 text-muted-foreground" />
        )}
      </Button>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// LOCKOUT COUNTDOWN
// ─────────────────────────────────────────────────────────────────────────────

const LockoutCountdown: React.FC<{ lockoutUntil: Date; onExpire: () => void }> = ({
  lockoutUntil,
  onExpire,
}) => {
  const [remaining, setRemaining] = useState('');

  useEffect(() => {
    const updateCountdown = () => {
      const now = new Date();
      const diff = lockoutUntil.getTime() - now.getTime();

      if (diff <= 0) {
        onExpire();
        return;
      }

      const minutes = Math.floor(diff / 60000);
      const seconds = Math.floor((diff % 60000) / 1000);
      setRemaining(`${minutes}:${seconds.toString().padStart(2, '0')}`);
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [lockoutUntil, onExpire]);

  return (
    <Alert variant="destructive">
      <Lock className="h-4 w-4" />
      <AlertTitle>Account Temporarily Locked</AlertTitle>
      <AlertDescription>
        Due to multiple failed login attempts, your account has been temporarily locked.
        <div className="mt-2 flex items-center gap-2">
          <Clock className="h-4 w-4" />
          <span className="font-mono font-bold">{remaining}</span>
          <span>until unlock</span>
        </div>
      </AlertDescription>
    </Alert>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// MFA CODE INPUT
// ─────────────────────────────────────────────────────────────────────────────

const MfaCodeInput: React.FC<{
  value: string;
  onChange: (value: string) => void;
  length?: number;
  disabled?: boolean;
  autoFocus?: boolean;
}> = ({ value, onChange, length = 6, disabled, autoFocus }) => {
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const digits = value.padEnd(length, '').split('').slice(0, length);

  const handleInput = (index: number, digit: string) => {
    if (!/^\d?$/.test(digit)) return;

    const newDigits = [...digits];
    newDigits[index] = digit;
    onChange(newDigits.join(''));

    // Auto-advance to next input
    if (digit && index < length - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, length);
    onChange(pastedData);
    const nextIndex = Math.min(pastedData.length, length - 1);
    inputRefs.current[nextIndex]?.focus();
  };

  useEffect(() => {
    if (autoFocus) {
      inputRefs.current[0]?.focus();
    }
  }, [autoFocus]);

  return (
    <div className="flex gap-2 justify-center">
      {digits.map((digit, index) => (
        <Input
          key={index}
          ref={el => (inputRefs.current[index] = el)}
          type="text"
          inputMode="numeric"
          pattern="\d"
          maxLength={1}
          value={digit}
          onChange={e => handleInput(index, e.target.value)}
          onKeyDown={e => handleKeyDown(index, e)}
          onPaste={handlePaste}
          disabled={disabled}
          className="w-12 h-14 text-center text-2xl font-mono"
        />
      ))}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// CREDENTIALS STEP
// ─────────────────────────────────────────────────────────────────────────────

const CredentialsStep: React.FC<{
  state: LoginState;
  onEmailChange: (email: string) => void;
  onPasswordChange: (password: string) => void;
  onSubmit: () => void;
  onForgotPassword: () => void;
  onSSOLogin: (provider: string) => void;
}> = ({ state, onEmailChange, onPasswordChange, onSubmit, onForgotPassword, onSSOLogin }) => {
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit();
  };

  const isLockedOut = state.lockoutUntil && new Date() < state.lockoutUntil;

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Failed attempts warning */}
      {state.failedAttempts > 0 && state.failedAttempts < MAX_FAILED_ATTEMPTS && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            {MAX_FAILED_ATTEMPTS - state.failedAttempts} login attempts remaining before account
            lockout.
          </AlertDescription>
        </Alert>
      )}

      {/* Email */}
      <div className="space-y-2">
        <Label htmlFor="email">Email Address</Label>
        <div className="relative">
          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            id="email"
            type="email"
            value={state.email}
            onChange={e => onEmailChange(e.target.value)}
            placeholder="you@company.com"
            disabled={state.isLoading || !!isLockedOut}
            autoComplete="email"
            className="pl-10"
            required
          />
        </div>
      </div>

      {/* Password */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="password">Password</Label>
          <Button
            type="button"
            variant="link"
            size="sm"
            className="h-auto p-0 text-sm"
            onClick={onForgotPassword}
          >
            Forgot password?
          </Button>
        </div>
        <div className="relative">
          <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground z-10" />
          <div className="[&>div>input]:pl-10">
            <PasswordInput
              id="password"
              value={state.password}
              onChange={onPasswordChange}
              placeholder="Enter your password"
              disabled={state.isLoading || !!isLockedOut}
              autoComplete="current-password"
            />
          </div>
        </div>
      </div>

      {/* Error message */}
      {state.error && (
        <Alert variant="destructive">
          <XCircle className="h-4 w-4" />
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}

      {/* Submit */}
      <Button
        type="submit"
        className="w-full"
        size="lg"
        disabled={!state.email || !state.password || state.isLoading || !!isLockedOut}
      >
        {state.isLoading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Authenticating...
          </>
        ) : (
          <>
            Sign In
            <ArrowRight className="ml-2 h-4 w-4" />
          </>
        )}
      </Button>

      {/* Divider */}
      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-background px-2 text-muted-foreground">Or continue with</span>
        </div>
      </div>

      {/* SSO Options */}
      <div className="grid grid-cols-2 gap-3">
        <Button
          type="button"
          variant="outline"
          onClick={() => onSSOLogin('azure')}
          disabled={state.isLoading}
        >
          <svg className="mr-2 h-4 w-4" viewBox="0 0 21 21">
            <path fill="#f25022" d="M0 0h10v10H0z" />
            <path fill="#7fba00" d="M11 0h10v10H11z" />
            <path fill="#00a4ef" d="M0 11h10v10H0z" />
            <path fill="#ffb900" d="M11 11h10v10H11z" />
          </svg>
          Microsoft
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => onSSOLogin('okta')}
          disabled={state.isLoading}
        >
          <Shield className="mr-2 h-4 w-4" />
          Okta SSO
        </Button>
      </div>

      {/* Compliance Notice */}
      <div className="rounded-lg border bg-muted/50 p-3">
        <div className="flex gap-2 text-xs text-muted-foreground">
          <ShieldCheck className="h-4 w-4 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-foreground">FDA 21 CFR Part 11 Compliant</p>
            <p className="mt-1">
              All authentication events are logged with full audit trail. Your session will be
              automatically terminated after 30 minutes of inactivity.
            </p>
          </div>
        </div>
      </div>
    </form>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// MFA VERIFICATION STEP
// ─────────────────────────────────────────────────────────────────────────────

const MfaStep: React.FC<{
  state: LoginState;
  onMethodChange: (method: MfaMethod) => void;
  onCodeChange: (code: string) => void;
  onSubmit: () => void;
  onResendCode: () => void;
  onBack: () => void;
}> = ({ state, onMethodChange, onCodeChange, onSubmit, onResendCode, onBack }) => {
  const selectedMethod = state.mfaMethod || state.availableMfaMethods[0];
  const methodConfig = selectedMethod ? MFA_METHOD_CONFIG[selectedMethod] : null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit();
  };

  // Auto-submit when code is complete
  useEffect(() => {
    if (state.mfaCode.length === 6 && !state.isLoading) {
      onSubmit();
    }
  }, [state.mfaCode, state.isLoading, onSubmit]);

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="text-center space-y-2">
        <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
          <Shield className="h-8 w-8 text-primary" />
        </div>
        <h3 className="text-lg font-semibold">Two-Factor Authentication</h3>
        <p className="text-sm text-muted-foreground">
          Enter the verification code to complete sign-in
        </p>
      </div>

      {/* Method Selection */}
      {state.availableMfaMethods.length > 1 && (
        <div className="space-y-2">
          <Label>Verification Method</Label>
          <Select
            value={selectedMethod}
            onValueChange={value => onMethodChange(value as MfaMethod)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {state.availableMfaMethods.map(method => {
                const config = MFA_METHOD_CONFIG[method];
                const Icon = config.icon;
                return (
                  <SelectItem key={method} value={method}>
                    <div className="flex items-center gap-2">
                      <Icon className="h-4 w-4" />
                      {config.label}
                    </div>
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Method-specific instructions */}
      {methodConfig && (
        <div className="rounded-lg border bg-muted/50 p-4 text-center">
          <div className="flex justify-center mb-2">
            <methodConfig.icon className="h-8 w-8 text-muted-foreground" />
          </div>
          <p className="text-sm font-medium">{methodConfig.label}</p>
          <p className="text-xs text-muted-foreground mt-1">{methodConfig.description}</p>
        </div>
      )}

      {/* Code Input */}
      {(selectedMethod === 'totp' || selectedMethod === 'sms' || selectedMethod === 'email') && (
        <div className="space-y-4">
          <MfaCodeInput
            value={state.mfaCode}
            onChange={onCodeChange}
            disabled={state.isLoading}
            autoFocus
          />
          {(selectedMethod === 'sms' || selectedMethod === 'email') && (
            <div className="text-center">
              <Button
                type="button"
                variant="link"
                size="sm"
                onClick={onResendCode}
                disabled={state.isLoading}
              >
                <RefreshCw className="mr-2 h-3 w-3" />
                Resend Code
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Hardware Key */}
      {selectedMethod === 'hardware_key' && (
        <div className="text-center space-y-4">
          <div className="p-8 rounded-lg border-2 border-dashed border-muted-foreground/25">
            <Key className="h-12 w-12 mx-auto text-muted-foreground animate-pulse" />
            <p className="mt-4 text-sm text-muted-foreground">
              Insert your security key and tap it when prompted
            </p>
          </div>
          <Button type="button" variant="outline" onClick={onSubmit} disabled={state.isLoading}>
            {state.isLoading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Key className="mr-2 h-4 w-4" />
            )}
            Authenticate with Security Key
          </Button>
        </div>
      )}

      {/* Biometric */}
      {selectedMethod === 'biometric' && (
        <div className="text-center space-y-4">
          <div className="p-8 rounded-lg border-2 border-dashed border-muted-foreground/25">
            <Fingerprint className="h-12 w-12 mx-auto text-muted-foreground animate-pulse" />
            <p className="mt-4 text-sm text-muted-foreground">
              Use your fingerprint or face to authenticate
            </p>
          </div>
          <Button type="button" variant="outline" onClick={onSubmit} disabled={state.isLoading}>
            {state.isLoading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Fingerprint className="mr-2 h-4 w-4" />
            )}
            Authenticate with Biometric
          </Button>
        </div>
      )}

      {/* Error */}
      {state.error && (
        <Alert variant="destructive">
          <XCircle className="h-4 w-4" />
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}

      {/* Actions */}
      <div className="flex gap-3">
        <Button type="button" variant="outline" onClick={onBack} className="flex-1">
          Back
        </Button>
        {(selectedMethod === 'totp' || selectedMethod === 'sms' || selectedMethod === 'email') && (
          <Button
            type="submit"
            className="flex-1"
            disabled={state.mfaCode.length < 6 || state.isLoading}
          >
            {state.isLoading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle className="mr-2 h-4 w-4" />
            )}
            Verify
          </Button>
        )}
      </div>
    </form>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// TENANT SELECTION STEP
// ─────────────────────────────────────────────────────────────────────────────

const TenantSelectStep: React.FC<{
  tenants: TenantOption[];
  selectedTenantId: string | null;
  onSelect: (tenantId: string) => void;
  onContinue: () => void;
  isLoading: boolean;
}> = ({ tenants, selectedTenantId, onSelect, onContinue, isLoading }) => {
  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
          <Building2 className="h-8 w-8 text-primary" />
        </div>
        <h3 className="text-lg font-semibold">Select Organization</h3>
        <p className="text-sm text-muted-foreground">Choose which organization to access</p>
      </div>

      <div className="space-y-2">
        {tenants.map(tenant => (
          <button
            key={tenant.id}
            type="button"
            onClick={() => onSelect(tenant.id)}
            className={`w-full p-4 rounded-lg border-2 text-left transition-all ${
              selectedTenantId === tenant.id
                ? 'border-primary bg-primary/5'
                : 'border-muted hover:border-primary/50 hover:bg-muted/50'
            }`}
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
                {tenant.logoUrl ? (
                  <img src={tenant.logoUrl} alt="" className="w-8 h-8 rounded" />
                ) : (
                  <Building2 className="h-5 w-5 text-muted-foreground" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{tenant.name}</p>
                <p className="text-sm text-muted-foreground">{tenant.role}</p>
              </div>
              {selectedTenantId === tenant.id && (
                <CheckCircle className="h-5 w-5 text-primary flex-shrink-0" />
              )}
            </div>
            {tenant.lastAccess && (
              <p className="text-xs text-muted-foreground mt-2 pl-13">
                Last accessed: {new Date(tenant.lastAccess).toLocaleDateString()}
              </p>
            )}
          </button>
        ))}
      </div>

      <Button className="w-full" onClick={onContinue} disabled={!selectedTenantId || isLoading}>
        {isLoading ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <ArrowRight className="mr-2 h-4 w-4" />
        )}
        Continue
      </Button>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// SESSION WARNING DIALOG
// ─────────────────────────────────────────────────────────────────────────────

const SessionWarningDialog: React.FC<{
  open: boolean;
  sessionData: SessionWarningData | null;
  onTerminateSession: (sessionId: string) => void;
  onTerminateAll: () => void;
  onCancel: () => void;
  isLoading: boolean;
}> = ({ open, sessionData, onTerminateSession, onTerminateAll, onCancel, isLoading }) => {
  if (!sessionData) return null;

  return (
    <Dialog open={open} onOpenChange={() => !isLoading && onCancel()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-amber-600">
            <AlertTriangle className="h-5 w-5" />
            Active Session Limit Reached
          </DialogTitle>
          <DialogDescription>
            You have {sessionData.activeSessions.length} active sessions, which is the maximum
            allowed. You must terminate at least one session to continue.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 my-4">
          {sessionData.activeSessions.map(session => (
            <div
              key={session.id}
              className="flex items-center justify-between p-3 rounded-lg border"
            >
              <div className="flex items-center gap-3">
                <Globe className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="font-medium text-sm">{session.deviceName}</p>
                  <p className="text-xs text-muted-foreground">
                    {session.ipAddress} • {session.location}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Last active: {new Date(session.lastActivity).toLocaleString()}
                  </p>
                </div>
              </div>
              {!session.isCurrent && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onTerminateSession(session.id)}
                  disabled={isLoading}
                >
                  Terminate
                </Button>
              )}
              {session.isCurrent && <Badge variant="secondary">Current</Badge>}
            </div>
          ))}
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={onCancel} disabled={isLoading}>
            Cancel Login
          </Button>
          <Button variant="destructive" onClick={onTerminateAll} disabled={isLoading}>
            {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Terminate All & Continue
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// MAIN LOGIN PAGE COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

export const LoginPage: React.FC<{
  onLoginSuccess: (sessionToken: string, tenantId: string) => void;
  onForgotPassword: () => void;
  onContactSupport: () => void;
}> = ({ onLoginSuccess, onForgotPassword, onContactSupport }) => {
  const [state, setState] = useState<LoginState>({
    step: 'credentials',
    email: '',
    password: '',
    mfaCode: '',
    mfaMethod: null,
    availableMfaMethods: [],
    selectedTenantId: null,
    rememberDevice: false,
    isLoading: false,
    error: null,
    failedAttempts: 0,
    lockoutUntil: null,
    sessionWarningData: null,
  });

  const [tenants, setTenants] = useState<TenantOption[]>([]);
  const [showForgotPassword, setShowForgotPassword] = useState(false);

  // Handle credential submission
  const handleCredentialsSubmit = useCallback(async () => {
    setState(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      // TODO: Replace with actual API call
      // const response = await authApi.validateCredentials(state.email, state.password);

      // Simulated API response
      await new Promise(resolve => setTimeout(resolve, 1000));

      const mockResponse: LoginCredentialsResponse = {
        requiresMfa: true,
        availableMfaMethods: ['totp', 'hardware_key', 'sms'],
        tenants: [
          {
            id: 'org_001',
            name: 'Acme Pharmaceuticals',
            role: 'Regulatory Lead',
            lastAccess: new Date('2025-01-24'),
          },
          {
            id: 'org_002',
            name: 'BioGen Research',
            role: 'Medical Writer',
            lastAccess: new Date('2025-01-20'),
          },
        ],
      };

      if (mockResponse.requiresMfa) {
        setState(prev => ({
          ...prev,
          step: 'mfa',
          availableMfaMethods: mockResponse.availableMfaMethods,
          mfaMethod: mockResponse.availableMfaMethods[0],
          isLoading: false,
        }));
        if (mockResponse.tenants) {
          setTenants(mockResponse.tenants);
        }
      } else if (mockResponse.tenants && mockResponse.tenants.length > 1) {
        setTenants(mockResponse.tenants);
        setState(prev => ({
          ...prev,
          step: 'tenant_select',
          isLoading: false,
        }));
      } else {
        // Direct login
        onLoginSuccess('mock_session_token', mockResponse.tenants?.[0]?.id || 'default');
      }
    } catch (error) {
      const newFailedAttempts = state.failedAttempts + 1;
      const lockoutUntil =
        newFailedAttempts >= MAX_FAILED_ATTEMPTS
          ? new Date(Date.now() + LOCKOUT_DURATION_MINUTES * 60 * 1000)
          : null;

      setState(prev => ({
        ...prev,
        isLoading: false,
        error: 'Invalid email or password. Please try again.',
        failedAttempts: newFailedAttempts,
        lockoutUntil,
      }));
    }
  }, [state.email, state.password, state.failedAttempts, onLoginSuccess]);

  // Handle MFA verification
  const handleMfaSubmit = useCallback(async () => {
    setState(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      // TODO: Replace with actual API call
      await new Promise(resolve => setTimeout(resolve, 800));

      // Check for concurrent session warning
      const mockSessionWarning: SessionWarningData | undefined = undefined; // Set to mock data to test

      if (mockSessionWarning) {
        setState(prev => ({
          ...prev,
          step: 'session_warning',
          sessionWarningData: mockSessionWarning,
          isLoading: false,
        }));
      } else if (tenants.length > 1) {
        setState(prev => ({
          ...prev,
          step: 'tenant_select',
          isLoading: false,
        }));
      } else {
        setState(prev => ({ ...prev, step: 'success', isLoading: false }));
        onLoginSuccess('mock_session_token', tenants[0]?.id || 'default');
      }
    } catch (error) {
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: 'Invalid verification code. Please try again.',
        mfaCode: '',
      }));
    }
  }, [state.mfaCode, tenants, onLoginSuccess]);

  // Handle tenant selection
  const handleTenantContinue = useCallback(async () => {
    if (!state.selectedTenantId) return;

    setState(prev => ({ ...prev, isLoading: true }));

    try {
      // TODO: Replace with actual API call
      await new Promise(resolve => setTimeout(resolve, 500));

      setState(prev => ({ ...prev, step: 'success', isLoading: false }));
      onLoginSuccess('mock_session_token', state.selectedTenantId!);
    } catch (error) {
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: 'Failed to access organization. Please try again.',
      }));
    }
  }, [state.selectedTenantId, onLoginSuccess]);

  // Handle SSO login
  const handleSSOLogin = useCallback((provider: string) => {
    // TODO: Implement SSO redirect
    authLogger.info('SSO login initiated', { provider });
    window.location.href = `/api/auth/sso/${provider}`;
  }, []);

  // Handle session termination
  const handleTerminateSession = useCallback(async (sessionId: string) => {
    setState(prev => ({ ...prev, isLoading: true }));
    // TODO: Implement session termination
    await new Promise(resolve => setTimeout(resolve, 500));
    setState(prev => ({
      ...prev,
      isLoading: false,
      sessionWarningData: prev.sessionWarningData
        ? {
            ...prev.sessionWarningData,
            activeSessions: prev.sessionWarningData.activeSessions.filter(s => s.id !== sessionId),
          }
        : null,
    }));
  }, []);

  // Handle terminate all sessions
  const handleTerminateAllSessions = useCallback(async () => {
    setState(prev => ({ ...prev, isLoading: true }));
    // TODO: Implement terminate all
    await new Promise(resolve => setTimeout(resolve, 1000));
    setState(prev => ({
      ...prev,
      isLoading: false,
      step: tenants.length > 1 ? 'tenant_select' : 'success',
      sessionWarningData: null,
    }));
    if (tenants.length <= 1) {
      onLoginSuccess('mock_session_token', tenants[0]?.id || 'default');
    }
  }, [tenants, onLoginSuccess]);

  // Clear lockout
  const handleLockoutExpire = useCallback(() => {
    setState(prev => ({
      ...prev,
      lockoutUntil: null,
      failedAttempts: 0,
    }));
  }, []);

  return (
    <div className="min-h-screen flex">
      {/* Left side - Branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-primary to-primary/80 text-white p-12 flex-col justify-between">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">TrialSage</h1>
              <p className="text-sm opacity-80">Regulatory Intelligence Platform</p>
            </div>
          </div>
        </div>

        <div className="space-y-8">
          <div>
            <h2 className="text-3xl font-bold leading-tight">
              Enterprise-Grade Security for
              <br />
              Regulatory Excellence
            </h2>
            <p className="mt-4 text-lg opacity-90 max-w-md">
              FDA 21 CFR Part 11 compliant authentication with complete audit trails and
              multi-factor verification.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-lg bg-white/10 p-4">
              <Lock className="h-6 w-6 mb-2" />
              <p className="font-medium">Multi-Factor Auth</p>
              <p className="text-sm opacity-75">Hardware keys, TOTP, biometric</p>
            </div>
            <div className="rounded-lg bg-white/10 p-4">
              <Eye className="h-6 w-6 mb-2" />
              <p className="font-medium">Full Audit Trail</p>
              <p className="text-sm opacity-75">Complete access logging</p>
            </div>
            <div className="rounded-lg bg-white/10 p-4">
              <Building2 className="h-6 w-6 mb-2" />
              <p className="font-medium">Multi-Tenant</p>
              <p className="text-sm opacity-75">Strict data isolation</p>
            </div>
            <div className="rounded-lg bg-white/10 p-4">
              <Globe className="h-6 w-6 mb-2" />
              <p className="font-medium">SSO Integration</p>
              <p className="text-sm opacity-75">Microsoft, Okta, SAML</p>
            </div>
          </div>
        </div>

        <div className="text-sm opacity-75">
          <p>Protected by enterprise-grade encryption.</p>
          <p>SOC 2 Type II • ISO 27001 • HIPAA Compliant</p>
        </div>
      </div>

      {/* Right side - Login form */}
      <div className="flex-1 flex items-center justify-center p-8 bg-background">
        <div className="w-full max-w-md">
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center justify-center gap-3 mb-8">
            <div className="w-10 h-10 rounded-lg bg-primary flex items-center justify-center">
              <ShieldCheck className="h-5 w-5 text-white" />
            </div>
            <span className="text-xl font-bold">TrialSage</span>
          </div>

          <Card className="border-0 shadow-xl">
            <CardHeader className="space-y-1 pb-4">
              <CardTitle className="text-2xl">
                {state.step === 'credentials' && 'Welcome back'}
                {state.step === 'mfa' && 'Verify your identity'}
                {state.step === 'tenant_select' && 'Select organization'}
                {state.step === 'success' && 'Welcome!'}
              </CardTitle>
              <CardDescription>
                {state.step === 'credentials' && 'Sign in to access TrialSage'}
                {state.step === 'mfa' && `Signed in as ${state.email}`}
                {state.step === 'tenant_select' && 'Choose an organization to continue'}
                {state.step === 'success' && 'Redirecting to your dashboard...'}
              </CardDescription>
            </CardHeader>

            <CardContent>
              {/* Lockout display */}
              {state.lockoutUntil && new Date() < state.lockoutUntil && (
                <LockoutCountdown
                  lockoutUntil={state.lockoutUntil}
                  onExpire={handleLockoutExpire}
                />
              )}

              {/* Step content */}
              {state.step === 'credentials' && (
                <CredentialsStep
                  state={state}
                  onEmailChange={email => setState(prev => ({ ...prev, email }))}
                  onPasswordChange={password => setState(prev => ({ ...prev, password }))}
                  onSubmit={handleCredentialsSubmit}
                  onForgotPassword={() => setShowForgotPassword(true)}
                  onSSOLogin={handleSSOLogin}
                />
              )}

              {state.step === 'mfa' && (
                <MfaStep
                  state={state}
                  onMethodChange={method =>
                    setState(prev => ({ ...prev, mfaMethod: method, mfaCode: '' }))
                  }
                  onCodeChange={code => setState(prev => ({ ...prev, mfaCode: code }))}
                  onSubmit={handleMfaSubmit}
                  onResendCode={() => authLogger.info('MFA code resend requested')}
                  onBack={() => setState(prev => ({ ...prev, step: 'credentials', mfaCode: '' }))}
                />
              )}

              {state.step === 'tenant_select' && (
                <TenantSelectStep
                  tenants={tenants}
                  selectedTenantId={state.selectedTenantId}
                  onSelect={id => setState(prev => ({ ...prev, selectedTenantId: id }))}
                  onContinue={handleTenantContinue}
                  isLoading={state.isLoading}
                />
              )}

              {state.step === 'success' && (
                <div className="text-center py-8">
                  <div className="mx-auto w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mb-4">
                    <CheckCircle className="h-8 w-8 text-green-600" />
                  </div>
                  <p className="text-lg font-medium">Login Successful</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Redirecting to your dashboard...
                  </p>
                  <Loader2 className="h-6 w-6 animate-spin mx-auto mt-4 text-primary" />
                </div>
              )}
            </CardContent>
          </Card>

          {/* Help link */}
          <div className="mt-6 text-center">
            <Button variant="link" size="sm" onClick={onContactSupport}>
              <HelpCircle className="mr-2 h-4 w-4" />
              Need help? Contact support
            </Button>
          </div>
        </div>
      </div>

      {/* Session warning dialog */}
      <SessionWarningDialog
        open={state.step === 'session_warning'}
        sessionData={state.sessionWarningData}
        onTerminateSession={handleTerminateSession}
        onTerminateAll={handleTerminateAllSessions}
        onCancel={() => setState(prev => ({ ...prev, step: 'credentials' }))}
        isLoading={state.isLoading}
      />

      {/* Forgot password dialog */}
      <ForgotPasswordDialog
        open={showForgotPassword}
        onClose={() => setShowForgotPassword(false)}
        onSubmit={email => {
          authLogger.audit('Password reset requested', { email });
          setShowForgotPassword(false);
        }}
      />
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// FORGOT PASSWORD DIALOG
// ─────────────────────────────────────────────────────────────────────────────

const ForgotPasswordDialog: React.FC<{
  open: boolean;
  onClose: () => void;
  onSubmit: (email: string) => void;
}> = ({ open, onClose, onSubmit }) => {
  const [email, setEmail] = useState('');
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    await new Promise(resolve => setTimeout(resolve, 1000));
    setIsLoading(false);
    setIsSubmitted(true);
    setTimeout(() => {
      onSubmit(email);
      setIsSubmitted(false);
      setEmail('');
    }, 2000);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reset Password</DialogTitle>
          <DialogDescription>
            Enter your email address and we'll send you a link to reset your password.
          </DialogDescription>
        </DialogHeader>

        {!isSubmitted ? (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="reset-email">Email Address</Label>
              <Input
                id="reset-email"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@company.com"
                required
              />
            </div>

            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription>
                For security, password reset links expire after 1 hour. This action is logged per 21
                CFR Part 11.10(e).
              </AlertDescription>
            </Alert>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={!email || isLoading}>
                {isLoading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Mail className="mr-2 h-4 w-4" />
                )}
                Send Reset Link
              </Button>
            </DialogFooter>
          </form>
        ) : (
          <div className="text-center py-6">
            <div className="mx-auto w-12 h-12 rounded-full bg-green-100 flex items-center justify-center mb-4">
              <CheckCircle className="h-6 w-6 text-green-600" />
            </div>
            <p className="font-medium">Check your email</p>
            <p className="text-sm text-muted-foreground mt-1">
              If an account exists for {email}, you'll receive a password reset link shortly.
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default LoginPage;
