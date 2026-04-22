/**
 * @fileoverview AnA — THE single unified AI chat (Claude.ai style)
 * @module concept2cure/components/chat/AnaPersistentPanel
 * @version 4.0.0
 *
 * ONE chat. ONE input. ONE conversation. Exactly like Claude.
 * The conversation fills the available space above the input bar.
 * Input bar is always at the bottom. Context-aware per workspace.
 *
 * This is the ONLY chat surface in the application.
 */

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { apiRequest } from '@/lib/queryClient';
import { getAuthHeaders, getOrgId } from '@/utils/authToken';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { useAIAction } from '../../hooks/useAIAction';
import { useAnaQueueState } from '../../hooks/useAnaQueueState';
import type { AIActionType, AIActionSourceSurface } from '../../hooks/useAIAction';

// ── Conversation Queue ──────────────────────────────────────────────────────
type QueueWorkStatus = 'queued' | 'working' | 'waiting_action' | 'completed' | 'blocked' | 'failed';

interface ConversationQueueItem {
  id: string;
  prompt: string;
  contextSnapshot: { projectId?: number | null; sectionCode?: string | null };
  status: QueueWorkStatus;
  enqueuedAt: number;
  startedAt?: number;
  completedAt?: number;
  result?: string;
  error?: string;
}

import {
  Sparkles,
  ArrowUp,
  ArrowDown,
  Copy,
  Check,
  RotateCcw,
  ThumbsUp,
  ThumbsDown,
  ChevronDown,
  Zap,
  MessageSquare,
  Image as ImageIcon,
  Download,
  Search,
  PenTool,
  AlertTriangle,
  Target,
  GitCompare,
  Shield,
  FileSearch,
  HelpCircle,
  FileEdit,
  FolderPlus,
  Bot,
  FolderOpen,
  FileText,
  BookOpen,
  BarChart2,
  CheckCircle,
  Square,
  AlertCircle,
} from 'lucide-react';

import { ALL_DOMAIN_GROUPS } from '../../config/domain-prompts';
import { useToast } from '@/hooks/use-toast';

marked.setOptions({ breaks: true, gfm: true });

// ─── Markdown render cache — avoids re-parsing on every React re-render ─────
const _mdCache = new Map<string, string>();
const MD_CACHE_MAX = 200;

const SANITIZE_CONFIG = {
  ALLOWED_TAGS: [
    'p',
    'br',
    'strong',
    'em',
    'b',
    'i',
    'u',
    'a',
    'ul',
    'ol',
    'li',
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    'blockquote',
    'pre',
    'code',
    'table',
    'thead',
    'tbody',
    'tr',
    'th',
    'td',
    'span',
    'div',
    'hr',
    'sup',
    'sub',
  ],
  ALLOWED_ATTR: ['href', 'target', 'rel', 'class', 'id'],
} as const;

const renderMarkdown = (content: string): string => {
  const cached = _mdCache.get(content);
  if (cached !== undefined) return cached;

  let result: string;
  try {
    const rawHtml = marked.parse(content) as string;
    result = DOMPurify.sanitize(rawHtml, SANITIZE_CONFIG);
  } catch {
    result = content
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;');
  }

  // Evict oldest entry when cache is full
  if (_mdCache.size >= MD_CACHE_MAX) {
    const firstKey = _mdCache.keys().next().value;
    if (firstKey !== undefined) _mdCache.delete(firstKey);
  }
  _mdCache.set(content, result);
  return result;
};

// ─── Verdict & Confidence Signal Detection ──────────────────────────────────

interface VerdictSignal {
  type: 'verdict' | 'priority' | 'confidence' | 'action';
  label: string;
  color: string;
  bgColor: string;
}

interface FollowUpChip {
  id: string;
  label: string;
  prompt: string;
}

/**
 * Detects AnA 1.0 RI seniority signals in response text and returns
 * badges to render beneath the message. Matches the verdict vocabulary,
 * prioritization hierarchy, and confidence levels from the AnA doctrine.
 */
function detectVerdictSignals(content: string): VerdictSignal[] {
  const signals: VerdictSignal[] = [];
  const lower = content.toLowerCase();

  // Verdict detection
  if (/\bdefensible\b/.test(lower) && /\bverdict\b/i.test(content))
    signals.push({
      type: 'verdict',
      label: 'Defensible',
      color: 'text-emerald-700',
      bgColor: 'bg-emerald-50 border-emerald-200',
    });
  else if (/\bvulnerable\b/.test(lower) && /\bverdict\b/i.test(content))
    signals.push({
      type: 'verdict',
      label: 'Vulnerable',
      color: 'text-amber-700',
      bgColor: 'bg-amber-50 border-amber-200',
    });
  else if (/\boverclaimed\b/.test(lower))
    signals.push({
      type: 'verdict',
      label: 'Overclaimed',
      color: 'text-red-700',
      bgColor: 'bg-red-50 border-red-200',
    });
  else if (/\bsupportable with revision\b/.test(lower))
    signals.push({
      type: 'verdict',
      label: 'Supportable with Revision',
      color: 'text-blue-700',
      bgColor: 'bg-blue-50 border-blue-200',
    });

  // Priority detection
  if (
    /\bblocker\b/.test(lower) &&
    (/\bfix before\b/.test(lower) || /\brtf\b/.test(lower) || /\bcrl\b/.test(lower))
  )
    signals.push({
      type: 'priority',
      label: 'Blocker Identified',
      color: 'text-red-700',
      bgColor: 'bg-red-50 border-red-200',
    });
  else if (/\breviewer friction\b/.test(lower))
    signals.push({
      type: 'priority',
      label: 'Reviewer Friction',
      color: 'text-amber-700',
      bgColor: 'bg-amber-50 border-amber-200',
    });

  // Confidence detection
  if (/\bstrong\b.*\bact on this\b/.test(lower))
    signals.push({
      type: 'confidence',
      label: 'High Confidence',
      color: 'text-emerald-700',
      bgColor: 'bg-emerald-50 border-emerald-200',
    });
  else if (/\bprovisional\b.*\bpending\b/.test(lower))
    signals.push({
      type: 'confidence',
      label: 'Provisional',
      color: 'text-amber-700',
      bgColor: 'bg-amber-50 border-amber-200',
    });

  // Action detection
  if (/\bescalat(e|ion)\b/.test(lower) && /\bwarrant\b/.test(lower))
    signals.push({
      type: 'action',
      label: 'Escalation Recommended',
      color: 'text-violet-700',
      bgColor: 'bg-violet-50 border-violet-200',
    });
  else if (/\bno[- ]go\b/.test(lower))
    signals.push({
      type: 'action',
      label: 'No-Go',
      color: 'text-red-700',
      bgColor: 'bg-red-50 border-red-200',
    });
  else if (/\bproceed\b/.test(lower) && /\bmitigation\b/.test(lower))
    signals.push({
      type: 'action',
      label: 'Proceed with Mitigation',
      color: 'text-blue-700',
      bgColor: 'bg-blue-50 border-blue-200',
    });

  return signals;
}

function buildAssistantPreview(content: string): { bottomLine: string; details: string } {
  const normalized = content.trim();
  if (!normalized) return { bottomLine: '', details: '' };

  const paragraphs = normalized.split(/\n\s*\n/).filter(Boolean);
  const firstParagraph = paragraphs[0] || normalized;
  const firstSentence = firstParagraph
    .split(/(?<=[.!?])\s+/)
    .find(sentence => sentence.trim().length > 0);

  const bottomLine = (firstSentence || firstParagraph).trim();
  const details = normalized.startsWith(bottomLine)
    ? normalized.slice(bottomLine.length).trim()
    : normalized;

  return { bottomLine, details };
}

function buildFollowUpChips(args: {
  intentLens: IntentLens;
  hasProject: boolean;
  assistantContent: string;
}): FollowUpChip[] {
  const { intentLens, hasProject, assistantContent } = args;
  const chips: FollowUpChip[] = [];
  const lc = assistantContent.toLowerCase();

  const pushChip = (id: string, label: string, prompt: string) => {
    if (chips.some(c => c.id === id)) return;
    chips.push({ id, label, prompt });
  };

  pushChip('next-step', 'Give me next steps', 'Give me the top 3 next steps from your answer.');
  pushChip('risk-gaps', 'Identify risk gaps', 'Identify the biggest risk gaps from this answer.');

  if (hasProject) {
    pushChip('draft-artifact', 'Turn into draft', 'Turn this into a draft artifact I can review.');
  }

  if (intentLens === 'compare' || /\bcompare|versus|vs\.\b/.test(lc)) {
    pushChip('compare-options', 'Compare options', 'Compare the best two options with pros/cons.');
  }

  if (intentLens === 'audit' || /\bcompliance|audit|readiness\b/.test(lc)) {
    pushChip('readiness-check', 'Run readiness check', 'Run a readiness check based on this guidance.');
  }

  if (intentLens === 'strategy' || /\bstrategy|pathway|plan\b/.test(lc)) {
    pushChip('timeline', 'Build a timeline', 'Build a practical execution timeline from this strategy.');
  }

  return chips.slice(0, 3);
}

// ─── Types ───────────────────────────────────────────────────────────────────

interface AnaMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  /** Base64 images from Nano Banana */
  images?: Array<{ base64: string; mimeType: string }>;
  /** Downloadable PPTX from Nano Banana */
  pptx?: { base64: string; filename: string; mimeType: string };
  /** Whether this message has been saved as an artifact */
  savedAsArtifact?: boolean;
  /** AI provider that generated this response */
  modelProvider?: string;
  /** AI model name that generated this response */
  modelName?: string;
  evidenceUsage?: {
    firecrawlRequested?: boolean;
    firecrawlUsed?: boolean;
    quotaConsumed?: number;
    quotaRemaining?: number;
  };
  /** Flag to highlight prompts restored for inline editing */
  recalledToInput?: boolean;
  /** Set when this response was produced via Cortex fallback (no RIM/memory/orchestration) */
  fallback?: boolean;
  /** Set when the user aborted the stream before completion */
  stopped?: boolean;
}

interface DecisionStatusRailState {
  loading: boolean;
  error: string | null;
  summary: string;
  pendingApprovals: number;
  pendingConfirmations: number;
  unresolvedContradictions: boolean;
  provisional: boolean;
  needsReapproval: boolean;
  needsEscalation: boolean;
  blockedCount: number;
  count: number;
  details: Array<{
    id: string;
    status: string;
    kind: string;
    summary: string;
  }>;
}

const EMPTY_DECISION_STATUS: DecisionStatusRailState = {
  loading: false,
  error: null,
  summary: 'No pending decisions',
  pendingApprovals: 0,
  pendingConfirmations: 0,
  unresolvedContradictions: false,
  provisional: false,
  needsReapproval: false,
  needsEscalation: false,
  blockedCount: 0,
  count: 0,
  details: [],
};

interface SuggestedAction {
  id: string;
  label: string;
  intent?: string;
  description?: string;
}

// ─── AnA RI Types ─────────────────────────────────────────────────────────────

type IntentLens = 'auto' | 'audit' | 'improve' | 'risk' | 'strategy' | 'compare';

// ─── AI Provider / Model Selection ───────────────────────────────────────────

type AIProviderChoice = 'auto' | 'anthropic' | 'openai' | 'moonshot';

const THINKING_STATUS_PHASES = [
  'Reading project context',
  'Checking prior thread memory',
  'Drafting recommendation',
] as const;

interface AIProviderOption {
  id: AIProviderChoice;
  label: string;
  description: string;
  color: string;
  activeColor: string;
}

const AI_PROVIDERS: AIProviderOption[] = [
  {
    id: 'auto',
    label: 'Auto',
    description: 'Best model for the task',
    color: 'text-[#8A8880]',
    activeColor: 'text-[#D97757]',
  },
  {
    id: 'anthropic',
    label: 'Claude',
    description: 'Anthropic Claude Sonnet 4',
    color: 'text-[#8A8880]',
    activeColor: 'text-[#CC785C]',
  },
  {
    id: 'openai',
    label: 'GPT-4o',
    description: 'OpenAI GPT-4o',
    color: 'text-[#8A8880]',
    activeColor: 'text-[#10A37F]',
  },
  {
    id: 'moonshot',
    label: 'Kimi',
    description: 'Moonshot Kimi K2',
    color: 'text-[#8A8880]',
    activeColor: 'text-[#6366F1]',
  },
];

interface IntentLensOption {
  id: IntentLens;
  label: string;
  description: string;
  icon: React.ReactNode;
}

const INTENT_LENSES: IntentLensOption[] = [
  {
    id: 'auto',
    label: 'Auto',
    description: 'AnA detects intent automatically',
    icon: <Sparkles className="w-3.5 h-3.5" />,
  },
  {
    id: 'audit',
    label: 'Audit',
    description: 'Review like a regulator',
    icon: <Search className="w-3.5 h-3.5" />,
  },
  {
    id: 'improve',
    label: 'Improve',
    description: 'Strengthen writing and structure',
    icon: <PenTool className="w-3.5 h-3.5" />,
  },
  {
    id: 'risk',
    label: 'Risk',
    description: 'Predict deficiencies and rejections',
    icon: <AlertTriangle className="w-3.5 h-3.5" />,
  },
  {
    id: 'strategy',
    label: 'Strategy',
    description: 'Regulatory pathway analysis',
    icon: <Target className="w-3.5 h-3.5" />,
  },
  {
    id: 'compare',
    label: 'Compare',
    description: 'Side-by-side analysis',
    icon: <GitCompare className="w-3.5 h-3.5" />,
  },
];

interface AnaRIOrchestration {
  detectedIntent: { lens: IntentLens; confidence: number; signals: string[] };
  detectedSubmissionType: string | null;
  appliedRole: string;
  activeWorkstream?: {
    stream: string;
    phase: string;
    objective: string;
    currentFocus?: string;
    blockers?: string[];
    nextStep?: string;
    collaborationMode?: 'drive' | 'coauthor' | 'advise';
  };
  workstreamHandoff?: {
    from: string;
    to: string;
    carryForward: string[];
    openLoops: string[];
    transitionReason: string;
  } | null;
  suggestedActions: string[];
  meta?: {
    workstreamContextInjected?: boolean;
    workstreamHandoffInjected?: boolean;
  };
}

function normalizeOrchestrationPayload(payload: any): AnaRIOrchestration | null {
  if (payload?.orchestration) {
    return payload.orchestration as AnaRIOrchestration;
  }

  if (payload?.intelligence) {
    return {
      detectedIntent: {
        lens: payload.intelligence.intent || 'auto',
        confidence: payload.intelligence.intentConfidence || 0,
        signals: [],
      },
      detectedSubmissionType: payload.intelligence.submissionType || null,
      appliedRole: payload.intelligence.role || 'general',
      activeWorkstream: payload.intelligence.activeWorkstream,
      workstreamHandoff: payload.intelligence.workstreamHandoff || null,
      suggestedActions: payload.intelligence.suggestedActions || [],
    };
  }

  return null;
}

type DocumentActionType =
  | 'risk_memo'
  | 'deficiency_preemption_memo'
  | 'evidence_memo'
  | 'strategy_note'
  | 'reviewer_question_brief'
  | 'rewritten_section'
  | 'revised_artifact'
  | 'attach_to_dossier';

interface DocumentActionConfig {
  type: DocumentActionType;
  label: string;
  icon: React.ReactNode;
}

const DOCUMENT_ACTION_CONFIGS: DocumentActionConfig[] = [
  {
    type: 'revised_artifact',
    label: 'Revise Document',
    icon: <FileEdit className="w-3.5 h-3.5" />,
  },
  { type: 'risk_memo', label: 'Create Risk Memo', icon: <AlertTriangle className="w-3.5 h-3.5" /> },
  {
    type: 'deficiency_preemption_memo',
    label: 'Deficiency Preemption',
    icon: <Shield className="w-3.5 h-3.5" />,
  },
  {
    type: 'rewritten_section',
    label: 'Rewrite Section',
    icon: <PenTool className="w-3.5 h-3.5" />,
  },
  { type: 'strategy_note', label: 'Strategy Note', icon: <Target className="w-3.5 h-3.5" /> },
  { type: 'evidence_memo', label: 'Evidence Memo', icon: <FileSearch className="w-3.5 h-3.5" /> },
  {
    type: 'reviewer_question_brief',
    label: 'Reviewer Brief',
    icon: <HelpCircle className="w-3.5 h-3.5" />,
  },
  {
    type: 'attach_to_dossier',
    label: 'Attach to Dossier',
    icon: <FolderPlus className="w-3.5 h-3.5" />,
  },
];

// ─── Slash Command Autocomplete — 45 AnA 1.0 RI commands ──────────────────────

interface SlashCommand {
  command: string;
  description: string;
  category: string;
}

const SLASH_COMMANDS: SlashCommand[] = [
  // Intelligence
  { command: '/assess', description: 'Full project assessment', category: 'Intelligence' },
  {
    command: '/readiness',
    description: 'Readiness score + dimensions + gaps',
    category: 'Intelligence',
  },
  { command: '/risk', description: 'Risk profile with predictions', category: 'Intelligence' },
  { command: '/recommend', description: 'Prioritized action list', category: 'Intelligence' },
  { command: '/next', description: 'What should I do next?', category: 'Intelligence' },
  {
    command: '/signals',
    description: 'Accumulated intelligence signals',
    category: 'Intelligence',
  },
  { command: '/status', description: 'Quick 5-line project briefing', category: 'Intelligence' },
  // Analysis
  { command: '/twin', description: 'Submission twin analysis', category: 'Analysis' },
  { command: '/consistency', description: 'Cross-module consistency check', category: 'Analysis' },
  { command: '/claims', description: 'Evidence chain strength + confidence', category: 'Analysis' },
  { command: '/deficiencies', description: 'Known deficiency patterns', category: 'Analysis' },
  { command: '/simulate', description: 'Simulate reviewer challenges', category: 'Analysis' },
  { command: '/precedent', description: 'Similar products / predicates', category: 'Analysis' },
  // Biostatistics
  { command: '/sap', description: 'Generate Statistical Analysis Plan', category: 'Biostatistics' },
  {
    command: '/power',
    description: 'Sample size and power calculation',
    category: 'Biostatistics',
  },
  { command: '/dose', description: 'Dose escalation design', category: 'Biostatistics' },
  {
    command: '/defensibility',
    description: 'Statistical defensibility audit',
    category: 'Biostatistics',
  },
  { command: '/design', description: 'Clinical trial design', category: 'Biostatistics' },
  // Subspecialties
  {
    command: '/safety',
    description: 'TEAE, SAE, benefit-risk analysis',
    category: 'Subspecialties',
  },
  { command: '/cmc', description: 'Manufacturing / Module 3', category: 'Subspecialties' },
  { command: '/csr', description: 'Clinical study report analysis', category: 'Subspecialties' },
  {
    command: '/device',
    description: '510(k), PMA, De Novo intelligence',
    category: 'Subspecialties',
  },
  {
    command: '/diagnostics',
    description: 'Diagnostics/IVD validation and strategy',
    category: 'Subspecialties',
  },
  {
    command: '/cms',
    description: 'CMS coverage and reimbursement strategy',
    category: 'Subspecialties',
  },
  {
    command: '/ectd',
    description: 'Module structure / artifact placement',
    category: 'Subspecialties',
  },
  // Document Authoring
  { command: '/draft', description: 'Draft submission-ready CTD section', category: 'Authoring' },
  { command: '/audit', description: 'Hostile reviewer audit', category: 'Authoring' },
  { command: '/amend', description: 'Change tracking with impact analysis', category: 'Authoring' },
  {
    command: '/review',
    description: 'Regulatory review from reviewer perspective',
    category: 'Authoring',
  },
  { command: '/scan', description: 'Deficiency scanning', category: 'Authoring' },
  { command: '/memo', description: 'Risk assessment memo (go/no-go)', category: 'Authoring' },
  { command: '/brief', description: 'Reviewer question anticipation brief', category: 'Authoring' },
  { command: '/strategy', description: 'Regulatory strategy note', category: 'Authoring' },
  // Document Lifecycle
  { command: '/checklist', description: 'Compliance checklist generation', category: 'Lifecycle' },
  {
    command: '/freeze',
    description: 'Freeze document (immutable snapshot)',
    category: 'Lifecycle',
  },
  { command: '/sign', description: 'Electronic signature (21 CFR Part 11)', category: 'Lifecycle' },
  { command: '/submit', description: 'Submit to regulatory workflow', category: 'Lifecycle' },
  { command: '/preflight', description: 'Section/module/dossier preflight', category: 'Lifecycle' },
  // HAQ & Data Room
  {
    command: '/haq',
    description: 'Draft Health Authority Question response',
    category: 'Authoring',
  },
  { command: '/ask', description: 'Query project data room with AI', category: 'Analysis' },
  // Navigation & Meta
  {
    command: '/workflow',
    description: 'Full submission workflow progress',
    category: 'Navigation',
  },
  { command: '/knowledge', description: 'Search knowledge base', category: 'Navigation' },
  { command: '/decisions', description: 'Decision audit trail', category: 'Navigation' },
  { command: '/help', description: 'Show all capabilities', category: 'Navigation' },
  { command: '/export', description: 'Download conversation as markdown', category: 'Navigation' },
];

const SLASH_CATEGORY_COLORS: Record<string, string> = {
  Intelligence: 'text-violet-600',
  Analysis: 'text-blue-600',
  Biostatistics: 'text-emerald-600',
  Subspecialties: 'text-amber-600',
  Authoring: 'text-rose-600',
  Lifecycle: 'text-teal-600',
  Navigation: 'text-zinc-500',
};

// ─── Authoring context import ────────────────────────────────────────────────
import type { AuthoringContextPack } from '../../../../../shared/types/authoring-context';
import { serializeContextForChat } from '../../services/authoring-context-resolver';

