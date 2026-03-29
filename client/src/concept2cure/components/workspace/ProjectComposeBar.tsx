/**
 * ProjectComposeBar — Canonical compose/action bar for project workspaces.
 *
 * A calm row of action mode chips that prepend intent context to the AnA chat.
 * Modes: Ask (default), Draft, Review, Compare.
 *
 * This does NOT replace the chat input. It sets the user's intent so AnA
 * can respond with the right framing. Selecting a mode and clicking it
 * fires onComposeAction with a contextual prompt prefix.
 */

import React, { useState, useCallback } from 'react';
import { cn } from '@/lib/utils';
import {
  MessageSquare,
  PenLine,
  Eye,
  Layers,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

export type ComposeMode = 'ask' | 'draft' | 'review' | 'compare';

interface ComposeModeOption {
  mode: ComposeMode;
  label: string;
  icon: React.ReactNode;
  /** Prompt prefix sent to AnA when mode is activated */
  promptPrefix: string;
}

export interface ProjectComposeBarProps {
  projectId: number;
  projectName: string;
  projectType: string;
  onComposeAction: (mode: string, prompt: string) => void;
}

// ─── Mode definitions ─────────────────────────────────────────────────────────

function getModes(projectType: string): ComposeModeOption[] {
  const typeLabel = projectType || 'submission';
  return [
    {
      mode: 'ask',
      label: 'Ask',
      icon: <MessageSquare className="w-3 h-3" />,
      promptPrefix: '',
    },
    {
      mode: 'draft',
      label: 'Draft',
      icon: <PenLine className="w-3 h-3" />,
      promptPrefix: `Draft a section or memo for this ${typeLabel}: `,
    },
    {
      mode: 'review',
      label: 'Review',
      icon: <Eye className="w-3 h-3" />,
      promptPrefix: `Review the current ${typeLabel} and identify gaps, risks, or issues: `,
    },
    {
      mode: 'compare',
      label: 'Compare',
      icon: <Layers className="w-3 h-3" />,
      promptPrefix: `Compare and analyze across documents or sections in this ${typeLabel}: `,
    },
  ];
}

// ─── Component ────────────────────────────────────────────────────────────────

export const ProjectComposeBar: React.FC<ProjectComposeBarProps> = ({
  projectId: _projectId,
  projectName: _projectName,
  projectType,
  onComposeAction,
}) => {
  const [activeMode, setActiveMode] = useState<ComposeMode | null>(null);
  const modes = getModes(projectType);

  const handleModeClick = useCallback(
    (option: ComposeModeOption) => {
      if (activeMode === option.mode) {
        // Deselect — toggle off
        setActiveMode(null);
        return;
      }

      setActiveMode(option.mode);

      // "Ask" mode has no prefix — just select it as active context
      if (option.mode === 'ask') {
        return;
      }

      // For action modes, fire the prompt prefix so AnA starts the flow
      onComposeAction(option.mode, option.promptPrefix);
    },
    [activeMode, onComposeAction],
  );

  return (
    <div
      className="flex items-center gap-1.5"
      role="toolbar"
      aria-label="Compose action modes"
      data-testid="project-compose-bar"
    >
      <span className="text-[10px] text-stone-400 mr-0.5 select-none">Mode</span>
      {modes.map((option) => {
        const isActive = activeMode === option.mode;
        return (
          <button
            key={option.mode}
            type="button"
            role="radio"
            aria-checked={isActive}
            aria-label={`${option.label} mode`}
            onClick={() => handleModeClick(option)}
            className={cn(
              'inline-flex items-center gap-1 px-2.5 py-1 rounded-lg',
              'text-[11px] font-medium tracking-tight',
              'transition-colors duration-150',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-400/40',
              isActive
                ? 'bg-stone-800 text-white shadow-sm'
                : 'text-stone-500 hover:text-stone-700 hover:bg-stone-100/80',
            )}
          >
            <span className={cn(
              'flex-shrink-0',
              isActive ? 'text-stone-300' : 'text-stone-400',
            )}>
              {option.icon}
            </span>
            {option.label}
          </button>
        );
      })}
    </div>
  );
};

export default ProjectComposeBar;
