import { useQuery } from '@tanstack/react-query';
import { CheckCircle, XCircle } from 'lucide-react';

import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
} from '@/components/ui/table';

import { RateLimits, apiFetch, formatCurrency, formatNumber } from './billingTypes';

export default function PlanRateLimitsTab() {
  const { data, isLoading } = useQuery<RateLimits>({
    queryKey: ['billing-rate-limits'],
    queryFn: () => apiFetch<RateLimits>('/api/billing/rate-limits'),
  });

  if (isLoading) {
    return <div className="flex items-center justify-center py-12 text-muted-foreground">Loading plan details...</div>;
  }
  if (!data) return null;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg">{data.plan.name}</CardTitle>
              <CardDescription className="capitalize">{data.plan.tier} tier</CardDescription>
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold">{formatCurrency(data.plan.price)}</div>
              <p className="text-xs text-muted-foreground">per {data.plan.billingCycle}</p>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {data.plan.features.map((f) => <Badge key={f} variant="secondary">{f}</Badge>)}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Rate Limits</CardTitle>
          <CardDescription>API rate limits for your current plan.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Module</TableHead>
                <TableHead className="text-right">Requests / min</TableHead>
                <TableHead className="text-right">Requests / day</TableHead>
                <TableHead className="text-right">Tokens / day</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.limits.map((limit) => (
                <TableRow key={limit.module}>
                  <TableCell className="font-medium">{limit.module}</TableCell>
                  <TableCell className="text-right">{formatNumber(limit.requestsPerMin)}</TableCell>
                  <TableCell className="text-right">{formatNumber(limit.requestsPerDay)}</TableCell>
                  <TableCell className="text-right">{formatNumber(limit.tokensPerDay)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Feature Availability</CardTitle>
          <CardDescription>Features included in your current plan.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Feature</TableHead>
                <TableHead className="text-center">Included</TableHead>
                <TableHead className="text-right">Limit</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.featureMatrix.map((f) => (
                <TableRow key={f.feature}>
                  <TableCell className="font-medium">{f.feature}</TableCell>
                  <TableCell className="text-center">
                    {f.included ? <CheckCircle className="mx-auto h-4 w-4 text-emerald-500" /> : <XCircle className="mx-auto h-4 w-4 text-muted-foreground" />}
                  </TableCell>
                  <TableCell className="text-right text-sm text-muted-foreground">{f.limit ?? (f.included ? 'Unlimited' : '--')}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {data.upgradePlans && data.upgradePlans.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Upgrade Options</CardTitle>
            <CardDescription>Compare plans and unlock more features.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {data.upgradePlans.map((plan) => (
                <div key={plan.tier} className="rounded-lg border p-5 hover:border-primary/50 transition-colors">
                  <h4 className="font-semibold">{plan.name}</h4>
                  <p className="text-2xl font-bold mt-1">{formatCurrency(plan.price)}<span className="text-sm font-normal text-muted-foreground">/mo</span></p>
                  <ul className="mt-3 space-y-1.5">
                    {plan.highlights.map((h) => (
                      <li key={h} className="flex items-start gap-2 text-sm">
                        <CheckCircle className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />{h}
                      </li>
                    ))}
                  </ul>
                  <Button className="w-full mt-4" variant="outline" asChild>
                    <a href={`/billing/plans?upgrade=${plan.tier}`}>Upgrade to {plan.name}</a>
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
