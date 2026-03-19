import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft,
  Search,
  AlertTriangle,
  FileSearch,
  Compass,
  Brain,
  BarChart3,
  ExternalLink,
  Clock,
  TrendingUp,
  Globe,
  Shield,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useDeliverable } from '@/concept2cure/hooks/useDeliverable';
import { ActionButton, GenerateButton, ExportButton, RunButton } from '@/concept2cure/components/ui/ActionButton';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type TabKey =
  | 'alerts'
  | 'evidence'
  | 'precedent'
  | 'pathway'
  | 'strategic';

interface Tab {
  key: TabKey;
  label: string;
}

// ---------------------------------------------------------------------------
// Static data
// ---------------------------------------------------------------------------

const tabs: Tab[] = [
  { key: 'alerts', label: 'Regulatory Alerts' },
  { key: 'evidence', label: 'Evidence Hub' },
  { key: 'precedent', label: 'Precedent Finder' },
  { key: 'pathway', label: 'Pathway Advisor' },
  { key: 'strategic', label: 'Strategic View' },
];

const fade = { initial: { opacity: 0, y: 4 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: 4 }, transition: { duration: 0.15 } };

// --- Alerts data -----------------------------------------------------------

const alerts = [
  {
    id: 1,
    date: '2026-03-15',
    severity: 'critical' as const,
    title: 'FDA updates Module 2.5 Clinical Overview guidance',
    description:
      'The FDA Center for Drug Evaluation and Research issued revised guidance for the Clinical Overview section of the Common Technical Document. Key changes include new expectations for benefit-risk integration and requirements for subgroup analyses in the narrative summary.',
    agencies: ['FDA'],
  },
  {
    id: 2,
    date: '2026-03-12',
    severity: 'high' as const,
    title: 'EMA revises CTD Module 3 CMC requirements',
    description:
      'The European Medicines Agency published updated requirements for Module 3 Chemistry, Manufacturing, and Controls. Changes affect drug substance characterization expectations and stability data formatting for centralized procedure applications.',
    agencies: ['EMA'],
  },
  {
    id: 3,
    date: '2026-03-10',
    severity: 'high' as const,
    title: 'Health Canada announces new pediatric data submission requirements',
    description:
      'Effective June 2026, Health Canada will require prospective pediatric study plans for all new drug submissions in oncology and rare diseases. Sponsors must submit Pediatric Investigation Plans concurrent with the initial NDS filing.',
    agencies: ['Health Canada'],
  },
  {
    id: 4,
    date: '2026-03-08',
    severity: 'medium' as const,
    title: 'PMDA issues revised bioequivalence study design guidance',
    description:
      'Japan\'s PMDA released updated guidance on bioequivalence study design for generic drug applications. The revision introduces acceptance of adaptive crossover designs and modifies dissolution testing specifications for BCS Class II compounds.',
    agencies: ['PMDA'],
  },
  {
    id: 5,
    date: '2026-03-05',
    severity: 'medium' as const,
    title: 'ICH E6(R3) implementation timeline finalized',
    description:
      'The International Council for Harmonisation confirmed the implementation timeline for ICH E6(R3) Good Clinical Practice. Regional adoption deadlines have been set, with FDA and EMA requiring compliance by Q1 2027.',
    agencies: ['FDA', 'EMA', 'PMDA'],
  },
  {
    id: 6,
    date: '2026-03-02',
    severity: 'low' as const,
    title: 'FDA Class II recall: Software update for cardiac monitoring devices',
    description:
      'FDA issued a Class II recall notice for select cardiac monitoring devices due to a firmware issue affecting data transmission reliability. Affected manufacturers must submit corrective action plans within 30 days.',
    agencies: ['FDA'],
  },
];

// --- Evidence data ---------------------------------------------------------

