/**
 * Concept2Cure Client Portal V2 - Client Onboarding Wizard
 *
 * Multi-step wizard for new client organization setup with
 * archetype detection, compliance configuration, and user provisioning.
 *
 * @version 2.0.0
 * @compliance FDA 21 CFR Part 11, EU Annex 11, ICH E6 GCP
 */

import React, { useState, useCallback, useMemo, useRef } from 'react';
import {
  Building,
  Building2,
  Users,
  Shield,
  Settings,
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
  Globe,
  Zap,
  Check,
  X,
} from 'lucide-react';
import type { OrganizationBusinessModel, SubscriptionTier } from '../../core/securityTypes';
import {
  getArchetypeConfig,
  BIG_PHARMA_CONFIG,
  VIRTUAL_BIOTECH_CONFIG,
  CRO_CONFIG,
  ACADEMIC_CONFIG,
  type TenantArchetypeConfig,
  type ComplianceConfig,
} from '../../core/regulatoryCompliance';

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
    id: 'STARTER',
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
    id: 'PROFESSIONAL',
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
    id: 'ENTERPRISE',
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

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

interface OnboardingWizardProps {
  onComplete: (data: OnboardingData) => void;
  onCancel?: () => void;
}

export function OnboardingWizard({ onComplete, onCancel }: OnboardingWizardProps) {
  const [currentStep, setCurrentStep] = useState<WizardStep>('organization');
  const [data, setData] = useState<OnboardingData>({
    organizationName: '',
    domain: '',
    country: '',
    industry: '',
    businessModel: null,
    archetype: null,
    subscriptionTier: 'PROFESSIONAL',
    billingEmail: '',
    billingCycle: 'annual',
    complianceCustomizations: {},
    adminEmail: '',
    adminName: '',
    initialUsers: [],
    agreedToTerms: false,
    agreedToDataProcessing: false,
  });

  const currentStepIndex = STEPS.findIndex(s => s.id === currentStep);

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
    switch (currentStep) {
      case 'organization':
        return data.organizationName && data.country;
      case 'business-model':
        return data.businessModel !== null;
      case 'subscription':
        return data.subscriptionTier && data.billingEmail;
      case 'compliance':
        return true; // Optional customizations
      case 'users':
        return data.adminEmail && data.adminName;
      case 'review':
        return data.agreedToTerms && data.agreedToDataProcessing;
      default:
        return false;
    }
  }, [currentStep, data]);

  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  const handleComplete = useCallback(async () => {
    if (!data.agreedToTerms || !data.agreedToDataProcessing) return;

    // First, call the parent handler to create the organization
    onComplete(data);

    // Then redirect to Stripe Checkout with Link for payment
    if (data.subscriptionTier !== 'free') {
      setCheckoutLoading(true);
      setCheckoutError(null);
      try {
        const res = await fetch('/api/billing/checkout', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('token') || ''}`,
          },
          body: JSON.stringify({
            tier: data.subscriptionTier,
            billingCycle: data.billingCycle,
          }),
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || 'Failed to start checkout');
        }

        const { checkoutUrl } = await res.json();
        if (checkoutUrl) {
          window.location.href = checkoutUrl;
          return;
        }
      } catch (err) {
        setCheckoutError(err instanceof Error ? err.message : 'Payment setup failed');
        setCheckoutLoading(false);
      }
    }
  }, [data, onComplete]);

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
            </div>
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
                className="flex items-center gap-2 px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {checkoutLoading ? (
                  <>
                    <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                    Redirecting to Payment...
                  </>
                ) : data.subscriptionTier === 'free' ? (
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
                className="flex items-center gap-2 px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
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
  const selectedTier = SUBSCRIPTION_TIERS.find(t => t.id === data.subscriptionTier);
  const archetype = data.archetype;

  // Calculate pricing
  const pricing = archetype?.pricing;
  const basePrice = pricing?.baseMonthly || 0;
  const discount = data.billingCycle === 'annual' ? pricing?.annualDiscount || 0 : 0;
  const finalPrice = basePrice * (1 - discount);

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

      {/* Pricing Summary */}
      {pricing && (
        <div className="p-4 bg-gray-50 rounded-lg">
          <div className="flex justify-between items-center">
            <span className="text-gray-600">Estimated Monthly Cost</span>
            <div className="text-right">
              {discount > 0 && (
                <span className="text-gray-400 line-through text-sm mr-2">
                  ${basePrice.toLocaleString()}/mo
                </span>
              )}
              <span className="text-2xl font-bold text-gray-900">
                ${finalPrice.toLocaleString()}
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

function ComplianceStep({ data, updateData }: StepProps) {
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

  const addUser = () => {
    if (newUserEmail) {
      updateData({
        initialUsers: [...data.initialUsers, { email: newUserEmail, role: newUserRole }],
      });
      setNewUserEmail('');
      setNewUserRole('viewer');
    }
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
            className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Add
          </button>
        </div>

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
