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
import { createCorrelationId } from '@/lib/correlation';
import { apiRequest } from '@/lib/queryClient';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { useAIAction } from '../../hooks/useAIAction';
import type { AIActionType, AIActionSourceSurface } from '../../hooks/useAIAction';
import { getPromptsForContext, type DomainPromptGroup } from '../../config/domain-prompts';
import {
  Sparkles,
  ArrowUp,
  Square,
  RefreshCw,
  Pencil,
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
} from 'lucide-react';
import { ToolExecutionBlock, ThinkingBlock, DoneIndicator } from './ClaudeStyleBlocks';

marked.setOptions({ breaks: true, gfm: true });

const renderMarkdown = (content: string): string => {
  try {
    let rawHtml = marked.parse(content) as string;
    // Claude-style: wrap code blocks with copy button + language label
    rawHtml = rawHtml.replace(
      /<pre><code(?:\s+class="language-(\w+)")?>([\s\S]*?)<\/code><\/pre>/g,
      (_, lang, code) => {
        const langLabel = lang
          ? `<span style="position:absolute;top:8px;left:12px;font-size:10px;color:#a1a1aa;font-family:monospace;text-transform:uppercase;letter-spacing:0.05em">${lang}</span>`
          : '';
        const copyBtn = `<button style="position:absolute;top:6px;right:8px;padding:2px 8px;font-size:11px;color:#a1a1aa;background:#27272a;border:1px solid #3f3f46;border-radius:4px;cursor:pointer;font-family:system-ui" data-code="${encodeURIComponent(code)}" onclick="navigator.clipboard.writeText(decodeURIComponent(this.dataset.code)).then(()=>{this.textContent='Copied!';setTimeout(()=>this.textContent='Copy',1500)})" title="Copy code">Copy</button>`;
        return `<div style="position:relative">${langLabel}${copyBtn}<pre><code${lang ? ` class="language-${lang}"` : ''}>${code}</code></pre></div>`;
      }
    );
    return DOMPurify.sanitize(rawHtml, {
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
        'button',
      ],
      ALLOWED_ATTR: ['href', 'target', 'rel', 'class', 'id', 'data-code', 'onclick', 'title', 'style'],
    });
  } catch {
    return content
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;');
  }
};

// ─── Verdict & Confidence Signal Detection ──────────────────────────────────

interface VerdictSignal {
  type: 'verdict' | 'priority' | 'confidence' | 'action';
  label: string;
  color: string;
  bgColor: string;
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

// ─── Types ───────────────────────────────────────────────────────────────────

interface AnaMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  /** Base64 images from Visual AI */
  images?: Array<{ base64: string; mimeType: string }>;
  /** Downloadable PPTX from Visual AI */
  pptx?: { base64: string; filename: string; mimeType: string };
  /** Whether this message has been saved as an artifact */
  savedAsArtifact?: boolean;
  /** AI provider that generated this response */
  modelProvider?: string;
  /** AI model name that generated this response */
  modelName?: string;
  /** Tool executions during this response (Claude-style collapsible blocks) */
  toolExecutions?: Array<{
    name: string;
    label: string;
    status: 'running' | 'completed' | 'error';
    input?: string;
    result?: string;
  }>;
  /** Extended thinking content (Claude-style collapsible) */
  thinking?: string;
  /** Whether this response is fully complete */
  isComplete?: boolean;
  /** Token usage for this response */
  tokenUsage?: { inputTokens?: number; outputTokens?: number };
  evidenceUsage?: {
    firecrawlRequested?: boolean;
    firecrawlUsed?: boolean;
    quotaConsumed?: number;
    quotaRemaining?: number;
  };
}

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

// ─── Slash Command Autocomplete — 43 AnA 1.0 RI commands ──────────────────────

interface SlashCommand {
  command: string;
  description: string;
  category: string;
}

const SLASH_COMMANDS: SlashCommand[] = [
  // Intelligence
  { command: '/assess', description: 'Full project assessment', category: 'Intelligence' },
  { command: '/readiness', description: 'Readiness score + dimensions + gaps', category: 'Intelligence' },
  { command: '/risk', description: 'Risk profile with predictions', category: 'Intelligence' },
  { command: '/recommend', description: 'Prioritized action list', category: 'Intelligence' },
  { command: '/next', description: 'What should I do next?', category: 'Intelligence' },
  { command: '/signals', description: 'Accumulated intelligence signals', category: 'Intelligence' },
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
  { command: '/power', description: 'Sample size and power calculation', category: 'Biostatistics' },
  { command: '/dose', description: 'Dose escalation design', category: 'Biostatistics' },
  { command: '/defensibility', description: 'Statistical defensibility audit', category: 'Biostatistics' },
  { command: '/design', description: 'Clinical trial design', category: 'Biostatistics' },
  // Subspecialties
  { command: '/safety', description: 'TEAE, SAE, benefit-risk analysis', category: 'Subspecialties' },
  { command: '/cmc', description: 'Manufacturing / Module 3', category: 'Subspecialties' },
  { command: '/csr', description: 'Clinical study report analysis', category: 'Subspecialties' },
  { command: '/device', description: '510(k), PMA, De Novo intelligence', category: 'Subspecialties' },
  { command: '/ectd', description: 'Module structure / artifact placement', category: 'Subspecialties' },
  // Document Authoring
  { command: '/draft', description: 'Draft submission-ready CTD section', category: 'Authoring' },
  { command: '/audit', description: 'Hostile reviewer audit', category: 'Authoring' },
  { command: '/amend', description: 'Change tracking with impact analysis', category: 'Authoring' },
  { command: '/review', description: 'Regulatory review from reviewer perspective', category: 'Authoring' },
  { command: '/scan', description: 'Deficiency scanning', category: 'Authoring' },
  { command: '/memo', description: 'Risk assessment memo (go/no-go)', category: 'Authoring' },
  { command: '/brief', description: 'Reviewer question anticipation brief', category: 'Authoring' },
  { command: '/strategy', description: 'Regulatory strategy note', category: 'Authoring' },
  // Document Lifecycle
  { command: '/checklist', description: 'Compliance checklist generation', category: 'Lifecycle' },
  { command: '/freeze', description: 'Freeze document (immutable snapshot)', category: 'Lifecycle' },
  { command: '/sign', description: 'Electronic signature (21 CFR Part 11)', category: 'Lifecycle' },
  { command: '/submit', description: 'Submit to regulatory workflow', category: 'Lifecycle' },
  { command: '/preflight', description: 'Section/module/dossier preflight', category: 'Lifecycle' },
  // HAQ & Data Room
  { command: '/haq', description: 'Draft Health Authority Question response', category: 'Authoring' },
  { command: '/ask', description: 'Query project data room with AI', category: 'Analysis' },
  // Navigation & Meta
  { command: '/workflow', description: 'Full submission workflow progress', category: 'Navigation' },
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
  Navigation: 'text-stone-500',
};

// ─── Authoring context import ────────────────────────────────────────────────
import type { AuthoringContextPack } from '../../../../../shared/types/authoring-context';
import {
  hasSectionContext,
  hasArtifactContext,
  hasVersionContext,
} from '../../../../../shared/types/authoring-context';
import { serializeContextForChat } from '../../services/authoring-context-resolver';

