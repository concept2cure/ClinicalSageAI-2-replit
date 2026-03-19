/**
 * @fileoverview Zen Signup / Request Access Page
 * @module concept2cure/auth/ZenSignup
 * @version 1.0.0
 *
 * @description
 * Minimalist signup flow for requesting access to Concept2Cure.
 * Includes organization information and compliance acknowledgments.
 */

import React, { useState, useCallback } from 'react';
import { useLocation } from 'wouter';
import { motion, AnimatePresence } from 'framer-motion';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

type SignupStep = 'info' | 'organization' | 'compliance' | 'submitted';

interface FormData {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  confirmPassword: string;
  jobTitle: string;
  organization: string;
  organizationType: string;
  country: string;
  useCase: string;
  acceptedTerms: boolean;
  acceptedPrivacy: boolean;
  acceptedCompliance: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════════
// ICONS
// ═══════════════════════════════════════════════════════════════════════════════

const LogoIcon = () => (
  <div className="relative w-10 h-10 rounded-xl overflow-hidden shadow-sm">
    <img
      src="/src/assets/concept2cure-logo.jpg"
      alt="Concept2Cure"
      className="w-full h-full object-cover object-center"
    />
    <div
      className="absolute inset-0 pointer-events-none"
      style={{ background: 'radial-gradient(circle at center, transparent 40%, #faf9f5 100%)' }}
    />
  </div>
);

const ArrowLeftIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
  </svg>
);

const ArrowRightIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
  </svg>
);

const CheckIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
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

// ═══════════════════════════════════════════════════════════════════════════════
// ANIMATION VARIANTS
// ═══════════════════════════════════════════════════════════════════════════════

const inputVariants = {
  initial: { opacity: 0, x: 20 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -20 },
};

// ═══════════════════════════════════════════════════════════════════════════════
// ORGANIZATION TYPES
// ═══════════════════════════════════════════════════════════════════════════════

const ORGANIZATION_TYPES = [
  { value: 'pharma', label: 'Pharmaceutical Company' },
  { value: 'biotech', label: 'Biotechnology Company' },
  { value: 'meddevice', label: 'Medical Device Company' },
  { value: 'cro', label: 'Contract Research Organization (CRO)' },
  { value: 'consulting', label: 'Regulatory Consulting' },
  { value: 'academic', label: 'Academic/Research Institution' },
  { value: 'government', label: 'Government/Regulatory Agency' },
  { value: 'other', label: 'Other' },
];

