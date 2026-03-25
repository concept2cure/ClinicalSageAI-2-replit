/**
 * @fileoverview AnA — AI Chat Panel (Claude-style streaming experience)
 * @module concept2cure/components/chat/AnaPersistentPanel
 * @version 5.0.0
 *
 * Complete rewrite for natural, streaming conversation.
 * Tokens stream in real-time via SSE. Clean typography.
 * No visual noise. Feels like talking to Claude.
 */

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import {
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
  Square,
  Paperclip,
  X,
} from 'lucide-react';

marked.setOptions({ breaks: true, gfm: true });

const renderMarkdown = (content: string): string => {
  try {
    const rawHtml = marked.parse(content) as string;
    return DOMPurify.sanitize(rawHtml, {
      ALLOWED_TAGS: [
        'p', 'br', 'strong', 'em', 'b', 'i', 'u', 'a',
        'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
        'blockquote', 'pre', 'code', 'table', 'thead', 'tbody',
        'tr', 'th', 'td', 'span', 'div', 'hr', 'sup', 'sub',
      ],
      ALLOWED_ATTR: ['href', 'target', 'rel', 'class', 'id'],
    });
  } catch {
    return content.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
};

// ─── Auth headers for raw fetch (SSE streaming + file upload need raw fetch) ──

function getAuthHeaders(): Record<string, string> {
  const orgId = localStorage.getItem('organizationId') || localStorage.getItem('currentOrganizationId') || '1';
  const token = localStorage.getItem('token') || localStorage.getItem('authToken') || localStorage.getItem('auth_token') || '';
  return {
    'x-organization-id': orgId,
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

// ─── Link extraction — surface regulatory references ─────────────────────────

function extractLinks(content: string): Array<{ url: string; label: string }> {
  const urlRegex = /https?:\/\/[^\s)<>\]]+/g;
  const seen = new Set<string>();
  const links: Array<{ url: string; label: string }> = [];
  let match;
  while ((match = urlRegex.exec(content)) !== null) {
    const url = match[0].replace(/[.,;:!?)]+$/, ''); // trim trailing punctuation
    if (seen.has(url)) continue;
    seen.add(url);
    // Generate short label from domain
    try {
      const domain = new URL(url).hostname.replace('www.', '');
      links.push({ url, label: domain });
    } catch {
      links.push({ url, label: url.slice(0, 40) });
    }
  }
  return links.slice(0, 5);
}

// ─── Estimate token count for health monitoring ──────────────────────────────

function estimateTokens(messages: Array<{ content: string }>): number {
  return messages.reduce((sum, m) => sum + Math.ceil(m.content.length / 4), 0);
}

// ─── Types ───────────────────────────────────────────────────────────────────

interface AnaMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  isStreaming?: boolean;
  images?: Array<{ base64: string; mimeType: string }>;
  pptx?: { base64: string; filename: string; mimeType: string };
  savedAsArtifact?: boolean;
  insertedToEditor?: boolean;
  executedActions?: Array<{ action: string; success: boolean; message?: string; artifactId?: string }>;
}

interface SuggestedAction {
  id: string;
  label: string;
  intent?: string;
  description?: string;
}

// ─── Authoring context import ────────────────────────────────────────────────
import type { AuthoringContextPack } from '../../../../../shared/types/authoring-context';
import { hasSectionContext, hasArtifactContext } from '../../../../../shared/types/authoring-context';
import { serializeContextForChat } from '../../services/authoring-context-resolver';

