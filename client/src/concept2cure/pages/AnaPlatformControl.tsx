/**
 * Ana Platform Control — Agentic settings, modules, and onboarding
 *
 * Gives paid clients full visibility and control over:
 * - Organization settings (AI config, compliance defaults, notifications)
 * - Module enable/disable (12 platform capabilities)
 * - Onboarding workflow
 * - Usage analysis with Ana recommendations
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Loader2,
  RefreshCw,
  Settings,
  Shield,
  Sparkles,
  ToggleLeft,
  ToggleRight,
  Zap,
} from 'lucide-react';

interface Capability {
  id: string;
  name: string;
  description: string;
  category: string;
  requiredTier: string;
  enabled: boolean;
}

interface OrgSettings {
  anaProactiveMode?: boolean;
  anaAutoRemediate?: boolean;
  anaConfirmDestructive?: boolean;
  enableDeepResearch?: boolean;
  enableAutoExtraction?: boolean;
  enableSafetyNarrative?: boolean;
  defaultComplianceFrameworks?: string[];
  defaultSubmissionType?: string;
  enforce21CFRPart11?: boolean;
  weeklyDigestEnabled?: boolean;
  notifyOnRegulatoryChanges?: boolean;
  notifyOnComplianceAlerts?: boolean;
  [key: string]: unknown;
}

export default function AnaPlatformControl() {
  const [capabilities, setCapabilities] = useState<Capability[]>([]);
  const [settings, setSettings] = useState<OrgSettings>({});
  const [tier, setTier] = useState('standard');
  const [recommendations, setRecommendations] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeSection, setActiveSection] = useState<'modules' | 'settings' | 'ana-behavior' | 'usage'>('modules');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [capRes, settingsRes, usageRes] = await Promise.allSettled([
        fetch('/api/ana/platform/capabilities').then(r => r.json()),
        fetch('/api/ana/platform/settings').then(r => r.json()),
        fetch('/api/ana/platform/usage').then(r => r.json()),
      ]);

      if (capRes.status === 'fulfilled' && capRes.value?.result?.capabilities) {
        setCapabilities(capRes.value.result.capabilities);
        setTier(capRes.value.result.tier || 'standard');
      }
      if (settingsRes.status === 'fulfilled' && settingsRes.value?.result?.settings) {
        setSettings(settingsRes.value.result.settings);
        setTier(settingsRes.value.result.tier || 'standard');
      }
      if (usageRes.status === 'fulfilled' && usageRes.value?.result?.recommendations) {
        setRecommendations(usageRes.value.result.recommendations);
      }
    } catch {
      // Degrade gracefully
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const toggleModule = async (moduleId: string, enabled: boolean) => {
    setSaving(true);
    try {
      await fetch('/api/ana/platform/modules/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ moduleId, enabled }),
      });
      setCapabilities(prev =>
        prev.map(c => c.id === moduleId ? { ...c, enabled } : c)
      );
    } catch {
      // Handle error
    } finally {
      setSaving(false);
    }
  };

  const updateSetting = async (key: string, value: unknown) => {
    setSaving(true);
    try {
      await fetch('/api/ana/platform/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [key]: value }),
      });
      setSettings(prev => ({ ...prev, [key]: value }));
    } catch {
      // Handle error
    } finally {
      setSaving(false);
    }
  };

  const TIER_BADGES: Record<string, string> = {
    standard: 'bg-blue-100 text-blue-700',
    professional: 'bg-violet-100 text-violet-700',
    enterprise: 'bg-amber-100 text-amber-700',
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-zinc-50">
        <div className="text-center">
          <Loader2 className="w-6 h-6 animate-spin text-violet-400 mx-auto mb-2" />
          <p className="text-sm text-zinc-400">Loading platform configuration...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-zinc-50">
      {/* Header */}
      <div className="shrink-0 border-b border-zinc-200 bg-white px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-indigo-100 rounded-lg flex items-center justify-center">
              <Settings className="w-4 h-4 text-indigo-600" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-zinc-900">Platform Control</h1>
              <p className="text-xs text-zinc-500">
                Ana-managed settings, modules, and configuration
                <span className={`ml-2 px-1.5 py-0.5 rounded text-[10px] font-medium ${TIER_BADGES[tier] || TIER_BADGES.standard}`}>
                  {tier.toUpperCase()}
                </span>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {saving && <Loader2 className="w-3.5 h-3.5 animate-spin text-violet-400" />}
            <button
              onClick={fetchData}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-zinc-600 bg-zinc-100 rounded-md hover:bg-zinc-200 transition-colors"
            >
              <RefreshCw className="w-3 h-3" />
              Refresh
            </button>
          </div>
        </div>

        {/* Section Tabs */}
        <div className="flex gap-1 mt-4">
          {([
            { id: 'modules', label: 'Modules' },
            { id: 'settings', label: 'Compliance' },
            { id: 'ana-behavior', label: 'Ana Behavior' },
            { id: 'usage', label: 'Usage & Tips' },
          ] as const).map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveSection(tab.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                activeSection === tab.id
                  ? 'bg-indigo-100 text-indigo-700'
                  : 'text-zinc-500 hover:text-zinc-700 hover:bg-zinc-100'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {/* Modules Section */}
        {activeSection === 'modules' && (
          <>
            <p className="text-sm text-zinc-500 mb-4">
              Ana can enable or disable platform modules for your organization. Modules gated by higher tiers are shown but cannot be activated.
            </p>
            <div className="grid grid-cols-1 gap-3">
              {capabilities.map(cap => {
                const tierLocked = (
                  (cap.requiredTier === 'professional' && tier === 'standard') ||
                  (cap.requiredTier === 'enterprise' && tier !== 'enterprise')
                );
                return (
                  <div
                    key={cap.id}
                    className={`bg-white rounded-lg border p-4 flex items-center justify-between ${
                      tierLocked ? 'border-zinc-100 opacity-60' : 'border-zinc-200'
                    }`}
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-zinc-800">{cap.name}</span>
                        {tierLocked && (
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${TIER_BADGES[cap.requiredTier]}`}>
                            {cap.requiredTier.toUpperCase()} ONLY
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-zinc-500 mt-0.5">{cap.description}</p>
                    </div>
                    <button
                      onClick={() => !tierLocked && toggleModule(cap.id, !cap.enabled)}
                      disabled={tierLocked || saving}
                      className="ml-4 shrink-0"
                    >
                      {cap.enabled ? (
                        <ToggleRight className="w-8 h-8 text-violet-500" />
                      ) : (
                        <ToggleLeft className="w-8 h-8 text-zinc-300" />
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* Compliance Settings */}
        {activeSection === 'settings' && (
          <div className="space-y-4">
            <div className="bg-white rounded-lg border border-zinc-200 p-5">
              <h3 className="text-sm font-semibold text-zinc-800 mb-4 flex items-center gap-2">
                <Shield className="w-4 h-4 text-indigo-500" />
                Compliance Defaults
              </h3>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-zinc-600 mb-1">Default Submission Type</label>
                  <select
                    value={settings.defaultSubmissionType || ''}
                    onChange={e => updateSetting('defaultSubmissionType', e.target.value)}
                    className="w-48 px-3 py-2 text-sm border border-zinc-200 rounded-md"
                  >
                    <option value="">Select...</option>
                    {['IND', 'NDA', 'BLA', 'MAA', '510K', 'PMA'].map(t => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>

                <ToggleSetting
                  label="Enforce 21 CFR Part 11"
                  description="Require electronic signatures and audit trails for all regulatory documents"
                  enabled={!!settings.enforce21CFRPart11}
                  onChange={v => updateSetting('enforce21CFRPart11', v)}
                  disabled={saving}
                />

                <ToggleSetting
                  label="Regulatory Change Notifications"
                  description="Receive alerts when regulatory guidance changes affect your submissions"
                  enabled={settings.notifyOnRegulatoryChanges !== false}
                  onChange={v => updateSetting('notifyOnRegulatoryChanges', v)}
                  disabled={saving}
                />

                <ToggleSetting
                  label="Compliance Alert Notifications"
                  description="Get notified about compliance gaps and deadlines"
                  enabled={settings.notifyOnComplianceAlerts !== false}
                  onChange={v => updateSetting('notifyOnComplianceAlerts', v)}
                  disabled={saving}
                />

                <ToggleSetting
                  label="Weekly Intelligence Digest"
                  description="Receive a weekly summary of regulatory intelligence relevant to your projects"
                  enabled={!!settings.weeklyDigestEnabled}
                  onChange={v => updateSetting('weeklyDigestEnabled', v)}
                  disabled={saving}
                />
              </div>
            </div>
          </div>
        )}

        {/* Ana Behavior */}
        {activeSection === 'ana-behavior' && (
          <div className="space-y-4">
            <div className="bg-white rounded-lg border border-zinc-200 p-5">
              <h3 className="text-sm font-semibold text-zinc-800 mb-4 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-violet-500" />
                Ana Agentic Behavior
              </h3>

              <div className="space-y-4">
                <ToggleSetting
                  label="Proactive Mode"
                  description="Ana initiates regulatory alerts, recommendations, and gap notifications without being asked"
                  enabled={settings.anaProactiveMode !== false}
                  onChange={v => updateSetting('anaProactiveMode', v)}
                  disabled={saving}
                />

                <ToggleSetting
                  label="Auto-Remediation"
                  description="Ana automatically fixes detected compliance gaps and configuration issues"
                  enabled={!!settings.anaAutoRemediate}
                  onChange={v => updateSetting('anaAutoRemediate', v)}
                  disabled={saving}
                />

                <ToggleSetting
                  label="Confirm Destructive Actions"
                  description="Require user confirmation before Ana performs destructive operations (delete, downgrade)"
                  enabled={settings.anaConfirmDestructive !== false}
                  onChange={v => updateSetting('anaConfirmDestructive', v)}
                  disabled={saving}
                />

                <ToggleSetting
                  label="Deep Research"
                  description="Enable multi-source regulatory research with Claude synthesis"
                  enabled={settings.enableDeepResearch !== false}
                  onChange={v => updateSetting('enableDeepResearch', v)}
                  disabled={saving}
                />

                <ToggleSetting
                  label="Auto-Extraction Pipeline"
                  description="Automatically parse and extract data from uploaded documents"
                  enabled={settings.enableAutoExtraction !== false}
                  onChange={v => updateSetting('enableAutoExtraction', v)}
                  disabled={saving}
                />

                <ToggleSetting
                  label="Safety Narrative Generation"
                  description="Enable ICH E3 compliant safety narrative generation"
                  enabled={settings.enableSafetyNarrative !== false}
                  onChange={v => updateSetting('enableSafetyNarrative', v)}
                  disabled={saving}
                />
              </div>
            </div>
          </div>
        )}

        {/* Usage & Tips */}
        {activeSection === 'usage' && (
          <div className="space-y-4">
            {recommendations.length > 0 && (
              <div className="bg-violet-50 rounded-lg border border-violet-200 p-5">
                <h3 className="text-sm font-semibold text-violet-800 mb-3 flex items-center gap-2">
                  <Zap className="w-4 h-4" />
                  Ana Optimization Recommendations
                </h3>
                <div className="space-y-2">
                  {recommendations.map((rec, i) => (
                    <div key={i} className="flex items-start gap-2 text-sm text-violet-700">
                      <ChevronRight className="w-3 h-3 mt-0.5 shrink-0" />
                      <span>{rec}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="bg-white rounded-lg border border-zinc-200 p-5">
              <h3 className="text-sm font-semibold text-zinc-800 mb-3 flex items-center gap-2">
                <Activity className="w-4 h-4 text-indigo-500" />
                Platform Summary
              </h3>
              <div className="grid grid-cols-3 gap-4">
                <div className="text-center p-3 bg-zinc-50 rounded-lg">
                  <div className="text-2xl font-bold text-indigo-600">
                    {capabilities.filter(c => c.enabled).length}
                  </div>
                  <div className="text-xs text-zinc-500 mt-1">Active Modules</div>
                </div>
                <div className="text-center p-3 bg-zinc-50 rounded-lg">
                  <div className="text-2xl font-bold text-violet-600">
                    {capabilities.length}
                  </div>
                  <div className="text-xs text-zinc-500 mt-1">Total Available</div>
                </div>
                <div className="text-center p-3 bg-zinc-50 rounded-lg">
                  <div className="text-2xl font-bold text-amber-600">
                    {tier.toUpperCase()}
                  </div>
                  <div className="text-xs text-zinc-500 mt-1">Current Tier</div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────

function ToggleSetting({
  label,
  description,
  enabled,
  onChange,
  disabled,
}: {
  label: string;
  description: string;
  enabled: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-zinc-50 last:border-0">
      <div className="flex-1 pr-4">
        <div className="text-sm font-medium text-zinc-800">{label}</div>
        <div className="text-xs text-zinc-500 mt-0.5">{description}</div>
      </div>
      <button
        onClick={() => onChange(!enabled)}
        disabled={disabled}
        className="shrink-0"
      >
        {enabled ? (
          <ToggleRight className="w-8 h-8 text-violet-500" />
        ) : (
          <ToggleLeft className="w-8 h-8 text-zinc-300" />
        )}
      </button>
    </div>
  );
}
