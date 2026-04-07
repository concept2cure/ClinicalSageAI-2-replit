/**
 * Cortex Chat Widget Component
 *
 * Conversational interface for interacting with Cortex AI.
 * Supports threaded conversations with context awareness.
 *
 * @module portal-v2/components/cortex/CortexChatWidget
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  MessageSquare,
  Send,
  Loader2,
  X,
  Minimize2,
  Maximize2,
  RefreshCw,
  AlertCircle,
  User,
  Bot,
  Sparkles,
} from 'lucide-react';
import {
  useCortexThread,
  useCortexThreadTraces,
  useCortexHealth,
  useCreateCortexThread,
  useCreateCortexTrace,
  type CortexThread,
  type CortexTrace,
} from '../../hooks/useCortex';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

interface CortexChatWidgetProps {
  /** Thread ID for existing conversation */
  threadId?: string;
  /** Initial system context */
  systemContext?: string;
  /** Module context for relevance */
  moduleContext?: string;
  /** Callback when thread is created */
  onThreadCreated?: (thread: CortexThread) => void;
  /** Widget position */
  position?: 'bottom-right' | 'bottom-left' | 'inline';
  /** Default expanded state */
  defaultExpanded?: boolean;
  /** CSS class name */
  className?: string;
}

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  isLoading?: boolean;
  error?: string;
}

