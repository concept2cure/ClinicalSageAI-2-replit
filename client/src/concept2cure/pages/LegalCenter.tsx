/**
 * Legal Center
 *
 * A comprehensive legal operations module for life sciences regulatory teams.
 * Covers IP portfolio management, contract tracking, regulatory law references,
 * compliance monitoring, and legal risk management across global jurisdictions.
 */

import React, { useState, useMemo, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Search,
  Filter,
  Plus,
  Download,
  X,
  Shield,
  FileText,
  Scale,
  AlertTriangle,
  Calendar,
  ChevronDown,
  Clock,
  CheckCircle2,
  XCircle,
  ArrowUpRight,
  BookOpen,
  Building2,
  Globe,
  Lock,
  Eye,
  Fingerprint,
  TrendingUp,
  Users,
  Briefcase,
  MapPin,
  BarChart3,
  Layers,
  Target,
  Zap,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type TabId = 'ip-portfolio' | 'contracts' | 'regulatory-law' | 'compliance' | 'risk-register';
type StatusType = 'Active' | 'Pending' | 'Expired' | 'At Risk' | 'Draft' | 'Granted' | 'Filed' | 'Resolved' | 'Open' | 'In Review' | 'Executed' | 'Under Negotiation';
type RiskLevel = 'Critical' | 'High' | 'Medium' | 'Low';

interface TabDef {
  id: TabId;
  label: string;
  icon: React.ReactNode;
  count: number;
}

interface Patent {
  id: string;
  title: string;
  patentNumber: string;
  jurisdiction: string;
  status: StatusType;
  filingDate: string;
  expirationDate: string;
  inventors: string[];
  category: string;
  ftoStatus: 'Clear' | 'Review Needed' | 'Blocked';
  relatedCompounds: string[];
}

interface Contract {
  id: string;
  title: string;
  counterparty: string;
  type: string;
  status: StatusType;
  effectiveDate: string;
  expirationDate: string;
  value: string;
  milestones: { name: string; dueDate: string; status: StatusType }[];
  owner: string;
}

interface RegulatoryLawRef {
  id: string;
  title: string;
  authority: string;
  type: string;
  publicationDate: string;
  effectiveDate: string;
  status: StatusType;
  impactAreas: string[];
  summary: string;
  citation: string;
}

interface ComplianceItem {
  id: string;
  framework: string;
  requirement: string;
  status: StatusType;
  lastAuditDate: string;
  nextAuditDate: string;
  findings: number;
  capaCount: number;
  owner: string;
  riskLevel: RiskLevel;
}

interface RiskEntry {
  id: string;
  title: string;
  category: string;
  likelihood: number; // 1-5
  impact: number; // 1-5
  riskScore: number;
  status: StatusType;
  owner: string;
  mitigationPlan: string;
  stakeholders: string[];
  lastReview: string;
}

// ---------------------------------------------------------------------------
// Mock Data
// ---------------------------------------------------------------------------

// Patents data fetched via useQuery in IPPortfolioPanel

const MOCK_CONTRACTS: Contract[] = [
  {
    id: 'CTR-001',
    title: 'Master Clinical Services Agreement',
    counterparty: 'Parexel International',
    type: 'CRO Agreement',
    status: 'Active',
    effectiveDate: '2024-01-15',
    expirationDate: '2027-01-15',
    value: '$42.5M',
    milestones: [
      { name: 'Phase 2 enrollment complete', dueDate: '2026-06-30', status: 'Pending' },
      { name: 'Interim analysis delivery', dueDate: '2026-09-15', status: 'Pending' },
    ],
    owner: 'Jennifer Walsh, VP Legal',
  },
  {
    id: 'CTR-002',
    title: 'Exclusive License Agreement — Anti-CD47 Platform',
    counterparty: 'Stanford University OTL',
    type: 'License Agreement',
    status: 'Active',
    effectiveDate: '2022-06-01',
    expirationDate: '2042-06-01',
    value: '$8M upfront + royalties',
    milestones: [
      { name: 'IND filing milestone', dueDate: '2025-12-31', status: 'Active' },
      { name: 'Phase 1 dosing milestone', dueDate: '2026-06-30', status: 'Pending' },
    ],
    owner: 'Robert Kim, General Counsel',
  },
  {
    id: 'CTR-003',
    title: 'API Manufacturing Supply Agreement',
    counterparty: 'Lonza Group AG',
    type: 'CMO Agreement',
    status: 'Active',
    effectiveDate: '2023-03-01',
    expirationDate: '2028-02-28',
    value: '$67.2M',
    milestones: [
      { name: 'Process validation complete', dueDate: '2026-03-31', status: 'Active' },
      { name: 'Commercial scale-up', dueDate: '2027-01-15', status: 'Pending' },
    ],
    owner: 'Jennifer Walsh, VP Legal',
  },
  {
    id: 'CTR-004',
    title: 'Mutual CDA — Collaboration Evaluation',
    counterparty: 'Roche/Genentech',
    type: 'CDA/NDA',
    status: 'Expired',
    effectiveDate: '2024-08-01',
    expirationDate: '2025-08-01',
    value: 'N/A',
    milestones: [],
    owner: 'Lisa Tran, Associate Counsel',
  },
  {
    id: 'CTR-005',
    title: 'Co-Development and Commercialization Agreement',
    counterparty: 'AstraZeneca PLC',
    type: 'Collaboration Agreement',
    status: 'Under Negotiation',
    effectiveDate: '—',
    expirationDate: '—',
    value: '$250M+ potential',
    milestones: [
      { name: 'Term sheet finalization', dueDate: '2026-04-15', status: 'Active' },
      { name: 'Board approval', dueDate: '2026-05-30', status: 'Pending' },
    ],
    owner: 'Robert Kim, General Counsel',
  },
  {
    id: 'CTR-006',
    title: 'Data Processing Agreement — Clinical EDC',
    counterparty: 'Medidata Solutions',
    type: 'Technology Agreement',
    status: 'Active',
    effectiveDate: '2024-04-01',
    expirationDate: '2027-03-31',
    value: '$1.8M',
    milestones: [],
    owner: 'Lisa Tran, Associate Counsel',
  },
  {
    id: 'CTR-007',
    title: 'Site License Agreement — Phase 2 Trial',
    counterparty: 'Massachusetts General Hospital',
    type: 'Clinical Site Agreement',
    status: 'Executed',
    effectiveDate: '2025-09-01',
    expirationDate: '2028-08-31',
    value: '$3.4M',
    milestones: [
      { name: 'IRB approval', dueDate: '2025-11-15', status: 'Active' },
    ],
    owner: 'Lisa Tran, Associate Counsel',
  },
];

const MOCK_REGULATORY_LAW: RegulatoryLawRef[] = [
  {
    id: 'REG-001',
    title: 'FDA Guidance: Adaptive Designs for Clinical Trials of Drugs and Biologics',
    authority: 'FDA (CDER/CBER)',
    type: 'Guidance Document',
    publicationDate: '2019-11-01',
    effectiveDate: '2019-12-01',
    status: 'Active',
    impactAreas: ['Clinical Development', 'Biostatistics'],
    summary: 'Provides recommendations on adaptive clinical trial designs including sample size re-estimation, response-adaptive randomization, and seamless phase 2/3 designs.',
    citation: 'FDA-2018-D-3124',
  },
  {
    id: 'REG-002',
    title: 'EU Clinical Trials Regulation (CTR) No 536/2014',
    authority: 'EMA',
    type: 'Regulation',
    publicationDate: '2014-05-27',
    effectiveDate: '2022-01-31',
    status: 'Active',
    impactAreas: ['Clinical Operations', 'Regulatory Submissions', 'Pharmacovigilance'],
    summary: 'Establishes harmonized rules for the conduct of clinical trials across EU member states via the Clinical Trials Information System (CTIS).',
    citation: 'Regulation (EU) No 536/2014',
  },
  {
    id: 'REG-003',
    title: 'ICH E6(R3) Good Clinical Practice — Draft',
    authority: 'ICH',
    type: 'Guideline',
    publicationDate: '2023-05-19',
    effectiveDate: '—',
    status: 'Draft',
    impactAreas: ['Clinical Operations', 'Quality Assurance', 'Data Management'],
    summary: 'Modernized GCP principles incorporating risk-based approaches, technology-enabled processes, and decentralized trial elements.',
    citation: 'ICH E6(R3) Step 2',
  },
  {
    id: 'REG-004',
    title: 'FDA Warning Letter — cGMP Violations at Contract Manufacturer',
    authority: 'FDA (ORA)',
    type: 'Enforcement Action',
    publicationDate: '2025-11-14',
    effectiveDate: '2025-11-14',
    status: 'Active',
    impactAreas: ['Manufacturing', 'Quality Systems', 'Supply Chain'],
    summary: 'Warning letter issued to a contract manufacturer citing failures in process validation, environmental monitoring, and data integrity practices.',
    citation: 'WL 320-26-04',
  },
  {
    id: 'REG-005',
    title: 'PMDA Notification: Electronic Data Submission Requirements',
    authority: 'PMDA',
    type: 'Notification',
    publicationDate: '2025-04-01',
    effectiveDate: '2026-04-01',
    status: 'Pending',
    impactAreas: ['Regulatory Submissions', 'Data Management'],
    summary: 'Updated requirements for electronic common technical document (eCTD) submissions to PMDA including new module specifications.',
    citation: 'PMDA-2025-N-0042',
  },
  {
    id: 'REG-006',
    title: 'FDA Draft Guidance: AI/ML-Enabled Drug Development Tools',
    authority: 'FDA (CDER)',
    type: 'Guidance Document',
    publicationDate: '2025-09-15',
    effectiveDate: '—',
    status: 'Draft',
    impactAreas: ['Clinical Development', 'Data Science', 'Regulatory Strategy'],
    summary: 'Framework for evaluating artificial intelligence and machine learning tools used in drug development, including model validation and transparency requirements.',
    citation: 'FDA-2025-D-1847',
  },
  {
    id: 'REG-007',
    title: '21 CFR Part 11 — Electronic Records; Electronic Signatures',
    authority: 'FDA',
    type: 'Regulation',
    publicationDate: '1997-03-20',
    effectiveDate: '1997-08-20',
    status: 'Active',
    impactAreas: ['IT Systems', 'Quality Assurance', 'Data Management'],
    summary: 'Establishes requirements for electronic records and signatures to be considered trustworthy, reliable, and equivalent to paper records.',
    citation: '21 CFR Part 11',
  },
];

// Compliance data fetched via useQuery in CompliancePanel

const MOCK_RISKS: RiskEntry[] = [
  {
    id: 'RSK-001',
    title: 'Freedom-to-Operate Risk — CSA-410 Kinase Inhibitor',
    category: 'IP / Patent',
    likelihood: 4,
    impact: 5,
    riskScore: 20,
    status: 'Open',
    owner: 'Robert Kim, General Counsel',
    mitigationPlan: 'Engage outside patent counsel for invalidity analysis; prepare design-around strategy for backup compound.',
    stakeholders: ['R&D', 'Legal', 'BD&L', 'Executive Team'],
    lastReview: '2026-02-28',
  },
  {
    id: 'RSK-002',
    title: 'CMO Supply Chain Disruption — Lonza Capacity Constraints',
    category: 'Contract / Supply',
    likelihood: 3,
    impact: 4,
    riskScore: 12,
    status: 'Active',
    owner: 'Jennifer Walsh, VP Legal',
    mitigationPlan: 'Negotiate capacity reservation clause; qualify secondary CMO (Samsung Biologics) by Q3 2026.',
    stakeholders: ['CMC', 'Supply Chain', 'Legal', 'Clinical Ops'],
    lastReview: '2026-03-01',
  },
  {
    id: 'RSK-003',
    title: 'GDPR Non-Compliance — Patient Consent Workflow Gap',
    category: 'Regulatory / Privacy',
    likelihood: 2,
    impact: 4,
    riskScore: 8,
    status: 'Active',
    owner: 'Maria Santos, DPO',
    mitigationPlan: 'Implement granular consent management platform; update ICFs across EU sites by Q2 2026.',
    stakeholders: ['Clinical Ops', 'IT', 'Legal', 'DPO'],
    lastReview: '2026-02-15',
  },
  {
    id: 'RSK-004',
    title: 'AstraZeneca Deal Structure — Unfavorable Opt-In Terms',
    category: 'Business / Commercial',
    likelihood: 3,
    impact: 5,
    riskScore: 15,
    status: 'Open',
    owner: 'Robert Kim, General Counsel',
    mitigationPlan: 'Retain investment bank advisory on comparable deal benchmarks; establish walk-away thresholds with Board.',
    stakeholders: ['BD&L', 'Legal', 'Finance', 'Board'],
    lastReview: '2026-03-10',
  },
  {
    id: 'RSK-005',
    title: 'FDA Complete Response Letter — Insufficient CMC Data',
    category: 'Regulatory',
    likelihood: 2,
    impact: 5,
    riskScore: 10,
    status: 'Active',
    owner: 'Angela Foster, QA Director',
    mitigationPlan: 'Conduct pre-submission meeting (Type B); engage former FDA reviewer as consultant for CMC strategy.',
    stakeholders: ['Regulatory', 'CMC', 'QA', 'Executive Team'],
    lastReview: '2026-03-05',
  },
  {
    id: 'RSK-006',
    title: 'Clinical Site Non-Compliance — GCP Inspection Findings',
    category: 'Clinical / Quality',
    likelihood: 3,
    impact: 3,
    riskScore: 9,
    status: 'Active',
    owner: 'Angela Foster, QA Director',
    mitigationPlan: 'Increase triggered monitoring visits; implement centralized statistical monitoring for data anomalies.',
    stakeholders: ['Clinical Ops', 'QA', 'Medical Affairs'],
    lastReview: '2026-02-20',
  },
  {
    id: 'RSK-007',
    title: 'Key Person Dependency — Lead CMC Scientist Departure',
    category: 'Operational',
    likelihood: 2,
    impact: 3,
    riskScore: 6,
    status: 'Resolved',
    owner: 'HR / Legal',
    mitigationPlan: 'Cross-training program completed; knowledge transfer documentation finalized.',
    stakeholders: ['HR', 'CMC', 'R&D'],
    lastReview: '2026-01-15',
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function statusColor(status: StatusType): string {
  switch (status) {
    case 'Active':
    case 'Granted':
    case 'Executed':
      return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    case 'Pending':
    case 'Filed':
    case 'Under Negotiation':
    case 'In Review':
      return 'bg-amber-50 text-amber-700 border-amber-200';
    case 'Expired':
    case 'Resolved':
      return 'bg-zinc-100 text-zinc-500 border-zinc-200';
    case 'At Risk':
      return 'bg-red-50 text-red-700 border-red-200';
    case 'Draft':
      return 'bg-blue-50 text-blue-700 border-blue-200';
    case 'Open':
      return 'bg-violet-50 text-violet-700 border-violet-200';
    default:
      return 'bg-zinc-100 text-zinc-600 border-zinc-200';
  }
}

function riskLevelColor(level: RiskLevel): string {
  switch (level) {
    case 'Critical':
      return 'bg-red-50 text-red-700 border-red-200';
    case 'High':
      return 'bg-orange-50 text-orange-700 border-orange-200';
    case 'Medium':
      return 'bg-amber-50 text-amber-700 border-amber-200';
    case 'Low':
      return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  }
}

function ftoColor(fto: Patent['ftoStatus']): string {
  switch (fto) {
    case 'Clear':
      return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    case 'Review Needed':
      return 'bg-amber-50 text-amber-700 border-amber-200';
    case 'Blocked':
      return 'bg-red-50 text-red-700 border-red-200';
  }
}

function heatmapCell(likelihood: number, impact: number): string {
  const score = likelihood * impact;
  if (score >= 15) return 'bg-red-500 text-white';
  if (score >= 10) return 'bg-orange-400 text-white';
  if (score >= 6) return 'bg-amber-300 text-zinc-900';
  if (score >= 3) return 'bg-yellow-200 text-zinc-900';
  return 'bg-emerald-200 text-zinc-900';
}

function formatDate(iso: string): string {
  if (iso === '—') return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

const Badge: React.FC<{ label: string; className?: string }> = ({ label, className }) => (
  <span
    className={cn(
      'inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium',
      className,
    )}
  >
    {label}
  </span>
);

const TabButton: React.FC<{
  tab: TabDef;
  active: boolean;
  onClick: () => void;
}> = ({ tab, active, onClick }) => (
  <button
    onClick={onClick}
    className={cn(
      'flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors whitespace-nowrap',
      active
        ? 'bg-zinc-900 text-white'
        : 'text-zinc-500 hover:text-zinc-700 hover:bg-zinc-100',
    )}
  >
    {tab.icon}
    {tab.label}
    <span
      className={cn(
        'ml-1 text-xs rounded-full px-1.5 py-0.5 min-w-[20px] text-center',
        active ? 'bg-zinc-700 text-zinc-200' : 'bg-zinc-100 text-zinc-500',
      )}
    >
      {tab.count}
    </span>
  </button>
);

const SectionHeader: React.FC<{
  title: string;
  subtitle: string;
  searchValue: string;
  onSearchChange: (v: string) => void;
  onAdd?: () => void;
  onExport?: () => void;
  filterOpen: boolean;
  onToggleFilter: () => void;
}> = ({ title, subtitle, searchValue, onSearchChange, onAdd, onExport, filterOpen, onToggleFilter }) => (
  <div className="space-y-3">
    <div className="flex items-start justify-between">
      <div>
        <h2 className="text-lg font-semibold text-zinc-900">{title}</h2>
        <p className="text-sm text-zinc-500 mt-0.5">{subtitle}</p>
      </div>
      <div className="flex items-center gap-2">
        {onAdd && (
          <button
            onClick={onAdd}
            className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800 transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            Add
          </button>
        )}
        {onExport && (
          <button
            onClick={onExport}
            className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 transition-colors"
          >
            <Download className="h-3.5 w-3.5" />
            Export
          </button>
        )}
        <button
          onClick={onToggleFilter}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors',
            filterOpen
              ? 'border-blue-200 bg-blue-50 text-blue-700'
              : 'border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50',
          )}
        >
          <Filter className="h-3.5 w-3.5" />
          Filter
        </button>
      </div>
    </div>
    <div className="relative">
      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
      <input
        type="text"
        value={searchValue}
        onChange={(e) => onSearchChange(e.target.value)}
        placeholder={`Search ${title.toLowerCase()}...`}
        className="w-full rounded-lg border border-zinc-200 bg-white py-2 pl-10 pr-4 text-sm text-zinc-900 placeholder-zinc-400 outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100 transition-all"
      />
    </div>
  </div>
);

// ---------------------------------------------------------------------------
// Tab Panels
// ---------------------------------------------------------------------------

const IPPortfolioPanel: React.FC<{ search: string }> = ({ search }) => {
  const { data: patents = [], isLoading: patentsLoading } = useQuery<Patent[]>({
    queryKey: ['concept2cure', 'patents'],
    queryFn: async () => {
      const res = await fetch('/api/concept2cure/patents');
      if (!res.ok) throw new Error('Failed to fetch patents');
      return res.json();
    },
  });

  const filtered = useMemo(
    () =>
      patents.filter(
        (p) =>
          p.title.toLowerCase().includes(search.toLowerCase()) ||
          p.patentNumber.toLowerCase().includes(search.toLowerCase()) ||
          p.category.toLowerCase().includes(search.toLowerCase()),
      ),
    [search, patents],
  );

  const stats = useMemo(() => {
    const granted = patents.filter((p) => p.status === 'Granted').length;
    const pending = patents.filter((p) => p.status === 'Pending' || p.status === 'Filed').length;
    const blocked = patents.filter((p) => p.ftoStatus === 'Blocked').length;
    return { granted, pending, blocked, total: patents.length };
  }, [patents]);

  if (patentsLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="text-sm text-zinc-400">Loading patent portfolio...</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Stats row */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: 'Total Patents', value: stats.total, icon: <Layers className="h-4 w-4 text-blue-500" /> },
          { label: 'Granted', value: stats.granted, icon: <CheckCircle2 className="h-4 w-4 text-emerald-500" /> },
          { label: 'Pending / Filed', value: stats.pending, icon: <Clock className="h-4 w-4 text-amber-500" /> },
          { label: 'FTO Blocked', value: stats.blocked, icon: <XCircle className="h-4 w-4 text-red-500" /> },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border border-zinc-100 bg-white p-4 flex items-center gap-3">
            <div className="rounded-lg bg-zinc-50 p-2">{s.icon}</div>
            <div>
              <p className="text-2xl font-semibold text-zinc-900">{s.value}</p>
              <p className="text-xs text-zinc-500">{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Patent cards */}
      <div className="space-y-3">
        {filtered.map((patent) => (
          <div
            key={patent.id}
            className="rounded-xl border border-zinc-100 bg-white p-5 hover:border-zinc-200 transition-colors"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-mono text-zinc-400">{patent.id}</span>
                  <Badge label={patent.status} className={statusColor(patent.status)} />
                  <Badge label={`FTO: ${patent.ftoStatus}`} className={ftoColor(patent.ftoStatus)} />
                </div>
                <h3 className="text-sm font-semibold text-zinc-900 mb-1">{patent.title}</h3>
                <p className="text-xs text-zinc-500 font-mono">{patent.patentNumber}</p>
              </div>
              <button className="rounded-lg border border-zinc-200 p-1.5 text-zinc-400 hover:text-zinc-600 hover:bg-zinc-50 transition-colors">
                <ArrowUpRight className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-zinc-500">
              <span className="flex items-center gap-1">
                <Globe className="h-3 w-3" />
                {patent.jurisdiction}
              </span>
              <span className="flex items-center gap-1">
                <Layers className="h-3 w-3" />
                {patent.category}
              </span>
              <span className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                Filed {formatDate(patent.filingDate)}
              </span>
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                Expires {formatDate(patent.expirationDate)}
              </span>
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {patent.relatedCompounds.map((c) => (
                <span key={c} className="rounded-md bg-violet-50 border border-violet-200 px-2 py-0.5 text-xs font-medium text-violet-700">
                  {c}
                </span>
              ))}
              {patent.inventors.map((inv) => (
                <span key={inv} className="rounded-md bg-zinc-50 border border-zinc-200 px-2 py-0.5 text-xs text-zinc-600">
                  {inv}
                </span>
              ))}
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="rounded-xl border border-zinc-100 bg-white p-12 text-center">
            <p className="text-sm text-zinc-400">No patents match your search.</p>
          </div>
        )}
      </div>
    </div>
  );
};

const ContractsPanel: React.FC<{ search: string }> = ({ search }) => {
  const filtered = useMemo(
    () =>
      MOCK_CONTRACTS.filter(
        (c) =>
          c.title.toLowerCase().includes(search.toLowerCase()) ||
          c.counterparty.toLowerCase().includes(search.toLowerCase()) ||
          c.type.toLowerCase().includes(search.toLowerCase()),
      ),
    [search],
  );

  return (
    <div className="space-y-3">
      {filtered.map((contract) => (
        <div
          key={contract.id}
          className="rounded-xl border border-zinc-100 bg-white p-5 hover:border-zinc-200 transition-colors"
        >
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-mono text-zinc-400">{contract.id}</span>
                <Badge label={contract.status} className={statusColor(contract.status)} />
                <Badge label={contract.type} className="bg-zinc-50 text-zinc-600 border-zinc-200" />
              </div>
              <h3 className="text-sm font-semibold text-zinc-900 mb-1">{contract.title}</h3>
              <div className="flex items-center gap-1 text-xs text-zinc-500">
                <Building2 className="h-3 w-3" />
                {contract.counterparty}
              </div>
            </div>
            <div className="text-right shrink-0">
              <p className="text-sm font-semibold text-zinc-900">{contract.value}</p>
              <p className="text-xs text-zinc-400 mt-0.5">{contract.owner}</p>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-zinc-500">
            <span className="flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              Effective {formatDate(contract.effectiveDate)}
            </span>
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              Expires {formatDate(contract.expirationDate)}
            </span>
          </div>
          {contract.milestones.length > 0 && (
            <div className="mt-3 border-t border-zinc-50 pt-3">
              <p className="text-xs font-medium text-zinc-500 mb-2">Milestones</p>
              <div className="space-y-1.5">
                {contract.milestones.map((m, i) => (
                  <div key={i} className="flex items-center justify-between text-xs">
                    <span className="text-zinc-700">{m.name}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-zinc-400">{formatDate(m.dueDate)}</span>
                      <Badge label={m.status} className={statusColor(m.status)} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ))}
      {filtered.length === 0 && (
        <div className="rounded-xl border border-zinc-100 bg-white p-12 text-center">
          <p className="text-sm text-zinc-400">No contracts match your search.</p>
        </div>
      )}
    </div>
  );
};

const RegulatoryLawPanel: React.FC<{ search: string }> = ({ search }) => {
  const filtered = useMemo(
    () =>
      MOCK_REGULATORY_LAW.filter(
        (r) =>
          r.title.toLowerCase().includes(search.toLowerCase()) ||
          r.authority.toLowerCase().includes(search.toLowerCase()) ||
          r.citation.toLowerCase().includes(search.toLowerCase()),
      ),
    [search],
  );

  return (
    <div className="space-y-3">
      {filtered.map((ref) => (
        <div
          key={ref.id}
          className="rounded-xl border border-zinc-100 bg-white p-5 hover:border-zinc-200 transition-colors"
        >
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-mono text-zinc-400">{ref.id}</span>
                <Badge label={ref.status} className={statusColor(ref.status)} />
                <Badge label={ref.type} className="bg-zinc-50 text-zinc-600 border-zinc-200" />
              </div>
              <h3 className="text-sm font-semibold text-zinc-900 mb-1">{ref.title}</h3>
              <p className="text-xs text-zinc-500 mt-1 leading-relaxed">{ref.summary}</p>
            </div>
            <button className="rounded-lg border border-zinc-200 p-1.5 text-zinc-400 hover:text-zinc-600 hover:bg-zinc-50 transition-colors shrink-0">
              <BookOpen className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-zinc-500">
            <span className="flex items-center gap-1">
              <Building2 className="h-3 w-3" />
              {ref.authority}
            </span>
            <span className="flex items-center gap-1">
              <FileText className="h-3 w-3" />
              {ref.citation}
            </span>
            <span className="flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              Published {formatDate(ref.publicationDate)}
            </span>
            {ref.effectiveDate !== '—' && (
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                Effective {formatDate(ref.effectiveDate)}
              </span>
            )}
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {ref.impactAreas.map((area) => (
              <span key={area} className="rounded-md bg-blue-50 border border-blue-200 px-2 py-0.5 text-xs font-medium text-blue-700">
                {area}
              </span>
            ))}
          </div>
        </div>
      ))}
      {filtered.length === 0 && (
        <div className="rounded-xl border border-zinc-100 bg-white p-12 text-center">
          <p className="text-sm text-zinc-400">No regulatory references match your search.</p>
        </div>
      )}
    </div>
  );
};

const CompliancePanel: React.FC<{ search: string }> = ({ search }) => {
  const { data: complianceItems = [], isLoading: complianceLoading } = useQuery<ComplianceItem[]>({
    queryKey: ['concept2cure', 'compliance'],
    queryFn: async () => {
      const res = await fetch('/api/concept2cure/compliance');
      if (!res.ok) throw new Error('Failed to fetch compliance data');
      return res.json();
    },
  });

  const filtered = useMemo(
    () =>
      complianceItems.filter(
        (c) =>
          c.framework.toLowerCase().includes(search.toLowerCase()) ||
          c.requirement.toLowerCase().includes(search.toLowerCase()) ||
          c.owner.toLowerCase().includes(search.toLowerCase()),
      ),
    [search, complianceItems],
  );

  const stats = useMemo(() => {
    const totalFindings = complianceItems.reduce((sum, c) => sum + c.findings, 0);
    const totalCapa = complianceItems.reduce((sum, c) => sum + c.capaCount, 0);
    const atRisk = complianceItems.filter((c) => c.riskLevel === 'High' || c.riskLevel === 'Critical').length;
    return { totalFindings, totalCapa, atRisk, frameworks: complianceItems.length };
  }, [complianceItems]);

  if (complianceLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="text-sm text-zinc-400">Loading compliance data...</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Stats row */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: 'Frameworks Tracked', value: stats.frameworks, icon: <Shield className="h-4 w-4 text-blue-500" /> },
          { label: 'Open Findings', value: stats.totalFindings, icon: <Eye className="h-4 w-4 text-amber-500" /> },
          { label: 'Active CAPAs', value: stats.totalCapa, icon: <Target className="h-4 w-4 text-violet-500" /> },
          { label: 'High Risk Items', value: stats.atRisk, icon: <AlertTriangle className="h-4 w-4 text-red-500" /> },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border border-zinc-100 bg-white p-4 flex items-center gap-3">
            <div className="rounded-lg bg-zinc-50 p-2">{s.icon}</div>
            <div>
              <p className="text-2xl font-semibold text-zinc-900">{s.value}</p>
              <p className="text-xs text-zinc-500">{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Compliance cards */}
      <div className="space-y-3">
        {filtered.map((item) => (
          <div
            key={item.id}
            className="rounded-xl border border-zinc-100 bg-white p-5 hover:border-zinc-200 transition-colors"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-mono text-zinc-400">{item.id}</span>
                  <Badge label={item.status} className={statusColor(item.status)} />
                  <Badge label={item.riskLevel} className={riskLevelColor(item.riskLevel)} />
                </div>
                <h3 className="text-sm font-semibold text-zinc-900 mb-0.5">{item.framework}</h3>
                <p className="text-xs text-zinc-500">{item.requirement}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-xs text-zinc-400">{item.owner}</p>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-zinc-500">
              <span className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                Last audit: {formatDate(item.lastAuditDate)}
              </span>
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                Next audit: {formatDate(item.nextAuditDate)}
              </span>
              <span className="flex items-center gap-1">
                <Eye className="h-3 w-3" />
                {item.findings} finding{item.findings !== 1 ? 's' : ''}
              </span>
              <span className="flex items-center gap-1">
                <Target className="h-3 w-3" />
                {item.capaCount} CAPA{item.capaCount !== 1 ? 's' : ''}
              </span>
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="rounded-xl border border-zinc-100 bg-white p-12 text-center">
            <p className="text-sm text-zinc-400">No compliance items match your search.</p>
          </div>
        )}
      </div>
    </div>
  );
};

const RiskRegisterPanel: React.FC<{ search: string }> = ({ search }) => {
  const filtered = useMemo(
    () =>
      MOCK_RISKS.filter(
        (r) =>
          r.title.toLowerCase().includes(search.toLowerCase()) ||
          r.category.toLowerCase().includes(search.toLowerCase()) ||
          r.owner.toLowerCase().includes(search.toLowerCase()),
      ),
    [search],
  );

  // Build heat map data
  const heatmapData = useMemo(() => {
    const grid: { [key: string]: RiskEntry[] } = {};
    MOCK_RISKS.forEach((r) => {
      const key = `${r.likelihood}-${r.impact}`;
      if (!grid[key]) grid[key] = [];
      grid[key].push(r);
    });
    return grid;
  }, []);

  return (
    <div className="space-y-4">
      {/* Risk Heat Map */}
      <div className="rounded-xl border border-zinc-100 bg-white p-5">
        <h3 className="text-sm font-semibold text-zinc-900 mb-4 flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-zinc-400" />
          Risk Heat Map
        </h3>
        <div className="flex gap-4">
          {/* Y-axis label */}
          <div className="flex flex-col items-center justify-center">
            <span className="text-xs text-zinc-400 [writing-mode:vertical-lr] rotate-180 tracking-wider">
              LIKELIHOOD
            </span>
          </div>
          <div className="flex-1">
            <div className="grid grid-cols-6 gap-1">
              {/* Header row */}
              <div />
              {[1, 2, 3, 4, 5].map((impact) => (
                <div key={`h-${impact}`} className="text-center text-xs text-zinc-400 py-1">
                  {impact}
                </div>
              ))}
              {/* Grid rows (likelihood 5 down to 1) */}
              {[5, 4, 3, 2, 1].map((likelihood) => (
                <React.Fragment key={`row-${likelihood}`}>
                  <div className="flex items-center justify-center text-xs text-zinc-400">
                    {likelihood}
                  </div>
                  {[1, 2, 3, 4, 5].map((impact) => {
                    const key = `${likelihood}-${impact}`;
                    const risks = heatmapData[key] || [];
                    return (
                      <div
                        key={key}
                        className={cn(
                          'rounded-lg h-12 flex items-center justify-center text-xs font-semibold transition-all',
                          risks.length > 0 ? heatmapCell(likelihood, impact) : 'bg-zinc-50',
                        )}
                        title={risks.map((r) => r.title).join('\n')}
                      >
                        {risks.length > 0 ? risks.length : ''}
                      </div>
                    );
                  })}
                </React.Fragment>
              ))}
            </div>
            {/* X-axis label */}
            <div className="text-center mt-2">
              <span className="text-xs text-zinc-400 tracking-wider">IMPACT</span>
            </div>
          </div>
        </div>
      </div>

      {/* Risk cards */}
      <div className="space-y-3">
        {filtered.map((risk) => (
          <div
            key={risk.id}
            className="rounded-xl border border-zinc-100 bg-white p-5 hover:border-zinc-200 transition-colors"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-mono text-zinc-400">{risk.id}</span>
                  <Badge label={risk.status} className={statusColor(risk.status)} />
                  <Badge
                    label={risk.category}
                    className="bg-zinc-50 text-zinc-600 border-zinc-200"
                  />
                  <span
                    className={cn(
                      'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-bold',
                      risk.riskScore >= 15
                        ? 'bg-red-100 text-red-700'
                        : risk.riskScore >= 10
                          ? 'bg-orange-100 text-orange-700'
                          : risk.riskScore >= 6
                            ? 'bg-amber-100 text-amber-700'
                            : 'bg-emerald-100 text-emerald-700',
                    )}
                  >
                    Score: {risk.riskScore}
                  </span>
                </div>
                <h3 className="text-sm font-semibold text-zinc-900 mb-1">{risk.title}</h3>
                <p className="text-xs text-zinc-500 leading-relaxed">{risk.mitigationPlan}</p>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-zinc-500">
              <span className="flex items-center gap-1">
                <Users className="h-3 w-3" />
                {risk.owner}
              </span>
              <span className="flex items-center gap-1">
                <TrendingUp className="h-3 w-3" />
                L:{risk.likelihood} x I:{risk.impact}
              </span>
              <span className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                Last reviewed {formatDate(risk.lastReview)}
              </span>
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {risk.stakeholders.map((s) => (
                <span key={s} className="rounded-md bg-zinc-50 border border-zinc-200 px-2 py-0.5 text-xs text-zinc-600">
                  {s}
                </span>
              ))}
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="rounded-xl border border-zinc-100 bg-white p-12 text-center">
            <p className="text-sm text-zinc-400">No risks match your search.</p>
          </div>
        )}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export const LegalCenter: React.FC<{ onClose?: () => void }> = ({ onClose }) => {
  const [activeTab, setActiveTab] = useState<TabId>('ip-portfolio');
  const [search, setSearch] = useState('');
  const [filterOpen, setFilterOpen] = useState(false);

  const tabs: TabDef[] = useMemo(
    () => [
      { id: 'ip-portfolio', label: 'IP Portfolio', icon: <Fingerprint className="h-4 w-4" />, count: MOCK_PATENTS.length },
      { id: 'contracts', label: 'Contracts', icon: <Briefcase className="h-4 w-4" />, count: MOCK_CONTRACTS.length },
      { id: 'regulatory-law', label: 'Regulatory Law', icon: <Scale className="h-4 w-4" />, count: MOCK_REGULATORY_LAW.length },
      { id: 'compliance', label: 'Compliance', icon: <Shield className="h-4 w-4" />, count: MOCK_COMPLIANCE.length },
      { id: 'risk-register', label: 'Risk Register', icon: <AlertTriangle className="h-4 w-4" />, count: MOCK_RISKS.length },
    ],
    [],
  );

  const tabMeta: Record<TabId, { title: string; subtitle: string }> = {
    'ip-portfolio': {
      title: 'IP Portfolio',
      subtitle: 'Patent filings, FTO analysis, and intellectual property landscape across jurisdictions.',
    },
    contracts: {
      title: 'Contracts',
      subtitle: 'CDA/NDA tracking, licensing, CMO/CRO agreements, and milestone management.',
    },
    'regulatory-law': {
      title: 'Regulatory Law',
      subtitle: 'FDA, EMA, PMDA guidance documents, regulations, and enforcement actions.',
    },
    compliance: {
      title: 'Compliance',
      subtitle: 'GDPR, HIPAA, 21 CFR Part 11, GCP, and anti-bribery compliance monitoring.',
    },
    'risk-register': {
      title: 'Risk Register',
      subtitle: 'Legal risk identification, scoring, mitigation planning, and stakeholder exposure.',
    },
  };

  const handleTabChange = useCallback((id: TabId) => {
    setActiveTab(id);
    setSearch('');
    setFilterOpen(false);
  }, []);

  const meta = tabMeta[activeTab];

  return (
    <div className="flex flex-col h-full bg-zinc-50">
      {/* Top bar */}
      <div className="shrink-0 border-b border-zinc-100 bg-white px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-zinc-900 p-2">
              <Scale className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-base font-semibold text-zinc-900">Legal Center</h1>
              <p className="text-xs text-zinc-500">
                Intellectual property, contracts, regulatory law, compliance & risk
              </p>
            </div>
          </div>
          {onClose && (
            <button
              onClick={onClose}
              className="rounded-lg border border-zinc-200 p-1.5 text-zinc-400 hover:text-zinc-600 hover:bg-zinc-50 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Tabs */}
        <div className="mt-4 flex items-center gap-1 overflow-x-auto pb-0.5">
          {tabs.map((tab) => (
            <TabButton
              key={tab.id}
              tab={tab}
              active={activeTab === tab.id}
              onClick={() => handleTabChange(tab.id)}
            />
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="max-w-5xl mx-auto space-y-6">
          <SectionHeader
            title={meta.title}
            subtitle={meta.subtitle}
            searchValue={search}
            onSearchChange={setSearch}
            onAdd={() => {}}
            onExport={() => {}}
            filterOpen={filterOpen}
            onToggleFilter={() => setFilterOpen(!filterOpen)}
          />

          {/* Filter bar (conditional) */}
          {filterOpen && (
            <div className="rounded-xl border border-zinc-100 bg-white p-4 flex flex-wrap gap-3">
              <div>
                <label className="block text-xs font-medium text-zinc-500 mb-1">Status</label>
                <select className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm text-zinc-700 outline-none focus:border-blue-300">
                  <option>All statuses</option>
                  <option>Active</option>
                  <option>Pending</option>
                  <option>Expired</option>
                  <option>At Risk</option>
                  <option>Draft</option>
                </select>
              </div>
              {activeTab === 'ip-portfolio' && (
                <>
                  <div>
                    <label className="block text-xs font-medium text-zinc-500 mb-1">Jurisdiction</label>
                    <select className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm text-zinc-700 outline-none focus:border-blue-300">
                      <option>All jurisdictions</option>
                      <option>United States</option>
                      <option>European Union</option>
                      <option>Japan</option>
                      <option>PCT</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-zinc-500 mb-1">FTO Status</label>
                    <select className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm text-zinc-700 outline-none focus:border-blue-300">
                      <option>All</option>
                      <option>Clear</option>
                      <option>Review Needed</option>
                      <option>Blocked</option>
                    </select>
                  </div>
                </>
              )}
              {activeTab === 'contracts' && (
                <div>
                  <label className="block text-xs font-medium text-zinc-500 mb-1">Type</label>
                  <select className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm text-zinc-700 outline-none focus:border-blue-300">
                    <option>All types</option>
                    <option>CRO Agreement</option>
                    <option>CMO Agreement</option>
                    <option>License Agreement</option>
                    <option>CDA/NDA</option>
                    <option>Collaboration Agreement</option>
                  </select>
                </div>
              )}
              {activeTab === 'compliance' && (
                <div>
                  <label className="block text-xs font-medium text-zinc-500 mb-1">Risk Level</label>
                  <select className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm text-zinc-700 outline-none focus:border-blue-300">
                    <option>All levels</option>
                    <option>Critical</option>
                    <option>High</option>
                    <option>Medium</option>
                    <option>Low</option>
                  </select>
                </div>
              )}
              {activeTab === 'risk-register' && (
                <div>
                  <label className="block text-xs font-medium text-zinc-500 mb-1">Category</label>
                  <select className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm text-zinc-700 outline-none focus:border-blue-300">
                    <option>All categories</option>
                    <option>IP / Patent</option>
                    <option>Contract / Supply</option>
                    <option>Regulatory / Privacy</option>
                    <option>Business / Commercial</option>
                    <option>Regulatory</option>
                    <option>Clinical / Quality</option>
                    <option>Operational</option>
                  </select>
                </div>
              )}
              {activeTab === 'regulatory-law' && (
                <>
                  <div>
                    <label className="block text-xs font-medium text-zinc-500 mb-1">Authority</label>
                    <select className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm text-zinc-700 outline-none focus:border-blue-300">
                      <option>All authorities</option>
                      <option>FDA</option>
                      <option>EMA</option>
                      <option>PMDA</option>
                      <option>ICH</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-zinc-500 mb-1">Type</label>
                    <select className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm text-zinc-700 outline-none focus:border-blue-300">
                      <option>All types</option>
                      <option>Guidance Document</option>
                      <option>Regulation</option>
                      <option>Guideline</option>
                      <option>Enforcement Action</option>
                      <option>Notification</option>
                    </select>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Tab content */}
          {activeTab === 'ip-portfolio' && <IPPortfolioPanel search={search} />}
          {activeTab === 'contracts' && <ContractsPanel search={search} />}
          {activeTab === 'regulatory-law' && <RegulatoryLawPanel search={search} />}
          {activeTab === 'compliance' && <CompliancePanel search={search} />}
          {activeTab === 'risk-register' && <RiskRegisterPanel search={search} />}
        </div>
      </div>
    </div>
  );
};

export default LegalCenter;
