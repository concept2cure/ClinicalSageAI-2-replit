/**
 * @fileoverview Council Thread Panel - Multi-Agent Chat Interface
 * @module concept2cure/components/canvas/CouncilThreadPanel
 * @version 1.0.0
 *
 * @description
 * The Council of Advisors chat interface.
 * Enables conversations with specialized regulatory AI personas.
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';
import {
  Send,
  Paperclip,
  Sparkles,
  Copy,
  ThumbsUp,
  ThumbsDown,
  RefreshCw,
  ChevronDown,
  FileText,
  Link,
  Quote,
} from 'lucide-react';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface SherpaPersaona {
  id: string;
  name: string;
  role: string;
  avatar: string;
  color: string;
  capabilities: string[];
}

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  personaId?: string;
  timestamp: string;
  citations?: Citation[];
  artifacts?: Artifact[];
  isStreaming?: boolean;
}

export interface Citation {
  id: string;
  type: 'guidance' | 'regulation' | 'study' | 'internal';
  title: string;
  reference: string;
  url?: string;
}

export interface Artifact {
  id: string;
  type: 'document' | 'table' | 'code' | 'chart';
  title: string;
  content: string;
}

export interface CouncilThreadPanelProps {
  persona: SherpaPersaona;
  projectId?: string;
  threadId?: string;
  onSendMessage?: (message: string, attachments?: File[]) => Promise<void>;
  onNewThread?: () => void;
  className?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// MESSAGE BUBBLE
// ═══════════════════════════════════════════════════════════════════════════════

interface MessageBubbleProps {
  message: Message;
  persona?: SherpaPersaona;
  onCopy?: (content: string) => void;
  onFeedback?: (messageId: string, type: 'up' | 'down') => void;
  onRegenerate?: (messageId: string) => void;
}

const MessageBubble: React.FC<MessageBubbleProps> = ({
  message,
  persona,
  onCopy,
  onFeedback,
  onRegenerate,
}) => {
  const isUser = message.role === 'user';

  return (
    <div className={cn("flex gap-3", isUser ? "justify-end" : "justify-start")}>
      {/* Avatar */}
      {!isUser && persona && (
        <div className={cn(
          "w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 text-lg",
          `${persona.color}`
        )}>
          {persona.avatar}
        </div>
      )}

      {/* Content */}
      <div className={cn(
        "max-w-[80%] rounded-xl px-4 py-3",
        isUser
          ? "bg-stone-900 text-white"
          : "bg-white border border-stone-200"
      )}>
        {/* Persona name */}
        {!isUser && persona && (
          <div className="text-xs font-medium text-stone-500 mb-1">
            {persona.name}
          </div>
        )}

        {/* Message content */}
        <div className={cn(
          "text-sm leading-relaxed whitespace-pre-wrap",
          isUser ? "text-white" : "text-stone-700"
        )}>
          {message.content}
          {message.isStreaming && (
            <span className="inline-block w-2 h-4 bg-current animate-pulse ml-1" />
          )}
        </div>

        {/* Citations */}
        {message.citations && message.citations.length > 0 && (
          <div className="mt-3 pt-3 border-t border-stone-200 space-y-2">
            <div className="text-xs font-medium text-stone-500 flex items-center gap-1">
              <Quote className="w-3 h-3" />
              Sources
            </div>
            {message.citations.map((citation) => (
              <a
                key={citation.id}
                href={citation.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-xs text-blue-600 hover:text-stone-700 hover:underline"
              >
                <FileText className="w-3 h-3" />
                <span>{citation.title}</span>
              </a>
            ))}
          </div>
        )}

        {/* Actions (for assistant messages) */}
        {!isUser && !message.isStreaming && (
          <div className="flex items-center gap-1 mt-3 pt-2 border-t border-stone-200">
            <button
              onClick={() => onCopy?.(message.content)}
              className="p-1.5 rounded-lg text-stone-400 hover:text-stone-600 hover:bg-stone-50 transition-colors duration-150"
              title="Copy"
            >
              <Copy className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => onFeedback?.(message.id, 'up')}
              className="p-1.5 rounded-lg text-stone-400 hover:text-emerald-600 hover:bg-emerald-50 transition-colors duration-150"
              title="Good response"
            >
              <ThumbsUp className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => onFeedback?.(message.id, 'down')}
              className="p-1.5 rounded-lg text-stone-400 hover:text-red-600 hover:bg-red-50 transition-colors duration-150"
              title="Poor response"
            >
              <ThumbsDown className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => onRegenerate?.(message.id)}
              className="p-1.5 rounded-lg text-stone-400 hover:text-stone-600 hover:bg-stone-50 transition-colors duration-150"
              title="Regenerate"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* User avatar */}
      {isUser && (
        <div className="w-10 h-10 rounded-lg bg-stone-200 flex items-center justify-center flex-shrink-0">
          <span className="text-sm font-medium text-stone-600">You</span>
        </div>
      )}
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// SUGGESTED PROMPTS
// ═══════════════════════════════════════════════════════════════════════════════

