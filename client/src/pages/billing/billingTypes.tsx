// ------------------------------------------------------------------
// Types
// ------------------------------------------------------------------

export interface BillingStatus {
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

export interface UsageRecord {
  date: string;
  module: string;
  requests: number;
  tokensUsed: number;
  cost: number;
}

export interface UsageData {
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

export interface Invoice {
  id: string;
  number: string;
  date: string;
  amount: number;
  status: 'paid' | 'pending' | 'failed';
  pdfUrl: string;
}

export interface InvoicesResponse {
  invoices: Invoice[];
  total: number;
  page: number;
  pageSize: number;
}

export interface BudgetSettings {
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

export interface RateLimits {
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

export async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

// ------------------------------------------------------------------
// Constants
// ------------------------------------------------------------------

export const MODULE_COLORS: Record<string, string> = {
  '510(k)': '#6366f1',
  CER: '#8b5cf6',
  eCTD: '#a78bfa',
  CMC: '#c4b5fd',
  'AI Assistance': '#818cf8',
};

export const PIE_COLORS = ['#6366f1', '#8b5cf6', '#a78bfa', '#c4b5fd', '#818cf8'];

// ------------------------------------------------------------------
// Utility functions
// ------------------------------------------------------------------

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}

export function formatNumber(n: number): string {
  return new Intl.NumberFormat('en-US').format(n);
}

export function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

// ------------------------------------------------------------------
// Sub-components
// ------------------------------------------------------------------

export function StatusBadge({ status }: { status: string }) {
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
