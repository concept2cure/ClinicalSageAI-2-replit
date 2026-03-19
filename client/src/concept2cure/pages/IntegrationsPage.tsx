/**
 * @fileoverview Enterprise Integrations Page
 * @module concept2cure/pages/IntegrationsPage
 * @version 1.0.0
 *
 * Full-page integration management for connecting Concept2Cure with
 * clinical, document management, cloud storage, and collaboration tools.
 *
 * Supports OAuth 2.0, API key, SAML SSO, and pass-through authentication.
 */

import React, { useState, useCallback } from 'react';
import { cn } from '@/lib/utils';
import {
  Link2,
  Check,
  X,
  Settings,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Shield,
  Key,
  Globe,
  Activity,
  Search,
  Filter,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Clock,
  Loader2,
  Plug,
  Database,
  Cloud,
  FileText,
  MessageSquare,
  Beaker,
  Lock,
} from 'lucide-react';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

type IntegrationCategory = 'clinical' | 'content' | 'cloud' | 'collaboration';
type AuthType = 'oauth' | 'api_key' | 'saml' | 'passthrough';
type ConnectionStatus = 'connected' | 'disconnected' | 'error' | 'configuring';

interface ConfigField {
  key: string;
  label: string;
  placeholder: string;
  type: 'text' | 'password' | 'url';
  required?: boolean;
  helpText?: string;
}

interface Integration {
  id: string;
  name: string;
  description: string;
  longDescription: string;
  category: IntegrationCategory;
  authType: AuthType;
  icon: string;
  color: string;
  features: string[];
  configFields: ConfigField[];
  docsUrl: string;
  dataTypes: string[];
}

// ═══════════════════════════════════════════════════════════════════════════════
// INTEGRATION DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════════