interface SuggestedPromptsProps {
  persona: SherpaPersaona;
  onSelect: (prompt: string) => void;
}

const SuggestedPrompts: React.FC<SuggestedPromptsProps> = ({ persona, onSelect }) => {
  // Generate persona-specific prompts
  const prompts = React.useMemo(() => {
    const promptsByRole: Record<string, string[]> = {
      'expedition-leader': [
        'What regulatory changes should I be aware of this week?',
        'Analyze the competitive landscape for my device category',
        'What are the key risks in my current submission timeline?',
        'Help me develop a regulatory strategy for international expansion',
      ],
      'camp-manager': [
        'Review my Module 3 CMC section for completeness',
        'Generate a clinical overview for my submission',
        'Check cross-references in my current document',
        'What sections are missing from my eCTD package?',
      ],
      'equipment-manager': [
        'Check my specifications against ICH Q6A requirements',
        'Generate a justification for my impurity specification',
        'What stability data do I need for a 24-month shelf life?',
        'Review my analytical method validation parameters',
      ],
      'weather-reader': [
        'Show me recent MAUDE events for my product code',
        'What are competitors doing in this therapeutic area?',
        'Alert me to any FDA guidance updates this month',
        'Analyze safety signals for similar devices',
      ],
      'trail-medic': [
        'Prepare me for an FDA inspection',
        'What CAPA should I open for this deviation?',
        'Review my complaint handling procedure',
        'Generate an inspection readiness checklist',
      ],
    };

    return promptsByRole[persona.id] || [
      'How can you help me today?',
      'What should I prioritize?',
      'Explain your capabilities',
    ];
  }, [persona.id]);

  return (
    <div className="flex flex-wrap gap-2">
      {prompts.map((prompt, index) => (
        <button
          key={index}
          onClick={() => onSelect(prompt)}
          className="px-3 py-2 text-sm bg-stone-50 hover:bg-stone-100 text-stone-700 rounded-xl border border-stone-200 hover:border-stone-300 transition-colors duration-150"
        >
          {prompt}
        </button>
      ))}
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// CHAT INPUT
// ═══════════════════════════════════════════════════════════════════════════════

interface ChatInputProps {
  onSend: (message: string, attachments?: File[]) => void;
  disabled?: boolean;
  placeholder?: string;
}

const ChatInput: React.FC<ChatInputProps> = ({
  onSend,
  disabled,
  placeholder = "Ask a question...",
}) => {
  const [input, setInput] = useState('');
  const [attachments, setAttachments] = useState<File[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  }, [input]);

  const handleSend = useCallback(() => {
    if (!input.trim() && attachments.length === 0) return;
    onSend(input.trim(), attachments.length > 0 ? attachments : undefined);
    setInput('');
    setAttachments([]);
  }, [input, attachments, onSend]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    setAttachments(prev => [...prev, ...files]);
  }, []);

  return (
    <div className="bg-white border border-stone-200 rounded-xl p-3 shadow-sm">
      {/* Attachments preview */}
      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-3 pb-3 border-b border-stone-200">
          {attachments.map((file, index) => (
            <div
              key={index}
              className="flex items-center gap-2 px-3 py-1.5 bg-stone-50 rounded-lg text-sm"
            >
              <FileText className="w-4 h-4 text-stone-400" />
              <span className="text-stone-700 truncate max-w-[150px]">{file.name}</span>
              <button
                onClick={() => setAttachments(prev => prev.filter((_, i) => i !== index))}
                className="text-stone-400 hover:text-stone-600"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Input area */}
      <div className="flex items-end gap-3">
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          className="flex-1 resize-none outline-none text-sm text-stone-700 placeholder:text-stone-400 bg-transparent min-h-[24px] max-h-[200px]"
          rows={1}
        />

        {/* Actions */}
        <div className="flex items-center gap-1">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={handleFileSelect}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="p-2 rounded-lg text-stone-400 hover:text-stone-600 hover:bg-stone-50 transition-colors duration-150"
            title="Attach file"
          >
            <Paperclip className="w-5 h-5" />
          </button>
          <button
            onClick={handleSend}
            disabled={disabled || (!input.trim() && attachments.length === 0)}
            className={cn(
              "p-2 rounded-lg transition-colors duration-150",
              input.trim() || attachments.length > 0
                ? "bg-stone-900 text-white hover:bg-stone-800"
                : "bg-stone-100 text-stone-400 cursor-not-allowed"
            )}
          >
            <Send className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export const CouncilThreadPanel: React.FC<CouncilThreadPanelProps> = ({
  persona,
  projectId,
  threadId,
  onSendMessage,
  onNewThread,
  className,
}) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = useCallback(async (content: string, attachments?: File[]) => {
    // Add user message
    const userMessage: Message = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content,
      timestamp: new Date().toISOString(),
    };
    setMessages(prev => [...prev, userMessage]);

    // Add streaming assistant message
    const assistantMessage: Message = {
      id: `msg-${Date.now() + 1}`,
      role: 'assistant',
      content: '',
      personaId: persona.id,
      timestamp: new Date().toISOString(),
      isStreaming: true,
    };
    setMessages(prev => [...prev, assistantMessage]);

    setIsLoading(true);

    try {
      // Call the API (simulated for now)
      await onSendMessage?.(content, attachments);
      
      // Simulate streaming response
      const responseText = `Based on my analysis as your ${persona.name}, I can help you with that. Let me review the relevant regulatory guidance and provide a comprehensive response.`;
      
      for (let i = 0; i <= responseText.length; i++) {
        await new Promise(resolve => setTimeout(resolve, 20));
        setMessages(prev => prev.map(msg => 
          msg.id === assistantMessage.id
            ? { ...msg, content: responseText.slice(0, i) }
            : msg
        ));
      }

      // Mark as complete
      setMessages(prev => prev.map(msg =>
        msg.id === assistantMessage.id
          ? { ...msg, isStreaming: false }
          : msg
      ));
    } catch (error) {
      console.error('Failed to send message:', error);
    } finally {
      setIsLoading(false);
    }
  }, [persona, onSendMessage]);

  const handleCopy = useCallback((content: string) => {
    navigator.clipboard.writeText(content);
  }, []);

  const handleSelectPrompt = useCallback((prompt: string) => {
    handleSend(prompt);
  }, [handleSend]);

  return (
    <div className={cn("flex flex-col h-full", className)}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-stone-200">
        <div className="flex items-center gap-3">
          <div className={cn(
            "w-12 h-12 rounded-lg flex items-center justify-center text-base font-medium",
            `${persona.color}`
          )}>
            {persona.avatar}
          </div>
          <div>
            <h3 className="font-semibold text-stone-900">{persona.name}</h3>
            <p className="text-sm text-stone-500">{persona.role}</p>
          </div>
        </div>
        <button
          onClick={onNewThread}
          className="text-sm text-blue-600 hover:text-stone-700 font-medium"
        >
          New Thread
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center">
            <div className={cn(
              "w-20 h-20 rounded-xl flex items-center justify-center text-lg font-semibold mb-4",
              `${persona.color}`
            )}>
              {persona.avatar}
            </div>
            <h3 className="text-lg font-semibold text-stone-900 mb-2">
              Talk to {persona.name}
            </h3>
            <p className="text-sm text-stone-500 mb-6 max-w-md">
              {persona.capabilities.join(', ')}
            </p>
            <SuggestedPrompts
              persona={persona}
              onSelect={handleSelectPrompt}
            />
          </div>
        ) : (
          <>
            {messages.map(message => (
              <MessageBubble
                key={message.id}
                message={message}
                persona={message.role === 'assistant' ? persona : undefined}
                onCopy={handleCopy}
              />
            ))}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Input */}
      <div className="p-4 border-t border-stone-200">
        <ChatInput
          onSend={handleSend}
          disabled={isLoading}
          placeholder={`Ask ${persona.name}...`}
        />
      </div>
    </div>
  );
};

export default CouncilThreadPanel;
