import React from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  CreditCard,
  AlertTriangle,
  Calendar,
  BarChart3,
  Receipt,
  Gauge,
} from 'lucide-react';

import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

import { BillingStatus, apiFetch, formatDate, StatusBadge } from './billingTypes';
import OverviewTab from './OverviewTab';
import UsageTab from './UsageTab';
import InvoicesTab from './InvoicesTab';
import BudgetAlertsTab from './BudgetAlertsTab';
import PlanRateLimitsTab from './PlanRateLimitsTab';

export default function BillingDashboard() {
  const { data: billingStatus, isLoading } = useQuery<BillingStatus>({
    queryKey: ['billing-status'],
    queryFn: () => apiFetch<BillingStatus>('/api/billing/status'),
  });

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Billing</h1>
              <p className="text-muted-foreground mt-1">
                Manage your subscription, usage, and billing preferences.
              </p>
            </div>
            {billingStatus && (
              <div className="flex items-center gap-3 text-sm">
                <StatusBadge status={billingStatus.plan.status} />
                <span className="text-muted-foreground">
                  {billingStatus.plan.name}
                </span>
                <span className="text-muted-foreground">
                  <Calendar className="inline h-3.5 w-3.5 mr-1" />
                  Next billing: {formatDate(billingStatus.plan.nextBillingDate)}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="usage">
          <TabsList className="mb-6 w-full justify-start overflow-x-auto">
            <TabsTrigger value="overview" className="gap-1.5">
              <CreditCard className="h-4 w-4" />
              Overview
            </TabsTrigger>
            <TabsTrigger value="usage" className="gap-1.5">
              <BarChart3 className="h-4 w-4" />
              Usage
            </TabsTrigger>
            <TabsTrigger value="invoices" className="gap-1.5">
              <Receipt className="h-4 w-4" />
              Invoices
            </TabsTrigger>
            <TabsTrigger value="budget" className="gap-1.5">
              <AlertTriangle className="h-4 w-4" />
              Budget & Alerts
            </TabsTrigger>
            <TabsTrigger value="plan" className="gap-1.5">
              <Gauge className="h-4 w-4" />
              Plan & Rate Limits
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview">
            {isLoading ? (
              <div className="flex items-center justify-center py-12 text-muted-foreground">
                Loading billing overview...
              </div>
            ) : billingStatus ? (
              <OverviewTab data={billingStatus} />
            ) : (
              <div className="flex items-center justify-center py-12 text-muted-foreground">
                Unable to load billing data.
              </div>
            )}
          </TabsContent>

          <TabsContent value="usage">
            <UsageTab />
          </TabsContent>

          <TabsContent value="invoices">
            <InvoicesTab />
          </TabsContent>

          <TabsContent value="budget">
            <BudgetAlertsTab />
          </TabsContent>

          <TabsContent value="plan">
            <PlanRateLimitsTab />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
