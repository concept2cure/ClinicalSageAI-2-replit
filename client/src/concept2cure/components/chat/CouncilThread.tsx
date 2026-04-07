/**
 * @fileoverview Council Thread - The Humanized Multi-Agent Chat
 * @module concept2cure/components/chat/CouncilThread
 * @version 1.0.0
 *
 * @description
 * Renders the Multi-Agent Council as a collaborative team thread,
 * making AI feel like working with a team of experts, not a chatbot.
 *
 * THE SHERPA TEAM:
 * - AnA Author (Drafter): "The Porter who carries the heavy pack"
 * - Dr. Stat (Statistician): "The Technical Specialist who verifies the equipment"
 * - The Auditor (Critic): "The Risk Assessor who marks the crevasses"
 * - System Core (Synthesizer): "The Expedition Leader who coordinates"
 *
 * DESIGN PHILOSOPHY:
 * "You don't talk to a 'bot'. You work with a TEAM.
 * Each agent has a persona, a face, and a personality."
 */

import React from 'react';
import { cn } from '@/lib/utils';
import {
  Bot,
  FileText,
  Search,
  AlertOctagon,
  Check,
  User,
  Sparkles,
  ShieldCheck,
  Database,
  Zap,
  ChevronRight,
  Copy,
  ThumbsUp,
  ThumbsDown,
  RefreshCw,
} from 'lucide-react';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export type AgentRole =
  | 'USER'
  | 'DRAFTER'
  | 'STATISTICIAN'
  | 'CRITIC'
  | 'SYNTHESIZER'
  | 'PATHFINDER'
  | 'VAULT';

export interface MessageAction {
  label: string;
  onClick: () => void;
  icon?: React.ReactNode;
  variant?: 'default' | 'primary' | 'danger';
}

export interface CouncilMessage {
  id: string;
  role: AgentRole;
  content: string;
  timestamp?: string;
  actions?: MessageAction[];
  citations?: Citation[];
  isThinking?: boolean;
  confidence?: number; // 0-100
  attachments?: Attachment[];
}

export interface Citation {
  id: string;
  label: string;
  source: string;
  page?: string;
  onClick?: () => void;
}

export interface Attachment {
  id: string;
  name: string;
  type: 'document' | 'data' | 'chart' | 'image';
  onClick?: () => void;
}

