/**
 * @fileoverview Zen Chat Hub
 * @module concept2cure/components/chat/ZenChat
 * @version 3.0.0
 *
 * @description
 * Claude.ai / ChatGPT style conversational interface.
 * Clean, focused, breathing room for thinking.
 *
 * Now connected to AnA RI backend for real AI responses.
 *
 * Design Philosophy:
 * - Content-first: Messages are the hero
 * - Minimal chrome: UI fades away during conversation
 * - Thoughtful animation: Smooth, never jarring
 * - Accessible: Keyboard navigable, screen reader friendly
 *
 * @compliance
 * - FDA 21 CFR Part 11: All messages logged with timestamps
 */

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useLocation } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import { apiRequest } from '@/lib/queryClient';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import {
  Sparkles,
  Copy,
  RotateCcw,
  ThumbsUp,
  ThumbsDown,
  Check,
  FileText,
  ChevronDown,
  ArrowUp,
  StopCircle,
  AlertCircle,
  WifiOff,
  ExternalLink,
  Save,
  Download,
  PenTool,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

// Configure marked for safe, clean HTML output
marked.setOptions({ breaks: true, gfm: true });

/** Render markdown string to safe HTML — sanitized to prevent XSS */
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
import { useCortexChat, useCortexHealth } from '../../hooks/useCortex';
import { useDocumentActions } from '../../hooks/useDocumentActions';
import type { CortexArtifact } from '../../services/cortexService';
import { ActionCard } from './ActionCard';
import type { ActionCardDef } from './ActionCard';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  attachments?: Attachment[];
  isStreaming?: boolean;
  artifacts?: CortexArtifact[];
  error?: string;
}

interface Attachment {
  id: string;
  name: string;
  type: 'document' | 'image' | 'data';
  size: number;
}

interface SlashCommand {
  id: string;
  label: string;
  hint: string;
  prompt: string;
  icon: React.ReactNode;
}

interface ZenChatProps {
  projectId?: string;
  projectName?: string;
  submissionType?: string;
  threadId?: string;
  /** Logged-in user's display name for avatar initials */
  userName?: string;
  /** Auto-send this message on mount (e.g., from IND Workspace "Draft with AI") */
  initialMessage?: string | null;
  onNewArtifact?: (artifact: CortexArtifact) => void;
  onThreadChange?: (threadId: string) => void;
  /** Personalized greeting from user intelligence */
  greeting?: { text: string; subtitle?: string } | null;
  /** Last work session summary for continuity */
  lastWork?: { contextTitle: string; contextType: string } | null;
  /** AI-recommended next task */
  nextTask?: { taskTitle: string; taskDescription?: string } | null;
  /** Suggested actions from workspace summary (real backend data) */
  suggestedActions?: ActionCardDef[];
  /** Navigate to a path (e.g. /concept2cure?panel=vault) */
  onNavigate?: (path: string) => void;
  /** Open the new-project dialog */
  onNewProject?: () => void;
  /** Callback fired when an action starts/completes for run log visibility */
  onActionRun?: (entry: {
    id: string;
    intent: string;
    label: string;
    status: 'running' | 'done' | 'failed';
    ts: number;
  }) => void;
}

// ═══════════════════════════════════════════════════════════════════════════════
// THINKING INDICATOR - Claude-style pulsing "Thinking..." state
// ═══════════════════════════════════════════════════════════════════════════════

const ANA_THINKING_PHRASES = [
  'Pulling up the relevant guidance...',
  'Reviewing regulatory precedents...',
  'Cross-referencing your dossier...',
  'Checking the latest FDA thinking...',
  'Working through the ICH guidelines...',
  'Reviewing compliance requirements...',
  'Building something solid for you...',
  'This one deserves a thorough answer...',
  'Thinking through the regulatory implications...',
  'Finding the precedent that matters here...',
];

const ThinkingIndicator: React.FC = () => {
  const [msg, setMsg] = React.useState(() => ANA_THINKING_PHRASES[Math.floor(Math.random() * ANA_THINKING_PHRASES.length)]);
  React.useEffect(() => {
    const interval = setInterval(() => {
      setMsg(ANA_THINKING_PHRASES[Math.floor(Math.random() * ANA_THINKING_PHRASES.length)]);
    }, 3000);
    return () => clearInterval(interval);
  }, []);
  return (
    <div className="flex items-center gap-2 py-1">
      <div className="relative flex items-center gap-1">
        <div className="w-1.5 h-1.5 rounded-full bg-stone-400 animate-[pulse_1.4s_ease-in-out_infinite]" />
        <div className="w-1.5 h-1.5 rounded-full bg-stone-400 animate-[pulse_1.4s_ease-in-out_0.2s_infinite]" />
        <div className="w-1.5 h-1.5 rounded-full bg-stone-400 animate-[pulse_1.4s_ease-in-out_0.4s_infinite]" />
      </div>
      <span className="text-sm text-stone-500 font-medium animate-pulse">{msg}</span>
    </div>
  );
};

const TypingIndicator: React.FC = () => (
  <div className="flex items-center gap-1.5 py-1">
    <div className="w-2 h-2 rounded-full bg-stone-400 animate-pulse" />
    <div className="w-2 h-2 rounded-full bg-stone-400 animate-pulse delay-100" />
    <div className="w-2 h-2 rounded-full bg-stone-400 animate-pulse delay-200" />
  </div>
);

// ═══════════════════════════════════════════════════════════════════════════════
// MESSAGE COMPONENT - Clean, readable, actionable
// ═══════════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════════
// ARTIFACT ACTION BUTTONS - Save to Vault, Export DOCX, Open in Editor
// ═══════════════════════════════════════════════════════════════════════════════

interface ArtifactActionsProps {
  artifact: CortexArtifact;
  onSave: (artifact: CortexArtifact) => void;
  onExportDocx: (artifact: CortexArtifact) => void;
  onExportPdf: (artifact: CortexArtifact) => void;
  onOpenEditor: (artifact: CortexArtifact) => void;
  savingId: string | null;
  savedIds: Set<string>;
}

