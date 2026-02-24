import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import {
  Send,
  Bot,
  User,
  Paperclip,
  ListChecks,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Code,
  Image,
  Copy,
  AlertTriangle,
  Link2,
  ShieldCheck,
  ShieldAlert,
  Info,
  Plus,
  Eye,
  X,
} from 'lucide-react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter,
} from '@/components/ui/card';
import { CitationList, ConfidenceBadge } from '@/components/ai/AIResponseBlock';

// Default welcome message
const defaultMessages = [
  {
    id: 1,
    role: 'assistant',
    content:
      "Hello! I'm your Lumen AI Regulatory Assistant. I can help you with drafting, formatting, and ensuring compliance for this section. Feel free to ask me any questions about regulatory requirements, content suggestions, or best practices.",
    timestamp: new Date(),
    source: 'system',
  },
];

// ── Claim Status UI ──────────────────────────────────────────────────────────

const CLAIM_STATUS_CONFIG = {
  SUPPORTED: {
    label: 'Supported',
    color: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    border: 'border-l-emerald-500',
    icon: ShieldCheck,
  },
  WEAK: {
    label: 'Weak',
    color: 'bg-amber-100 text-amber-800 border-amber-200',
    border: 'border-l-amber-500',
    icon: Info,
  },
  UNSUPPORTED: {
    label: 'Unsupported',
    color: 'bg-red-100 text-red-800 border-red-200',
    border: 'border-l-red-500',
    icon: ShieldAlert,
  },
};

function ClaimStatusPill({ status }) {
  const config = CLAIM_STATUS_CONFIG[status] || CLAIM_STATUS_CONFIG.UNSUPPORTED;
  const Icon = config.icon;
  return (
    <Badge variant="outline" className={`${config.color} text-[10px] font-medium gap-1`}>
      <Icon className="h-3 w-3" />
      {config.label}
    </Badge>
  );
}

