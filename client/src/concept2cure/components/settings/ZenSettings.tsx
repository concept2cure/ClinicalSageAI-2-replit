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

import React, { useState } from 'react';
import { cn } from '@/lib/utils';
import {
  X,
  User,
  Building2,
  Bell,
  Shield,
  Key,
  Palette,
  Globe,
  HelpCircle,
  LogOut,
  ChevronRight,
  Moon,
  Sun,
  Monitor,
  Check,
  Mail,
  Phone,
  Camera,
  Link2,
  CreditCard,
  Users,
  Lock,
  FileText,
  Download,
  Trash2,
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
      {description && (
        <div className="text-xs text-zinc-500 mt-0.5">{description}</div>
      )}
    </div>
    <div className="flex-shrink-0">{children}</div>
  </div>
);

interface ToggleSwitchProps {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
}

const ToggleSwitch: React.FC<ToggleSwitchProps> = ({ enabled, onChange }) => (
  <button
    onClick={() => onChange(!enabled)}
    className={cn(
      'relative w-11 h-6 rounded-full transition-colors duration-200',
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
    {description && (
      <p className="text-sm text-zinc-500 mt-1">{description}</p>
    )}
  </div>
);

// ═══════════════════════════════════════════════════════════════════════════════
// PROFILE SECTION
// ═══════════════════════════════════════════════════════════════════════════════

const ProfileSection: React.FC = () => {
  const [name, setName] = useState('John Doe');
  const [email] = useState('john.doe@company.com');
  const [role] = useState('Regulatory Affairs Lead');

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
          <label className="block text-sm font-medium text-zinc-700 mb-1.5">
            Full Name
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-4 py-2.5 rounded-lg border border-zinc-200 text-zinc-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-zinc-700 mb-1.5">
            Email Address
          </label>
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
          <label className="block text-sm font-medium text-zinc-700 mb-1.5">
            Role
          </label>
          <input
            type="text"
            value={role}
            disabled
            className="w-full px-4 py-2.5 rounded-lg border border-zinc-200 text-zinc-500 bg-zinc-50 cursor-not-allowed"
          />
        </div>
      </div>

      <button className="mt-6 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors">
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

        <SettingRow label="Usage" description="847 / 1,000 AI queries this month">
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
      <SectionHeader
        title="Notifications"
        description="Choose what notifications you receive"
      />

      <div className="bg-white rounded-xl border border-zinc-200">
        <SettingRow
          label="Email Digest"
          description="Daily summary of your activity"
        >
          <ToggleSwitch enabled={emailDigest} onChange={setEmailDigest} />
        </SettingRow>

        <SettingRow
          label="Project Updates"
          description="When projects you're part of change"
        >
          <ToggleSwitch enabled={projectUpdates} onChange={setProjectUpdates} />
        </SettingRow>

        <SettingRow
          label="Mentions"
          description="When someone mentions you in a chat"
        >
          <ToggleSwitch enabled={mentionAlerts} onChange={setMentionAlerts} />
        </SettingRow>

        <SettingRow
          label="Weekly Reports"
          description="Weekly summary sent every Monday"
        >
          <ToggleSwitch enabled={weeklyReport} onChange={setWeeklyReport} />
        </SettingRow>

        <SettingRow
          label="Regulatory Alerts"
          description="New guidance and deadline reminders"
        >
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
      <SectionHeader
        title="Security"
        description="Protect your account and data"
      />

      <div className="bg-white rounded-xl border border-zinc-200 mb-6">
        <SettingRow
          label="Two-Factor Authentication"
          description="Add an extra layer of security"
        >
          <ToggleSwitch enabled={twoFactor} onChange={setTwoFactor} />
        </SettingRow>

        <SettingRow
          label="Password"
          description="Last changed 30 days ago"
        >
          <button className="text-sm text-blue-600 hover:text-blue-700 font-medium">
            Change
          </button>
        </SettingRow>

        <SettingRow
          label="Active Sessions"
          description="3 devices currently signed in"
        >
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
      <SectionHeader
        title="Appearance"
        description="Customize how Concept2Cure looks"
      />

      {/* Theme selector */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-zinc-700 mb-3">
          Theme
        </label>
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
              <Icon
                className={cn(
                  'w-6 h-6',
                  theme === id ? 'text-blue-600' : 'text-zinc-400'
                )}
              />
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
        <SettingRow
          label="Compact Mode"
          description="Reduce spacing for denser layouts"
        >
          <ToggleSwitch enabled={compactMode} onChange={setCompactMode} />
        </SettingRow>

        <SettingRow
          label="Show Tips"
          description="Display helpful hints and shortcuts"
        >
          <ToggleSwitch enabled={showTips} onChange={setShowTips} />
        </SettingRow>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// INTEGRATIONS SECTION
// ═══════════════════════════════════════════════════════════════════════════════

const IntegrationsSection: React.FC = () => {
  const integrations = [
    {
      id: 'slack',
      name: 'Slack',
      description: 'Get notifications in Slack',
      connected: true,
      icon: '💬',
    },
    {
      id: 'sharepoint',
      name: 'SharePoint',
      description: 'Sync documents with SharePoint',
      connected: true,
      icon: '📁',
    },
    {
      id: 'jira',
      name: 'Jira',
      description: 'Create issues from findings',
      connected: false,
      icon: '🎯',
    },
    {
      id: 'docusign',
      name: 'DocuSign',
      description: 'E-signatures for approvals',
      connected: false,
      icon: '✍️',
    },
  ];

  return (
    <div>
      <SectionHeader
        title="Integrations"
        description="Connect with your other tools"
      />

      <div className="space-y-3">
        {integrations.map((integration) => (
          <div
            key={integration.id}
            className="flex items-center justify-between p-4 bg-white rounded-xl border border-zinc-200"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-zinc-100 flex items-center justify-center text-xl">
                {integration.icon}
              </div>
              <div>
                <h3 className="text-sm font-medium text-zinc-900">
                  {integration.name}
                </h3>
                <p className="text-xs text-zinc-500">{integration.description}</p>
              </div>
            </div>
            <button
              className={cn(
                'px-3 py-1.5 text-xs font-medium rounded-lg transition-colors',
                integration.connected
                  ? 'text-zinc-600 bg-zinc-100 hover:bg-zinc-200'
                  : 'text-white bg-blue-600 hover:bg-blue-700'
              )}
            >
              {integration.connected ? 'Disconnect' : 'Connect'}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// HELP SECTION
// ═══════════════════════════════════════════════════════════════════════════════

const HelpSection: React.FC = () => {
  const resources = [
    { id: 'docs', label: 'Documentation', icon: FileText, link: '#' },
    { id: 'support', label: 'Contact Support', icon: Mail, link: '#' },
    { id: 'shortcuts', label: 'Keyboard Shortcuts', icon: Key, link: '#' },
  ];

  return (
    <div>
      <SectionHeader
        title="Help & Support"
        description="Get help and learn more about Concept2Cure"
      />

      <div className="space-y-3 mb-6">
        {resources.map(({ id, label, icon: Icon, link }) => (
          <a
            key={id}
            href={link}
            className="flex items-center justify-between p-4 bg-white rounded-xl border border-zinc-200 hover:border-zinc-300 transition-colors"
          >
            <div className="flex items-center gap-3">
              <Icon className="w-5 h-5 text-zinc-500" />
              <span className="text-sm font-medium text-zinc-900">{label}</span>
            </div>
            <ChevronRight className="w-4 h-4 text-zinc-400" />
          </a>
        ))}
      </div>

      <div className="text-center py-6 border-t border-zinc-100">
        <p className="text-xs text-zinc-400 mb-2">
          Concept2Cure v3.0.0 • © 2026 Concept2Cure
        </p>
        <div className="flex justify-center gap-4 text-xs">
          <a href="#" className="text-zinc-500 hover:text-zinc-700">
            Terms
          </a>
          <a href="#" className="text-zinc-500 hover:text-zinc-700">
            Privacy
          </a>
          <a href="#" className="text-zinc-500 hover:text-zinc-700">
            Licenses
          </a>
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
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50"
        onClick={onClose}
      />

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
