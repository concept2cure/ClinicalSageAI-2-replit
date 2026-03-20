/**
 * Ana Platform Control — Agentic settings, modules, and onboarding
 *
 * Full visibility and control over:
 * - Module enable/disable (platform capabilities gated by tier)
 * - Compliance defaults (submission type, 21 CFR Part 11, notifications)
 * - Ana agentic behavior (proactive mode, auto-remediation, deep research)
 * - Usage analysis with Ana optimization recommendations
 */

import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Loader2,
  Lock,
  RefreshCw,
  Settings,
  Shield,
  Sparkles,
  ToggleLeft,
  ToggleRight,
  Zap,
} from 'lucide-react';
import { ExportButton, SaveButton } from '../components/ui/ActionButton';

// ─── Types ────────────────────────────────────────────────────────────────────

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

type Section = 'modules' | 'compliance' | 'ana-behavior' | 'usage';

// ─── Constants ────────────────────────────────────────────────────────────────

const SECTIONS: { id: Section; label: string; icon: React.ElementType }[] = [
  { id: 'modules', label: 'Modules', icon: Activity },
  { id: 'compliance', label: 'Compliance', icon: Shield },
  { id: 'ana-behavior', label: 'Ana Behavior', icon: Sparkles },
  { id: 'usage', label: 'Usage & Tips', icon: Zap },
];

const SUBMISSION_TYPES = ['IND', 'NDA', 'BLA', 'MAA', '510K', 'PMA'] as const;

const TIER_BADGES: Record<string, string> = {
  standard: 'bg-blue-50 text-blue-700 border border-blue-200',
  professional: 'bg-violet-50 text-violet-700 border border-violet-200',
  enterprise: 'bg-amber-50 text-amber-700 border border-amber-200',
};

