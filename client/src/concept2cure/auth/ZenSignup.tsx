/**
 * @fileoverview Zen Signup — Premium account creation
 * @module concept2cure/auth/ZenSignup
 * @version 3.0.0
 *
 * Matches ZenLogin geometry: split-panel with dark brand left + form right.
 * Two steps: Account → Terms → Done. Governed primitives throughout.
 */

import React, { useState, useCallback } from 'react';
import { useLocation } from 'wouter';
import { ArrowLeft, Check, Shield, Eye, EyeOff, CheckCircle2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

/* ════��═══════════════════════��══════════════════════════════════════════════════
   TYPES
   ═══��═══════════════════════���══════════════════════════���════════════════════════ */

type SignupStep = 'account' | 'terms' | 'submitted';

interface FormData {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  confirmPassword: string;
  jobTitle: string;
  organization: string;
  organizationType: string;
  useCase: string;
  acceptedTerms: boolean;
}

/* ══���═════════════════════════��═════════════════════════════════���════════════════
   CONSTANTS
   ═══���══════════════════��══════════════════��═════════════════════════════════════ */

const ORGANIZATION_TYPES = [
  { value: 'pharma', label: 'Pharmaceutical' },
  { value: 'biotech', label: 'Biotechnology' },
  { value: 'meddevice', label: 'Medical Device' },
  { value: 'cro', label: 'CRO' },
  { value: 'consulting', label: 'Regulatory Consulting' },
  { value: 'academic', label: 'Academic / Research' },
  { value: 'other', label: 'Other' },
];

const USE_CASES = [
  { value: 'ind', label: 'IND Applications' },
  { value: 'nda', label: 'NDA / BLA Submissions' },
  { value: '510k', label: '510(k) Submissions' },
  { value: 'pma', label: 'PMA Submissions' },
  { value: 'cer', label: 'Clinical Evaluation Reports' },
  { value: 'cmc', label: 'CMC Documentation' },
  { value: 'ectd', label: 'eCTD Compilation' },
  { value: 'multiple', label: 'Multiple Regulatory Activities' },
];

const INDUSTRY_MODE_MAP: Record<string, string> = {
  pharma: 'pharma',
  biotech: 'biotech',
  meddevice: 'medtech',
  cro: 'cro',
  consulting: 'regulatory',
  academic: 'academic',
  other: 'medical_writing',
};

/* ══════════════════════════════════════════��════════════════════════════════════
   PASSWORD FIELD — matches ZenLogin PasswordField exactly
   ══════════════════════��════════════════════════════════════════════════════════ */

const PasswordField: React.FC<{
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  autoComplete?: string;
  disabled?: boolean;
}> = ({ id, label, value, onChange, placeholder, autoComplete, disabled }) => {
  const [show, setShow] = useState(false);
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Label htmlFor={id} className="text-[12px] font-medium text-stone-600">
          {label}
        </Label>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-auto px-1.5 py-0.5 text-[11px] text-stone-400 hover:text-stone-700 gap-1"
          onClick={() => setShow(v => !v)}
          tabIndex={-1}
          aria-label={show ? 'Hide password' : 'Show password'}
        >
          {show ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
          {show ? 'Hide' : 'Show'}
        </Button>
      </div>
      <Input
        id={id}
        type={show ? 'text' : 'password'}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        disabled={disabled}
        className="h-[44px] rounded-[10px] border-stone-200 bg-white px-3.5 text-[14px] placeholder:text-stone-300 focus-visible:ring-1 focus-visible:ring-stone-300 focus-visible:border-stone-300 transition-shadow"
      />
    </div>
  );
};

/* ═════════════════════════════════���════════════════════════════��════════════════
   COMPONENT
   ════════���══════════════��══════════════════════════════════��════════════════════ */

export const ZenSignup: React.FC = () => {
  const [, setLocation] = useLocation();

  const [step, setStep] = useState<SignupStep>('account');
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [formData, setFormData] = useState<FormData>({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    confirmPassword: '',
    jobTitle: '',
    organization: '',
    organizationType: '',
    useCase: '',
    acceptedTerms: false,
  });

  const updateField = useCallback((field: keyof FormData, value: string | boolean) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    setErrors(prev => {
      const next = { ...prev };
      delete next[field];
      return next;
    });
  }, []);

  /* ── Validation ── */

  const validateAccount = useCallback((): boolean => {
    const errs: Record<string, string> = {};

    if (!formData.firstName.trim()) errs.firstName = 'Required';
    if (!formData.lastName.trim()) errs.lastName = 'Required';
    if (!formData.email.trim()) {
      errs.email = 'Required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      errs.email = 'Invalid email';
    }
    if (!formData.password) {
      errs.password = 'Required';
    } else if (formData.password.length < 12) {
      errs.password = 'Minimum 12 characters';
    }
    if (formData.password !== formData.confirmPassword) {
      errs.confirmPassword = 'Passwords do not match';
    }
    if (!formData.organization.trim()) errs.organization = 'Required';
    if (!formData.organizationType) errs.organizationType = 'Required';

    setErrors(errs);
    return Object.keys(errs).length === 0;
  }, [formData]);

  const validateTerms = useCallback((): boolean => {
    if (!formData.acceptedTerms) {
      setErrors({ acceptedTerms: 'You must accept the terms to continue' });
      return false;
    }
    setErrors({});
    return true;
  }, [formData.acceptedTerms]);

  /* ── Navigation ── */

  const handleNext = useCallback(() => {
    if (step === 'account' && validateAccount()) {
      setStep('terms');
    }
  }, [step, validateAccount]);

  const handleBack = useCallback(() => {
    if (step === 'terms') setStep('account');
  }, [step]);

  /* ── Submit ── */

  const handleSubmit = useCallback(async () => {
    if (!validateTerms()) return;

    setIsLoading(true);
    try {
      const response = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: formData.email,
          password: formData.password,
          companyName: formData.organization,
          industryMode: INDUSTRY_MODE_MAP[formData.organizationType] || 'biotech',
          firstName: formData.firstName,
          lastName: formData.lastName,
          jobTitle: formData.jobTitle,
          organizationType: formData.organizationType,
          useCase: formData.useCase,
        }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error?.message || 'Signup failed');
      }

      const data = await response.json();
      if (data.token) {
        localStorage.setItem('token', data.token);
      }

      setStep('submitted');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Signup failed. Please try again.';
      setErrors({ submit: message });
    } finally {
      setIsLoading(false);
    }
  }, [validateTerms, formData]);

  /* ── Inline input helper ── */

  const FormInput: React.FC<{
    label: string;
    field: keyof FormData;
    type?: string;
    placeholder?: string;
    autoFocus?: boolean;
  }> = ({ label, field, type = 'text', placeholder, autoFocus }) => (
    <div className="space-y-1.5">
      <Label htmlFor={field} className="text-[12px] font-medium text-stone-600">
        {label}
      </Label>
      <Input
        id={field}
        type={type}
        value={formData[field] as string}
        onChange={e => updateField(field, e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        className={`h-[44px] rounded-[10px] border-stone-200 bg-white px-3.5 text-[14px] placeholder:text-stone-300 focus-visible:ring-1 focus-visible:ring-stone-300 focus-visible:border-stone-300 transition-shadow ${
          errors[field] ? 'border-red-300 bg-red-50/30' : ''
        }`}
        aria-invalid={!!errors[field]}
        aria-describedby={errors[field] ? `${field}-error` : undefined}
      />
      {errors[field] && (
        <p id={`${field}-error`} className="text-[11px] text-red-600" role="alert">
          {errors[field]}
        </p>
      )}
    </div>
  );

  /* ═══════════════════════════════════════════════════════════════════════════════
     STEP: ACCOUNT (credentials + organization)
     ═════════════════���═════════════════════════════════���═══════════════════════════ */

  const renderAccountStep = () => (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <FormInput label="First name" field="firstName" placeholder="Jane" autoFocus />
        <FormInput label="Last name" field="lastName" placeholder="Smith" />
      </div>
      <FormInput label="Work email" field="email" type="email" placeholder="jane@company.com" />

      <div className="grid grid-cols-2 gap-3">
        <PasswordField
          id="signup-password"
          label="Password"
          value={formData.password}
          onChange={v => updateField('password', v)}
          placeholder="Min 12 characters"
          autoComplete="new-password"
          disabled={isLoading}
        />
        <PasswordField
          id="signup-confirm"
          label="Confirm"
          value={formData.confirmPassword}
          onChange={v => updateField('confirmPassword', v)}
          placeholder="Confirm"
          autoComplete="new-password"
          disabled={isLoading}
        />
      </div>
      {(errors.password || errors.confirmPassword) && (
        <p className="text-[11px] text-red-600" role="alert">
          {errors.password || errors.confirmPassword}
        </p>
      )}

      {/* OR divider */}
      <div className="relative flex items-center py-0.5">
        <div className="flex-1 border-t border-stone-100" />
        <span className="mx-4 text-[11px] font-medium uppercase tracking-wider text-stone-300 select-none">
          organization
        </span>
        <div className="flex-1 border-t border-stone-100" />
      </div>

      <FormInput label="Organization" field="organization" placeholder="Acme Therapeutics" />
      <FormInput label="Job title" field="jobTitle" placeholder="Regulatory Affairs Manager" />

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-[12px] font-medium text-stone-600">Organization type</Label>
          <Select
            value={formData.organizationType}
            onValueChange={v => updateField('organizationType', v)}
          >
            <SelectTrigger
              className={`h-[44px] rounded-[10px] border-stone-200 bg-white text-[14px] focus:ring-1 focus:ring-stone-300 ${
                errors.organizationType ? 'border-red-300' : ''
              }`}
            >
              <SelectValue placeholder="Select..." />
            </SelectTrigger>
            <SelectContent>
              {ORGANIZATION_TYPES.map(opt => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errors.organizationType && (
            <p className="text-[11px] text-red-600" role="alert">{errors.organizationType}</p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label className="text-[12px] font-medium text-stone-600">Primary use case</Label>
          <Select
            value={formData.useCase}
            onValueChange={v => updateField('useCase', v)}
          >
            <SelectTrigger className="h-[44px] rounded-[10px] border-stone-200 bg-white text-[14px] focus:ring-1 focus:ring-stone-300">
              <SelectValue placeholder="Optional" />
            </SelectTrigger>
            <SelectContent>
              {USE_CASES.map(opt => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {errors.general && (
        <div role="alert" className="flex items-start gap-2.5 rounded-[10px] border border-red-100 bg-red-50/60 px-3.5 py-3">
          <p className="text-[13px] leading-snug text-red-600">{errors.general}</p>
        </div>
      )}

      <Button
        onClick={handleNext}
        disabled={isLoading}
        className="h-[44px] w-full rounded-[10px] bg-stone-900 text-[13px] font-semibold text-white shadow-sm hover:bg-stone-800 active:bg-stone-950 transition-all mt-1"
      >
        Continue
      </Button>
    </div>
  );

  /* ═══════════════════════════════════════════════════════════════════════════════
     STEP: TERMS (single acceptance)
     ��═══════════════���═══════════════════════════════════���═════════════════════════��� */

  const renderTermsStep = () => (
    <div className="space-y-6">
      <div className="p-4 bg-stone-50/60 rounded-[10px] border border-stone-100 space-y-3">
        <p className="text-[13px] text-stone-700 leading-relaxed">
          By creating an account, you agree to the{' '}
          <a href="/concept2cure/legal/terms" className="text-stone-900 underline underline-offset-2 font-medium" target="_blank" rel="noopener">
            Terms of Service
          </a>{' '}
          and{' '}
          <a href="/concept2cure/legal/privacy" className="text-stone-900 underline underline-offset-2 font-medium" target="_blank" rel="noopener">
            Privacy Policy
          </a>
          . You acknowledge that AI-generated content requires qualified human review before
          regulatory submission. Your content is not used for AI model training.
        </p>

        <div className="flex items-center gap-2 pt-2 border-t border-stone-200">
          <Shield className="w-4 h-4 text-stone-400 shrink-0" />
          <p className="text-[11px] text-stone-500">
            21 CFR Part 11 compliant · AES-256 encryption · SOC 2 Type II
          </p>
        </div>
      </div>

      <label className="flex items-start gap-3 cursor-pointer">
        <Checkbox
          checked={formData.acceptedTerms}
          onCheckedChange={(checked: boolean) => updateField('acceptedTerms', checked)}
          className="mt-0.5 h-3.5 w-3.5 rounded-[4px] border-stone-300 data-[state=checked]:bg-stone-900 data-[state=checked]:border-stone-900"
          aria-describedby={errors.acceptedTerms ? 'terms-error' : undefined}
        />
        <span className="text-[13px] text-stone-700">
          I accept the Terms of Service, Privacy Policy, and acknowledge compliance requirements
        </span>
      </label>
      {errors.acceptedTerms && (
        <p id="terms-error" className="text-[11px] text-red-600 ml-7" role="alert">
          {errors.acceptedTerms}
        </p>
      )}

      {errors.submit && (
        <div role="alert" className="flex items-start gap-2.5 rounded-[10px] border border-red-100 bg-red-50/60 px-3.5 py-3">
          <p className="text-[13px] leading-snug text-red-600">{errors.submit}</p>
        </div>
      )}

      <Button
        onClick={handleSubmit}
        disabled={isLoading || !formData.acceptedTerms}
        className="h-[44px] w-full rounded-[10px] bg-stone-900 text-[13px] font-semibold text-white shadow-sm hover:bg-stone-800 active:bg-stone-950 transition-all"
      >
        {isLoading ? <Spinner size="sm" className="mr-2" /> : null}
        Create Account
      </Button>

      <Button
        variant="ghost"
        onClick={handleBack}
        className="h-auto w-full px-0 py-0 text-[12px] text-stone-400 hover:text-stone-700 gap-1.5"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Back to account details
      </Button>
    </div>
  );

  /* ══���════════════════════════════════════════════════════════��═══════════════════
     STEP: SUBMITTED (success)
     ═════════════════��═════════════════════════════��═══════════════════════════════ */

  const renderSubmittedStep = () => (
    <div className="flex flex-col items-center pt-6">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 mb-4">
        <CheckCircle2 className="h-6 w-6 text-emerald-500" />
      </div>
      <h2 className="text-[22px] font-semibold tracking-[-0.01em] text-stone-900">
        Welcome to Concept2Cure
      </h2>
      <p className="mt-1.5 text-[13px] text-stone-400 text-center">
        Your workspace is ready at <strong className="text-stone-600">{formData.email}</strong>
      </p>
      <Button
        onClick={() => setLocation('/concept2cure')}
        className="h-[44px] w-full rounded-[10px] bg-stone-900 text-[13px] font-semibold text-white shadow-sm hover:bg-stone-800 active:bg-stone-950 transition-all mt-8"
      >
        Open Concept2Cure
      </Button>
      <div className="flex items-center gap-2 text-[13px] text-stone-400 mt-4">
        <Spinner size="sm" />
        Redirecting...
      </div>
    </div>
  );

  /* ���════════════════════════��═════════════════════════════════════════════════════
     RENDER — matches ZenLogin split-panel geometry
     ═════════════��═════════════════════════════════��═══════════════════════���═══════ */

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-[#f5f4f1] font-sans antialiased text-stone-900 p-0 sm:p-6 lg:p-10">
      {/* ── Auth Shell — locked geometry (matches ZenLogin) ──────────────── */}
      <div className="flex w-full max-w-[1160px] min-h-[700px] max-h-[820px] overflow-hidden bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04),0_8px_30px_rgba(0,0,0,0.06)] sm:rounded-2xl flex-col lg:flex-row">
        {/* ── LEFT PANEL — Restrained dark brand (40%) ───────────────────── */}
        <div className="relative hidden lg:flex w-[40%] shrink-0 flex-col justify-center bg-stone-950 p-14 overflow-hidden">
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.03]"
            style={{
              backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)',
              backgroundSize: '24px 24px',
            }}
          />
          <div className="relative z-10">
            <h1 className="text-[40px] font-semibold tracking-[-0.02em] leading-[1.1] text-white">
              AnA 1.0 RI
            </h1>
            <p className="mt-4 max-w-[260px] text-[15px] leading-relaxed text-stone-400">
              Regulatory intelligence for governed document work.
            </p>

            {/* Step progress — visible in brand panel */}
            {step !== 'submitted' && (
              <div className="mt-12 space-y-3">
                {[
                  { key: 'account', label: 'Account & Organization' },
                  { key: 'terms', label: 'Terms & Compliance' },
                ].map((s, i) => {
                  const isActive = s.key === step;
                  const isDone = step === 'terms' && i === 0;
                  return (
                    <div key={s.key} className="flex items-center gap-3">
                      <div
                        className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-medium transition-colors ${
                          isDone
                            ? 'bg-emerald-500 text-white'
                            : isActive
                              ? 'bg-white text-stone-900'
                              : 'bg-stone-800 text-stone-500'
                        }`}
                      >
                        {isDone ? <Check className="w-3 h-3" /> : i + 1}
                      </div>
                      <span
                        className={`text-[13px] ${
                          isActive || isDone ? 'text-white' : 'text-stone-600'
                        }`}
                      >
                        {s.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* ── RIGHT PANEL — Form (60%) ───────────────────────────────────── */}
        <div className="flex flex-1 flex-col justify-center px-6 sm:px-14 lg:px-16 py-10 lg:py-0 overflow-y-auto">
          <div className="mx-auto w-full max-w-[380px]">
            {/* ── Header ───────────────────────────────────────────────── */}
            <div className="mb-6">
              {step === 'account' && (
                <>
                  <h2 className="text-[22px] font-semibold tracking-[-0.01em] text-stone-900">
                    Create your account
                  </h2>
                  <p className="mt-1.5 text-[13px] text-stone-400">
                    Already have an account?{' '}
                    <Button
                      type="button"
                      variant="link"
                      className="h-auto p-0 text-[13px] font-medium text-stone-700 hover:text-stone-900 underline underline-offset-2 decoration-stone-300 hover:decoration-stone-500"
                      onClick={() => setLocation('/concept2cure/login')}
                    >
                      Sign in
                    </Button>
                  </p>
                </>
              )}
              {step === 'terms' && (
                <>
                  <h2 className="text-[22px] font-semibold tracking-[-0.01em] text-stone-900">
                    Review & accept
                  </h2>
                  <p className="mt-1.5 text-[13px] text-stone-400 leading-relaxed">
                    One last step before your workspace is ready.
                  </p>
                </>
              )}

              {/* Mobile-only step indicator (hidden on lg where brand panel shows steps) */}
              {step !== 'submitted' && (
                <div className="flex items-center gap-2 mt-4 lg:hidden">
                  {(['account', 'terms'] as const).map((s, i) => {
                    const isActive = s === step;
                    const isDone = step === 'terms' && i === 0;
                    return (
                      <React.Fragment key={s}>
                        <div
                          className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-medium transition-colors ${
                            isDone
                              ? 'bg-emerald-500 text-white'
                              : isActive
                                ? 'bg-stone-900 text-white'
                                : 'bg-stone-200 text-stone-400'
                          }`}
                        >
                          {isDone ? <Check className="w-3 h-3" /> : i + 1}
                        </div>
                        {i === 0 && (
                          <div className={`w-8 h-0.5 ${step === 'terms' ? 'bg-stone-900' : 'bg-stone-200'}`} />
                        )}
                      </React.Fragment>
                    );
                  })}
                </div>
              )}
            </div>

            {/* ── Form content ─────────────────────────────────────────── */}
            {step === 'account' && renderAccountStep()}
            {step === 'terms' && renderTermsStep()}
            {step === 'submitted' && renderSubmittedStep()}

            {/* ── Footer ─────────────────────────────────────────────── */}
            {step !== 'submitted' && (
              <div className="mt-8 pt-5 border-t border-stone-100">
                <p className="text-[11px] text-stone-300 text-center leading-relaxed">
                  By creating an account, you agree to our{' '}
                  <a
                    href="/concept2cure/legal/terms"
                    className="underline underline-offset-2 hover:text-stone-500 transition-colors"
                    target="_blank"
                    rel="noopener"
                  >
                    Terms
                  </a>{' '}
                  and{' '}
                  <a
                    href="/concept2cure/legal/privacy"
                    className="underline underline-offset-2 hover:text-stone-500 transition-colors"
                    target="_blank"
                    rel="noopener"
                  >
                    Privacy Policy
                  </a>
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
