/**
 * TrialSage Client Portal V2 - Password Reset Flow
 *
 * Secure password reset with:
 * - Email verification with expiring tokens
 * - Password strength enforcement
 * - Audit trail logging per 21 CFR Part 11.10(e)
 * - Multi-step verification for high-security accounts
 *
 * @version 2.0.0
 * @compliance FDA 21 CFR Part 11.10(d), NIST 800-63B
 */

import React, { useState, useCallback, useEffect } from 'react';
import {
  Mail,
  Lock,
  Key,
  Shield,
  ShieldCheck,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Loader2,
  ArrowRight,
  ArrowLeft,
  Eye,
  EyeOff,
  Info,
  Clock,
  HelpCircle,
} from 'lucide-react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

// ─────────────────────────────────────────────────────────────────────────────
// TYPES & INTERFACES
// ─────────────────────────────────────────────────────────────────────────────

type ResetStep = 'request' | 'sent' | 'verify' | 'new_password' | 'complete';

interface PasswordResetState {
  step: ResetStep;
  email: string;
  token: string;
  verificationCode: string;
  newPassword: string;
  confirmPassword: string;
  isLoading: boolean;
  error: string | null;
  tokenExpiry?: Date;
  requiresMfa: boolean;
}

interface PasswordStrength {
  score: number;
  feedback: string[];
  level: 'weak' | 'fair' | 'good' | 'strong';
}

// ─────────────────────────────────────────────────────────────────────────────
// PASSWORD STRENGTH CALCULATOR
// ─────────────────────────────────────────────────────────────────────────────

const calculatePasswordStrength = (password: string): PasswordStrength => {
  const feedback: string[] = [];
  let score = 0;

  if (password.length >= 12) {
    score += 25;
  } else if (password.length >= 8) {
    score += 10;
    feedback.push('Use at least 12 characters for better security');
  } else {
    feedback.push('Password must be at least 8 characters');
  }

  if (/[a-z]/.test(password)) {
    score += 15;
  } else {
    feedback.push('Add lowercase letters');
  }

  if (/[A-Z]/.test(password)) {
    score += 15;
  } else {
    feedback.push('Add uppercase letters');
  }

  if (/\d/.test(password)) {
    score += 15;
  } else {
    feedback.push('Add numbers');
  }

  if (/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
    score += 15;
  } else {
    feedback.push('Add special characters (!@#$%^&*)');
  }

  // Check for common patterns
  if (/(.)\1{2,}/.test(password)) {
    score -= 10;
    feedback.push('Avoid repeated characters');
  }

  if (/^[a-zA-Z]+$/.test(password) || /^\d+$/.test(password)) {
    score -= 10;
    feedback.push('Mix different character types');
  }

  // Bonus for length
  if (password.length >= 16) {
    score += 15;
  }

  score = Math.max(0, Math.min(100, score));

  let level: PasswordStrength['level'];
  if (score >= 80) level = 'strong';
  else if (score >= 60) level = 'good';
  else if (score >= 40) level = 'fair';
  else level = 'weak';

  return { score, feedback, level };
};

const STRENGTH_COLORS = {
  weak: 'bg-red-500',
  fair: 'bg-amber-500',
  good: 'bg-blue-500',
  strong: 'bg-green-500',
};

const STRENGTH_LABELS = {
  weak: 'Weak',
  fair: 'Fair',
  good: 'Good',
  strong: 'Strong',
};

// ─────────────────────────────────────────────────────────────────────────────
// PASSWORD INPUT WITH VISIBILITY TOGGLE
// ─────────────────────────────────────────────────────────────────────────────