const ArtifactActions: React.FC<ArtifactActionsProps> = ({
  artifact,
  onSave,
  onExportDocx,
  onExportPdf,
  onOpenEditor,
  savingId,
  savedIds,
}) => {
  const isSaving = savingId === artifact.id;
  const isSaved = savedIds.has(artifact.id);
  const [showExportMenu, setShowExportMenu] = React.useState(false);
  const wordCount = artifact.content?.split(/\s+/).length || 0;

  return (
    <div className="mt-2 p-3 bg-stone-50 border border-stone-200 rounded-xl">
      <div className="flex items-center gap-2 mb-2">
        <FileText className="w-4 h-4 text-stone-700" />
        <span className="text-sm font-medium text-stone-900 truncate flex-1">
          {artifact.title}
        </span>
        <span className="text-xs text-stone-400">{wordCount.toLocaleString()} words</span>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={() => onSave(artifact)}
          disabled={isSaving || isSaved}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors duration-150',
            isSaved
              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
              : 'bg-stone-100 text-stone-800 border border-stone-200 hover:bg-stone-200'
          )}
        >
          {isSaving ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : isSaved ? (
            <Check className="w-3.5 h-3.5" />
          ) : (
            <Save className="w-3.5 h-3.5" />
          )}
          {isSaved ? 'Saved to Vault' : 'Save to Vault'}
        </button>

        {/* Export dropdown - DOCX, PDF */}
        <div className="relative">
          <button
            onClick={() => setShowExportMenu(!showExportMenu)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-xs font-medium text-stone-700 hover:bg-stone-50 transition-colors duration-150"
          >
            <Download className="w-3.5 h-3.5" />
            Export
            <ChevronDown className="w-3 h-3" />
          </button>
          {showExportMenu && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowExportMenu(false)} />
              <div className="absolute left-0 bottom-full mb-1 w-52 bg-white border border-stone-200 rounded-lg shadow-sm z-50 py-1">
                <button
                  onClick={() => { onExportDocx(artifact); setShowExportMenu(false); }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-stone-700 hover:bg-stone-50"
                >
                  <FileText className="w-4 h-4 text-stone-700" />
                  <div className="text-left">
                    <div className="font-medium text-xs">Word Document (.docx)</div>
                    <div className="text-xs text-stone-400">MS Word, Google Docs compatible</div>
                  </div>
                </button>
                <button
                  onClick={() => { onExportPdf(artifact); setShowExportMenu(false); }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-stone-700 hover:bg-stone-50"
                >
                  <FileText className="w-4 h-4 text-red-500" />
                  <div className="text-left">
                    <div className="font-medium text-xs">PDF Document (.pdf)</div>
                    <div className="text-xs text-stone-400">Read-only, print-ready</div>
                  </div>
                </button>
              </div>
            </>
          )}
        </div>

        <button
          onClick={() => onOpenEditor(artifact)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-stone-200 bg-stone-100 px-3 py-1.5 text-xs font-medium text-stone-800 hover:bg-stone-200 transition-colors duration-150"
        >
          <PenTool className="w-3.5 h-3.5" />
          Edit Inline
        </button>
      </div>
    </div>
  );
};

interface MessageBubbleProps {
  message: Message;
  onCopy: () => void;
  onRecallPrompt?: () => void;
  onRegenerate?: () => void;
  onFeedback?: (positive: boolean) => void;
  onNavigate?: (href: string) => void;
  onSaveArtifact?: (artifact: CortexArtifact) => void;
  onExportDocxArtifact?: (artifact: CortexArtifact) => void;
  onExportPdfArtifact?: (artifact: CortexArtifact) => void;
  onOpenEditorArtifact?: (artifact: CortexArtifact) => void;
  savingArtifactId?: string | null;
  savedArtifactIds?: Set<string>;
  userInitials?: string;
}