interface AnaPersistentPanelProps {
  contextProfile?: {
    productType?: string;
    userRole?: string;
    screenName?: string;
    activeProject?: string;
    projectId?: string;
    organizationId?: string | number;
    customInstructions?: string;
    /** Page-specific context for deeper awareness (active tab, filters, etc.) */
    moduleContext?: Record<string, unknown>;
    /** Optional thread to hydrate on mount/switch for deterministic resume */
    threadId?: string;
  };
  /** Canonical authoring context — section/artifact/workflow awareness for AnA */
  authoringContext?: AuthoringContextPack | null;
  /** Suggested actions shown as quick-start chips when conversation is empty */
  suggestedActions?: SuggestedAction[];
  /** Greeting text shown when no messages */
  greeting?: string;
  /** Initial message to auto-send on mount */
  initialMessage?: string | null;
  /** Callback when user triggers a suggested action */
  onActionRun?: (entry: {
    id: string;
    intent: string;
    label: string;
    status: 'running' | 'done' | 'failed';
    ts: number;
  }) => void;
  /** Navigate to a layout mode or path */
  onNavigate?: (path: string) => void;
  /** Open the new-project modal */
  onCreateProject?: () => void;
  /** Projects list for home display */
  projects?: Array<{ id: string; name: string; type: string; updatedAt?: string | Date }>;
  /** Navigate to a specific project */
  onSelectProject?: (projectId: string) => void;
  /** Insert draft content into the governed editor (P1) */
  onDraftInsert?: (content: string, title: string, ctdSection?: string) => void;
  /** Navigate to a specific section (P2) */
  onNavigateToSection?: (sectionCode: string) => void;
  /** Open a specific artifact in the editor (P2) */
  onOpenArtifact?: (artifactId: string) => void;
  /** Request governed promotion of current artifact (P5) */
  onRequestPromotion?: (artifactId: string) => Promise<{ promoted: boolean; message: string }>;
  /** Open the version compare inspector panel (P4) */
  onOpenCompareInspector?: () => void;
  /** Refresh authoring intelligence (readiness/contradictions) after actions */
  onRefreshIntelligence?: () => void;
  /** Notify parent when active thread context changes */
  onThreadChange?: (threadId?: string) => void;
  /**
   * "full" = fills all available space with full conversation + composer
   * "compact" = just the input bar at bottom, conversation expands as overlay
   */
  mode?: 'full' | 'compact';
  /** Pre-select the chat mode (standard, deep-research, or nano-banana) */
  defaultChatMode?: 'standard' | 'deep-research' | 'nano-banana';
  /** Project intelligence stats for enriched greeting */
  projectIntelligence?: {
    documentCount: number;
    signalCount: number;
    readinessScore: number | null;
    memoryAtomCount: number;
    /** Enriched from useProjectIntelligence + useNextBestActions */
    recommendations?: Array<{ id: string; title: string; severity: string; category: string }>;
    nextActions?: Array<{ id: string; title: string; priority: string; reason: string }>;
    riskFactors?: Array<{ description: string; likelihood: string; impact: string }>;
    openQuestions?: Array<{ question: string; priority: string; context: string }>;
  };
}

// ─── Context labels ──────────────────────────────────────────────────────────

// [BATCH 4] Trimmed to surviving first-class + specialist modes only
const SCREEN_LABELS: Record<string, string> = {
  projects: 'Home',
  'project-home': 'Project Home',
  'dossier-map': 'Dossier',
  documents: 'Documents',
  review: 'Review',
  submissions: 'Submissions',
  'section-workspace': 'Section Workspace',
  'regulatory-workspace': 'Workspace',
  'review-readiness': 'Review & Readiness',
  biostatistics: 'Biostatistics',
  'deep-research': 'Deep Research',
  'precedent-intelligence': 'Precedent Intelligence',
  'report-engine': 'Report Engine',
  'safety-narrative': 'Safety Narrative',
};

// ─── Component ───────────────────────────────────────────────────────────────

