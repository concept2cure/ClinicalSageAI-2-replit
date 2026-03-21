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
  Inbox,
  FileText,
  Activity,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useDeliverable } from '@/concept2cure/hooks/useDeliverable';
import { ActionButton, GenerateButton, ExportButton, RunButton } from '@/concept2cure/components/ui/ActionButton';
import {
  useRealTimeAlerts,
  useRecalls,
  useGuidances,
  useCompetitorIntelligence,
  usePDUFADates,
} from '@/concept2cure/hooks/useRegulatoryIntelligence';
import { useQuery } from '@tanstack/react-query';

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

// ---------------------------------------------------------------------------
// Reference Data — Regulatory pathways and programs
// These are legitimate static reference data maintained from official FDA,
// EMA, and ICH guidance. FDA pathways and expedited programs rarely change.
// ---------------------------------------------------------------------------

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
    timeline: '10\u201312 months (standard), 6\u20138 months (priority)',
  },
  {
    name: 'BLA (Biologics License Application)',
    description:
      'Approval pathway for biological products including vaccines, blood products, and therapeutic proteins. Includes facility inspection requirements.',
    timeline: '10\u201312 months (standard), 6\u20138 months (priority)',
  },
  {
    name: '510(k) Premarket Notification',
    description:
      'Clearance pathway for medical devices that are substantially equivalent to a legally marketed predicate device. No clinical data required if equivalence is demonstrated.',
    timeline: '3\u20136 months',
  },
  {
    name: 'PMA (Premarket Approval)',
    description:
      'Most stringent device approval pathway for Class III devices. Requires clinical evidence of safety and effectiveness.',
    timeline: '6\u201312 months',
  },
  {
    name: 'De Novo Classification',
    description:
      'Alternative pathway for novel, low-to-moderate risk devices without a predicate. Creates a new regulatory classification upon authorization.',
    timeline: '6\u201312 months',
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

// ---------------------------------------------------------------------------
// Empty state component
// ---------------------------------------------------------------------------

function EmptyState({ icon: Icon, title, description }: { icon: React.ElementType; title: string; description: string }) {
  return (
    <div className="bg-white rounded-lg border border-zinc-200 py-12 text-center">
      <Icon className="w-8 h-8 text-zinc-400 mx-auto mb-2" />
      <p className="text-sm text-zinc-500">{title}</p>
      <p className="text-xs text-zinc-400 mt-1">{description}</p>
    </div>
  );
}

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
  const { alerts: liveAlerts, connectionStatus } = useRealTimeAlerts('current-user');
  const { data: recallsData } = useRecalls();
  const { data: guidancesData } = useGuidances();

  // Transform real data into unified alert format
  const alerts = React.useMemo(() => {
    const items: Array<{
      id: string;
      date: string;
      severity: 'critical' | 'high' | 'medium' | 'low';
      title: string;
      description: string;
      agencies: string[];
    }> = [];

    // Map live alerts from real-time subscription
    if (liveAlerts && liveAlerts.length > 0) {
      liveAlerts.forEach((alert) => {
        const severityMap: Record<string, 'critical' | 'high' | 'medium' | 'low'> = {
          CRITICAL: 'critical',
          HIGH: 'high',
          MEDIUM: 'medium',
          LOW: 'low',
          INFO: 'low',
        };
        items.push({
          id: alert.id,
          date: alert.timestamp ? new Date(alert.timestamp).toISOString().split('T')[0] : '',
          severity: severityMap[alert.priority] || 'medium',
          title: alert.title,
          description: alert.message,
          agencies: alert.source === 'FDA_ENFORCEMENT' || alert.source === 'FDA_GUIDANCE' || alert.source === 'RECALLS'
            ? ['FDA']
            : alert.source === 'MAUDE' ? ['FDA']
            : alert.source === 'PDUFA' ? ['FDA']
            : [],
        });
      });
    }

    // Map FDA guidances into alert items
    if (guidancesData && guidancesData.length > 0) {
      guidancesData.forEach((g) => {
        items.push({
          id: `guidance-${g.id}`,
          date: g.issueDate,
          severity: g.guidanceType === 'final' ? 'high' : 'medium',
          title: g.title,
          description: g.summary || `${g.guidanceType === 'final' ? 'Final' : 'Draft'} guidance issued by ${g.centerCode}.`,
          agencies: ['FDA'],
        });
      });
    }

    // Map FDA recalls into alert items
    if (recallsData && recallsData.length > 0) {
      recallsData.forEach((r) => {
        const severityMap: Record<string, 'critical' | 'high' | 'medium'> = {
          I: 'critical',
          II: 'high',
          III: 'medium',
        };
        items.push({
          id: `recall-${r.id}`,
          date: r.centerClassificationDate,
          severity: severityMap[r.recallClass] || 'medium',
          title: `FDA Class ${r.recallClass} Recall: ${r.recallingFirm}`,
          description: `${r.reasonForRecall} — Product: ${r.productDescription}`,
          agencies: ['FDA'],
        });
      });
    }

    // Sort by date descending
    items.sort((a, b) => (b.date || '').localeCompare(a.date || ''));

    return items;
  }, [liveAlerts, guidancesData, recallsData]);

  return (
    <motion.div {...fade} className="space-y-1">
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="text-sm text-zinc-400">
            What changed that affects your submission? Powered by Regulatory Delta Radar and Regulatory Intelligence Service.
          </p>
          {connectionStatus === 'connected' && (
            <p className="text-xs text-emerald-500 mt-1">Live monitoring active</p>
          )}
          {connectionStatus === 'connecting' && (
            <p className="text-xs text-amber-500 mt-1">Connecting to alert feed...</p>
          )}
        </div>
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
        {alerts.length === 0 ? (
          <EmptyState
            icon={AlertTriangle}
            title="No regulatory alerts"
            description="The system monitors FDA, EMA, PMDA, and Health Canada feeds. Alerts will appear here when regulatory changes are detected."
          />
        ) : (
          alerts.map((alert) => (
            <div key={alert.id} className="bg-white rounded-lg border border-zinc-200 p-5">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-3">
                  <Clock className="w-4 h-4 text-zinc-400" />
                  <span className="text-xs text-zinc-400">{alert.date}</span>
                  <SeverityLabel severity={alert.severity} />
                </div>
                <div className="flex items-center gap-2">
                  {alert.agencies.map((a) => (
                    <span key={a} className="text-xs text-zinc-500 border border-zinc-200 rounded px-2 py-0.5">
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
          ))
        )}
      </div>
    </motion.div>
  );
}

function EvidenceHub() {
  const [query, setQuery] = useState('');
  const [sourceFilter, setSourceFilter] = useState<string>('all');
  const { generate, isGenerating } = useDeliverable();

  // Fetch artifacts from API for evidence hub
  const { data: artifactsResponse } = useQuery({
    queryKey: ['/api/concept2cure/artifacts'],
  });

  // Fetch audit logs for additional evidence/activity context
  const { data: auditResponse } = useQuery({
    queryKey: ['/api/concept2cure/audit-logs', { limit: 30 }],
    queryFn: () => fetch('/api/concept2cure/audit-logs?limit=30').then(r => r.json()),
  });

  // Transform artifacts into evidence items
  const evidenceItems = React.useMemo(() => {
    const rawArtifacts = (artifactsResponse as any)?.data || (artifactsResponse as any) || [];
    if (!Array.isArray(rawArtifacts)) return [];

    return rawArtifacts.map((artifact: any, idx: number) => ({
      id: artifact.id || idx,
      title: artifact.title || artifact.name || 'Untitled artifact',
      source: artifact.source || artifact.type || 'Internal',
      date: artifact.createdAt ? new Date(artifact.createdAt).toISOString().split('T')[0] : '',
      confidence: artifact.confidence ?? artifact.qualityScore ?? 0.8,
      relevance: artifact.relevance ?? (artifact.status === 'approved' ? 0.95 : artifact.status === 'reviewed' ? 0.85 : 0.7),
      citations: artifact.citations ?? 0,
    }));
  }, [artifactsResponse]);

  const sources = React.useMemo(() => {
    const uniqueSources = new Set(evidenceItems.map((e: any) => e.source));
    return ['all', ...Array.from(uniqueSources)];
  }, [evidenceItems]);

  const filtered = evidenceItems.filter(
    (e: any) =>
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
            className="w-full pl-10 pr-4 py-2 rounded-lg border border-zinc-200 bg-white text-sm text-zinc-900 placeholder:text-zinc-400 focus-visible:ring-2 outline-none focus:ring-zinc-200"
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
        {evidenceItems.length === 0 ? (
          <EmptyState
            icon={FileSearch}
            title="No evidence items yet"
            description="Upload documents and create projects to build your evidence library. Artifacts from your work will appear here."
          />
        ) : filtered.length === 0 ? (
          <p className="text-sm text-zinc-400 py-8 text-center">No evidence items match your search.</p>
        ) : (
          filtered.map((item: any) => (
            <div key={item.id} className="bg-white rounded-lg border border-zinc-200 p-5">
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
          ))
        )}
      </div>
    </motion.div>
  );
}

function PrecedentFinder() {
  const [searchQuery, setSearchQuery] = useState('');
  const { generate, isGenerating } = useDeliverable();

  // Fetch precedent/predicate data from API
  const { data: precedentsResponse } = useQuery({
    queryKey: ['/api/concept2cure/precedents'],
    queryFn: () => fetch('/api/concept2cure/precedents').then(r => r.json()),
  });

  const precedents = React.useMemo(() => {
    const raw = (precedentsResponse as any)?.data || (precedentsResponse as any) || [];
    if (!Array.isArray(raw)) return [];
    return raw;
  }, [precedentsResponse]);

  const outcomeLabel = (o: string) => {
    if (o === 'approved') return 'Approved';
    if (o === 'rejected') return 'Not Substantially Equivalent';
    return 'Complete Response Letter';
  };

  const filteredPrecedents = precedents.filter(
    (p: any) =>
      searchQuery === '' ||
      (p.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.pathway || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

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
          className="w-full pl-10 pr-4 py-2 rounded-lg border border-zinc-200 bg-white text-sm text-zinc-900 placeholder:text-zinc-400 focus-visible:ring-2 outline-none focus:ring-zinc-200"
        />
      </div>

      <div className="space-y-4">
        {precedents.length === 0 ? (
          <EmptyState
            icon={FileSearch}
            title="No precedent data yet"
            description="Create a project and define your product profile to find regulatory precedents and predicate devices."
          />
        ) : filteredPrecedents.length === 0 ? (
          <p className="text-sm text-zinc-400 py-8 text-center">No precedents match your search.</p>
        ) : (
          filteredPrecedents.map((p: any) => (
            <div key={p.id} className="bg-white rounded-lg border border-zinc-200 p-5">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="text-sm font-medium text-zinc-900">{p.name}</h3>
                  <div className="flex items-center gap-3 mt-1 text-xs text-zinc-400">
                    <span>{p.pathway}</span>
                    <span>{p.decisionDate}</span>
                    {p.predicateDevice && <span>{p.predicateDevice}</span>}
                  </div>
                </div>
                {p.similarity != null && (
                  <div className="text-right shrink-0">
                    <div className="text-xs text-zinc-400 mb-0.5">Similarity</div>
                    <div className="text-sm font-medium text-zinc-900">{(p.similarity * 100).toFixed(0)}%</div>
                  </div>
                )}
              </div>
              {p.outcome && (
                <div className="mb-3">
                  <span className="text-xs font-medium text-zinc-500 uppercase tracking-wide">
                    {outcomeLabel(p.outcome)}
                  </span>
                </div>
              )}
              {p.keyQuestions && p.keyQuestions.length > 0 && (
                <div className="space-y-1">
                  <div className="text-xs text-zinc-400 mb-1">Key FDA questions</div>
                  {p.keyQuestions.map((q: string, i: number) => (
                    <p key={i} className="text-sm text-zinc-600 leading-relaxed">
                      {i + 1}. {q}
                    </p>
                  ))}
                </div>
              )}
            </div>
          ))
        )}
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

      {/* Reference Data — Agency selector */}
      <div className="flex items-center gap-2">
        {agencies.map((a) => (
          <button
            key={a.id}
            onClick={() => setSelectedAgency(a.id)}
            className={cn(
              'px-4 py-2 rounded-lg text-sm transition-colors border',
              selectedAgency === a.id
                ? 'border-zinc-900 text-zinc-900 font-medium'
                : 'border-zinc-200 text-zinc-400 hover:text-zinc-600'
            )}
          >
            <div>{a.name}</div>
            <div className="text-xs text-zinc-400">{a.region}</div>
          </button>
        ))}
      </div>

      {selectedAgency === 'fda' && (
        <div className="space-y-6">
          {/* Reference Data — Regulatory pathways from official FDA guidance */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <h3 className="text-sm font-medium text-zinc-900">Regulatory Pathways</h3>
              <span className="text-xs text-zinc-400 border border-zinc-200 rounded px-1.5 py-0.5">Reference Data</span>
            </div>
            <div className="space-y-3">
              {fdaPathways.map((p) => (
                <div key={p.name} className="bg-white rounded-lg border border-zinc-200 p-4">
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

          {/* Reference Data — Expedited programs from official FDA guidance */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <h3 className="text-sm font-medium text-zinc-900">Expedited Programs</h3>
              <span className="text-xs text-zinc-400 border border-zinc-200 rounded px-1.5 py-0.5">Reference Data</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {expeditedPrograms.map((ep) => (
                <div key={ep.name} className="bg-white rounded-lg border border-zinc-200 p-4">
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
        <div className="bg-white rounded-lg border border-zinc-200 p-8 text-center">
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

  // Real data from hooks
  const { data: competitorData } = useCompetitorIntelligence();
  const { data: pdufaData } = usePDUFADates();

  // Transform competitor intelligence into display format
  const competitiveLandscape = React.useMemo(() => {
    if (!competitorData || competitorData.length === 0) return [];
    return competitorData.map((item) => ({
      company: item.companyName,
      area: item.productName || item.eventType,
      event: item.summary,
      impact: item.impact === 'positive' ? 'high' as const
        : item.impact === 'negative' ? 'high' as const
        : 'medium' as const,
      date: item.date,
    }));
  }, [competitorData]);

  // Transform PDUFA dates into display format
  const upcomingDates = React.useMemo(() => {
    if (!pdufaData || pdufaData.length === 0) return [];
    return pdufaData.filter((d) => d.status === 'pending').map((d) => ({
      id: d.id,
      product: d.productName,
      sponsor: d.sponsor,
      targetDate: d.targetDate,
      dateType: d.dateType,
      indication: d.indication || '',
    }));
  }, [pdufaData]);

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

      {/* Upcoming PDUFA Dates */}
      <div>
        <h3 className="text-sm font-medium text-zinc-900 mb-3">Upcoming PDUFA Dates</h3>
        {upcomingDates.length === 0 ? (
          <EmptyState
            icon={Clock}
            title="No upcoming PDUFA dates"
            description="PDUFA target action dates will appear here when available from FDA feeds."
          />
        ) : (
          <div className="space-y-3">
            {upcomingDates.map((d) => (
              <div key={d.id} className="bg-white rounded-lg border border-zinc-200 p-4">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-3">
                    <h4 className="text-sm font-medium text-zinc-900">{d.product}</h4>
                    <span className="text-xs text-zinc-400">{d.sponsor}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-zinc-500 uppercase tracking-wide">{d.dateType}</span>
                    <span className="text-xs text-zinc-400">{d.targetDate}</span>
                  </div>
                </div>
                {d.indication && <p className="text-sm text-zinc-600">{d.indication}</p>}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Competitive Intelligence */}
      <div>
        <h3 className="text-sm font-medium text-zinc-900 mb-3">Competitive Intelligence</h3>
        {competitiveLandscape.length === 0 ? (
          <EmptyState
            icon={BarChart3}
            title="No competitive intelligence data yet"
            description="Configure competitor tracking in your project settings to monitor market activity and regulatory events."
          />
        ) : (
          <div className="space-y-3">
            {competitiveLandscape.map((item, i) => (
              <div key={i} className="bg-white rounded-lg border border-zinc-200 p-4">
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
                    <span className="text-xs text-zinc-400">{item.date}</span>
                  </div>
                </div>
                <p className="text-sm text-zinc-600">{item.event}</p>
              </div>
            ))}
          </div>
        )}
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
    <div className="h-full flex flex-col bg-[#FAFAF9]">
      {/* Header */}
      <div className="px-8 pt-6 pb-0">
        <div className="flex items-center gap-3 mb-1">
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-600 transition-colors duration-150"
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
      <nav className="flex items-center gap-6 border-b border-zinc-200 px-8 mt-4">
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
