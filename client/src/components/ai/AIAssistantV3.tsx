/**
 * TrialSage AI Assistant - Enterprise Intelligence Interface
 *
 * A beautiful, Claude.AI-inspired conversational interface for
 * regulatory intelligence. Designed for thoughtful interaction
 * and seamless document analysis.
 *
 * @version 3.0.0
 * @author TrialSage Engineering
 */

import React, { useState, useRef, useEffect, useCallback, useMemo, memo } from 'react';
import { motion, AnimatePresence, LayoutGroup } from 'framer-motion';
import { cn } from '@/lib/utils';
import {
  Send,
  Paperclip,
  Sparkles,
  FileText,
  X,
  Plus,
  ChevronDown,
  Settings,
  Maximize2,
  Minimize2,
  MoreHorizontal,
  MessageSquare,
  Lightbulb,
  BookOpen,
  AlertCircle,
  CheckCircle2,
  Clock,
  Loader2,
  ArrowUp,
  Mic,
  StopCircle,
} from 'lucide-react';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  citations?: Citation[];
  attachments?: Attachment[];
  status?: 'sending' | 'sent' | 'error';
}

interface Citation {
  id: string;
  title: string;
  source: string;
  excerpt?: string;
  url?: string;
  confidence?: number;
}

interface Attachment {
  id: string;
  name: string;
  type: string;
  size: number;
  url?: string;
}

interface SuggestedPrompt {
  id: string;
  text: string;
  icon?: React.ReactNode;
  category?: string;
}

interface AIAssistantV3Props {
  /** Initial messages to display */
  initialMessages?: Message[];
  /** Callback when user sends a message */
  onSendMessage?: (message: string, attachments?: File[]) => Promise<void>;
  /** Whether the assistant is processing */
  isProcessing?: boolean;
  /** Current streaming response */
  streamingContent?: string;
  /** Suggested prompts to show when empty */
  suggestedPrompts?: SuggestedPrompt[];
  /** Assistant name/persona */
  assistantName?: string;
  /** Assistant avatar */
  assistantAvatar?: React.ReactNode;
  /** Full screen mode */
  fullScreen?: boolean;
  /** Toggle full screen */
  onToggleFullScreen?: () => void;
  /** Additional class names */
  className?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

const DEFAULT_PROMPTS: SuggestedPrompt[] = [
  {
    id: '1',
    text: 'Analyze my IND submission for completeness',
    icon: <FileText className="w-4 h-4" />,
    category: 'Submission Review',
  },
  {
    id: '2',
    text: 'What are the latest FDA guidance updates for my indication?',
    icon: <BookOpen className="w-4 h-4" />,
    category: 'Regulatory Intelligence',
  },
  {
    id: '3',
    text: 'Help me draft a clinical protocol synopsis',
    icon: <Lightbulb className="w-4 h-4" />,
    category: 'Document Drafting',
  },
  {
    id: '4',
    text: 'Compare my CMC section against regulatory requirements',
    icon: <CheckCircle2 className="w-4 h-4" />,
    category: 'Compliance Check',
  },
];

// ═══════════════════════════════════════════════════════════════════════════════
// TYPING INDICATOR
// ═══════════════════════════════════════════════════════════════════════════════

const TypingIndicator: React.FC = memo(() => (
  <div className="flex items-center gap-3 p-4">
    <div className="flex items-center justify-center w-8 h-8 rounded-full bg-gradient-to-br from-primary-500 to-accent-500">
      <Sparkles className="w-4 h-4 text-white" />
    </div>
    <div className="flex items-center gap-1">
      {[0, 1, 2].map(i => (
        <motion.span
          key={i}
          className="w-2 h-2 rounded-full bg-neutral-400"
          animate={{
            y: [0, -6, 0],
            opacity: [0.4, 1, 0.4],
          }}
          transition={{
            duration: 0.8,
            repeat: Infinity,
            delay: i * 0.15,
            ease: 'easeInOut',
          }}
        />
      ))}
    </div>
    <span className="text-sm text-neutral-500">Thinking...</span>
  </div>
));

TypingIndicator.displayName = 'TypingIndicator';

// ═══════════════════════════════════════════════════════════════════════════════
// MESSAGE BUBBLE
// ═══════════════════════════════════════════════════════════════════════════════

interface MessageBubbleProps {
  message: Message;
  isLatest?: boolean;
}

const MessageBubble: React.FC<MessageBubbleProps> = memo(({ message, isLatest }) => {
  const [showCitations, setShowCitations] = useState(false);
  const isUser = message.role === 'user';
  const isAssistant = message.role === 'assistant';

  const formatTime = (date: Date) => {
    return new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      minute: 'numeric',
      hour12: true,
    }).format(date);
  };