const PasswordInput: React.FC<{
  id?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  autoComplete?: string;
  showStrength?: boolean;
}> = ({ id, value, onChange, placeholder, disabled, autoComplete, showStrength }) => {
  const [showPassword, setShowPassword] = useState(false);
  const strength = showStrength ? calculatePasswordStrength(value) : null;

  return (
    <div className="space-y-2">
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
      {showStrength && value && strength && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
              <div
                className={`h-full transition-all duration-300 ${STRENGTH_COLORS[strength.level]}`}
                style={{ width: `${strength.score}%` }}
              />
            </div>
            <span
              className={`text-xs font-medium ${strength.level === 'strong' ? 'text-green-600' : strength.level === 'good' ? 'text-blue-600' : strength.level === 'fair' ? 'text-amber-600' : 'text-red-600'}`}
            >
              {STRENGTH_LABELS[strength.level]}
            </span>
          </div>
          {strength.feedback.length > 0 && (
            <ul className="text-xs text-muted-foreground space-y-0.5">
              {strength.feedback.slice(0, 3).map((tip, i) => (
                <li key={i} className="flex items-center gap-1">
                  <span className="w-1 h-1 rounded-full bg-muted-foreground" />
                  {tip}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// REQUEST RESET STEP
// ─────────────────────────────────────────────────────────────────────────────

const RequestResetStep: React.FC<{
  email: string;
  onEmailChange: (email: string) => void;
  onSubmit: () => void;
  isLoading: boolean;
  error: string | null;
  onBack: () => void;
}> = ({ email, onEmailChange, onSubmit, isLoading, error, onBack }) => {
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="text-center space-y-2">
        <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
          <Key className="h-8 w-8 text-primary" />
        </div>
        <h2 className="text-xl font-semibold">Reset your password</h2>
        <p className="text-sm text-muted-foreground max-w-sm mx-auto">
          Enter your email address and we'll send you instructions to reset your password.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="email">Email Address</Label>
        <div className="relative">
          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            id="email"
            type="email"
            value={email}
            onChange={e => onEmailChange(e.target.value)}
            placeholder="you@company.com"
            disabled={isLoading}
            className="pl-10"
            required
          />
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <XCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription>
          For security, password reset links expire after 1 hour. This request will be logged per
          FDA 21 CFR Part 11.10(e).
        </AlertDescription>
      </Alert>

      <div className="flex gap-3">
        <Button type="button" variant="outline" onClick={onBack} className="flex-1">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Login
        </Button>
        <Button type="submit" disabled={!email || isLoading} className="flex-1">
          {isLoading ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Mail className="mr-2 h-4 w-4" />
          )}
          Send Reset Link
        </Button>
      </div>
    </form>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// EMAIL SENT CONFIRMATION
// ─────────────────────────────────────────────────────────────────────────────

const EmailSentStep: React.FC<{
  email: string;
  onResend: () => void;
  onBack: () => void;
  isLoading: boolean;
}> = ({ email, onResend, onBack, isLoading }) => {
  const [canResend, setCanResend] = useState(false);
  const [countdown, setCountdown] = useState(60);

  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    } else {
      setCanResend(true);
    }
  }, [countdown]);

  const handleResend = () => {
    onResend();
    setCanResend(false);
    setCountdown(60);
  };

  return (
    <div className="text-center space-y-6">
      <div className="mx-auto w-20 h-20 rounded-full bg-green-100 flex items-center justify-center">
        <Mail className="h-10 w-10 text-green-600" />
      </div>

      <div className="space-y-2">
        <h2 className="text-xl font-semibold">Check your email</h2>
        <p className="text-muted-foreground">We sent a password reset link to</p>
        <p className="font-medium">{email}</p>
      </div>

      <div className="p-4 rounded-lg bg-muted/50 text-sm text-muted-foreground">
        <p>Didn't receive the email?</p>
        <ul className="mt-2 text-left max-w-xs mx-auto space-y-1">
          <li>• Check your spam or junk folder</li>
          <li>• Make sure you entered the correct email</li>
          <li>• Contact support if the problem persists</li>
        </ul>
      </div>

      <div className="flex flex-col gap-3">
        <Button variant="outline" onClick={handleResend} disabled={!canResend || isLoading}>
          {isLoading ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : !canResend ? (
            <Clock className="mr-2 h-4 w-4" />
          ) : (
            <Mail className="mr-2 h-4 w-4" />
          )}
          {canResend ? 'Resend Email' : `Resend in ${countdown}s`}
        </Button>
        <Button variant="ghost" onClick={onBack}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Login
        </Button>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// TOKEN VERIFICATION STEP (For high-security accounts)
// ─────────────────────────────────────────────────────────────────────────────

const VerifyTokenStep: React.FC<{
  code: string;
  onCodeChange: (code: string) => void;
  onSubmit: () => void;
  isLoading: boolean;
  error: string | null;
  tokenExpiry?: Date;
}> = ({ code, onCodeChange, onSubmit, isLoading, error, tokenExpiry }) => {
  const [timeRemaining, setTimeRemaining] = useState('');

  useEffect(() => {
    if (!tokenExpiry) return;

    const updateTimer = () => {
      const now = new Date();
      const diff = tokenExpiry.getTime() - now.getTime();
      if (diff <= 0) {
        setTimeRemaining('Expired');
        return;
      }
      const minutes = Math.floor(diff / 60000);
      const seconds = Math.floor((diff % 60000) / 1000);
      setTimeRemaining(`${minutes}:${seconds.toString().padStart(2, '0')}`);
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [tokenExpiry]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="text-center space-y-2">
        <div className="mx-auto w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center">
          <Shield className="h-8 w-8 text-amber-600" />
        </div>
        <h2 className="text-xl font-semibold">Additional Verification Required</h2>
        <p className="text-sm text-muted-foreground">
          Your account has enhanced security. Enter the verification code from your email.
        </p>
      </div>

      {tokenExpiry && timeRemaining !== 'Expired' && (
        <Alert>
          <Clock className="h-4 w-4" />
          <AlertDescription>
            Code expires in <span className="font-mono font-bold">{timeRemaining}</span>
          </AlertDescription>
        </Alert>
      )}

      {timeRemaining === 'Expired' && (
        <Alert variant="destructive">
          <XCircle className="h-4 w-4" />
          <AlertDescription>
            Your verification code has expired. Please request a new password reset.
          </AlertDescription>
        </Alert>
      )}

      <div className="space-y-2">
        <Label>Verification Code</Label>
        <div className="flex gap-2 justify-center">
          {Array.from({ length: 6 }).map((_, i) => (
            <Input
              key={i}
              type="text"
              inputMode="numeric"
              maxLength={1}
              value={code[i] || ''}
              onChange={e => {
                const newCode = code.split('');
                newCode[i] = e.target.value;
                onCodeChange(newCode.join(''));
                if (e.target.value && i < 5) {
                  const next = e.target.nextElementSibling as HTMLInputElement;
                  next?.focus();
                }
              }}
              disabled={isLoading || timeRemaining === 'Expired'}
              className="w-12 h-14 text-center text-xl font-mono"
            />
          ))}
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <XCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Button
        type="submit"
        className="w-full"
        disabled={code.length < 6 || isLoading || timeRemaining === 'Expired'}
      >
        {isLoading ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <CheckCircle className="mr-2 h-4 w-4" />
        )}
        Verify Code
      </Button>
    </form>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// NEW PASSWORD STEP
// ─────────────────────────────────────────────────────────────────────────────

const NewPasswordStep: React.FC<{
  newPassword: string;
  confirmPassword: string;
  onNewPasswordChange: (password: string) => void;
  onConfirmPasswordChange: (password: string) => void;
  onSubmit: () => void;
  isLoading: boolean;
  error: string | null;
}> = ({
  newPassword,
  confirmPassword,
  onNewPasswordChange,
  onConfirmPasswordChange,
  onSubmit,
  isLoading,
  error,
}) => {
  const strength = calculatePasswordStrength(newPassword);
  const passwordsMatch = newPassword === confirmPassword;
  const isValid = strength.score >= 60 && passwordsMatch && newPassword.length >= 8;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isValid) onSubmit();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="text-center space-y-2">
        <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
          <Lock className="h-8 w-8 text-primary" />
        </div>
        <h2 className="text-xl font-semibold">Create new password</h2>
        <p className="text-sm text-muted-foreground">
          Your new password must meet the security requirements below.
        </p>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="new-password">New Password</Label>
          <PasswordInput
            id="new-password"
            value={newPassword}
            onChange={onNewPasswordChange}
            placeholder="Enter new password"
            disabled={isLoading}
            autoComplete="new-password"
            showStrength
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="confirm-password">Confirm Password</Label>
          <PasswordInput
            id="confirm-password"
            value={confirmPassword}
            onChange={onConfirmPasswordChange}
            placeholder="Confirm new password"
            disabled={isLoading}
            autoComplete="new-password"
          />
          {confirmPassword && !passwordsMatch && (
            <p className="text-xs text-destructive flex items-center gap-1">
              <XCircle className="h-3 w-3" />
              Passwords do not match
            </p>
          )}
          {confirmPassword && passwordsMatch && (
            <p className="text-xs text-green-600 flex items-center gap-1">
              <CheckCircle className="h-3 w-3" />
              Passwords match
            </p>
          )}
        </div>
      </div>

      {/* Password Requirements */}
      <div className="rounded-lg border p-4 space-y-3">
        <p className="text-sm font-medium">Password Requirements</p>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <RequirementCheck met={newPassword.length >= 8} label="At least 8 characters" />
          <RequirementCheck met={newPassword.length >= 12} label="12+ characters (recommended)" />
          <RequirementCheck met={/[a-z]/.test(newPassword)} label="Lowercase letter" />
          <RequirementCheck met={/[A-Z]/.test(newPassword)} label="Uppercase letter" />
          <RequirementCheck met={/\d/.test(newPassword)} label="Number" />
          <RequirementCheck
            met={/[!@#$%^&*(),.?":{}|<>]/.test(newPassword)}
            label="Special character"
          />
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <XCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription>
          Per FDA 21 CFR Part 11 requirements, you cannot reuse any of your last 12 passwords. This
          password change will be logged in the audit trail.
        </AlertDescription>
      </Alert>

      <Button type="submit" className="w-full" disabled={!isValid || isLoading}>
        {isLoading ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <ShieldCheck className="mr-2 h-4 w-4" />
        )}
        Reset Password
      </Button>
    </form>
  );
};

const RequirementCheck: React.FC<{ met: boolean; label: string }> = ({ met, label }) => (
  <div className="flex items-center gap-2">
    {met ? (
      <CheckCircle className="h-4 w-4 text-green-600" />
    ) : (
      <XCircle className="h-4 w-4 text-muted-foreground" />
    )}
    <span className={met ? 'text-foreground' : 'text-muted-foreground'}>{label}</span>
  </div>
);

// ─────────────────────────────────────────────────────────────────────────────
// COMPLETION STEP
// ─────────────────────────────────────────────────────────────────────────────

const CompleteStep: React.FC<{
  onContinue: () => void;
}> = ({ onContinue }) => {
  useEffect(() => {
    const timer = setTimeout(onContinue, 3000);
    return () => clearTimeout(timer);
  }, [onContinue]);

  return (
    <div className="text-center space-y-6">
      <div className="mx-auto w-20 h-20 rounded-full bg-green-100 flex items-center justify-center">
        <CheckCircle className="h-10 w-10 text-green-600" />
      </div>

      <div className="space-y-2">
        <h2 className="text-xl font-semibold">Password Reset Complete</h2>
        <p className="text-muted-foreground">
          Your password has been successfully reset. You can now sign in with your new password.
        </p>
      </div>

      <Alert className="text-left">
        <ShieldCheck className="h-4 w-4" />
        <AlertTitle>Security Notice</AlertTitle>
        <AlertDescription>
          For your security, all other active sessions have been terminated. This change has been
          recorded in your account's audit trail.
        </AlertDescription>
      </Alert>

      <Button onClick={onContinue} className="w-full">
        <ArrowRight className="mr-2 h-4 w-4" />
        Continue to Login
      </Button>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// MAIN PASSWORD RESET COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

export const PasswordResetFlow: React.FC<{
  onComplete: () => void;
  onBack: () => void;
  onContactSupport: () => void;
  initialEmail?: string;
  resetToken?: string;
}> = ({ onComplete, onBack, onContactSupport, initialEmail = '', resetToken }) => {
  const [state, setState] = useState<PasswordResetState>({
    step: resetToken ? 'new_password' : 'request',
    email: initialEmail,
    token: resetToken || '',
    verificationCode: '',
    newPassword: '',
    confirmPassword: '',
    isLoading: false,
    error: null,
    requiresMfa: false,
  });

  // Handle reset request
  const handleRequestReset = useCallback(async () => {
    setState(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      // TODO: Replace with actual API call
      await new Promise(r => setTimeout(r, 1000));

      // Simulate API response
      const requiresMfa = false; // Set based on account settings

      setState(prev => ({
        ...prev,
        step: 'sent',
        isLoading: false,
        requiresMfa,
      }));
    } catch (error) {
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: 'Failed to send reset email. Please try again.',
      }));
    }
  }, [state.email]);

  // Handle MFA verification
  const handleVerifyCode = useCallback(async () => {
    setState(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      // TODO: Replace with actual API call
      await new Promise(r => setTimeout(r, 800));

      setState(prev => ({
        ...prev,
        step: 'new_password',
        isLoading: false,
      }));
    } catch (error) {
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: 'Invalid verification code. Please try again.',
        verificationCode: '',
      }));
    }
  }, [state.verificationCode]);

  // Handle password reset
  const handleResetPassword = useCallback(async () => {
    setState(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      // TODO: Replace with actual API call
      await new Promise(r => setTimeout(r, 1200));

      setState(prev => ({
        ...prev,
        step: 'complete',
        isLoading: false,
      }));
    } catch (error) {
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: 'Failed to reset password. The link may have expired.',
      }));
    }
  }, [state.newPassword, state.token]);

  // Handle resend
  const handleResend = useCallback(async () => {
    setState(prev => ({ ...prev, isLoading: true }));
    await new Promise(r => setTimeout(r, 1000));
    setState(prev => ({ ...prev, isLoading: false }));
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex items-center justify-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-lg bg-primary flex items-center justify-center">
            <ShieldCheck className="h-5 w-5 text-white" />
          </div>
          <span className="text-xl font-bold">TrialSage</span>
        </div>

        <Card className="shadow-xl">
          <CardContent className="pt-6">
            {/* Progress indicator */}
            {state.step !== 'complete' && state.step !== 'sent' && (
              <div className="flex gap-1 mb-6">
                {['request', 'verify', 'new_password'].map((step, index) => {
                  const steps = state.requiresMfa
                    ? ['request', 'verify', 'new_password']
                    : ['request', 'new_password'];
                  const currentIndex = steps.indexOf(state.step);
                  return (
                    <div
                      key={step}
                      className={`flex-1 h-1 rounded-full ${
                        currentIndex >= index ? 'bg-primary' : 'bg-muted'
                      }`}
                    />
                  );
                })}
              </div>
            )}

            {/* Step content */}
            {state.step === 'request' && (
              <RequestResetStep
                email={state.email}
                onEmailChange={email => setState(prev => ({ ...prev, email }))}
                onSubmit={handleRequestReset}
                isLoading={state.isLoading}
                error={state.error}
                onBack={onBack}
              />
            )}

            {state.step === 'sent' && (
              <EmailSentStep
                email={state.email}
                onResend={handleResend}
                onBack={onBack}
                isLoading={state.isLoading}
              />
            )}

            {state.step === 'verify' && (
              <VerifyTokenStep
                code={state.verificationCode}
                onCodeChange={code => setState(prev => ({ ...prev, verificationCode: code }))}
                onSubmit={handleVerifyCode}
                isLoading={state.isLoading}
                error={state.error}
                tokenExpiry={state.tokenExpiry}
              />
            )}

            {state.step === 'new_password' && (
              <NewPasswordStep
                newPassword={state.newPassword}
                confirmPassword={state.confirmPassword}
                onNewPasswordChange={pwd => setState(prev => ({ ...prev, newPassword: pwd }))}
                onConfirmPasswordChange={pwd =>
                  setState(prev => ({ ...prev, confirmPassword: pwd }))
                }
                onSubmit={handleResetPassword}
                isLoading={state.isLoading}
                error={state.error}
              />
            )}

            {state.step === 'complete' && <CompleteStep onContinue={onComplete} />}
          </CardContent>
        </Card>

        {/* Help link */}
        <div className="mt-6 text-center">
          <Button variant="link" size="sm" onClick={onContactSupport}>
            <HelpCircle className="mr-2 h-4 w-4" />
            Need help? Contact support
          </Button>
        </div>

        {/* Compliance footer */}
        <div className="mt-4 text-center text-xs text-muted-foreground">
          <p>FDA 21 CFR Part 11 Compliant • SOC 2 Type II</p>
        </div>
      </div>
    </div>
  );
};

export default PasswordResetFlow;
