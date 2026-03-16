/**
 * @fileoverview Zen Chat Hub
 * @module concept2cure/components/chat/ZenChat
 * @version 3.0.0
 *
 * @description
 * Claude.ai / ChatGPT style conversational interface.
 * Clean, focused, breathing room for thinking.
 *
 * Now connected to Lumen Cortex backend for real AI responses.
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
import { marked } from 'marked';
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

// Configure marked for safe, clean HTML output
marked.setOptions({ breaks: true, gfm: true });

/** Render markdown string to safe HTML — synchronous */
const renderMarkdown = (content: string): string => {
  try {
    return marked.parse(content) as string;
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
// TYPING INDICATOR
// ═══════════════════════════════════════════════════════════════════════════════

const TypingIndicator: React.FC = () => (
  <div className="flex items-center gap-1.5 py-1">
    <div className="w-2 h-2 rounded-full bg-violet-500 animate-pulse" />
    <div className="w-2 h-2 rounded-full bg-violet-500 animate-pulse delay-100" />
    <div className="w-2 h-2 rounded-full bg-violet-500 animate-pulse delay-200" />
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
    <div className="mt-2 p-3 bg-zinc-50 border border-zinc-200 rounded-xl">
      <div className="flex items-center gap-2 mb-2">
        <FileText className="w-4 h-4 text-violet-500" />
        <span className="text-sm font-medium text-zinc-800 truncate flex-1">
          {artifact.title}
        </span>
        <span className="text-xs text-zinc-400">{wordCount.toLocaleString()} words</span>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={() => onSave(artifact)}
          disabled={isSaving || isSaved}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
            isSaved
              ? 'bg-green-50 text-green-700 border border-green-200'
              : 'bg-violet-50 text-violet-700 border border-violet-200 hover:bg-violet-100'
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
            className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            Export
            <ChevronDown className="w-3 h-3" />
          </button>
          {showExportMenu && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowExportMenu(false)} />
              <div className="absolute left-0 bottom-full mb-1 w-52 bg-white border border-zinc-200 rounded-lg shadow-lg z-50 py-1">
                <button
                  onClick={() => { onExportDocx(artifact); setShowExportMenu(false); }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-50"
                >
                  <FileText className="w-4 h-4 text-blue-500" />
                  <div className="text-left">
                    <div className="font-medium text-xs">Word Document (.docx)</div>
                    <div className="text-[10px] text-zinc-400">MS Word, Google Docs compatible</div>
                  </div>
                </button>
                <button
                  onClick={() => { onExportPdf(artifact); setShowExportMenu(false); }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-50"
                >
                  <FileText className="w-4 h-4 text-red-500" />
                  <div className="text-left">
                    <div className="font-medium text-xs">PDF Document (.pdf)</div>
                    <div className="text-[10px] text-zinc-400">Read-only, print-ready</div>
                  </div>
                </button>
              </div>
            </>
          )}
        </div>

        <button
          onClick={() => onOpenEditor(artifact)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-medium text-indigo-700 hover:bg-indigo-100 transition-colors"
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
  onRegenerate?: () => void;
  onFeedback?: (positive: boolean) => void;
  onNavigate?: (href: string) => void;
  onSaveArtifact?: (artifact: CortexArtifact) => void;
  onExportDocxArtifact?: (artifact: CortexArtifact) => void;
  onExportPdfArtifact?: (artifact: CortexArtifact) => void;
  onOpenEditorArtifact?: (artifact: CortexArtifact) => void;
  savingArtifactId?: string | null;
  savedArtifactIds?: Set<string>;
}

const MessageBubble: React.FC<MessageBubbleProps> = ({
  message,
  onCopy,
  onRegenerate,
  onFeedback,
  onNavigate,
  onSaveArtifact,
  onExportDocxArtifact,
  onExportPdfArtifact,
  onOpenEditorArtifact,
  savingArtifactId,
  savedArtifactIds,
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
        !isUser && 'bg-white border-b border-zinc-100/80',
        isUser && 'bg-zinc-50/60'
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
              isUser ? 'bg-zinc-800 text-white' : 'bg-gradient-to-br from-violet-500 to-violet-700'
            )}
          >
            {isUser ? (
              <span className="text-xs font-bold text-white">{userInitials}</span>
            ) : (
              <Sparkles className="w-4 h-4 text-white" />
            )}
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            {/* Role label */}
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-sm font-semibold text-zinc-900">{isUser ? 'You' : 'RI'}</span>
              {message.isStreaming && message.content && (
                <span className="inline-flex gap-0.5 items-center">
                  <span
                    className="w-1 h-1 rounded-full bg-violet-400 animate-bounce"
                    style={{ animationDelay: '0ms' }}
                  />
                  <span
                    className="w-1 h-1 rounded-full bg-violet-400 animate-bounce"
                    style={{ animationDelay: '150ms' }}
                  />
                  <span
                    className="w-1 h-1 rounded-full bg-violet-400 animate-bounce"
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
              <p className="text-zinc-800 leading-relaxed whitespace-pre-wrap text-sm">
                {message.content}
              </p>
            ) : (
              // Assistant messages: rendered markdown
              <div
                className="prose prose-sm prose-zinc max-w-none
                  prose-headings:font-semibold prose-headings:text-zinc-900 prose-headings:leading-snug
                  prose-h1:text-xl prose-h2:text-lg prose-h3:text-base
                  prose-p:text-zinc-700 prose-p:leading-relaxed prose-p:my-2
                  prose-strong:text-zinc-900 prose-strong:font-semibold
                  prose-code:text-violet-700 prose-code:bg-violet-50 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-xs prose-code:font-mono prose-code:before:content-none prose-code:after:content-none
                  prose-pre:bg-zinc-900 prose-pre:text-zinc-100 prose-pre:rounded-xl prose-pre:p-4 prose-pre:text-xs
                  prose-blockquote:border-l-violet-400 prose-blockquote:text-zinc-600 prose-blockquote:not-italic
                  prose-ul:text-zinc-700 prose-ol:text-zinc-700
                  prose-li:my-0.5
                  prose-table:text-sm prose-th:bg-zinc-50 prose-th:font-semibold prose-td:border-zinc-200
                  prose-a:text-blue-600 prose-a:no-underline hover:prose-a:underline
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
                    className="inline-flex items-center gap-2 px-3 py-1.5 bg-zinc-100 rounded-lg text-sm text-zinc-600"
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

            {/* Actions - appear on hover */}
            {!message.isStreaming && actionLinks.length > 0 && !isUser && (
              <div className="mt-3 flex flex-wrap gap-2">
                {actionLinks.map(link => (
                  <button
                    key={link.href}
                    onClick={() => onNavigate?.(link.href)}
                    className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs font-medium text-zinc-600 hover:border-zinc-300 hover:bg-zinc-50 transition-colors"
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
                  'flex items-center gap-0.5 mt-2 transition-opacity duration-150',
                  showActions ? 'opacity-100' : 'opacity-0 pointer-events-none'
                )}
              >
                <button
                  onClick={handleCopy}
                  className="p-1.5 text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 rounded-md transition-colors"
                  title="Copy"
                >
                  {copied ? (
                    <Check className="w-3.5 h-3.5 text-green-600" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                </button>
                {!isUser && (
                  <>
                    <button
                      onClick={() => onFeedback?.(true)}
                      className="p-1.5 text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 rounded-md transition-colors"
                      title="Good response"
                    >
                      <ThumbsUp className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => onFeedback?.(false)}
                      className="p-1.5 text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 rounded-md transition-colors"
                      title="Bad response"
                    >
                      <ThumbsDown className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={onRegenerate}
                      className="p-1.5 text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 rounded-md transition-colors"
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
}

const DEVICE_PROMPTS = [
  {
    label: '510(k) Submission',
    prompt:
      'I need to prepare a 510(k) submission. Help me identify a predicate device, structure the substantial equivalence argument, and list the required sections.',
    sub: 'Predicate selection · SE argument · document checklist',
  },
  {
    label: 'PMA Strategy',
    prompt:
      'Walk me through the PMA pathway for a Class III device. What clinical evidence do I need, and what are the key milestones?',
    sub: 'Clinical evidence · IDE requirements · panel review',
  },
  {
    label: 'Design Controls (21 CFR 820)',
    prompt:
      'Help me set up a design controls framework for my medical device under 21 CFR 820.30. Generate the design history file outline.',
    sub: 'DHF · design inputs/outputs · V&V plan',
  },
  {
    label: 'De Novo Request',
    prompt:
      'My device has no predicate. Walk me through the De Novo classification request process and help me draft the request package.',
    sub: 'Novel device pathway · classification criteria',
  },
];

const BIOTECH_PROMPTS = [
  {
    label: 'IND Application',
    prompt:
      'Help me prepare an IND application for a Phase 1 oncology trial. Generate the CTD-formatted outline and identify the critical chemistry, manufacturing and controls sections.',
    sub: 'CTD format · CMC · preclinical summary · protocol',
  },
  {
    label: 'Clinical Trial Protocol',
    prompt:
      'Draft a Phase 1 dose-escalation protocol for a small molecule oncology drug. Include eligibility criteria, endpoints, and safety monitoring plan.',
    sub: 'Dose escalation · endpoints · DSMB plan',
  },
  {
    label: 'NDA / BLA Readiness',
    prompt:
      'We are approaching NDA submission. What are the FDA priority review criteria, and how do I structure the integrated summary of efficacy and safety?',
    sub: 'Module 5 · ISE · ISS · labeling strategy',
  },
  {
    label: 'FDA Meeting Request',
    prompt:
      'Help me draft a Type B pre-IND meeting request with FDA. What questions should I include and how should I structure the briefing document?',
    sub: 'Pre-IND · Type B · briefing document format',
  },
];

const WelcomeScreen: React.FC<WelcomeScreenProps> = ({
  onSuggestionClick,
  onNavigate,
  onNewProject,
  onRunIntent,
  greeting,
  lastWork,
  nextTask,
  suggestedActions,
}) => {
  const suggestions = [
    // If we have AI-recommended next task, show it first
    ...(nextTask
      ? [
          {
            title: nextTask.taskTitle,
            description: nextTask.taskDescription || 'AI-recommended next step',
            highlight: true,
          },
        ]
      : []),
    // If we have last work context, offer to continue
    ...(lastWork
      ? [
          {
            title: `Continue: ${lastWork.contextTitle}`,
            description: `Pick up where you left off with ${lastWork.contextType.replace(/_/g, ' ')}`,
            highlight: false,
          },
        ]
      : []),
    {
      title: 'Draft a complete IND Cover Letter',
      description: 'Generate a formal FDA cover letter with all required elements — I\'ll create a governed document you can edit inline and export',
      highlight: false,
    },
    {
      title: 'Generate a 510(k) Substantial Equivalence comparison',
      description: 'Build a detailed predicate comparison table with device description, indications, and technological characteristics',
      highlight: false,
    },
    {
      title: 'Write a Clinical Overview (Module 2.5)',
      description: 'Draft a comprehensive CTD clinical overview with benefit-risk assessment — save to vault when ready',
      highlight: false,
    },
    {
      title: 'Create a Clinical Evaluation Report (EU MDR)',
      description: 'Generate a CER with clinical data appraisal, literature review, and equivalence analysis per MEDDEV 2.7/1',
      highlight: false,
    },
    {
      title: 'Draft a Regulatory Briefing Document',
      description: 'Prepare a pre-meeting briefing package for FDA Type B meeting with questions and supporting data summary',
      highlight: false,
    },
    {
      title: 'Plan my submission timeline and tasks',
      description: 'Generate a milestone-based project plan with tasks, dependencies, and critical path for my submission type',
      highlight: false,
    },
  ].slice(0, 6); // Show max 6 suggestions

  return (
    <div className="flex flex-col items-center w-full px-4 py-10">
      <div className="w-full max-w-2xl">
        {/* Hero */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 mb-4 rounded-xl bg-gradient-to-br from-violet-500 to-blue-600 shadow-lg shadow-violet-500/20">
            <Sparkles className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-2xl font-semibold text-zinc-900 mb-2">
            {greeting?.text || 'Good morning — ready to work?'}
          </h1>
          <p className="text-sm text-zinc-500 max-w-lg mx-auto leading-relaxed">
            Concept2Cure is your RI co-author for FDA regulatory submissions, clinical trial design,
            and compliance strategy. Tell me what you're working on and I'll generate documents,
            identify gaps, and guide every step.
          </p>
        </div>

        {/* What it does — 3 power pillars */}
        <div className="grid grid-cols-3 gap-3 mb-8">
          {[
            {
              icon: '📄',
              title: 'Draft Documents',
              body: 'Generate submission-ready regulatory documents — INDs, 510(k)s, protocols, CMC sections, labeling.',
            },
            {
              icon: '🔍',
              title: 'Analyze & Advise',
              body: 'Get instant answers on FDA regulations, pathway selection, predicate strategy, and clinical evidence gaps.',
            },
            {
              icon: '✅',
              title: 'Check Compliance',
              body: 'Validate your submissions against 21 CFR, ICH guidelines, and current FDA guidance documents.',
            },
          ].map(p => (
            <div key={p.title} className="rounded-xl border border-zinc-200 bg-white p-4">
              <div className="text-xl mb-2">{p.icon}</div>
              <div className="text-sm font-semibold text-zinc-800 mb-1">{p.title}</div>
              <div className="text-xs text-zinc-500 leading-relaxed">{p.body}</div>
            </div>
          ))}
        </div>

        {/* Continuing work */}
        {(nextTask || lastWork) && (
          <div className="mb-6 rounded-xl border border-blue-200 bg-blue-50/50 p-4">
            <div className="text-xs font-semibold text-blue-700 uppercase tracking-wide mb-2">
              Pick up where you left off
            </div>
            {nextTask && (
              <button
                onClick={() => onSuggestionClick(nextTask.taskTitle)}
                className="block w-full text-left text-sm font-medium text-blue-900 hover:text-blue-700 transition-colors"
              >
                → {nextTask.taskTitle}
              </button>
            )}
            {lastWork && (
              <button
                onClick={() => onSuggestionClick(`Continue: ${lastWork.contextTitle}`)}
                className="block w-full text-left text-xs text-blue-600 mt-1 hover:text-blue-800 transition-colors"
              >
                Continue: {lastWork.contextTitle}
              </button>
            )}
          </div>
        )}

        {/* Workspace-driven suggested actions (real data from /api/workspace/summary) */}
        {suggestedActions && suggestedActions.length > 0 && (
          <div className="mb-6">
            <div className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">
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

        {/* Role tabs */}
        <div className="mb-4">
          <div className="flex items-center gap-1 mb-4">
            <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mr-2">
              I work in:
            </span>
            {(['device', 'biotech'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={cn(
                  'px-4 py-1.5 rounded-full text-sm font-medium transition-all',
                  activeTab === tab
                    ? 'bg-zinc-900 text-white'
                    : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
                )}
              >
                {tab === 'device' ? '🩺 Medical Device & Diagnostics' : '🧬 Biotech & Clinical'}
              </button>
            ))}
          </div>

          <div className="flex flex-col gap-2">
            {prompts.map((p, i) => (
              <button
                key={i}
                onClick={() => onSuggestionClick(p.prompt)}
                className="group flex items-start gap-4 p-4 rounded-xl border border-zinc-200 bg-white hover:border-blue-300 hover:bg-blue-50/30 text-left transition-all duration-150"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-zinc-900 group-hover:text-blue-800 mb-0.5">
                    {p.label}
                  </div>
                  <div className="text-xs text-zinc-400">{p.sub}</div>
                </div>
                <ArrowUp className="w-4 h-4 text-zinc-300 group-hover:text-blue-400 flex-shrink-0 mt-0.5 rotate-45" />
              </button>
            ))}
          </div>
        </div>

        <p className="text-center text-xs text-zinc-400">
          Or type any question about FDA regulations, your submission, or your clinical program
          below ↓
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
  isGenerating?: boolean;
  placeholder?: string;
}

const ChatInput: React.FC<ChatInputProps> = ({
  value,
  onChange,
  onSend,
  onStop,
  isGenerating = false,
  placeholder = 'Message RI...',
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [isFocused, setIsFocused] = useState(false);

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
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (value.trim() && !isGenerating) {
        onSend();
      }
    }
  };

  const canSend = value.trim().length > 0 && !isGenerating;

  return (
    <div className="border-t border-zinc-100 bg-white px-4 py-4">
      <div className="max-w-3xl mx-auto">
        <div
          className={cn(
            'flex items-end gap-2 px-4 py-3 bg-white border rounded-2xl transition-all duration-200',
            isFocused
              ? 'border-blue-300 ring-4 ring-blue-50 shadow-sm'
              : 'border-zinc-200 hover:border-zinc-300'
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
            className="flex-1 resize-none bg-transparent border-none outline-none text-zinc-900 placeholder:text-zinc-400 text-base leading-6 min-h-[24px] max-h-[200px]"
          />

          {/* Send/Stop button */}
          {isGenerating ? (
            <button
              onClick={onStop}
              className="flex-shrink-0 p-2 bg-zinc-900 text-white rounded-full hover:bg-zinc-800 transition-colors"
              title="Stop generating"
            >
              <StopCircle className="w-5 h-5" />
            </button>
          ) : (
            <button
              onClick={onSend}
              disabled={!canSend}
              className={cn(
                'flex-shrink-0 p-2 rounded-full transition-all duration-200',
                canSend
                  ? 'bg-zinc-900 text-white hover:bg-zinc-800 hover:scale-105'
                  : 'bg-zinc-100 text-zinc-400 cursor-not-allowed'
              )}
              title="Send message"
            >
              <ArrowUp className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Disclaimer */}
        <p className="text-center text-xs text-zinc-400 mt-2">
          RI can make mistakes. Verify critical regulatory decisions with qualified experts.
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
      'fixed bottom-24 left-1/2 -translate-x-1/2 px-4 py-2 bg-white border border-zinc-200 rounded-full shadow-lg flex items-center gap-2 text-sm text-zinc-600 hover:bg-zinc-50 transition-all duration-200',
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
  const [showScrollButton, setShowScrollButton] = useState(false);

  // Convert Cortex messages to local format
  const messages: Message[] = cortexMessages.map(m => ({
    id: m.id,
    role: m.role as 'user' | 'assistant',
    content: m.content,
    timestamp: m.timestamp,
    isStreaming: false,
    artifacts: m.metadata?.artifacts,
  }));

  // Add streaming indicator if active
  const displayMessages =
    isStreaming && messages.length > 0 && messages[messages.length - 1]?.role === 'assistant'
      ? messages.map((m, i) => (i === messages.length - 1 ? { ...m, isStreaming: true } : m))
      : messages;

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

  // Send message - use real API
  const handleSend = async () => {
    if (!input.trim() || isLoading || isStreaming) return;

    const messageText = input.trim();
    setInput('');

    try {
      // Use streaming for better UX
      streamMessage(messageText);
    } catch (err) {
      console.error('Failed to send message:', err);
    }
  };

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
        metadata: {
          submissionType: submissionType || 'general',
          generatedFrom: 'copilot',
          wordCount: artifact.content?.split(/\s+/).length || 0,
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

  // Handle suggestion click
  const handleSuggestionClick = (text: string) => {
    setInput(text);
  };

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
          <span>RI running in offline mode — responses continue normally</span>
        </div>
      )}

      {/* Error banner */}
      {chatError && (
        <div className="flex items-center justify-center gap-2 px-4 py-2 bg-red-50 border-b border-red-100 text-red-700 text-sm">
          <AlertCircle className="w-4 h-4" />
          <span>{chatError.message}</span>
        </div>
      )}

      {/* Messages area */}
      <div
        ref={messagesContainerRef}
        onScroll={handleScroll}
        className="flex-1 min-h-0 overflow-y-auto zen-scroll bg-zinc-50/30"
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
          />
        ) : (
          <div className="py-4">
            {displayMessages.map(message => (
              <MessageBubble
                key={message.id}
                message={message}
                userInitials={userInitials}
                onCopy={() => handleCopy(message.content)}
                onRegenerate={message.role === 'assistant' ? () => {} : undefined}
                onFeedback={positive =>
                  console.log('Feedback:', positive ? 'positive' : 'negative')
                }
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
        isGenerating={isLoading || isStreaming}
        placeholder="Message RI..."
      />
    </div>
  );
};

export default ZenChat;