function ClaimCard({ claim, onAddToBinder, binderLoading }) {
  const [expanded, setExpanded] = useState(false);
  const config = CLAIM_STATUS_CONFIG[claim.status] || CLAIM_STATUS_CONFIG.UNSUPPORTED;

  return (
    <div className={`border-l-4 ${config.border} bg-muted/30 rounded-r-md px-3 py-2 space-y-1.5`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="prose prose-sm whitespace-pre-line break-words text-sm">
            {claim.claimText}
          </div>
        </div>
        <ClaimStatusPill status={claim.status} />
      </div>

      {/* Citation count + expand toggle */}
      {claim.citations && claim.citations.length > 0 && (
        <div className="flex items-center gap-2">
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1 text-[11px] text-blue-600 hover:text-blue-800 transition-colors"
          >
            <Link2 className="h-3 w-3" />
            {claim.citations.length} citation{claim.citations.length !== 1 ? 's' : ''}
            {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>
        </div>
      )}

      {/* Expanded citations */}
      {expanded && claim.citations && (
        <div className="space-y-1 pl-2 border-l-2 border-blue-200">
          {claim.citations.map((cit, i) => (
            <div
              key={cit.chunkId || i}
              className="text-xs text-muted-foreground flex items-center gap-1.5"
            >
              <span className="inline-flex items-center justify-center h-4 min-w-[16px] px-0.5 text-[9px] font-bold bg-blue-100 text-blue-700 rounded-sm">
                {i + 1}
              </span>
              <span className="truncate">{cit.title || 'Unknown source'}</span>
              <span className="text-[10px] text-muted-foreground/60 shrink-0">
                {Math.round((cit.score || 0) * 100)}%
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Add to Binder button */}
      {onAddToBinder && claim.status !== 'UNSUPPORTED' && claim.claimId && (
        <div className="pt-1">
          <Button
            variant="outline"
            size="sm"
            className="h-6 text-[10px] px-2"
            disabled={binderLoading}
            onClick={() => onAddToBinder(claim.claimId)}
          >
            <Plus className="h-3 w-3 mr-1" />
            Add to Binder
          </Button>
        </div>
      )}
    </div>
  );
}

function ChainDrawer({ chain, onClose }) {
  if (!chain) return null;

  return (
    <div className="fixed inset-y-0 right-0 w-80 bg-background border-l shadow-lg z-50 flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Eye className="h-4 w-4" />
          Provenance Chain
        </h3>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4 text-xs">
        {/* Retrieval */}
        <div className="space-y-1">
          <div className="font-semibold text-muted-foreground uppercase tracking-wider text-[10px]">
            Retrieval
          </div>
          <div className="bg-muted/50 rounded-md p-2 space-y-1 font-mono">
            <div>
              <span className="text-muted-foreground">runId: </span>
              <span className="break-all">{chain.retrievalRunId || 'N/A'}</span>
            </div>
            <div>
              <span className="text-muted-foreground">snapshotHash: </span>
              <span className="break-all">{chain.snapshotHashSha256 || 'N/A'}</span>
            </div>
            <div>
              <span className="text-muted-foreground">sources: </span>
              {chain.retrievalMeta?.retrievedCount ?? 0} retrieved,{' '}
              {chain.retrievalMeta?.citedCount ?? 0} cited
            </div>
            <div>
              <span className="text-muted-foreground">orgScoped: </span>
              {chain.retrievalMeta?.orgScoped ? 'true' : 'false'}
            </div>
            <div>
              <span className="text-muted-foreground">citationCoverage: </span>
              {Math.round((chain.retrievalMeta?.citationCoverage ?? 0) * 100)}%
            </div>
            <div>
              <span className="text-muted-foreground">supportedClaimRate: </span>
              {Math.round((chain.retrievalMeta?.supportedClaimRate ?? 0) * 100)}%
            </div>
          </div>
        </div>

        {/* Generation */}
        <div className="space-y-1">
          <div className="font-semibold text-muted-foreground uppercase tracking-wider text-[10px]">
            Generation
          </div>
          <div className="bg-muted/50 rounded-md p-2 space-y-1 font-mono">
            <div>
              <span className="text-muted-foreground">runId: </span>
              <span className="break-all">{chain.generationRunId || 'N/A'}</span>
            </div>
            <div>
              <span className="text-muted-foreground">model: </span>
              {chain.model || 'unknown'}
            </div>
            <div>
              <span className="text-muted-foreground">tokens: </span>
              {chain.usage?.total_tokens ?? 0}
            </div>
          </div>
        </div>

        {/* Claims summary */}
        {chain.claims && chain.claims.length > 0 && (
          <div className="space-y-1">
            <div className="font-semibold text-muted-foreground uppercase tracking-wider text-[10px]">
              Claims ({chain.claims.length})
            </div>
            <div className="space-y-1">
              {chain.claims.map((c, i) => (
                <div key={i} className="flex items-center gap-2 bg-muted/50 rounded-md px-2 py-1">
                  <span className="text-muted-foreground">#{i + 1}</span>
                  <ClaimStatusPill status={c.status} />
                  <span className="text-[10px] text-muted-foreground">
                    {c.citations?.length || 0} cit.
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Sources */}
        {chain.sources && chain.sources.length > 0 && (
          <div className="space-y-1">
            <div className="font-semibold text-muted-foreground uppercase tracking-wider text-[10px]">
              Retrieved Sources
            </div>
            {chain.sources.map((s, i) => (
              <div key={s.id || i} className="bg-muted/50 rounded-md p-2">
                <div className="font-medium">
                  [SRC-{i + 1}] {s.title}
                </div>
                <div className="text-[10px] text-muted-foreground/70 mt-0.5">
                  Source Type: {(s.sourceType || 'atom').toUpperCase()}
                </div>
                <div className="text-muted-foreground mt-0.5 line-clamp-2">
                  {s.content?.substring(0, 150)}...
                </div>
                <div className="text-muted-foreground mt-0.5">
                  Score: {Math.round((s.score || 0) * 100)}%
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function LumenChatPane({ contextId, projectId }) {
  const [messages, setMessages] = useState(defaultMessages);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [threadId, setThreadId] = useState(null);
  const [aiModel, setAiModel] = useState(null);
  const [error, setError] = useState(null);
  const [chainDrawerData, setChainDrawerData] = useState(null);
  const [binderLoading, setBinderLoading] = useState(false);
  const messagesEndRef = useRef(null);

  // Reset chat when context changes
  useEffect(() => {
    setMessages(defaultMessages);
    setThreadId(null);
    setAiModel(null);
    setError(null);
  }, [contextId]);

  // Auto-scroll to bottom of messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendMessage = async () => {
    if (!input.trim() || isTyping) return;

    const userMessage = {
      id: messages.length + 1,
      role: 'user',
      content: input,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    const userInput = input;
    setInput('');
    setIsTyping(true);
    setError(null);

    try {
      const response = await fetch('/api/chat/send-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userInput,
          thread_id: threadId,
          project_id: projectId || undefined,
          system_prompt: contextId
            ? `You are a regulatory affairs AI assistant helping with eCTD section ${contextId}. Provide specific, actionable guidance for this regulatory document section. Include ICH guideline references where applicable.`
            : undefined,
        }),
      });

      if (!response.ok) {
        const errBody = await response.json().catch(() => ({}));
        throw new Error(
          errBody.code === 'AI_PROVIDER_UNAVAILABLE'
            ? 'AI providers are unavailable. Please configure OPENAI_API_KEY.'
            : `Server returned ${response.status}`
        );
      }

      const data = await response.json();

      if (data.thread_id) setThreadId(data.thread_id);
      if (data.model) setAiModel(data.model);

      const aiMessage = {
        id: messages.length + 2,
        role: 'assistant',
        content: data.answer || 'I was unable to generate a response. Please try again.',
        timestamp: new Date(),
        model: data.model,
        source: 'api',
        citations: data.citations || data.sources || [],
        confidence: typeof data.confidence === 'number' ? data.confidence : null,
        // Provenance chain
        claims: data.claims || null,
        retrievalRunId: data.retrievalRunId || null,
        snapshotHashSha256: data.snapshotHashSha256 || null,
        generationRunId: data.generationRunId || null,
        retrievalMeta: data.retrievalMeta || null,
        sources: data.sources || [],
        usage: data.usage || null,
      };

      setMessages(prev => [...prev, aiMessage]);
    } catch (err) {
      console.error('LumenChatPane: Failed to get AI response:', err);
      setError('Failed to reach the AI service. Please try again.');

      const errorMessage = {
        id: messages.length + 2,
        role: 'assistant',
        content:
          'I encountered an error connecting to the AI service. Please check your connection and try again.',
        timestamp: new Date(),
        source: 'error',
      };

      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsTyping(false);
    }
  };

  const handleKeyDown = e => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const formatTime = timestamp => {
    return timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const handleAddToBinder = useCallback(
    async claimId => {
      if (!projectId) {
        setError('No project selected — cannot add to binder.');
        return;
      }
      setBinderLoading(true);
      try {
        const resp = await fetch(`/api/ai/claims/${claimId}/add-to-binder`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ projectId }),
        });
        if (!resp.ok) {
          const errBody = await resp.json().catch(() => ({}));
          throw new Error(errBody.error || `Server returned ${resp.status}`);
        }
        const result = await resp.json();
        // Brief success indicator
        setError(null);
        alert(
          `Claim added to binder (${result.claimKey}, ${result.evidenceCount} evidence attached)`
        );
      } catch (err) {
        console.error('Add to binder failed:', err);
        setError(`Failed to add claim to binder: ${err.message}`);
      } finally {
        setBinderLoading(false);
      }
    },
    [projectId]
  );

  return (
    <Card className="border shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center">
          <Bot className="h-5 w-5 mr-2 text-primary" />
          Lumen AI Assistant
          {contextId && (
            <span className="ml-2 text-xs text-muted-foreground font-normal">
              Section {contextId}
            </span>
          )}
        </CardTitle>
        <CardDescription>
          Ask me about regulatory requirements, content suggestions, or compliance issues
        </CardDescription>
      </CardHeader>
      <CardContent className="p-4">
        <div className="space-y-4 h-[300px] overflow-y-auto mb-4 p-2">
          {messages.map(message => (
            <div
              key={message.id}
              className={`flex items-start gap-3 ${message.role === 'user' ? 'justify-end' : ''}`}
            >
              {message.role === 'assistant' && (
                <Avatar className="h-8 w-8">
                  <AvatarImage src="/avatar-bot.png" />
                  <AvatarFallback className="bg-primary/10 text-primary">
                    <Bot className="h-4 w-4" />
                  </AvatarFallback>
                </Avatar>
              )}
              <div
                className={`max-w-[80%] ${message.role === 'user' ? 'bg-primary text-primary-foreground' : message.source === 'error' ? 'bg-destructive/10 border border-destructive/20' : 'bg-muted'} rounded-xl px-4 py-2.5`}
              >
                <div className="space-y-2">
                  {/* Claim cards rendering (provenance-tracked) */}
                  {message.role === 'assistant' &&
                  message.source === 'api' &&
                  message.claims &&
                  message.claims.length > 0 ? (
                    <div className="space-y-2">
                      {message.claims.map(claim => (
                        <ClaimCard
                          key={claim.claimIndex}
                          claim={claim}
                          onAddToBinder={projectId ? handleAddToBinder : null}
                          binderLoading={binderLoading}
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="prose prose-sm whitespace-pre-line break-words">
                      {message.source === 'error' && (
                        <AlertTriangle className="h-4 w-4 inline mr-1 text-destructive" />
                      )}
                      {message.content}
                    </div>
                  )}
                  {/* Citation / Source rendering — regulatory traceability */}
                  {message.role === 'assistant' && message.source === 'api' && (
                    <div className="mt-2">
                      {message.confidence !== null && message.confidence !== undefined && (
                        <div className="mb-1">
                          <ConfidenceBadge score={message.confidence} />
                        </div>
                      )}
                      <CitationList citations={message.citations || []} />
                      {/* Show Chain button */}
                      {(message.retrievalRunId || message.generationRunId) && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 text-[10px] px-2 mt-1"
                          onClick={() => setChainDrawerData(message)}
                        >
                          <Eye className="h-3 w-3 mr-1" />
                          Show Chain
                        </Button>
                      )}
                    </div>
                  )}
                  <div
                    className={`text-xs ${message.role === 'user' ? 'text-primary-foreground/70' : 'text-muted-foreground'} justify-between flex`}
                  >
                    <span>{formatTime(message.timestamp)}</span>
                    {message.role === 'assistant' && message.source !== 'error' && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-4 w-4 text-muted-foreground hover:text-foreground"
                        onClick={() => navigator.clipboard?.writeText(message.content)}
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                </div>
              </div>
              {message.role === 'user' && (
                <Avatar className="h-8 w-8">
                  <AvatarImage src="/avatar-user.png" />
                  <AvatarFallback className="bg-primary text-primary-foreground">
                    <User className="h-4 w-4" />
                  </AvatarFallback>
                </Avatar>
              )}
            </div>
          ))}

          {isTyping && (
            <div className="flex items-start gap-3">
              <Avatar className="h-8 w-8">
                <AvatarImage src="/avatar-bot.png" />
                <AvatarFallback className="bg-primary/10 text-primary">
                  <Bot className="h-4 w-4" />
                </AvatarFallback>
              </Avatar>
              <div className="max-w-[80%] bg-muted rounded-xl px-4 py-3.5">
                <div className="flex space-x-1">
                  <span className="animate-bounce">•</span>
                  <span className="animate-bounce" style={{ animationDelay: '150ms' }}>
                    •
                  </span>
                  <span className="animate-bounce" style={{ animationDelay: '300ms' }}>
                    •
                  </span>
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {error && (
          <div className="text-xs text-destructive mb-2 flex items-center gap-1">
            <AlertTriangle className="h-3 w-3" />
            {error}
          </div>
        )}

        <div className="flex space-x-2">
          <Button variant="outline" size="icon" className="flex-shrink-0">
            <Paperclip className="h-4 w-4" />
          </Button>
          <Textarea
            placeholder="Ask about regulatory requirements..."
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            className="min-h-10 flex-1"
            rows={1}
          />
          <Button
            variant="default"
            size="icon"
            onClick={handleSendMessage}
            disabled={!input.trim() || isTyping}
            className="flex-shrink-0"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
      <CardFooter className="pt-0 px-4 pb-4 border-t flex justify-between items-center text-xs text-muted-foreground">
        <span>{aiModel ? `Powered by ${aiModel}` : 'Powered by Lumen Cortex AI'}</span>
        <div className="flex space-x-2">
          <Button variant="ghost" size="sm" className="h-7 px-2">
            <Image className="h-3 w-3 mr-1" />
            Images
          </Button>
          <Button variant="ghost" size="sm" className="h-7 px-2">
            <Code className="h-3 w-3 mr-1" />
            Tables
          </Button>
          <Button variant="ghost" size="sm" className="h-7 px-2">
            <ListChecks className="h-3 w-3 mr-1" />
            Actions
          </Button>
        </div>
      </CardFooter>

      {/* Provenance Chain Drawer */}
      {chainDrawerData && (
        <ChainDrawer chain={chainDrawerData} onClose={() => setChainDrawerData(null)} />
      )}
    </Card>
  );
}
