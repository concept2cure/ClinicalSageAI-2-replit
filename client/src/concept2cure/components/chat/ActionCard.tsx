/**
 * ActionCard — chat-native suggested action buttons
 *
 * Shown:
 * 1. In the chat welcome screen (seeded from workspace summary nextActions)
 * 2. Below specific assistant messages that include an action payload
 *
 * Intent → behaviour map:
 *   chat.new          → prefill the chat input with a default message
 *   vault.upload      → route to /concept2cure?panel=vault
 *   project.new       → calls onNewProject callback
 *   validation.run    → prefill chat with "Run a regulatory validation on…"
 *   workflow.*        → prefill chat with workflow startup prompt
 */
import React from 'react';
import { cn } from '@/lib/utils';
import { ArrowRight, Upload, FolderPlus, ShieldCheck, MessageSquare, Zap } from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ActionCardDef {
  id: string;
  label: string;
  intent: string;
  description?: string;
  primary?: { label: string; action: string; params?: Record<string, string> };
  secondary?: Array<{ label: string; action: string }>;
}

export interface ActionCardProps extends ActionCardDef {
  onSend?: (text: string) => void;
  onNavigate?: (path: string) => void;
  onNewProject?: () => void;
  /** Called with the intent string after non-navigate/project actions fire — triggers server action + cache invalidation */
  onRunIntent?: (intent: string) => void;
  compact?: boolean;
  className?: string;
}

// ─── Intent → icon map ───────────────────────────────────────────────────────

function intentIcon(intent: string): React.ElementType {
  if (intent.startsWith('vault')) return Upload;
  if (intent.startsWith('project')) return FolderPlus;
  if (intent.startsWith('validation')) return ShieldCheck;
  if (intent.startsWith('workflow')) return Zap;
  return MessageSquare;
}

// ─── Intent → chat prompt map ────────────────────────────────────────────────

function intentToPrompt(intent: string, label: string): string {
  switch (intent) {
    case 'chat.new':
      return 'What are the regulatory requirements for my submission type?';
    case 'vault.upload':
      return 'How should I organize my documents for a 510(k) submission?';
    case 'project.new':
      return 'Help me set up a new 510(k) project structure.';
    case 'validation.run':
      return 'Run a regulatory completeness check on my current project.';
    case 'workflow.510k.start':
      return 'Help me start a 510(k) submission from scratch.';
    case 'workflow.510k.generate_outline':
      return 'Generate a 510(k) eSTAR-aligned submission outline for my project.';
    case 'workflow.ind.start':
      return 'Help me prepare an IND application structure.';
    case 'workflow.cer.start':
      return 'Guide me through a Clinical Evaluation Report.';
    default:
      return label;
  }
}

// ─── Component ───────────────────────────────────────────────────────────────

export const ActionCard: React.FC<ActionCardProps> = ({
  id,
  label,
  intent,
  description,
  primary,
  secondary,
  onSend,
  onNavigate,
  onNewProject,
  onRunIntent,
  compact = false,
  className,
}) => {
  const Icon = intentIcon(intent);

  const handlePrimary = () => {
    const action = primary?.action || intent;

    if (action === 'vault.open_upload' || action === 'vault.upload' || action.startsWith('vault')) {
      onNavigate?.('/concept2cure?panel=vault');
      return;
    }
    if (action === 'project.new') {
      onNewProject?.();
      return;
    }
    // Default: send a prompt to the chat, and fire the server action for state mutation
    onSend?.(intentToPrompt(action, primary?.label || label));
    onRunIntent?.(action);
  };

  if (compact) {
    // Compact pill — used in the WelcomeScreen suggestion row
    return (
      <button
        onClick={handlePrimary}
        className={cn(
          'group inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium',
          'border border-zinc-200 bg-white text-zinc-700',
          'hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 transition-all duration-150',
          className
        )}
      >
        <Icon className="w-4 h-4 text-zinc-400 group-hover:text-blue-500 transition-colors" />
        <span>{label}</span>
        <ArrowRight className="w-3.5 h-3.5 text-zinc-300 group-hover:text-blue-400 group-hover:translate-x-0.5 transition-all" />
      </button>
    );
  }

  // Full card
  return (
    <div
      className={cn(
        'rounded-xl border border-zinc-200 bg-white p-4 shadow-sm hover:shadow-md transition-shadow',
        className
      )}
    >
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center mt-0.5">
          <Icon className="w-4 h-4 text-blue-600" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-zinc-900">{label}</p>
          {description && (
            <p className="text-xs text-zinc-500 mt-0.5 leading-relaxed">{description}</p>
          )}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          onClick={handlePrimary}
          className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors"
        >
          {primary?.label || label}
          <ArrowRight className="w-3.5 h-3.5" />
        </button>

        {secondary?.map(s => (
          <button
            key={s.action}
            onClick={() => onSend?.(intentToPrompt(s.action, s.label))}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-zinc-200 bg-white text-zinc-700 text-sm font-medium hover:bg-zinc-50 transition-colors"
          >
            {s.label}
          </button>
        ))}
      </div>
    </div>
  );
};

export default ActionCard;
