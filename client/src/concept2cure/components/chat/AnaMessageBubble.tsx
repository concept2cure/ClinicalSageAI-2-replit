/**
 * AnaMessageBubble — single message renderer used by AnaPersistentPanel.
 *
 * Pass 2 of the staged AnaPersistentPanel split. Encapsulates the
 * per-message JSX that previously lived inline inside the
 * `messages.map(msg => ...)` block in the panel — the largest single
 * concentration of JSX in that file (~615 lines).
 *
 * The component renders both user and assistant messages. Assistant
 * messages get the full surface: bottom-line preview, expandable
 * details, follow-up chips, verdict / confidence badges, executed
 * guidance actions, tool-call cards, generated images, PPTX download,
 * action row (copy / feedback / save-to-vault / insert-into-editor),
 * and the document-action row on the most recent assistant turn.
 *
 * State stays in the parent — every mutation is invoked through the
 * callback props so the parent remains the single source of truth for
 * `messages`, `expandedAssistantMessages`, `showActions`, `copiedId`,
 * and the input/composer state.
 *
 * @module client/src/concept2cure/components/chat/AnaMessageBubble
 */

import React from 'react';
import { cn } from '@/lib/utils';
import { apiRequest } from '@/lib/queryClient';
import {
  Copy,
  Check,
  RotateCcw,
  ThumbsUp,
  ThumbsDown,
  Download,
  FileEdit,
  Sparkles,
  Zap,
} from 'lucide-react';

import { renderSafeMarkdown } from './renderSafeMarkdown';
import { AnaToolCallCard } from './AnaToolCallCard';
import { DOCUMENT_ACTION_CONFIGS } from './anaPanelConstants';
import {
  buildAssistantPreview,
  buildFollowUpChips,
  detectVerdictSignals,
} from './anaPanelUtils';
import type { AnaMessage, AnaRIOrchestration, IntentLens } from './anaPanelTypes';
import type { AuthoringContextPack } from '../../../../../shared/types/authoring-context';

const renderMarkdown = renderSafeMarkdown;

export interface AnaMessageBubbleProps {
  /** The message to render. */
  msg: AnaMessage;
  /** Full message list — needed to detect the most-recent assistant turn. */
  messages: AnaMessage[];

  /** UI state. */
  isExpanded: boolean;
  isHovered: boolean;
  copiedId: string | null;
  isThinking: boolean;
  intentLens: IntentLens;
  lastOrchestration: AnaRIOrchestration | null;

  /** Setters and callbacks (all owned by the parent). */
  setMessages: React.Dispatch<React.SetStateAction<AnaMessage[]>>;
  setExpandedAssistantMessages: React.Dispatch<
    React.SetStateAction<Record<string, boolean>>
  >;
  onHoverChange: (hoveredId: string | null) => void;
  onCopy: (id: string, content: string) => void;
  onRecallPrompt: (id: string, content: string) => void;
  onComposerSet: (text: string) => void;
  onComposerFocus: () => void;

  /** Document-action plumbing. */
  contextProfile?: {
    projectId?: string;
    activeProject?: string;
    userRole?: string;
  };
  authoringContext?: AuthoringContextPack | null;
  onDraftInsert?: (content: string, title: string, ctdSection?: string) => void;
  handleSend: (prompt: string) => void;
  queueStartTurn: () => void;
  queueCompleteTurn: () => void;
}

/**
 * Render a single message in the AnA chat. Returns the full bubble:
 * avatar + content + action row + (on the latest assistant turn)
 * the document-actions panel.
 */
