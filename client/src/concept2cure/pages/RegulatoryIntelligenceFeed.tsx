/**
 * Regulatory Intelligence Feed
 *
 * A real-time regulatory intelligence dashboard — like a Bloomberg Terminal
 * for regulatory affairs professionals. Surfaces guidance documents, alerts,
 * approval decisions, and PDUFA dates from global health authorities.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Search,
  Filter,
  Bell,
  TrendingUp,
  FileText,
  AlertTriangle,
  ExternalLink,
  Clock,
  Bookmark,
  Radio,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ImpactLevel = 'critical' | 'high' | 'medium' | 'low';
type Agency = 'FDA' | 'EMA' | 'PMDA' | 'NMPA' | 'HC' | 'TGA' | 'MHRA';

interface IntelligenceItem {
  id: string;
  title: string;
  summary: string;
  agency: Agency;
  impactLevel: ImpactLevel;
  date: string; // ISO 8601
  tags: string[];
  category: 'guidance' | 'alert' | 'approval' | 'pdufa' | 'enforcement';
  url?: string;
  bookmarked?: boolean;
}

interface PDUFADate {
  id: string;
  drug: string;
  sponsor: string;
  date: string; // ISO 8601
  indication: string;
}

interface FeedResponse {
  items: IntelligenceItem[];
  pdufa_dates: PDUFADate[];
  metrics: {
    new_guidance: number;
    active_alerts: number;
    recent_approvals: number;
    pdufa_dates: number;
  };
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const AGENCIES: Agency[] = ['FDA', 'EMA', 'PMDA', 'NMPA', 'HC', 'TGA', 'MHRA'];

const IMPACT_LEVELS: { value: ImpactLevel; label: string }[] = [
  { value: 'critical', label: 'Critical' },
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
];

const THERAPEUTIC_AREAS = [
  'Oncology',
  'Neurology',
  'Cardiology',
  'Immunology',
  'Rare Disease',
  'Infectious Disease',
  'Metabolic',
  'Gene Therapy',
];

const IMPACT_STRIPE_COLORS: Record<ImpactLevel, string> = {
  critical: 'bg-red-500',
  high: 'bg-amber-500',
  medium: 'bg-blue-500',
  low: 'bg-zinc-400',
};

const IMPACT_BADGE_STYLES: Record<ImpactLevel, string> = {
  critical: 'bg-red-50 text-red-700 ring-red-200',
  high: 'bg-amber-50 text-amber-700 ring-amber-200',
  medium: 'bg-blue-50 text-blue-700 ring-blue-200',
  low: 'bg-zinc-50 text-zinc-600 ring-zinc-200',
};

const AGENCY_BADGE_STYLES: Record<Agency, string> = {
  FDA: 'bg-blue-50 text-blue-700',
  EMA: 'bg-emerald-50 text-emerald-700',
  PMDA: 'bg-rose-50 text-rose-700',
  NMPA: 'bg-orange-50 text-orange-700',
  HC: 'bg-red-50 text-red-700',
  TGA: 'bg-teal-50 text-teal-700',
  MHRA: 'bg-violet-50 text-violet-700',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function relativeTime(isoDate: string): string {
  const now = new Date();
  const then = new Date(isoDate);
  const diffMs = now.getTime() - then.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  const diffHr = Math.floor(diffMs / 3_600_000);
  const diffDay = Math.floor(diffMs / 86_400_000);

  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay === 1) return 'Yesterday';
  if (diffDay < 7) return `${diffDay}d ago`;
  return then.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatDate(isoDate: string): string {
  return new Date(isoDate).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** Skeleton placeholder for loading states */
function SkeletonCard() {
  return (
    <div className="bg-white rounded-xl border border-zinc-200 p-5 animate-pulse">
      <div className="flex gap-4">
        <div className="w-1 rounded-full bg-zinc-200 shrink-0" />
        <div className="flex-1 space-y-3">
          <div className="flex items-center gap-2">
            <div className="h-5 w-12 rounded-full bg-zinc-200" />
            <div className="h-5 w-20 rounded-full bg-zinc-200" />
          </div>
          <div className="h-5 w-3/4 rounded bg-zinc-200" />
          <div className="space-y-2">
            <div className="h-4 w-full rounded bg-zinc-100" />
            <div className="h-4 w-5/6 rounded bg-zinc-100" />
          </div>
          <div className="flex gap-2">
            <div className="h-5 w-16 rounded-full bg-zinc-100" />
            <div className="h-5 w-16 rounded-full bg-zinc-100" />
          </div>
        </div>
      </div>
    </div>
  );
}