/** Extract message content from a trace */
function extractTraceMessage(trace: CortexTrace): Message | null {
  const input = trace.input as Record<string, unknown>;
  const output = trace.output as Record<string, unknown> | undefined;

  // User message from input
  if (input.question || input.message || input.query) {
    return {
      id: `${trace.id}-input`,
      role: 'user',
      content: String(input.question || input.message || input.query || ''),
      timestamp: new Date(trace.createdAt),
    };
  }

  // Assistant response from output
  if (output && (output.response || output.answer || output.content)) {
    return {
      id: `${trace.id}-output`,
      role: 'assistant',
      content: String(output.response || output.answer || output.content || ''),
      timestamp: trace.completedAt ? new Date(trace.completedAt) : new Date(trace.createdAt),
    };
  }

  return null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

const SUGGESTED_PROMPTS = [
  'What are the key requirements for a 510(k) submission?',
  'Explain the substantial equivalence determination process',
  'What biocompatibility testing is required for Class II devices?',
  'How do I structure the device description section?',
];

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export function CortexChatWidget({
  threadId: initialThreadId,
  systemContext = 'You are an expert regulatory affairs assistant.',
  moduleContext = 'regulatory',
  onThreadCreated,
  position = 'bottom-right',
  defaultExpanded = false,
  className = '',
}: CortexChatWidgetProps) {
  // State
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [isMinimized, setIsMinimized] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [currentThreadId, setCurrentThreadId] = useState<string | undefined>(initialThreadId);
  const [isSending, setIsSending] = useState(false);

  // Refs
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Hooks
  const { data: health } = useCortexHealth();
  const { data: thread } = useCortexThread(currentThreadId || '');
  const { data: traces } = useCortexThreadTraces(currentThreadId || '');
  const createThread = useCreateCortexThread();
  const createTrace = useCreateCortexTrace();

  // Effects
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Convert traces to messages when traces update
  useEffect(() => {
    if (traces && traces.length > 0) {
      const formattedMessages: Message[] = [];

      for (const trace of traces) {
        // Extract user message from trace input
        const input = trace.input as Record<string, unknown>;
        if (input.question || input.message || input.query) {
          formattedMessages.push({
            id: `${trace.id}-input`,
            role: 'user',
            content: String(input.question || input.message || input.query),
            timestamp: new Date(trace.createdAt),
          });
        }

        // Extract assistant response from trace output
        const output = trace.output as Record<string, unknown> | undefined;
        if (output && (output.response || output.answer || output.content)) {
          formattedMessages.push({
            id: `${trace.id}-output`,
            role: 'assistant',
            content: String(output.response || output.answer || output.content),
            timestamp: trace.completedAt ? new Date(trace.completedAt) : new Date(trace.createdAt),
          });
        }
      }

      setMessages(formattedMessages);
    }
  }, [traces]);

  // Handlers
  const handleSendMessage = useCallback(async () => {
    if (!inputValue.trim() || isSending) return;

    // Input validation and sanitization
    const sanitizedInput = inputValue
      .trim()
      .slice(0, 4000) // Limit message length
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '') // Remove script tags
      .replace(/javascript:/gi, ''); // Remove javascript: protocol

    if (!sanitizedInput) return;

    const userMessage: Message = {
      id: `user-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      role: 'user',
      content: sanitizedInput,
      timestamp: new Date(),
    };

    const loadingMessage: Message = {
      id: `loading-${Date.now()}`,
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      isLoading: true,
    };

    setMessages(prev => [...prev, userMessage, loadingMessage]);
    setInputValue('');
    setIsSending(true);

    try {
      let threadId = currentThreadId;

      // Create thread if needed
      if (!threadId) {
        const newThread = await createThread.mutateAsync({
          title: `Chat - ${new Date().toLocaleDateString()}`,
          threadType: 'conversation',
          metadata: {
            module: moduleContext,
            systemPrompt: systemContext,
          },
        });
        threadId = newThread.id;
        setCurrentThreadId(threadId);
        onThreadCreated?.(newThread);
      }

      // Create trace with user input
      const trace = await createTrace.mutateAsync({
        threadId,
        traceType: 'query',
        input: {
          question: sanitizedInput,
          module: moduleContext,
          systemPrompt: systemContext,
        },
      });

      // Remove loading message and add response from trace output
      setMessages(prev => {
        const filtered = prev.filter(m => !m.isLoading);
        const output = trace.output as Record<string, unknown> | undefined;
        const responseContent = output
          ? String(output.response || output.answer || output.content || 'Processing...')
          : 'Your message has been received. Processing...';

        return [
          ...filtered,
          {
            id: `assistant-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
            role: 'assistant' as const,
            content: responseContent,
            timestamp: new Date(),
          },
        ];
      });
    } catch (error) {
      setMessages(prev => {
        const filtered = prev.filter(m => !m.isLoading);
        return [
          ...filtered,
          {
            id: `error-${Date.now()}`,
            role: 'assistant' as const,
            content: '',
            timestamp: new Date(),
            error: error instanceof Error ? error.message : 'An error occurred',
          },
        ];
      });
    } finally {
      setIsSending(false);
    }
  }, [
    inputValue,
    isSending,
    currentThreadId,
    moduleContext,
    systemContext,
    createThread,
    createTrace,
    onThreadCreated,
  ]);

  const handleKeyPress = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSendMessage();
      }
    },
    [handleSendMessage]
  );

  const handleSuggestedPrompt = useCallback((prompt: string) => {
    setInputValue(prompt);
    inputRef.current?.focus();
  }, []);

  const handleNewConversation = useCallback(() => {
    setCurrentThreadId(undefined);
    setMessages([]);
    setInputValue('');
  }, []);

  const toggleExpand = useCallback(() => {
    setIsExpanded(prev => !prev);
    setIsMinimized(false);
  }, []);

  const toggleMinimize = useCallback(() => {
    setIsMinimized(prev => !prev);
  }, []);

  // Computed
  const isServiceHealthy = health?.status === 'healthy';
  const positionClasses = {
    'bottom-right': 'fixed bottom-4 right-4',
    'bottom-left': 'fixed bottom-4 left-4',
    inline: 'relative',
  };

  // Collapsed state
  if (!isExpanded && position !== 'inline') {
    return (
      <button
        onClick={toggleExpand}
        className={`${positionClasses[position]} p-4 bg-indigo-600 text-white rounded-full shadow-lg hover:bg-indigo-700 transition-colors ${className}`}
        aria-label="Open Cortex AI chat"
      >
        <MessageSquare className="w-6 h-6" />
        {!isServiceHealthy && (
          <span className="absolute -top-1 -right-1 w-3 h-3 bg-amber-400 rounded-full" />
        )}
      </button>
    );
  }

  return (
    <div
      className={`${position !== 'inline' ? positionClasses[position] : ''} ${
        isMinimized ? 'h-14' : 'h-[500px]'
      } w-96 bg-white rounded-xl shadow-2xl border border-gray-200 flex flex-col overflow-hidden transition-all duration-200 ${className}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5" />
          <span className="font-semibold">Cortex AI</span>
          {!isServiceHealthy && (
            <span className="px-2 py-0.5 text-xs bg-amber-400 text-amber-900 rounded">Offline</span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={handleNewConversation}
            className="p-1.5 hover:bg-white/20 rounded transition-colors"
            aria-label="New conversation"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            onClick={toggleMinimize}
            className="p-1.5 hover:bg-white/20 rounded transition-colors"
            aria-label={isMinimized ? 'Expand' : 'Minimize'}
          >
            {isMinimized ? <Maximize2 className="w-4 h-4" /> : <Minimize2 className="w-4 h-4" />}
          </button>
          {position !== 'inline' && (
            <button
              onClick={toggleExpand}
              className="p-1.5 hover:bg-white/20 rounded transition-colors"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      {!isMinimized && (
        <>
          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-4">
                <Bot className="w-12 h-12 text-indigo-300 mb-3" />
                <h3 className="text-lg font-medium text-gray-900 mb-1">
                  How can I help you today?
                </h3>
                <p className="text-sm text-gray-500 mb-4">
                  Ask me about regulatory requirements, submission guidance, or compliance
                  questions.
                </p>
                <div className="space-y-2 w-full">
                  {SUGGESTED_PROMPTS.map((prompt, index) => (
                    <button
                      key={index}
                      onClick={() => handleSuggestedPrompt(prompt)}
                      className="w-full text-left px-3 py-2 text-sm text-gray-600 bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map(message => (
                <div
                  key={message.id}
                  className={`flex gap-3 ${message.role === 'user' ? 'flex-row-reverse' : ''}`}
                >
                  <div
                    className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
                      message.role === 'user'
                        ? 'bg-indigo-100 text-indigo-600'
                        : 'bg-purple-100 text-purple-600'
                    }`}
                  >
                    {message.role === 'user' ? (
                      <User className="w-4 h-4" />
                    ) : (
                      <Bot className="w-4 h-4" />
                    )}
                  </div>
                  <div
                    className={`flex-1 max-w-[80%] p-3 rounded-lg ${
                      message.role === 'user'
                        ? 'bg-indigo-600 text-white'
                        : message.error
                          ? 'bg-red-50 text-red-700 border border-red-200'
                          : 'bg-gray-100 text-gray-900'
                    }`}
                  >
                    {message.isLoading ? (
                      <div className="flex items-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span className="text-sm">Thinking...</span>
                      </div>
                    ) : message.error ? (
                      <div className="flex items-center gap-2">
                        <AlertCircle className="w-4 h-4" />
                        <span className="text-sm">{message.error}</span>
                      </div>
                    ) : (
                      <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                    )}
                  </div>
                </div>
              ))
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="p-4 border-t border-gray-200">
            <div className="flex items-center gap-2">
              <input
                ref={inputRef}
                type="text"
                value={inputValue}
                onChange={e => setInputValue(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder={isServiceHealthy ? 'Type your message...' : 'Service unavailable'}
                disabled={!isServiceHealthy || isSending}
                className="flex-1 px-4 py-2 bg-gray-100 border-none rounded-lg focus:ring-2 focus:ring-indigo-500 disabled:opacity-60 disabled:cursor-not-allowed"
              />
              <button
                onClick={handleSendMessage}
                disabled={!inputValue.trim() || !isServiceHealthy || isSending}
                className="p-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
                aria-label="Send message"
              >
                {isSending ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <Send className="w-5 h-5" />
                )}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default CortexChatWidget;
