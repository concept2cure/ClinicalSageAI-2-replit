/**
 * Lumen Cortex Chat - Claude-like Conversational AI Interface
 *
 * A modern, enterprise-grade chat interface for regulatory AI assistance.
 * Provides Claude-like conversational experience with markdown rendering.
 *
 * @module client/components/LumenCortexChat
 */

import React, { useState, useRef, useEffect } from 'react';
import {
  Send,
  Sparkles,
  Loader2,
  Copy,
  Check,
  RefreshCw,
  Brain,
  FileText,
  ChevronDown,
  Zap,
  ShieldCheck,
  TrendingUp,
  Search,
  Target,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  modelUsed?: string;
  /** Structured intelligence data appended to regulatory queries */
  intelligence?: {
    precedents?: Array<{
      deviceName: string;
      clearanceNumber: string;
      decision: string;
      similarity?: number;
    }>;
    riskScore?: number;
    approvalProbability?: number;
    strategy?: string;
  };
}

interface ModelInfo {
  modelId: string;
  name: string;
  type: 'base' | 'fine-tuned';
  status: string;
  domain?: string;
}

interface LumenCortexChatProps {
  className?: string;
  initialMessage?: string;
  placeholder?: string;
}

// Escape HTML entities to prevent XSS before markdown rendering
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Simple markdown-to-HTML renderer for regulatory content
function renderMarkdown(text: string): string {
  return (
    escapeHtml(text)
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

  // Fine-tuned model state
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [activeModel, setActiveModel] = useState<string>('base');
  const [showModelSelector, setShowModelSelector] = useState(false);

  // Load available models on mount
  useEffect(() => {
    loadModels();
  }, []);

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

  // Load available fine-tuned models
  const loadModels = async () => {
    try {
      const res = await fetch('/api/lumen-cortex-ft/models');
      if (res.ok) {
        const data = await res.json();
        setModels(data.models || []);
      }
    } catch (error) {
      // Graceful degradation — model selector just won't show fine-tuned options
      console.warn('Fine-tuned models unavailable:', (error as Error).message);
    }
  };

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
      let data: { answer?: string; response?: string; thread_id?: string; modelId?: string };

      // Route through fine-tuned model if one is selected
      if (activeModel !== 'base') {
        const ftResponse = await fetch('/api/lumen-cortex-ft/inference', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt: userMessage.content,
            modelId: activeModel,
            context: threadId ? `thread:${threadId}` : undefined,
            parameters: { temperature: 0.3, maxTokens: 2048 },
          }),
        });

        if (ftResponse.ok) {
          const ftData = await ftResponse.json();
          data = {
            answer: ftData.response || ftData.content || ftData.text,
            modelId: ftData.modelId || activeModel,
          };
        } else {
          // Fallback to base model
          console.warn('Fine-tuned model unavailable, falling back to base');
          const response = await fetch('/api/chat/send-message', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: userMessage.content, thread_id: threadId }),
          });
          data = await response.json();
        }
      } else {
        // Base model path (original flow)
        const response = await fetch('/api/chat/send-message', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: userMessage.content, thread_id: threadId }),
        });

        if (!response.ok) throw new Error(`API error: ${response.status}`);
        data = await response.json();
      }

      if (data.thread_id) setThreadId(data.thread_id);

      const modelLabel = models.find(m => m.modelId === activeModel)?.name || 'base';
      const assistantMessage: Message = {
        id: `msg_${Date.now()}_assistant`,
        role: 'assistant',
        content: data.answer || data.response || 'No response received.',
        timestamp: new Date(),
        modelUsed: activeModel !== 'base' ? modelLabel : undefined,
      };

      setMessages(prev => [...prev, assistantMessage]);

      // ── Auto-enrich with regulatory intelligence for relevant queries ──
      const lowerQuery = userMessage.content.toLowerCase();
      const isRegulatoryQuery =
        /\b(510\(k\)|pma|ind|nda|bla|cer|submission|regulatory|approval|clearance|fda|predicate|precedent|risk|strategy|validate)\b/i.test(
          lowerQuery
        );

      if (isRegulatoryQuery) {
        try {
          const headers: Record<string, string> = { 'Content-Type': 'application/json' };
          const token =
            sessionStorage.getItem('trialsage_access_token') ||
            localStorage.getItem('trialsage_access_token');
          if (token) headers['Authorization'] = `Bearer ${token}`;

          const [precRes, foresightRes] = await Promise.allSettled([
            fetch('/api/precedent-engine/search', {
              method: 'POST',
              headers,
              body: JSON.stringify({
                submissionType: lowerQuery.includes('pma')
                  ? 'PMA'
                  : lowerQuery.includes('ind')
                    ? 'IND'
                    : '510(k)',
                indication: userMessage.content.slice(0, 100),
                limit: 3,
              }),
            }).then(r => (r.ok ? r.json() : null)),
            fetch('/api/foresight/score', {
              method: 'POST',
              headers,
              body: JSON.stringify({
                studyId: `chat_${Date.now()}`,
                phase: 'III',
                indication: userMessage.content.slice(0, 100),
                biomarkers: [],
                endpoints: [],
                sampleSize: 100,
                organizationId: 'org_default',
              }),
            }).then(r => (r.ok ? r.json() : null)),
          ]);

          const intelligence: Message['intelligence'] = {};
          let hasData = false;

          if (precRes.status === 'fulfilled' && precRes.value?.data?.length) {
            intelligence.precedents = precRes.value.data.slice(0, 3).map((p: any) => ({
              deviceName: p.deviceName || p.device_name || 'Unknown',
              clearanceNumber: p.clearanceNumber || p.clearance_number || '',
              decision: p.decisionOutcome || p.decision_outcome || '',
              similarity: p.similarity,
            }));
            hasData = true;
          }

          if (foresightRes.status === 'fulfilled' && foresightRes.value?.prediction) {
            const pred = foresightRes.value.prediction;
            intelligence.approvalProbability = pred.successScore || 0;
            intelligence.riskScore = pred.riskFactors?.length
              ? Math.min(100, pred.riskFactors.length * 15)
              : 30;
            hasData = true;
          }

          if (hasData) {
            setMessages(prev =>
              prev.map(m => (m.id === assistantMessage.id ? { ...m, intelligence } : m))
            );
          }
        } catch {
          // Intelligence enrichment is best-effort — don't fail the chat
        }
      }
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
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Fallback for non-HTTPS or permission denied
      const el = document.createElement('textarea');
      el.value = text;
      el.style.position = 'fixed';
      el.style.opacity = '0';
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
    }
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
          {/* Model selector — shown when fine-tuned models are available */}
          {models.length > 0 && (
            <div className="relative">
              <button
                onClick={() => setShowModelSelector(!showModelSelector)}
                className={cn(
                  'flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors',
                  activeModel !== 'base'
                    ? 'bg-indigo-50 border-indigo-200 text-indigo-700'
                    : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'
                )}
              >
                {activeModel !== 'base' && <Zap className="w-3 h-3" />}
                {activeModel === 'base'
                  ? 'Base Model'
                  : models.find(m => m.modelId === activeModel)?.name || 'Fine-tuned'}
                <ChevronDown className="w-3 h-3" />
              </button>
              {showModelSelector && (
                <div className="absolute top-full left-0 mt-1 w-56 bg-white border rounded-lg shadow-lg z-50 py-1">
                  <button
                    onClick={() => {
                      setActiveModel('base');
                      setShowModelSelector(false);
                    }}
                    className={cn(
                      'w-full text-left px-3 py-2 text-sm hover:bg-gray-50',
                      activeModel === 'base' && 'bg-indigo-50'
                    )}
                  >
                    <span className="font-medium">Base Model</span>
                    <span className="block text-xs text-gray-400">General regulatory AI</span>
                  </button>
                  {models
                    .filter(m => m.status === 'active')
                    .map(model => (
                      <button
                        key={model.modelId}
                        onClick={() => {
                          setActiveModel(model.modelId);
                          setShowModelSelector(false);
                        }}
                        className={cn(
                          'w-full text-left px-3 py-2 text-sm hover:bg-gray-50',
                          activeModel === model.modelId && 'bg-indigo-50'
                        )}
                      >
                        <span className="font-medium flex items-center gap-1">
                          {model.name} <Zap className="w-3 h-3 text-indigo-500" />
                        </span>
                        <span className="block text-xs text-gray-400">
                          {model.domain || model.type}
                        </span>
                      </button>
                    ))}
                </div>
              )}
            </div>
          )}
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

                  {/* Copy button + model badge for assistant messages */}
                  {message.role === 'assistant' && (
                    <div className="mt-2 flex items-center gap-3">
                      <button
                        onClick={() => copyToClipboard(message.content, message.id)}
                        className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 transition-colors"
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
                      {message.modelUsed && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-indigo-50 text-indigo-600 border border-indigo-100">
                          <Zap className="w-2.5 h-2.5" />
                          {message.modelUsed}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Structured intelligence enrichment panel */}
                  {message.intelligence && (
                    <div className="mt-3 space-y-2 border-t border-gray-200 pt-3">
                      <span className="text-[10px] font-semibold text-indigo-600 uppercase tracking-wider flex items-center gap-1">
                        <ShieldCheck className="w-3 h-3" /> Regulatory Intelligence
                      </span>

                      {/* Precedents */}
                      {message.intelligence.precedents &&
                        message.intelligence.precedents.length > 0 && (
                          <div className="space-y-1">
                            <span className="text-[10px] font-medium text-gray-500 flex items-center gap-1">
                              <Search className="w-2.5 h-2.5" /> Precedent Evidence
                            </span>
                            {message.intelligence.precedents.map((p, i) => (
                              <div
                                key={i}
                                className="flex items-center justify-between p-1.5 bg-white/80 rounded border border-gray-200 text-[11px]"
                              >
                                <div>
                                  <span className="font-medium text-gray-700">{p.deviceName}</span>
                                  <span className="text-gray-400 ml-1.5">{p.clearanceNumber}</span>
                                </div>
                                <span
                                  className={`px-1.5 py-0.5 rounded-full text-[9px] font-semibold ${
                                    p.decision === 'CLEARED' || p.decision === 'APPROVED'
                                      ? 'bg-emerald-100 text-emerald-700'
                                      : 'bg-red-100 text-red-700'
                                  }`}
                                >
                                  {p.decision}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}

                      {/* Scores */}
                      <div className="flex gap-3">
                        {message.intelligence.approvalProbability != null && (
                          <div className="flex items-center gap-1 text-[11px]">
                            <TrendingUp className="w-3 h-3 text-emerald-500" />
                            <span className="text-gray-600">Approval:</span>
                            <span className="font-semibold text-gray-800">
                              {message.intelligence.approvalProbability}%
                            </span>
                          </div>
                        )}
                        {message.intelligence.riskScore != null && (
                          <div className="flex items-center gap-1 text-[11px]">
                            <Target className="w-3 h-3 text-amber-500" />
                            <span className="text-gray-600">Risk:</span>
                            <span
                              className={`font-semibold ${
                                message.intelligence.riskScore < 30
                                  ? 'text-emerald-700'
                                  : message.intelligence.riskScore < 60
                                    ? 'text-amber-700'
                                    : 'text-red-700'
                              }`}
                            >
                              {message.intelligence.riskScore < 30
                                ? 'Low'
                                : message.intelligence.riskScore < 60
                                  ? 'Moderate'
                                  : 'High'}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
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