  return (
    <motion.div
      className={cn('flex gap-3 px-4', isUser ? 'flex-row-reverse' : 'flex-row')}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
    >
      {/* Avatar */}
      {isAssistant && (
        <div className="flex-shrink-0 mt-1">
          <div className="flex items-center justify-center w-8 h-8 rounded-full bg-gradient-to-br from-primary-500 to-accent-500">
            <Sparkles className="w-4 h-4 text-white" />
          </div>
        </div>
      )}

      {/* Content */}
      <div className={cn('flex flex-col max-w-[75%]', isUser && 'items-end')}>
        {/* Bubble */}
        <div
          className={cn(
            'rounded-2xl px-4 py-3',
            isUser
              ? 'bg-primary-600 text-white rounded-br-md'
              : 'bg-neutral-100 text-neutral-900 rounded-bl-md'
          )}
        >
          {/* Main content */}
          <div
            className={cn('prose prose-sm max-w-none leading-relaxed', isUser && 'prose-invert')}
          >
            <p className="m-0 whitespace-pre-wrap">{message.content}</p>
          </div>

          {/* Attachments */}
          {message.attachments && message.attachments.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-white/20">
              {message.attachments.map(attachment => (
                <div
                  key={attachment.id}
                  className={cn(
                    'flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm',
                    isUser ? 'bg-white/10' : 'bg-neutral-200'
                  )}
                >
                  <FileText className="w-4 h-4" />
                  <span className="truncate max-w-[150px]">{attachment.name}</span>
                </div>
              ))}
            </div>
          )}

          {/* Citations toggle */}
          {isAssistant && message.citations && message.citations.length > 0 && (
            <button
              onClick={() => setShowCitations(!showCitations)}
              className="flex items-center gap-1.5 mt-3 pt-2 border-t border-neutral-200 text-xs text-neutral-500 hover:text-neutral-700 transition-colors"
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span>
                {message.citations.length} source{message.citations.length !== 1 ? 's' : ''}
              </span>
              <ChevronDown
                className={cn('w-3.5 h-3.5 transition-transform', showCitations && 'rotate-180')}
              />
            </button>
          )}
        </div>

        {/* Citations panel */}
        <AnimatePresence>
          {showCitations && message.citations && (
            <motion.div
              className="w-full mt-2 space-y-2"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
            >
              {message.citations.map((citation, index) => (
                <a
                  key={citation.id}
                  href={citation.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-start gap-3 p-3 rounded-lg bg-neutral-50 hover:bg-neutral-100 border border-neutral-200 transition-colors group"
                >
                  <span className="flex items-center justify-center w-5 h-5 rounded text-xs font-medium bg-primary-100 text-primary-700 flex-shrink-0">
                    {index + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-neutral-900 group-hover:text-primary-600 transition-colors">
                      {citation.title}
                    </p>
                    {citation.excerpt && (
                      <p className="text-xs text-neutral-500 mt-1 line-clamp-2">
                        {citation.excerpt}
                      </p>
                    )}
                    <p className="text-xs text-neutral-400 mt-1">{citation.source}</p>
                  </div>
                </a>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Timestamp */}
        <span
          className={cn('text-xs text-neutral-400 mt-1 px-1', isUser ? 'text-right' : 'text-left')}
        >
          {formatTime(message.timestamp)}
          {message.status === 'sending' && (
            <span className="ml-2 inline-flex items-center gap-1">
              <Clock className="w-3 h-3" />
              Sending...
            </span>
          )}
        </span>
      </div>
    </motion.div>
  );
});

MessageBubble.displayName = 'MessageBubble';

// ═══════════════════════════════════════════════════════════════════════════════
// SUGGESTED PROMPT CARD
// ═══════════════════════════════════════════════════════════════════════════════

interface SuggestedPromptCardProps {
  prompt: SuggestedPrompt;
  onClick: () => void;
  index: number;
}

const SuggestedPromptCard: React.FC<SuggestedPromptCardProps> = memo(
  ({ prompt, onClick, index }) => (
    <motion.button
      onClick={onClick}
      className={cn(
        'flex items-start gap-3 p-4 rounded-xl text-left',
        'bg-white border border-neutral-200',
        'hover:border-primary-300 hover:bg-primary-50/50',
        'transition-all duration-200',
        'group'
      )}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.1 }}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
    >
      <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-primary-50 text-primary-600 group-hover:bg-primary-100 transition-colors">
        {prompt.icon || <MessageSquare className="w-5 h-5" />}
      </div>
      <div className="flex-1 min-w-0">
        {prompt.category && (
          <span className="text-xs font-medium text-primary-600 uppercase tracking-wide">
            {prompt.category}
          </span>
        )}
        <p className="text-sm text-neutral-700 mt-0.5 leading-snug">{prompt.text}</p>
      </div>
      <ArrowUp className="w-4 h-4 text-neutral-400 group-hover:text-primary-500 transition-colors flex-shrink-0 mt-1 rotate-45" />
    </motion.button>
  )
);

SuggestedPromptCard.displayName = 'SuggestedPromptCard';

// ═══════════════════════════════════════════════════════════════════════════════
// WELCOME SCREEN
// ═══════════════════════════════════════════════════════════════════════════════

interface WelcomeScreenProps {
  assistantName: string;
  prompts: SuggestedPrompt[];
  onSelectPrompt: (prompt: string) => void;
}

const WelcomeScreen: React.FC<WelcomeScreenProps> = memo(
  ({ assistantName, prompts, onSelectPrompt }) => (
    <div className="flex flex-col items-center justify-center flex-1 px-6 py-12">
      {/* Logo */}
      <motion.div
        className="flex items-center justify-center w-20 h-20 rounded-3xl bg-gradient-to-br from-primary-500 to-accent-500 mb-6"
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      >
        <Sparkles className="w-10 h-10 text-white" />
      </motion.div>

      {/* Title */}
      <motion.h1
        className="text-2xl font-bold text-neutral-900 text-center mb-2"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        Hi, I'm {assistantName}
      </motion.h1>

      <motion.p
        className="text-neutral-500 text-center max-w-md mb-8"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        Your regulatory intelligence assistant. I can help with submission reviews, compliance
        checks, document drafting, and regulatory analysis.
      </motion.p>

      {/* Suggested prompts */}
      <motion.div
        className="w-full max-w-2xl grid grid-cols-1 sm:grid-cols-2 gap-3"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3 }}
      >
        {prompts.map((prompt, index) => (
          <SuggestedPromptCard
            key={prompt.id}
            prompt={prompt}
            onClick={() => onSelectPrompt(prompt.text)}
            index={index}
          />
        ))}
      </motion.div>
    </div>
  )
);

