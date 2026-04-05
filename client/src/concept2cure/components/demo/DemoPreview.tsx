/**
 * @fileoverview DemoPreview — Visual preview panel for each demo step
 * @module concept2cure/components/demo/DemoPreview
 *
 * Right panel of the interactive demo. Renders static mockups of platform
 * features using real UI components with demo data.
 */

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Sparkles, FileCheck, Search, FileText, FlaskConical, Bot,
  LayoutDashboard, Shield, Users, CheckCircle, Clock, AlertTriangle,
  Zap, Eye, Globe, Lock, BookOpen, BarChart3,
  Activity, FolderOpen, Star, ArrowRight, Database, Brain,
  Microscope, Target, Layers, Award, Gauge,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ─── Shared sub-components ──────────────────────────────────────────────────

const MockCard: React.FC<{
  title: string;
  children: React.ReactNode;
  className?: string;
  icon?: React.ReactNode;
}> = ({ title, children, className, icon }) => (
  <div className={cn(
    'rounded-xl border border-stone-200/60 bg-white/90 backdrop-blur-sm p-4 shadow-sm',
    className,
  )}>
    <div className="flex items-center gap-2 mb-3">
      {icon}
      <h4 className="text-sm font-semibold text-stone-900">{title}</h4>
    </div>
    {children}
  </div>
);

const StatusBadge: React.FC<{ status: string; color: string }> = ({ status, color }) => (
  <span className={cn(
    'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium',
    color,
  )}>
    {status}
  </span>
);

const ProgressBar: React.FC<{ label: string; value: number; color?: string }> = ({
  label, value, color = 'bg-stone-500',
}) => (
  <div className="space-y-1">
    <div className="flex justify-between text-xs">
      <span className="text-stone-600">{label}</span>
      <span className="font-medium text-stone-900">{value}%</span>
    </div>
    <div className="h-1.5 bg-stone-100 rounded-full overflow-hidden">
      <div className={cn('h-full rounded-full transition-all duration-150', color)} style={{ width: `${value}%` }} />
    </div>
  </div>
);

const MetricBox: React.FC<{ label: string; value: string; trend?: string }> = ({ label, value, trend }) => (
  <div className="bg-stone-50 rounded-lg p-3 text-center">
    <p className="text-lg font-semibold text-stone-900">{value}</p>
    <p className="text-xs text-stone-500 mt-0.5">{label}</p>
    {trend && <p className="text-xs text-stone-700 mt-0.5">{trend}</p>}
  </div>
);

const TableRow: React.FC<{ cells: string[]; highlight?: boolean }> = ({ cells, highlight }) => (
  <tr className={highlight ? 'bg-stone-100/50' : ''}>
    {cells.map((c, i) => (
      <td key={i} className="px-3 py-2 text-xs text-stone-700 border-b border-stone-200">{c}</td>
    ))}
  </tr>
);

// ─── HERO ───────────────────────────────────────────────────────────────────

const HeroPreview: React.FC = () => (
  <div className="flex flex-col items-center justify-center h-full text-center px-8">
    <div className="w-14 h-14 rounded-lg bg-stone-800 flex items-center justify-center mb-6 shadow-sm">
      <Sparkles className="w-10 h-10 text-white" />
    </div>
    <h2 className="text-base font-semibold text-stone-900 mb-2">Concept2Cure.RI</h2>
    <h2 className="text-base font-semibold text-stone-900 mb-2">ClinicalSageAI</h2>
    <p className="text-sm text-stone-500 max-w-md">
      The unified regulatory intelligence platform. One AI co-pilot replacing 10-15 disconnected tools.
    </p>
    <div className="grid grid-cols-4 gap-3 mt-8 w-full max-w-lg">
      {['FDA', 'EMA', 'PMDA', 'NMPA'].map((a) => (
        <div key={a} className="bg-stone-50 rounded-lg py-2 px-3 text-xs font-medium text-stone-700 flex items-center justify-center gap-1">
          <Globe className="w-3 h-3" /> {a}
        </div>
      ))}
    </div>
    <div className="grid grid-cols-3 gap-2 mt-4 w-full max-w-lg">
      {['15+ Submission Types', '12+ AI Agents', '102 CMC Endpoints'].map((s) => (
        <div key={s} className="bg-stone-100 rounded-lg py-2 px-3 text-xs font-medium text-stone-700 text-center">{s}</div>
      ))}
    </div>
  </div>
);

// ─── CTA ────────────────────────────────────────────────────────────────────

const CTAPreview: React.FC = () => (
  <div className="flex flex-col items-center justify-center h-full text-center px-8">
    <Award className="w-16 h-16 text-stone-500 mb-6" />
    <h2 className="text-base font-semibold text-stone-900 mb-2">Ready to Transform Your Workflow?</h2>
    <p className="text-sm text-stone-500 max-w-md mb-6">
      Join teams at leading biotech, pharma, and CRO organizations who have consolidated their regulatory workflows into one platform.
    </p>
    <div className="grid grid-cols-2 gap-4 w-full max-w-md">
      <MetricBox label="Avg. Time Saved" value="65%" trend="per submission cycle" />
      <MetricBox label="Fewer CRLs" value="40%" trend="after platform adoption" />
      <MetricBox label="Faster Onboarding" value="4x" trend="vs. traditional methods" />
      <MetricBox label="Tools Replaced" value="12+" trend="consolidated into one" />
    </div>
  </div>
);

// ─── PATH 1: SUBMISSIONS ───────────────────────────────────────────────────

const SubPortfolioPreview: React.FC = () => (
  <div className="space-y-4">
    <MockCard title="Submission Portfolio" icon={<LayoutDashboard className="w-4 h-4 text-stone-500" />}>
      <div className="grid grid-cols-4 gap-3 mb-4">
        <MetricBox label="Active" value="12" />
        <MetricBox label="In Review" value="4" />
        <MetricBox label="Approved" value="23" />
        <MetricBox label="Pipeline" value="8" />
      </div>
      <div className="overflow-hidden rounded-lg border border-stone-200">
        <table className="w-full text-left">
          <thead><tr className="bg-stone-50">
            <th className="px-3 py-2 text-xs font-medium text-stone-500">Submission</th>
            <th className="px-3 py-2 text-xs font-medium text-stone-500">Type</th>
            <th className="px-3 py-2 text-xs font-medium text-stone-500">Agency</th>
            <th className="px-3 py-2 text-xs font-medium text-stone-500">Status</th>
            <th className="px-3 py-2 text-xs font-medium text-stone-500">Readiness</th>
          </tr></thead>
          <tbody>
            <TableRow cells={['NeuroStim Pro', '510(k)', 'FDA', 'Drafting', '72%']} highlight />
            <TableRow cells={['CardioWatch IND', 'IND', 'FDA', 'Review', '89%']} />
            <TableRow cells={['BioMarker-X', 'NDA', 'FDA', 'Pre-Submission', '45%']} />
            <TableRow cells={['PulseOx EU', 'MAA', 'EMA', 'Filing', '94%']} />
            <TableRow cells={['DiabetIQ', 'De Novo', 'FDA', 'Drafting', '38%']} />
            <TableRow cells={['RespAir Japan', 'CTN', 'PMDA', 'Validation', '67%']} />
          </tbody>
        </table>
      </div>
    </MockCard>
  </div>
);

