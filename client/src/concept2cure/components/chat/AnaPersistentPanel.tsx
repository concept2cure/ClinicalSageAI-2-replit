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
      ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'b', 'i', 'u', 'a', 'ul', 'ol', 'li',
        'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'pre', 'code',
        'table', 'thead', 'tbody', 'tr', 'th', 'td', 'span', 'div', 'hr', 'sup', 'sub'],
      ALLOWED_ATTR: ['href', 'target', 'rel', 'class', 'id'],
    });
  } catch {
    return content.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
};

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
  { id: 'auto', label: 'Auto', description: 'AnA detects intent automatically', icon: <Sparkles className="w-3.5 h-3.5" /> },
  { id: 'audit', label: 'Audit', description: 'Review like a regulator', icon: <Search className="w-3.5 h-3.5" /> },
  { id: 'improve', label: 'Improve', description: 'Strengthen writing and structure', icon: <PenTool className="w-3.5 h-3.5" /> },
  { id: 'risk', label: 'Risk', description: 'Predict deficiencies and rejections', icon: <AlertTriangle className="w-3.5 h-3.5" /> },
  { id: 'strategy', label: 'Strategy', description: 'Regulatory pathway analysis', icon: <Target className="w-3.5 h-3.5" /> },
  { id: 'compare', label: 'Compare', description: 'Side-by-side analysis', icon: <GitCompare className="w-3.5 h-3.5" /> },
];

interface AnaRIOrchestration {
  detectedIntent: { lens: IntentLens; confidence: number; signals: string[] };
  detectedSubmissionType: string | null;
  appliedRole: string;
  suggestedActions: string[];
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
  { type: 'revised_artifact', label: 'Revise Document', icon: <FileEdit className="w-3.5 h-3.5" /> },
  { type: 'risk_memo', label: 'Create Risk Memo', icon: <AlertTriangle className="w-3.5 h-3.5" /> },
  { type: 'deficiency_preemption_memo', label: 'Deficiency Preemption', icon: <Shield className="w-3.5 h-3.5" /> },
  { type: 'rewritten_section', label: 'Rewrite Section', icon: <PenTool className="w-3.5 h-3.5" /> },
  { type: 'strategy_note', label: 'Strategy Note', icon: <Target className="w-3.5 h-3.5" /> },
  { type: 'evidence_memo', label: 'Evidence Memo', icon: <FileSearch className="w-3.5 h-3.5" /> },
  { type: 'reviewer_question_brief', label: 'Reviewer Brief', icon: <HelpCircle className="w-3.5 h-3.5" /> },
  { type: 'attach_to_dossier', label: 'Attach to Dossier', icon: <FolderPlus className="w-3.5 h-3.5" /> },
];

interface AnaPersistentPanelProps {
  contextProfile?: {
    productType?: string;
    userRole?: string;
    screenName?: string;
    activeProject?: string;
    projectId?: string;
  };
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
  /**
   * "full" = fills all available space, shows greeting + suggested actions (Claude.ai style)
   * "compact" = just the input bar at bottom, conversation expands as overlay
   */
  mode?: 'full' | 'compact';
  /** Pre-select the chat mode (standard, deep-research, or nano-banana) */
  defaultChatMode?: 'standard' | 'deep-research' | 'nano-banana';
}

// ─── Context labels ──────────────────────────────────────────────────────────

const SCREEN_LABELS: Record<string, string> = {
  'regulatory-workspace': 'Regulatory Workspace',
  'ind-workspace': 'IND Workspace',
  author: 'Author',
  'collaboration-hub': 'Collaboration',
  'intelligence-hub': 'Intelligence',
  'review-readiness': 'Review & Readiness',
  'command-center': 'Command Center',
  biostatistics: 'Biostatistics',
  'agent-hub': 'Agent Hub',
  snowglobe: 'SnowGlobe',
  'review-pulse': 'Review Pulse',
  'legal-center': 'Legal Center',
  'training-center': 'Training Center',
  'knowledge-base': 'Knowledge Base',
  cmc: 'CMC Platform',
  'deep-research': 'Deep Research',
  'document-builder': 'Document Builder',
  projects: 'Home',
};

// ─── Component ───────────────────────────────────────────────────────────────