WelcomeScreen.displayName = 'WelcomeScreen';

// ═══════════════════════════════════════════════════════════════════════════════
// INPUT AREA
// ═══════════════════════════════════════════════════════════════════════════════

interface InputAreaProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  onAttachFile: () => void;
  attachments: File[];
  onRemoveAttachment: (index: number) => void;
  isProcessing: boolean;
  placeholder?: string;
}

const InputArea: React.FC<InputAreaProps> = memo(
  ({
    value,
    onChange,
    onSend,
    onAttachFile,
    attachments,
    onRemoveAttachment,
    isProcessing,
    placeholder = 'Message Concept2Cure AI...',
  }) => {
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [isFocused, setIsFocused] = useState(false);

    // Auto-resize textarea
    useEffect(() => {
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
        textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
      }
    }, [value]);

    const handleKeyDown = (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (value.trim() && !isProcessing) {
          onSend();
        }
      }
    };

    const handleFileSelect = () => {
      fileInputRef.current?.click();
    };

    const canSend = value.trim().length > 0 && !isProcessing;

    return (
      <div className="border-t border-neutral-100 bg-white p-4">
        {/* Attachments preview */}
        <AnimatePresence>
          {attachments.length > 0 && (
            <motion.div
              className="flex flex-wrap gap-2 mb-3"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
            >
              {attachments.map((file, index) => (
                <motion.div
                  key={index}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-neutral-100 text-sm"
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                >
                  <FileText className="w-4 h-4 text-neutral-500" />
                  <span className="truncate max-w-[150px]">{file.name}</span>
                  <button
                    onClick={() => onRemoveAttachment(index)}
                    className="p-0.5 rounded hover:bg-neutral-200 transition-colors"
                  >
                    <X className="w-3.5 h-3.5 text-neutral-500" />
                  </button>
                </motion.div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Input container */}
        <div
          className={cn(
            'flex items-end gap-2 rounded-2xl border bg-neutral-50 p-2',
            'transition-all duration-200',
            isFocused
              ? 'border-primary-300 bg-white ring-2 ring-primary-500/20'
              : 'border-neutral-200'
          )}
        >
          {/* File attachment button */}
          <button
            onClick={handleFileSelect}
            disabled={isProcessing}
            className={cn(
              'flex items-center justify-center w-9 h-9 rounded-xl',
              'text-neutral-400 hover:text-neutral-600 hover:bg-neutral-200',
              'transition-colors duration-150',
              'disabled:opacity-50'
            )}
            title="Attach file"
          >
            <Paperclip className="w-5 h-5" />
          </button>

          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={e => {
              if (e.target.files) {
                // Handle files (would need to integrate with parent)
              }
            }}
          />

          {/* Textarea */}
          <textarea
            ref={textareaRef}
            value={value}
            onChange={e => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            placeholder={placeholder}
            disabled={isProcessing}
            rows={1}
            className={cn(
              'flex-1 resize-none bg-transparent py-2 px-1',
              'text-neutral-900 placeholder:text-neutral-400',
              'focus:outline-none',
              'disabled:opacity-50',
              'max-h-[200px]'
            )}
          />

          {/* Send button */}
          <motion.button
            onClick={onSend}
            disabled={!canSend}
            className={cn(
              'flex items-center justify-center w-9 h-9 rounded-xl',
              'transition-all duration-200',
              canSend
                ? 'bg-primary-600 text-white hover:bg-primary-700'
                : 'bg-neutral-200 text-neutral-400'
            )}
            whileHover={canSend ? { scale: 1.05 } : undefined}
            whileTap={canSend ? { scale: 0.95 } : undefined}
          >
            {isProcessing ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <ArrowUp className="w-5 h-5" />
            )}
          </motion.button>
        </div>

        {/* Disclaimer */}
        <p className="text-xs text-neutral-400 text-center mt-3">
          Concept2Cure AI may make mistakes. Always verify regulatory information with official
          sources.
        </p>
      </div>
    );
  }
);

InputArea.displayName = 'InputArea';

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export const AIAssistantV3: React.FC<AIAssistantV3Props> = ({
  initialMessages = [],
  onSendMessage,
  isProcessing = false,
  streamingContent,
  suggestedPrompts = DEFAULT_PROMPTS,
  assistantName = 'Concept2Cure AI',
  assistantAvatar,
  fullScreen = false,
  onToggleFullScreen,
  className,
}) => {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [inputValue, setInputValue] = useState('');
  const [attachments, setAttachments] = useState<File[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingContent]);

  const handleSend = useCallback(async () => {
    if (!inputValue.trim() || isProcessing) return;

    const userMessage: Message = {
      id: `msg_${Date.now()}`,
      role: 'user',
      content: inputValue.trim(),
      timestamp: new Date(),
      status: 'sending',
    };

    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    setAttachments([]);

    try {
      await onSendMessage?.(userMessage.content, attachments);
    } catch (error) {
      console.error('Failed to send message:', error);
    }
  }, [inputValue, attachments, isProcessing, onSendMessage]);

  const handleSelectPrompt = useCallback((prompt: string) => {
    setInputValue(prompt);
  }, []);

  const handleRemoveAttachment = useCallback((index: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== index));
  }, []);

  const handleAttachFile = useCallback(() => {
    // This would trigger file input - handled by InputArea
  }, []);

  const isEmpty = messages.length === 0;

  return (
    <div
      className={cn('flex flex-col h-full bg-white', fullScreen && 'fixed inset-0 z-50', className)}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-100">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-primary-500 to-accent-500">
            {assistantAvatar || <Sparkles className="w-5 h-5 text-white" />}
          </div>
          <div>
            <h2 className="font-semibold text-neutral-900">{assistantName}</h2>
            <p className="text-xs text-neutral-500">Regulatory Intelligence Assistant</p>
          </div>
        </div>

        <div className="flex items-center gap-1">
          {onToggleFullScreen && (
            <button
              onClick={onToggleFullScreen}
              className="p-2 rounded-lg text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 transition-colors"
              title={fullScreen ? 'Exit full screen' : 'Full screen'}
            >
              {fullScreen ? <Minimize2 className="w-5 h-5" /> : <Maximize2 className="w-5 h-5" />}
            </button>
          )}
          <button
            className="p-2 rounded-lg text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 transition-colors"
            title="Settings"
          >
            <Settings className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Messages Area */}
      <div ref={scrollAreaRef} className="flex-1 overflow-y-auto">
        {isEmpty ? (
          <WelcomeScreen
            assistantName={assistantName}
            prompts={suggestedPrompts}
            onSelectPrompt={handleSelectPrompt}
          />
        ) : (
          <div className="py-4 space-y-4">
            <LayoutGroup>
              {messages.map((message, index) => (
                <MessageBubble
                  key={message.id}
                  message={message}
                  isLatest={index === messages.length - 1}
                />
              ))}
            </LayoutGroup>

            {/* Streaming response */}
            {streamingContent && (
              <MessageBubble
                message={{
                  id: 'streaming',
                  role: 'assistant',
                  content: streamingContent,
                  timestamp: new Date(),
                }}
                isLatest
              />
            )}

            {/* Typing indicator */}
            {isProcessing && !streamingContent && <TypingIndicator />}

            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input Area */}
      <InputArea
        value={inputValue}
        onChange={setInputValue}
        onSend={handleSend}
        onAttachFile={handleAttachFile}
        attachments={attachments}
        onRemoveAttachment={handleRemoveAttachment}
        isProcessing={isProcessing}
        placeholder={`Message ${assistantName}...`}
      />
    </div>
  );
};

export default AIAssistantV3;
