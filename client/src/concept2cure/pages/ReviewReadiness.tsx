/**
 * @fileoverview Review & Readiness Workspace
 * @module concept2cure/pages/ReviewReadiness
 *
 * Surfaces quality, compliance, stress-testing, and readiness capabilities
 * for the Concept2Cure regulatory platform. Seven sub-views accessible via
 * tab navigation: Quality Center, Compliance, SnowGlobe, Readiness Score,
 * Evidence Confidence, Audit Trail, and Traceability.
 *
 * Design: Claude-style — warm white bg, clean zinc typography, generous whitespace.
 */

import React, { useState, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import {
  ArrowLeft,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Shield,
  Snowflake,
  Gauge,
  BarChart3,
  ScrollText,
  Link2,
  Search,
  Play,
  Clock,
  User,
  Hash,
  Filter,
  FileText,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type TabKey =
  | 'quality'
  | 'compliance'
  | 'snowglobe'
  | 'readiness'
  | 'evidence'
  | 'audit'
  | 'traceability';

type QCStatus = 'pass' | 'warning' | 'fail';
type ComplianceStatus = 'passed' | 'warning' | 'failed';
type EvidenceStrength = 'strong' | 'adequate' | 'weak' | 'missing';

interface QCSection {
  name: string;
  status: QCStatus;
  issuesFound: number;
  lastChecked: string;
}

interface ComplianceRule {
  id: string;
  category: string;
  description: string;
  status: ComplianceStatus;
  details: string;
}

interface AgencyRequirement {
  requirement: string;
  fda: boolean;
  ema: boolean;
  pmda: boolean;
}

interface SimulationEngine {
  name: string;
  description: string;
  riskScore: number;
  findings: string[];
  status: 'completed' | 'pending';
}

interface ReadinessModule {
  module: string;
  name: string;
  completeness: number;
  status: 'ready' | 'in-progress' | 'blocked';
}

interface EvidenceSection {
  section: string;
  strength: EvidenceStrength;
  claims: number;
  citations: number;
  confidence: number;
  gaps: string[];
}

interface AuditEntry {
  id: string;
  timestamp: string;
  user: string;
  action: string;
  section: string;
  hash: string;
}

interface TraceabilityClaim {
  id: string;
  requirement: string;
  claim: string;
  evidenceLinks: string[];
  traced: boolean;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TAB_LABELS: { key: TabKey; label: string }[] = [
  { key: 'quality', label: 'Quality Center' },
  { key: 'compliance', label: 'Compliance' },
  { key: 'snowglobe', label: 'SnowGlobe' },
  { key: 'readiness', label: 'Readiness Score' },
  { key: 'evidence', label: 'Evidence Confidence' },
  { key: 'audit', label: 'Audit Trail' },
  { key: 'traceability', label: 'Traceability' },
];

// ---------------------------------------------------------------------------
// Mock Data
// ---------------------------------------------------------------------------

const MOCK_QC_SECTIONS: QCSection[] = [
  { name: 'Module 1 — Administrative Information', status: 'pass', issuesFound: 0, lastChecked: '2026-03-17T09:12:00Z' },
  { name: 'Module 2.3 — Quality Overall Summary', status: 'pass', issuesFound: 0, lastChecked: '2026-03-17T09:14:00Z' },
  { name: 'Module 2.5 — Clinical Overview', status: 'warning', issuesFound: 2, lastChecked: '2026-03-17T09:15:00Z' },
  { name: 'Module 2.7 — Clinical Summary', status: 'warning', issuesFound: 3, lastChecked: '2026-03-17T09:16:00Z' },
  { name: 'Module 3 — Quality (CMC)', status: 'pass', issuesFound: 0, lastChecked: '2026-03-17T09:18:00Z' },
  { name: 'Module 4 — Nonclinical Study Reports', status: 'fail', issuesFound: 4, lastChecked: '2026-03-17T09:20:00Z' },
  { name: 'Module 5.3.5 — Efficacy & Safety Reports', status: 'warning', issuesFound: 1, lastChecked: '2026-03-17T09:22:00Z' },
  { name: 'Module 5.3.7 — Patient Data Listings', status: 'pass', issuesFound: 0, lastChecked: '2026-03-17T09:24:00Z' },
];

const MOCK_COMPLIANCE_RULES: ComplianceRule[] = [
  { id: 'P11-01', category: '21 CFR Part 11', description: 'Electronic signatures use unique user IDs', status: 'passed', details: 'All signatures verified against identity store' },
  { id: 'P11-02', category: '21 CFR Part 11', description: 'Audit trail captures all modifications', status: 'passed', details: 'Immutable log with timestamps and user attribution' },
  { id: 'P11-03', category: '21 CFR Part 11', description: 'Role-based access controls enforced', status: 'passed', details: 'RBAC with principle of least privilege' },
  { id: 'P11-04', category: '21 CFR Part 11', description: 'Data integrity checksums on all records', status: 'passed', details: 'SHA-256 hashes computed and stored per record' },
  { id: 'P11-05', category: '21 CFR Part 11', description: 'System validation documentation current', status: 'warning', details: 'IQ/OQ/PQ documents due for annual review in 14 days' },
  { id: 'GRL-01', category: 'Compliance Guardrails', description: 'No unverified AI-generated content in final output', status: 'passed', details: 'All AI outputs reviewed and approved by SME' },
  { id: 'GRL-02', category: 'Compliance Guardrails', description: 'Cross-reference consistency across modules', status: 'passed', details: 'Automated consistency check passed 412 references' },
  { id: 'GRL-03', category: 'Compliance Guardrails', description: 'Terminology aligned to MedDRA preferred terms', status: 'passed', details: 'All adverse event terms mapped to MedDRA v26.1' },
  { id: 'FHIR-01', category: 'FHIR Validation', description: 'Clinical data resources conform to FHIR R4', status: 'passed', details: 'All 38 resources validated against IG profiles' },
  { id: 'FHIR-02', category: 'FHIR Validation', description: 'Patient demographics use US Core profiles', status: 'passed', details: 'Demographics validated against US Core 5.0.1' },
  { id: 'MA-01', category: 'Multi-Agency', description: 'eCTD structure conforms to ICH M4 granularity', status: 'warning', details: 'Minor: 2 study reports missing granularity level 4 headings for PMDA' },
  { id: 'MA-02', category: 'Multi-Agency', description: 'Regional module content meets local requirements', status: 'passed', details: 'FDA Module 1, EMA Module 1, PMDA Module 1 all present' },
];

const MOCK_AGENCY_MATRIX: AgencyRequirement[] = [
  { requirement: 'eCTD 4.0 submission format', fda: true, ema: true, pmda: true },
  { requirement: 'Electronic signatures (Part 11)', fda: true, ema: true, pmda: true },
  { requirement: 'Regional administrative docs', fda: true, ema: true, pmda: true },
  { requirement: 'Pediatric study plan', fda: true, ema: true, pmda: false },
  { requirement: 'Risk management plan (EU)', fda: false, ema: true, pmda: false },
  { requirement: 'PMDA CTD-J regional annex', fda: false, ema: false, pmda: true },
  { requirement: 'Environmental assessment', fda: true, ema: false, pmda: false },
  { requirement: 'QOS per ICH M4Q format', fda: true, ema: true, pmda: true },
];

const MOCK_SIMULATIONS: SimulationEngine[] = [
  { name: 'Agency Screen', description: 'Simulates initial filing review and refuse-to-file risk', riskScore: 18, findings: ['Cover letter complete', 'All required forms present', 'eCTD structure valid'], status: 'completed' },
  { name: 'Reviewer Attack', description: 'Predicts likely reviewer questions and challenge areas', riskScore: 42, findings: ['Efficacy endpoint justification may be questioned', 'Comparator selection rationale needed', 'Subgroup analysis inconsistencies in Module 2.7'], status: 'completed' },
  { name: 'Audit Inspection', description: 'Simulates GCP inspection readiness and audit vulnerability', riskScore: 25, findings: ['Site monitoring reports accessible', 'Protocol deviation log up to date', 'Minor: 2 CRF queries still open'], status: 'completed' },
  { name: 'Route Timing', description: 'Models regulatory pathway timing and milestone risks', riskScore: 35, findings: ['Priority Review designation likely (68% probability)', 'PDUFA date projected: Q4 2026', 'Advisory committee meeting probable'], status: 'completed' },
  { name: 'Evidence Sufficiency', description: 'Evaluates whether evidence package meets approval threshold', riskScore: 31, findings: ['Primary endpoint met with p<0.001', 'Long-term safety data adequate (24-month)', 'Real-world evidence supplements trial data'], status: 'completed' },
  { name: 'Collaboration Fragility', description: 'Identifies team bottlenecks and knowledge concentration risks', riskScore: 48, findings: ['CMC section authored by single expert', 'Clinical pharmacology section awaiting final review', 'No backup author for nonclinical overview'], status: 'completed' },
];

const MOCK_READINESS_MODULES: ReadinessModule[] = [
  { module: 'Module 1', name: 'Administrative Information', completeness: 95, status: 'ready' },
  { module: 'Module 2', name: 'Common Technical Document Summaries', completeness: 72, status: 'in-progress' },
  { module: 'Module 3', name: 'Quality (CMC)', completeness: 88, status: 'ready' },
  { module: 'Module 4', name: 'Nonclinical Study Reports', completeness: 62, status: 'in-progress' },
  { module: 'Module 5', name: 'Clinical Study Reports', completeness: 70, status: 'in-progress' },
];

const MOCK_READINESS_GAPS = [
  'Module 4.2.3 — Toxicology study report for 13-week repeat dose missing final pathology tables',
  'Module 2.7.4 — Tabular summary of adverse events not reconciled with Module 5 CSR data',
  'Module 5.3.5.1 — Pivotal efficacy study statistical analysis plan amendment v3 not uploaded',
];

const MOCK_EVIDENCE_SECTIONS: EvidenceSection[] = [
  { section: 'Efficacy — Primary Endpoint', strength: 'strong', claims: 8, citations: 24, confidence: 94, gaps: [] },
  { section: 'Efficacy — Secondary Endpoints', strength: 'adequate', claims: 12, citations: 18, confidence: 78, gaps: ['QoL endpoint citation from extension study pending'] },
  { section: 'Safety — Adverse Events', strength: 'strong', claims: 15, citations: 32, confidence: 91, gaps: [] },
  { section: 'Safety — Long-term', strength: 'weak', claims: 6, citations: 4, confidence: 52, gaps: ['24-month safety update not yet integrated', 'PSUR data not cross-referenced'] },
  { section: 'Clinical Pharmacology', strength: 'adequate', claims: 10, citations: 14, confidence: 76, gaps: ['DDI study with CYP3A4 inhibitor not cited'] },
  { section: 'Nonclinical — Toxicology', strength: 'missing', claims: 4, citations: 1, confidence: 22, gaps: ['Carcinogenicity study results pending', 'Reproductive tox citations incomplete', 'Genotoxicity battery citations missing'] },
];

const MOCK_AUDIT_ENTRIES: AuditEntry[] = [
  { id: 'AE-001', timestamp: '2026-03-17T09:24:33Z', user: 'Dr. Sarah Chen', action: 'Quality check completed', section: 'Module 5.3.7', hash: 'a3f8c2e1' },
  { id: 'AE-002', timestamp: '2026-03-17T09:18:12Z', user: 'System (AutoQC)', action: 'Automated validation run', section: 'Module 3', hash: 'b7d4f9a2' },
  { id: 'AE-003', timestamp: '2026-03-17T08:45:00Z', user: 'James Rodriguez', action: 'Document uploaded', section: 'Module 4.2.3', hash: 'c1e5b8d3' },
  { id: 'AE-004', timestamp: '2026-03-16T17:30:22Z', user: 'Dr. Sarah Chen', action: 'Section approved', section: 'Module 2.5', hash: 'd9a2c4f7' },
  { id: 'AE-005', timestamp: '2026-03-16T16:12:45Z', user: 'Emily Walsh', action: 'Content revised', section: 'Module 2.7.4', hash: 'e4b7d1a8' },
  { id: 'AE-006', timestamp: '2026-03-16T14:55:10Z', user: 'System (Guardrails)', action: 'Compliance check triggered', section: 'Module 2.7', hash: 'f2c8e5b9' },
  { id: 'AE-007', timestamp: '2026-03-16T11:20:33Z', user: 'Dr. Michael Torres', action: 'Electronic signature applied', section: 'Module 1', hash: 'a8d3f6c1' },
  { id: 'AE-008', timestamp: '2026-03-15T16:40:00Z', user: 'Emily Walsh', action: 'Cross-reference validation', section: 'Module 5.3.5', hash: 'b1e9a4d7' },
  { id: 'AE-009', timestamp: '2026-03-15T13:15:22Z', user: 'System (SnowGlobe)', action: 'Simulation run completed', section: 'All Modules', hash: 'c5f2b8e3' },
  { id: 'AE-010', timestamp: '2026-03-15T09:00:00Z', user: 'James Rodriguez', action: 'Traceability matrix updated', section: 'Module 4', hash: 'd7a1c9f4' },
];

const MOCK_TRACEABILITY: TraceabilityClaim[] = [
  { id: 'TC-01', requirement: 'REQ-EFF-001', claim: 'Drug X demonstrates statistically significant improvement in primary endpoint vs placebo', evidenceLinks: ['CSR-001 Table 14.2.1', 'SAP v3 Section 6.1'], traced: true },
  { id: 'TC-02', requirement: 'REQ-EFF-002', claim: 'Response rate exceeds 30% threshold for clinical meaningfulness', evidenceLinks: ['CSR-001 Table 14.2.4', 'Literature review L-012'], traced: true },
  { id: 'TC-03', requirement: 'REQ-SAF-001', claim: 'Adverse event profile consistent with known class effects', evidenceLinks: ['CSR-001 Table 14.3.1', 'IB v12 Section 5.3'], traced: true },
  { id: 'TC-04', requirement: 'REQ-SAF-002', claim: 'No evidence of hepatotoxicity signal in 24-month follow-up', evidenceLinks: ['CSR-002 Table 14.3.7', 'PSUR-003 Section 4'], traced: true },
  { id: 'TC-05', requirement: 'REQ-SAF-003', claim: 'Cardiac safety demonstrated via thorough QT study', evidenceLinks: ['CSR-003 Table 11.1'], traced: true },
  { id: 'TC-06', requirement: 'REQ-PK-001', claim: 'Linear pharmacokinetics across therapeutic dose range', evidenceLinks: ['CSR-004 Figure 3.1', 'PopPK Report Section 7'], traced: true },
  { id: 'TC-07', requirement: 'REQ-PK-002', claim: 'No clinically significant food effect on bioavailability', evidenceLinks: ['CSR-005 Table 8.1'], traced: true },
  { id: 'TC-08', requirement: 'REQ-CMC-001', claim: 'Drug substance manufactured under cGMP with validated process', evidenceLinks: ['CTD 3.2.S.2.2 Process Validation Report'], traced: true },
  { id: 'TC-09', requirement: 'REQ-CMC-002', claim: '36-month shelf life supported by stability data', evidenceLinks: ['CTD 3.2.P.8.3 Stability Summary'], traced: true },
  { id: 'TC-10', requirement: 'REQ-NC-001', claim: 'NOAEL established at 100 mg/kg in 26-week chronic tox study', evidenceLinks: ['CTD 4.2.3.2 Study Report TX-026'], traced: true },
  { id: 'TC-11', requirement: 'REQ-NC-002', claim: 'No genotoxic potential demonstrated in standard battery', evidenceLinks: ['CTD 4.2.3.3.1 Ames', 'CTD 4.2.3.3.2 In vivo MN'], traced: true },
  { id: 'TC-12', requirement: 'REQ-NC-003', claim: 'Reproductive toxicology shows no teratogenic effects', evidenceLinks: ['CTD 4.2.3.5.2 EFD Study Report'], traced: true },
  { id: 'TC-13', requirement: 'REQ-EFF-003', claim: 'Durable response maintained at 18-month landmark analysis', evidenceLinks: ['CSR-001 Figure 14.2.8'], traced: true },
  { id: 'TC-14', requirement: 'REQ-EFF-004', claim: 'Patient-reported outcomes show clinically meaningful improvement', evidenceLinks: ['CSR-001 Table 14.2.12', 'PRO Validation Study'], traced: true },
  { id: 'TC-15', requirement: 'REQ-NC-004', claim: 'Carcinogenicity risk adequately characterized', evidenceLinks: [], traced: false },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function statusColor(status: QCStatus): string {
  if (status === 'pass') return 'text-green-700';
  if (status === 'warning') return 'text-amber-600';
  return 'text-red-600';
}

function statusLabel(status: QCStatus): string {
  if (status === 'pass') return 'Pass';
  if (status === 'warning') return 'Warning';
  return 'Fail';
}

function complianceColor(status: ComplianceStatus): string {
  if (status === 'passed') return 'text-green-700';
  if (status === 'warning') return 'text-amber-600';
  return 'text-red-600';
}

function strengthColor(s: EvidenceStrength): string {
  if (s === 'strong') return 'text-green-700';
  if (s === 'adequate') return 'text-amber-600';
  if (s === 'weak') return 'text-red-500';
  return 'text-zinc-400';
}

function strengthLabel(s: EvidenceStrength): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function riskColor(score: number): string {
  if (score <= 25) return 'text-green-700';
  if (score <= 50) return 'text-amber-600';
  return 'text-red-600';
}

// ---------------------------------------------------------------------------
// Sub-View: Quality Center
// ---------------------------------------------------------------------------

function QualityCenterView() {
  const totalIssues = MOCK_QC_SECTIONS.reduce((sum, s) => sum + s.issuesFound, 0);
  const critical = MOCK_QC_SECTIONS.filter((s) => s.status === 'fail').length;

  return (
    <div className="px-8 py-8 space-y-6">
      <div>
        <h2 className="text-lg font-medium text-zinc-900">Quality Center</h2>
        <p className="text-sm text-zinc-600 mt-1">
          Does this pass quality checks? Section-by-section QC results across the submission.
        </p>
      </div>

      {/* Summary */}
      <div className="bg-white border border-zinc-100 rounded-lg p-5">
        <div className="flex items-center gap-8">
          <div>
            <p className="text-xs text-zinc-400 uppercase tracking-wide">Sections Checked</p>
            <p className="text-2xl font-semibold text-zinc-900 mt-1">{MOCK_QC_SECTIONS.length}</p>
          </div>
          <div>
            <p className="text-xs text-zinc-400 uppercase tracking-wide">Issues Found</p>
            <p className="text-2xl font-semibold text-zinc-900 mt-1">{totalIssues}</p>
          </div>
          <div>
            <p className="text-xs text-zinc-400 uppercase tracking-wide">Critical</p>
            <p className="text-2xl font-semibold text-red-600 mt-1">{critical}</p>
          </div>
        </div>
        <p className="text-xs text-zinc-400 mt-4">
          Powered by QC Routes, Section Quality Gating, Real-time Validation
        </p>
      </div>

      {/* Table */}
      <div className="bg-white border border-zinc-100 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-100">
              <th className="text-left px-5 py-3 text-xs font-medium text-zinc-400 uppercase tracking-wide">Section</th>
              <th className="text-left px-5 py-3 text-xs font-medium text-zinc-400 uppercase tracking-wide">Status</th>
              <th className="text-left px-5 py-3 text-xs font-medium text-zinc-400 uppercase tracking-wide">Issues</th>
              <th className="text-left px-5 py-3 text-xs font-medium text-zinc-400 uppercase tracking-wide">Last Checked</th>
            </tr>
          </thead>
          <tbody>
            {MOCK_QC_SECTIONS.map((section, i) => (
              <tr key={i} className="border-b border-zinc-50 last:border-0">
                <td className="px-5 py-3 text-zinc-900">{section.name}</td>
                <td className={cn('px-5 py-3 font-medium', statusColor(section.status))}>
                  {statusLabel(section.status)}
                </td>
                <td className="px-5 py-3 text-zinc-600">{section.issuesFound}</td>
                <td className="px-5 py-3 text-zinc-400">{formatTimestamp(section.lastChecked)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-View: Compliance
// ---------------------------------------------------------------------------

function ComplianceView() {
  const passed = MOCK_COMPLIANCE_RULES.filter((r) => r.status === 'passed').length;
  const warnings = MOCK_COMPLIANCE_RULES.filter((r) => r.status === 'warning').length;

  return (
    <div className="px-8 py-8 space-y-6">
      <div>
        <h2 className="text-lg font-medium text-zinc-900">Compliance</h2>
        <p className="text-sm text-zinc-600 mt-1">
          Is this compliant? 21 CFR Part 11, multi-agency requirements, and guardrail results.
        </p>
      </div>

      {/* Summary */}
      <div className="bg-white border border-zinc-100 rounded-lg p-5">
        <div className="flex items-center gap-8">
          <div>
            <p className="text-xs text-zinc-400 uppercase tracking-wide">Rules Evaluated</p>
            <p className="text-2xl font-semibold text-zinc-900 mt-1">{MOCK_COMPLIANCE_RULES.length}</p>
          </div>
          <div>
            <p className="text-xs text-zinc-400 uppercase tracking-wide">Passed</p>
            <p className="text-2xl font-semibold text-green-700 mt-1">{passed}</p>
          </div>
          <div>
            <p className="text-xs text-zinc-400 uppercase tracking-wide">Warnings</p>
            <p className="text-2xl font-semibold text-amber-600 mt-1">{warnings}</p>
          </div>
        </div>
        <p className="text-xs text-zinc-400 mt-4">
          Powered by Part 11 Compliance, Compliance Guardrails SDK, Multi-Agency Validation, FHIR Validation
        </p>
      </div>

      {/* Compliance Rules */}
      <div className="bg-white border border-zinc-100 rounded-lg overflow-hidden">
        <div className="px-5 py-3 border-b border-zinc-100">
          <h3 className="text-sm font-medium text-zinc-900">Compliance Rules</h3>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-100">
              <th className="text-left px-5 py-3 text-xs font-medium text-zinc-400 uppercase tracking-wide">ID</th>
              <th className="text-left px-5 py-3 text-xs font-medium text-zinc-400 uppercase tracking-wide">Category</th>
              <th className="text-left px-5 py-3 text-xs font-medium text-zinc-400 uppercase tracking-wide">Rule</th>
              <th className="text-left px-5 py-3 text-xs font-medium text-zinc-400 uppercase tracking-wide">Status</th>
            </tr>
          </thead>
          <tbody>
            {MOCK_COMPLIANCE_RULES.map((rule) => (
              <tr key={rule.id} className="border-b border-zinc-50 last:border-0">
                <td className="px-5 py-3 text-zinc-400 font-mono text-xs">{rule.id}</td>
                <td className="px-5 py-3 text-zinc-600">{rule.category}</td>
                <td className="px-5 py-3 text-zinc-900">
                  <div>{rule.description}</div>
                  <div className="text-xs text-zinc-400 mt-0.5">{rule.details}</div>
                </td>
                <td className={cn('px-5 py-3 font-medium capitalize', complianceColor(rule.status))}>
                  {rule.status}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Multi-Agency Matrix */}
      <div className="bg-white border border-zinc-100 rounded-lg overflow-hidden">
        <div className="px-5 py-3 border-b border-zinc-100">
          <h3 className="text-sm font-medium text-zinc-900">Multi-Agency Compliance Matrix</h3>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-100">
              <th className="text-left px-5 py-3 text-xs font-medium text-zinc-400 uppercase tracking-wide">Requirement</th>
              <th className="text-center px-5 py-3 text-xs font-medium text-zinc-400 uppercase tracking-wide">FDA</th>
              <th className="text-center px-5 py-3 text-xs font-medium text-zinc-400 uppercase tracking-wide">EMA</th>
              <th className="text-center px-5 py-3 text-xs font-medium text-zinc-400 uppercase tracking-wide">PMDA</th>
            </tr>
          </thead>
          <tbody>
            {MOCK_AGENCY_MATRIX.map((row, i) => (
              <tr key={i} className="border-b border-zinc-50 last:border-0">
                <td className="px-5 py-3 text-zinc-900">{row.requirement}</td>
                <td className="px-5 py-3 text-center">
                  <span className={row.fda ? 'text-green-700' : 'text-zinc-300'}>{row.fda ? 'Met' : '—'}</span>
                </td>
                <td className="px-5 py-3 text-center">
                  <span className={row.ema ? 'text-green-700' : 'text-zinc-300'}>{row.ema ? 'Met' : '—'}</span>
                </td>
                <td className="px-5 py-3 text-center">
                  <span className={row.pmda ? 'text-green-700' : 'text-zinc-300'}>{row.pmda ? 'Met' : '—'}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-View: SnowGlobe
// ---------------------------------------------------------------------------

function SnowGlobeView() {
  const [simulations, setSimulations] = useState(MOCK_SIMULATIONS);
  const avgRisk = Math.round(simulations.reduce((s, e) => s + e.riskScore, 0) / simulations.length);

  const handleRunSimulation = useCallback((index: number) => {
    setSimulations((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], status: 'completed', riskScore: Math.max(5, next[index].riskScore + Math.floor(Math.random() * 11) - 5) };
      return next;
    });
  }, []);

  return (
    <div className="px-8 py-8 space-y-6">
      <div>
        <h2 className="text-lg font-medium text-zinc-900">SnowGlobe</h2>
        <p className="text-sm text-zinc-600 mt-1">
          Stress-test your submission. Six simulation engines model agency, reviewer, and operational risks.
        </p>
      </div>

      {/* Aggregate Summary */}
      <div className="bg-white border border-zinc-100 rounded-lg p-5">
        <div className="flex items-center gap-8">
          <div>
            <p className="text-xs text-zinc-400 uppercase tracking-wide">Aggregate Risk</p>
            <p className={cn('text-2xl font-semibold mt-1', riskColor(avgRisk))}>{avgRisk}/100</p>
          </div>
          <div>
            <p className="text-xs text-zinc-400 uppercase tracking-wide">Engines Run</p>
            <p className="text-2xl font-semibold text-zinc-900 mt-1">{simulations.filter((s) => s.status === 'completed').length}/{simulations.length}</p>
          </div>
        </div>
        <p className="text-xs text-zinc-400 mt-4">
          Powered by SnowGlobe 6-engine simulation system
        </p>
      </div>

      {/* Engine Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {simulations.map((engine, i) => (
          <div key={i} className="bg-white border border-zinc-100 rounded-lg p-5">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-sm font-medium text-zinc-900">{engine.name}</h3>
                <p className="text-xs text-zinc-400 mt-1">{engine.description}</p>
              </div>
              <span className={cn('text-lg font-semibold', riskColor(engine.riskScore))}>
                {engine.riskScore}
              </span>
            </div>

            <ul className="mt-3 space-y-1">
              {engine.findings.map((f, j) => (
                <li key={j} className="text-xs text-zinc-600 flex items-start gap-1.5">
                  <span className="text-zinc-300 mt-0.5">-</span>
                  {f}
                </li>
              ))}
            </ul>

            <button
              onClick={() => handleRunSimulation(i)}
              className="mt-4 flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:text-blue-700 transition-colors"
            >
              <Play className="w-3 h-3" />
              Run simulation
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-View: Readiness Score
// ---------------------------------------------------------------------------

function ReadinessScoreView() {
  const overallReadiness = 78;
  const approvalProbability = 72;
  const predictedReviewWeeks = 44;
  const predictedDeficiencies = 3;

  return (
    <div className="px-8 py-8 space-y-6">
      <div>
        <h2 className="text-lg font-medium text-zinc-900">Readiness Score</h2>
        <p className="text-sm text-zinc-600 mt-1">
          Are we ready to file? Comprehensive readiness assessment with approval probability modeling.
        </p>
      </div>

      {/* Main Score */}
      <div className="bg-white border border-zinc-100 rounded-lg p-8 text-center">
        <p className="text-xs text-zinc-400 uppercase tracking-wide">Submission Readiness</p>
        <p className="text-6xl font-semibold text-zinc-900 mt-2">{overallReadiness}%</p>
        <p className="text-sm text-zinc-400 mt-2">
          Predicted approval probability: <span className="text-zinc-900 font-medium">{approvalProbability}%</span>
        </p>
        <div className="flex items-center justify-center gap-8 mt-6">
          <div>
            <p className="text-xs text-zinc-400">Review Time</p>
            <p className="text-sm font-medium text-zinc-900">{predictedReviewWeeks} weeks</p>
          </div>
          <div>
            <p className="text-xs text-zinc-400">Predicted Deficiencies</p>
            <p className="text-sm font-medium text-zinc-900">{predictedDeficiencies}</p>
          </div>
        </div>
        <p className="text-xs text-zinc-400 mt-6">
          Powered by Submission Readiness Twin
        </p>
      </div>

      {/* Module Breakdown */}
      <div className="bg-white border border-zinc-100 rounded-lg overflow-hidden">
        <div className="px-5 py-3 border-b border-zinc-100">
          <h3 className="text-sm font-medium text-zinc-900">Module-by-Module Readiness</h3>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-100">
              <th className="text-left px-5 py-3 text-xs font-medium text-zinc-400 uppercase tracking-wide">Module</th>
              <th className="text-left px-5 py-3 text-xs font-medium text-zinc-400 uppercase tracking-wide">Name</th>
              <th className="text-left px-5 py-3 text-xs font-medium text-zinc-400 uppercase tracking-wide">Completeness</th>
              <th className="text-left px-5 py-3 text-xs font-medium text-zinc-400 uppercase tracking-wide">Status</th>
            </tr>
          </thead>
          <tbody>
            {MOCK_READINESS_MODULES.map((mod) => (
              <tr key={mod.module} className="border-b border-zinc-50 last:border-0">
                <td className="px-5 py-3 text-zinc-900 font-medium">{mod.module}</td>
                <td className="px-5 py-3 text-zinc-600">{mod.name}</td>
                <td className="px-5 py-3">
                  <div className="flex items-center gap-3">
                    <div className="w-24 h-1.5 bg-zinc-100 rounded-full overflow-hidden">
                      <div
                        className={cn(
                          'h-full rounded-full',
                          mod.completeness >= 85 ? 'bg-green-500' : mod.completeness >= 65 ? 'bg-amber-400' : 'bg-red-400'
                        )}
                        style={{ width: `${mod.completeness}%` }}
                      />
                    </div>
                    <span className="text-xs text-zinc-600">{mod.completeness}%</span>
                  </div>
                </td>
                <td className={cn(
                  'px-5 py-3 text-sm capitalize',
                  mod.status === 'ready' ? 'text-green-700' : mod.status === 'in-progress' ? 'text-amber-600' : 'text-red-600'
                )}>
                  {mod.status.replace('-', ' ')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Prediction Detail */}
      <div className="bg-white border border-zinc-100 rounded-lg p-5">
        <h3 className="text-sm font-medium text-zinc-900">Filing Probability Model</h3>
        <p className="text-xs text-zinc-400 mt-1 mb-3">
          Predicted outcomes based on historical approval data for similar submissions.
        </p>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <p className="text-xs text-zinc-400">First-cycle approval</p>
            <p className="text-sm font-medium text-zinc-900">68%</p>
          </div>
          <div>
            <p className="text-xs text-zinc-400">Major amendment needed</p>
            <p className="text-sm font-medium text-zinc-900">22%</p>
          </div>
          <div>
            <p className="text-xs text-zinc-400">Refuse to file risk</p>
            <p className="text-sm font-medium text-zinc-900">10%</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-View: Evidence Confidence
// ---------------------------------------------------------------------------

function EvidenceConfidenceView() {
  return (
    <div className="px-8 py-8 space-y-6">
      <div>
        <h2 className="text-lg font-medium text-zinc-900">Evidence Confidence</h2>
        <p className="text-sm text-zinc-600 mt-1">
          Claim-to-citation coverage. Are key regulatory claims backed by sufficient, traceable evidence?
        </p>
      </div>

      {/* Powered By */}
      <div className="bg-white border border-zinc-100 rounded-lg p-5">
        <p className="text-xs text-zinc-400">
          Powered by Evidence Confidence Heatmap, Confidence Scoring Engine
        </p>
      </div>

      {/* Evidence Grid */}
      <div className="bg-white border border-zinc-100 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-100">
              <th className="text-left px-5 py-3 text-xs font-medium text-zinc-400 uppercase tracking-wide">Section</th>
              <th className="text-left px-5 py-3 text-xs font-medium text-zinc-400 uppercase tracking-wide">Strength</th>
              <th className="text-center px-5 py-3 text-xs font-medium text-zinc-400 uppercase tracking-wide">Claims</th>
              <th className="text-center px-5 py-3 text-xs font-medium text-zinc-400 uppercase tracking-wide">Citations</th>
              <th className="text-center px-5 py-3 text-xs font-medium text-zinc-400 uppercase tracking-wide">Confidence</th>
              <th className="text-left px-5 py-3 text-xs font-medium text-zinc-400 uppercase tracking-wide">Gaps</th>
            </tr>
          </thead>
          <tbody>
            {MOCK_EVIDENCE_SECTIONS.map((section, i) => (
              <tr key={i} className="border-b border-zinc-50 last:border-0">
                <td className="px-5 py-3 text-zinc-900">{section.section}</td>
                <td className={cn('px-5 py-3 font-medium', strengthColor(section.strength))}>
                  {strengthLabel(section.strength)}
                </td>
                <td className="px-5 py-3 text-center text-zinc-600">{section.claims}</td>
                <td className="px-5 py-3 text-center text-zinc-600">{section.citations}</td>
                <td className="px-5 py-3 text-center">
                  <span className={cn(
                    'font-medium',
                    section.confidence >= 80 ? 'text-green-700' : section.confidence >= 60 ? 'text-amber-600' : 'text-red-500'
                  )}>
                    {section.confidence}%
                  </span>
                </td>
                <td className="px-5 py-3 text-zinc-400 text-xs">
                  {section.gaps.length === 0 ? (
                    <span className="text-green-700">None</span>
                  ) : (
                    <ul className="space-y-0.5">
                      {section.gaps.map((g, j) => (
                        <li key={j}>{g}</li>
                      ))}
                    </ul>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-View: Audit Trail
// ---------------------------------------------------------------------------

function AuditTrailView() {
  const [filterUser, setFilterUser] = useState('');
  const [filterAction, setFilterAction] = useState('');

  const users = useMemo(() => [...new Set(MOCK_AUDIT_ENTRIES.map((e) => e.user))], []);
  const actions = useMemo(() => [...new Set(MOCK_AUDIT_ENTRIES.map((e) => e.action))], []);

  const filtered = useMemo(() => {
    return MOCK_AUDIT_ENTRIES.filter((e) => {
      if (filterUser && e.user !== filterUser) return false;
      if (filterAction && e.action !== filterAction) return false;
      return true;
    });
  }, [filterUser, filterAction]);

  return (
    <div className="px-8 py-8 space-y-6">
      <div>
        <h2 className="text-lg font-medium text-zinc-900">Audit Trail</h2>
        <p className="text-sm text-zinc-600 mt-1">
          Full compliance history. Immutable, chronological record of all system actions.
        </p>
      </div>

      {/* Powered By */}
      <div className="bg-white border border-zinc-100 rounded-lg p-5">
        <p className="text-xs text-zinc-400">
          Powered by Cognitive Audit Service, Provenance Trail
        </p>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-zinc-400" />
          <select
            value={filterUser}
            onChange={(e) => setFilterUser(e.target.value)}
            className="text-sm border border-zinc-200 rounded-md px-3 py-1.5 text-zinc-700 bg-white focus:outline-none focus:ring-1 focus:ring-zinc-300"
          >
            <option value="">All users</option>
            {users.map((u) => (
              <option key={u} value={u}>{u}</option>
            ))}
          </select>
        </div>
        <select
          value={filterAction}
          onChange={(e) => setFilterAction(e.target.value)}
          className="text-sm border border-zinc-200 rounded-md px-3 py-1.5 text-zinc-700 bg-white focus:outline-none focus:ring-1 focus:ring-zinc-300"
        >
          <option value="">All actions</option>
          {actions.map((a) => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>
      </div>

      {/* Audit Feed */}
      <div className="bg-white border border-zinc-100 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-100">
              <th className="text-left px-5 py-3 text-xs font-medium text-zinc-400 uppercase tracking-wide">Timestamp</th>
              <th className="text-left px-5 py-3 text-xs font-medium text-zinc-400 uppercase tracking-wide">User</th>
              <th className="text-left px-5 py-3 text-xs font-medium text-zinc-400 uppercase tracking-wide">Action</th>
              <th className="text-left px-5 py-3 text-xs font-medium text-zinc-400 uppercase tracking-wide">Section</th>
              <th className="text-left px-5 py-3 text-xs font-medium text-zinc-400 uppercase tracking-wide">Hash</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((entry) => (
              <tr key={entry.id} className="border-b border-zinc-50 last:border-0">
                <td className="px-5 py-3 text-zinc-400 text-xs whitespace-nowrap">
                  <div className="flex items-center gap-1.5">
                    <Clock className="w-3 h-3" />
                    {formatTimestamp(entry.timestamp)}
                  </div>
                </td>
                <td className="px-5 py-3 text-zinc-900">{entry.user}</td>
                <td className="px-5 py-3 text-zinc-600">{entry.action}</td>
                <td className="px-5 py-3 text-zinc-600">{entry.section}</td>
                <td className="px-5 py-3 text-zinc-400 font-mono text-xs">{entry.hash}</td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="px-5 py-8 text-center text-zinc-400 text-sm">
                  No audit entries match the current filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-View: Traceability
// ---------------------------------------------------------------------------

function TraceabilityView() {
  const traced = MOCK_TRACEABILITY.filter((c) => c.traced).length;
  const total = MOCK_TRACEABILITY.length;
  const coverage = Math.round((traced / total) * 100);
  const orphaned = MOCK_TRACEABILITY.filter((c) => !c.traced);

  return (
    <div className="px-8 py-8 space-y-6">
      <div>
        <h2 className="text-lg font-medium text-zinc-900">Traceability</h2>
        <p className="text-sm text-zinc-600 mt-1">
          Is every claim backed by evidence? Full traceability matrix from requirements to claims to evidence.
        </p>
      </div>

      {/* Summary */}
      <div className="bg-white border border-zinc-100 rounded-lg p-5">
        <div className="flex items-center gap-8">
          <div>
            <p className="text-xs text-zinc-400 uppercase tracking-wide">Coverage</p>
            <p className="text-2xl font-semibold text-zinc-900 mt-1">{coverage}%</p>
            <p className="text-xs text-zinc-400 mt-0.5">{traced} of {total} claims traced</p>
          </div>
          <div>
            <p className="text-xs text-zinc-400 uppercase tracking-wide">Orphaned Claims</p>
            <p className="text-2xl font-semibold text-red-600 mt-1">{orphaned.length}</p>
          </div>
        </div>
        <p className="text-xs text-zinc-400 mt-4">
          Powered by Auto-Traceability Engine, Citation Enforcement
        </p>
      </div>

      {/* Orphaned Claims */}
      {orphaned.length > 0 && (
        <div className="bg-white border border-zinc-100 rounded-lg p-5">
          <h3 className="text-sm font-medium text-zinc-900">Orphaned Claims</h3>
          <p className="text-xs text-zinc-400 mt-1">Claims without supporting evidence links.</p>
          <ul className="mt-3 space-y-2">
            {orphaned.map((claim) => (
              <li key={claim.id} className="text-sm text-zinc-600 flex items-start gap-2">
                <XCircle className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" />
                <div>
                  <span className="font-mono text-xs text-zinc-400 mr-2">{claim.requirement}</span>
                  {claim.claim}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Full Matrix */}
      <div className="bg-white border border-zinc-100 rounded-lg overflow-hidden">
        <div className="px-5 py-3 border-b border-zinc-100">
          <h3 className="text-sm font-medium text-zinc-900">Traceability Matrix</h3>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-100">
              <th className="text-left px-5 py-3 text-xs font-medium text-zinc-400 uppercase tracking-wide">Req ID</th>
              <th className="text-left px-5 py-3 text-xs font-medium text-zinc-400 uppercase tracking-wide">Claim</th>
              <th className="text-left px-5 py-3 text-xs font-medium text-zinc-400 uppercase tracking-wide">Evidence Links</th>
              <th className="text-center px-5 py-3 text-xs font-medium text-zinc-400 uppercase tracking-wide">Traced</th>
            </tr>
          </thead>
          <tbody>
            {MOCK_TRACEABILITY.map((claim) => (
              <tr key={claim.id} className="border-b border-zinc-50 last:border-0">
                <td className="px-5 py-3 text-zinc-400 font-mono text-xs whitespace-nowrap">{claim.requirement}</td>
                <td className="px-5 py-3 text-zinc-900 text-xs">{claim.claim}</td>
                <td className="px-5 py-3 text-zinc-600 text-xs">
                  {claim.evidenceLinks.length > 0 ? (
                    <ul className="space-y-0.5">
                      {claim.evidenceLinks.map((link, j) => (
                        <li key={j} className="flex items-center gap-1">
                          <Link2 className="w-3 h-3 text-zinc-300" />
                          {link}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <span className="text-red-400">No evidence linked</span>
                  )}
                </td>
                <td className="px-5 py-3 text-center">
                  {claim.traced ? (
                    <span className="text-green-700 text-xs font-medium">Yes</span>
                  ) : (
                    <span className="text-red-500 text-xs font-medium">No</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component: ReviewReadiness
// ---------------------------------------------------------------------------

export function ReviewReadiness({ onClose }: { onClose: () => void }) {
  const [activeTab, setActiveTab] = useState<TabKey>('quality');

  const handleTabChange = useCallback((key: TabKey) => {
    setActiveTab(key);
  }, []);

  const renderView = useMemo(() => {
    switch (activeTab) {
      case 'quality':
        return <QualityCenterView />;
      case 'compliance':
        return <ComplianceView />;
      case 'snowglobe':
        return <SnowGlobeView />;
      case 'readiness':
        return <ReadinessScoreView />;
      case 'evidence':
        return <EvidenceConfidenceView />;
      case 'audit':
        return <AuditTrailView />;
      case 'traceability':
        return <TraceabilityView />;
      default:
        return <QualityCenterView />;
    }
  }, [activeTab]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#FAFAF9]">
      {/* Top bar */}
      <header className="flex-shrink-0 h-12 border-b border-zinc-100 bg-white">
        <div className="flex items-center h-full px-6">
          {/* Back */}
          <button
            onClick={onClose}
            className="flex items-center gap-1.5 text-zinc-400 hover:text-zinc-600 transition-colors mr-4"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>

          <span className="text-sm font-medium text-zinc-900 mr-8">
            Review &amp; Readiness
          </span>

          {/* Tabs */}
          <nav className="flex items-center gap-6 h-full overflow-x-auto">
            {TAB_LABELS.map((tab) => {
              const isActive = activeTab === tab.key;
              return (
                <button
                  key={tab.key}
                  onClick={() => handleTabChange(tab.key)}
                  className={cn(
                    'relative text-sm h-full flex items-center transition-colors whitespace-nowrap',
                    isActive
                      ? 'text-zinc-900'
                      : 'text-zinc-400 hover:text-zinc-600'
                  )}
                >
                  {tab.label}
                  {isActive && (
                    <motion.div
                      className="absolute inset-x-0 bottom-0 h-0.5 bg-zinc-900"
                      layoutId="reviewReadinessActiveTab"
                      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                    />
                  )}
                </button>
              );
            })}
          </nav>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-5xl mx-auto">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              {renderView}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}

export default ReviewReadiness;