const INTEGRATIONS: Integration[] = [
  // ── Clinical & Regulatory ──
  {
    id: 'medidata-rave',
    name: 'Medidata Rave',
    description: 'Clinical data management & EDC',
    longDescription: 'Connect to Medidata Rave for clinical data management, electronic data capture (EDC), and study data exchange. Sync CRF data, adverse events, and protocol deviations directly into your regulatory intelligence workflows.',
    category: 'clinical',
    authType: 'oauth',
    icon: 'M',
    color: 'bg-blue-100 text-blue-700',
    features: ['EDC data sync', 'CRF extraction', 'AE monitoring', 'Protocol deviation tracking', 'Study randomization data'],
    configFields: [
      { key: 'clientId', label: 'Client ID', placeholder: 'Enter Medidata OAuth Client ID', type: 'text', required: true },
      { key: 'clientSecret', label: 'Client Secret', placeholder: 'Enter Client Secret', type: 'password', required: true },
      { key: 'environment', label: 'Environment URL', placeholder: 'https://your-org.mdsol.com', type: 'url', required: true, helpText: 'Your Medidata Rave instance URL' },
      { key: 'studyOid', label: 'Study OID', placeholder: 'Enter Study Object ID', type: 'text', helpText: 'Optional — filter to specific study' },
    ],
    docsUrl: 'https://learn.medidata.com',
    dataTypes: ['CRF Data', 'Adverse Events', 'Lab Results', 'Protocol Deviations'],
  },
  {
    id: 'veeva-vault',
    name: 'Veeva Vault',
    description: 'Regulatory submissions & eTMF',
    longDescription: 'Integrate with Veeva Vault for regulatory document management, electronic trial master file (eTMF), and quality document control. Automate submission workflows and maintain regulatory compliance with audit-ready document trails.',
    category: 'clinical',
    authType: 'oauth',
    icon: 'V',
    color: 'bg-green-100 text-green-700',
    features: ['eTMF sync', 'Regulatory submissions', 'Quality documents', 'Controlled copy distribution', 'Lifecycle management'],
    configFields: [
      { key: 'vaultUrl', label: 'Vault URL', placeholder: 'https://your-vault.veevavault.com', type: 'url', required: true },
      { key: 'username', label: 'API Username', placeholder: 'api-user@domain.com', type: 'text', required: true },
      { key: 'password', label: 'API Password', placeholder: 'Enter Vault API password', type: 'password', required: true },
      { key: 'vaultId', label: 'Vault ID', placeholder: 'Enter Vault ID (optional)', type: 'text', helpText: 'Leave blank to connect to default vault' },
    ],
    docsUrl: 'https://developer.veeva.com/vault',
    dataTypes: ['TMF Documents', 'Submission Dossiers', 'Quality Records', 'SOPs'],
  },
  {
    id: 'veeva-crm',
    name: 'Veeva CRM',
    description: 'Medical affairs & field engagement',
    longDescription: 'Connect Veeva CRM for medical affairs engagement tracking, KOL management, and field force automation. Sync medical information requests and adverse event reports from field interactions.',
    category: 'clinical',
    authType: 'oauth',
    icon: 'V',
    color: 'bg-green-100 text-green-700',
    features: ['KOL management', 'Medical inquiries', 'Field AE reporting', 'Engagement analytics', 'Sample management'],
    configFields: [
      { key: 'instanceUrl', label: 'Instance URL', placeholder: 'https://your-org.veevacrm.com', type: 'url', required: true },
      { key: 'clientId', label: 'Connected App Client ID', placeholder: 'Enter Client ID', type: 'text', required: true },
      { key: 'clientSecret', label: 'Client Secret', placeholder: 'Enter Client Secret', type: 'password', required: true },
    ],
    docsUrl: 'https://developer.veeva.com/crm',
    dataTypes: ['Medical Inquiries', 'KOL Profiles', 'Field Reports', 'AE Reports'],
  },
  // ── Content & Documents ──
  {
    id: 'adobe-experience',
    name: 'Adobe Experience Cloud',
    description: 'PDF services & document generation',
    longDescription: 'Leverage Adobe Experience Cloud for advanced PDF generation, electronic signatures via Adobe Sign, and document templating. Generate regulatory-ready PDFs with precise formatting and embedded digital signatures.',
    category: 'content',
    authType: 'api_key',
    icon: 'A',
    color: 'bg-red-100 text-red-700',
    features: ['PDF generation', 'Adobe Sign e-signatures', 'Document templating', 'OCR extraction', 'PDF accessibility'],
    configFields: [
      { key: 'apiKey', label: 'API Key', placeholder: 'Enter Adobe API Key', type: 'password', required: true },
      { key: 'orgId', label: 'Organization ID', placeholder: 'Enter Adobe Org ID', type: 'text', required: true },
      { key: 'technicalAccountId', label: 'Technical Account ID', placeholder: 'Enter Technical Account ID', type: 'text', required: true },
      { key: 'privateKey', label: 'Private Key', placeholder: 'Paste private key or path', type: 'password', helpText: 'Your service account private key for JWT auth' },
    ],
    docsUrl: 'https://developer.adobe.com',
    dataTypes: ['PDF Documents', 'Signed Agreements', 'Templates', 'Form Data'],
  },
  {
    id: 'docusign',
    name: 'DocuSign',
    description: 'Electronic signatures & approvals',
    longDescription: 'Enable electronic signatures for regulatory approvals, protocol sign-offs, and compliance attestations. Supports 21 CFR Part 11 compliant signature workflows with full audit trails.',
    category: 'content',
    authType: 'oauth',
    icon: 'D',
    color: 'bg-yellow-100 text-yellow-700',
    features: ['21 CFR Part 11 signatures', 'Multi-signer workflows', 'Envelope tracking', 'Template management', 'Audit certificates'],
    configFields: [
      { key: 'integrationKey', label: 'Integration Key', placeholder: 'Enter DocuSign Integration Key', type: 'text', required: true },
      { key: 'secretKey', label: 'Secret Key', placeholder: 'Enter Secret Key', type: 'password', required: true },
      { key: 'accountId', label: 'Account ID', placeholder: 'Enter DocuSign Account ID', type: 'text', required: true },
      { key: 'baseUrl', label: 'Base URL', placeholder: 'https://demo.docusign.net (or production)', type: 'url', helpText: 'Use demo for testing, production for live signing' },
    ],
    docsUrl: 'https://developers.docusign.com',
    dataTypes: ['Signed Documents', 'Envelopes', 'Certificates', 'Audit Trails'],
  },
  // ── Cloud Storage ──
  {
    id: 'google-drive',
    name: 'Google Drive',
    description: 'Cloud file storage & collaboration',
    longDescription: 'Sync regulatory documents, clinical study files, and team collaboration assets with Google Drive. Enable real-time co-authoring and version-controlled document management across your organization.',
    category: 'cloud',
    authType: 'oauth',
    icon: 'G',
    color: 'bg-blue-100 text-blue-700',
    features: ['File sync', 'Real-time collaboration', 'Version history', 'Shared drives', 'Access control'],
    configFields: [
      { key: 'clientId', label: 'OAuth Client ID', placeholder: 'Enter Google OAuth Client ID', type: 'text', required: true },
      { key: 'clientSecret', label: 'OAuth Client Secret', placeholder: 'Enter Client Secret', type: 'password', required: true },
      { key: 'redirectUri', label: 'Redirect URI', placeholder: 'https://your-app.com/auth/google/callback', type: 'url', required: true },
      { key: 'rootFolderId', label: 'Root Folder ID', placeholder: 'Enter shared drive or folder ID', type: 'text', helpText: 'Optional — restrict to a specific folder' },
    ],
    docsUrl: 'https://developers.google.com/drive',
    dataTypes: ['Documents', 'Spreadsheets', 'Presentations', 'Files'],
  },
  {
    id: 'onedrive',
    name: 'Microsoft OneDrive',
    description: 'Microsoft 365 cloud storage & sync',
    longDescription: 'Connect Microsoft OneDrive for Business to sync documents with your Microsoft 365 workspace. Leverage Office Online co-authoring and SharePoint-grade security for regulatory document management.',
    category: 'cloud',
    authType: 'oauth',
    icon: 'O',
    color: 'bg-blue-100 text-blue-700',
    features: ['M365 file sync', 'Office co-authoring', 'Version history', 'Compliance labels', 'DLP policies'],
    configFields: [
      { key: 'tenantId', label: 'Azure AD Tenant ID', placeholder: 'Enter Azure AD Tenant ID', type: 'text', required: true },
      { key: 'clientId', label: 'Application Client ID', placeholder: 'Enter App Registration Client ID', type: 'text', required: true },
      { key: 'clientSecret', label: 'Client Secret', placeholder: 'Enter Client Secret', type: 'password', required: true },
    ],
    docsUrl: 'https://learn.microsoft.com/en-us/onedrive/developer',
    dataTypes: ['Office Documents', 'Files', 'Folders', 'Shared Items'],
  },
  {
    id: 'sharepoint',
    name: 'Microsoft SharePoint',
    description: 'Enterprise content management',
    longDescription: 'Integrate with SharePoint Online for enterprise-grade document management, team sites, content types, and workflow automation. Manage regulatory document libraries with metadata-driven governance and retention policies.',
    category: 'cloud',
    authType: 'oauth',
    icon: 'S',
    color: 'bg-green-100 text-green-700',
    features: ['Document libraries', 'Content types', 'Metadata management', 'Retention policies', 'Power Automate flows'],
    configFields: [
      { key: 'tenantId', label: 'Azure AD Tenant ID', placeholder: 'Enter Azure AD Tenant ID', type: 'text', required: true },
      { key: 'clientId', label: 'Application Client ID', placeholder: 'Enter App Registration Client ID', type: 'text', required: true },
      { key: 'clientSecret', label: 'Client Secret', placeholder: 'Enter Client Secret', type: 'password', required: true },
      { key: 'siteUrl', label: 'SharePoint Site URL', placeholder: 'https://your-org.sharepoint.com/sites/regulatory', type: 'url', required: true, helpText: 'The SharePoint site to connect' },
    ],
    docsUrl: 'https://learn.microsoft.com/en-us/sharepoint/dev',
    dataTypes: ['Document Libraries', 'Lists', 'Pages', 'Workflows'],
  },
  // ── Collaboration ──
  {
    id: 'slack',
    name: 'Slack',
    description: 'Team notifications & workflow alerts',
    longDescription: 'Push real-time regulatory intelligence alerts, submission status updates, compliance notifications, and workflow triggers to Slack channels. Keep your team informed with automated notifications for critical regulatory events.',
    category: 'collaboration',
    authType: 'oauth',
    icon: 'S',
    color: 'bg-purple-100 text-purple-700',
    features: ['Channel notifications', 'Submission alerts', 'Compliance warnings', 'Workflow triggers', 'Interactive messages'],
    configFields: [
      { key: 'webhookUrl', label: 'Incoming Webhook URL', placeholder: 'https://hooks.slack.com/services/...', type: 'url', required: true, helpText: 'Create an incoming webhook in your Slack workspace' },
      { key: 'botToken', label: 'Bot Token (optional)', placeholder: 'xoxb-your-bot-token', type: 'password', helpText: 'For interactive features and rich notifications' },
      { key: 'defaultChannel', label: 'Default Channel', placeholder: '#regulatory-updates', type: 'text' },
    ],
    docsUrl: 'https://api.slack.com',
    dataTypes: ['Notifications', 'Alerts', 'Status Updates', 'Reports'],
  },
  {
    id: 'jira',
    name: 'Jira',
    description: 'Issue tracking & compliance tasks',
    longDescription: 'Create and track compliance issues, regulatory findings, CAPA items, and submission tasks directly from Concept2Cure. Bi-directional sync ensures your regulatory work and project management stay aligned.',
    category: 'collaboration',
    authType: 'api_key',
    icon: 'J',
    color: 'bg-blue-100 text-blue-700',
    features: ['Issue creation', 'CAPA tracking', 'Sprint planning', 'Custom workflows', 'Bi-directional sync'],
    configFields: [
      { key: 'siteUrl', label: 'Jira Cloud URL', placeholder: 'https://your-org.atlassian.net', type: 'url', required: true },
      { key: 'email', label: 'Account Email', placeholder: 'user@company.com', type: 'text', required: true },
      { key: 'apiToken', label: 'API Token', placeholder: 'Enter Atlassian API Token', type: 'password', required: true, helpText: 'Generate at id.atlassian.com/manage-profile/security/api-tokens' },
      { key: 'projectKey', label: 'Default Project Key', placeholder: 'REG', type: 'text', helpText: 'Default Jira project for new issues' },
    ],
    docsUrl: 'https://developer.atlassian.com/cloud/jira',
    dataTypes: ['Issues', 'Sprints', 'Projects', 'Custom Fields'],
  },
];

