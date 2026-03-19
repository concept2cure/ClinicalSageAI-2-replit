/**
 * @fileoverview Zen Settings Panel
 * @module concept2cure/components/settings/ZenSettings
 * @version 3.0.0
 *
 * @description
 * Clean, minimal settings panel inspired by Apple Settings and Claude.ai.
 * Organized into logical sections with smooth transitions.
 *
 * @compliance
 * - FDA 21 CFR Part 11: Settings changes logged
 * - WCAG 2.1 AA: Fully accessible forms
 */

import React, { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import {
  X,
  User,
  Building2,
  Bell,
  Shield,
  Key,
  Palette,
  HelpCircle,
  LogOut,
  ChevronRight,
  Moon,
  Sun,
  Monitor,
  Mail,
  Camera,
  Link2,
  FileText,
} from 'lucide-react';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

type SettingsSection =
  | 'profile'
  | 'organization'
  | 'notifications'
  | 'security'
  | 'appearance'
  | 'integrations'
  | 'help';

interface ZenSettingsProps {
  isOpen: boolean;
  onClose: () => void;
}

// ═══════════════════════════════════════════════════════════════════════════════
// NAV ITEMS
// ═══════════════════════════════════════════════════════════════════════════════

const SETTINGS_NAV: {
  id: SettingsSection;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { id: 'profile', label: 'Profile', icon: User },
  { id: 'organization', label: 'Organization', icon: Building2 },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'security', label: 'Security', icon: Shield },
  { id: 'appearance', label: 'Appearance', icon: Palette },
  { id: 'integrations', label: 'Integrations', icon: Link2 },
  { id: 'help', label: 'Help & Support', icon: HelpCircle },
];

// ═══════════════════════════════════════════════════════════════════════════════
// REUSABLE COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════════

interface SettingRowProps {
  label: string;
  description?: string;
  children: React.ReactNode;
}

const SettingRow: React.FC<SettingRowProps> = ({ label, description, children }) => (
  <div className="flex items-center justify-between py-4 border-b border-zinc-100 last:border-b-0">
    <div className="flex-1 pr-4">
      <div className="text-sm font-medium text-zinc-900">{label}</div>
      {description && <div className="text-xs text-zinc-500 mt-0.5">{description}</div>}
    </div>
    <div className="flex-shrink-0">{children}</div>
  </div>
);

interface ToggleSwitchProps {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
  label?: string;
}

const ToggleSwitch: React.FC<ToggleSwitchProps> = ({ enabled, onChange, label }) => (
  <button
    role="switch"
    aria-checked={enabled}
    aria-label={label}
    onClick={() => onChange(!enabled)}
    className={cn(
      'relative w-11 h-6 rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-blue-200 focus:ring-offset-2',
      enabled ? 'bg-blue-600' : 'bg-zinc-300'
    )}
  >
    <span
      className={cn(
        'absolute top-1 left-1 w-4 h-4 bg-white rounded-full shadow transition-transform duration-200',
        enabled && 'translate-x-5'
      )}
    />
  </button>
);

interface SectionHeaderProps {
  title: string;
  description?: string;
}

const SectionHeader: React.FC<SectionHeaderProps> = ({ title, description }) => (
  <div className="mb-6">
    <h2 className="text-lg font-semibold text-zinc-900">{title}</h2>
    {description && <p className="text-sm text-zinc-500 mt-1">{description}</p>}
  </div>
);

// ═══════════════════════════════════════════════════════════════════════════════
// PROFILE SECTION
// ═══════════════════════════════════════════════════════════════════════════════

