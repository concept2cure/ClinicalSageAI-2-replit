import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { DollarSign, Bell, AlertTriangle, CheckCircle } from 'lucide-react';

import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Progress } from '@/components/ui/progress';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
} from '@/components/ui/table';

import { BillingStatus, BudgetSettings, apiFetch, formatCurrency, formatDate } from './billingTypes';

export default function BudgetAlertsTab() {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery<BudgetSettings>({
    queryKey: ['billing-budget'],
    queryFn: () => apiFetch<BudgetSettings>('/api/billing/budget'),
  });

  const [budget, setBudget] = useState<string>('');
  const [thresholds, setThresholds] = useState<BudgetSettings['alertThresholds']>([
    { percent: 50, enabled: true, email: false },
    { percent: 75, enabled: true, email: true },
    { percent: 90, enabled: true, email: true },
    { percent: 100, enabled: true, email: true },
  ]);
  const [hardLimit, setHardLimit] = useState(false);
  const [notifications, setNotifications] = useState({ email: true, inApp: true });
  const [initialized, setInitialized] = useState(false);

  React.useEffect(() => {
    if (data && !initialized) {
      setBudget(data.monthlyBudget != null ? String(data.monthlyBudget) : '');
      setThresholds(data.alertThresholds);
      setHardLimit(data.hardLimit);
      setNotifications(data.notifications);
      setInitialized(true);
    }
  }, [data, initialized]);

  const saveMutation = useMutation({
    mutationFn: (payload: Partial<BudgetSettings>) =>
      apiFetch('/api/billing/budget', { method: 'PUT', body: JSON.stringify(payload) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['billing-budget'] }),
  });

  function handleSave() {
    saveMutation.mutate({ monthlyBudget: budget ? parseFloat(budget) : null, alertThresholds: thresholds, hardLimit, notifications });
  }

  const budgetNum = budget ? parseFloat(budget) : 0;
  const cachedStatus = queryClient.getQueryData<BillingStatus>(['billing-status']);
  const currentSpend = cachedStatus?.currentMonth?.spend ?? 0;
  const spendPercent = budgetNum > 0 ? Math.min((currentSpend / budgetNum) * 100, 100) : 0;

  return (
    <div className="space-y-6">
      {isLoading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">Loading budget settings...</div>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Monthly Budget</CardTitle>
              <CardDescription>Set a monthly spending budget and receive alerts as you approach the limit.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-end gap-4">
                <div className="flex-1 max-w-xs">
                  <label className="text-sm font-medium mb-1.5 block">Budget Amount (USD)</label>
                  <div className="relative">
                    <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input type="number" value={budget} onChange={(e) => setBudget(e.target.value)} placeholder="1000.00" className="pl-9" min={0} step={0.01} />
                  </div>
                </div>
                <Button onClick={handleSave} disabled={saveMutation.isPending}>
                  {saveMutation.isPending ? 'Saving...' : 'Save Budget'}
                </Button>
              </div>
              {budgetNum > 0 && (
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span>{formatCurrency(currentSpend)} spent</span>
                    <span>{formatCurrency(budgetNum)} budget</span>
                  </div>
                  <Progress value={spendPercent} className="h-3" indicatorClassName={spendPercent >= 90 ? 'bg-red-500' : spendPercent >= 75 ? 'bg-amber-500' : 'bg-emerald-500'} />
                  <p className="text-xs text-muted-foreground mt-1">{spendPercent.toFixed(1)}% of budget used</p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Alert Thresholds</CardTitle>
              <CardDescription>Configure when you receive budget alerts.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {thresholds.map((t, i) => (
                <div key={t.percent} className="flex items-center justify-between rounded-lg border p-4">
                  <div className="flex items-center gap-3">
                    <Checkbox checked={t.enabled} onCheckedChange={(checked) => { const next = [...thresholds]; next[i] = { ...next[i], enabled: !!checked }; setThresholds(next); }} />
                    <div>
                      <p className="text-sm font-medium">{t.percent}% of budget</p>
                      <p className="text-xs text-muted-foreground">Alert when spend reaches {formatCurrency(budgetNum * t.percent / 100)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-muted-foreground">Email</label>
                    <Switch checked={t.email} onCheckedChange={(checked) => { const next = [...thresholds]; next[i] = { ...next[i], email: !!checked }; setThresholds(next); }} disabled={!t.enabled} />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Hard Limit</CardTitle>
                <CardDescription>Pause usage when your budget is exceeded.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">Pause usage at budget limit</p>
                    <p className="text-xs text-muted-foreground">API requests will be rejected once the monthly budget is reached.</p>
                  </div>
                  <Switch checked={hardLimit} onCheckedChange={setHardLimit} />
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Notification Preferences</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2"><Bell className="h-4 w-4 text-muted-foreground" /><span className="text-sm">Email Alerts</span></div>
                  <Switch checked={notifications.email} onCheckedChange={(checked) => setNotifications((n) => ({ ...n, email: !!checked }))} />
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2"><Bell className="h-4 w-4 text-muted-foreground" /><span className="text-sm">In-App Notifications</span></div>
                  <Switch checked={notifications.inApp} onCheckedChange={(checked) => setNotifications((n) => ({ ...n, inApp: !!checked }))} />
                </div>
              </CardContent>
              <CardFooter>
                <Button size="sm" onClick={handleSave} disabled={saveMutation.isPending}>{saveMutation.isPending ? 'Saving...' : 'Save Preferences'}</Button>
              </CardFooter>
            </Card>
          </div>

          <Card>
            <CardHeader><CardTitle className="text-lg">Alert History</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Type</TableHead>
                    <TableHead>Message</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {!data?.alertHistory?.length ? (
                    <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">No alert history.</TableCell></TableRow>
                  ) : (
                    data.alertHistory.map((alert) => (
                      <TableRow key={alert.id}>
                        <TableCell><Badge variant="outline">{alert.type}</Badge></TableCell>
                        <TableCell className="text-sm">{alert.message}</TableCell>
                        <TableCell className="text-sm">{formatDate(alert.timestamp)}</TableCell>
                        <TableCell>
                          {alert.resolved ? (
                            <span className="flex items-center gap-1 text-emerald-600 text-xs font-medium"><CheckCircle className="h-3.5 w-3.5" /> Resolved</span>
                          ) : (
                            <span className="flex items-center gap-1 text-amber-600 text-xs font-medium"><AlertTriangle className="h-3.5 w-3.5" /> Active</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