const evidenceItems = [
  {
    id: 1,
    title: 'Efficacy of PD-1 inhibitors in microsatellite-instable colorectal cancer: a systematic review',
    source: 'PubMed',
    date: '2026-02-18',
    confidence: 0.94,
    relevance: 0.91,
    citations: 187,
  },
  {
    id: 2,
    title: 'FDA Statistical Review: Pembrolizumab for first-line treatment of NSCLC',
    source: 'FDA',
    date: '2025-11-22',
    confidence: 0.97,
    relevance: 0.88,
    citations: 0,
  },
  {
    id: 3,
    title: 'Comparative effectiveness of checkpoint inhibitors across solid tumors: network meta-analysis',
    source: 'PubMed',
    date: '2026-01-09',
    confidence: 0.89,
    relevance: 0.85,
    citations: 64,
  },
  {
    id: 4,
    title: 'Internal Phase 2 data: ORR and DOR in refractory CRC cohort (Study C2C-301)',
    source: 'Internal',
    date: '2026-03-01',
    confidence: 0.82,
    relevance: 0.96,
    citations: 0,
  },
  {
    id: 5,
    title: 'Real-world evidence on immune-related adverse events: post-marketing surveillance dataset',
    source: 'FDA',
    date: '2025-09-14',
    confidence: 0.91,
    relevance: 0.79,
    citations: 42,
  },
];

// --- Precedent data --------------------------------------------------------

const precedents = [
  {
    id: 1,
    name: 'CardioSense Pro Cardiac Monitor',
    pathway: '510(k)',
    decisionDate: '2025-08-14',
    outcome: 'approved' as const,
    similarity: 0.92,
    predicateDevice: 'K203415',
    keyQuestions: [
      'Substantial equivalence to predicate in signal processing algorithm',
      'Biocompatibility testing for prolonged skin contact',
    ],
  },
  {
    id: 2,
    name: 'NeuroPulse Stimulation System',
    pathway: 'De Novo',
    decisionDate: '2025-05-22',
    outcome: 'approved' as const,
    similarity: 0.84,
    predicateDevice: 'DEN210038',
    keyQuestions: [
      'Novel classification for neurostimulation with AI-guided dosing',
      'Clinical evidence requirements for safety in outpatient setting',
    ],
  },
  {
    id: 3,
    name: 'GlucoTrack Continuous Monitor v2',
    pathway: '510(k)',
    decisionDate: '2025-02-11',
    outcome: 'rejected' as const,
    similarity: 0.78,
    predicateDevice: 'K194822',
    keyQuestions: [
      'Insufficient analytical performance data for hypoglycemic range',
      'Missing comparative study against predicate device',
    ],
  },
  {
    id: 4,
    name: 'VascuPath Imaging Catheter',
    pathway: 'PMA',
    decisionDate: '2024-11-30',
    outcome: 'crl' as const,
    similarity: 0.71,
    predicateDevice: 'P200045',
    keyQuestions: [
      'Additional clinical data requested for tortuous vessel anatomy',
      'Post-market surveillance plan deemed insufficient',
    ],
  },
];

// --- Pathway data ----------------------------------------------------------

const agencies = [
  { id: 'fda', name: 'FDA', region: 'United States' },
  { id: 'ema', name: 'EMA', region: 'European Union' },
  { id: 'pmda', name: 'PMDA', region: 'Japan' },
  { id: 'hc', name: 'Health Canada', region: 'Canada' },
];

const fdaPathways = [
  {
    name: 'IND (Investigational New Drug)',
    description:
      'Required before initiating clinical trials in the US. Sponsors submit preclinical data, manufacturing information, and proposed clinical protocols.',
    timeline: '30-day review',
  },
  {
    name: 'NDA (New Drug Application)',
    description:
      'Standard approval pathway for new molecular entities. Requires complete clinical, nonclinical, and CMC data demonstrating safety and efficacy.',
    timeline: '10–12 months (standard), 6–8 months (priority)',
  },
  {
    name: 'BLA (Biologics License Application)',
    description:
      'Approval pathway for biological products including vaccines, blood products, and therapeutic proteins. Includes facility inspection requirements.',
    timeline: '10–12 months (standard), 6–8 months (priority)',
  },
  {
    name: '510(k) Premarket Notification',
    description:
      'Clearance pathway for medical devices that are substantially equivalent to a legally marketed predicate device. No clinical data required if equivalence is demonstrated.',
    timeline: '3–6 months',
  },
  {
    name: 'PMA (Premarket Approval)',
    description:
      'Most stringent device approval pathway for Class III devices. Requires clinical evidence of safety and effectiveness.',
    timeline: '6–12 months',
  },
  {
    name: 'De Novo Classification',
    description:
      'Alternative pathway for novel, low-to-moderate risk devices without a predicate. Creates a new regulatory classification upon authorization.',
    timeline: '6–12 months',
  },
];

