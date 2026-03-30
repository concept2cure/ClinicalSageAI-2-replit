/**
 * Concept2Cure Client Portal V2 - Client Onboarding Wizard
 *
 * Multi-step wizard for new client organization setup with
 * archetype detection, compliance configuration, and user provisioning.
 *
 * @version 2.0.0
 * @compliance FDA 21 CFR Part 11, EU Annex 11, ICH E6 GCP
 */

import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
  Building,
  Building2,
  Users,
  Shield,
  FileText,
  CheckCircle,
  ChevronRight,
  ChevronLeft,
  Sparkles,
  Briefcase,
  GraduationCap,
  FlaskConical,
  Factory,
  Stethoscope,
  Landmark,
  AlertTriangle,
  Lock,
  Key,
  Clock,
  Database,
  Check,
  X,
} from 'lucide-react';
import type { OrganizationBusinessModel, SubscriptionTier } from '../../core/securityTypes';
import {
  getArchetypeConfig,
  type TenantArchetypeConfig,
  type ComplianceConfig,
} from '../../core/regulatoryCompliance';
import { getAuthHeaders } from '@/utils/authToken';

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

interface OnboardingData {
  // Step 1: Organization Basics
  organizationName: string;
  domain: string;
  country: string;
  industry: string;

  // Step 2: Business Model
  businessModel: OrganizationBusinessModel | null;
  archetype: TenantArchetypeConfig | null;

  // Step 3: Subscription
  subscriptionTier: SubscriptionTier;
  modelPack: 'standard' | 'regulatory_pro' | 'enterprise_gxp';
  selectedModules: string[];
  estimatedSeats: number;
  estimatedStorageGB: number;
  billingEmail: string;
  billingCycle: 'monthly' | 'annual';

  // Step 4: Compliance Configuration
  complianceCustomizations: Partial<ComplianceConfig>;

  // Step 5: Initial Users
  adminEmail: string;
  adminName: string;
  initialUsers: { email: string; role: string }[];

  // Step 6: Review
  agreedToTerms: boolean;
  agreedToDataProcessing: boolean;
}

interface PricingEstimate {
  basePrice: number;
  seatCost: number;
  storageCost: number;
  modulesCost: number;
  preDiscountMonthly: number;
  discount: number;
  finalMonthly: number;
}

type WizardStep =
  | 'organization'
  | 'business-model'
  | 'subscription'
  | 'compliance'
  | 'users'
  | 'review';

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

const STEPS: { id: WizardStep; label: string; icon: React.ReactNode }[] = [
  { id: 'organization', label: 'Organization', icon: <Building className="h-5 w-5" /> },
  { id: 'business-model', label: 'Business Model', icon: <Briefcase className="h-5 w-5" /> },
  { id: 'subscription', label: 'Subscription', icon: <Sparkles className="h-5 w-5" /> },
  { id: 'compliance', label: 'Compliance', icon: <Shield className="h-5 w-5" /> },
  { id: 'users', label: 'Users', icon: <Users className="h-5 w-5" /> },
  { id: 'review', label: 'Review', icon: <CheckCircle className="h-5 w-5" /> },
];

const BUSINESS_MODELS: {
  id: OrganizationBusinessModel;
  label: string;
  description: string;
  icon: React.ReactNode;
}[] = [
  {
    id: 'BIO_PHARMA_SPONSOR',
    label: 'Pharmaceutical / Biotech',
    description: 'Drug development sponsor with full regulatory compliance needs',
    icon: <FlaskConical className="h-8 w-8" />,
  },
  {
    id: 'CRO_PARTNER',
    label: 'Contract Research Organization',
    description: 'Multi-sponsor support with strict data isolation',
    icon: <Building2 className="h-8 w-8" />,
  },
  {
    id: 'CMO_CDMO',
    label: 'Contract Manufacturing',
    description: 'Manufacturing and quality documentation',
    icon: <Factory className="h-8 w-8" />,
  },
  {
    id: 'ACADEMIC_INSTITUTION',
    label: 'Academic / Research',
    description: 'Academic research with lighter compliance requirements',
    icon: <GraduationCap className="h-8 w-8" />,
  },
  {
    id: 'DEVICE_MANUFACTURER',
    label: 'Medical Device',
    description: 'Medical device regulatory submissions',
    icon: <Stethoscope className="h-8 w-8" />,
  },
  {
    id: 'GOVERNMENT_AGENCY',
    label: 'Government Agency',
    description: 'Government or public health organization',
    icon: <Landmark className="h-8 w-8" />,
  },
];

const SUBSCRIPTION_TIERS: {
  id: SubscriptionTier;
  name: string;
  description: string;
  features: string[];
  recommended?: boolean;
}[] = [
  {
    id: 'starter',
    name: 'Starter',
    description: 'For small teams getting started',
    features: [
      'Up to 10 users',
      'Basic document management',
      'Standard audit trail',
      'Email support',
    ],
  },
  {
    id: 'professional',
    name: 'Professional',
    description: 'For growing regulatory teams',
    features: [
      'Up to 50 users',
      'Electronic signatures',
      'Advanced audit trail',
      'Workflow automation',
      'Priority support',
    ],
    recommended: true,
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    description: 'Full regulatory platform',
    features: [
      'Unlimited users',
      'Full 21 CFR Part 11',
      'SSO integration',
      'Custom workflows',
      'Dedicated support',
      'On-premise option',
    ],
  },
];

