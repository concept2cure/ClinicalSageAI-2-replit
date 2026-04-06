/**
 * AppsPage — ChatGPT-style app directory for Concept2Cure.
 *
 * 20 apps across 4 categories. Always browsable without a project.
 * Launching an app that requires a project is handled by the onNavigate
 * callback in ZenApp (shows toast + project picker).
 */

import React, { useState, useMemo } from 'react';
import { cn } from '@/lib/utils';
import {
  Search,
  Scale,
  FlaskConical,
  BarChart2,
  FileText,
  Heart,
  Shield,
  ShieldAlert,
  Pill,
  FileOutput,
  Globe,
  BookOpen,
  ClipboardList,
  Brain,
  Layers,
  Archive,
  FileCheck,
  AlertTriangle,
  Activity,
  CheckSquare,
  Compass,
  ChevronRight,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

type Category = 'strategy' | 'authoring' | 'intelligence' | 'quality';

interface AppEntry {
  id: string;
  label: string;
  description: string;
  category: Category;
}

interface AppsPageProps {
  onNavigate: (id: string) => void;
}

// ─── App Catalog ──────────────────────────────────────────────────────────────

const APPS: AppEntry[] = [
  // ── Strategy & Research (3) ──
  { id: 'deep-research',           label: 'Deep Research',              description: 'Search ClinicalTrials.gov, PubMed, FDA, EMA databases and regulatory sources',              category: 'strategy' },
  { id: 'precedent-intelligence',  label: 'Precedent Intelligence',     description: 'Regulatory precedent analysis, CRL/RTF patterns, and approval history mining',           category: 'strategy' },
  { id: 'device-strategy',         label: 'Device Strategy & FDA Engagement', description: 'Device classification, pathway selection (510(k)/De Novo/PMA), predicate search, and FDA Pre-Submission planning', category: 'strategy' },

  // ── Submission Authoring (5) ──
  { id: 'medical-device',          label: 'Medical Device & Diagnostics', description: 'Unified hub for 510(k), PMA, De Novo, HDE, CER (MDR), and PER (IVDR) — adapts to your project to assemble the right submission package', category: 'authoring' },
  { id: 'ind-authoring',           label: 'IND Authoring',              description: 'Investigational New Drug application — Module 2 summaries, nonclinical, and clinical',    category: 'authoring' },
  { id: 'cmc',                     label: 'CMC Module',                 description: 'Chemistry, Manufacturing and Controls — Module 3 authoring and compliance',               category: 'authoring' },
  { id: 'safety-narrative',        label: 'Safety Narrative',           description: 'ICH E3 §12 compliant safety narrative generation for clinical submissions',               category: 'authoring' },
  { id: 'report-engine',           label: 'Report Generator',           description: 'Intelligent regulatory report generation — submission summaries and strategic analysis',   category: 'authoring' },

  // ── Intelligence & Analysis (4) ──
  { id: 'regulatory-intelligence', label: 'Regulatory Intelligence',    description: 'Real-time regulatory landscape monitoring, guideline tracking, and impact analysis',       category: 'intelligence' },
  { id: 'csr-intelligence',        label: 'CSR Intelligence',           description: 'Clinical Study Report analysis, data extraction, and cross-study comparison',              category: 'intelligence' },
  { id: 'biostatistics',           label: 'Biostatistics',              description: 'Statistical analysis, power calculations, SAP design, and endpoint evaluation',            category: 'intelligence' },
  { id: 'protocol-designer',       label: 'Study Protocol Designer',    description: 'Protocol design, endpoint optimization, and statistical power simulation',                category: 'intelligence' },

  // ── Quality & Lifecycle (6) ──
  { id: 'device-engineering',      label: 'Device Engineering',         description: 'ISO 14971 risk management, IEC 62304 software & cybersecurity, IEC 62366 human factors, and ISO 10993 biocompatibility', category: 'quality' },
  { id: 'dossier-navigator',       label: 'Dossier Navigator',          description: 'CTD/eCTD structure visualization, section readiness, and placement management',            category: 'quality' },
  { id: 'ectd-navigator',          label: 'eCTD Navigator',             description: 'Electronic Common Technical Document assembly, validation, and regional compliance',       category: 'quality' },
  { id: 'document-vault',          label: 'Document Vault',             description: 'Governed document storage, version control, and evidence management',                     category: 'quality' },
  { id: 'sop-management',          label: 'SOP Management',             description: 'Standard Operating Procedures lifecycle, training tracking, and compliance',               category: 'quality' },
  { id: 'capa-management',         label: 'CAPA Management',            description: 'Corrective and preventive action tracking, root cause analysis, and closure',              category: 'quality' },
  { id: 'post-market',             label: 'Post-Market & Vigilance',    description: 'Vigilance reporting (FDA MDR, EU MIR), signal detection, PSUR and PMCF report generation',  category: 'quality' },
  { id: 'inspection-readiness',    label: 'Inspection Readiness',       description: 'FDA QSIT, EU Notified Body audits, and MDSAP — mock audit and readiness scoring',         category: 'quality' },
];

const CATEGORIES: { key: Category; label: string }[] = [
  { key: 'strategy', label: 'Strategy & Research' },
  { key: 'authoring', label: 'Submission Authoring' },
  { key: 'intelligence', label: 'Intelligence & Analysis' },
  { key: 'quality', label: 'Quality & Lifecycle' },
];

// ─── Icon Mapping ─────────────────────────────────────────────────────────────

const ICON_MAP: Record<string, React.ReactNode> = {
  // Strategy & Research
  'deep-research':           <Search className="w-5 h-5 text-stone-500" />,
  'precedent-intelligence':  <Scale className="w-5 h-5 text-stone-500" />,
  'device-strategy':         <Compass className="w-5 h-5 text-stone-500" />,
  // Submission Authoring
  'medical-device':          <Heart className="w-5 h-5 text-stone-500" />,
  'ind-authoring':           <Pill className="w-5 h-5 text-stone-500" />,
  'cmc':                     <FlaskConical className="w-5 h-5 text-stone-500" />,
  'safety-narrative':        <Shield className="w-5 h-5 text-stone-500" />,
  'report-engine':           <FileOutput className="w-5 h-5 text-stone-500" />,
  // Intelligence & Analysis
  'regulatory-intelligence': <Globe className="w-5 h-5 text-stone-500" />,
  'csr-intelligence':        <BookOpen className="w-5 h-5 text-stone-500" />,
  'biostatistics':           <BarChart2 className="w-5 h-5 text-stone-500" />,
  'protocol-designer':       <ClipboardList className="w-5 h-5 text-stone-500" />,
  // Quality & Lifecycle
  'device-engineering':      <ShieldAlert className="w-5 h-5 text-stone-500" />,
  'dossier-navigator':       <Brain className="w-5 h-5 text-stone-500" />,
  'ectd-navigator':          <Layers className="w-5 h-5 text-stone-500" />,
  'document-vault':          <Archive className="w-5 h-5 text-stone-500" />,
  'sop-management':          <FileCheck className="w-5 h-5 text-stone-500" />,
  'capa-management':         <AlertTriangle className="w-5 h-5 text-stone-500" />,
  'post-market':             <Activity className="w-5 h-5 text-stone-500" />,
  'inspection-readiness':    <CheckSquare className="w-5 h-5 text-stone-500" />,
};

function AppIcon({ id }: { id: string }) {
  return <>{ICON_MAP[id] || <FileText className="w-5 h-5 text-stone-500" />}</>;
}

// ─── Component ────────────────────────────────────────────────────────────────

export const AppsPage: React.FC<AppsPageProps> = ({ onNavigate }) => {
  const [activeCategory, setActiveCategory] = useState<Category>('strategy');
  const [searchQuery, setSearchQuery] = useState('');

  const filteredApps = useMemo(() => {
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return APPS.filter(
        a => a.label.toLowerCase().includes(q) || a.description.toLowerCase().includes(q)
      );
    }
    return APPS.filter(a => a.category === activeCategory);
  }, [activeCategory, searchQuery]);

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-4xl mx-auto px-6 py-8">
        {/* Title */}
        <h1 className="text-2xl font-semibold text-stone-900">Apps</h1>

        {/* Search */}
        <div className="relative mt-5 mb-6">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
          <input
            type="text"
            placeholder="Search apps..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-stone-200 bg-white text-sm text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-200 transition-shadow"
          />
        </div>

        {/* Category tabs */}
        <div className="flex items-center gap-2 mb-8">
          {CATEGORIES.map(cat => (
            <button
              key={cat.key}
              onClick={() => { setActiveCategory(cat.key); setSearchQuery(''); }}
              className={cn(
                'px-4 py-1.5 text-sm rounded-full transition-colors',
                activeCategory === cat.key && !searchQuery.trim()
                  ? 'bg-stone-900 text-white'
                  : 'text-stone-500 hover:bg-stone-100 hover:text-stone-700 border border-stone-200'
              )}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* App grid */}
        {filteredApps.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {filteredApps.map(app => (
              <button
                key={app.id}
                onClick={() => onNavigate(app.id)}
                className="w-full flex items-center gap-4 px-4 py-4 rounded-xl text-left hover:bg-stone-50 transition-colors group"
              >
                <div className="w-10 h-10 rounded-xl bg-stone-100 flex items-center justify-center flex-shrink-0">
                  <AppIcon id={app.id} />
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-medium text-stone-900 group-hover:text-stone-700 block">
                    {app.label}
                  </span>
                  <span className="text-xs text-stone-400 block mt-0.5 line-clamp-1">
                    {app.description}
                  </span>
                </div>
                <ChevronRight className="w-4 h-4 text-stone-300 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
              </button>
            ))}
          </div>
        ) : (
          <div className="text-center py-16">
            <p className="text-sm text-stone-400">No apps match &ldquo;{searchQuery}&rdquo;</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default AppsPage;