export const AnaMessageBubble: React.FC<AnaMessageBubbleProps> = ({
  msg,
  messages,
  isExpanded,
  isHovered,
  copiedId,
  isThinking,
  intentLens,
  lastOrchestration,
  setMessages,
  setExpandedAssistantMessages,
  onHoverChange,
  onCopy,
  onRecallPrompt,
  onComposerSet,
  onComposerFocus,
  contextProfile,
  authoringContext,
  onDraftInsert,
  handleSend,
  queueStartTurn,
  queueCompleteTurn,
}) => {
  const isUser = msg.role === 'user';
  const assistantPreview = !isUser ? buildAssistantPreview(msg.content) : null;
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
      onMouseEnter={() => !isUser && onHoverChange(msg.id)}
      onMouseLeave={() => onHoverChange(null)}
    >
      <div
        className={cn(
          'flex gap-2.5 max-w-3xl mx-auto',
          isUser && 'justify-end pl-10 sm:pl-16',
        )}
      >
        <div
          className={cn(
            'w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5',
            isUser ? 'hidden' : 'bg-[#141413]',
          )}
        >
          {!isUser && <Sparkles className="w-3 h-3 text-white" />}
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
                      : msg.content,
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
                        onComposerSet(chip.prompt);
                        requestAnimationFrame(() => onComposerFocus());
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
                          s.bgColor,
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
              {(msg as any).executedActions && (msg as any).executedActions.length > 0 && (
                <div className="mt-2 space-y-1.5">
                  {(msg as any).executedActions.map((action: any, i: any) => (
                    <div
                      key={i}
                      className={cn(
                        'flex items-center gap-2 px-3 py-2 rounded-lg border text-xs',
                        action.executed && !action.error
                          ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                          : action.error
                            ? 'bg-red-50 border-red-200 text-red-800'
                            : 'bg-zinc-50 border-zinc-200 text-zinc-600',
                      )}
                    >
                      {action.executed && !action.error ? (
                        <Check className="w-3.5 h-3.5 flex-shrink-0" />
                      ) : action.error ? (
                        <span className="w-3.5 h-3.5 flex-shrink-0 text-red-500">!</span>
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
              {/* AnA tool-call cards — what AnA actually ran to produce this response */}
              {msg.toolCalls && msg.toolCalls.length > 0 && (
                <div className="mt-2">
                  {msg.toolCalls.map((tc, i) => (
                    <AnaToolCallCard key={i} call={tc} />
                  ))}
                </div>
              )}
              {/* Nano Banana PPTX download button */}
              {msg.pptx && (
                <button
                  onClick={() => {
                    const blob = new Blob(
                      [Uint8Array.from(atob(msg.pptx!.base64), c => c.charCodeAt(0))],
                      { type: msg.pptx!.mimeType },
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
                isHovered ? 'opacity-100' : 'opacity-0',
              )}
            >
              <button
                onClick={() => onRecallPrompt(msg.id, msg.content)}
                className="p-1 text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 rounded transition-colors"
                title="Recall this prompt to edit"
                aria-label="Recall this prompt to edit"
              >
                <RotateCcw className="w-3 h-3" />
              </button>
              <button
                onClick={() => onCopy(msg.id, msg.content)}
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
                isHovered ? 'opacity-100' : 'opacity-0',
              )}
            >
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
                          : 'text-zinc-500 bg-zinc-50',
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
                      : 'text-zinc-500 bg-zinc-50',
                  )}
                  title="External evidence usage"
                >
                  {msg.evidenceUsage.firecrawlUsed
                    ? `Firecrawl used • -${msg.evidenceUsage.quotaConsumed ?? 0}`
                    : 'Firecrawl requested'}
                </span>
              )}
              <button
                onClick={() => onCopy(msg.id, msg.content)}
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
              {contextProfile?.projectId && msg.content.length > 100 && !msg.savedAsArtifact && (
                <button
                  onClick={async () => {
                    const numProjId = String(contextProfile.projectId).replace(/^proj_/, '');
                    try {
                      const saveRes = await apiRequest(
                        'POST',
                        `/api/concept2cure/projects/${numProjId}/artifacts`,
                        {
                          title: `AnA Response — ${new Date().toISOString().split('T')[0]}`,
                          content: msg.content,
                          type: 'document_section',
                          category: 'document',
                        },
                      );
                      if (saveRes.ok) {
                        setMessages(prev =>
                          prev.map(m =>
                            m.id === msg.id ? { ...m, savedAsArtifact: true } : m,
                          ),
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
                          .replace(/^\*\*[A-Z][^*]+\*\*\s*[-—]\s*/gm, '')
                          .replace(/^#{1,3}\s+(?:Draft|Note|Summary|Action)\b[^\n]*/gm, '')
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
                          m.id === msg.id ? ({ ...m, insertedToEditor: true } as AnaMessage) : m,
                        ),
                      );
                    }}
                    className="p-1 text-zinc-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                    title="Insert into Editor"
                  >
                    <FileEdit className="w-3 h-3" />
                  </button>
                )}
              {(msg as any).insertedToEditor && (
                <span className="text-[11px] text-blue-600 font-medium ml-1">Inserted</span>
              )}
              {msg.savedAsArtifact && (
                <span className="text-[11px] text-emerald-600 font-medium ml-1">Saved</span>
              )}
            </div>
          )}
          {/* AnA RI Document Action Row — shown on the last assistant message */}
          {!isUser &&
            (() => {
              const assistantMessages = messages.filter(m => m.role === 'assistant');
              return msg.id === assistantMessages[assistantMessages.length - 1]?.id;
            })() &&
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
                      ['revised_artifact', 'attach_to_dossier'].includes(a.type),
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
                          queueStartTurn();
                          try {
                            const res = await apiRequest('POST', '/api/ana-ri/generate', {
                              action_type: action.type,
                              conversation_context: messages.slice(-20).map(m => ({
                                role: m.role,
                                content: m.content,
                              })),
                              project_id: contextProfile.projectId,
                              user_role: contextProfile?.userRole || undefined,
                              intent_lens: intentLens !== 'auto' ? intentLens : undefined,
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
                              queueCompleteTurn();
                            } else {
                              // Fallback: send as chat prompt (handleSend manages queue)
                              handleSend(
                                `Please generate a ${action.label.toLowerCase()} based on our conversation above.`,
                              );
                            }
                          } catch {
                            handleSend(
                              `Please generate a ${action.label.toLowerCase()} based on our conversation above.`,
                            );
                          }
                        }}
                        className={cn(
                          'inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-colors',
                          isThinking
                            ? 'border-[#E8E6DC] text-[#D8D5CA] cursor-not-allowed'
                            : 'border-[#E8E6DC] text-[#6B6962] hover:bg-[#FAF9F5] hover:border-[#D8D5CA] hover:text-[#4D4B45]',
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
                          Blockers: {lastOrchestration.activeWorkstream.blockers.join(' | ')}
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
                        Open loops: {lastOrchestration.workstreamHandoff.openLoops.join(' | ')}
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
};

export default AnaMessageBubble;
