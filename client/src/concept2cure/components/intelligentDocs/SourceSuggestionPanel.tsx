/**
 * Source Suggestion Panel
 * 
 * Phase 5: Intelligent Document System
 * 
 * AI-powered source suggestions that appear when claims need references.
 * Shows relevant sources from all connected modules with one-click linking.
 */

import React, { useState, useMemo } from 'react';
import type { SmartClaim, SourceSuggestion, DataBridgeConnection } from './types';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface SourceSuggestionPanelProps {
  claim: SmartClaim | null;
  suggestions: SourceSuggestion[];
  dataBridges: DataBridgeConnection[];
  onLinkSource: (claimId: string, sourceId: string) => void;
  onClose: () => void;
  isLoading?: boolean;
}

interface SourceCardProps {
  suggestion: SourceSuggestion;
  onLink: () => void;
  isLinking?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper Functions
// ─────────────────────────────────────────────────────────────────────────────

const getSourceIcon = (type: string): string => {
  const icons: Record<string, string> = {
    literature: '📚',
    predicate: '🔍',
    clinical_data: '🧪',
    cmc_data: '⚗️',
    vault: '📁',
    maude: '⚠️',
    faers: '💊',
    regulatory: '📋',
  };
  return icons[type] || '📄';
};

const getConfidenceColor = (confidence: number): string => {
  if (confidence >= 90) return 'text-green-600 bg-green-100';
  if (confidence >= 70) return 'text-blue-600 bg-blue-100';
  if (confidence >= 50) return 'text-amber-600 bg-amber-100';
  return 'text-stone-600 bg-stone-100';
};

// ─────────────────────────────────────────────────────────────────────────────
// Source Card Component
// ─────────────────────────────────────────────────────────────────────────────

const SourceCard: React.FC<SourceCardProps> = ({ suggestion, onLink, isLinking }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  
  return (
    <div className="border border-stone-200 rounded-lg overflow-hidden hover:border-blue-400 transition-colors duration-150">
      <div className="p-3">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex items-center gap-2">
            <span className="text-lg">{getSourceIcon(suggestion.sourceType)}</span>
            <span className="text-sm font-medium text-stone-900 line-clamp-1">
              {suggestion.sourceTitle}
            </span>
          </div>
          <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${getConfidenceColor(suggestion.matchConfidence)}`}>
            {suggestion.matchConfidence}%
          </span>
        </div>
        
        <p className="text-sm text-stone-600 line-clamp-2 mb-2">
          {suggestion.relevantExcerpt}
        </p>
        
        <div className="flex items-center justify-between">
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="text-xs text-blue-600 hover:underline"
            data-testid={`button-toggle-source-${suggestion.sourceId}`}
          >
            {isExpanded ? 'Show less' : 'Show more'}
          </button>
          
          <button
            onClick={onLink}
            disabled={isLinking}
            className="px-3 py-1 text-sm font-medium bg-stone-800 text-white rounded-lg hover:bg-stone-900 disabled:opacity-60 disabled:cursor-not-allowed transition-colors duration-150"
            data-testid={`button-link-source-${suggestion.sourceId}`}
          >
            {isLinking ? 'Linking...' : 'Link Source'}
          </button>
        </div>
        
        {isExpanded && (
          <div className="mt-3 pt-3 border-t border-stone-200">
            <div className="space-y-2 text-xs text-stone-500">
              <div className="flex items-center justify-between">
                <span>Source Type:</span>
                <span className="font-medium text-stone-700 capitalize">
                  {suggestion.sourceType.replace(/_/g, ' ')}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span>Match Reason:</span>
                <span className="font-medium text-stone-700">
                  {suggestion.matchReason}
                </span>
              </div>
            </div>
            
            <div className="mt-2 p-2 bg-stone-50 rounded text-xs text-stone-600">
              <p className="font-medium mb-1">Full Excerpt:</p>
              <p>{suggestion.relevantExcerpt}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Empty State Component
// ─────────────────────────────────────────────────────────────────────────────

const EmptyState: React.FC<{
  message: string;
  suggestion?: string;
  onAction?: () => void;
  actionLabel?: string;
}> = ({ message, suggestion, onAction, actionLabel }) => (
  <div className="text-center py-8">
    <div className="w-12 h-12 mx-auto mb-4 bg-stone-100 rounded-full flex items-center justify-center">
      <span className="text-base font-medium">🔎</span>
    </div>
    <p className="text-stone-600 mb-2">{message}</p>
    {suggestion && (
      <p className="text-sm text-stone-500 mb-4">{suggestion}</p>
    )}
    {onAction && actionLabel && (
      <button
        onClick={onAction}
        className="px-4 py-2 text-sm font-medium bg-stone-800 text-white rounded-lg hover:bg-stone-900 transition-colors duration-150"
        data-testid="button-empty-state-action"
      >
        {actionLabel}
      </button>
    )}
  </div>
);

// ─────────────────────────────────────────────────────────────────────────────
// Loading State Component
// ─────────────────────────────────────────────────────────────────────────────

const LoadingState: React.FC = () => (
  <div className="space-y-3 animate-pulse">
    {[1, 2, 3].map((i) => (
      <div key={i} className="border border-stone-200 rounded-lg p-3">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-6 h-6 bg-stone-200 rounded" />
          <div className="h-4 w-32 bg-stone-200 rounded" />
          <div className="ml-auto h-4 w-12 bg-stone-200 rounded-full" />
        </div>
        <div className="h-3 w-full bg-stone-200 rounded mb-1" />
        <div className="h-3 w-3/4 bg-stone-200 rounded" />
      </div>
    ))}
  </div>
);

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────

export const SourceSuggestionPanel: React.FC<SourceSuggestionPanelProps> = ({
  claim,
  suggestions,
  dataBridges,
  onLinkSource,
  onClose,
  isLoading = false,
}) => {
  const [linkingId, setLinkingId] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<string>('all');
  
  // Filter suggestions by source type
  const filteredSuggestions = useMemo(() => {
    if (filterType === 'all') return suggestions;
    return suggestions.filter(s => s.sourceType === filterType);
  }, [suggestions, filterType]);
  
  // Get unique source types for filter
  const sourceTypes = useMemo(() => {
    const types = new Set(suggestions.map(s => s.sourceType));
    return ['all', ...Array.from(types)];
  }, [suggestions]);
  
  // Get connected data bridges
  const connectedBridges = dataBridges.filter(b => b.status === 'connected' || b.status === 'synced');
  
  const handleLink = async (sourceId: string) => {
    if (!claim) return;
    
    setLinkingId(sourceId);
    try {
      await onLinkSource(claim.id, sourceId);
    } finally {
      setLinkingId(null);
    }
  };
  
  if (!claim) {
    return (
      <div className="h-full flex flex-col bg-white">
        <div className="p-4 border-b border-stone-200">
          <h3 className="font-semibold text-stone-900">
            Source Suggestions
          </h3>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <EmptyState
            message="Select a claim to see source suggestions"
            suggestion="Click on any highlighted claim in the document"
          />
        </div>
      </div>
    );
  }
  
  return (
    <div className="h-full flex flex-col bg-white">
      {/* Header */}
      <div className="p-4 border-b border-stone-200 bg-stone-50/60">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-stone-900">
            Source Suggestions
          </h3>
          <button
            onClick={onClose}
            className="p-1 text-stone-400 hover:text-stone-600"
            data-testid="button-close-source-panel"
            aria-label="Close source suggestions"
          >
            ×
          </button>
        </div>
        
        {/* Selected claim */}
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl">
          <p className="text-sm text-amber-800 line-clamp-2">
            "{claim.text}"
          </p>
          <span className="text-xs text-amber-600 capitalize">
            {claim.claimType} claim
          </span>
        </div>
      </div>
      
      {/* Filter tabs */}
      {sourceTypes.length > 2 && (
        <div className="px-4 pt-3 flex gap-1 overflow-x-auto">
          {sourceTypes.map(type => (
            <button
              key={type}
              onClick={() => setFilterType(type)}
              className={`px-3 py-1 text-xs font-medium rounded-full whitespace-nowrap transition-colors ${
                filterType === type
                  ? 'bg-stone-800 text-white'
                  : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
              }`}
              data-testid={`button-source-filter-${type}`}
              aria-current={filterType === type ? 'page' : undefined}
            >
              {type === 'all' ? 'All Sources' : type.replace(/_/g, ' ')}
            </button>
          ))}
        </div>
      )}
      
      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {isLoading ? (
          <LoadingState />
        ) : filteredSuggestions.length > 0 ? (
          <div className="space-y-3">
            {filteredSuggestions
              .sort((a, b) => b.matchConfidence - a.matchConfidence)
              .map(suggestion => (
                <SourceCard
                  key={suggestion.sourceId}
                  suggestion={suggestion}
                  onLink={() => handleLink(suggestion.sourceId)}
                  isLinking={linkingId === suggestion.sourceId}
                />
              ))}
          </div>
        ) : (
          <EmptyState
            message="No matching sources found"
            suggestion={
              connectedBridges.length < dataBridges.length
                ? "Try connecting more data sources for better matches"
                : "Consider adding manual citations or uploading relevant documents"
            }
          />
        )}
      </div>
      
      {/* Footer - Data bridge status */}
      <div className="p-4 border-t border-stone-200 bg-stone-50">
        <div className="flex items-center justify-between text-xs text-stone-500">
          <span>
            Searching {connectedBridges.length} connected source{connectedBridges.length !== 1 ? 's' : ''}
          </span>
          <div className="flex items-center gap-1">
            {connectedBridges.slice(0, 4).map(bridge => (
              <span
                key={bridge.moduleType}
                className="w-2 h-2 rounded-full bg-green-500"
                title={bridge.moduleType}
              />
            ))}
            {connectedBridges.length > 4 && (
              <span>+{connectedBridges.length - 4}</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Inline Suggestion Tooltip (for in-document suggestions)
// ─────────────────────────────────────────────────────────────────────────────

export const InlineSuggestionTooltip: React.FC<{
  suggestion: SourceSuggestion;
  position: { x: number; y: number };
  onLink: () => void;
  onDismiss: () => void;
}> = ({ suggestion, position, onLink, onDismiss }) => (
  <div
    className="fixed z-50 w-64 p-3 bg-white rounded-lg shadow border border-stone-200"
    style={{
      left: position.x,
      top: position.y,
      transform: 'translate(-50%, 8px)',
    }}
  >
    <div className="flex items-center justify-between mb-2">
      <div className="flex items-center gap-2">
        <span className="text-lg">{getSourceIcon(suggestion.sourceType)}</span>
        <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${getConfidenceColor(suggestion.matchConfidence)}`}>
          {suggestion.matchConfidence}% match
        </span>
      </div>
      <button
        onClick={onDismiss}
        className="p-1 text-stone-400 hover:text-stone-600"
        data-testid={`button-dismiss-inline-suggestion-${suggestion.sourceId}`}
        aria-label="Dismiss suggestion"
      >
        ×
      </button>
    </div>
    
    <p className="text-sm font-medium text-stone-900 mb-1 line-clamp-1">
      {suggestion.sourceTitle}
    </p>
    
    <p className="text-xs text-stone-600 mb-3 line-clamp-2">
      {suggestion.relevantExcerpt}
    </p>
    
    <button
      onClick={onLink}
      className="w-full px-3 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 transition-colors duration-150"
      data-testid={`button-link-inline-source-${suggestion.sourceId}`}
    >
      Link This Source
    </button>
  </div>
);

export default SourceSuggestionPanel;