const expeditedPrograms = [
  {
    name: 'Breakthrough Therapy',
    criteria: 'Preliminary clinical evidence of substantial improvement over existing therapies for serious conditions',
    benefits: 'Intensive FDA guidance, organizational commitment, rolling review eligibility',
  },
  {
    name: 'Fast Track',
    criteria: 'Treats a serious condition and fills an unmet medical need',
    benefits: 'More frequent FDA meetings, rolling review eligibility',
  },
  {
    name: 'Priority Review',
    criteria: 'Significant improvement in safety or effectiveness of treatment, diagnosis, or prevention',
    benefits: 'Shortened review clock from 10 months to 6 months',
  },
  {
    name: 'Accelerated Approval',
    criteria: 'Serious condition with unmet need; effect on surrogate or intermediate clinical endpoint',
    benefits: 'Approval based on surrogate endpoint; post-marketing confirmatory trial required',
  },
];

// --- Strategic data --------------------------------------------------------

const competitiveLandscape = [
  { company: 'Astellas Pharma', area: 'Oncology', event: 'FDA Priority Review granted for ADC candidate', impact: 'high' as const, date: '2026-03-14' },
  { company: 'Roche / Genentech', area: 'Immunology', event: 'Phase 3 topline data positive — bispecific antibody', impact: 'medium' as const, date: '2026-03-12' },
  { company: 'Medtronic', area: 'Cardiac Devices', event: 'De Novo clearance for AI-guided monitoring', impact: 'high' as const, date: '2026-03-10' },
  { company: 'Novartis', area: 'Neurology', event: 'EMA CHMP positive opinion — gene therapy', impact: 'medium' as const, date: '2026-03-08' },
];

const therapeuticTrends = [
  { area: 'Oncology', approvals2025: 18, activePipeline: 342, trend: 'up' as const, insight: 'ADC and bispecific modalities dominating new filings' },
  { area: 'Neurology', approvals2025: 7, activePipeline: 189, trend: 'up' as const, insight: 'Gene therapy filings accelerating after recent FDA guidance' },
  { area: 'Cardiology', approvals2025: 5, activePipeline: 124, trend: 'flat' as const, insight: 'Digital health companion diagnostics gaining traction' },
  { area: 'Rare Disease', approvals2025: 12, activePipeline: 267, trend: 'up' as const, insight: 'Orphan drug incentives driving 34% YoY pipeline growth' },
];

const strategicInsights = [
  'FDA Priority Review rate for oncology ADCs is 67% — significantly above the 42% baseline. Consider accelerated pathway for similar modalities.',
  'EMA centralized procedure timelines shortened by 15% in 2025 vs 2024. Factor into global filing strategy.',
  'Three competitor De Novo clearances in cardiac AI this quarter signal receptive regulatory posture — favorable window for similar submissions.',
  'PMDA-FDA parallel review pilot program expanding eligibility in Q2 2026. Evaluate dual-filing opportunities for pipeline candidates.',
];

// ---------------------------------------------------------------------------
// Sub-view components
// ---------------------------------------------------------------------------

function SeverityLabel({ severity }: { severity: string }) {
  return (
    <span className="text-xs font-medium text-zinc-500 uppercase tracking-wide">
      {severity}
    </span>
  );
}