const USE_CASES = [
  { value: '510k', label: '510(k) Submissions' },
  { value: 'pma', label: 'PMA Submissions' },
  { value: 'ind', label: 'IND Applications' },
  { value: 'nda', label: 'NDA/BLA Submissions' },
  { value: 'cer', label: 'Clinical Evaluation Reports' },
  { value: 'cmc', label: 'CMC Documentation' },
  { value: 'ectd', label: 'eCTD Compilation' },
  { value: 'multiple', label: 'Multiple Regulatory Activities' },
];

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export const ZenSignup: React.FC = () => {
  const [, setLocation] = useLocation();

  const [step, setStep] = useState<SignupStep>('info');
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
    country: '',
    useCase: '',
    acceptedTerms: false,
    acceptedPrivacy: false,
    acceptedCompliance: false,
  });

  const updateField = useCallback((field: keyof FormData, value: string | boolean) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    setErrors(prev => ({ ...prev, [field]: '' }));
  }, []);

  const validateStep = useCallback(
    (currentStep: SignupStep): boolean => {
      const newErrors: Record<string, string> = {};

      if (currentStep === 'info') {
        if (!formData.firstName.trim()) newErrors.firstName = 'First name is required';
        if (!formData.lastName.trim()) newErrors.lastName = 'Last name is required';
        if (!formData.email.trim()) {
          newErrors.email = 'Email is required';
        } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
          newErrors.email = 'Please enter a valid email address';
        }
        if (!formData.jobTitle.trim()) newErrors.jobTitle = 'Job title is required';
        if (!formData.password) newErrors.password = 'Password is required';
        if (formData.password && formData.password.length < 8) {
          newErrors.password = 'Password must be at least 8 characters';
        }
        if (formData.password !== formData.confirmPassword) {
          newErrors.confirmPassword = 'Passwords do not match';
        }
      }

      if (currentStep === 'organization') {
        if (!formData.organization.trim()) newErrors.organization = 'Organization name is required';
        if (!formData.organizationType)
          newErrors.organizationType = 'Please select an organization type';
        if (!formData.country.trim()) newErrors.country = 'Country is required';
        if (!formData.useCase) newErrors.useCase = 'Please select a primary use case';
      }

      if (currentStep === 'compliance') {
        if (!formData.acceptedTerms)
          newErrors.acceptedTerms = 'You must accept the Terms of Service';
        if (!formData.acceptedPrivacy)
          newErrors.acceptedPrivacy = 'You must accept the Privacy Policy';
        if (!formData.acceptedCompliance)
          newErrors.acceptedCompliance = 'You must acknowledge compliance requirements';
      }

      setErrors(newErrors);
      return Object.keys(newErrors).length === 0;
    },
    [formData]
  );

  const handleNext = useCallback(() => {
    if (step === 'info' && validateStep('info')) {
      setStep('organization');
    } else if (step === 'organization' && validateStep('organization')) {
      setStep('compliance');
    }
  }, [step, validateStep]);

  const handleBack = useCallback(() => {
    if (step === 'organization') setStep('info');
    if (step === 'compliance') setStep('organization');
  }, [step]);

  const handleSubmit = useCallback(async () => {
    if (!validateStep('compliance')) return;

    setIsLoading(true);

    try {
      const industryModeMap: Record<string, string> = {
        pharma: 'pharma',
        biotech: 'biotech',
        meddevice: 'medtech',
        cro: 'cro',
        consulting: 'regulatory',
        academic: 'academic',
        government: 'regulatory',
        other: 'medical_writing',
      };

      const response = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: formData.email,
          password: formData.password,
          companyName: formData.organization,
          industryMode: industryModeMap[formData.organizationType] || 'biotech',
          firstName: formData.firstName,
          lastName: formData.lastName,
        }),
      });

      if (!response.ok) {
        const errorBody = await response.json().catch(() => null);
        throw new Error(errorBody?.error?.message || 'Signup failed');
      }

      await response.json();
      setStep('submitted');
    } catch (error) {
      console.error('Signup error:', error);
    } finally {
      setIsLoading(false);
    }
  }, [validateStep]);

  // ─────────────────────────────────────────────────────────────────────────────
  // Progress indicator
  // ─────────────────────────────────────────────────────────────────────────────

  const steps = ['info', 'organization', 'compliance'] as const;
  const currentStepIndex = steps.indexOf(step as (typeof steps)[number]);

  const renderProgress = () => (
    <div className="flex items-center justify-center gap-2 mb-8">
      {steps.map((s, index) => (
        <React.Fragment key={s}>
          <div
            className={`
              w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium
              transition-all duration-300
              ${index <= currentStepIndex ? 'bg-blue-600 text-white' : 'bg-zinc-200 text-zinc-500'}
            `}
          >
            {index < currentStepIndex ? <CheckIcon /> : index + 1}
          </div>
          {index < steps.length - 1 && (
            <div
              className={`
                w-12 h-0.5 transition-all duration-300
                ${index < currentStepIndex ? 'bg-blue-600' : 'bg-zinc-200'}
              `}
            />
          )}
        </React.Fragment>
      ))}
    </div>
  );

  // ─────────────────────────────────────────────────────────────────────────────
  // Form input component
  // ─────────────────────────────────────────────────────────────────────────────

  const FormInput: React.FC<{
    label: string;
    field: keyof FormData;
    type?: string;
    placeholder?: string;
  }> = ({ label, field, type = 'text', placeholder }) => (
    <div className="space-y-1">
      <label htmlFor={field} className="block text-sm font-medium text-zinc-700">
        {label}
      </label>
      <input
        id={field}
        type={type}
        value={formData[field] as string}
        onChange={e => updateField(field, e.target.value)}
        placeholder={placeholder}
        className={`
          w-full px-4 py-3 text-base
          border-2 rounded-xl
          transition-all duration-200
          focus:outline-none focus:ring-0
          ${
            errors[field]
              ? 'border-red-300 bg-red-50 focus:border-red-500'
              : 'border-zinc-200 bg-white focus:border-blue-500 focus:shadow-[0_0_0_3px_rgba(217,119,87,0.1)]'
          }
        `}
      />
      {errors[field] && <p className="text-sm text-red-600">{errors[field]}</p>}
    </div>
  );

  const FormSelect: React.FC<{
    label: string;
    field: keyof FormData;
    options: { value: string; label: string }[];
    placeholder?: string;
  }> = ({ label, field, options, placeholder }) => (
    <div className="space-y-1">
      <label htmlFor={field} className="block text-sm font-medium text-zinc-700">
        {label}
      </label>
      <select
        id={field}
        value={formData[field] as string}
        onChange={e => updateField(field, e.target.value)}
        className={`
          w-full px-4 py-3 text-base
          border-2 rounded-xl
          transition-all duration-200
          focus:outline-none focus:ring-0
          appearance-none
          bg-white
          ${
            errors[field]
              ? 'border-red-300 bg-red-50 focus:border-red-500'
              : 'border-zinc-200 focus:border-blue-500 focus:shadow-[0_0_0_3px_rgba(217,119,87,0.1)]'
          }
        `}
        style={{
          backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")`,
          backgroundPosition: 'right 0.75rem center',
          backgroundRepeat: 'no-repeat',
          backgroundSize: '1.5em 1.5em',
        }}
      >
        <option value="">{placeholder || 'Select...'}</option>
        {options.map(opt => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      {errors[field] && <p className="text-sm text-red-600">{errors[field]}</p>}
    </div>
  );

  // ─────────────────────────────────────────────────────────────────────────────
  // Step renders
  // ─────────────────────────────────────────────────────────────────────────────

  const renderInfoStep = () => (
    <motion.div
      key="info"
      variants={inputVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      className="space-y-5"
    >
      <div className="grid grid-cols-2 gap-4">
        <FormInput label="First name" field="firstName" placeholder="Jane" />
        <FormInput label="Last name" field="lastName" placeholder="Smith" />
      </div>
      <FormInput label="Work email" field="email" type="email" placeholder="jane@company.com" />
      <FormInput
        label="Password"
        field="password"
        type="password"
        placeholder="Create a password"
      />
      <FormInput
        label="Confirm password"
        field="confirmPassword"
        type="password"
        placeholder="Confirm password"
      />
      <FormInput label="Job title" field="jobTitle" placeholder="Regulatory Affairs Manager" />

      <button
        onClick={handleNext}
        className={`
          w-full py-3 px-4 mt-2
          flex items-center justify-center gap-2
          text-base font-medium text-white
          bg-blue-600 hover:bg-blue-700
          rounded-xl
          transition-all duration-200
          focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
        `}
      >
        Continue
        <ArrowRightIcon />
      </button>
    </motion.div>
  );

  const renderOrganizationStep = () => (
    <motion.div
      key="organization"
      variants={inputVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      className="space-y-5"
    >
      <button
        onClick={handleBack}
        className="flex items-center gap-2 text-sm text-zinc-600 hover:text-zinc-800 mb-2"
      >
        <ArrowLeftIcon />
        Back
      </button>

      <FormInput label="Organization name" field="organization" placeholder="Acme Pharma Inc." />
      <FormSelect
        label="Organization type"
        field="organizationType"
        options={ORGANIZATION_TYPES}
        placeholder="Select organization type"
      />
      <FormInput label="Country" field="country" placeholder="United States" />
      <FormSelect
        label="Primary use case"
        field="useCase"
        options={USE_CASES}
        placeholder="Select primary use case"
      />

      <button
        onClick={handleNext}
        className={`
          w-full py-3 px-4 mt-2
          flex items-center justify-center gap-2
          text-base font-medium text-white
          bg-blue-600 hover:bg-blue-700
          rounded-xl
          transition-all duration-200
          focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
        `}
      >
        Continue
        <ArrowRightIcon />
      </button>
    </motion.div>
  );

  const renderComplianceStep = () => (
    <motion.div
      key="compliance"
      variants={inputVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      className="space-y-5"
    >
      <button
        onClick={handleBack}
        className="flex items-center gap-2 text-sm text-zinc-600 hover:text-zinc-800 mb-2"
      >
        <ArrowLeftIcon />
        Back
      </button>

      <div className="space-y-4">
        <div className="p-4 bg-zinc-50 rounded-xl border border-zinc-200">
          <h4 className="font-medium text-zinc-900 mb-2">Compliance Acknowledgments</h4>
          <p className="text-sm text-zinc-600">
            Concept2Cure is designed for regulated industries and maintains strict compliance with
            FDA 21 CFR Part 11 requirements for electronic records and signatures.
          </p>
        </div>

        {/* Checkboxes */}
        <label
          className={`
          flex items-start gap-3 p-3 rounded-lg cursor-pointer
          transition-colors hover:bg-zinc-50
          ${errors.acceptedTerms ? 'bg-red-50' : ''}
        `}
        >
          <input
            type="checkbox"
            checked={formData.acceptedTerms}
            onChange={e => updateField('acceptedTerms', e.target.checked)}
            className="w-5 h-5 mt-0.5 rounded border-zinc-300 text-blue-600 focus:ring-blue-500"
          />
          <span className="text-sm text-zinc-700">
            I agree to the{' '}
            <button className="text-blue-600 hover:underline">Terms of Service</button>
          </span>
        </label>

        <label
          className={`
          flex items-start gap-3 p-3 rounded-lg cursor-pointer
          transition-colors hover:bg-zinc-50
          ${errors.acceptedPrivacy ? 'bg-red-50' : ''}
        `}
        >
          <input
            type="checkbox"
            checked={formData.acceptedPrivacy}
            onChange={e => updateField('acceptedPrivacy', e.target.checked)}
            className="w-5 h-5 mt-0.5 rounded border-zinc-300 text-blue-600 focus:ring-blue-500"
          />
          <span className="text-sm text-zinc-700">
            I accept the <button className="text-blue-600 hover:underline">Privacy Policy</button>{' '}
            and consent to data processing
          </span>
        </label>

        <label
          className={`
          flex items-start gap-3 p-3 rounded-lg cursor-pointer
          transition-colors hover:bg-zinc-50
          ${errors.acceptedCompliance ? 'bg-red-50' : ''}
        `}
        >
          <input
            type="checkbox"
            checked={formData.acceptedCompliance}
            onChange={e => updateField('acceptedCompliance', e.target.checked)}
            className="w-5 h-5 mt-0.5 rounded border-zinc-300 text-blue-600 focus:ring-blue-500"
          />
          <span className="text-sm text-zinc-700">
            I acknowledge that my use will comply with applicable regulatory requirements and
            organizational policies
          </span>
        </label>
      </div>

      <button
        onClick={handleSubmit}
        disabled={isLoading}
        className={`
          w-full py-3 px-4 mt-2
          flex items-center justify-center gap-2
          text-base font-medium text-white
          bg-blue-600 hover:bg-blue-700
          rounded-xl
          transition-all duration-200
          disabled:opacity-50 disabled:cursor-not-allowed
          focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
        `}
      >
        {isLoading ? <SpinnerIcon /> : 'Submit Request'}
      </button>
    </motion.div>
  );

  const renderSubmittedStep = () => (
    <motion.div
      key="submitted"
      variants={inputVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      className="text-center space-y-6"
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

      <div className="space-y-2">
        <h3 className="text-xl font-semibold text-zinc-900">Request Submitted!</h3>
        <p className="text-zinc-600">
          Thank you for your interest in Concept2Cure. Our team will review your request and contact
          you at <strong>{formData.email}</strong> within 1-2 business days.
        </p>
      </div>

      <div className="p-4 bg-blue-50 rounded-xl border border-blue-100">
        <p className="text-sm text-blue-800">
          <strong>What's next?</strong> We'll schedule a brief call to understand your regulatory
          needs and set up your personalized workspace.
        </p>
      </div>

      <button
        onClick={() => setLocation('/login')}
        className={`
          w-full py-3 px-4
          text-base font-medium text-zinc-700
          bg-white border-2 border-zinc-200 rounded-xl
          hover:bg-zinc-50 hover:border-zinc-300
          transition-all duration-200
        `}
      >
        Back to Sign In
      </button>
    </motion.div>
  );

  // ─────────────────────────────────────────────────────────────────────────────
  // Main render
  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[#faf9f5] flex flex-col">
      <div className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-lg">
          {/* Logo and title */}
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center mb-4">
              <LogoIcon />
            </div>
            <h1 className="text-2xl font-semibold text-zinc-900">
              {step === 'submitted' ? '' : 'Request Access'}
            </h1>
            {step !== 'submitted' && (
              <p className="mt-2 text-sm text-zinc-600">
                Join leading life sciences organizations using Concept2Cure
              </p>
            )}
          </div>

          {/* Progress indicator */}
          {step !== 'submitted' && renderProgress()}

          {/* Form card */}
          <div className="bg-white rounded-2xl shadow-sm border border-zinc-200 p-8">
            <AnimatePresence mode="wait">
              {step === 'info' && renderInfoStep()}
              {step === 'organization' && renderOrganizationStep()}
              {step === 'compliance' && renderComplianceStep()}
              {step === 'submitted' && renderSubmittedStep()}
            </AnimatePresence>
          </div>

          {/* Sign in link */}
          {step !== 'submitted' && (
            <p className="mt-6 text-center text-sm text-zinc-600">
              Already have an account?{' '}
              <button
                onClick={() => setLocation('/login')}
                className="text-blue-600 hover:text-blue-700 font-medium"
              >
                Sign in
              </button>
            </p>
          )}
        </div>
      </div>

      {/* Footer */}
      <footer className="py-6 px-4">
        <div className="max-w-md mx-auto">
          <div className="flex items-center justify-center gap-2 text-xs text-zinc-400 mb-2">
            <ShieldIcon />
            <span>FDA 21 CFR Part 11 Compliant</span>
          </div>
          <p className="text-center text-xs text-zinc-400">
            © {new Date().getFullYear()} Concept2Cure. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
};

export default ZenSignup;