const Sub510kPreview: React.FC = () => (
  <div className="space-y-4">
    <MockCard title="510(k) Predicate Research" icon={<Search className="w-4 h-4 text-stone-1000" />}>
      <div className="space-y-2 mb-3">
        <div className="flex items-center gap-2 px-3 py-2 bg-stone-50 rounded-lg text-xs">
          <Search className="w-3 h-3 text-stone-400" />
          <span className="text-stone-500">Search: "transcutaneous electrical nerve stimulator"</span>
        </div>
      </div>
      <div className="space-y-2">
        {[
          { name: 'NeuroStim 2000', code: 'QBF', match: '94%', manufacturer: 'NeuraTech Inc.' },
          { name: 'PainFree TENS', code: 'QBF', match: '87%', manufacturer: 'MediPulse Ltd.' },
          { name: 'StimWave Pro', code: 'QBF', match: '82%', manufacturer: 'WaveTherapy Corp.' },
        ].map((p) => (
          <div key={p.name} className="flex items-center justify-between p-3 bg-white border border-stone-200 rounded-lg">
            <div>
              <p className="text-xs font-medium text-stone-900">{p.name}</p>
              <p className="text-xs text-stone-500">{p.manufacturer} — Product Code: {p.code}</p>
            </div>
            <StatusBadge status={`${p.match} match`} color="bg-stone-100 text-stone-800" />
          </div>
        ))}
      </div>
    </MockCard>
    <MockCard title="SE Comparison Matrix" icon={<Layers className="w-4 h-4 text-stone-500" />}>
      <div className="grid grid-cols-3 gap-2">
        {['Intended Use', 'Technology', 'Performance', 'Biocompat.', 'Software', 'Labeling'].map((d) => (
          <div key={d} className="flex items-center gap-1 text-xs text-stone-600">
            <CheckCircle className="w-3 h-3 text-stone-1000" /> {d}
          </div>
        ))}
      </div>
    </MockCard>
  </div>
);

const SubINDPreview: React.FC = () => (
  <div className="space-y-4">
    <MockCard title="IND Workspace — eCTD Modules" icon={<FolderOpen className="w-4 h-4 text-stone-1000" />}>
      {[
        { mod: 'Module 1', name: 'Administrative', progress: 85, items: 'Cover letter, Form 1571, Intro Statement' },
        { mod: 'Module 2', name: 'Summaries', progress: 62, items: 'Quality Summary, Nonclinical Overview, Clinical Overview' },
        { mod: 'Module 3', name: 'Quality (CMC)', progress: 71, items: 'Drug Substance, Drug Product, Appendices' },
        { mod: 'Module 4', name: 'Nonclinical', progress: 48, items: 'Pharmacology, PK, Toxicology' },
        { mod: 'Module 5', name: 'Clinical', progress: 34, items: 'Study Reports, Literature' },
      ].map((m) => (
        <div key={m.mod} className="mb-3">
          <ProgressBar label={`${m.mod}: ${m.name}`} value={m.progress} />
          <p className="text-xs text-stone-400 mt-0.5 pl-1">{m.items}</p>
        </div>
      ))}
    </MockCard>
  </div>
);

const SubGlobalPreview: React.FC = () => (
  <div className="space-y-4">
    <MockCard title="Multi-Agency Filing Status" icon={<Globe className="w-4 h-4 text-stone-1000" />}>
      <div className="grid grid-cols-2 gap-3">
        {[
          { agency: 'FDA (US)', type: 'NDA', status: 'Filing', color: 'bg-stone-100 text-stone-800' },
          { agency: 'EMA (EU)', type: 'MAA', status: 'Drafting', color: 'bg-stone-100 text-stone-700' },
          { agency: 'PMDA (Japan)', type: 'CTN', status: 'Planning', color: 'bg-stone-100 text-stone-700' },
          { agency: 'NMPA (China)', type: 'NDA', status: 'Translation', color: 'bg-stone-100 text-stone-700' },
        ].map((a) => (
          <div key={a.agency} className="p-3 bg-stone-50 rounded-lg">
            <div className="flex justify-between items-start mb-2">
              <p className="text-xs font-medium text-stone-900">{a.agency}</p>
              <StatusBadge status={a.status} color={a.color} />
            </div>
            <p className="text-xs text-stone-500">{a.type} — Region-specific Module 1</p>
          </div>
        ))}
      </div>
    </MockCard>
  </div>
);

const SubMeetingsPreview: React.FC = () => (
  <div className="space-y-4">
    <MockCard title="FDA Meeting Tracker" icon={<Clock className="w-4 h-4 text-stone-1000" />}>
      {[
        { type: 'Pre-IND', date: 'Apr 15, 2026', status: 'Briefing Doc Ready', icon: <CheckCircle className="w-3 h-3 text-stone-1000" /> },
        { type: 'EOP2', date: 'Jul 22, 2026', status: 'Drafting Package', icon: <Clock className="w-3 h-3 text-stone-1000" /> },
        { type: 'Pre-NDA', date: 'Nov 10, 2026', status: 'Scheduled', icon: <Target className="w-3 h-3 text-stone-1000" /> },
      ].map((m) => (
        <div key={m.type} className="flex items-center justify-between p-3 border border-stone-200 rounded-lg mb-2">
          <div className="flex items-center gap-2">
            {m.icon}
            <div>
              <p className="text-xs font-medium text-stone-900">{m.type} Meeting</p>
              <p className="text-xs text-stone-500">{m.date}</p>
            </div>
          </div>
          <span className="text-xs text-stone-600">{m.status}</span>
        </div>
      ))}
    </MockCard>
  </div>
);

// ─── PATH 2: RESEARCH ───────────────────────────────────────────────────────

const ResSearchPreview: React.FC = () => (
  <div className="space-y-4">
    <MockCard title="AnA Research" icon={<Search className="w-4 h-4 text-stone-1000" />}>
      <div className="flex items-center gap-2 px-3 py-2 bg-stone-50 rounded-lg text-xs mb-3">
        <Brain className="w-3 h-3 text-stone-500" />
        <span className="text-stone-600">"What are the latest Phase 3 trials for GLP-1 agonists in obesity?"</span>
      </div>
      <div className="flex gap-2 mb-3">
        {['ClinicalTrials.gov', 'PubMed', 'FDA', 'EMA'].map((s) => (
          <StatusBadge key={s} status={s} color="bg-stone-100 text-stone-700" />
        ))}
      </div>
      <div className="flex items-center gap-2 text-xs text-stone-700">
        <Activity className="w-3 h-3" /> 847 results synthesized across 4 sources
      </div>
    </MockCard>
  </div>
);

const ResResultsPreview: React.FC = () => (
  <div className="space-y-4">
    <MockCard title="Structured Trial Results" icon={<Database className="w-4 h-4 text-stone-1000" />}>
      <div className="overflow-hidden rounded-lg border border-stone-200">
        <table className="w-full text-left">
          <thead><tr className="bg-stone-50">
            <th className="px-3 py-2 text-xs font-medium text-stone-500">Trial</th>
            <th className="px-3 py-2 text-xs font-medium text-stone-500">Phase</th>
            <th className="px-3 py-2 text-xs font-medium text-stone-500">Enrollment</th>
            <th className="px-3 py-2 text-xs font-medium text-stone-500">Primary Endpoint</th>
          </tr></thead>
          <tbody>
            <TableRow cells={['NCT05678901', 'Phase 3', '3,200', '% weight reduction at 68 wk']} highlight />
            <TableRow cells={['NCT05891234', 'Phase 3', '1,800', 'HbA1c change from baseline']} />
            <TableRow cells={['NCT06012345', 'Phase 2', '450', 'Liver fat reduction (MRI)']} />
          </tbody>
        </table>
      </div>
    </MockCard>
  </div>
);