function SkeletonMetric() {
  return (
    <div className="bg-white rounded-xl border border-zinc-200 p-4 animate-pulse">
      <div className="h-4 w-20 rounded bg-zinc-200 mb-2" />
      <div className="h-7 w-12 rounded bg-zinc-200" />
    </div>
  );
}

/** Stat card used in the metrics bar */
function MetricCard({
  label,
  value,
  icon: Icon,
  accentColor,
}: {
  label: string;
  value: number;
  icon: React.FC<React.SVGProps<SVGSVGElement> & { size?: number | string }>;
  accentColor: string;
}) {
  return (
    <div className="bg-white rounded-xl border border-zinc-200 p-4 flex items-center gap-3 min-w-0">
      <div className={`p-2 rounded-lg ${accentColor}`}>
        <Icon size={18} />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-zinc-500 truncate">{label}</p>
        <p className="text-xl font-semibold text-zinc-900">{value}</p>
      </div>
    </div>
  );
}

/** A single intelligence feed card */
function FeedCard({
  item,
  onBookmark,
  onClick,
}: {
  item: IntelligenceItem;
  onBookmark: (id: string) => void;
  onClick: (item: IntelligenceItem) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onClick(item)}
      className="w-full text-left bg-white rounded-xl border border-zinc-200 hover:border-zinc-200 transition-colors focus-visible:ring-2 focus-visible:ring-blue-500 outline-none/20"
    >
      <div className="flex">
        {/* Impact color stripe */}
        <div
          className={`w-1 shrink-0 rounded-l-xl ${IMPACT_STRIPE_COLORS[item.impactLevel]}`}
        />

        <div className="flex-1 p-5 space-y-3">
          {/* Top row — badges & time */}
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <span
                className={`inline-flex items-center text-xs font-semibold px-2 py-0.5 rounded-full ${AGENCY_BADGE_STYLES[item.agency]}`}
              >
                {item.agency}
              </span>
              <span
                className={`inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full ring-1 ring-inset ${IMPACT_BADGE_STYLES[item.impactLevel]}`}
              >
                {item.impactLevel.charAt(0).toUpperCase() + item.impactLevel.slice(1)}
              </span>
            </div>

            <div className="flex items-center gap-2 text-xs text-zinc-400">
              <Clock size={13} />
              <span>{relativeTime(item.date)}</span>
            </div>
          </div>

          {/* Title */}
          <h3 className="text-sm font-semibold text-zinc-900 leading-snug line-clamp-2">
            {item.title}
          </h3>

          {/* Summary */}
          <p className="text-sm text-zinc-500 leading-relaxed line-clamp-3">
            {item.summary}
          </p>

          {/* Tags */}
          {item.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {item.tags.map((tag) => (
                <span
                  key={tag}
                  className="text-xs font-medium px-2 py-0.5 rounded-full bg-zinc-50 text-zinc-500 border border-zinc-200"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}

          {/* Actions row */}
          <div className="flex items-center justify-between pt-1">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                // Navigate to change impact analysis (stub)
                console.log('[RegulatoryIntelligenceFeed] Analyze impact:', item.id);
              }}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:text-blue-700 transition-colors duration-150"
            >
              <TrendingUp size={13} />
              Analyze Impact
            </button>

            <div className="flex items-center gap-2">
              {item.url && (
                <span
                  onClick={(e) => {
                    e.stopPropagation();
                    window.open(item.url, '_blank');
                  }}
                  className="text-zinc-400 hover:text-zinc-600 transition-colors cursor-pointer"
                >
                  <ExternalLink size={14} />
                </span>
              )}
              <span
                onClick={(e) => {
                  e.stopPropagation();
                  onBookmark(item.id);
                }}
                className={`transition-colors cursor-pointer ${
                  item.bookmarked
                    ? 'text-violet-500 hover:text-violet-600'
                    : 'text-zinc-400 hover:text-zinc-600'
                }`}
              >
                <Bookmark size={14} fill={item.bookmarked ? 'currentColor' : 'none'} />
              </span>
            </div>
          </div>
        </div>
      </div>
    </button>
  );
}

