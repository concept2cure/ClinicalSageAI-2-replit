/**
 * Concept2Cure - Chat Panel
 *
 * Claude.ai-style chat interface with AnA 1.0 RI.
 * Left panel in the split-screen layout.
 * Now connected to real AnA 1.0 RI API.
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useProject } from '../../context/ProjectContext';
import { useChat } from '../../hooks/useChat';
import type { Message } from '../../types';
import { cn } from '@/lib/utils';
import { apiRequest } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Send,
  Paperclip,
  Sparkles,
  Copy,
  RotateCcw,
  ThumbsUp,
  ThumbsDown,
  Edit2,
  MoreHorizontal,
  Loader2,
  FileText,
  Image,
  Mic,
  MicOff,
  ChevronDown,
  GitBranch,
  Check,
  X,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

// ─────────────────────────────────────────────────────────────────────────────
// MESSAGE COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

interface MessageItemProps {
  message: Message;
  isLast: boolean;
  onCopy: (content: string) => void;
  onRegenerate?: () => void;
  onEdit: (messageId: string, content: string) => void;
  onFork: (messageId: string) => void;
}

const MessageItem: React.FC<MessageItemProps> = ({
  message,
  isLast,
  onCopy,
  onRegenerate,
  onEdit,
  onFork,
}) => {
  const isUser = message.role === 'user';
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(message.content);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleStartEdit = () => {
    setEditContent(message.content);
    setIsEditing(true);
  };

  const handleSaveEdit = () => {
    if (editContent.trim() !== message.content) {
      onEdit(message.id, editContent.trim());
    }
    setIsEditing(false);
  };

  const handleCancelEdit = () => {
    setEditContent(message.content);
    setIsEditing(false);
  };

  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.setSelectionRange(
        textareaRef.current.value.length,
        textareaRef.current.value.length
      );
    }
  }, [isEditing]);

  const formatTime = (date: Date) => {
    return new Date(date).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className={cn('group py-4', isUser ? 'bg-white' : 'bg-zinc-50')}>
      <div className="max-w-3xl mx-auto px-4">
        <div className="flex gap-4">
          {/* Avatar */}
          <div
            className={cn(
              'flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center',
              isUser ? 'bg-blue-600 text-white' : 'bg-purple-600 text-white'
            )}
          >
            {isUser ? (
              <span className="text-sm font-medium">U</span>
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            {/* Header */}
            <div className="flex items-center gap-2 mb-1">
              <span className="text-sm font-medium text-zinc-900">
                {isUser ? 'You' : 'AnA'}
              </span>
              <span className="text-xs text-zinc-400">{formatTime(message.timestamp)}</span>
              {message.edited && <span className="text-xs text-zinc-400 italic">(edited)</span>}
            </div>

            {/* Message body */}
            {isEditing ? (
              <div className="space-y-2">
                <textarea
                  ref={textareaRef}
                  value={editContent}
                  onChange={e => setEditContent(e.target.value)}
                  className="w-full p-3 text-sm border border-blue-300 rounded-lg focus-visible:ring-2 focus-visible:ring-blue-500 outline-none resize-none"
                  rows={4}
                />
                <div className="flex items-center gap-2">
                  <Button size="sm" onClick={handleSaveEdit}>
                    <Check className="h-3 w-3 mr-1" />
                    Save & Fork
                  </Button>
                  <Button size="sm" variant="outline" onClick={handleCancelEdit}>
                    <X className="h-3 w-3 mr-1" />
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <div className="prose prose-sm max-w-none text-zinc-700">
                <p className="whitespace-pre-wrap">{message.content}</p>
              </div>
            )}

            {/* Attachments */}
            {message.attachments && message.attachments.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {message.attachments.map(attachment => (
                  <div
                    key={attachment.id}
                    className="flex items-center gap-2 px-2 py-1 bg-zinc-100 rounded text-xs text-zinc-600"
                  >
                    <FileText className="h-3 w-3" />
                    {attachment.name}
                  </div>
                ))}
              </div>
            )}

            {/* Artifact indicator */}
            {message.artifactId && (
              <div className="mt-2 flex items-center gap-2 text-xs text-blue-600">
                <FileText className="h-3 w-3" />
                <span>Created artifact →</span>
              </div>
            )}

            {/* Actions */}
            {!isEditing && (
              <div className="mt-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        onClick={() => onCopy(message.content)}
                        className="p-1.5 text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 rounded"
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>Copy</TooltipContent>
                  </Tooltip>

                  {isUser && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          onClick={handleStartEdit}
                          className="p-1.5 text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 rounded"
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent>Edit message</TooltipContent>
                    </Tooltip>
                  )}

                  {isUser && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          onClick={() => onFork(message.id)}
                          className="p-1.5 text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 rounded"
                        >
                          <GitBranch className="h-3.5 w-3.5" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent>Fork from here</TooltipContent>
                    </Tooltip>
                  )}

                  {!isUser && (
                    <>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button className="p-1.5 text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 rounded" onClick={() => {
                            apiRequest('POST', '/api/concept2cure/feedback', { messageId: message.id, positive: true, conversationId: activeConversation?.id }).catch(() => {});
                          }}>
                            <ThumbsUp className="h-3.5 w-3.5" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent>Good response</TooltipContent>
                      </Tooltip>

                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button className="p-1.5 text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 rounded" onClick={() => {
                            apiRequest('POST', '/api/concept2cure/feedback', { messageId: message.id, positive: false, conversationId: activeConversation?.id }).catch(() => {});
                          }}>
                            <ThumbsDown className="h-3.5 w-3.5" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent>Bad response</TooltipContent>
                      </Tooltip>

                      {isLast && onRegenerate && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              onClick={onRegenerate}
                              className="p-1.5 text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 rounded"
                            >
                              <RotateCcw className="h-3.5 w-3.5" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent>Regenerate</TooltipContent>
                        </Tooltip>
                      )}
                    </>
                  )}
                </TooltipProvider>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// CHAT INPUT COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