const MODEL_PACKS: {
  id: OnboardingData['modelPack'];
  name: string;
  description: string;
  monthlyAddon: number;
}[] = [
  {
    id: 'standard',
    name: 'Standard AI',
    description: 'Default regulated assistant model set',
    monthlyAddon: 0,
  },
  {
    id: 'regulatory_pro',
    name: 'Regulatory Pro',
    description: 'Enhanced reasoning + extraction for submissions',
    monthlyAddon: 399,
  },
  {
    id: 'enterprise_gxp',
    name: 'Enterprise GxP',
    description: 'Highest-trust model stack for enterprise validation programs',
    monthlyAddon: 999,
  },
];

const MODULE_ADDONS: {
  id: string;
  name: string;
  description: string;
  monthlyAddon: number;
}[] = [
  {
    id: 'deep_research',
    name: 'Deep Research',
    description: 'Multi-source evidence synthesis',
    monthlyAddon: 149,
  },
  {
    id: 'ctd_builder',
    name: 'CTD Builder',
    description: 'Submission module automation',
    monthlyAddon: 249,
  },
  {
    id: 'safety_narrative',
    name: 'Safety Narrative',
    description: 'Signal-driven narrative acceleration',
    monthlyAddon: 179,
  },
  {
    id: 'multi_agency_export',
    name: 'Multi-Agency Export',
    description: 'FDA/EMA/PMDA packaging accelerator',
    monthlyAddon: 199,
  },
];

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ONBOARDING_STORAGE_KEY = 'portal_v2_onboarding_draft_v1';
const ONBOARDING_DRAFT_TTL_MS = 1000 * 60 * 60 * 24;

type PersistedOnboardingDraft = {
  savedAt: number;
  currentStep: WizardStep;
  data: Pick<
    OnboardingData,
    | 'organizationName'
    | 'domain'
    | 'country'
    | 'industry'
    | 'businessModel'
    | 'archetype'
    | 'subscriptionTier'
    | 'modelPack'
    | 'selectedModules'
    | 'estimatedSeats'
    | 'estimatedStorageGB'
    | 'billingCycle'
    | 'complianceCustomizations'
  >;
};

function isValidEmail(email: string): boolean {
  return EMAIL_REGEX.test(email.trim());
}

function estimatePricing(data: OnboardingData): PricingEstimate {
  const pricing = data.archetype?.pricing;
  const selectedModel = MODEL_PACKS.find(m => m.id === data.modelPack) || MODEL_PACKS[0];
  const basePrice = pricing?.baseMonthly || 0;
  const seatCost = (pricing?.perUserMonthly || 0) * Math.max(data.estimatedSeats, 0);
  const storageCost = (pricing?.storagePerGBMonthly || 0) * Math.max(data.estimatedStorageGB, 0);
  const modulesCost = MODULE_ADDONS.filter(module =>
    data.selectedModules.includes(module.id)
  ).reduce((sum, module) => sum + module.monthlyAddon, 0);
  const preDiscountMonthly =
    basePrice + seatCost + storageCost + selectedModel.monthlyAddon + modulesCost;
  const discount = data.billingCycle === 'annual' ? pricing?.annualDiscount || 0 : 0;
  const finalMonthly = preDiscountMonthly * (1 - discount);

  return {
    basePrice,
    seatCost,
    storageCost,
    modulesCost,
    preDiscountMonthly,
    discount,
    finalMonthly,
  };
}