const ResIntelligencePreview: React.FC = () => (
  <div className="space-y-4">
    <MockCard title="Regulatory Intelligence Feed" icon={<Zap className="w-4 h-4 text-stone-1000" />}>
      {[
        { title: 'FDA Draft Guidance: AI/ML in Drug Development', type: 'Guidance', date: 'Today', severity: 'bg-stone-100 text-stone-700' },
        { title: 'EMA CHMP Positive Opinion — Semaglutide', type: 'Approval', date: '2 days ago', severity: 'bg-stone-100 text-stone-800' },
        { title: 'Warning Letter: CMC Deficiencies — BioPharm Inc', type: 'Enforcement', date: '5 days ago', severity: 'bg-stone-100 text-stone-800' },
        { title: 'PMDA Science Board: Real-World Evidence', type: 'Advisory', date: '1 week ago', severity: 'bg-stone-100 text-stone-700' },
      ].map((a) => (
        <div key={a.title} className="flex items-start gap-2 p-2 border-b border-stone-50 last:border-0">
          <div className="flex-1">
            <p className="text-xs font-medium text-stone-900">{a.title}</p>
            <div className="flex gap-2 mt-1">
              <StatusBadge status={a.type} color={a.severity} />
              <span className="text-xs text-stone-400">{a.date}</span>
            </div>
          </div>
        </div>
      ))}
    </MockCard>
  </div>
);

const ResPrecedentPreview: React.FC = () => (
  <div className="space-y-4">
    <MockCard title="Precedent Finder" icon={<Target className="w-4 h-4 text-stone-500" />}>
      {[
        { name: 'Ozempic (semaglutide)', pathway: 'NDA — Standard', timeline: '10 months', outcome: 'Approved' },
        { name: 'Wegovy (semaglutide)', pathway: 'NDA — Priority', timeline: '6 months', outcome: 'Approved' },
        { name: 'Mounjaro (tirzepatide)', pathway: 'NDA — Priority', timeline: '8 months', outcome: 'Approved' },
      ].map((p) => (
        <div key={p.name} className="flex items-center justify-between p-3 border border-stone-200 rounded-lg mb-2">
          <div>
            <p className="text-xs font-medium text-stone-900">{p.name}</p>
            <p className="text-xs text-stone-500">{p.pathway} — {p.timeline} review</p>
          </div>
          <StatusBadge status={p.outcome} color="bg-stone-100 text-stone-800" />
        </div>
      ))}
    </MockCard>
  </div>
);

const ResEvidencePreview: React.FC = () => (
  <div className="space-y-4">
    <MockCard title="Evidence Manager" icon={<Database className="w-4 h-4 text-stone-1000" />}>
      <div className="grid grid-cols-3 gap-3 mb-3">
        <MetricBox label="Sources Linked" value="234" />
        <MetricBox label="Citations" value="1,847" />
        <MetricBox label="Coverage" value="96%" />
      </div>
      <div className="space-y-2">
        {['Module 2.5 — Clinical Overview', 'Module 2.7 — Clinical Summary', 'Module 5.3 — Study Reports'].map((s) => (
          <div key={s} className="flex items-center justify-between p-2 bg-stone-50 rounded-lg text-xs">
            <span className="text-stone-700">{s}</span>
            <CheckCircle className="w-3 h-3 text-stone-1000" />
          </div>
        ))}
      </div>
    </MockCard>
  </div>
);

// ─── PATH 3: AUTHORING ──────────────────────────────────────────────────────

const DocEditorPreview: React.FC = () => (
  <div className="space-y-4">
    <MockCard title="eCTD Co-Author" icon={<FileText className="w-4 h-4 text-stone-1000" />}>
      <div className="bg-stone-50 rounded-lg p-4 font-mono text-xs text-stone-700 space-y-2 mb-3">
        <p className="font-semibold text-stone-900">2.7.4 Summary of Clinical Safety</p>
        <p>The safety profile of [compound] was evaluated across <span className="bg-stone-100 text-stone-700 px-1 rounded">3 pivotal trials</span> enrolling a total of <span className="bg-stone-100 text-stone-700 px-1 rounded">4,200 subjects</span>.</p>
        <p className="text-stone-400 italic">AI suggestion: "Consider adding the treatment-emergent adverse events table reference (Table 14.3.1.1)..."</p>
      </div>
      <div className="flex gap-2">
        <StatusBadge status="Auto-Saved" color="bg-stone-100 text-stone-800" />
        <StatusBadge status="Compliance: OK" color="bg-stone-100 text-stone-700" />
        <StatusBadge status="v3.2" color="bg-stone-100 text-stone-600" />
      </div>
    </MockCard>
  </div>
);

const DocCSRPreview: React.FC = () => (
  <div className="space-y-4">
    <MockCard title="CSR Builder — ICH E3" icon={<FileCheck className="w-4 h-4 text-stone-1000" />}>
      {[
        { section: 'Synopsis', status: 'Complete', progress: 100 },
        { section: 'Study Design & Methodology', status: 'AI Drafting', progress: 78 },
        { section: 'Efficacy Results', status: 'In Review', progress: 65 },
        { section: 'Safety Results', status: 'Pending Data', progress: 30 },
        { section: 'Statistical Analysis', status: 'Queued', progress: 10 },
      ].map((s) => (
        <div key={s.section} className="mb-3">
          <ProgressBar label={s.section} value={s.progress} color={s.progress === 100 ? 'bg-stone-1000' : 'bg-stone-500'} />
        </div>
      ))}
    </MockCard>
  </div>
);

const DocTemplatesPreview: React.FC = () => (
  <div className="space-y-4">
    <MockCard title="Template Library" icon={<BookOpen className="w-4 h-4 text-stone-500" />}>
      <div className="grid grid-cols-2 gap-2">
        {[
          { agency: 'FDA', types: 'IND, NDA, 510(k), PMA, De Novo' },
          { agency: 'EMA', types: 'MAA, CTA, PSUR, RMP' },
          { agency: 'PMDA', types: 'CTN, MAA (Japan)' },
          { agency: 'NMPA', types: 'IND, NDA (China)' },
        ].map((t) => (
          <div key={t.agency} className="p-3 bg-stone-50 rounded-lg">
            <p className="text-xs font-semibold text-stone-900 mb-1">{t.agency}</p>
            <p className="text-xs text-stone-500">{t.types}</p>
          </div>
        ))}
      </div>
    </MockCard>
  </div>
);

