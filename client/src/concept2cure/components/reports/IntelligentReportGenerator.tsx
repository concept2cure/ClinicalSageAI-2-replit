/**
 * Intelligent Report Generator — Full-screen GA component
 *
 * Unified report generation UI covering all platform domains with:
 * - Domain/subtype selection across regulatory, clinical, CMC, PV, QM, etc.
 * - Global regulatory body targeting (17 agencies)
 * - Real-time compliance scoring & atom-level provenance
 * - Immutable sealing with cryptographic verification
 * - Quasi-indemnification attestation viewer
 * - Section drill-down with atom provenance detail
 * - Export (JSON/CSV/manifest) with integrity headers
 * - Drift detection & compliance validation
 * - Supersede / revoke lifecycle actions
 */

import React, { useState, useEffect, useCallback } from 'react';
import NanoBananaImageGenerator from '@/components/NanoBananaImageGenerator';
import {
  FileText, Shield, Lock, CheckCircle2, AlertTriangle,
  ChevronRight, Globe2, Atom, Hash, Fingerprint,
  Clock, Building2, ShieldCheck, Eye, Download,
  Layers, BadgeCheck, ScrollText, FileCheck,
  ChevronDown, Search, X, ArrowRight, Zap,
  BookOpen, Scale, Activity, BarChart3,
  FlaskConical, Pill, Microscope, Briefcase,
  ShieldAlert, ClipboardCheck, Brain, Sparkles,
  ChevronUp, RefreshCw, XCircle, FileJson,
  FileSpreadsheet, FileSignature, GitBranch,
  AlertOctagon, CircleDot, ExternalLink,
} from 'lucide-react';

// ── Types ────────────────────────────────────────────────────

interface DomainBlueprint {
  domain: string;
  label: string;
  subtypes: string[];
  requiredSections: string[];
  defaultComplianceFrameworks: string[];
  indemnificationTier: 'full_audit_trail' | 'partial' | 'advisory_only';
}

interface RegulatoryBody {
  code: string;
  name: string;
  country: string;
  regulationCount: number;
  retentionYears: number;
  languageRequirement: string;
}

interface GeneratedReport {
  reportId: number;
  reportUuid: string;
  reportCode: string;
  verificationCode: string;
  contentHash: string;
  merkleRoot: string;
  sealStatus: string;
  complianceScore: number;
  indemnificationTier: string;
  provenanceAtomCount: number;
  attestationCount: number;
  generationDurationMs: number;
  record: any;
}

interface ReportAttestation {
  id: number;
  attestationType: string;
  regulationCode: string;
  regulationTitle: string;
  complianceStatus: string;
  complianceScore: number;
  attestationStatement: string;
  indemnificationScope: string;
  sealed: boolean;
}

interface ProvenanceEntry {
  id: number;
  sectionPath: string;
  fieldLabel: string;
  reportedValue: string;
  atomId: number | null;
  sourceTable: string;
  sourceRecordId: string;
  sourceField: string;
  sourceValue: string;
  valueHash: string;
  transformationType: string;
  confidence: number;
  driftDetected: boolean;
}

interface ComplianceCheck {
  checkId: string;
  category: string;
  description: string;
  passed: boolean;
  severity: string;
  details: string;
}

interface DriftResult {
  total: number;
  checked: number;
  drifted: number;
  details: { atomId: number; sectionPath: string; fieldLabel: string; originalHash: string; currentHash: string }[];
}

// ── Domain icons ─────────────────────────────────────────────

const DOMAIN_ICONS: Record<string, React.ReactNode> = {
  regulatory_submission: <ScrollText className="w-5 h-5" />,
  clinical_study: <FlaskConical className="w-5 h-5" />,
  cmc_manufacturing: <Pill className="w-5 h-5" />,
  pharmacovigilance: <ShieldAlert className="w-5 h-5" />,
  quality_management: <ClipboardCheck className="w-5 h-5" />,
  compliance_attestation: <BadgeCheck className="w-5 h-5" />,
  strategic_intelligence: <Brain className="w-5 h-5" />,
  provenance_audit: <Fingerprint className="w-5 h-5" />,
  device_regulatory: <Microscope className="w-5 h-5" />,
  biostatistics: <BarChart3 className="w-5 h-5" />,
  environmental_safety: <Globe2 className="w-5 h-5" />,
  cross_functional: <Layers className="w-5 h-5" />,
};

const TIER_COLORS: Record<string, string> = {
  full_audit_trail: 'text-emerald-700 bg-emerald-50 border-emerald-200',
  partial: 'text-amber-700 bg-amber-50 border-amber-200',
  advisory_only: 'text-blue-700 bg-blue-50 border-blue-200',
};

const TIER_LABELS: Record<string, string> = {
  full_audit_trail: 'Full Audit Trail — Maximum Indemnification',
  partial: 'Partial — Standard Compliance',
  advisory_only: 'Advisory Only — Informational',
};

const SEVERITY_COLORS: Record<string, string> = {
  critical: 'text-red-700 bg-red-50 border-red-200',
  major: 'text-amber-700 bg-amber-50 border-amber-200',
  minor: 'text-blue-700 bg-blue-50 border-blue-200',
};

// ── Component ────────────────────────────────────────────────