interface CouncilThreadProps {
  messages: CouncilMessage[];
  onFeedback?: (messageId: string, positive: boolean) => void;
  onCopy?: (content: string) => void;
  onRetry?: (messageId: string) => void;
  className?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// AGENT PERSONAS - THE SHERPA TEAM
// ═══════════════════════════════════════════════════════════════════════════════

const AGENTS: Record<
  AgentRole,
  {
    name: string;
    title: string;
    color: string;
    bgColor: string;
    bubbleColor: string;
    icon: React.ReactNode;
  }
> = {
  USER: {
    name: 'You',
    title: 'Team Lead',
    color: 'text-stone-700',
    bgColor: 'bg-stone-100',
    bubbleColor: 'bg-stone-800 text-white',
    icon: <User className="w-4 h-4" />,
  },
  DRAFTER: {
    name: 'RI Author',
    title: 'The Heavy Lifter',
    color: 'text-stone-700',
    bgColor: 'bg-blue-100',
    bubbleColor: 'bg-white border border-blue-200 text-stone-700',
    icon: <FileText className="w-4 h-4" />,
  },
  STATISTICIAN: {
    name: 'Dr. Stat',
    title: 'Verification Specialist',
    color: 'text-emerald-700',
    bgColor: 'bg-emerald-100',
    bubbleColor: 'bg-emerald-50 border border-emerald-200 text-emerald-900',
    icon: <Search className="w-4 h-4" />,
  },
  CRITIC: {
    name: 'The Auditor',
    title: 'Risk Assessor',
    color: 'text-red-700',
    bgColor: 'bg-red-100',
    bubbleColor: 'bg-red-50 border border-red-200 text-red-900',
    icon: <AlertOctagon className="w-4 h-4" />,
  },
  SYNTHESIZER: {
    name: 'Cortex Core',
    title: 'Expedition Leader',
    color: 'text-purple-700',
    bgColor: 'bg-purple-100',
    bubbleColor: 'bg-white border border-purple-200 text-stone-700',
    icon: <Sparkles className="w-4 h-4" />,
  },
  PATHFINDER: {
    name: 'CERV2',
    title: 'Regulatory Pathfinder',
    color: 'text-stone-700',
    bgColor: 'bg-blue-100',
    bubbleColor: 'bg-blue-50 border border-blue-200 text-blue-900',
    icon: <ShieldCheck className="w-4 h-4" />,
  },
  VAULT: {
    name: 'The Vault',
    title: 'Logistics Manager',
    color: 'text-stone-700',
    bgColor: 'bg-stone-100',
    bubbleColor: 'bg-stone-50 border border-stone-200 text-stone-900',
    icon: <Database className="w-4 h-4" />,
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// SUB-COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════════

const ThinkingIndicator: React.FC = () => (
  <div className="flex items-center gap-1">
    <div
      className="w-2 h-2 bg-blue-400 rounded-full animate-pulse"
      style={{ animationDelay: '0ms' }}
    />
    <div
      className="w-2 h-2 bg-blue-400 rounded-full animate-pulse"
      style={{ animationDelay: '150ms' }}
    />
    <div
      className="w-2 h-2 bg-blue-400 rounded-full animate-pulse"
      style={{ animationDelay: '300ms' }}
    />
  </div>
);

const CitationBadge: React.FC<{ citation: Citation }> = ({ citation }) => (
  <button
    onClick={citation.onClick}
    className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-blue-100 text-stone-700 rounded hover:bg-blue-200 transition-colors duration-150"
  >
    <FileText className="w-3 h-3" />
    {citation.label}
    {citation.page && <span className="text-blue-500">p.{citation.page}</span>}
  </button>
);

const AttachmentBadge: React.FC<{ attachment: Attachment }> = ({ attachment }) => {
  const icons = {
    document: <FileText className="w-3 h-3" />,
    data: <Database className="w-3 h-3" />,
    chart: <Sparkles className="w-3 h-3" />,
    image: <FileText className="w-3 h-3" />,
  };

  return (
    <button
      onClick={attachment.onClick}
      className="flex items-center gap-2 px-3 py-2 text-xs bg-white border border-stone-200 rounded-lg hover:bg-stone-50 hover:border-blue-300 transition-colors shadow-sm"
    >
      <div className="text-blue-600">{icons[attachment.type]}</div>
      <span className="font-medium text-stone-700">{attachment.name}</span>
      <ChevronRight className="w-3 h-3 text-stone-400" />
    </button>
  );
};

const MessageBubble: React.FC<{
  message: CouncilMessage;
  onFeedback?: (positive: boolean) => void;
  onCopy?: () => void;
  onRetry?: () => void;
}> = ({ message, onFeedback, onCopy, onRetry }) => {
  const persona = AGENTS[message.role] || AGENTS.SYNTHESIZER;
  const isUser = message.role === 'USER';

  return (
    <div
      className={cn(
        'flex gap-3 animate-in slide-in-from-bottom-2 duration-200',
        isUser && 'flex-row-reverse'
      )}
    >
      {/* Avatar */}
      <div
        className={cn(
          'mt-1 w-9 h-9 rounded-full flex items-center justify-center shadow-sm shrink-0',
          'border-2 border-white ring-1 ring-stone-100',
          persona.bgColor,
          persona.color
        )}
      >
        {persona.icon}
      </div>

      {/* Content */}
      <div className="flex-1 max-w-[85%]">
        {/* Agent Header */}
        <div
          className={cn('flex items-baseline gap-2 mb-1', isUser ? 'justify-end' : 'justify-start')}
        >
          <span className="text-xs font-semibold text-stone-400 uppercase tracking-wider">
            {persona.name}
          </span>
          {!isUser && <span className="text-xs text-stone-400">{persona.title}</span>}
          {message.timestamp && (
            <span className="text-xs text-stone-400">{message.timestamp}</span>
          )}
        </div>

        {/* Message Bubble */}
        <div
          className={cn(
            'text-sm p-4 rounded-xl shadow-sm leading-relaxed',
            isUser ? 'rounded-tr-none' : 'rounded-tl-none',
            persona.bubbleColor
          )}
        >
          {message.isThinking ? (
            <ThinkingIndicator />
          ) : (
            <>
              {message.content}

              {/* Confidence Indicator */}
              {message.confidence !== undefined && (
                <div className="mt-2 pt-2 border-t border-stone-200/50">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-stone-400">Confidence:</span>
                    <div className="flex-1 h-1.5 bg-stone-200 rounded-full overflow-hidden">
                      <div
                        className={cn(
                          'h-full rounded-full transition-all duration-150',
                          message.confidence >= 90 && 'bg-green-500',
                          message.confidence >= 70 && message.confidence < 90 && 'bg-stone-600',
                          message.confidence >= 50 && message.confidence < 70 && 'bg-amber-500',
                          message.confidence < 50 && 'bg-red-500'
                        )}
                        style={{ width: `${message.confidence}%` }}
                      />
                    </div>
                    <span className="text-xs font-mono font-medium text-stone-500">
                      {message.confidence}%
                    </span>
                  </div>
                </div>
              )}

              {/* Citations */}
              {message.citations && message.citations.length > 0 && (
                <div className="mt-3 pt-2 border-t border-stone-200/50">
                  <div className="flex flex-wrap gap-1.5">
                    {message.citations.map(citation => (
                      <CitationBadge key={citation.id} citation={citation} />
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Attachments */}
        {message.attachments && message.attachments.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-2">
            {message.attachments.map(attachment => (
              <AttachmentBadge key={attachment.id} attachment={attachment} />
            ))}
          </div>
        )}

        {/* Actions */}
        {!isUser && message.actions && message.actions.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-3">
            {message.actions.map((action, i) => (
              <button
                key={i}
                onClick={action.onClick}
                className={cn(
                  'text-xs font-semibold px-3 py-1.5 rounded-full transition-all shadow-sm',
                  'flex items-center gap-1.5',
                  action.variant === 'primary' && 'bg-stone-800 text-white hover:bg-stone-900',
                  action.variant === 'danger' && 'bg-red-100 text-red-700 hover:bg-red-200',
                  !action.variant &&
                    'bg-white border border-stone-200 text-stone-600 hover:bg-stone-50 hover:border-blue-300'
                )}
              >
                {action.icon}
                {action.label}
              </button>
            ))}
          </div>
        )}

        {/* Feedback Bar (for non-user messages) */}
        {!isUser && !message.isThinking && (
          <div className="flex items-center gap-2 mt-2 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
            <button
              onClick={() => onFeedback?.(true)}
              className="p-1 text-stone-400 hover:text-green-600 hover:bg-green-50 rounded transition-colors duration-150"
              title="Good response"
            >
              <ThumbsUp className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => onFeedback?.(false)}
              className="p-1 text-stone-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors duration-150"
              title="Poor response"
            >
              <ThumbsDown className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={onCopy}
              className="p-1 text-stone-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors duration-150"
              title="Copy"
            >
              <Copy className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={onRetry}
              className="p-1 text-stone-400 hover:text-purple-600 hover:bg-purple-50 rounded transition-colors duration-150"
              title="Regenerate"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export const CouncilThread: React.FC<CouncilThreadProps> = ({
  messages,
  onFeedback,
  onCopy,
  onRetry,
  className,
}) => {
  return (
    <div className={cn('space-y-6 p-4', className)}>
      {messages.length === 0 ? (
        <div className="text-center py-12">
          <div className="w-12 h-12 mx-auto mb-4 rounded-lg bg-blue-100 flex items-center justify-center">
            <Sparkles className="w-8 h-8 text-blue-600" />
          </div>
          <h3 className="text-lg font-semibold text-stone-900 mb-1">Your Sherpa Team is Ready</h3>
          <p className="text-sm text-stone-500 max-w-sm mx-auto">
            Start a conversation and your team of expert agents will guide you through the
            regulatory mountain.
          </p>
        </div>
      ) : (
        messages.map(message => (
          <div key={message.id} className="group">
            <MessageBubble
              message={message}
              onFeedback={positive => onFeedback?.(message.id, positive)}
              onCopy={() => onCopy?.(message.content)}
              onRetry={() => onRetry?.(message.id)}
            />
          </div>
        ))
      )}
    </div>
  );
};

export default CouncilThread;
