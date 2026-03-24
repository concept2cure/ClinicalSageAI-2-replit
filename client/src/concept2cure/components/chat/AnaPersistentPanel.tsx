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
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { useAIAction } from '../../hooks/useAIAction';
import type { AIActionType, AIActionSourceSurface } from '../../hooks/useAIAction';
import {
  Sparkles,
  ArrowUp,
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
} from 'lucide-react';

marked.setOptions({ breaks: true, gfm: true });

const renderMarkdown = (content: string): string => {
  try {
    const rawHtml = marked.parse(content) as string;
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
      ],
      ALLOWED_ATTR: ['href', 'target', 'rel', 'class', 'id'],
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
  /** Base64 images from Nano Banana */
  images?: Array<{ base64: string; mimeType: string }>;
  /** Downloadable PPTX from Nano Banana */
  pptx?: { base64: string; filename: string; mimeType: string };
  /** Whether this message has been saved as an artifact */
  savedAsArtifact?: boolean;
}

// ─── Auth helper ──────────────────────────────────────────────────────────────
function getAuthHeaders(): Record<string, string> {
  const token =
    sessionStorage.getItem('trialsage_access_token') ||
    localStorage.getItem('trialsage_access_token');
  return token
    ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
    : { 'Content-Type': 'application/json' };
}

interface SuggestedAction {
  id: string;
  label: string;
  intent?: string;
  description?: string;
}

// ─── AnA RI Types ─────────────────────────────────────────────────────────────

type IntentLens = 'auto' | 'audit' | 'improve' | 'risk' | 'strategy' | 'compare';

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