const AnaPersistentPanel: React.FC<AnaPersistentPanelProps> = ({
  contextProfile,
  suggestedActions,
  greeting,
  initialMessage,
  onActionRun,
  onNavigate,
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
  const [chatMode, setChatMode] = useState<'standard' | 'deep-research' | 'nano-banana'>(defaultChatMode);
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

  const screenName = contextProfile?.screenName || 'default';
  const screenLabel = SCREEN_LABELS[screenName] || '';

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
      'Querying ClinicalTrials.gov for matching studies...',
      'Searching PubMed for relevant literature...',
      'Checking FDA approval histories...',
      'Scanning EMA assessment reports...',
      'Aggregating results across data sources...',
      'Cross-referencing regulatory precedents...',
      'Building the competitive landscape...',
      'Claude is synthesizing findings into a briefing...',
      'Analyzing evidence coverage gaps...',
      'Ranking results by regulatory relevance...',
    ];
    const ANA_THINKING_MESSAGES = chatMode === 'deep-research' ? DEEP_RESEARCH_THINKING : STANDARD_THINKING;
    setThinkingMsg(ANA_THINKING_MESSAGES[Math.floor(Math.random() * ANA_THINKING_MESSAGES.length)]);
    const interval = setInterval(() => {
      setThinkingMsg(ANA_THINKING_MESSAGES[Math.floor(Math.random() * ANA_THINKING_MESSAGES.length)]);
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

  const handleSend = useCallback(async (messageText?: string) => {
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
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: { indication: text, keywords: text.split(/\s+/).filter(w => w.length > 3) },
            connectorIds: ['clinical_trials_gov', 'pubmed', 'fda_drugs', 'ema_epar'],
            depth: 'standard',
            projectId: contextProfile?.projectId || null,
          }),
        });

        if (!launchRes.ok) {
          const err = await launchRes.json().catch(() => ({ error: 'Failed to launch research job' }));
          throw new Error(err.error || `HTTP ${launchRes.status}`);
        }

        const job = await launchRes.json();
        const jobId = job.id;

        // Add progress message that we'll update
        const progressMsgId = `dr-${Date.now()}`;
        setMessages(prev => [...prev, {
          id: progressMsgId,
          role: 'assistant',
          content: `**Deep Research initiated** — searching ClinicalTrials.gov, PubMed, FDA, EMA...\n\nProgress: 0%`,
          timestamp: new Date(),
        }]);

        // Stream progress via SSE
        const eventSource = new EventSource(`/api/deep-research/jobs/${jobId}/stream`);

        eventSource.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);

            if (data.error) {
              eventSource.close();
              setMessages(prev => prev.map(m =>
                m.id === progressMsgId
                  ? { ...m, content: `**Deep Research failed:** ${data.error}` }
                  : m
              ));
              setIsThinking(false);
              return;
            }

            const statusLabel = data.status === 'synthesizing' ? 'Synthesizing findings with Claude...' : 'Searching data sources...';
            setMessages(prev => prev.map(m =>
              m.id === progressMsgId
                ? { ...m, content: `**Deep Research in progress** — ${statusLabel}\n\nProgress: ${data.progress}%` }
                : m
            ));

            if (data.status === 'complete' || data.status === 'failed') {
              eventSource.close();

              // Fetch final results
              fetch(`/api/deep-research/jobs/${jobId}`)
                .then(r => r.json())
                .then(finalJob => {
                  const synthesis = finalJob.synthesis || 'Research complete. No synthesis available.';
                  const totalResults = finalJob.results?.totalResults || 0;
                  setMessages(prev => prev.map(m =>
                    m.id === progressMsgId
                      ? { ...m, content: `**Deep Research complete** — ${totalResults} sources analyzed\n\n---\n\n${synthesis}` }
                      : m
                  ));
                })
                .catch(() => {
                  setMessages(prev => prev.map(m =>
                    m.id === progressMsgId
                      ? { ...m, content: `**Deep Research complete** — results are available in the research dashboard.` }
                      : m
                  ));
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
                setMessages(prev => prev.map(m =>
                  m.id === progressMsgId
                    ? { ...m, content: `**Deep Research complete** — ${totalResults} sources analyzed\n\n---\n\n${synthesis}` }
                    : m
                ));
              } else {
                setMessages(prev => prev.map(m =>
                  m.id === progressMsgId
                    ? { ...m, content: `**Deep Research** — Job #${jobId} is still running. Check the research dashboard for results.` }
                    : m
                ));
              }
            })
            .catch(() => {})
            .finally(() => setIsThinking(false));
        };

      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Unknown error';
        setMessages(prev => [...prev, {
          id: `a-${Date.now()}`,
          role: 'assistant',
          content: `**Deep Research could not be launched:** ${errorMsg}\n\nThis may be due to quota limits or missing permissions. Try again or switch to standard mode.`,
          timestamp: new Date(),
        }]);
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
          headers: { 'Content-Type': 'application/json' },
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
          const blob = new Blob(
            [Uint8Array.from(atob(data.pptx.base64), c => c.charCodeAt(0))],
            { type: data.pptx.mimeType }
          );
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = data.pptx.filename;
          a.click();
          URL.revokeObjectURL(url);
        }

        setMessages(prev => [...prev, {
          id: `a-${Date.now()}`,
          role: 'assistant',
          content: data.response || 'Here are your results.',
          timestamp: new Date(),
          images: data.images,
          pptx: data.pptx,
        }]);
      } else {
        // Standard mode → AnA RI orchestrated chat (falls back to Cortex)
        const anaRiPayload = {
          message: text,
          intent_lens: intentLens !== 'auto' ? intentLens : undefined,
          user_role: contextProfile?.userRole || undefined,
          project_context: contextProfile?.activeProject ? {
            productName: contextProfile.activeProject,
            submissionType: contextProfile.productType,
          } : undefined,
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
        let response = await fetch('/api/ana-ri/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(anaRiPayload),
        });

        if (!response.ok) {
          // Fallback to Cortex unified chat
          response = await fetch('/api/cortex/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
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

        // Capture orchestration metadata from AnA RI
        if (data.orchestration) {
          setLastOrchestration(data.orchestration);
        }

        const responseContent = data.response || data.answer || 'I\'m here to help with your regulatory work. What would you like to work on?';

        // Parse and execute any embedded commands from AnA
        const commandBlocks = responseContent.match(/```command\n([\s\S]*?)```/g);
        const commandResults: string[] = [];
        if (commandBlocks) {
          for (const block of commandBlocks) {
            try {
              const jsonStr = block.replace(/```command\n?/, '').replace(/```$/, '').trim();
              const cmd = JSON.parse(jsonStr);
              if (cmd.command) {
                const execRes = await fetch('/api/ana-ri/execute', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(cmd),
                });
                if (execRes.ok) {
                  const result = await execRes.json();
                  commandResults.push(`**${result.action}**: ${result.message}`);
                }
              }
            } catch {
              // Skip unparseable command blocks
            }
          }
        }

        // Clean command blocks from visible response and append results
        let cleanContent = responseContent.replace(/```command\n[\s\S]*?```/g, '').trim();
        if (commandResults.length > 0) {
          cleanContent += '\n\n---\n**Executed:**\n' + commandResults.map(r => `- ${r}`).join('\n');
        }

        setMessages(prev => [...prev, {
          id: `a-${Date.now()}`,
          role: 'assistant',
          content: cleanContent,
          timestamp: new Date(),
        }]);
      }
    } catch (err: any) {
      setMessages(prev => [...prev, {
        id: `a-${Date.now()}`,
        role: 'assistant',
        content: `Sorry, I encountered an error processing your request. Please try again.`,
        timestamp: new Date(),
        isError: true,
      }]);
    } finally {
      setIsThinking(false);
    }
  }, [input, isThinking, messages, contextProfile, chatMode, intentLens]);

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

    // Route AI-actionable intents through the unified action system
    // Phase 1: Map known intents to AI actions; fall through to chat for unknown
    const aiActionMap: Record<string, { actionType: AIActionType; targetType: 'artifact' | 'document' }> = {
      'validation.run': { actionType: 'run_validation', targetType: 'artifact' },
      'artifact.promote': { actionType: 'promote_artifact', targetType: 'artifact' },
      'document.export': { actionType: 'export_document', targetType: 'document' },
      'document.version': { actionType: 'save_document_version', targetType: 'document' },
      'document.route': { actionType: 'route_document_to_module', targetType: 'document' },
    };
    const mappedEntry = action.intent ? aiActionMap[action.intent] : undefined;
    const projectId = contextProfile?.projectId ? Number(contextProfile.projectId) : NaN;
    if (mappedEntry && !isNaN(projectId)) {
      aiAction.execute({
        actionType: mappedEntry.actionType,
        targetType: mappedEntry.targetType,
        targetId: (action as any).targetId || null,
        projectId,
        sourceSurface: 'global_panel' as AIActionSourceSurface,
        payload: (action as any).payload || {},
      }).then(result => {
        if (onActionRun) {
          onActionRun({
            id: action.id,
            intent: action.intent!,
            label: action.label,
            status: result.success ? 'done' : 'failed',
            ts: Date.now(),
          });
        }
      }).catch((err) => {
        // Notify caller of failure so UI can reflect the error
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
          <div className="max-h-[50vh] overflow-y-auto zen-scroll border-t border-[#F5F4EF]" style={{ scrollbarWidth: 'thin' }}>
            {messages.map(msg => {
              const isUser = msg.role === 'user';
              const htmlContent = !isUser ? renderMarkdown(msg.content) : '';
              return (
                <div key={msg.id} className={cn('group px-4 py-3', isUser ? 'bg-[#FAF9F5]/60' : 'bg-white')}>
                  <div className="flex gap-2.5 max-w-3xl mx-auto">
                    <div className={cn('w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5', isUser ? 'bg-[#4D4B45] text-white' : 'bg-[#D97757]')}>
                      {isUser ? <span className="text-[9px] font-bold">{(contextProfile?.userRole?.[0] || 'Y').toUpperCase()}</span> : <Sparkles className="w-3 h-3 text-white" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-xs font-semibold text-[#2D2C28]">{isUser ? 'You' : 'AnA'}</span>
                      {isUser ? (
                        <p className="text-sm text-[#2D2C28] leading-relaxed whitespace-pre-wrap mt-0.5">{msg.content}</p>
                      ) : (
                        <div className="prose prose-sm prose-stone max-w-none mt-0.5 prose-p:text-[#4D4B45] prose-p:leading-relaxed prose-p:my-1.5 prose-strong:text-[#141413] [&>*:first-child]:mt-0 [&>*:last-child]:mb-0" dangerouslySetInnerHTML={{ __html: htmlContent }} />
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
            {isThinking && (
              <div className="px-4 py-3 bg-white">
                <div className="flex gap-2.5 max-w-3xl mx-auto">
                  <div className="w-6 h-6 rounded-full bg-[#D97757] flex items-center justify-center flex-shrink-0 mt-0.5"><Sparkles className="w-3 h-3 text-white" /></div>
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
            <div className={cn(
              'flex items-end gap-2 px-3.5 py-2.5 bg-[#FAF9F5] border rounded-2xl transition-colors duration-150',
              isFocused ? 'border-[#D8D5CA] ring-2 ring-[#F5F4EF] bg-white shadow-sm' : 'border-[#E8E6DC] hover:border-[#D8D5CA]'
            )}>
              <div className="flex items-center gap-1.5 flex-shrink-0 self-center">
                <Sparkles className="w-4 h-4 text-[#D97757]" />
                {screenLabel && <span className="text-[10px] text-[#B0AEA5] font-medium hidden sm:inline">{screenLabel}</span>}
              </div>
              <textarea ref={inputRef} value={input} onChange={e => setInput(e.target.value)} onKeyDown={handleKeyDown} onFocus={() => setIsFocused(true)} onBlur={() => setIsFocused(false)} placeholder="Message AnA..." rows={1} className="flex-1 resize-none bg-transparent border-none outline-none text-[#141413] placeholder:text-[#B0AEA5] text-sm leading-6 min-h-[24px] max-h-[120px]" />
              {hasMessages && (
                <button onClick={() => { setMessages([]); setLastOrchestration(null); }} className="flex-shrink-0 p-1.5 text-[#B0AEA5] hover:text-[#6B6962] rounded-lg transition-colors" title="New thread">
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
              )}
              <button onClick={() => handleSend()} disabled={!input.trim() || isThinking} className={cn('flex-shrink-0 p-2 rounded-full transition-colors duration-150', input.trim() && !isThinking ? 'bg-[#141413] text-white hover:bg-[#2D2C28]' : 'bg-[#E8E6DC] text-[#B0AEA5] cursor-not-allowed')} aria-label="Send message">
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
      <div className="flex-1 overflow-y-auto zen-scroll" style={{ scrollbarWidth: 'thin' }}>
        {!hasMessages && !isThinking ? (
          /* ── Empty state: greeting + suggested actions ── */
          <div className="flex flex-col items-center justify-center h-full px-6">
            <div className="max-w-2xl w-full text-center">
              {/* Greeting */}
              <div className="mb-8">
                <div className="w-10 h-10 rounded-full bg-[#D97757] flex items-center justify-center mx-auto mb-4">
                  <Sparkles className="w-5 h-5 text-white" />
                </div>
                <h2 className="text-xl font-semibold text-[#141413]">{defaultGreeting}</h2>
                {screenLabel && (
                  <p className="text-sm text-[#B0AEA5] mt-1">{screenLabel}</p>
                )}
              </div>

              {/* Suggested actions */}
              {suggestedActions && suggestedActions.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-lg mx-auto">
                  {suggestedActions.slice(0, 4).map(action => (
                    <button
                      key={action.id}
                      onClick={() => handleSuggestedAction(action)}
                      className="text-left px-4 py-3 rounded-xl border border-[#E8E6DC] hover:border-[#D8D5CA] hover:bg-[#FAF9F5] transition-colors group"
                    >
                      <p className="text-sm font-medium text-[#4D4B45] group-hover:text-[#141413]">{action.label}</p>
                      {action.description && (
                        <p className="text-xs text-[#B0AEA5] mt-0.5 line-clamp-1">{action.description}</p>
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
                  className={cn(
                    'group px-4 py-3',
                    isUser ? 'bg-[#FAF9F5]/60' : 'bg-white'
                  )}
                  onMouseEnter={() => !isUser && setShowActions(msg.id)}
                  onMouseLeave={() => setShowActions(null)}
                >
                  <div className="flex gap-2.5 max-w-3xl mx-auto">
                    <div className={cn(
                      'w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5',
                      isUser ? 'bg-[#4D4B45] text-white' : 'bg-[#D97757]'
                    )}>
                      {isUser ? (
                        <span className="text-[9px] font-bold">{(contextProfile?.userRole?.[0] || 'Y').toUpperCase()}</span>
                      ) : (
                        <Sparkles className="w-3 h-3 text-white" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-xs font-semibold text-[#2D2C28]">{isUser ? 'You' : 'AnA'}</span>
                      {isUser ? (
                        <p className="text-sm text-[#2D2C28] leading-relaxed whitespace-pre-wrap mt-0.5">{msg.content}</p>
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
                        <div className={cn(
                          'flex items-center gap-0.5 mt-1 transition-opacity duration-150',
                          showActions === msg.id ? 'opacity-100' : 'opacity-0'
                        )}>
                          <button onClick={() => handleCopy(msg.id, msg.content)} className="p-1 text-[#B0AEA5] hover:text-[#4D4B45] hover:bg-[#F5F4EF] rounded transition-colors" title="Copy">
                            {copiedId === msg.id ? <Check className="w-3 h-3 text-green-600" /> : <Copy className="w-3 h-3" />}
                          </button>
                          <button onClick={() => console.info(`[chat-feedback] messageId=${msg.id} positive=true`)} className="p-1 text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 rounded transition-colors" title="Good"><ThumbsUp className="w-3 h-3" /></button>
                          <button onClick={() => console.info(`[chat-feedback] messageId=${msg.id} positive=false`)} className="p-1 text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 rounded transition-colors" title="Bad"><ThumbsDown className="w-3 h-3" /></button>
                        </div>
                      )}
                      {/* AnA RI Document Action Row — shown on the last assistant message */}
                      {!isUser && msg.id === messages.filter(m => m.role === 'assistant').at(-1)?.id && lastOrchestration && (
                        <div className="mt-3 pt-3 border-t border-[#F5F4EF]">
                          <p className="text-[10px] font-medium text-[#B0AEA5] uppercase tracking-wide mb-2">Document Actions</p>
                          <div className="flex flex-wrap gap-1.5">
                            {DOCUMENT_ACTION_CONFIGS
                              .filter(a => !lastOrchestration.suggestedActions.length || lastOrchestration.suggestedActions.includes(a.type) || ['revised_artifact', 'attach_to_dossier'].includes(a.type))
                              .slice(0, 5)
                              .map(action => (
                                <button
                                  key={action.type}
                                  disabled={isThinking}
                                  onClick={async () => {
                                    if (isThinking) return;
                                    if (!contextProfile?.projectId) {
                                      setMessages(prev => [...prev, {
                                        id: `a-${Date.now()}`,
                                        role: 'assistant',
                                        content: `**Cannot create artifact** — No project selected. Please open a project first, then try again.`,
                                        timestamp: new Date(),
                                      }]);
                                      return;
                                    }
                                    setIsThinking(true);
                                    try {
                                      const res = await fetch('/api/ana-ri/generate', {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({
                                          action_type: action.type,
                                          conversation_context: messages.slice(-20).map(m => ({
                                            role: m.role,
                                            content: m.content,
                                          })),
                                          project_id: contextProfile.projectId,
                                          user_role: contextProfile?.userRole || undefined,
                                          intent_lens: intentLens !== 'auto' ? intentLens : undefined,
                                        }),
                                      });
                                      if (res.ok) {
                                        const data = await res.json();
                                        let statusLine = '';
                                        if (data.artifactId) {
                                          statusLine = `\n\n---\n**${action.label} created** | Artifact #${data.artifactId} | Quality: ${data.qualityGrade || 'draft'} | ${data.isNew ? 'New' : 'Updated'}`;
                                        } else if (data.persisted === false) {
                                          statusLine = '\n\n---\n**Warning:** Content generated but could not be saved to project. Please copy this content.';
                                        }
                                        setMessages(prev => [...prev, {
                                          id: `a-${Date.now()}`,
                                          role: 'assistant',
                                          content: data.content + statusLine,
                                          timestamp: new Date(),
                                        }]);
                                        setIsThinking(false);
                                      } else {
                                        // Fallback: send as chat prompt (handleSend manages isThinking)
                                        handleSend(`Please generate a ${action.label.toLowerCase()} based on our conversation above.`);
                                      }
                                    } catch {
                                      // Fallback: send as chat prompt (handleSend manages isThinking)
                                      handleSend(`Please generate a ${action.label.toLowerCase()} based on our conversation above.`);
                                    }
                                  }}
                                  className={cn(
                                    "inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-colors",
                                    isThinking
                                      ? "border-[#E8E6DC] text-[#D8D5CA] cursor-not-allowed"
                                      : "border-[#E8E6DC] text-[#6B6962] hover:bg-[#FAF9F5] hover:border-[#D8D5CA] hover:text-[#4D4B45]"
                                  )}
                                >
                                  {action.icon}
                                  {action.label}
                                </button>
                              ))}
                          </div>
                          {lastOrchestration.detectedSubmissionType && (
                            <p className="text-[10px] text-[#B0AEA5] mt-2">
                              Detected: {lastOrchestration.detectedSubmissionType.toUpperCase()} submission
                              {lastOrchestration.detectedIntent.lens !== 'auto' && ` | ${lastOrchestration.detectedIntent.lens} lens`}
                            </p>
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
                      <span className="text-xs text-[#D97757] font-medium">{thinkingMsg || 'Thinking...'}</span>
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
                onClick={() => { setMessages([]); setLastOrchestration(null); }}
                className="flex items-center gap-1.5 px-3 py-1 text-xs text-[#B0AEA5] hover:text-[#6B6962] hover:bg-[#F5F4EF] rounded-full transition-colors"
              >
                <RotateCcw className="w-3 h-3" />
                New thread
              </button>
            </div>
          )}

          <div className={cn(
            'flex items-end gap-2 px-3.5 py-2.5 bg-[#FAF9F5] border rounded-2xl transition-colors duration-150',
            isFocused
              ? 'border-[#D8D5CA] ring-2 ring-[#F5F4EF] bg-white shadow-sm'
              : 'border-[#E8E6DC] hover:border-[#D8D5CA]'
          )}>
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
                  {chatMode === 'deep-research' ? 'Deep Research' : chatMode === 'nano-banana' ? 'Nano Banana' : 'AnA'}
                </span>
                <ChevronDown className="w-3 h-3 opacity-50" />
              </button>

              {showModeDropdown && (
                <div className="absolute bottom-full left-0 mb-1.5 w-56 bg-white rounded-xl border border-[#E8E6DC] shadow-lg py-1 z-50">
                  <button
                    type="button"
                    onClick={() => { setChatMode('standard'); setIntentLens('auto'); setShowModeDropdown(false); }}
                    className={cn(
                      'w-full flex items-start gap-3 px-3 py-2.5 text-left hover:bg-[#FAF9F5] transition-colors',
                      chatMode === 'standard' && 'bg-[#FAF9F5]'
                    )}
                  >
                    <MessageSquare className="w-4 h-4 mt-0.5 text-[#8A8880] flex-shrink-0" />
                    <div>
                      <div className="text-sm font-medium text-[#141413]">AnA</div>
                      <div className="text-[11px] text-[#B0AEA5] leading-tight">Fast regulatory co-pilot for everyday questions</div>
                    </div>
                    {chatMode === 'standard' && <Check className="w-4 h-4 text-[#D97757] ml-auto mt-0.5 flex-shrink-0" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setChatMode('deep-research'); setShowModeDropdown(false); }}
                    className={cn(
                      'w-full flex items-start gap-3 px-3 py-2.5 text-left hover:bg-[#FAF9F5] transition-colors',
                      chatMode === 'deep-research' && 'bg-[#FBF0EB]'
                    )}
                  >
                    <Zap className="w-4 h-4 mt-0.5 text-[#D97757] flex-shrink-0" />
                    <div>
                      <div className="text-sm font-medium text-[#141413]">Deep Research</div>
                      <div className="text-[11px] text-[#B0AEA5] leading-tight">Multi-source search across ClinicalTrials.gov, PubMed, FDA &amp; more</div>
                    </div>
                    {chatMode === 'deep-research' && <Check className="w-4 h-4 text-[#D97757] ml-auto mt-0.5 flex-shrink-0" />}
                  </button>
                  <div className="mx-2 my-0.5 border-t border-zinc-100" />
                  <button
                    type="button"
                    onClick={() => { setChatMode('nano-banana'); setShowModeDropdown(false); }}
                    className={cn(
                      'w-full flex items-start gap-3 px-3 py-2.5 text-left hover:bg-zinc-50 transition-colors',
                      chatMode === 'nano-banana' && 'bg-amber-50'
                    )}
                  >
                    <ImageIcon className="w-4 h-4 mt-0.5 text-amber-600 flex-shrink-0" />
                    <div>
                      <div className="text-sm font-medium text-zinc-900">Nano Banana</div>
                      <div className="text-[11px] text-zinc-400 leading-tight">AI image generation, presentations &amp; visual design via Gemini</div>
                    </div>
                    {chatMode === 'nano-banana' && <Check className="w-4 h-4 text-amber-600 ml-auto mt-0.5 flex-shrink-0" />}
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
                        onClick={() => { setIntentLens(lens.id); setShowLensDropdown(false); }}
                        className={cn(
                          'w-full flex items-start gap-3 px-3 py-2 text-left hover:bg-[#FAF9F5] transition-colors',
                          intentLens === lens.id && 'bg-[#FAF9F5]'
                        )}
                      >
                        <span className={cn(
                          'mt-0.5 flex-shrink-0',
                          intentLens === lens.id ? 'text-[#D97757]' : 'text-[#8A8880]'
                        )}>
                          {lens.icon}
                        </span>
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-[#141413]">{lens.label}</div>
                          <div className="text-[10px] text-[#B0AEA5] leading-tight">{lens.description}</div>
                        </div>
                        {intentLens === lens.id && <Check className="w-4 h-4 text-[#D97757] ml-auto mt-0.5 flex-shrink-0" />}
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
              placeholder={chatMode === 'deep-research' ? 'Ask a deep research question...' : chatMode === 'nano-banana' ? 'Describe an image, infographic, or presentation...' : intentLens !== 'auto' ? `Message AnA (${intentLens} lens)...` : 'Message AnA...'}
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
