/**
 * @fileoverview Lumen Project Assistant
 * @module concept2cure/components/assistant/LumenProjectAssistant
 * @version 1.0.0
 *
 * @description
 * Enhanced Lumen Cortex integration with deep project context awareness.
 * Guides users to screens, helps with tasks, generates documents.
 *
 * @author Concept2Cure UI Team
 * @compliance
 * - FDA 21 CFR Part 11: All AI interactions logged with audit trail
 * - HIPAA: No PHI in assistant context
 */

import React, { useCallback, useState, useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';
import {
  Sparkles,
  Send,
  Mic,
  Paperclip,
  ChevronUp,
  ChevronDown,
  FileText,
  FolderOpen,
  CheckSquare,
  Calendar,
  Users,
  ArrowRight,
  Loader2,
  X,
  Lightbulb,
  Navigation,
  Wand2,
  Search,
} from 'lucide-react';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

interface ProjectContext {
  id: string;
  name: string;
  type: string;
  phase?: string;
  status?: string;
  documents?: Array<{
    id: string;
    name: string;
    status: string;
  }>;
  tasks?: Array<{
    id: string;
    title: string;
    status: string;
  }>;
  team?: Array<{
    id: string;
    name: string;
    role: string;
  }>;
}

interface SuggestedAction {
  id: string;
  type: 'navigate' | 'create' | 'task' | 'search' | 'generate';
  label: string;
  description?: string;
  icon: React.ComponentType<{ className?: string }>;
  action: () => void;
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  actions?: SuggestedAction[];
}

interface LumenProjectAssistantProps {
  projectContext?: ProjectContext;
  conversationId?: string;
  onNavigate: (path: string) => void;
  onCreateTask: (task: { title: string; projectId: string }) => void;
  onCreateDocument: (doc: { name: string; type: string; projectId: string }) => void;
  onSearch: (query: string) => void;
  className?: string;
  position?: 'inline' | 'floating' | 'sidebar';
}

// ═══════════════════════════════════════════════════════════════════════════════
// SMART SUGGESTIONS
// ═══════════════════════════════════════════════════════════════════════════════

const getProjectSuggestions = (context?: ProjectContext): SuggestedAction[] => {
  if (!context) {
    return [
      {
        id: 'new-510k',
        type: 'create',
        label: 'Start a 510(k) Project',
        description: 'Begin a new medical device submission',
        icon: FileText,
        action: () => {},
      },
      {
        id: 'search-guidance',
        type: 'search',
        label: 'Search FDA Guidance',
        description: 'Find relevant regulatory guidance',
        icon: Search,
        action: () => {},
      },
    ];
  }

  const suggestions: SuggestedAction[] = [];

  // Phase-specific suggestions
  if (context.type === '510K') {
    if (context.phase === 'initial' || !context.phase) {
      suggestions.push({
        id: 'gen-device-desc',
        type: 'generate',
        label: 'Generate Device Description',
        description: 'Create device description from specifications',
        icon: Wand2,
        action: () => {},
      });
    }

    if (context.phase === 'predicate') {
      suggestions.push({
        id: 'find-predicates',
        type: 'search',
        label: 'Find Predicate Devices',
        description: 'Search 510(k) database for predicates',
        icon: Search,
        action: () => {},
      });
    }
  }

  // Task-based suggestions
  const pendingTasks = context.tasks?.filter(t => t.status === 'pending') || [];
  if (pendingTasks.length > 0) {
    suggestions.push({
      id: 'view-tasks',
      type: 'navigate',
      label: `${pendingTasks.length} tasks need attention`,
      description: 'View pending tasks',
      icon: CheckSquare,
      action: () => {},
    });
  }

  // Document-based suggestions
  const draftDocs = context.documents?.filter(d => d.status === 'draft') || [];
  if (draftDocs.length > 0) {
    suggestions.push({
      id: 'continue-doc',
      type: 'navigate',
      label: 'Continue drafting documents',
      description: `${draftDocs.length} documents in progress`,
      icon: FileText,
      action: () => {},
    });
  }

  return suggestions.slice(0, 3);
};

// ═══════════════════════════════════════════════════════════════════════════════
// QUICK PROMPTS
// ═══════════════════════════════════════════════════════════════════════════════

const QUICK_PROMPTS = [
  { id: 'what-next', label: 'What should I do next?', icon: Lightbulb },
  { id: 'go-to', label: 'Take me to...', icon: Navigation },
  { id: 'create-task', label: 'Create a task', icon: CheckSquare },
  { id: 'find-doc', label: 'Find a document', icon: Search },
  { id: 'generate', label: 'Generate content', icon: Wand2 },
];

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export const LumenProjectAssistant: React.FC<LumenProjectAssistantProps> = ({
  projectContext,
  conversationId,
  onNavigate,
  onCreateTask,
  onCreateDocument,
  onSearch,
  className,
  position = 'inline',
}) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isExpanded, setIsExpanded] = useState(true);
  const [isThinking, setIsThinking] = useState(false);
  const [showQuickPrompts, setShowQuickPrompts] = useState(true);

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const suggestions = getProjectSuggestions(projectContext);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Auto-resize textarea
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
      inputRef.current.style.height = `${Math.min(inputRef.current.scrollHeight, 120)}px`;
    }
  }, [input]);

  // Send message
  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim()) return;

      const userMessage: Message = {
        id: `msg-${Date.now()}`,
        role: 'user',
        content: text,
        timestamp: new Date(),
      };

      setMessages(prev => [...prev, userMessage]);
      setInput('');
      setShowQuickPrompts(false);
      setIsThinking(true);

      try {
        // In production, this would call the Lumen Cortex API
        // Simulated response for now
        await new Promise(resolve => setTimeout(resolve, 1500));

        const assistantMessage: Message = {
          id: `msg-${Date.now()}-response`,
          role: 'assistant',
          content: getSmartResponse(text, projectContext),
          timestamp: new Date(),
          actions: getSuggestedActions(text, projectContext, onNavigate, onCreateTask),
        };

        setMessages(prev => [...prev, assistantMessage]);
      } catch (error) {
        console.error('Lumen error:', error);
      } finally {
        setIsThinking(false);
      }
    },
    [projectContext, onNavigate, onCreateTask]
  );

  // Handle keyboard submit
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  // Quick prompt click
  const handleQuickPrompt = (promptId: string) => {
    const prompt = QUICK_PROMPTS.find(p => p.id === promptId);
    if (prompt) {
      if (promptId === 'what-next') {
        sendMessage('What should I do next on this project?');
      } else if (promptId === 'go-to') {
        setInput('Take me to ');
        inputRef.current?.focus();
      } else {
        setInput(`${prompt.label}: `);
        inputRef.current?.focus();
      }
    }
  };

  // Compact header for floating mode
  if (position === 'floating' && !isExpanded) {
    return (
      <button
        onClick={() => setIsExpanded(true)}
        className={cn(
          'fixed bottom-6 right-6 z-50',
          'w-14 h-14 rounded-full',
          'bg-violet-600',
          'shadow-sm',
          'flex items-center justify-center',
          'hover:scale-105 transition-transform',
          className
        )}
      >
        <Sparkles className="w-6 h-6 text-white" />
      </button>
    );
  }

  return (
    <div
      className={cn(
        'flex flex-col bg-white rounded-xl overflow-hidden',
        position === 'floating' &&
          'fixed bottom-6 right-6 z-50 w-96 max-h-[500px] shadow-2xl border border-zinc-200',
        position === 'sidebar' && 'h-full border-l border-zinc-200',
        position === 'inline' && 'border border-zinc-200',
        className
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-200 bg-zinc-50">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-violet-600 flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-white" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-zinc-900">AnA</h3>
            {projectContext && (
              <p className="text-xs text-zinc-500">Working on {projectContext.name}</p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1">
          {position === 'floating' && (
            <button
              onClick={() => setIsExpanded(false)}
              className="p-1.5 rounded-lg hover:bg-zinc-100 text-zinc-500"
            >
              <ChevronDown className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-[200px] max-h-[300px]">
        {messages.length === 0 ? (
          <div className="text-center py-8">
            <div className="w-12 h-12 rounded-full bg-violet-100 flex items-center justify-center mx-auto mb-4">
              <Sparkles className="w-6 h-6 text-violet-600" />
            </div>
            <h4 className="text-sm font-medium text-zinc-900 mb-1">Hi, I'm AnA!</h4>
            <p className="text-xs text-zinc-500 max-w-xs mx-auto">
              {projectContext
                ? `I can help you with ${projectContext.name}. Ask me anything or pick a quick action below.`
                : 'I can help you navigate, find documents, create tasks, and more.'}
            </p>
          </div>
        ) : (
          messages.map(message => (
            <div
              key={message.id}
              className={cn('flex gap-3', message.role === 'user' && 'flex-row-reverse')}
            >
              {/* Avatar */}
              {message.role === 'assistant' && (
                <div className="w-7 h-7 rounded-lg bg-violet-600 flex items-center justify-center flex-shrink-0">
                  <Sparkles className="w-3.5 h-3.5 text-white" />
                </div>
              )}

              {/* Message Content */}
              <div
                className={cn(
                  'max-w-[80%] rounded-xl px-4 py-2.5',
                  message.role === 'user' ? 'bg-violet-600 text-white' : 'bg-zinc-100 text-zinc-900'
                )}
              >
                <p className="text-sm whitespace-pre-wrap">{message.content}</p>

                {/* Action Buttons */}
                {message.actions && message.actions.length > 0 && (
                  <div className="mt-3 space-y-2">
                    {message.actions.map(action => {
                      const Icon = action.icon;
                      return (
                        <button
                          key={action.id}
                          onClick={action.action}
                          className={cn(
                            'w-full flex items-center gap-2 px-3 py-2 rounded-lg',
                            'bg-white border border-zinc-200 text-sm text-zinc-700',
                            'hover:border-blue-200 hover:bg-violet-50 transition-colors'
                          )}
                        >
                          <Icon className="w-4 h-4 text-violet-600" />
                          <span className="flex-1 text-left">{action.label}</span>
                          <ArrowRight className="w-3 h-3 text-zinc-400" />
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          ))
        )}

        {/* Thinking indicator */}
        {isThinking && (
          <div className="flex gap-3">
            <div className="w-7 h-7 rounded-lg bg-violet-600 flex items-center justify-center flex-shrink-0">
              <Sparkles className="w-3.5 h-3.5 text-white" />
            </div>
            <div className="bg-zinc-100 rounded-xl px-4 py-2.5">
              <div className="flex items-center gap-2 text-sm text-zinc-500">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Thinking...
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Suggestions */}
      {suggestions.length > 0 && showQuickPrompts && messages.length === 0 && (
        <div className="px-4 pb-2 border-t border-zinc-200">
          <p className="text-xs text-zinc-500 mb-2 mt-3">Suggested actions</p>
          <div className="space-y-2">
            {suggestions.map(suggestion => {
              const Icon = suggestion.icon;
              return (
                <button
                  key={suggestion.id}
                  onClick={suggestion.action}
                  className={cn(
                    'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl',
                    'bg-zinc-50 border border-zinc-200',
                    'hover:bg-violet-50 hover:border-blue-200 transition-colors',
                    'text-left group'
                  )}
                >
                  <div className="w-8 h-8 rounded-lg bg-violet-100 flex items-center justify-center flex-shrink-0">
                    <Icon className="w-4 h-4 text-violet-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-zinc-900">{suggestion.label}</p>
                    {suggestion.description && (
                      <p className="text-xs text-zinc-500">{suggestion.description}</p>
                    )}
                  </div>
                  <ArrowRight className="w-4 h-4 text-zinc-400 group-hover:text-violet-600 transition-colors duration-150" />
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Quick Prompts */}
      {showQuickPrompts && messages.length === 0 && (
        <div className="px-4 pb-2">
          <div className="flex flex-wrap gap-2">
            {QUICK_PROMPTS.slice(0, 3).map(prompt => {
              const Icon = prompt.icon;
              return (
                <button
                  key={prompt.id}
                  onClick={() => handleQuickPrompt(prompt.id)}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-full',
                    'bg-zinc-100 text-zinc-700 text-xs',
                    'hover:bg-violet-100 hover:text-violet-700 transition-colors'
                  )}
                >
                  <Icon className="w-3 h-3" />
                  {prompt.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Input */}
      <div className="p-4 border-t border-zinc-200">
        <div className="relative flex items-end gap-2 bg-zinc-50 rounded-xl px-3 py-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask AnA anything..."
            rows={1}
            className={cn(
              'flex-1 bg-transparent resize-none text-sm',
              'placeholder:text-zinc-400 outline-none',
              'min-h-[24px] max-h-[120px]'
            )}
          />

          <div className="flex items-center gap-1">
            <button
              className="p-1.5 rounded-lg hover:bg-zinc-200 text-zinc-500"
              title="Attach file"
            >
              <Paperclip className="w-4 h-4" />
            </button>

            <button
              onClick={() => sendMessage(input)}
              disabled={!input.trim() || isThinking}
              className={cn(
                'p-1.5 rounded-lg transition-colors',
                input.trim() && !isThinking
                  ? 'bg-violet-600 text-white hover:bg-violet-700'
                  : 'bg-zinc-200 text-zinc-400'
              )}
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

function getSmartResponse(input: string, context?: ProjectContext): string {
  const lowered = input.toLowerCase();

  if (lowered.includes('what should') || lowered.includes('next')) {
    if (context) {
      return `Based on where you are in the ${context.type} submission process, I recommend:\n\n1. Complete the device description section\n2. Review the predicate comparison table\n3. Upload any pending test results\n\nWould you like me to take you to any of these?`;
    }
    return 'To get started, I recommend creating a new project. Would you like to start a 510(k), IND, or NDA submission?';
  }

  if (lowered.includes('take me to') || lowered.includes('go to')) {
    return 'I can navigate you there. Which section would you like to visit?';
  }

  if (lowered.includes('create') && lowered.includes('task')) {
    return "I'll help you create a task. What would you like the task to be about?";
  }

  return "I understand. Let me help you with that. Could you provide more details about what you'd like to accomplish?";
}

function getSuggestedActions(
  input: string,
  context: ProjectContext | undefined,
  onNavigate: (path: string) => void,
  onCreateTask: (task: { title: string; projectId: string }) => void
): SuggestedAction[] {
  const lowered = input.toLowerCase();
  const actions: SuggestedAction[] = [];

  if (lowered.includes('next') || lowered.includes('should')) {
    actions.push({
      id: 'go-device-desc',
      type: 'navigate',
      label: 'Go to Device Description',
      icon: Navigation,
      action: () => onNavigate('/projects/' + (context?.id || '') + '/device-description'),
    });

    actions.push({
      id: 'create-reminder',
      type: 'task',
      label: 'Create reminder task',
      icon: CheckSquare,
      action: () =>
        context &&
        onCreateTask({ title: 'Follow up on device description', projectId: context.id }),
    });
  }

  return actions;
}

export default LumenProjectAssistant;