interface ChatInputProps {
  onSend: (message: string, attachments?: File[]) => void;
  disabled?: boolean;
  placeholder?: string;
}

const ChatInput: React.FC<ChatInputProps> = ({
  onSend,
  disabled = false,
  placeholder = 'Ask AnA to draft documents, analyze risks, or answer regulatory questions...',
}) => {
  const [input, setInput] = useState('');
  const [attachments, setAttachments] = useState<File[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSend = () => {
    if (!input.trim() && attachments.length === 0) return;
    onSend(input.trim(), attachments.length > 0 ? attachments : undefined);
    setInput('');
    setAttachments([]);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    setAttachments(prev => [...prev, ...files]);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const removeAttachment = (index: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== index));
  };

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  }, [input]);

  return (
    <div className="border-t border-zinc-200 bg-white p-4">
      <div className="max-w-3xl mx-auto">
        {/* Attachments preview */}
        {attachments.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-2">
            {attachments.map((file, index) => (
              <div
                key={index}
                className="flex items-center gap-2 px-2 py-1 bg-zinc-100 rounded text-sm"
              >
                <FileText className="h-4 w-4 text-zinc-500" />
                <span className="truncate max-w-[150px]">{file.name}</span>
                <button
                  onClick={() => removeAttachment(index)}
                  className="p-1.5 hover:bg-zinc-200 rounded focus-visible:ring-2 focus-visible:ring-blue-500 outline-none"
                  aria-label="Remove attachment"
                  title="Remove"
                >
                  <X className="h-3.5 w-3.5 text-zinc-500" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Input area */}
        <div className="flex items-end gap-3 bg-zinc-50 rounded-xl border border-zinc-200 p-2 focus-within:border-blue-300 focus-within:ring-2 focus-within:ring-blue-100">
          {/* Attachment button */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="p-2 text-zinc-400 hover:text-zinc-600 hover:bg-zinc-200 rounded-lg transition-colors duration-150"
                  disabled={disabled}
                >
                  <Paperclip className="h-5 w-5" />
                </button>
              </TooltipTrigger>
              <TooltipContent>Attach files</TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <input
            ref={fileInputRef}
            type="file"
            multiple
            onChange={handleFileSelect}
            className="hidden"
            accept=".pdf,.doc,.docx,.txt,.csv,.xlsx"
          />

          {/* Text input */}
          <textarea
            ref={textareaRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={disabled}
            rows={1}
            className="flex-1 bg-transparent text-sm text-zinc-900 placeholder:text-zinc-400 outline-none resize-none max-h-[200px]"
          />

          {/* Send button */}
          <Button
            onClick={handleSend}
            disabled={disabled || (!input.trim() && attachments.length === 0)}
            size="icon"
            className="h-9 w-9 rounded-lg"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>

        {/* Hints */}
        <div className="mt-2 flex items-center justify-center gap-4 text-xs text-zinc-400">
          <span>Press Enter to send, Shift+Enter for new line</span>
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// EMPTY STATE COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

const EmptyState: React.FC = () => {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center px-4">
      <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center mb-6">
        <Sparkles className="h-8 w-8 text-purple-600" />
      </div>
      <h2 className="text-xl font-semibold text-zinc-900 mb-2">
        Hello! I'm AnA
      </h2>
      <p className="text-zinc-500 max-w-md mb-8">
        Your RI regulatory intelligence assistant. I can help you draft documents, analyze risks,
        navigate FDA requirements, and more.
      </p>
      <div className="grid grid-cols-2 gap-3 max-w-lg">
        {[
          'Draft a 510(k) cover letter',
          'Analyze my predicate device',
          'Check IFU consistency',
          'Generate risk heatmap',
        ].map(suggestion => (
          <button
            key={suggestion}
            className="px-4 py-3 text-sm text-left bg-zinc-50 hover:bg-zinc-100 rounded-xl border border-zinc-200 text-zinc-700 transition-colors duration-150"
          >
            {suggestion}
          </button>
        ))}
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// MAIN CHAT PANEL
// ─────────────────────────────────────────────────────────────────────────────

export const ChatPanel: React.FC = () => {
  const {
    activeProject,
    activeConversation,
    addMessage,
    editMessage,
    forkConversation,
    createArtifact,
  } = useProject();

  const { sendMessageAsync, isLoading: isApiLoading } = useChat();
  const [isTyping, setIsTyping] = useState(false);
  const [threadId, setThreadId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const messages = activeConversation?.messages || [];

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages.length]);

  const handleSendMessage = async (content: string, attachments?: File[]) => {
    if (!activeConversation || !activeProject) return;

    // Add user message
    const userMessage = addMessage(activeConversation.id, {
      role: 'user',
      content,
      attachments: attachments?.map((f, i) => ({
        id: `att-${Date.now()}-${i}`,
        name: f.name,
        type: f.type,
        size: f.size,
      })),
    });

    setIsTyping(true);

    try {
      // Call the actual AnA 1.0 RI API
      const response = await sendMessageAsync({
        message: content,
        threadId: threadId || undefined,
        projectId: activeProject.id,
        submissionType: activeProject.submissionType,
        conversationHistory: messages,
      });

      // Store thread ID for conversation continuity
      if (response.thread_id) {
        setThreadId(response.thread_id);
      }

      // Add assistant response
      const assistantMessage = addMessage(activeConversation.id, {
        role: 'assistant',
        content: response.answer,
      });

      // If response includes artifacts, persist them server-side then update local state
      if (response.artifacts && response.artifacts.length > 0) {
        // Resolve numeric project ID (strip "proj_" prefix if present)
        const numericProjectId = String(activeProject.id).replace(/^proj_/, '');

        for (const artifact of response.artifacts) {
          if (!artifact.content || artifact.content.trim().length === 0) continue;
          try {
            const createRes = await apiRequest('POST', `/api/concept2cure/projects/${numericProjectId}/artifacts`, {
              title: artifact.title,
              content: artifact.content,
              type: artifact.type === 'interactive' ? 'risk_heatmap' : 'document_section',
              category: artifact.type === 'interactive' ? 'interactive' : 'document',
              conversationId: activeConversation.id,
            });
            if (createRes.ok) {
              const payload = await createRes.json();
              const persisted = payload.data ?? payload;
              // Mirror into local state so UI reflects immediately
              createArtifact({
                projectId: activeProject.id,
                conversationId: activeConversation.id,
                type: artifact.type === 'interactive' ? 'risk_heatmap' : 'document_section',
                category: artifact.type === 'interactive' ? 'interactive' : 'document',
                title: persisted.title || artifact.title,
                content: persisted.content || artifact.content,
              });
            } else {
              console.warn('[ChatPanel] Server artifact creation failed:', createRes.status);
            }
          } catch (err) {
            console.warn('[ChatPanel] Artifact persistence error:', err);
          }
        }
      }
    } catch (error: any) {
      // Add error message as assistant response
      addMessage(activeConversation.id, {
        role: 'assistant',
        content: `I apologize, but I encountered an error: ${error.message || 'Unable to process your request'}. Please try again.`,
      });
    } finally {
      setIsTyping(false);
    }
  };

  const handleCopyMessage = (content: string) => {
    navigator.clipboard.writeText(content);
  };

  const handleEditMessage = (messageId: string, content: string) => {
    if (activeConversation) {
      editMessage(activeConversation.id, messageId, content);
    }
  };

  const handleForkConversation = async (messageId: string) => {
    if (activeConversation) {
      await forkConversation(activeConversation.id, messageId);
    }
  };

  // No project selected
  if (!activeProject) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center px-4">
        <div className="w-12 h-12 bg-zinc-100 rounded-lg flex items-center justify-center mb-6">
          <Sparkles className="h-8 w-8 text-zinc-400" />
        </div>
        <h2 className="text-xl font-semibold text-zinc-900 mb-2">Select a Project</h2>
        <p className="text-zinc-500 max-w-md">
          Choose a project from the sidebar or create a new one to start
          working with AnA.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex-shrink-0 border-b border-zinc-200 px-4 py-3">
        <div className="flex items-center justify-between max-w-3xl mx-auto">
          <div>
            <h1 className="text-sm font-medium text-zinc-900">{activeProject.name}</h1>
            <p className="text-xs text-zinc-500">
              {activeConversation?.title || 'New conversation'}
            </p>
          </div>
          {activeConversation?.parentConversationId && (
            <div className="flex items-center gap-1 px-2 py-1 bg-amber-50 text-amber-700 rounded text-xs">
              <GitBranch className="h-3 w-3" />
              Forked conversation
            </div>
          )}
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        {messages.length === 0 ? (
          <EmptyState />
        ) : (
          <>
            {messages.map((message, index) => (
              <MessageItem
                key={message.id}
                message={message}
                isLast={index === messages.length - 1}
                onCopy={handleCopyMessage}
                onRegenerate={message.role === 'assistant' ? () => {} : undefined}
                onEdit={handleEditMessage}
                onFork={handleForkConversation}
              />
            ))}

            {/* Typing indicator */}
            {isTyping && (
              <div className="py-4 bg-zinc-50">
                <div className="max-w-3xl mx-auto px-4">
                  <div className="flex gap-4">
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-purple-600 flex items-center justify-center">
                      <Sparkles className="h-4 w-4 text-white" />
                    </div>
                    <div className="flex items-center gap-1">
                      <div className="w-2 h-2 bg-zinc-400 rounded-full animate-bounce" />
                      <div
                        className="w-2 h-2 bg-zinc-400 rounded-full animate-bounce"
                        style={{ animationDelay: '0.1s' }}
                      />
                      <div
                        className="w-2 h-2 bg-zinc-400 rounded-full animate-bounce"
                        style={{ animationDelay: '0.2s' }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Input */}
      <ChatInput onSend={handleSendMessage} disabled={isTyping} />
    </div>
  );
};

export default ChatPanel;
