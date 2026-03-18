/**
 * TrialSage Client Portal V2 - Security & Compliance Settings
 *
 * Organization-level security configuration, compliance monitoring,
 * and policy management interface.
 *
 * @version 2.0.0
 * @compliance FDA 21 CFR Part 11, EU Annex 11
 */

import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { securityLogger } from '../../utils/logger';
import {
  Shield,
  ShieldCheck,
  ShieldAlert,
  ShieldX,
  Lock,
  Key,
  Fingerprint,
  Clock,
  Users,
  FileText,
  Database,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Settings,
  Edit,
  Save,
  RotateCcw,
  ChevronRight,
  Info,
  Globe,
  Server,
  History,
  Download,
  Eye,
  EyeOff,
  Zap,
  Activity,
} from 'lucide-react';
import { useSecurityContext } from '../../hooks/useSecurityContext';
import { ElectronicSignatureGate } from '../security/ElectronicSignature';
import type {
  ComplianceConfig,
  ComplianceHealth,
  ComplianceHealthCategory,
} from '../../core/regulatoryCompliance';
import { COMPLIANCE_CATEGORY_CONFIG, getComplianceCategory } from '../../core/regulatoryCompliance';

// Compliance health data fetched via useQuery in SecuritySettings

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

type SettingsSection =
  | 'overview'
  | 'authentication'
  | 'signatures'
  | 'audit'
  | 'passwords'
  | 'sessions'
  | 'training';

