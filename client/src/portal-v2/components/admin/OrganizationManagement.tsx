/**
 * Concept2Cure Client Portal V2 - Organization Management
 *
 * Multi-tenant organization administration with:
 * - Organization profile and branding
 * - Subscription and billing management
 * - Feature flag configuration
 * - Compliance settings per archetype
 * - Member invitation and management
 *
 * @version 2.0.0
 * @compliance FDA 21 CFR Part 11, SOC 2 Type II
 */

import React, { useState, useCallback, useMemo } from 'react';
import {
  Building2,
  Users,
  CreditCard,
  Settings,
  Shield,
  ShieldCheck,
  Globe,
  Mail,
  Phone,
  MapPin,
  Calendar,
  Clock,
  Palette,
  Image,
  Upload,
  Check,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Info,
  Plus,
  Minus,
  Edit,
  Trash2,
  Save,
  RefreshCw,
  Download,
  ExternalLink,
  Key,
  Lock,
  BarChart3,
  Database,
  Loader2,
  Crown,
  Star,
  Zap,
  Package,
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
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
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
import type { Organization, OrganizationLimits, FeatureFlags } from '../../core/securityTypes';
import {
  BIG_PHARMA_CONFIG,
  VIRTUAL_BIOTECH_CONFIG,
  CRO_CONFIG,
  ACADEMIC_CONFIG,
  type ComplianceConfig,
} from '../../core/regulatoryCompliance';

// ─────────────────────────────────────────────────────────────────────────────
// TYPES & INTERFACES
// ─────────────────────────────────────────────────────────────────────────────

type SubscriptionTier = 'starter' | 'professional' | 'enterprise' | 'enterprise_plus';
type BusinessType = 'big_pharma' | 'virtual_biotech' | 'cro' | 'academic' | 'other';

interface OrganizationDetails extends Organization {
  businessType: BusinessType;
  website?: string;
  phone?: string;
  address?: {
    street: string;
    city: string;
    state: string;
    country: string;
    postalCode: string;
  };
  billingEmail?: string;
  technicalContact?: string;
  complianceOfficer?: string;
  logo?: string;
  primaryColor?: string;
  subscriptionTier: SubscriptionTier;
  subscriptionStartDate: Date;
  subscriptionEndDate?: Date;
  limits: OrganizationLimits;
  usage: {
    users: number;
    storage: number;
    apiCalls: number;
    submissions: number;
  };
}

interface FeatureFlagConfig {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  tier: SubscriptionTier;
  category: 'core' | 'ai' | 'compliance' | 'integration' | 'advanced';
}

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

const SUBSCRIPTION_TIERS: Record<
  SubscriptionTier,
  {
    name: string;
    description: string;
    color: string;
    icon: React.ComponentType<{ className?: string }>;
    limits: Partial<OrganizationLimits>;
    price: number;
  }
> = {
  starter: {
    name: 'Starter',
    description: 'For small teams getting started',
    color: 'text-gray-600 bg-gray-100',
    icon: Package,
    limits: { maxUsers: 10, maxStorage: 50, maxApiCalls: 10000 },
    price: 499,
  },
  professional: {
    name: 'Professional',
    description: 'For growing regulatory teams',
    color: 'text-blue-600 bg-blue-100',
    icon: Star,
    limits: { maxUsers: 50, maxStorage: 500, maxApiCalls: 100000 },
    price: 1499,
  },
  enterprise: {
    name: 'Enterprise',
    description: 'For large organizations',
    color: 'text-purple-600 bg-purple-100',
    icon: Crown,
    limits: { maxUsers: 500, maxStorage: 5000, maxApiCalls: 1000000 },
    price: 4999,
  },
  enterprise_plus: {
    name: 'Enterprise Plus',
    description: 'Custom solutions for global pharma',
    color: 'text-amber-600 bg-amber-100',
    icon: Zap,
    limits: { maxUsers: -1, maxStorage: -1, maxApiCalls: -1 },
    price: 0, // Custom pricing
  },
};

const BUSINESS_TYPE_CONFIG: Record<
  BusinessType,
  { name: string; complianceConfig: ComplianceConfig | null }
> = {
  big_pharma: { name: 'Large Pharmaceutical', complianceConfig: BIG_PHARMA_CONFIG },
  virtual_biotech: { name: 'Virtual Biotech', complianceConfig: VIRTUAL_BIOTECH_CONFIG },
  cro: { name: 'Contract Research Organization', complianceConfig: CRO_CONFIG },
  academic: { name: 'Academic / Research Institution', complianceConfig: ACADEMIC_CONFIG },
  other: { name: 'Other', complianceConfig: null },
};

const FEATURE_FLAGS: FeatureFlagConfig[] = [
  {
    id: 'ai_assistant',
    name: 'AI Regulatory Assistant',
    description: 'AI-powered document analysis and regulatory guidance',
    enabled: true,
    tier: 'professional',
    category: 'ai',
  },
  {
    id: 'advanced_analytics',
    name: 'Advanced Analytics',
    description: 'Detailed submission analytics and trend analysis',
    enabled: true,
    tier: 'professional',
    category: 'advanced',
  },
  {
    id: 'multi_agency',
    name: 'Multi-Agency Submissions',
    description: 'Support for FDA, EMA, PMDA, and other agencies',
    enabled: true,
    tier: 'enterprise',
    category: 'core',
  },
  {
    id: 'esignature',
    name: 'Electronic Signatures',
    description: '21 CFR Part 11 compliant e-signatures',
    enabled: true,
    tier: 'professional',
    category: 'compliance',
  },
  {
    id: 'audit_export',
    name: 'Audit Trail Export',
    description: 'Export complete audit logs for inspections',
    enabled: true,
    tier: 'enterprise',
    category: 'compliance',
  },
  {
    id: 'sso',
    name: 'Single Sign-On',
    description: 'SAML/OIDC integration with identity providers',
    enabled: false,
    tier: 'enterprise',
    category: 'integration',
  },
  {
    id: 'api_access',
    name: 'API Access',
    description: 'REST API for custom integrations',
    enabled: true,
    tier: 'professional',
    category: 'integration',
  },
  {
    id: 'custom_workflows',
    name: 'Custom Workflows',
    description: 'Design custom approval workflows',
    enabled: false,
    tier: 'enterprise',
    category: 'advanced',
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// MOCK DATA
// ─────────────────────────────────────────────────────────────────────────────

const MOCK_ORGANIZATION: OrganizationDetails = {
  id: 'org_001',
  name: 'Acme Pharmaceuticals Inc.',
  slug: 'acme-pharma',
  domain: 'acmepharma.com',
  industry: 'Pharmaceuticals',
  size: 'LARGE',
  regulatoryContext: ['FDA', 'EMA', 'PMDA'],
  complianceLevel: 'ENTERPRISE',
  features: ['ind_wizard', 'cer_generator', 'regulatory_intel'],
  settings: {
    mfaRequired: true,
    sessionTimeoutMinutes: 30,
    passwordExpirationDays: 90,
    maxFailedLoginAttempts: 5,
    ipWhitelist: [],
    auditRetentionDays: 2555,
  },
  ssoEnabled: true,
  ssoProvider: 'azure_ad',
  createdAt: '2024-01-15T00:00:00Z',
  updatedAt: '2025-01-20T00:00:00Z',
  businessType: 'big_pharma',
  website: 'https://acmepharma.com',
  phone: '+1 (555) 123-4567',
  address: {
    street: '100 Pharma Way',
    city: 'Boston',
    state: 'MA',
    country: 'United States',
    postalCode: '02101',
  },
  billingEmail: 'billing@acmepharma.com',
  technicalContact: 'it-support@acmepharma.com',
  complianceOfficer: 'compliance@acmepharma.com',
  primaryColor: '#0066cc',
  subscriptionTier: 'enterprise',
  subscriptionStartDate: new Date('2024-01-15'),
  subscriptionEndDate: new Date('2025-01-15'),
  limits: {
    maxUsers: 500,
    maxStorage: 5000,
    maxApiCalls: 1000000,
    maxProjects: 100,
    maxDocuments: 50000,
  },
  usage: {
    users: 156,
    storage: 1245,
    apiCalls: 456789,
    submissions: 23,
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// ORGANIZATION PROFILE SECTION
// ─────────────────────────────────────────────────────────────────────────────

const OrganizationProfile: React.FC<{
  org: OrganizationDetails;
  onSave: (updates: Partial<OrganizationDetails>) => void;
  isLoading: boolean;
}> = ({ org, onSave, isLoading }) => {
  const [editing, setEditing] = useState(false);
  const [formData, setFormData] = useState({
    name: org.name,
    website: org.website || '',
    phone: org.phone || '',
    address: org.address || {
      street: '',
      city: '',
      state: '',
      country: '',
      postalCode: '',
    },
    billingEmail: org.billingEmail || '',
    technicalContact: org.technicalContact || '',
    complianceOfficer: org.complianceOfficer || '',
  });

  const handleSave = () => {
    onSave(formData);
    setEditing(false);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-lg bg-primary/10 flex items-center justify-center">
              {org.logo ? (
                <img src={org.logo} alt="" className="w-12 h-12 rounded" />
              ) : (
                <Building2 className="h-8 w-8 text-primary" />
              )}
            </div>
            <div>
              <CardTitle>{org.name}</CardTitle>
              <CardDescription>
                {BUSINESS_TYPE_CONFIG[org.businessType]?.name || org.industry}
              </CardDescription>
            </div>
          </div>
          <Button
            variant={editing ? 'default' : 'outline'}
            onClick={() => (editing ? handleSave() : setEditing(true))}
            disabled={isLoading}
          >
            {isLoading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : editing ? (
              <Save className="mr-2 h-4 w-4" />
            ) : (
              <Edit className="mr-2 h-4 w-4" />
            )}
            {editing ? 'Save Changes' : 'Edit Profile'}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {editing ? (
          <>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="org-name">Organization Name</Label>
                <Input
                  id="org-name"
                  value={formData.name}
                  onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="org-website">Website</Label>
                <Input
                  id="org-website"
                  value={formData.website}
                  onChange={e => setFormData(prev => ({ ...prev, website: e.target.value }))}
                  placeholder="https://example.com"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="org-phone">Phone</Label>
                <Input
                  id="org-phone"
                  value={formData.phone}
                  onChange={e => setFormData(prev => ({ ...prev, phone: e.target.value }))}
                  placeholder="+1 (555) 000-0000"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="billing-email">Billing Email</Label>
                <Input
                  id="billing-email"
                  type="email"
                  value={formData.billingEmail}
                  onChange={e => setFormData(prev => ({ ...prev, billingEmail: e.target.value }))}
                />
              </div>
            </div>

            <div className="space-y-4">
              <Label>Address</Label>
              <div className="grid grid-cols-2 gap-4">
                <Input
                  placeholder="Street Address"
                  value={formData.address.street}
                  onChange={e =>
                    setFormData(prev => ({
                      ...prev,
                      address: { ...prev.address, street: e.target.value },
                    }))
                  }
                  className="col-span-2"
                />
                <Input
                  placeholder="City"
                  value={formData.address.city}
                  onChange={e =>
                    setFormData(prev => ({
                      ...prev,
                      address: { ...prev.address, city: e.target.value },
                    }))
                  }
                />
                <Input
                  placeholder="State / Province"
                  value={formData.address.state}
                  onChange={e =>
                    setFormData(prev => ({
                      ...prev,
                      address: { ...prev.address, state: e.target.value },
                    }))
                  }
                />
                <Input
                  placeholder="Country"
                  value={formData.address.country}
                  onChange={e =>
                    setFormData(prev => ({
                      ...prev,
                      address: { ...prev.address, country: e.target.value },
                    }))
                  }
                />
                <Input
                  placeholder="Postal Code"
                  value={formData.address.postalCode}
                  onChange={e =>
                    setFormData(prev => ({
                      ...prev,
                      address: { ...prev.address, postalCode: e.target.value },
                    }))
                  }
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="tech-contact">Technical Contact</Label>
                <Input
                  id="tech-contact"
                  type="email"
                  value={formData.technicalContact}
                  onChange={e =>
                    setFormData(prev => ({ ...prev, technicalContact: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="compliance-officer">Compliance Officer</Label>
                <Input
                  id="compliance-officer"
                  type="email"
                  value={formData.complianceOfficer}
                  onChange={e =>
                    setFormData(prev => ({ ...prev, complianceOfficer: e.target.value }))
                  }
                />
              </div>
            </div>
          </>
        ) : (
          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <Globe className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-sm text-muted-foreground">Website</p>
                  <p className="font-medium">{org.website || 'Not set'}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Phone className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-sm text-muted-foreground">Phone</p>
                  <p className="font-medium">{org.phone || 'Not set'}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Mail className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-sm text-muted-foreground">Billing Email</p>
                  <p className="font-medium">{org.billingEmail || 'Not set'}</p>
                </div>
              </div>
            </div>
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <MapPin className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-sm text-muted-foreground">Address</p>
                  {org.address ? (
                    <p className="font-medium">
                      {org.address.city}, {org.address.state}, {org.address.country}
                    </p>
                  ) : (
                    <p className="font-medium">Not set</p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Key className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-sm text-muted-foreground">Organization ID</p>
                  <code className="font-mono text-sm">{org.id}</code>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Calendar className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-sm text-muted-foreground">Member Since</p>
                  <p className="font-medium">{new Date(org.createdAt).toLocaleDateString()}</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// SUBSCRIPTION MANAGEMENT
// ─────────────────────────────────────────────────────────────────────────────

const SubscriptionManagement: React.FC<{
  org: OrganizationDetails;
  onUpgrade: (tier: SubscriptionTier) => void;
}> = ({ org, onUpgrade }) => {
  const currentTierConfig = SUBSCRIPTION_TIERS[org.subscriptionTier];
  const CurrentIcon = currentTierConfig.icon;

  const usagePercentage = (current: number, max: number) => {
    if (max === -1) return 0;
    return Math.min((current / max) * 100, 100);
  };

  return (
    <div className="space-y-6">
      {/* Current Plan */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className={`p-3 rounded-lg ${currentTierConfig.color}`}>
                <CurrentIcon className="h-6 w-6" />
              </div>
              <div>
                <CardTitle className="flex items-center gap-2">
                  {currentTierConfig.name}
                  <Badge variant="default">Current Plan</Badge>
                </CardTitle>
                <CardDescription>{currentTierConfig.description}</CardDescription>
              </div>
            </div>
            {org.subscriptionTier !== 'enterprise_plus' && (
              <Button onClick={() => onUpgrade('enterprise_plus')}>
                <Zap className="mr-2 h-4 w-4" />
                Upgrade Plan
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-muted-foreground">Subscription Period</p>
              <p className="font-medium">
                {org.subscriptionStartDate.toLocaleDateString()} -{' '}
                {org.subscriptionEndDate?.toLocaleDateString() || 'Ongoing'}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Monthly Price</p>
              <p className="font-medium">
                {currentTierConfig.price === 0
                  ? 'Custom Pricing'
                  : `$${currentTierConfig.price.toLocaleString()}/month`}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Usage Metrics */}
      <Card>
        <CardHeader>
          <CardTitle>Usage Metrics</CardTitle>
          <CardDescription>Current resource usage vs plan limits</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="flex items-center gap-2">
                <Users className="h-4 w-4" />
                Users
              </span>
              <span>
                {org.usage.users} / {org.limits.maxUsers === -1 ? '∞' : org.limits.maxUsers}
              </span>
            </div>
            <Progress
              value={usagePercentage(org.usage.users, org.limits.maxUsers)}
              className="h-2"
            />
          </div>

          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="flex items-center gap-2">
                <Database className="h-4 w-4" />
                Storage (GB)
              </span>
              <span>
                {org.usage.storage} / {org.limits.maxStorage === -1 ? '∞' : org.limits.maxStorage}
              </span>
            </div>
            <Progress
              value={usagePercentage(org.usage.storage, org.limits.maxStorage)}
              className="h-2"
            />
          </div>

          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="flex items-center gap-2">
                <BarChart3 className="h-4 w-4" />
                API Calls (this month)
              </span>
              <span>
                {org.usage.apiCalls.toLocaleString()} /{' '}
                {org.limits.maxApiCalls === -1 ? '∞' : org.limits.maxApiCalls.toLocaleString()}
              </span>
            </div>
            <Progress
              value={usagePercentage(org.usage.apiCalls, org.limits.maxApiCalls)}
              className="h-2"
            />
          </div>
        </CardContent>
      </Card>

      {/* Plan Comparison */}
      <Card>
        <CardHeader>
          <CardTitle>Available Plans</CardTitle>
          <CardDescription>Compare features and upgrade your plan</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-4 gap-4">
            {(
              Object.entries(SUBSCRIPTION_TIERS) as [
                SubscriptionTier,
                typeof SUBSCRIPTION_TIERS.starter,
              ][]
            ).map(([tier, config]) => {
              const Icon = config.icon;
              const isCurrent = tier === org.subscriptionTier;
              return (
                <div
                  key={tier}
                  className={`p-4 rounded-lg border-2 ${
                    isCurrent ? 'border-primary bg-primary/5' : 'border-muted'
                  }`}
                >
                  <div className={`inline-flex p-2 rounded-lg ${config.color} mb-3`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className="font-semibold">{config.name}</h3>
                  <p className="text-sm text-muted-foreground mb-3">{config.description}</p>
                  <p className="text-lg font-bold mb-3">
                    {config.price === 0 ? 'Custom' : `$${config.price}/mo`}
                  </p>
                  <ul className="text-sm space-y-1 mb-4">
                    <li>
                      {config.limits.maxUsers === -1 ? 'Unlimited' : `${config.limits.maxUsers}`}{' '}
                      users
                    </li>
                    <li>
                      {config.limits.maxStorage === -1
                        ? 'Unlimited'
                        : `${config.limits.maxStorage} GB`}{' '}
                      storage
                    </li>
                  </ul>
                  {isCurrent ? (
                    <Badge variant="default" className="w-full justify-center">
                      Current Plan
                    </Badge>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full"
                      onClick={() => onUpgrade(tier)}
                    >
                      {tier > org.subscriptionTier ? 'Upgrade' : 'Downgrade'}
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// FEATURE FLAGS MANAGEMENT
// ─────────────────────────────────────────────────────────────────────────────

const FeatureFlagsManagement: React.FC<{
  features: FeatureFlagConfig[];
  currentTier: SubscriptionTier;
  onToggle: (featureId: string, enabled: boolean) => void;
}> = ({ features, currentTier, onToggle }) => {
  const tierOrder: SubscriptionTier[] = [
    'starter',
    'professional',
    'enterprise',
    'enterprise_plus',
  ];
  const currentTierIndex = tierOrder.indexOf(currentTier);

  const categories = ['core', 'ai', 'compliance', 'integration', 'advanced'] as const;
  const categoryLabels: Record<(typeof categories)[number], string> = {
    core: 'Core Features',
    ai: 'AI & Intelligence',
    compliance: 'Compliance & Security',
    integration: 'Integrations',
    advanced: 'Advanced Features',
  };

  return (
    <div className="space-y-6">
      {categories.map(category => {
        const categoryFeatures = features.filter(f => f.category === category);
        if (categoryFeatures.length === 0) return null;

        return (
          <Card key={category}>
            <CardHeader>
              <CardTitle>{categoryLabels[category]}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {categoryFeatures.map(feature => {
                const requiredTierIndex = tierOrder.indexOf(feature.tier);
                const isAvailable = currentTierIndex >= requiredTierIndex;

                return (
                  <div
                    key={feature.id}
                    className={`flex items-center justify-between p-4 rounded-lg border ${
                      !isAvailable ? 'bg-muted/50' : ''
                    }`}
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-medium">{feature.name}</p>
                        {!isAvailable && (
                          <Badge variant="secondary">
                            {SUBSCRIPTION_TIERS[feature.tier].name}+
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">{feature.description}</p>
                    </div>
                    <Switch
                      checked={feature.enabled && isAvailable}
                      onCheckedChange={checked => onToggle(feature.id, checked)}
                      disabled={!isAvailable}
                    />
                  </div>
                );
              })}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// BRANDING CUSTOMIZATION
// ─────────────────────────────────────────────────────────────────────────────

const BrandingCustomization: React.FC<{
  org: OrganizationDetails;
  onSave: (updates: Partial<OrganizationDetails>) => void;
  isLoading: boolean;
}> = ({ org, onSave, isLoading }) => {
  const [logo, setLogo] = useState(org.logo || '');
  const [primaryColor, setPrimaryColor] = useState(org.primaryColor || '#0066cc');

  const presetColors = [
    '#0066cc',
    '#0d6efd',
    '#6610f2',
    '#6f42c1',
    '#d63384',
    '#dc3545',
    '#fd7e14',
    '#ffc107',
    '#198754',
    '#20c997',
  ];

  const handleSave = () => {
    onSave({ logo, primaryColor });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Branding & Customization</CardTitle>
        <CardDescription>
          Customize the appearance of Concept2Cure for your organization
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Logo Upload */}
        <div className="space-y-3">
          <Label>Organization Logo</Label>
          <div className="flex items-center gap-4">
            <div className="w-24 h-24 rounded-lg border-2 border-dashed flex items-center justify-center bg-muted/50">
              {logo ? (
                <img src={logo} alt="Logo" className="max-w-full max-h-full rounded" />
              ) : (
                <Image className="h-8 w-8 text-muted-foreground" />
              )}
            </div>
            <div className="space-y-2">
              <Button variant="outline">
                <Upload className="mr-2 h-4 w-4" />
                Upload Logo
              </Button>
              <p className="text-xs text-muted-foreground">Recommended: 200x200px, PNG or SVG</p>
            </div>
          </div>
        </div>

        {/* Primary Color */}
        <div className="space-y-3">
          <Label>Primary Brand Color</Label>
          <div className="flex items-center gap-4">
            <div
              className="w-12 h-12 rounded-lg border"
              style={{ backgroundColor: primaryColor }}
            />
            <Input
              value={primaryColor}
              onChange={e => setPrimaryColor(e.target.value)}
              className="w-32 font-mono"
            />
          </div>
          <div className="flex gap-2">
            {presetColors.map(color => (
              <button
                key={color}
                onClick={() => setPrimaryColor(color)}
                className={`w-8 h-8 rounded border-2 transition-all ${
                  primaryColor === color ? 'border-foreground scale-110' : 'border-transparent'
                }`}
                style={{ backgroundColor: color }}
              />
            ))}
          </div>
        </div>

        {/* Preview */}
        <div className="space-y-3">
          <Label>Preview</Label>
          <div className="p-6 rounded-lg border bg-background">
            <div className="flex items-center gap-3 mb-4">
              <div
                className="w-10 h-10 rounded-lg flex items-center justify-center"
                style={{ backgroundColor: primaryColor }}
              >
                <Building2 className="h-5 w-5 text-white" />
              </div>
              <span className="font-semibold">{org.name}</span>
            </div>
            <div className="flex gap-2">
              <Button style={{ backgroundColor: primaryColor }}>Primary Button</Button>
              <Button variant="outline" style={{ borderColor: primaryColor, color: primaryColor }}>
                Secondary
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
      <CardFooter>
        <Button onClick={handleSave} disabled={isLoading}>
          {isLoading ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Save className="mr-2 h-4 w-4" />
          )}
          Save Branding
        </Button>
      </CardFooter>
    </Card>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// MAIN ORGANIZATION MANAGEMENT COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

export const OrganizationManagement: React.FC = () => {
  const [org, setOrg] = useState<OrganizationDetails>(MOCK_ORGANIZATION);
  const [features, setFeatures] = useState<FeatureFlagConfig[]>(FEATURE_FLAGS);
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('profile');

  const handleSaveProfile = async (updates: Partial<OrganizationDetails>) => {
    setIsLoading(true);
    await new Promise(r => setTimeout(r, 800));
    setOrg(prev => ({ ...prev, ...updates }));
    setIsLoading(false);
  };

  const handleUpgrade = async (tier: SubscriptionTier) => {
    setIsLoading(true);
    await new Promise(r => setTimeout(r, 1000));
    setOrg(prev => ({
      ...prev,
      subscriptionTier: tier,
      limits: {
        ...prev.limits,
        ...SUBSCRIPTION_TIERS[tier].limits,
      },
    }));
    setIsLoading(false);
  };

  const handleFeatureToggle = async (featureId: string, enabled: boolean) => {
    setFeatures(prev => prev.map(f => (f.id === featureId ? { ...f, enabled } : f)));
  };

  return (
    <div className="container max-w-6xl py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold">Organization Settings</h1>
        <p className="text-muted-foreground">
          Manage your organization profile, subscription, and features
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-6">
          <TabsTrigger value="profile">
            <Building2 className="mr-2 h-4 w-4" />
            Profile
          </TabsTrigger>
          <TabsTrigger value="subscription">
            <CreditCard className="mr-2 h-4 w-4" />
            Subscription
          </TabsTrigger>
          <TabsTrigger value="features">
            <Settings className="mr-2 h-4 w-4" />
            Features
          </TabsTrigger>
          <TabsTrigger value="branding">
            <Palette className="mr-2 h-4 w-4" />
            Branding
          </TabsTrigger>
        </TabsList>

        <TabsContent value="profile">
          <OrganizationProfile org={org} onSave={handleSaveProfile} isLoading={isLoading} />
        </TabsContent>

        <TabsContent value="subscription">
          <SubscriptionManagement org={org} onUpgrade={handleUpgrade} />
        </TabsContent>

        <TabsContent value="features">
          <FeatureFlagsManagement
            features={features}
            currentTier={org.subscriptionTier}
            onToggle={handleFeatureToggle}
          />
        </TabsContent>

        <TabsContent value="branding">
          <BrandingCustomization org={org} onSave={handleSaveProfile} isLoading={isLoading} />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default OrganizationManagement;
