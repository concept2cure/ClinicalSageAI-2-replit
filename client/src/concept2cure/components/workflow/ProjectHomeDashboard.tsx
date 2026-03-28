/**
 * ProjectHomeDashboard — Project command center.
 *
 * Claude-quality UX: calm, informative, actionable.
 * Shows everything a user needs to orient and take their next step:
 * - Project identity with type badge
 * - Recent documents with status and one-click open
 * - Suggested conversation starters (like Claude.ai)
 * - Data Room summary with upload
 * - Readiness progress
 */

import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { queryKeys } from '@/concept2cure/hooks/queryKeys';
import {
  Settings2,
  FileText,
  Database,
  Upload,
  ArrowRight,
  Clock,
  CheckCircle,
  PenLine,
  Eye,
  Lock,
  Sparkles,
  MessageSquare,
  Shield,
  Search,
  BarChart3,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ProjectHomeDashboardProps {
  project: {
    id: number;
    name: string;
    type: string;
    description?: string | null;
    sponsor?: string | null;
    product?: string | null;
    region?: string | null;
  };
  onNavigate: (mode: string, sectionCode?: string) => void;
  onOpenConfig?: () => void;
  onSuggestedPrompt?: (prompt: string) => void;
}

interface Artifact {
  id: string;
  artifactId?: string;
  title?: string;
  status?: string;
  category?: string;
  type?: string;
  ctdSection?: string;
  updatedAt?: string;
  createdAt?: string;
}

const PHARMA_TYPES = ['IND', 'NDA', 'BLA', 'MAA'];
const DEVICE_TYPES = ['510K', 'PMA', 'DE_NOVO', 'CER', 'IVDR'];

const STATUS_META: Record<string, { icon: React.ReactNode; color: string; label: string }> = {
  draft: { icon: <PenLine className="w-3 h-3" />, color: 'text-stone-500 bg-stone-100', label: 'Draft' },
  review: { icon: <Eye className="w-3 h-3" />, color: 'text-amber-600 bg-amber-50', label: 'Review' },
  in_review: { icon: <Eye className="w-3 h-3" />, color: 'text-amber-600 bg-amber-50', label: 'Review' },
  approved: { icon: <CheckCircle className="w-3 h-3" />, color: 'text-emerald-600 bg-emerald-50', label: 'Approved' },
  locked: { icon: <Lock className="w-3 h-3" />, color: 'text-blue-600 bg-blue-50', label: 'Published' },
};

function relativeTime(dateStr?: string): string {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ─── Suggested Prompts ───────────────────────────────────────────────────────

function getSuggestedPrompts(
  type: string,
  isPharma: boolean,
  isDevice: boolean,
  hasDocuments: boolean,
  reviewCount: number,
  sourceCount: number,
): { icon: React.ReactNode; text: string; prompt: string }[] {
  if (!hasDocuments) {
    // New project — guide first actions
    if (isPharma) {
      return [
        { icon: <Sparkles className="w-3.5 h-3.5" />, text: `Draft my first ${type} section`, prompt: `Help me draft the first section for my ${type} submission. What section should I start with and why?` },
        { icon: <Search className="w-3.5 h-3.5" />, text: 'Find relevant precedents', prompt: `Search for recent ${type} approval precedents relevant to my submission. What can I learn from similar successful applications?` },
        { icon: <Shield className="w-3.5 h-3.5" />, text: 'Plan my regulatory strategy', prompt: `Help me create a regulatory strategy for this ${type} submission. What are the key milestones, risks, and critical path items?` },
        { icon: <BarChart3 className="w-3.5 h-3.5" />, text: 'Assess submission readiness', prompt: `Assess my current submission readiness for this ${type} application. What do I need to prepare first?` },
      ];
    }
    if (isDevice) {
      return [
        { icon: <Sparkles className="w-3.5 h-3.5" />, text: 'Structure my device documentation', prompt: `Help me structure the documentation for my ${type} submission. What are the required sections and what order should I draft them?` },
        { icon: <Search className="w-3.5 h-3.5" />, text: 'Find predicate devices', prompt: `Help me identify predicate devices for my ${type} submission. What should I look for in substantial equivalence?` },
        { icon: <Shield className="w-3.5 h-3.5" />, text: 'Plan my regulatory pathway', prompt: `Analyze the optimal regulatory pathway for my device submission. Should I consider ${type} vs alternative routes?` },
        { icon: <BarChart3 className="w-3.5 h-3.5" />, text: 'Review compliance requirements', prompt: `What are the key compliance requirements for a ${type} submission? Help me create a checklist.` },
      ];
    }
    return [
      { icon: <Sparkles className="w-3.5 h-3.5" />, text: 'Create my first document', prompt: 'Help me create my first regulatory document. What type of document should I start with for this project?' },
      { icon: <Upload className="w-3.5 h-3.5" />, text: 'Upload source evidence', prompt: 'I want to upload source documents to ground my writing in evidence. How should I organize my data room?' },
      { icon: <Shield className="w-3.5 h-3.5" />, text: 'Plan my approach', prompt: 'Help me plan the regulatory approach for this project. What are the key considerations?' },
      { icon: <MessageSquare className="w-3.5 h-3.5" />, text: 'What can you help with?', prompt: 'What regulatory intelligence capabilities do you have? How can you help me with this project?' },
    ];
  }

  // Existing project — context-aware suggestions
  const prompts: { icon: React.ReactNode; text: string; prompt: string }[] = [];

  if (reviewCount > 0) {
    prompts.push({ icon: <Eye className="w-3.5 h-3.5" />, text: `Review ${reviewCount} pending section${reviewCount > 1 ? 's' : ''}`, prompt: `I have ${reviewCount} section${reviewCount > 1 ? 's' : ''} in review. Summarize what needs my attention and flag any regulatory concerns.` });
  }
  if (sourceCount === 0) {
    prompts.push({ icon: <Database className="w-3.5 h-3.5" />, text: 'Upload evidence to strengthen drafts', prompt: 'I need to upload source documents to my data room. What types of evidence should I prioritize for grounding my regulatory writing?' });
  }
  prompts.push({ icon: <Sparkles className="w-3.5 h-3.5" />, text: 'Draft the next section', prompt: `What section should I draft next for this ${type} submission? Consider what I already have and recommend the highest-priority gap.` });
  prompts.push({ icon: <Shield className="w-3.5 h-3.5" />, text: 'Run a gap analysis', prompt: `Analyze my current submission for gaps. What sections are missing, what claims lack evidence, and what are the top risks?` });

  return prompts.slice(0, 4);
}

// ─── Component ────────────────────────────────────────────────────────────────

export const ProjectHomeDashboard: React.FC<ProjectHomeDashboardProps> = ({
  project,
  onNavigate,
  onOpenConfig,
  onSuggestedPrompt,
}) => {
  const { data: artifacts, isLoading: artifactsLoading } = useQuery<Artifact[]>({
    queryKey: queryKeys.projects.overviewArtifacts(project.id),
    queryFn: async () => {
      const res = await apiRequest('GET', `/api/concept2cure/projects/${project.id}/artifacts`);
      if (!res.ok) return [];
      const json = await res.json();
      return Array.isArray(json.data) ? json.data : [];
    },
    staleTime: 30_000,
  });

  const upperType = (project.type || '').toUpperCase();
  const isPharma = PHARMA_TYPES.includes(upperType);
  const isDevice = DEVICE_TYPES.includes(upperType);

  const summary = useMemo(() => {
    const list = artifacts ?? [];
    let ready = 0;
    let review = 0;
    let draft = 0;
    let sourceCount = 0;
    const recentDocs: Artifact[] = [];

    for (const a of list) {
      const s = (a.status || '').toLowerCase();
      const cat = (a.category || '').toLowerCase();
      const typ = (a.type || '').toLowerCase();

      if (cat === 'source' || cat === 'evidence' || typ === 'source_document' || typ.includes('upload')) {
        sourceCount++;
        continue;
      }
      if (s === 'approved' || s === 'locked') ready++;
      else if (s === 'review' || s === 'in_review') review++;
      else if (s === 'draft' || s === 'drafting') draft++;

      recentDocs.push(a);
    }

    // Sort by most recently updated
    recentDocs.sort((a, b) => {
      const aDate = a.updatedAt || a.createdAt || '';
      const bDate = b.updatedAt || b.createdAt || '';
      return bDate.localeCompare(aDate);
    });

    const docCount = recentDocs.length;
    const pct = docCount > 0 ? Math.round((ready / docCount) * 100) : 0;

    return { docCount, ready, review, draft, pct, sourceCount, recentDocs: recentDocs.slice(0, 5) };
  }, [artifacts]);

  const typeLabel = isPharma || isDevice ? `${upperType} Submission` : project.type;

  const suggestedPrompts = useMemo(
    () => getSuggestedPrompts(upperType, isPharma, isDevice, summary.docCount > 0, summary.review, summary.sourceCount),
    [upperType, isPharma, isDevice, summary.docCount, summary.review, summary.sourceCount],
  );

  return (
    <div className="flex-shrink-0 border-b border-stone-100 bg-white/80 backdrop-blur-sm" data-testid="project-context-strip">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-4 sm:py-5">
        {/* ── Row 1: Project Identity ──────────────────────────────────────── */}
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2.5">
              <h1 className="text-lg font-semibold text-stone-900 leading-tight truncate">{project.name}</h1>
              {typeLabel && (
                <span className="text-[10px] px-2 py-0.5 rounded-md bg-stone-100 text-stone-500 font-semibold uppercase tracking-tight flex-shrink-0">
                  {typeLabel}
                </span>
              )}
            </div>
            {project.description && (
              <p className="text-[13px] text-stone-500 mt-1 leading-relaxed line-clamp-1">{project.description}</p>
            )}
          </div>
          {onOpenConfig && (
            <button
              onClick={onOpenConfig}
              aria-label="Project settings"
              className="p-1.5 text-stone-400 hover:text-stone-600 hover:bg-stone-100 rounded-lg transition-colors focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:outline-none mt-0.5"
            >
              <Settings2 className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* ── Loading skeleton ─────────────────────────────────────────── */}
        {artifactsLoading && (
          <div className="mt-4 pt-3 border-t border-stone-100 space-y-2">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="flex items-center gap-3 px-3 py-2">
                <div className="w-3.5 h-3.5 bg-stone-100 rounded animate-pulse" />
                <div className="h-3 bg-stone-100 rounded animate-pulse flex-1" style={{ maxWidth: `${70 - i * 15}%` }} />
                <div className="h-4 w-12 bg-stone-50 rounded animate-pulse" />
              </div>
            ))}
          </div>
        )}

        {/* ── Row 2: Recent Documents ──────────────────────────────────────── */}
        {!artifactsLoading && summary.recentDocs.length > 0 && (
          <div className="mt-4 pt-3 border-t border-stone-100">
            <div className="flex items-center justify-between mb-2.5">
              <span className="text-[11px] font-semibold text-stone-400 uppercase tracking-wide">Recent documents</span>
              <button
                onClick={() => onNavigate('tools')}
                className="text-[11px] text-stone-400 hover:text-stone-600 transition-colors"
              >
                View all
              </button>
            </div>
            <div className="space-y-1">
              {summary.recentDocs.map(doc => {
                const meta = STATUS_META[(doc.status || 'draft').toLowerCase()] || STATUS_META.draft;
                return (
                  <button
                    key={doc.id}
                    onClick={() => onNavigate('documents')}
                    className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-stone-50 transition-colors text-left group"
                  >
                    <FileText className="w-3.5 h-3.5 text-stone-400 flex-shrink-0" />
                    <span className="text-[13px] text-stone-700 truncate flex-1 group-hover:text-stone-900">
                      {doc.title || 'Untitled'}
                    </span>
                    {doc.ctdSection && (
                      <span className="text-[10px] text-stone-400 font-mono flex-shrink-0">{doc.ctdSection}</span>
                    )}
                    <span className={`flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded ${meta.color} flex-shrink-0`}>
                      {meta.icon}
                      {meta.label}
                    </span>
                    <span className="text-[10px] text-stone-400 flex-shrink-0 w-12 text-right">
                      {relativeTime(doc.updatedAt || doc.createdAt)}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Row 3: Readiness + Data Room ─────────────────────────────────── */}
        {!artifactsLoading && <div className="mt-4 pt-3 border-t border-stone-100">
          <div className="flex items-center gap-4">
            {/* Readiness mini-bar */}
            {summary.docCount > 0 && (
              <div className="flex items-center gap-2.5 flex-1 min-w-0">
                <div className="flex-1 h-1.5 bg-stone-100 rounded-full overflow-hidden max-w-[140px]">
                  <div
                    className="h-full bg-stone-700 rounded-full transition-all duration-500"
                    style={{ width: `${summary.pct}%` }}
                  />
                </div>
                <span className="text-[11px] text-stone-500 tabular-nums flex-shrink-0">
                  {summary.pct}% ready
                </span>
                <span className="text-[10px] text-stone-400">
                  {summary.ready} approved · {summary.draft} drafts · {summary.review} in review
                </span>
              </div>
            )}

            {/* Data Room link */}
            <button
              onClick={() => onNavigate('dataroom')}
              className="flex items-center gap-1.5 text-[11px] text-stone-500 hover:text-stone-700 transition-colors flex-shrink-0"
            >
              <Database className="w-3 h-3" />
              {summary.sourceCount > 0
                ? `${summary.sourceCount} source${summary.sourceCount !== 1 ? 's' : ''}`
                : 'Data Room'}
            </button>

            {/* Upload button */}
            <button
              onClick={() => onNavigate('upload')}
              className="flex items-center gap-1 px-2 py-1 text-[11px] text-blue-600 bg-blue-50 rounded-md hover:bg-blue-100 transition-colors flex-shrink-0"
            >
              <Upload className="w-3 h-3" />
              Upload
            </button>
          </div>
        </div>}

        {/* ── Row 4: Suggested Prompts (Claude-style) ─────────────────────── */}
        <div className="mt-4 pt-3 border-t border-stone-100">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {suggestedPrompts.map((sp, idx) => (
              <button
                key={idx}
                onClick={() => onSuggestedPrompt?.(sp.prompt)}
                className="flex items-start gap-2.5 px-3 py-2.5 rounded-xl border border-stone-150 text-left hover:border-stone-300 hover:bg-stone-50/50 transition-all group"
              >
                <span className="text-stone-400 group-hover:text-stone-600 mt-0.5 flex-shrink-0">
                  {sp.icon}
                </span>
                <span className="text-[13px] text-stone-600 leading-snug group-hover:text-stone-800">
                  {sp.text}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProjectHomeDashboard;