const DocVaultPreview: React.FC = () => (
  <div className="space-y-4">
    <MockCard title="Document Vault" icon={<FolderOpen className="w-4 h-4 text-stone-1000" />}>
      <div className="grid grid-cols-3 gap-3 mb-3">
        <MetricBox label="Documents" value="2,847" />
        <MetricBox label="Versions" value="12K+" />
        <MetricBox label="Storage" value="48 GB" />
      </div>
      <div className="space-y-1">
        {[
          { name: 'Clinical Overview v4.1.docx', date: 'Today', status: 'Approved' },
          { name: 'CMC Section 3.2.S.pdf', date: 'Yesterday', status: 'In Review' },
          { name: 'Protocol Amendment #3.docx', date: '3 days ago', status: 'Draft' },
        ].map((d) => (
          <div key={d.name} className="flex items-center justify-between p-2 bg-stone-50 rounded-lg text-xs">
            <div>
              <span className="text-stone-700">{d.name}</span>
              <span className="text-stone-400 ml-2">{d.date}</span>
            </div>
            <StatusBadge status={d.status} color={d.status === 'Approved' ? 'bg-stone-100 text-stone-800' : d.status === 'In Review' ? 'bg-stone-100 text-stone-700' : 'bg-stone-100 text-stone-600'} />
          </div>
        ))}
      </div>
    </MockCard>
  </div>
);

const DocSherpaPreview: React.FC = () => (
  <div className="space-y-4">
    <MockCard title="AnA Guided Authoring" icon={<Eye className="w-4 h-4 text-stone-500" />}>
      <div className="space-y-2">
        {[
          { check: 'Cross-reference validation', status: '2 issues found', icon: <AlertTriangle className="w-3 h-3 text-stone-1000" /> },
          { check: 'IFU consistency', status: 'Passed', icon: <CheckCircle className="w-3 h-3 text-stone-1000" /> },
          { check: 'Labeling compliance', status: 'Passed', icon: <CheckCircle className="w-3 h-3 text-stone-1000" /> },
          { check: 'Formatting (agency specs)', status: 'Passed', icon: <CheckCircle className="w-3 h-3 text-stone-1000" /> },
          { check: 'eCTD structure valid', status: 'Passed', icon: <CheckCircle className="w-3 h-3 text-stone-1000" /> },
        ].map((c) => (
          <div key={c.check} className="flex items-center justify-between p-2 bg-stone-50 rounded-lg text-xs">
            <div className="flex items-center gap-2">
              {c.icon}
              <span className="text-stone-700">{c.check}</span>
            </div>
            <span className="text-stone-500">{c.status}</span>
          </div>
        ))}
      </div>
    </MockCard>
  </div>
);

// ─── PATH 4: CMC ────────────────────────────────────────────────────────────

const CMCBlueprintPreview: React.FC = () => (
  <div className="space-y-4">
    <MockCard title="CMC Platform" icon={<FlaskConical className="w-4 h-4 text-stone-1000" />}>
      <div className="grid grid-cols-3 gap-3 mb-3">
        <MetricBox label="API Endpoints" value="102" />
        <MetricBox label="Drug Products" value="8" />
        <MetricBox label="Batch Records" value="147" />
      </div>
      {[
        { section: 'Drug Substance (3.2.S)', progress: 82 },
        { section: 'Drug Product (3.2.P)', progress: 67 },
        { section: 'Appendices (3.2.A)', progress: 45 },
        { section: 'Regional Info (3.2.R)', progress: 90 },
      ].map((s) => (
        <div key={s.section} className="mb-2">
          <ProgressBar label={s.section} value={s.progress} />
        </div>
      ))}
    </MockCard>
  </div>
);

const CMCAnalyticalPreview: React.FC = () => (
  <div className="space-y-4">
    <MockCard title="Analytical Methods & Validation" icon={<Microscope className="w-4 h-4 text-stone-1000" />}>
      <div className="overflow-hidden rounded-lg border border-stone-200">
        <table className="w-full text-left">
          <thead><tr className="bg-stone-50">
            <th className="px-3 py-2 text-xs font-medium text-stone-500">Method</th>
            <th className="px-3 py-2 text-xs font-medium text-stone-500">Status</th>
            <th className="px-3 py-2 text-xs font-medium text-stone-500">ICH Q2</th>
          </tr></thead>
          <tbody>
            <TableRow cells={['HPLC Assay', 'Validated', 'Compliant']} />
            <TableRow cells={['Dissolution', 'Validated', 'Compliant']} />
            <TableRow cells={['Karl Fischer', 'In Progress', 'Pending']} highlight />
            <TableRow cells={['Residual Solvents (GC)', 'Validated', 'Compliant']} />
          </tbody>
        </table>
      </div>
    </MockCard>
  </div>
);

const CMCManufacturingPreview: React.FC = () => (
  <div className="space-y-4">
    <MockCard title="Manufacturing & Scale-Up" icon={<Gauge className="w-4 h-4 text-stone-1000" />}>
      {[
        { step: 'Synthesis Step 1 — Starting Material', status: 'Production', scale: 'Commercial' },
        { step: 'Purification — Column Chromatography', status: 'Validation', scale: 'Pilot' },
        { step: 'Formulation — Lyophilization', status: 'Development', scale: 'Lab' },
        { step: 'Fill/Finish — Aseptic Processing', status: 'Planning', scale: 'Pre-clinical' },
      ].map((s) => (
        <div key={s.step} className="flex items-center justify-between p-2 border-b border-stone-50 last:border-0">
          <div>
            <p className="text-xs text-stone-900">{s.step}</p>
            <p className="text-xs text-stone-500">Scale: {s.scale}</p>
          </div>
          <StatusBadge status={s.status} color={s.status === 'Production' ? 'bg-stone-100 text-stone-800' : 'bg-stone-100 text-stone-700'} />
        </div>
      ))}
    </MockCard>
  </div>
);

const CMCReadinessPreview: React.FC = () => (
  <div className="space-y-4">
    <MockCard title="CMC Readiness — Module 3" icon={<Gauge className="w-4 h-4 text-stone-500" />}>
      <div className="grid grid-cols-2 gap-3 mb-4">
        <MetricBox label="Overall Readiness" value="74%" trend="Improving" />
        <MetricBox label="Gaps Found" value="6" trend="2 critical" />
      </div>
      <div className="space-y-2">
        {[
          { gap: 'Stability data at 25°C/60% RH — only 6 months (need 12)', critical: true },
          { gap: 'Container closure compatibility study incomplete', critical: true },
          { gap: 'Impurity B characterization pending NMR', critical: false },
          { gap: 'Process validation protocol — draft only', critical: false },
        ].map((g) => (
          <div key={g.gap} className="flex items-start gap-2 p-2 bg-stone-50 rounded-lg">
            <AlertTriangle className={cn('w-3 h-3 mt-0.5', g.critical ? 'text-stone-1000' : 'text-stone-1000')} />
            <span className="text-xs text-stone-700">{g.gap}</span>
          </div>
        ))}
      </div>
    </MockCard>
  </div>
);

// ─── PATH 5: AI AGENTS ──────────────────────────────────────────────────────

