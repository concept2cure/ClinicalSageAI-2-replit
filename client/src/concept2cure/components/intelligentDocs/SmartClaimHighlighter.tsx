/**
 * Smart Claim Highlighter
 * 
 * Phase 5: Intelligent Document System
 * 
 * Visual highlighting of claims directly in the document editor.
 * Shows claim status (supported, needs source, unsupported) with
 * inline indicators that don't interrupt the writing flow.
 */

import React from 'react';
import { Mark, mergeAttributes } from '@tiptap/core';
import type { SmartClaim } from './types';

// ─────────────────────────────────────────────────────────────────────────────
// TipTap Extension for Claim Highlighting
// ─────────────────────────────────────────────────────────────────────────────

export const ClaimHighlightMark = Mark.create({
  name: 'claimHighlight',
  
  addOptions() {
    return {
      HTMLAttributes: {},
    };
  },
  
  addAttributes() {
    return {
      claimId: { default: null },
      claimType: { default: 'unknown' },
      sourceStatus: { default: 'needs-source' },
    };
  },
  
  parseHTML() {
    return [{ tag: 'span[data-claim-highlight]' }];
  },
  
  renderHTML({ HTMLAttributes }) {
    const { sourceStatus } = HTMLAttributes;
    
    const statusClasses = {
      supported: 'bg-green-100 border-b-2 border-green-500',
      'needs-source': 'bg-amber-100 border-b-2 border-amber-500 border-dashed',
      unsupported: 'bg-red-100 border-b-2 border-red-500',
    };
    
    return [
      'span',
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        'data-claim-highlight': 'true',
        class: `claim-highlight cursor-pointer transition-colors hover:opacity-80 ${
          statusClasses[sourceStatus as keyof typeof statusClasses] || statusClasses['needs-source']
        }`,
      }),
      0,
    ];
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Claim Indicator Component (Inline)
// ─────────────────────────────────────────────────────────────────────────────

export const ClaimIndicator: React.FC<{
  claim: SmartClaim;
  onClick: () => void;
  compact?: boolean;
}> = ({ claim, onClick, compact = true }) => {
  const statusConfig = {
    supported: { 
      color: 'bg-green-500', 
      label: '✓', 
      tooltip: 'Claim supported by source'
    },
    'needs-source': { 
      color: 'bg-amber-500 animate-pulse', 
      label: '!', 
      tooltip: 'Needs source reference'
    },
    unsupported: { 
      color: 'bg-red-500', 
      label: '✗', 
      tooltip: 'No matching source found'
    },
  };
  
  const config = statusConfig[claim.sourceStatus];
  
  if (compact) {
    return (
      <button
        onClick={onClick}
        title={config.tooltip}
        className={`inline-flex items-center justify-center w-4 h-4 ml-0.5 rounded-full text-white text-xs font-semibold ${config.color} hover:opacity-90 transition-opacity shadow-sm`}
        data-testid={`button-claim-indicator-${claim.id}`}
      >
        {config.label}
      </button>
    );
  }
  
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1 ml-1 px-1.5 py-0.5 rounded text-xs font-medium ${config.color} text-white hover:opacity-80 transition-opacity`}
      data-testid={`button-claim-indicator-${claim.id}`}
    >
      <span>{config.label}</span>
      <span className="hidden sm:inline">{claim.claimType}</span>
    </button>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Claim Summary Strip (Document Footer)
// ─────────────────────────────────────────────────────────────────────────────

export const ClaimSummaryStrip: React.FC<{
  claims: SmartClaim[];
  onClaimClick: (claim: SmartClaim) => void;
}> = ({ claims, onClaimClick }) => {
  const supported = claims.filter(c => c.sourceStatus === 'supported').length;
  const needsSource = claims.filter(c => c.sourceStatus === 'needs-source').length;
  const unsupported = claims.filter(c => c.sourceStatus === 'unsupported').length;
  
  if (claims.length === 0) return null;
  
  return (
    <div className="flex items-center justify-between px-4 py-2 bg-white border-t border-zinc-200 shadow-sm">
      <div className="flex items-center gap-4 text-sm">
        <span className="text-zinc-600">
          {claims.length} claims detected
        </span>
        
        {supported > 0 && (
          <span className="flex items-center gap-1 text-green-600">
            <span className="w-2 h-2 rounded-full bg-green-500" />
            {supported} sourced
          </span>
        )}
        
        {needsSource > 0 && (
          <button
            onClick={() => {
              const firstNeedsSource = claims.find(c => c.sourceStatus === 'needs-source');
              if (firstNeedsSource) onClaimClick(firstNeedsSource);
            }}
            className="flex items-center gap-1 text-amber-600 hover:underline"
            data-testid="button-claim-needs-source"
          >
            <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
            {needsSource} need sources
          </button>
        )}
        
        {unsupported > 0 && (
          <span className="flex items-center gap-1 text-red-600">
            <span className="w-2 h-2 rounded-full bg-red-500" />
            {unsupported} unsupported
          </span>
        )}
      </div>
      
      <div className="text-xs text-zinc-500">
        {Math.round((supported / claims.length) * 100)}% traceable
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Claim Tooltip (Appears on hover)
// ─────────────────────────────────────────────────────────────────────────────

export const ClaimTooltip: React.FC<{
  claim: SmartClaim;
  position: { x: number; y: number };
  onLinkClick: () => void;
  onDismiss: () => void;
}> = ({ claim, position, onLinkClick, onDismiss }) => {
  const claimTypeLabels = {
    efficacy: 'Efficacy Claim',
    safety: 'Safety Claim',
    design: 'Design Claim',
    regulatory: 'Regulatory Claim',
    clinical: 'Clinical Claim',
    statistical: 'Statistical Claim',
    manufacturing: 'Manufacturing Claim',
    comparison: 'Comparison Claim',
  };
  
  return (
    <div
      className="fixed z-50 w-72 p-3 bg-white rounded-lg shadow-xl border border-zinc-200"
      style={{
        left: position.x,
        top: position.y,
        transform: 'translate(-50%, -100%) translateY(-8px)',
      }}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-zinc-500">
          {claimTypeLabels[claim.claimType]}
        </span>
        <button
          onClick={onDismiss}
          className="p-1 text-zinc-400 hover:text-zinc-600"
          data-testid={`button-dismiss-claim-tooltip-${claim.id}`}
          aria-label="Dismiss claim tooltip"
        >
          ×
        </button>
      </div>
      
      <p className="text-sm text-zinc-700 mb-3 line-clamp-2">
        "{claim.text}"
      </p>
      
      {claim.sourceStatus === 'supported' ? (
        <div className="flex items-center gap-2 text-green-600 text-sm">
          <span className="w-2 h-2 rounded-full bg-green-500" />
          {claim.linkedSources.length} source{claim.linkedSources.length > 1 ? 's' : ''} linked
        </div>
      ) : (
        <button
          onClick={onLinkClick}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors duration-150"
          data-testid={`button-claim-link-source-${claim.id}`}
        >
          Link Source
        </button>
      )}
    </div>
  );
};

export default ClaimHighlightMark;
