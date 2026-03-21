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
 *
 * Uses enterprise UI primitives for design consistency.
 */
import React from 'react';
import { cn } from '@/lib/utils';
import { ArrowRight, Upload, FolderPlus, ShieldCheck, MessageSquare, Zap } from 'lucide-react';
import { IconBox, EnterpriseButton } from '../ui/enterprise';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ActionCardDef {
  id: string;
  label: string;
  intent?: string;
  description?: string;
  primary?: { label: string; action: string; params?: Record<string, string> };
  secondary?: Array<{ label: string; action: string }>;
}

export interface ActionCardProps extends ActionCardDef {
  onSend?: (text: string) => void;
  onNavigate?: (path: string) => void;
  onNewProject?: () => void;
  onRunIntent?: (intent: string, label: string) => void;
  compact?: boolean;
  className?: string;
}

// ─── Intent → icon map ───────────────────────────────────────────────────────

function intentIcon(intent?: string): React.ElementType {
  if (!intent) return MessageSquare;
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
    const action = primary?.action || intent || '';

    if (action && (action === 'vault.open_upload' || action === 'vault.upload' || action.startsWith('vault'))) {
      onNavigate?.('/concept2cure?panel=vault');
      return;
    }
    if (action === 'project.new') {
      onNewProject?.();
      return;
    }
    onSend?.(intentToPrompt(action, primary?.label || label));
    onRunIntent?.(action, primary?.label || label);
  };

  if (compact) {
    return (
      <button
        onClick={handlePrimary}
        className={cn(
          'group inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium',
          'border border-zinc-200 bg-white text-zinc-700',
          'hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700',
          'transition-colors duration-150',
          'focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 outline-none',
          className,
        )}
      >
        <Icon className="w-4 h-4 text-zinc-400 group-hover:text-blue-500 transition-colors duration-150" />
        <span>{label}</span>
        <ArrowRight className="w-3.5 h-3.5 text-zinc-400 group-hover:text-blue-400 group-hover:translate-x-0.5 transition-all duration-150" />
      </button>
    );
  }

  return (
    <div className={cn(
      'rounded-xl border border-zinc-200 bg-white p-5 shadow-sm hover:shadow-md transition-shadow duration-150',
      className,
    )}>
      <div className="flex items-start gap-3">
        <IconBox icon={Icon} size="sm" className="bg-blue-50 text-blue-600" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-zinc-900">{label}</p>
          {description && (
            <p className="text-xs text-zinc-500 mt-0.5 leading-relaxed">{description}</p>
          )}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <EnterpriseButton
          variant="primary"
          iconRight={ArrowRight}
          onClick={handlePrimary}
          className="flex-1 sm:flex-none"
        >
          {primary?.label || label}
        </EnterpriseButton>

        {secondary?.map((s) => (
          <EnterpriseButton
            key={s.action}
            variant="secondary"
            onClick={() => onSend?.(intentToPrompt(s.action, s.label))}
          >
            {s.label}
          </EnterpriseButton>
        ))}
      </div>
    </div>
  );
};

export default ActionCard;