function RegulatoryAlerts() {
  const { generate, isGenerating } = useDeliverable();
  return (
    <motion.div {...fade} className="space-y-1">
      <div className="flex items-center justify-between mb-6">
        <p className="text-sm text-zinc-400">
          What changed that affects your submission? Powered by Regulatory Delta Radar and Regulatory Intelligence Service.
        </p>
        <ExportButton
          label="Export Watch Report"
          produces="Regulatory Watch Report (PDF)"
          isLoading={isGenerating}
          onClick={() => generate({
            endpoint: '/api/concept2cure/reports/regulatory-watch',
            method: 'POST',
            body: {},
            filename: 'Regulatory_Watch_Report.pdf',
            format: 'pdf',
            title: 'Regulatory Watch Report',
          })}
        />
      </div>
      <div className="space-y-4">
        {alerts.map((alert) => (
          <div key={alert.id} className="bg-white rounded-lg border border-zinc-100 p-5">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-3">
                <Clock className="w-4 h-4 text-zinc-400" />
                <span className="text-xs text-zinc-400">{alert.date}</span>
                <SeverityLabel severity={alert.severity} />
              </div>
              <div className="flex items-center gap-2">
                {alert.agencies.map((a) => (
                  <span key={a} className="text-xs text-zinc-500 border border-zinc-100 rounded px-2 py-0.5">
                    {a}
                  </span>
                ))}
              </div>
            </div>
            <h3 className="text-sm font-medium text-zinc-900 mb-1">{alert.title}</h3>
            <p className="text-sm text-zinc-600 leading-relaxed mb-3">{alert.description}</p>
            <GenerateButton
              label="Impact Assessment"
              produces="Regulatory Impact Assessment (PDF)"
              size="sm"
              isLoading={isGenerating}
              onClick={() => generate({
                endpoint: '/api/concept2cure/reports/alert-impact',
                method: 'POST',
                body: { alertId: alert.id },
                filename: `Impact_Assessment_Alert_${alert.id}.pdf`,
                format: 'pdf',
                title: 'Impact Assessment',
              })}
            />
          </div>
        ))}
      </div>
    </motion.div>
  );
}

