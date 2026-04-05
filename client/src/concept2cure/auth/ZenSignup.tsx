/**
 * @fileoverview Zen Signup — Premium account creation
 * @module concept2cure/auth/ZenSignup
 * @version 2.0.0
 *
 * Converged with ZenLogin: same geometry, same governed primitives,
 * same calm/restrained tone. Two steps: Account → Terms → Done.
 */

import React, { useState, useCallback } from 'react';
import { useLocation } from 'wouter';
import { ArrowLeft, Check, Shield } from 'lucide-react';

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

/* ═══════════════════════════════════════════════════════════════════════════════
   TYPES
   ═══════════════════════════════════════════════════════════════════════════════ */

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

/* ═══════════════════════════════════════════════════════════════════════════════
   CONSTANTS
   ═══════════════════════════════════════════════════════════════════════════════ */

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

/* ═══════════════════════════════════════════════════════════════════════════════
   COMPONENT
   ═══════════════════════════════════════════════════════════════════════════════ */

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

  /* ── Form field helper ── */

  const FormField: React.FC<{
    label: string;
    field: keyof FormData;
    type?: string;
    placeholder?: string;
  }> = ({ label, field, type = 'text', placeholder }) => (
    <div className="space-y-1.5">
      <Label htmlFor={field} className="text-[13px] font-medium text-stone-700">
        {label}
      </Label>
      <Input
        id={field}
        type={type}
        value={formData[field] as string}
        onChange={e => updateField(field, e.target.value)}
        placeholder={placeholder}
        className={errors[field] ? 'border-red-300 bg-red-50/30' : ''}
        aria-invalid={!!errors[field]}
        aria-describedby={errors[field] ? `${field}-error` : undefined}
      />
      {errors[field] && (
        <p id={`${field}-error`} className="text-xs text-red-600" role="alert">
          {errors[field]}
        </p>
      )}
    </div>
  );

  /* ═══════════════════════════════════════════════════════════════════════════════
     STEP: ACCOUNT (credentials + organization)
     ═══════════════════════════════════════════════════════════════════════════════ */

  const renderAccountStep = () => (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <FormField label="First name" field="firstName" placeholder="Jane" />
        <FormField label="Last name" field="lastName" placeholder="Smith" />
      </div>
      <FormField label="Work email" field="email" type="email" placeholder="jane@company.com" />
      <FormField label="Job title" field="jobTitle" placeholder="Regulatory Affairs Manager" />
      <div className="grid grid-cols-2 gap-3">
        <FormField label="Password" field="password" type="password" placeholder="Min 12 characters" />
        <FormField label="Confirm" field="confirmPassword" type="password" placeholder="Confirm" />
      </div>

      <div className="pt-2 border-t border-stone-100 space-y-4">
        <FormField label="Organization" field="organization" placeholder="Acme Therapeutics" />

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-[13px] font-medium text-stone-700">Organization type</Label>
            <Select
              value={formData.organizationType}
              onValueChange={v => updateField('organizationType', v)}
            >
              <SelectTrigger className={errors.organizationType ? 'border-red-300' : ''}>
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
              <p className="text-xs text-red-600" role="alert">{errors.organizationType}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label className="text-[13px] font-medium text-stone-700">Primary use case</Label>
            <Select
              value={formData.useCase}
              onValueChange={v => updateField('useCase', v)}
            >
              <SelectTrigger>
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
      </div>

      {errors.general && (
        <div role="alert" className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
          {errors.general}
        </div>
      )}

      <Button onClick={handleNext} className="w-full" size="lg">
        Continue
      </Button>
    </div>
  );

  /* ═══════════════════════════════════════════════════════════════════════════════
     STEP: TERMS (single acceptance)
     ═══════════════════════════════════════════════════════════════════════════════ */

  const renderTermsStep = () => (
    <div className="space-y-6">
      <div className="space-y-4">
        <div className="p-4 bg-stone-50 rounded-lg border border-stone-100 space-y-3">
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
            className="mt-0.5"
            aria-describedby={errors.acceptedTerms ? 'terms-error' : undefined}
          />
          <span className="text-[13px] text-stone-700">
            I accept the Terms of Service, Privacy Policy, and acknowledge compliance requirements
          </span>
        </label>
        {errors.acceptedTerms && (
          <p id="terms-error" className="text-xs text-red-600 ml-7" role="alert">
            {errors.acceptedTerms}
          </p>
        )}
      </div>

      {errors.submit && (
        <div role="alert" className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
          {errors.submit}
        </div>
      )}

      <div className="space-y-3">
        <Button
          onClick={handleSubmit}
          disabled={isLoading || !formData.acceptedTerms}
          className="w-full"
          size="lg"
        >
          {isLoading ? <Spinner className="w-4 h-4" /> : 'Create Account'}
        </Button>

        <Button variant="ghost" onClick={handleBack} className="w-full" size="sm">
          <ArrowLeft className="w-4 h-4 mr-1" />
          Back
        </Button>
      </div>
    </div>
  );

  /* ═══════════════════════════════════════════════════════════════════════════════
     STEP: SUBMITTED (success)
     ═══════════════════════════════════════════════════════════════════════════════ */

  const renderSubmittedStep = () => (
    <div className="text-center space-y-6">
      <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-green-100">
        <Check className="w-6 h-6 text-green-600" />
      </div>

      <div className="space-y-2">
        <h3 className="text-base font-medium text-stone-900">Account Created</h3>
        <p className="text-[13px] text-stone-600">
          Your workspace is ready at <strong>{formData.email}</strong>.
        </p>
      </div>

      <Button
        onClick={() => setLocation('/concept2cure')}
        className="w-full"
        size="lg"
      >
        Open Concept2Cure
      </Button>
    </div>
  );

  /* ═══════════════════════════════════════════════════════════════════════════════
     RENDER — matches ZenLogin geometry
     ═══════════════════════════════════════════════════════════════════════════════ */

  return (
    <div className="min-h-screen bg-[#faf9f5] flex flex-col">
      <div className="flex-1 flex items-center justify-center px-4 sm:px-6 py-8 sm:py-12">
        <div className="w-full max-w-[460px]">
          {/* Logo + header */}
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-stone-800 mb-4">
              <span className="text-xs font-bold text-white tracking-tight">C2C</span>
            </div>
            {step !== 'submitted' && (
              <>
                <h1 className="text-base font-semibold text-stone-900">Create your account</h1>
                <p className="mt-1.5 text-[13px] text-stone-500">
                  Start using Concept2Cure in minutes
                </p>
              </>
            )}
          </div>

          {/* Step indicator */}
          {step !== 'submitted' && (
            <div className="flex items-center justify-center gap-2 mb-6">
              {(['account', 'terms'] as const).map((s, i) => (
                <React.Fragment key={s}>
                  <div
                    className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium transition-colors ${
                      s === step || (step === 'terms' && i === 0)
                        ? 'bg-stone-800 text-white'
                        : 'bg-stone-200 text-stone-400'
                    }`}
                  >
                    {step === 'terms' && i === 0 ? <Check className="w-3.5 h-3.5" /> : i + 1}
                  </div>
                  {i === 0 && (
                    <div className={`w-10 h-0.5 ${step === 'terms' ? 'bg-stone-800' : 'bg-stone-200'}`} />
                  )}
                </React.Fragment>
              ))}
            </div>
          )}

          {/* Form card */}
          <div className="bg-white rounded-xl shadow-sm border border-stone-200 p-6 sm:p-8">
            {step === 'account' && renderAccountStep()}
            {step === 'terms' && renderTermsStep()}
            {step === 'submitted' && renderSubmittedStep()}
          </div>

          {/* Sign in link */}
          {step !== 'submitted' && (
            <p className="mt-6 text-center text-[13px] text-stone-500">
              Already have an account?{' '}
              <button
                onClick={() => setLocation('/concept2cure/login')}
                className="text-stone-700 hover:text-stone-900 font-medium underline underline-offset-2"
              >
                Sign in
              </button>
            </p>
          )}
        </div>
      </div>

      {/* Footer */}
      <footer className="py-4 px-4">
        <div className="flex items-center justify-center gap-2 text-[11px] text-stone-400">
          <Shield className="w-3.5 h-3.5" />
          <span>FDA 21 CFR Part 11 Compliant</span>
          <span className="text-stone-300">·</span>
          <span>© {new Date().getFullYear()} Concept2Cure</span>
        </div>
      </footer>
    </div>
  );
};

export default ZenSignup;
