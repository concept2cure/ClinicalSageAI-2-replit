/**
 * WorkspaceTopBar — Compact breadcrumb bar with project label and context toggle.
 * Extracted from ProjectWorkspaceShell.
 */

import React from 'react';
import { ChevronLeft, ChevronUp, ChevronDown, Brain } from 'lucide-react';

export interface WorkspaceTopBarProps {
  projectType?: string;
  projectName?: string;
  mode: 'dashboard' | 'browse' | 'edit';
  selectedDocId?: string;
  showContextBars: boolean;
  onBackToProjects: () => void;
  onNavigateHome: () => void;
  onNavigateFiles: () => void;
  onToggleContextBars: () => void;
  onSwitchToIntelligence?: () => void;
}

export const WorkspaceTopBar: React.FC<WorkspaceTopBarProps> = ({
  projectType,
  projectName,
  mode,
  selectedDocId,
  showContextBars,
  onBackToProjects,
  onNavigateHome,
  onNavigateFiles,
  onToggleContextBars,
  onSwitchToIntelligence,
}) => {
  return (
    <div className="flex items-center gap-2.5 px-4 h-10 border-b border-stone-150 bg-white shrink-0">
      <button
        onClick={onBackToProjects}
        className="flex items-center gap-1 text-xs text-stone-400 hover:text-stone-700 transition-colors duration-150"
        aria-label="Back to projects"
      >
        <ChevronLeft className="w-3.5 h-3.5" />
      </button>
      {projectType && (
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-stone-100 text-stone-500 font-medium uppercase tracking-tight flex-shrink-0">
          {projectType}
        </span>
      )}
      <span className="text-[14px] font-semibold text-stone-800 truncate">
        {projectName || 'Untitled Project'}
      </span>
      {(mode === 'edit' || mode === 'browse') && (
        <div className="flex items-center gap-1.5 text-stone-300">
          <span>/</span>
          <button
            onClick={onNavigateHome}
            className="text-[11px] text-stone-500 hover:text-stone-700 font-medium transition-colors"
          >
            Home
          </button>
          {mode === 'edit' && selectedDocId && (
            <>
              <span>/</span>
              <button
                onClick={onNavigateFiles}
                className="text-[11px] text-stone-500 hover:text-stone-700 font-medium transition-colors"
              >
                Files
              </button>
            </>
          )}
        </div>
      )}
      {/* Spacer */}
      <div className="flex-1" />
      {/* Intelligence link — subtle, not a toggle */}
      {onSwitchToIntelligence && (
        <button
          onClick={onSwitchToIntelligence}
          className="text-[11px] font-medium text-stone-400 hover:text-stone-600 transition-colors flex items-center gap-1"
        >
          <Brain className="w-3 h-3" />
          Intelligence
        </button>
      )}
      {/* Context bars expand/collapse */}
      <button
        onClick={onToggleContextBars}
        className="flex items-center justify-center w-5 h-5 rounded text-stone-300 hover:text-stone-600 hover:bg-stone-100 transition-colors"
        title={showContextBars ? 'Hide advanced controls' : 'Show workflow controls'}
        aria-label={showContextBars ? 'Hide advanced controls' : 'Show workflow controls'}
      >
        {showContextBars ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
      </button>
    </div>
  );
};
