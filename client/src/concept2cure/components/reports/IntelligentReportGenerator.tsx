/**
 * Intelligent Report Generator — Full-screen component
 *
 * Unified report generation UI covering all platform domains with:
 * - Domain/subtype selection across regulatory, clinical, CMC, PV, QM, etc.
 * - Global regulatory body targeting (17 agencies)
 * - Real-time compliance scoring & atom-level provenance
 * - Immutable sealing with cryptographic verification
 * - Quasi-indemnification attestation viewer
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  FileText, Shield, Lock, CheckCircle2, AlertTriangle,
  ChevronRight, Globe2, Atom, Hash, Fingerprint,
  Clock, Building2, ShieldCheck, Eye, Download,
  Layers, BadgeCheck, ScrollText, FileCheck,
  ChevronDown, Search, X, ArrowRight, Zap,
  BookOpen, Scale, Activity, BarChart3,
  FlaskConical, Pill, Microscope, Briefcase,
  ShieldAlert, ClipboardCheck, Brain, Sparkles,
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

  // View state
  const [activeTab, setActiveTab] = useState<'generate' | 'result' | 'provenance' | 'attestations' | 'history'>('generate');
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

        // Load attestations
        const attRes = await fetch(`/api/intelligent-reports/${data.data.reportId}/attestations`);
        const attData = await attRes.json();
        if (attData.success) setAttestations(attData.data);
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

  // ── Render ───────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
      </div>
    );
  }

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

          <div className="flex items-center gap-2">
            {(['generate', 'result', 'provenance', 'attestations', 'history'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                  activeTab === tab
                    ? 'bg-indigo-100 text-indigo-700'
                    : 'text-zinc-500 hover:bg-zinc-100'
                }`}
              >
                {tab === 'generate' ? 'Generate' :
                 tab === 'result' ? 'Report' :
                 tab === 'provenance' ? 'Provenance' :
                 tab === 'attestations' ? 'Attestations' :
                 'History'}
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
                    <div className="text-[10px] text-zinc-500 truncate">{b.country}</div>
                    <div className="text-[10px] text-zinc-400">{b.regulationCount} regs</div>
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
                  <div className={`px-3 py-1 rounded-full text-xs font-bold ${
                    generatedReport.sealStatus === 'sealed'
                      ? 'bg-emerald-500 text-white'
                      : 'bg-white/20 text-white'
                  }`}>
                    {generatedReport.sealStatus === 'sealed' ? 'SEALED' : generatedReport.sealStatus.toUpperCase()}
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
                  <div className="text-xs text-zinc-500 mb-0.5">Attestations</div>
                  <div className="text-sm font-bold text-amber-600">{generatedReport.attestationCount}</div>
                </div>
              </div>

              {/* Cryptographic Details */}
              <div className="border-t border-zinc-100 px-6 py-4 bg-zinc-50">
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

            {/* Verification & Seal Actions */}
            <div className="flex gap-4">
              <button
                onClick={handleVerify}
                className="flex items-center gap-2 px-4 py-2.5 border border-zinc-300 rounded-xl text-sm font-medium text-zinc-700 hover:bg-zinc-50 transition-colors"
              >
                <Fingerprint className="w-4 h-4" />
                Verify Integrity
              </button>

              {generatedReport.sealStatus !== 'sealed' && (
                <div className="flex items-center gap-2 flex-1">
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
                    {sealing ? 'Sealing...' : 'Seal Report'}
                  </button>
                </div>
              )}
            </div>

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
                    <span className={verificationResult.contentHashValid ? 'text-emerald-600' : 'text-red-600'}>
                      {verificationResult.contentHashValid ? 'Valid' : 'MISMATCH'}
                    </span>
                  </div>
                  <div className="text-xs">
                    <span className="text-zinc-500">Merkle Root:</span>{' '}
                    <span className={verificationResult.merkleRootValid ? 'text-emerald-600' : 'text-red-600'}>
                      {verificationResult.merkleRootValid ? 'Valid' : 'MISMATCH'}
                    </span>
                  </div>
                  <div className="text-xs">
                    <span className="text-zinc-500">Seal Chain:</span>{' '}
                    <span className={verificationResult.chainIntact ? 'text-emerald-600' : 'text-red-600'}>
                      {verificationResult.chainIntact ? 'Intact' : 'BROKEN'}
                    </span>
                  </div>
                  <div className="text-xs">
                    <span className="text-zinc-500">Provenance Drift:</span>{' '}
                    <span className={verificationResult.provenanceDrift.drifted === 0 ? 'text-emerald-600' : 'text-amber-600'}>
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

            {/* Report Sections Preview */}
            {generatedReport.record.sections && (
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-zinc-700">Report Sections</h3>
                {(generatedReport.record.sections as any[]).map((section: any, idx: number) => (
                  <div key={idx} className="p-4 bg-white rounded-xl border border-zinc-200">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-zinc-900">{section.title}</span>
                      <span className="text-xs text-zinc-400">
                        {section.atomRefCount} atoms
                      </span>
                    </div>
                    {section.complianceNotes?.length > 0 && (
                      <div className="text-xs text-zinc-500">
                        {section.complianceNotes.map((note: string, ni: number) => (
                          <span key={ni} className="inline-flex items-center gap-1 mr-3">
                            <ShieldCheck className="w-3 h-3 text-emerald-500" />
                            {note}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
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
          <div className="max-w-5xl mx-auto p-6">
            <div className="flex items-center gap-2 mb-4">
              <Atom className="w-5 h-5 text-purple-600" />
              <h3 className="text-sm font-semibold text-zinc-700">Atom-Level Provenance Chain</h3>
              <span className="text-xs text-zinc-400">
                Every data point traced to its source record
              </span>
            </div>

            {generatedReport.provenanceAtomCount === 0 ? (
              <div className="text-center py-12 text-zinc-400 text-sm">
                No atom-level provenance entries for this report.
                <br />
                <span className="text-xs">Provenance atoms are generated when report sections reference specific source data records.</span>
              </div>
            ) : (
              <div className="text-center py-12 text-zinc-400 text-sm">
                <Atom className="w-8 h-8 mx-auto mb-2 text-purple-300" />
                {generatedReport.provenanceAtomCount} provenance atoms recorded.
                <br />
                <span className="text-xs">Each atom traces a data point from the report back to its source table, record, and field.</span>
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
                      <div className={`w-2 h-2 rounded-full ${
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
                          <div className="text-xs text-zinc-500">{report.reportCode}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className={`px-2 py-0.5 text-xs rounded-full border ${
                          report.sealStatus === 'sealed'
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
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
        {(activeTab === 'result' || activeTab === 'provenance') && !generatedReport && (
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
