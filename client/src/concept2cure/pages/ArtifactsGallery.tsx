/**
 * ArtifactsGallery — Claude.ai-style Artifacts page
 *
 * Browsable gallery of all generated outputs. Filterable by category.
 * Two tabs: "Templates" (curated starter templates) and "Your artifacts" (user-generated).
 *
 * Tailored for life sciences / regulatory:
 * Categories: Submission Documents, Clinical Reports, CMC, Regulatory Intel, Biostatistics, Templates
 */

import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import {
  FileText,
  Plus,
  Search,
  Download,
  Clock,
  Star,
  Beaker,
  BarChart2,
  ShieldCheck,
  Brain,
  FlaskConical,
  Layers,
  FolderOpen,
  Presentation,
  FileSpreadsheet,
  Sparkles,
  PenLine,
} from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────

interface Artifact {
  id: string;
  title: string;
  type: string;
  category: string;
  projectId?: string;
  projectName?: string;
  status?: string;
  createdAt?: string;
  downloadUrl?: string;
}

type TabId = 'templates' | 'yours';

interface Category {
  id: string;
  label: string;
  icon: React.ElementType;
  description: string;
}

// ─── Categories tailored for life sciences ───────────────────────────────────

const CATEGORIES: Category[] = [
  { id: 'all', label: 'All', icon: Layers, description: 'All artifacts' },
  { id: 'submission', label: 'Submission Documents', icon: FileText, description: 'eCTD sections, cover letters, narratives' },
  { id: 'clinical', label: 'Clinical Reports', icon: FlaskConical, description: 'CSRs, protocols, safety reports' },
  { id: 'cmc', label: 'CMC', icon: Beaker, description: 'Manufacturing, specifications, stability' },
  { id: 'regulatory', label: 'Regulatory Intel', icon: ShieldCheck, description: 'Gap analyses, benchmarks, precedent' },
  { id: 'biostat', label: 'Biostatistics', icon: BarChart2, description: 'SAPs, endpoints, power analyses' },
  { id: 'templates', label: 'Templates', icon: FolderOpen, description: 'Reusable regulatory templates' },
];

// ─── Template cards (curated starter templates for life sciences) ─────────

const TEMPLATE_CARDS: Array<{
  id: string;
  title: string;
  description: string;
  icon: React.ElementType;
  category: string;
  formats?: string[];
}> = [
  { id: 'submission-docs', title: 'eCTD Submission Packages', description: 'Module 1–5 sections, cover letters, device descriptions, SE comparisons, and narrative summaries', icon: FileText, category: 'submission', formats: ['DOCX', 'PDF'] },
  { id: 'clinical-reports', title: 'Clinical Study Reports', description: 'ICH E3 CSRs, study protocols, SAE narratives, informed consent, DSMB charters', icon: FlaskConical, category: 'clinical', formats: ['DOCX', 'PDF'] },
  { id: 'cmc-documents', title: 'CMC & Manufacturing', description: 'Drug substance specifications, batch records, stability protocols, analytical methods, process validation', icon: Beaker, category: 'cmc', formats: ['DOCX', 'PDF'] },
  { id: 'regulatory-intel', title: 'Regulatory Strategy', description: 'Pre-submission meeting packages, gap analyses, predicate comparisons, competitive landscapes, agency correspondence', icon: ShieldCheck, category: 'regulatory', formats: ['DOCX', 'PDF', 'PPTX'] },
  { id: 'biostat-analysis', title: 'Statistical Analysis', description: 'SAPs, sample size justifications, endpoint analyses, interim analysis plans, DSMB reports', icon: BarChart2, category: 'biostat', formats: ['DOCX', 'PDF'] },
  { id: 'quality-systems', title: 'Quality & Compliance', description: 'CAPA reports, audit responses, inspection readiness checklists, DHF/DMR documentation', icon: Brain, category: 'templates', formats: ['DOCX', 'PDF'] },
  { id: 'presentations', title: 'Presentations & Briefings', description: 'Advisory committee decks, board presentations, investigator meeting materials, training slides, KOL briefings', icon: Presentation, category: 'templates', formats: ['PPTX', 'PDF'] },
  { id: 'data-reports', title: 'Data Tables & Reports', description: 'Safety data tables, demographics summaries, efficacy listings, lab shift tables, disposition summaries', icon: FileSpreadsheet, category: 'biostat', formats: ['DOCX', 'PDF'] },
];

