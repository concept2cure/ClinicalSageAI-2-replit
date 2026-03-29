/**
 * ProjectHomeDashboard — Thin context strip above the conversation.
 *
 * Design philosophy: AnA-first. The chat IS the product.
 * This strip orients the user (project name, one-line status) and offers
 * conversation starters. Everything else surfaces through AnA when asked.
 *
 * Deliberately minimal. No dashboards, no data grids, no analytics widgets.
 * The intelligence is IN the conversation, not above it.
 */

import React, { useMemo, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { queryKeys } from '@/concept2cure/hooks/queryKeys';
import {
  useIntelligenceDashboard,
} from '@/concept2cure/hooks/useIntelligence';
import { ProjectComposeBar } from '@/concept2cure/components/workspace/ProjectComposeBar';
import {
  Settings2,
  FileText,
  Sparkles,
  Shield,
  Search,
  BarChart3,
  Eye,
  Database,
  Upload,
  MessageSquare,
  ChevronRight,
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
  onOpenSearch?: () => void;
  onOpenArtifact?: (artifactId: string) => void;
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

// ─── Suggested Prompts ───────────────────────────────────────────────────────
// These are the ONLY things the user sees besides the project name.
// They must be human-readable, not system vocabulary.

function getSuggestedPrompts(
  type: string,
  isPharma: boolean,
  isDevice: boolean,
  hasDocuments: boolean,
  hasRisk: boolean,
  reviewCount: number,
  readinessScore: number | null,
): { icon: React.ReactNode; text: string; prompt: string }[] {
  // ── New project: guide first steps ──
  if (!hasDocuments) {
    if (isPharma) {
      return [
        { icon: <Sparkles className="w-3.5 h-3.5" />, text: 'Help me get started', prompt: `I'm starting a new ${type} submission. What should I do first? Guide me through the initial steps.` },
        { icon: <Search className="w-3.5 h-3.5" />, text: 'What worked for similar submissions?', prompt: `Find recent ${type} approvals similar to mine. What can I learn from their approach?` },
        { icon: <Shield className="w-3.5 h-3.5" />, text: 'What are the biggest risks?', prompt: `What are the most common reasons ${type} submissions get rejected or delayed? Help me avoid those pitfalls.` },
        { icon: <MessageSquare className="w-3.5 h-3.5" />, text: 'What can you do?', prompt: 'Show me what you can help with. What regulatory intelligence capabilities do you have?' },
      ];
    }
    if (isDevice) {
      return [
        { icon: <Sparkles className="w-3.5 h-3.5" />, text: 'Help me get started', prompt: `I'm starting a ${type} submission. Walk me through what I need to prepare first.` },
        { icon: <Search className="w-3.5 h-3.5" />, text: 'Find similar cleared devices', prompt: `Help me find predicate devices for my ${type}. What should I look for?` },
        { icon: <Shield className="w-3.5 h-3.5" />, text: 'Am I on the right pathway?', prompt: `Is ${type} the right regulatory pathway for my device? What are the alternatives?` },
        { icon: <MessageSquare className="w-3.5 h-3.5" />, text: 'What can you do?', prompt: 'Show me what you can help with. What regulatory intelligence capabilities do you have?' },
      ];
    }
    return [
      { icon: <Sparkles className="w-3.5 h-3.5" />, text: 'Help me get started', prompt: 'I\'m starting a new project. What should I work on first?' },
      { icon: <Upload className="w-3.5 h-3.5" />, text: 'I have documents to upload', prompt: 'I want to upload source documents. How should I organize my evidence?' },
      { icon: <Shield className="w-3.5 h-3.5" />, text: 'Help me plan my approach', prompt: 'Help me think through the regulatory approach for this project.' },
      { icon: <MessageSquare className="w-3.5 h-3.5" />, text: 'What can you do?', prompt: 'What regulatory intelligence capabilities do you have? How can you help me?' },
    ];
  }

  // ── Existing project: context-aware prompts ──
  // The intelligence here is that prompts change based on project state.
  // The user doesn't see "readiness = 42%" — they see "What's holding me back?"
  const prompts: { icon: React.ReactNode; text: string; prompt: string }[] = [];

  // If there are items in review, that's the most likely next action
  if (reviewCount > 0) {
    prompts.push({
      icon: <Eye className="w-3.5 h-3.5" />,
      text: `${reviewCount} section${reviewCount > 1 ? 's' : ''} need${reviewCount === 1 ? 's' : ''} my attention`,
      prompt: `Summarize the sections in review and flag anything I should focus on.`,
    });
  }

  // If readiness is known and low, surface it as a human question
  if (readinessScore !== null && readinessScore < 60) {
    prompts.push({
      icon: <BarChart3 className="w-3.5 h-3.5" />,
      text: 'What\'s holding my submission back?',
      prompt: 'Analyze my submission readiness. What are the biggest gaps and what should I prioritize to improve?',
    });
  } else if (hasRisk) {
    prompts.push({
      icon: <Shield className="w-3.5 h-3.5" />,
      text: 'Are there any risks I should know about?',
      prompt: 'Check my submission for risks — cross-section inconsistencies, unsupported claims, missing evidence, or compliance gaps.',
    });
  }

  // Always useful
  prompts.push({
    icon: <Sparkles className="w-3.5 h-3.5" />,
    text: 'What should I work on next?',
    prompt: `What's the highest-priority thing I should work on next for this ${type} submission?`,
  });

  if (prompts.length < 4) {
    prompts.push({
      icon: <Search className="w-3.5 h-3.5" />,
      text: 'Find precedents for my approach',
      prompt: `Search for regulatory precedents relevant to my ${type} submission. What can I learn from similar applications?`,
    });
  }

  return prompts.slice(0, 4);
}

// ─── Component ────────────────────────────────────────────────────────────────

export const ProjectHomeDashboard: React.FC<ProjectHomeDashboardProps> = ({
  project,
  onNavigate,
  onOpenConfig,
  onSuggestedPrompt,
  onOpenSearch,
  onOpenArtifact,
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

  // Intelligence — fetched quietly for prompt context, NOT for display
  const { data: intelligence } = useIntelligenceDashboard(project.id);

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

    recentDocs.sort((a, b) => {
      const aDate = a.updatedAt || a.createdAt || '';
      const bDate = b.updatedAt || b.createdAt || '';
      return bDate.localeCompare(aDate);
    });

    const docCount = recentDocs.length;

    return { docCount, ready, review, draft, sourceCount, recentDocs: recentDocs.slice(0, 3) };
  }, [artifacts]);

  const hasRisk = (intelligence?.crossModule?.bySeverity?.critical ?? 0) +
    (intelligence?.crossModule?.bySeverity?.high ?? 0) > 0;
  const readinessScore = intelligence?.readiness?.overallScore ?? null;

  const typeLabel = isPharma || isDevice ? upperType : project.type;

  const suggestedPrompts = useMemo(
    () => getSuggestedPrompts(
      upperType, isPharma, isDevice,
      summary.docCount > 0, hasRisk,
      summary.review, readinessScore,
    ),
    [upperType, isPharma, isDevice, summary.docCount, hasRisk, summary.review, readinessScore],
  );

  const handleComposeAction = useCallback(
    (mode: string, prompt: string) => {
      onSuggestedPrompt?.(prompt);
    },
    [onSuggestedPrompt],
  );

  return (
    <div className="flex-shrink-0 border-b border-stone-100 bg-white/80 backdrop-blur-sm" data-testid="project-context-strip">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-4">
        {/* ── Project identity: one line ──────────────────────────────────── */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <h1 className="text-[15px] font-semibold text-stone-800 truncate">{project.name}</h1>
            {typeLabel && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-stone-100 text-stone-500 font-medium uppercase tracking-tight flex-shrink-0">
                {typeLabel}
              </span>
            )}
            {/* Quiet status — just enough to orient */}
            {!artifactsLoading && summary.docCount > 0 && (
              <span className="text-[10px] text-stone-400 flex-shrink-0">
                {summary.docCount} doc{summary.docCount !== 1 ? 's' : ''}
                {summary.review > 0 && <> · <span className="text-amber-500">{summary.review} in review</span></>}
              </span>
            )}
          </div>
          <div className="flex items-center gap-0.5 flex-shrink-0">
            {onOpenSearch && (
              <button
                onClick={onOpenSearch}
                aria-label="Search documents"
                className="p-1.5 text-stone-400 hover:text-stone-600 hover:bg-stone-50 rounded-lg transition-colors"
              >
                <Search className="w-3.5 h-3.5" />
              </button>
            )}
            {onOpenConfig && (
              <button
                onClick={onOpenConfig}
                aria-label="Project settings"
                className="p-1.5 text-stone-400 hover:text-stone-600 hover:bg-stone-50 rounded-lg transition-colors"
              >
                <Settings2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* ── Recent documents: compact, discoverable ─────────────────────── */}
        {/* Only show if there ARE documents. Max 3. Clicking opens the document. */}
        {!artifactsLoading && summary.recentDocs.length > 0 && (
          <div className="mt-3 flex items-center gap-2 overflow-x-auto scrollbar-hide">
            {summary.recentDocs.map(doc => (
              <button
                key={doc.id}
                onClick={() => onOpenArtifact ? onOpenArtifact(doc.id) : onNavigate('documents')}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-stone-100 hover:border-stone-200 hover:bg-stone-50/50 transition-colors text-left flex-shrink-0 max-w-[200px] group"
              >
                <FileText className="w-3 h-3 text-stone-400 flex-shrink-0" />
                <span className="text-[12px] text-stone-600 truncate group-hover:text-stone-800">
                  {doc.title || 'Untitled'}
                </span>
              </button>
            ))}
            {summary.docCount > 3 && (
              <button
                onClick={() => onNavigate('documents')}
                className="text-[11px] text-stone-400 hover:text-stone-600 flex-shrink-0 transition-colors flex items-center gap-0.5"
              >
                +{summary.docCount - 3} more
                <ChevronRight className="w-3 h-3" />
              </button>
            )}
          </div>
        )}

        {/* ── Compose bar: action mode chips ────────────────────────────── */}
        {!artifactsLoading && (
          <div className="mt-3">
            <ProjectComposeBar
              projectId={project.id}
              projectName={project.name}
              projectType={project.type}
              onComposeAction={handleComposeAction}
            />
          </div>
        )}

        {/* ── Loading: just the prompt cards skeleton ─────────────────────── */}
        {artifactsLoading && (
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="flex items-center gap-2.5 px-3 py-3 rounded-xl border border-stone-100 animate-pulse">
                <div className="w-3.5 h-3.5 bg-stone-100 rounded" />
                <div className="h-3 bg-stone-100 rounded flex-1" style={{ maxWidth: `${75 - i * 10}%` }} />
              </div>
            ))}
          </div>
        )}

        {/* ── Conversation starters ──────────────────────────────────────── */}
        {/* This is the main UI. Like Claude.ai — prompts that start a conversation. */}
        {!artifactsLoading && (
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2">
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
        )}
      </div>
    </div>
  );
};

export default ProjectHomeDashboard;
