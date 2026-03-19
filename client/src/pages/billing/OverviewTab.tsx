import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Settings, Zap } from 'lucide-react';

import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';

import { BillingStatus, apiFetch, formatCurrency, formatDate } from './billingTypes';

export default function OverviewTab({ data }: { data: BillingStatus }) {
  const queryClient = useQueryClient();

  const portalMutation = useMutation({
    mutationFn: () => apiFetch<{ url: string }>('/api/billing/portal', { method: 'POST' }),
    onSuccess: (res) => {
      window.location.href = res.url;
    },
  });

  const { plan, currentMonth, recentActivity } = data;

  return (
    <div className="space-y-6">
      {/* Plan + Quick Stats */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        <Card className="md:col-span-2 lg:col-span-1">
          <CardHeader className="pb-2">
            <CardDescription>Current Plan</CardDescription>
            <CardTitle className="text-xl">{plan.name}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(plan.price)}</div>
            <p className="text-xs text-muted-foreground capitalize">per {plan.billingCycle === 'annual' ? 'year' : 'month'}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Month-to-Date Spend</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold">{formatCurrency(currentMonth.spend)}</span>
            </div>
            {currentMonth.budget && (
              <p className="mt-1 text-xs text-muted-foreground">
                of {formatCurrency(currentMonth.budget)} budget
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Credits Remaining</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(currentMonth.creditsRemaining)}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Seats</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {plan.seats.used} <span className="text-base font-normal text-muted-foreground">/ {plan.seats.total}</span>
            </div>
            <Progress value={(plan.seats.used / plan.seats.total) * 100} className="mt-2 h-2" />
          </CardContent>
        </Card>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-3">
        <Button
          onClick={() => portalMutation.mutate()}
          disabled={portalMutation.isPending}
        >
          <Settings className="mr-2 h-4 w-4" />
          {portalMutation.isPending ? 'Redirecting...' : 'Manage Subscription'}
        </Button>
        <Button variant="outline" asChild>
          <a href="/billing/plans">
            <Zap className="mr-2 h-4 w-4" />
            Upgrade Plan
          </a>
        </Button>
      </div>

      {/* Recent Activity */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Recent Activity</CardTitle>
        </CardHeader>
        <CardContent>
          {recentActivity.length === 0 ? (
            <p className="text-sm text-muted-foreground">No recent activity.</p>
          ) : (
            <div className="space-y-4">
              {recentActivity.slice(0, 5).map((event) => (
                <div key={event.id} className="flex items-start justify-between border-b pb-3 last:border-0 last:pb-0">
                  <div>
                    <p className="text-sm font-medium">{event.description}</p>
                    <p className="text-xs text-muted-foreground">{formatDate(event.timestamp)}</p>
                  </div>
                  {event.amount != null && (
                    <span className="text-sm font-medium">{formatCurrency(event.amount)}</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