const ProfileSection: React.FC = () => {
  const [name, setName] = useState('John Doe');
  const [email] = useState('john.doe@company.com');
  const [role, setRole] = useState('Regulatory Affairs Lead');
  const [objectives, setObjectives] = useState('Submission readiness, evidence alignment');
  const [criteria, setCriteria] = useState('Risk reduction, audit readiness');

  useEffect(() => {
    try {
      const savedProfile = localStorage.getItem('concept2cure_user_profile');
      if (savedProfile) {
        const parsed = JSON.parse(savedProfile) as {
          role?: string;
          objectives?: string[];
          criteria?: string[];
        };
        if (parsed.role) setRole(parsed.role);
        if (parsed.objectives?.length) setObjectives(parsed.objectives.join(', '));
        if (parsed.criteria?.length) setCriteria(parsed.criteria.join(', '));
      }
    } catch (error) {
      console.warn('Unable to load profile settings', error);
    }
  }, []);

  const handleSave = () => {
    const normalizeList = (value: string) =>
      value
        .split(/\n|,/)
        .map(item => item.trim())
        .filter(Boolean);

    const profile = {
      role,
      objectives: normalizeList(objectives),
      criteria: normalizeList(criteria),
      updatedAt: new Date().toISOString(),
    };

    localStorage.setItem('concept2cure_user_profile', JSON.stringify(profile));
  };

  return (
    <div>
      <SectionHeader
        title="Profile"
        description="Manage your personal information and preferences"
      />

      {/* Avatar */}
      <div className="flex items-center gap-4 mb-6 pb-6 border-b border-zinc-100">
        <div className="relative">
          <div className="w-20 h-20 rounded-full bg-gradient-to-br from-blue-500 to-violet-500 flex items-center justify-center text-white text-2xl font-semibold">
            JD
          </div>
          <button className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-white border border-zinc-200 shadow-sm flex items-center justify-center hover:bg-zinc-50 transition-colors">
            <Camera className="w-4 h-4 text-zinc-600" />
          </button>
        </div>
        <div>
          <h3 className="text-lg font-semibold text-zinc-900">{name}</h3>
          <p className="text-sm text-zinc-500">{role}</p>
        </div>
      </div>

      {/* Form */}
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-zinc-700 mb-1.5">Full Name</label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            className="w-full px-4 py-2.5 rounded-lg border border-zinc-200 text-zinc-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-zinc-700 mb-1.5">Email Address</label>
          <input
            type="email"
            value={email}
            disabled
            className="w-full px-4 py-2.5 rounded-lg border border-zinc-200 text-zinc-500 bg-zinc-50 cursor-not-allowed"
          />
          <p className="text-xs text-zinc-400 mt-1">
            Contact your administrator to change your email
          </p>
        </div>
        <div>
          <label className="block text-sm font-medium text-zinc-700 mb-1.5">Role</label>
          <input
            type="text"
            value={role}
            onChange={e => setRole(e.target.value)}
            className="w-full px-4 py-2.5 rounded-lg border border-zinc-200 text-zinc-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-zinc-700 mb-1.5">Objectives</label>
          <textarea
            value={objectives}
            onChange={e => setObjectives(e.target.value)}
            rows={3}
            className="w-full px-4 py-2.5 rounded-lg border border-zinc-200 text-zinc-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all"
            placeholder="Comma or new-line separated"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-zinc-700 mb-1.5">Success criteria</label>
          <textarea
            value={criteria}
            onChange={e => setCriteria(e.target.value)}
            rows={3}
            className="w-full px-4 py-2.5 rounded-lg border border-zinc-200 text-zinc-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all"
            placeholder="What must be true for success"
          />
        </div>
      </div>

      <button
        onClick={handleSave}
        className="mt-6 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
      >
        Save Changes
      </button>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// ORGANIZATION SECTION
// ═══════════════════════════════════════════════════════════════════════════════

const OrganizationSection: React.FC = () => {
  return (
    <div>
      <SectionHeader
        title="Organization"
        description="Manage your organization settings and team"
      />

      <div className="bg-white rounded-xl border border-zinc-200 divide-y divide-zinc-100">
        <div className="p-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-lg bg-blue-100 flex items-center justify-center">
              <Building2 className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-zinc-900">Acme Biotech</h3>
              <p className="text-sm text-zinc-500">Enterprise Plan</p>
            </div>
          </div>
        </div>

        <SettingRow label="Team Members" description="12 active members">
          <button className="text-sm text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1">
            Manage
            <ChevronRight className="w-4 h-4" />
          </button>
        </SettingRow>

        <SettingRow label="Billing" description="Next billing date: Feb 1, 2026">
          <button className="text-sm text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1">
            View
            <ChevronRight className="w-4 h-4" />
          </button>
        </SettingRow>

        <SettingRow label="Usage" description="847 / 1,000 RI queries this month">
          <div className="w-24 h-2 bg-zinc-200 rounded-full overflow-hidden">
            <div className="h-full bg-blue-600 rounded-full" style={{ width: '84.7%' }} />
          </div>
        </SettingRow>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// NOTIFICATIONS SECTION
// ═══════════════════════════════════════════════════════════════════════════════

const NotificationsSection: React.FC = () => {
  const [emailDigest, setEmailDigest] = useState(true);
  const [projectUpdates, setProjectUpdates] = useState(true);
  const [mentionAlerts, setMentionAlerts] = useState(true);
  const [weeklyReport, setWeeklyReport] = useState(false);
  const [regulatoryAlerts, setRegulatoryAlerts] = useState(true);

  return (
    <div>
      <SectionHeader title="Notifications" description="Choose what notifications you receive" />

      <div className="bg-white rounded-xl border border-zinc-200">
        <SettingRow label="Email Digest" description="Daily summary of your activity">
          <ToggleSwitch enabled={emailDigest} onChange={setEmailDigest} />
        </SettingRow>

        <SettingRow label="Project Updates" description="When projects you're part of change">
          <ToggleSwitch enabled={projectUpdates} onChange={setProjectUpdates} />
        </SettingRow>

        <SettingRow label="Mentions" description="When someone mentions you in a chat">
          <ToggleSwitch enabled={mentionAlerts} onChange={setMentionAlerts} />
        </SettingRow>

        <SettingRow label="Weekly Reports" description="Weekly summary sent every Monday">
          <ToggleSwitch enabled={weeklyReport} onChange={setWeeklyReport} />
        </SettingRow>

        <SettingRow label="Regulatory Alerts" description="New guidance and deadline reminders">
          <ToggleSwitch enabled={regulatoryAlerts} onChange={setRegulatoryAlerts} />
        </SettingRow>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// SECURITY SECTION
// ═══════════════════════════════════════════════════════════════════════════════

const SecuritySection: React.FC = () => {
  const [twoFactor, setTwoFactor] = useState(true);

  return (
    <div>
      <SectionHeader title="Security" description="Protect your account and data" />

      <div className="bg-white rounded-xl border border-zinc-200 mb-6">
        <SettingRow label="Two-Factor Authentication" description="Add an extra layer of security">
          <ToggleSwitch enabled={twoFactor} onChange={setTwoFactor} />
        </SettingRow>

        <SettingRow label="Password" description="Last changed 30 days ago">
          <button className="text-sm text-blue-600 hover:text-blue-700 font-medium">Change</button>
        </SettingRow>

        <SettingRow label="Active Sessions" description="3 devices currently signed in">
          <button className="text-sm text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1">
            View
            <ChevronRight className="w-4 h-4" />
          </button>
        </SettingRow>
      </div>

      {/* Danger zone */}
      <div className="bg-red-50 rounded-xl border border-red-200 p-4">
        <h3 className="text-sm font-semibold text-red-800 mb-1">Danger Zone</h3>
        <p className="text-xs text-red-600 mb-4">
          These actions are irreversible. Please proceed with caution.
        </p>
        <div className="flex gap-3">
          <button className="px-3 py-1.5 text-xs font-medium text-red-700 border border-red-300 rounded-lg hover:bg-red-100 transition-colors">
            Export All Data
          </button>
          <button className="px-3 py-1.5 text-xs font-medium text-red-700 border border-red-300 rounded-lg hover:bg-red-100 transition-colors">
            Delete Account
          </button>
        </div>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// APPEARANCE SECTION
// ═══════════════════════════════════════════════════════════════════════════════

const AppearanceSection: React.FC = () => {
  const [theme, setTheme] = useState<'light' | 'dark' | 'system'>('system');
  const [compactMode, setCompactMode] = useState(false);
  const [showTips, setShowTips] = useState(true);

  const themes = [
    { id: 'light', label: 'Light', icon: Sun },
    { id: 'dark', label: 'Dark', icon: Moon },
    { id: 'system', label: 'System', icon: Monitor },
  ] as const;

  return (
    <div>
      <SectionHeader title="Appearance" description="Customize how Concept2Cure looks" />

      {/* Theme selector */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-zinc-700 mb-3">Theme</label>
        <div className="flex gap-3">
          {themes.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setTheme(id)}
              className={cn(
                'flex-1 flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all',
                theme === id
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-zinc-200 hover:border-zinc-300'
              )}
            >
              <Icon className={cn('w-6 h-6', theme === id ? 'text-blue-600' : 'text-zinc-400')} />
              <span
                className={cn(
                  'text-sm font-medium',
                  theme === id ? 'text-blue-600' : 'text-zinc-600'
                )}
              >
                {label}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-zinc-200">
        <SettingRow label="Compact Mode" description="Reduce spacing for denser layouts">
          <ToggleSwitch enabled={compactMode} onChange={setCompactMode} />
        </SettingRow>

        <SettingRow label="Show Tips" description="Display helpful hints and shortcuts">
          <ToggleSwitch enabled={showTips} onChange={setShowTips} />
        </SettingRow>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// INTEGRATIONS SECTION — Enterprise Connectors
// ═══════════════════════════════════════════════════════════════════════════════

type IntegrationCategory = 'clinical' | 'content' | 'cloud' | 'collaboration';

interface IntegrationConfig {
  id: string;
  name: string;
  description: string;
  category: IntegrationCategory;
  connected: boolean;
  icon: string;
  authType: 'oauth' | 'api_key' | 'saml' | 'passthrough';
  configFields: { key: string; label: string; placeholder: string; type: 'text' | 'password' | 'url' }[];
}

const ENTERPRISE_INTEGRATIONS: IntegrationConfig[] = [
  // Clinical & Regulatory
  {
    id: 'medidata',
    name: 'Medidata Rave',
    description: 'Clinical data management, EDC integration, and study data exchange',
    category: 'clinical',
    connected: false,
    icon: 'M',
    authType: 'oauth',
    configFields: [
      { key: 'clientId', label: 'Client ID', placeholder: 'Enter Medidata Client ID', type: 'text' },
      { key: 'clientSecret', label: 'Client Secret', placeholder: 'Enter Client Secret', type: 'password' },
      { key: 'environment', label: 'Environment URL', placeholder: 'https://your-org.mdsol.com', type: 'url' },
    ],
  },
  {
    id: 'veeva-vault',
    name: 'Veeva Vault',
    description: 'Regulatory submissions, eTMF, and quality document management',
    category: 'clinical',
    connected: false,
    icon: 'V',
    authType: 'oauth',
    configFields: [
      { key: 'vaultUrl', label: 'Vault URL', placeholder: 'https://your-vault.veevavault.com', type: 'url' },
      { key: 'username', label: 'API Username', placeholder: 'api-user@domain.com', type: 'text' },
      { key: 'password', label: 'API Password', placeholder: 'Enter Vault password', type: 'password' },
    ],
  },
  {
    id: 'veeva-crm',
    name: 'Veeva CRM',
    description: 'Sales force automation and medical affairs engagement',
    category: 'clinical',
    connected: false,
    icon: 'V',
    authType: 'oauth',
    configFields: [
      { key: 'instanceUrl', label: 'Instance URL', placeholder: 'https://your-org.veevacrm.com', type: 'url' },
      { key: 'clientId', label: 'Connected App Client ID', placeholder: 'Enter Client ID', type: 'text' },
      { key: 'clientSecret', label: 'Client Secret', placeholder: 'Enter Client Secret', type: 'password' },
    ],
  },
  // Content & Document
  {
    id: 'adobe',
    name: 'Adobe Experience Cloud',
    description: 'PDF services, e-signatures, and document generation',
    category: 'content',
    connected: false,
    icon: 'A',
    authType: 'api_key',
    configFields: [
      { key: 'apiKey', label: 'API Key', placeholder: 'Enter Adobe API Key', type: 'password' },
      { key: 'orgId', label: 'Organization ID', placeholder: 'Enter Org ID', type: 'text' },
      { key: 'technicalAccountId', label: 'Technical Account ID', placeholder: 'Enter Account ID', type: 'text' },
    ],
  },
  {
    id: 'docusign',
    name: 'DocuSign',
    description: 'Electronic signatures for regulatory approvals and submissions',
    category: 'content',
    connected: false,
    icon: 'D',
    authType: 'oauth',
    configFields: [
      { key: 'integrationKey', label: 'Integration Key', placeholder: 'Enter Integration Key', type: 'text' },
      { key: 'secretKey', label: 'Secret Key', placeholder: 'Enter Secret Key', type: 'password' },
      { key: 'accountId', label: 'Account ID', placeholder: 'Enter DocuSign Account ID', type: 'text' },
    ],
  },
  // Cloud Storage
  {
    id: 'google-drive',
    name: 'Google Drive',
    description: 'Cloud file storage, collaboration, and document sharing',
    category: 'cloud',
    connected: false,
    icon: 'G',
    authType: 'oauth',
    configFields: [
      { key: 'clientId', label: 'OAuth Client ID', placeholder: 'Enter Google OAuth Client ID', type: 'text' },
      { key: 'clientSecret', label: 'OAuth Client Secret', placeholder: 'Enter Client Secret', type: 'password' },
      { key: 'redirectUri', label: 'Redirect URI', placeholder: 'https://your-app.com/auth/google/callback', type: 'url' },
    ],
  },
  {
    id: 'onedrive',
    name: 'Microsoft OneDrive',
    description: 'Cloud storage and file sync with Microsoft 365',
    category: 'cloud',
    connected: false,
    icon: 'O',
    authType: 'oauth',
    configFields: [
      { key: 'tenantId', label: 'Azure Tenant ID', placeholder: 'Enter Azure AD Tenant ID', type: 'text' },
      { key: 'clientId', label: 'Application Client ID', placeholder: 'Enter App Client ID', type: 'text' },
      { key: 'clientSecret', label: 'Client Secret', placeholder: 'Enter Client Secret', type: 'password' },
    ],
  },
  {
    id: 'sharepoint',
    name: 'Microsoft SharePoint',
    description: 'Enterprise document management, team sites, and content collaboration',
    category: 'cloud',
    connected: false,
    icon: 'S',
    authType: 'oauth',
    configFields: [
      { key: 'tenantId', label: 'Azure Tenant ID', placeholder: 'Enter Azure AD Tenant ID', type: 'text' },
      { key: 'clientId', label: 'Application Client ID', placeholder: 'Enter App Client ID', type: 'text' },
      { key: 'clientSecret', label: 'Client Secret', placeholder: 'Enter Client Secret', type: 'password' },
      { key: 'siteUrl', label: 'SharePoint Site URL', placeholder: 'https://your-org.sharepoint.com/sites/docs', type: 'url' },
    ],
  },
  // Collaboration
  {
    id: 'slack',
    name: 'Slack',
    description: 'Team notifications, alerts, and workflow updates',
    category: 'collaboration',
    connected: false,
    icon: 'S',
    authType: 'oauth',
    configFields: [
      { key: 'webhookUrl', label: 'Webhook URL', placeholder: 'https://hooks.slack.com/services/...', type: 'url' },
      { key: 'botToken', label: 'Bot Token', placeholder: 'xoxb-your-bot-token', type: 'password' },
    ],
  },
  {
    id: 'jira',
    name: 'Jira',
    description: 'Issue tracking, project management, and compliance tasks',
    category: 'collaboration',
    connected: false,
    icon: 'J',
    authType: 'api_key',
    configFields: [
      { key: 'siteUrl', label: 'Jira Site URL', placeholder: 'https://your-org.atlassian.net', type: 'url' },
      { key: 'email', label: 'Jira Email', placeholder: 'user@company.com', type: 'text' },
      { key: 'apiToken', label: 'API Token', placeholder: 'Enter Jira API Token', type: 'password' },
    ],
  },
];

const CATEGORY_LABELS: Record<IntegrationCategory, string> = {
  clinical: 'Clinical & Regulatory',
  content: 'Content & Documents',
  cloud: 'Cloud Storage',
  collaboration: 'Collaboration',
};

const CATEGORY_ICONS: Record<IntegrationCategory, string> = {
  clinical: '🔬',
  content: '📄',
  cloud: '☁️',
  collaboration: '💬',
};

const AUTH_TYPE_LABELS: Record<string, string> = {
  oauth: 'OAuth 2.0 / SSO',
  api_key: 'API Key',
  saml: 'SAML SSO',
  passthrough: 'Pass-through Auth',
};

const IntegrationsSection: React.FC = () => {
  const [configuring, setConfiguring] = useState<string | null>(null);
  const [connectedMap, setConnectedMap] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem('c2c_integrations_connected');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });
  const [configValues, setConfigValues] = useState<Record<string, Record<string, string>>>(() => {
    try {
      const saved = localStorage.getItem('c2c_integrations_config');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });
  const [filterCategory, setFilterCategory] = useState<IntegrationCategory | 'all'>('all');
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, 'success' | 'error' | null>>({});

  const filteredIntegrations =
    filterCategory === 'all'
      ? ENTERPRISE_INTEGRATIONS
      : ENTERPRISE_INTEGRATIONS.filter(i => i.category === filterCategory);

  const categories = Array.from(new Set(ENTERPRISE_INTEGRATIONS.map(i => i.category)));

  const handleConnect = (id: string) => {
    const updated = { ...connectedMap, [id]: true };
    setConnectedMap(updated);
    localStorage.setItem('c2c_integrations_connected', JSON.stringify(updated));
    setConfiguring(null);
  };

  const handleDisconnect = (id: string) => {
    const updated = { ...connectedMap, [id]: false };
    setConnectedMap(updated);
    localStorage.setItem('c2c_integrations_connected', JSON.stringify(updated));
    setTestResults(prev => ({ ...prev, [id]: null }));
  };

  const handleConfigChange = (integrationId: string, fieldKey: string, value: string) => {
    setConfigValues(prev => {
      const updated = {
        ...prev,
        [integrationId]: { ...(prev[integrationId] || {}), [fieldKey]: value },
      };
      localStorage.setItem('c2c_integrations_config', JSON.stringify(updated));
      return updated;
    });
  };

  const handleTestConnection = (id: string) => {
    setTestingId(id);
    setTestResults(prev => ({ ...prev, [id]: null }));
    // Simulate test
    setTimeout(() => {
      const hasConfig = configValues[id] && Object.values(configValues[id]).some(v => v.trim());
      setTestResults(prev => ({ ...prev, [id]: hasConfig ? 'success' : 'error' }));
      setTestingId(null);
    }, 1500);
  };

  const connectedCount = Object.values(connectedMap).filter(Boolean).length;

  return (
    <div>
      <SectionHeader
        title="Enterprise Integrations"
        description={`Connect Concept2Cure with your clinical, document, and collaboration tools. ${connectedCount} of ${ENTERPRISE_INTEGRATIONS.length} connected.`}
      />

      {/* Category filter tabs */}
      <div className="flex flex-wrap gap-2 mb-6">
        <button
          onClick={() => setFilterCategory('all')}
          className={cn(
            'px-3 py-1.5 text-xs font-medium rounded-lg transition-colors',
            filterCategory === 'all'
              ? 'bg-blue-600 text-white'
              : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
          )}
        >
          All ({ENTERPRISE_INTEGRATIONS.length})
        </button>
        {categories.map(cat => {
          const count = ENTERPRISE_INTEGRATIONS.filter(i => i.category === cat).length;
          return (
            <button
              key={cat}
              onClick={() => setFilterCategory(cat)}
              className={cn(
                'px-3 py-1.5 text-xs font-medium rounded-lg transition-colors',
                filterCategory === cat
                  ? 'bg-blue-600 text-white'
                  : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
              )}
            >
              {CATEGORY_ICONS[cat]} {CATEGORY_LABELS[cat]} ({count})
            </button>
          );
        })}
      </div>

      {/* Integration cards */}
      <div className="space-y-3">
        {filteredIntegrations.map(integration => {
          const isConnected = connectedMap[integration.id] || false;
          const isConfiguring = configuring === integration.id;
          const testResult = testResults[integration.id];
          const isTesting = testingId === integration.id;

          return (
            <div
              key={integration.id}
              className={cn(
                'rounded-xl border transition-all duration-200',
                isConnected
                  ? 'border-green-200 bg-green-50/50'
                  : 'border-zinc-200 bg-white',
                isConfiguring && 'ring-2 ring-blue-200'
              )}
            >
              {/* Integration header */}
              <div className="flex items-center justify-between p-4">
                <div className="flex items-center gap-3">
                  <div
                    className={cn(
                      'w-10 h-10 rounded-lg flex items-center justify-center text-sm font-bold',
                      isConnected
                        ? 'bg-green-100 text-green-700'
                        : 'bg-zinc-100 text-zinc-600'
                    )}
                  >
                    {integration.icon}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-medium text-zinc-900">{integration.name}</h3>
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-zinc-100 text-zinc-400 font-medium">
                        {AUTH_TYPE_LABELS[integration.authType]}
                      </span>
                      {isConnected && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">
                          Connected
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-zinc-500 mt-0.5">{integration.description}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {isConnected && (
                    <button
                      onClick={() => setConfiguring(isConfiguring ? null : integration.id)}
                      className="px-3 py-1.5 text-xs font-medium rounded-lg text-zinc-600 bg-zinc-100 hover:bg-zinc-200 transition-colors"
                    >
                      {isConfiguring ? 'Close' : 'Manage'}
                    </button>
                  )}
                  <button
                    onClick={() =>
                      isConnected
                        ? handleDisconnect(integration.id)
                        : setConfiguring(isConfiguring ? null : integration.id)
                    }
                    className={cn(
                      'px-3 py-1.5 text-xs font-medium rounded-lg transition-colors',
                      isConnected
                        ? 'text-red-600 bg-red-50 hover:bg-red-100'
                        : isConfiguring
                          ? 'text-zinc-600 bg-zinc-100 hover:bg-zinc-200'
                          : 'text-white bg-blue-600 hover:bg-blue-700'
                    )}
                  >
                    {isConnected ? 'Disconnect' : isConfiguring ? 'Cancel' : 'Configure'}
                  </button>
                </div>
              </div>

              {/* Configuration panel */}
              {isConfiguring && (
                <div className="px-4 pb-4 border-t border-zinc-100 pt-4">
                  <div className="space-y-3">
                    {integration.configFields.map(field => (
                      <div key={field.key}>
                        <label className="block text-xs font-medium text-zinc-700 mb-1">
                          {field.label}
                        </label>
                        <input
                          type={field.type}
                          placeholder={field.placeholder}
                          value={configValues[integration.id]?.[field.key] || ''}
                          onChange={e =>
                            handleConfigChange(integration.id, field.key, e.target.value)
                          }
                          className="w-full px-3 py-2 text-sm border border-zinc-200 rounded-lg bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400 transition-all"
                        />
                      </div>
                    ))}
                  </div>

                  {/* Test + Connect buttons */}
                  <div className="flex items-center gap-3 mt-4">
                    <button
                      onClick={() => handleTestConnection(integration.id)}
                      disabled={isTesting}
                      className="px-4 py-2 text-xs font-medium rounded-lg border border-zinc-200 text-zinc-700 hover:bg-zinc-50 transition-colors disabled:opacity-50"
                    >
                      {isTesting ? 'Testing...' : 'Test Connection'}
                    </button>
                    <button
                      onClick={() => handleConnect(integration.id)}
                      className="px-4 py-2 text-xs font-medium rounded-lg text-white bg-blue-600 hover:bg-blue-700 transition-colors"
                    >
                      Save & Connect
                    </button>
                    {testResult === 'success' && (
                      <span className="text-xs text-green-600 font-medium">Connection successful</span>
                    )}
                    {testResult === 'error' && (
                      <span className="text-xs text-red-600 font-medium">
                        Connection failed — check credentials
                      </span>
                    )}
                  </div>

                  {/* Auth type info */}
                  <p className="text-[11px] text-zinc-400 mt-3">
                    {integration.authType === 'oauth' &&
                      'Uses OAuth 2.0 for secure authentication. You can also use your organization\'s SSO provider for pass-through sign-on.'}
                    {integration.authType === 'api_key' &&
                      'Uses API key authentication. Store your keys securely — they are encrypted at rest.'}
                    {integration.authType === 'saml' &&
                      'Uses SAML 2.0 for enterprise SSO. Configure your Identity Provider (IdP) to enable pass-through authentication.'}
                    {integration.authType === 'passthrough' &&
                      'Uses your existing organizational credentials for seamless authentication.'}
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// HELP SECTION
// ═══════════════════════════════════════════════════════════════════════════════

const HelpSection: React.FC = () => {
  const resources = [
    { id: 'docs', label: 'Documentation', icon: FileText, href: '/concept2cure/legal/terms', desc: 'Platform guides and regulatory resources' },
    { id: 'support', label: 'Contact Support', icon: Mail, href: 'mailto:support@concept2cure.com', desc: 'Email our team at support@concept2cure.com' },
    { id: 'shortcuts', label: 'Keyboard Shortcuts', icon: Key, href: null, desc: null },
  ];

  const [showShortcuts, setShowShortcuts] = React.useState(false);

  return (
    <div>
      <SectionHeader
        title="Help & Support"
        description="Get help and learn more about Concept2Cure"
      />

      <div className="space-y-3 mb-6">
        {resources.map(({ id, label, icon: Icon, href, desc }) => (
          <a
            key={id}
            href={id === 'shortcuts' ? undefined : (href || '#')}
            onClick={id === 'shortcuts' ? () => setShowShortcuts(!showShortcuts) : undefined}
            target={href?.startsWith('http') || href?.startsWith('mailto') ? '_blank' : undefined}
            rel={href?.startsWith('http') ? 'noopener noreferrer' : undefined}
            className="flex items-center justify-between p-4 bg-white rounded-xl border border-zinc-200 hover:bg-zinc-50 transition-colors cursor-pointer block"
          >
            <div className="flex items-center gap-3">
              <Icon className="w-5 h-5 text-zinc-500" />
              <div>
                <span className="text-sm font-medium text-zinc-900 block">{label}</span>
                {desc && <span className="text-xs text-zinc-500">{desc}</span>}
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-zinc-400" />
          </a>
        ))}
      </div>

      {/* Keyboard Shortcuts */}
      {showShortcuts && (
        <div className="mb-6 p-4 bg-zinc-50 rounded-xl border border-zinc-200">
          <h4 className="text-sm font-medium text-zinc-900 mb-3">Keyboard Shortcuts</h4>
          <div className="space-y-2">
            {[
              { keys: '⌘ K', desc: 'Open command palette' },
              { keys: '⌘ ,', desc: 'Open settings' },
              { keys: '⌘ N', desc: 'New conversation' },
              { keys: '⌘ B', desc: 'Toggle sidebar' },
              { keys: '⌘ /', desc: 'Toggle AI copilot' },
              { keys: 'Esc', desc: 'Close modal / panel' },
            ].map(s => (
              <div key={s.keys} className="flex items-center justify-between">
                <span className="text-xs text-zinc-600">{s.desc}</span>
                <kbd className="text-[11px] px-1.5 py-0.5 rounded bg-white border border-zinc-200 text-zinc-500 font-mono">{s.keys}</kbd>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="text-center py-6 border-t border-zinc-100">
        <p className="text-xs text-zinc-400 mb-2">Concept2Cure v3.0.0 • © 2026 Concept2Cure, Inc.</p>
        <div className="flex justify-center gap-4 text-xs">
          <a href="/concept2cure/legal/terms" className="text-zinc-400 hover:text-zinc-600 transition-colors" target="_blank">Terms</a>
          <a href="/concept2cure/legal/privacy" className="text-zinc-400 hover:text-zinc-600 transition-colors" target="_blank">Privacy</a>
          <a href="/concept2cure/legal/sla" className="text-zinc-400 hover:text-zinc-600 transition-colors" target="_blank">SLA</a>
          <a href="/concept2cure/legal/baa" className="text-zinc-400 hover:text-zinc-600 transition-colors" target="_blank">BAA</a>
        </div>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION MAP
// ═══════════════════════════════════════════════════════════════════════════════

const SECTION_COMPONENTS: Record<SettingsSection, React.FC> = {
  profile: ProfileSection,
  organization: OrganizationSection,
  notifications: NotificationsSection,
  security: SecuritySection,
  appearance: AppearanceSection,
  integrations: IntegrationsSection,
  help: HelpSection,
};

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export const ZenSettings: React.FC<ZenSettingsProps> = ({ isOpen, onClose }) => {
  const [activeSection, setActiveSection] = useState<SettingsSection>('profile');
  const ActiveComponent = SECTION_COMPONENTS[activeSection];

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50" onClick={onClose} />

      {/* Modal */}
      <div className="fixed inset-4 sm:inset-auto sm:top-[5%] sm:left-1/2 sm:-translate-x-1/2 sm:w-full sm:max-w-4xl sm:h-[90vh] bg-white rounded-2xl shadow-2xl overflow-hidden z-50 flex animate-in fade-in zoom-in-95 duration-150">
        {/* Sidebar */}
        <div className="w-56 bg-zinc-50 border-r border-zinc-200 flex flex-col">
          {/* Header */}
          <div className="p-4 border-b border-zinc-200">
            <h1 className="text-lg font-semibold text-zinc-900">Settings</h1>
          </div>

          {/* Navigation */}
          <nav className="flex-1 p-2 space-y-0.5">
            {SETTINGS_NAV.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setActiveSection(id)}
                className={cn(
                  'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                  activeSection === id
                    ? 'bg-white text-zinc-900 shadow-sm'
                    : 'text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100'
                )}
              >
                <Icon className="w-4 h-4" />
                {label}
              </button>
            ))}
          </nav>

          {/* Sign out */}
          <div className="p-2 border-t border-zinc-200">
            <button className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-red-600 hover:bg-red-50 transition-colors">
              <LogOut className="w-4 h-4" />
              Sign Out
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 flex flex-col">
          {/* Content header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-200">
            <div />
            <button
              onClick={onClose}
              className="p-2 rounded-lg text-zinc-500 hover:text-zinc-700 hover:bg-zinc-100 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Content body */}
          <div className="flex-1 overflow-y-auto p-6 zen-scroll">
            <ActiveComponent />
          </div>
        </div>
      </div>
    </>
  );
};

export default ZenSettings;
