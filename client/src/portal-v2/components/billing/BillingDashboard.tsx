/**
 * Billing Dashboard
 *
 * Self-service billing management component modeled after Claude/Anthropic's
 * billing UX. Shows current plan, usage, and provides upgrade/management via
 * Stripe Checkout (with Link) and Stripe Customer Portal.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  CreditCard,
  ArrowUpRight,
  CheckCircle,
  AlertTriangle,
  XCircle,
  Zap,
  Users,
  HardDrive,
  FolderOpen,
  ExternalLink,
  Loader2,
} from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

interface SubscriptionStatus {
  active: boolean;
  tier: string;
  billingCycle: string;
  paymentStatus: string;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  seats: number;
  stripeSubscriptionId: string | null;
}

interface PricingTier {
  name: string;
  tier: string;
  baseMonthly: number;
  perSeatMonthly: number;
  annualDiscountPct: number;
  maxUsers: number;
  maxProjects: number | string;
  maxStorageGB: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export default function BillingDashboard() {
  const [subscription, setSubscription] = useState<SubscriptionStatus | null>(null);
  const [pricing, setPricing] = useState<PricingTier[]>([]);
  const [loading, setLoading] = useState(true);
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'annual'>('annual');

  // Fetch subscription status and pricing
  useEffect(() => {
    async function fetchData() {
      try {
        const [statusRes, pricingRes] = await Promise.all([
          apiRequest('GET', '/api/billing/status'),
          apiRequest('GET', '/api/billing/pricing'),
        ]);

        if (statusRes.ok) {
          const statusData = await statusRes.json();
          setSubscription(statusData);
        }

        if (pricingRes.ok) {
          const pricingData = await pricingRes.json();
          setPricing(pricingData.tiers || []);
        }
      } catch (err) {
        setError('Failed to load billing information');
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  // Create Stripe Checkout Session
  const handleUpgrade = useCallback(async (tier: string) => {
    setCheckoutLoading(tier);
    setError(null);
    try {
      const res = await apiRequest('POST', '/api/billing/checkout', {
        tier,
        billingCycle,
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to create checkout session');
      }

      const data = await res.json();
      // Redirect to Stripe Checkout (with Link enabled)
      window.location.href = data.checkoutUrl;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Checkout failed');
    } finally {
      setCheckoutLoading(null);
    }
  }, [billingCycle]);

  // Open Stripe Customer Portal
  const handleManageBilling = useCallback(async () => {
    setPortalLoading(true);
    setError(null);
    try {
      const res = await apiRequest('POST', '/api/billing/portal');

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to open billing portal');
      }

      const data = await res.json();
      window.location.href = data.portalUrl;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Portal access failed');
    } finally {
      setPortalLoading(false);
    }
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
      </div>
    );
  }

  const tierOrder = ['standard', 'professional', 'enterprise'];
  const currentTierIndex = subscription ? tierOrder.indexOf(subscription.tier) : -1;

  return (
    <div className="max-w-5xl mx-auto space-y-8 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Billing & Subscription</h1>
          <p className="text-gray-500 mt-1">
            Manage your Concept2Cure.RI subscription and billing
          </p>
        </div>
        {subscription?.stripeSubscriptionId && (
          <Button
            variant="outline"
            onClick={handleManageBilling}
            disabled={portalLoading}
          >
            {portalLoading ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <ExternalLink className="h-4 w-4 mr-2" />
            )}
            Manage Billing
          </Button>
        )}
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Current Plan Card */}
      {subscription && (
        <div className="rounded-xl border bg-gradient-to-r from-blue-50 to-indigo-50 p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-blue-100 rounded-lg">
                <CreditCard className="h-6 w-6 text-blue-600" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-semibold">
                    {subscription.tier.charAt(0).toUpperCase() + subscription.tier.slice(1)} Plan
                  </h2>
                  <PaymentStatusBadge status={subscription.paymentStatus} />
                </div>
                <p className="text-sm text-gray-600">
                  {subscription.billingCycle === 'annual' ? 'Annual' : 'Monthly'} billing
                  {subscription.currentPeriodEnd && (
                    <> — renews {new Date(subscription.currentPeriodEnd).toLocaleDateString()}</>
                  )}
                </p>
              </div>
            </div>
            <div className="text-right">
              <div className="flex items-center gap-3">
                <UsageStat icon={Users} label="Seats" value={subscription.seats} />
              </div>
            </div>
          </div>

          {subscription.cancelAtPeriodEnd && (
            <Alert className="mt-4 bg-amber-50 border-amber-200">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              <AlertDescription className="text-amber-800">
                Your subscription will cancel at the end of the current billing period.
                <Button
                  variant="link"
                  className="text-amber-800 underline pl-1"
                  onClick={handleManageBilling}
                >
                  Reactivate
                </Button>
              </AlertDescription>
            </Alert>
          )}
        </div>
      )}

      {/* Billing Cycle Toggle */}
      <div className="flex items-center justify-center gap-4">
        <button
          className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
            billingCycle === 'monthly'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
          onClick={() => setBillingCycle('monthly')}
        >
          Monthly
        </button>
        <button
          className={`px-4 py-2 rounded-lg text-sm font-medium transition flex items-center gap-2 ${
            billingCycle === 'annual'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
          onClick={() => setBillingCycle('annual')}
        >
          Annual
          <Badge className="bg-green-100 text-green-700 text-xs">Save up to 20%</Badge>
        </button>
      </div>

      {/* Pricing Tiers */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {pricing.map((tier) => {
          const tierIndex = tierOrder.indexOf(tier.tier);
          const isCurrent = subscription?.tier === tier.tier;
          const isUpgrade = tierIndex > currentTierIndex;
          const isRecommended = tier.tier === 'professional';

          const displayPrice = billingCycle === 'annual'
            ? tier.baseMonthly * (1 - tier.annualDiscountPct / 100)
            : tier.baseMonthly;

          return (
            <div
              key={tier.tier}
              className={`relative rounded-xl border-2 p-6 transition ${
                isRecommended
                  ? 'border-blue-500 shadow-lg'
                  : isCurrent
                  ? 'border-green-500 bg-green-50/30'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              {isRecommended && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <Badge className="bg-blue-600 text-white px-3">Recommended</Badge>
                </div>
              )}

              <div className="mb-4">
                <h3 className="text-lg font-semibold">{tier.name}</h3>
                <div className="mt-2">
                  <span className="text-3xl font-bold">
                    ${Math.round(displayPrice).toLocaleString()}
                  </span>
                  <span className="text-gray-500">/mo</span>
                </div>
                {billingCycle === 'annual' && (
                  <p className="text-sm text-green-600 mt-1">
                    Save {tier.annualDiscountPct}% with annual billing
                  </p>
                )}
                <p className="text-sm text-gray-500 mt-1">
                  + ${tier.perSeatMonthly}/seat/mo
                </p>
              </div>

              <ul className="space-y-2 mb-6 text-sm">
                <li className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-gray-400" />
                  Up to {tier.maxUsers} users
                </li>
                <li className="flex items-center gap-2">
                  <FolderOpen className="h-4 w-4 text-gray-400" />
                  {tier.maxProjects === 'Unlimited' ? 'Unlimited' : `${tier.maxProjects}`} projects
                </li>
                <li className="flex items-center gap-2">
                  <HardDrive className="h-4 w-4 text-gray-400" />
                  {tier.maxStorageGB} GB storage
                </li>
              </ul>

              {isCurrent ? (
                <Button variant="outline" className="w-full" disabled>
                  <CheckCircle className="h-4 w-4 mr-2 text-green-500" />
                  Current Plan
                </Button>
              ) : isUpgrade ? (
                <Button
                  className="w-full bg-blue-600 hover:bg-blue-700"
                  onClick={() => handleUpgrade(tier.tier)}
                  disabled={checkoutLoading !== null}
                >
                  {checkoutLoading === tier.tier ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Zap className="h-4 w-4 mr-2" />
                  )}
                  Upgrade
                </Button>
              ) : (
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={handleManageBilling}
                >
                  <ArrowUpRight className="h-4 w-4 mr-2" />
                  Change Plan
                </Button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// SUB-COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════════

function PaymentStatusBadge({ status }: { status: string }) {
  switch (status) {
    case 'active':
      return <Badge className="bg-green-100 text-green-700">Active</Badge>;
    case 'trialing':
      return <Badge className="bg-blue-100 text-blue-700">Trial</Badge>;
    case 'past_due':
      return <Badge className="bg-red-100 text-red-700">Past Due</Badge>;
    case 'canceled':
      return <Badge className="bg-gray-100 text-gray-700">Canceled</Badge>;
    case 'incomplete':
      return <Badge className="bg-amber-100 text-amber-700">Incomplete</Badge>;
    default:
      return <Badge className="bg-gray-100 text-gray-600">{status}</Badge>;
  }
}

function UsageStat({ icon: Icon, label, value }: { icon: any; label: string; value: number }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <Icon className="h-4 w-4 text-gray-400" />
      <span className="text-gray-600">{label}:</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