/** Right sidebar watchlist item */
function WatchlistItem({ item }: { item: IntelligenceItem }) {
  return (
    <div className="py-3 border-b border-zinc-50 last:border-0">
      <div className="flex items-start gap-2">
        <Bookmark size={13} className="text-violet-500 mt-0.5 shrink-0" fill="currentColor" />
        <div className="min-w-0">
          <p className="text-xs font-medium text-zinc-900 line-clamp-2 leading-snug">
            {item.title}
          </p>
          <p className="text-xs text-zinc-400 mt-1">
            {item.agency} &middot; {relativeTime(item.date)}
          </p>
        </div>
      </div>
    </div>
  );
}

/** PDUFA timeline item */
function PDUFAItem({ pdufa }: { pdufa: PDUFADate }) {
  return (
    <div className="py-3 border-b border-zinc-50 last:border-0">
      <div className="flex items-start gap-3">
        <div className="w-10 text-center shrink-0">
          <p className="text-xs font-semibold text-blue-600 uppercase">
            {new Date(pdufa.date).toLocaleDateString('en-US', { month: 'short' })}
          </p>
          <p className="text-lg font-semibold text-zinc-900 leading-tight">
            {new Date(pdufa.date).getDate()}
          </p>
        </div>
        <div className="min-w-0">
          <p className="text-xs font-semibold text-zinc-900">{pdufa.drug}</p>
          <p className="text-xs text-zinc-500">{pdufa.sponsor}</p>
          <p className="text-xs text-zinc-400 mt-0.5 line-clamp-1">{pdufa.indication}</p>
        </div>
      </div>
    </div>
  );
}

