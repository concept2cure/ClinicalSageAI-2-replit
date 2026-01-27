/**
 * Lumen Cortex Chat - Claude-like Conversational AI Interface
 *
 * A modern, enterprise-grade chat interface for regulatory AI assistance.
 * Provides Claude-like conversational experience with markdown rendering.
 *
 * @module client/components/LumenCortexChat
 */

import React, { useState, useRef, useEffect } from 'react';
import { Send, Sparkles, Loader2, Copy, Check, RefreshCw, Brain, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface LumenCortexChatProps {
  className?: string;
  initialMessage?: string;
  placeholder?: string;
}

// Simple markdown-to-HTML renderer for regulatory content
function renderMarkdown(text: string): string {
  return (
    text
      // Headers
      .replace(/^### (.*$)/gm, '<h3 class="text-lg font-semibold mt-4 mb-2 text-gray-800">$1</h3>')
      .replace(/^## (.*$)/gm, '<h2 class="text-xl font-semibold mt-5 mb-3 text-gray-900">$1</h2>')
      .replace(/^# (.*$)/gm, '<h1 class="text-2xl font-bold mt-6 mb-4 text-gray-900">$1</h1>')
      // Bold
      .replace(/\*\*(.*?)\*\*/g, '<strong class="font-semibold text-gray-900">$1</strong>')
      // Italic
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      // Code blocks
      .replace(
        /```(\w*)\n([\s\S]*?)```/g,
        '<pre class="bg-gray-100 rounded-lg p-4 my-3 overflow-x-auto text-sm"><code>$2</code></pre>'
      )
      // Inline code
      .replace(
        /`([^`]+)`/g,
        '<code class="bg-gray-100 px-1.5 py-0.5 rounded text-sm font-mono">$1</code>'
      )
      // Tables (basic)
      .replace(/\|(.+)\|/g, match => {
        const cells = match.split('|').filter(c => c.trim());
        const row = cells.map(c => `<td class="border px-3 py-2">${c.trim()}</td>`).join('');
        return `<tr>${row}</tr>`;
      })
      // Bullet points
      .replace(/^- (.*$)/gm, '<li class="ml-4 list-disc">$1</li>')
      // Numbered lists
      .replace(/^\d+\. (.*$)/gm, '<li class="ml-4 list-decimal">$1</li>')
      // Line breaks (preserve paragraph structure)
      .replace(/\n\n/g, '</p><p class="my-3">')
      .replace(/\n/g, '<br/>')
  );
}

export function LumenCortexChat({ className, initialMessage, placeholder }: LumenCortexChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  }, [input]);

  // Handle send message
  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: `msg_${Date.now()}_user`,
      role: 'user',
      content: input.trim(),
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const response = await fetch('/api/chat/send-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMessage.content,
          thread_id: threadId,
        }),
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const data = await response.json();
      setThreadId(data.thread_id);

      const assistantMessage: Message = {
        id: `msg_${Date.now()}_assistant`,
        role: 'assistant',
        content: data.answer,
        timestamp: new Date(),
      };

      setMessages(prev => [...prev, assistantMessage]);
    } catch (error) {
      console.error('Chat error:', error);
      setMessages(prev => [
        ...prev,
        {
          id: `msg_${Date.now()}_error`,
          role: 'assistant',
          content: 'I apologize, but I encountered an error. Please try again.',
          timestamp: new Date(),
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  // Handle key press (Enter to send, Shift+Enter for newline)
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Copy message to clipboard
  const copyToClipboard = async (text: string, id: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Start new conversation
  const handleNewChat = () => {
    setMessages([]);
    setThreadId(null);
  };

  // Quick action buttons
  const quickActions = [
    { label: '510(k) Guide', query: 'What are the key requirements for a 510(k) submission?' },
    { label: 'IND Overview', query: 'Give me an overview of IND application requirements' },
    {
      label: 'CER Requirements',
      query: 'What should be included in a Clinical Evaluation Report?',
    },
    { label: '21 CFR Part 11', query: 'Explain 21 CFR Part 11 compliance requirements' },
  ];

  return (
    <div className={cn('flex flex-col h-full bg-white rounded-xl border shadow-sm', className)}>
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b bg-gradient-to-r from-indigo-50 to-purple-50">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
            <Brain className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="font-semibold text-gray-900">Lumen Cortex</h2>
            <p className="text-xs text-gray-500">Regulatory Intelligence Assistant</p>
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={handleNewChat} className="text-gray-500">
          <RefreshCw className="w-4 h-4 mr-2" />
          New Chat
        </Button>
      </div>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {messages.length === 0 ? (
          // Welcome state
          <div className="h-full flex flex-col items-center justify-center text-center px-8">
            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-indigo-100 to-purple-100 flex items-center justify-center mb-6">
              <Sparkles className="w-10 h-10 text-indigo-600" />
            </div>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">Welcome to Lumen Cortex</h3>
            <p className="text-gray-500 mb-8 max-w-md">
              Your AI-powered regulatory intelligence assistant. Ask me about FDA submissions,
              clinical trials, compliance requirements, and more.
            </p>

            {/* Quick actions */}
            <div className="grid grid-cols-2 gap-3 w-full max-w-lg">
              {quickActions.map((action, index) => (
                <button
                  key={index}
                  onClick={() => setInput(action.query)}
                  className="p-4 text-left border rounded-lg hover:border-indigo-300 hover:bg-indigo-50 transition-colors"
                >
                  <FileText className="w-4 h-4 text-indigo-600 mb-2" />
                  <span className="text-sm font-medium text-gray-700">{action.label}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          // Message list
          <>
            {messages.map(message => (
              <div
                key={message.id}
                className={cn('flex gap-4', message.role === 'user' ? 'flex-row-reverse' : '')}
              >
                {/* Avatar */}
                <div
                  className={cn(
                    'w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0',
                    message.role === 'user'
                      ? 'bg-blue-500'
                      : 'bg-gradient-to-br from-indigo-500 to-purple-600'
                  )}
                >
                  {message.role === 'user' ? (
                    <span className="text-xs font-medium text-white">You</span>
                  ) : (
                    <Brain className="w-4 h-4 text-white" />
                  )}
                </div>

                {/* Message content */}
                <div
                  className={cn(
                    'flex-1 max-w-[85%] rounded-2xl px-4 py-3',
                    message.role === 'user' ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-800'
                  )}
                >
                  {message.role === 'user' ? (
                    <p className="whitespace-pre-wrap">{message.content}</p>
                  ) : (
                    <div
                      className="prose prose-sm max-w-none"
                      dangerouslySetInnerHTML={{
                        __html: `<p class="my-0">${renderMarkdown(message.content)}</p>`,
                      }}
                    />
                  )}

                  {/* Copy button for assistant messages */}
                  {message.role === 'assistant' && (
                    <button
                      onClick={() => copyToClipboard(message.content, message.id)}
                      className="mt-2 flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 transition-colors"
                    >
                      {copiedId === message.id ? (
                        <>
                          <Check className="w-3 h-3" />
                          Copied
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3" />
                          Copy
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>
            ))}

            {/* Loading indicator */}
            {isLoading && (
              <div className="flex gap-4">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
                  <Brain className="w-4 h-4 text-white" />
                </div>
                <div className="flex-1 max-w-[85%] bg-gray-100 rounded-2xl px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />
                    <span className="text-gray-500 text-sm">Thinking...</span>
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Input area */}
      <div className="p-4 border-t bg-gray-50">
        <div className="flex gap-3 items-end">
          <Textarea
            ref={textareaRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyPress}
            placeholder={
              placeholder || 'Ask about regulatory requirements, submissions, compliance...'
            }
            className="flex-1 resize-none min-h-[44px] max-h-[200px] bg-white"
            rows={1}
          />
          <Button
            onClick={handleSend}
            disabled={!input.trim() || isLoading}
            className="h-11 px-4 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700"
          >
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </Button>
        </div>
        <p className="text-xs text-gray-400 mt-2 text-center">
          Lumen Cortex provides regulatory guidance. Always verify with official FDA sources.
        </p>
      </div>
    </div>
  );
}

export default LumenCortexChat;