const AnaPersistentPanel: React.FC<AnaPersistentPanelProps> = ({
  contextProfile,
  authoringContext,
  initialMessage,
  onActionRun,
  onNavigate,
  onCreateProject,
  projects,
  onSelectProject,
  onDraftInsert,
  onNavigateToSection,
  onOpenArtifact,
  onRequestPromotion,
  onOpenCompareInspector,
  onRefreshIntelligence,
  onThreadChange,
  mode = 'full',
  defaultChatMode = 'standard',
  projectIntelligence,
  greeting,
}) => {
  // Enhancement rule (in-place): evolve this single chat surface, do not rebuild parallel UIs.
  // AI Action system — unified execution spine (Phase 1)
  const aiAction = useAIAction();

  const [messages, setMessages] = useState<AnaMessage[]>([]);
  const [conversationQueue, setConversationQueue] = React.useState<ConversationQueueItem[]>([]);
  const [activeQueueItemId, setActiveQueueItemId] = React.useState<string | null>(null);
  const ANA_QUEUE_STORAGE_KEY = 'ana_conversation_queue';
  const [input, setInput] = useState('');
  const lastSubmittedPromptRef = useRef<string | null>(null);
  const queue = useAnaQueueState();
  const { toast } = useToast();
  // AbortController for the in-flight streaming request, so the user can stop.
  const abortControllerRef = useRef<AbortController | null>(null);
  const isLoading = queue.state.status === 'queued' || queue.state.status === 'post_processing';
  const isStreaming = queue.state.status === 'streaming';
  const isThinking = !queue.state.canSubmit;
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isFocused, setIsFocused] = useState(false);
  const [chatMode, setChatMode] = useState<'standard' | 'deep-research' | 'nano-banana'>(
    defaultChatMode
  );
  const [showModeDropdown, setShowModeDropdown] = useState(false);
  const modeDropdownRef = useRef<HTMLDivElement>(null);
  const [showActions, setShowActions] = useState<string | null>(null);
  const [decisionRailExpanded, setDecisionRailExpanded] = useState(false);
  const [decisionStatus, setDecisionStatus] = useState<DecisionStatusRailState>(EMPTY_DECISION_STATUS);
  // AnA RI state
  const [intentLens, setIntentLens] = useState<IntentLens>('auto');
  const [lastOrchestration, setLastOrchestration] = useState<AnaRIOrchestration | null>(null);
  const [showLensDropdown, setShowLensDropdown] = useState(false);
  const lensDropdownRef = useRef<HTMLDivElement>(null);
  // AI Provider / Model selector
  const [selectedProvider, setSelectedProvider] = useState<AIProviderChoice>('auto');
  const [showProviderDropdown, setShowProviderDropdown] = useState(false);
  const providerDropdownRef = useRef<HTMLDivElement>(null);
  const [useFirecrawl, setUseFirecrawl] = useState(false);
  const [showToolDropdown, setShowToolDropdown] = useState(false);
  const [firecrawlQuotaRemaining, setFirecrawlQuotaRemaining] = useState<number | null>(null);
  const [firecrawlDisabledReason, setFirecrawlDisabledReason] = useState<
    'admin_disabled' | 'quota_exhausted' | null
  >(null);
  const [statusPhaseIndex, setStatusPhaseIndex] = useState(0);
  const [expandedAssistantMessages, setExpandedAssistantMessages] = useState<Record<string, boolean>>(
    {}
  );
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);
  const previousMessageSnapshotRef = useRef<{ count: number; lastId: string | null }>({
    count: 0,
    lastId: null,
  });
  const toolsDropdownRef = useRef<HTMLDivElement>(null);
  const conversationViewportRef = useRef<HTMLDivElement>(null);
  const shouldAutoScrollRef = useRef(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  // Slash command autocomplete
  const [slashMenuOpen, setSlashMenuOpen] = useState(false);
  const [slashMenuIndex, setSlashMenuIndex] = useState(0);
  const slashMenuRef = useRef<HTMLDivElement>(null);
  const initialMessageSentRef = useRef(false);
  // Thread persistence — reuse thread_id across messages for continuous conversation
  const threadIdRef = useRef<string | null>(null);
  const draftStorageKey = useMemo(() => {
    const projectScope = contextProfile?.projectId || 'global';
    return `ana:persistent:draft:${projectScope}:${mode}:${chatMode}`;
  }, [contextProfile?.projectId, mode, chatMode]);

  const screenName = contextProfile?.screenName || 'default';
  const screenLabel = SCREEN_LABELS[screenName] || '';
  const decisionRailProjectId = useMemo(() => {
    const id = contextProfile?.projectId;
    return id ? String(id).replace(/^proj_/, '') : null;
  }, [contextProfile?.projectId]);

  const loadDecisionRail = useCallback(async () => {
    if (!decisionRailProjectId) {
      setDecisionStatus(EMPTY_DECISION_STATUS);
      return;
    }

    setDecisionStatus(prev => ({ ...prev, loading: true, error: null }));
    try {
      const params = new URLSearchParams({ project_id: decisionRailProjectId, limit: '8' });
      if (authoringContext?.sectionCode) params.set('section_code', authoringContext.sectionCode);
      if (authoringContext?.moduleCode) params.set('module_code', authoringContext.moduleCode);
      const res = await apiRequest('GET', `/api/ana-ri/decisions?${params.toString()}`);
      const payload = await res.json();
      const data = payload?.data;
      if (!payload?.success || !data) {
        throw new Error(payload?.error?.message || 'Failed to load decision status');
      }

      const status = data.decisionAwareStatus || {};
      const decisions = Array.isArray(data.decisions) ? data.decisions : [];
      setDecisionStatus({
        loading: false,
        error: null,
        summary: status.summary || 'No pending decisions',
        pendingApprovals: Number(status.pendingApprovals || 0),
        pendingConfirmations: Number(status.pendingConfirmations || 0),
        unresolvedContradictions: Boolean(status.hasUnresolvedContradictions),
        provisional: Boolean(status.hasProvisionalDecisions),
        needsReapproval: Boolean(status.needsReapproval),
        needsEscalation: Boolean(status.needsEscalation),
        blockedCount: Array.isArray(status.blockedDecisions) ? status.blockedDecisions.length : 0,
        count: Number(data.count || decisions.length || 0),
        details: decisions.slice(0, 6).map((row: any) => {
          const decision = row?.decision || {};
          return {
            id: String(decision.id || ''),
            status: String(decision.status || 'unknown'),
            kind: String(decision.kind || 'decision'),
            summary: String(decision.summary || 'No summary provided'),
          };
        }),
      });
    } catch (error: any) {
      setDecisionStatus(prev => ({
        ...prev,
        loading: false,
        error: error?.message || 'Unable to load decision status',
      }));
    }
  }, [authoringContext?.moduleCode, authoringContext?.sectionCode, decisionRailProjectId]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const savedQueue = window.localStorage.getItem(ANA_QUEUE_STORAGE_KEY);
    if (!savedQueue) return;

    try {
      const parsedQueue = JSON.parse(savedQueue) as ConversationQueueItem[];
      if (Array.isArray(parsedQueue)) {
        setConversationQueue(parsedQueue.filter(item => item.status === 'queued'));
      }
    } catch {
      window.localStorage.removeItem(ANA_QUEUE_STORAGE_KEY);
    }
  }, [ANA_QUEUE_STORAGE_KEY]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    if (conversationQueue.length === 0) {
      window.localStorage.removeItem(ANA_QUEUE_STORAGE_KEY);
      return;
    }

    window.localStorage.setItem(ANA_QUEUE_STORAGE_KEY, JSON.stringify(conversationQueue));
  }, [ANA_QUEUE_STORAGE_KEY, conversationQueue]);

  useEffect(() => {
    const tenantId = contextProfile?.organizationId || getOrgId();
    if (!tenantId) return;

    fetch(`/api/firecrawl/quota-status?tenantId=${tenantId}`, {
      credentials: 'include',
      headers: getAuthHeaders(),
    })
      .then(async res => {
        const payload = await res.json().catch(() => null);
        if (!res.ok || !payload?.success) return;
        const quota = payload.data;
        setFirecrawlQuotaRemaining(Number(quota?.remaining ?? 0));
        if (quota?.reason === 'policy_blocked') {
          setFirecrawlDisabledReason('admin_disabled');
          setUseFirecrawl(false);
        } else if (quota?.reason === 'quota_exhausted') {
          setFirecrawlDisabledReason('quota_exhausted');
          setUseFirecrawl(false);
        } else {
          setFirecrawlDisabledReason(null);
        }
      })
      .catch(() => {
        console.warn('[AnA] Firecrawl quota check failed — non-blocking');
      });
  }, [contextProfile?.organizationId]);

  useEffect(() => {
    void loadDecisionRail();
  }, [loadDecisionRail]);

  // ── Slash command autocomplete filtering ──────────────────────────────────
  const filteredSlashCommands = useMemo(() => {
    if (!slashMenuOpen) return [];
    const trimmed = input.trim().toLowerCase();
    if (!trimmed.startsWith('/')) return [];
    const query = trimmed;
    return SLASH_COMMANDS.filter(
      cmd => cmd.command.startsWith(query) || cmd.description.toLowerCase().includes(query.slice(1))
    ).slice(0, 10);
  }, [input, slashMenuOpen]);

  // Close slash menu when input no longer starts with /
  useEffect(() => {
    const trimmed = input.trim();
    if (!trimmed.startsWith('/') || trimmed.includes(' ')) {
      setSlashMenuOpen(false);
    }
  }, [input]);

  // Close mode dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (modeDropdownRef.current && !modeDropdownRef.current.contains(e.target as Node)) {
        setShowModeDropdown(false);
      }
    };
    if (showModeDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showModeDropdown]);

  // Close lens dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (lensDropdownRef.current && !lensDropdownRef.current.contains(e.target as Node)) {
        setShowLensDropdown(false);
      }
    };
    if (showLensDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showLensDropdown]);

  // Close provider dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (providerDropdownRef.current && !providerDropdownRef.current.contains(e.target as Node)) {
        setShowProviderDropdown(false);
      }
    };
    if (showProviderDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showProviderDropdown]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (toolsDropdownRef.current && !toolsDropdownRef.current.contains(e.target as Node)) {
        setShowToolDropdown(false);
      }
    };
    if (showToolDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showToolDropdown]);

  // AnA personality — rotating thinking messages
  const [thinkingMsg, setThinkingMsg] = useState('');
  useEffect(() => {
    if (!isThinking) {
      setStatusPhaseIndex(0);
      return;
    }
    const STANDARD_THINKING = [
      'Thinking...',
      'Working on it...',
      'Preparing response...',
    ];
    const DEEP_RESEARCH_THINKING = [
      'Searching external databases...',
      'Pulling from ClinicalTrials.gov, PubMed, FDA...',
      'Aggregating results...',
      'Synthesizing findings...',
      'Found some interesting precedents — pulling them together...',
    ];
    const ANA_THINKING_MESSAGES =
      chatMode === 'deep-research' ? DEEP_RESEARCH_THINKING : STANDARD_THINKING;
    setThinkingMsg(ANA_THINKING_MESSAGES[Math.floor(Math.random() * ANA_THINKING_MESSAGES.length)]);
    setStatusPhaseIndex(0);
    const interval = setInterval(() => {
      setThinkingMsg(
        ANA_THINKING_MESSAGES[Math.floor(Math.random() * ANA_THINKING_MESSAGES.length)]
      );
      setStatusPhaseIndex(prev => (prev + 1) % THINKING_STATUS_PHASES.length);
    }, 3000);
    return () => clearInterval(interval);
  }, [isThinking, chatMode]);

  // Deterministic resume: when parent selects a specific thread, hydrate that thread here.
  useEffect(() => {
    const selectedThreadId = contextProfile?.threadId;
    if (!selectedThreadId) return;
    // Avoid redundant reload when already on the same thread.
    if (threadIdRef.current === selectedThreadId) return;

    let cancelled = false;
    const hydrateSelectedThread = async () => {
      try {
        const response = await fetch(
          `/api/chat/threads/${encodeURIComponent(selectedThreadId)}/messages?limit=100`,
          {
            credentials: 'include',
            headers: getAuthHeaders(),
          }
        );
        if (!response.ok) return;
        const payload = await response.json().catch(() => null);
        const rows = Array.isArray(payload?.messages) ? payload.messages : [];
        if (cancelled) return;

        const hydrated: AnaMessage[] = rows.map((row: any, idx: number) => ({
          id: `h-${selectedThreadId}-${idx}`,
          role: row.role === 'assistant' ? 'assistant' : 'user',
          content: typeof row.content === 'string' ? row.content : '',
          timestamp: row.created_at ? new Date(row.created_at) : new Date(),
        }));

        setMessages(hydrated);
        threadIdRef.current = selectedThreadId;
        onThreadChange?.(selectedThreadId);
      } catch {
        // Non-blocking: if hydration fails, existing chat still works.
      }
    };

    void hydrateSelectedThread();
    return () => {
      cancelled = true;
    };
  }, [contextProfile?.threadId, onThreadChange]);

  const handleConversationScroll = useCallback(() => {
    const el = conversationViewportRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    const isNearBottom = distanceFromBottom < 140;
    shouldAutoScrollRef.current = isNearBottom;
    setShowJumpToLatest(!isNearBottom);
  }, []);

  // Auto-scroll when new messages/chunks arrive, but only if user is near the bottom.
  useEffect(() => {
    if (!shouldAutoScrollRef.current) return;
    const lastId = messages[messages.length - 1]?.id ?? null;
    const previous = previousMessageSnapshotRef.current;
    const hasNewMessage = messages.length > previous.count || lastId !== previous.lastId;
    const behavior: ScrollBehavior = hasNewMessage ? 'smooth' : 'auto';

    messagesEndRef.current?.scrollIntoView({
      behavior,
      block: 'end',
    });
    setShowJumpToLatest(false);
    previousMessageSnapshotRef.current = { count: messages.length, lastId };
  }, [messages, isThinking]);

  const scrollToLatest = useCallback(() => {
    shouldAutoScrollRef.current = true;
    setShowJumpToLatest(false);
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    inputRef.current?.focus();
  }, []);

  const focusComposerFromCanvas = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    if (target.closest('button, a, input, textarea, [role="button"], [contenteditable="true"]'))
      return;
    inputRef.current?.focus();
  }, []);

  const summarizeRecentTurns = useCallback(() => {
    const recent = messages.slice(-10);
    if (recent.length === 0) return;
    const transcript = recent
      .map((m, idx) => `${idx + 1}. ${m.role.toUpperCase()}: ${m.content}`)
      .join('\n');
    const prompt = `Summarize the last 10 turns into:\n- Bottom line\n- Decisions made\n- Open risks\n- Next 3 actions\n\nConversation:\n${transcript}`;
    setInput(prompt);
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [messages]);

  // Auto-resize textarea
  useEffect(() => {
    const el = inputRef.current;
    if (el) {
      el.style.height = '24px';
      el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
    }
  }, [input]);

  // Restore draft when project/mode changes.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const savedDraft = localStorage.getItem(draftStorageKey);
    if (savedDraft) {
      setInput(savedDraft);
    }
  }, [draftStorageKey]);

  // Persist draft as user types.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!input.trim()) {
      localStorage.removeItem(draftStorageKey);
      return;
    }
    localStorage.setItem(draftStorageKey, input);
  }, [input, draftStorageKey]);

  // Handle initial message (auto-send once)
  useEffect(() => {
    if (initialMessage && !initialMessageSentRef.current) {
      initialMessageSentRef.current = true;
      // Slight delay to let component mount
      setTimeout(() => handleSend(initialMessage), 100);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialMessage]);

  /**
   * Abort the in-flight streaming request. The AbortController was created
   * inside handleSend for the current turn; this aborts it and lets the
   * stream reader's catch block flip the placeholder to "stopped".
   */
  const handleStop = useCallback(() => {
    abortControllerRef.current?.abort();
  }, []);

  const handleSend = useCallback(
    async (messageText?: string) => {
      const text = (messageText || input).trim();

      // If already working, enqueue instead of dropping
      if ((isStreaming || isLoading) && text) {
        const queueItem: ConversationQueueItem = {
          id: `q_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          prompt: text,
          contextSnapshot: {
            projectId: contextProfile?.projectId ? Number(contextProfile.projectId) || null : null,
            sectionCode: authoringContext?.sectionCode ?? null,
          },
          status: 'queued',
          enqueuedAt: Date.now(),
        };
        setConversationQueue(prev => [...prev, queueItem]);
        setInput('');
        return;
      }

      if (!text || isThinking) return;
      lastSubmittedPromptRef.current = text;

      const userMsg: AnaMessage = {
        id: `u-${Date.now()}`,
        role: 'user',
        content: text,
        timestamp: new Date(),
      };

      // Cap in-memory messages to prevent unbounded growth
      setMessages(prev => [...prev.slice(-199), userMsg]);
      setInput('');
      if (typeof window !== 'undefined') {
        localStorage.removeItem(draftStorageKey);
      }
      queue.startTurn();

      // Deep Research mode — launch a job and stream progress
      if (chatMode === 'deep-research') {
        try {
          // Launch job
          const launchRes = await apiRequest('POST', '/api/deep-research/jobs', {
            query: { indication: text, keywords: text.split(/\s+/).filter(w => w.length > 3) },
            connectorIds: ['clinical_trials_gov', 'pubmed', 'fda_drugs', 'ema_epar'],
            depth: 'standard',
            projectId: contextProfile?.projectId || null,
          });

          if (!launchRes.ok) {
            const err = await launchRes
              .json()
              .catch(() => ({ error: 'Failed to launch research job' }));
            throw new Error(err.error || `HTTP ${launchRes.status}`);
          }

          const job = await launchRes.json();
          const jobId = job.id;

          // Add progress message that we'll update
          const progressMsgId = `dr-${Date.now()}`;
          setMessages(prev => [
            ...prev,
            {
              id: progressMsgId,
              role: 'assistant',
              content: `**Deep Research initiated** — searching ClinicalTrials.gov, PubMed, FDA, EMA...\n\nProgress: 0%`,
              timestamp: new Date(),
            },
          ]);

          // Stream progress via SSE
          const eventSource = new EventSource(`/api/deep-research/jobs/${jobId}/stream`);

          eventSource.onmessage = event => {
            try {
              const data = JSON.parse(event.data);

              if (data.error) {
                eventSource.close();
                setMessages(prev =>
                  prev.map(m =>
                    m.id === progressMsgId
                      ? { ...m, content: `**Deep Research failed:** ${data.error}` }
                      : m
                  )
                );
                queue.blockTurn('deep_research_error');
                queue.reset();
                return;
              }

              const statusLabel =
                data.status === 'synthesizing'
                  ? 'Synthesizing findings with Claude...'
                  : 'Searching data sources...';
              setMessages(prev =>
                prev.map(m =>
                  m.id === progressMsgId
                    ? {
                        ...m,
                        content: `**Deep Research in progress** — ${statusLabel}\n\nProgress: ${data.progress}%`,
                      }
                    : m
                )
              );

              if (data.status === 'complete' || data.status === 'failed') {
                eventSource.close();

                // Fetch final results
                apiRequest('GET', `/api/deep-research/jobs/${jobId}`)
                  .then(r => r.json())
                  .then(finalJob => {
                    const synthesis =
                      finalJob.synthesis || 'Research complete. No synthesis available.';
                    const totalResults = finalJob.results?.totalResults || 0;
                    setMessages(prev =>
                      prev.map(m =>
                        m.id === progressMsgId
                          ? {
                              ...m,
                              content: `**Deep Research complete** — ${totalResults} sources analyzed\n\n---\n\n${synthesis}`,
                            }
                          : m
                      )
                    );
                  })
                  .catch(() => {
                    setMessages(prev =>
                      prev.map(m =>
                        m.id === progressMsgId
                          ? {
                              ...m,
                              content: `**Deep Research complete** — results are available in the research dashboard.`,
                            }
                          : m
                      )
                    );
                  })
                  .finally(() => queue.completeTurn());
                return;
              }
            } catch {
              // Parse error — ignore
            }
          };

          eventSource.onerror = () => {
            eventSource.close();
            // SSE disconnected — poll for final state
            apiRequest('GET', `/api/deep-research/jobs/${jobId}`)
              .then(r => r.json())
              .then(finalJob => {
                if (finalJob.status === 'complete') {
                  const synthesis = finalJob.synthesis || 'Research complete.';
                  const totalResults = finalJob.results?.totalResults || 0;
                  setMessages(prev =>
                    prev.map(m =>
                      m.id === progressMsgId
                        ? {
                            ...m,
                            content: `**Deep Research complete** — ${totalResults} sources analyzed\n\n---\n\n${synthesis}`,
                          }
                        : m
                    )
                  );
                } else {
                  setMessages(prev =>
                    prev.map(m =>
                      m.id === progressMsgId
                        ? {
                            ...m,
                            content: `**Deep Research** — Job #${jobId} is still running. Check the research dashboard for results.`,
                          }
                        : m
                    )
                  );
                }
              })
              .catch(() => {})
              .finally(() => queue.completeTurn());
          };
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : 'Unknown error';
          setMessages(prev => [
            ...prev,
            {
              id: `a-${Date.now()}`,
              role: 'assistant',
              content: `**Deep Research could not be launched:** ${errorMsg}\n\nThis may be due to quota limits or missing permissions. Try again or switch to standard mode.`,
              timestamp: new Date(),
            },
          ]);
          queue.blockTurn('deep_research_launch_failed');
          queue.reset();
        }
        return;
      }

      // Standard chat mode — route to appropriate endpoint
      try {
        let data: any;

        if (chatMode === 'nano-banana') {
          // Route to Nano Banana (Gemini image gen) endpoint
          const response = await apiRequest('POST', '/api/nano-banana/chat', {
            message: text,
            conversationHistory: messages.slice(-10).map(m => ({
              role: m.role,
              content: m.content,
            })),
          });
          data = await response.json();

          // Handle PPTX auto-download
          if (data.pptx) {
            const blob = new Blob([Uint8Array.from(atob(data.pptx.base64), c => c.charCodeAt(0))], {
              type: data.pptx.mimeType,
            });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = data.pptx.filename;
            a.click();
            URL.revokeObjectURL(url);
          }

          setMessages(prev => [
            ...prev,
            {
              id: `a-${Date.now()}`,
              role: 'assistant',
              content: data.response || 'Here are your results.',
              timestamp: new Date(),
              images: data.images,
              pptx: data.pptx,
            },
          ]);
        } else {
          // Standard mode → AnA RI orchestrated chat (falls back to Cortex)
          const anaRiPayload = {
            message: text,
            intent_lens: intentLens !== 'auto' ? intentLens : undefined,
            user_role: contextProfile?.userRole || undefined,
            project_context: contextProfile?.activeProject
              ? {
                  productName: contextProfile.activeProject,
                  submissionType: contextProfile.productType,
                }
              : undefined,
            submission_type: contextProfile?.productType || undefined,
            context: {
              screen: contextProfile?.screenName,
              project: contextProfile?.activeProject,
              projectId: contextProfile?.projectId,
              productType: contextProfile?.productType,
              userRole: contextProfile?.userRole,
              screenName: contextProfile?.screenName,
            },
            conversation_history: messages.slice(-10).map(m => ({
              role: m.role,
              content: m.content,
            })),
          };

          // Try AnA RI first, fallback to Cortex
          // Build authoring context payload for section/artifact-aware chat
          const authoringPayload = authoringContext
            ? serializeContextForChat(authoringContext)
            : {};

          // Use raw fetch for chat calls to avoid apiRequest throwing on errors.
          // apiRequest throws for non-ok/non-401 responses, breaking the fallback chain.

          // Auth headers from canonical authToken module (no direct localStorage access)
          const buildChatHeaders = (): Record<string, string> => {
            return { 'Content-Type': 'application/json', ...getAuthHeaders() };
          };

          let chatHeaders = buildChatHeaders();

          let rawData: any = null;
          let chatSucceeded = false;
          let anaErrorCode: string | null = null;

          // ── Build chat body (reused for retries) ──
          const chatBody = JSON.stringify({
            message: text,
            chatMode,
            useFirecrawl,
            thread_id: threadIdRef.current || undefined,
            project_id: contextProfile?.projectId || undefined,
            submission_type: contextProfile?.productType || undefined,
            preferred_provider: selectedProvider !== 'auto' ? selectedProvider : undefined,
            authoring_context: authoringPayload,
            context: {
              screen: contextProfile?.screenName,
              project: contextProfile?.activeProject,
              projectId: contextProfile?.projectId,
              productType: contextProfile?.productType,
              userRole: contextProfile?.userRole,
              ...(contextProfile?.moduleContext || {}),
              ...(authoringContext
                ? {
                    sectionCode: authoringContext.sectionCode,
                    artifactId: authoringContext.artifactId,
                    artifactVersionId: authoringContext.artifactVersionId,
                    workflowStage: authoringContext.workflowStage,
                    sectionTitle: authoringContext.sectionTitle,
                    moduleCode: authoringContext.moduleCode,
                    artifactStatus: authoringContext.artifactStatus,
                  }
                : {}),
            },
            conversationHistory: messages.slice(-10).map(m => ({
              role: m.role,
              content: m.content,
            })),
          });

          // ── Attempt 1: AnA RI streaming endpoint (SSE) ──
          // Tokens render incrementally so the user sees progress instead of a spinner.
          // Firecrawl evidence pre-routing only runs on /chat, so fall back to the
          // non-streaming endpoint when the user has firecrawl enabled.
          const streamPlaceholderId = `a-${Date.now()}`;
          let streamedSuccessfully = false;
          let streamStarted = false;
          let streamContent = '';
          let streamDoneMeta: any = null;
          let userAborted = false;
          const useStreamingEndpoint = !useFirecrawl;

          // Fresh AbortController for this turn; handleStop calls .abort() on it.
          const abortCtl = new AbortController();
          abortControllerRef.current = abortCtl;

          try {
            const anaRes = await fetch(
              useStreamingEndpoint ? '/api/ana-ri/stream' : '/api/ana-ri/chat',
              {
                method: 'POST',
                headers: chatHeaders,
                credentials: 'include',
                body: chatBody,
                signal: abortCtl.signal,
              }
            );

            if (!anaRes.ok) {
              const errBody = await anaRes.text().catch(() => '');
              try {
                const parsed = JSON.parse(errBody);
                anaErrorCode = parsed?.error?.code || parsed?.code || null;
              } catch {
                // ignore parse failures
              }
              console.warn(`[AnA RI] ${anaRes.status}: ${errBody.slice(0, 200)}`);
            } else if (!useStreamingEndpoint) {
              // Non-streaming path: parse the full JSON envelope and fall through
              // to the existing rawData/data handling below.
              rawData = await anaRes.json();
              chatSucceeded = true;
            } else if (!anaRes.body) {
              console.warn('[AnA RI Stream] No response body');
            } else {
              const reader = anaRes.body.getReader();
              const decoder = new TextDecoder();
              let buffer = '';

              while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                for (const line of lines) {
                  if (!line.startsWith('data: ')) continue;
                  const jsonStr = line.slice(6).trim();
                  if (!jsonStr) continue;

                  let event: any;
                  try {
                    event = JSON.parse(jsonStr);
                  } catch {
                    continue;
                  }

                  if (event.type === 'thread_id') {
                    if (event.thread_id) {
                      threadIdRef.current = event.thread_id;
                      onThreadChange?.(event.thread_id);
                    }
                  } else if (event.type === 'orchestration') {
                    const normalizedOrchestration = normalizeOrchestrationPayload(
                      event.orchestration || event
                    );
                    if (normalizedOrchestration) {
                      setLastOrchestration(normalizedOrchestration);
                    }
                  } else if (event.type === 'text') {
                    const chunk = event.content || '';
                    if (!chunk) continue;
                    streamContent += chunk;
                    if (!streamStarted) {
                      streamStarted = true;
                      queue.markStreaming(threadIdRef.current || null);
                      setMessages(prev => [
                        ...prev,
                        {
                          id: streamPlaceholderId,
                          role: 'assistant',
                          content: streamContent,
                          timestamp: new Date(),
                        },
                      ]);
                    } else {
                      const next = streamContent;
                      setMessages(prev =>
                        prev.map(m =>
                          m.id === streamPlaceholderId ? { ...m, content: next } : m
                        )
                      );
                    }
                  } else if (event.type === 'done') {
                    streamDoneMeta = event;
                  } else if (event.type === 'warning') {
                    // Server tells us something degraded (e.g., thread persistence failed)
                    toast({
                      title: 'Conversation not fully saved',
                      description:
                        typeof event.message === 'string'
                          ? event.message
                          : 'Your history may not persist across reloads.',
                      variant: 'default',
                    });
                  } else if (event.type === 'error') {
                    throw new Error(event.error || 'Stream error');
                  }
                  // grounding_strip events are tolerated but not yet surfaced
                }
              }

              if (streamStarted) {
                const finalContent =
                  (streamDoneMeta?.cleanedResponse &&
                    String(streamDoneMeta.cleanedResponse).trim().length > 0)
                    ? streamDoneMeta.cleanedResponse
                    : streamContent;

                setMessages(prev =>
                  prev.map(m =>
                    m.id === streamPlaceholderId
                      ? {
                          ...m,
                          content: finalContent,
                          executedActions: streamDoneMeta?.executedActions || undefined,
                          modelProvider: streamDoneMeta?.provider || undefined,
                          modelName: streamDoneMeta?.model || undefined,
                        }
                      : m
                  )
                );
                streamedSuccessfully = true;
              }
            }
          } catch (anaErr: any) {
            if (anaErr?.name === 'AbortError' || abortCtl.signal.aborted) {
              userAborted = true;
              if (streamStarted) {
                // Keep whatever tokens we already rendered, mark the message as stopped.
                setMessages(prev =>
                  prev.map(m =>
                    m.id === streamPlaceholderId
                      ? { ...m, content: streamContent || '_(stopped)_', stopped: true }
                      : m
                  )
                );
                streamedSuccessfully = true;
              }
            } else {
              console.warn('[AnA RI Stream] Error:', anaErr?.message);
            }
          } finally {
            abortControllerRef.current = null;
          }

          // If the user aborted, skip Cortex fallback and the "unable to reach AI" throw.
          if (userAborted) {
            return;
          }

          // If streaming produced a response, synthesize rawData so downstream
          // artifact-persist logic still runs.
          if (streamedSuccessfully) {
            const synthesized = {
              response: streamDoneMeta?.cleanedResponse || streamContent,
              thread_id: threadIdRef.current,
              executedActions: streamDoneMeta?.executedActions,
              model: streamDoneMeta?.model,
              provider: streamDoneMeta?.provider,
              evidence: streamDoneMeta?.evidence,
            };
            rawData = { success: true, data: synthesized };
            chatSucceeded = true;
          }

          // ── Attempt 2: Cortex fallback (degraded — no orchestration/memory/RIM) ──
          if (!chatSucceeded) {
            try {
              const cortexRes = await fetch('/api/cortex/chat', {
                method: 'POST',
                headers: chatHeaders,
                credentials: 'include',
                body: JSON.stringify({
                  message: text,
                  chatMode,
                  project_id: contextProfile?.projectId || undefined,
                  submission_type: contextProfile?.productType || undefined,
                  preferred_provider: selectedProvider !== 'auto' ? selectedProvider : undefined,
                  context: {
                    screen: contextProfile?.screenName,
                    project: contextProfile?.activeProject,
                    projectId: contextProfile?.projectId,
                    productType: contextProfile?.productType,
                    userRole: contextProfile?.userRole,
                  },
                  conversationHistory: messages.slice(-10).map(m => ({
                    role: m.role,
                    content: m.content,
                  })),
                }),
              });
              if (cortexRes.ok) {
                rawData = await cortexRes.json();
                chatSucceeded = true;
                // Mark as fallback so UI knows capabilities are degraded
                if (rawData?.data) {
                  rawData.data._fallback = {
                    active: true,
                    reason: 'ana_ri_unavailable',
                    original_path: '/api/ana-ri/stream',
                    degraded_capabilities: [
                      'orchestration',
                      'memory_injection',
                      'rim_interception',
                      'evidence_validation',
                    ],
                  };
                }
              } else {
                const errBody = await cortexRes.text().catch(() => '');
                console.warn(`[Cortex] ${cortexRes.status}: ${errBody.slice(0, 200)}`);
              }
            } catch (cortexErr: any) {
              console.warn('[Cortex] Network error:', cortexErr?.message);
            }
          }

          if (!chatSucceeded || !rawData) {
            if (anaErrorCode === 'quota_exhausted') {
              setFirecrawlDisabledReason('quota_exhausted');
              setUseFirecrawl(false);
              throw new Error('Workspace daily Firecrawl allowance is exhausted.');
            }
            if (anaErrorCode === 'policy_blocked') {
              setFirecrawlDisabledReason('admin_disabled');
              setUseFirecrawl(false);
              throw new Error('Firecrawl is disabled by workspace policy.');
            }
            throw new Error(
              'Unable to reach AI service. Please check your connection and try again.'
            );
          }

          // Unwrap sendSuccess envelope: {success, data: {...}} → inner data
          data = rawData?.data && rawData.success ? rawData.data : rawData;

          // For non-streamed responses, apply orchestration/thread updates that
          // streaming already applied inline.
          if (!streamedSuccessfully) {
            const normalizedOrchestration = normalizeOrchestrationPayload(data);
            if (normalizedOrchestration) {
              setLastOrchestration(normalizedOrchestration);
            }
            if (data.thread_id) {
              threadIdRef.current = data.thread_id;
              onThreadChange?.(data.thread_id);
            }
          }

          const assistantContent =
            data.response || data.answer || 'I received your message but had no response content.';
          if (data?.evidenceUsage?.quotaRemaining !== undefined) {
            const remaining = Number(data.evidenceUsage.quotaRemaining);
            setFirecrawlQuotaRemaining(remaining);
            if (remaining <= 0) {
              setFirecrawlDisabledReason('quota_exhausted');
              setUseFirecrawl(false);
            }
          }

          // Streaming already rendered the assistant message in-place; only append
          // when we came in via the Cortex fallback.
          if (!streamedSuccessfully) {
            const cortexFallback = Boolean(data?._fallback?.active);
            if (cortexFallback) {
              toast({
                title: 'Running in degraded mode',
                description:
                  'AnA RI is unavailable; this reply is from the fallback model without memory or RIM.',
                variant: 'default',
              });
            }
            setMessages(prev => [
              ...prev,
              {
                id: `a-${Date.now()}`,
                role: 'assistant',
                content: assistantContent,
                timestamp: new Date(),
                executedActions: data.executedActions || undefined,
                modelProvider: data.provider || data.modelProvider || undefined,
                modelName: data.model || data.modelName || undefined,
                evidenceUsage: data.evidenceUsage || undefined,
                fallback: cortexFallback || undefined,
              },
            ]);
          }

          // Auto-persist substantial AI responses as artifacts when project context exists
          if (contextProfile?.projectId && assistantContent.length > 500) {
            const numericProjectId = String(contextProfile.projectId).replace(/^proj_/, '');
            // Extract code blocks > 200 chars as artifacts
            const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g;
            let match;
            while ((match = codeBlockRegex.exec(assistantContent)) !== null) {
              const blockContent = match[2].trim();
              if (blockContent.length < 200) continue;
              try {
                await apiRequest(
                  'POST',
                  `/api/concept2cure/projects/${numericProjectId}/artifacts`,
                  {
                    title: `AI Draft — ${new Date().toISOString().split('T')[0]}`,
                    content: blockContent,
                    type: 'document_section',
                    category: 'document',
                  }
                );
              } catch {
                // Non-blocking
              }
            }
          }
        }
      } catch (err: any) {
        console.error('[AnA Chat Error]', err?.message || err, err);
        // Try cortex fallback on any error using raw fetch (apiRequest throws and breaks fallback chains)
        try {
          const fbHeaders = { 'Content-Type': 'application/json', ...getAuthHeaders() };

          const fallbackRes = await fetch('/api/cortex/chat', {
            method: 'POST',
            headers: fbHeaders,
            credentials: 'include',
            body: JSON.stringify({
              message: text,
              chatMode: 'standard',
              preferred_provider: selectedProvider !== 'auto' ? selectedProvider : undefined,
              context: {
                screen: contextProfile?.screenName,
                projectId: contextProfile?.projectId,
                productType: contextProfile?.productType,
                userRole: contextProfile?.userRole,
              },
              conversationHistory: messages.slice(-10).map(m => ({
                role: m.role,
                content: m.content,
              })),
            }),
          });
          if (!fallbackRes.ok) {
            throw new Error(`Cortex returned ${fallbackRes.status}`);
          }
          const fallbackRaw = await fallbackRes.json();
          const fallbackData =
            fallbackRaw?.data && fallbackRaw.success ? fallbackRaw.data : fallbackRaw;
          const fallbackContent =
            fallbackData?.response ||
            fallbackData?.answer ||
            'I received your message but had no response content.';
          if (fallbackData?.thread_id) {
            threadIdRef.current = fallbackData.thread_id;
            onThreadChange?.(fallbackData.thread_id);
          }
          setMessages(prev => [
            ...prev,
            {
              id: `a-${Date.now()}`,
              role: 'assistant',
              content: fallbackContent,
              timestamp: new Date(),
            },
          ]);
        } catch (fallbackErr: any) {
          console.error('[AnA Fallback Error]', fallbackErr?.message || fallbackErr);
          setMessages(prev => [
            ...prev,
            {
              id: `a-${Date.now()}`,
              role: 'assistant',
              content: `Sorry, I encountered an error: ${
                err?.message || 'Unknown error'
              }. Please try again.`,
              timestamp: new Date(),
              isError: true,
            },
          ]);
        }
      } finally {
        queue.completeTurn();
        // Return focus to input after send completes
        inputRef.current?.focus();
      }
    },
    [
      authoringContext,
      conversationQueue,
      input,
      isLoading,
      isStreaming,
      isThinking,
      messages,
      contextProfile,
      chatMode,
      intentLens,
      selectedProvider,
      useFirecrawl,
      draftStorageKey,
    ]
  );

  useEffect(() => {
    if (!activeQueueItemId || isThinking) return;

    setConversationQueue(prev => prev.filter(item => item.id !== activeQueueItemId));
    setActiveQueueItemId(null);
  }, [activeQueueItemId, isThinking]);

  useEffect(() => {
    if (isThinking || activeQueueItemId) return;

    const nextQueueItem = conversationQueue.find(item => item.status === 'queued');
    if (!nextQueueItem) return;

    setActiveQueueItemId(nextQueueItem.id);
    setConversationQueue(prev =>
      prev.map(item =>
        item.id === nextQueueItem.id
          ? {
              ...item,
              status: 'working',
              startedAt: Date.now(),
            }
          : item
      )
    );
    void handleSend(nextQueueItem.prompt);
  }, [activeQueueItemId, conversationQueue, handleSend, isThinking]);

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setInput(val);
    const trimmed = val.trim();
    if (trimmed.startsWith('/') && !trimmed.includes(' ') && trimmed.length >= 1) {
      setSlashMenuOpen(true);
      setSlashMenuIndex(0);
    }
  };

  const handleDecisionsSlash = useCallback(() => {
    (async () => {
      const projectId = contextProfile?.projectId;
      if (!projectId) {
        setMessages(prev => [
          ...prev,
          {
            id: `a-${Date.now()}`,
            role: 'assistant',
            timestamp: new Date(),
            content:
              'I need an active project to load a decision trail. Open a project and try `/decisions` again.',
          },
        ]);
        return;
      }

      const normalizedProjectId = String(projectId).replace(/^proj_/, '');
      const params = new URLSearchParams({ project_id: normalizedProjectId, limit: '20' });
      if (authoringContext?.sectionCode) params.set('section_code', authoringContext.sectionCode);
      if (authoringContext?.moduleCode) params.set('module_code', authoringContext.moduleCode);

      try {
        const res = await apiRequest('GET', `/api/ana-ri/decisions?${params.toString()}`);
        const payload = await res.json();
        const data = payload?.data;
        if (!payload?.success || !data) {
          throw new Error(payload?.error?.message || 'Unable to load decision trail.');
        }

        const decisions: Array<any> = Array.isArray(data.decisions) ? data.decisions : [];
        const status = data.decisionAwareStatus || {};
        const top = decisions.slice(0, 5);
        const lines = [
          '**Decision Audit Trail**',
          '',
          `${status.summary || 'No decision-aware status summary available.'}`,
          '',
          `**Recent decisions:** ${data.count || 0}`,
        ];

        if (top.length > 0) {
          for (const row of top) {
            const decision = row?.decision || {};
            const kind = decision.kind || 'decision';
            const summary = decision.summary || 'No summary provided.';
            const state = String(decision.status || 'unknown').toUpperCase();
            lines.push(`- **[${state}]** ${kind}: ${summary}`);
          }
        } else {
          lines.push('- No formal decisions recorded yet for this scope.');
        }

        setMessages(prev => [
          ...prev,
          {
            id: `a-${Date.now()}`,
            role: 'assistant',
            timestamp: new Date(),
            content: lines.join('\n'),
          },
        ]);
      } catch (err: any) {
        setMessages(prev => [
          ...prev,
          {
            id: `a-${Date.now()}`,
            role: 'assistant',
            timestamp: new Date(),
            content: `Could not load decision trail: ${err?.message || 'Unknown error'}`,
            isError: true,
          },
        ]);
      }
    })();
  }, [authoringContext?.moduleCode, authoringContext?.sectionCode, contextProfile?.projectId]);

  const handleExportSlash = useCallback(() => {
    const transcript = messages
      .map(msg => `## ${msg.role === 'user' ? 'User' : 'AnA'}\n\n${msg.content}`)
      .join('\n\n---\n\n');

    const markdown = `# AnA Conversation Export\n\nGenerated: ${new Date().toISOString()}\n\n${transcript}\n`;
    const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ana-conversation-${new Date().toISOString().slice(0, 10)}.md`;
    a.click();
    URL.revokeObjectURL(url);

    setMessages(prev => [
      ...prev,
      {
        id: `a-${Date.now()}`,
        role: 'assistant',
        timestamp: new Date(),
        content: 'Conversation exported as markdown.',
      },
    ]);
  }, [messages]);

  const selectSlashCommand = (cmd: SlashCommand) => {
    if (cmd.command === '/help') {
      setSlashMenuOpen(false);
      handleSuggestedAction({
        id: 'open-capabilities',
        label: 'Browse all capabilities',
        intent: 'open_capabilities',
      });
      return;
    }

    if (cmd.command === '/clear') {
      threadIdRef.current = null;
      setMessages([]);
      setInput('');
      setSlashMenuOpen(false);
      inputRef.current?.focus();
      return;
    }

    if (cmd.command === '/decisions') {
      setSlashMenuOpen(false);
      setInput('');
      handleDecisionsSlash();
      inputRef.current?.focus();
      return;
    }

    if (cmd.command === '/export') {
      setSlashMenuOpen(false);
      setInput('');
      handleExportSlash();
      inputRef.current?.focus();
      return;
    }

    setInput(cmd.command + ' ');
    setSlashMenuOpen(false);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Slash command navigation
    if (slashMenuOpen && filteredSlashCommands.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSlashMenuIndex(prev => Math.min(prev + 1, filteredSlashCommands.length - 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSlashMenuIndex(prev => Math.max(prev - 1, 0));
        return;
      }
      if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) {
        e.preventDefault();
        selectSlashCommand(filteredSlashCommands[slashMenuIndex]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setSlashMenuOpen(false);
        return;
      }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
      return;
    }

    // Claude-like recall: ArrowUp on empty composer restores the latest user prompt.
    if (e.key === 'ArrowUp' && !input.trim()) {
      const inputEl = inputRef.current;
      const caretAtStart =
        !!inputEl && (inputEl.selectionStart ?? 0) === 0 && (inputEl.selectionEnd ?? 0) === 0;
      if (!inputEl || caretAtStart) {
        if (lastSubmittedPromptRef.current) {
          e.preventDefault();
          handleRecallPrompt('last-submitted', lastSubmittedPromptRef.current);
          return;
        }
        const lastUserMessage = [...messages].reverse().find(message => message.role === 'user');
        if (lastUserMessage) {
          e.preventDefault();
          handleRecallPrompt(lastUserMessage.id, lastUserMessage.content);
        }
      }
    }
  };

  const handleCopy = (id: string, content: string) => {
    navigator.clipboard.writeText(content);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleRecallPrompt = (messageId: string, content: string) => {
    setInput(content);
    setMessages(prev =>
      prev.map(m => ({
        ...m,
        recalledToInput: m.id === messageId,
      }))
    );
    setTimeout(() => {
      inputRef.current?.focus();
      const inputEl = inputRef.current;
      if (inputEl) {
        const end = inputEl.value.length;
        inputEl.setSelectionRange(end, end);
      }
    }, 0);
  };

  const handleSuggestedAction = (action: SuggestedAction) => {
    if (action.intent && onActionRun) {
      onActionRun({
        id: action.id,
        intent: action.intent,
        label: action.label,
        status: 'running',
        ts: Date.now(),
      });
    }

    // Guided sequence handoff: AnA can drive the same Project → IND/eCTD → Authoring → Verify → Submission flow.
    if (
      action.intent === 'guided_project' ||
      action.intent === 'guided_ind_ectd' ||
      action.intent === 'guided_authoring' ||
      action.intent === 'guided_verify' ||
      action.intent === 'guided_submission'
    ) {
      onNavigate?.(action.intent);
      return;
    }

    // Shared capability entrypoint: keep users in existing flow.
    if (action.intent === 'open_capabilities') {
      onNavigate?.('apps');
      return;
    }

    // ── Wave 1 Authoring Actions — real operational behavior ──────────

    // P2: Resume last section — real navigation
    if (action.intent === 'resume_last_section') {
      (async () => {
        try {
          const projectId = contextProfile?.projectId;
          if (!projectId) {
            handleSend(
              'I need a project context to find your last section. Please open a project first.'
            );
            return;
          }
          const res = await apiRequest(
            'GET',
            `/api/authoring-actions/resume-last-section/${projectId}`
          );
          const data = await res.json();
          if (data.found && data.ctdSection && onNavigateToSection) {
            // Real navigation to the section
            onNavigateToSection(data.ctdSection);
            setMessages(prev => [
              ...prev,
              {
                id: `a-${Date.now()}`,
                role: 'assistant',
                content: `Opening **${data.title || 'your last section'}** (§${
                  data.ctdSection
                }). Status: ${data.status || 'draft'}.`,
                timestamp: new Date(),
              },
            ]);
          } else if (data.found && data.artifactId && onOpenArtifact) {
            // Open artifact directly if no CTD section
            onOpenArtifact(data.artifactId);
            setMessages(prev => [
              ...prev,
              {
                id: `a-${Date.now()}`,
                role: 'assistant',
                content: `Opening **${data.title || 'your last document'}**. Status: ${
                  data.status || 'draft'
                }.`,
                timestamp: new Date(),
              },
            ]);
          } else {
            handleSend('Open my most recently edited section. Show me where I left off.');
          }
        } catch {
          handleSend('Resume my last section — show me where I left off.');
        }
      })();
      return;
    }

    // P1: Draft section from context — send chat, then intercept response for editor insertion
    if (action.intent === 'draft_section_from_context') {
      const draftMessage = authoringContext?.sectionCode
        ? `Draft CTD section ${authoringContext.sectionCode}${
            authoringContext.sectionTitle ? `: ${authoringContext.sectionTitle}` : ''
          }. Generate a compliant first draft following ICH M4 guidelines and regulatory requirements for ${
            authoringContext.submissionType || 'this submission'
          }. Return the draft content in a code block so it can be inserted into the editor.`
        : 'Draft the current section from context.';
      handleSend(draftMessage);
      return;
    }

    // P3: Explain promotion blockers — fetch real blocker data first, then chat
    if (action.intent === 'explain_promotion_blockers') {
      (async () => {
        const projectId = contextProfile?.projectId;
        if (!projectId) {
          handleSend('What is blocking this document from promotion to review?');
          return;
        }
        try {
          const params = new URLSearchParams();
          if (authoringContext?.artifactId) params.set('artifactId', authoringContext.artifactId);
          if (authoringContext?.sectionCode)
            params.set('sectionCode', authoringContext.sectionCode);
          const res = await apiRequest(
            'GET',
            `/api/authoring-actions/promotion-blockers/${projectId}?${params}`
          );
          const data = await res.json();
          if (data.blockerCount === 0) {
            setMessages(prev => [
              ...prev,
              {
                id: `a-${Date.now()}`,
                role: 'assistant',
                content: `**No blockers detected.** ${
                  authoringContext?.sectionCode
                    ? `Section §${authoringContext.sectionCode}`
                    : 'This document'
                } appears ready for promotion to review.\n\nYou can proceed with "Promote to review" when ready.`,
                timestamp: new Date(),
              },
            ]);
          } else {
            const blockerLines = data.blockers
              .map(
                (b: any, i: number) =>
                  `${i + 1}. **[${b.severity.toUpperCase()}]** ${b.message} _(via ${b.source})_`
              )
              .join('\n');
            setMessages(prev => [
              ...prev,
              {
                id: `a-${Date.now()}`,
                role: 'assistant',
                content: `**Promotion ${data.blocked ? 'BLOCKED' : 'has warnings'}** — ${
                  data.blockerCount
                } issue(s) found:\n\n${blockerLines}\n\n${
                  data.blocked
                    ? 'Resolve critical blockers before promotion.'
                    : 'These are advisory — promotion is not hard-blocked.'
                }`,
                timestamp: new Date(),
              },
            ]);
          }
        } catch {
          handleSend(
            authoringContext?.sectionCode
              ? `What is blocking section ${authoringContext.sectionCode} from promotion to review?`
              : 'What is blocking this document from promotion to review?'
          );
        }
      })();
      return;
    }

    // P4: Compare against approved version — fetch real version data
    if (action.intent === 'compare_against_approved') {
      (async () => {
        const projectId = contextProfile?.projectId;
        const artifactId = authoringContext?.artifactId;
        if (!projectId || !artifactId) {
          handleSend('Compare the current document against the last approved version.');
          return;
        }
        try {
          const res = await apiRequest(
            'GET',
            `/api/authoring-actions/compare-versions/${projectId}/${artifactId}`
          );
          const data = await res.json();
          if (!data.available) {
            setMessages(prev => [
              ...prev,
              {
                id: `a-${Date.now()}`,
                role: 'assistant',
                content: `**No comparison available.** ${data.message}`,
                timestamp: new Date(),
              },
            ]);
          } else {
            const cur = data.currentVersion;
            const appr = data.approvedVersion;
            const wordDelta = data.diffSummary.currentWords - data.diffSummary.approvedWords;
            const changeMagnitude =
              Math.abs(wordDelta) / Math.max(data.diffSummary.approvedWords, 1);
            const conflictRisk =
              changeMagnitude > 0.3 ? 'high' : changeMagnitude > 0.1 ? 'moderate' : 'low';
            const pivotHint =
              conflictRisk !== 'low'
                ? `\n\n**Conflict risk:** ${conflictRisk} — significant changes from approved baseline.${
                    authoringContext?.linkedSectionCodes?.length
                      ? ' Use **Check cross-section consistency** or **Prepare correction draft** to address.'
                      : ' Consider preparing a correction draft to align.'
                  }`
                : '\n\n**Conflict risk:** low — changes are minor relative to approved baseline.';
            setMessages(prev => [
              ...prev,
              {
                id: `a-${Date.now()}`,
                role: 'assistant',
                content: `**Version Comparison**\n\n| | Current (v${cur.version}) | Approved (v${
                  appr.version
                }) |\n|---|---|---|\n| Status | ${cur.status} | ${appr.status} |\n| Words | ${
                  data.diffSummary.currentWords
                } | ${data.diffSummary.approvedWords} |\n| Updated | ${new Date(
                  cur.updatedAt
                ).toLocaleDateString()} | ${new Date(
                  appr.updatedAt
                ).toLocaleDateString()} |\n\n**Net change:** ${
                  wordDelta > 0 ? '+' : ''
                }${wordDelta} words.${pivotHint}${
                  onOpenCompareInspector
                    ? ''
                    : '\n\nTo view a detailed inline diff, open the document inspector and select the Compare tab.'
                }`,
                timestamp: new Date(),
              },
            ]);
            // Auto-open the version compare inspector if available
            if (onOpenCompareInspector) {
              onOpenCompareInspector();
            }
            onRefreshIntelligence?.();
          }
        } catch {
          handleSend('Compare the current document against the last approved version.');
        }
      })();
      return;
    }

    // ── SECTION PREFLIGHT (Pass 5) ─────────────────────────────────────────
    if (action.intent === 'section_preflight') {
      (async () => {
        const projectId = contextProfile?.projectId;
        const sectionCode = authoringContext?.sectionCode;
        if (!projectId || !sectionCode) {
          setMessages(prev => [
            ...prev,
            {
              id: `a-${Date.now()}`,
              role: 'assistant',
              timestamp: new Date(),
              content: '**Cannot run preflight.** No section is active. Open a section first.',
            },
          ]);
          return;
        }
        try {
          const res = await apiRequest('POST', '/api/authoring-actions/section-preflight', {
            projectId,
            sectionCode,
            artifactId: authoringContext?.artifactId,
            artifactVersionId: authoringContext?.artifactVersionId,
            regulatorBody: authoringContext?.regulatorBody,
            submissionType: authoringContext?.submissionType,
            linkedSectionCodes: authoringContext?.linkedSectionCodes,
          });
          const data = await res.json();
          if (data.status === 'data') {
            const statusIcon = (s: string) =>
              s === 'pass' ? '✅' : s === 'warn' ? '⚠️' : s === 'fail' ? '❌' : '—';
            const checkLines = [
              `| Body expectations | ${statusIcon(data.checks.bodyExpectations?.status)} ${
                data.checks.bodyExpectations?.status || 'unknown'
              } | ${
                data.checks.bodyExpectations?.missing?.length
                  ? `${data.checks.bodyExpectations.missing.length} missing`
                  : '—'
              } |`,
              `| Contradictions | ${statusIcon(data.checks.contradictions?.status)} ${
                data.checks.contradictions?.status || 'unknown'
              } | ${
                data.checks.contradictions?.items?.length
                  ? `${data.checks.contradictions.items.length} found`
                  : '—'
              } |`,
              `| Cross-section consistency | ${statusIcon(
                data.checks.crossSectionConsistency?.status
              )} ${data.checks.crossSectionConsistency?.status || 'unknown'} | ${
                data.checks.crossSectionConsistency?.items?.length
                  ? `${data.checks.crossSectionConsistency.items.length} issues`
                  : '—'
              } |`,
              `| Approved baseline | ${statusIcon(data.checks.approvedBaselineCompare?.status)} ${
                data.checks.approvedBaselineCompare?.status || 'unknown'
              } | ${data.checks.approvedBaselineCompare?.conflictRisk || '—'} |`,
              `| Readiness | ${statusIcon(data.checks.readiness?.status)} ${
                data.checks.readiness?.status || 'unknown'
              } | ${
                data.checks.readiness?.blockers?.length
                  ? `${data.checks.readiness.blockers.length} blockers`
                  : data.checks.readiness?.score != null
                  ? `Score: ${data.checks.readiness.score}`
                  : '—'
              } |`,
            ].join('\n');

            const overallIcon =
              data.overall === 'ready' ? '✅' : data.overall === 'blocked' ? '🚫' : '⚠️';
            const actionLines = data.recommendedActions?.length
              ? '\n\n**Recommended actions:**\n' +
                data.recommendedActions.map((a: any) => `- **${a.label}** — ${a.reason}`).join('\n')
              : '';

            // Decision architecture context
            const decisionLine = data.decisionId
              ? `\n\n**Decision:** \`${data.decisionId.slice(0, 16)}…\` — Status: **${
                  data.decisionStatus || 'recorded'
                }** — Authority: **${data.authority?.level || 'unknown'}**`
              : '';
            const authorityNote = data.authority?.requiresHumanConfirmation
              ? '\n> This result needs your confirmation before any action is taken.'
              : '';

            setMessages(prev => [
              ...prev,
              {
                id: `a-${Date.now()}`,
                role: 'assistant',
                timestamp: new Date(),
                content: `**Section Preflight — §${sectionCode}** ${overallIcon}\n\n**Overall:** ${data.overall.toUpperCase()} — ${
                  data.summary
                }\n\n| Check | Status | Detail |\n|---|---|---|\n${checkLines}${actionLines}${decisionLine}${authorityNote}`,
              },
            ]);
            onRefreshIntelligence?.();
          } else {
            setMessages(prev => [
              ...prev,
              {
                id: `a-${Date.now()}`,
                role: 'assistant',
                timestamp: new Date(),
                content: `**Preflight:** ${
                  data.message || data.error || 'Unable to run preflight.'
                }`,
              },
            ]);
          }
        } catch {
          handleSend('Run preflight on this section.');
        }
      })();
      return;
    }

    // ── MODULE PREFLIGHT (Pass 6) ──────────────────────────────────────────
    if (action.intent === 'module_preflight') {
      (async () => {
        const projectId = contextProfile?.projectId;
        const moduleCode =
          authoringContext?.moduleCode ||
          (authoringContext?.sectionCode ? `m${authoringContext.sectionCode.split('.')[0]}` : '');
        if (!projectId || !moduleCode) {
          setMessages(prev => [
            ...prev,
            {
              id: `a-${Date.now()}`,
              role: 'assistant',
              timestamp: new Date(),
              content:
                '**Cannot run module preflight.** No module context. Open a section or navigate to a module.',
            },
          ]);
          return;
        }
        try {
          const res = await apiRequest('POST', '/api/authoring-actions/module-preflight', {
            projectId,
            moduleCode,
            regulatorBody: authoringContext?.regulatorBody,
            submissionType: authoringContext?.submissionType,
          });
          const data = await res.json();
          if (data.status === 'data') {
            const overallIcon =
              data.overall === 'ready' ? '✅' : data.overall === 'blocked' ? '🚫' : '⚠️';
            const sectionTable = data.sectionResults?.length
              ? '\n\n| Section | Status |\n|---|---|\n' +
                data.sectionResults
                  .map(
                    (s: any) =>
                      `| §${s.sectionCode} | ${
                        s.overall === 'ready' ? '✅' : s.overall === 'blocked' ? '❌' : '⚠️'
                      } ${s.overall} |`
                  )
                  .join('\n')
              : '';
            const blockerLines = data.majorBlockers?.length
              ? '\n\n**Blockers:**\n' +
                data.majorBlockers
                  .slice(0, 5)
                  .map((b: any) => `- **[${b.severity}]** §${b.sectionCode || '—'}: ${b.message}`)
                  .join('\n')
              : '';
            const actionLines = data.recommendedActions?.length
              ? '\n\n**Next:**\n' +
                data.recommendedActions.map((a: any) => `- ${a.label} — ${a.reason}`).join('\n')
              : '';
            // Decision-aware status enrichment
            const dasLine = data.decisionAwareStatus
              ? `\n\n**Decision status:** ${
                  data.decisionAwareStatus.summary || 'No pending decisions'
                }`
              : '';
            const decisionLine = data.decisionId
              ? `\n**Decision:** \`${data.decisionId.slice(0, 16)}…\` — **${
                  data.decisionStatus || 'recorded'
                }**`
              : '';

            setMessages(prev => [
              ...prev,
              {
                id: `a-${Date.now()}`,
                role: 'assistant',
                timestamp: new Date(),
                content: `**Module Preflight — ${moduleCode.toUpperCase()}** ${overallIcon}\n\n**Overall:** ${data.overall.toUpperCase()} — ${
                  data.summary
                }\n\n**Sections:** ${data.counts.ready}/${data.counts.total} ready, ${
                  data.counts.blocked
                } blocked, ${
                  data.counts.provisional
                } provisional${sectionTable}${blockerLines}${actionLines}${dasLine}${decisionLine}`,
              },
            ]);
            onRefreshIntelligence?.();
          } else {
            setMessages(prev => [
              ...prev,
              {
                id: `a-${Date.now()}`,
                role: 'assistant',
                timestamp: new Date(),
                content: `**Module preflight:** ${data.message || data.error || 'Unable to run.'}`,
              },
            ]);
          }
        } catch {
          handleSend(`Run preflight on module ${moduleCode}.`);
        }
      })();
      return;
    }

    // ── DOSSIER PREFLIGHT (Pass 6) ──────────────────────────────────────────
    if (action.intent === 'dossier_preflight') {
      (async () => {
        const projectId = contextProfile?.projectId;
        if (!projectId) {
          setMessages(prev => [
            ...prev,
            {
              id: `a-${Date.now()}`,
              role: 'assistant',
              timestamp: new Date(),
              content: '**Cannot run dossier preflight.** No project is active.',
            },
          ]);
          return;
        }
        try {
          const res = await apiRequest('POST', '/api/authoring-actions/dossier-preflight', {
            projectId,
            regulatorBody: authoringContext?.regulatorBody,
            submissionType: authoringContext?.submissionType,
          });
          const data = await res.json();
          if (data.status === 'data') {
            const overallIcon =
              data.overall === 'ready' ? '✅' : data.overall === 'blocked' ? '🚫' : '⚠️';
            const moduleTable = data.moduleResults?.length
              ? '\n\n| Module | Status | Sections |\n|---|---|---|\n' +
                data.moduleResults
                  .map(
                    (m: any) =>
                      `| ${m.moduleCode.toUpperCase()} | ${
                        m.overall === 'ready' ? '✅' : m.overall === 'blocked' ? '❌' : '⚠️'
                      } ${m.overall} | ${m.counts?.ready || 0}/${m.counts?.total || 0} ready |`
                  )
                  .join('\n')
              : '';
            const blockerLines = data.majorBlockers?.length
              ? '\n\n**Top blockers:**\n' +
                data.majorBlockers
                  .slice(0, 5)
                  .map(
                    (b: any) =>
                      `- **[${b.severity}]** ${b.moduleCode || ''} ${
                        b.sectionCode ? `§${b.sectionCode}` : ''
                      }: ${b.message}`
                  )
                  .join('\n')
              : '';
            const actionLines = data.recommendedActions?.length
              ? '\n\n**Next:**\n' +
                data.recommendedActions.map((a: any) => `- ${a.label} — ${a.reason}`).join('\n')
              : '';
            // Decision-aware enrichment
            const dasLine = data.decisionAwareStatus
              ? `\n\n**Decision status:** ${
                  data.decisionAwareStatus.summary || 'No pending decisions'
                }`
              : '';
            const decisionLine = data.decisionId
              ? `\n**Decision:** \`${data.decisionId.slice(0, 16)}…\` — **${
                  data.decisionStatus || 'recorded'
                }**`
              : '';

            setMessages(prev => [
              ...prev,
              {
                id: `a-${Date.now()}`,
                role: 'assistant',
                timestamp: new Date(),
                content: `**Dossier Preflight** ${overallIcon}\n\n**Overall:** ${data.overall.toUpperCase()} — ${
                  data.summary
                }\n\n**Modules:** ${data.counts.readyModules}/${data.counts.totalModules} ready, ${
                  data.counts.blockedModules
                } blocked${moduleTable}${blockerLines}${actionLines}${dasLine}${decisionLine}`,
              },
            ]);
            onRefreshIntelligence?.();
          } else {
            setMessages(prev => [
              ...prev,
              {
                id: `a-${Date.now()}`,
                role: 'assistant',
                timestamp: new Date(),
                content: `**Dossier preflight:** ${data.message || data.error || 'Unable to run.'}`,
              },
            ]);
          }
        } catch {
          handleSend('Run dossier preflight for this submission.');
        }
      })();
      return;
    }

    // P5: Promote to review — preflight-gated governed transition
    if (action.intent === 'promote_to_review') {
      (async () => {
        const projectId = contextProfile?.projectId;
        const artifactId = authoringContext?.artifactId;
        const sectionCode = authoringContext?.sectionCode;
        if (!projectId || !artifactId) {
          setMessages(prev => [
            ...prev,
            {
              id: `a-${Date.now()}`,
              role: 'assistant',
              timestamp: new Date(),
              content: '**Cannot promote.** No artifact is currently open. Open a document first.',
            },
          ]);
          return;
        }

        // Step 1: Run preflight
        let preflightPassed = false;
        try {
          const pfRes = await apiRequest('POST', '/api/authoring-actions/section-preflight', {
            projectId,
            sectionCode: sectionCode || '',
            artifactId,
            artifactVersionId: authoringContext?.artifactVersionId,
            regulatorBody: authoringContext?.regulatorBody,
            submissionType: authoringContext?.submissionType,
            linkedSectionCodes: authoringContext?.linkedSectionCodes,
          });
          const pfData = await pfRes.json();
          if (pfData.status === 'data') {
            if (pfData.overall === 'blocked') {
              const failChecks = Object.entries(pfData.checks)
                .filter(([, v]: any) => v.status === 'fail')
                .map(([k, v]: any) => {
                  if (k === 'contradictions' && v.items?.length)
                    return `**Contradictions:** ${v.items.length} found`;
                  if (k === 'bodyExpectations' && v.missing?.length)
                    return `**Body gaps:** ${v.missing.length} missing`;
                  if (k === 'crossSectionConsistency' && v.items?.length)
                    return `**Consistency:** ${v.items.length} issues`;
                  if (k === 'readiness' && v.blockers?.length)
                    return `**Readiness:** ${v.blockers.length} blockers`;
                  return `**${k}:** failed`;
                });
              const actionLines = pfData.recommendedActions?.length
                ? '\n\n**Fix first:**\n' +
                  pfData.recommendedActions.map((a: any) => `- ${a.label} — ${a.reason}`).join('\n')
                : '';
              setMessages(prev => [
                ...prev,
                {
                  id: `a-${Date.now()}`,
                  role: 'assistant',
                  timestamp: new Date(),
                  content: `🚫 **Promotion blocked by preflight.**\n\n${
                    pfData.summary
                  }\n\nFailed checks:\n${failChecks.map(c => `- ${c}`).join('\n')}${actionLines}`,
                },
              ]);
              onRefreshIntelligence?.();
              return;
            } else if (pfData.overall === 'provisional') {
              // Warn but allow promotion with acknowledgment
              setMessages(prev => [
                ...prev,
                {
                  id: `a-${Date.now()}`,
                  role: 'assistant',
                  timestamp: new Date(),
                  content: `⚠️ **Preflight has warnings.** ${pfData.summary}\n\nProceeding with promotion despite warnings.`,
                },
              ]);
            }
            preflightPassed = true;
          }
        } catch {
          // Preflight unavailable — proceed with legacy blocker check
          preflightPassed = true;
        }

        if (!preflightPassed) return;

        // Step 2: Attempt governed promotion
        const doPromote = async () => {
          if (onRequestPromotion) {
            const result = await onRequestPromotion(artifactId);
            const pendingNote = result.pendingApprovals?.length
              ? `\n\n**Pending approvals:** ${result.pendingApprovals
                  .map((a: any) => `${a.requiredRole} (${a.reason})`)
                  .join(', ')}`
              : '';
            const decisionNote = result.decisionId
              ? `\n**Decision:** \`${result.decisionId.slice(0, 16)}…\` — Authority: **${
                  result.authority?.level || 'confirmed'
                }**`
              : '';
            setMessages(prev => [
              ...prev,
              {
                id: `a-${Date.now()}`,
                role: 'assistant',
                timestamp: new Date(),
                content: result.promoted
                  ? `✅ **Promoted to review.** ${result.message} The document is now in the governance review pipeline.${pendingNote}${decisionNote}`
                  : `**Promotion not completed.** ${result.message}${
                      result.decisionId
                        ? `\n**Decision:** \`${result.decisionId.slice(0, 16)}…\` — blocked`
                        : ''
                    }`,
              },
            ]);
          } else {
            const res = await apiRequest(
              'PUT',
              `/api/concept2cure/projects/${projectId}/artifacts/${artifactId}/status`,
              { status: 'review' }
            );
            if (res.ok) {
              setMessages(prev => [
                ...prev,
                {
                  id: `a-${Date.now()}`,
                  role: 'assistant',
                  timestamp: new Date(),
                  content:
                    '✅ **Promoted to review.** The document has been moved to the governance review pipeline.',
                },
              ]);
            } else {
              const err = await res.json().catch(() => ({ error: 'Unknown error' }));
              setMessages(prev => [
                ...prev,
                {
                  id: `a-${Date.now()}`,
                  role: 'assistant',
                  timestamp: new Date(),
                  content: `**Promotion failed.** ${
                    err.error || err.message || `HTTP ${res.status}`
                  }`,
                },
              ]);
            }
          }
          onRefreshIntelligence?.();
        };

        try {
          await doPromote();
        } catch (err) {
          setMessages(prev => [
            ...prev,
            {
              id: `a-${Date.now()}`,
              role: 'assistant',
              timestamp: new Date(),
              content: `**Promotion failed.** ${
                err instanceof Error ? err.message : 'Unknown error'
              }`,
            },
          ]);
        }
      })();
      return;
    }

    // ── Promotion Lifecycle: Approve / Lock / Submission-Ready ─────────

    // APPROVE ARTIFACT (review → approved)
    if (action.intent === 'approve_artifact') {
      (async () => {
        const projectId = contextProfile?.projectId;
        const artifactId = authoringContext?.artifactId;
        if (!projectId || !artifactId) {
          setMessages(prev => [
            ...prev,
            {
              id: `a-${Date.now()}`,
              role: 'assistant',
              timestamp: new Date(),
              content: '**Cannot approve.** No artifact is currently open.',
            },
          ]);
          return;
        }
        try {
          const res = await fetch('/api/authoring-actions/approve-artifact', {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ projectId, artifactId }),
          });
          const data = await res.json();
          if (data.approved) {
            const decisionNote = data.decisionId
              ? `\n**Decision:** \`${data.decisionId.slice(0, 16)}…\``
              : '';
            setMessages(prev => [
              ...prev,
              {
                id: `a-${Date.now()}`,
                role: 'assistant',
                timestamp: new Date(),
                content: `**Artifact approved.** ${data.message}${decisionNote}`,
              },
            ]);
          } else {
            const blockerLines = data.blockers?.length
              ? '\n\n' + data.blockers.map((b: string) => `- ${b}`).join('\n')
              : '';
            setMessages(prev => [
              ...prev,
              {
                id: `a-${Date.now()}`,
                role: 'assistant',
                timestamp: new Date(),
                content: `**Approval ${
                  data.reason === 'unauthorized' ? 'unauthorized' : 'blocked'
                }.** ${data.message}${blockerLines}`,
              },
            ]);
          }
          onRefreshIntelligence?.();
        } catch {
          handleSend('Approve this artifact for the next governance stage.');
        }
      })();
      return;
    }

    // LOCK ARTIFACT (approved → locked)
    if (action.intent === 'lock_artifact') {
      (async () => {
        const projectId = contextProfile?.projectId;
        const artifactId = authoringContext?.artifactId;
        if (!projectId || !artifactId) {
          setMessages(prev => [
            ...prev,
            {
              id: `a-${Date.now()}`,
              role: 'assistant',
              timestamp: new Date(),
              content: '**Cannot lock.** No artifact is currently open.',
            },
          ]);
          return;
        }
        try {
          const res = await fetch('/api/authoring-actions/lock-artifact', {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ projectId, artifactId }),
          });
          const data = await res.json();
          if (data.locked) {
            setMessages(prev => [
              ...prev,
              {
                id: `a-${Date.now()}`,
                role: 'assistant',
                timestamp: new Date(),
                content: `**Artifact locked.** ${data.message} No further edits are allowed. Content is frozen for submission.`,
              },
            ]);
          } else {
            const blockerLines = data.blockers?.length
              ? '\n\n' + data.blockers.map((b: string) => `- ${b}`).join('\n')
              : '';
            setMessages(prev => [
              ...prev,
              {
                id: `a-${Date.now()}`,
                role: 'assistant',
                timestamp: new Date(),
                content: `**Lock ${
                  data.reason === 'unauthorized' ? 'unauthorized' : 'blocked'
                }.** ${data.message}${blockerLines}`,
              },
            ]);
          }
          onRefreshIntelligence?.();
        } catch {
          handleSend('Lock this artifact for submission.');
        }
      })();
      return;
    }

    // MARK SUBMISSION-READY (locked → submission_ready)
    if (action.intent === 'mark_submission_ready') {
      (async () => {
        const projectId = contextProfile?.projectId;
        const artifactId = authoringContext?.artifactId;
        if (!projectId || !artifactId) {
          setMessages(prev => [
            ...prev,
            {
              id: `a-${Date.now()}`,
              role: 'assistant',
              timestamp: new Date(),
              content: '**Cannot mark submission-ready.** No artifact is currently open.',
            },
          ]);
          return;
        }
        try {
          const res = await fetch('/api/authoring-actions/mark-submission-ready', {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ projectId, artifactId }),
          });
          const data = await res.json();
          if (data.submissionReady) {
            const decisionNote = data.decisionId
              ? `\n**Decision:** \`${data.decisionId.slice(0, 16)}…\``
              : '';
            setMessages(prev => [
              ...prev,
              {
                id: `a-${Date.now()}`,
                role: 'assistant',
                timestamp: new Date(),
                content: `**Submission-ready.** ${data.message} Governance boundary: **${data.governanceBoundary}**${decisionNote}`,
              },
            ]);
          } else {
            const blockerLines = data.blockers?.length
              ? '\n\n' + data.blockers.map((b: string) => `- ${b}`).join('\n')
              : '';
            setMessages(prev => [
              ...prev,
              {
                id: `a-${Date.now()}`,
                role: 'assistant',
                timestamp: new Date(),
                content: `**Submission-ready ${
                  data.reason === 'unauthorized'
                    ? 'unauthorized — requires RA or submission lead'
                    : 'blocked'
                }.** ${data.message}${blockerLines}`,
              },
            ]);
          }
          onRefreshIntelligence?.();
        } catch {
          handleSend('Mark this artifact as submission-ready.');
        }
      })();
      return;
    }

    // ── Wave 2 Authoring Actions — real operational behavior ──────────

    // ACTION 6: Correction draft
    if (action.intent === 'correction_draft') {
      (async () => {
        const projectId = contextProfile?.projectId;
        if (!projectId) {
          handleSend('Prepare a governed correction for the current section.');
          return;
        }
        try {
          const res = await apiRequest('POST', '/api/authoring-actions/correction-draft', {
            projectId,
            artifactId: authoringContext?.artifactId,
            sectionCode: authoringContext?.sectionCode,
            triggerDescription:
              'Correction requested via AnA — addressing readiness/contradiction issues',
          });
          const data = await res.json();
          if (data.status === 'data' && data.targets?.length) {
            const targetLines = data.targets
              .map(
                (t: any, i: number) =>
                  `${i + 1}. **${t.objectTitle}** (§${t.sectionCode || '—'})\n   Rationale: ${
                    t.revisionRationale
                  }\n   Confidence: ${t.confidence} | Review required: ${
                    t.requiresReview ? 'Yes' : 'No'
                  }`
              )
              .join('\n\n');
            setMessages(prev => [
              ...prev,
              {
                id: `a-${Date.now()}`,
                role: 'assistant',
                timestamp: new Date(),
                content: `**Correction targets identified** — ${data.targets.length} item(s):\n\n${targetLines}\n\n${data.message}\n\n⚠️ Corrections require review before apply. Readiness will be re-evaluated after changes.`,
              },
            ]);
            onRefreshIntelligence?.();
          } else {
            setMessages(prev => [
              ...prev,
              {
                id: `a-${Date.now()}`,
                role: 'assistant',
                timestamp: new Date(),
                content: `**Correction draft:** ${data.message}`,
              },
            ]);
          }
        } catch {
          handleSend('Prepare a governed correction draft for the current section.');
        }
      })();
      return;
    }

    // ACTION 7: Harmonize sections
    if (action.intent === 'harmonize_sections') {
      (async () => {
        const projectId = contextProfile?.projectId;
        const currentCode = authoringContext?.sectionCode;
        if (!projectId || !currentCode) {
          handleSend('Harmonize this section with related CTD sections.');
          return;
        }
        // Derive linked sections from same module
        const major = currentCode.split('.')[0];
        const linked = authoringContext?.linkedSectionCodes || [];
        const sectionCodes =
          linked.length > 0
            ? [currentCode, ...linked]
            : [currentCode, `${major}.2`, `${major}.3`, `${major}.5`].filter(
                (v, i, a) => a.indexOf(v) === i
              );
        try {
          const res = await apiRequest('POST', '/api/authoring-actions/harmonize-sections', {
            projectId,
            sectionCodes,
            submissionType: authoringContext?.submissionType,
          });
          const data = await res.json();
          if (data.status === 'data') {
            const issueLines =
              data.issues
                ?.slice(0, 5)
                .map(
                  (i: any) =>
                    `- **[${i.severity}]** ${i.description} (§${i.sectionA} ↔ §${i.sectionB})${
                      i.recommendation ? `\n  Fix: ${i.recommendation}` : ''
                    }`
                )
                .join('\n') || 'None';
            setMessages(prev => [
              ...prev,
              {
                id: `a-${Date.now()}`,
                role: 'assistant',
                timestamp: new Date(),
                content: `**Harmonization Check** — Score: ${
                  data.consistencyScore
                }/100\n\nSections compared: ${data.sectionsCompared?.join(
                  ', '
                )}\nDimensions checked: ${data.checkedDimensions?.join(', ')}\n\n**Issues (${
                  data.totalIssues
                }):**\n${issueLines}${
                  data.totalIssues > 0
                    ? '\n\n💡 Use **Prepare correction draft** to address critical issues.'
                    : ''
                }`,
              },
            ]);
            onRefreshIntelligence?.();
          } else {
            setMessages(prev => [
              ...prev,
              {
                id: `a-${Date.now()}`,
                role: 'assistant',
                timestamp: new Date(),
                content: `**Harmonization:** ${data.message}`,
              },
            ]);
          }
        } catch {
          handleSend('Check consistency across linked sections.');
        }
      })();
      return;
    }

    // ACTION 8: Resolution changelog
    if (action.intent === 'resolution_changelog') {
      (async () => {
        const projectId = contextProfile?.projectId;
        if (!projectId) {
          handleSend('What changed after the last resolution?');
          return;
        }
        try {
          const res = await apiRequest('POST', '/api/authoring-actions/resolution-changelog', {
            projectId,
          });
          const data = await res.json();
          if (data.status === 'data' && data.resolutions?.length) {
            const lines = data.resolutions
              .map(
                (r: any, i: number) =>
                  `### Resolution ${i + 1}\n**${r.summary}**\n- Trigger: ${
                    r.triggerExplanation
                  }\n- Path: ${r.recommendedPath}\n- Confidence: ${r.confidence}\n- Affected: ${
                    r.affectedObjectsSummary
                  }\n- Review: ${JSON.stringify(r.reviewRequirements)}\n- Next: ${
                    r.nextSteps?.join(', ') || 'None'
                  }`
              )
              .join('\n\n');
            setMessages(prev => [
              ...prev,
              {
                id: `a-${Date.now()}`,
                role: 'assistant',
                timestamp: new Date(),
                content: `**Resolution History** — ${data.resolutionCount} resolution(s)\n\n${lines}`,
              },
            ]);
          } else {
            setMessages(prev => [
              ...prev,
              {
                id: `a-${Date.now()}`,
                role: 'assistant',
                timestamp: new Date(),
                content: `**Resolution changelog:** ${data.message}`,
              },
            ]);
          }
        } catch {
          handleSend('What changed after the last resolution?');
        }
      })();
      return;
    }

    // ACTION 9: Module readiness
    if (action.intent === 'module_readiness') {
      (async () => {
        const projectId = contextProfile?.projectId;
        const moduleCode =
          authoringContext?.moduleCode ||
          (authoringContext?.sectionCode ? `m${authoringContext.sectionCode.split('.')[0]}` : 'm2');
        if (!projectId) {
          handleSend('Show readiness for this module.');
          return;
        }
        try {
          const res = await apiRequest(
            'GET',
            `/api/authoring-actions/module-readiness/${projectId}/${moduleCode}`
          );
          const data = await res.json();
          if (data.status === 'data') {
            const mod = data.module;
            const blockerLines =
              data.blockers
                ?.slice(0, 5)
                .map(
                  (b: any) =>
                    `- **[${b.severity}]** ${b.message}${
                      b.suggestedResolution ? ` → ${b.suggestedResolution}` : ''
                    }`
                )
                .join('\n') || 'None';
            const moduleTable =
              data.moduleBreakdown
                ?.map(
                  (m: any) =>
                    `| ${m.module} | ${m.label} | ${m.score ?? '—'} | ${m.status} | ${
                      m.documentCount
                    } |`
                )
                .join('\n') || '';
            setMessages(prev => [
              ...prev,
              {
                id: `a-${Date.now()}`,
                role: 'assistant',
                timestamp: new Date(),
                content: `**Module Readiness** — Overall: ${data.overallScore ?? '—'}/100 (${
                  data.overallStatus
                })\n\n${
                  mod
                    ? `**${mod.label}** (${mod.code}): Score ${mod.score ?? '—'}/100, Status: ${
                        mod.status
                      }\nDocs: ${mod.documentCount}/${mod.expectedDocumentCount}, Validated: ${
                        mod.validatedCount
                      }, Blockers: ${mod.blockerCount}`
                    : `Module ${moduleCode} not found in breakdown.`
                }\n\n**Blockers:**\n${blockerLines}\n\n| Module | Label | Score | Status | Docs |\n|---|---|---|---|---|\n${moduleTable}`,
              },
            ]);
          } else {
            setMessages(prev => [
              ...prev,
              {
                id: `a-${Date.now()}`,
                role: 'assistant',
                timestamp: new Date(),
                content: `**Module readiness:** ${data.message}`,
              },
            ]);
          }
        } catch {
          handleSend(`Show readiness for module ${moduleCode}.`);
        }
      })();
      return;
    }

    // ACTION 10: Section evidence
    if (action.intent === 'section_evidence') {
      (async () => {
        const projectId = contextProfile?.projectId;
        const sectionCode = authoringContext?.sectionCode;
        if (!projectId || !sectionCode) {
          handleSend('Gather evidence for this section.');
          return;
        }
        try {
          const res = await apiRequest(
            'GET',
            `/api/authoring-actions/section-evidence/${projectId}/${sectionCode}`
          );
          const data = await res.json();
          if (data.status === 'data' && data.evidence?.length) {
            const evidenceLines = data.evidence
              .slice(0, 10)
              .map(
                (e: any, i: number) =>
                  `${i + 1}. **${e.title}** — Type: ${e.type}, Status: ${e.status}${
                    e.fdaRequirement ? `, FDA: ${e.fdaRequirement}` : ''
                  }`
              )
              .join('\n');
            const gapInfo = data.gapAnalysis
              ? `\n\n**Evidence completeness:** ${data.gapAnalysis.completeness ?? '—'}%${
                  data.gapAnalysis.criticalGaps?.length
                    ? `\nCritical gaps: ${data.gapAnalysis.criticalGaps.join(', ')}`
                    : ''
                }`
              : '';
            setMessages(prev => [
              ...prev,
              {
                id: `a-${Date.now()}`,
                role: 'assistant',
                timestamp: new Date(),
                content: `**Evidence for §${sectionCode}** — ${data.evidenceCount} item(s) found:\n\n${evidenceLines}${gapInfo}`,
              },
            ]);
          } else {
            setMessages(prev => [
              ...prev,
              {
                id: `a-${Date.now()}`,
                role: 'assistant',
                timestamp: new Date(),
                content: `**Evidence for §${sectionCode}:** ${data.message}${
                  data.gapAnalysis?.gaps?.length
                    ? `\n\nGaps identified: ${data.gapAnalysis.gaps.join(', ')}`
                    : ''
                }`,
              },
            ]);
          }
        } catch {
          handleSend(`Gather evidence for section ${sectionCode}.`);
        }
      })();
      return;
    }

    // ── Wave 3: Body-aware + cross-section consistency handlers ──────

    // ACTION 11: Body-aware expectations
    if (action.intent === 'body_expectations') {
      (async () => {
        const projectId = contextProfile?.projectId;
        const sectionCode = authoringContext?.sectionCode;
        const body = authoringContext?.regulatorBody || 'FDA';
        const subType = authoringContext?.submissionType || 'IND';
        if (!sectionCode) {
          handleSend(`What does ${body} expect in this section?`);
          return;
        }
        try {
          const res = await apiRequest(
            'GET',
            `/api/authoring-actions/section-expectations/${encodeURIComponent(
              body
            )}/${encodeURIComponent(subType)}/${encodeURIComponent(sectionCode)}`
          );
          const data = await res.json();
          if (data.status === 'data') {
            const exp = data.expectations;
            const reqLines = exp.requirements?.length
              ? exp.requirements.map((r: string) => `- ${r}`).join('\n')
              : '- None identified';
            const defLines =
              exp.commonDeficiencies
                ?.slice(0, 5)
                .map((d: string) => `- ${d}`)
                .join('\n') || '- None';
            const bodyNotes =
              exp.bodySpecificNotes
                ?.slice(0, 3)
                .map((n: string) => `- ${n}`)
                .join('\n') || '- None';
            setMessages(prev => [
              ...prev,
              {
                id: `a-${Date.now()}`,
                role: 'assistant',
                timestamp: new Date(),
                content: `**${body} Expectations for §${sectionCode}** (${subType})\n\n**Required level:** ${exp.requiredLevel}\n\n**Requirements:**\n${reqLines}\n\n**Common deficiencies (${body}):**\n${defLines}\n\n**Body-specific notes:**\n${bodyNotes}`,
              },
            ]);
          } else {
            setMessages(prev => [
              ...prev,
              {
                id: `a-${Date.now()}`,
                role: 'assistant',
                timestamp: new Date(),
                content: `**Section expectations:** ${data.message}`,
              },
            ]);
          }
        } catch {
          handleSend(`What does ${body} expect in section ${sectionCode}?`);
        }
      })();
      return;
    }

    // ACTION 12: Cross-section consistency
    if (action.intent === 'cross_section_consistency') {
      (async () => {
        const projectId = contextProfile?.projectId;
        const sectionCode = authoringContext?.sectionCode;
        if (!projectId || !sectionCode) {
          handleSend('Check this section against linked sections.');
          return;
        }
        try {
          const res = await apiRequest('POST', '/api/authoring-actions/cross-section-consistency', {
            projectId,
            sectionCode,
            linkedSectionCodes: authoringContext?.linkedSectionCodes,
            submissionType: authoringContext?.submissionType,
          });
          const data = await res.json();
          if (data.status === 'data') {
            const harmIssues =
              data.harmonizeResult?.issues
                ?.slice(0, 5)
                .map(
                  (i: any) =>
                    `- **[${i.severity}]** ${i.description} (§${i.sectionA} ↔ §${i.sectionB})${
                      i.recommendation ? `\n  → ${i.recommendation}` : ''
                    }`
                )
                .join('\n') || '- None found';
            const contraLines =
              data.contradictions
                ?.slice(0, 3)
                .map((c: any) => `- **[${c.severity}]** ${c.explanation}`)
                .join('\n') || '- None';
            setMessages(prev => [
              ...prev,
              {
                id: `a-${Date.now()}`,
                role: 'assistant',
                timestamp: new Date(),
                content: `**Cross-Section Consistency for §${sectionCode}**\n\nLinked: ${
                  data.linkedSections?.join(', ') || 'none'
                }\nConsistency: ${
                  data.harmonizeResult?.consistencyScore ?? '—'
                }/100\n\n**Harmonization issues (${
                  data.harmonizeResult?.totalIssues ?? 0
                }):**\n${harmIssues}\n\n**Contradictions (${
                  data.contradictionCount ?? 0
                }):**\n${contraLines}${
                  data.harmonizeResult?.totalIssues > 0
                    ? '\n\n💡 Use **Prepare correction draft** or **Harmonize** to address these.'
                    : ''
                }`,
              },
            ]);
            onRefreshIntelligence?.();
          } else {
            setMessages(prev => [
              ...prev,
              {
                id: `a-${Date.now()}`,
                role: 'assistant',
                timestamp: new Date(),
                content: `**Cross-section consistency:** ${data.message}`,
              },
            ]);
          }
        } catch {
          handleSend('Check this section against linked sections for consistency.');
        }
      })();
      return;
    }

    // ACTION 13: Body-aware gap detection
    if (action.intent === 'body_aware_gaps') {
      (async () => {
        const sectionCode = authoringContext?.sectionCode;
        const body = authoringContext?.regulatorBody || 'FDA';
        const subType = authoringContext?.submissionType || 'IND';
        if (!sectionCode) {
          handleSend(`What is missing for ${body} in this section?`);
          return;
        }
        try {
          const res = await apiRequest('POST', '/api/authoring-actions/body-aware-gaps', {
            regulatorBody: body,
            submissionType: subType,
            sectionCode,
            currentContent: '', // Empty triggers "all missing" detection
          });
          const data = await res.json();
          if (data.status === 'data') {
            const gapLines =
              data.gaps
                ?.slice(0, 10)
                .map(
                  (g: any) =>
                    `- **[${g.status.toUpperCase()}]** ${g.requirement}${
                      g.bodyNote ? ` — ${g.bodyNote}` : ''
                    }`
                )
                .join('\n') || '- None detected';
            setMessages(prev => [
              ...prev,
              {
                id: `a-${Date.now()}`,
                role: 'assistant',
                timestamp: new Date(),
                content: `**${body} Gap Analysis for §${sectionCode}** (${subType})\n\n**Completeness:** ${
                  data.overallCompleteness ?? '—'
                }%\n\n**Gaps:**\n${gapLines}${
                  data.overallCompleteness != null && data.overallCompleteness < 50
                    ? '\n\n⚠️ Section is significantly incomplete for this regulatory body.'
                    : ''
                }`,
              },
            ]);
          } else {
            setMessages(prev => [
              ...prev,
              {
                id: `a-${Date.now()}`,
                role: 'assistant',
                timestamp: new Date(),
                content: `**Body-aware gaps:** ${data.message}`,
              },
            ]);
          }
        } catch {
          handleSend(`What is missing for ${body} in section ${sectionCode}?`);
        }
      })();
      return;
    }

    // ── Wave 3: Contradiction → Resolution intent handlers ──────

    // ACTION 14: Explain contradiction resolution
    if (action.intent === 'explain_contradiction_resolution') {
      (async () => {
        const projectId = contextProfile?.projectId;
        const contradictions = authoringContext?.contradictions;
        if (!projectId || !contradictions?.length) {
          handleSend('Explain the contradictions in this project and how to resolve them.');
          return;
        }
        // Explain the first (most severe) contradiction
        const sorted = [...contradictions].sort((a: any, b: any) => {
          const sev: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 };
          return (sev[b.severity] || 0) - (sev[a.severity] || 0);
        });
        const finding = sorted[0];
        try {
          const res = await fetch('/api/authoring-actions/explain-contradiction-resolution', {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ projectId, findingId: finding.id, finding }),
          });
          const data = await res.json();
          if (data.status === 'data' || data.success) {
            setMessages(prev => [
              ...prev,
              {
                id: `a-${Date.now()}`,
                role: 'assistant',
                timestamp: new Date(),
                content:
                  data.message ||
                  `**Contradiction Resolution Explanation**\n\n${JSON.stringify(
                    data.data,
                    null,
                    2
                  )}`,
              },
            ]);
          } else {
            setMessages(prev => [
              ...prev,
              {
                id: `a-${Date.now()}`,
                role: 'assistant',
                timestamp: new Date(),
                content: `**Contradiction explanation:** ${
                  data.message || 'No explanation available'
                }`,
              },
            ]);
          }
        } catch {
          handleSend('Explain the contradictions and how to resolve them.');
        }
      })();
      return;
    }

    // ACTION 15: Plan contradiction resolution
    if (action.intent === 'plan_contradiction_resolution') {
      (async () => {
        const projectId = contextProfile?.projectId;
        const contradictions = authoringContext?.contradictions;
        if (!projectId || !contradictions?.length) {
          handleSend('Plan resolution for the contradictions blocking this project.');
          return;
        }
        // Plan resolution for the most severe blocking contradiction
        const blocking = contradictions.filter(
          (c: any) => c.severity === 'critical' || c.severity === 'high'
        );
        const finding = blocking[0] || contradictions[0];
        try {
          const res = await fetch('/api/authoring-actions/plan-contradiction-resolution', {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ projectId, findingId: finding.id, finding }),
          });
          const data = await res.json();
          if (data.status === 'data' || data.success) {
            const plan = data.data;
            const lines = [
              `**Resolution Plan for "${finding.type || finding.contradictionType}"**`,
              '',
              `**Governed action:** ${plan?.governedAction || '—'}`,
              `**Authority level:** ${plan?.authorityLevel || '—'}`,
              `**Confidence:** ${plan?.confidence || '—'}`,
              `**Affected objects:** ${plan?.affectedObjectCount || 0}`,
              `**Requires human confirmation:** ${plan?.requiresHumanConfirmation ? 'Yes' : 'No'}`,
              `**Recommended path:** ${plan?.recommendedPath || '—'}`,
            ];
            if (plan?.overlayApplied) {
              lines.push(`**Overlay applied:** Yes (authority escalated)`);
            }
            setMessages(prev => [
              ...prev,
              {
                id: `a-${Date.now()}`,
                role: 'assistant',
                timestamp: new Date(),
                content: lines.join('\n'),
              },
            ]);
          } else {
            setMessages(prev => [
              ...prev,
              {
                id: `a-${Date.now()}`,
                role: 'assistant',
                timestamp: new Date(),
                content: `**Resolution plan:** ${data.message || 'Could not create plan'}`,
              },
            ]);
          }
        } catch {
          handleSend('Plan resolution for the blocking contradictions.');
        }
      })();
      return;
    }

    // ACTION 16: Project resolution status
    if (action.intent === 'project_resolution_status') {
      (async () => {
        const projectId = contextProfile?.projectId;
        if (!projectId) {
          handleSend('What is the resolution status of this project?');
          return;
        }
        try {
          const res = await fetch(`/api/authoring-actions/project-resolution-status/${projectId}`, {
            headers: getAuthHeaders(),
          });
          const data = await res.json();
          if (data.status === 'data' || data.success) {
            const plans = data.data?.plans;
            const bundles = data.data?.bundles;
            const lines = [
              '**Project Resolution Status**',
              '',
              `**Plans:** ${plans?.total || 0} total — ${plans?.unresolved || 0} unresolved, ${
                plans?.inProgress || 0
              } in-progress, ${plans?.resolved || 0} resolved`,
              `**Bundles:** ${bundles?.total || 0} total — ${bundles?.active || 0} active, ${
                bundles?.pendingReview || 0
              } pending review`,
            ];
            if ((plans?.unresolved || 0) > 0) {
              lines.push(
                '',
                `**${plans.unresolved} unresolved plan(s)** require attention. Use "Plan resolution" to address blockers.`
              );
            } else if ((plans?.total || 0) === 0) {
              lines.push(
                '',
                'No resolution plans found. The project has no active contradictions requiring resolution.'
              );
            }
            setMessages(prev => [
              ...prev,
              {
                id: `a-${Date.now()}`,
                role: 'assistant',
                timestamp: new Date(),
                content: lines.join('\n'),
              },
            ]);
          } else {
            setMessages(prev => [
              ...prev,
              {
                id: `a-${Date.now()}`,
                role: 'assistant',
                timestamp: new Date(),
                content: `**Resolution status:** ${data.message || 'Unable to retrieve'}`,
              },
            ]);
          }
        } catch {
          handleSend('What is the resolution status of this project?');
        }
      })();
      return;
    }

    // Route AI-actionable intents through the unified action system
    const aiActionMap: Record<
      string,
      { actionType: AIActionType; targetType: 'artifact' | 'document' }
    > = {
      'validation.run': { actionType: 'run_validation', targetType: 'artifact' },
      'artifact.promote': { actionType: 'promote_artifact', targetType: 'artifact' },
      'document.export': { actionType: 'export_document', targetType: 'document' },
      'document.version': { actionType: 'save_document_version', targetType: 'document' },
      'document.route': { actionType: 'route_document_to_module', targetType: 'document' },
    };
    const mappedEntry = action.intent ? aiActionMap[action.intent] : undefined;
    const projectId = contextProfile?.projectId ? Number(contextProfile.projectId) : NaN;
    if (mappedEntry && !isNaN(projectId)) {
      aiAction
        .execute({
          actionType: mappedEntry.actionType,
          targetType: mappedEntry.targetType,
          targetId: (action as any).targetId || null,
          projectId,
          sourceSurface: 'global_panel' as AIActionSourceSurface,
          payload: (action as any).payload || {},
        })
        .then(result => {
          if (onActionRun) {
            onActionRun({
              id: action.id,
              intent: action.intent!,
              label: action.label,
              status: result.success ? 'done' : 'failed',
              ts: Date.now(),
            });
          }
        })
        .catch(err => {
          if (onActionRun) {
            onActionRun({
              id: action.id,
              intent: action.intent!,
              label: action.label,
              status: 'failed',
              ts: Date.now(),
              error: err instanceof Error ? err.message : 'Action execution failed',
            });
          }
        });
    }

    const intentToPrompt: Record<string, string> = {
      recommendation: '/recommend',
      'next-action': '/next',
      'risk-assessment': '/risk',
      'open-question': '/knowledge',
      ctd_map: '/workflow',
      find_predicates: '/precedent',
      check_readiness: '/readiness',
      draft_section: '/draft',
      cms_strategy: '/cms',
      diagnostics_strategy: '/diagnostics',
    };
    const mappedPrompt = action.intent ? intentToPrompt[action.intent] : undefined;
    handleSend(mappedPrompt || action.label);
  };

  const hasMessages = messages.length > 0;
  // Toggle for the home empty-state — false shows the 4 example cards, true shows
  // the full browse of 19 domain-prompt groups (106 prompts). WO-10 2026-04-14.
  const [browseAll, setBrowseAll] = useState(false);
  const isCompact = mode === 'compact';

  // ── Compact mode: just input bar + expandable overlay ──
  if (isCompact) {
    return (
      <div className="flex-shrink-0 border-t border-[#E8E6DC] bg-white relative z-30">
        {/* Expanded conversation overlay (slides up from bottom) */}
        {hasMessages && (
          <div
            ref={conversationViewportRef}
            className="max-h-[50vh] overflow-y-auto zen-scroll border-t border-[#F5F4EF]"
            onClick={focusComposerFromCanvas}
            onScroll={handleConversationScroll}
            style={{ scrollbarWidth: 'thin' }}
          >
            {messages.map(msg => {
              const isUser = msg.role === 'user';
              const htmlContent = !isUser ? renderMarkdown(msg.content) : '';
              return (
                <div
                  key={msg.id}
                  className={cn('group px-4 py-3', 'bg-white')}
                >
                  <div
                    className={cn(
                      'flex gap-2.5 max-w-3xl mx-auto',
                      isUser && 'justify-end pl-8 sm:pl-14'
                    )}
                  >
                    <div
                      className={cn(
                        'w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5',
                        isUser ? 'hidden' : 'bg-[#141413]'
                      )}
                    >
                      {!isUser && (
                        <Sparkles className="w-3 h-3 text-white" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      {isUser ? (
                        <div className="flex justify-end">
                          <p className="inline-block max-w-[min(94%,640px)] text-[15px] text-[#2D2C28] leading-relaxed whitespace-pre-wrap mt-0.5 bg-[#F1F1F1] px-4 py-3 rounded-[22px]">
                            {msg.content}
                          </p>
                        </div>
                      ) : (
                        <div
                          className="prose prose-sm prose-zinc max-w-none mt-0.5
                            prose-p:text-zinc-700 prose-p:leading-relaxed prose-p:my-2
                            prose-strong:text-zinc-900
                            prose-code:text-[#C4623F] prose-code:bg-[#FBF0EB] prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-xs prose-code:before:content-none prose-code:after:content-none
                            prose-pre:bg-zinc-900 prose-pre:text-zinc-100 prose-pre:rounded-xl prose-pre:p-3.5 prose-pre:text-xs
                            prose-blockquote:border-l-stone-300 prose-blockquote:text-zinc-600 prose-blockquote:not-italic prose-blockquote:pl-3 prose-blockquote:my-2
                            prose-ul:text-zinc-700 prose-ol:text-zinc-700 prose-ul:my-2 prose-ol:my-2 prose-li:my-1
                            prose-a:text-[#D97757] prose-a:underline prose-a:decoration-[#E8C7BA] prose-a:underline-offset-2 hover:prose-a:text-[#C4623F]
                            [&>*:first-child]:mt-0 [&>*:last-child]:mb-0"
                          dangerouslySetInnerHTML={{ __html: htmlContent }}
                        />
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
            {showJumpToLatest && (
              <div className="flex justify-center py-2">
                <button
                  type="button"
                  onClick={scrollToLatest}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium text-[#4D4B45] bg-[#F5F4EF] border border-[#E8E6DC] hover:bg-[#ECEADF] transition-colors"
                >
                  <ArrowDown className="w-3.5 h-3.5" />
                  Jump to latest
                </button>
              </div>
            )}
            <div className="flex justify-center pb-2">
              <button
                type="button"
                onClick={summarizeRecentTurns}
                className="inline-flex items-center rounded-full border border-[#E8E6DC] bg-white px-3 py-1 text-[11px] font-medium text-[#6B6962] hover:bg-[#F5F4EF]"
              >
                Summarize last 10 turns
              </button>
            </div>
            {isThinking && (
              <div className="px-4 py-3 bg-white">
                <div className="flex gap-2.5 max-w-3xl mx-auto">
                  <div className="w-6 h-6 rounded-full bg-[#D97757] flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Sparkles className="w-3 h-3 text-white" />
                  </div>
                  <div>
                    <span className="text-xs font-semibold text-[#2D2C28]">AnA</span>
                    <div className="flex items-center gap-1 mt-1">
                      <div className="w-1.5 h-1.5 rounded-full bg-[#E8967A] animate-[pulse_1.4s_ease-in-out_infinite]" />
                      <div className="w-1.5 h-1.5 rounded-full bg-[#E8967A] animate-[pulse_1.4s_ease-in-out_0.2s_infinite]" />
                      <div className="w-1.5 h-1.5 rounded-full bg-[#E8967A] animate-[pulse_1.4s_ease-in-out_0.4s_infinite]" />
                    </div>
                    <p className="mt-1 text-[11px] text-[#8A8880]">
                      {THINKING_STATUS_PHASES[statusPhaseIndex]}
                    </p>
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}

        {/* Input bar */}
        <div className="px-4 py-2.5 bg-white relative">
          <div className="max-w-3xl mx-auto relative">
            {/* Slash command autocomplete dropdown */}
            {slashMenuOpen && filteredSlashCommands.length > 0 && (
              <div
                ref={slashMenuRef}
                className="absolute bottom-full left-0 right-0 mb-2 bg-white rounded-xl border border-[#E8E6DC] shadow-lg max-h-[280px] overflow-y-auto z-50"
                role="listbox"
                aria-label="Slash commands"
              >
                {filteredSlashCommands.map((cmd, i) => (
                  <button
                    key={cmd.command}
                    type="button"
                    role="option"
                    aria-selected={i === slashMenuIndex}
                    onMouseDown={e => {
                      e.preventDefault();
                      selectSlashCommand(cmd);
                    }}
                    onMouseEnter={() => setSlashMenuIndex(i)}
                    className={cn(
                      'w-full flex items-center gap-3 px-3.5 py-2 text-left transition-colors',
                      i === slashMenuIndex ? 'bg-[#FAF9F5]' : 'hover:bg-[#FAF9F5]/50'
                    )}
                  >
                    <code className="text-xs font-mono font-semibold text-[#141413] min-w-[100px]">
                      {cmd.command}
                    </code>
                    <span className="text-xs text-[#6B6962] flex-1 truncate">
                      {cmd.description}
                    </span>
                    <span
                      className={cn(
                        'text-[10px] font-medium',
                        SLASH_CATEGORY_COLORS[cmd.category] || 'text-zinc-400'
                      )}
                    >
                      {cmd.category}
                    </span>
                  </button>
                ))}
              </div>
            )}
            <div
              className={cn(
                'flex items-end gap-2 px-3.5 py-2.5 bg-[#FAF9F5] border rounded-2xl transition-colors duration-150',
                isFocused
                  ? 'border-[#D8D5CA] ring-2 ring-[#F5F4EF] bg-white shadow-sm'
                  : 'border-[#E8E6DC] hover:border-[#D8D5CA]'
              )}
            >
              <div className="flex items-center gap-1.5 flex-shrink-0 self-center">
                <Sparkles className="w-4 h-4 text-[#D97757]" />
                {screenLabel && (
                  <span className="text-[10px] text-[#B0AEA5] font-medium hidden sm:inline">
                    {screenLabel}
                  </span>
                )}
              </div>
              {/* Queue Status Banner */}
              {conversationQueue.length > 0 && (
                <div className="flex items-center gap-2 px-3 py-1.5 bg-stone-50 border-t border-stone-100 text-[11px] text-stone-500">
                  {activeQueueItemId && <span className="text-amber-600">● Working</span>}
                  {conversationQueue.filter(i => i.status === 'queued').length > 0 && (
                    <span>
                      Queued: {conversationQueue.filter(i => i.status === 'queued').length}
                    </span>
                  )}
                  <button
                    onClick={() => setConversationQueue([])}
                    className="ml-auto text-stone-400 hover:text-stone-600"
                  >
                    Clear
                  </button>
                </div>
              )}
              <textarea
                ref={inputRef}
                value={input}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                onFocus={() => setIsFocused(true)}
                onBlur={() => {
                  setIsFocused(false);
                  setTimeout(() => setSlashMenuOpen(false), 150);
                }}
                placeholder="Message AnA — type / for commands..."
                rows={1}
                className="flex-1 resize-none bg-transparent border-none outline-none text-[#141413] placeholder:text-[#B0AEA5] text-sm leading-6 min-h-[24px] max-h-[120px]"
              />
              {hasMessages && (
                <button
                  onClick={() => {
                    setMessages([]);
                    threadIdRef.current = null;
                    // Keep selection state in sync with cleared local thread context.
                    onThreadChange?.(undefined);
                  }}
                  className="flex-shrink-0 p-1.5 text-[#B0AEA5] hover:text-[#6B6962] rounded-lg transition-colors"
                  title="New thread"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
              )}
              {isThinking ? (
                <button
                  onClick={handleStop}
                  className="flex-shrink-0 p-2 rounded-full bg-[#141413] text-white hover:bg-[#2D2C28] transition-colors duration-150"
                  aria-label="Stop generating"
                  title="Stop generating"
                >
                  <Square className="w-3.5 h-3.5" fill="currentColor" />
                </button>
              ) : (
                <button
                  onClick={() => handleSend()}
                  disabled={!input.trim()}
                  className={cn(
                    'flex-shrink-0 p-2 rounded-full transition-colors duration-150',
                    input.trim()
                      ? 'bg-[#141413] text-white hover:bg-[#2D2C28]'
                      : 'bg-[#E8E6DC] text-[#B0AEA5] cursor-not-allowed'
                  )}
                  aria-label="Send message"
                >
                  <ArrowUp className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Full mode: fills available space like Claude.ai ──
  return (
    <div className="flex-1 flex flex-col min-h-0 bg-white">
      {/* ── E3: Persistent project context banner ── */}
      {contextProfile?.activeProject && hasMessages && (
        <div
          className="flex items-center justify-between bg-zinc-50 dark:bg-zinc-900/50 border-b border-zinc-200 dark:border-zinc-800 px-4 py-2 shrink-0 cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-900/70 transition-colors"
          onClick={() => onNavigate?.('project-config')}
          role="button"
          tabIndex={0}
          onKeyDown={e => {
            if (e.key === 'Enter' || e.key === ' ') onNavigate?.('project-config');
          }}
          aria-label={`Active project: ${contextProfile.activeProject}. Click to open project config.`}
        >
          <div className="flex items-center gap-2 min-w-0">
            <FolderOpen className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
            <span className="text-[13px] font-semibold text-zinc-700 dark:text-zinc-300 truncate">
              {contextProfile.activeProject}
            </span>
            {contextProfile.productType && (
              <>
                <span className="text-zinc-300 dark:text-zinc-600">·</span>
                <span
                  className={cn(
                    'text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded',
                    contextProfile.productType.includes('510')
                      ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'
                      : contextProfile.productType.includes('PMA')
                      ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300'
                      : contextProfile.productType.includes('NDA')
                      ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
                      : contextProfile.productType.includes('BLA')
                      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                      : contextProfile.productType.includes('IND')
                      ? 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300'
                      : contextProfile.productType.includes('ANDA')
                      ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300'
                      : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400'
                  )}
                >
                  {contextProfile.productType}
                </span>
              </>
            )}
          </div>
          <span className="text-[11px] text-zinc-400 dark:text-zinc-500 whitespace-nowrap ml-3">
            Quick project switch ←
          </span>
        </div>
      )}
      {contextProfile?.activeProject && hasMessages && (
        <div className="shrink-0 border-b border-zinc-200 bg-white px-4 py-2">
          <button
            type="button"
            onClick={() => setDecisionRailExpanded(prev => !prev)}
            className="w-full text-left rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 hover:bg-zinc-100 transition-colors"
            aria-expanded={decisionRailExpanded}
            aria-label="Toggle decision status details"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                  Decision status
                </p>
                <p className="text-xs text-zinc-700 truncate">
                  {decisionStatus.loading ? 'Loading decision status...' : decisionStatus.summary}
                </p>
              </div>
              <ChevronDown
                className={cn(
                  'w-3.5 h-3.5 text-zinc-500 transition-transform',
                  decisionRailExpanded && 'rotate-180'
                )}
              />
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[10px] text-zinc-600">
              {decisionStatus.pendingConfirmations > 0 && (
                <span className="rounded-full border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-amber-700">
                  {decisionStatus.pendingConfirmations} confirmation
                </span>
              )}
              {decisionStatus.pendingApprovals > 0 && (
                <span className="rounded-full border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-blue-700">
                  {decisionStatus.pendingApprovals} approval
                </span>
              )}
              {decisionStatus.unresolvedContradictions && (
                <span className="rounded-full border border-red-200 bg-red-50 px-1.5 py-0.5 text-red-700">
                  unresolved contradictions
                </span>
              )}
              {decisionStatus.provisional && (
                <span className="rounded-full border border-orange-200 bg-orange-50 px-1.5 py-0.5 text-orange-700">
                  provisional decisions
                </span>
              )}
              {!decisionStatus.loading &&
                decisionStatus.pendingConfirmations === 0 &&
                decisionStatus.pendingApprovals === 0 &&
                !decisionStatus.unresolvedContradictions &&
                !decisionStatus.provisional && (
                  <span className="rounded-full border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-emerald-700">
                    clear
                  </span>
                )}
              <span className="text-zinc-400">·</span>
              <span>{decisionStatus.count} tracked</span>
            </div>
          </button>
          {decisionRailExpanded && (
            <div className="mt-2 rounded-lg border border-zinc-200 bg-white px-3 py-2">
              {decisionStatus.error ? (
                <p className="text-xs text-red-600">{decisionStatus.error}</p>
              ) : decisionStatus.details.length > 0 ? (
                <ul className="space-y-1.5">
                  {decisionStatus.details.map(row => (
                    <li key={row.id || `${row.status}-${row.kind}-${row.summary.slice(0, 20)}`}>
                      <p className="text-[11px] text-zinc-800">
                        <span className="font-medium">[{row.status.toUpperCase()}]</span> {row.kind}
                      </p>
                      <p className="text-[11px] text-zinc-600">{row.summary}</p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-zinc-600">No recent decisions for this scope.</p>
              )}
              <button
                type="button"
                onClick={() => void loadDecisionRail()}
                className="mt-2 text-[11px] text-zinc-500 hover:text-zinc-700"
              >
                Refresh
              </button>
            </div>
          )}
        </div>
      )}
      {/* ── Conversation area — fills available space ── */}
      <div
        ref={conversationViewportRef}
        className="flex-1 overflow-y-auto zen-scroll"
        onClick={focusComposerFromCanvas}
        onScroll={handleConversationScroll}
        role="log"
        aria-live="polite"
        aria-label="Conversation with AnA"
        style={{ scrollbarWidth: 'thin' }}
      >
        {!hasMessages && !isThinking ? (
          /* ── Home — premium landing ── */
          <div className="flex-1 flex flex-col items-center justify-center px-8 py-12 bg-gradient-to-b from-stone-50/80 to-white">
            <div className="max-w-2xl w-full space-y-10">

              {/* Hero */}
              <div className="text-center space-y-3">
                <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-stone-900 shadow-md mb-2">
                  <Sparkles className="w-6 h-6 text-white" aria-hidden="true" />
                </div>
                <h1 className="text-[22px] font-semibold text-stone-900 tracking-tight leading-tight">
                  {greeting || 'Welcome to ClinicalSageAI'}
                </h1>
                <p className="text-[14px] text-stone-500 leading-relaxed max-w-lg mx-auto">
                  Regulatory intelligence platform for medical devices, diagnostics,
                  pharma, and biotech. From first submission to market approval.
                </p>
              </div>

              {/* Projects or Create CTA */}
              {projects && projects.length > 0 ? (
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h2 className="text-[13px] font-semibold text-stone-700">Your projects</h2>
                    {onCreateProject && (
                      <button
                        type="button"
                        onClick={onCreateProject}
                        className="text-[12px] font-medium text-stone-500 hover:text-stone-900 transition-colors"
                      >
                        + New project
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {projects.slice(0, 6).map(proj => (
                      <button
                        key={proj.id}
                        type="button"
                        onClick={() => onSelectProject?.(proj.id)}
                        className="flex items-center gap-3 rounded-xl border border-stone-200/80 bg-white px-4 py-3.5 text-left hover:border-stone-300 hover:shadow-md transition-all duration-200"
                      >
                        <div className="w-9 h-9 rounded-lg bg-stone-100 flex items-center justify-center flex-shrink-0">
                          <FileText className="w-4 h-4 text-stone-500" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] font-medium text-stone-800 truncate">{proj.name}</p>
                          <p className="text-[11px] text-stone-400 mt-0.5 uppercase tracking-wide font-medium">{proj.type}</p>
                        </div>
                        <ChevronRight className="w-4 h-4 text-stone-300 flex-shrink-0" />
                      </button>
                    ))}
                  </div>
                </div>
              ) : onCreateProject ? (
                <div className="text-center py-4">
                  <button
                    type="button"
                    onClick={onCreateProject}
                    className="inline-flex items-center gap-2.5 px-6 py-3 rounded-xl bg-stone-900 text-white text-[14px] font-medium hover:bg-stone-800 transition-all duration-200 shadow-md hover:shadow-lg"
                  >
                    <Plus className="w-4.5 h-4.5" />
                    Create your first project
                  </button>
                  <p className="text-[12px] text-stone-400 mt-3">
                    510(k), PMA, De Novo, IND, NDA, BLA, CER, and more
                  </p>
                </div>
              ) : null}

              {/* Industry pathways */}
              <div>
                <h2 className="text-[13px] font-semibold text-stone-700 mb-3">Start with a question</h2>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {[
                    {
                      icon: FileText,
                      title: 'Medical devices',
                      sub: '510(k), PMA, De Novo, CER',
                      prompt: 'Help me start a 510(k) submission for my medical device. Walk me through what I need.',
                    },
                    {
                      icon: BookOpen,
                      title: 'Pharma & biotech',
                      sub: 'IND, NDA, BLA, MAA',
                      prompt: 'Help me plan an IND or NDA submission for my drug product. What should I prepare first?',
                    },
                    {
                      icon: BarChart2,
                      title: 'Clinical trials',
                      sub: 'Protocol, SAP, endpoints',
                      prompt: 'Help me design a clinical trial protocol for my study. I need endpoint strategy and statistical design.',
                    },
                  ].map(card => {
                    const Icon = card.icon;
                    return (
                      <button
                        key={card.title}
                        type="button"
                        onClick={() => {
                          setInput(card.prompt);
                          requestAnimationFrame(() => inputRef.current?.focus());
                        }}
                        className="group text-left rounded-xl border border-stone-200/80 bg-white p-5 hover:border-stone-300 hover:shadow-md transition-all duration-200"
                      >
                        <div className="w-8 h-8 rounded-lg bg-stone-100 flex items-center justify-center mb-3 group-hover:bg-stone-200 transition-colors">
                          <Icon className="w-4 h-4 text-stone-500" aria-hidden="true" />
                        </div>
                        <p className="text-[13px] font-semibold text-stone-800">{card.title}</p>
                        <p className="text-[11px] text-stone-400 mt-1">{card.sub}</p>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Browse capabilities */}
              <div className="text-center">
                <button
                  type="button"
                  onClick={() => setBrowseAll(b => !b)}
                  className="text-[12px] text-stone-400 hover:text-stone-700 transition-colors rounded px-3 py-1.5"
                >
                  {browseAll ? '\u2190 Back' : 'Browse all 106 capabilities \u2192'}
                </button>
              </div>

              {browseAll && (
                <div className="max-h-[40vh] overflow-y-auto pr-2 space-y-5 border border-stone-100 rounded-xl p-4 bg-stone-50/40">
                  {ALL_DOMAIN_GROUPS.map(group => (
                    <section key={group.domain}>
                      <h3 className="text-[11px] font-semibold tracking-[0.08em] text-stone-600 uppercase mb-1.5">
                        {group.label}
                        <span className="ml-2 text-[10px] font-normal tracking-normal text-stone-400">
                          {group.prompts.length}
                        </span>
                      </h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-1">
                        {group.prompts.map(p => (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => {
                              setInput(p.label);
                              setBrowseAll(false);
                              requestAnimationFrame(() => inputRef.current?.focus());
                            }}
                            className="text-left rounded-lg border border-stone-200 bg-white px-3 py-2 hover:border-stone-300 hover:bg-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-400/40"
                          >
                            <p className="text-[12px] text-stone-700 leading-snug">
                              {p.label}
                            </p>
                          </button>
                        ))}
                      </div>
                    </section>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : (
          /* ── Messages ── */
          <div className="pb-2">
            {messages.map(msg => {
              const isUser = msg.role === 'user';
              const assistantPreview = !isUser ? buildAssistantPreview(msg.content) : null;
              const isExpanded =
                !isUser &&
                (expandedAssistantMessages[msg.id] ||
                  (assistantPreview?.details?.length || 0) < 180);
              const followUpChips =
                !isUser && msg.id === messages[messages.length - 1]?.id
                  ? buildFollowUpChips({
                      intentLens,
                      hasProject: Boolean(contextProfile?.activeProject),
                      assistantContent: msg.content,
                    })
                  : [];

              return (
                <div
                  key={msg.id}
                  className={cn('group px-4 py-3', 'bg-white')}
                  onMouseEnter={() => !isUser && setShowActions(msg.id)}
                  onMouseLeave={() => setShowActions(null)}
                >
                  <div
                    className={cn(
                      'flex gap-2.5 max-w-3xl mx-auto',
                      isUser && 'justify-end pl-10 sm:pl-16'
                    )}
                  >
                    <div
                      className={cn(
                        'w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5',
                        isUser ? 'hidden' : 'bg-[#141413]'
                      )}
                    >
                      {!isUser && (
                        <Sparkles className="w-3 h-3 text-white" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      {isUser ? (
                        <>
                          <div className="flex justify-end">
                            <p className="inline-block max-w-[min(92%,680px)] text-[15px] text-[#2D2C28] leading-relaxed whitespace-pre-wrap mt-0.5 bg-[#F1F1F1] px-4 py-3 rounded-[22px]">
                              {msg.content}
                            </p>
                          </div>
                          {(msg as any).recalledToInput && (
                            <p className="mt-1 text-[10px] font-medium text-[#D97757]">
                              Editing prompt in composer
                            </p>
                          )}
                        </>
                      ) : (
                        <>
                          {assistantPreview?.bottomLine && (
                            <div className="mb-2 rounded-xl border border-[#ECEADF] bg-[#F8F7F3] px-3 py-2">
                              <p className="text-[11px] font-semibold uppercase tracking-wide text-[#8A8880]">
                                Bottom line
                              </p>
                              <p className="mt-1 text-sm text-[#2D2C28] leading-relaxed">
                                {assistantPreview.bottomLine}
                              </p>
                            </div>
                          )}
                          <div
                            className="prose prose-sm prose-zinc max-w-none mt-0.5
                              prose-p:text-zinc-700 prose-p:leading-relaxed prose-p:my-2
                              prose-strong:text-zinc-900
                              prose-code:text-[#C4623F] prose-code:bg-[#FBF0EB] prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-xs prose-code:before:content-none prose-code:after:content-none
                              prose-pre:bg-zinc-900 prose-pre:text-zinc-100 prose-pre:rounded-xl prose-pre:p-3.5 prose-pre:text-xs
                              prose-blockquote:border-l-stone-300 prose-blockquote:text-zinc-600 prose-blockquote:not-italic prose-blockquote:pl-3 prose-blockquote:my-2
                              prose-ul:text-zinc-700 prose-ol:text-zinc-700 prose-ul:my-2 prose-ol:my-2 prose-li:my-1
                              prose-a:text-[#D97757] prose-a:underline prose-a:decoration-[#E8C7BA] prose-a:underline-offset-2 hover:prose-a:text-[#C4623F]
                              [&>*:first-child]:mt-0 [&>*:last-child]:mb-0"
                            dangerouslySetInnerHTML={{
                              __html: renderMarkdown(
                                isExpanded && assistantPreview?.details
                                  ? assistantPreview.details
                                  : msg.content
                              ),
                            }}
                          />
                          {!isExpanded && assistantPreview?.details && (
                            <button
                              type="button"
                              onClick={() =>
                                setExpandedAssistantMessages(prev => ({ ...prev, [msg.id]: true }))
                              }
                              className="mt-1 text-xs font-medium text-[#6B6962] hover:text-[#2D2C28]"
                            >
                              Show details
                            </button>
                          )}
                          {followUpChips.length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {followUpChips.map(chip => (
                                <button
                                  key={chip.id}
                                  type="button"
                                  onClick={() => {
                                    setInput(chip.prompt);
                                    requestAnimationFrame(() => inputRef.current?.focus());
                                  }}
                                  className="inline-flex items-center rounded-full border border-[#E8E6DC] bg-white px-2.5 py-1 text-[11px] font-medium text-[#4D4B45] hover:bg-[#F5F4EF]"
                                >
                                  {chip.label}
                                </button>
                              ))}
                            </div>
                          )}
                          {/* Nano Banana generated images */}
                          {msg.images && msg.images.length > 0 && (
                            <div className="flex flex-wrap gap-2 mt-2">
                              {msg.images.map((img, idx) => (
                                <img
                                  key={idx}
                                  src={`data:${img.mimeType};base64,${img.base64}`}
                                  alt={`Generated image ${idx + 1}`}
                                  className="rounded-lg border border-zinc-200 max-w-sm shadow-sm"
                                />
                              ))}
                            </div>
                          )}
                          {/* AnA 1.0 RI — Verdict & Confidence Signals */}
                          {(() => {
                            const signals = detectVerdictSignals(msg.content);
                            if (signals.length === 0) return null;
                            return (
                              <div className="flex flex-wrap gap-1.5 mt-2">
                                {signals.map((s, i) => (
                                  <span
                                    key={i}
                                    className={cn(
                                      'inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold rounded-full border',
                                      s.color,
                                      s.bgColor
                                    )}
                                  >
                                    {s.type === 'verdict' && (
                                      <span className="w-1.5 h-1.5 rounded-full bg-current opacity-60" />
                                    )}
                                    {s.type === 'priority' && (
                                      <span className="w-1.5 h-1.5 rounded-full bg-current opacity-60" />
                                    )}
                                    {s.type === 'confidence' && (
                                      <span className="w-1.5 h-1.5 rounded-full bg-current opacity-60" />
                                    )}
                                    {s.type === 'action' && <Zap className="w-2.5 h-2.5" />}
                                    {s.label}
                                  </span>
                                ))}
                              </div>
                            );
                          })()}
                          {/* AnA 1.0 RI — Executed Guidance Actions */}
                          {msg.executedActions && msg.executedActions.length > 0 && (
                            <div className="mt-2 space-y-1.5">
                              {msg.executedActions.map((action: any, i: any) => (
                                <div
                                  key={i}
                                  className={cn(
                                    'flex items-center gap-2 px-3 py-2 rounded-lg border text-xs',
                                    action.executed && !action.error
                                      ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                                      : action.error
                                      ? 'bg-red-50 border-red-200 text-red-800'
                                      : 'bg-zinc-50 border-zinc-200 text-zinc-600'
                                  )}
                                >
                                  {action.executed && !action.error ? (
                                    <Check className="w-3.5 h-3.5 flex-shrink-0" />
                                  ) : action.error ? (
                                    <span className="w-3.5 h-3.5 flex-shrink-0 text-red-500">
                                      !
                                    </span>
                                  ) : (
                                    <Zap className="w-3.5 h-3.5 flex-shrink-0" />
                                  )}
                                  <span className="font-medium">
                                    {action.executed
                                      ? `Created ${action.actionType.replace(/_/g, ' ')}`
                                      : action.error
                                      ? `Failed: ${action.error}`
                                      : `Prepared ${action.actionType.replace(/_/g, ' ')} (${
                                          action.confidence
                                        })`}
                                  </span>
                                  {action.artifactId && (
                                    <span className="text-emerald-600 font-mono text-[10px]">
                                      {action.artifactId}
                                    </span>
                                  )}
                                  {action.threadId && (
                                    <span className="text-emerald-600 font-mono text-[10px]">
                                      thread:{action.threadId.slice(0, 8)}
                                    </span>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                          {/* Nano Banana PPTX download button */}
                          {msg.pptx && (
                            <button
                              onClick={() => {
                                const blob = new Blob(
                                  [Uint8Array.from(atob(msg.pptx!.base64), c => c.charCodeAt(0))],
                                  { type: msg.pptx!.mimeType }
                                );
                                const url = URL.createObjectURL(blob);
                                const a = document.createElement('a');
                                a.href = url;
                                a.download = msg.pptx!.filename;
                                a.click();
                                URL.revokeObjectURL(url);
                              }}
                              className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200 transition-colors"
                            >
                              <Download className="w-3.5 h-3.5" />
                              {msg.pptx.filename}
                            </button>
                          )}
                        </>
                      )}
                      {isUser && (
                        <div
                          className={cn(
                            'flex items-center gap-1 mt-1.5 transition-opacity duration-150',
                            showActions === msg.id ? 'opacity-100' : 'opacity-0'
                          )}
                        >
                          <button
                            onClick={() => handleRecallPrompt(msg.id, msg.content)}
                            className="p-1 text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 rounded transition-colors"
                            title="Recall this prompt to edit"
                            aria-label="Recall this prompt to edit"
                          >
                            <RotateCcw className="w-3 h-3" />
                          </button>
                          <button
                            onClick={() => handleCopy(msg.id, msg.content)}
                            className="p-1 text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 rounded transition-colors"
                            title="Copy"
                          >
                            {copiedId === msg.id ? (
                              <Check className="w-3 h-3 text-green-600" />
                            ) : (
                              <Copy className="w-3 h-3" />
                            )}
                          </button>
                          {(msg as any).recalledToInput && (
                            <span className="text-[11px] text-stone-600 font-medium ml-1">
                              Loaded to input
                            </span>
                          )}
                        </div>
                      )}
                      {!isUser && (
                        <div
                          className={cn(
                            'flex items-center gap-1 mt-1.5 transition-opacity duration-150',
                            showActions === msg.id ? 'opacity-100' : 'opacity-0'
                          )}
                        >
                          {/* Degraded mode badge */}
                          {msg.fallback && (
                            <span
                              className="inline-flex items-center gap-1 text-[11px] font-medium px-1.5 py-0.5 rounded mr-1 text-amber-700 bg-amber-50"
                              title="AnA RI was unavailable; this reply used the fallback model without memory or RIM."
                            >
                              <AlertCircle className="w-3 h-3" />
                              Degraded
                            </span>
                          )}
                          {/* Stopped badge */}
                          {msg.stopped && (
                            <span
                              className="inline-flex items-center gap-1 text-[11px] font-medium px-1.5 py-0.5 rounded mr-1 text-zinc-600 bg-zinc-100"
                              title="You stopped generation before AnA finished."
                            >
                              <Square className="w-2.5 h-2.5" fill="currentColor" />
                              Stopped
                            </span>
                          )}
                          {/* Model badge */}
                          {msg.modelProvider && (
                            <span
                              className={cn(
                                'text-[11px] font-medium px-1.5 py-0.5 rounded mr-1',
                                msg.modelProvider === 'anthropic'
                                  ? 'text-[#CC785C] bg-[#FBF0EB]'
                                  : msg.modelProvider === 'openai'
                                  ? 'text-[#10A37F] bg-emerald-50'
                                  : msg.modelProvider === 'moonshot'
                                  ? 'text-[#6366F1] bg-indigo-50'
                                  : 'text-zinc-500 bg-zinc-50'
                              )}
                            >
                              {msg.modelProvider === 'anthropic'
                                ? 'Claude'
                                : msg.modelProvider === 'openai'
                                ? 'GPT-4o'
                                : msg.modelProvider === 'moonshot'
                                ? 'Kimi'
                                : msg.modelProvider}
                            </span>
                          )}
                          {msg.evidenceUsage?.firecrawlRequested && (
                            <span
                              className={cn(
                                'text-[11px] font-medium px-1.5 py-0.5 rounded mr-1',
                                msg.evidenceUsage.firecrawlUsed
                                  ? 'text-[#D97757] bg-[#FBF0EB]'
                                  : 'text-zinc-500 bg-zinc-50'
                              )}
                              title="External evidence usage"
                            >
                              {msg.evidenceUsage.firecrawlUsed
                                ? `Firecrawl used • -${msg.evidenceUsage.quotaConsumed ?? 0}`
                                : 'Firecrawl requested'}
                            </span>
                          )}
                          <button
                            onClick={() => handleCopy(msg.id, msg.content)}
                            className="p-1 text-[#B0AEA5] hover:text-[#4D4B45] hover:bg-[#F5F4EF] rounded transition-colors"
                            title="Copy"
                          >
                            {copiedId === msg.id ? (
                              <Check className="w-3 h-3 text-green-600" />
                            ) : (
                              <Copy className="w-3 h-3" />
                            )}
                          </button>
                          <button
                            onClick={() => {
                              apiRequest('POST', '/api/concept2cure/feedback', {
                                messageId: msg.id,
                                positive: true,
                              }).catch(() => {});
                            }}
                            className="p-1 text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 rounded transition-colors"
                            title="Good"
                          >
                            <ThumbsUp className="w-3 h-3" />
                          </button>
                          <button
                            onClick={() => {
                              apiRequest('POST', '/api/concept2cure/feedback', {
                                messageId: msg.id,
                                positive: false,
                              }).catch(() => {});
                            }}
                            className="p-1 text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 rounded transition-colors"
                            title="Bad"
                          >
                            <ThumbsDown className="w-3 h-3" />
                          </button>
                          {/* Save to Vault — persist AI response as a governed artifact */}
                          {contextProfile?.projectId &&
                            msg.content.length > 100 &&
                            !msg.savedAsArtifact && (
                              <button
                                onClick={async () => {
                                  const numProjId = String(contextProfile.projectId).replace(
                                    /^proj_/,
                                    ''
                                  );
                                  try {
                                    const saveRes = await apiRequest(
                                      'POST',
                                      `/api/concept2cure/projects/${numProjId}/artifacts`,
                                      {
                                        title: `AnA Response — ${
                                          new Date().toISOString().split('T')[0]
                                        }`,
                                        content: msg.content,
                                        type: 'document_section',
                                        category: 'document',
                                      }
                                    );
                                    if (saveRes.ok) {
                                      setMessages(prev =>
                                        prev.map(m =>
                                          m.id === msg.id ? { ...m, savedAsArtifact: true } : m
                                        )
                                      );
                                    }
                                  } catch {
                                    /* non-blocking */
                                  }
                                }}
                                className="p-1 text-zinc-400 hover:text-emerald-600 hover:bg-emerald-50 rounded transition-colors"
                                title="Save to Vault"
                              >
                                <Download className="w-3 h-3" />
                              </button>
                            )}
                          {/* Insert into Editor — when onDraftInsert is available and content is substantial */}
                          {onDraftInsert &&
                            contextProfile?.projectId &&
                            msg.content.length > 100 &&
                            authoringContext?.sectionCode && (
                              <button
                                onClick={() => {
                                  // Extract draft content: try code block, then content after "---", then strip markdown metadata
                                  let insertContent = msg.content;
                                  const codeBlockMatch = msg.content.match(
                                    /```(?:\w+)?\n([\s\S]*?)```/
                                  );
                                  if (codeBlockMatch && codeBlockMatch[1].trim().length > 50) {
                                    insertContent = codeBlockMatch[1].trim();
                                  } else {
                                    // Strip markdown headers that look like meta commentary (not section content)
                                    insertContent = insertContent
                                      .replace(/^\*\*[A-Z][^*]+\*\*\s*[-—]\s*/gm, '') // "**Draft Ready** —" prefix
                                      .replace(
                                        /^#{1,3}\s+(?:Draft|Note|Summary|Action)\b[^\n]*/gm,
                                        ''
                                      ) // Meta headers
                                      .trim();
                                  }
                                  // Wrap in HTML paragraphs for TipTap consumption
                                  if (!insertContent.startsWith('<')) {
                                    insertContent = insertContent
                                      .split('\n\n')
                                      .filter(p => p.trim())
                                      .map(p => `<p>${p.trim()}</p>`)
                                      .join('\n');
                                  }
                                  const title = authoringContext.sectionTitle
                                    ? `${authoringContext.sectionCode} — ${authoringContext.sectionTitle}`
                                    : `Section ${authoringContext.sectionCode} Draft`;
                                  onDraftInsert(insertContent, title, authoringContext.sectionCode);
                                  setMessages(prev =>
                                    prev.map(m =>
                                      m.id === msg.id ? { ...m, insertedToEditor: true } : m
                                    )
                                  );
                                }}
                                className="p-1 text-zinc-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                                title="Insert into Editor"
                              >
                                <FileEdit className="w-3 h-3" />
                              </button>
                            )}
                          {(msg as any).insertedToEditor && (
                            <span className="text-[11px] text-blue-600 font-medium ml-1">
                              Inserted
                            </span>
                          )}
                          {msg.savedAsArtifact && (
                            <span className="text-[11px] text-emerald-600 font-medium ml-1">
                              Saved
                            </span>
                          )}
                        </div>
                      )}
                      {/* AnA RI Document Action Row — shown on the last assistant message */}
                      {!isUser &&
                        msg.id === messages.filter(m => m.role === 'assistant').at(-1)?.id &&
                        lastOrchestration && (
                          <div className="mt-3 pt-3 border-t border-[#F5F4EF]">
                            <p className="text-[10px] font-medium text-[#B0AEA5] uppercase tracking-wide mb-2">
                              Document Actions
                            </p>
                            <div className="flex flex-wrap gap-1.5">
                              {DOCUMENT_ACTION_CONFIGS.filter(
                                a =>
                                  !lastOrchestration.suggestedActions.length ||
                                  lastOrchestration.suggestedActions.includes(a.type) ||
                                  ['revised_artifact', 'attach_to_dossier'].includes(a.type)
                              )
                                .slice(0, 5)
                                .map(action => (
                                  <button
                                    key={action.type}
                                    disabled={isThinking}
                                    onClick={async () => {
                                      if (isThinking) return;
                                      if (!contextProfile?.projectId) {
                                        setMessages(prev => [
                                          ...prev,
                                          {
                                            id: `a-${Date.now()}`,
                                            role: 'assistant',
                                            content: `**Cannot create artifact** — No project selected. Please open a project first, then try again.`,
                                            timestamp: new Date(),
                                          },
                                        ]);
                                        return;
                                      }
                                      queue.startTurn();
                                      try {
                                        const res = await apiRequest(
                                          'POST',
                                          '/api/ana-ri/generate',
                                          {
                                            action_type: action.type,
                                            conversation_context: messages.slice(-20).map(m => ({
                                              role: m.role,
                                              content: m.content,
                                            })),
                                            project_id: contextProfile.projectId,
                                            user_role: contextProfile?.userRole || undefined,
                                            intent_lens:
                                              intentLens !== 'auto' ? intentLens : undefined,
                                          }
                                        );
                                        if (res.ok) {
                                          const data = await res.json();
                                          let statusLine = '';
                                          if (data.artifactId) {
                                            statusLine = `\n\n---\n**${
                                              action.label
                                            } created** | Artifact #${data.artifactId} | Quality: ${
                                              data.qualityGrade || 'draft'
                                            } | ${data.isNew ? 'New' : 'Updated'}`;
                                          } else if (data.persisted === false) {
                                            statusLine =
                                              '\n\n---\n**Warning:** Content generated but could not be saved to project. Please copy this content.';
                                          }
                                          setMessages(prev => [
                                            ...prev,
                                            {
                                              id: `a-${Date.now()}`,
                                              role: 'assistant',
                                              content: data.content + statusLine,
                                              timestamp: new Date(),
                                            },
                                          ]);
                                          queue.completeTurn();
                                        } else {
                                          // Fallback: send as chat prompt (handleSend manages queue)
                                          handleSend(
                                            `Please generate a ${action.label.toLowerCase()} based on our conversation above.`
                                          );
                                        }
                                      } catch {
                                        // Fallback: send as chat prompt (handleSend manages queue)
                                        handleSend(
                                          `Please generate a ${action.label.toLowerCase()} based on our conversation above.`
                                        );
                                      }
                                    }}
                                    className={cn(
                                      'inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-colors',
                                      isThinking
                                        ? 'border-[#E8E6DC] text-[#D8D5CA] cursor-not-allowed'
                                        : 'border-[#E8E6DC] text-[#6B6962] hover:bg-[#FAF9F5] hover:border-[#D8D5CA] hover:text-[#4D4B45]'
                                    )}
                                  >
                                    {action.icon}
                                    {action.label}
                                  </button>
                                ))}
                            </div>
                            {lastOrchestration.detectedSubmissionType && (
                              <p className="text-[10px] text-[#B0AEA5] mt-2">
                                Detected: {lastOrchestration.detectedSubmissionType.toUpperCase()}{' '}
                                submission
                                {lastOrchestration.detectedIntent.lens !== 'auto' &&
                                  ` | ${lastOrchestration.detectedIntent.lens} lens`}
                              </p>
                            )}
                            {lastOrchestration.activeWorkstream && (
                              <div className="mt-2 rounded-lg border border-[#E8E6DC] bg-[#FAF9F5] px-3 py-2">
                                <p className="text-[10px] font-medium text-[#8A877D] uppercase tracking-wide">
                                  Active Workstream
                                </p>
                                <p className="mt-1 text-[12px] text-[#4D4B45]">
                                  <span className="font-medium">
                                    {lastOrchestration.activeWorkstream.stream.replace(/_/g, ' ')}
                                  </span>
                                  {' · '}
                                  {lastOrchestration.activeWorkstream.phase}
                                  {lastOrchestration.activeWorkstream.collaborationMode && (
                                    <>
                                      {' · '}
                                      {lastOrchestration.activeWorkstream.collaborationMode}
                                    </>
                                  )}
                                </p>
                                {lastOrchestration.activeWorkstream.currentFocus && (
                                  <p className="mt-1 text-[11px] text-[#6B6962]">
                                    Focus: {lastOrchestration.activeWorkstream.currentFocus}
                                  </p>
                                )}
                                {lastOrchestration.activeWorkstream.nextStep && (
                                  <p className="mt-1 text-[11px] text-[#6B6962]">
                                    Next: {lastOrchestration.activeWorkstream.nextStep}
                                  </p>
                                )}
                                {lastOrchestration.activeWorkstream.blockers &&
                                  lastOrchestration.activeWorkstream.blockers.length > 0 && (
                                    <p className="mt-1 text-[11px] text-[#8A877D]">
                                      Blockers:{' '}
                                      {lastOrchestration.activeWorkstream.blockers.join(' | ')}
                                    </p>
                                  )}
                              </div>
                            )}
                            {lastOrchestration.workstreamHandoff && (
                              <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                                <p className="text-[10px] font-medium text-amber-700 uppercase tracking-wide">
                                  Workstream Handoff
                                </p>
                                <p className="mt-1 text-[11px] text-amber-900">
                                  {lastOrchestration.workstreamHandoff.from.replace(/_/g, ' ')} to{' '}
                                  {lastOrchestration.workstreamHandoff.to.replace(/_/g, ' ')}
                                </p>
                                <p className="mt-1 text-[11px] text-amber-800">
                                  {lastOrchestration.workstreamHandoff.transitionReason}
                                </p>
                                {lastOrchestration.workstreamHandoff.openLoops.length > 0 && (
                                  <p className="mt-1 text-[11px] text-amber-800">
                                    Open loops:{' '}
                                    {lastOrchestration.workstreamHandoff.openLoops.join(' | ')}
                                  </p>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Thinking indicator */}
            {isThinking && (
              <div className="px-4 py-3 bg-white">
                <div className="flex gap-2.5 max-w-3xl mx-auto">
                  <div className="w-6 h-6 rounded-full bg-[#D97757] flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Sparkles className="w-3 h-3 text-white" />
                  </div>
                  <div>
                    <span className="text-xs font-semibold text-[#2D2C28]">AnA</span>
                    <div className="flex items-center gap-2 mt-1">
                      <div className="flex items-center gap-1">
                        <div className="w-1.5 h-1.5 rounded-full bg-[#E8967A] animate-[pulse_1.4s_ease-in-out_infinite]" />
                        <div className="w-1.5 h-1.5 rounded-full bg-[#E8967A] animate-[pulse_1.4s_ease-in-out_0.2s_infinite]" />
                        <div className="w-1.5 h-1.5 rounded-full bg-[#E8967A] animate-[pulse_1.4s_ease-in-out_0.4s_infinite]" />
                      </div>
                      <span className="text-xs text-[#D97757] font-medium">
                        {thinkingMsg || 'Thinking...'}
                      </span>
                    </div>
                    <p className="mt-1 text-[11px] text-[#8A8880]">
                      {THINKING_STATUS_PHASES[statusPhaseIndex]}
                    </p>
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {showJumpToLatest && hasMessages && (
        <div className="flex justify-center py-2 border-t border-[#F5F4EF] bg-white/95 backdrop-blur-sm">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={summarizeRecentTurns}
              className="inline-flex items-center rounded-full border border-[#E8E6DC] bg-white px-3 py-1.5 text-xs font-medium text-[#6B6962] hover:bg-[#F5F4EF]"
            >
              Summarize last 10 turns
            </button>
            <button
              type="button"
              onClick={scrollToLatest}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium text-[#4D4B45] bg-[#F5F4EF] border border-[#E8E6DC] hover:bg-[#ECEADF] transition-colors"
            >
              <ArrowDown className="w-3.5 h-3.5" />
              Jump to latest
            </button>
          </div>
        </div>
      )}

      {/* ── Bottom input bar — always visible ── */}
      <div className="flex-shrink-0 px-4 py-3 border-t border-[#F5F4EF] bg-white">
        <div
          className={cn(
            'max-w-3xl mx-auto relative',
            !hasMessages && 'max-w-3xl'
          )}
        >
          {/* Clear conversation button */}
          {hasMessages && (
            <div className="flex justify-center mb-2">
              <button
                onClick={() => {
                  setMessages([]);
                  threadIdRef.current = null;
                  // Keep selection state in sync with cleared local thread context.
                  onThreadChange?.(undefined);
                }}
                className="flex items-center gap-1.5 px-3 py-1 text-xs text-[#B0AEA5] hover:text-[#6B6962] hover:bg-[#F5F4EF] rounded-full transition-colors"
              >
                <RotateCcw className="w-3 h-3" />
                New thread
              </button>
            </div>
          )}

          {/* Slash command autocomplete dropdown (full mode) */}
          {slashMenuOpen && filteredSlashCommands.length > 0 && (
            <div
              ref={slashMenuRef}
              className="absolute bottom-full left-0 right-0 mb-2 bg-white rounded-xl border border-[#E8E6DC] shadow-lg max-h-[280px] overflow-y-auto z-50"
              role="listbox"
              aria-label="Slash commands"
            >
              {filteredSlashCommands.map((cmd, i) => (
                <button
                  key={cmd.command}
                  type="button"
                  role="option"
                  aria-selected={i === slashMenuIndex}
                  onMouseDown={e => {
                    e.preventDefault();
                    selectSlashCommand(cmd);
                  }}
                  onMouseEnter={() => setSlashMenuIndex(i)}
                  className={cn(
                    'w-full flex items-center gap-3 px-3.5 py-2 text-left transition-colors',
                    i === slashMenuIndex ? 'bg-[#FAF9F5]' : 'hover:bg-[#FAF9F5]/50'
                  )}
                >
                  <code className="text-xs font-mono font-semibold text-[#141413] min-w-[100px]">
                    {cmd.command}
                  </code>
                  <span className="text-xs text-[#6B6962] flex-1 truncate">{cmd.description}</span>
                  <span
                    className={cn(
                      'text-[10px] font-medium',
                      SLASH_CATEGORY_COLORS[cmd.category] || 'text-zinc-400'
                    )}
                  >
                    {cmd.category}
                  </span>
                </button>
              ))}
            </div>
          )}

          <div
            className={cn(
              'flex items-end gap-2 px-4 py-3 bg-white border rounded-[28px] transition-colors duration-150 shadow-sm',
              isFocused
                ? 'border-[#D8D5CA] ring-2 ring-[#F5F4EF] bg-white'
                : 'border-[#E8E6DC] hover:border-[#D8D5CA]'
            )}
          >
            {/* Mode selector — Claude.ai model-picker style */}
            <div className="relative flex-shrink-0 self-center" ref={modeDropdownRef}>
              <button
                type="button"
                onClick={() => setShowModeDropdown(prev => !prev)}
                className={cn(
                  'flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium transition-colors',
                  chatMode === 'deep-research'
                    ? 'bg-[#FBF0EB] text-[#D97757] hover:bg-[#F6E6DF]'
                    : chatMode === 'nano-banana'
                    ? 'bg-amber-50 text-amber-700 hover:bg-amber-100'
                    : 'text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700'
                )}
              >
                {chatMode === 'deep-research' ? (
                  <Zap className="w-3.5 h-3.5" />
                ) : chatMode === 'nano-banana' ? (
                  <ImageIcon className="w-3.5 h-3.5" />
                ) : (
                  <Sparkles className="w-3.5 h-3.5" />
                )}
                <span className="hidden sm:inline">
                  {chatMode === 'deep-research'
                    ? 'Deep Research'
                    : chatMode === 'nano-banana'
                    ? 'Nano Banana'
                    : 'AnA'}
                </span>
                <ChevronDown className="w-3 h-3 opacity-50" />
              </button>

              {showModeDropdown && (
                <div className="absolute bottom-full left-0 mb-1.5 w-56 bg-white rounded-xl border border-[#E8E6DC] shadow-lg py-1 z-50">
                  <button
                    type="button"
                    onClick={() => {
                      setChatMode('standard');
                      setIntentLens('auto');
                      setShowModeDropdown(false);
                    }}
                    className={cn(
                      'w-full flex items-start gap-3 px-3 py-2.5 text-left hover:bg-[#FAF9F5] transition-colors',
                      chatMode === 'standard' && 'bg-[#FAF9F5]'
                    )}
                  >
                    <MessageSquare className="w-4 h-4 mt-0.5 text-[#8A8880] flex-shrink-0" />
                    <div>
                      <div className="text-sm font-medium text-[#141413]">AnA</div>
                      <div className="text-[11px] text-[#B0AEA5] leading-tight">
                        Fast regulatory co-pilot for everyday questions
                      </div>
                    </div>
                    {chatMode === 'standard' && (
                      <Check className="w-4 h-4 text-[#D97757] ml-auto mt-0.5 flex-shrink-0" />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setChatMode('deep-research');
                      setShowModeDropdown(false);
                    }}
                    className={cn(
                      'w-full flex items-start gap-3 px-3 py-2.5 text-left hover:bg-[#FAF9F5] transition-colors',
                      chatMode === 'deep-research' && 'bg-[#FBF0EB]'
                    )}
                  >
                    <Zap className="w-4 h-4 mt-0.5 text-[#D97757] flex-shrink-0" />
                    <div>
                      <div className="text-sm font-medium text-[#141413]">Deep Research</div>
                      <div className="text-[11px] text-[#B0AEA5] leading-tight">
                        Multi-source search across ClinicalTrials.gov, PubMed, FDA &amp; more
                      </div>
                    </div>
                    {chatMode === 'deep-research' && (
                      <Check className="w-4 h-4 text-[#D97757] ml-auto mt-0.5 flex-shrink-0" />
                    )}
                  </button>
                  <div className="mx-2 my-0.5 border-t border-zinc-100" />
                  <button
                    type="button"
                    onClick={() => {
                      setChatMode('nano-banana');
                      setShowModeDropdown(false);
                    }}
                    className={cn(
                      'w-full flex items-start gap-3 px-3 py-2.5 text-left hover:bg-zinc-50 transition-colors',
                      chatMode === 'nano-banana' && 'bg-amber-50'
                    )}
                  >
                    <ImageIcon className="w-4 h-4 mt-0.5 text-amber-600 flex-shrink-0" />
                    <div>
                      <div className="text-sm font-medium text-zinc-900">Nano Banana</div>
                      <div className="text-[11px] text-zinc-400 leading-tight">
                        AI image generation, presentations &amp; visual design via Gemini
                      </div>
                    </div>
                    {chatMode === 'nano-banana' && (
                      <Check className="w-4 h-4 text-amber-600 ml-auto mt-0.5 flex-shrink-0" />
                    )}
                  </button>
                </div>
              )}
            </div>

            {/* External tool selector (+) */}
            <div className="relative flex-shrink-0 self-center" ref={toolsDropdownRef}>
              <button
                type="button"
                onClick={() => setShowToolDropdown(prev => !prev)}
                className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium text-[#B0AEA5] hover:bg-[#F5F4EF] hover:text-[#6B6962]"
                title="Add tools"
              >
                <FolderPlus className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Tools</span>
              </button>
              {showToolDropdown && (
                <div className="absolute bottom-full left-0 mb-1.5 w-64 bg-white rounded-xl border border-[#E8E6DC] shadow-lg py-1 z-50">
                  <button
                    type="button"
                    onClick={() => {
                      if (firecrawlDisabledReason) return;
                      setUseFirecrawl(v => !v);
                      setShowToolDropdown(false);
                    }}
                    className={cn(
                      'w-full flex items-start gap-3 px-3 py-2 text-left transition-colors',
                      firecrawlDisabledReason
                        ? 'opacity-60 cursor-not-allowed'
                        : 'hover:bg-[#FAF9F5]',
                      useFirecrawl && 'bg-[#FAF9F5]'
                    )}
                  >
                    <Search className="w-4 h-4 mt-0.5 text-[#D97757] flex-shrink-0" />
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-[#141413]">Use Firecrawl</div>
                      <div className="text-[10px] text-[#8A8880] leading-tight">
                        {firecrawlDisabledReason === 'quota_exhausted'
                          ? 'On but quota exhausted'
                          : firecrawlDisabledReason === 'admin_disabled'
                          ? 'On but admin-disabled for workspace'
                          : firecrawlQuotaRemaining !== null
                          ? `Optional open-web evidence (${firecrawlQuotaRemaining} free remaining)`
                          : 'Optional governed open-web evidence'}
                      </div>
                    </div>
                    {useFirecrawl && <Check className="w-4 h-4 text-[#D97757] ml-auto mt-0.5" />}
                  </button>
                </div>
              )}
            </div>

            {/* AI Provider / Model Selector — clean, minimal like Claude.ai */}
            <div className="relative flex-shrink-0 self-center" ref={providerDropdownRef}>
              <button
                type="button"
                onClick={() => setShowProviderDropdown(prev => !prev)}
                className={cn(
                  'flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium transition-colors',
                  selectedProvider !== 'auto'
                    ? `bg-[#F5F4EF] ${
                        AI_PROVIDERS.find(p => p.id === selectedProvider)?.activeColor ||
                        'text-[#D97757]'
                      } hover:bg-[#EDEAE0]`
                    : 'text-[#B0AEA5] hover:bg-[#F5F4EF] hover:text-[#6B6962]'
                )}
                title="Select AI model"
              >
                <Bot className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">
                  {AI_PROVIDERS.find(p => p.id === selectedProvider)?.label}
                </span>
                <ChevronDown className="w-3 h-3 opacity-50" />
              </button>

              {showProviderDropdown && (
                <div className="absolute bottom-full left-0 mb-1.5 w-52 bg-white rounded-xl border border-[#E8E6DC] shadow-lg py-1 z-50">
                  {AI_PROVIDERS.map(prov => (
                    <button
                      key={prov.id}
                      type="button"
                      onClick={() => {
                        setSelectedProvider(prov.id);
                        setShowProviderDropdown(false);
                      }}
                      className={cn(
                        'w-full flex items-start gap-3 px-3 py-2 text-left hover:bg-[#FAF9F5] transition-colors',
                        selectedProvider === prov.id && 'bg-[#FAF9F5]'
                      )}
                    >
                      <span
                        className={cn(
                          'mt-0.5 flex-shrink-0',
                          selectedProvider === prov.id ? prov.activeColor : prov.color
                        )}
                      >
                        <Bot className="w-3.5 h-3.5" />
                      </span>
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-[#141413]">{prov.label}</div>
                        <div className="text-[10px] text-[#B0AEA5] leading-tight">
                          {prov.description}
                        </div>
                      </div>
                      {selectedProvider === prov.id && (
                        <Check
                          className={cn('w-4 h-4 ml-auto mt-0.5 flex-shrink-0', prov.activeColor)}
                        />
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Input */}
            {/* Queue Status Banner */}
            {conversationQueue.length > 0 && (
              <div className="flex items-center gap-2 px-3 py-1.5 bg-stone-50 border-t border-stone-100 text-[11px] text-stone-500">
                {activeQueueItemId && <span className="text-amber-600">● Working</span>}
                {conversationQueue.filter(i => i.status === 'queued').length > 0 && (
                  <span>Queued: {conversationQueue.filter(i => i.status === 'queued').length}</span>
                )}
                <button
                  onClick={() => setConversationQueue([])}
                  className="ml-auto text-stone-400 hover:text-stone-600"
                >
                  Clear
                </button>
              </div>
            )}
            <textarea
              ref={inputRef}
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              onFocus={() => setIsFocused(true)}
              onBlur={() => {
                setIsFocused(false);
                setTimeout(() => setSlashMenuOpen(false), 150);
              }}
              placeholder={
                chatMode === 'deep-research'
                  ? 'Ask a deep research question...'
                  : chatMode === 'nano-banana'
                  ? 'Describe an image, infographic, or presentation...'
                  : intentLens !== 'auto'
                  ? `Message AnA (${intentLens} lens)...`
                  : 'Ask AnA a question or make a regulatory request...'
              }
              rows={1}
              className="flex-1 resize-none bg-transparent border-none outline-none text-[#141413] placeholder:text-[#B0AEA5] text-sm leading-6 min-h-[24px] max-h-[120px]"
            />

            {/* Send / Stop */}
            {isThinking ? (
              <button
                onClick={handleStop}
                className="flex-shrink-0 p-2 rounded-full bg-[#141413] text-white hover:bg-[#2D2C28] transition-colors duration-150"
                aria-label="Stop generating"
                title="Stop generating"
              >
                <Square className="w-3.5 h-3.5" fill="currentColor" />
              </button>
            ) : (
              <button
                onClick={() => handleSend()}
                disabled={!input.trim()}
                className={cn(
                  'flex-shrink-0 p-2 rounded-full transition-colors duration-150',
                  input.trim()
                    ? 'bg-[#141413] text-white hover:bg-[#2D2C28]'
                    : 'bg-[#E8E6DC] text-[#B0AEA5] cursor-not-allowed'
                )}
                aria-label="Send message"
              >
                <ArrowUp className="w-4 h-4" />
              </button>
            )}
          </div>

          {useFirecrawl && (
            <div className="mt-1.5 pl-1">
              <button
                type="button"
                onClick={() => setUseFirecrawl(false)}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-[#FBF0EB] text-[#D97757] hover:bg-[#F6E6DF]"
                title="Disable Firecrawl for this message"
              >
                Firecrawl On
              </button>
            </div>
          )}

          {/* ── Intent lens strip — subtle pills below input (Claude.ai clean) ── */}
          {chatMode === 'standard' && hasMessages && (
            <div className="flex items-center gap-1.5 mt-1.5 pl-1" ref={lensDropdownRef}>
              {INTENT_LENSES.map(lens => (
                <button
                  key={lens.id}
                  type="button"
                  onClick={() => setIntentLens(lens.id)}
                  className={cn(
                    'flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium transition-colors',
                    intentLens === lens.id
                      ? 'bg-[#FBF0EB] text-[#D97757]'
                      : 'text-[#B0AEA5] hover:bg-[#F5F4EF] hover:text-[#6B6962]'
                  )}
                  title={lens.description}
                >
                  {lens.icon}
                  <span className="hidden sm:inline">{lens.label}</span>
                </button>
              ))}
            </div>
          )}
          {hasMessages && (
            <p className="mt-1.5 pl-1 text-[11px] text-[#B0AEA5]">
              Type <span className="font-semibold text-[#6B6962]">/</span> for commands. Use{' '}
              <span className="font-semibold text-[#6B6962]">↑</span> on an empty input to recall your
              last prompt.
              {onNavigate ? (
                <>
                  {' '}
                  <button
                    type="button"
                    onClick={() => onNavigate('apps')}
                    className="font-semibold text-[#6B6962] underline decoration-[#D8D5CA] underline-offset-2 hover:text-[#4D4B45]"
                  >
                    Browse all capabilities
                  </button>
                  .
                </>
              ) : null}
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default AnaPersistentPanel;