export function SecuritySettings() {
  const { complianceConfig, organization, can } = useSecurityContext();
  const [activeSection, setActiveSection] = useState<SettingsSection>('overview');
  const [editMode, setEditMode] = useState(false);
  const [showSignature, setShowSignature] = useState(false);
  const [pendingChanges, setPendingChanges] = useState<Partial<ComplianceConfig> | null>(null);

  const health = MOCK_COMPLIANCE_HEALTH;

  const sections: { id: SettingsSection; label: string; icon: React.ReactNode }[] = [
    { id: 'overview', label: 'Compliance Overview', icon: <Shield className="h-5 w-5" /> },
    { id: 'authentication', label: 'Authentication', icon: <Key className="h-5 w-5" /> },
    { id: 'signatures', label: 'Electronic Signatures', icon: <FileText className="h-5 w-5" /> },
    { id: 'audit', label: 'Audit Trail', icon: <Database className="h-5 w-5" /> },
    { id: 'passwords', label: 'Password Policy', icon: <Lock className="h-5 w-5" /> },
    { id: 'sessions', label: 'Session Management', icon: <Clock className="h-5 w-5" /> },
    { id: 'training', label: 'Training Requirements', icon: <Users className="h-5 w-5" /> },
  ];

  const handleSaveChanges = () => {
    if (pendingChanges) {
      setShowSignature(true);
    }
  };

  return (
    <div className="flex h-full">
      {/* Sidebar Navigation */}
      <div className="w-64 border-r bg-gray-50 p-4">
        <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <Settings className="h-5 w-5" />
          Security Settings
        </h2>

        <nav className="space-y-1">
          {sections.map(section => (
            <button
              key={section.id}
              onClick={() => setActiveSection(section.id)}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors ${
                activeSection === section.id
                  ? 'bg-primary-100 text-primary-700'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              {section.icon}
              <span className="text-sm font-medium">{section.label}</span>
            </button>
          ))}
        </nav>

        {/* Quick Health Score */}
        <div className="mt-6 p-4 bg-white rounded-xl border">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-600">Compliance Score</span>
            <ComplianceBadge category={health.category} />
          </div>
          <div className="text-3xl font-bold text-gray-900">{health.overallScore}%</div>
          <div className="mt-2 h-2 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${health.overallScore}%`,
                backgroundColor: COMPLIANCE_CATEGORY_CONFIG[health.category].color,
              }}
            />
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {activeSection === 'overview' && <ComplianceOverview health={health} />}
        {activeSection === 'authentication' && (
          <AuthenticationSettings
            config={complianceConfig}
            editMode={editMode}
            setEditMode={setEditMode}
            onChanges={setPendingChanges}
            canEdit={can('settings', 'update')}
          />
        )}
        {activeSection === 'signatures' && (
          <SignatureSettings config={complianceConfig} canEdit={can('settings', 'update')} />
        )}
        {activeSection === 'audit' && (
          <AuditSettings config={complianceConfig} canEdit={can('settings', 'update')} />
        )}
        {activeSection === 'passwords' && (
          <PasswordSettings config={complianceConfig} canEdit={can('settings', 'update')} />
        )}
        {activeSection === 'sessions' && (
          <SessionSettings config={complianceConfig} canEdit={can('settings', 'update')} />
        )}
        {activeSection === 'training' && (
          <TrainingSettings config={complianceConfig} canEdit={can('settings', 'update')} />
        )}
      </div>

      {/* Signature Gate for Changes */}
      {showSignature && pendingChanges && (
        <ElectronicSignatureGate
          action="security_override"
          meaning="approval"
          recordId={`settings_change_${Date.now()}`}
          recordType="security_settings"
          immediate
          context="Modifying security settings requires electronic signature approval"
          onSuccess={signature => {
            securityLogger.audit('Settings change approved', { signatureId: signature.id });
            setShowSignature(false);
            setPendingChanges(null);
            setEditMode(false);
          }}
          onCancel={() => setShowSignature(false)}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPLIANCE BADGE
// ─────────────────────────────────────────────────────────────────────────────

function ComplianceBadge({ category }: { category: ComplianceHealthCategory }) {
  const config = COMPLIANCE_CATEGORY_CONFIG[category];
  return (
    <span
      className="px-2 py-0.5 text-xs font-medium rounded-full"
      style={{ backgroundColor: config.bgColor, color: config.color }}
    >
      {config.label}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPLIANCE OVERVIEW
// ─────────────────────────────────────────────────────────────────────────────

function ComplianceOverview({ health }: { health: ComplianceHealth }) {
  const metrics = [
    {
      key: 'signatureIntegrity',
      label: 'Signature Integrity',
      icon: <FileText className="h-5 w-5" />,
    },
    {
      key: 'auditCompleteness',
      label: 'Audit Completeness',
      icon: <Database className="h-5 w-5" />,
    },
    { key: 'trainingCurrency', label: 'Training Currency', icon: <Users className="h-5 w-5" /> },
    { key: 'passwordCompliance', label: 'Password Compliance', icon: <Lock className="h-5 w-5" /> },
    { key: 'sodCompliance', label: 'SoD Compliance', icon: <Shield className="h-5 w-5" /> },
    { key: 'dataIntegrity', label: 'Data Integrity', icon: <CheckCircle className="h-5 w-5" /> },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Compliance Overview</h1>
        <p className="text-gray-500 mt-1">
          Monitor your organization's regulatory compliance health
        </p>
      </div>

      {/* Overall Score Card */}
      <div
        className="p-6 rounded-xl border-2"
        style={{
          borderColor: COMPLIANCE_CATEGORY_CONFIG[health.category].color,
          backgroundColor: COMPLIANCE_CATEGORY_CONFIG[health.category].bgColor,
        }}
      >
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3">
              <ShieldCheck
                className="h-10 w-10"
                style={{ color: COMPLIANCE_CATEGORY_CONFIG[health.category].color }}
              />
              <div>
                <h2 className="text-xl font-semibold text-gray-900">Overall Compliance Score</h2>
                <p className="text-gray-600">21 CFR Part 11 + EU Annex 11 + GCP</p>
              </div>
            </div>
          </div>
          <div className="text-right">
            <div
              className="text-5xl font-bold"
              style={{ color: COMPLIANCE_CATEGORY_CONFIG[health.category].color }}
            >
              {health.overallScore}%
            </div>
            <ComplianceBadge category={health.category} />
          </div>
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid md:grid-cols-3 gap-4">
        {metrics.map(metric => {
          const value = health.metrics[metric.key as keyof typeof health.metrics];
          const category = getComplianceCategory(value);
          return (
            <div
              key={metric.key}
              className="p-4 bg-white border rounded-xl hover:shadow-md transition-shadow"
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2 text-gray-600">
                  {metric.icon}
                  <span className="text-sm font-medium">{metric.label}</span>
                </div>
                <span
                  className="text-lg font-bold"
                  style={{ color: COMPLIANCE_CATEGORY_CONFIG[category].color }}
                >
                  {value}%
                </span>
              </div>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${value}%`,
                    backgroundColor: COMPLIANCE_CATEGORY_CONFIG[category].color,
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Findings */}
      {health.findings.length > 0 && (
        <div className="bg-white border rounded-xl overflow-hidden">
          <div className="px-4 py-3 bg-amber-50 border-b border-amber-200 flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-600" />
            <h3 className="font-semibold text-amber-900">
              Compliance Findings ({health.findings.length})
            </h3>
          </div>
          <div className="divide-y">
            {health.findings.map(finding => (
              <div key={finding.id} className="p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                          finding.severity === 'critical'
                            ? 'bg-red-100 text-red-700'
                            : finding.severity === 'major'
                              ? 'bg-amber-100 text-amber-700'
                              : 'bg-blue-100 text-blue-700'
                        }`}
                      >
                        {finding.severity.toUpperCase()}
                      </span>
                      <span className="text-sm text-gray-500">{finding.category}</span>
                    </div>
                    <p className="font-medium text-gray-900 mt-1">{finding.description}</p>
                    <p className="text-sm text-gray-500 mt-1">{finding.remediation}</p>
                  </div>
                  {finding.dueDate && (
                    <span className="text-sm text-gray-500">
                      Due: {finding.dueDate.toLocaleDateString()}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recommendations */}
      {health.recommendations.length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
          <h3 className="font-semibold text-blue-900 flex items-center gap-2 mb-3">
            <Info className="h-5 w-5" />
            Recommendations
          </h3>
          <ul className="space-y-2">
            {health.recommendations.map((rec, idx) => (
              <li key={idx} className="flex items-start gap-2 text-sm text-blue-800">
                <ChevronRight className="h-4 w-4 mt-0.5 flex-shrink-0" />
                {rec}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// AUTHENTICATION SETTINGS
// ─────────────────────────────────────────────────────────────────────────────

interface SettingsPanelProps {
  config: ComplianceConfig | null;
  canEdit: boolean;
  editMode?: boolean;
  setEditMode?: (mode: boolean) => void;
  onChanges?: (changes: Partial<ComplianceConfig>) => void;
}

function AuthenticationSettings({ config, canEdit }: SettingsPanelProps) {
  if (!config) return null;

  const mfaMethods = [
    { id: 'totp', label: 'Authenticator App (TOTP)', description: 'Time-based one-time passwords' },
    { id: 'sms', label: 'SMS Verification', description: 'Text message codes' },
    { id: 'email', label: 'Email Verification', description: 'Email-based codes' },
    { id: 'hardware_key', label: 'Hardware Security Key', description: 'FIDO2/WebAuthn keys' },
    {
      id: 'biometric',
      label: 'Biometric Authentication',
      description: 'Fingerprint or face recognition',
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Authentication Settings</h1>
          <p className="text-gray-500 mt-1">
            Configure multi-factor authentication and access controls
          </p>
        </div>
        {canEdit && (
          <button className="flex items-center gap-2 px-4 py-2 text-primary-600 hover:bg-primary-50 rounded-lg">
            <Edit className="h-4 w-4" />
            Edit Settings
          </button>
        )}
      </div>

      {/* MFA Settings */}
      <div className="bg-white border rounded-xl overflow-hidden">
        <div className="px-6 py-4 bg-gray-50 border-b flex items-center justify-between">
          <h3 className="font-semibold text-gray-900 flex items-center gap-2">
            <Key className="h-5 w-5" />
            Multi-Factor Authentication
          </h3>
          <span
            className={`px-3 py-1 text-sm font-medium rounded-full ${
              config.accessControl.mfaRequired
                ? 'bg-green-100 text-green-700'
                : 'bg-gray-100 text-gray-600'
            }`}
          >
            {config.accessControl.mfaRequired ? 'Required' : 'Optional'}
          </span>
        </div>
        <div className="p-6">
          <h4 className="text-sm font-medium text-gray-700 mb-3">Allowed MFA Methods</h4>
          <div className="grid md:grid-cols-2 gap-3">
            {mfaMethods.map(method => {
              const enabled = config.accessControl.mfaMethods.includes(method.id as never);
              return (
                <div
                  key={method.id}
                  className={`p-3 border rounded-lg ${
                    enabled ? 'border-green-200 bg-green-50' : 'border-gray-200 bg-gray-50'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-gray-900">{method.label}</span>
                    {enabled ? (
                      <CheckCircle className="h-5 w-5 text-green-500" />
                    ) : (
                      <XCircle className="h-5 w-5 text-gray-300" />
                    )}
                  </div>
                  <p className="text-sm text-gray-500 mt-1">{method.description}</p>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Access Restrictions */}
      <div className="bg-white border rounded-xl overflow-hidden">
        <div className="px-6 py-4 bg-gray-50 border-b">
          <h3 className="font-semibold text-gray-900 flex items-center gap-2">
            <Globe className="h-5 w-5" />
            Access Restrictions
          </h3>
        </div>
        <div className="p-6 grid md:grid-cols-2 gap-6">
          <SettingItem
            label="IP Whitelist"
            value={config.accessControl.ipWhitelistEnabled ? 'Enabled' : 'Disabled'}
            enabled={config.accessControl.ipWhitelistEnabled}
          />
          <SettingItem
            label="Geo-Fencing"
            value={config.accessControl.geoFencingEnabled ? 'Enabled' : 'Disabled'}
            enabled={config.accessControl.geoFencingEnabled}
          />
          <SettingItem
            label="Device Attestation"
            value={config.accessControl.deviceAttestationRequired ? 'Required' : 'Not Required'}
            enabled={config.accessControl.deviceAttestationRequired}
          />
          <SettingItem
            label="Max Concurrent Sessions"
            value={config.accessControl.maxConcurrentSessions.toString()}
          />
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SIGNATURE SETTINGS
// ─────────────────────────────────────────────────────────────────────────────

function SignatureSettings({ config, canEdit }: SettingsPanelProps) {
  if (!config) return null;

  const esig = config.electronicSignatures;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Electronic Signatures</h1>
          <p className="text-gray-500 mt-1">
            21 CFR Part 11 compliant electronic signature configuration
          </p>
        </div>
      </div>

      {/* E-Sig Status */}
      <div
        className={`p-6 rounded-xl border-2 ${
          esig.enabled ? 'border-green-200 bg-green-50' : 'border-gray-200 bg-gray-50'
        }`}
      >
        <div className="flex items-center gap-4">
          <div className={`p-3 rounded-lg ${esig.enabled ? 'bg-green-100' : 'bg-gray-200'}`}>
            <FileText className={`h-8 w-8 ${esig.enabled ? 'text-green-600' : 'text-gray-500'}`} />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900">
              Electronic Signatures {esig.enabled ? 'Enabled' : 'Disabled'}
            </h3>
            <p className="text-gray-600">
              {esig.enabled
                ? 'Full 21 CFR Part 11 compliant electronic signatures are active'
                : 'Electronic signatures are not enabled for this organization'}
            </p>
          </div>
        </div>
      </div>

      {esig.enabled && (
        <>
          {/* Requirements */}
          <div className="bg-white border rounded-xl overflow-hidden">
            <div className="px-6 py-4 bg-gray-50 border-b">
              <h3 className="font-semibold text-gray-900">Signature Requirements</h3>
            </div>
            <div className="p-6 grid md:grid-cols-2 gap-6">
              <SettingItem
                label="Two-Factor Authentication"
                value={esig.requireTwoFactorAuth ? 'Required' : 'Optional'}
                enabled={esig.requireTwoFactorAuth}
              />
              <SettingItem
                label="Meaning Declaration (11.50b)"
                value={esig.requireMeaningDeclaration ? 'Required' : 'Optional'}
                enabled={esig.requireMeaningDeclaration}
              />
              <SettingItem
                label="Biometric Verification"
                value={esig.requireBiometric ? 'Required' : 'Not Required'}
                enabled={esig.requireBiometric}
              />
              <SettingItem
                label="Digital Certificate"
                value={esig.allowDigitalCertificate ? 'Allowed' : 'Not Allowed'}
                enabled={esig.allowDigitalCertificate}
              />
              <SettingItem
                label="Signature Validity"
                value={`${esig.signatureValidityHours} hours`}
              />
              <SettingItem label="Hash Algorithm" value={esig.hashAlgorithm} />
            </div>
          </div>

          {/* Required Actions */}
          <div className="bg-white border rounded-xl overflow-hidden">
            <div className="px-6 py-4 bg-gray-50 border-b">
              <h3 className="font-semibold text-gray-900">Actions Requiring Signature</h3>
            </div>
            <div className="p-6">
              <div className="flex flex-wrap gap-2">
                {esig.requiredForActions.map(action => (
                  <span
                    key={action}
                    className="px-3 py-1 bg-primary-100 text-primary-700 text-sm rounded-full"
                  >
                    {action.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// AUDIT SETTINGS
// ─────────────────────────────────────────────────────────────────────────────

function AuditSettings({ config, canEdit }: SettingsPanelProps) {
  if (!config) return null;

  const audit = config.auditTrail;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Audit Trail Settings</h1>
        <p className="text-gray-500 mt-1">
          21 CFR Part 11.10(e) compliant audit trail configuration
        </p>
      </div>

      {/* Audit Features */}
      <div className="bg-white border rounded-xl overflow-hidden">
        <div className="px-6 py-4 bg-gray-50 border-b">
          <h3 className="font-semibold text-gray-900 flex items-center gap-2">
            <Database className="h-5 w-5" />
            Audit Trail Features
          </h3>
        </div>
        <div className="p-6 grid md:grid-cols-2 gap-6">
          <SettingItem
            label="Immutable Records"
            value={audit.immutable ? 'Yes - WORM Storage' : 'No'}
            enabled={audit.immutable}
            description="Write Once Read Many (WORM) compliant storage"
          />
          <SettingItem
            label="Hash Chain"
            value={audit.hashChainEnabled ? 'Enabled' : 'Disabled'}
            enabled={audit.hashChainEnabled}
            description="Cryptographic linking of audit records"
          />
          <SettingItem
            label="Field-Level Tracking"
            value={audit.fieldLevelTracking ? 'Enabled' : 'Disabled'}
            enabled={audit.fieldLevelTracking}
            description="Track changes at individual field level"
          />
          <SettingItem
            label="Encryption"
            value={audit.encryptionRequired ? 'Required' : 'Optional'}
            enabled={audit.encryptionRequired}
            description="AES-256 encryption at rest"
          />
          <SettingItem
            label="Retention Period"
            value={`${audit.retentionYears} years`}
            description="Minimum retention per regulatory requirements"
          />
          <SettingItem
            label="Real-Time Monitoring"
            value={audit.realTimeMonitoring ? 'Enabled' : 'Disabled'}
            enabled={audit.realTimeMonitoring}
          />
        </div>
      </div>

      {/* Metadata Collection */}
      <div className="bg-white border rounded-xl overflow-hidden">
        <div className="px-6 py-4 bg-gray-50 border-b">
          <h3 className="font-semibold text-gray-900">Collected Metadata</h3>
        </div>
        <div className="p-6">
          <div className="flex flex-wrap gap-2">
            {audit.includeMetadata.map(meta => (
              <span key={meta} className="px-3 py-1 bg-blue-100 text-blue-700 text-sm rounded-full">
                {meta === 'ip' ? 'IP Address' : meta.charAt(0).toUpperCase() + meta.slice(1)}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Data Integrity (ALCOA+) */}
      <div className="bg-white border rounded-xl overflow-hidden">
        <div className="px-6 py-4 bg-gray-50 border-b">
          <h3 className="font-semibold text-gray-900">Data Integrity (ALCOA+)</h3>
        </div>
        <div className="p-6">
          <div className="flex flex-wrap gap-2">
            {config.dataIntegrity.alcoaPrinciples.map(principle => (
              <span
                key={principle}
                className="px-3 py-1 bg-green-100 text-green-700 text-sm rounded-full"
              >
                {principle}
              </span>
            ))}
          </div>
          <div className="mt-4 grid md:grid-cols-2 gap-4">
            <SettingItem
              label="Timestamp Source"
              value={
                config.dataIntegrity.timestampSource.charAt(0).toUpperCase() +
                config.dataIntegrity.timestampSource.slice(1)
              }
            />
            <SettingItem
              label="Checksum Validation"
              value={config.dataIntegrity.checksumValidation ? 'Enabled' : 'Disabled'}
              enabled={config.dataIntegrity.checksumValidation}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PASSWORD SETTINGS
// ─────────────────────────────────────────────────────────────────────────────

function PasswordSettings({ config, canEdit }: SettingsPanelProps) {
  if (!config) return null;

  const policy = config.accessControl.passwordPolicy;
  const lockout = config.accessControl.lockoutPolicy;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Password Policy</h1>
        <p className="text-gray-500 mt-1">21 CFR Part 11.300 compliant password requirements</p>
      </div>

      {/* Password Requirements */}
      <div className="bg-white border rounded-xl overflow-hidden">
        <div className="px-6 py-4 bg-gray-50 border-b">
          <h3 className="font-semibold text-gray-900 flex items-center gap-2">
            <Lock className="h-5 w-5" />
            Password Requirements
          </h3>
        </div>
        <div className="p-6 grid md:grid-cols-2 gap-6">
          <SettingItem label="Minimum Length" value={`${policy.minLength} characters`} />
          <SettingItem label="Maximum Length" value={`${policy.maxLength} characters`} />
          <SettingItem
            label="Uppercase Required"
            value={policy.requireUppercase ? 'Yes' : 'No'}
            enabled={policy.requireUppercase}
          />
          <SettingItem
            label="Lowercase Required"
            value={policy.requireLowercase ? 'Yes' : 'No'}
            enabled={policy.requireLowercase}
          />
          <SettingItem
            label="Numbers Required"
            value={policy.requireNumbers ? 'Yes' : 'No'}
            enabled={policy.requireNumbers}
          />
          <SettingItem
            label="Special Characters"
            value={policy.requireSpecialChars ? 'Required' : 'Not Required'}
            enabled={policy.requireSpecialChars}
          />
          <SettingItem
            label="Password History"
            value={`Last ${policy.preventReuse} passwords blocked`}
          />
          <SettingItem label="Expiration" value={`${policy.expirationDays} days`} />
        </div>
      </div>

      {/* Lockout Policy */}
      <div className="bg-white border rounded-xl overflow-hidden">
        <div className="px-6 py-4 bg-gray-50 border-b">
          <h3 className="font-semibold text-gray-900 flex items-center gap-2">
            <ShieldAlert className="h-5 w-5" />
            Account Lockout Policy
          </h3>
        </div>
        <div className="p-6 grid md:grid-cols-2 gap-6">
          <SettingItem
            label="Max Failed Attempts"
            value={`${lockout.maxFailedAttempts} attempts`}
          />
          <SettingItem
            label="Lockout Duration"
            value={`${lockout.lockoutDurationMinutes} minutes`}
          />
          <SettingItem
            label="Incremental Lockout"
            value={lockout.incrementalLockout ? 'Enabled' : 'Disabled'}
            enabled={lockout.incrementalLockout}
            description="Duration increases with repeated failures"
          />
          <SettingItem
            label="Security Team Notification"
            value={lockout.notifySecurityTeam ? 'Enabled' : 'Disabled'}
            enabled={lockout.notifySecurityTeam}
          />
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SESSION SETTINGS
// ─────────────────────────────────────────────────────────────────────────────

function SessionSettings({ config, canEdit }: SettingsPanelProps) {
  if (!config) return null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Session Management</h1>
        <p className="text-gray-500 mt-1">
          Configure session timeout and concurrent access policies
        </p>
      </div>

      <div className="bg-white border rounded-xl overflow-hidden">
        <div className="px-6 py-4 bg-gray-50 border-b">
          <h3 className="font-semibold text-gray-900 flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Session Policy
          </h3>
        </div>
        <div className="p-6 grid md:grid-cols-2 gap-6">
          <SettingItem
            label="Session Timeout"
            value={`${config.accessControl.sessionTimeoutMinutes} minutes`}
            description="Automatic logout after inactivity"
          />
          <SettingItem
            label="Max Concurrent Sessions"
            value={`${config.accessControl.maxConcurrentSessions} sessions`}
            description="Per user across all devices"
          />
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TRAINING SETTINGS
// ─────────────────────────────────────────────────────────────────────────────

function TrainingSettings({ config, canEdit }: SettingsPanelProps) {
  if (!config) return null;

  const training = config.training;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Training Requirements</h1>
        <p className="text-gray-500 mt-1">GCP-compliant training certification requirements</p>
      </div>

      <div
        className={`p-6 rounded-xl border-2 ${
          training.required ? 'border-green-200 bg-green-50' : 'border-gray-200 bg-gray-50'
        }`}
      >
        <div className="flex items-center gap-4">
          <div className={`p-3 rounded-lg ${training.required ? 'bg-green-100' : 'bg-gray-200'}`}>
            <Users
              className={`h-8 w-8 ${training.required ? 'text-green-600' : 'text-gray-500'}`}
            />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900">
              Training {training.required ? 'Required' : 'Optional'}
            </h3>
            <p className="text-gray-600">
              {training.required
                ? 'Users must complete required training before accessing regulated functions'
                : 'Training tracking is available but not enforced'}
            </p>
          </div>
        </div>
      </div>

      {training.required && (
        <>
          <div className="bg-white border rounded-xl overflow-hidden">
            <div className="px-6 py-4 bg-gray-50 border-b">
              <h3 className="font-semibold text-gray-900">Training Configuration</h3>
            </div>
            <div className="p-6 grid md:grid-cols-2 gap-6">
              <SettingItem
                label="Refresh Interval"
                value={`Every ${training.refreshIntervalDays} days`}
              />
              <SettingItem
                label="Competency Assessment"
                value={training.competencyAssessmentRequired ? 'Required' : 'Not Required'}
                enabled={training.competencyAssessmentRequired}
              />
              <SettingItem
                label="Documentation Required"
                value={training.documentationRequired ? 'Yes' : 'No'}
                enabled={training.documentationRequired}
              />
            </div>
          </div>

          <div className="bg-white border rounded-xl overflow-hidden">
            <div className="px-6 py-4 bg-gray-50 border-b">
              <h3 className="font-semibold text-gray-900">Required Courses</h3>
            </div>
            <div className="p-6">
              <div className="space-y-2">
                {training.requiredCourses.map(course => (
                  <div key={course} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                    <CheckCircle className="h-5 w-5 text-green-500" />
                    <span className="font-medium text-gray-900">{course.replace(/_/g, ' ')}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SETTING ITEM COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

function SettingItem({
  label,
  value,
  enabled,
  description,
}: {
  label: string;
  value: string;
  enabled?: boolean;
  description?: string;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-sm text-gray-600">{label}</span>
        <span
          className={`text-sm font-medium ${
            enabled !== undefined ? (enabled ? 'text-green-600' : 'text-gray-500') : 'text-gray-900'
          }`}
        >
          {value}
        </span>
      </div>
      {description && <p className="text-xs text-gray-400">{description}</p>}
    </div>
  );
}

export default SecuritySettings;