interface AnaPersistentPanelProps {
  contextProfile?: {
    productType?: string;
    userRole?: string;
    screenName?: string;
    activeProject?: string;
    projectId?: string;
    moduleContext?: Record<string, unknown>;
  };
  authoringContext?: AuthoringContextPack | null;
  suggestedActions?: SuggestedAction[];
  greeting?: string;
  initialMessage?: string | null;
  onActionRun?: (entry: {
    id: string;
    intent: string;
    label: string;
    status: 'running' | 'done' | 'failed';
    ts: number;
  }) => void;
  onNavigate?: (path: string) => void;
  onDraftInsert?: (content: string, title: string, ctdSection?: string) => void;
  onNavigateToSection?: (sectionCode: string) => void;
  onOpenArtifact?: (artifactId: string) => void;
  onRequestPromotion?: (artifactId: string) => Promise<{ promoted: boolean; message: string }>;
  onOpenCompareInspector?: () => void;
  onRefreshIntelligence?: () => void;
  mode?: 'full' | 'compact';
  defaultChatMode?: 'standard' | 'deep-research' | 'nano-banana';
}

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
  const { toast } = useToast();

  const [messages, setMessages] = useState<AnaMessage[]>([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isFocused, setIsFocused] = useState(false);
  const [chatMode, setChatMode] = useState<'standard' | 'deep-research' | 'nano-banana'>(defaultChatMode);
  const [showModeDropdown, setShowModeDropdown] = useState(false);
  const [hoveredMsgId, setHoveredMsgId] = useState<string | null>(null);
  const [intentLens, setIntentLens] = useState<'auto' | 'audit' | 'improve' | 'risk' | 'strategy' | 'compare'>('auto');
  const [attachedFiles, setAttachedFiles] = useState<Array<{ name: string; id: string }>>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const modeDropdownRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const initialMessageSentRef = useRef(false);
  const threadIdRef = useRef<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const streamingMsgIdRef = useRef<string | null>(null);

  // ── Close mode dropdown on outside click ──
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

  // ── Default greeting ──
  const defaultGreeting = useMemo(() => {
    if (greeting) return greeting;
    const hour = new Date().getHours();
    const timeGreeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
    if (contextProfile?.activeProject) {
      return `${timeGreeting}. What are you working on with ${contextProfile.activeProject}?`;
    }
    return `${timeGreeting}. What can I help you with?`;
  }, [greeting, contextProfile?.activeProject]);

  // ── Authoring-aware suggested actions (full set) ──
  const authoringSuggestedActions = useMemo<SuggestedAction[]>(() => {
    if (!authoringContext) return [];
    const actions: SuggestedAction[] = [];
    const stage = authoringContext.workflowStage;

    actions.push({ id: 'resume-last-section', label: 'Resume last section', intent: 'resume_last_section', description: 'Open the most recently edited section' });

    if (hasSectionContext(authoringContext)) {
      actions.push({ id: 'draft-section', label: `Draft ${authoringContext.sectionCode}: ${authoringContext.sectionTitle || 'this section'}`, intent: 'draft_section_from_context', description: 'Generate a compliant first draft' });
    }

    if (stage === 'section-workspace' || stage === 'review') {
      actions.push({ id: 'explain-blockers', label: 'What blocks promotion?', intent: 'explain_promotion_blockers', description: 'Show readiness issues blocking this section' });
    }

    if (hasArtifactContext(authoringContext)) {
      actions.push({ id: 'compare-approved', label: 'Compare to last approved', intent: 'compare_against_approved', description: 'Show changes since the last approved version' });
    }

    if (hasSectionContext(authoringContext)) {
      actions.push({ id: 'section-preflight', label: 'Run section preflight', intent: 'section_preflight', description: 'Check body, consistency, and readiness before promotion' });
    }

    if (authoringContext.moduleCode) {
      actions.push({ id: 'module-preflight', label: `Run ${authoringContext.moduleCode.toUpperCase()} preflight`, intent: 'module_preflight', description: 'Check all sections in this module' });
    }

    if (stage === 'dossier' || stage === 'submissions' || stage === 'review') {
      actions.push({ id: 'dossier-preflight', label: 'Run dossier preflight', intent: 'dossier_preflight', description: 'Check all modules for submission readiness' });
    }

    if (hasArtifactContext(authoringContext) && authoringContext.artifactStatus === 'drafting' && !authoringContext.readiness?.blocked) {
      actions.push({ id: 'promote-to-review', label: 'Promote to review', intent: 'promote_to_review', description: 'Run preflight then promote' });
    }

    if (hasSectionContext(authoringContext) && (authoringContext.contradictions?.length || authoringContext.readiness?.blocked)) {
      actions.push({ id: 'correction-draft', label: 'Prepare correction draft', intent: 'correction_draft', description: 'Fix issues from contradictions or blockers' });
    }

    if (hasSectionContext(authoringContext)) {
      actions.push({ id: 'harmonize-sections', label: 'Harmonize with related sections', intent: 'harmonize_sections', description: 'Check consistency across linked CTD sections' });
      actions.push({ id: 'section-evidence', label: 'Gather evidence for this section', intent: 'section_evidence', description: 'Find linked evidence and regulatory support' });
    }

    if (stage === 'section-workspace' || stage === 'review') {
      actions.push({ id: 'resolution-changelog', label: 'What changed after resolution?', intent: 'resolution_changelog' });
    }

    if (authoringContext.moduleCode || hasSectionContext(authoringContext)) {
      actions.push({ id: 'module-readiness', label: 'Module readiness', intent: 'module_readiness' });
    }

    if (hasSectionContext(authoringContext) && (authoringContext.regulatorBody || authoringContext.submissionType)) {
      actions.push({ id: 'body-expectations', label: `What does ${authoringContext.regulatorBody || 'this body'} expect here?`, intent: 'body_expectations' });
      actions.push({ id: 'body-aware-gaps', label: 'What is missing for this body?', intent: 'body_aware_gaps' });
    }

    if (hasSectionContext(authoringContext) && authoringContext.linkedSectionCodes?.length) {
      actions.push({ id: 'cross-section-consistency', label: 'Check cross-section consistency', intent: 'cross_section_consistency' });
    }

    return actions;
  }, [authoringContext]);

  const effectiveSuggestedActions = useMemo(() => {
    const parent = suggestedActions || [];

    // Workflow-aware defaults when no authoring context
    if (authoringSuggestedActions.length === 0 && contextProfile?.projectId) {
      const workflowActions: SuggestedAction[] = [
        { id: 'status', label: 'Project status', intent: undefined, description: 'Quick readiness check and next steps' },
        { id: 'workflow', label: 'Submission workflow', intent: undefined, description: 'Full step-by-step progress' },
        { id: 'assess', label: 'Full assessment', intent: undefined, description: 'Readiness + risks + actions' },
      ];
      return [...workflowActions, ...parent.slice(0, 2)];
    }

    if (authoringSuggestedActions.length > 0) {
      const limit = Math.min(authoringSuggestedActions.length, 5);
      return [...authoringSuggestedActions.slice(0, limit), ...parent.slice(0, 1)];
    }
    return parent;
  }, [suggestedActions, authoringSuggestedActions, contextProfile?.projectId]);

  // ── Auto-scroll ──
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isStreaming]);

  // ── Auto-resize textarea ──
  useEffect(() => {
    const el = inputRef.current;
    if (el) {
      el.style.height = '24px';
      el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
    }
  }, [input]);

  // ── Restore previous conversation from server thread ──
  const conversationLoadedRef = useRef(false);
  useEffect(() => {
    if (conversationLoadedRef.current || messages.length > 0) return;
    if (!contextProfile?.projectId) return;
    conversationLoadedRef.current = true;

    // Try to load the most recent thread for this project
    apiRequest('GET', `/api/chat/threads?project_id=${contextProfile.projectId}&limit=1`)
      .then(r => r.json())
      .then(data => {
        const thread = data?.threads?.[0] || data?.data?.[0];
        if (!thread?.id) return;
        threadIdRef.current = thread.id;

        // Load messages from this thread
        return apiRequest('GET', `/api/chat/threads/${thread.id}/messages?limit=30`)
          .then(r => r.json())
          .then(msgData => {
            const msgs = msgData?.messages || msgData?.data || [];
            if (msgs.length > 0) {
              setMessages(msgs.map((m: any) => ({
                id: m.id || `restored-${Date.now()}-${Math.random()}`,
                role: m.role as 'user' | 'assistant',
                content: m.content,
                timestamp: new Date(m.created_at || m.timestamp || Date.now()),
              })));
            }
          });
      })
      .catch(() => {
        // Non-critical — start fresh conversation
      });
  }, [contextProfile?.projectId]);

  // ── Initial message ──
  useEffect(() => {
    if (initialMessage && !initialMessageSentRef.current) {
      initialMessageSentRef.current = true;
      setTimeout(() => handleSend(initialMessage), 100);
    }
  }, [initialMessage]);

  // ── Keyboard shortcuts ──
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      const isMod = e.metaKey || e.ctrlKey;

      // Cmd+K / Ctrl+K — new conversation
      if (isMod && e.key === 'k') {
        e.preventDefault();
        setMessages([]);
        threadIdRef.current = null;
        inputRef.current?.focus();
      }

      // Cmd+/ / Ctrl+/ — focus input
      if (isMod && e.key === '/') {
        e.preventDefault();
        inputRef.current?.focus();
      }

      // Escape — stop streaming or blur input
      if (e.key === 'Escape') {
        if (isStreaming) {
          handleStop();
        } else {
          inputRef.current?.blur();
        }
      }
    };

    document.addEventListener('keydown', handleGlobalKeyDown);
    return () => document.removeEventListener('keydown', handleGlobalKeyDown);
  }, [isStreaming]);

  // ── Stop streaming ──
  const handleStop = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsStreaming(false);
    // Mark current streaming message as complete
    if (streamingMsgIdRef.current) {
      setMessages(prev => prev.map(m =>
        m.id === streamingMsgIdRef.current ? { ...m, isStreaming: false } : m
      ));
      streamingMsgIdRef.current = null;
    }
  }, []);

  // ── Send message (with streaming) ──
  const handleSend = useCallback(
    async (messageText?: string) => {
      const text = messageText || input.trim();
      if (!text || isStreaming) return;

      const userMsg: AnaMessage = {
        id: `u-${Date.now()}`,
        role: 'user',
        content: text,
        timestamp: new Date(),
      };

      setMessages(prev => [...prev.slice(-199), userMsg]);
      setInput('');

      // ── Client-side slash commands ──
      if (text.startsWith('/decisions')) {
        const projectId = contextProfile?.projectId;
        if (!projectId) {
          setMessages(prev => [...prev, { id: `a-${Date.now()}`, role: 'assistant', content: 'No project selected. Open a project to view decisions.', timestamp: new Date() }]);
          return;
        }
        try {
          const res = await apiRequest('GET', `/api/authoring-actions/decisions/${projectId}`);
          const data = await res.json();
          const decisions = data.decisions || data.data || [];
          if (decisions.length === 0) {
            setMessages(prev => [...prev, { id: `a-${Date.now()}`, role: 'assistant', content: 'No decisions recorded for this project yet.', timestamp: new Date() }]);
          } else {
            const lines = decisions.slice(0, 15).map((d: any, i: number) =>
              `${i + 1}. **${d.title || d.type || 'Decision'}** — ${d.status || 'pending'}\n   ${d.rationale || d.description || ''}`
            ).join('\n');
            setMessages(prev => [...prev, { id: `a-${Date.now()}`, role: 'assistant', content: `**Project Decisions** (${decisions.length} total)\n\n${lines}`, timestamp: new Date() }]);
          }
        } catch {
          setMessages(prev => [...prev, { id: `a-${Date.now()}`, role: 'assistant', content: 'Could not load decisions. The endpoint may not be available yet.', timestamp: new Date() }]);
        }
        return;
      }

      if (text.startsWith('/export')) {
        const md = messages.map(m => `### ${m.role === 'user' ? 'You' : 'AnA'}\n\n${m.content}`).join('\n\n---\n\n');
        const blob = new Blob([`# AnA Conversation — ${new Date().toLocaleDateString()}\n\n${md}`], { type: 'text/markdown' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = `ana-conversation-${new Date().toISOString().split('T')[0]}.md`; a.click();
        URL.revokeObjectURL(url);
        setMessages(prev => [...prev, { id: `a-${Date.now()}`, role: 'assistant', content: 'Conversation exported as markdown.', timestamp: new Date() }]);
        return;
      }

      setIsStreaming(true);

      // ── Deep Research mode ──
      if (chatMode === 'deep-research') {
        try {
          const launchRes = await apiRequest('POST', '/api/deep-research/jobs', {
            query: { indication: text, keywords: text.split(/\s+/).filter(w => w.length > 3) },
            connectorIds: ['clinical_trials_gov', 'pubmed', 'fda_drugs', 'ema_epar'],
            depth: 'standard',
            projectId: contextProfile?.projectId || null,
          });
          if (!launchRes.ok) throw new Error(`HTTP ${launchRes.status}`);
          const job = await launchRes.json();
          const progressMsgId = `dr-${Date.now()}`;
          setMessages(prev => [...prev, {
            id: progressMsgId, role: 'assistant',
            content: 'Starting deep research...', timestamp: new Date(),
          }]);

          const eventSource = new EventSource(`/api/deep-research/jobs/${job.id}/stream`);
          eventSource.onmessage = event => {
            try {
              const data = JSON.parse(event.data);
              if (data.status === 'complete' || data.status === 'failed') {
                eventSource.close();
                apiRequest('GET', `/api/deep-research/jobs/${job.id}`)
                  .then(r => r.json())
                  .then(finalJob => {
                    const synthesis = finalJob.synthesis || 'Research complete.';
                    const total = finalJob.results?.totalResults || 0;
                    setMessages(prev => prev.map(m =>
                      m.id === progressMsgId
                        ? { ...m, content: `**Deep Research** — ${total} sources analyzed\n\n---\n\n${synthesis}` }
                        : m
                    ));
                  })
                  .catch((err) => {
                    console.warn('[Deep Research] Failed to fetch final results:', err?.message);
                  })
                  .finally(() => setIsStreaming(false));
                return;
              }
              const label = data.status === 'synthesizing' ? 'Synthesizing...' : `Searching... ${data.progress}%`;
              setMessages(prev => prev.map(m =>
                m.id === progressMsgId ? { ...m, content: label } : m
              ));
            } catch { /* Skip malformed SSE chunk */ }
          };
          eventSource.onerror = () => {
            eventSource.close();
            setIsStreaming(false);
          };
        } catch (err) {
          setMessages(prev => [...prev, {
            id: `a-${Date.now()}`, role: 'assistant',
            content: `Could not launch research: ${err instanceof Error ? err.message : 'Unknown error'}`,
            timestamp: new Date(),
          }]);
          setIsStreaming(false);
        }
        return;
      }

      // ── Nano Banana mode ──
      if (chatMode === 'nano-banana') {
        try {
          const response = await apiRequest('POST', '/api/nano-banana/chat', {
            message: text,
            conversationHistory: messages.slice(-10).map(m => ({ role: m.role, content: m.content })),
          });
          const data = await response.json();
          if (data.pptx) {
            const blob = new Blob([Uint8Array.from(atob(data.pptx.base64), c => c.charCodeAt(0))], { type: data.pptx.mimeType });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url; a.download = data.pptx.filename; a.click();
            URL.revokeObjectURL(url);
          }
          setMessages(prev => [...prev, {
            id: `a-${Date.now()}`, role: 'assistant',
            content: data.response || 'Here are your results.',
            timestamp: new Date(), images: data.images, pptx: data.pptx,
          }]);
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : 'Unknown error';
          toast({ title: 'Nano Banana error', description: errorMsg, variant: 'destructive' });
          setMessages(prev => [...prev, {
            id: `a-${Date.now()}`, role: 'assistant',
            content: 'Sorry, something went wrong. Please try again.',
            timestamp: new Date(),
          }]);
        } finally {
          setIsStreaming(false);
        }
        return;
      }

      // ── Standard mode — SSE streaming ──
      const assistantMsgId = `a-${Date.now()}`;
      streamingMsgIdRef.current = assistantMsgId;

      setMessages(prev => [...prev, {
        id: assistantMsgId,
        role: 'assistant',
        content: '',
        timestamp: new Date(),
        isStreaming: true,
      }]);

      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      try {
        const authoringPayload = authoringContext ? serializeContextForChat(authoringContext) : {};

        const streamPayload = {
          message: text,
          thread_id: threadIdRef.current || undefined,
          project_id: contextProfile?.projectId || undefined,
          submission_type: contextProfile?.productType || undefined,
          user_role: contextProfile?.userRole || undefined,
          intent_lens: intentLens !== 'auto' ? intentLens : undefined,
          authoring_context: authoringPayload,
          project_context: contextProfile?.activeProject ? {
            productName: contextProfile.activeProject,
            submissionType: contextProfile.productType,
          } : undefined,
          context: {
            screen: contextProfile?.screenName,
            project: contextProfile?.activeProject,
            projectId: contextProfile?.projectId,
            productType: contextProfile?.productType,
            userRole: contextProfile?.userRole,
            ...(contextProfile?.moduleContext || {}),
          },
          conversationHistory: messages.slice(-20).map(m => ({
            role: m.role,
            content: m.content,
          })),
          file_ids: attachedFiles.length > 0 ? attachedFiles.map(f => f.id) : undefined,
        };

        // Clear attached files after sending (they're now part of the message context)
        if (attachedFiles.length > 0) setAttachedFiles([]);

        // Raw fetch required for AbortController signal + SSE streaming
        // (apiRequest doesn't accept a signal parameter)
        const response = await fetch('/api/ana-ri/stream', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
          credentials: 'include',
          signal: abortController.signal,
          body: JSON.stringify(streamPayload),
        });

        if (!response.ok) {
          // Fallback to non-streaming endpoint
          const fallbackRes = await apiRequest('POST', '/api/ana-ri/chat', {
            message: text,
            thread_id: threadIdRef.current || undefined,
            project_id: contextProfile?.projectId || undefined,
            submission_type: contextProfile?.productType || undefined,
            intent_lens: intentLens !== 'auto' ? intentLens : undefined,
            authoring_context: authoringPayload,
            context: {
              screen: contextProfile?.screenName,
              project: contextProfile?.activeProject,
              projectId: contextProfile?.projectId,
            },
            conversationHistory: messages.slice(-20).map(m => ({
              role: m.role,
              content: m.content,
            })),
          });

          if (!fallbackRes.ok) {
            throw new Error(`Request failed (${fallbackRes.status})`);
          }

          const data = await fallbackRes.json();
          if (data.thread_id) threadIdRef.current = data.thread_id;

          setMessages(prev => prev.map(m =>
            m.id === assistantMsgId
              ? { ...m, content: data.response || 'No response.', isStreaming: false }
              : m
          ));
          setIsStreaming(false);
          streamingMsgIdRef.current = null;
          return;
        }

        // Parse SSE stream
        const reader = response.body?.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        if (!reader) throw new Error('No response body');

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            try {
              const data = JSON.parse(line.slice(6));

              if (data.type === 'thread_id' && data.thread_id) {
                threadIdRef.current = data.thread_id;
              } else if (data.type === 'text') {
                setMessages(prev => prev.map(m =>
                  m.id === assistantMsgId
                    ? { ...m, content: m.content + data.content }
                    : m
                ));
              } else if (data.type === 'done') {
                setMessages(prev => prev.map(m =>
                  m.id === assistantMsgId
                    ? { ...m, isStreaming: false, executedActions: data.executedActions }
                    : m
                ));
                // Notify about auto-executed actions and commands
                if (data.executedActions?.length) {
                  toast({ title: 'Actions executed', description: `${data.executedActions.length} artifact(s) created` });
                }
                if (data.executedCommands?.length) {
                  const cmdSummary = data.executedCommands
                    .filter((c: any) => c.success)
                    .map((c: any) => c.message)
                    .join('; ');
                  if (cmdSummary) {
                    toast({ title: 'Commands executed', description: cmdSummary });
                  }
                }
              } else if (data.type === 'error') {
                setMessages(prev => prev.map(m =>
                  m.id === assistantMsgId
                    ? { ...m, content: m.content || 'An error occurred.', isStreaming: false }
                    : m
                ));
              }
            } catch { /* Skip malformed SSE chunk */ }
          }
        }

        // Mark streaming complete
        setMessages(prev => prev.map(m =>
          m.id === assistantMsgId ? { ...m, isStreaming: false } : m
        ));
      } catch (err: any) {
        if (err.name === 'AbortError') {
          // User cancelled — just stop
          setMessages(prev => prev.map(m =>
            m.id === assistantMsgId ? { ...m, isStreaming: false } : m
          ));
        } else {
          const errorMsg = err?.message || 'Unknown error';
          toast({ title: 'AnA error', description: errorMsg, variant: 'destructive' });
          setMessages(prev => prev.map(m =>
            m.id === assistantMsgId
              ? { ...m, content: 'Sorry, something went wrong. Please try again.', isStreaming: false }
              : m
          ));
        }
      } finally {
        setIsStreaming(false);
        abortControllerRef.current = null;
        streamingMsgIdRef.current = null;
        inputRef.current?.focus();
      }
    },
    [input, isStreaming, messages, contextProfile, chatMode, authoringContext, intentLens]
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

  const handleFileUpload = useCallback(async (files: FileList) => {
    for (const file of Array.from(files)) {
      const formData = new FormData();
      formData.append('file', file);
      try {
        // Raw fetch required for multipart form (apiRequest sets Content-Type: application/json)
        const res = await fetch('/api/chat/upload', {
          method: 'POST',
          credentials: 'include',
          headers: getAuthHeaders(),
          body: formData,
        });
        if (res.ok) {
          const data = await res.json();
          setAttachedFiles(prev => [...prev, { name: file.name, id: data.fileId || data.id || file.name }]);
          toast({ title: 'File attached', description: file.name });
        } else {
          toast({ title: 'Upload failed', description: `Could not upload ${file.name}`, variant: 'destructive' });
        }
      } catch (err) {
        toast({ title: 'Upload failed', description: err instanceof Error ? err.message : `Could not upload ${file.name}`, variant: 'destructive' });
      }
    }
  }, [toast]);

  const handleSuggestedAction = (action: SuggestedAction) => {
    if (action.intent && onActionRun) {
      onActionRun({ id: action.id, intent: action.intent, label: action.label, status: 'running', ts: Date.now() });
    }

    // ── Resume last section — real navigation ──
    if (action.intent === 'resume_last_section') {
      (async () => {
        try {
          const projectId = contextProfile?.projectId;
          if (!projectId) { handleSend('Resume my last section.'); return; }
          const res = await apiRequest('GET', `/api/authoring-actions/resume-last-section/${projectId}`);
          const data = await res.json();
          if (data.found && data.ctdSection && onNavigateToSection) {
            onNavigateToSection(data.ctdSection);
            setMessages(prev => [...prev, { id: `a-${Date.now()}`, role: 'assistant', content: `Opening **${data.title || 'your last section'}** (§${data.ctdSection}). Status: ${data.status || 'draft'}.`, timestamp: new Date() }]);
          } else if (data.found && data.artifactId && onOpenArtifact) {
            onOpenArtifact(data.artifactId);
            setMessages(prev => [...prev, { id: `a-${Date.now()}`, role: 'assistant', content: `Opening **${data.title || 'your last document'}**. Status: ${data.status || 'draft'}.`, timestamp: new Date() }]);
          } else { handleSend('Open my most recently edited section.'); }
        } catch { /* API failed — fall back to natural language */ handleSend('Resume my last section.'); }
      })();
      return;
    }

    // ── Draft section from context ──
    if (action.intent === 'draft_section_from_context') {
      const msg = authoringContext?.sectionCode
        ? `Draft CTD section ${authoringContext.sectionCode}${authoringContext.sectionTitle ? `: ${authoringContext.sectionTitle}` : ''}. Generate a compliant first draft following ICH M4 guidelines for ${authoringContext.submissionType || 'this submission'}.`
        : 'Draft the current section from context.';
      handleSend(msg);
      return;
    }

    // ── Explain promotion blockers — real API ──
    if (action.intent === 'explain_promotion_blockers') {
      (async () => {
        const projectId = contextProfile?.projectId;
        if (!projectId) { handleSend('What is blocking this document from promotion?'); return; }
        try {
          const params = new URLSearchParams();
          if (authoringContext?.artifactId) params.set('artifactId', authoringContext.artifactId);
          if (authoringContext?.sectionCode) params.set('sectionCode', authoringContext.sectionCode);
          const res = await apiRequest('GET', `/api/authoring-actions/promotion-blockers/${projectId}?${params}`);
          const data = await res.json();
          if (data.blockerCount === 0) {
            setMessages(prev => [...prev, { id: `a-${Date.now()}`, role: 'assistant', content: `**No blockers detected.** ${authoringContext?.sectionCode ? `Section §${authoringContext.sectionCode}` : 'This document'} appears ready for promotion.`, timestamp: new Date() }]);
          } else {
            const lines = data.blockers.map((b: any, i: number) => `${i + 1}. **[${b.severity.toUpperCase()}]** ${b.message} _(${b.source})_`).join('\n');
            setMessages(prev => [...prev, { id: `a-${Date.now()}`, role: 'assistant', content: `**Promotion ${data.blocked ? 'BLOCKED' : 'has warnings'}** — ${data.blockerCount} issue(s):\n\n${lines}`, timestamp: new Date() }]);
          }
        } catch { /* API failed — fall back to natural language */ handleSend('What is blocking this document from promotion?'); }
      })();
      return;
    }

    // ── Compare against approved — real API ──
    if (action.intent === 'compare_against_approved') {
      (async () => {
        const projectId = contextProfile?.projectId;
        const artifactId = authoringContext?.artifactId;
        if (!projectId || !artifactId) { handleSend('Compare the current document against the last approved version.'); return; }
        try {
          const res = await apiRequest('GET', `/api/authoring-actions/compare-versions/${projectId}/${artifactId}`);
          const data = await res.json();
          if (!data.available) {
            setMessages(prev => [...prev, { id: `a-${Date.now()}`, role: 'assistant', content: `**No comparison available.** ${data.message}`, timestamp: new Date() }]);
          } else {
            const wordDelta = data.diffSummary.currentWords - data.diffSummary.approvedWords;
            setMessages(prev => [...prev, { id: `a-${Date.now()}`, role: 'assistant', content: `**Version Comparison**\n\n| | Current (v${data.currentVersion.version}) | Approved (v${data.approvedVersion.version}) |\n|---|---|---|\n| Words | ${data.diffSummary.currentWords} | ${data.diffSummary.approvedWords} |\n\n**Net change:** ${wordDelta > 0 ? '+' : ''}${wordDelta} words.`, timestamp: new Date() }]);
            onOpenCompareInspector?.();
            onRefreshIntelligence?.();
          }
        } catch { /* API failed — fall back to natural language */ handleSend('Compare the current document against the last approved version.'); }
      })();
      return;
    }

    // ── Section preflight — real API ──
    if (action.intent === 'section_preflight') {
      (async () => {
        const projectId = contextProfile?.projectId;
        const sectionCode = authoringContext?.sectionCode;
        if (!projectId || !sectionCode) { setMessages(prev => [...prev, { id: `a-${Date.now()}`, role: 'assistant', content: '**Cannot run preflight.** No section is active.', timestamp: new Date() }]); return; }
        try {
          const res = await apiRequest('POST', '/api/authoring-actions/section-preflight', {
            projectId, sectionCode, artifactId: authoringContext?.artifactId, artifactVersionId: authoringContext?.artifactVersionId,
            regulatorBody: authoringContext?.regulatorBody, submissionType: authoringContext?.submissionType, linkedSectionCodes: authoringContext?.linkedSectionCodes,
          });
          const data = await res.json();
          if (data.status === 'data') {
            const icon = (s: string) => s === 'pass' ? 'PASS' : s === 'warn' ? 'WARN' : s === 'fail' ? 'FAIL' : '—';
            const checks = ['bodyExpectations', 'contradictions', 'crossSectionConsistency', 'approvedBaselineCompare', 'readiness'];
            const rows = checks.map(c => `| ${c} | ${icon(data.checks[c]?.status)} |`).join('\n');
            setMessages(prev => [...prev, { id: `a-${Date.now()}`, role: 'assistant', content: `**Section Preflight — §${sectionCode}**\n\n**Overall:** ${data.overall.toUpperCase()} — ${data.summary}\n\n| Check | Status |\n|---|---|\n${rows}`, timestamp: new Date() }]);
            onRefreshIntelligence?.();
          } else {
            setMessages(prev => [...prev, { id: `a-${Date.now()}`, role: 'assistant', content: `**Preflight:** ${data.message || data.error || 'Unable to run.'}`, timestamp: new Date() }]);
          }
        } catch { /* API failed — fall back to natural language */ handleSend('Run preflight on this section.'); }
      })();
      return;
    }

    // ── Module preflight — real API ──
    if (action.intent === 'module_preflight') {
      (async () => {
        const projectId = contextProfile?.projectId;
        const moduleCode = authoringContext?.moduleCode || (authoringContext?.sectionCode ? `m${authoringContext.sectionCode.split('.')[0]}` : '');
        if (!projectId || !moduleCode) { setMessages(prev => [...prev, { id: `a-${Date.now()}`, role: 'assistant', content: '**Cannot run module preflight.** No module context.', timestamp: new Date() }]); return; }
        try {
          const res = await apiRequest('POST', '/api/authoring-actions/module-preflight', { projectId, moduleCode, regulatorBody: authoringContext?.regulatorBody, submissionType: authoringContext?.submissionType });
          const data = await res.json();
          if (data.status === 'data') {
            setMessages(prev => [...prev, { id: `a-${Date.now()}`, role: 'assistant', content: `**Module Preflight — ${moduleCode.toUpperCase()}**\n\n**Overall:** ${data.overall.toUpperCase()} — ${data.summary}\n\n**Sections:** ${data.counts.ready}/${data.counts.total} ready, ${data.counts.blocked} blocked`, timestamp: new Date() }]);
            onRefreshIntelligence?.();
          } else {
            setMessages(prev => [...prev, { id: `a-${Date.now()}`, role: 'assistant', content: `**Module preflight:** ${data.message || data.error || 'Unable to run.'}`, timestamp: new Date() }]);
          }
        } catch { /* API failed — fall back to natural language */ handleSend(`Run preflight on module ${moduleCode}.`); }
      })();
      return;
    }

    // ── Dossier preflight — real API ──
    if (action.intent === 'dossier_preflight') {
      (async () => {
        const projectId = contextProfile?.projectId;
        if (!projectId) { setMessages(prev => [...prev, { id: `a-${Date.now()}`, role: 'assistant', content: '**Cannot run dossier preflight.** No project active.', timestamp: new Date() }]); return; }
        try {
          const res = await apiRequest('POST', '/api/authoring-actions/dossier-preflight', { projectId, regulatorBody: authoringContext?.regulatorBody, submissionType: authoringContext?.submissionType });
          const data = await res.json();
          if (data.status === 'data') {
            const moduleRows = data.moduleResults?.map((m: any) => `| ${m.moduleCode.toUpperCase()} | ${m.overall} | ${m.counts?.ready || 0}/${m.counts?.total || 0} |`).join('\n') || '';
            setMessages(prev => [...prev, { id: `a-${Date.now()}`, role: 'assistant', content: `**Dossier Preflight**\n\n**Overall:** ${data.overall.toUpperCase()} — ${data.summary}\n\n| Module | Status | Ready |\n|---|---|---|\n${moduleRows}`, timestamp: new Date() }]);
            onRefreshIntelligence?.();
          } else {
            setMessages(prev => [...prev, { id: `a-${Date.now()}`, role: 'assistant', content: `**Dossier preflight:** ${data.message || data.error || 'Unable to run.'}`, timestamp: new Date() }]);
          }
        } catch { /* API failed — fall back to natural language */ handleSend('Run dossier preflight.'); }
      })();
      return;
    }

    // ── Promote to review ──
    if (action.intent === 'promote_to_review' && authoringContext?.artifactId && onRequestPromotion) {
      (async () => {
        try {
          const result = await onRequestPromotion(authoringContext.artifactId!);
          setMessages(prev => [...prev, { id: `a-${Date.now()}`, role: 'assistant', content: result.promoted ? `**Promoted to review.** ${result.message}` : `**Promotion blocked.** ${result.message}`, timestamp: new Date() }]);
          onRefreshIntelligence?.();
        } catch (err) {
          toast({ title: 'Promotion failed', description: err instanceof Error ? err.message : 'Unknown error', variant: 'destructive' });
        }
      })();
      return;
    }

    // ── Body expectations — real API ──
    if (action.intent === 'body_expectations') {
      (async () => {
        const sectionCode = authoringContext?.sectionCode;
        const body = authoringContext?.regulatorBody || 'FDA';
        const subType = authoringContext?.submissionType || 'IND';
        if (!sectionCode) { handleSend(`What does ${body} expect in this section?`); return; }
        try {
          const res = await apiRequest('GET', `/api/authoring-actions/section-expectations/${encodeURIComponent(body)}/${encodeURIComponent(subType)}/${encodeURIComponent(sectionCode)}`);
          const data = await res.json();
          if (data.status === 'data') {
            const exp = data.expectations;
            const reqLines = exp.requirements?.map((r: string) => `- ${r}`).join('\n') || '- None identified';
            setMessages(prev => [...prev, { id: `a-${Date.now()}`, role: 'assistant', content: `**${body} Expectations for §${sectionCode}** (${subType})\n\n**Required level:** ${exp.requiredLevel}\n\n**Requirements:**\n${reqLines}`, timestamp: new Date() }]);
          } else {
            setMessages(prev => [...prev, { id: `a-${Date.now()}`, role: 'assistant', content: `**Section expectations:** ${data.message}`, timestamp: new Date() }]);
          }
        } catch { /* API failed — fall back to natural language */ handleSend(`What does ${body} expect in section ${sectionCode}?`); }
      })();
      return;
    }

    // ── Cross-section consistency — real API ──
    if (action.intent === 'cross_section_consistency') {
      (async () => {
        const projectId = contextProfile?.projectId;
        const sectionCode = authoringContext?.sectionCode;
        if (!projectId || !sectionCode) { handleSend('Check this section against linked sections.'); return; }
        try {
          const res = await apiRequest('POST', '/api/authoring-actions/cross-section-consistency', {
            projectId, sectionCode, linkedSectionCodes: authoringContext?.linkedSectionCodes, submissionType: authoringContext?.submissionType,
          });
          const data = await res.json();
          if (data.status === 'data') {
            const issues = data.harmonizeResult?.issues?.slice(0, 5).map((i: any) => `- **[${i.severity}]** ${i.description}`).join('\n') || '- None';
            setMessages(prev => [...prev, { id: `a-${Date.now()}`, role: 'assistant', content: `**Cross-Section Consistency for §${sectionCode}**\n\nConsistency: ${data.harmonizeResult?.consistencyScore ?? '—'}/100\n\n**Issues (${data.harmonizeResult?.totalIssues ?? 0}):**\n${issues}`, timestamp: new Date() }]);
            onRefreshIntelligence?.();
          } else {
            setMessages(prev => [...prev, { id: `a-${Date.now()}`, role: 'assistant', content: `**Cross-section consistency:** ${data.message}`, timestamp: new Date() }]);
          }
        } catch { /* API failed — fall back to natural language */ handleSend('Check this section against linked sections.'); }
      })();
      return;
    }

    // ── Body-aware gap detection — real API ──
    if (action.intent === 'body_aware_gaps') {
      (async () => {
        const sectionCode = authoringContext?.sectionCode;
        const body = authoringContext?.regulatorBody || 'FDA';
        const subType = authoringContext?.submissionType || 'IND';
        if (!sectionCode) { handleSend(`What is missing for ${body} in this section?`); return; }
        try {
          const res = await apiRequest('POST', '/api/authoring-actions/body-aware-gaps', { regulatorBody: body, submissionType: subType, sectionCode, currentContent: '' });
          const data = await res.json();
          if (data.status === 'data') {
            const gaps = data.gaps?.slice(0, 10).map((g: any) => `- **[${g.status.toUpperCase()}]** ${g.requirement}`).join('\n') || '- None';
            setMessages(prev => [...prev, { id: `a-${Date.now()}`, role: 'assistant', content: `**${body} Gap Analysis for §${sectionCode}**\n\nCompleteness: ${data.overallCompleteness ?? '—'}%\n\n**Gaps:**\n${gaps}`, timestamp: new Date() }]);
          } else {
            setMessages(prev => [...prev, { id: `a-${Date.now()}`, role: 'assistant', content: `**Body-aware gaps:** ${data.message}`, timestamp: new Date() }]);
          }
        } catch { /* API failed — fall back to natural language */ handleSend(`What is missing for ${body} in section ${sectionCode}?`); }
      })();
      return;
    }

    // ── Workflow quick actions (map label to slash commands) ──
    const slashMap: Record<string, string> = {
      'Project status': '/status',
      'Submission workflow': '/workflow',
      'Full assessment': '/assess',
    };
    if (slashMap[action.label]) {
      handleSend(slashMap[action.label]);
      return;
    }

    // ── Fallback: send as chat message to AnA ──
    handleSend(action.label);
  };

  const hasMessages = messages.length > 0;

  // ── Render a single message ──
  const renderMessage = (msg: AnaMessage) => {
    const isUser = msg.role === 'user';
    const htmlContent = !isUser && msg.content ? renderMarkdown(msg.content) : '';

    return (
      <div
        key={msg.id}
        className={cn('py-6 px-4 sm:px-6', isUser ? '' : '')}
        onMouseEnter={() => !isUser && setHoveredMsgId(msg.id)}
        onMouseLeave={() => setHoveredMsgId(null)}
        data-testid={isUser ? 'chat-message-user' : 'chat-message-assistant'}
        {...(msg.isStreaming ? { role: 'status', 'aria-busy': true, 'aria-label': 'AnA is responding' } : {})}
      >
        <div className="max-w-[720px] mx-auto">
          {/* Role label */}
          <div className="mb-2">
            <span className={cn(
              'text-[13px] font-semibold',
              isUser ? 'text-[#0D0D0D]' : 'text-[#b4654a]'
            )}>
              {isUser ? 'You' : 'AnA'}
            </span>
          </div>

          {/* Content */}
          {isUser ? (
            <div className="text-[15px] text-[#0D0D0D] leading-[1.7] whitespace-pre-wrap">
              {msg.content}
            </div>
          ) : (
            <div className="relative">
              <div
                className={cn(
                  'ana-response text-[15px] leading-[1.7] text-[#1a1a1a]',
                  msg.isStreaming && !msg.content && 'min-h-[24px]'
                )}
                dangerouslySetInnerHTML={{ __html: htmlContent }}
              />
              {/* Streaming cursor */}
              {msg.isStreaming && (
                <span className="inline-block w-[3px] h-[18px] bg-[#b4654a] ml-0.5 align-text-bottom animate-[blink_1s_ease-in-out_infinite]" />
              )}
              {/* Images (Nano Banana) */}
              {msg.images && msg.images.length > 0 && (
                <div className="flex flex-wrap gap-3 mt-4">
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
              {/* PPTX download */}
              {msg.pptx && (
                <button
                  onClick={() => {
                    const blob = new Blob([Uint8Array.from(atob(msg.pptx!.base64), c => c.charCodeAt(0))], { type: msg.pptx!.mimeType });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a'); a.href = url; a.download = msg.pptx!.filename; a.click();
                    URL.revokeObjectURL(url);
                  }}
                  className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg bg-zinc-100 text-zinc-700 hover:bg-zinc-200 transition-colors"
                >
                  <Download className="w-4 h-4" />
                  {msg.pptx.filename}
                </button>
              )}
              {/* Extracted links — surface regulatory references */}
              {!msg.isStreaming && msg.content && (() => {
                const links = extractLinks(msg.content);
                if (links.length === 0) return null;
                return (
                  <div className="flex flex-wrap gap-1.5 mt-3">
                    {links.map((link, i) => (
                      <a
                        key={i}
                        href={link.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium rounded-full bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors"
                      >
                        {link.label}
                        <span className="text-blue-400">↗</span>
                      </a>
                    ))}
                  </div>
                );
              })()}
            </div>
          )}

          {/* Action buttons (appear on hover for assistant messages) */}
          {!isUser && !msg.isStreaming && msg.content && (
            <div className={cn(
              'flex items-center gap-1 mt-2 transition-opacity duration-150',
              hoveredMsgId === msg.id ? 'opacity-100' : 'opacity-0'
            )}>
              <button
                onClick={() => handleCopy(msg.id, msg.content)}
                className="p-1.5 text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 rounded-md transition-colors"
                title="Copy"
                aria-label="Copy message"
              >
                {copiedId === msg.id ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
              </button>
              <button
                onClick={() => {
                  apiRequest('POST', '/api/concept2cure/feedback', { messageId: msg.id, positive: true, projectId: contextProfile?.projectId })
                    .catch(() => toast({ title: 'Feedback failed', description: 'Could not submit feedback.', variant: 'destructive' }));
                }}
                className="p-1.5 text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 rounded-md transition-colors"
                title="Good response"
                aria-label="Mark as good response"
              >
                <ThumbsUp className="w-4 h-4" />
              </button>
              <button
                onClick={() => {
                  apiRequest('POST', '/api/concept2cure/feedback', { messageId: msg.id, positive: false, projectId: contextProfile?.projectId })
                    .catch(() => toast({ title: 'Feedback failed', description: 'Could not submit feedback.', variant: 'destructive' }));
                }}
                className="p-1.5 text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 rounded-md transition-colors"
                title="Bad response"
                aria-label="Mark as bad response"
              >
                <ThumbsDown className="w-4 h-4" />
              </button>
              {/* Regenerate response */}
              <button
                onClick={() => {
                  // Find the user message that preceded this assistant message
                  const msgIndex = messages.findIndex(m => m.id === msg.id);
                  const precedingUserMsg = messages.slice(0, msgIndex).reverse().find(m => m.role === 'user');
                  if (precedingUserMsg) {
                    // Remove this assistant message and re-send
                    setMessages(prev => prev.filter(m => m.id !== msg.id));
                    handleSend(precedingUserMsg.content);
                  }
                }}
                className="p-1.5 text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 rounded-md transition-colors"
                title="Regenerate"
                aria-label="Regenerate response"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
              {/* Insert into editor */}
              {onDraftInsert && authoringContext?.sectionCode && msg.content.length > 100 && (
                <button
                  onClick={() => {
                    let insertContent = msg.content;
                    const codeBlockMatch = msg.content.match(/```(?:\w+)?\n([\s\S]*?)```/);
                    if (codeBlockMatch && codeBlockMatch[1].trim().length > 50) {
                      insertContent = codeBlockMatch[1].trim();
                    }
                    if (!insertContent.startsWith('<')) {
                      insertContent = insertContent.split('\n\n').filter(p => p.trim()).map(p => `<p>${p.trim()}</p>`).join('\n');
                    }
                    const title = authoringContext.sectionTitle
                      ? `${authoringContext.sectionCode} — ${authoringContext.sectionTitle}`
                      : `Section ${authoringContext.sectionCode} Draft`;
                    onDraftInsert(insertContent, title, authoringContext.sectionCode);
                    setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, insertedToEditor: true } : m));
                  }}
                  className="p-1.5 text-zinc-400 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
                  title="Insert into editor"
                  aria-label="Insert into document editor"
                >
                  <ArrowUp className="w-4 h-4 rotate-90" />
                </button>
              )}
              {(msg as any).insertedToEditor && (
                <span className="text-xs text-blue-600 font-medium ml-1">Inserted</span>
              )}
              {/* Export as text file */}
              {msg.content.length > 100 && (
                <button
                  onClick={() => {
                    const blob = new Blob([msg.content], { type: 'text/markdown' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `ana-response-${new Date().toISOString().split('T')[0]}.md`;
                    a.click();
                    URL.revokeObjectURL(url);
                    toast({ title: 'Exported', description: 'Response saved as markdown file' });
                  }}
                  className="p-1.5 text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 rounded-md transition-colors"
                  title="Export as markdown"
                  aria-label="Export response as markdown"
                >
                  <Download className="w-4 h-4" />
                </button>
              )}
              {/* Save as artifact — calls /api/ana-ri/generate */}
              {contextProfile?.projectId && msg.content.length > 200 && !msg.savedAsArtifact && (
                <button
                  onClick={async () => {
                    try {
                      const res = await apiRequest('POST', '/api/ana-ri/generate', {
                        action_type: 'revised_artifact',
                        conversation_context: messages.slice(-10).map(m => ({ role: m.role, content: m.content })),
                        project_id: contextProfile.projectId,
                        user_role: contextProfile?.userRole || undefined,
                      });
                      if (res.ok) {
                        const data = await res.json();
                        toast({ title: 'Saved as artifact', description: data.artifactId ? `Artifact #${data.artifactId}` : 'Content saved to project' });
                        setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, savedAsArtifact: true } : m));
                      } else {
                        toast({ title: 'Save failed', description: 'Could not save artifact', variant: 'destructive' });
                      }
                    } catch (err) {
                      toast({ title: 'Save failed', description: err instanceof Error ? err.message : 'Unknown error', variant: 'destructive' });
                    }
                  }}
                  className="p-1.5 text-zinc-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-md transition-colors"
                  title="Save as artifact"
                  aria-label="Save response as project artifact"
                >
                  <Download className="w-4 h-4" />
                </button>
              )}
              {msg.savedAsArtifact && (
                <span className="text-xs text-emerald-600 font-medium ml-1">Saved</span>
              )}
            </div>
          )}
        </div>
      </div>
    );
  };

  // ── Input bar ──
  const renderInput = () => (
    <div className="max-w-[720px] mx-auto w-full">
      {/* New thread button */}
      {hasMessages && (
        <div className="flex justify-center mb-2">
          <button
            onClick={() => { setMessages([]); threadIdRef.current = null; }}
            className="flex items-center gap-1.5 px-3 py-1 text-xs text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 rounded-full transition-colors"
          >
            <RotateCcw className="w-3 h-3" />
            New conversation
          </button>
          <button
            onClick={() => {
              const md = messages.map(m =>
                `### ${m.role === 'user' ? 'You' : 'AnA'}\n\n${m.content}`
              ).join('\n\n---\n\n');
              const blob = new Blob([`# AnA Conversation — ${new Date().toLocaleDateString()}\n\n${md}`], { type: 'text/markdown' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `ana-conversation-${new Date().toISOString().split('T')[0]}.md`;
              a.click();
              URL.revokeObjectURL(url);
              toast({ title: 'Exported', description: 'Conversation saved as markdown' });
            }}
            className="flex items-center gap-1.5 px-3 py-1 text-xs text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 rounded-full transition-colors"
          >
            <Download className="w-3 h-3" />
            Export
          </button>
        </div>
      )}

      {/* Attached file pills */}
      {attachedFiles.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {attachedFiles.map((f, i) => (
            <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium rounded-full bg-zinc-100 text-zinc-600 border border-zinc-200">
              <Paperclip className="w-3 h-3" />
              {f.name}
              <button
                onClick={() => setAttachedFiles(prev => prev.filter((_, j) => j !== i))}
                className="text-zinc-400 hover:text-zinc-600"
                aria-label={`Remove ${f.name}`}
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      <div
        className={cn(
          'flex items-end gap-3 px-4 py-3 border rounded-2xl transition-all duration-200',
          isFocused
            ? 'border-zinc-300 bg-white shadow-sm ring-1 ring-zinc-200'
            : 'border-zinc-200 bg-[#fafafa] hover:border-zinc-300'
        )}
      >
        {/* Mode selector */}
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
                  : 'text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600'
            )}
          >
            {chatMode === 'deep-research' ? <Zap className="w-3.5 h-3.5" />
              : chatMode === 'nano-banana' ? <ImageIcon className="w-3.5 h-3.5" />
              : <MessageSquare className="w-3.5 h-3.5" />}
            <span className="hidden sm:inline">
              {chatMode === 'deep-research' ? 'Research' : chatMode === 'nano-banana' ? 'Nano Banana' : 'AnA'}
            </span>
            <ChevronDown className="w-3 h-3 opacity-50" />
          </button>

          {showModeDropdown && (
            <div className="absolute bottom-full left-0 mb-1.5 w-56 bg-white rounded-xl border border-zinc-200 shadow-lg py-1 z-50">
              <button
                type="button"
                onClick={() => { setChatMode('standard'); setShowModeDropdown(false); }}
                className={cn('w-full flex items-start gap-3 px-3 py-2.5 text-left hover:bg-zinc-50 transition-colors', chatMode === 'standard' && 'bg-zinc-50')}
              >
                <MessageSquare className="w-4 h-4 mt-0.5 text-zinc-500 flex-shrink-0" />
                <div>
                  <div className="text-sm font-medium text-zinc-900">AnA</div>
                  <div className="text-[11px] text-zinc-400 leading-tight">Regulatory co-pilot</div>
                </div>
                {chatMode === 'standard' && <Check className="w-4 h-4 text-[#b4654a] ml-auto mt-0.5 flex-shrink-0" />}
              </button>
              <button
                type="button"
                onClick={() => { setChatMode('deep-research'); setShowModeDropdown(false); }}
                className={cn('w-full flex items-start gap-3 px-3 py-2.5 text-left hover:bg-zinc-50 transition-colors', chatMode === 'deep-research' && 'bg-violet-50')}
              >
                <Zap className="w-4 h-4 mt-0.5 text-violet-600 flex-shrink-0" />
                <div>
                  <div className="text-sm font-medium text-zinc-900">Deep Research</div>
                  <div className="text-[11px] text-zinc-400 leading-tight">ClinicalTrials.gov, PubMed, FDA &amp; more</div>
                </div>
                {chatMode === 'deep-research' && <Check className="w-4 h-4 text-violet-600 ml-auto mt-0.5 flex-shrink-0" />}
              </button>
              <div className="mx-2 my-0.5 border-t border-zinc-100" />
              <button
                type="button"
                onClick={() => { setChatMode('nano-banana'); setShowModeDropdown(false); }}
                className={cn('w-full flex items-start gap-3 px-3 py-2.5 text-left hover:bg-zinc-50 transition-colors', chatMode === 'nano-banana' && 'bg-amber-50')}
              >
                <ImageIcon className="w-4 h-4 mt-0.5 text-amber-600 flex-shrink-0" />
                <div>
                  <div className="text-sm font-medium text-zinc-900">Nano Banana</div>
                  <div className="text-[11px] text-zinc-400 leading-tight">AI image generation &amp; visual design</div>
                </div>
                {chatMode === 'nano-banana' && <Check className="w-4 h-4 text-amber-600 ml-auto mt-0.5 flex-shrink-0" />}
              </button>
            </div>
          )}
        </div>

        {/* Intent lens — standard mode only */}
        {chatMode === 'standard' && intentLens !== 'auto' && (
          <button
            type="button"
            onClick={() => setIntentLens('auto')}
            className="flex-shrink-0 self-center flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-[#f5ebe7] text-[#b4654a] hover:bg-[#eeddd7] transition-colors"
            title="Click to clear lens"
          >
            {intentLens}
            <span className="text-[#c9917a]">&times;</span>
          </button>
        )}
        {chatMode === 'standard' && intentLens === 'auto' && (
          <div className="flex-shrink-0 self-center relative group">
            <select
              value={intentLens}
              onChange={(e) => setIntentLens(e.target.value as any)}
              className="appearance-none bg-transparent text-[11px] text-zinc-400 hover:text-zinc-600 cursor-pointer pr-1 outline-none"
              title="Analysis lens"
              aria-label="Select analysis lens"
            >
              <option value="auto">auto</option>
              <option value="audit">audit</option>
              <option value="improve">improve</option>
              <option value="risk">risk</option>
              <option value="strategy">strategy</option>
              <option value="compare">compare</option>
            </select>
          </div>
        )}

        {/* Slash command autocomplete */}
        {input.startsWith('/') && !input.includes(' ') && (
          <div className="absolute bottom-full left-0 right-0 mb-1 mx-4 bg-white rounded-xl border border-zinc-200 shadow-lg py-1 z-50 max-h-[200px] overflow-y-auto" role="listbox" aria-label="Slash commands" data-testid="ana-slash-commands">
            {[
              { cmd: '/risk', desc: 'Analyze submission risk profile' },
              { cmd: '/readiness', desc: 'Check submission readiness' },
              { cmd: '/precedent', desc: 'Find regulatory precedents' },
              { cmd: '/claims', desc: 'Analyze evidence chain' },
              { cmd: '/recommend', desc: 'Get prioritized next actions' },
              { cmd: '/next', desc: 'What should I work on next?' },
              { cmd: '/simulate', desc: 'Simulate reviewer challenges' },
              { cmd: '/signals', desc: 'Show RIM intelligence signals' },
              { cmd: '/assess', desc: 'Full project assessment (readiness + risks + actions)' },
              { cmd: '/twin', desc: 'Submission twin — claims, evidence, reviewer simulation' },
              { cmd: '/consistency', desc: 'Cross-module consistency analysis' },
              { cmd: '/deficiencies', desc: 'Known deficiency patterns for this submission type' },
              { cmd: '/knowledge', desc: 'Search project knowledge base' },
              { cmd: '/decisions', desc: 'View project decision audit trail' },
              { cmd: '/sap', desc: 'Generate Statistical Analysis Plan' },
              { cmd: '/power', desc: 'Calculate sample size and power' },
              { cmd: '/dose', desc: 'Design dose escalation protocol' },
              { cmd: '/defensibility', desc: 'Statistical defensibility assessment' },
              { cmd: '/design', desc: 'Design a clinical trial' },
              { cmd: '/safety', desc: 'Safety narratives, TEAE, SAE, benefit-risk' },
              { cmd: '/cmc', desc: 'CMC comparability, manufacturing, Module 3' },
              { cmd: '/csr', desc: 'Clinical study report analysis (ICH E3)' },
              { cmd: '/device', desc: 'Medical device: 510(k), PMA, De Novo, EU MDR' },
              { cmd: '/ectd', desc: 'eCTD module structure and artifact placement' },
              { cmd: '/audit', desc: 'Audit document — completeness, consistency, defensibility' },
              { cmd: '/amend', desc: 'Amend document — change tracking, impact analysis' },
              { cmd: '/review', desc: 'Regulatory review — reviewer perspective, deficiency detection' },
              { cmd: '/memo', desc: 'Generate risk assessment memo (go/no-go)' },
              { cmd: '/brief', desc: 'Generate reviewer question anticipation brief' },
              { cmd: '/strategy', desc: 'Generate regulatory strategy note' },
              { cmd: '/narrative', desc: 'Generate safety narrative (TEAE, SAE, benefit-risk)' },
              { cmd: '/report', desc: 'Generate regulatory report' },
              { cmd: '/iss', desc: 'Integrated Summary of Safety' },
              { cmd: '/ise', desc: 'Integrated Summary of Efficacy' },
              { cmd: '/ib', desc: 'Investigator\'s Brochure' },
              { cmd: '/smpc', desc: 'Summary of Product Characteristics (EU)' },
              { cmd: '/rmp', desc: 'Risk Management Plan (EU)' },
              { cmd: '/uspi', desc: 'US Prescribing Information' },
              { cmd: '/draft', desc: 'Draft any CTD section (auto-detects type)' },
              { cmd: '/scan', desc: 'Scan section for regulatory deficiencies' },
              { cmd: '/checklist', desc: 'Generate compliance checklist' },
              { cmd: '/freeze', desc: 'Freeze document (immutable snapshot)' },
              { cmd: '/sign', desc: 'Request electronic signature (21 CFR Part 11)' },
              { cmd: '/submit', desc: 'Submit document to regulatory workflow' },
              { cmd: '/preflight', desc: 'Run section preflight' },
              { cmd: '/status', desc: 'Quick project status — readiness, blockers, next step' },
              { cmd: '/workflow', desc: 'Full submission workflow status and next steps' },
              { cmd: '/help', desc: 'Show what AnA can do for your project right now' },
              { cmd: '/export', desc: 'Export this conversation' },
            ].filter(c => c.cmd.startsWith(input.toLowerCase())).map(c => (
              <button
                key={c.cmd}
                type="button"
                onClick={() => { setInput(c.cmd + ' '); inputRef.current?.focus(); }}
                className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-zinc-50 transition-colors"
              >
                <code className="text-xs font-mono text-[#b4654a] bg-[#fdf5f2] px-1.5 py-0.5 rounded">{c.cmd}</code>
                <span className="text-xs text-zinc-500">{c.desc}</span>
              </button>
            ))}
          </div>
        )}

        {/* Textarea */}
        <textarea
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          placeholder={
            chatMode === 'deep-research' ? 'Ask a research question...'
              : chatMode === 'nano-banana' ? 'Describe an image or presentation...'
              : 'Message AnA... (try /risk, /readiness, /precedent)'
          }
          rows={1}
          className="flex-1 resize-none bg-transparent border-none outline-none text-[15px] text-zinc-900 placeholder:text-zinc-400 leading-6 min-h-[24px] max-h-[200px]"
          data-testid="ana-chat-input"
        />

        {/* File upload */}
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          accept=".pdf,.doc,.docx,.txt,.csv,.xlsx"
          multiple
          onChange={(e) => { if (e.target.files?.length) handleFileUpload(e.target.files); e.target.value = ''; }}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="flex-shrink-0 self-center p-1.5 text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 rounded-md transition-colors"
          aria-label="Attach file"
          title="Attach file (PDF, DOC, TXT, CSV, XLSX)"
          data-testid="ana-file-upload"
        >
          <Paperclip className="w-4 h-4" />
        </button>

        {/* Send or Stop button */}
        {isStreaming ? (
          <button
            onClick={handleStop}
            className="flex-shrink-0 p-2 rounded-full bg-zinc-900 text-white hover:bg-zinc-700 transition-colors"
            aria-label="Stop generating"
          >
            <Square className="w-4 h-4" />
          </button>
        ) : (
          <button
            onClick={() => handleSend()}
            disabled={!input.trim()}
            className={cn(
              'flex-shrink-0 p-2 rounded-full transition-colors duration-150',
              input.trim()
                ? 'bg-zinc-900 text-white hover:bg-zinc-700'
                : 'bg-zinc-200 text-zinc-400 cursor-not-allowed'
            )}
            aria-label="Send message"
            data-testid="ana-chat-send"
          >
            <ArrowUp className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );

  // ── Compact mode ──
  if (mode === 'compact') {
    return (
      <div className="flex-shrink-0 border-t border-zinc-200 bg-white relative z-30">
        {hasMessages && (
          <div className="max-h-[50vh] overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
            {messages.map(renderMessage)}
            <div ref={messagesEndRef} />
          </div>
        )}
        <div className="px-4 py-3 bg-white">{renderInput()}</div>
      </div>
    );
  }

  // ── Full mode ──
  return (
    <div className="flex-1 flex flex-col min-h-0 bg-white" data-testid="ana-chat-panel">
      {/* Conversation health bar — shows when context is heavy */}
      {messages.length > 6 && (() => {
        const tokens = estimateTokens(messages);
        const tokensK = (tokens / 1000).toFixed(1);
        const isHeavy = tokens > 8000;
        const isDegrading = tokens > 16000;
        if (!isHeavy) return null;
        return (
          <div
            className={cn(
              'flex items-center justify-between px-4 py-1.5 text-[11px] border-b',
              isDegrading ? 'bg-orange-50 border-orange-200 text-orange-700' : 'bg-amber-50 border-amber-200 text-amber-700'
            )}
            role="alert"
            data-testid="ana-health-bar"
          >
            <span>{isDegrading ? 'Long conversation — responses may lose earlier context' : `~${tokensK}K tokens — consider starting a new thread for best results`}</span>
            <button
              onClick={() => { setMessages([]); threadIdRef.current = null; }}
              className="font-medium hover:underline"
            >
              New conversation
            </button>
          </div>
        );
      })()}
      {/* Conversation area */}
      <div
        className="flex-1 overflow-y-auto"
        role="log"
        aria-live="polite"
        aria-label="Conversation with AnA"
        style={{ scrollbarWidth: 'thin' }}
        data-testid="ana-chat-messages"
      >
        {!hasMessages ? (
          /* Empty state — greeting + actions */
          <div className="flex flex-col items-center justify-center h-full px-6">
            <div className="max-w-[560px] w-full text-center">
              <h2 className="text-2xl font-medium text-zinc-900 mb-2">{defaultGreeting}</h2>

              {effectiveSuggestedActions.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-8 max-w-md mx-auto">
                  {effectiveSuggestedActions.map(action => (
                    <button
                      key={action.id}
                      onClick={() => handleSuggestedAction(action)}
                      className="text-left px-4 py-3 rounded-xl border border-zinc-200 hover:border-zinc-300 hover:bg-zinc-50 transition-colors"
                    >
                      <p className="text-sm font-medium text-zinc-700">{action.label}</p>
                      {action.description && (
                        <p className="text-xs text-zinc-400 mt-0.5 line-clamp-1">{action.description}</p>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : (
          /* Messages */
          <div className="pb-2">
            {messages.map(renderMessage)}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Bottom input bar */}
      <div className="flex-shrink-0 px-4 py-4 bg-white">
        {renderInput()}
      </div>
    </div>
  );
};

export default AnaPersistentPanel;