const AISwarmPreview: React.FC = () => (
  <div className="space-y-4">
    <MockCard title="AnA Agents — Active" icon={<Bot className="w-4 h-4 text-stone-500" />}>
      <div className="grid grid-cols-3 gap-2">
        {[
          { name: 'Predicate Researcher', status: 'Complete', phase: 'Planning' },
          { name: 'Evidence Agent', status: 'Running', phase: 'Planning' },
          { name: 'Protocol Analyzer', status: 'Complete', phase: 'Planning' },
          { name: 'Drafter', status: 'Running', phase: 'Drafting' },
          { name: 'Statistician', status: 'Queued', phase: 'Drafting' },
          { name: 'QC Agent', status: 'Queued', phase: 'Review' },
          { name: 'Compliance Agent', status: 'Running', phase: 'Review' },
          { name: 'Translator', status: 'Idle', phase: 'Drafting' },
          { name: 'Compiler', status: 'Queued', phase: 'Assembly' },
        ].map((a) => (
          <div key={a.name} className="p-2 bg-stone-50 rounded-lg text-center">
            <Bot className={cn('w-4 h-4 mx-auto mb-1', a.status === 'Running' ? 'text-stone-500' : a.status === 'Complete' ? 'text-stone-1000' : 'text-stone-400')} />
            <p className="text-xs font-medium text-stone-700 truncate">{a.name}</p>
            <StatusBadge status={a.status} color={a.status === 'Running' ? 'bg-stone-100 text-stone-700' : a.status === 'Complete' ? 'bg-stone-100 text-stone-800' : 'bg-stone-100 text-stone-500'} />
          </div>
        ))}
      </div>
    </MockCard>
  </div>
);

const AISnowglobePreview: React.FC = () => (
  <div className="space-y-4">
    <MockCard title="AnA Predictions — Scenario Modeling" icon={<Brain className="w-4 h-4 text-stone-500" />}>
      <div className="grid grid-cols-2 gap-3">
        {[
          { scenario: 'Baseline Filing', probability: '72%', timeline: '10 months', risk: 'Medium' },
          { scenario: 'With Additional Data', probability: '89%', timeline: '14 months', risk: 'Low' },
        ].map((s) => (
          <div key={s.scenario} className="p-3 border border-stone-200 rounded-lg">
            <p className="text-xs font-medium text-stone-900 mb-2">{s.scenario}</p>
            <div className="space-y-1">
              <p className="text-xs text-stone-600">Approval probability: <span className="font-semibold text-stone-700">{s.probability}</span></p>
              <p className="text-xs text-stone-600">Est. timeline: {s.timeline}</p>
              <p className="text-xs text-stone-600">Risk: {s.risk}</p>
            </div>
          </div>
        ))}
      </div>
    </MockCard>
  </div>
);

const AIReviewPulsePreview: React.FC = () => (
  <div className="space-y-4">
    <MockCard title="Review Pulse" icon={<Activity className="w-4 h-4 text-stone-1000" />}>
      <div className="grid grid-cols-3 gap-3 mb-3">
        <MetricBox label="Readiness" value="78%" trend="Improving" />
        <MetricBox label="Open Risks" value="5" />
        <MetricBox label="AI Findings" value="12" />
      </div>
      <div className="space-y-1">
        {[
          { finding: 'Module 3.2.S stability data gap detected', severity: 'High' },
          { finding: 'Cross-reference mismatch in Section 2.7', severity: 'Medium' },
          { finding: 'Biostatistics SAP needs update for endpoint change', severity: 'High' },
        ].map((f) => (
          <div key={f.finding} className="flex items-center gap-2 p-2 bg-stone-50 rounded-lg text-xs">
            <AlertTriangle className={cn('w-3 h-3', f.severity === 'High' ? 'text-stone-1000' : 'text-stone-1000')} />
            <span className="text-stone-700 flex-1">{f.finding}</span>
            <StatusBadge status={f.severity} color={f.severity === 'High' ? 'bg-stone-100 text-stone-800' : 'bg-stone-100 text-stone-700'} />
          </div>
        ))}
      </div>
    </MockCard>
  </div>
);

const AIDualPreview: React.FC = () => (
  <div className="space-y-4">
    <div className="grid grid-cols-2 gap-4">
      <MockCard title="AnA 1.0" icon={<Sparkles className="w-4 h-4 text-stone-500" />}>
        <p className="text-xs text-stone-600 mb-2">Regulatory strategy & authoring co-pilot</p>
        <div className="space-y-1">
          {['Submission strategy', 'Document co-writing', 'Regulatory Q&A', 'Compliance checking'].map((f) => (
            <div key={f} className="flex items-center gap-1 text-xs text-stone-600">
              <CheckCircle className="w-3 h-3 text-stone-500" /> {f}
            </div>
          ))}
        </div>
      </MockCard>
      <MockCard title="Dr. Sage" icon={<BookOpen className="w-4 h-4 text-stone-1000" />}>
        <p className="text-xs text-stone-600 mb-2">Contextual training & enablement</p>
        <div className="space-y-1">
          {['Just-in-time training', 'Contextual help', 'Certification programs', 'Role-specific guides'].map((f) => (
            <div key={f} className="flex items-center gap-1 text-xs text-stone-600">
              <CheckCircle className="w-3 h-3 text-stone-1000" /> {f}
            </div>
          ))}
        </div>
      </MockCard>
    </div>
  </div>
);

// ─── PATH 6: PROJECT MANAGEMENT ─────────────────────────────────────────────

const PMMissionPreview: React.FC = () => (
  <div className="space-y-4">
    <MockCard title="Mission Control" icon={<LayoutDashboard className="w-4 h-4 text-stone-500" />}>
      <div className="grid grid-cols-4 gap-3 mb-3">
        <MetricBox label="Programs" value="3" />
        <MetricBox label="Projects" value="12" />
        <MetricBox label="On Track" value="9" trend="75%" />
        <MetricBox label="At Risk" value="2" />
      </div>
      <div className="space-y-1">
        {[
          { name: 'Oncology Program', projects: 4, status: 'On Track' },
          { name: 'CNS Program', projects: 3, status: 'At Risk' },
          { name: 'Metabolic Program', projects: 5, status: 'On Track' },
        ].map((p) => (
          <div key={p.name} className="flex items-center justify-between p-2 bg-stone-50 rounded-lg text-xs">
            <span className="text-stone-700">{p.name} ({p.projects} projects)</span>
            <StatusBadge status={p.status} color={p.status === 'On Track' ? 'bg-stone-100 text-stone-800' : 'bg-stone-100 text-stone-800'} />
          </div>
        ))}
      </div>
    </MockCard>
  </div>
);

const PMTimelinesPreview: React.FC = () => (
  <div className="space-y-4">
    <MockCard title="Project Timeline" icon={<Clock className="w-4 h-4 text-stone-1000" />}>
      {[
        { milestone: 'Pre-IND Meeting', date: 'Apr 2026', status: 'complete' },
        { milestone: 'IND Filing', date: 'Jun 2026', status: 'current' },
        { milestone: 'Phase 1 Start', date: 'Aug 2026', status: 'upcoming' },
        { milestone: 'End of Phase 2', date: 'Mar 2027', status: 'upcoming' },
        { milestone: 'PDUFA Date', date: 'Dec 2027', status: 'upcoming' },
      ].map((m) => (
        <div key={m.milestone} className="flex items-center gap-3 py-2">
          <div className={cn('w-3 h-3 rounded-full border-2', m.status === 'complete' ? 'bg-stone-1000 border-stone-1000' : m.status === 'current' ? 'bg-stone-500 border-stone-500' : 'bg-white border-stone-300')} />
          <div className="flex-1 flex justify-between">
            <span className="text-xs text-stone-700">{m.milestone}</span>
            <span className="text-xs text-stone-500">{m.date}</span>
          </div>
        </div>
      ))}
    </MockCard>
  </div>
);