const fade = {
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -4 },
  transition: { duration: 0.18, ease: 'easeOut' },
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function AnaPlatformControl() {
  const [capabilities, setCapabilities] = useState<Capability[]>([]);
  const [settings, setSettings] = useState<OrgSettings>({});
  const [tier, setTier] = useState('standard');
  const [recommendations, setRecommendations] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<Section>('modules');
  const [exporting, setExporting] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [capRes, settingsRes, usageRes] = await Promise.allSettled([
        fetch('/api/ana/platform/capabilities').then(r => {
          if (!r.ok) throw new Error(`Capabilities: ${r.status}`);
          return r.json();
        }),
        fetch('/api/ana/platform/settings').then(r => {
          if (!r.ok) throw new Error(`Settings: ${r.status}`);
          return r.json();
        }),
        fetch('/api/ana/platform/usage').then(r => {
          if (!r.ok) throw new Error(`Usage: ${r.status}`);
          return r.json();
        }),
      ]);

      if (capRes.status === 'fulfilled' && capRes.value?.result?.capabilities) {
        setCapabilities(capRes.value.result.capabilities);
        setTier(capRes.value.result.tier || 'standard');
      }
      if (settingsRes.status === 'fulfilled' && settingsRes.value?.result?.settings) {
        setSettings(settingsRes.value.result.settings);
        if (settingsRes.value.result.tier) setTier(settingsRes.value.result.tier);
      }
      if (usageRes.status === 'fulfilled' && usageRes.value?.result?.recommendations) {
        setRecommendations(usageRes.value.result.recommendations);
      }

      if (capRes.status === 'rejected' && settingsRes.status === 'rejected') {
        setError('Unable to load platform configuration. Please check your connection.');
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load configuration');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const showSaveSuccess = (msg: string) => {
    setSaveSuccess(msg);
    setTimeout(() => setSaveSuccess(null), 2000);
  };

  const toggleModule = async (moduleId: string, enabled: boolean) => {
    setSaving(true);
    try {
      const res = await fetch('/api/ana/platform/modules/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ moduleId, enabled }),
      });
      if (!res.ok) throw new Error('Failed to toggle module');
      setCapabilities(prev =>
        prev.map(c => c.id === moduleId ? { ...c, enabled } : c)
      );
      showSaveSuccess(`${enabled ? 'Enabled' : 'Disabled'} module`);
    } catch {
      setError('Failed to toggle module. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const updateSetting = async (key: string, value: unknown) => {
    setSaving(true);
    try {
      const res = await fetch('/api/ana/platform/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [key]: value }),
      });
      if (!res.ok) throw new Error('Failed to update setting');
      setSettings(prev => ({ ...prev, [key]: value }));
      showSaveSuccess('Setting updated');
    } catch {
      setError('Failed to update setting. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleExportConfig = async () => {
    setExporting(true);
    try {
      const data = { settings, capabilities, tier, exportedAt: new Date().toISOString() };
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ana-platform-config-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  };

  const isTierLocked = (requiredTier: string) =>
    (requiredTier === 'professional' && tier === 'standard') ||
    (requiredTier === 'enterprise' && tier !== 'enterprise');

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-zinc-50">
        <div className="text-center">
          <Loader2 className="w-6 h-6 animate-spin text-indigo-400 mx-auto mb-2" aria-hidden="true" />
          <p className="text-sm text-zinc-500" role="status">Loading platform configuration...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-zinc-50">
      {/* Header */}
      <div className="shrink-0 border-b border-zinc-100 bg-white px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-indigo-100 rounded-lg flex items-center justify-center">
              <Settings className="w-4 h-4 text-indigo-600" aria-hidden="true" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-zinc-900">Platform Control</h1>
              <div className="flex items-center gap-2">
                <p className="text-xs text-zinc-500">Ana-managed settings, modules, and configuration</p>
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${TIER_BADGES[tier] || TIER_BADGES.standard}`}>
                  {tier.toUpperCase()}
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {saving && <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-400" aria-hidden="true" />}
            <AnimatePresence>
              {saveSuccess && (
                <motion.span
                  initial={{ opacity: 0, x: 4 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0 }}
                  className="text-xs text-emerald-600 flex items-center gap-1"
                >
                  <CheckCircle2 className="w-3 h-3" aria-hidden="true" />
                  {saveSuccess}
                </motion.span>
              )}
            </AnimatePresence>
            <ExportButton
              label="Export Config"
              produces="Platform configuration (JSON)"
              isLoading={exporting}
              onClick={handleExportConfig}
              size="sm"
            />
            <button
              onClick={fetchData}
              aria-label="Refresh configuration"
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-zinc-600 bg-zinc-100 rounded-md hover:bg-zinc-200 transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:ring-offset-1"
            >
              <RefreshCw className="w-3 h-3" aria-hidden="true" />
              Refresh
            </button>
          </div>
        </div>

        {/* Section Tabs */}
        <div className="flex gap-1 mt-4" role="tablist" aria-label="Configuration sections">
          {SECTIONS.map(tab => (
            <button
              key={tab.id}
              role="tab"
              aria-selected={activeSection === tab.id}
              aria-controls={`panel-${tab.id}`}
              onClick={() => { setActiveSection(tab.id); setError(null); }}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:ring-offset-1 ${
                activeSection === tab.id
                  ? 'bg-indigo-100 text-indigo-700'
                  : 'text-zinc-500 hover:text-zinc-700 hover:bg-zinc-100'
              }`}
            >
              <tab.icon className="w-3 h-3" aria-hidden="true" />
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Error banner */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="bg-red-50 border-b border-red-200 px-6 py-3"
            role="alert"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm text-red-700">
                <AlertTriangle className="w-4 h-4 shrink-0" aria-hidden="true" />
                {error}
              </div>
              <button
                onClick={() => setError(null)}
                className="text-xs text-red-500 hover:text-red-600 focus:outline-none focus:ring-2 focus:ring-red-300 rounded"
                aria-label="Dismiss error"
              >
                Dismiss
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Content */}
      <div
        className="flex-1 overflow-y-auto p-6"
        role="tabpanel"
        id={`panel-${activeSection}`}
        aria-busy={saving}
      >
        <AnimatePresence mode="wait">
          <motion.div key={activeSection} {...fade} className="space-y-4">
            {/* Modules Section */}
            {activeSection === 'modules' && (
              <>
                <p className="text-sm text-zinc-500 mb-2">
                  Toggle platform modules for your organization. Modules gated by higher tiers are locked.
                </p>

                {/* Group capabilities by category */}
                {(() => {
                  const categories = [...new Set(capabilities.map(c => c.category))];
                  return categories.map(cat => (
                    <div key={cat}>
                      <p className="text-[11px] font-medium text-zinc-400 uppercase tracking-wider mb-2 mt-4">{cat}</p>
                      <div className="space-y-2">
                        {capabilities.filter(c => c.category === cat).map((cap, i) => {
                          const locked = isTierLocked(cap.requiredTier);
                          return (
                            <motion.div
                              key={cap.id}
                              initial={{ opacity: 0, y: 4 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ delay: i * 0.03, duration: 0.15 }}
                              className={`bg-white rounded-lg border p-4 flex items-center justify-between transition-colors ${
                                locked ? 'border-zinc-100 opacity-60' : 'border-zinc-100 hover:border-zinc-200'
                              }`}
                            >
                              <div className="flex-1">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-medium text-zinc-800">{cap.name}</span>
                                  {locked && (
                                    <span className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-zinc-100 text-zinc-500">
                                      <Lock className="w-2.5 h-2.5" aria-hidden="true" />
                                      {cap.requiredTier.toUpperCase()}
                                    </span>
                                  )}
                                  {cap.enabled && !locked && (
                                    <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-50 text-emerald-600">
                                      ACTIVE
                                    </span>
                                  )}
                                </div>
                                <p className="text-xs text-zinc-500 mt-0.5">{cap.description}</p>
                              </div>
                              <button
                                onClick={() => !locked && toggleModule(cap.id, !cap.enabled)}
                                disabled={locked || saving}
                                role="switch"
                                aria-checked={cap.enabled}
                                aria-label={`${cap.name}: ${cap.enabled ? 'enabled' : 'disabled'}${locked ? ' (tier locked)' : ''}`}
                                className="ml-4 shrink-0 focus:outline-none focus:ring-2 focus:ring-indigo-300 rounded-full p-0.5 transition-colors"
                              >
                                {cap.enabled ? (
                                  <ToggleRight className="w-8 h-8 text-indigo-500" aria-hidden="true" />
                                ) : (
                                  <ToggleLeft className="w-8 h-8 text-zinc-300" aria-hidden="true" />
                                )}
                              </button>
                            </motion.div>
                          );
                        })}
                      </div>
                    </div>
                  ));
                })()}

                {capabilities.length === 0 && (
                  <div className="bg-white rounded-lg border border-zinc-100 py-12 text-center">
                    <Settings className="w-8 h-8 text-zinc-300 mx-auto mb-2" aria-hidden="true" />
                    <p className="text-sm text-zinc-500">No modules available</p>
                    <p className="text-xs text-zinc-400 mt-1">Modules will appear here once platform configuration is loaded.</p>
                  </div>
                )}
              </>
            )}

            {/* Compliance Settings */}
            {activeSection === 'compliance' && (
              <div className="bg-white rounded-lg border border-zinc-100 p-5">
                <h3 className="text-sm font-semibold text-zinc-800 mb-5 flex items-center gap-2">
                  <Shield className="w-4 h-4 text-indigo-500" aria-hidden="true" />
                  Compliance Defaults
                </h3>

                <div className="space-y-5">
                  <div>
                    <label htmlFor="default-submission-type" className="block text-xs font-medium text-zinc-600 mb-1">
                      Default Submission Type
                    </label>
                    <select
                      id="default-submission-type"
                      value={settings.defaultSubmissionType || ''}
                      onChange={e => updateSetting('defaultSubmissionType', e.target.value)}
                      className="w-48 px-3 py-2 text-sm border border-zinc-200 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400"
                    >
                      <option value="">Select...</option>
                      {SUBMISSION_TYPES.map(t => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </div>

                  <div className="border-t border-zinc-100 pt-4 space-y-1">
                    <ToggleSetting
                      id="enforce-21cfr"
                      label="Enforce 21 CFR Part 11"
                      description="Require electronic signatures and audit trails for all regulatory documents"
                      enabled={!!settings.enforce21CFRPart11}
                      onChange={v => updateSetting('enforce21CFRPart11', v)}
                      disabled={saving}
                    />

                    <ToggleSetting
                      id="notify-reg-changes"
                      label="Regulatory Change Notifications"
                      description="Receive alerts when regulatory guidance changes affect your submissions"
                      enabled={settings.notifyOnRegulatoryChanges !== false}
                      onChange={v => updateSetting('notifyOnRegulatoryChanges', v)}
                      disabled={saving}
                    />

                    <ToggleSetting
                      id="notify-compliance"
                      label="Compliance Alert Notifications"
                      description="Get notified about compliance gaps and approaching deadlines"
                      enabled={settings.notifyOnComplianceAlerts !== false}
                      onChange={v => updateSetting('notifyOnComplianceAlerts', v)}
                      disabled={saving}
                    />

                    <ToggleSetting
                      id="weekly-digest"
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
              <div className="bg-white rounded-lg border border-zinc-100 p-5">
                <h3 className="text-sm font-semibold text-zinc-800 mb-2 flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-violet-500" aria-hidden="true" />
                  Ana Agentic Behavior
                </h3>
                <p className="text-xs text-zinc-500 mb-5">
                  Control how Ana operates within your organization — proactivity level, automatic actions, and capabilities.
                </p>

                <div className="space-y-1">
                  <ToggleSetting
                    id="ana-proactive"
                    label="Proactive Mode"
                    description="Ana initiates regulatory alerts, recommendations, and gap notifications without being asked"
                    enabled={settings.anaProactiveMode !== false}
                    onChange={v => updateSetting('anaProactiveMode', v)}
                    disabled={saving}
                    highlight
                  />

                  <ToggleSetting
                    id="ana-auto-remediate"
                    label="Auto-Remediation"
                    description="Ana automatically fixes detected compliance gaps and configuration issues"
                    enabled={!!settings.anaAutoRemediate}
                    onChange={v => updateSetting('anaAutoRemediate', v)}
                    disabled={saving}
                  />

                  <ToggleSetting
                    id="ana-confirm-destructive"
                    label="Confirm Destructive Actions"
                    description="Require user confirmation before Ana performs destructive operations (delete, downgrade)"
                    enabled={settings.anaConfirmDestructive !== false}
                    onChange={v => updateSetting('anaConfirmDestructive', v)}
                    disabled={saving}
                  />

                  <div className="border-t border-zinc-100 pt-3 mt-3">
                    <p className="text-[11px] font-medium text-zinc-400 uppercase tracking-wider mb-3">Capabilities</p>
                  </div>

                  <ToggleSetting
                    id="ana-deep-research"
                    label="Deep Research"
                    description="Enable multi-source regulatory research with Claude synthesis across ClinicalTrials.gov, PubMed, FDA, EMA"
                    enabled={settings.enableDeepResearch !== false}
                    onChange={v => updateSetting('enableDeepResearch', v)}
                    disabled={saving}
                  />

                  <ToggleSetting
                    id="ana-auto-extraction"
                    label="Auto-Extraction Pipeline"
                    description="Automatically parse and extract structured data from uploaded documents"
                    enabled={settings.enableAutoExtraction !== false}
                    onChange={v => updateSetting('enableAutoExtraction', v)}
                    disabled={saving}
                  />

                  <ToggleSetting
                    id="ana-safety-narrative"
                    label="Safety Narrative Generation"
                    description="Enable ICH E3 compliant safety narrative generation (aggregate, SAE, benefit-risk, signal, cross-study)"
                    enabled={settings.enableSafetyNarrative !== false}
                    onChange={v => updateSetting('enableSafetyNarrative', v)}
                    disabled={saving}
                  />
                </div>
              </div>
            )}

            {/* Usage & Tips */}
            {activeSection === 'usage' && (
              <>
                {recommendations.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1, duration: 0.2 }}
                    className="bg-violet-50 rounded-lg border border-violet-200 p-5"
                  >
                    <h3 className="text-sm font-semibold text-violet-800 mb-3 flex items-center gap-2">
                      <Zap className="w-4 h-4" aria-hidden="true" />
                      Ana Optimization Recommendations
                    </h3>
                    <div className="space-y-2">
                      {recommendations.map((rec, i) => (
                        <motion.div
                          key={i}
                          initial={{ opacity: 0, x: -4 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: 0.15 + i * 0.04 }}
                          className="flex items-start gap-2 text-sm text-violet-700"
                        >
                          <ChevronRight className="w-3 h-3 mt-0.5 shrink-0" aria-hidden="true" />
                          <span>{rec}</span>
                        </motion.div>
                      ))}
                    </div>
                  </motion.div>
                )}

                {recommendations.length === 0 && (
                  <div className="bg-white rounded-lg border border-zinc-100 py-12 text-center">
                    <Sparkles className="w-8 h-8 text-zinc-200 mx-auto mb-2" aria-hidden="true" />
                    <p className="text-sm text-zinc-500">No recommendations at this time</p>
                    <p className="text-xs text-zinc-400 mt-1">Ana will surface optimization tips as your usage patterns develop.</p>
                  </div>
                )}

                <div className="bg-white rounded-lg border border-zinc-100 p-5">
                  <h3 className="text-sm font-semibold text-zinc-800 mb-4 flex items-center gap-2">
                    <Activity className="w-4 h-4 text-indigo-500" aria-hidden="true" />
                    Platform Summary
                  </h3>
                  <div className="grid grid-cols-3 gap-4">
                    {[
                      { label: 'Active Modules', value: capabilities.filter(c => c.enabled).length, color: 'text-indigo-600' },
                      { label: 'Total Available', value: capabilities.length, color: 'text-violet-600' },
                      { label: 'Current Tier', value: tier.toUpperCase(), color: 'text-amber-600' },
                    ].map((stat, i) => (
                      <motion.div
                        key={stat.label}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.05, duration: 0.2 }}
                        className="text-center p-4 bg-zinc-50 rounded-lg"
                      >
                        <div className={`text-2xl font-bold tabular-nums ${stat.color}`}>
                          {stat.value}
                        </div>
                        <div className="text-xs text-zinc-500 mt-1">{stat.label}</div>
                      </motion.div>
                    ))}
                  </div>
                </div>

                {/* Module coverage chart */}
                {capabilities.length > 0 && (
                  <div className="bg-white rounded-lg border border-zinc-100 p-5">
                    <p className="text-[11px] font-medium text-zinc-400 uppercase tracking-wider mb-3">Module Activation</p>
                    <div className="h-4 flex rounded-full overflow-hidden bg-zinc-100" role="img" aria-label={`${capabilities.filter(c => c.enabled).length} of ${capabilities.length} modules active`}>
                      <motion.div
                        className="bg-indigo-500 h-full"
                        initial={{ width: 0 }}
                        animate={{ width: `${(capabilities.filter(c => c.enabled).length / capabilities.length) * 100}%` }}
                        transition={{ duration: 0.8, ease: 'easeOut' }}
                      />
                    </div>
                    <p className="text-xs text-zinc-500 mt-2">
                      {capabilities.filter(c => c.enabled).length} of {capabilities.length} modules active
                      {capabilities.some(c => isTierLocked(c.requiredTier)) && (
                        <span className="text-zinc-400"> · {capabilities.filter(c => isTierLocked(c.requiredTier)).length} tier-locked</span>
                      )}
                    </p>
                  </div>
                )}
              </>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function ToggleSetting({
  id,
  label,
  description,
  enabled,
  onChange,
  disabled,
  highlight,
}: {
  id: string;
  label: string;
  description: string;
  enabled: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
  highlight?: boolean;
}) {
  return (
    <div className={`flex items-center justify-between py-3 border-b border-zinc-50 last:border-0 ${highlight ? 'bg-violet-50/50 -mx-2 px-2 rounded-lg' : ''}`}>
      <div className="flex-1 pr-4">
        <label htmlFor={id} className="text-sm font-medium text-zinc-800 cursor-pointer">{label}</label>
        <p className="text-xs text-zinc-500 mt-0.5">{description}</p>
      </div>
      <button
        id={id}
        onClick={() => onChange(!enabled)}
        disabled={disabled}
        role="switch"
        aria-checked={enabled}
        aria-label={`${label}: ${enabled ? 'enabled' : 'disabled'}`}
        className="shrink-0 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:ring-offset-2 rounded-full p-0.5 transition-colors"
      >
        {enabled ? (
          <ToggleRight className="w-8 h-8 text-indigo-500" aria-hidden="true" />
        ) : (
          <ToggleLeft className="w-8 h-8 text-zinc-300" aria-hidden="true" />
        )}
      </button>
    </div>
  );
}
