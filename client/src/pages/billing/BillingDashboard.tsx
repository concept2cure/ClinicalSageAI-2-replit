import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import {
  CreditCard,
  Download,
  FileText,
  AlertTriangle,
  Bell,
  Zap,
  Calendar,
  DollarSign,
  Users,
  CheckCircle,
  XCircle,
  ChevronLeft,
  ChevronRight,
  Settings,
  BarChart3,
  Receipt,
  Gauge,
} from 'lucide-react';

import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Progress } from '@/components/ui/progress';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

// ------------------------------------------------------------------
// Types
// ------------------------------------------------------------------

interface BillingStatus {
  plan: {
    tier: string;
    name: string;
    price: number;
    billingCycle: 'monthly' | 'annual';
    status: 'active' | 'trialing' | 'past_due' | 'canceled';
    nextBillingDate: string;
    seats: { used: number; total: number };
  };
  currentMonth: {
    spend: number;
    creditsRemaining: number;
    budget: number | null;
  };
  recentActivity: Array<{
    id: string;
    type: string;
    description: string;
    timestamp: string;
    amount?: number;
  }>;
}

interface UsageRecord {
  date: string;
  module: string;
  requests: number;
  tokensUsed: number;
  cost: number;
}

interface UsageData {
  daily: Array<{
    date: string;
    cost: number;
    requests: number;
    tokens: number;
  }>;
  byModule: Array<{
    module: string;
    requests: number;
    tokens: number;
    cost: number;
  }>;
  records: UsageRecord[];
  total: { cost: number; requests: number; tokens: number };
}

interface Invoice {
  id: string;
  number: string;
  date: string;
  amount: number;
  status: 'paid' | 'pending' | 'failed';
  pdfUrl: string;
}

interface InvoicesResponse {
  invoices: Invoice[];
  total: number;
  page: number;
  pageSize: number;
}

interface BudgetSettings {
  monthlyBudget: number | null;
  alertThresholds: { percent: number; enabled: boolean; email: boolean }[];
  hardLimit: boolean;
  notifications: { email: boolean; inApp: boolean };
  alertHistory: Array<{
    id: string;
    type: string;
    message: string;
    timestamp: string;
    resolved: boolean;
  }>;
}

interface RateLimits {
  plan: {
    tier: string;
    name: string;
    price: number;
    billingCycle: string;
    features: string[];
  };
  limits: Array<{
    module: string;
    requestsPerMin: number;
    requestsPerDay: number;
    tokensPerDay: number;
  }>;
  featureMatrix: Array<{
    feature: string;
    included: boolean;
    limit?: string;
  }>;
  upgradePlans?: Array<{
    tier: string;
    name: string;
    price: number;
    highlights: string[];
  }>;
}

// ------------------------------------------------------------------
// API helpers
// ------------------------------------------------------------------

async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

// ------------------------------------------------------------------
// Sub-components
// ------------------------------------------------------------------

const MODULE_COLORS: Record<string, string> = {
  '510(k)': '#6366f1',
  CER: '#8b5cf6',
  eCTD: '#a78bfa',
  CMC: '#c4b5fd',
  'AI Assistance': '#818cf8',
};

const PIE_COLORS = ['#6366f1', '#8b5cf6', '#a78bfa', '#c4b5fd', '#818cf8'];

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}