export default function IntelligentReportGenerator() {
  // Catalog data
  const [domains, setDomains] = useState<DomainBlueprint[]>([]);
  const [regulatoryBodies, setRegulatoryBodies] = useState<RegulatoryBody[]>([]);
  const [loading, setLoading] = useState(true);

  // Form state
  const [selectedDomain, setSelectedDomain] = useState<DomainBlueprint | null>(null);
  const [selectedSubtype, setSelectedSubtype] = useState<string>('');
  const [selectedBody, setSelectedBody] = useState<string>('');
  const [reportTitle, setReportTitle] = useState('');
  const [customFrameworks, setCustomFrameworks] = useState<string[]>([]);

  // Generation state
  const [generating, setGenerating] = useState(false);
  const [generatedReport, setGeneratedReport] = useState<GeneratedReport | null>(null);
  const [attestations, setAttestations] = useState<ReportAttestation[]>([]);
  const [verificationResult, setVerificationResult] = useState<any>(null);
  const [sealing, setSealing] = useState(false);
  const [sealJustification, setSealJustification] = useState('');

  // Provenance state
  const [provenanceEntries, setProvenanceEntries] = useState<ProvenanceEntry[]>([]);
  const [provenanceLoading, setProvenanceLoading] = useState(false);
  const [selectedProvenance, setSelectedProvenance] = useState<ProvenanceEntry | null>(null);

  // Compliance validation state
  const [complianceChecks, setComplianceChecks] = useState<ComplianceCheck[]>([]);
  const [complianceScore, setComplianceScore] = useState<number | null>(null);
  const [validating, setValidating] = useState(false);

  // Drift detection state
  const [driftResult, setDriftResult] = useState<DriftResult | null>(null);
  const [checkingDrift, setCheckingDrift] = useState(false);

  // Export state
  const [exporting, setExporting] = useState(false);
  const [showVisualGen, setShowVisualGen] = useState(false);

  // Supersede/revoke state
  const [superseding, setSuperseding] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [revokeJustification, setRevokeJustification] = useState('');
  const [showRevokeModal, setShowRevokeModal] = useState(false);

  // Section drill-down
  const [expandedSection, setExpandedSection] = useState<string | null>(null);

  // View state
  const [activeTab, setActiveTab] = useState<
    'generate' | 'result' | 'provenance' | 'compliance' | 'attestations' | 'history'
  >('generate');
  const [reportHistory, setReportHistory] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  // ── Load catalog ─────────────────────────────────────────

  useEffect(() => {
    loadCatalog();
  }, []);

  const loadCatalog = async () => {
    try {
      const [domainsRes, bodiesRes] = await Promise.all([
        fetch('/api/intelligent-reports/catalog/domains'),
        fetch('/api/intelligent-reports/catalog/regulatory-bodies'),
      ]);
      const domainsData = await domainsRes.json();
      const bodiesData = await bodiesRes.json();
      if (domainsData.success) setDomains(domainsData.data);
      if (bodiesData.success) setRegulatoryBodies(bodiesData.data);
    } catch (err) {
      console.error('Failed to load catalog:', err);
    } finally {
      setLoading(false);
    }
  };

  // ── Generate report ──────────────────────────────────────

  const handleGenerate = useCallback(async () => {
    if (!selectedDomain || !reportTitle) return;
    setGenerating(true);
    setVerificationResult(null);
    setDriftResult(null);
    setComplianceChecks([]);
    setComplianceScore(null);

    try {
      const res = await fetch('/api/intelligent-reports/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organizationId: 1,
          domain: selectedDomain.domain,
          subtype: selectedSubtype || undefined,
          title: reportTitle,
          targetRegulatory: selectedBody || undefined,
          complianceFrameworks: customFrameworks.length > 0
            ? customFrameworks
            : selectedDomain.defaultComplianceFrameworks,
          parameters: {},
        }),
      });

      const data = await res.json();
      if (data.success) {
        setGeneratedReport(data.data);
        setActiveTab('result');

        // Load attestations and provenance in parallel
        const [attRes, provRes] = await Promise.all([
          fetch(`/api/intelligent-reports/${data.data.reportId}/attestations`),
          fetch(`/api/intelligent-reports/${data.data.reportId}/provenance`),
        ]);
        const attData = await attRes.json();
        const provData = await provRes.json();
        if (attData.success) setAttestations(attData.data);
        if (provData.success) setProvenanceEntries(provData.data);
      }
    } catch (err) {
      console.error('Generation error:', err);
    } finally {
      setGenerating(false);
    }
  }, [selectedDomain, selectedSubtype, selectedBody, reportTitle, customFrameworks]);

  // ── Seal report ──────────────────────────────────────────

  const handleSeal = useCallback(async () => {
    if (!generatedReport || !sealJustification) return;
    setSealing(true);

    try {
      const res = await fetch(`/api/intelligent-reports/${generatedReport.reportId}/seal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ justification: sealJustification }),
      });

      const data = await res.json();
      if (data.success) {
        setGeneratedReport(prev => prev ? { ...prev, sealStatus: 'sealed' } : null);
        setSealJustification('');
      }
    } catch (err) {
      console.error('Seal error:', err);
    } finally {
      setSealing(false);
    }
  }, [generatedReport, sealJustification]);

  // ── Verify integrity ─────────────────────────────────────

  const handleVerify = useCallback(async () => {
    if (!generatedReport) return;

    try {
      const res = await fetch(`/api/intelligent-reports/${generatedReport.reportId}/verify`);
      const data = await res.json();
      if (data.success) setVerificationResult(data.data);
    } catch (err) {
      console.error('Verification error:', err);
    }
  }, [generatedReport]);

  // ── Load provenance ──────────────────────────────────────

  const loadProvenance = useCallback(async () => {
    if (!generatedReport) return;
    setProvenanceLoading(true);
    try {
      const res = await fetch(`/api/intelligent-reports/${generatedReport.reportId}/provenance`);
      const data = await res.json();
      if (data.success) setProvenanceEntries(data.data);
    } catch (err) {
      console.error('Provenance error:', err);
    } finally {
      setProvenanceLoading(false);
    }
  }, [generatedReport]);

  useEffect(() => {
    if (activeTab === 'provenance' && generatedReport && provenanceEntries.length === 0) {
      loadProvenance();
    }
  }, [activeTab, generatedReport, provenanceEntries.length, loadProvenance]);

  // ── Compliance validation ────────────────────────────────

  const handleComplianceValidation = useCallback(async () => {
    if (!generatedReport) return;
    setValidating(true);
    try {
      const res = await fetch(`/api/intelligent-reports/${generatedReport.reportId}/compliance-validation`);
      const data = await res.json();
      if (data.success) {
        setComplianceChecks(data.data.checks);
        setComplianceScore(data.data.overallScore);
      }
    } catch (err) {
      console.error('Validation error:', err);
    } finally {
      setValidating(false);
    }
  }, [generatedReport]);

  useEffect(() => {
    if (activeTab === 'compliance' && generatedReport && complianceChecks.length === 0) {
      handleComplianceValidation();
    }
  }, [activeTab, generatedReport, complianceChecks.length, handleComplianceValidation]);

  // ── Drift detection ──────────────────────────────────────

  const handleDriftCheck = useCallback(async () => {
    if (!generatedReport) return;
    setCheckingDrift(true);
    try {
      const res = await fetch(`/api/intelligent-reports/${generatedReport.reportId}/drift-check`);
      const data = await res.json();
      if (data.success) setDriftResult(data.data);
    } catch (err) {
      console.error('Drift check error:', err);
    } finally {
      setCheckingDrift(false);
    }
  }, [generatedReport]);

  // ── Export ───────────────────────────────────────────────

  const handleExport = useCallback(async (format: 'json' | 'csv' | 'manifest') => {
    if (!generatedReport) return;
    setExporting(true);
    try {
      const res = await fetch(`/api/intelligent-reports/${generatedReport.reportId}/export/${format}`);
      const blob = await res.blob();
      const filename = res.headers.get('Content-Disposition')?.split('filename="')[1]?.replace('"', '')
        || `report_${generatedReport.reportCode}.${format === 'csv' ? 'csv' : 'json'}`;

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Export error:', err);
    } finally {
      setExporting(false);
    }
  }, [generatedReport]);

  // ── Supersede ────────────────────────────────────────────

  const handleSupersede = useCallback(async () => {
    if (!generatedReport || !selectedDomain || !reportTitle) return;
    setSuperseding(true);
    try {
      const res = await fetch(`/api/intelligent-reports/${generatedReport.reportId}/supersede`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organizationId: 1,
          domain: generatedReport.record.reportDomain || selectedDomain.domain,
          title: `${reportTitle} (v2)`,
          targetRegulatory: generatedReport.record.targetRegulatory || selectedBody || undefined,
          complianceFrameworks: generatedReport.record.complianceFrameworks || selectedDomain.defaultComplianceFrameworks,
        }),
      });
      const data = await res.json();
      if (data.success) {
        // Load the new report
        const newRes = await fetch(`/api/intelligent-reports/${data.data.newReportId}`);
        const newData = await newRes.json();
        if (newData.success) {
          setGeneratedReport({
            reportId: newData.data.id,
            reportUuid: newData.data.reportUuid,
            reportCode: newData.data.reportCode,
            verificationCode: data.data.verificationCode || '',
            contentHash: newData.data.contentHash || '',
            merkleRoot: newData.data.merkleRoot || '',
            sealStatus: newData.data.sealStatus,
            complianceScore: newData.data.complianceScore || 0,
            indemnificationTier: newData.data.indemnificationTier || '',
            provenanceAtomCount: 0,
            attestationCount: 0,
            generationDurationMs: newData.data.generationDurationMs || 0,
            record: newData.data,
          });
          setVerificationResult(null);
          setDriftResult(null);
          setComplianceChecks([]);
          setComplianceScore(null);
          setProvenanceEntries([]);
        }
      }
    } catch (err) {
      console.error('Supersede error:', err);
    } finally {
      setSuperseding(false);
    }
  }, [generatedReport, selectedDomain, selectedBody, reportTitle]);

  // ── Revoke ───────────────────────────────────────────────

  const handleRevoke = useCallback(async () => {
    if (!generatedReport || !revokeJustification) return;
    setRevoking(true);
    try {
      const res = await fetch(`/api/intelligent-reports/${generatedReport.reportId}/revoke`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ justification: revokeJustification }),
      });
      const data = await res.json();
      if (data.success) {
        setGeneratedReport(prev => prev ? { ...prev, sealStatus: 'revoked' } : null);
        setShowRevokeModal(false);
        setRevokeJustification('');
      }
    } catch (err) {
      console.error('Revoke error:', err);
    } finally {
      setRevoking(false);
    }
  }, [generatedReport, revokeJustification]);

  // ── Load history ─────────────────────────────────────────

  const loadHistory = useCallback(async () => {
    try {
      const res = await fetch('/api/intelligent-reports/list/1?limit=50');
      const data = await res.json();
      if (data.success) setReportHistory(data.data);
    } catch (err) {
      console.error('History error:', err);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'history') loadHistory();
  }, [activeTab, loadHistory]);

  // ── Filter domains ───────────────────────────────────────

  const filteredDomains = domains.filter(d =>
    !searchQuery ||
    d.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
    d.subtypes.some(s => s.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  // ── Group provenance by section ──────────────────────────

  const provenanceBySection = provenanceEntries.reduce<Record<string, ProvenanceEntry[]>>((acc, p) => {
    const section = p.sectionPath.split('.')[0] || 'ungrouped';
    if (!acc[section]) acc[section] = [];
    acc[section].push(p);
    return acc;
  }, {});

  // ── Render ───────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
      </div>
    );
  }

  const tabs = [
    { key: 'generate' as const, label: 'Generate', icon: <Sparkles className="w-3.5 h-3.5" /> },
    { key: 'result' as const, label: 'Report', icon: <FileText className="w-3.5 h-3.5" /> },
    { key: 'provenance' as const, label: 'Provenance', icon: <Atom className="w-3.5 h-3.5" /> },
    { key: 'compliance' as const, label: 'Compliance', icon: <ShieldCheck className="w-3.5 h-3.5" /> },
    { key: 'attestations' as const, label: 'Attestations', icon: <BadgeCheck className="w-3.5 h-3.5" /> },
    { key: 'history' as const, label: 'History', icon: <Clock className="w-3.5 h-3.5" /> },
  ];

  return (
    <div className="h-full flex flex-col bg-gradient-to-br from-slate-50 to-white overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 border-b border-zinc-200 bg-white px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
              <FileText className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-zinc-900">Intelligent Report Engine</h1>
              <p className="text-xs text-zinc-500">Immutable records with atom-level provenance & quasi-indemnification</p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            {tabs.map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                  activeTab === tab.key
                    ? 'bg-indigo-100 text-indigo-700'
                    : 'text-zinc-500 hover:bg-zinc-100'
                }`}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto">
        {/* ── Generate Tab ─────────────────────────────── */}
        {activeTab === 'generate' && (
          <div className="max-w-5xl mx-auto p-6 space-y-6">
            {/* Report Title */}
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1.5">Report Title</label>
              <input
                type="text"
                value={reportTitle}
                onChange={e => setReportTitle(e.target.value)}
                placeholder="e.g., IND Annual Report — Compound XYZ-201"
                className="w-full px-4 py-2.5 border border-zinc-300 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>

            {/* Domain Selection */}
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-2">Report Domain</label>
              <div className="relative mb-3">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Search domains and subtypes..."
                  className="w-full pl-10 pr-4 py-2 border border-zinc-200 rounded-lg text-sm"
                />
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {filteredDomains.map(d => (
                  <button
                    key={d.domain}
                    onClick={() => {
                      setSelectedDomain(d);
                      setSelectedSubtype('');
                      setCustomFrameworks([]);
                    }}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      selectedDomain?.domain === d.domain
                        ? 'border-indigo-500 bg-indigo-50 ring-2 ring-indigo-200'
                        : 'border-zinc-200 hover:border-zinc-300 hover:bg-zinc-50'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className={selectedDomain?.domain === d.domain ? 'text-indigo-600' : 'text-zinc-400'}>
                        {DOMAIN_ICONS[d.domain] || <FileText className="w-5 h-5" />}
                      </span>
                      <span className="text-sm font-medium text-zinc-900 truncate">{d.label}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-zinc-500">
                      <span>{d.subtypes.length} subtypes</span>
                      <span className="text-zinc-300">|</span>
                      <span className={TIER_COLORS[d.indemnificationTier]?.split(' ')[0] || 'text-zinc-500'}>
                        {d.indemnificationTier === 'full_audit_trail' ? 'Full' :
                         d.indemnificationTier === 'partial' ? 'Partial' : 'Advisory'}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Subtype Selection */}
            {selectedDomain && (
              <div className="animate-in fade-in slide-in-from-top-2 duration-200">
                <label className="block text-sm font-medium text-zinc-700 mb-2">Report Subtype</label>
                <div className="flex flex-wrap gap-2">
                  {selectedDomain.subtypes.map(sub => (
                    <button
                      key={sub}
                      onClick={() => setSelectedSubtype(sub)}
                      className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-colors ${
                        selectedSubtype === sub
                          ? 'border-indigo-500 bg-indigo-100 text-indigo-700'
                          : 'border-zinc-200 text-zinc-600 hover:bg-zinc-50'
                      }`}
                    >
                      {sub}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Regulatory Body */}
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-2">
                Target Regulatory Body
                <span className="text-zinc-400 font-normal ml-1">(optional)</span>
              </label>
              <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
                {regulatoryBodies.map(b => (
                  <button
                    key={b.code}
                    onClick={() => setSelectedBody(selectedBody === b.code ? '' : b.code)}
                    className={`p-2.5 rounded-lg border text-left transition-all ${
                      selectedBody === b.code
                        ? 'border-indigo-500 bg-indigo-50 ring-1 ring-indigo-200'
                        : 'border-zinc-200 hover:border-zinc-300'
                    }`}
                  >
                    <div className="text-xs font-bold text-zinc-900">{b.code.replace('_', ' ')}</div>
                    <div className="text-[11px] text-zinc-500 truncate">{b.country}</div>
                    <div className="text-[11px] text-zinc-400">{b.regulationCount} regs</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Compliance Frameworks */}
            {selectedDomain && (
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1.5">
                  Compliance Frameworks
                </label>
                <div className="flex flex-wrap gap-2">
                  {selectedDomain.defaultComplianceFrameworks.map(fw => (
                    <span key={fw} className="px-2.5 py-1 bg-emerald-50 text-emerald-700 text-xs rounded-full border border-emerald-200">
                      <ShieldCheck className="w-3 h-3 inline-block mr-1 -mt-0.5" />
                      {fw}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Indemnification Tier Notice */}
            {selectedDomain && (
              <div className={`p-4 rounded-xl border ${TIER_COLORS[selectedDomain.indemnificationTier]}`}>
                <div className="flex items-center gap-2 mb-1">
                  <Shield className="w-4 h-4" />
                  <span className="text-sm font-semibold">
                    {TIER_LABELS[selectedDomain.indemnificationTier]}
                  </span>
                </div>
                <p className="text-xs opacity-80">
                  {selectedDomain.indemnificationTier === 'full_audit_trail'
                    ? 'Every data point will be traced to its source atom. SHA-256 hash chain with Merkle tree verification. Cryptographic seal available. Full quasi-indemnification attestations generated.'
                    : selectedDomain.indemnificationTier === 'partial'
                    ? 'Key data points traced. Standard compliance attestations. Seal available for critical sections.'
                    : 'Strategic advisory content. Not intended for regulatory submission. Standard provenance only.'}
                </p>
              </div>
            )}

            {/* Generate Button */}
            <div className="flex justify-end pt-2">
              <button
                onClick={handleGenerate}
                disabled={!selectedDomain || !reportTitle || generating}
                className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl font-medium text-sm hover:from-indigo-700 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-indigo-200"
              >
                {generating ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                    Generating Immutable Record...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    Generate Immutable Report
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* ── Result Tab ───────────────────────────────── */}
        {activeTab === 'result' && generatedReport && (
          <div className="max-w-5xl mx-auto p-6 space-y-6">
            {/* Report Header Card */}
            <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden">
              <div className="bg-gradient-to-r from-indigo-600 to-purple-600 px-6 py-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-white font-semibold text-lg">{generatedReport.record.reportTitle}</h2>
                    <p className="text-indigo-200 text-sm">{generatedReport.reportCode}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {generatedReport.record.version && (
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-white/20 text-white">
                        v{generatedReport.record.version}
                      </span>
                    )}
                    <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                      generatedReport.sealStatus === 'sealed'
                        ? 'bg-emerald-500 text-white'
                        : generatedReport.sealStatus === 'revoked'
                        ? 'bg-red-500 text-white'
                        : generatedReport.sealStatus === 'superseded'
                        ? 'bg-amber-500 text-white'
                        : 'bg-white/20 text-white'
                    }`}>
                      {generatedReport.sealStatus.toUpperCase()}
                    </span>
                  </div>
                </div>
              </div>

              <div className="p-6 grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <div className="text-xs text-zinc-500 mb-0.5">Verification Code</div>
                  <div className="text-sm font-mono font-bold text-indigo-600">{generatedReport.verificationCode}</div>
                </div>
                <div>
                  <div className="text-xs text-zinc-500 mb-0.5">Compliance Score</div>
                  <div className="text-sm font-bold text-emerald-600">{generatedReport.complianceScore}/100</div>
                </div>
                <div>
                  <div className="text-xs text-zinc-500 mb-0.5">Provenance Atoms</div>
                  <div className="text-sm font-bold text-purple-600">{generatedReport.provenanceAtomCount}</div>
                </div>
                <div>
                  <div className="text-xs text-zinc-500 mb-0.5">Generation Time</div>
                  <div className="text-sm font-bold text-zinc-600">{generatedReport.generationDurationMs}ms</div>
                </div>
              </div>

              {/* Cryptographic Details */}
              <div className="border-t border-zinc-200 px-6 py-4 bg-zinc-50">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <div className="text-xs text-zinc-500 flex items-center gap-1 mb-0.5">
                      <Hash className="w-3 h-3" /> Content Hash (SHA-256)
                    </div>
                    <div className="text-xs font-mono text-zinc-600 break-all">{generatedReport.contentHash}</div>
                  </div>
                  <div>
                    <div className="text-xs text-zinc-500 flex items-center gap-1 mb-0.5">
                      <Layers className="w-3 h-3" /> Merkle Root
                    </div>
                    <div className="text-xs font-mono text-zinc-600 break-all">{generatedReport.merkleRoot}</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Action Bar */}
            <div className="flex flex-wrap gap-3">
              {/* Verify */}
              <button
                onClick={handleVerify}
                className="flex items-center gap-2 px-4 py-2.5 border border-zinc-300 rounded-xl text-sm font-medium text-zinc-700 hover:bg-zinc-50 transition-colors"
              >
                <Fingerprint className="w-4 h-4" />
                Verify Integrity
              </button>

              {/* Drift Check */}
              <button
                onClick={handleDriftCheck}
                disabled={checkingDrift}
                className="flex items-center gap-2 px-4 py-2.5 border border-zinc-300 rounded-xl text-sm font-medium text-zinc-700 hover:bg-zinc-50 transition-colors disabled:opacity-50"
              >
                {checkingDrift ? (
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-zinc-600" />
                ) : (
                  <RefreshCw className="w-4 h-4" />
                )}
                Drift Check
              </button>

              {/* Export dropdown */}
              <div className="relative group">
                <button
                  disabled={exporting}
                  className="flex items-center gap-2 px-4 py-2.5 border border-zinc-300 rounded-xl text-sm font-medium text-zinc-700 hover:bg-zinc-50 transition-colors disabled:opacity-50"
                >
                  <Download className="w-4 h-4" />
                  Export
                  <ChevronDown className="w-3 h-3" />
                </button>
                <div className="absolute top-full left-0 mt-1 bg-white border border-zinc-200 rounded-xl shadow-lg py-1 w-48 hidden group-hover:block z-10">
                  <button
                    onClick={() => handleExport('json')}
                    className="flex items-center gap-2 w-full px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-50"
                  >
                    <FileJson className="w-4 h-4 text-blue-500" />
                    JSON (Full Report)
                  </button>
                  <button
                    onClick={() => handleExport('csv')}
                    className="flex items-center gap-2 w-full px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-50"
                  >
                    <FileSpreadsheet className="w-4 h-4 text-emerald-500" />
                    CSV (Provenance)
                  </button>
                  <button
                    onClick={() => handleExport('manifest')}
                    className="flex items-center gap-2 w-full px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-50"
                  >
                    <FileSignature className="w-4 h-4 text-purple-500" />
                    Integrity Manifest
                  </button>
                  <div className="mx-2 my-0.5 border-t border-zinc-200" />
                  <button
                    onClick={() => setShowVisualGen(prev => !prev)}
                    className="flex items-center gap-2 w-full px-3 py-2 text-sm text-zinc-700 hover:bg-amber-50"
                  >
                    <Sparkles className="w-4 h-4 text-amber-500" />
                    AI Visual / Infographic
                  </button>
                </div>
              </div>

              {/* Seal (if draft) */}
              {generatedReport.sealStatus === 'draft' && (
                <div className="flex items-center gap-2 flex-1 min-w-[300px]">
                  <input
                    type="text"
                    value={sealJustification}
                    onChange={e => setSealJustification(e.target.value)}
                    placeholder="Justification for sealing (required)..."
                    className="flex-1 px-3 py-2.5 border border-zinc-300 rounded-xl text-sm"
                  />
                  <button
                    onClick={handleSeal}
                    disabled={!sealJustification || sealing}
                    className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 transition-colors"
                  >
                    <Lock className="w-4 h-4" />
                    {sealing ? 'Sealing...' : 'Seal'}
                  </button>
                </div>
              )}

              {/* Supersede (if sealed) */}
              {generatedReport.sealStatus === 'sealed' && (
                <button
                  onClick={handleSupersede}
                  disabled={superseding}
                  className="flex items-center gap-2 px-4 py-2.5 border border-amber-300 bg-amber-50 rounded-xl text-sm font-medium text-amber-700 hover:bg-amber-100 transition-colors disabled:opacity-50"
                >
                  <GitBranch className="w-4 h-4" />
                  {superseding ? 'Creating new version...' : 'Supersede'}
                </button>
              )}

              {/* Revoke (if not revoked) */}
              {generatedReport.sealStatus !== 'revoked' && generatedReport.sealStatus !== 'superseded' && (
                <button
                  onClick={() => setShowRevokeModal(true)}
                  className="flex items-center gap-2 px-4 py-2.5 border border-red-300 bg-red-50 rounded-xl text-sm font-medium text-red-700 hover:bg-red-100 transition-colors"
                >
                  <XCircle className="w-4 h-4" />
                  Revoke
                </button>
              )}
            </div>

            {/* Revoke Modal */}
            {showRevokeModal && (
              <div className="p-4 bg-red-50 border border-red-200 rounded-xl">
                <div className="flex items-center gap-2 mb-3">
                  <AlertOctagon className="w-5 h-5 text-red-600" />
                  <span className="text-sm font-semibold text-red-700">Revoke Report</span>
                  <span className="text-xs text-red-500">This action is permanent and recorded in the seal chain.</span>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={revokeJustification}
                    onChange={e => setRevokeJustification(e.target.value)}
                    placeholder="Justification for revocation (required)..."
                    className="flex-1 px-3 py-2.5 border border-red-300 rounded-xl text-sm"
                  />
                  <button
                    onClick={handleRevoke}
                    disabled={!revokeJustification || revoking}
                    className="px-4 py-2.5 bg-red-600 text-white rounded-xl text-sm font-medium hover:bg-red-700 disabled:opacity-50"
                  >
                    {revoking ? 'Revoking...' : 'Confirm Revoke'}
                  </button>
                  <button
                    onClick={() => { setShowRevokeModal(false); setRevokeJustification(''); }}
                    className="px-3 py-2.5 text-zinc-500 hover:text-zinc-700 text-sm"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Nano Banana Visual AI */}
            {showVisualGen && (
              <div className="mt-4">
                <NanoBananaImageGenerator
                  context={`${selectedDomain?.label || 'Regulatory'} report: ${reportTitle || 'compliance report'} — compliance score ${generatedReport.complianceScore}%, ${selectedBodies.map(b => b.code).join(', ')} targeting`}
                  mode="infographic"
                  promptSuffix="Regulatory compliance infographic. Publication-ready, professional, data-rich."
                />
              </div>
            )}

            {/* Verification Result */}
            {verificationResult && (
              <div className={`p-4 rounded-xl border ${
                verificationResult.valid
                  ? 'bg-emerald-50 border-emerald-200'
                  : 'bg-red-50 border-red-200'
              }`}>
                <div className="flex items-center gap-2 mb-2">
                  {verificationResult.valid
                    ? <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                    : <AlertTriangle className="w-5 h-5 text-red-600" />
                  }
                  <span className={`font-semibold text-sm ${verificationResult.valid ? 'text-emerald-700' : 'text-red-700'}`}>
                    {verificationResult.valid ? 'All Integrity Checks Passed' : 'Integrity Issues Detected'}
                  </span>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-2">
                  <div className="text-xs">
                    <span className="text-zinc-500">Content Hash:</span>{' '}
                    <span className={verificationResult.contentHashValid ? 'text-emerald-600 font-medium' : 'text-red-600 font-bold'}>
                      {verificationResult.contentHashValid ? 'Valid' : 'MISMATCH'}
                    </span>
                  </div>
                  <div className="text-xs">
                    <span className="text-zinc-500">Merkle Root:</span>{' '}
                    <span className={verificationResult.merkleRootValid ? 'text-emerald-600 font-medium' : 'text-red-600 font-bold'}>
                      {verificationResult.merkleRootValid ? 'Valid' : 'MISMATCH'}
                    </span>
                  </div>
                  <div className="text-xs">
                    <span className="text-zinc-500">Seal Chain:</span>{' '}
                    <span className={verificationResult.chainIntact ? 'text-emerald-600 font-medium' : 'text-red-600 font-bold'}>
                      {verificationResult.chainIntact ? 'Intact' : 'BROKEN'}
                    </span>
                  </div>
                  <div className="text-xs">
                    <span className="text-zinc-500">Provenance Drift:</span>{' '}
                    <span className={verificationResult.provenanceDrift.drifted === 0 ? 'text-emerald-600 font-medium' : 'text-amber-600 font-bold'}>
                      {verificationResult.provenanceDrift.drifted}/{verificationResult.provenanceDrift.total} drifted
                    </span>
                  </div>
                </div>
                {verificationResult.details.length > 0 && (
                  <div className="mt-2 text-xs text-zinc-600">
                    {verificationResult.details.map((d: string, i: number) => (
                      <div key={i} className="flex items-start gap-1">
                        <ChevronRight className="w-3 h-3 mt-0.5 flex-shrink-0" />
                        {d}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Drift Detection Result */}
            {driftResult && (
              <div className={`p-4 rounded-xl border ${
                driftResult.drifted === 0
                  ? 'bg-emerald-50 border-emerald-200'
                  : 'bg-amber-50 border-amber-200'
              }`}>
                <div className="flex items-center gap-2 mb-2">
                  <RefreshCw className={`w-4 h-4 ${driftResult.drifted === 0 ? 'text-emerald-600' : 'text-amber-600'}`} />
                  <span className={`text-sm font-semibold ${driftResult.drifted === 0 ? 'text-emerald-700' : 'text-amber-700'}`}>
                    Provenance Drift: {driftResult.drifted === 0 ? 'No drift detected' : `${driftResult.drifted} atoms drifted`}
                  </span>
                  <span className="text-xs text-zinc-500">
                    ({driftResult.checked}/{driftResult.total} checked)
                  </span>
                </div>
                {driftResult.details.length > 0 && (
                  <div className="space-y-1 mt-2">
                    {driftResult.details.map((d, i) => (
                      <div key={i} className="text-xs bg-white/60 rounded-lg px-3 py-2 flex items-center gap-3">
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
                        <div>
                          <span className="font-medium text-zinc-700">{d.fieldLabel}</span>
                          <span className="text-zinc-400 mx-1">in</span>
                          <span className="text-zinc-600">{d.sectionPath}</span>
                        </div>
                        <div className="ml-auto text-zinc-400 font-mono text-[11px]">
                          {d.currentHash === 'DELETED' ? 'SOURCE DELETED' : 'HASH CHANGED'}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Report Sections — Drill-Down */}
            {generatedReport.record.sections && (
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-zinc-700 flex items-center gap-2">
                  <Layers className="w-4 h-4" />
                  Report Sections
                  <span className="text-xs text-zinc-400 font-normal">
                    ({(generatedReport.record.sections as any[]).length} sections)
                  </span>
                </h3>
                {(generatedReport.record.sections as any[]).map((section: any, idx: number) => {
                  const isExpanded = expandedSection === section.sectionId;
                  const sectionProvenance = provenanceEntries.filter(p =>
                    p.sectionPath.startsWith(section.sectionId)
                  );
                  return (
                    <div key={idx} className="bg-white rounded-xl border border-zinc-200 overflow-hidden">
                      <button
                        onClick={() => setExpandedSection(isExpanded ? null : section.sectionId)}
                        className="w-full p-4 flex items-center justify-between hover:bg-zinc-50 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-600 font-bold text-xs">
                            {idx + 1}
                          </div>
                          <div className="text-left">
                            <span className="text-sm font-medium text-zinc-900">{section.title}</span>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-xs text-purple-500">{section.atomRefCount || 0} atoms</span>
                              {section.complianceNotes?.length > 0 && (
                                <span className="text-xs text-emerald-500">{section.complianceNotes.length} notes</span>
                              )}
                            </div>
                          </div>
                        </div>
                        {isExpanded ? <ChevronUp className="w-4 h-4 text-zinc-400" /> : <ChevronDown className="w-4 h-4 text-zinc-400" />}
                      </button>

                      {isExpanded && (
                        <div className="border-t border-zinc-200 p-4 space-y-3">
                          {/* Section Content */}
                          <div className="bg-zinc-50 rounded-lg p-3">
                            <div className="text-xs font-medium text-zinc-500 mb-1">Section Data</div>
                            <pre className="text-xs text-zinc-700 whitespace-pre-wrap max-h-60 overflow-y-auto font-mono">
                              {JSON.stringify(section.content, null, 2)}
                            </pre>
                          </div>

                          {/* Compliance Notes */}
                          {section.complianceNotes?.length > 0 && (
                            <div>
                              <div className="text-xs font-medium text-zinc-500 mb-1">Compliance Notes</div>
                              <div className="flex flex-wrap gap-2">
                                {section.complianceNotes.map((note: string, ni: number) => (
                                  <span key={ni} className="inline-flex items-center gap-1 px-2 py-1 bg-emerald-50 text-emerald-700 text-xs rounded-lg border border-emerald-200">
                                    <ShieldCheck className="w-3 h-3" />
                                    {note}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Section-level Provenance Atoms */}
                          {sectionProvenance.length > 0 && (
                            <div>
                              <div className="text-xs font-medium text-zinc-500 mb-1">Provenance Atoms ({sectionProvenance.length})</div>
                              <div className="space-y-1">
                                {sectionProvenance.map(p => (
                                  <div
                                    key={p.id}
                                    className="flex items-center gap-2 px-2 py-1.5 bg-purple-50 rounded-lg text-xs cursor-pointer hover:bg-purple-100"
                                    onClick={() => setSelectedProvenance(p)}
                                  >
                                    <Atom className="w-3 h-3 text-purple-500 flex-shrink-0" />
                                    <span className="font-medium text-purple-700">{p.fieldLabel}</span>
                                    <span className="text-zinc-400">from</span>
                                    <span className="font-mono text-zinc-600">{p.sourceTable}.{p.sourceField}</span>
                                    <span className="ml-auto text-zinc-400">
                                      {Math.round((p.confidence || 0) * 100)}%
                                    </span>
                                    {p.driftDetected && (
                                      <AlertTriangle className="w-3 h-3 text-amber-500" />
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Indemnification Statement */}
            {generatedReport.record.attestationStatement && (
              <div className="p-4 bg-zinc-900 rounded-xl text-zinc-300 text-xs font-mono whitespace-pre-wrap leading-relaxed">
                <div className="flex items-center gap-2 mb-3 text-zinc-100">
                  <Scale className="w-4 h-4" />
                  <span className="font-bold text-sm">Quasi-Indemnification Statement</span>
                </div>
                {generatedReport.record.attestationStatement}
              </div>
            )}
          </div>
        )}

        {/* ── Provenance Tab ───────────────────────────── */}
        {activeTab === 'provenance' && generatedReport && (
          <div className="max-w-6xl mx-auto p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Atom className="w-5 h-5 text-purple-600" />
                <h3 className="text-sm font-semibold text-zinc-700">Atom-Level Provenance Chain</h3>
                <span className="text-xs text-zinc-400">
                  {provenanceEntries.length} atoms — every data point traced to source
                </span>
              </div>
              <button
                onClick={loadProvenance}
                disabled={provenanceLoading}
                className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-700"
              >
                <RefreshCw className={`w-3 h-3 ${provenanceLoading ? 'animate-spin' : ''}`} />
                Refresh
              </button>
            </div>

            {provenanceEntries.length === 0 ? (
              <div className="text-center py-12 text-zinc-400 text-sm">
                <Atom className="w-8 h-8 mx-auto mb-2 text-purple-300" />
                {provenanceLoading ? 'Loading provenance data...' : 'No provenance atoms recorded for this report.'}
              </div>
            ) : (
              <div className="flex gap-6">
                {/* Provenance list grouped by section */}
                <div className="flex-1 space-y-4">
                  {Object.entries(provenanceBySection).map(([section, entries]) => (
                    <div key={section}>
                      <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-2">
                        {section.replace(/_/g, ' ')}
                      </div>
                      <div className="space-y-1">
                        {entries.map(p => (
                          <div
                            key={p.id}
                            onClick={() => setSelectedProvenance(p)}
                            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs cursor-pointer transition-colors ${
                              selectedProvenance?.id === p.id
                                ? 'bg-purple-100 border border-purple-300'
                                : 'bg-white border border-zinc-200 hover:border-purple-200 hover:bg-purple-50'
                            }`}
                          >
                            <CircleDot className={`w-3 h-3 flex-shrink-0 ${
                              p.driftDetected ? 'text-amber-500' : 'text-purple-400'
                            }`} />
                            <div className="flex-1 min-w-0">
                              <div className="font-medium text-zinc-800 truncate">{p.fieldLabel || p.sectionPath}</div>
                              <div className="text-zinc-400 truncate">
                                {p.sourceTable}.{p.sourceField} #{p.sourceRecordId}
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className={`px-1.5 py-0.5 rounded text-[11px] font-medium ${
                                p.transformationType === 'direct_copy' ? 'bg-emerald-50 text-emerald-600' :
                                p.transformationType === 'aggregation' ? 'bg-blue-50 text-blue-600' :
                                p.transformationType === 'ai_generated' ? 'bg-purple-50 text-purple-600' :
                                'bg-zinc-100 text-zinc-500'
                              }`}>
                                {p.transformationType.replace('_', ' ')}
                              </span>
                              <span className="text-zinc-400 w-10 text-right">
                                {Math.round((p.confidence || 0) * 100)}%
                              </span>
                              {p.driftDetected && (
                                <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Provenance Detail Panel */}
                {selectedProvenance && (
                  <div className="w-80 flex-shrink-0 bg-white border border-zinc-200 rounded-xl p-4 sticky top-6 self-start">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="text-sm font-semibold text-zinc-800">Atom Detail</h4>
                      <button onClick={() => setSelectedProvenance(null)} className="text-zinc-400 hover:text-zinc-600">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="space-y-3 text-xs">
                      <div>
                        <div className="text-zinc-400 mb-0.5">Field Label</div>
                        <div className="text-zinc-800 font-medium">{selectedProvenance.fieldLabel}</div>
                      </div>
                      <div>
                        <div className="text-zinc-400 mb-0.5">Section Path</div>
                        <div className="text-zinc-600 font-mono">{selectedProvenance.sectionPath}</div>
                      </div>
                      <div>
                        <div className="text-zinc-400 mb-0.5">Reported Value</div>
                        <div className="text-zinc-700 bg-zinc-50 p-2 rounded-lg break-all max-h-20 overflow-auto">
                          {selectedProvenance.reportedValue || '—'}
                        </div>
                      </div>
                      <hr className="border-zinc-200" />
                      <div>
                        <div className="text-zinc-400 mb-0.5">Source Table</div>
                        <div className="text-indigo-600 font-mono font-medium">{selectedProvenance.sourceTable}</div>
                      </div>
                      <div>
                        <div className="text-zinc-400 mb-0.5">Source Record ID</div>
                        <div className="text-zinc-700 font-mono">{selectedProvenance.sourceRecordId}</div>
                      </div>
                      <div>
                        <div className="text-zinc-400 mb-0.5">Source Field</div>
                        <div className="text-zinc-700 font-mono">{selectedProvenance.sourceField}</div>
                      </div>
                      <div>
                        <div className="text-zinc-400 mb-0.5">Source Value</div>
                        <div className="text-zinc-700 bg-zinc-50 p-2 rounded-lg break-all max-h-20 overflow-auto">
                          {selectedProvenance.sourceValue || '—'}
                        </div>
                      </div>
                      <hr className="border-zinc-200" />
                      <div className="flex gap-3">
                        <div>
                          <div className="text-zinc-400 mb-0.5">Transformation</div>
                          <span className={`px-2 py-0.5 rounded text-[11px] font-medium ${
                            selectedProvenance.transformationType === 'direct_copy' ? 'bg-emerald-50 text-emerald-600' :
                            selectedProvenance.transformationType === 'aggregation' ? 'bg-blue-50 text-blue-600' :
                            'bg-zinc-100 text-zinc-500'
                          }`}>
                            {selectedProvenance.transformationType}
                          </span>
                        </div>
                        <div>
                          <div className="text-zinc-400 mb-0.5">Confidence</div>
                          <div className="font-bold text-zinc-800">{Math.round((selectedProvenance.confidence || 0) * 100)}%</div>
                        </div>
                      </div>
                      <div>
                        <div className="text-zinc-400 mb-0.5">Value Hash (SHA-256)</div>
                        <div className="text-zinc-500 font-mono text-[11px] break-all">{selectedProvenance.valueHash}</div>
                      </div>
                      {selectedProvenance.driftDetected && (
                        <div className="p-2 bg-amber-50 border border-amber-200 rounded-lg">
                          <div className="flex items-center gap-1 text-amber-700 font-medium">
                            <AlertTriangle className="w-3.5 h-3.5" />
                            Drift Detected
                          </div>
                          <div className="text-amber-600 mt-0.5">Source data has changed since this report was generated.</div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── Compliance Tab ─────────────────────────────── */}
        {activeTab === 'compliance' && generatedReport && (
          <div className="max-w-5xl mx-auto p-6 space-y-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-emerald-600" />
                <h3 className="text-sm font-semibold text-zinc-700">Compliance Validation</h3>
              </div>
              <button
                onClick={handleComplianceValidation}
                disabled={validating}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-indigo-600 hover:text-indigo-700 border border-indigo-200 rounded-lg hover:bg-indigo-50"
              >
                <RefreshCw className={`w-3 h-3 ${validating ? 'animate-spin' : ''}`} />
                Re-validate
              </button>
            </div>

            {complianceScore !== null && (
              <div className="bg-white rounded-2xl border border-zinc-200 p-6">
                <div className="flex items-center gap-6">
                  <div className="relative w-24 h-24">
                    <svg className="w-24 h-24 -rotate-90" viewBox="0 0 36 36">
                      <path
                        className="text-zinc-100"
                        stroke="currentColor"
                        strokeWidth="3"
                        fill="none"
                        d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                      />
                      <path
                        className={complianceScore >= 80 ? 'text-emerald-500' : complianceScore >= 60 ? 'text-amber-500' : 'text-red-500'}
                        stroke="currentColor"
                        strokeWidth="3"
                        strokeDasharray={`${complianceScore}, 100`}
                        strokeLinecap="round"
                        fill="none"
                        d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                      />
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className={`text-xl font-bold ${complianceScore >= 80 ? 'text-emerald-600' : complianceScore >= 60 ? 'text-amber-600' : 'text-red-600'}`}>
                        {complianceScore}
                      </span>
                    </div>
                  </div>
                  <div>
                    <h4 className="text-lg font-semibold text-zinc-800">Overall Compliance Score</h4>
                    <p className="text-sm text-zinc-500 mt-1">
                      {complianceChecks.filter(c => c.passed).length}/{complianceChecks.length} checks passed
                    </p>
                    <div className="flex gap-4 mt-2">
                      <span className="text-xs text-red-600">{complianceChecks.filter(c => !c.passed && c.severity === 'critical').length} critical failures</span>
                      <span className="text-xs text-amber-600">{complianceChecks.filter(c => !c.passed && c.severity === 'major').length} major issues</span>
                      <span className="text-xs text-blue-600">{complianceChecks.filter(c => !c.passed && c.severity === 'minor').length} minor items</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {validating && complianceChecks.length === 0 && (
              <div className="text-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mx-auto mb-3" />
                <div className="text-sm text-zinc-500">Running compliance validation...</div>
              </div>
            )}

            {complianceChecks.length > 0 && (
              <div className="space-y-2">
                {complianceChecks.map((check, idx) => (
                  <div
                    key={idx}
                    className={`p-3 rounded-xl border flex items-start gap-3 ${
                      check.passed ? 'bg-white border-zinc-200' : SEVERITY_COLORS[check.severity] || 'bg-zinc-50 border-zinc-200'
                    }`}
                  >
                    {check.passed ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-500 mt-0.5 flex-shrink-0" />
                    ) : (
                      <AlertTriangle className={`w-4 h-4 mt-0.5 flex-shrink-0 ${
                        check.severity === 'critical' ? 'text-red-500' :
                        check.severity === 'major' ? 'text-amber-500' : 'text-blue-500'
                      }`} />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono text-zinc-400">{check.checkId}</span>
                        <span className="text-sm font-medium text-zinc-800">{check.description}</span>
                      </div>
                      <div className="flex items-center gap-3 mt-1">
                        <span className="text-xs text-zinc-500">{check.category.replace(/_/g, ' ')}</span>
                        <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                          check.severity === 'critical' ? 'bg-red-100 text-red-700' :
                          check.severity === 'major' ? 'bg-amber-100 text-amber-700' :
                          'bg-blue-100 text-blue-700'
                        }`}>
                          {check.severity}
                        </span>
                      </div>
                      <div className="text-xs text-zinc-500 mt-1">{check.details}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Attestations Tab ─────────────────────────── */}
        {activeTab === 'attestations' && (
          <div className="max-w-5xl mx-auto p-6 space-y-4">
            <div className="flex items-center gap-2 mb-2">
              <BadgeCheck className="w-5 h-5 text-emerald-600" />
              <h3 className="text-sm font-semibold text-zinc-700">Indemnification Attestations</h3>
              <span className="text-xs text-zinc-400">{attestations.length} records</span>
            </div>

            {attestations.length === 0 ? (
              <div className="text-center py-12 text-zinc-400 text-sm">
                Generate a report to see attestations.
              </div>
            ) : (
              attestations.map((att, idx) => (
                <div key={idx} className="p-4 bg-white rounded-xl border border-zinc-200">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className={`w-2.5 h-2.5 rounded-full ${
                        att.complianceStatus === 'compliant' ? 'bg-emerald-500' :
                        att.complianceStatus === 'partially_compliant' ? 'bg-amber-500' :
                        'bg-red-500'
                      }`} />
                      <span className="text-sm font-medium text-zinc-900 capitalize">
                        {att.attestationType.replace(/_/g, ' ')}
                      </span>
                      {att.regulationCode && (
                        <span className="text-xs bg-zinc-100 text-zinc-600 px-2 py-0.5 rounded">
                          {att.regulationCode}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-zinc-600">
                        {att.complianceScore}/100
                      </span>
                      {att.sealed && (
                        <Lock className="w-3 h-3 text-emerald-600" />
                      )}
                    </div>
                  </div>
                  {att.attestationStatement && (
                    <p className="text-xs text-zinc-600 mt-1">{att.attestationStatement}</p>
                  )}
                  <div className="flex items-center gap-3 mt-2 text-xs text-zinc-400">
                    <span>Scope: {att.indemnificationScope}</span>
                    <span>Status: {att.complianceStatus}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* ── History Tab ──────────────────────────────── */}
        {activeTab === 'history' && (
          <div className="max-w-5xl mx-auto p-6">
            <div className="flex items-center gap-2 mb-4">
              <Clock className="w-5 h-5 text-zinc-600" />
              <h3 className="text-sm font-semibold text-zinc-700">Report Ledger</h3>
              <span className="text-xs text-zinc-400">{reportHistory.length} records</span>
            </div>

            {reportHistory.length === 0 ? (
              <div className="text-center py-12 text-zinc-400 text-sm">
                No reports generated yet. Use the Generate tab to create your first immutable report.
              </div>
            ) : (
              <div className="space-y-2">
                {reportHistory.map((report: any) => (
                  <div
                    key={report.id}
                    className="p-4 bg-white rounded-xl border border-zinc-200 hover:border-zinc-300 transition-colors cursor-pointer"
                    onClick={() => {
                      setGeneratedReport({
                        reportId: report.id,
                        reportUuid: report.reportUuid,
                        reportCode: report.reportCode,
                        verificationCode: report.contentHash ? `${report.contentHash.slice(0,8).toUpperCase()}-${report.contentHash.slice(-8).toUpperCase()}` : '',
                        contentHash: report.contentHash || '',
                        merkleRoot: report.merkleRoot || '',
                        sealStatus: report.sealStatus,
                        complianceScore: report.complianceScore || 0,
                        indemnificationTier: report.indemnificationTier || '',
                        provenanceAtomCount: 0,
                        attestationCount: 0,
                        generationDurationMs: report.generationDurationMs || 0,
                        record: report,
                      });
                      setVerificationResult(null);
                      setDriftResult(null);
                      setComplianceChecks([]);
                      setComplianceScore(null);
                      setProvenanceEntries([]);
                      setActiveTab('result');
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="text-zinc-400">
                          {DOMAIN_ICONS[report.reportDomain] || <FileText className="w-5 h-5" />}
                        </span>
                        <div>
                          <div className="text-sm font-medium text-zinc-900">{report.reportTitle}</div>
                          <div className="flex items-center gap-2 text-xs text-zinc-500">
                            <span>{report.reportCode}</span>
                            {report.version && <span className="text-zinc-400">v{report.version}</span>}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className={`px-2 py-0.5 text-xs rounded-full border ${
                          report.sealStatus === 'sealed'
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : report.sealStatus === 'revoked'
                            ? 'bg-red-50 text-red-700 border-red-200'
                            : report.sealStatus === 'superseded'
                            ? 'bg-amber-50 text-amber-700 border-amber-200'
                            : 'bg-zinc-50 text-zinc-600 border-zinc-200'
                        }`}>
                          {report.sealStatus}
                        </span>
                        {report.complianceScore && (
                          <span className="text-xs font-bold text-zinc-600">{report.complianceScore}/100</span>
                        )}
                        <ChevronRight className="w-4 h-4 text-zinc-400" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── No Report Placeholder ────────────────────── */}
        {['result', 'provenance', 'compliance'].includes(activeTab) && !generatedReport && (
          <div className="flex flex-col items-center justify-center py-20 text-zinc-400">
            <FileText className="w-12 h-12 mb-3 text-zinc-300" />
            <p className="text-sm">No report generated yet</p>
            <button
              onClick={() => setActiveTab('generate')}
              className="mt-3 text-sm text-indigo-600 hover:text-indigo-700"
            >
              Go to Generate tab
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