// ─── Component ───────────────────────────────────────────────────────────────

// ─── Exportable document formats ─────────────────────────────────────────────

const DOCUMENT_CAPABILITIES = [
  { label: 'Regulatory Documents', desc: 'eCTD sections, cover letters, IB, protocols', icon: FileText },
  { label: 'Presentations', desc: 'Board decks, advisory briefings, training', icon: Presentation },
  { label: 'Clinical Reports', desc: 'CSRs, SAPs, safety narratives', icon: FlaskConical },
  { label: 'Data Tables', desc: 'Demographics, efficacy, safety tables', icon: FileSpreadsheet },
  { label: 'Strategy Documents', desc: 'Gap analyses, regulatory strategies, plans', icon: ShieldCheck },
];

// ─── Component ───────────────────────────────────────────────────────────────

export const ArtifactsGallery: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabId>('yours');
  const [activeCategory, setActiveCategory] = useState('all');
  const [search, setSearch] = useState('');

  // Fetch user's artifacts across all projects (gallery view)
  const { data: allArtifacts = [], isLoading } = useQuery({
    queryKey: ['all-artifacts'],
    queryFn: async () => {
      const token =
        sessionStorage.getItem('trialsage_access_token') ||
        localStorage.getItem('trialsage_access_token');
      try {
        const res = await fetch('/api/concept2cure/artifacts', {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!res.ok) return [];
        const json = await res.json();
        // Backend wraps in { success: true, data: [...] }
        const items = json?.data ?? json?.artifacts ?? (Array.isArray(json) ? json : []);
        return Array.isArray(items) ? items : [];
      } catch {
        return [];
      }
    },
    staleTime: 30_000,
  });

  const filteredArtifacts = useMemo(() => {
    let items = allArtifacts as Artifact[];
    if (activeCategory !== 'all') {
      items = items.filter(a => (a.category || a.type || '').toLowerCase().includes(activeCategory));
    }
    if (search) {
      const q = search.toLowerCase();
      items = items.filter(a =>
        (a.title || '').toLowerCase().includes(q) ||
        (a.type || '').toLowerCase().includes(q) ||
        (a.projectName || '').toLowerCase().includes(q)
      );
    }
    return items;
  }, [allArtifacts, activeCategory, search]);

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-white overflow-y-auto">
      <div className="max-w-5xl mx-auto w-full px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-2">
          <div>
            <h1 className="text-2xl font-semibold text-zinc-900">Artifacts</h1>
            <p className="text-sm text-zinc-500 mt-1">
              Draft, edit, and export documents in any format — Word, PDF, PowerPoint, and more
            </p>
          </div>
          <button className="flex items-center gap-2 px-4 py-2 bg-zinc-900 text-white text-sm font-medium rounded-lg hover:bg-zinc-800 transition-colors flex-shrink-0">
            <Plus className="w-4 h-4" />
            New artifact
          </button>
        </div>

        {/* Export format capability bar */}
        <div className="flex items-center gap-3 mb-6 py-3 px-4 bg-zinc-50 rounded-xl border border-zinc-200">
          <Sparkles className="w-4 h-4 text-violet-500 flex-shrink-0" />
          <span className="text-xs text-zinc-600">AnA can create &amp; export:</span>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold px-2 py-0.5 rounded bg-blue-100 text-blue-700">DOCX</span>
            <span className="text-xs font-semibold px-2 py-0.5 rounded bg-red-100 text-red-700">PDF</span>
            <span className="text-xs font-semibold px-2 py-0.5 rounded bg-orange-100 text-orange-700">PPTX</span>
            <span className="text-xs font-semibold px-2 py-0.5 rounded bg-emerald-100 text-emerald-700">Markdown</span>
            <span className="text-xs font-semibold px-2 py-0.5 rounded bg-zinc-200 text-zinc-700">HTML</span>
          </div>
          <span className="text-xs text-zinc-400 ml-auto hidden sm:block">Ask AnA to draft any document type</span>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 border-b border-zinc-200 mb-6">
          {([
            { id: 'templates' as TabId, label: 'Templates' },
            { id: 'yours' as TabId, label: 'Your artifacts' },
          ]).map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px',
                activeTab === tab.id
                  ? 'border-zinc-900 text-zinc-900'
                  : 'border-transparent text-zinc-500 hover:text-zinc-700'
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* ── Templates tab ── */}
        {activeTab === 'templates' && (
          <div>
            {/* Category filters */}
            <div className="flex items-center gap-2 flex-wrap mb-6">
              {CATEGORIES.filter(c => c.id !== 'all').map(cat => (
                <button
                  key={cat.id}
                  onClick={() => setActiveCategory(activeCategory === cat.id ? 'all' : cat.id)}
                  className={cn(
                    'px-3 py-1.5 rounded-full text-sm font-medium transition-colors duration-150',
                    activeCategory === cat.id
                      ? 'bg-zinc-900 text-white'
                      : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
                  )}
                >
                  {cat.label}
                </button>
              ))}
            </div>

            {/* Template cards grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {TEMPLATE_CARDS
                .filter(t => activeCategory === 'all' || t.category === activeCategory)
                .map(template => {
                  const Icon = template.icon;
                  return (
                    <button
                      key={template.id}
                      className="text-left p-5 rounded-xl border border-zinc-200 hover:border-zinc-300 hover:shadow-sm transition-all group bg-white"
                    >
                      <div className="flex items-start justify-between mb-3">
                        <h3 className="text-sm font-semibold text-zinc-900 group-hover:text-zinc-700">
                          {template.title}
                        </h3>
                        <Icon className="w-4 h-4 text-zinc-400 flex-shrink-0" />
                      </div>
                      <p className="text-xs text-zinc-500 leading-relaxed mb-3">
                        {template.description}
                      </p>
                      {/* Format badges + Create CTA */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1">
                          {template.formats?.map(fmt => (
                            <span key={fmt} className={cn(
                              'text-xs font-semibold px-1.5 py-0.5 rounded uppercase',
                              fmt === 'DOCX' ? 'bg-blue-50 text-blue-600' :
                              fmt === 'PDF' ? 'bg-red-50 text-red-600' :
                              fmt === 'PPTX' ? 'bg-orange-50 text-orange-600' :
                              'bg-zinc-100 text-zinc-500'
                            )}>
                              {fmt}
                            </span>
                          ))}
                        </div>
                        <span className="flex items-center gap-1 text-xs font-medium text-violet-600 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Sparkles className="w-3 h-3" />
                          Create with AnA
                        </span>
                      </div>
                    </button>
                  );
                })}
            </div>
          </div>
        )}

        {/* ── Your artifacts tab ── */}
        {activeTab === 'yours' && (
          <div>
            {/* Search */}
            <div className="relative mb-4">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search artifacts..."
                className="w-full pl-9 pr-4 py-2 border border-zinc-200 rounded-lg text-sm text-zinc-900 placeholder:text-zinc-400 focus-visible:ring-2 outline-none focus:ring-zinc-200 focus:border-zinc-300"
              />
            </div>

            {/* Category filters */}
            <div className="flex items-center gap-2 flex-wrap mb-6">
              {CATEGORIES.map(cat => (
                <button
                  key={cat.id}
                  onClick={() => setActiveCategory(cat.id)}
                  className={cn(
                    'px-3 py-1.5 rounded-full text-sm font-medium transition-colors duration-150',
                    activeCategory === cat.id
                      ? 'bg-zinc-900 text-white'
                      : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
                  )}
                >
                  {cat.label}
                </button>
              ))}
            </div>

            {/* Artifacts list */}
            {isLoading ? (
              <div className="flex items-center justify-center py-16">
                <div className="w-6 h-6 rounded-full border-2 border-zinc-200 border-t-zinc-400 animate-spin" />
              </div>
            ) : filteredArtifacts.length === 0 ? (
              <div className="text-center py-16">
                <Layers className="w-8 h-8 text-zinc-400 mx-auto mb-3" />
                <h3 className="text-sm font-medium text-zinc-700 mb-1">
                  {search ? 'No artifacts match your search' : 'No artifacts yet'}
                </h3>
                <p className="text-xs text-zinc-400 max-w-xs mx-auto">
                  {search
                    ? 'Try a different search term or clear filters.'
                    : 'Start a conversation with AnA and ask it to generate documents, analyses, or reports. They\'ll appear here.'}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredArtifacts.map((artifact: Artifact) => (
                  <div
                    key={artifact.id}
                    className="group p-4 rounded-xl border border-zinc-200 hover:border-zinc-300 hover:shadow-sm transition-all bg-white cursor-pointer"
                  >
                    {/* Preview area */}
                    <div className="aspect-[4/3] rounded-lg bg-zinc-50 border border-zinc-200 flex items-center justify-center mb-3">
                      <FileText className="w-8 h-8 text-zinc-200" />
                    </div>

                    {/* Meta */}
                    <h3 className="text-sm font-medium text-zinc-900 truncate">
                      {artifact.title || artifact.type}
                    </h3>
                    <div className="flex items-center gap-2 mt-1">
                      {artifact.projectName && (
                        <span className="text-xs text-zinc-400 truncate">{artifact.projectName}</span>
                      )}
                      {artifact.status && (
                        <span className={cn(
                          'text-xs px-1.5 py-0.5 rounded-full font-medium capitalize',
                          artifact.status === 'approved' ? 'bg-emerald-50 text-emerald-600' :
                          artifact.status === 'locked' ? 'bg-blue-50 text-blue-600' :
                          artifact.status === 'review' ? 'bg-violet-50 text-violet-600' :
                          artifact.status === 'draft' ? 'bg-amber-50 text-amber-600' :
                          artifact.status === 'complete' ? 'bg-emerald-50 text-emerald-600' :
                          'bg-zinc-100 text-zinc-500'
                        )}>
                          {artifact.status === 'locked' ? 'Locked' : artifact.status}
                        </span>
                      )}
                    </div>
                    {artifact.createdAt && (
                      <div className="flex items-center gap-1 mt-1.5">
                        <Clock className="w-3 h-3 text-zinc-400" />
                        <span className="text-xs text-zinc-400">
                          {new Date(artifact.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                    )}

                    {/* Export & Actions on hover */}
                    <div className="flex items-center gap-1 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          const token = sessionStorage.getItem('trialsage_access_token') || localStorage.getItem('trialsage_access_token');
                          fetch('/api/concept2cure/artifacts/export-docx', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
                            body: JSON.stringify({ title: artifact.title, content: artifact.title }),
                          }).then(r => r.blob()).then(b => {
                            const url = URL.createObjectURL(b);
                            const a = document.createElement('a');
                            a.href = url; a.download = `${artifact.title.replace(/[^a-zA-Z0-9_-]/g, '_')}.docx`;
                            a.click(); URL.revokeObjectURL(url);
                          });
                        }}
                        className="px-1.5 py-0.5 text-xs font-medium text-zinc-500 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors duration-150"
                        title="Export as Word"
                      >
                        DOCX
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          const token = sessionStorage.getItem('trialsage_access_token') || localStorage.getItem('trialsage_access_token');
                          fetch('/api/concept2cure/artifacts/export-pdf', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
                            body: JSON.stringify({ title: artifact.title, content: artifact.title }),
                          }).then(r => r.blob()).then(b => {
                            const url = URL.createObjectURL(b);
                            const a = document.createElement('a');
                            a.href = url; a.download = `${artifact.title.replace(/[^a-zA-Z0-9_-]/g, '_')}.pdf`;
                            a.click(); URL.revokeObjectURL(url);
                          });
                        }}
                        className="px-1.5 py-0.5 text-xs font-medium text-zinc-500 hover:text-red-600 hover:bg-red-50 rounded transition-colors duration-150"
                        title="Export as PDF"
                      >
                        PDF
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          const token = sessionStorage.getItem('trialsage_access_token') || localStorage.getItem('trialsage_access_token');
                          fetch('/api/concept2cure/artifacts/export-pptx', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
                            body: JSON.stringify({ title: artifact.title, content: artifact.title }),
                          }).then(r => r.blob()).then(b => {
                            const url = URL.createObjectURL(b);
                            const a = document.createElement('a');
                            a.href = url; a.download = `${artifact.title.replace(/[^a-zA-Z0-9_-]/g, '_')}.pptx`;
                            a.click(); URL.revokeObjectURL(url);
                          });
                        }}
                        className="px-1.5 py-0.5 text-xs font-medium text-zinc-500 hover:text-orange-600 hover:bg-orange-50 rounded transition-colors duration-150"
                        title="Export as PowerPoint"
                      >
                        PPTX
                      </button>
                      <div className="flex-1" />
                      <button className="p-1 text-zinc-400 hover:text-amber-500 hover:bg-amber-50 rounded transition-colors duration-150" title="Star">
                        <Star className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default ArtifactsGallery;