const PMTasksPreview: React.FC = () => (
  <div className="space-y-4">
    <MockCard title="Task Board" icon={<BarChart3 className="w-4 h-4 text-stone-1000" />}>
      <div className="grid grid-cols-3 gap-2">
        {[
          { col: 'To Do', items: ['Draft Module 2.5', 'Review bioequiv data'] },
          { col: 'In Progress', items: ['CMC stability report', 'Protocol amendment'] },
          { col: 'Done', items: ['Cover letter', 'Form 1571'] },
        ].map((c) => (
          <div key={c.col} className="bg-stone-50 rounded-lg p-2">
            <p className="text-xs font-semibold text-stone-600 mb-2">{c.col}</p>
            {c.items.map((item) => (
              <div key={item} className="bg-white rounded p-1.5 mb-1 text-xs text-stone-700 border border-stone-200 shadow-sm">{item}</div>
            ))}
          </div>
        ))}
      </div>
    </MockCard>
  </div>
);

const PMDecisionsPreview: React.FC = () => (
  <div className="space-y-4">
    <MockCard title="Decision Log" icon={<Star className="w-4 h-4 text-stone-1000" />}>
      {[
        { decision: 'Selected accelerated approval pathway', date: 'Mar 12', signers: 3 },
        { decision: 'Changed primary endpoint to ORR', date: 'Mar 8', signers: 5 },
        { decision: 'Approved CMO selection — BioContract Inc', date: 'Mar 1', signers: 4 },
      ].map((d) => (
        <div key={d.decision} className="p-2 border-b border-stone-50 last:border-0">
          <p className="text-xs text-stone-900">{d.decision}</p>
          <div className="flex gap-2 mt-1">
            <span className="text-xs text-stone-400">{d.date}</span>
            <span className="text-xs text-stone-700">{d.signers} sign-offs</span>
          </div>
        </div>
      ))}
    </MockCard>
  </div>
);

const PMGapsPreview: React.FC = () => (
  <div className="space-y-4">
    <MockCard title="Submission Gap Analysis" icon={<AlertTriangle className="w-4 h-4 text-stone-1000" />}>
      <div className="grid grid-cols-2 gap-3 mb-3">
        <MetricBox label="Completeness" value="82%" trend="12 gaps remaining" />
        <MetricBox label="Critical Gaps" value="3" />
      </div>
      {[
        { module: 'Module 3', gap: 'Missing stability data (12-month)', severity: 'Critical' },
        { module: 'Module 5', gap: 'Study report #3 — tables incomplete', severity: 'Critical' },
        { module: 'Module 1', gap: 'Patent cert letter pending', severity: 'Medium' },
      ].map((g) => (
        <div key={g.gap} className="flex items-start gap-2 p-2 bg-stone-50 rounded-lg mb-1">
          <AlertTriangle className={cn('w-3 h-3 mt-0.5', g.severity === 'Critical' ? 'text-stone-1000' : 'text-stone-1000')} />
          <div>
            <p className="text-xs font-medium text-stone-700">{g.module}: {g.gap}</p>
            <StatusBadge status={g.severity} color={g.severity === 'Critical' ? 'bg-stone-100 text-stone-800' : 'bg-stone-100 text-stone-700'} />
          </div>
        </div>
      ))}
    </MockCard>
  </div>
);

// ─── PATH 7: SECURITY ───────────────────────────────────────────────────────

const SecAuditPreview: React.FC = () => (
  <div className="space-y-4">
    <MockCard title="21 CFR Part 11 — Audit Trail" icon={<Shield className="w-4 h-4 text-stone-1000" />}>
      <div className="overflow-hidden rounded-lg border border-stone-200">
        <table className="w-full text-left">
          <thead><tr className="bg-stone-50">
            <th className="px-3 py-2 text-xs font-medium text-stone-500">Action</th>
            <th className="px-3 py-2 text-xs font-medium text-stone-500">User</th>
            <th className="px-3 py-2 text-xs font-medium text-stone-500">Timestamp</th>
            <th className="px-3 py-2 text-xs font-medium text-stone-500">Hash</th>
          </tr></thead>
          <tbody>
            <TableRow cells={['Document approved', 'Dr. Smith', '14:32:01 UTC', 'a7f3...8c21']} />
            <TableRow cells={['Section 2.5 edited', 'J. Chen', '14:28:45 UTC', 'b2e1...4f09']} highlight />
            <TableRow cells={['E-signature applied', 'Dr. Smith', '13:55:12 UTC', 'c9d4...1a73']} />
            <TableRow cells={['Version created (v3.2)', 'System', '13:50:00 UTC', 'e1f2...6b84']} />
          </tbody>
        </table>
      </div>
    </MockCard>
  </div>
);

const SecRBACPreview: React.FC = () => (
  <div className="space-y-4">
    <MockCard title="Role-Based Access Control" icon={<Lock className="w-4 h-4 text-stone-500" />}>
      <div className="space-y-2">
        {[
          { role: 'Regulatory Writer', access: 'Draft, Edit, Submit for Review', count: 12 },
          { role: 'Regulatory Strategist', access: 'Full access, Approve, Sign', count: 4 },
          { role: 'QC Reviewer', access: 'Read, Comment, Approve', count: 6 },
          { role: 'Executive', access: 'Dashboards, Reports (Read-only)', count: 3 },
          { role: 'External (CRO)', access: 'Project-scoped Read/Write', count: 8 },
        ].map((r) => (
          <div key={r.role} className="flex items-center justify-between p-2 bg-stone-50 rounded-lg">
            <div>
              <p className="text-xs font-medium text-stone-900">{r.role}</p>
              <p className="text-xs text-stone-500">{r.access}</p>
            </div>
            <span className="text-xs text-stone-400">{r.count} users</span>
          </div>
        ))}
      </div>
    </MockCard>
  </div>
);

const SecInspectionPreview: React.FC = () => (
  <div className="space-y-4">
    <MockCard title="Inspection Readiness" icon={<Eye className="w-4 h-4 text-stone-1000" />}>
      <div className="grid grid-cols-2 gap-3 mb-3">
        <MetricBox label="Readiness Score" value="94%" trend="Inspection-ready" />
        <MetricBox label="Open Items" value="2" />
      </div>
      {[
        { item: 'Audit trail export', status: 'Ready', icon: <CheckCircle className="w-3 h-3 text-stone-1000" /> },
        { item: 'Document staging', status: 'Ready', icon: <CheckCircle className="w-3 h-3 text-stone-1000" /> },
        { item: 'E-signature log', status: 'Ready', icon: <CheckCircle className="w-3 h-3 text-stone-1000" /> },
        { item: 'Training records', status: 'Pending', icon: <Clock className="w-3 h-3 text-stone-1000" /> },
      ].map((i) => (
        <div key={i.item} className="flex items-center gap-2 p-2 bg-stone-50 rounded-lg mb-1 text-xs">
          {i.icon}
          <span className="text-stone-700 flex-1">{i.item}</span>
          <span className="text-stone-500">{i.status}</span>
        </div>
      ))}
    </MockCard>
  </div>
);

