/**
 * Concept2Cure Client Portal V2 - AI Assistant
 *
 * Intelligent regulatory assistant with document analysis,
 * compliance checking, and natural language querying.
 *
 * @version 2.0.0
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Sparkles,
  Send,
  Paperclip,
  FileText,
  AlertTriangle,
  CheckCircle2,
  Copy,
  ThumbsUp,
  ThumbsDown,
  RotateCcw,
  Maximize2,
  Minimize2,
  X,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  BookOpen,
  Brain,
  Lightbulb,
  Search,
  FileSearch,
  ShieldCheck,
  MessageSquare,
  Loader2,
} from 'lucide-react';
import type { AIMessage, AICitation, AIContext } from '../../core/portalTypes';
import { usePortal } from '../../core/portalContext';

// ─────────────────────────────────────────────────────────────────────────────
// MESSAGE COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

interface MessageProps {
  message: AIMessage;
  onCopy: (content: string) => void;
  onFeedback: (messageId: string, type: 'positive' | 'negative') => void;
  onRegenerate?: (messageId: string) => void;
}

const Message: React.FC<MessageProps> = ({ message, onCopy, onFeedback, onRegenerate }) => {
  const [showCitations, setShowCitations] = useState(false);
  const isUser = message.role === 'user';
  const isAssistant = message.role === 'assistant';

  const formatTimestamp = (date: Date) => {
    return new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      minute: 'numeric',
      hour12: true,
    }).format(new Date(date));
  };

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-4`}>
      <div className={`max-w-[80%] ${isUser ? 'order-1' : 'order-2'}`}>
        <div
          className={`rounded-2xl px-4 py-3 ${
            isUser
              ? 'bg-blue-600 text-white rounded-br-md'
              : 'bg-gray-100 text-gray-900 rounded-bl-md'
          }`}
        >
          {/* Message content */}
          <div className="prose prose-sm max-w-none">
            {isAssistant ? (
              <div className="whitespace-pre-wrap">{message.content}</div>
            ) : (
              <p className="m-0">{message.content}</p>
            )}
          </div>

          {/* Attachments */}
          {message.attachments && message.attachments.length > 0 && (
            <div className="mt-2 pt-2 border-t border-gray-200/50">
              {message.attachments.map(attachment => (
                <div
                  key={attachment.id}
                  className="flex items-center gap-2 text-sm bg-white/10 rounded px-2 py-1"
                >
                  <FileText className="h-4 w-4" />
                  <span className="truncate">{attachment.name}</span>
                </div>
              ))}
            </div>
          )}

          {/* Citations toggle */}
          {isAssistant && message.citations && message.citations.length > 0 && (
            <button
              onClick={() => setShowCitations(!showCitations)}
              className="flex items-center gap-1 mt-2 text-xs text-gray-500 hover:text-gray-700"
            >
              <BookOpen className="h-3 w-3" />
              {message.citations.length} source{message.citations.length !== 1 ? 's' : ''}
              {showCitations ? (
                <ChevronUp className="h-3 w-3" />
              ) : (
                <ChevronDown className="h-3 w-3" />
              )}
            </button>
          )}
        </div>

        {/* Citations panel */}
        {showCitations && message.citations && (
          <div className="mt-2 bg-gray-50 rounded-lg p-3 space-y-2">
            {message.citations.map(citation => (
              <div key={citation.id} className="flex items-start gap-2 text-sm">
                <FileText className="h-4 w-4 text-gray-400 flex-shrink-0 mt-0.5" />
                <div>
                  <div className="font-medium text-gray-700">{citation.documentName}</div>
                  <p className="text-gray-500 text-xs mt-0.5 line-clamp-2">{citation.excerpt}</p>
                  {citation.page && (
                    <span className="text-xs text-gray-400">Page {citation.page}</span>
                  )}
                </div>
                <Badge variant="secondary" className="text-xs flex-shrink-0">
                  {Math.round(citation.confidence * 100)}%
                </Badge>
              </div>
            ))}
          </div>
        )}

        {/* Message meta */}
        <div
          className={`flex items-center gap-2 mt-1 text-xs text-gray-400 ${isUser ? 'justify-end' : ''}`}
        >
          <span>{formatTimestamp(message.timestamp)}</span>
          {isAssistant && (
            <>
              <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-200">
                AI-generated
              </span>
              <button
                onClick={() => onCopy(message.content)}
                className="p-1 hover:bg-gray-100 rounded"
                title="Copy"
              >
                <Copy className="h-3 w-3" />
              </button>
              <button
                onClick={() => onFeedback(message.id, 'positive')}
                className="p-1 hover:bg-gray-100 rounded"
                title="Helpful"
              >
                <ThumbsUp className="h-3 w-3" />
              </button>
              <button
                onClick={() => onFeedback(message.id, 'negative')}
                className="p-1 hover:bg-gray-100 rounded"
                title="Not helpful"
              >
                <ThumbsDown className="h-3 w-3" />
              </button>
              {onRegenerate && (
                <button
                  onClick={() => onRegenerate(message.id)}
                  className="p-1 hover:bg-gray-100 rounded"
                  title="Regenerate"
                >
                  <RotateCcw className="h-3 w-3" />
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// QUICK ACTIONS COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

interface QuickAction {
  id: string;
  label: string;
  icon: React.ElementType;
  prompt: string;
  category: 'analysis' | 'search' | 'compliance' | 'general';
}

const QUICK_ACTIONS: QuickAction[] = [
  {
    id: 'summarize',
    label: 'Summarize Document',
    icon: FileText,
    prompt: 'Please summarize the key points from ',
    category: 'analysis',
  },
  {
    id: 'compare',
    label: 'Compare Versions',
    icon: FileSearch,
    prompt: 'Compare the differences between ',
    category: 'analysis',
  },
  {
    id: 'compliance',
    label: 'Check Compliance',
    icon: ShieldCheck,
    prompt: 'Check this document for regulatory compliance with ',
    category: 'compliance',
  },
  {
    id: 'gaps',
    label: 'Find Gaps',
    icon: AlertTriangle,
    prompt: 'Identify any gaps or missing elements in ',
    category: 'compliance',
  },
  {
    id: 'search',
    label: 'Search Documents',
    icon: Search,
    prompt: 'Search across all documents for ',
    category: 'search',
  },
  {
    id: 'explain',
    label: 'Explain Regulation',
    icon: BookOpen,
    prompt: 'Explain the regulatory requirements for ',
    category: 'general',
  },
  {
    id: 'draft',
    label: 'Draft Content',
    icon: MessageSquare,
    prompt: 'Help me draft content for ',
    category: 'general',
  },
  {
    id: 'recommend',
    label: 'Get Recommendations',
    icon: Lightbulb,
    prompt: 'What are your recommendations for ',
    category: 'general',
  },
];

interface QuickActionsProps {
  onSelectAction: (prompt: string) => void;
}

const QuickActions: React.FC<QuickActionsProps> = ({ onSelectAction }) => {
  return (
    <div className="grid grid-cols-2 gap-2">
      {QUICK_ACTIONS.map(action => {
        const Icon = action.icon;
        return (
          <button
            key={action.id}
            onClick={() => onSelectAction(action.prompt)}
            className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 bg-white border rounded-lg hover:bg-gray-50 hover:border-blue-200 transition-colors text-left"
          >
            <Icon className="h-4 w-4 text-blue-600" />
            <span>{action.label}</span>
          </button>
        );
      })}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// CONTEXT PANEL COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

interface ContextPanelProps {
  context: AIContext;
}

const ContextPanel: React.FC<ContextPanelProps> = ({ context }) => {
  return (
    <div className="bg-blue-50 rounded-lg p-3 text-sm">
      <div className="flex items-center gap-2 text-blue-700 font-medium mb-2">
        <Brain className="h-4 w-4" />
        Current Context
      </div>
      <div className="space-y-1 text-gray-600">
        <div>
          Module: <span className="font-medium">{context.currentModule}</span>
        </div>
        {context.activeProject && (
          <div>
            Project: <span className="font-medium">{context.activeProject}</span>
          </div>
        )}
        {context.activeDocument && (
          <div>
            Document: <span className="font-medium">{context.activeDocument}</span>
          </div>
        )}
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// TYPING INDICATOR COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

const TypingIndicator: React.FC = () => (
  <div className="flex items-center gap-1 px-4 py-3 bg-gray-100 rounded-2xl rounded-bl-md max-w-[100px]">
    <div
      className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
      style={{ animationDelay: '0ms' }}
    />
    <div
      className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
      style={{ animationDelay: '150ms' }}
    />
    <div
      className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
      style={{ animationDelay: '300ms' }}
    />
  </div>
);

// ─────────────────────────────────────────────────────────────────────────────
// MAIN AI ASSISTANT COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

interface AIAssistantProps {
  isExpanded?: boolean;
  onToggleExpand?: () => void;
  onClose?: () => void;
}

export const AIAssistant: React.FC<AIAssistantProps> = ({
  isExpanded = false,
  onToggleExpand,
  onClose,
}) => {
  const { currentRole, activeModule } = usePortal();
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // State
  const [messages, setMessages] = useState<AIMessage[]>([
    {
      id: '1',
      role: 'assistant',
      content: `Hello! I'm your regulatory intelligence assistant. I can help you with:\n\n• Document analysis and summarization\n• Regulatory compliance checking\n• Finding information across your document vault\n• Drafting regulatory content\n• Answering questions about FDA, EMA, and other guidelines\n\nHow can I help you today?`,
      timestamp: new Date(),
    },
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [showQuickActions, setShowQuickActions] = useState(true);

  // Context
  const context: AIContext = {
    currentModule: activeModule,
    userRole: currentRole,
    recentActions: [],
  };

  // Scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isTyping]);

  // Handle send message
  const handleSendMessage = useCallback(async () => {
    if (!inputValue.trim()) return;

    const userMessage: AIMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: inputValue.trim(),
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    setShowQuickActions(false);
    setIsTyping(true);

    // Simulate AI response (in production, this would call the API)
    setTimeout(
      () => {
        const assistantMessage: AIMessage = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: generateMockResponse(userMessage.content),
          timestamp: new Date(),
          citations: generateMockCitations(userMessage.content),
        };
        setMessages(prev => [...prev, assistantMessage]);
        setIsTyping(false);
      },
      1500 + Math.random() * 1000
    );
  }, [inputValue]);

  // Handle quick action selection
  const handleQuickAction = (prompt: string) => {
    setInputValue(prompt);
    inputRef.current?.focus();
  };

  // Handle copy
  const handleCopy = (content: string) => {
    navigator.clipboard.writeText(content);
    // Could add toast notification here
  };

  // Handle feedback
  const handleFeedback = (messageId: string, type: 'positive' | 'negative') => {
    // TODO: Implement feedback API call
    // API endpoint: POST /api/ai/feedback { messageId, type }
    void messageId;
    void type;
  };

  // Handle regenerate
  const handleRegenerate = (messageId: string) => {
    // TODO: Implement regenerate API call
    // API endpoint: POST /api/ai/regenerate { messageId }
    void messageId;
  };

  return (
    <Card className={`flex flex-col ${isExpanded ? 'h-full' : 'h-[600px]'}`}>
      {/* Header */}
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-3 border-b">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center">
            <Sparkles className="h-5 w-5 text-white" />
          </div>
          <div>
            <CardTitle className="text-base">AI Assistant</CardTitle>
            <p className="text-xs text-muted-foreground">Regulatory Intelligence</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {onToggleExpand && (
            <Button variant="ghost" size="sm" onClick={onToggleExpand}>
              {isExpanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </Button>
          )}
          {onClose && (
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </CardHeader>

      <div className="mx-4 mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
        <strong>Regulatory safety notice:</strong> Responses are AI-generated and may be incomplete
        or incorrect. Human review and approval are required before use in regulated submissions,
        safety decisions, or external communications.
      </div>

      {/* Messages */}
      <ScrollArea ref={scrollRef} className="flex-1 p-4">
        <div className="space-y-4">
          {messages.map(message => (
            <Message
              key={message.id}
              message={message}
              onCopy={handleCopy}
              onFeedback={handleFeedback}
              onRegenerate={message.role === 'assistant' ? handleRegenerate : undefined}
            />
          ))}
          {isTyping && (
            <div className="flex justify-start">
              <TypingIndicator />
            </div>
          )}
        </div>

        {/* Quick Actions */}
        {showQuickActions && messages.length <= 1 && (
          <div className="mt-6">
            <p className="text-sm text-muted-foreground mb-3">Quick actions:</p>
            <QuickActions onSelectAction={handleQuickAction} />
          </div>
        )}
      </ScrollArea>

      {/* Context Panel (collapsible) */}
      <div className="px-4 py-2 border-t bg-gray-50">
        <ContextPanel context={context} />
      </div>

      {/* Input */}
      <div className="p-4 border-t">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" className="h-9 w-9 p-0">
            <Paperclip className="h-4 w-4" />
          </Button>
          <Input
            ref={inputRef}
            value={inputValue}
            onChange={e => setInputValue(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSendMessage()}
            placeholder="Ask anything about your regulatory documents..."
            className="flex-1"
            disabled={isTyping}
          />
          <Button
            onClick={handleSendMessage}
            disabled={!inputValue.trim() || isTyping}
            className="h-9"
          >
            {isTyping ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground mt-2 text-center">
          AI responses are for guidance only. Validate against source documents and applicable
          regulations before acting.
        </p>
      </div>
    </Card>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// MOCK RESPONSE GENERATORS
// ─────────────────────────────────────────────────────────────────────────────

function generateMockResponse(query: string): string {
  const lowerQuery = query.toLowerCase();

  if (lowerQuery.includes('summarize') || lowerQuery.includes('summary')) {
    return `Here's a summary of the key points:\n\n**Primary Objectives:**\n• Evaluate safety and tolerability of BTX-331\n• Assess pharmacokinetics in healthy volunteers\n• Determine maximum tolerated dose\n\n**Study Design:**\n• Phase 1, randomized, double-blind, placebo-controlled\n• Single ascending dose followed by multiple ascending dose\n• Approximately 45 subjects across 6 cohorts\n\n**Key Safety Measures:**\n• Continuous cardiac monitoring for first 24 hours\n• Regular laboratory assessments\n• Adverse event reporting per protocol\n\nWould you like me to elaborate on any specific section?`;
  }

  if (lowerQuery.includes('compliance') || lowerQuery.includes('compliant')) {
    return `I've analyzed the document for regulatory compliance:\n\n**Overall Status: ✅ Generally Compliant**\n\n**Findings:**\n\n✅ ICH E6(R2) GCP requirements addressed\n✅ 21 CFR Part 312 IND requirements met\n✅ Informed consent elements complete\n\n⚠️ **Minor Issues:**\n• Section 8.3 - Risk management plan could be more detailed\n• Appendix C - Sample size justification needs statistical power calculation\n\n❌ **Action Required:**\n• Missing signature page for Principal Investigator\n• Data Safety Monitoring Board charter not referenced\n\nShall I help address any of these findings?`;
  }

  if (lowerQuery.includes('search') || lowerQuery.includes('find')) {
    return `I found 12 relevant documents matching your query:\n\n**Most Relevant:**\n1. **Protocol BTX-331-001 v3.0** - 95% match\n   • Contains detailed study procedures\n   • Section 6.2 addresses your query\n\n2. **Investigator Brochure v5.0** - 88% match\n   • Pharmacology data in Section 4\n   • Safety summary in Section 7\n\n3. **Statistical Analysis Plan v2.1** - 82% match\n   • Analysis populations defined\n   • Efficacy endpoints specified\n\nWould you like me to show excerpts from any of these documents?`;
  }

  if (lowerQuery.includes('fda') || lowerQuery.includes('regulation')) {
    return `**FDA Regulatory Guidance:**\n\nBased on your query, here's the relevant regulatory framework:\n\n**21 CFR Part 312 - Investigational New Drug Application:**\n• Pre-IND meeting recommended for novel mechanisms\n• Safety reporting requirements (312.32)\n• Annual report due within 60 days of IND anniversary\n\n**Key Guidances:**\n• "Content and Format of INDs" (May 2023)\n• "Safety Reporting Requirements" (December 2022)\n• "FDA-Sponsor Meetings" (October 2023)\n\n**Recommended Actions:**\n1. Schedule Type B pre-IND meeting\n2. Prepare briefing document 30 days in advance\n3. Include CMC, nonclinical, and clinical modules\n\nNeed more specific guidance on any topic?`;
  }

  return `I understand you're asking about: "${query}"\n\nBased on the documents in your vault and regulatory knowledge, here's what I found:\n\n**Key Information:**\n• Your current project (BTX-331) is in the IND preparation phase\n• Relevant documents are available in the CTD Modules folder\n• Recent FDA guidance may impact your submission strategy\n\n**Recommendations:**\n1. Review the latest Clinical Overview draft\n2. Ensure CMC documentation is aligned with current guidelines\n3. Consider scheduling a pre-submission meeting\n\n**Related Documents:**\n• Protocol BTX-331-001 v3.0\n• Clinical Overview v2.3\n• Quality Overall Summary v1.2\n\nHow can I help you further with this?`;
}

function generateMockCitations(query: string): AICitation[] {
  return [
    {
      id: '1',
      documentId: 'doc-001',
      documentName: 'Protocol BTX-331-001 v3.0',
      excerpt:
        'The primary objective is to evaluate the safety and tolerability of BTX-331 in healthy adult volunteers...',
      page: 12,
      confidence: 0.95,
    },
    {
      id: '2',
      documentId: 'doc-002',
      documentName: 'Investigator Brochure v5.0',
      excerpt:
        'Nonclinical studies demonstrated a favorable safety profile with no observed adverse effects...',
      page: 45,
      confidence: 0.88,
    },
  ];
}

export default AIAssistant;
