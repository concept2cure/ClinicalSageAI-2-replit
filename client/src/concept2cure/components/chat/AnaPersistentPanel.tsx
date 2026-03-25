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
  executedActions?: any[];
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

  // ── Suggested actions (authoring-aware) ──
  const effectiveSuggestedActions = useMemo(() => {
    const actions: SuggestedAction[] = [];
    if (authoringContext) {
      if (hasSectionContext(authoringContext)) {
        actions.push({
          id: 'draft-section',
          label: `Draft ${authoringContext.sectionCode}`,
          intent: 'draft_section_from_context',
        });
      }
      if (hasArtifactContext(authoringContext)) {
        actions.push({
          id: 'compare-approved',
          label: 'Compare to last approved',
          intent: 'compare_against_approved',
        });
      }
    }
    const parent = suggestedActions || [];
    return [...actions.slice(0, 3), ...parent.slice(0, 2)].slice(0, 4);
  }, [suggestedActions, authoringContext]);

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

  // ── Initial message ──
  useEffect(() => {
    if (initialMessage && !initialMessageSentRef.current) {
      initialMessageSentRef.current = true;
      setTimeout(() => handleSend(initialMessage), 100);
    }
  }, [initialMessage]);

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
            } catch {}
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
        };

        // Use apiRequest for auth/org headers via its wrapper pattern.
        // We need raw fetch for AbortController signal + SSE streaming,
        // so we replicate the auth header logic from apiRequest.
        const orgId = localStorage.getItem('organizationId') || localStorage.getItem('currentOrganizationId') || '1';
        const authToken = localStorage.getItem('token') || localStorage.getItem('authToken') || localStorage.getItem('auth_token') || '';

        const response = await fetch('/api/ana-ri/stream', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-organization-id': orgId,
            ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
          },
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
                  m.id === assistantMsgId ? { ...m, isStreaming: false } : m
                ));
              } else if (data.type === 'error') {
                setMessages(prev => prev.map(m =>
                  m.id === assistantMsgId
                    ? { ...m, content: m.content || 'An error occurred.', isStreaming: false }
                    : m
                ));
              }
            } catch {}
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
    [input, isStreaming, messages, contextProfile, chatMode, authoringContext]
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
      onActionRun({ id: action.id, intent: action.intent, label: action.label, status: 'running', ts: Date.now() });
    }
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
                  apiRequest('POST', '/api/concept2cure/feedback', { messageId: msg.id, positive: true })
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
                  apiRequest('POST', '/api/concept2cure/feedback', { messageId: msg.id, positive: false })
                    .catch(() => toast({ title: 'Feedback failed', description: 'Could not submit feedback.', variant: 'destructive' }));
                }}
                className="p-1.5 text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 rounded-md transition-colors"
                title="Bad response"
                aria-label="Mark as bad response"
              >
                <ThumbsDown className="w-4 h-4" />
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
                >
                  <Download className="w-4 h-4" />
                </button>
              )}
              {(msg as any).insertedToEditor && (
                <span className="text-xs text-blue-600 font-medium ml-1">Inserted</span>
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
              : 'Message AnA...'
          }
          rows={1}
          className="flex-1 resize-none bg-transparent border-none outline-none text-[15px] text-zinc-900 placeholder:text-zinc-400 leading-6 min-h-[24px] max-h-[200px]"
          data-testid="ana-chat-input"
        />

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