// ─── Authoring context import ────────────────────────────────────────────────
import type { AuthoringContextPack } from '../../../../../shared/types/authoring-context';
import { hasSectionContext, hasArtifactContext, hasVersionContext } from '../../../../../shared/types/authoring-context';
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
  suggestedActions,
  greeting,
  initialMessage,
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
}) => {
  // AI Action system — unified execution spine (Phase 1)
  const aiAction = useAIAction();

  const [messages, setMessages] = useState<AnaMessage[]>([]);
  const [input, setInput] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
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
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const initialMessageSentRef = useRef(false);
  // Thread persistence — reuse thread_id across messages for continuous conversation
  const threadIdRef = useRef<string | null>(null);

  const screenName = contextProfile?.screenName || 'default';
  const screenLabel = SCREEN_LABELS[screenName] || '';

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
    if (
      hasArtifactContext(authoringContext) &&
      authoringContext.artifactStatus === 'drafting' &&
      !authoringContext.readiness?.blocked
    ) {
      actions.push({
        id: 'promote-to-review',
        label: 'Promote to review',
        intent: 'promote_to_review',
        description: 'Move this section to review if readiness checks pass',
      });
    }

    // Wave 2 actions — available in deeper authoring contexts

    // Action 6: Correction draft — available when section has issues
    if (hasSectionContext(authoringContext) && (authoringContext.contradictions?.length || authoringContext.readiness?.blocked)) {
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
    if (authoringContext.workflowStage === 'section-workspace' || authoringContext.workflowStage === 'review') {
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

    return actions;
  }, [authoringContext]);

  // Merge parent-provided actions with authoring-aware actions
  const effectiveSuggestedActions = useMemo(() => {
    const parent = suggestedActions || [];
    if (authoringSuggestedActions.length > 0) {
      // Show up to 4 authoring actions + 1 parent action
      return [...authoringSuggestedActions.slice(0, 4), ...parent.slice(0, 1)];
    }
    return parent;
  }, [suggestedActions, authoringSuggestedActions]);

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
      return `${timeGreeting}. Ready to work on ${contextProfile.activeProject}. How can I help?`;
    }
    return `${timeGreeting}. I'm AnA — regulatory intelligence for FDA, EMA, and ICH submissions. What are you working on?`;
  }, [greeting, contextProfile?.activeProject]);

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

  const handleSend = useCallback(
    async (messageText?: string) => {
      const text = messageText || input.trim();
      if (!text || isThinking) return;

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
          const launchRes = await fetch('/api/deep-research/jobs', {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({
              query: { indication: text, keywords: text.split(/\s+/).filter(w => w.length > 3) },
              connectorIds: ['clinical_trials_gov', 'pubmed', 'fda_drugs', 'ema_epar'],
              depth: 'standard',
              projectId: contextProfile?.projectId || null,
            }),
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
                fetch(`/api/deep-research/jobs/${jobId}`)
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
            fetch(`/api/deep-research/jobs/${jobId}`)
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
          // Route to Nano Banana (Gemini image gen) endpoint
          const response = await fetch('/api/nano-banana/chat', {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({
              message: text,
              conversationHistory: messages.slice(-10).map(m => ({
                role: m.role,
                content: m.content,
              })),
            }),
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
          const authoringPayload = authoringContext ? serializeContextForChat(authoringContext) : {};

          let response = await fetch('/api/ana-ri/chat', {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({
              message: text,
              chatMode,
              thread_id: threadIdRef.current || undefined,
              project_id: contextProfile?.projectId || undefined,
              submission_type: contextProfile?.productType || undefined,
              // Canonical authoring context (section, artifact, workflow stage)
              authoring_context: authoringPayload,
              context: {
                screen: contextProfile?.screenName,
                project: contextProfile?.activeProject,
                projectId: contextProfile?.projectId,
                productType: contextProfile?.productType,
                userRole: contextProfile?.userRole,
                ...(contextProfile?.moduleContext || {}),
                // Also spread key authoring fields into legacy context for backward compat
                ...(authoringContext ? {
                  sectionCode: authoringContext.sectionCode,
                  artifactId: authoringContext.artifactId,
                  artifactVersionId: authoringContext.artifactVersionId,
                  workflowStage: authoringContext.workflowStage,
                  sectionTitle: authoringContext.sectionTitle,
                  moduleCode: authoringContext.moduleCode,
                  artifactStatus: authoringContext.artifactStatus,
                } : {}),
              },
              conversationHistory: messages.slice(-10).map(m => ({
                role: m.role,
                content: m.content,
              })),
            }),
          });

          if (!response.ok) {
            // Fallback to Cortex unified chat
            response = await fetch('/api/cortex/chat', {
              method: 'POST',
              headers: getAuthHeaders(),
              body: JSON.stringify({
                message: text,
                chatMode,
                project_id: contextProfile?.projectId || undefined,
                submission_type: contextProfile?.productType || undefined,
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
            if (!response.ok) {
              throw new Error(`Request failed (${response.status})`);
            }
          }
          data = await response.json();

          const normalizedOrchestration = normalizeOrchestrationPayload(data);
          if (normalizedOrchestration) {
            setLastOrchestration(normalizedOrchestration);
          }

          // Capture thread_id for conversation continuity
          if (data.thread_id) {
            threadIdRef.current = data.thread_id;
          }

          const assistantContent =
            data.response || 'I received your message but had no response content.';

          setMessages(prev => [
            ...prev,
            {
              id: `a-${Date.now()}`,
              role: 'assistant',
              content: assistantContent,
              timestamp: new Date(),
              executedActions: data.executedActions || undefined,
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
                await fetch(`/api/concept2cure/projects/${numericProjectId}/artifacts`, {
                  method: 'POST',
                  headers: getAuthHeaders(),
                  body: JSON.stringify({
                    title: `AI Draft — ${new Date().toISOString().split('T')[0]}`,
                    content: blockContent,
                    type: 'document_section',
                    category: 'document',
                  }),
                });
              } catch {
                // Non-blocking
              }
            }
          }
        }
      } catch (err: any) {
        setMessages(prev => [
          ...prev,
          {
            id: `a-${Date.now()}`,
            role: 'assistant',
            content: `Sorry, I encountered an error processing your request. Please try again.`,
            timestamp: new Date(),
            isError: true,
          },
        ]);
      } finally {
        setIsThinking(false);
        // Return focus to input after send completes
        inputRef.current?.focus();
      }
    },
    [input, isThinking, messages, contextProfile, chatMode, intentLens]
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
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
            handleSend('I need a project context to find your last section. Please open a project first.');
            return;
          }
          const res = await fetch(`/api/authoring-actions/resume-last-section/${projectId}`, {
            headers: getAuthHeaders(),
          });
          const data = await res.json();
          if (data.found && data.ctdSection && onNavigateToSection) {
            // Real navigation to the section
            onNavigateToSection(data.ctdSection);
            setMessages(prev => [...prev, {
              id: `a-${Date.now()}`,
              role: 'assistant',
              content: `Opening **${data.title || 'your last section'}** (§${data.ctdSection}). Status: ${data.status || 'draft'}.`,
              timestamp: new Date(),
            }]);
          } else if (data.found && data.artifactId && onOpenArtifact) {
            // Open artifact directly if no CTD section
            onOpenArtifact(data.artifactId);
            setMessages(prev => [...prev, {
              id: `a-${Date.now()}`,
              role: 'assistant',
              content: `Opening **${data.title || 'your last document'}**. Status: ${data.status || 'draft'}.`,
              timestamp: new Date(),
            }]);
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
          if (authoringContext?.sectionCode) params.set('sectionCode', authoringContext.sectionCode);
          const res = await fetch(`/api/authoring-actions/promotion-blockers/${projectId}?${params}`, {
            headers: getAuthHeaders(),
          });
          const data = await res.json();
          if (data.blockerCount === 0) {
            setMessages(prev => [...prev, {
              id: `a-${Date.now()}`,
              role: 'assistant',
              content: `**No blockers detected.** ${authoringContext?.sectionCode ? `Section §${authoringContext.sectionCode}` : 'This document'} appears ready for promotion to review.\n\nYou can proceed with "Promote to review" when ready.`,
              timestamp: new Date(),
            }]);
          } else {
            const blockerLines = data.blockers.map((b: any, i: number) =>
              `${i + 1}. **[${b.severity.toUpperCase()}]** ${b.message} _(via ${b.source})_`
            ).join('\n');
            setMessages(prev => [...prev, {
              id: `a-${Date.now()}`,
              role: 'assistant',
              content: `**Promotion ${data.blocked ? 'BLOCKED' : 'has warnings'}** — ${data.blockerCount} issue(s) found:\n\n${blockerLines}\n\n${data.blocked ? 'Resolve critical blockers before promotion.' : 'These are advisory — promotion is not hard-blocked.'}`,
              timestamp: new Date(),
            }]);
          }
        } catch {
          handleSend(authoringContext?.sectionCode
            ? `What is blocking section ${authoringContext.sectionCode} from promotion to review?`
            : 'What is blocking this document from promotion to review?');
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
          const res = await fetch(`/api/authoring-actions/compare-versions/${projectId}/${artifactId}`, {
            headers: getAuthHeaders(),
          });
          const data = await res.json();
          if (!data.available) {
            setMessages(prev => [...prev, {
              id: `a-${Date.now()}`,
              role: 'assistant',
              content: `**No comparison available.** ${data.message}`,
              timestamp: new Date(),
            }]);
          } else {
            const cur = data.currentVersion;
            const appr = data.approvedVersion;
            const wordDelta = data.diffSummary.currentWords - data.diffSummary.approvedWords;
            setMessages(prev => [...prev, {
              id: `a-${Date.now()}`,
              role: 'assistant',
              content: `**Version Comparison**\n\n| | Current (v${cur.version}) | Approved (v${appr.version}) |\n|---|---|---|\n| Status | ${cur.status} | ${appr.status} |\n| Words | ${data.diffSummary.currentWords} | ${data.diffSummary.approvedWords} |\n| Updated | ${new Date(cur.updatedAt).toLocaleDateString()} | ${new Date(appr.updatedAt).toLocaleDateString()} |\n\n**Net change:** ${wordDelta > 0 ? '+' : ''}${wordDelta} words.${onOpenCompareInspector ? '' : '\n\nTo view a detailed inline diff, open the document inspector and select the Compare tab.'}`,
              timestamp: new Date(),
            }]);
            // Auto-open the version compare inspector if available
            if (onOpenCompareInspector) {
              onOpenCompareInspector();
            }
          }
        } catch {
          handleSend('Compare the current document against the last approved version.');
        }
      })();
      return;
    }

    // P5: Promote to review — governed transition with confirmation
    if (action.intent === 'promote_to_review') {
      (async () => {
        const projectId = contextProfile?.projectId;
        const artifactId = authoringContext?.artifactId;
        if (!projectId || !artifactId) {
          setMessages(prev => [...prev, {
            id: `a-${Date.now()}`,
            role: 'assistant',
            content: '**Cannot promote.** No artifact is currently open. Open a document first.',
            timestamp: new Date(),
          }]);
          return;
        }
        // Step 1: Check blockers
        try {
          const blockerRes = await fetch(`/api/authoring-actions/promotion-blockers/${projectId}?artifactId=${artifactId}`, {
            headers: getAuthHeaders(),
          });
          const blockerData = await blockerRes.json();
          if (blockerData.blocked) {
            const lines = blockerData.blockers.map((b: any) => `- **[${b.severity}]** ${b.message}`).join('\n');
            setMessages(prev => [...prev, {
              id: `a-${Date.now()}`,
              role: 'assistant',
              content: `**Promotion blocked.** ${blockerData.blockerCount} critical issue(s) must be resolved first:\n\n${lines}`,
              timestamp: new Date(),
            }]);
            return;
          }
        } catch {
          // Non-blocking — proceed with promotion attempt
        }

        // Step 2: Attempt governed promotion
        if (onRequestPromotion) {
          try {
            const result = await onRequestPromotion(artifactId);
            setMessages(prev => [...prev, {
              id: `a-${Date.now()}`,
              role: 'assistant',
              content: result.promoted
                ? `**Promoted to review.** ${result.message} The document is now in the governance review pipeline.`
                : `**Promotion not completed.** ${result.message}`,
              timestamp: new Date(),
            }]);
            // Refresh readiness after promotion attempt
            onRefreshIntelligence?.();
          } catch (err) {
            setMessages(prev => [...prev, {
              id: `a-${Date.now()}`,
              role: 'assistant',
              content: `**Promotion failed.** ${err instanceof Error ? err.message : 'Unknown error'}`,
              timestamp: new Date(),
            }]);
          }
        } else {
          // Fallback: call the status API directly
          try {
            const res = await fetch(`/api/concept2cure/projects/${projectId}/artifacts/${artifactId}/status`, {
              method: 'PUT',
              headers: getAuthHeaders(),
              body: JSON.stringify({ status: 'review' }),
            });
            if (res.ok) {
              setMessages(prev => [...prev, {
                id: `a-${Date.now()}`,
                role: 'assistant',
                content: '**Promoted to review.** The document has been moved to the governance review pipeline.',
                timestamp: new Date(),
              }]);
              onRefreshIntelligence?.();
            } else {
              const err = await res.json().catch(() => ({ error: 'Unknown error' }));
              setMessages(prev => [...prev, {
                id: `a-${Date.now()}`,
                role: 'assistant',
                content: `**Promotion failed.** ${err.error || err.message || `HTTP ${res.status}`}`,
                timestamp: new Date(),
              }]);
            }
          } catch {
            handleSend('Promote this document to review.');
          }
        }
      })();
      return;
    }

    // ── Wave 2 Authoring Actions — real operational behavior ──────────

    // ACTION 6: Correction draft
    if (action.intent === 'correction_draft') {
      (async () => {
        const projectId = contextProfile?.projectId;
        if (!projectId) { handleSend('Prepare a governed correction for the current section.'); return; }
        try {
          const res = await fetch('/api/authoring-actions/correction-draft', {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({
              projectId, artifactId: authoringContext?.artifactId,
              sectionCode: authoringContext?.sectionCode,
              triggerDescription: 'Correction requested via AnA — addressing readiness/contradiction issues',
            }),
          });
          const data = await res.json();
          if (data.status === 'data' && data.targets?.length) {
            const targetLines = data.targets.map((t: any, i: number) =>
              `${i + 1}. **${t.objectTitle}** (§${t.sectionCode || '—'})\n   Rationale: ${t.revisionRationale}\n   Confidence: ${t.confidence} | Review required: ${t.requiresReview ? 'Yes' : 'No'}`
            ).join('\n\n');
            setMessages(prev => [...prev, { id: `a-${Date.now()}`, role: 'assistant', timestamp: new Date(),
              content: `**Correction targets identified** — ${data.targets.length} item(s):\n\n${targetLines}\n\n${data.message}` }]);
          } else {
            setMessages(prev => [...prev, { id: `a-${Date.now()}`, role: 'assistant', timestamp: new Date(),
              content: `**Correction draft:** ${data.message}` }]);
          }
        } catch { handleSend('Prepare a governed correction draft for the current section.'); }
      })();
      return;
    }

    // ACTION 7: Harmonize sections
    if (action.intent === 'harmonize_sections') {
      (async () => {
        const projectId = contextProfile?.projectId;
        const currentCode = authoringContext?.sectionCode;
        if (!projectId || !currentCode) { handleSend('Harmonize this section with related CTD sections.'); return; }
        // Derive linked sections from same module
        const major = currentCode.split('.')[0];
        const linked = authoringContext?.linkedSectionCodes || [];
        const sectionCodes = linked.length > 0 ? [currentCode, ...linked] : [currentCode, `${major}.2`, `${major}.3`, `${major}.5`].filter((v, i, a) => a.indexOf(v) === i);
        try {
          const res = await fetch('/api/authoring-actions/harmonize-sections', {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ projectId, sectionCodes, submissionType: authoringContext?.submissionType }),
          });
          const data = await res.json();
          if (data.status === 'data') {
            const issueLines = data.issues?.slice(0, 5).map((i: any) =>
              `- **[${i.severity}]** ${i.description} (§${i.sectionA} ↔ §${i.sectionB})${i.recommendation ? `\n  Fix: ${i.recommendation}` : ''}`
            ).join('\n') || 'None';
            setMessages(prev => [...prev, { id: `a-${Date.now()}`, role: 'assistant', timestamp: new Date(),
              content: `**Harmonization Check** — Score: ${data.consistencyScore}/100\n\nSections compared: ${data.sectionsCompared?.join(', ')}\nDimensions checked: ${data.checkedDimensions?.join(', ')}\n\n**Issues (${data.totalIssues}):**\n${issueLines}` }]);
          } else {
            setMessages(prev => [...prev, { id: `a-${Date.now()}`, role: 'assistant', timestamp: new Date(),
              content: `**Harmonization:** ${data.message}` }]);
          }
        } catch { handleSend('Check consistency across linked sections.'); }
      })();
      return;
    }

    // ACTION 8: Resolution changelog
    if (action.intent === 'resolution_changelog') {
      (async () => {
        const projectId = contextProfile?.projectId;
        if (!projectId) { handleSend('What changed after the last resolution?'); return; }
        try {
          const res = await fetch('/api/authoring-actions/resolution-changelog', {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ projectId }),
          });
          const data = await res.json();
          if (data.status === 'data' && data.resolutions?.length) {
            const lines = data.resolutions.map((r: any, i: number) =>
              `### Resolution ${i + 1}\n**${r.summary}**\n- Trigger: ${r.triggerExplanation}\n- Path: ${r.recommendedPath}\n- Confidence: ${r.confidence}\n- Affected: ${r.affectedObjectsSummary}\n- Review: ${JSON.stringify(r.reviewRequirements)}\n- Next: ${r.nextSteps?.join(', ') || 'None'}`
            ).join('\n\n');
            setMessages(prev => [...prev, { id: `a-${Date.now()}`, role: 'assistant', timestamp: new Date(),
              content: `**Resolution History** — ${data.resolutionCount} resolution(s)\n\n${lines}` }]);
          } else {
            setMessages(prev => [...prev, { id: `a-${Date.now()}`, role: 'assistant', timestamp: new Date(),
              content: `**Resolution changelog:** ${data.message}` }]);
          }
        } catch { handleSend('What changed after the last resolution?'); }
      })();
      return;
    }

    // ACTION 9: Module readiness
    if (action.intent === 'module_readiness') {
      (async () => {
        const projectId = contextProfile?.projectId;
        const moduleCode = authoringContext?.moduleCode || (authoringContext?.sectionCode ? `m${authoringContext.sectionCode.split('.')[0]}` : 'm2');
        if (!projectId) { handleSend('Show readiness for this module.'); return; }
        try {
          const res = await fetch(`/api/authoring-actions/module-readiness/${projectId}/${moduleCode}`, {
            headers: getAuthHeaders(),
          });
          const data = await res.json();
          if (data.status === 'data') {
            const mod = data.module;
            const blockerLines = data.blockers?.slice(0, 5).map((b: any) =>
              `- **[${b.severity}]** ${b.message}${b.suggestedResolution ? ` → ${b.suggestedResolution}` : ''}`
            ).join('\n') || 'None';
            const moduleTable = data.moduleBreakdown?.map((m: any) =>
              `| ${m.module} | ${m.label} | ${m.score ?? '—'} | ${m.status} | ${m.documentCount} |`
            ).join('\n') || '';
            setMessages(prev => [...prev, { id: `a-${Date.now()}`, role: 'assistant', timestamp: new Date(),
              content: `**Module Readiness** — Overall: ${data.overallScore ?? '—'}/100 (${data.overallStatus})\n\n${mod ? `**${mod.label}** (${mod.code}): Score ${mod.score ?? '—'}/100, Status: ${mod.status}\nDocs: ${mod.documentCount}/${mod.expectedDocumentCount}, Validated: ${mod.validatedCount}, Blockers: ${mod.blockerCount}` : `Module ${moduleCode} not found in breakdown.`}\n\n**Blockers:**\n${blockerLines}\n\n| Module | Label | Score | Status | Docs |\n|---|---|---|---|---|\n${moduleTable}` }]);
          } else {
            setMessages(prev => [...prev, { id: `a-${Date.now()}`, role: 'assistant', timestamp: new Date(),
              content: `**Module readiness:** ${data.message}` }]);
          }
        } catch { handleSend(`Show readiness for module ${moduleCode}.`); }
      })();
      return;
    }

    // ACTION 10: Section evidence
    if (action.intent === 'section_evidence') {
      (async () => {
        const projectId = contextProfile?.projectId;
        const sectionCode = authoringContext?.sectionCode;
        if (!projectId || !sectionCode) { handleSend('Gather evidence for this section.'); return; }
        try {
          const res = await fetch(`/api/authoring-actions/section-evidence/${projectId}/${sectionCode}`, {
            headers: getAuthHeaders(),
          });
          const data = await res.json();
          if (data.status === 'data' && data.evidence?.length) {
            const evidenceLines = data.evidence.slice(0, 10).map((e: any, i: number) =>
              `${i + 1}. **${e.title}** — Type: ${e.type}, Status: ${e.status}${e.fdaRequirement ? `, FDA: ${e.fdaRequirement}` : ''}`
            ).join('\n');
            const gapInfo = data.gapAnalysis
              ? `\n\n**Evidence completeness:** ${data.gapAnalysis.completeness ?? '—'}%${data.gapAnalysis.criticalGaps?.length ? `\nCritical gaps: ${data.gapAnalysis.criticalGaps.join(', ')}` : ''}`
              : '';
            setMessages(prev => [...prev, { id: `a-${Date.now()}`, role: 'assistant', timestamp: new Date(),
              content: `**Evidence for §${sectionCode}** — ${data.evidenceCount} item(s) found:\n\n${evidenceLines}${gapInfo}` }]);
          } else {
            setMessages(prev => [...prev, { id: `a-${Date.now()}`, role: 'assistant', timestamp: new Date(),
              content: `**Evidence for §${sectionCode}:** ${data.message}${data.gapAnalysis?.gaps?.length ? `\n\nGaps identified: ${data.gapAnalysis.gaps.join(', ')}` : ''}` }]);
          }
        } catch { handleSend(`Gather evidence for section ${sectionCode}.`); }
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
        <div className="px-4 py-2.5 bg-white">
          <div className="max-w-3xl mx-auto">
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
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                onFocus={() => setIsFocused(true)}
                onBlur={() => setIsFocused(false)}
                placeholder="Message AnA..."
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
              {/* Greeting */}
              <div className="mb-8">
                <div className="w-10 h-10 rounded-full bg-[#D97757] flex items-center justify-center mx-auto mb-3">
                  <Sparkles className="w-5 h-5 text-white" />
                </div>
                <p className="text-[10px] font-semibold tracking-wider text-[#B0AEA5] uppercase mb-3">
                  AnA 1.0 Regulatory Intelligence
                </p>
                <h2 className="text-xl font-semibold text-[#141413]">{defaultGreeting}</h2>
                {screenLabel && <p className="text-sm text-[#B0AEA5] mt-1">{screenLabel}</p>}
                {/* Authoring context indicator strip */}
                {authoringContext && (authoringContext.sectionCode || authoringContext.artifactId) && (
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
                      <span className="text-[#B0AEA5] truncate max-w-[120px]">{authoringContext.sectionTitle}</span>
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

              {/* Suggested actions */}
              {effectiveSuggestedActions && effectiveSuggestedActions.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-lg mx-auto">
                  {effectiveSuggestedActions.slice(0, 5).map(action => (
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
                        <p className="text-sm text-[#2D2C28] leading-relaxed whitespace-pre-wrap mt-0.5">
                          {msg.content}
                        </p>
                      ) : (
                        <>
                          <div
                            className="prose prose-sm prose-zinc max-w-none mt-0.5
                              prose-p:text-zinc-700 prose-p:leading-relaxed prose-p:my-1.5
                              prose-strong:text-zinc-900
                              prose-code:text-violet-700 prose-code:bg-violet-50 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-xs prose-code:before:content-none prose-code:after:content-none
                              prose-pre:bg-zinc-900 prose-pre:text-zinc-100 prose-pre:rounded-xl prose-pre:p-3 prose-pre:text-xs
                              prose-blockquote:border-l-violet-400 prose-blockquote:text-zinc-600
                              prose-ul:text-zinc-700 prose-ol:text-zinc-700
                              prose-a:text-blue-600 prose-a:no-underline hover:prose-a:underline
                              [&>*:first-child]:mt-0 [&>*:last-child]:mb-0"
                            dangerouslySetInnerHTML={{ __html: htmlContent }}
                          />
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
                              {msg.executedActions.map((action, i) => (
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
                                        : `Prepared ${action.actionType.replace(/_/g, ' ')} (${action.confidence})`}
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
                      {!isUser && (
                        <div
                          className={cn(
                            'flex items-center gap-0.5 mt-1 transition-opacity duration-150',
                            showActions === msg.id ? 'opacity-100' : 'opacity-0'
                          )}
                        >
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
                              fetch('/api/concept2cure/feedback', {
                                method: 'POST',
                                headers: getAuthHeaders(),
                                body: JSON.stringify({ messageId: msg.id, positive: true }),
                              }).catch(() => {});
                            }}
                            className="p-1 text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 rounded transition-colors"
                            title="Good"
                          >
                            <ThumbsUp className="w-3 h-3" />
                          </button>
                          <button
                            onClick={() => {
                              fetch('/api/concept2cure/feedback', {
                                method: 'POST',
                                headers: getAuthHeaders(),
                                body: JSON.stringify({ messageId: msg.id, positive: false }),
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
                                    const saveRes = await fetch(
                                      `/api/concept2cure/projects/${numProjId}/artifacts`,
                                      {
                                        method: 'POST',
                                        headers: getAuthHeaders(),
                                        body: JSON.stringify({
                                          title: `AnA Response — ${new Date().toISOString().split('T')[0]}`,
                                          content: msg.content,
                                          type: 'document_section',
                                          category: 'document',
                                        }),
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
                                  const codeBlockMatch = msg.content.match(/```(?:\w+)?\n([\s\S]*?)```/);
                                  if (codeBlockMatch && codeBlockMatch[1].trim().length > 50) {
                                    insertContent = codeBlockMatch[1].trim();
                                  } else {
                                    // Strip markdown headers that look like meta commentary (not section content)
                                    insertContent = insertContent
                                      .replace(/^\*\*[A-Z][^*]+\*\*\s*[-—]\s*/gm, '') // "**Draft Ready** —" prefix
                                      .replace(/^#{1,3}\s+(?:Draft|Note|Summary|Action)\b[^\n]*/gm, '') // Meta headers
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
                                        const res = await fetch('/api/ana-ri/generate', {
                                          method: 'POST',
                                          headers: getAuthHeaders(),
                                          body: JSON.stringify({
                                            action_type: action.type,
                                            conversation_context: messages.slice(-20).map(m => ({
                                              role: m.role,
                                              content: m.content,
                                            })),
                                            project_id: contextProfile.projectId,
                                            user_role: contextProfile?.userRole || undefined,
                                            intent_lens:
                                              intentLens !== 'auto' ? intentLens : undefined,
                                          }),
                                        });
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
        <div className="max-w-3xl mx-auto">
          {/* Clear conversation button */}
          {hasMessages && (
            <div className="flex justify-center mb-2">
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

            {/* AnA RI Intent Lens selector — only in standard mode */}
            {chatMode === 'standard' && (
              <div className="relative flex-shrink-0 self-center" ref={lensDropdownRef}>
                <button
                  type="button"
                  onClick={() => setShowLensDropdown(prev => !prev)}
                  className={cn(
                    'flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium transition-colors',
                    intentLens !== 'auto'
                      ? 'bg-[#FBF0EB] text-[#D97757] hover:bg-[#F5E1D6]'
                      : 'text-[#B0AEA5] hover:bg-[#F5F4EF] hover:text-[#6B6962]'
                  )}
                  title="Intent lens"
                >
                  {INTENT_LENSES.find(l => l.id === intentLens)?.icon}
                  <span className="hidden sm:inline">
                    {INTENT_LENSES.find(l => l.id === intentLens)?.label}
                  </span>
                  <ChevronDown className="w-3 h-3 opacity-50" />
                </button>

                {showLensDropdown && (
                  <div className="absolute bottom-full left-0 mb-1.5 w-52 bg-white rounded-xl border border-[#E8E6DC] shadow-lg py-1 z-50">
                    {INTENT_LENSES.map(lens => (
                      <button
                        key={lens.id}
                        type="button"
                        onClick={() => {
                          setIntentLens(lens.id);
                          setShowLensDropdown(false);
                        }}
                        className={cn(
                          'w-full flex items-start gap-3 px-3 py-2 text-left hover:bg-[#FAF9F5] transition-colors',
                          intentLens === lens.id && 'bg-[#FAF9F5]'
                        )}
                      >
                        <span
                          className={cn(
                            'mt-0.5 flex-shrink-0',
                            intentLens === lens.id ? 'text-[#D97757]' : 'text-[#8A8880]'
                          )}
                        >
                          {lens.icon}
                        </span>
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-[#141413]">{lens.label}</div>
                          <div className="text-[10px] text-[#B0AEA5] leading-tight">
                            {lens.description}
                          </div>
                        </div>
                        {intentLens === lens.id && (
                          <Check className="w-4 h-4 text-[#D97757] ml-auto mt-0.5 flex-shrink-0" />
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Input */}
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
              placeholder={
                chatMode === 'deep-research'
                  ? 'Ask a deep research question...'
                  : chatMode === 'nano-banana'
                    ? 'Describe an image, infographic, or presentation...'
                    : intentLens !== 'auto'
                      ? `Message AnA (${intentLens} lens)...`
                      : 'Message AnA...'
              }
              rows={1}
              className="flex-1 resize-none bg-transparent border-none outline-none text-[#141413] placeholder:text-[#B0AEA5] text-sm leading-6 min-h-[24px] max-h-[120px]"
            />

            {/* Send */}
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
};

export default AnaPersistentPanel;
