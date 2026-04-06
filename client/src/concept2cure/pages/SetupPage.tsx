/**
 * SetupPage — Global settings destination.
 *
 * A full-page settings experience (not a modal). Mirrors ZenSettings
 * sections but rendered inline as a page. 8 sections: Profile,
 * Organization, Notifications, Security, Appearance, Integrations,
 * AnA Intelligence, Help.
 */

import React, { useState } from 'react';
import { cn } from '@/lib/utils';
import { WorkspaceCanvas, PageTitleHeader } from '@/components/ui/workspace-primitives';
import {
  Settings,
  User,
  Building2,
  Bell,
  Shield,
  Palette,
  Link2,
  HelpCircle,
  Brain,
  ChevronRight,
  ExternalLink,
} from 'lucide-react';

// ─── Section definitions ──────────────────────────────────────────────────────

type SetupSection = 'profile' | 'organization' | 'notifications' | 'security' | 'appearance' | 'integrations' | 'ana-intelligence' | 'help';

const SECTIONS: {
  id: SetupSection;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { id: 'profile', label: 'Profile', description: 'Your name, role, and account details', icon: User },
  { id: 'organization', label: 'Organization', description: 'Team, plan, and workspace settings', icon: Building2 },
  { id: 'notifications', label: 'Notifications', description: 'Email, in-app alerts, and digest preferences', icon: Bell },
  { id: 'security', label: 'Security', description: 'Two-factor authentication, password, and sessions', icon: Shield },
  { id: 'appearance', label: 'Appearance', description: 'Theme, compact mode, and display preferences', icon: Palette },
  { id: 'integrations', label: 'Integrations', description: 'Connect to Veeva, Medidata, Slack, and more', icon: Link2 },
  { id: 'ana-intelligence', label: 'Customize AnA', description: 'Your role, company regulatory posture, and project-level submission strategy', icon: Brain },
  { id: 'help', label: 'Help & Support', description: 'Documentation, tutorials, and contact support', icon: HelpCircle },
];

// ─── Props ────────────────────────────────────────────────────────────────────

interface SetupPageProps {
  onOpenSettings: (section?: string) => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export const SetupPage: React.FC<SetupPageProps> = ({ onOpenSettings }) => {
  return (
    <WorkspaceCanvas maxWidth="3xl" testId="setup-page">
      <PageTitleHeader
        title="Settings"
        subtitle="Configure your workspace, profile, and integrations"
      />

      <div className="mt-6 space-y-2">
        {SECTIONS.map(section => {
          const Icon = section.icon;
          return (
            <button
              key={section.id}
              onClick={() => onOpenSettings(section.id)}
              aria-label={`Open ${section.label} settings`}
              className="w-full flex items-center gap-4 p-4 rounded-xl border border-stone-100 hover:border-stone-200 hover:bg-stone-50/50 transition-all text-left group focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:outline-none"
            >
              <div className="w-10 h-10 rounded-lg bg-stone-100 flex items-center justify-center flex-shrink-0 group-hover:bg-stone-200 transition-colors">
                <Icon className="w-5 h-5 text-stone-500" />
              </div>
              <div className="flex-1 min-w-0">
                <span className="text-sm font-medium text-stone-800 block">{section.label}</span>
                <span className="text-xs text-stone-500 block mt-0.5">{section.description}</span>
              </div>
              <ChevronRight className="w-4 h-4 text-stone-300 flex-shrink-0 group-hover:text-stone-400 transition-colors" />
            </button>
          );
        })}
      </div>

      {/* Quick links */}
      <div className="mt-8 pt-6 border-t border-stone-100">
        <h3 className="text-xs font-semibold text-stone-400 uppercase tracking-wider mb-3">Quick Links</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <button
            onClick={() => onOpenSettings('profile')}
            className="flex items-center gap-2 px-3 py-2 text-sm text-stone-600 hover:text-stone-800 hover:bg-stone-50 rounded-lg transition-colors text-left focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:outline-none"
          >
            <User className="w-4 h-4 text-stone-400" />
            Edit profile
          </button>
          <button
            onClick={() => onOpenSettings('security')}
            className="flex items-center gap-2 px-3 py-2 text-sm text-stone-600 hover:text-stone-800 hover:bg-stone-50 rounded-lg transition-colors text-left focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:outline-none"
          >
            <Shield className="w-4 h-4 text-stone-400" />
            Change password
          </button>
          <button
            onClick={() => onOpenSettings('ana-intelligence')}
            className="flex items-center gap-2 px-3 py-2 text-sm text-stone-600 hover:text-stone-800 hover:bg-stone-50 rounded-lg transition-colors text-left focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:outline-none"
          >
            <Brain className="w-4 h-4 text-stone-400" />
            Teach AnA
          </button>
          <button
            onClick={() => onOpenSettings('integrations')}
            className="flex items-center gap-2 px-3 py-2 text-sm text-stone-600 hover:text-stone-800 hover:bg-stone-50 rounded-lg transition-colors text-left focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:outline-none"
          >
            <Link2 className="w-4 h-4 text-stone-400" />
            Connect integrations
          </button>
          <button
            onClick={() => onOpenSettings('help')}
            className="flex items-center gap-2 px-3 py-2 text-sm text-stone-600 hover:text-stone-800 hover:bg-stone-50 rounded-lg transition-colors text-left focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:outline-none"
          >
            <ExternalLink className="w-4 h-4 text-stone-400" />
            View documentation
          </button>
        </div>
      </div>
    </WorkspaceCanvas>
  );
};

export default SetupPage;