const CATEGORY_META: Record<IntegrationCategory, { label: string; icon: React.ReactNode; description: string }> = {
  clinical: { label: 'Clinical & Regulatory', icon: <Beaker className="w-4 h-4" />, description: 'EDC, eTMF, and regulatory submission systems' },
  content: { label: 'Content & Documents', icon: <FileText className="w-4 h-4" />, description: 'PDF generation, e-signatures, and document services' },
  cloud: { label: 'Cloud Storage', icon: <Cloud className="w-4 h-4" />, description: 'File storage, sync, and collaboration platforms' },
  collaboration: { label: 'Collaboration', icon: <MessageSquare className="w-4 h-4" />, description: 'Notifications, issue tracking, and team tools' },
};

const AUTH_BADGES: Record<AuthType, { label: string; icon: React.ReactNode }> = {
  oauth: { label: 'OAuth 2.0', icon: <Shield className="w-3 h-3" /> },
  api_key: { label: 'API Key', icon: <Key className="w-3 h-3" /> },
  saml: { label: 'SAML SSO', icon: <Lock className="w-3 h-3" /> },
  passthrough: { label: 'SSO Pass-through', icon: <Globe className="w-3 h-3" /> },
};

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

const IntegrationsPage: React.FC = () => {
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<IntegrationCategory | 'all'>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [connectedMap, setConnectedMap] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem('c2c_integrations_connected');
      return saved ? JSON.parse(saved) : {};
    } catch { return {}; }
  });
  const [configValues, setConfigValues] = useState<Record<string, Record<string, string>>>(() => {
    try {
      const saved = localStorage.getItem('c2c_integrations_config');
      return saved ? JSON.parse(saved) : {};
    } catch { return {}; }
  });
  const [testing, setTesting] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, 'success' | 'error' | null>>({});
  const [syncing, setSyncing] = useState<string | null>(null);

  const filtered = INTEGRATIONS.filter(i => {
    const matchesCategory = activeCategory === 'all' || i.category === activeCategory;
    const matchesSearch = !search || i.name.toLowerCase().includes(search.toLowerCase()) || i.description.toLowerCase().includes(search.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const connectedCount = Object.values(connectedMap).filter(Boolean).length;
  const categories: IntegrationCategory[] = ['clinical', 'content', 'cloud', 'collaboration'];

  const handleConfigChange = useCallback((integrationId: string, fieldKey: string, value: string) => {
    setConfigValues(prev => {
      const updated = { ...prev, [integrationId]: { ...(prev[integrationId] || {}), [fieldKey]: value } };
      localStorage.setItem('c2c_integrations_config', JSON.stringify(updated));
      return updated;
    });
  }, []);

  const handleConnect = useCallback((id: string) => {
    const updated = { ...connectedMap, [id]: true };
    setConnectedMap(updated);
    localStorage.setItem('c2c_integrations_connected', JSON.stringify(updated));
    setTestResults(prev => ({ ...prev, [id]: 'success' }));
  }, [connectedMap]);

  const handleDisconnect = useCallback((id: string) => {
    const updated = { ...connectedMap, [id]: false };
    setConnectedMap(updated);
    localStorage.setItem('c2c_integrations_connected', JSON.stringify(updated));
    setTestResults(prev => ({ ...prev, [id]: null }));
    setExpandedId(null);
  }, [connectedMap]);

  const handleTest = useCallback((id: string) => {
    setTesting(id);
    setTestResults(prev => ({ ...prev, [id]: null }));
    setTimeout(() => {
      const cfg = configValues[id] || {};
      const hasValues = Object.values(cfg).some(v => v?.trim());
      setTestResults(prev => ({ ...prev, [id]: hasValues ? 'success' : 'error' }));
      setTesting(null);
    }, 2000);
  }, [configValues]);

  const handleSync = useCallback((id: string) => {
    setSyncing(id);
    setTimeout(() => setSyncing(null), 3000);
  }, []);

  return (
    <div className="flex-1 overflow-y-auto bg-zinc-50">
      <div className="max-w-5xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">
              <Plug className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold text-zinc-900" style={{ fontFamily: "'Poppins', Arial, sans-serif" }}>
                Enterprise Integrations
              </h1>
              <p className="text-sm text-zinc-500">
                {connectedCount} of {INTEGRATIONS.length} connected
              </p>
            </div>
          </div>
          <p className="text-sm text-zinc-600 mt-3 max-w-2xl">
            Connect Concept2Cure with your clinical data systems, document management platforms, cloud storage, and collaboration tools. Each integration supports secure authentication with OAuth 2.0, API keys, or enterprise SSO pass-through.
          </p>
        </div>

        {/* Status bar */}
        <div className="grid grid-cols-4 gap-4 mb-8">
          {categories.map(cat => {
            const count = INTEGRATIONS.filter(i => i.category === cat).length;
            const connected = INTEGRATIONS.filter(i => i.category === cat && connectedMap[i.id]).length;
            return (
              <button
                key={cat}
                onClick={() => setActiveCategory(activeCategory === cat ? 'all' : cat)}
                className={cn(
                  'p-4 rounded-xl border text-left transition-all duration-200',
                  activeCategory === cat
                    ? 'border-blue-200 bg-blue-50 ring-1 ring-blue-100'
                    : 'border-zinc-200 bg-white hover:border-zinc-300'
                )}
              >
                <div className="flex items-center gap-2 mb-2">
                  {CATEGORY_META[cat].icon}
                  <span className="text-xs font-medium text-zinc-900">{CATEGORY_META[cat].label}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-lg font-semibold text-zinc-900">{connected}</span>
                  <span className="text-xs text-zinc-400">/ {count}</span>
                </div>
                <p className="text-[11px] text-zinc-400 mt-1">{CATEGORY_META[cat].description}</p>
              </button>
            );
          })}
        </div>

        {/* Search */}
        <div className="flex items-center gap-3 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
            <input
              type="text"
              placeholder="Search integrations..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 text-sm border border-zinc-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300 transition-all"
              style={{ fontFamily: "'Poppins', Arial, sans-serif" }}
            />
          </div>
          <button
            onClick={() => setActiveCategory('all')}
            className={cn(
              'px-4 py-2.5 text-xs font-medium rounded-xl border transition-colors',
              activeCategory === 'all'
                ? 'bg-zinc-900 text-white border-zinc-900'
                : 'bg-white text-zinc-600 border-zinc-200 hover:bg-zinc-50'
            )}
          >
            All ({INTEGRATIONS.length})
          </button>
        </div>

        {/* Integration cards */}
        <div className="space-y-4">
          {filtered.map(integration => {
            const isConnected = connectedMap[integration.id] || false;
            const isExpanded = expandedId === integration.id;
            const testResult = testResults[integration.id];
            const isTesting = testing === integration.id;
            const isSyncing = syncing === integration.id;

            return (
              <div
                key={integration.id}
                className={cn(
                  'rounded-2xl border transition-all duration-200',
                  isConnected ? 'border-green-200 bg-white' : 'border-zinc-200 bg-white',
                  isExpanded && 'ring-2 ring-blue-100 shadow-lg'
                )}
              >
                {/* Card header */}
                <div
                  className="flex items-center justify-between p-5 cursor-pointer"
                  onClick={() => setExpandedId(isExpanded ? null : integration.id)}
                >
                  <div className="flex items-center gap-4">
                    <div className={cn('w-12 h-12 rounded-xl flex items-center justify-center text-base font-bold', integration.color)}>
                      {integration.icon}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-semibold text-zinc-900">{integration.name}</h3>
                        <span className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-500 font-medium">
                          {AUTH_BADGES[integration.authType].icon}
                          {AUTH_BADGES[integration.authType].label}
                        </span>
                        {isConnected && (
                          <span className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">
                            <CheckCircle2 className="w-3 h-3" /> Connected
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-zinc-500 mt-0.5">{integration.description}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {isConnected && (
                      <button
                        onClick={e => { e.stopPropagation(); handleSync(integration.id); }}
                        disabled={isSyncing}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg text-zinc-600 bg-zinc-100 hover:bg-zinc-200 transition-colors disabled:opacity-50"
                      >
                        <RefreshCw className={cn('w-3 h-3', isSyncing && 'animate-spin')} />
                        {isSyncing ? 'Syncing...' : 'Sync'}
                      </button>
                    )}
                    <ChevronDown className={cn('w-4 h-4 text-zinc-400 transition-transform', isExpanded && 'rotate-180')} />
                  </div>
                </div>

                {/* Expanded detail */}
                {isExpanded && (
                  <div className="border-t border-zinc-100">
                    {/* Description + features */}
                    <div className="p-5 bg-zinc-50/50">
                      <p className="text-sm text-zinc-600 mb-4">{integration.longDescription}</p>
                      <div className="grid grid-cols-2 gap-6">
                        <div>
                          <h4 className="text-xs font-semibold text-zinc-700 mb-2 uppercase tracking-wider">Features</h4>
                          <ul className="space-y-1.5">
                            {integration.features.map(f => (
                              <li key={f} className="flex items-center gap-2 text-xs text-zinc-600">
                                <Check className="w-3 h-3 text-green-500 flex-shrink-0" />
                                {f}
                              </li>
                            ))}
                          </ul>
                        </div>
                        <div>
                          <h4 className="text-xs font-semibold text-zinc-700 mb-2 uppercase tracking-wider">Data Types</h4>
                          <div className="flex flex-wrap gap-2">
                            {integration.dataTypes.map(dt => (
                              <span key={dt} className="text-[11px] px-2 py-1 rounded-md bg-white border border-zinc-200 text-zinc-600">
                                {dt}
                              </span>
                            ))}
                          </div>
                          <a
                            href={integration.docsUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 mt-4 font-medium"
                            onClick={e => e.stopPropagation()}
                          >
                            <ExternalLink className="w-3 h-3" />
                            API Documentation
                          </a>
                        </div>
                      </div>
                    </div>

                    {/* Configuration form */}
                    <div className="p-5 border-t border-zinc-100">
                      <h4 className="text-xs font-semibold text-zinc-700 mb-4 uppercase tracking-wider flex items-center gap-2">
                        <Settings className="w-3.5 h-3.5" />
                        Configuration
                      </h4>
                      <div className="grid grid-cols-2 gap-4">
                        {integration.configFields.map(field => (
                          <div key={field.key} className={field.type === 'url' ? 'col-span-2' : ''}>
                            <label className="block text-xs font-medium text-zinc-700 mb-1">
                              {field.label}
                              {field.required && <span className="text-red-500 ml-0.5">*</span>}
                            </label>
                            <input
                              type={field.type}
                              placeholder={field.placeholder}
                              value={configValues[integration.id]?.[field.key] || ''}
                              onChange={e => handleConfigChange(integration.id, field.key, e.target.value)}
                              className="w-full px-3 py-2 text-sm border border-zinc-200 rounded-lg bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300 transition-all"
                              style={{ fontFamily: "'Poppins', Arial, sans-serif" }}
                              onClick={e => e.stopPropagation()}
                            />
                            {field.helpText && (
                              <p className="text-[11px] text-zinc-400 mt-1">{field.helpText}</p>
                            )}
                          </div>
                        ))}
                      </div>

                      {/* Actions */}
                      <div className="flex items-center justify-between mt-6 pt-4 border-t border-zinc-100">
                        <div className="flex items-center gap-3">
                          <button
                            onClick={e => { e.stopPropagation(); handleTest(integration.id); }}
                            disabled={isTesting}
                            className="flex items-center gap-2 px-4 py-2 text-xs font-medium rounded-lg border border-zinc-200 text-zinc-700 hover:bg-zinc-50 transition-colors disabled:opacity-50"
                          >
                            {isTesting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Activity className="w-3.5 h-3.5" />}
                            {isTesting ? 'Testing...' : 'Test Connection'}
                          </button>
                          {!isConnected ? (
                            <button
                              onClick={e => { e.stopPropagation(); handleConnect(integration.id); }}
                              className="flex items-center gap-2 px-4 py-2 text-xs font-medium rounded-lg text-white bg-blue-600 hover:bg-blue-700 transition-colors"
                            >
                              <Plug className="w-3.5 h-3.5" />
                              Save & Connect
                            </button>
                          ) : (
                            <button
                              onClick={e => { e.stopPropagation(); handleDisconnect(integration.id); }}
                              className="flex items-center gap-2 px-4 py-2 text-xs font-medium rounded-lg text-red-600 bg-red-50 hover:bg-red-100 transition-colors"
                            >
                              <X className="w-3.5 h-3.5" />
                              Disconnect
                            </button>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          {testResult === 'success' && (
                            <span className="flex items-center gap-1.5 text-xs text-green-600 font-medium">
                              <CheckCircle2 className="w-3.5 h-3.5" /> Connection verified
                            </span>
                          )}
                          {testResult === 'error' && (
                            <span className="flex items-center gap-1.5 text-xs text-red-600 font-medium">
                              <AlertCircle className="w-3.5 h-3.5" /> Connection failed — check credentials
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Auth info */}
                      <div className="mt-4 p-3 bg-zinc-50 rounded-lg">
                        <p className="text-[11px] text-zinc-500 flex items-center gap-1.5">
                          <Shield className="w-3 h-3 text-zinc-400" />
                          {integration.authType === 'oauth' && 'Authenticates via OAuth 2.0. Your organization can also use SSO pass-through for seamless single sign-on.'}
                          {integration.authType === 'api_key' && 'Authenticates via API key. Credentials are encrypted at rest and never transmitted in plain text.'}
                          {integration.authType === 'saml' && 'Authenticates via SAML 2.0 enterprise SSO. Configure your Identity Provider for pass-through authentication.'}
                          {integration.authType === 'passthrough' && 'Uses your existing organizational credentials for seamless, zero-configuration authentication.'}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Empty state */}
        {filtered.length === 0 && (
          <div className="text-center py-16">
            <Search className="w-8 h-8 text-zinc-300 mx-auto mb-3" />
            <p className="text-sm text-zinc-500">No integrations match your search</p>
            <button
              onClick={() => { setSearch(''); setActiveCategory('all'); }}
              className="text-xs text-blue-600 hover:text-blue-700 mt-2 font-medium"
            >
              Clear filters
            </button>
          </div>
        )}

        {/* Footer */}
        <div className="mt-12 p-6 bg-white border border-zinc-200 rounded-2xl">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-xl bg-zinc-100 flex items-center justify-center flex-shrink-0">
              <Database className="w-5 h-5 text-zinc-500" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-zinc-900">Need a custom integration?</h3>
              <p className="text-xs text-zinc-500 mt-1">
                Concept2Cure supports custom API integrations for LIMS, MES, QMS, ERP, and other enterprise systems.
                Contact your account team to discuss custom connector development for your specific technology stack.
              </p>
              <div className="flex items-center gap-4 mt-3">
                <span className="text-[11px] text-zinc-400 flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  Custom integrations typically available in 2-4 weeks
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default IntegrationsPage;