function toPersistedDraft(data: OnboardingData, currentStep: WizardStep): PersistedOnboardingDraft {
  return {
    savedAt: Date.now(),
    currentStep,
    data: {
      organizationName: data.organizationName,
      domain: data.domain,
      country: data.country,
      industry: data.industry,
      businessModel: data.businessModel,
      archetype: data.archetype,
      subscriptionTier: data.subscriptionTier,
      modelPack: data.modelPack,
      selectedModules: data.selectedModules,
      estimatedSeats: data.estimatedSeats,
      estimatedStorageGB: data.estimatedStorageGB,
      billingCycle: data.billingCycle,
      complianceCustomizations: data.complianceCustomizations,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

interface OnboardingWizardProps {
  onComplete?: (data: OnboardingData) => void | Promise<void>;
  onCancel?: () => void;
}

export function OnboardingWizard({ onComplete, onCancel }: OnboardingWizardProps) {
  const [data, setData] = useState<OnboardingData>(() => ({
    organizationName: '',
    domain: '',
    country: '',
    industry: '',
    businessModel: null,
    archetype: null,
    subscriptionTier: 'professional',
    modelPack: 'standard',
    selectedModules: [],
    estimatedSeats: 10,
    estimatedStorageGB: 25,
    billingEmail: '',
    billingCycle: 'annual',
    complianceCustomizations: {},
    adminEmail: '',
    adminName: '',
    initialUsers: [],
    agreedToTerms: false,
    agreedToDataProcessing: false,
  }));
  const [currentStep, setCurrentStep] = useState<WizardStep>('organization');

  const currentStepIndex = STEPS.findIndex(s => s.id === currentStep);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(ONBOARDING_STORAGE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as PersistedOnboardingDraft;
      if (!saved.savedAt || Date.now() - saved.savedAt > ONBOARDING_DRAFT_TTL_MS) {
        sessionStorage.removeItem(ONBOARDING_STORAGE_KEY);
        return;
      }
      if (saved.data && typeof saved.data === 'object') {
        setData(prev => ({ ...prev, ...saved.data }));
      }
      if (saved.currentStep && STEPS.some(step => step.id === saved.currentStep)) {
        setCurrentStep(saved.currentStep);
      }
    } catch {
      sessionStorage.removeItem(ONBOARDING_STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    const payload = JSON.stringify(toPersistedDraft(data, currentStep));
    sessionStorage.setItem(ONBOARDING_STORAGE_KEY, payload);
  }, [data, currentStep]);

  const updateData = useCallback((updates: Partial<OnboardingData>) => {
    setData(prev => ({ ...prev, ...updates }));
  }, []);

  const goNext = useCallback(() => {
    if (currentStepIndex < STEPS.length - 1) {
      setCurrentStep(STEPS[currentStepIndex + 1].id);
    }
  }, [currentStepIndex]);

  const goBack = useCallback(() => {
    if (currentStepIndex > 0) {
      setCurrentStep(STEPS[currentStepIndex - 1].id);
    }
  }, [currentStepIndex]);

  const canProceed = useMemo(() => {
    const billingEmailValid = isValidEmail(data.billingEmail);
    const adminEmailValid = isValidEmail(data.adminEmail);

    switch (currentStep) {
      case 'organization':
        return Boolean(data.organizationName.trim() && data.country);
      case 'business-model':
        return data.businessModel !== null;
      case 'subscription':
        return data.subscriptionTier && billingEmailValid;
      case 'compliance':
        return true; // Optional customizations
      case 'users':
        return Boolean(adminEmailValid && data.adminName.trim());
      case 'review':
        return data.agreedToTerms && data.agreedToDataProcessing;
      default:
        return false;
    }
  }, [currentStep, data]);

  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [setupCompleted, setSetupCompleted] = useState(false);

  const handleComplete = useCallback(async () => {
    if (!data.agreedToTerms || !data.agreedToDataProcessing) return;
    setCheckoutError(null);

    try {
      // First, call the parent handler to create the organization context
      await onComplete?.(data);
    } catch (err) {
      setCheckoutError(
        err instanceof Error
          ? err.message
          : 'We could not finish organization setup. Please try again.'
      );
      return;
    }

    // Then redirect to Stripe Checkout with Link for payment
    if (data.subscriptionTier !== 'starter') {
      setCheckoutLoading(true);
      try {
        const res = await fetch('/api/billing/checkout', {
          method: 'POST',
          headers: {
            ...getAuthHeaders(),
          },
          body: JSON.stringify({
            tier: data.subscriptionTier,
            billingCycle: data.billingCycle,
            seats: data.estimatedSeats,
          }),
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || 'Failed to start checkout');
        }

        const { checkoutUrl } = await res.json();
        if (checkoutUrl) {
          sessionStorage.removeItem(ONBOARDING_STORAGE_KEY);
          window.location.href = checkoutUrl;
          return;
        }
        throw new Error('Checkout URL was not returned by billing service');
      } catch (err) {
        setCheckoutError(err instanceof Error ? err.message : 'Payment setup failed');
        setCheckoutLoading(false);
      }
    } else {
      sessionStorage.removeItem(ONBOARDING_STORAGE_KEY);
      setSetupCompleted(true);
    }
  }, [data, onComplete]);

  if (setupCompleted) {
    return <ActivationCompleteView organizationName={data.organizationName} />;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-primary-900 to-slate-900 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-primary-600 to-primary-700 px-8 py-6">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-white/20 rounded-xl">
              <Building className="h-8 w-8 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">Welcome to Concept2Cure</h1>
              <p className="text-primary-100">Let's set up your organization</p>
              <p className="text-primary-200 text-sm mt-1">
                Step {currentStepIndex + 1} of {STEPS.length}: {STEPS[currentStepIndex].label}
              </p>
              <p className="text-primary-200/90 text-xs mt-1">
                Draft is auto-saved for 24 hours on this browser.
              </p>
            </div>
          </div>
          <div className="mt-4 h-1.5 bg-white/20 rounded-full overflow-hidden">
            <div
              className="h-full bg-white transition-all duration-300"
              style={{ width: `${((currentStepIndex + 1) / STEPS.length) * 100}%` }}
            />
          </div>
        </div>

        {/* Progress Steps */}
        <div className="px-8 py-4 bg-gray-50 border-b">
          <div className="flex items-center justify-between">
            {STEPS.map((step, index) => (
              <React.Fragment key={step.id}>
                <button
                  onClick={() => index < currentStepIndex && setCurrentStep(step.id)}
                  disabled={index > currentStepIndex}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${
                    step.id === currentStep
                      ? 'bg-primary-100 text-primary-700'
                      : index < currentStepIndex
                        ? 'text-primary-600 hover:bg-primary-50 cursor-pointer'
                        : 'text-gray-400 cursor-not-allowed'
                  }`}
                >
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center ${
                      index < currentStepIndex
                        ? 'bg-primary-600 text-white'
                        : step.id === currentStep
                          ? 'bg-primary-600 text-white'
                          : 'bg-gray-200 text-gray-500'
                    }`}
                  >
                    {index < currentStepIndex ? <Check className="h-5 w-5" /> : step.icon}
                  </div>
                  <span className="hidden md:inline font-medium">{step.label}</span>
                </button>
                {index < STEPS.length - 1 && (
                  <div
                    className={`flex-1 h-0.5 mx-2 ${
                      index < currentStepIndex ? 'bg-primary-600' : 'bg-gray-200'
                    }`}
                  />
                )}
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="p-8">
          {currentStep === 'organization' && (
            <OrganizationStep data={data} updateData={updateData} />
          )}
          {currentStep === 'business-model' && (
            <BusinessModelStep data={data} updateData={updateData} />
          )}
          {currentStep === 'subscription' && (
            <SubscriptionStep data={data} updateData={updateData} />
          )}
          {currentStep === 'compliance' && <ComplianceStep data={data} updateData={updateData} />}
          {currentStep === 'users' && <UsersStep data={data} updateData={updateData} />}
          {currentStep === 'review' && <ReviewStep data={data} updateData={updateData} />}
        </div>

        {/* Footer */}
        <div className="px-8 py-4 bg-gray-50 border-t flex justify-between">
          <div>
            {onCancel && (
              <button onClick={onCancel} className="px-4 py-2 text-gray-600 hover:text-gray-900">
                Cancel
              </button>
            )}
          </div>
          <div className="flex gap-3">
            {currentStepIndex > 0 && (
              <button
                onClick={goBack}
                className="flex items-center gap-2 px-4 py-2 text-gray-700 hover:text-gray-900"
              >
                <ChevronLeft className="h-5 w-5" />
                Back
              </button>
            )}
            {checkoutError && (
              <span className="text-sm text-red-600 mr-2 self-center">{checkoutError}</span>
            )}
            {currentStep === 'review' ? (
              <button
                onClick={handleComplete}
                disabled={!canProceed || checkoutLoading}
                className="flex items-center gap-2 px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {checkoutLoading ? (
                  <>
                    <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                        fill="none"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                      />
                    </svg>
                    Redirecting to Payment...
                  </>
                ) : data.subscriptionTier === 'starter' ? (
                  <>
                    <CheckCircle className="h-5 w-5" />
                    Complete Setup
                  </>
                ) : (
                  <>
                    <CheckCircle className="h-5 w-5" />
                    Complete Setup & Pay
                  </>
                )}
              </button>
            ) : (
              <button
                onClick={goNext}
                disabled={!canProceed}
                className="flex items-center gap-2 px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                Continue
                <ChevronRight className="h-5 w-5" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ActivationCompleteView({ organizationName }: { organizationName: string }) {
  const goToAna = () => {
    window.location.href = '/ai?welcome=true';
  };

  const goToAdmin = () => {
    window.location.href = '/admin';
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-primary-900 to-slate-900 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full p-8">
        <div className="flex items-center gap-3 mb-4">
          <CheckCircle className="h-7 w-7 text-green-600" />
          <h2 className="text-2xl font-semibold text-gray-900">Organization Setup Complete</h2>
        </div>
        <p className="text-gray-600 mb-6">
          {organizationName || 'Your organization'} is now active. Next, complete company-level and
          user/role-level onboarding in Admin, then launch AnA RI for first-use workflows.
        </p>

        <div className="grid md:grid-cols-2 gap-4 mb-6">
          <div className="rounded-xl border border-gray-200 p-4">
            <h3 className="font-medium text-gray-900 mb-2">Company-Level Setup</h3>
            <ul className="text-sm text-gray-600 space-y-1">
              <li>• Confirm compliance defaults and signatures</li>
              <li>• Validate security/session policies</li>
              <li>• Verify module enablement by plan</li>
            </ul>
          </div>
          <div className="rounded-xl border border-gray-200 p-4">
            <h3 className="font-medium text-gray-900 mb-2">User/Role-Level Setup</h3>
            <ul className="text-sm text-gray-600 space-y-1">
              <li>• Invite team members and assign roles</li>
              <li>• Confirm role permissions and SoD</li>
              <li>• Complete first project access checks</li>
            </ul>
          </div>
        </div>

        <div className="flex gap-3">
          <button
            onClick={goToAdmin}
            className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50"
          >
            Open Admin Setup
          </button>
          <button
            onClick={goToAna}
            className="px-4 py-2 rounded-lg bg-primary-600 text-white hover:bg-primary-700"
          >
            Enter AnA RI
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 1: ORGANIZATION
// ─────────────────────────────────────────────────────────────────────────────

interface StepProps {
  data: OnboardingData;
  updateData: (updates: Partial<OnboardingData>) => void;
}

function OrganizationStep({ data, updateData }: StepProps) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-gray-900">Organization Details</h2>
        <p className="text-gray-500 mt-1">Tell us about your organization</p>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Organization Name *
          </label>
          <input
            type="text"
            value={data.organizationName}
            onChange={e => updateData({ organizationName: e.target.value })}
            placeholder="Acme Pharmaceuticals"
            className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Domain</label>
          <input
            type="text"
            value={data.domain}
            onChange={e => updateData({ domain: e.target.value })}
            placeholder="acmepharma.com"
            className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Country *</label>
          <select
            value={data.country}
            onChange={e => updateData({ country: e.target.value })}
            className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
          >
            <option value="">Select country...</option>
            <option value="US">United States</option>
            <option value="GB">United Kingdom</option>
            <option value="DE">Germany</option>
            <option value="FR">France</option>
            <option value="CH">Switzerland</option>
            <option value="JP">Japan</option>
            <option value="CN">China</option>
            <option value="AU">Australia</option>
            <option value="CA">Canada</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Industry</label>
          <select
            value={data.industry}
            onChange={e => updateData({ industry: e.target.value })}
            className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
          >
            <option value="">Select industry...</option>
            <option value="pharmaceutical">Pharmaceutical</option>
            <option value="biotech">Biotechnology</option>
            <option value="medical_devices">Medical Devices</option>
            <option value="diagnostics">Diagnostics</option>
            <option value="cro">Contract Research</option>
            <option value="academic">Academic/Research</option>
            <option value="government">Government/Public Health</option>
          </select>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 2: BUSINESS MODEL
// ─────────────────────────────────────────────────────────────────────────────

function BusinessModelStep({ data, updateData }: StepProps) {
  const handleSelect = (businessModel: OrganizationBusinessModel) => {
    const archetype = getArchetypeConfig(businessModel);
    updateData({ businessModel, archetype });
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-gray-900">Select Your Business Model</h2>
        <p className="text-gray-500 mt-1">This determines your default compliance configuration</p>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {BUSINESS_MODELS.map(model => (
          <button
            key={model.id}
            onClick={() => handleSelect(model.id)}
            className={`p-6 border-2 rounded-xl text-left transition-all ${
              data.businessModel === model.id
                ? 'border-primary-500 bg-primary-50 ring-2 ring-primary-200'
                : 'border-gray-200 hover:border-primary-300 hover:bg-gray-50'
            }`}
          >
            <div
              className={`${data.businessModel === model.id ? 'text-primary-600' : 'text-gray-400'}`}
            >
              {model.icon}
            </div>
            <h3 className="font-semibold text-gray-900 mt-3">{model.label}</h3>
            <p className="text-sm text-gray-500 mt-1">{model.description}</p>
          </button>
        ))}
      </div>

      {/* Preview archetype config */}
      {data.archetype && (
        <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <h4 className="font-medium text-blue-900 flex items-center gap-2">
            <Sparkles className="h-5 w-5" />
            Recommended Configuration: {data.archetype.name}
          </h4>
          <p className="text-sm text-blue-700 mt-1">{data.archetype.description}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {data.archetype.compliance.frameworks.map(framework => (
              <span
                key={framework}
                className="px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded-full"
              >
                {framework.replace(/_/g, ' ')}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 3: SUBSCRIPTION
// ─────────────────────────────────────────────────────────────────────────────

function SubscriptionStep({ data, updateData }: StepProps) {
  const archetype = data.archetype;
  const selectedModel = MODEL_PACKS.find(m => m.id === data.modelPack) || MODEL_PACKS[0];
  const pricing = archetype?.pricing;
  const pricingEstimate = estimatePricing(data);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-gray-900">Choose Your Plan</h2>
        <p className="text-gray-500 mt-1">Select the subscription that fits your needs</p>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        {SUBSCRIPTION_TIERS.map(tier => (
          <button
            key={tier.id}
            onClick={() => updateData({ subscriptionTier: tier.id })}
            className={`relative p-6 border-2 rounded-xl text-left transition-all ${
              data.subscriptionTier === tier.id
                ? 'border-primary-500 bg-primary-50'
                : 'border-gray-200 hover:border-primary-300'
            }`}
          >
            {tier.recommended && (
              <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-primary-600 text-white text-xs font-medium rounded-full">
                Recommended
              </span>
            )}
            <h3 className="text-lg font-semibold text-gray-900">{tier.name}</h3>
            <p className="text-sm text-gray-500 mt-1">{tier.description}</p>
            <ul className="mt-4 space-y-2">
              {tier.features.map((feature, idx) => (
                <li key={idx} className="flex items-center gap-2 text-sm text-gray-600">
                  <Check className="h-4 w-4 text-green-500" />
                  {feature}
                </li>
              ))}
            </ul>
          </button>
        ))}
      </div>

      {/* Billing */}
      <div className="grid md:grid-cols-2 gap-6 pt-6 border-t">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Billing Email *</label>
          <input
            type="email"
            value={data.billingEmail}
            onChange={e => updateData({ billingEmail: e.target.value })}
            placeholder="billing@company.com"
            className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
          />
          {data.billingEmail && !isValidEmail(data.billingEmail) && (
            <p className="text-xs text-red-600 mt-1">Enter a valid billing email address.</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Billing Cycle</label>
          <div className="flex gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                checked={data.billingCycle === 'monthly'}
                onChange={() => updateData({ billingCycle: 'monthly' })}
                className="h-4 w-4 text-primary-600"
              />
              <span>Monthly</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                checked={data.billingCycle === 'annual'}
                onChange={() => updateData({ billingCycle: 'annual' })}
                className="h-4 w-4 text-primary-600"
              />
              <span>Annual (Save {((pricing?.annualDiscount || 0) * 100).toFixed(0)}%)</span>
            </label>
          </div>
        </div>
      </div>

      {/* AI Model Pack */}
      <div className="space-y-3 pt-4 border-t">
        <h3 className="font-semibold text-gray-900">AI Model Pack</h3>
        <div className="grid md:grid-cols-3 gap-3">
          {MODEL_PACKS.map(model => (
            <button
              key={model.id}
              onClick={() => updateData({ modelPack: model.id })}
              className={`p-4 border rounded-xl text-left transition ${
                data.modelPack === model.id
                  ? 'border-primary-500 bg-primary-50'
                  : 'border-gray-200 hover:border-primary-300'
              }`}
            >
              <p className="font-medium text-gray-900">{model.name}</p>
              <p className="text-xs text-gray-500 mt-1">{model.description}</p>
              <p className="text-sm text-gray-700 mt-2">
                {model.monthlyAddon === 0 ? 'Included' : `+$${model.monthlyAddon}/mo`}
              </p>
            </button>
          ))}
        </div>
      </div>

      {/* Module Add-ons */}
      <div className="space-y-3 pt-4 border-t">
        <h3 className="font-semibold text-gray-900">Module Add-ons</h3>
        <div className="grid md:grid-cols-2 gap-3">
          {MODULE_ADDONS.map(module => {
            const selected = data.selectedModules.includes(module.id);
            return (
              <button
                key={module.id}
                onClick={() =>
                  updateData({
                    selectedModules: selected
                      ? data.selectedModules.filter(id => id !== module.id)
                      : [...data.selectedModules, module.id],
                  })
                }
                className={`p-4 border rounded-xl text-left transition ${
                  selected
                    ? 'border-primary-500 bg-primary-50'
                    : 'border-gray-200 hover:border-primary-300'
                }`}
              >
                <p className="font-medium text-gray-900">{module.name}</p>
                <p className="text-xs text-gray-500 mt-1">{module.description}</p>
                <p className="text-sm text-gray-700 mt-2">+${module.monthlyAddon}/mo</p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Usage Inputs */}
      <div className="grid md:grid-cols-2 gap-6 pt-4 border-t">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Estimated Seats</label>
          <input
            type="number"
            min={1}
            value={data.estimatedSeats}
            onChange={e => updateData({ estimatedSeats: Math.max(1, Number(e.target.value) || 1) })}
            className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Estimated Storage (GB)
          </label>
          <input
            type="number"
            min={1}
            value={data.estimatedStorageGB}
            onChange={e =>
              updateData({ estimatedStorageGB: Math.max(1, Number(e.target.value) || 1) })
            }
            className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
          />
        </div>
      </div>

      {/* Pricing Summary */}
      {pricing && (
        <div className="p-4 bg-gray-50 rounded-lg">
          <div className="text-sm text-gray-600 mb-3 space-y-1">
            <div className="flex justify-between">
              <span>Base Plan</span>
              <span>${pricingEstimate.basePrice.toLocaleString()}/mo</span>
            </div>
            <div className="flex justify-between">
              <span>Seats ({data.estimatedSeats})</span>
              <span>${pricingEstimate.seatCost.toLocaleString()}/mo</span>
            </div>
            <div className="flex justify-between">
              <span>Storage ({data.estimatedStorageGB} GB)</span>
              <span>${pricingEstimate.storageCost.toLocaleString()}/mo</span>
            </div>
            <div className="flex justify-between">
              <span>Model Pack ({selectedModel.name})</span>
              <span>${selectedModel.monthlyAddon.toLocaleString()}/mo</span>
            </div>
            <div className="flex justify-between">
              <span>Module Add-ons ({data.selectedModules.length})</span>
              <span>${pricingEstimate.modulesCost.toLocaleString()}/mo</span>
            </div>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-gray-600">Estimated Monthly Cost</span>
            <div className="text-right">
              {pricingEstimate.discount > 0 && (
                <span className="text-gray-400 line-through text-sm mr-2">
                  ${pricingEstimate.preDiscountMonthly.toLocaleString()}/mo
                </span>
              )}
              <span className="text-2xl font-bold text-gray-900">
                ${pricingEstimate.finalMonthly.toLocaleString()}
              </span>
              <span className="text-gray-500">/mo</span>
            </div>
          </div>
          <p className="text-xs text-gray-500 mt-2">
            Plus ${pricing.perUserMonthly}/user/month and ${pricing.storagePerGBMonthly}/GB storage
          </p>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 4: COMPLIANCE
// ─────────────────────────────────────────────────────────────────────────────

function ComplianceStep({ data, updateData: _updateData }: StepProps) {
  const archetype = data.archetype;
  const config = archetype?.compliance;

  if (!config) {
    return (
      <div className="text-center py-8 text-gray-500">Please select a business model first</div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-gray-900">Compliance Configuration</h2>
        <p className="text-gray-500 mt-1">Review and customize your compliance settings</p>
      </div>

      {/* Security Settings */}
      <div className="bg-gray-50 rounded-xl p-6">
        <h3 className="font-semibold text-gray-900 flex items-center gap-2 mb-4">
          <Lock className="h-5 w-5" />
          Security Settings
        </h3>

        <div className="grid md:grid-cols-2 gap-4">
          <SettingRow
            label="Session Timeout"
            value={`${config.accessControl.sessionTimeoutMinutes} minutes`}
            icon={<Clock className="h-4 w-4" />}
          />
          <SettingRow
            label="Max Concurrent Sessions"
            value={`${config.accessControl.maxConcurrentSessions}`}
            icon={<Users className="h-4 w-4" />}
          />
          <SettingRow
            label="MFA Required"
            value={config.accessControl.mfaRequired ? 'Yes' : 'No'}
            icon={<Key className="h-4 w-4" />}
            highlight={config.accessControl.mfaRequired}
          />
          <SettingRow
            label="Password Expiration"
            value={`${config.accessControl.passwordPolicy.expirationDays} days`}
            icon={<Lock className="h-4 w-4" />}
          />
        </div>
      </div>

      {/* Electronic Signatures */}
      <div className="bg-gray-50 rounded-xl p-6">
        <h3 className="font-semibold text-gray-900 flex items-center gap-2 mb-4">
          <FileText className="h-5 w-5" />
          Electronic Signatures (21 CFR 11)
        </h3>

        <div className="grid md:grid-cols-2 gap-4">
          <SettingRow
            label="E-Signatures Enabled"
            value={config.electronicSignatures.enabled ? 'Yes' : 'No'}
            highlight={config.electronicSignatures.enabled}
          />
          <SettingRow
            label="Two-Factor Auth"
            value={config.electronicSignatures.requireTwoFactorAuth ? 'Required' : 'Optional'}
            highlight={config.electronicSignatures.requireTwoFactorAuth}
          />
          <SettingRow
            label="Meaning Declaration"
            value={config.electronicSignatures.requireMeaningDeclaration ? 'Required' : 'Optional'}
          />
          <SettingRow
            label="Signature Validity"
            value={`${config.electronicSignatures.signatureValidityHours} hours`}
          />
        </div>
      </div>

      {/* Audit Trail */}
      <div className="bg-gray-50 rounded-xl p-6">
        <h3 className="font-semibold text-gray-900 flex items-center gap-2 mb-4">
          <Database className="h-5 w-5" />
          Audit Trail
        </h3>

        <div className="grid md:grid-cols-2 gap-4">
          <SettingRow
            label="Immutable Audit"
            value={config.auditTrail.immutable ? 'Yes' : 'No'}
            highlight={config.auditTrail.immutable}
          />
          <SettingRow
            label="Hash Chain"
            value={config.auditTrail.hashChainEnabled ? 'Enabled' : 'Disabled'}
            highlight={config.auditTrail.hashChainEnabled}
          />
          <SettingRow
            label="Retention Period"
            value={`${config.auditTrail.retentionYears} years`}
          />
          <SettingRow
            label="Field-Level Tracking"
            value={config.auditTrail.fieldLevelTracking ? 'Enabled' : 'Disabled'}
          />
        </div>
      </div>

      {/* Compliance Note */}
      <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
        <div className="flex items-center gap-2 text-amber-800">
          <AlertTriangle className="h-5 w-5" />
          <span className="font-medium">Compliance Note</span>
        </div>
        <p className="text-sm text-amber-700 mt-2">
          These settings are optimized for {archetype?.name}. Changes may affect regulatory
          compliance. Contact support if you need custom configurations.
        </p>
      </div>
    </div>
  );
}

function SettingRow({
  label,
  value,
  icon,
  highlight = false,
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
  highlight?: boolean;
}) {
  return (
    <div className="flex items-center justify-between p-3 bg-white rounded-lg border">
      <div className="flex items-center gap-2 text-gray-600">
        {icon}
        <span className="text-sm">{label}</span>
      </div>
      <span className={`text-sm font-medium ${highlight ? 'text-green-600' : 'text-gray-900'}`}>
        {value}
      </span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 5: USERS
// ─────────────────────────────────────────────────────────────────────────────

function UsersStep({ data, updateData }: StepProps) {
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserRole, setNewUserRole] = useState('viewer');
  const [inviteError, setInviteError] = useState<string | null>(null);

  const addUser = () => {
    const email = newUserEmail.trim().toLowerCase();
    if (!email) return;

    if (!isValidEmail(email)) {
      setInviteError('Enter a valid email before adding a team member.');
      return;
    }

    const exists = data.initialUsers.some(user => user.email.toLowerCase() === email);
    if (exists || data.adminEmail.toLowerCase() === email) {
      setInviteError('That user is already included in this onboarding list.');
      return;
    }

    updateData({
      initialUsers: [...data.initialUsers, { email, role: newUserRole }],
    });
    setInviteError(null);
    setNewUserEmail('');
    setNewUserRole('viewer');
  };

  const removeUser = (index: number) => {
    updateData({
      initialUsers: data.initialUsers.filter((_, i) => i !== index),
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-gray-900">Set Up Initial Users</h2>
        <p className="text-gray-500 mt-1">Create your administrator and invite team members</p>
      </div>

      {/* Primary Admin */}
      <div className="bg-primary-50 border border-primary-200 rounded-xl p-6">
        <h3 className="font-semibold text-primary-900 flex items-center gap-2 mb-4">
          <Shield className="h-5 w-5" />
          Primary Administrator
        </h3>

        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Admin Name *</label>
            <input
              type="text"
              value={data.adminName}
              onChange={e => updateData({ adminName: e.target.value })}
              placeholder="John Smith"
              className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Admin Email *</label>
            <input
              type="email"
              value={data.adminEmail}
              onChange={e => updateData({ adminEmail: e.target.value })}
              placeholder="admin@company.com"
              className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            />
            {data.adminEmail && !isValidEmail(data.adminEmail) && (
              <p className="text-xs text-red-600 mt-1">Enter a valid admin email address.</p>
            )}
          </div>
        </div>

        <p className="text-xs text-primary-700 mt-3">
          This user will have full administrative access and will receive setup instructions.
        </p>
      </div>

      {/* Invite Team Members */}
      <div className="bg-gray-50 rounded-xl p-6">
        <h3 className="font-semibold text-gray-900 flex items-center gap-2 mb-4">
          <Users className="h-5 w-5" />
          Invite Team Members (Optional)
        </h3>

        <div className="flex gap-2 mb-4">
          <input
            type="email"
            value={newUserEmail}
            onChange={e => setNewUserEmail(e.target.value)}
            placeholder="colleague@company.com"
            className="flex-1 px-4 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
          />
          <select
            value={newUserRole}
            onChange={e => setNewUserRole(e.target.value)}
            className="px-4 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
          >
            <option value="viewer">Viewer</option>
            <option value="medical_writer">Medical Writer</option>
            <option value="clinical_ops">Clinical Ops</option>
            <option value="regulatory_lead">Regulatory Lead</option>
          </select>
          <button
            onClick={addUser}
            disabled={!newUserEmail}
            className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            Add
          </button>
        </div>
        {inviteError && <p className="text-xs text-red-600 mb-3">{inviteError}</p>}

        {data.initialUsers.length > 0 && (
          <ul className="space-y-2">
            {data.initialUsers.map((user, idx) => (
              <li
                key={idx}
                className="flex items-center justify-between p-3 bg-white rounded-lg border"
              >
                <div>
                  <span className="font-medium">{user.email}</span>
                  <span className="text-gray-500 ml-2">({user.role})</span>
                </div>
                <button
                  onClick={() => removeUser(idx)}
                  className="p-1 text-gray-400 hover:text-red-500"
                >
                  <X className="h-5 w-5" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 6: REVIEW
// ─────────────────────────────────────────────────────────────────────────────

function ReviewStep({ data, updateData }: StepProps) {
  const archetype = data.archetype;
  const tier = SUBSCRIPTION_TIERS.find(t => t.id === data.subscriptionTier);
  const model = MODEL_PACKS.find(m => m.id === data.modelPack) || MODEL_PACKS[0];
  const pricingEstimate = estimatePricing(data);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-gray-900">Review Your Setup</h2>
        <p className="text-gray-500 mt-1">
          Please review your configuration before completing setup
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid md:grid-cols-2 gap-4">
        <div className="bg-gray-50 rounded-xl p-4">
          <h4 className="font-medium text-gray-700 mb-2 flex items-center gap-2">
            <Building className="h-4 w-4" />
            Organization
          </h4>
          <p className="font-semibold text-gray-900">{data.organizationName}</p>
          <p className="text-sm text-gray-500">{data.country}</p>
        </div>

        <div className="bg-gray-50 rounded-xl p-4">
          <h4 className="font-medium text-gray-700 mb-2 flex items-center gap-2">
            <Briefcase className="h-4 w-4" />
            Business Model
          </h4>
          <p className="font-semibold text-gray-900">{archetype?.name}</p>
          <p className="text-sm text-gray-500">
            {archetype?.compliance.frameworks.length} compliance frameworks
          </p>
        </div>

        <div className="bg-gray-50 rounded-xl p-4">
          <h4 className="font-medium text-gray-700 mb-2 flex items-center gap-2">
            <Sparkles className="h-4 w-4" />
            Subscription
          </h4>
          <p className="font-semibold text-gray-900">{tier?.name}</p>
          <p className="text-sm text-gray-500">
            Billed {data.billingCycle === 'annual' ? 'annually' : 'monthly'}
          </p>
          <p className="text-sm text-gray-500 mt-1">Model: {model.name}</p>
        </div>

        <div className="bg-gray-50 rounded-xl p-4">
          <h4 className="font-medium text-gray-700 mb-2 flex items-center gap-2">
            <Users className="h-4 w-4" />
            Initial Users
          </h4>
          <p className="font-semibold text-gray-900">{1 + data.initialUsers.length} user(s)</p>
          <p className="text-sm text-gray-500">Admin: {data.adminEmail}</p>
        </div>
      </div>

      <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
        <h4 className="font-medium text-emerald-900 mb-2">Estimated Monthly Total</h4>
        <p className="text-2xl font-bold text-emerald-900">
          ${pricingEstimate.finalMonthly.toLocaleString()}/mo
        </p>
        <p className="text-xs text-emerald-800 mt-1">
          Includes base plan, {data.estimatedSeats} seat(s), {data.estimatedStorageGB} GB storage,
          {` ${model.name}`}, and {data.selectedModules.length} module add-on(s).
        </p>
      </div>

      {/* Compliance Summary */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
        <h4 className="font-medium text-blue-900 flex items-center gap-2 mb-2">
          <Shield className="h-5 w-5" />
          Compliance Configuration
        </h4>
        <div className="flex flex-wrap gap-2">
          {archetype?.compliance.frameworks.map(framework => (
            <span
              key={framework}
              className="px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded-full"
            >
              {framework.replace(/_/g, ' ')}
            </span>
          ))}
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2 text-sm text-blue-800">
          <div>✓ Electronic Signatures</div>
          <div>✓ Immutable Audit Trail</div>
          <div>✓ MFA Authentication</div>
        </div>
      </div>

      {/* Terms */}
      <div className="space-y-3">
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={data.agreedToTerms}
            onChange={e => updateData({ agreedToTerms: e.target.checked })}
            className="mt-1 h-4 w-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
          />
          <span className="text-sm text-gray-700">
            I agree to the{' '}
            <a href="#" className="text-primary-600 hover:underline">
              Terms of Service
            </a>{' '}
            and{' '}
            <a href="#" className="text-primary-600 hover:underline">
              Privacy Policy
            </a>
          </span>
        </label>

        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={data.agreedToDataProcessing}
            onChange={e => updateData({ agreedToDataProcessing: e.target.checked })}
            className="mt-1 h-4 w-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
          />
          <span className="text-sm text-gray-700">
            I agree to the{' '}
            <a href="#" className="text-primary-600 hover:underline">
              Data Processing Agreement
            </a>{' '}
            and understand that my organization's data will be processed in accordance with
            applicable regulations (GDPR, HIPAA, etc.)
          </span>
        </label>
      </div>
    </div>
  );
}

export default OnboardingWizard;