/** Select dropdown styled consistently */
function SelectDropdown({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="appearance-none text-sm bg-white border border-zinc-200 rounded-lg px-3 py-2 pr-8 text-zinc-700 focus-visible:ring-2 focus-visible:ring-blue-500 outline-none/20 focus:border-blue-400 transition-colors cursor-pointer"
      >
        <option value="">{label}</option>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      <Filter
        size={13}
        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none"
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Fallback data generator (used when API is unavailable)
// ---------------------------------------------------------------------------

function generateFallbackData(): FeedResponse {
  const now = Date.now();
  const hour = 3_600_000;

  const items: IntelligenceItem[] = [
    {
      id: '1',
      title: 'FDA Issues Draft Guidance on AI/ML-Based Software as a Medical Device',
      summary:
        'The FDA has published comprehensive draft guidance outlining a regulatory framework for artificial intelligence and machine learning-based Software as a Medical Device (SaMD). This guidance introduces a total product lifecycle approach and establishes predetermined change control plans for AI/ML devices.',
      agency: 'FDA',
      impactLevel: 'critical',
      date: new Date(now - 2 * hour).toISOString(),
      tags: ['AI/ML', 'SaMD', 'Draft Guidance', 'Digital Health'],
      category: 'guidance',
      url: '#',
      bookmarked: true,
    },
    {
      id: '2',
      title: 'EMA Publishes Revised Guideline on Clinical Trials in Rare Diseases',
      summary:
        'The European Medicines Agency released an updated guideline addressing specific methodological challenges in rare disease clinical trial design, including adaptive trial designs, use of external controls, and novel endpoint strategies to accelerate development timelines.',
      agency: 'EMA',
      impactLevel: 'high',
      date: new Date(now - 5 * hour).toISOString(),
      tags: ['Rare Disease', 'Clinical Trials', 'Adaptive Design'],
      category: 'guidance',
      url: '#',
      bookmarked: false,
    },
    {
      id: '3',
      title: 'PMDA Approves First Gene Therapy for Spinal Muscular Atrophy in Japan',
      summary:
        'Japan\'s Pharmaceuticals and Medical Devices Agency granted approval for a one-time gene replacement therapy for pediatric patients with spinal muscular atrophy, marking the first gene therapy approved under Japan\'s expedited pathway for regenerative medicine products.',
      agency: 'PMDA',
      impactLevel: 'medium',
      date: new Date(now - 24 * hour).toISOString(),
      tags: ['Gene Therapy', 'SMA', 'Approval', 'Pediatric'],
      category: 'approval',
      url: '#',
      bookmarked: true,
    },
    {
      id: '4',
      title: 'FDA Warning Letter: Manufacturing Deficiencies at Major CDMO Facility',
      summary:
        'The FDA issued a warning letter to a major contract development and manufacturing organization citing significant deviations from current Good Manufacturing Practice including data integrity failures, inadequate environmental monitoring, and insufficient aseptic processing controls.',
      agency: 'FDA',
      impactLevel: 'critical',
      date: new Date(now - 3 * hour).toISOString(),
      tags: ['cGMP', 'Warning Letter', 'Manufacturing', 'Data Integrity'],
      category: 'enforcement',
      url: '#',
      bookmarked: false,
    },
    {
      id: '5',
      title: 'NMPA Updates Requirements for Biosimilar Product Registration',
      summary:
        'China\'s National Medical Products Administration has published revised technical requirements for biosimilar product registration, harmonizing more closely with ICH guidelines and introducing streamlined pathways for products already approved by stringent regulatory authorities.',
      agency: 'NMPA',
      impactLevel: 'high',
      date: new Date(now - 8 * hour).toISOString(),
      tags: ['Biosimilars', 'Registration', 'ICH Harmonization'],
      category: 'guidance',
      url: '#',
      bookmarked: false,
    },
    {
      id: '6',
      title: 'Health Canada Releases Guidance on Real-World Evidence for Regulatory Decisions',
      summary:
        'Health Canada released a final guidance document outlining acceptable uses of real-world evidence to support regulatory decision-making, including post-market surveillance, label expansion, and as supplementary data in new drug submissions.',
      agency: 'HC',
      impactLevel: 'medium',
      date: new Date(now - 48 * hour).toISOString(),
      tags: ['RWE', 'Post-Market', 'Regulatory Science'],
      category: 'guidance',
      url: '#',
      bookmarked: false,
    },
    {
      id: '7',
      title: 'EMA CHMP Positive Opinion for Novel Bispecific Antibody in NSCLC',
      summary:
        'The Committee for Medicinal Products for Human Use adopted a positive opinion recommending marketing authorization for a first-in-class bispecific antibody targeting PD-L1 and VEGF for treatment of advanced non-small cell lung cancer after prior chemotherapy.',
      agency: 'EMA',
      impactLevel: 'medium',
      date: new Date(now - 12 * hour).toISOString(),
      tags: ['Oncology', 'NSCLC', 'Bispecific', 'CHMP'],
      category: 'approval',
      url: '#',
      bookmarked: false,
    },
    {
      id: '8',
      title: 'TGA Implements New Electronic Submission Gateway for Clinical Trial Applications',
      summary:
        'Australia\'s Therapeutic Goods Administration has launched a new fully electronic submission portal for clinical trial notifications and applications, replacing the legacy paper-based system and enabling faster processing and real-time application tracking.',
      agency: 'TGA',
      impactLevel: 'low',
      date: new Date(now - 72 * hour).toISOString(),
      tags: ['eCTD', 'Digital Transformation', 'Clinical Trials'],
      category: 'alert',
      url: '#',
      bookmarked: false,
    },
    {
      id: '9',
      title: 'MHRA Publishes Post-Brexit Mutual Recognition Framework with EU',
      summary:
        'The UK Medicines and Healthcare products Regulatory Agency published a new framework for mutual recognition of GMP inspections and batch testing with EU member states, reducing duplication and streamlining supply chain operations for manufacturers serving both markets.',
      agency: 'MHRA',
      impactLevel: 'high',
      date: new Date(now - 6 * hour).toISOString(),
      tags: ['GMP', 'Mutual Recognition', 'Supply Chain', 'Brexit'],
      category: 'guidance',
      url: '#',
      bookmarked: true,
    },
    {
      id: '10',
      title: 'FDA Extends Comment Period for Proposed Rule on Laboratory Developed Tests',
      summary:
        'The Food and Drug Administration announced a 60-day extension to the public comment period for the proposed rule to regulate laboratory developed tests as medical devices, responding to industry requests for additional time to prepare detailed comments.',
      agency: 'FDA',
      impactLevel: 'low',
      date: new Date(now - 96 * hour).toISOString(),
      tags: ['LDT', 'IVD', 'Proposed Rule', 'Comment Period'],
      category: 'alert',
      url: '#',
      bookmarked: false,
    },
  ];

  const pdufa_dates: PDUFADate[] = [
    {
      id: 'p1',
      drug: 'Etranavib',
      sponsor: 'Vertex Pharmaceuticals',
      date: '2026-04-15',
      indication: 'Cystic Fibrosis (triple combination)',
    },
    {
      id: 'p2',
      drug: 'Tovorafenib',
      sponsor: 'Day One Biopharmaceuticals',
      date: '2026-04-22',
      indication: 'Pediatric Low-Grade Glioma',
    },
    {
      id: 'p3',
      drug: 'Suzetrigine',
      sponsor: 'Vertex Pharmaceuticals',
      date: '2026-05-03',
      indication: 'Acute Pain (non-opioid)',
    },
    {
      id: 'p4',
      drug: 'Cretostimogene',
      sponsor: 'Ferring Pharmaceuticals',
      date: '2026-05-18',
      indication: 'Non-Muscle Invasive Bladder Cancer',
    },
    {
      id: 'p5',
      drug: 'Marnetegragene',
      sponsor: 'BioMarin',
      date: '2026-06-01',
      indication: 'Hemophilia A (gene therapy)',
    },
  ];

  return {
    items,
    pdufa_dates,
    metrics: {
      new_guidance: 12,
      active_alerts: 5,
      recent_approvals: 8,
      pdufa_dates: pdufa_dates.length,
    },
  };
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

interface RegulatoryIntelligenceFeedProps {
  projectId?: string;
  submissionType?: string;
}

const RegulatoryIntelligenceFeed: React.FC<RegulatoryIntelligenceFeedProps> = ({ projectId, submissionType }) => {
  // ------ State ------
  const [feedData, setFeedData] = useState<FeedResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [agencyFilter, setAgencyFilter] = useState('');
  const [impactFilter, setImpactFilter] = useState('');
  const [therapeuticAreaFilter, setTherapeuticAreaFilter] = useState('');

  // ------ Fetch ------
  const fetchFeed = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (agencyFilter) params.set('agency', agencyFilter);
      if (impactFilter) params.set('impact', impactFilter);
      if (therapeuticAreaFilter) params.set('therapeutic_area', therapeuticAreaFilter);

      const qs = params.toString();
      const url = `/api/ana/intelligence-feed${qs ? `?${qs}` : ''}`;

      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const data: FeedResponse = await response.json();
      setFeedData(data);
    } catch {
      // Fallback to realistic demo data when the API is unavailable
      console.warn(
        '[RegulatoryIntelligenceFeed] API unavailable — using fallback data',
      );
      setFeedData(generateFallbackData());
    } finally {
      setLoading(false);
    }
  }, [agencyFilter, impactFilter, therapeuticAreaFilter]);

  useEffect(() => {
    fetchFeed();
  }, [fetchFeed]);

  // ------ Bookmark toggle (local state) ------
  const handleBookmark = useCallback((id: string) => {
    setFeedData((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        items: prev.items.map((item) =>
          item.id === id ? { ...item, bookmarked: !item.bookmarked } : item,
        ),
      };
    });
  }, []);

  // ------ Click handler ------
  const handleCardClick = useCallback((item: IntelligenceItem) => {
    console.log('[RegulatoryIntelligenceFeed] Card clicked:', item.id, item.title);
  }, []);

  // ------ Client-side search filtering ------
  const filteredItems = useMemo(() => {
    if (!feedData) return [];
    const q = searchQuery.toLowerCase().trim();
    if (!q) return feedData.items;
    return feedData.items.filter(
      (item) =>
        item.title.toLowerCase().includes(q) ||
        item.summary.toLowerCase().includes(q) ||
        item.tags.some((t) => t.toLowerCase().includes(q)),
    );
  }, [feedData, searchQuery]);

  const watchlistItems = useMemo(
    () => feedData?.items.filter((i) => i.bookmarked) ?? [],
    [feedData],
  );

  // ------ Render ------
  return (
    <div className="min-h-screen" style={{ backgroundColor: '#FAFAF9' }}>
      {/* ===================== HEADER ===================== */}
      <header className="sticky top-0 z-30 border-b border-zinc-200 bg-[#FAFAF9]/80 backdrop-blur-md">
        <div className="max-w-[1440px] mx-auto px-6 py-4">
          {/* Title row */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-semibold text-zinc-900 tracking-tight">
                Regulatory Intelligence
              </h1>
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700">
                <Radio size={11} className="animate-pulse" />
                Live
              </span>
            </div>

            <button
              type="button"
              className="relative p-2 rounded-lg text-zinc-500 hover:text-zinc-700 hover:bg-zinc-100 transition-colors duration-150"
              aria-label="Notifications"
            >
              <Bell size={18} />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full" />
            </button>
          </div>

          {/* Search & Filters row */}
          <div className="flex items-center gap-3 flex-wrap">
            {/* Search */}
            <div className="relative flex-1 min-w-[200px] max-w-md">
              <Search
                size={15}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400"
              />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search guidance, alerts, approvals..."
                className="w-full text-sm bg-white border border-zinc-200 rounded-lg pl-9 pr-3 py-2 text-zinc-900 placeholder:text-zinc-400 focus-visible:ring-2 focus-visible:ring-blue-500 outline-none/20 focus:border-blue-400 transition-colors duration-150"
              />
            </div>

            <SelectDropdown
              label="Agency"
              value={agencyFilter}
              options={AGENCIES.map((a) => ({ value: a, label: a }))}
              onChange={setAgencyFilter}
            />

            <SelectDropdown
              label="Impact Level"
              value={impactFilter}
              options={IMPACT_LEVELS.map((l) => ({
                value: l.value,
                label: l.label,
              }))}
              onChange={setImpactFilter}
            />

            <SelectDropdown
              label="Therapeutic Area"
              value={therapeuticAreaFilter}
              options={THERAPEUTIC_AREAS.map((t) => ({ value: t, label: t }))}
              onChange={setTherapeuticAreaFilter}
            />
          </div>
        </div>
      </header>

      {/* ===================== BODY ===================== */}
      <main className="max-w-[1440px] mx-auto px-6 py-6">
        {/* ---- Metrics bar ---- */}
        {loading ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            {Array.from({ length: 4 }).map((_, i) => (
              <SkeletonMetric key={i} />
            ))}
          </div>
        ) : feedData ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <MetricCard
              label="New Guidance"
              value={feedData.metrics.new_guidance}
              icon={FileText}
              accentColor="bg-blue-50 text-blue-600"
            />
            <MetricCard
              label="Active Alerts"
              value={feedData.metrics.active_alerts}
              icon={AlertTriangle}
              accentColor="bg-amber-50 text-amber-600"
            />
            <MetricCard
              label="Recent Approvals"
              value={feedData.metrics.recent_approvals}
              icon={TrendingUp}
              accentColor="bg-emerald-50 text-emerald-600"
            />
            <MetricCard
              label="PDUFA Dates"
              value={feedData.metrics.pdufa_dates}
              icon={Clock}
              accentColor="bg-violet-50 text-violet-600"
            />
          </div>
        ) : null}

        {/* ---- Main content + sidebar ---- */}
        <div className="flex gap-6">
          {/* Feed column */}
          <div className="flex-1 min-w-0 space-y-3">
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => <SkeletonCard key={i} />)
            ) : error ? (
              <div className="bg-white rounded-xl border border-zinc-200 p-10 text-center">
                <AlertTriangle size={28} className="mx-auto text-amber-400 mb-3" />
                <p className="text-sm text-zinc-600 mb-1 font-medium">
                  Unable to load intelligence feed
                </p>
                <p className="text-xs text-zinc-400 mb-4">{error}</p>
                <button
                  type="button"
                  onClick={fetchFeed}
                  className="text-sm font-medium text-blue-600 hover:text-blue-700"
                >
                  Retry
                </button>
              </div>
            ) : filteredItems.length === 0 ? (
              <div className="bg-white rounded-xl border border-zinc-200 p-10 text-center">
                <Search size={28} className="mx-auto text-zinc-400 mb-3" />
                <p className="text-sm text-zinc-600 font-medium mb-1">
                  No items match your filters
                </p>
                <p className="text-xs text-zinc-400">
                  Try adjusting your search query or filter criteria.
                </p>
              </div>
            ) : (
              filteredItems.map((item) => (
                <FeedCard
                  key={item.id}
                  item={item}
                  onBookmark={handleBookmark}
                  onClick={handleCardClick}
                />
              ))
            )}
          </div>

          {/* Right sidebar (desktop only) */}
          <aside className="hidden lg:block w-72 xl:w-80 shrink-0 space-y-5">
            {/* Watchlist */}
            <div className="bg-white rounded-xl border border-zinc-200 p-4">
              <div className="flex items-center gap-2 mb-3">
                <Bookmark size={14} className="text-violet-500" />
                <h2 className="text-sm font-semibold text-zinc-900">Your Watchlist</h2>
              </div>

              {loading ? (
                <div className="space-y-3 animate-pulse">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="flex gap-2">
                      <div className="w-3 h-3 rounded bg-zinc-200 mt-0.5 shrink-0" />
                      <div className="flex-1 space-y-1.5">
                        <div className="h-3 w-full rounded bg-zinc-200" />
                        <div className="h-3 w-2/3 rounded bg-zinc-100" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : watchlistItems.length === 0 ? (
                <p className="text-xs text-zinc-400 py-2">
                  Bookmark items to add them to your watchlist.
                </p>
              ) : (
                watchlistItems.map((item) => (
                  <WatchlistItem key={item.id} item={item} />
                ))
              )}
            </div>

            {/* PDUFA Dates */}
            <div className="bg-white rounded-xl border border-zinc-200 p-4">
              <div className="flex items-center gap-2 mb-3">
                <Clock size={14} className="text-blue-600" />
                <h2 className="text-sm font-semibold text-zinc-900">
                  Upcoming PDUFA Dates
                </h2>
              </div>

              {loading ? (
                <div className="space-y-3 animate-pulse">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="flex gap-3">
                      <div className="w-10 space-y-1">
                        <div className="h-3 w-full rounded bg-zinc-200" />
                        <div className="h-5 w-full rounded bg-zinc-200" />
                      </div>
                      <div className="flex-1 space-y-1.5">
                        <div className="h-3 w-3/4 rounded bg-zinc-200" />
                        <div className="h-3 w-1/2 rounded bg-zinc-100" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : feedData?.pdufa_dates.length === 0 ? (
                <p className="text-xs text-zinc-400 py-2">
                  No upcoming PDUFA dates tracked.
                </p>
              ) : (
                feedData?.pdufa_dates.map((pdufa) => (
                  <PDUFAItem key={pdufa.id} pdufa={pdufa} />
                ))
              )}
            </div>

            {/* AI Insight CTA */}
            <div className="bg-gradient-to-br from-violet-50 to-blue-50 rounded-xl border border-violet-100/60 p-4">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-6 h-6 rounded-lg bg-violet-100 flex items-center justify-center">
                  <TrendingUp size={13} className="text-violet-600" />
                </div>
                <h2 className="text-sm font-semibold text-violet-900">
                  AI Regulatory Insights
                </h2>
              </div>
              <p className="text-xs text-violet-700/70 leading-relaxed mb-3">
                Get AI-powered analysis of how recent regulatory changes may
                impact your development programs.
              </p>
              <button
                type="button"
                onClick={() =>
                  console.log('[RegulatoryIntelligenceFeed] AI Insights CTA clicked')
                }
                className="w-full text-xs font-semibold text-white bg-violet-600 hover:bg-violet-700 rounded-lg px-3 py-2 transition-colors duration-150"
              >
                Generate Insights Report
              </button>
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
};

export default RegulatoryIntelligenceFeed;
