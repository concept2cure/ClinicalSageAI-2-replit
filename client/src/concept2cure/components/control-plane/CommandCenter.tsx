/**
 * Regulatory Command Center — Unified Control Plane Dashboard
 *
 * Branded admin interface consolidating API key management, tenant/user
 * management, usage/billing, security/compliance, and module access.
 */

import React, { useState, useEffect } from 'react';
import {
  Shield, Key, Users, BarChart3, Settings, Layers,
  Plus, Trash2, Eye, Copy, Check, AlertTriangle,
  Lock, Unlock, RefreshCw, ChevronRight,
} from 'lucide-react';

// ============================================================================
// TYPES
// ============================================================================

interface ApiKeyItem {
  id: number;
  name: string;
  keyPrefix: string;
  scopes: string[];
  status: string;
  lastUsedAt: string | null;
  requestCount: number;
  rateLimit: number;
  createdAt: string;
  expiresAt: string | null;
}

interface UsageSummary {
  featureId: string;
  creditsUsed: number;
  creditsRemaining: number;
  creditsLimit: number;
}

type Tab = 'overview' | 'api-keys' | 'users' | 'usage' | 'security' | 'modules';

const SCOPE_LABELS: Record<string, string> = {
  'csr:read': 'CSR Intelligence',
  'regulatory:read': 'Regulatory Pathways',
  'endpoints:read': 'Endpoint Recommender',
  'precedent:read': 'Precedent Search',
  'trial-design:read': 'Trial Design',
  'documents:read': 'Documents',
};

const ALL_SCOPES = Object.keys(SCOPE_LABELS);

// ============================================================================
// COMPONENT
// ============================================================================