const SecGovernancePreview: React.FC = () => (
  <div className="space-y-4">
    <MockCard title="Data Governance & Certificates" icon={<Award className="w-4 h-4 text-stone-500" />}>
      <div className="grid grid-cols-2 gap-2">
        {[
          { standard: '21 CFR Part 11', status: 'Compliant' },
          { standard: 'HIPAA', status: 'Compliant' },
          { standard: 'GDPR', status: 'Compliant' },
          { standard: 'SOC 2 Type II', status: 'Certified' },
        ].map((s) => (
          <div key={s.standard} className="flex items-center gap-2 p-2 bg-stone-50 rounded-lg">
            <CheckCircle className="w-3 h-3 text-stone-1000" />
            <div>
              <p className="text-xs font-medium text-stone-900">{s.standard}</p>
              <p className="text-xs text-stone-700">{s.status}</p>
            </div>
          </div>
        ))}
      </div>
    </MockCard>
  </div>
);

// ─── PATH 8: COLLABORATION ──────────────────────────────────────────────────

const CollabHubPreview: React.FC = () => (
  <div className="space-y-4">
    <MockCard title="Collaboration Hub" icon={<Users className="w-4 h-4 text-stone-1000" />}>
      {[
        { thread: 'CMC Stability Discussion', replies: 12, last: '2h ago', unread: true },
        { thread: 'Protocol Amendment Review', replies: 8, last: '5h ago', unread: true },
        { thread: 'Module 2 Clinical Overview', replies: 23, last: '1d ago', unread: false },
      ].map((t) => (
        <div key={t.thread} className="flex items-center justify-between p-2 border-b border-stone-50 last:border-0">
          <div className="flex items-center gap-2">
            {t.unread && <div className="w-2 h-2 rounded-full bg-stone-500" />}
            <div>
              <p className="text-xs text-stone-900">{t.thread}</p>
              <p className="text-xs text-stone-400">{t.replies} replies — {t.last}</p>
            </div>
          </div>
          <ArrowRight className="w-3 h-3 text-stone-400" />
        </div>
      ))}
    </MockCard>
  </div>
);

const CollabReviewPreview: React.FC = () => (
  <div className="space-y-4">
    <MockCard title="Review Queue" icon={<FileCheck className="w-4 h-4 text-stone-1000" />}>
      {[
        { doc: 'Clinical Overview v4.1', reviewer: 'Dr. Smith', due: 'Tomorrow', sla: 'On Track' },
        { doc: 'CMC Section 3.2.S', reviewer: 'J. Chen', due: '3 days', sla: 'On Track' },
        { doc: 'Protocol Synopsis', reviewer: 'M. Patel', due: 'Overdue', sla: 'Escalated' },
      ].map((r) => (
        <div key={r.doc} className="flex items-center justify-between p-2 border-b border-stone-50 last:border-0">
          <div>
            <p className="text-xs text-stone-900">{r.doc}</p>
            <p className="text-xs text-stone-500">{r.reviewer} — Due: {r.due}</p>
          </div>
          <StatusBadge status={r.sla} color={r.sla === 'Escalated' ? 'bg-stone-100 text-stone-800' : 'bg-stone-100 text-stone-800'} />
        </div>
      ))}
    </MockCard>
  </div>
);

const CollabReportsPreview: React.FC = () => (
  <div className="space-y-4">
    <MockCard title="Report Center" icon={<BarChart3 className="w-4 h-4 text-stone-500" />}>
      <div className="grid grid-cols-3 gap-2 mb-3">
        {['PDF', 'Word', 'eCTD XML'].map((f) => (
          <div key={f} className="bg-stone-50 rounded-lg py-2 text-center text-xs font-medium text-stone-600">{f} Export</div>
        ))}
      </div>
      <div className="space-y-1">
        {[
          'Compliance Validation Report',
          'Submission Progress Dashboard',
          'Risk Assessment Summary',
          'Team Productivity Metrics',
        ].map((r) => (
          <div key={r} className="flex items-center gap-2 p-2 bg-stone-50 rounded-lg text-xs text-stone-700">
            <FileText className="w-3 h-3 text-stone-400" /> {r}
          </div>
        ))}
      </div>
    </MockCard>
  </div>
);

const CollabPostmarketPreview: React.FC = () => (
  <div className="space-y-4">
    <MockCard title="Post-Market Surveillance" icon={<Activity className="w-4 h-4 text-stone-1000" />}>
      <div className="grid grid-cols-3 gap-3 mb-3">
        <MetricBox label="AE Reports" value="47" />
        <MetricBox label="Open CAPAs" value="3" />
        <MetricBox label="Complaints" value="12" />
      </div>
      <div className="space-y-1">
        {[
          { item: 'Adverse Event Tracking', status: 'Active' },
          { item: 'CAPA Management', status: 'Active' },
          { item: 'Complaint Handling', status: 'Active' },
          { item: 'Post-Market Clinical Follow-Up', status: 'Scheduled' },
        ].map((i) => (
          <div key={i.item} className="flex items-center justify-between p-2 bg-stone-50 rounded-lg text-xs">
            <span className="text-stone-700">{i.item}</span>
            <StatusBadge status={i.status} color="bg-stone-100 text-stone-700" />
          </div>
        ))}
      </div>
    </MockCard>
  </div>
);

const CollabAcademyPreview: React.FC = () => (
  <div className="space-y-4">
    <MockCard title="Academy & Enablement" icon={<BookOpen className="w-4 h-4 text-stone-1000" />}>
      <div className="grid grid-cols-2 gap-3 mb-3">
        <MetricBox label="Courses" value="24" />
        <MetricBox label="Certifications" value="6" />
      </div>
      {[
        { course: '510(k) Mastery', role: 'MedTech', progress: 75, duration: '4h' },
        { course: 'eCTD Authoring Essentials', role: 'All', progress: 100, duration: '3h' },
        { course: 'CMC Documentation', role: 'Quality/CMC', progress: 40, duration: '6h' },
        { course: 'Regulatory Strategy 101', role: 'Strategist', progress: 0, duration: '2h' },
      ].map((c) => (
        <div key={c.course} className="mb-2">
          <div className="flex justify-between text-xs mb-0.5">
            <span className="text-stone-700">{c.course}</span>
            <span className="text-stone-400">{c.duration}</span>
          </div>
          <ProgressBar label="" value={c.progress} color={c.progress === 100 ? 'bg-stone-1000' : 'bg-stone-500'} />
        </div>
      ))}
    </MockCard>
  </div>
);

// ─── Nano Banana Visual AI Previews ─────────────────────────────────────────

const NanoBananaOverviewPreview: React.FC = () => (
  <div className="space-y-4">
    <div className="text-center mb-6">
      <div className="text-lg mb-2">🍌</div>
      <h3 className="text-lg font-semibold text-stone-900">AnA Visual</h3>
      <p className="text-xs text-stone-500">Powered by Google Gemini</p>
    </div>
    <div className="grid grid-cols-3 gap-3">
      {[
        { title: 'Infographics', metric: '4K', desc: 'Publication-ready', color: 'bg-stone-100 border-stone-200' },
        { title: 'Slide Decks', metric: 'PPTX', desc: 'Auto-generated', color: 'bg-stone-100 border-stone-200' },
        { title: 'Diagrams', metric: '<12s', desc: 'Per image', color: 'bg-stone-100 border-stone-200' },
      ].map(c => (
        <div key={c.title} className={cn('rounded-xl border p-3 text-center', c.color)}>
          <div className="text-lg font-semibold text-stone-900">{c.metric}</div>
          <div className="text-xs font-medium text-stone-700">{c.title}</div>
          <div className="text-xs text-stone-500">{c.desc}</div>
        </div>
      ))}
    </div>
    <MockCard title="Style Options" icon={<Sparkles className="w-4 h-4 text-stone-1000" />}>
      <div className="flex flex-wrap gap-1.5">
        {['Infographic', 'Illustration', 'Photorealistic', 'Slide Visual'].map(s => (
          <span key={s} className="px-2 py-1 text-xs font-medium rounded-full bg-stone-100 text-stone-700 border border-stone-200">{s}</span>
        ))}
      </div>
    </MockCard>
    <MockCard title="Platform Integration" icon={<Layers className="w-4 h-4 text-stone-500" />}>
      {['AnA Chat', 'Report Center', 'Document Builder', 'Program Analytics', 'Training'].map(m => (
        <div key={m} className="flex items-center gap-2 py-1">
          <CheckCircle className="w-3 h-3 text-stone-1000" />
          <span className="text-xs text-stone-700">{m}</span>
        </div>
      ))}
    </MockCard>
  </div>
);