function EvidenceHub() {
  const [query, setQuery] = useState('');
  const [sourceFilter, setSourceFilter] = useState<string>('all');
  const { generate, isGenerating } = useDeliverable();

  const sources = ['all', 'PubMed', 'FDA', 'Internal'];
  const filtered = evidenceItems.filter(
    (e) =>
      (sourceFilter === 'all' || e.source === sourceFilter) &&
      (query === '' || e.title.toLowerCase().includes(query.toLowerCase()))
  );

  return (
    <motion.div {...fade} className="space-y-6">
      <p className="text-sm text-zinc-400">
        Find and assess your evidence. Powered by Evidence Search, Literature Review, Evidence Confidence Heatmap, and PubMed.
      </p>

      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search evidence by keyword..."
            className="w-full pl-10 pr-4 py-2 rounded-lg border border-zinc-100 bg-white text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-200"
          />
        </div>
        <div className="flex items-center gap-1">
          {sources.map((s) => (
            <button
              key={s}
              onClick={() => setSourceFilter(s)}
              className={cn(
                'px-3 py-1.5 rounded text-xs transition-colors',
                sourceFilter === s
                  ? 'bg-zinc-900 text-white'
                  : 'text-zinc-400 hover:text-zinc-600'
              )}
            >
              {s === 'all' ? 'All' : s}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <GenerateButton
          label="Build Evidence Package"
          produces="Evidence Dossier (DOCX)"
          isLoading={isGenerating}
          onClick={() => generate({
            endpoint: '/api/concept2cure/reports/evidence-dossier',
            method: 'POST',
            body: {},
            filename: 'Evidence_Dossier.docx',
            format: 'docx',
            title: 'Evidence Dossier',
          })}
        />
        <GenerateButton
          label="Literature Review"
          produces="Systematic Literature Review (PDF)"
          isLoading={isGenerating}
          onClick={() => generate({
            endpoint: '/api/concept2cure/reports/literature-review',
            method: 'POST',
            body: {},
            filename: 'Literature_Review.pdf',
            format: 'pdf',
            title: 'Systematic Literature Review',
          })}
        />
      </div>

      <div className="space-y-3">
        {filtered.map((item) => (
          <div key={item.id} className="bg-white rounded-lg border border-zinc-100 p-5">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <h3 className="text-sm font-medium text-zinc-900 mb-1">{item.title}</h3>
                <div className="flex items-center gap-4 text-xs text-zinc-400">
                  <span>{item.source}</span>
                  <span>{item.date}</span>
                  {item.citations > 0 && <span>{item.citations} citations</span>}
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-xs text-zinc-400 mb-0.5">Relevance</div>
                <div className="text-sm font-medium text-zinc-900">{(item.relevance * 100).toFixed(0)}%</div>
              </div>
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <p className="text-sm text-zinc-400 py-8 text-center">No evidence items match your search.</p>
        )}
      </div>
    </motion.div>
  );
}

function PrecedentFinder() {
  const [searchQuery, setSearchQuery] = useState('');
  const { generate, isGenerating } = useDeliverable();

  const outcomeLabel = (o: string) => {
    if (o === 'approved') return 'Approved';
    if (o === 'rejected') return 'Not Substantially Equivalent';
    return 'Complete Response Letter';
  };

  return (
    <motion.div {...fade} className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-zinc-400">
          What happened with similar products? Powered by Precedent Engine, Predicate Intelligence, and Knowledge Graph.
        </p>
        <div className="flex items-center gap-2 shrink-0 ml-4">
          <GenerateButton
            label="Generate Comparison Table"
            produces="Predicate Comparison Table (DOCX)"
            isLoading={isGenerating}
            onClick={() => generate({
              endpoint: '/api/concept2cure/reports/predicate-comparison',
              method: 'POST',
              body: {},
              filename: 'Predicate_Comparison.docx',
              format: 'docx',
              title: 'Predicate Comparison Table',
            })}
          />
          <ExportButton
            label="Export Precedent Brief"
            produces="Regulatory Precedent Brief (PDF)"
            isLoading={isGenerating}
            onClick={() => generate({
              endpoint: '/api/concept2cure/reports/precedent-brief',
              method: 'POST',
              body: {},
              filename: 'Precedent_Brief.pdf',
              format: 'pdf',
              title: 'Regulatory Precedent Brief',
            })}
          />
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search by product name, indication, or device type..."
          className="w-full pl-10 pr-4 py-2 rounded-lg border border-zinc-100 bg-white text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-200"
        />
      </div>

      <div className="space-y-4">
        {precedents.map((p) => (
          <div key={p.id} className="bg-white rounded-lg border border-zinc-100 p-5">
            <div className="flex items-start justify-between mb-3">
              <div>
                <h3 className="text-sm font-medium text-zinc-900">{p.name}</h3>
                <div className="flex items-center gap-3 mt-1 text-xs text-zinc-400">
                  <span>{p.pathway}</span>
                  <span>{p.decisionDate}</span>
                  <span>{p.predicateDevice}</span>
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-xs text-zinc-400 mb-0.5">Similarity</div>
                <div className="text-sm font-medium text-zinc-900">{(p.similarity * 100).toFixed(0)}%</div>
              </div>
            </div>
            <div className="mb-3">
              <span className="text-xs font-medium text-zinc-500 uppercase tracking-wide">
                {outcomeLabel(p.outcome)}
              </span>
            </div>
            <div className="space-y-1">
              <div className="text-xs text-zinc-400 mb-1">Key FDA questions</div>
              {p.keyQuestions.map((q, i) => (
                <p key={i} className="text-sm text-zinc-600 leading-relaxed">
                  {i + 1}. {q}
                </p>
              ))}
            </div>
          </div>
        ))}
      </div>
    </motion.div>
  );
}

function PathwayAdvisor() {
  const [selectedAgency, setSelectedAgency] = useState('fda');
  const { generate, isGenerating } = useDeliverable();

  return (
    <motion.div {...fade} className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-zinc-400">
          What's the optimal regulatory strategy? Powered by Regulatory Pathway Intelligence — 30+ agencies, 65+ guidelines.
        </p>
        <div className="flex items-center gap-2 shrink-0 ml-4">
          <GenerateButton
            label="Generate Strategy Document"
            produces="Regulatory Strategy Document (DOCX)"
            isLoading={isGenerating}
            onClick={() => generate({
              endpoint: '/api/concept2cure/reports/regulatory-strategy',
              method: 'POST',
              body: {},
              filename: 'Regulatory_Strategy.docx',
              format: 'docx',
              title: 'Regulatory Strategy Document',
            })}
          />
          <GenerateButton
            label="Draft Designation Request"
            produces="Expedited Designation Request Letter (DOCX)"
            isLoading={isGenerating}
            onClick={() => generate({
              endpoint: '/api/concept2cure/reports/designation-request',
              method: 'POST',
              body: {},
              filename: 'Expedited_Designation_Request.docx',
              format: 'docx',
              title: 'Expedited Designation Request',
            })}
          />
        </div>
      </div>

      <div className="flex items-center gap-2">
        {agencies.map((a) => (
          <button
            key={a.id}
            onClick={() => setSelectedAgency(a.id)}
            className={cn(
              'px-4 py-2 rounded-lg text-sm transition-colors border',
              selectedAgency === a.id
                ? 'border-zinc-900 text-zinc-900 font-medium'
                : 'border-zinc-100 text-zinc-400 hover:text-zinc-600'
            )}
          >
            <div>{a.name}</div>
            <div className="text-xs text-zinc-400">{a.region}</div>
          </button>
        ))}
      </div>

      {selectedAgency === 'fda' && (
        <div className="space-y-6">
          <div>
            <h3 className="text-sm font-medium text-zinc-900 mb-3">Regulatory Pathways</h3>
            <div className="space-y-3">
              {fdaPathways.map((p) => (
                <div key={p.name} className="bg-white rounded-lg border border-zinc-100 p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h4 className="text-sm font-medium text-zinc-900 mb-1">{p.name}</h4>
                      <p className="text-sm text-zinc-600 leading-relaxed">{p.description}</p>
                    </div>
                    <span className="text-xs text-zinc-400 shrink-0 ml-4">{p.timeline}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <h3 className="text-sm font-medium text-zinc-900 mb-3">Expedited Programs</h3>
            <div className="grid grid-cols-2 gap-3">
              {expeditedPrograms.map((ep) => (
                <div key={ep.name} className="bg-white rounded-lg border border-zinc-100 p-4">
                  <h4 className="text-sm font-medium text-zinc-900 mb-2">{ep.name}</h4>
                  <div className="text-xs text-zinc-400 mb-1">Criteria</div>
                  <p className="text-sm text-zinc-600 mb-2">{ep.criteria}</p>
                  <div className="text-xs text-zinc-400 mb-1">Benefits</div>
                  <p className="text-sm text-zinc-600">{ep.benefits}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {selectedAgency !== 'fda' && (
        <div className="bg-white rounded-lg border border-zinc-100 p-8 text-center">
          <Globe className="w-4 h-4 text-zinc-400 mx-auto mb-2" />
          <p className="text-sm text-zinc-600">
            Pathway data for {agencies.find((a) => a.id === selectedAgency)?.name} is available.
          </p>
          <p className="text-xs text-zinc-400 mt-1">Select to explore regional pathways, required dossier formats, and timelines.</p>
        </div>
      )}
    </motion.div>
  );
}

function StrategicView() {
  const { generate, isGenerating } = useDeliverable();

  return (
    <motion.div {...fade} className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-zinc-400">
          Market intelligence, competitive landscape, and therapeutic area trends. Powered by Strategic Intelligence and Clinical Intelligence.
        </p>
        <div className="flex items-center gap-2 shrink-0 ml-4">
          <ExportButton
            label="Export Intelligence Brief"
            produces="Competitive Intelligence Brief (PDF)"
            isLoading={isGenerating}
            onClick={() => generate({
              endpoint: '/api/concept2cure/reports/competitive-intelligence',
              method: 'POST',
              body: {},
              filename: 'Competitive_Intelligence_Brief.pdf',
              format: 'pdf',
              title: 'Competitive Intelligence Brief',
            })}
          />
          <GenerateButton
            label="Generate Market Report"
            produces="Market Access Report (PDF)"
            isLoading={isGenerating}
            onClick={() => generate({
              endpoint: '/api/concept2cure/reports/market-access',
              method: 'POST',
              body: {},
              filename: 'Market_Access_Report.pdf',
              format: 'pdf',
              title: 'Market Access Report',
            })}
          />
        </div>
      </div>

      {/* Therapeutic Area Trends */}
      <div>
        <h3 className="text-sm font-medium text-zinc-900 mb-3">Therapeutic Area Landscape</h3>
        <div className="grid grid-cols-2 gap-4">
          {therapeuticTrends.map((area) => (
            <div key={area.area} className="bg-white rounded-lg border border-zinc-100 p-4">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-sm font-medium text-zinc-900">{area.area}</h4>
                <span className={cn(
                  'text-xs font-medium uppercase tracking-wide',
                  area.trend === 'up' ? 'text-emerald-600' : 'text-zinc-400'
                )}>
                  {area.trend === 'up' ? '↑ Growing' : '→ Stable'}
                </span>
              </div>
              <div className="flex items-center gap-6 text-xs text-zinc-400 mb-2">
                <span>{area.approvals2025} approvals (2025)</span>
                <span>{area.activePipeline} active trials</span>
              </div>
              <p className="text-xs text-zinc-600 leading-relaxed">{area.insight}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Competitive Intelligence */}
      <div>
        <h3 className="text-sm font-medium text-zinc-900 mb-3">Competitive Intelligence</h3>
        <div className="space-y-3">
          {competitiveLandscape.map((item, i) => (
            <div key={i} className="bg-white rounded-lg border border-zinc-100 p-4">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-3">
                  <h4 className="text-sm font-medium text-zinc-900">{item.company}</h4>
                  <span className="text-xs text-zinc-400">{item.area}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={cn(
                    'text-xs font-medium uppercase tracking-wide',
                    item.impact === 'high' ? 'text-amber-600' : 'text-zinc-400'
                  )}>
                    {item.impact} impact
                  </span>
                  <span className="text-xs text-zinc-300">{item.date}</span>
                </div>
              </div>
              <p className="text-sm text-zinc-600">{item.event}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Strategic Insights */}
      <div>
        <h3 className="text-sm font-medium text-zinc-900 mb-3">Strategic Insights</h3>
        <div className="space-y-3">
          {strategicInsights.map((insight, i) => (
            <div key={i} className="bg-white rounded-lg border border-zinc-100 p-4">
              <p className="text-sm text-zinc-600 leading-relaxed">{insight}</p>
            </div>
          ))}
        </div>
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function IntelligenceHub({ onClose }: { onClose: () => void }) {
  const [activeTab, setActiveTab] = useState<TabKey>('alerts');

  const renderView = () => {
    switch (activeTab) {
      case 'alerts':
        return <RegulatoryAlerts />;
      case 'evidence':
        return <EvidenceHub />;
      case 'precedent':
        return <PrecedentFinder />;
      case 'pathway':
        return <PathwayAdvisor />;
      case 'strategic':
        return <StrategicView />;
      default:
        return null;
    }
  };

  return (
    <div className="h-full flex flex-col bg-[#faf9f5]">
      {/* Header */}
      <div className="px-8 pt-6 pb-0">
        <div className="flex items-center gap-3 mb-1">
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-600 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <h1 className="text-lg font-medium text-zinc-900">Intelligence</h1>
        </div>
        <p className="text-sm text-zinc-400 ml-7">
          Research, discover, and predict across your regulatory landscape
        </p>
      </div>

      {/* Tab navigation */}
      <nav className="flex items-center gap-6 border-b border-zinc-100 px-8 mt-4">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              'relative py-3 text-sm transition-colors',
              activeTab === tab.key
                ? 'text-zinc-900 font-medium'
                : 'text-zinc-400 hover:text-zinc-600'
            )}
          >
            {tab.label}
            {activeTab === tab.key && (
              <div className="absolute inset-x-0 bottom-0 h-0.5 bg-zinc-900" />
            )}
          </button>
        ))}
      </nav>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-8 py-6">
        <AnimatePresence mode="wait">
          <React.Fragment key={activeTab}>{renderView()}</React.Fragment>
        </AnimatePresence>
      </div>
    </div>
  );
}

export default IntelligenceHub;