export default function CommandCenter() {
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [apiKeys, setApiKeys] = useState<ApiKeyItem[]>([]);
  const [usage, setUsage] = useState<UsageSummary[]>([]);
  const [newKeyName, setNewKeyName] = useState('');
  const [newKeyScopes, setNewKeyScopes] = useState<string[]>([...ALL_SCOPES]);
  const [showCreateKey, setShowCreateKey] = useState(false);
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (activeTab === 'api-keys') fetchApiKeys();
    if (activeTab === 'usage') fetchUsage();
  }, [activeTab]);

  async function fetchApiKeys() {
    try {
      const res = await fetch('/api/api-keys', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setApiKeys(data.keys || []);
      }
    } catch {
      // Silently fail — keys may not be set up yet
    }
  }

  async function fetchUsage() {
    try {
      const res = await fetch('/api/module-subscriptions/user-intelligence', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setUsage(data.usage || []);
      }
    } catch {
      // Silently fail
    }
  }

  async function createApiKey() {
    if (!newKeyName.trim()) return;
    setLoading(true);
    try {
      const res = await fetch('/api/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name: newKeyName, scopes: newKeyScopes }),
      });
      if (res.ok) {
        const data = await res.json();
        setCreatedKey(data.apiKey);
        setNewKeyName('');
        fetchApiKeys();
      }
    } catch {
      // Handle error
    }
    setLoading(false);
  }

  async function revokeKey(keyId: number) {
    try {
      await fetch(`/api/api-keys/${keyId}`, { method: 'DELETE', credentials: 'include' });
      fetchApiKeys();
    } catch {
      // Handle error
    }
  }

  function copyKey() {
    if (createdKey) {
      navigator.clipboard.writeText(createdKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  const tabs: Array<{ id: Tab; label: string; icon: React.ReactNode }> = [
    { id: 'overview', label: 'Overview', icon: <Layers size={16} /> },
    { id: 'api-keys', label: 'API Keys', icon: <Key size={16} /> },
    { id: 'users', label: 'Users & Roles', icon: <Users size={16} /> },
    { id: 'usage', label: 'Usage & Billing', icon: <BarChart3 size={16} /> },
    { id: 'security', label: 'Security', icon: <Shield size={16} /> },
    { id: 'modules', label: 'Modules', icon: <Settings size={16} /> },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-indigo-600 rounded-lg flex items-center justify-center">
            <Shield size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Regulatory Command Center</h1>
            <p className="text-sm text-gray-500">Platform administration & API management</p>
          </div>
        </div>
      </div>

      <div className="flex">
        {/* Sidebar */}
        <nav className="w-56 bg-white border-r border-gray-200 min-h-[calc(100vh-73px)] p-3">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm mb-1 transition-colors ${
                activeTab === tab.id
                  ? 'bg-indigo-50 text-indigo-700 font-medium'
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </nav>

        {/* Content */}
        <main className="flex-1 p-6">
          {activeTab === 'overview' && <OverviewTab />}
          {activeTab === 'api-keys' && (
            <ApiKeysTab
              keys={apiKeys}
              showCreate={showCreateKey}
              setShowCreate={setShowCreateKey}
              newKeyName={newKeyName}
              setNewKeyName={setNewKeyName}
              newKeyScopes={newKeyScopes}
              setNewKeyScopes={setNewKeyScopes}
              createdKey={createdKey}
              setCreatedKey={setCreatedKey}
              copied={copied}
              loading={loading}
              onCreate={createApiKey}
              onRevoke={revokeKey}
              onCopy={copyKey}
            />
          )}
          {activeTab === 'users' && <UsersTab />}
          {activeTab === 'usage' && <UsageTab usage={usage} />}
          {activeTab === 'security' && <SecurityTab />}
          {activeTab === 'modules' && <ModulesTab />}
        </main>
      </div>
    </div>
  );
}

// ============================================================================
// OVERVIEW TAB
// ============================================================================

function OverviewTab() {
  const [metrics, setMetrics] = useState({
    apiKeys: '—',
    creditsUsed: '—',
    apiRequests: '—',
    modules: '14',
  });
  const [serviceStatus, setServiceStatus] = useState<Array<{ service: string; status: string }>>([
    { service: 'CSR Knowledge Engine', status: 'checking' },
    { service: 'Regulatory Intelligence', status: 'checking' },
    { service: 'Endpoint Recommender', status: 'checking' },
    { service: 'Precedent Engine', status: 'checking' },
    { service: 'Document Authoring', status: 'checking' },
    { service: 'eCTD Navigator', status: 'checking' },
    { service: 'Trial Design Architect', status: 'checking' },
    { service: 'Public API', status: 'checking' },
  ]);

  useEffect(() => {
    // Fetch API key count
    fetch('/api/api-keys', { credentials: 'include' })
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data?.keys) {
          const active = data.keys.filter((k: ApiKeyItem) => k.status === 'active');
          const totalRequests = data.keys.reduce((sum: number, k: ApiKeyItem) => sum + k.requestCount, 0);
          setMetrics((prev) => ({
            ...prev,
            apiKeys: `${active.length}`,
            apiRequests: totalRequests.toLocaleString(),
          }));
        }
      })
      .catch(() => {});

    // Fetch usage summary
    fetch('/api/module-subscriptions/user-intelligence', { credentials: 'include' })
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data?.usage) {
          const total = data.usage.reduce((sum: number, u: UsageSummary) => sum + u.creditsUsed, 0);
          setMetrics((prev) => ({ ...prev, creditsUsed: total.toLocaleString() }));
        }
      })
      .catch(() => {});

    // Check public API health
    fetch('/api/v1/health')
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        setServiceStatus((prev) =>
          prev.map((s) =>
            s.service === 'Public API'
              ? { ...s, status: data?.status === 'healthy' ? 'operational' : 'degraded' }
              : { ...s, status: 'operational' }
          )
        );
      })
      .catch(() => {
        setServiceStatus((prev) =>
          prev.map((s) => ({ ...s, status: s.service === 'Public API' ? 'down' : 'operational' }))
        );
      });
  }, []);

  const metricCards = [
    { label: 'Active API Keys', value: metrics.apiKeys, icon: <Key size={20} /> },
    { label: 'API Requests', value: metrics.apiRequests, icon: <BarChart3 size={20} /> },
    { label: 'Credits Used', value: metrics.creditsUsed, icon: <Layers size={20} /> },
    { label: 'Active Modules', value: metrics.modules, icon: <Settings size={20} /> },
  ];

  return (
    <div>
      <h2 className="text-lg font-semibold text-gray-900 mb-4">Dashboard Overview</h2>

      {/* Metric Cards */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        {metricCards.map((m) => (
          <div key={m.label} className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-gray-400">{m.icon}</span>
            </div>
            <div className="text-2xl font-semibold text-gray-900">{m.value}</div>
            <div className="text-sm text-gray-500">{m.label}</div>
          </div>
        ))}
      </div>

      {/* System Status */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <h3 className="text-sm font-medium text-gray-900 mb-3">System Status</h3>
        <div className="space-y-2">
          {serviceStatus.map((s) => (
            <div key={s.service} className="flex items-center justify-between py-1">
              <span className="text-sm text-gray-700">{s.service}</span>
              <span className={`flex items-center gap-1.5 text-xs ${
                s.status === 'operational' ? 'text-green-600' :
                s.status === 'checking' ? 'text-gray-400' :
                s.status === 'degraded' ? 'text-yellow-600' : 'text-red-600'
              }`}>
                <span className={`w-2 h-2 rounded-full ${
                  s.status === 'operational' ? 'bg-green-500' :
                  s.status === 'checking' ? 'bg-gray-300 animate-pulse' :
                  s.status === 'degraded' ? 'bg-yellow-500' : 'bg-red-500'
                }`} />
                {s.status === 'checking' ? 'Checking...' : s.status.charAt(0).toUpperCase() + s.status.slice(1)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// API KEYS TAB
// ============================================================================

function ApiKeysTab(props: {
  keys: ApiKeyItem[];
  showCreate: boolean;
  setShowCreate: (v: boolean) => void;
  newKeyName: string;
  setNewKeyName: (v: string) => void;
  newKeyScopes: string[];
  setNewKeyScopes: (v: string[]) => void;
  createdKey: string | null;
  setCreatedKey: (v: string | null) => void;
  copied: boolean;
  loading: boolean;
  onCreate: () => void;
  onRevoke: (id: number) => void;
  onCopy: () => void;
}) {
  function toggleScope(scope: string) {
    if (props.newKeyScopes.includes(scope)) {
      props.setNewKeyScopes(props.newKeyScopes.filter((s) => s !== scope));
    } else {
      props.setNewKeyScopes([...props.newKeyScopes, scope]);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900">API Key Management</h2>
        <button
          onClick={() => props.setShowCreate(true)}
          className="flex items-center gap-1.5 bg-indigo-600 text-white px-3 py-1.5 rounded-lg text-sm hover:bg-indigo-700 transition-colors"
        >
          <Plus size={14} /> Create Key
        </button>
      </div>

      <p className="text-sm text-gray-500 mb-4">
        API keys provide external programmatic access to ClinicalSageAI intelligence services.
        Base URL: <code className="bg-gray-100 px-1 rounded">/api/v1/</code>
      </p>

      {/* Created Key Banner */}
      {props.createdKey && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4">
          <div className="flex items-start gap-2">
            <AlertTriangle size={16} className="text-amber-600 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-medium text-amber-800 mb-1">
                Store this key securely — it will not be shown again.
              </p>
              <div className="flex items-center gap-2 bg-white border border-amber-300 rounded-lg px-3 py-2">
                <code className="text-xs text-gray-800 flex-1 font-mono break-all">{props.createdKey}</code>
                <button onClick={props.onCopy} className="text-gray-500 hover:text-gray-700">
                  {props.copied ? <Check size={14} className="text-green-600" /> : <Copy size={14} />}
                </button>
              </div>
              <button
                onClick={() => props.setCreatedKey(null)}
                className="text-xs text-amber-600 mt-2 hover:underline"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Key Form */}
      {props.showCreate && !props.createdKey && (
        <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4">
          <h3 className="text-sm font-medium text-gray-900 mb-3">Create New API Key</h3>
          <div className="mb-3">
            <label className="text-xs text-gray-500 mb-1 block">Key Name</label>
            <input
              type="text"
              value={props.newKeyName}
              onChange={(e) => props.setNewKeyName(e.target.value)}
              placeholder="e.g., Production Key, Partner Integration"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
            />
          </div>
          <div className="mb-3">
            <label className="text-xs text-gray-500 mb-1 block">Scopes</label>
            <div className="grid grid-cols-3 gap-2">
              {ALL_SCOPES.map((scope) => (
                <label key={scope} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={props.newKeyScopes.includes(scope)}
                    onChange={() => toggleScope(scope)}
                    className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  {SCOPE_LABELS[scope]}
                </label>
              ))}
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={props.onCreate}
              disabled={props.loading || !props.newKeyName.trim()}
              className="bg-indigo-600 text-white px-4 py-1.5 rounded-lg text-sm hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              {props.loading ? 'Creating...' : 'Create Key'}
            </button>
            <button
              onClick={() => props.setShowCreate(false)}
              className="text-gray-600 px-4 py-1.5 rounded-lg text-sm hover:bg-gray-100 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Key List */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="text-left px-4 py-2 text-xs font-medium text-gray-500">Name</th>
              <th className="text-left px-4 py-2 text-xs font-medium text-gray-500">Prefix</th>
              <th className="text-left px-4 py-2 text-xs font-medium text-gray-500">Status</th>
              <th className="text-left px-4 py-2 text-xs font-medium text-gray-500">Scopes</th>
              <th className="text-right px-4 py-2 text-xs font-medium text-gray-500">Requests</th>
              <th className="text-left px-4 py-2 text-xs font-medium text-gray-500">Last Used</th>
              <th className="text-right px-4 py-2 text-xs font-medium text-gray-500">Actions</th>
            </tr>
          </thead>
          <tbody>
            {props.keys.length === 0 && (
              <tr>
                <td colSpan={7} className="text-center text-gray-400 py-8">
                  No API keys created yet. Create one to enable external access.
                </td>
              </tr>
            )}
            {props.keys.map((key) => (
              <tr key={key.id} className="border-b border-gray-100 last:border-0">
                <td className="px-4 py-3 font-medium text-gray-900">{key.name}</td>
                <td className="px-4 py-3 font-mono text-xs text-gray-500">{key.keyPrefix}...</td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs ${
                      key.status === 'active'
                        ? 'bg-green-50 text-green-700'
                        : 'bg-red-50 text-red-700'
                    }`}
                  >
                    {key.status === 'active' ? <Unlock size={10} /> : <Lock size={10} />}
                    {key.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs text-gray-500">{key.scopes?.length || 0} scopes</td>
                <td className="px-4 py-3 text-right text-gray-700">{key.requestCount.toLocaleString()}</td>
                <td className="px-4 py-3 text-xs text-gray-500">
                  {key.lastUsedAt ? new Date(key.lastUsedAt).toLocaleDateString() : 'Never'}
                </td>
                <td className="px-4 py-3 text-right">
                  {key.status === 'active' && (
                    <button
                      onClick={() => props.onRevoke(key.id)}
                      className="text-red-500 hover:text-red-700 p-1"
                      title="Revoke"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ============================================================================
// USERS TAB
// ============================================================================

function UsersTab() {
  const roles = ['admin', 'manager', 'member', 'viewer'];

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900">Users & Roles</h2>
        <button className="flex items-center gap-1.5 bg-indigo-600 text-white px-3 py-1.5 rounded-lg text-sm hover:bg-indigo-700 transition-colors">
          <Plus size={14} /> Invite User
        </button>
      </div>
      <div className="bg-white border border-gray-200 rounded-xl p-6 text-center text-gray-500">
        <Users size={32} className="mx-auto mb-2 text-gray-300" />
        <p className="text-sm">User management loads from your organization settings.</p>
        <p className="text-xs text-gray-400 mt-1">
          Roles: {roles.join(', ')} | Seat-based licensing enforced
        </p>
      </div>
    </div>
  );
}

// ============================================================================
// USAGE TAB
// ============================================================================

function UsageTab({ usage }: { usage: UsageSummary[] }) {
  const features = [
    { id: 'deep_research', label: 'Deep Research', color: 'bg-indigo-500' },
    { id: 'csr_builder', label: 'CSR Builder', color: 'bg-blue-500' },
    { id: 'ctd_builder', label: 'CTD Builder', color: 'bg-teal-500' },
    { id: 'api_csr_search', label: 'API: CSR Search', color: 'bg-purple-500' },
    { id: 'api_regulatory_pathways', label: 'API: Regulatory Pathways', color: 'bg-violet-500' },
    { id: 'api_endpoint_recommend', label: 'API: Endpoint Recommender', color: 'bg-fuchsia-500' },
    { id: 'api_precedent_search', label: 'API: Precedent Search', color: 'bg-pink-500' },
    { id: 'api_trial_design', label: 'API: Trial Design', color: 'bg-rose-500' },
    { id: 'ctd_onboarding', label: 'CTD Onboarding', color: 'bg-emerald-500' },
    { id: 'biologics_intelligence', label: 'Biologics Intelligence', color: 'bg-cyan-500' },
  ];

  return (
    <div>
      <h2 className="text-lg font-semibold text-gray-900 mb-4">Usage & Billing</h2>
      <div className="space-y-3">
        {features.map((f) => {
          const data = usage.find((u) => u.featureId === f.id);
          const used = data?.creditsUsed || 0;
          const limit = data?.creditsLimit || 100;
          const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;

          return (
            <div key={f.id} className="bg-white border border-gray-200 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-900">{f.label}</span>
                <span className="text-xs text-gray-500">
                  {used} / {limit === -1 ? 'unlimited' : limit}
                </span>
              </div>
              <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${f.color}`}
                  style={{ width: `${limit === -1 ? 5 : pct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================================
// SECURITY TAB
// ============================================================================

function SecurityTab() {
  const policies = [
    { label: 'MFA Enforcement', description: 'Require TOTP for all users', enabled: false },
    { label: 'Password Complexity', description: 'Min 12 chars, uppercase, number, symbol', enabled: true },
    { label: 'Session Timeout', description: '24-hour JWT expiration', enabled: true },
    { label: 'Account Lockout', description: '5 failed attempts = 15-min lock', enabled: true },
    { label: 'IP Restrictions', description: 'Restrict access to allowed IP ranges', enabled: false },
    { label: 'Audit Logging', description: '21 CFR Part 11 compliant audit trail', enabled: true },
  ];

  return (
    <div>
      <h2 className="text-lg font-semibold text-gray-900 mb-4">Security & Compliance</h2>
      <div className="space-y-2">
        {policies.map((p) => (
          <div key={p.label} className="bg-white border border-gray-200 rounded-xl p-4 flex items-center justify-between">
            <div>
              <div className="text-sm font-medium text-gray-900">{p.label}</div>
              <div className="text-xs text-gray-500">{p.description}</div>
            </div>
            <div
              className={`w-10 h-6 rounded-full flex items-center px-0.5 cursor-pointer transition-colors ${
                p.enabled ? 'bg-indigo-600 justify-end' : 'bg-gray-300 justify-start'
              }`}
            >
              <div className="w-5 h-5 bg-white rounded-full shadow" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// MODULES TAB
// ============================================================================

function ModulesTab() {
  const modules = [
    { name: 'CSR Knowledge Engine', category: 'Regulatory Intelligence', enabled: true, tier: 'standard' },
    { name: 'Regulatory Pathway Intelligence', category: 'Regulatory Intelligence', enabled: true, tier: 'standard' },
    { name: 'Precedent Engine', category: 'Regulatory Intelligence', enabled: true, tier: 'professional' },
    { name: 'Trial Design Architect', category: 'Clinical Development', enabled: true, tier: 'standard' },
    { name: 'Endpoint Recommender', category: 'Clinical Development', enabled: true, tier: 'standard' },
    { name: 'SAP Generator', category: 'Clinical Development', enabled: true, tier: 'professional' },
    { name: 'Biologics Intelligence', category: 'Clinical Development', enabled: true, tier: 'professional' },
    { name: 'CSR Builder (ICH E3)', category: 'Document Authoring', enabled: true, tier: 'professional' },
    { name: 'CTD Builder', category: 'Document Authoring', enabled: true, tier: 'enterprise' },
    { name: 'eCTD Navigator', category: 'Document Authoring', enabled: true, tier: 'standard' },
    { name: 'IND/IB Generator', category: 'Document Authoring', enabled: true, tier: 'professional' },
    { name: 'Knowledge Graph', category: 'Analytics', enabled: true, tier: 'professional' },
    { name: 'Deep Research', category: 'Analytics', enabled: true, tier: 'standard' },
    { name: 'Combination Products', category: 'Regulatory Intelligence', enabled: true, tier: 'professional' },
  ];

  const categories = [...new Set(modules.map((m) => m.category))];

  return (
    <div>
      <h2 className="text-lg font-semibold text-gray-900 mb-4">Platform Modules</h2>
      {categories.map((cat) => (
        <div key={cat} className="mb-6">
          <h3 className="text-sm font-medium text-gray-500 mb-2">{cat}</h3>
          <div className="grid grid-cols-2 gap-2">
            {modules
              .filter((m) => m.category === cat)
              .map((m) => (
                <div
                  key={m.name}
                  className="bg-white border border-gray-200 rounded-xl p-3 flex items-center justify-between"
                >
                  <div>
                    <div className="text-sm font-medium text-gray-900">{m.name}</div>
                    <div className="text-xs text-gray-400 capitalize">{m.tier}+</div>
                  </div>
                  <span className="text-xs bg-green-50 text-green-700 px-2 py-0.5 rounded-full">
                    Active
                  </span>
                </div>
              ))}
          </div>
        </div>
      ))}
    </div>
  );
}