const NanoBananaGeneratePreview: React.FC = () => (
  <div className="space-y-4">
    <MockCard title="Image Generation" icon={<Sparkles className="w-4 h-4 text-stone-1000" />}>
      <div className="bg-stone-50 rounded-lg p-3 mb-3">
        <div className="text-xs text-stone-400 mb-1">Prompt</div>
        <div className="text-xs text-stone-700 italic">"Infographic showing IND submission timeline with Phase 1-3 milestones, FDA review gates, and approval pathway"</div>
      </div>
      <div className="bg-stone-100 rounded-lg p-6 flex items-center justify-center border border-stone-200">
        <div className="text-center">
          <div className="text-lg font-medium mb-1">🖼️</div>
          <div className="text-xs font-medium text-stone-700">4096 x 4096 Generated</div>
          <div className="text-xs text-stone-1000">11.4s · SynthID watermarked</div>
        </div>
      </div>
    </MockCard>
    <MockCard title="Cost Controls" icon={<Shield className="w-4 h-4 text-stone-1000" />}>
      {[
        { label: 'Rate Limiting', desc: 'Per-user daily caps by tier' },
        { label: 'Response Caching', desc: 'Same prompt = cached result (1hr TTL)' },
        { label: 'Resolution Gating', desc: 'Free: 2K · Pro: 4K' },
      ].map(c => (
        <div key={c.label} className="flex items-start gap-2 py-1.5">
          <Lock className="w-3 h-3 text-stone-1000 mt-0.5 shrink-0" />
          <div>
            <div className="text-xs font-medium text-stone-900">{c.label}</div>
            <div className="text-xs text-stone-500">{c.desc}</div>
          </div>
        </div>
      ))}
    </MockCard>
  </div>
);

const NanoBananaIntegrationsPreview: React.FC = () => (
  <div className="space-y-4">
    {[
      { name: 'AnA Chat', desc: 'Switch to AnA Visual mode, describe what you need', icon: <Bot className="w-4 h-4 text-stone-500" />, color: 'border-stone-200' },
      { name: 'Report Center', desc: 'Generate visuals alongside readiness briefs & transmittals', icon: <BarChart3 className="w-4 h-4 text-stone-1000" />, color: 'border-stone-200' },
      { name: 'Document Builder', desc: 'Insert AI figures into CSR/CTD sections during review', icon: <FileText className="w-4 h-4 text-stone-1000" />, color: 'border-stone-200' },
      { name: 'Program Analytics', desc: 'Export dashboards as infographics or slide decks', icon: <Activity className="w-4 h-4 text-stone-1000" />, color: 'border-stone-200' },
      { name: 'Training Center', desc: 'Auto-generate training materials with regulatory visuals', icon: <BookOpen className="w-4 h-4 text-stone-500" />, color: 'border-stone-200' },
      { name: 'PPTX Export', desc: 'Any export enhanced with AI cover images automatically', icon: <FolderOpen className="w-4 h-4 text-stone-1000" />, color: 'border-stone-200' },
    ].map(item => (
      <MockCard key={item.name} title={item.name} icon={item.icon} className={cn('border', item.color)}>
        <p className="text-xs text-stone-600">{item.desc}</p>
      </MockCard>
    ))}
  </div>
);

// ─── PREVIEW MAP ────────────────────────────────────────────────────────────

const PREVIEW_MAP: Record<string, React.FC> = {
  'hero': HeroPreview,
  'cta': CTAPreview,
  // Path 1: Submissions
  'sub-portfolio': SubPortfolioPreview,
  'sub-510k': Sub510kPreview,
  'sub-ind': SubINDPreview,
  'sub-global': SubGlobalPreview,
  'sub-meetings': SubMeetingsPreview,
  // Path 2: Research
  'res-search': ResSearchPreview,
  'res-results': ResResultsPreview,
  'res-intelligence': ResIntelligencePreview,
  'res-precedent': ResPrecedentPreview,
  'res-evidence': ResEvidencePreview,
  // Path 3: Authoring
  'doc-editor': DocEditorPreview,
  'doc-csr': DocCSRPreview,
  'doc-templates': DocTemplatesPreview,
  'doc-vault': DocVaultPreview,
  'doc-sherpa': DocSherpaPreview,
  // Path 4: CMC
  'cmc-blueprint': CMCBlueprintPreview,
  'cmc-analytical': CMCAnalyticalPreview,
  'cmc-manufacturing': CMCManufacturingPreview,
  'cmc-readiness': CMCReadinessPreview,
  // Path 5: AI
  'ai-swarm': AISwarmPreview,
  'ai-snowglobe': AISnowglobePreview,
  'ai-review-pulse': AIReviewPulsePreview,
  'ai-dual': AIDualPreview,
  // Path 6: PM
  'pm-mission': PMMissionPreview,
  'pm-timelines': PMTimelinesPreview,
  'pm-tasks': PMTasksPreview,
  'pm-decisions': PMDecisionsPreview,
  'pm-gaps': PMGapsPreview,
  // Path 7: Security
  'sec-audit': SecAuditPreview,
  'sec-rbac': SecRBACPreview,
  'sec-inspection': SecInspectionPreview,
  'sec-governance': SecGovernancePreview,
  // Path 8: Collaboration
  'collab-hub': CollabHubPreview,
  'collab-review': CollabReviewPreview,
  'collab-reports': CollabReportsPreview,
  'collab-postmarket': CollabPostmarketPreview,
  'collab-academy': CollabAcademyPreview,
  // Path 9: Nano Banana Visual AI
  'nano-banana-overview': NanoBananaOverviewPreview,
  'nano-banana-generate': NanoBananaGeneratePreview,
  'nano-banana-integrations': NanoBananaIntegrationsPreview,
};

// ─── Main Component ─────────────────────────────────────────────────────────

interface DemoPreviewProps {
  previewType: string;
}

export const DemoPreview: React.FC<DemoPreviewProps> = ({ previewType }) => {
  const PreviewComponent = PREVIEW_MAP[previewType] || HeroPreview;

  return (
    <div className="flex flex-col h-full bg-stone-50 overflow-y-auto">
      <AnimatePresence mode="wait">
        <motion.div
          key={previewType}
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.98 }}
          transition={{ duration: 0.25 }}
          className="flex-1 p-6"
        >
          <PreviewComponent />
        </motion.div>
      </AnimatePresence>
    </div>
  );
};