function formatNumber(n: number): string {
  return new Intl.NumberFormat('en-US').format(n);
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function StatusBadge({ status }: { status: string }) {
  const variants: Record<string, { label: string; className: string }> = {
    active: { label: 'Active', className: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
    trialing: { label: 'Trial', className: 'bg-blue-100 text-blue-700 border-blue-200' },
    past_due: { label: 'Past Due', className: 'bg-amber-100 text-amber-700 border-amber-200' },
    canceled: { label: 'Canceled', className: 'bg-red-100 text-red-700 border-red-200' },
    paid: { label: 'Paid', className: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
    pending: { label: 'Pending', className: 'bg-amber-100 text-amber-700 border-amber-200' },
    failed: { label: 'Failed', className: 'bg-red-100 text-red-700 border-red-200' },
  };
  const v = variants[status] ?? { label: status, className: 'bg-gray-100 text-gray-700 border-gray-200' };
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${v.className}`}>
      {v.label}
    </span>
  );
}

// ------------------------------------------------------------------
// Overview Tab
// ------------------------------------------------------------------

function OverviewTab({ data }: { data: BillingStatus }) {
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

// ------------------------------------------------------------------
// Usage Tab
// ------------------------------------------------------------------

function UsageTab() {
  const [range, setRange] = useState<string>('30d');

  const { data, isLoading } = useQuery<UsageData>({
    queryKey: ['billing-usage', range],
    queryFn: () => apiFetch<UsageData>(`/api/billing/usage?range=${range}`),
  });

  function exportCsv() {
    if (!data?.records) return;
    const header = 'Date,Module,Requests,Tokens Used,Cost\n';
    const rows = data.records
      .map((r) => `${r.date},${r.module},${r.requests},${r.tokensUsed},${r.cost.toFixed(4)}`)
      .join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `usage-${range}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex gap-2">
          {['7d', '30d', '90d'].map((r) => (
            <Button
              key={r}
              variant={range === r ? 'default' : 'outline'}
              size="sm"
              onClick={() => setRange(r)}
            >
              {r}
            </Button>
          ))}
        </div>
        <Button variant="outline" size="sm" onClick={exportCsv} disabled={!data}>
          <Download className="mr-2 h-4 w-4" />
          Export CSV
        </Button>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          Loading usage data...
        </div>
      )}

      {data && (
        <>
          {/* Total Summary */}
          <div className="grid gap-4 sm:grid-cols-3">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Total Cost</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatCurrency(data.total.cost)}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Total Requests</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatNumber(data.total.requests)}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Total Tokens</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatNumber(data.total.tokens)}</div>
              </CardContent>
            </Card>
          </div>

          {/* Daily Cost Line Chart */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Daily API Cost</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={data.daily}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                    <YAxis tickFormatter={(v: number) => `$${v}`} tick={{ fontSize: 12 }} />
                    <Tooltip
                      formatter={(value: number) => [formatCurrency(value), 'Cost']}
                      labelFormatter={(label: string) => formatDate(label)}
                    />
                    <Line
                      type="monotone"
                      dataKey="cost"
                      stroke="#6366f1"
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 4 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Module Breakdown */}
          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Cost by Module</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={data.byModule}
                        dataKey="cost"
                        nameKey="module"
                        cx="50%"
                        cy="50%"
                        outerRadius={90}
                        label={({ module, percent }: { module: string; percent: number }) =>
                          `${module} ${(percent * 100).toFixed(0)}%`
                        }
                      >
                        {data.byModule.map((_, i) => (
                          <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value: number) => formatCurrency(value)} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Requests by Module</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data.byModule} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis type="number" tick={{ fontSize: 12 }} />
                      <YAxis dataKey="module" type="category" width={100} tick={{ fontSize: 12 }} />
                      <Tooltip formatter={(value: number) => formatNumber(value)} />
                      <Bar dataKey="requests" fill="#6366f1" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Usage Records Table */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Usage Details</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Module</TableHead>
                    <TableHead className="text-right">Requests</TableHead>
                    <TableHead className="text-right">Tokens Used</TableHead>
                    <TableHead className="text-right">Cost</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.records.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground">
                        No usage records for this period.
                      </TableCell>
                    </TableRow>
                  ) : (
                    data.records.map((r, i) => (
                      <TableRow key={i}>
                        <TableCell>{formatDate(r.date)}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="font-normal">
                            {r.module}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">{formatNumber(r.requests)}</TableCell>
                        <TableCell className="text-right">{formatNumber(r.tokensUsed)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(r.cost)}</TableCell>
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

// ------------------------------------------------------------------
// Invoices Tab
// ------------------------------------------------------------------

function InvoicesTab() {
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const { data, isLoading } = useQuery<InvoicesResponse>({
    queryKey: ['billing-invoices', page],
    queryFn: () => apiFetch<InvoicesResponse>(`/api/billing/invoices?page=${page}&pageSize=${pageSize}`),
  });

  const totalPages = data ? Math.ceil(data.total / pageSize) : 1;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Invoices</CardTitle>
          <CardDescription>View and download your billing invoices.</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              Loading invoices...
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Invoice #</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {!data?.invoices?.length ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground">
                        No invoices found.
                      </TableCell>
                    </TableRow>
                  ) : (
                    data.invoices.map((inv) => (
                      <TableRow key={inv.id}>
                        <TableCell className="font-medium">{inv.number}</TableCell>
                        <TableCell>{formatDate(inv.date)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(inv.amount)}</TableCell>
                        <TableCell>
                          <StatusBadge status={inv.status} />
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button variant="ghost" size="sm" asChild>
                              <a href={inv.pdfUrl} target="_blank" rel="noopener noreferrer">
                                <Download className="mr-1 h-3.5 w-3.5" />
                                PDF
                              </a>
                            </Button>
                            <Button variant="ghost" size="sm" asChild>
                              <a href={`/billing/invoices/${inv.id}`}>
                                <FileText className="mr-1 h-3.5 w-3.5" />
                                View
                              </a>
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="mt-4 flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">
                    Page {page} of {totalPages} ({data?.total ?? 0} invoices)
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page <= 1}
                      onClick={() => setPage((p) => p - 1)}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page >= totalPages}
                      onClick={() => setPage((p) => p + 1)}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ------------------------------------------------------------------
// Budget & Alerts Tab
// ------------------------------------------------------------------

function BudgetAlertsTab() {
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

  // Hydrate local state from server data
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
      apiFetch('/api/billing/budget', {
        method: 'PUT',
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['billing-budget'] });
    },
  });

  function handleSave() {
    saveMutation.mutate({
      monthlyBudget: budget ? parseFloat(budget) : null,
      alertThresholds: thresholds,
      hardLimit,
      notifications,
    });
  }

  const budgetNum = budget ? parseFloat(budget) : 0;
  // We read currentMonth spend from the billing status query if available
  const cachedStatus = queryClient.getQueryData<BillingStatus>(['billing-status']);
  const currentSpend = cachedStatus?.currentMonth?.spend ?? 0;
  const spendPercent = budgetNum > 0 ? Math.min((currentSpend / budgetNum) * 100, 100) : 0;

  return (
    <div className="space-y-6">
      {isLoading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          Loading budget settings...
        </div>
      ) : (
        <>
          {/* Budget Setting */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Monthly Budget</CardTitle>
              <CardDescription>
                Set a monthly spending budget and receive alerts as you approach the limit.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-end gap-4">
                <div className="flex-1 max-w-xs">
                  <label className="text-sm font-medium mb-1.5 block">Budget Amount (USD)</label>
                  <div className="relative">
                    <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      type="number"
                      value={budget}
                      onChange={(e) => setBudget(e.target.value)}
                      placeholder="1000.00"
                      className="pl-9"
                      min={0}
                      step={0.01}
                    />
                  </div>
                </div>
                <Button onClick={handleSave} disabled={saveMutation.isPending}>
                  {saveMutation.isPending ? 'Saving...' : 'Save Budget'}
                </Button>
              </div>

              {/* Spend vs Budget Progress */}
              {budgetNum > 0 && (
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span>{formatCurrency(currentSpend)} spent</span>
                    <span>{formatCurrency(budgetNum)} budget</span>
                  </div>
                  <Progress
                    value={spendPercent}
                    className="h-3"
                    indicatorClassName={
                      spendPercent >= 90
                        ? 'bg-red-500'
                        : spendPercent >= 75
                          ? 'bg-amber-500'
                          : 'bg-emerald-500'
                    }
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    {spendPercent.toFixed(1)}% of budget used
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Alert Thresholds */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Alert Thresholds</CardTitle>
              <CardDescription>
                Configure when you receive budget alerts.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {thresholds.map((t, i) => (
                <div key={t.percent} className="flex items-center justify-between rounded-lg border p-4">
                  <div className="flex items-center gap-3">
                    <Checkbox
                      checked={t.enabled}
                      onCheckedChange={(checked) => {
                        const next = [...thresholds];
                        next[i] = { ...next[i], enabled: !!checked };
                        setThresholds(next);
                      }}
                    />
                    <div>
                      <p className="text-sm font-medium">{t.percent}% of budget</p>
                      <p className="text-xs text-muted-foreground">
                        Alert when spend reaches {formatCurrency(budgetNum * t.percent / 100)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-muted-foreground">Email</label>
                    <Switch
                      checked={t.email}
                      onCheckedChange={(checked) => {
                        const next = [...thresholds];
                        next[i] = { ...next[i], email: !!checked };
                        setThresholds(next);
                      }}
                      disabled={!t.enabled}
                    />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Hard Limit + Notifications */}
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
                    <p className="text-xs text-muted-foreground">
                      API requests will be rejected once the monthly budget is reached.
                    </p>
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
                  <div className="flex items-center gap-2">
                    <Bell className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">Email Alerts</span>
                  </div>
                  <Switch
                    checked={notifications.email}
                    onCheckedChange={(checked) =>
                      setNotifications((n) => ({ ...n, email: !!checked }))
                    }
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Bell className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">In-App Notifications</span>
                  </div>
                  <Switch
                    checked={notifications.inApp}
                    onCheckedChange={(checked) =>
                      setNotifications((n) => ({ ...n, inApp: !!checked }))
                    }
                  />
                </div>
              </CardContent>
              <CardFooter>
                <Button size="sm" onClick={handleSave} disabled={saveMutation.isPending}>
                  {saveMutation.isPending ? 'Saving...' : 'Save Preferences'}
                </Button>
              </CardFooter>
            </Card>
          </div>

          {/* Alert History */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Alert History</CardTitle>
            </CardHeader>
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
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground">
                        No alert history.
                      </TableCell>
                    </TableRow>
                  ) : (
                    data.alertHistory.map((alert) => (
                      <TableRow key={alert.id}>
                        <TableCell>
                          <Badge variant="outline">{alert.type}</Badge>
                        </TableCell>
                        <TableCell className="text-sm">{alert.message}</TableCell>
                        <TableCell className="text-sm">{formatDate(alert.timestamp)}</TableCell>
                        <TableCell>
                          {alert.resolved ? (
                            <span className="flex items-center gap-1 text-emerald-600 text-xs font-medium">
                              <CheckCircle className="h-3.5 w-3.5" /> Resolved
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 text-amber-600 text-xs font-medium">
                              <AlertTriangle className="h-3.5 w-3.5" /> Active
                            </span>
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

// ------------------------------------------------------------------
// Plan & Rate Limits Tab
// ------------------------------------------------------------------

function PlanRateLimitsTab() {
  const { data, isLoading } = useQuery<RateLimits>({
    queryKey: ['billing-rate-limits'],
    queryFn: () => apiFetch<RateLimits>('/api/billing/rate-limits'),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        Loading plan details...
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-6">
      {/* Plan Details */}
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
            {data.plan.features.map((f) => (
              <Badge key={f} variant="secondary">
                {f}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Rate Limits Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Rate Limits</CardTitle>
          <CardDescription>
            API rate limits for your current plan.
          </CardDescription>
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

      {/* Feature Matrix */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Feature Availability</CardTitle>
          <CardDescription>
            Features included in your current plan.
          </CardDescription>
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
                    {f.included ? (
                      <CheckCircle className="mx-auto h-4 w-4 text-emerald-500" />
                    ) : (
                      <XCircle className="mx-auto h-4 w-4 text-muted-foreground" />
                    )}
                  </TableCell>
                  <TableCell className="text-right text-sm text-muted-foreground">
                    {f.limit ?? (f.included ? 'Unlimited' : '--')}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Upgrade Comparison */}
      {data.upgradePlans && data.upgradePlans.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Upgrade Options</CardTitle>
            <CardDescription>
              Compare plans and unlock more features.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {data.upgradePlans.map((plan) => (
                <div
                  key={plan.tier}
                  className="rounded-lg border p-5 hover:border-primary/50 transition-colors"
                >
                  <h4 className="font-semibold">{plan.name}</h4>
                  <p className="text-2xl font-bold mt-1">{formatCurrency(plan.price)}<span className="text-sm font-normal text-muted-foreground">/mo</span></p>
                  <ul className="mt-3 space-y-1.5">
                    {plan.highlights.map((h) => (
                      <li key={h} className="flex items-start gap-2 text-sm">
                        <CheckCircle className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                        {h}
                      </li>
                    ))}
                  </ul>
                  <Button className="w-full mt-4" variant="outline" asChild>
                    <a href={`/billing/plans?upgrade=${plan.tier}`}>
                      Upgrade to {plan.name}
                    </a>
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

// ------------------------------------------------------------------
// Main Dashboard
// ------------------------------------------------------------------

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
