/**
 * Cortex Search Panel Component
 *
 * Semantic search interface for querying the Cortex knowledge graph.
 * Provides real-time search with type filtering and relevance scoring.
 *
 * @module portal-v2/components/cortex/CortexSearchPanel
 */

import React, { useState, useCallback, useMemo } from 'react';
import {
  Search,
  Filter,
  X,
  Loader2,
  FileText,
  Lightbulb,
  BookOpen,
  AlertCircle,
} from 'lucide-react';
import { useCortexSearch, useCortexHealth, type CortexSearchResult } from '../../hooks/useCortex';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

interface CortexSearchPanelProps {
  /** Callback when a search result is selected */
  onResultSelect?: (result: CortexSearchResult) => void;
  /** Initial search query */
  initialQuery?: string;
  /** Custom placeholder text */
  placeholder?: string;
  /** Show filters panel */
  showFilters?: boolean;
  /** Maximum results to display */
  maxResults?: number;
  /** CSS class name */
  className?: string;
}

type AtomType = 'fact' | 'concept' | 'rule' | 'procedure' | 'reference' | 'all';

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

const ATOM_TYPE_CONFIG: Record<
  AtomType,
  { label: string; icon: React.ElementType; color: string }
> = {
  all: { label: 'All Types', icon: Search, color: '#6366f1' },
  fact: { label: 'Facts', icon: FileText, color: '#059669' },
  concept: { label: 'Concepts', icon: Lightbulb, color: '#d97706' },
  rule: { label: 'Rules', icon: BookOpen, color: '#dc2626' },
  procedure: { label: 'Procedures', icon: FileText, color: '#0891b2' },
  reference: { label: 'References', icon: BookOpen, color: '#7c3aed' },
};

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export function CortexSearchPanel({
  onResultSelect,
  initialQuery = '',
  placeholder = 'Search regulatory knowledge...',
  showFilters = true,
  maxResults = 10,
  className = '',
}: CortexSearchPanelProps) {
  // State
  const [query, setQuery] = useState(initialQuery);
  const [selectedType, setSelectedType] = useState<AtomType>('all');
  const [isFilterOpen, setIsFilterOpen] = useState(false);

  // Hooks
  const { data: health } = useCortexHealth();
  const { results, isLoading, error, search, clearResults } = useCortexSearch({
    minQueryLength: 3,
    debounceMs: 300,
  });

  // Handlers
  const handleSearch = useCallback(
    (value: string) => {
      setQuery(value);
      if (value.length >= 3) {
        search(value, {
          type: selectedType === 'all' ? undefined : selectedType,
          limit: maxResults,
        });
      } else {
        clearResults();
      }
    },
    [search, clearResults, selectedType, maxResults]
  );

  const handleClear = useCallback(() => {
    setQuery('');
    clearResults();
  }, [clearResults]);

  const handleTypeFilter = useCallback(
    (type: AtomType) => {
      setSelectedType(type);
      if (query.length >= 3) {
        search(query, {
          type: type === 'all' ? undefined : type,
          limit: maxResults,
        });
      }
    },
    [query, search, maxResults]
  );

  const handleResultClick = useCallback(
    (result: CortexSearchResult) => {
      onResultSelect?.(result);
    },
    [onResultSelect]
  );

  // Computed
  const filteredResults = useMemo(() => {
    if (!results) return [];
    return results.slice(0, maxResults);
  }, [results, maxResults]);

  const isServiceHealthy = health?.status === 'healthy';

  return (
    <div className={`cortex-search-panel ${className}`}>
      {/* Search Input */}
      <div className="relative">
        <div className="flex items-center gap-2 px-4 py-3 bg-white border border-gray-200 rounded-lg shadow-sm focus-within:ring-2 focus-within:ring-indigo-500 focus-within:border-indigo-500">
          <Search className="w-5 h-5 text-gray-400" />
          <input
            type="text"
            value={query}
            onChange={e => handleSearch(e.target.value)}
            placeholder={placeholder}
            className="flex-1 bg-transparent border-none outline-none text-gray-900 placeholder-gray-500"
            disabled={!isServiceHealthy}
          />
          {isLoading && <Loader2 className="w-5 h-5 text-indigo-500 animate-spin" />}
          {query && !isLoading && (
            <button
              onClick={handleClear}
              className="p-1 hover:bg-gray-100 rounded"
              aria-label="Clear search"
            >
              <X className="w-4 h-4 text-gray-400" />
            </button>
          )}
          {showFilters && (
            <button
              onClick={() => setIsFilterOpen(!isFilterOpen)}
              className={`p-1 rounded ${isFilterOpen ? 'bg-indigo-100 text-indigo-600' : 'hover:bg-gray-100 text-gray-400'}`}
              aria-label="Toggle filters"
            >
              <Filter className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Service Status Warning */}
        {!isServiceHealthy && (
          <div className="mt-2 flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-amber-700 text-sm">
            <AlertCircle className="w-4 h-4" />
            <span>Cortex service is currently unavailable</span>
          </div>
        )}

        {/* Filters */}
        {showFilters && isFilterOpen && (
          <div className="absolute top-full left-0 right-0 mt-2 p-3 bg-white border border-gray-200 rounded-lg shadow-lg z-10">
            <div className="text-xs font-medium text-gray-500 mb-2">Filter by type</div>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(ATOM_TYPE_CONFIG) as AtomType[]).map(type => {
                const config = ATOM_TYPE_CONFIG[type];
                const Icon = config.icon;
                return (
                  <button
                    key={type}
                    onClick={() => handleTypeFilter(type)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm transition-colors ${
                      selectedType === type
                        ? 'bg-indigo-100 text-indigo-700 font-medium'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" style={{ color: config.color }} />
                    <span>{config.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Error State */}
      {error && (
        <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
          <div className="flex items-center gap-2 text-red-700">
            <AlertCircle className="w-5 h-5" />
            <span className="font-medium">Search error</span>
          </div>
          <p className="mt-1 text-sm text-red-600">{error.message}</p>
        </div>
      )}

      {/* Results */}
      {filteredResults.length > 0 && (
        <div className="mt-4 space-y-2">
          <div className="text-xs font-medium text-gray-500">
            {filteredResults.length} result{filteredResults.length !== 1 ? 's' : ''} found
          </div>
          <div className="space-y-2">
            {filteredResults.map(result => {
              const typeConfig =
                ATOM_TYPE_CONFIG[result.atom.type as AtomType] || ATOM_TYPE_CONFIG.fact;
              const Icon = typeConfig.icon;
              return (
                <button
                  key={result.atom.id}
                  onClick={() => handleResultClick(result)}
                  className="w-full text-left p-4 bg-white border border-gray-200 rounded-lg hover:border-indigo-300 hover:shadow-sm transition-all"
                >
                  <div className="flex items-start gap-3">
                    <div
                      className="p-2 rounded-lg"
                      style={{ backgroundColor: `${typeConfig.color}15` }}
                    >
                      <Icon className="w-4 h-4" style={{ color: typeConfig.color }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span
                          className="text-xs font-medium px-2 py-0.5 rounded"
                          style={{
                            backgroundColor: `${typeConfig.color}15`,
                            color: typeConfig.color,
                          }}
                        >
                          {typeConfig.label}
                        </span>
                        <span className="text-xs text-gray-400">
                          {Math.round(result.score * 100)}% match
                        </span>
                      </div>
                      <p className="text-sm text-gray-900 line-clamp-2">{result.atom.content}</p>
                      {result.atom.metadata?.source && (
                        <p className="mt-1 text-xs text-gray-500">
                          Source: {result.atom.metadata.source as string}
                        </p>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Empty State */}
      {query.length >= 3 && !isLoading && filteredResults.length === 0 && !error && (
        <div className="mt-4 p-8 text-center">
          <Search className="w-12 h-12 mx-auto text-gray-300 mb-3" />
          <p className="text-gray-500">No results found for "{query}"</p>
          <p className="text-sm text-gray-400 mt-1">Try different keywords or remove filters</p>
        </div>
      )}

      {/* Hint */}
      {query.length > 0 && query.length < 3 && (
        <div className="mt-2 text-xs text-gray-500">Type at least 3 characters to search</div>
      )}
    </div>
  );
}

export default CortexSearchPanel;