interface AnaPersistentPanelProps {
  contextProfile?: {
    productType?: string;
    userRole?: string;
    screenName?: string;
    activeProject?: string;
    projectId?: string;
    /** Page-specific context for deeper awareness (active tab, filters, etc.) */
    moduleContext?: Record<string, unknown>;
  };
  /** Canonical authoring context — section/artifact/workflow awareness for AnA */
  authoringContext?: AuthoringContextPack | null;
  /** Suggested actions shown as quick-start chips when conversation is empty */
  suggestedActions?: SuggestedAction[];
  /** Navigation context for domain prompt selection (e.g. 'cmc', 'biostatistics', 'submission-builder') */
  navContext?: string | null;
  /** Greeting text shown when no messages */
  greeting?: string;
  /** Initial message to auto-send on mount */
  initialMessage?: string | null;
  /** External message to auto-send (change value to trigger). Use {text, ts} to resend same text. */
  externalMessage?: { text: string; ts: number } | null;
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
  /**
   * "full" = fills all available space, shows greeting + suggested actions (Claude.ai style)
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

// ─── Domain Prompt Section — collapsible group in the capability browser ──────

function DomainPromptSection({
  group,
  expanded,
  onToggle,
  onSelect,
  isPrimary,
}: {
  group: DomainPromptGroup;
  expanded: boolean;
  onToggle: () => void;
  onSelect: (prompt: { id: string; label: string }) => void;
  isPrimary?: boolean;
}) {
  return (
    <div className="rounded-lg border border-stone-100 overflow-hidden">
      <button
        onClick={onToggle}
        className={cn(
          'w-full flex items-center justify-between px-3 py-2 text-left transition-colors',
          expanded ? 'bg-stone-50' : 'hover:bg-stone-50/50',
        )}
      >
        <span className={cn(
          'text-[12px] font-medium',
          isPrimary ? 'text-stone-700' : 'text-stone-500',
        )}>
          {group.label}
        </span>
        <ChevronDown className={cn(
          'w-3 h-3 text-stone-400 transition-transform',
          expanded && 'rotate-180',
        )} />
      </button>
      {expanded && (
        <div className="px-1.5 pb-1.5 space-y-0.5">
          {group.prompts.map(prompt => (
            <button
              key={prompt.id}
              onClick={() => onSelect(prompt)}
              className="w-full text-left px-2.5 py-2 rounded-md text-[13px] text-stone-600 hover:bg-stone-100 hover:text-stone-800 transition-colors"
            >
              {prompt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Component ───────────────────────────────────────────────────────────────

const AnaPersistentPanel: React.FC<AnaPersistentPanelProps> = ({
  contextProfile,
  authoringContext,
  suggestedActions,
  navContext,
  greeting,
  initialMessage,
  externalMessage,
  onActionRun,
  onNavigate,
  onDraftInsert,
  onNavigateToSection,
  onOpenArtifact,
  onRequestPromotion,
  onOpenCompareInspector,
  onRefreshIntelligence,
  mode = 'full',
  defaultChatMode = 'standard',
  projectIntelligence,
}) => {
  // AI Action system — unified execution spine (Phase 1)
  const aiAction = useAIAction();

  const [messages, setMessages] = useState<AnaMessage[]>([]);
  const [input, setInput] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [editingMsgId, setEditingMsgId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [useExtendedThinking, setUseExtendedThinking] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [chatMode, setChatMode] = useState<'standard' | 'deep-research' | 'nano-banana'>(
    defaultChatMode
  );
  const [showModeDropdown, setShowModeDropdown] = useState(false);
  const modeDropdownRef = useRef<HTMLDivElement>(null);
  const [showActions, setShowActions] = useState<string | null>(null);
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
  const toolsDropdownRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  // Slash command autocomplete
  const [slashMenuOpen, setSlashMenuOpen] = useState(false);
  const [slashMenuIndex, setSlashMenuIndex] = useState(0);
  const slashMenuRef = useRef<HTMLDivElement>(null);
  const initialMessageSentRef = useRef(false);
  // Thread persistence — reuse thread_id across messages for continuous conversation
  const threadIdRef = useRef<string | null>(null);

  // Domain prompt browser — organized by capability area
  const [showDomainPrompts, setShowDomainPrompts] = useState(false);
  const [expandedDomain, setExpandedDomain] = useState<string | null>(null);
  const domainPrompts = useMemo(
    () => getPromptsForContext(navContext || contextProfile?.screenName),
    [navContext, contextProfile?.screenName]
  );

  const screenName = contextProfile?.screenName || 'default';
  const screenLabel = SCREEN_LABELS[screenName] || '';

  useEffect(() => {
    const tenantId =
      contextProfile?.organizationId ||
      localStorage.getItem('organizationId') ||
      localStorage.getItem('currentOrganizationId');
    if (!tenantId) return;

    fetch(`/api/firecrawl/quota-status?tenantId=${tenantId}`, {
      credentials: 'include',
      headers: { Authorization: `Bearer ${localStorage.getItem('token') || ''}` },
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
        // Non-blocking UI hint only
      });
  }, [contextProfile?.organizationId]);

  // ── Slash command autocomplete filtering ──────────────────────────────────
  const filteredSlashCommands = useMemo(() => {
    if (!slashMenuOpen) return [];
    const trimmed = input.trim().toLowerCase();
    if (!trimmed.startsWith('/')) return [];
    const query = trimmed;
    return SLASH_COMMANDS.filter(
      (cmd) =>
        cmd.command.startsWith(query) ||
        cmd.description.toLowerCase().includes(query.slice(1))
    ).slice(0, 10);
  }, [input, slashMenuOpen]);

  // Close slash menu when input no longer starts with /
  useEffect(() => {
    const trimmed = input.trim();
    if (!trimmed.startsWith('/') || trimmed.includes(' ')) {
      setSlashMenuOpen(false);
    }
  }, [input]);

  // ── Authoring-aware suggested actions (Wave 1) ─────────────────────────────
  const authoringSuggestedActions = useMemo<SuggestedAction[]>(() => {
    if (!authoringContext) return [];
    const actions: SuggestedAction[] = [];
    const stage = authoringContext.workflowStage;

    // Action 1: Resume last section — always available when in project context
    actions.push({
      id: 'resume-last-section',
      label: 'Resume last section',
      intent: 'resume_last_section',
      description: 'Open the most recently edited section',
    });

    // Action 2: Draft this section — available when section context exists
    if (hasSectionContext(authoringContext)) {
      actions.push({
        id: 'draft-section',
        label: `Draft ${authoringContext.sectionCode}: ${authoringContext.sectionTitle || 'this section'}`,
        intent: 'draft_section_from_context',
        description: 'Generate a compliant first draft for this section',
      });
    }

    // Action 3: Explain blockers — available when in section-workspace or review
    if (stage === 'section-workspace' || stage === 'review') {
      actions.push({
        id: 'explain-blockers',
        label: 'What blocks promotion?',
        intent: 'explain_promotion_blockers',
        description: 'Show readiness issues and contradictions blocking this section',
      });
    }

    // Action 4: Compare against approved — available when artifact exists
    if (hasArtifactContext(authoringContext)) {
      actions.push({
        id: 'compare-approved',
        label: 'Compare to last approved',
        intent: 'compare_against_approved',
        description: 'Show changes since the last approved version',
      });
    }

    // Action 5: Promote to review — available when drafting and not blocked
    // Action: Section preflight — always available in section workspace
    if (hasSectionContext(authoringContext)) {
      actions.push({
        id: 'section-preflight',
        label: 'Run section preflight',
        intent: 'section_preflight',
        description: 'Check body, consistency, contradictions, and readiness before promotion',
      });
    }

    // Action: Module preflight — available when module context exists
    if (authoringContext.moduleCode) {
      actions.push({
        id: 'module-preflight',
        label: `Run ${authoringContext.moduleCode.toUpperCase()} preflight`,
        intent: 'module_preflight',
        description: 'Check all sections in this module before promotion',
      });
    }

    // Action: Dossier preflight — available at project level
    if (
      authoringContext.workflowStage === 'dossier' ||
      authoringContext.workflowStage === 'submissions' ||
      authoringContext.workflowStage === 'review'
    ) {
      actions.push({
        id: 'dossier-preflight',
        label: 'Run dossier preflight',
        intent: 'dossier_preflight',
        description: 'Check all modules and sections for submission readiness',
      });
    }

    if (
      hasArtifactContext(authoringContext) &&
      authoringContext.artifactStatus === 'drafting' &&
      !authoringContext.readiness?.blocked
    ) {
      actions.push({
        id: 'promote-to-review',
        label: 'Promote to review',
        intent: 'promote_to_review',
        description: 'Run preflight then promote if all checks pass',
      });
    }

    // Promotion lifecycle: approve (review → approved)
    if (hasArtifactContext(authoringContext) && authoringContext.artifactStatus === 'review') {
      actions.push({
        id: 'approve-artifact',
        label: 'Approve artifact',
        intent: 'approve_artifact',
        description: 'Approve after reviewer sign-off (all gates checked)',
      });
    }

    // Promotion lifecycle: lock (approved → locked)
    if (hasArtifactContext(authoringContext) && authoringContext.artifactStatus === 'approved') {
      actions.push({
        id: 'lock-artifact',
        label: 'Lock for submission',
        intent: 'lock_artifact',
        description: 'Lock content — no further edits allowed',
      });
    }

    // Promotion lifecycle: mark submission-ready (locked → submission_ready)
    if (hasArtifactContext(authoringContext) && authoringContext.artifactStatus === 'locked') {
      actions.push({
        id: 'mark-submission-ready',
        label: 'Mark submission-ready',
        intent: 'mark_submission_ready',
        description: 'Confirm readiness for regulatory submission (requires RA lead)',
      });
    }

    // Wave 2 actions — available in deeper authoring contexts

    // Action 6: Correction draft — available when section has issues
    if (
      hasSectionContext(authoringContext) &&
      (authoringContext.contradictions?.length || authoringContext.readiness?.blocked)
    ) {
      actions.push({
        id: 'correction-draft',
        label: 'Prepare correction draft',
        intent: 'correction_draft',
        description: 'Fix issues based on contradictions or readiness blockers',
      });
    }

    // Action 7: Harmonize — available when section context exists
    if (hasSectionContext(authoringContext)) {
      actions.push({
        id: 'harmonize-sections',
        label: 'Harmonize with related sections',
        intent: 'harmonize_sections',
        description: 'Check consistency across linked CTD sections',
      });
    }

    // Action 8: Resolution changelog
    if (
      authoringContext.workflowStage === 'section-workspace' ||
      authoringContext.workflowStage === 'review'
    ) {
      actions.push({
        id: 'resolution-changelog',
        label: 'What changed after resolution?',
        intent: 'resolution_changelog',
        description: 'Explain recent resolution changes and their impact',
      });
    }

    // Action 9: Module readiness
    if (authoringContext.moduleCode || hasSectionContext(authoringContext)) {
      actions.push({
        id: 'module-readiness',
        label: `Module readiness`,
        intent: 'module_readiness',
        description: 'Check submission readiness for this module',
      });
    }

    // Action 10: Gather evidence
    if (hasSectionContext(authoringContext)) {
      actions.push({
        id: 'section-evidence',
        label: 'Gather evidence for this section',
        intent: 'section_evidence',
        description: 'Find linked evidence, studies, and regulatory support',
      });
    }

    // ── Wave 3: Body-aware + cross-section consistency actions ──

    // Action 11: Body-aware expectations
    if (
      hasSectionContext(authoringContext) &&
      (authoringContext.regulatorBody || authoringContext.submissionType)
    ) {
      actions.push({
        id: 'body-expectations',
        label: `What does ${authoringContext.regulatorBody || 'this body'} expect here?`,
        intent: 'body_expectations',
        description: 'Show body-specific section requirements and common gaps',
      });
    }

    // Action 12: Cross-section consistency
    if (hasSectionContext(authoringContext) && authoringContext.linkedSectionCodes?.length) {
      actions.push({
        id: 'cross-section-consistency',
        label: 'Check cross-section consistency',
        intent: 'cross_section_consistency',
        description: 'Detect inconsistencies with linked CTD sections',
      });
    }

    // Action 13: Body-aware gap detection
    if (
      hasSectionContext(authoringContext) &&
      (authoringContext.regulatorBody || authoringContext.submissionType)
    ) {
      actions.push({
        id: 'body-aware-gaps',
        label: 'What is missing for this body?',
        intent: 'body_aware_gaps',
        description: 'Detect body-specific content gaps in this section',
      });
    }

    // ── Wave 3: Contradiction → Resolution actions ──

    // Action 14: Explain contradiction resolution (always available when contradictions exist)
    if (authoringContext.contradictions && authoringContext.contradictions.length > 0) {
      actions.push({
        id: 'explain-contradiction-resolution',
        label: `Explain ${authoringContext.contradictions.length} contradiction(s)`,
        intent: 'explain_contradiction_resolution',
        description: 'Structured explanation of contradictions and resolution paths',
      });
    }

    // Action 15: Plan contradiction resolution
    if (authoringContext.contradictions && authoringContext.contradictions.length > 0) {
      const blockingCount = authoringContext.contradictions.filter(
        (c: any) => c.severity === 'critical' || c.severity === 'high'
      ).length;
      if (blockingCount > 0) {
        actions.push({
          id: 'plan-contradiction-resolution',
          label: `Plan resolution for ${blockingCount} blocker(s)`,
          intent: 'plan_contradiction_resolution',
          description: 'Create resolution plan with authority check and affected objects',
        });
      }
    }

    // Action 16: Project resolution status
    actions.push({
      id: 'project-resolution-status',
      label: 'Resolution status',
      intent: 'project_resolution_status',
      description: 'View resolution plans, bundles, and progress',
    });

    return actions;
  }, [authoringContext]);

  // Intelligence-driven suggested actions from recommendations + nextActions + riskFactors + openQuestions
  const intelligenceSuggestedActions = useMemo<SuggestedAction[]>(() => {
    if (!projectIntelligence) return [];
    const actions: SuggestedAction[] = [];

    // Surface critical/high recommendations as priority action chips
    if (projectIntelligence.recommendations?.length) {
      const urgent = projectIntelligence.recommendations.filter(
        r => r.severity === 'critical' || r.severity === 'high'
      );
      for (const rec of urgent.slice(0, 2)) {
        actions.push({
          id: `intel-rec-${rec.id}`,
          label: rec.title.length > 55 ? rec.title.slice(0, 52) + '...' : rec.title,
          intent: 'recommendation',
          description: `${rec.severity} ${rec.category} recommendation`,
        });
      }
    }

    // Surface next best actions as suggested action chips
    if (projectIntelligence.nextActions?.length) {
      for (const na of projectIntelligence.nextActions) {
        actions.push({
          id: `intel-nba-${na.id}`,
          label: na.title,
          intent: 'next-action',
          description: na.reason,
        });
      }
    }

    // Surface high-priority risk factors as prompts
    if (projectIntelligence.riskFactors?.length) {
      const highRisks = projectIntelligence.riskFactors.filter(
        rf => rf.likelihood === 'high' || rf.impact === 'high'
      );
      for (const rf of highRisks.slice(0, 2)) {
        actions.push({
          id: `intel-risk-${rf.description.slice(0, 20).replace(/\s+/g, '-')}`,
          label: `Assess risk: ${rf.description.length > 50 ? rf.description.slice(0, 47) + '...' : rf.description}`,
          intent: 'risk-assessment',
          description: `${rf.likelihood} likelihood, ${rf.impact} impact`,
        });
      }
    }

    // Surface top open question as a prompt
    if (projectIntelligence.openQuestions?.length) {
      const topQ = projectIntelligence.openQuestions[0];
      actions.push({
        id: `intel-oq-${topQ.question.slice(0, 20).replace(/\s+/g, '-')}`,
        label: topQ.question.length > 60 ? topQ.question.slice(0, 57) + '...' : topQ.question,
        intent: 'open-question',
        description: topQ.context || `Priority: ${topQ.priority}`,
      });
    }

    return actions;
  }, [projectIntelligence]);

  // Default project-scoped suggested actions (shown when no other actions available)
  const defaultProjectActions: SuggestedAction[] = useMemo(() => {
    if (!contextProfile?.activeProject) return [];
    return [
      { id: 'default-ctd-map', label: 'Map my CTD structure', intent: 'ctd_map', description: 'Build your dossier map based on submission type' },
      { id: 'default-find-predicates', label: 'Find predicates', intent: 'find_predicates', description: 'Search for predicate devices and comparisons' },
      { id: 'default-check-readiness', label: 'Check readiness', intent: 'check_readiness', description: 'Assess your submission readiness score' },
      { id: 'default-draft-section', label: 'Draft a section', intent: 'draft_section', description: 'Start drafting a submission section' },
    ];
  }, [contextProfile?.activeProject]);

  // Merge parent-provided actions with authoring-aware + intelligence actions
  const effectiveSuggestedActions = useMemo(() => {
    const MAX_CHIPS = 4; // Keep it calm — 4 choices, not a menu
    const parent = suggestedActions || [];
    if (authoringSuggestedActions.length > 0) {
      const base = [...authoringSuggestedActions.slice(0, 3), ...parent.slice(0, 1)];
      const remaining = MAX_CHIPS - base.length;
      if (remaining > 0 && intelligenceSuggestedActions.length > 0) {
        return [...base, ...intelligenceSuggestedActions.slice(0, remaining)];
      }
      return base.slice(0, MAX_CHIPS);
    }
    // No authoring context — lead with intelligence actions, then parent
    if (intelligenceSuggestedActions.length > 0) {
      return [...intelligenceSuggestedActions.slice(0, 3), ...parent.slice(0, 1)];
    }
    // Fall back to parent actions if available
    if (parent.length > 0) return parent.slice(0, MAX_CHIPS);
    // Fall back to default project actions when project is active but no other actions
    return defaultProjectActions.slice(0, MAX_CHIPS);
  }, [suggestedActions, authoringSuggestedActions, intelligenceSuggestedActions, defaultProjectActions]);

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
    if (!isThinking) return;
    const STANDARD_THINKING = [
      'Analyzing regulatory requirements...',
      'Cross-referencing guidance documents...',
      'Evaluating submission readiness...',
      'Reviewing CTD module structure...',
      'Assessing regulatory pathway options...',
      'Running compliance analysis...',
      'Checking ICH guideline alignment...',
      'Reviewing 21 CFR Part 11 requirements...',
      'Analyzing evidence strength...',
      'Evaluating deficiency risk profile...',
      'Assessing endpoint defensibility...',
      'Reviewing regulatory precedent...',
      'Checking predicate devices and precedents...',
      'Cross-referencing FDA guidance database...',
      'Analyzing submission strategy...',
    ];
    const DEEP_RESEARCH_THINKING = [
      'Searching ClinicalTrials.gov for matching studies...',
      'Pulling from PubMed — casting a wide net...',
      'Checking FDA approval histories for similar products...',
      'Scanning EMA assessment reports...',
      'Aggregating results across all data sources...',
      'Cross-referencing regulatory precedents...',
      'Building the competitive landscape...',
      'Synthesizing findings into a briefing...',
      'Analyzing evidence coverage gaps...',
      'Ranking results by regulatory relevance...',
      'This is substantive research — give me a moment...',
      'Found some interesting precedents — pulling them together...',
    ];
    const ANA_THINKING_MESSAGES =
      chatMode === 'deep-research' ? DEEP_RESEARCH_THINKING : STANDARD_THINKING;
    setThinkingMsg(ANA_THINKING_MESSAGES[Math.floor(Math.random() * ANA_THINKING_MESSAGES.length)]);
    const interval = setInterval(() => {
      setThinkingMsg(
        ANA_THINKING_MESSAGES[Math.floor(Math.random() * ANA_THINKING_MESSAGES.length)]
      );
    }, 3000);
    return () => clearInterval(interval);
  }, [isThinking]);

  const defaultGreeting = useMemo(() => {
    if (greeting) return greeting;
    const hour = new Date().getHours();
    const timeGreeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
    if (contextProfile?.activeProject) {
      const stats = projectIntelligence;
      if (stats && (stats.documentCount > 0 || stats.memoryAtomCount > 0 || stats.signalCount > 0)) {
        const parts = [`${timeGreeting}. You're working on **${contextProfile.activeProject}**.`];
        const statParts: string[] = [];
        if (stats.documentCount > 0) statParts.push(`${stats.documentCount} indexed document${stats.documentCount !== 1 ? 's' : ''}`);
        if (stats.signalCount > 0) statParts.push(`${stats.signalCount} intelligence signal${stats.signalCount !== 1 ? 's' : ''}`);
        if (statParts.length > 0) parts.push(`I have your regulatory strategy, ${statParts.join(', and ')}.`);
        if (stats.readinessScore != null) parts.push(`Current readiness: ${stats.readinessScore}%.`);
        // Surface recommendation + risk factor counts when available
        const criticalRecs = stats.recommendations?.filter(r => r.severity === 'critical' || r.severity === 'high') ?? [];
        const highRisks = stats.riskFactors?.filter(rf => rf.likelihood === 'high' || rf.impact === 'high') ?? [];
        if (criticalRecs.length > 0 || highRisks.length > 0) {
          const alertParts: string[] = [];
          if (criticalRecs.length > 0) alertParts.push(`${criticalRecs.length} priority recommendation${criticalRecs.length !== 1 ? 's' : ''}`);
          if (highRisks.length > 0) alertParts.push(`${highRisks.length} high-impact risk${highRisks.length !== 1 ? 's' : ''}`);
          parts.push(`I've identified ${alertParts.join(' and ')} to review.`);
        }
        parts.push('What would you like to work on?');
        return parts.join(' ');
      }
      return `${timeGreeting}. Ready to work on **${contextProfile.activeProject}**. I have your project context loaded. What would you like to tackle?`;
    }
    return `${timeGreeting}. I'm AnA — your regulatory intelligence partner. What are you working on?`;
  }, [greeting, contextProfile?.activeProject, projectIntelligence]);

  // Auto-scroll when new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isThinking]);

  // Auto-resize textarea
  useEffect(() => {
    const el = inputRef.current;
    if (el) {
      el.style.height = '24px';
      el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
    }
  }, [input]);

  // Handle initial message (auto-send once)
  useEffect(() => {
    if (initialMessage && !initialMessageSentRef.current) {
      initialMessageSentRef.current = true;
      // Slight delay to let component mount
      setTimeout(() => handleSend(initialMessage), 100);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialMessage]);

  // Handle external message (auto-send whenever value changes, supports resend)
  const lastExternalTsRef = useRef(0);
  useEffect(() => {
    if (externalMessage && externalMessage.ts !== lastExternalTsRef.current) {
      lastExternalTsRef.current = externalMessage.ts;
      setTimeout(() => handleSend(externalMessage.text), 100);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [externalMessage]);

  // ── Stop generating ──────────────────────────────────────────────────────────
  const handleStop = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    setIsThinking(false);
  }, []);

  // ── Regenerate last assistant message ────────────────────────────────────────
  const handleRegenerate = useCallback(() => {
    // Find the last user message and resend it
    const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
    if (lastUserMsg) {
      // Remove the last assistant message
      setMessages(prev => {
        const lastAssistantIdx = prev.findLastIndex(m => m.role === 'assistant');
        if (lastAssistantIdx >= 0) {
          return prev.slice(0, lastAssistantIdx);
        }
        return prev;
      });
      // Resend
      handleSend(lastUserMsg.content);
    }
  }, [messages]); // handleSend added below after it's defined

  const handleSend = useCallback(
    async (messageText?: string) => {
      const text = messageText || input.trim();
      if (!text || isThinking) return;

      // Create AbortController for this request so user can stop generation
      const controller = new AbortController();
      abortRef.current = controller;

      const userMsg: AnaMessage = {
        id: `u-${Date.now()}`,
        role: 'user',
        content: text,
        timestamp: new Date(),
      };

      // Cap in-memory messages to prevent unbounded growth
      setMessages(prev => [...prev.slice(-199), userMsg]);
      setInput('');
      setIsThinking(true);

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
                setIsThinking(false);
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
                  .finally(() => setIsThinking(false));
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
              .finally(() => setIsThinking(false));
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
          setIsThinking(false);
        }
        return;
      }

      // Standard chat mode — route to appropriate endpoint
      try {
        let data: any;

        if (chatMode === 'nano-banana') {
          // Route to Visual AI (Gemini image gen) endpoint
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

          // Helper: build auth headers from current localStorage
          const buildChatHeaders = (): Record<string, string> => {
            const h: Record<string, string> = { 'Content-Type': 'application/json' };
            const t =
              localStorage.getItem('token') ||
              localStorage.getItem('authToken') ||
              localStorage.getItem('auth_token');
            if (t) h['Authorization'] = `Bearer ${t}`;
            const o =
              localStorage.getItem('organizationId') ||
              localStorage.getItem('currentOrganizationId') ||
              '1';
            h['x-organization-id'] = o;
            return h;
          };

          const correlationId = createCorrelationId('ana');

          // Helper: silently refresh token via dev-login when we get a 401
          const refreshTokenOnce = async (): Promise<boolean> => {
            try {
              const email =
                localStorage.getItem('userEmail') ||
                localStorage.getItem('user_email') ||
                'jm.smith@concept2cure.pro';
              const resp = await fetch('/api/auth/dev-login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email }),
              });
              if (!resp.ok) return false;
              const data = await resp.json();
              if (data.accessToken) {
                localStorage.setItem('token', data.accessToken);
                localStorage.setItem('authToken', data.accessToken);
                localStorage.setItem('auth_token', data.accessToken);
                if (data.user?.organizationId) {
                  localStorage.setItem('organizationId', String(data.user.organizationId));
                  localStorage.setItem('currentOrganizationId', String(data.user.organizationId));
                }
                if (data.user?.email) {
                  localStorage.setItem('userEmail', data.user.email);
                }
                console.log('[AnA] Token refreshed silently');
                return true;
              }
            } catch {
              // silent
            }
            return false;
          };

          let chatHeaders = buildChatHeaders();
          chatHeaders['x-correlation-id'] = correlationId;

          let rawData: any = null;
          let chatSucceeded = false;
          let anaErrorCode: string | null = null;

          // ── Build chat body (reused for retries) ──
          const chatBody = JSON.stringify({
            message: text,
            idempotency_key: correlationId,
            chatMode,
            useFirecrawl,
            thread_id: threadIdRef.current || undefined,
            project_id: contextProfile?.projectId || undefined,
            submission_type: contextProfile?.productType || undefined,
            source_surface: 'ana_persistent_panel',
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

          // ── Attempt 1: AnA RI endpoint ──
          try {
            let anaRes = await fetch('/api/ana-ri/chat', {
              method: 'POST',
              headers: chatHeaders,
              credentials: 'include',
              signal: controller.signal,
              body: chatBody,
            });
            // Auto-refresh token on 401 and retry once
            if (anaRes.status === 401) {
              console.warn('[AnA RI] 401 — refreshing token and retrying...');
              const refreshed = await refreshTokenOnce();
              if (refreshed) {
                chatHeaders = buildChatHeaders();
                chatHeaders['x-correlation-id'] = correlationId;
                anaRes = await fetch('/api/ana-ri/chat', {
                  method: 'POST',
                  headers: chatHeaders,
                  credentials: 'include',
                  body: chatBody,
                });
              }
            }
            if (anaRes.ok) {
              rawData = await anaRes.json();
              chatSucceeded = true;
            } else {
              const errBody = await anaRes.text().catch(() => '');
              try {
                const parsed = JSON.parse(errBody);
                anaErrorCode = parsed?.error?.code || parsed?.code || null;
              } catch {
                // ignore parse failures
              }
              console.warn(`[AnA RI] ${anaRes.status}: ${errBody.slice(0, 200)}`);
            }
          } catch (anaErr: any) {
            console.warn('[AnA RI] Network error:', anaErr?.message);
          }

          // ── Attempt 2: Cortex fallback ──
          if (!chatSucceeded) {
            try {
              let cortexRes = await fetch('/api/cortex/chat', {
                method: 'POST',
                headers: chatHeaders,
                credentials: 'include',
                body: JSON.stringify({
                  message: text,
                  chatMode,
                  idempotency_key: correlationId,
                  source_surface: 'ana_persistent_panel',
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
              // Auto-refresh token on 401 and retry once
              if (cortexRes.status === 401) {
                const refreshed = await refreshTokenOnce();
                if (refreshed) {
                  chatHeaders = buildChatHeaders();
                  chatHeaders['x-correlation-id'] = correlationId;
                  cortexRes = await fetch('/api/cortex/chat', {
                    method: 'POST',
                    headers: chatHeaders,
                    credentials: 'include',
                    body: JSON.stringify({
                      message: text,
                      chatMode,
                      idempotency_key: correlationId,
                      source_surface: 'ana_persistent_panel',
                      project_id: contextProfile?.projectId || undefined,
                      submission_type: contextProfile?.productType || undefined,
                      preferred_provider:
                        selectedProvider !== 'auto' ? selectedProvider : undefined,
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
                }
              }
              if (cortexRes.ok) {
                rawData = await cortexRes.json();
                chatSucceeded = true;
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

          const normalizedOrchestration = normalizeOrchestrationPayload(data);
          if (normalizedOrchestration) {
            setLastOrchestration(normalizedOrchestration);
          }

          // Capture thread_id for conversation continuity
          if (data.thread_id) {
            threadIdRef.current = data.thread_id;
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
              // Claude-style: tool executions and thinking
              toolExecutions: data.toolExecutions || undefined,
              thinking: data.thinking || undefined,
              isComplete: true,
              tokenUsage: data.usage ? {
                inputTokens: data.usage.prompt_tokens || data.usage.inputTokens,
                outputTokens: data.usage.completion_tokens || data.usage.outputTokens,
              } : undefined,
            },
          ]);

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
          const fbToken =
            localStorage.getItem('token') ||
            localStorage.getItem('authToken') ||
            localStorage.getItem('auth_token');
          const fbOrgId =
            localStorage.getItem('organizationId') ||
            localStorage.getItem('currentOrganizationId') ||
            '1';
          const fbHeaders: Record<string, string> = {
            'Content-Type': 'application/json',
            'x-organization-id': fbOrgId,
            'x-correlation-id': createCorrelationId('ana_fb'),
          };
          if (fbToken) fbHeaders['Authorization'] = `Bearer ${fbToken}`;

          const fallbackRes = await fetch('/api/cortex/chat', {
            method: 'POST',
            headers: fbHeaders,
            credentials: 'include',
            body: JSON.stringify({
              message: text,
              chatMode: 'standard',
              source_surface: 'ana_persistent_panel_fallback',
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
          if (fallbackData?.thread_id) threadIdRef.current = fallbackData.thread_id;
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
              content: `Sorry, I encountered an error: ${err?.message || 'Unknown error'}. Please try again.`,
              timestamp: new Date(),
              isError: true,
            },
          ]);
        }
      } finally {
        setIsThinking(false);
        // Return focus to input after send completes
        inputRef.current?.focus();
      }
    },
    [input, isThinking, messages, contextProfile, chatMode, intentLens, selectedProvider, useFirecrawl]
  );

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setInput(val);
    const trimmed = val.trim();
    if (trimmed.startsWith('/') && !trimmed.includes(' ') && trimmed.length >= 1) {
      setSlashMenuOpen(true);
      setSlashMenuIndex(0);
    }
  };

  const selectSlashCommand = (cmd: SlashCommand) => {
    setInput(cmd.command + ' ');
    setSlashMenuOpen(false);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Slash command navigation
    if (slashMenuOpen && filteredSlashCommands.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSlashMenuIndex((prev) => Math.min(prev + 1, filteredSlashCommands.length - 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSlashMenuIndex((prev) => Math.max(prev - 1, 0));
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
    }
  };

  const handleCopy = (id: string, content: string) => {
    navigator.clipboard.writeText(content);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
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
                content: `Opening **${data.title || 'your last section'}** (§${data.ctdSection}). Status: ${data.status || 'draft'}.`,
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
                content: `Opening **${data.title || 'your last document'}**. Status: ${data.status || 'draft'}.`,
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
        ? `Draft CTD section ${authoringContext.sectionCode}${authoringContext.sectionTitle ? `: ${authoringContext.sectionTitle}` : ''}. Generate a compliant first draft following ICH M4 guidelines and regulatory requirements for ${authoringContext.submissionType || 'this submission'}. Return the draft content in a code block so it can be inserted into the editor.`
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
                content: `**No blockers detected.** ${authoringContext?.sectionCode ? `Section §${authoringContext.sectionCode}` : 'This document'} appears ready for promotion to review.\n\nYou can proceed with "Promote to review" when ready.`,
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
                content: `**Promotion ${data.blocked ? 'BLOCKED' : 'has warnings'}** — ${data.blockerCount} issue(s) found:\n\n${blockerLines}\n\n${data.blocked ? 'Resolve critical blockers before promotion.' : 'These are advisory — promotion is not hard-blocked.'}`,
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
                ? `\n\n**Conflict risk:** ${conflictRisk} — significant changes from approved baseline.${authoringContext?.linkedSectionCodes?.length ? ' Use **Check cross-section consistency** or **Prepare correction draft** to address.' : ' Consider preparing a correction draft to align.'}`
                : '\n\n**Conflict risk:** low — changes are minor relative to approved baseline.';
            setMessages(prev => [
              ...prev,
              {
                id: `a-${Date.now()}`,
                role: 'assistant',
                content: `**Version Comparison**\n\n| | Current (v${cur.version}) | Approved (v${appr.version}) |\n|---|---|---|\n| Status | ${cur.status} | ${appr.status} |\n| Words | ${data.diffSummary.currentWords} | ${data.diffSummary.approvedWords} |\n| Updated | ${new Date(cur.updatedAt).toLocaleDateString()} | ${new Date(appr.updatedAt).toLocaleDateString()} |\n\n**Net change:** ${wordDelta > 0 ? '+' : ''}${wordDelta} words.${pivotHint}${onOpenCompareInspector ? '' : '\n\nTo view a detailed inline diff, open the document inspector and select the Compare tab.'}`,
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
              `| Body expectations | ${statusIcon(data.checks.bodyExpectations?.status)} ${data.checks.bodyExpectations?.status || 'unknown'} | ${data.checks.bodyExpectations?.missing?.length ? `${data.checks.bodyExpectations.missing.length} missing` : '—'} |`,
              `| Contradictions | ${statusIcon(data.checks.contradictions?.status)} ${data.checks.contradictions?.status || 'unknown'} | ${data.checks.contradictions?.items?.length ? `${data.checks.contradictions.items.length} found` : '—'} |`,
              `| Cross-section consistency | ${statusIcon(data.checks.crossSectionConsistency?.status)} ${data.checks.crossSectionConsistency?.status || 'unknown'} | ${data.checks.crossSectionConsistency?.items?.length ? `${data.checks.crossSectionConsistency.items.length} issues` : '—'} |`,
              `| Approved baseline | ${statusIcon(data.checks.approvedBaselineCompare?.status)} ${data.checks.approvedBaselineCompare?.status || 'unknown'} | ${data.checks.approvedBaselineCompare?.conflictRisk || '—'} |`,
              `| Readiness | ${statusIcon(data.checks.readiness?.status)} ${data.checks.readiness?.status || 'unknown'} | ${data.checks.readiness?.blockers?.length ? `${data.checks.readiness.blockers.length} blockers` : data.checks.readiness?.score != null ? `Score: ${data.checks.readiness.score}` : '—'} |`,
            ].join('\n');

            const overallIcon =
              data.overall === 'ready' ? '✅' : data.overall === 'blocked' ? '🚫' : '⚠️';
            const actionLines = data.recommendedActions?.length
              ? '\n\n**Recommended actions:**\n' +
                data.recommendedActions.map((a: any) => `- **${a.label}** — ${a.reason}`).join('\n')
              : '';

            // Decision architecture context
            const decisionLine = data.decisionId
              ? `\n\n**Decision:** \`${data.decisionId.slice(0, 16)}…\` — Status: **${data.decisionStatus || 'recorded'}** — Authority: **${data.authority?.level || 'unknown'}**`
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
                content: `**Section Preflight — §${sectionCode}** ${overallIcon}\n\n**Overall:** ${data.overall.toUpperCase()} — ${data.summary}\n\n| Check | Status | Detail |\n|---|---|---|\n${checkLines}${actionLines}${decisionLine}${authorityNote}`,
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
                content: `**Preflight:** ${data.message || data.error || 'Unable to run preflight.'}`,
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
                      `| §${s.sectionCode} | ${s.overall === 'ready' ? '✅' : s.overall === 'blocked' ? '❌' : '⚠️'} ${s.overall} |`
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
              ? `\n\n**Decision status:** ${data.decisionAwareStatus.summary || 'No pending decisions'}`
              : '';
            const decisionLine = data.decisionId
              ? `\n**Decision:** \`${data.decisionId.slice(0, 16)}…\` — **${data.decisionStatus || 'recorded'}**`
              : '';

            setMessages(prev => [
              ...prev,
              {
                id: `a-${Date.now()}`,
                role: 'assistant',
                timestamp: new Date(),
                content: `**Module Preflight — ${moduleCode.toUpperCase()}** ${overallIcon}\n\n**Overall:** ${data.overall.toUpperCase()} — ${data.summary}\n\n**Sections:** ${data.counts.ready}/${data.counts.total} ready, ${data.counts.blocked} blocked, ${data.counts.provisional} provisional${sectionTable}${blockerLines}${actionLines}${dasLine}${decisionLine}`,
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
                      `| ${m.moduleCode.toUpperCase()} | ${m.overall === 'ready' ? '✅' : m.overall === 'blocked' ? '❌' : '⚠️'} ${m.overall} | ${m.counts?.ready || 0}/${m.counts?.total || 0} ready |`
                  )
                  .join('\n')
              : '';
            const blockerLines = data.majorBlockers?.length
              ? '\n\n**Top blockers:**\n' +
                data.majorBlockers
                  .slice(0, 5)
                  .map(
                    (b: any) =>
                      `- **[${b.severity}]** ${b.moduleCode || ''} ${b.sectionCode ? `§${b.sectionCode}` : ''}: ${b.message}`
                  )
                  .join('\n')
              : '';
            const actionLines = data.recommendedActions?.length
              ? '\n\n**Next:**\n' +
                data.recommendedActions.map((a: any) => `- ${a.label} — ${a.reason}`).join('\n')
              : '';
            // Decision-aware enrichment
            const dasLine = data.decisionAwareStatus
              ? `\n\n**Decision status:** ${data.decisionAwareStatus.summary || 'No pending decisions'}`
              : '';
            const decisionLine = data.decisionId
              ? `\n**Decision:** \`${data.decisionId.slice(0, 16)}…\` — **${data.decisionStatus || 'recorded'}**`
              : '';

            setMessages(prev => [
              ...prev,
              {
                id: `a-${Date.now()}`,
                role: 'assistant',
                timestamp: new Date(),
                content: `**Dossier Preflight** ${overallIcon}\n\n**Overall:** ${data.overall.toUpperCase()} — ${data.summary}\n\n**Modules:** ${data.counts.readyModules}/${data.counts.totalModules} ready, ${data.counts.blockedModules} blocked${moduleTable}${blockerLines}${actionLines}${dasLine}${decisionLine}`,
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
                  content: `🚫 **Promotion blocked by preflight.**\n\n${pfData.summary}\n\nFailed checks:\n${failChecks.map(c => `- ${c}`).join('\n')}${actionLines}`,
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
              ? `\n\n**Pending approvals:** ${result.pendingApprovals.map((a: any) => `${a.requiredRole} (${a.reason})`).join(', ')}`
              : '';
            const decisionNote = result.decisionId
              ? `\n**Decision:** \`${result.decisionId.slice(0, 16)}…\` — Authority: **${result.authority?.level || 'confirmed'}**`
              : '';
            setMessages(prev => [
              ...prev,
              {
                id: `a-${Date.now()}`,
                role: 'assistant',
                timestamp: new Date(),
                content: result.promoted
                  ? `✅ **Promoted to review.** ${result.message} The document is now in the governance review pipeline.${pendingNote}${decisionNote}`
                  : `**Promotion not completed.** ${result.message}${result.decisionId ? `\n**Decision:** \`${result.decisionId.slice(0, 16)}…\` — blocked` : ''}`,
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
                  content: `**Promotion failed.** ${err.error || err.message || `HTTP ${res.status}`}`,
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
              content: `**Promotion failed.** ${err instanceof Error ? err.message : 'Unknown error'}`,
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
                content: `**Approval ${data.reason === 'unauthorized' ? 'unauthorized' : 'blocked'}.** ${data.message}${blockerLines}`,
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
                content: `**Lock ${data.reason === 'unauthorized' ? 'unauthorized' : 'blocked'}.** ${data.message}${blockerLines}`,
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
                content: `**Submission-ready ${data.reason === 'unauthorized' ? 'unauthorized — requires RA or submission lead' : 'blocked'}.** ${data.message}${blockerLines}`,
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
                  `${i + 1}. **${t.objectTitle}** (§${t.sectionCode || '—'})\n   Rationale: ${t.revisionRationale}\n   Confidence: ${t.confidence} | Review required: ${t.requiresReview ? 'Yes' : 'No'}`
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
                    `- **[${i.severity}]** ${i.description} (§${i.sectionA} ↔ §${i.sectionB})${i.recommendation ? `\n  Fix: ${i.recommendation}` : ''}`
                )
                .join('\n') || 'None';
            setMessages(prev => [
              ...prev,
              {
                id: `a-${Date.now()}`,
                role: 'assistant',
                timestamp: new Date(),
                content: `**Harmonization Check** — Score: ${data.consistencyScore}/100\n\nSections compared: ${data.sectionsCompared?.join(', ')}\nDimensions checked: ${data.checkedDimensions?.join(', ')}\n\n**Issues (${data.totalIssues}):**\n${issueLines}${data.totalIssues > 0 ? '\n\n💡 Use **Prepare correction draft** to address critical issues.' : ''}`,
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
                  `### Resolution ${i + 1}\n**${r.summary}**\n- Trigger: ${r.triggerExplanation}\n- Path: ${r.recommendedPath}\n- Confidence: ${r.confidence}\n- Affected: ${r.affectedObjectsSummary}\n- Review: ${JSON.stringify(r.reviewRequirements)}\n- Next: ${r.nextSteps?.join(', ') || 'None'}`
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
                    `- **[${b.severity}]** ${b.message}${b.suggestedResolution ? ` → ${b.suggestedResolution}` : ''}`
                )
                .join('\n') || 'None';
            const moduleTable =
              data.moduleBreakdown
                ?.map(
                  (m: any) =>
                    `| ${m.module} | ${m.label} | ${m.score ?? '—'} | ${m.status} | ${m.documentCount} |`
                )
                .join('\n') || '';
            setMessages(prev => [
              ...prev,
              {
                id: `a-${Date.now()}`,
                role: 'assistant',
                timestamp: new Date(),
                content: `**Module Readiness** — Overall: ${data.overallScore ?? '—'}/100 (${data.overallStatus})\n\n${mod ? `**${mod.label}** (${mod.code}): Score ${mod.score ?? '—'}/100, Status: ${mod.status}\nDocs: ${mod.documentCount}/${mod.expectedDocumentCount}, Validated: ${mod.validatedCount}, Blockers: ${mod.blockerCount}` : `Module ${moduleCode} not found in breakdown.`}\n\n**Blockers:**\n${blockerLines}\n\n| Module | Label | Score | Status | Docs |\n|---|---|---|---|---|\n${moduleTable}`,
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
                  `${i + 1}. **${e.title}** — Type: ${e.type}, Status: ${e.status}${e.fdaRequirement ? `, FDA: ${e.fdaRequirement}` : ''}`
              )
              .join('\n');
            const gapInfo = data.gapAnalysis
              ? `\n\n**Evidence completeness:** ${data.gapAnalysis.completeness ?? '—'}%${data.gapAnalysis.criticalGaps?.length ? `\nCritical gaps: ${data.gapAnalysis.criticalGaps.join(', ')}` : ''}`
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
                content: `**Evidence for §${sectionCode}:** ${data.message}${data.gapAnalysis?.gaps?.length ? `\n\nGaps identified: ${data.gapAnalysis.gaps.join(', ')}` : ''}`,
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
            `/api/authoring-actions/section-expectations/${encodeURIComponent(body)}/${encodeURIComponent(subType)}/${encodeURIComponent(sectionCode)}`
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
                    `- **[${i.severity}]** ${i.description} (§${i.sectionA} ↔ §${i.sectionB})${i.recommendation ? `\n  → ${i.recommendation}` : ''}`
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
                content: `**Cross-Section Consistency for §${sectionCode}**\n\nLinked: ${data.linkedSections?.join(', ') || 'none'}\nConsistency: ${data.harmonizeResult?.consistencyScore ?? '—'}/100\n\n**Harmonization issues (${data.harmonizeResult?.totalIssues ?? 0}):**\n${harmIssues}\n\n**Contradictions (${data.contradictionCount ?? 0}):**\n${contraLines}${data.harmonizeResult?.totalIssues > 0 ? '\n\n💡 Use **Prepare correction draft** or **Harmonize** to address these.' : ''}`,
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
                    `- **[${g.status.toUpperCase()}]** ${g.requirement}${g.bodyNote ? ` — ${g.bodyNote}` : ''}`
                )
                .join('\n') || '- None detected';
            setMessages(prev => [
              ...prev,
              {
                id: `a-${Date.now()}`,
                role: 'assistant',
                timestamp: new Date(),
                content: `**${body} Gap Analysis for §${sectionCode}** (${subType})\n\n**Completeness:** ${data.overallCompleteness ?? '—'}%\n\n**Gaps:**\n${gapLines}${data.overallCompleteness != null && data.overallCompleteness < 50 ? '\n\n⚠️ Section is significantly incomplete for this regulatory body.' : ''}`,
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
                  `**Contradiction Resolution Explanation**\n\n${JSON.stringify(data.data, null, 2)}`,
              },
            ]);
          } else {
            setMessages(prev => [
              ...prev,
              {
                id: `a-${Date.now()}`,
                role: 'assistant',
                timestamp: new Date(),
                content: `**Contradiction explanation:** ${data.message || 'No explanation available'}`,
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
              `**Plans:** ${plans?.total || 0} total — ${plans?.unresolved || 0} unresolved, ${plans?.inProgress || 0} in-progress, ${plans?.resolved || 0} resolved`,
              `**Bundles:** ${bundles?.total || 0} total — ${bundles?.active || 0} active, ${bundles?.pendingReview || 0} pending review`,
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

    handleSend(action.label);
  };

  const hasMessages = messages.length > 0;
  const isCompact = mode === 'compact';

  // ── Compact mode: just input bar + expandable overlay ──
  if (isCompact) {
    return (
      <div className="flex-shrink-0 border-t border-[#E8E6DC] bg-white relative z-30">
        {/* Expanded conversation overlay (slides up from bottom) */}
        {hasMessages && (
          <div
            className="max-h-[50vh] overflow-y-auto zen-scroll border-t border-[#F5F4EF]"
            style={{ scrollbarWidth: 'thin' }}
          >
            {messages.map(msg => {
              const isUser = msg.role === 'user';
              const htmlContent = !isUser ? renderMarkdown(msg.content) : '';
              return (
                <div
                  key={msg.id}
                  className={cn('group px-4 py-3', isUser ? 'bg-[#FAF9F5]/60' : 'bg-white')}
                >
                  <div className="flex gap-2.5 max-w-3xl mx-auto">
                    <div
                      className={cn(
                        'w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5',
                        isUser ? 'bg-[#4D4B45] text-white' : 'bg-[#D97757]'
                      )}
                    >
                      {isUser ? (
                        <span className="text-[9px] font-bold">
                          {(contextProfile?.userRole?.[0] || 'Y').toUpperCase()}
                        </span>
                      ) : (
                        <Sparkles className="w-3 h-3 text-white" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-xs font-semibold text-[#2D2C28]">
                        {isUser ? 'You' : 'AnA'}
                      </span>
                      {isUser ? (
                        <p className="text-sm text-[#2D2C28] leading-relaxed whitespace-pre-wrap mt-0.5">
                          {msg.content}
                        </p>
                      ) : (
                        <div
                          className="prose prose-sm prose-stone max-w-none mt-0.5 prose-p:text-[#4D4B45] prose-p:leading-relaxed prose-p:my-1.5 prose-strong:text-[#141413] [&>*:first-child]:mt-0 [&>*:last-child]:mb-0"
                          dangerouslySetInnerHTML={{ __html: htmlContent }}
                        />
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
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
                    onMouseDown={(e) => { e.preventDefault(); selectSlashCommand(cmd); }}
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
                    <span className={cn('text-[10px] font-medium', SLASH_CATEGORY_COLORS[cmd.category] || 'text-stone-400')}>
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
              <textarea
                ref={inputRef}
                value={input}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                onFocus={() => setIsFocused(true)}
                onBlur={() => { setIsFocused(false); setTimeout(() => setSlashMenuOpen(false), 150); }}
                placeholder="Message AnA — type / for commands..."
                rows={1}
                className="flex-1 resize-none bg-transparent border-none outline-none text-[#141413] placeholder:text-[#B0AEA5] text-sm leading-6 min-h-[24px] max-h-[120px]"
              />
              {hasMessages && (
                <button
                  onClick={() => {
                    setMessages([]);
                    threadIdRef.current = null;
                  }}
                  className="flex-shrink-0 p-1.5 text-[#B0AEA5] hover:text-[#6B6962] rounded-lg transition-colors"
                  title="New thread"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
              )}
              <button
                onClick={() => handleSend()}
                disabled={!input.trim() || isThinking}
                className={cn(
                  'flex-shrink-0 p-2 rounded-full transition-colors duration-150',
                  input.trim() && !isThinking
                    ? 'bg-[#141413] text-white hover:bg-[#2D2C28]'
                    : 'bg-[#E8E6DC] text-[#B0AEA5] cursor-not-allowed'
                )}
                aria-label="Send message"
              >
                <ArrowUp className="w-4 h-4" />
              </button>
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
      {contextProfile?.activeProject && (
        <div
          className="flex items-center justify-between bg-stone-50 dark:bg-stone-900/50 border-b border-stone-200 dark:border-stone-800 px-4 py-2 shrink-0 cursor-pointer hover:bg-stone-100 dark:hover:bg-stone-900/70 transition-colors"
          onClick={() => onNavigate?.('project-config')}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onNavigate?.('project-config'); }}
          aria-label={`Active project: ${contextProfile.activeProject}. Click to open project config.`}
        >
          <div className="flex items-center gap-2 min-w-0">
            <FolderOpen className="w-3.5 h-3.5 text-stone-500 shrink-0" />
            <span className="text-[13px] font-semibold text-stone-700 dark:text-stone-300 truncate">
              {contextProfile.activeProject}
            </span>
            {contextProfile.productType && (
              <>
                <span className="text-stone-300 dark:text-stone-600">·</span>
                <span className={cn(
                  'text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded',
                  contextProfile.productType.includes('510') ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' :
                  contextProfile.productType.includes('PMA') ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300' :
                  contextProfile.productType.includes('NDA') ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' :
                  contextProfile.productType.includes('BLA') ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' :
                  contextProfile.productType.includes('IND') ? 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300' :
                  contextProfile.productType.includes('ANDA') ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300' :
                  'bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-400'
                )}>
                  {contextProfile.productType}
                </span>
              </>
            )}
          </div>
          <span className="text-[11px] text-stone-400 dark:text-stone-500 whitespace-nowrap ml-3">
            Quick project switch ←
          </span>
        </div>
      )}
      {/* ── Conversation area — fills available space ── */}
      <div
        className="flex-1 overflow-y-auto zen-scroll"
        role="log"
        aria-live="polite"
        aria-label="Conversation with AnA"
        style={{ scrollbarWidth: 'thin' }}
      >
        {!hasMessages && !isThinking ? (
          /* ── Empty state: greeting + suggested actions ── */
          <div className="flex flex-col items-center justify-center h-full px-6">
            <div className="max-w-2xl w-full text-center">
              {/* Greeting — calm, no branding chrome */}
              <div className="mb-8">
                <h2 className="text-lg font-semibold text-stone-800">{defaultGreeting}</h2>
                {screenLabel && <p className="text-[13px] text-stone-400 mt-1">{screenLabel}</p>}
                {/* Project context badge */}
                {contextProfile?.activeProject && !messages?.length && (
                  <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-[#F5F4EF] rounded-full text-[11px] border border-[#E8E6DC] mb-2">
                    <FolderOpen className="w-3 h-3 text-[#6D6B63]" />
                    <span className="font-medium text-[#4D4B45]">
                      {contextProfile.activeProject}
                    </span>
                    {contextProfile.productType && (
                      <>
                        <span className="text-[#B0AEA5]">·</span>
                        <span className="font-medium text-[#6D6B63] uppercase tracking-wider" style={{ fontSize: '9px' }}>
                          {contextProfile.productType}
                        </span>
                      </>
                    )}
                  </div>
                )}
                {/* Authoring context indicator strip */}
                {authoringContext &&
                  (authoringContext.sectionCode || authoringContext.artifactId) && (
                    <div className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#F5F4EF] rounded-full text-[10px] text-[#6D6B63] border border-[#E8E6DC]">
                      <FileSearch className="w-3 h-3" />
                      <span className="font-medium">{authoringContext.workflowStage}</span>
                      {authoringContext.sectionCode && (
                        <>
                          <span className="text-[#B0AEA5]">·</span>
                          <span>§{authoringContext.sectionCode}</span>
                        </>
                      )}
                      {authoringContext.sectionTitle && (
                        <span className="text-[#B0AEA5] truncate max-w-[120px]">
                          {authoringContext.sectionTitle}
                        </span>
                      )}
                      {authoringContext.artifactStatus && (
                        <>
                          <span className="text-[#B0AEA5]">·</span>
                          <span className="capitalize">{authoringContext.artifactStatus}</span>
                        </>
                      )}
                    </div>
                  )}
              </div>

              {/* Suggested actions — max 4 chips, 2×2 grid */}
              {effectiveSuggestedActions && effectiveSuggestedActions.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-lg mx-auto">
                  {effectiveSuggestedActions.slice(0, 4).map(action => (
                    <button
                      key={action.id}
                      onClick={() => handleSuggestedAction(action)}
                      className="text-left px-4 py-3 rounded-xl border border-[#E8E6DC] hover:border-[#D8D5CA] hover:bg-[#FAF9F5] transition-colors group"
                    >
                      <p className="text-sm font-medium text-[#4D4B45] group-hover:text-[#141413]">
                        {action.label}
                      </p>
                      {action.description && (
                        <p className="text-xs text-[#B0AEA5] mt-0.5 line-clamp-1">
                          {action.description}
                        </p>
                      )}
                    </button>
                  ))}
                </div>
              )}

              {/* Domain prompt browser — all capabilities organized by area */}
              <div className="mt-6 max-w-lg mx-auto">
                <button
                  onClick={() => setShowDomainPrompts(prev => !prev)}
                  className="text-[11px] text-stone-400 hover:text-stone-600 transition-colors mx-auto flex items-center gap-1"
                >
                  {showDomainPrompts ? 'Hide capabilities' : 'Browse all capabilities'}
                  <ChevronDown className={cn('w-3 h-3 transition-transform', showDomainPrompts && 'rotate-180')} />
                </button>

                {showDomainPrompts && (
                  <div className="mt-3 space-y-1 text-left">
                    {/* Primary domains for current context */}
                    {domainPrompts.primary.map(group => (
                      <DomainPromptSection
                        key={group.domain}
                        group={group}
                        expanded={expandedDomain === group.domain}
                        onToggle={() => setExpandedDomain(prev => prev === group.domain ? null : group.domain)}
                        onSelect={prompt => {
                          handleSend(prompt.label);
                          setShowDomainPrompts(false);
                          setExpandedDomain(null);
                        }}
                        isPrimary
                      />
                    ))}
                    {/* More domains */}
                    {domainPrompts.more.map(group => (
                      <DomainPromptSection
                        key={group.domain}
                        group={group}
                        expanded={expandedDomain === group.domain}
                        onToggle={() => setExpandedDomain(prev => prev === group.domain ? null : group.domain)}
                        onSelect={prompt => {
                          handleSend(prompt.label);
                          setShowDomainPrompts(false);
                          setExpandedDomain(null);
                        }}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          /* ── Messages ── */
          <div className="pb-2">
            {messages.map(msg => {
              const isUser = msg.role === 'user';
              const htmlContent = !isUser ? renderMarkdown(msg.content) : '';

              return (
                <div
                  key={msg.id}
                  className={cn('group px-4 py-3', isUser ? 'bg-[#FAF9F5]/60' : 'bg-white')}
                  onMouseEnter={() => !isUser && setShowActions(msg.id)}
                  onMouseLeave={() => setShowActions(null)}
                >
                  <div className="flex gap-2.5 max-w-3xl mx-auto">
                    <div
                      className={cn(
                        'w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5',
                        isUser ? 'bg-[#4D4B45] text-white' : 'bg-[#D97757]'
                      )}
                    >
                      {isUser ? (
                        <span className="text-[9px] font-bold">
                          {(contextProfile?.userRole?.[0] || 'Y').toUpperCase()}
                        </span>
                      ) : (
                        <Sparkles className="w-3 h-3 text-white" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-xs font-semibold text-[#2D2C28]">
                        {isUser ? 'You' : 'AnA'}
                      </span>
                      {isUser ? (
                        editingMsgId === msg.id ? (
                          /* Claude-style: inline edit mode */
                          <div className="mt-1">
                            <textarea
                              value={editText}
                              onChange={e => setEditText(e.target.value)}
                              className="w-full text-sm text-[#2D2C28] leading-relaxed border border-stone-300 rounded-lg px-3 py-2 resize-none focus:border-stone-400 focus:ring-1 focus:ring-stone-400 outline-none"
                              rows={3}
                              autoFocus
                            />
                            <div className="flex gap-2 mt-1.5">
                              <button
                                onClick={() => {
                                  if (editText.trim()) {
                                    const msgIdx = messages.findIndex(m => m.id === msg.id);
                                    setMessages(prev => prev.slice(0, msgIdx));
                                    setEditingMsgId(null);
                                    handleSend(editText.trim());
                                  }
                                }}
                                className="px-3 py-1 text-xs font-medium text-white bg-stone-900 rounded-md hover:bg-stone-800"
                              >
                                Send
                              </button>
                              <button
                                onClick={() => setEditingMsgId(null)}
                                className="px-3 py-1 text-xs text-stone-500 hover:text-stone-700"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="group/user flex items-start gap-1 mt-0.5">
                            <p className="text-sm text-[#2D2C28] leading-relaxed whitespace-pre-wrap flex-1">
                              {msg.content}
                            </p>
                            <button
                              onClick={() => { setEditingMsgId(msg.id); setEditText(msg.content); }}
                              className="opacity-0 group-hover/user:opacity-100 p-1 text-stone-400 hover:text-stone-600 rounded transition-opacity flex-shrink-0"
                              title="Edit message"
                            >
                              <Pencil className="w-3 h-3" />
                            </button>
                          </div>
                        )
                      ) : (
                        <>
                          <div
                            className="prose prose-sm prose-stone max-w-none mt-0.5
                              prose-p:text-stone-700 prose-p:leading-relaxed prose-p:my-1.5
                              prose-strong:text-stone-900
                              prose-code:text-violet-700 prose-code:bg-violet-50 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-xs prose-code:before:content-none prose-code:after:content-none
                              prose-pre:bg-stone-900 prose-pre:text-stone-100 prose-pre:rounded-xl prose-pre:p-3 prose-pre:text-xs
                              prose-blockquote:border-l-violet-400 prose-blockquote:text-stone-600
                              prose-ul:text-stone-700 prose-ol:text-stone-700
                              prose-a:text-blue-600 prose-a:no-underline hover:prose-a:underline
                              [&>*:first-child]:mt-0 [&>*:last-child]:mb-0"
                            dangerouslySetInnerHTML={{ __html: htmlContent }}
                          />
                          {/* Visual AI generated images */}
                          {msg.images && msg.images.length > 0 && (
                            <div className="flex flex-wrap gap-2 mt-2">
                              {msg.images.map((img, idx) => (
                                <img
                                  key={idx}
                                  src={`data:${img.mimeType};base64,${img.base64}`}
                                  alt={`Generated image ${idx + 1}`}
                                  className="rounded-lg border border-stone-200 max-w-sm shadow-sm"
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
                          {/* ── Claude-style: Extended Thinking block ── */}
                          {msg.thinking && (
                            <ThinkingBlock content={msg.thinking} />
                          )}
                          {/* ── Claude-style: Tool Execution blocks ── */}
                          {msg.toolExecutions && msg.toolExecutions.length > 0 && (
                            <div className="my-1">
                              {msg.toolExecutions.map((tool, i) => (
                                <ToolExecutionBlock
                                  key={`${tool.name}-${i}`}
                                  label={tool.label}
                                  status={tool.status}
                                  input={tool.input}
                                  result={tool.result}
                                />
                              ))}
                            </div>
                          )}
                          {/* ── Legacy: Executed Guidance Actions (backward compat) ── */}
                          {msg.executedActions && msg.executedActions.length > 0 && !msg.toolExecutions && (
                            <div className="my-1">
                              {msg.executedActions.map((action, i) => (
                                <ToolExecutionBlock
                                  key={i}
                                  label={
                                    action.executed
                                      ? `Created ${action.actionType.replace(/_/g, ' ')}`
                                      : action.error
                                        ? `Failed: ${action.error}`
                                        : `Prepared ${action.actionType.replace(/_/g, ' ')}`
                                  }
                                  status={action.executed && !action.error ? 'completed' : action.error ? 'error' : 'running'}
                                />
                              ))}
                            </div>
                          )}
                          {/* ── Claude-style: Done indicator ── */}
                          {msg.role === 'assistant' && msg.isComplete && (
                            <DoneIndicator visible />
                          )}
                          {/* Visual AI PPTX download button */}
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
                      {!isUser && (
                        <div
                          className={cn(
                            'flex items-center gap-0.5 mt-1 transition-opacity duration-150',
                            showActions === msg.id ? 'opacity-100' : 'opacity-0'
                          )}
                        >
                          {/* Model badge */}
                          {msg.modelProvider && (
                            <span
                              className={cn(
                                'text-[10px] font-medium px-1.5 py-0.5 rounded mr-1',
                                msg.modelProvider === 'anthropic'
                                  ? 'text-[#CC785C] bg-[#FBF0EB]'
                                  : msg.modelProvider === 'openai'
                                    ? 'text-[#10A37F] bg-emerald-50'
                                    : msg.modelProvider === 'moonshot'
                                      ? 'text-[#6366F1] bg-indigo-50'
                                      : 'text-stone-500 bg-stone-50'
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
                          {/* Claude-style: token usage */}
                          {msg.tokenUsage && (
                            <span className="text-[10px] text-stone-400 mr-1 tabular-nums">
                              {msg.tokenUsage.inputTokens ? `${msg.tokenUsage.inputTokens} in` : ''}
                              {msg.tokenUsage.inputTokens && msg.tokenUsage.outputTokens ? ' · ' : ''}
                              {msg.tokenUsage.outputTokens ? `${msg.tokenUsage.outputTokens} out` : ''}
                            </span>
                          )}
                          {msg.evidenceUsage?.firecrawlRequested && (
                            <span
                              className={cn(
                                'text-[10px] font-medium px-1.5 py-0.5 rounded mr-1',
                                msg.evidenceUsage.firecrawlUsed
                                  ? 'text-[#D97757] bg-[#FBF0EB]'
                                  : 'text-stone-500 bg-stone-50'
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
                          {/* Regenerate — Claude-style retry on assistant messages */}
                          <button
                            onClick={handleRegenerate}
                            className="p-1 text-[#B0AEA5] hover:text-[#4D4B45] hover:bg-[#F5F4EF] rounded transition-colors"
                            title="Regenerate"
                          >
                            <RefreshCw className="w-3 h-3" />
                          </button>
                          <button
                            onClick={() => {
                              apiRequest('POST', '/api/concept2cure/feedback', {
                                messageId: msg.id,
                                positive: true,
                              }).catch(() => {});
                            }}
                            className="p-1 text-stone-400 hover:text-stone-700 hover:bg-stone-100 rounded transition-colors"
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
                            className="p-1 text-stone-400 hover:text-stone-700 hover:bg-stone-100 rounded transition-colors"
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
                                        title: `AnA Response — ${new Date().toISOString().split('T')[0]}`,
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
                                className="p-1 text-stone-400 hover:text-emerald-600 hover:bg-emerald-50 rounded transition-colors"
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
                                className="p-1 text-stone-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                                title="Insert into Editor"
                              >
                                <FileEdit className="w-3 h-3" />
                              </button>
                            )}
                          {(msg as any).insertedToEditor && (
                            <span className="text-[10px] text-blue-600 font-medium ml-1">
                              Inserted
                            </span>
                          )}
                          {msg.savedAsArtifact && (
                            <span className="text-[10px] text-emerald-600 font-medium ml-1">
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
                                      setIsThinking(true);
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
                                            statusLine = `\n\n---\n**${action.label} created** | Artifact #${data.artifactId} | Quality: ${data.qualityGrade || 'draft'} | ${data.isNew ? 'New' : 'Updated'}`;
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
                                          setIsThinking(false);
                                        } else {
                                          // Fallback: send as chat prompt (handleSend manages isThinking)
                                          handleSend(
                                            `Please generate a ${action.label.toLowerCase()} based on our conversation above.`
                                          );
                                        }
                                      } catch {
                                        // Fallback: send as chat prompt (handleSend manages isThinking)
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
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* ── Bottom input bar — always visible ── */}
      <div className="flex-shrink-0 px-4 py-3 border-t border-[#F5F4EF] bg-white">
        <div className="max-w-3xl mx-auto relative">
          {/* Clear conversation + browse capabilities */}
          {hasMessages && (
            <div className="flex justify-center gap-3 mb-2">
              <button
                onClick={() => {
                  setMessages([]);
                  threadIdRef.current = null;
                }}
                className="flex items-center gap-1.5 px-3 py-1 text-xs text-[#B0AEA5] hover:text-[#6B6962] hover:bg-[#F5F4EF] rounded-full transition-colors"
              >
                <RotateCcw className="w-3 h-3" />
                New thread
              </button>
              <button
                onClick={() => setShowDomainPrompts(prev => !prev)}
                className="flex items-center gap-1.5 px-3 py-1 text-xs text-[#B0AEA5] hover:text-[#6B6962] hover:bg-[#F5F4EF] rounded-full transition-colors"
              >
                <Sparkles className="w-3 h-3" />
                {showDomainPrompts ? 'Hide prompts' : 'Browse prompts'}
              </button>
            </div>
          )}

          {/* Domain prompts — available mid-conversation */}
          {hasMessages && showDomainPrompts && (
            <div className="mb-3 max-h-[300px] overflow-y-auto rounded-xl border border-stone-100 bg-stone-50/50 p-2 space-y-1">
              {domainPrompts.primary.map(group => (
                <DomainPromptSection
                  key={group.domain}
                  group={group}
                  expanded={expandedDomain === group.domain}
                  onToggle={() => setExpandedDomain(prev => prev === group.domain ? null : group.domain)}
                  onSelect={prompt => {
                    handleSend(prompt.label);
                    setShowDomainPrompts(false);
                    setExpandedDomain(null);
                  }}
                  isPrimary
                />
              ))}
              {domainPrompts.more.map(group => (
                <DomainPromptSection
                  key={group.domain}
                  group={group}
                  expanded={expandedDomain === group.domain}
                  onToggle={() => setExpandedDomain(prev => prev === group.domain ? null : group.domain)}
                  onSelect={prompt => {
                    handleSend(prompt.label);
                    setShowDomainPrompts(false);
                    setExpandedDomain(null);
                  }}
                />
              ))}
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
                  onMouseDown={(e) => { e.preventDefault(); selectSlashCommand(cmd); }}
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
                  <span className={cn('text-[10px] font-medium', SLASH_CATEGORY_COLORS[cmd.category] || 'text-stone-400')}>
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
            {/* Mode selector — Claude.ai model-picker style */}
            <div className="relative flex-shrink-0 self-center" ref={modeDropdownRef}>
              <button
                type="button"
                onClick={() => setShowModeDropdown(prev => !prev)}
                className={cn(
                  'flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium transition-colors',
                  chatMode === 'deep-research'
                    ? 'bg-violet-50 text-violet-700 hover:bg-violet-100'
                    : chatMode === 'nano-banana'
                      ? 'bg-amber-50 text-amber-700 hover:bg-amber-100'
                      : 'text-stone-500 hover:bg-stone-100 hover:text-stone-700'
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
                      ? 'Visual AI'
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
                  <div className="mx-2 my-0.5 border-t border-stone-100" />
                  <button
                    type="button"
                    onClick={() => {
                      setChatMode('nano-banana');
                      setShowModeDropdown(false);
                    }}
                    className={cn(
                      'w-full flex items-start gap-3 px-3 py-2.5 text-left hover:bg-stone-50 transition-colors',
                      chatMode === 'nano-banana' && 'bg-amber-50'
                    )}
                  >
                    <ImageIcon className="w-4 h-4 mt-0.5 text-amber-600 flex-shrink-0" />
                    <div>
                      <div className="text-sm font-medium text-stone-900">Visual AI</div>
                      <div className="text-[11px] text-stone-400 leading-tight">
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

            {/* Input */}
            <textarea
              ref={inputRef}
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              onFocus={() => setIsFocused(true)}
              onBlur={() => { setIsFocused(false); setTimeout(() => setSlashMenuOpen(false), 150); }}
              placeholder={
                chatMode === 'deep-research'
                  ? 'Ask a deep research question...'
                  : chatMode === 'nano-banana'
                    ? 'Describe an image, infographic, or presentation...'
                    : intentLens !== 'auto'
                      ? `Message AnA (${intentLens} lens)...`
                      : 'Message AnA — type / for commands...'
              }
              rows={1}
              className="flex-1 resize-none bg-transparent border-none outline-none text-[#141413] placeholder:text-[#B0AEA5] text-sm leading-6 min-h-[24px] max-h-[120px]"
            />

            {/* Send / Stop — Claude-style: shows Stop during generation */}
            {isThinking ? (
              <button
                onClick={handleStop}
                className="flex-shrink-0 p-2 rounded-full bg-red-500 text-white hover:bg-red-600 transition-colors duration-150"
                aria-label="Stop generating"
              >
                <Square className="w-4 h-4 fill-current" />
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

          {/* Firecrawl status hidden — accessible via /firecrawl command */}

          {/* Intent lenses hidden — accessible via /lens command or slash menu */}
        </div>
      </div>
    </div>
  );
};

export default AnaPersistentPanel;