const MessageBubble: React.FC<MessageBubbleProps> = ({
  message,
  onCopy,
  onRecallPrompt,
  onRegenerate,
  onFeedback,
  onNavigate,
  onSaveArtifact,
  onExportDocxArtifact,
  onExportPdfArtifact,
  onOpenEditorArtifact,
  savingArtifactId,
  savedArtifactIds,
  userInitials = 'U',
}) => {
  const isUser = message.role === 'user';
  const [copied, setCopied] = useState(false);
  const [showActions, setShowActions] = useState(false);

  // Parse markdown once when content changes
  const htmlContent = useMemo(() => {
    if (!message.content) return '';
    return renderMarkdown(message.content);
  }, [message.content]);

  const actionLinks = useMemo(() => {
    const links: Array<{ href: string; label: string }> = [];
    const urlRegex = /(https?:\/\/[^\s)"<>]+)/g;
    let match;
    while ((match = urlRegex.exec(message.content)) !== null) {
      const href = match[1];
      if (!links.some(l => l.href === href)) {
        links.push({ href, label: href.replace(/^https?:\/\//, '').split('/')[0] });
      }
    }
    return links.slice(0, 4); // cap at 4
  }, [message.content]);

  const handleCopy = () => {
    onCopy();
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // When streaming and content is empty → show dots; when content exists → show it
  const showTypingDots = message.isStreaming && !message.content;

  return (
    <div
      className={cn(
        'group py-6 px-4 sm:px-6',
        !isUser && 'bg-white border-b border-stone-200/80',
        isUser && 'bg-stone-50/60'
      )}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      <div className="max-w-3xl mx-auto">
        <div className="flex gap-4">
          {/* Avatar */}
          <div
            className={cn(
              'flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center shadow-sm mt-0.5',
              isUser ? 'bg-stone-800 text-white' : 'bg-stone-700'
            )}
          >
            {isUser ? (
              <span className="text-xs font-semibold text-white">{userInitials}</span>
            ) : (
              <Sparkles className="w-4 h-4 text-white" />
            )}
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            {/* Role label */}
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-sm font-semibold text-stone-900">{isUser ? 'You' : 'AnA'}</span>
              {message.isStreaming && message.content && (
                <span className="inline-flex gap-0.5 items-center">
                  <span
                    className="w-1 h-1 rounded-full bg-[#E8967A] animate-pulse"
                    style={{ animationDelay: '0ms' }}
                  />
                  <span
                    className="w-1 h-1 rounded-full bg-[#E8967A] animate-pulse"
                    style={{ animationDelay: '150ms' }}
                  />
                  <span
                    className="w-1 h-1 rounded-full bg-[#E8967A] animate-pulse"
                    style={{ animationDelay: '300ms' }}
                  />
                </span>
              )}
            </div>

            {/* Message body */}
            {showTypingDots ? (
              <TypingIndicator />
            ) : isUser ? (
              // User messages: plain text (preserving whitespace)
              <>
                <p className="text-stone-900 leading-relaxed whitespace-pre-wrap text-sm">
                  {message.content}
                </p>
                {(message as any).recalledToInput && (
                  <p className="mt-1 text-xs font-medium text-stone-600">Editing prompt in composer</p>
                )}
              </>
            ) : (
              // Assistant messages: rendered markdown
              <div
                className="prose prose-sm prose-stone max-w-none
                  prose-headings:font-semibold prose-headings:text-stone-900 prose-headings:leading-snug
                  prose-h1:text-lg prose-h2:text-base prose-h3:text-sm
                  prose-p:text-stone-700 prose-p:leading-relaxed prose-p:my-2
                  prose-strong:text-stone-900 prose-strong:font-semibold
                  prose-code:text-[#C4623F] prose-code:bg-[#FBF0EB] prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-xs prose-code:font-mono prose-code:before:content-none prose-code:after:content-none
                  prose-pre:bg-stone-900 prose-pre:text-stone-100 prose-pre:rounded-xl prose-pre:p-4 prose-pre:text-xs
                  prose-blockquote:border-l-[#D8D5CA] prose-blockquote:text-stone-600 prose-blockquote:not-italic prose-blockquote:pl-3 prose-blockquote:my-2
                  prose-ul:text-stone-700 prose-ol:text-stone-700 prose-ul:my-2 prose-ol:my-2
                  prose-li:my-1
                  prose-table:text-sm prose-th:bg-stone-50 prose-th:font-semibold prose-td:border-stone-200
                  prose-a:text-[#D97757] prose-a:font-medium prose-a:underline prose-a:decoration-[#E8C7BA] prose-a:underline-offset-2 hover:prose-a:text-[#C4623F]
                  [&>*:first-child]:mt-0 [&>*:last-child]:mb-0"
                dangerouslySetInnerHTML={{ __html: htmlContent }}
              />
            )}

            {/* Attachments */}
            {message.attachments && message.attachments.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {message.attachments.map(attachment => (
                  <div
                    key={attachment.id}
                    className="inline-flex items-center gap-2 px-3 py-1.5 bg-stone-100 rounded-lg text-sm text-stone-600"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    <span className="truncate max-w-[150px]">{attachment.name}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Artifact document actions - Save to Vault, Export, Edit */}
            {!message.isStreaming &&
              !isUser &&
              message.artifacts &&
              message.artifacts.length > 0 &&
              onSaveArtifact && (
                <div className="mt-3 space-y-2">
                  {message.artifacts.map(artifact => (
                    <ArtifactActions
                      key={artifact.id}
                      artifact={artifact}
                      onSave={onSaveArtifact}
                      onExportDocx={onExportDocxArtifact || (() => {})}
                      onExportPdf={onExportPdfArtifact || (() => {})}
                      onOpenEditor={onOpenEditorArtifact || (() => {})}
                      savingId={savingArtifactId || null}
                      savedIds={savedArtifactIds || new Set()}
                    />
                  ))}
                </div>
              )}

            {/* External links from assistant response */}
            {!message.isStreaming && !isUser && actionLinks.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {actionLinks.map(link => (
                  <button
                    key={link.href}
                    onClick={() => onNavigate?.(link.href)}
                    className="inline-flex items-center gap-1.5 rounded-full border border-stone-200 bg-white px-3 py-1 text-xs font-medium text-stone-600 hover:border-stone-300 hover:bg-stone-50 transition-colors duration-150"
                  >
                    <ExternalLink className="h-3 w-3" />
                    {link.label}
                  </button>
                ))}
              </div>
            )}

            {/* Hover actions */}
            {!message.isStreaming && (
              <div
                className={cn(
                  'flex items-center gap-1 mt-1.5 transition-opacity duration-150',
                  showActions ? 'opacity-100' : 'opacity-0 pointer-events-none'
                )}
              >
                {isUser && (
                  <button
                    onClick={onRecallPrompt}
                    className="p-1.5 text-stone-400 hover:text-stone-700 hover:bg-stone-100 rounded-md transition-colors duration-150"
                    title="Recall this prompt to edit"
                    aria-label="Recall this prompt to edit"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                  </button>
                )}
                <button
                  onClick={handleCopy}
                  className="p-1.5 text-stone-400 hover:text-stone-700 hover:bg-stone-100 rounded-md transition-colors duration-150"
                  title="Copy"
                >
                  {copied ? (
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                </button>
                {isUser && (message as any).recalledToInput && (
                  <span className="text-xs text-stone-600 font-medium ml-1">Loaded to input</span>
                )}
                {!isUser && (
                  <>
                    <button
                      onClick={() => onFeedback?.(true)}
                      className="p-1.5 text-stone-400 hover:text-stone-700 hover:bg-stone-100 rounded-md transition-colors duration-150"
                      title="Good response"
                    >
                      <ThumbsUp className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => onFeedback?.(false)}
                      className="p-1.5 text-stone-400 hover:text-stone-700 hover:bg-stone-100 rounded-md transition-colors duration-150"
                      title="Bad response"
                    >
                      <ThumbsDown className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={onRegenerate}
                      className="p-1.5 text-stone-400 hover:text-stone-700 hover:bg-stone-100 rounded-md transition-colors duration-150"
                      title="Regenerate"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// WELCOME SCREEN - Role-aware, value-forward
// ═══════════════════════════════════════════════════════════════════════════════

interface WelcomeScreenProps {
  onSuggestionClick: (text: string) => void;
  onNavigate?: (path: string) => void;
  onNewProject?: () => void;
  onRunIntent?: (intent: string) => void;
  greeting?: { text: string; subtitle?: string } | null;
  lastWork?: { contextTitle: string; contextType: string } | null;
  nextTask?: { taskTitle: string; taskDescription?: string } | null;
  suggestedActions?: ActionCardDef[];
  submissionType?: string;
}

/** Quick-start prompts when there's no project context */
const QUICK_START_PROMPTS = [
  {
    label: 'Plan a new submission',
    prompt: 'I need to plan a new regulatory submission. Help me choose the right pathway (510(k), IND, NDA, BLA, PMA, or De Novo) and create a step-by-step project plan.',
    sub: 'Pathway selection · timeline · checklist',
  },
  {
    label: 'Draft a document section',
    prompt: 'Help me draft a regulatory document section. I\'ll tell you which section and submission type, and you\'ll generate a first draft I can edit.',
    sub: 'eCTD · CSR · protocol · CMC',
  },
  {
    label: 'Check my submission for gaps',
    prompt: 'Review my submission package and identify any missing sections, compliance gaps, or areas that need strengthening before I submit to FDA.',
    sub: 'Gap analysis · compliance · readiness',
  },
  {
    label: 'Research a regulatory question',
    prompt: 'I have a regulatory question. Help me find the relevant FDA guidance, ICH guidelines, or precedent decisions to support my approach.',
    sub: 'Guidance · precedents · requirements',
  },
];

const SLASH_COMMANDS: SlashCommand[] = [
  {
    id: 'summary',
    label: '/summary',
    hint: 'Summarize current project risks and status',
    prompt:
      'Summarize my current project status, top regulatory risks, and the most important next action.',
    icon: <Sparkles className="h-3.5 w-3.5" />,
  },
  {
    id: 'gap-check',
    label: '/gap-check',
    hint: 'Run a readiness gap check',
    prompt:
      'Run a submission readiness gap check and list missing evidence, high-risk claims, and remediation steps.',
    icon: <AlertCircle className="h-3.5 w-3.5" />,
  },
  {
    id: 'timeline',
    label: '/timeline',
    hint: 'Generate milestone plan',
    prompt:
      'Create a milestone timeline with dependencies and critical path for this submission.',
    icon: <ChevronDown className="h-3.5 w-3.5" />,
  },
  {
    id: 'draft',
    label: '/draft',
    hint: 'Start drafting a section now',
    prompt:
      'Help me draft a regulatory section. Ask me for section name, agency, and intended claim strength first.',
    icon: <FileText className="h-3.5 w-3.5" />,
  },
];

/**
 * Segment-aware smart suggestions based on submission type.
 * Every suggestion leads to a tangible document or artifact.
 */
function getSmartSuggestions(submissionType?: string): Array<{ title: string; description: string; highlight: boolean }> {
  const st = (submissionType || '').toUpperCase();

  // IND suggestions (Pharma / Biotech)
  if (st === 'IND') return [
    { title: 'Draft IND Cover Letter with Form 1571 references', description: 'Generate formal FDA IND cover letter with complete cross-references — creates a governed document in the vault', highlight: false },
    { title: "Write the Investigator's Brochure (IB)", description: 'Draft ICH E6(R2) compliant IB compiling nonclinical pharmacology, toxicology, and clinical data', highlight: false },
    { title: 'Create Clinical Protocol for Phase I study', description: 'Draft ICH E6(R2) GCP-compliant protocol with objectives, design, endpoints, and statistical plan', highlight: false },
    { title: 'Generate Quality Overall Summary (M2.3)', description: 'Draft ICH M4Q-compliant QOS covering drug substance and drug product CMC sections', highlight: false },
  ];

  // NDA / BLA suggestions
  if (st === 'NDA' || st === 'BLA') return [
    { title: 'Draft Clinical Overview (Module 2.5)', description: 'Generate ICH M4E integrated clinical assessment with benefit-risk analysis for NDA/BLA', highlight: false },
    { title: 'Generate Integrated Summary of Safety (ISS)', description: 'Create pooled safety analysis across studies with exposure, AEs, SAEs, and special populations', highlight: false },
    { title: 'Write Prescribing Information / Label', description: 'Draft FDA-compliant PI with Highlights, Full Prescribing Information, and Medication Guide', highlight: false },
    { title: 'Create Clinical Study Report (ICH E3)', description: 'Draft full ICH E3 CSR with synopsis, methods, efficacy, safety, and discussion sections', highlight: false },
  ];

  // 510(k) suggestions (MedTech)
  if (st === '510K') return [
    { title: 'Draft 510(k) Cover Letter', description: 'Generate FDA 510(k) premarket notification cover letter with classification and predicate references', highlight: false },
    { title: 'Generate Substantial Equivalence comparison', description: 'Build detailed predicate comparison: intended use, technology, and performance data', highlight: false },
    { title: 'Create Device Description document', description: 'Draft comprehensive device description with materials, principles of operation, and specifications', highlight: false },
    { title: 'Build eSTAR submission package', description: 'Structure electronic 510(k) submission per FDA eSTAR format with all required sections', highlight: false },
  ];

  // PMA suggestions
  if (st === 'PMA') return [
    { title: 'Draft PMA Summary of Safety & Effectiveness', description: 'Generate SSED for Class III PMA with pivotal clinical study results and risk-benefit analysis', highlight: false },
    { title: 'Create Biocompatibility Assessment (ISO 10993)', description: 'Draft biological evaluation plan and results summary per ISO 10993-1:2018', highlight: false },
    { title: 'Write Clinical Study Protocol for pivotal trial', description: 'Draft IDE clinical study protocol with primary endpoints and statistical design', highlight: false },
    { title: 'Generate Risk Management File (ISO 14971)', description: 'Create comprehensive risk analysis with hazard identification, estimation, and mitigation', highlight: false },
  ];

  // MAA suggestions (EU/EMA)
  if (st === 'MAA') return [
    { title: 'Draft MAA Cover Letter for EMA', description: 'Generate EMA Marketing Authorization Application cover letter with regulatory pathway references', highlight: false },
    { title: 'Create IMPD (Investigational Medicinal Product Dossier)', description: 'Draft quality, nonclinical, and clinical sections for EU clinical trial authorization', highlight: false },
    { title: 'Write Clinical Evaluation Report (EU MDR)', description: 'Generate CER per MEDDEV 2.7/1 Rev 4 with literature appraisal and equivalence analysis', highlight: false },
    { title: 'Generate PSUR/PBRER', description: 'Draft ICH E2C(R2) periodic benefit-risk evaluation report for post-authorization safety', highlight: false },
  ];

  // Default — cover all types
  return [
    { title: 'Draft a complete IND Cover Letter', description: 'Generate a formal FDA cover letter with all required elements — creates a governed document you can edit and export', highlight: false },
    { title: 'Write a Clinical Study Protocol', description: 'Draft ICH E6(R2) compliant protocol with study design, endpoints, and statistical methods', highlight: false },
    { title: 'Create a Clinical Study Report (ICH E3)', description: 'Generate full CSR with synopsis, methods, efficacy results, safety evaluation, and conclusions', highlight: false },
    { title: 'Plan my submission timeline and tasks', description: 'Generate a milestone-based project plan with tasks, dependencies, and critical path', highlight: false },
  ];
}

const WelcomeScreen: React.FC<WelcomeScreenProps> = ({
  onSuggestionClick,
  onNavigate,
  onNewProject,
  onRunIntent,
  greeting,
  lastWork,
  nextTask,
  suggestedActions,
  submissionType,
}) => {
  // Choose prompts: if we have a submission type, show type-specific smart suggestions;
  // otherwise show general quick-start prompts
  const smartSuggestions = submissionType ? getSmartSuggestions(submissionType) : [];
  const hasSmartSuggestions = smartSuggestions.length > 0;

  return (
    <div className="flex flex-col items-center w-full px-4 py-12">
      <div className="w-full max-w-2xl">
        {/* Greeting — warm, concise */}
        <div className="text-center mb-10">
          <h1 className="text-base font-semibold text-stone-900 mb-2">
            {greeting?.text || 'Hi — what are you working on?'}
          </h1>
          <p className="text-sm text-stone-500 max-w-md mx-auto">
            {greeting?.subtitle || 'I draft regulatory documents, assess submission defensibility, identify reviewer friction points, and guide your regulatory strategy.'}
          </p>
        </div>

        {/* Continue previous work — only if there's context */}
        {(nextTask || lastWork) && (
          <div className="mb-8 rounded-xl border border-stone-200 bg-stone-50 p-4">
            <div className="text-xs font-semibold text-stone-600 uppercase tracking-wider mb-2">
              Pick up where you left off
            </div>
            {nextTask && (
              <button
                onClick={() => onSuggestionClick(nextTask.taskTitle)}
                className="w-full flex items-center gap-3 text-left text-sm font-medium text-stone-900 hover:text-stone-700 transition-colors py-1"
              >
                <ArrowUp className="w-3.5 h-3.5 rotate-45 flex-shrink-0" />
                {nextTask.taskTitle}
              </button>
            )}
            {lastWork && (
              <button
                onClick={() => onSuggestionClick(`Continue: ${lastWork.contextTitle}`)}
                className="w-full flex items-center gap-3 text-left text-sm text-stone-700 hover:text-stone-900 transition-colors py-1"
              >
                <ArrowUp className="w-3.5 h-3.5 rotate-45 flex-shrink-0" />
                Continue: {lastWork.contextTitle}
              </button>
            )}
          </div>
        )}

        {/* Workspace-driven suggested actions */}
        {suggestedActions && suggestedActions.length > 0 && (
          <div className="mb-8">
            <div className="text-xs font-semibold text-stone-400 uppercase tracking-wider mb-3">
              Suggested next steps
            </div>
            <div className="flex flex-wrap gap-2">
              {suggestedActions.map(action => (
                <ActionCard
                  key={action.id}
                  {...action}
                  onSend={onSuggestionClick}
                  onNavigate={onNavigate}
                  onNewProject={onNewProject}
                  onRunIntent={onRunIntent}
                  compact
                />
              ))}
            </div>
          </div>
        )}

        {/* Smart suggestions based on submission type, OR general quick-starts */}
        <div className="mb-6">
          {hasSmartSuggestions && (
            <div className="text-xs font-semibold text-stone-400 uppercase tracking-wider mb-3">
              For your {submissionType} submission
            </div>
          )}
          <div className="space-y-2">
            {(hasSmartSuggestions ? smartSuggestions : QUICK_START_PROMPTS.map(p => ({ title: p.label, description: p.sub, highlight: false, prompt: p.prompt }))).map((item, i) => (
              <button
                key={i}
                onClick={() => onSuggestionClick('prompt' in item ? (item as { prompt: string }).prompt : item.title)}
                className="w-full group flex items-center gap-4 p-4 rounded-xl border border-stone-200 bg-white hover:border-stone-300 hover:shadow-sm text-left transition-all duration-150"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-stone-900 group-hover:text-stone-700">
                    {item.title}
                  </div>
                  <div className="text-xs text-stone-500 mt-0.5">{item.description}</div>
                </div>
                <ArrowUp className="w-4 h-4 text-stone-400 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 rotate-45" />
              </button>
            ))}
          </div>
        </div>

        <p className="text-center text-xs text-stone-400 mt-4">
          Or just type your question below
        </p>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// INPUT AREA - Claude.ai style rounded input
// ═══════════════════════════════════════════════════════════════════════════════

interface ChatInputProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  onStop?: () => void;
  onRecallLastPrompt?: () => void;
  isGenerating?: boolean;
  placeholder?: string;
  slashCommands: SlashCommand[];
  onApplySlashCommand: (command: SlashCommand) => void;
  onOpenPromptLibrary?: () => void;
}

const ChatInput: React.FC<ChatInputProps> = ({
  value,
  onChange,
  onSend,
  onStop,
  onRecallLastPrompt,
  isGenerating = false,
  placeholder = 'Message AnA...',
  slashCommands,
  onApplySlashCommand,
  onOpenPromptLibrary,
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [isFocused, setIsFocused] = useState(false);
  const [selectedSlashIndex, setSelectedSlashIndex] = useState(0);

  const slashQuery = value.trimStart().startsWith('/')
    ? value.trimStart().slice(1).toLowerCase()
    : '';
  const filteredSlashCommands = useMemo(() => {
    if (!value.trimStart().startsWith('/')) return [];
    if (!slashQuery) return slashCommands;
    return slashCommands.filter(
      command =>
        command.label.toLowerCase().includes(slashQuery) ||
        command.hint.toLowerCase().includes(slashQuery)
    );
  }, [value, slashCommands, slashQuery]);

  useEffect(() => {
    setSelectedSlashIndex(0);
  }, [slashQuery]);

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      const newHeight = Math.min(textarea.scrollHeight, 200);
      textarea.style.height = `${newHeight}px`;
    }
  }, [value]);

  // Handle Enter key
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (filteredSlashCommands.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedSlashIndex(prev =>
          Math.min(prev + 1, filteredSlashCommands.length - 1)
        );
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedSlashIndex(prev => Math.max(prev - 1, 0));
        return;
      }
      if ((e.key === 'Enter' || e.key === 'Tab') && !e.shiftKey) {
        e.preventDefault();
        onApplySlashCommand(filteredSlashCommands[selectedSlashIndex]);
        return;
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (value.trim() && !isGenerating) {
        onSend();
      }
      return;
    }

    // Claude-like recall: ArrowUp on empty composer restores latest prompt.
    if (e.key === 'ArrowUp' && !value.trim() && !isGenerating) {
      const textarea = textareaRef.current;
      const caretAtStart =
        !!textarea && (textarea.selectionStart ?? 0) === 0 && (textarea.selectionEnd ?? 0) === 0;
      if (!textarea || caretAtStart) {
        e.preventDefault();
        onRecallLastPrompt?.();
      }
    }
  };

  const canSend = value.trim().length > 0 && !isGenerating;

  return (
    <div className="border-t border-stone-200 bg-white px-4 py-4">
      <div className="max-w-3xl mx-auto">
        {filteredSlashCommands.length > 0 && (
          <div className="mb-2 rounded-xl border border-stone-200 bg-white p-1 shadow-sm">
            {filteredSlashCommands.slice(0, 6).map((command, index) => (
              <Button
                key={command.id}
                type="button"
                variant="ghost"
                onClick={() => onApplySlashCommand(command)}
                className={cn(
                  'h-auto w-full justify-start gap-2 rounded-lg px-3 py-2 text-left',
                  index === selectedSlashIndex
                    ? 'bg-stone-100 text-stone-900 hover:bg-stone-100'
                    : 'text-stone-700 hover:bg-stone-50'
                )}
              >
                <span className="text-stone-500">{command.icon}</span>
                <span className="text-xs font-semibold">{command.label}</span>
                <span className="truncate text-xs text-stone-500">{command.hint}</span>
              </Button>
            ))}
          </div>
        )}
        <div
          className={cn(
            'flex items-end gap-2 px-4 py-3 bg-white border rounded-xl transition-all duration-150',
            isFocused
              ? 'border-stone-300 ring-4 ring-stone-100 shadow-sm'
              : 'border-stone-200 hover:border-stone-300'
          )}
        >
          {/* Textarea */}
          <textarea
            ref={textareaRef}
            value={value}
            onChange={e => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            placeholder={placeholder}
            rows={1}
            autoFocus
            className="flex-1 resize-none bg-transparent border-none outline-none text-stone-900 placeholder:text-stone-400 text-base leading-6 min-h-[24px] max-h-[200px]"
          />

          {/* Send/Stop button */}
          {isGenerating ? (
            <button
              onClick={onStop}
              className="flex-shrink-0 p-2 bg-stone-900 text-white rounded-full hover:bg-stone-800 transition-colors duration-150"
              title="Stop generating"
            >
              <StopCircle className="w-5 h-5" />
            </button>
          ) : (
            <button
              onClick={onSend}
              disabled={!canSend}
              className={cn(
                'flex-shrink-0 p-2 rounded-full transition-all duration-150',
                canSend
                  ? 'bg-stone-900 text-white hover:bg-stone-800 hover:scale-105'
                  : 'bg-stone-100 text-stone-400 cursor-not-allowed'
              )}
              title="Send message"
            >
              <ArrowUp className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Disclaimer */}
        <p className="text-center text-xs text-stone-400 mt-2">
          Type <span className="font-semibold text-stone-500">/</span> for commands.
          {' '}
          Press <span className="font-semibold text-stone-500">↑</span> on empty input to recall your last prompt.
          {onOpenPromptLibrary ? (
            <>
              {' '}
              <button
                type="button"
                onClick={onOpenPromptLibrary}
                className="font-semibold text-stone-600 underline decoration-stone-300 underline-offset-2 hover:text-stone-800"
              >
                Browse all capabilities
              </button>
              .
            </>
          ) : null}
          {' '}
          AnA can make mistakes. Verify critical regulatory decisions with qualified experts.
        </p>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// SCROLL TO BOTTOM BUTTON
// ═══════════════════════════════════════════════════════════════════════════════

interface ScrollButtonProps {
  visible: boolean;
  onClick: () => void;
}

const ScrollToBottomButton: React.FC<ScrollButtonProps> = ({ visible, onClick }) => (
  <button
    onClick={onClick}
    className={cn(
      'fixed bottom-24 left-1/2 -translate-x-1/2 px-4 py-2 bg-white border border-stone-200 rounded-full shadow-sm flex items-center gap-2 text-sm text-stone-600 hover:bg-stone-50 transition-all duration-150',
      visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'
    )}
  >
    <ChevronDown className="w-4 h-4" />
    <span>Scroll to bottom</span>
  </button>
);

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN ZEN CHAT COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export const ZenChat: React.FC<ZenChatProps> = ({
  projectId,
  projectName: _projectName,
  submissionType,
  threadId: initialThreadId,
  initialMessage,
  onNewArtifact,
  onThreadChange,
  greeting,
  lastWork,
  nextTask,
  userName,
  suggestedActions,
  onNavigate: onNavigateProp,
  onNewProject,
  onActionRun,
}) => {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

  // Document actions for persisting artifacts
  const {
    saveArtifact,
    isSaving,
    exportDocx,
    exportPdf,
    openInEditor,
    createDocument,
  } = useDocumentActions();

  // Track saving state per artifact
  const [savingArtifactId, setSavingArtifactId] = useState<string | null>(null);
  const [savedArtifactIds, setSavedArtifactIds] = useState<Set<string>>(new Set());

  const handleNavigate = (href: string) => {
    if (onNavigateProp) {
      onNavigateProp(href);
      return;
    }
    if (href.startsWith('http')) {
      window.open(href, '_blank', 'noopener,noreferrer');
      return;
    }
    setLocation(href);
  };
  const handleOpenPromptLibrary = useCallback(() => {
    // Route through the shared app catalog instead of legacy querystring panel targets.
    handleNavigate('apps');
  }, [handleNavigate]);
  const userInitials = (() => {
    if (!userName) return 'U';
    const parts = userName.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return userName.slice(0, 2).toUpperCase();
  })();
  // Cortex integration
  const {
    messages: cortexMessages,
    threadId,
    isLoading,
    isStreaming,
    error: chatError,
    streamMessage,
    cancelStream,
  } = useCortexChat({
    projectId,
    submissionType,
    threadId: initialThreadId,
    onArtifact: onNewArtifact,
  });

  // Health check
  const { data: health } = useCortexHealth({ refetchInterval: 60000 });
  const isConnected = health?.status === 'healthy';

  // Local state
  const [input, setInput] = useState('');
  const [recalledMessageId, setRecalledMessageId] = useState<string | null>(null);
  const lastSubmittedPromptRef = useRef<string | null>(null);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const draftStorageKey = useMemo(() => {
    const projectScope = projectId || 'global';
    const threadScope = threadId || initialThreadId || 'new';
    return `ana:draft:${projectScope}:${threadScope}`;
  }, [projectId, threadId, initialThreadId]);

  // Convert Cortex messages to local format
  const messages: Message[] = cortexMessages.map(m => ({
    id: m.id,
    role: m.role as 'user' | 'assistant',
    content: m.content,
    timestamp: m.timestamp,
    isStreaming: false,
    artifacts: m.metadata?.artifacts,
  }));

  // Add streaming/thinking indicator if active
  const displayMessages = useMemo(() => {
    if (isStreaming && messages.length > 0 && messages[messages.length - 1]?.role === 'assistant') {
      return messages.map((m, i) => (i === messages.length - 1 ? { ...m, isStreaming: true } : m));
    }
    // Show thinking bubble when loading but no assistant message yet
    if ((isLoading || isStreaming) && messages.length > 0 && messages[messages.length - 1]?.role === 'user') {
      return [
        ...messages,
        {
          id: 'thinking-placeholder',
          role: 'assistant' as const,
          content: '',
          timestamp: new Date(),
          isStreaming: true,
        },
      ];
    }
    return messages;
  }, [messages, isStreaming, isLoading]);

  // Refs
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Notify parent of thread changes
  useEffect(() => {
    if (threadId && onThreadChange) {
      onThreadChange(threadId);
    }
  }, [threadId, onThreadChange]);

  // Scroll to bottom
  const scrollToBottom = useCallback((smooth = true) => {
    messagesEndRef.current?.scrollIntoView({
      behavior: smooth ? 'smooth' : 'auto',
    });
  }, []);

  // Check scroll position
  const handleScroll = useCallback(() => {
    const container = messagesContainerRef.current;
    if (!container) return;

    const { scrollTop, scrollHeight, clientHeight } = container;
    const isNearBottom = scrollHeight - scrollTop - clientHeight < 100;
    setShowScrollButton(!isNearBottom && messages.length > 0);
  }, [messages.length]);

  // Auto-scroll on new messages
  useEffect(() => {
    scrollToBottom();
  }, [displayMessages, scrollToBottom]);

  // Load message draft per project/thread context.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const savedDraft = localStorage.getItem(draftStorageKey);
    if (savedDraft) {
      setInput(savedDraft);
    }
  }, [draftStorageKey]);

  // Persist message draft as user types.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!input.trim()) {
      localStorage.removeItem(draftStorageKey);
      return;
    }
    localStorage.setItem(draftStorageKey, input);
  }, [input, draftStorageKey]);

  // Send message - use real API
  const handleSend = async () => {
    if (!input.trim() || isLoading || isStreaming) return;

    const messageText = input.trim();
    lastSubmittedPromptRef.current = messageText;
    setRecalledMessageId(null);
    setInput('');
    if (typeof window !== 'undefined') {
      localStorage.removeItem(draftStorageKey);
    }

    try {
      // Use streaming for better UX
      streamMessage(messageText);
    } catch (err) {
      console.error('Failed to send message:', err);
      // Restore the input so user doesn't lose their message
      setInput(messageText);
    }
  };

  // Regenerate the last assistant response
  const handleRegenerate = useCallback((assistantMessageId?: string) => {
    if (isLoading || isStreaming) return;

    const assistantIndex = assistantMessageId
      ? displayMessages.findIndex(message => message.id === assistantMessageId)
      : displayMessages.length - 1;
    const startIndex = assistantIndex >= 0 ? assistantIndex : displayMessages.length - 1;

    for (let index = startIndex; index >= 0; index -= 1) {
      const candidate = displayMessages[index];
      if (candidate.role === 'user') {
        streamMessage(candidate.content);
        return;
      }
    }
  }, [displayMessages, isLoading, isStreaming, streamMessage]);

  // Recall a previous user prompt into the composer for quick edits.
  const handleRecallPrompt = useCallback((messageId: string) => {
    const target = displayMessages.find(message => message.id === messageId && message.role === 'user');
    if (!target) return;

    setRecalledMessageId(messageId);
    setInput(target.content);
    if (typeof window !== 'undefined') {
      localStorage.setItem(draftStorageKey, target.content);
    }
    scrollToBottom(false);
  }, [displayMessages, draftStorageKey, scrollToBottom]);

  const handleRecallLatestPrompt = useCallback(() => {
    if (lastSubmittedPromptRef.current) {
      setRecalledMessageId('last-submitted');
      setInput(lastSubmittedPromptRef.current);
      if (typeof window !== 'undefined') {
        localStorage.setItem(draftStorageKey, lastSubmittedPromptRef.current);
      }
      return;
    }
    const lastUserMessage = [...displayMessages].reverse().find(message => message.role === 'user');
    if (!lastUserMessage) return;
    setRecalledMessageId(lastUserMessage.id);
    setInput(lastUserMessage.content);
    if (typeof window !== 'undefined') {
      localStorage.setItem(draftStorageKey, lastUserMessage.content);
    }
  }, [displayMessages, draftStorageKey]);

  // Stop generating
  const handleStop = () => {
    cancelStream();
  };

  // Copy message
  const handleCopy = (content: string) => {
    navigator.clipboard.writeText(content);
  };

  // Handle suggestion click — auto-send immediately (Claude.ai behavior)
  const handleSuggestionClick = (text: string) => {
    if (!isLoading && !isStreaming) {
      streamMessage(text);
    } else {
      setInput(text);
    }
  };

  // Handle artifact actions
  const handleSaveArtifact = useCallback(async (artifact: CortexArtifact) => {
    if (!projectId) return;
    setSavingArtifactId(artifact.id);
    try {
      await saveArtifact({
        projectId,
        title: artifact.title,
        content: artifact.content,
        type: artifact.format || 'markdown',
        category: 'document',
        ctdSection: artifact.ctdSection || undefined,
        metadata: {
          submissionType: submissionType || 'general',
          generatedFrom: 'copilot',
          wordCount: artifact.content?.split(/\s+/).length || 0,
          documentFamily: artifact.documentFamily || undefined,
        },
      });
      setSavedArtifactIds(prev => new Set(prev).add(artifact.id));
    } catch (err) {
      console.error('Failed to save artifact:', err);
    } finally {
      setSavingArtifactId(null);
    }
  }, [projectId, saveArtifact, submissionType]);

  const handleExportDocxArtifact = useCallback(async (artifact: CortexArtifact) => {
    try {
      await exportDocx(artifact.title, artifact.content);
    } catch (err) {
      console.error('Failed to export DOCX:', err);
    }
  }, [exportDocx]);

  const handleExportPdfArtifact = useCallback(async (artifact: CortexArtifact) => {
    try {
      await exportPdf(artifact.title, artifact.content);
    } catch (err) {
      console.error('Failed to export PDF:', err);
    }
  }, [exportPdf]);

  const handleOpenEditorArtifact = useCallback(async (artifact: CortexArtifact) => {
    // Save artifact as a document first, then open in the TipTap editor
    try {
      const doc = await createDocument({
        title: artifact.title,
        content: artifact.content,
        documentType: submissionType || 'regulatory',
      });
      // Navigate to the editor with the newly created document ID
      const docId = doc?.id || doc?.documentId || artifact.id;
      openInEditor(String(docId));
    } catch (err) {
      // Fallback: open editor with artifact ID
      console.warn('Could not create document, opening with artifact ID:', err);
      openInEditor(artifact.id);
    }
  }, [createDocument, openInEditor, submissionType]);

  // Handle action card intent — call server action + invalidate workspace-summary cache
  const handleRunIntent = useCallback(
    async (intent: string, label = intent) => {
      const runId = `run_${crypto.randomUUID().slice(0, 12)}`;
      onActionRun?.({ id: runId, intent, label, status: 'running', ts: Date.now() });
      try {
        const orgId =
          typeof window !== 'undefined'
            ? localStorage.getItem('currentOrganizationId') || '1'
            : '1';
        const res = await apiRequest('POST', '/api/chat/actions/run', { intent, params: { orgId } });
        if (res.ok) {
          // Re-fetch workspace summary so counts/recent sections update immediately
          queryClient.invalidateQueries({ queryKey: ['workspace-summary'] });
          // Also refresh project-level artifacts in the Outputs panel
          queryClient.invalidateQueries({ queryKey: ['project-artifacts'] });
          onActionRun?.({ id: runId, intent, label, status: 'done', ts: Date.now() });
        } else {
          onActionRun?.({ id: runId, intent, label, status: 'failed', ts: Date.now() });
        }
      } catch (err) {
        console.error('Action card execution failed:', err);
        onActionRun?.({ id: runId, intent, label, status: 'failed', ts: Date.now() });
      }
    },
    [queryClient, onActionRun]
  );

  // Auto-send initial message (e.g., from IND Workspace → Draft with AI)
  const initialMessageSentRef = useRef(false);
  useEffect(() => {
    if (initialMessage && !initialMessageSentRef.current && !isLoading && !isStreaming) {
      initialMessageSentRef.current = true;
      streamMessage(initialMessage);
    }
  }, [initialMessage, isLoading, isStreaming, streamMessage]);

  // Show welcome screen if no messages
  const showWelcome = displayMessages.length === 0;

  return (
    <div className="flex flex-col flex-1 min-h-0 bg-white">
      {/* Connection status indicator - only show if confirmed unhealthy after load */}
      {health && !isConnected && (
        <div className="flex items-center justify-center gap-2 px-4 py-2 bg-amber-50 border-b border-amber-100 text-amber-700 text-sm">
          <WifiOff className="w-4 h-4" />
          <span>Connecting to AnA...</span>
        </div>
      )}

      {/* Error banner */}
      {chatError && (
        <div className="flex items-center justify-between gap-2 px-4 py-2 bg-red-50 border-b border-red-100 text-red-700 text-sm">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{chatError.message}</span>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            {(chatError as any).failedMessage && (
              <Button
                type="button"
                variant="ghost"
                onClick={() => streamMessage((chatError as any).failedMessage)}
                className="h-auto px-1 py-0 text-xs underline hover:text-red-900"
              >
                Retry
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Messages area */}
      <div
        ref={messagesContainerRef}
        onScroll={handleScroll}
        className="flex-1 min-h-0 overflow-y-auto zen-scroll bg-stone-50/30"
      >
        {showWelcome ? (
          <WelcomeScreen
            onSuggestionClick={handleSuggestionClick}
            onNavigate={handleNavigate}
            onNewProject={onNewProject}
            onRunIntent={handleRunIntent}
            greeting={greeting}
            lastWork={lastWork}
            nextTask={nextTask}
            suggestedActions={suggestedActions}
            submissionType={submissionType}
          />
        ) : (
          <div className="py-4">
            {displayMessages.map(message => (
              <MessageBubble
                key={message.id}
                message={
                  message.id === recalledMessageId && message.role === 'user'
                    ? { ...message, recalledToInput: true }
                    : message
                }
                userInitials={userInitials}
                onCopy={() => handleCopy(message.content)}
                onRecallPrompt={message.role === 'user' ? () => handleRecallPrompt(message.id) : undefined}
                onRegenerate={message.role === 'assistant' ? () => handleRegenerate(message.id) : undefined}
                onFeedback={(positive: boolean) => {
                  apiRequest('POST', '/api/concept2cure/feedback', { messageId: message.id, positive }).catch(() => {});
                }}
                onNavigate={handleNavigate}
                onSaveArtifact={handleSaveArtifact}
                onExportDocxArtifact={handleExportDocxArtifact}
                onExportPdfArtifact={handleExportPdfArtifact}
                onOpenEditorArtifact={handleOpenEditorArtifact}
                savingArtifactId={savingArtifactId}
                savedArtifactIds={savedArtifactIds}
              />
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Scroll to bottom button */}
      <ScrollToBottomButton visible={showScrollButton} onClick={() => scrollToBottom()} />

      {/* Input area */}
      <ChatInput
        value={input}
        onChange={setInput}
        onSend={handleSend}
        onStop={handleStop}
        onRecallLastPrompt={handleRecallLatestPrompt}
        isGenerating={isLoading || isStreaming}
        placeholder={
          isConnected
            ? 'Ask AnA anything... try /summary, /gap-check, /timeline, or /draft'
            : 'Connecting...'
        }
        slashCommands={SLASH_COMMANDS}
        onApplySlashCommand={command => setInput(command.prompt)}
        onOpenPromptLibrary={handleOpenPromptLibrary}
      />
    </div>
  );
};

export default ZenChat;
