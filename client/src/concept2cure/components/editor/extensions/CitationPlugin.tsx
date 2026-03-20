/**
 * CitationPlugin — TipTap extension for smart citation insertion.
 *
 * Triggered by typing `[@` in the editor or using `/cite` slash command.
 * Searches project artifacts and CSR data, inserts formatted [Author, Year]
 * citations with traceability data attributes for regulatory compliance.
 */

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Extension, Mark, mergeAttributes, type Editor } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { BookOpen, Search, X, ExternalLink, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

// ── Types ────────────────────────────────────────────────────────────────────

export interface CitationResult {
  id: string;
  title: string;
  authors: string[];
  year: number | string;
  sourceType: 'csr' | 'artifact' | 'literature' | 'regulatory';
  sourceId: string;
  doi?: string;
  url?: string;
  snippet?: string;
}

interface CitationSearchResponse {
  results: CitationResult[];
  total: number;
}

interface CitationSearchPanelProps {
  editor: Editor;
  isOpen: boolean;
  onClose: () => void;
  projectId: string | number;
}

// ── Auth helper ──────────────────────────────────────────────────────────────

function getAuthToken(): string | null {
  return (
    sessionStorage.getItem('trialsage_access_token') ||
    localStorage.getItem('trialsage_access_token')
  );
}

// ── API ──────────────────────────────────────────────────────────────────────

async function searchCitations(
  query: string,
  projectId: string | number,
  limit = 10
): Promise<CitationSearchResponse> {
  const token = getAuthToken();
  const response = await fetch('/api/concept2cure/ai/citation-search', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ query, projectId, limit }),
  });

  if (!response.ok) {
    throw new Error(`Citation search failed: ${response.statusText}`);
  }

  return response.json();
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatCitationLabel(result: CitationResult): string {
  const firstAuthor = result.authors?.[0]?.split(',')[0]?.trim() ?? 'Unknown';
  const etAl = result.authors?.length > 1 ? ' et al.' : '';
  return `[${firstAuthor}${etAl}, ${result.year}]`;
}

function sourceTypeLabel(type: CitationResult['sourceType']): string {
  const labels: Record<CitationResult['sourceType'], string> = {
    csr: 'CSR',
    artifact: 'Artifact',
    literature: 'Literature',
    regulatory: 'Regulatory',
  };
  return labels[type] ?? type;
}

function sourceTypeBadgeClass(type: CitationResult['sourceType']): string {
  const classes: Record<CitationResult['sourceType'], string> = {
    csr: 'bg-violet-100 text-violet-700',
    artifact: 'bg-blue-100 text-blue-700',
    literature: 'bg-zinc-100 text-zinc-700',
    regulatory: 'bg-amber-100 text-amber-700',
  };
  return classes[type] ?? 'bg-zinc-100 text-zinc-600';
}

// ── Citation Mark ────────────────────────────────────────────────────────────

export const CitationMark = Mark.create({
  name: 'citation',

  addAttributes() {
    return {
      citationId: { default: null },
      sourceType: { default: null },
      sourceId: { default: null },
      authors: { default: null },
      year: { default: null },
      title: { default: null },
      doi: { default: null },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-citation]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        'data-citation': HTMLAttributes.citationId ?? 'true',
        'data-citation-source': HTMLAttributes.sourceType,
        'data-citation-source-id': HTMLAttributes.sourceId,
        class:
          'citation-mark inline-flex items-center px-1 py-0.5 rounded ' +
          'bg-blue-50 text-blue-700 border border-blue-200 ' +
          'hover:bg-blue-100 cursor-pointer text-sm font-medium ' +
          'transition-colors',
      }),
      0,
    ];
  },
});

// ── ProseMirror Plugin ([@  trigger detection) ──────────────────────────────

const citationPluginKey = new PluginKey('citationTrigger');

interface CitationPluginState {
  active: boolean;
  query: string;
  from: number;
  to: number;
}

function createCitationTriggerPlugin(onTrigger: (state: CitationPluginState) => void) {
  return new Plugin<CitationPluginState>({
    key: citationPluginKey,

    state: {
      init(): CitationPluginState {
        return { active: false, query: '', from: 0, to: 0 };
      },

      apply(tr, prev): CitationPluginState {
        const meta = tr.getMeta(citationPluginKey);
        if (meta?.deactivate) {
          return { active: false, query: '', from: 0, to: 0 };
        }

        if (!tr.docChanged && !meta) return prev;

        const { selection } = tr;
        const { $from } = selection;
        const textBefore = $from.parent.textContent.slice(0, $from.parentOffset);

        // Look for `[@` trigger — capture everything after it as the query
        const triggerMatch = textBefore.match(/\[@([^\]]*)$/);

        if (triggerMatch) {
          const query = triggerMatch[1];
          const from = $from.pos - query.length - 2; // 2 = length of `[@`
          const to = $from.pos;
          const state: CitationPluginState = { active: true, query, from, to };
          // Notify the React layer
          setTimeout(() => onTrigger(state), 0);
          return state;
        }

        if (prev.active) {
          const deactivated: CitationPluginState = { active: false, query: '', from: 0, to: 0 };
          setTimeout(() => onTrigger(deactivated), 0);
          return deactivated;
        }

        return prev;
      },
    },

    props: {
      decorations(state) {
        const pluginState = citationPluginKey.getState(state) as CitationPluginState | undefined;
        if (!pluginState?.active) return DecorationSet.empty;

        // Highlight the trigger text while searching
        const deco = Decoration.inline(pluginState.from, pluginState.to, {
          class: 'bg-blue-50 rounded px-0.5',
        });

        return DecorationSet.create(state.doc, [deco]);
      },
    },
  });
}

// ── CitationSearchPanel (React component) ────────────────────────────────────

export function CitationSearchPanel({
  editor,
  isOpen,
  onClose,
  projectId,
}: CitationSearchPanelProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<CitationResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Focus input on open
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setResults([]);
      setError(null);
      setSelectedIndex(0);
      // Small delay to allow DOM to render
      const t = setTimeout(() => inputRef.current?.focus(), 50);
      return () => clearTimeout(t);
    }
  }, [isOpen]);

  // Debounced search
  const doSearch = useCallback(
    (searchQuery: string) => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);

      if (!searchQuery.trim()) {
        setResults([]);
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      debounceTimer.current = setTimeout(async () => {
        try {
          const data = await searchCitations(searchQuery, projectId, 10);
          setResults(data.results);
          setSelectedIndex(0);
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Search failed');
          setResults([]);
        } finally {
          setLoading(false);
        }
      }, 300);
    },
    [projectId]
  );

  useEffect(() => {
    doSearch(query);
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [query, doSearch]);

  // Scroll selected item into view
  useEffect(() => {
    if (!listRef.current) return;
    const selected = listRef.current.querySelector('[data-selected="true"]');
    selected?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  // Insert citation into the editor
  const insertCitation = useCallback(
    (result: CitationResult) => {
      const label = formatCitationLabel(result);

      // Get the trigger state to know what to replace
      const pluginState = citationPluginKey.getState(editor.state) as
        | CitationPluginState
        | undefined;

      if (pluginState?.active) {
        // Replace the `[@query` trigger text with the citation
        editor
          .chain()
          .focus()
          .deleteRange({ from: pluginState.from, to: pluginState.to })
          .insertContent({
            type: 'text',
            marks: [
              {
                type: 'citation',
                attrs: {
                  citationId: result.id,
                  sourceType: result.sourceType,
                  sourceId: result.sourceId,
                  authors: JSON.stringify(result.authors),
                  year: String(result.year),
                  title: result.title,
                  doi: result.doi ?? null,
                },
              },
            ],
            text: label,
          })
          .run();

        // Deactivate the plugin
        editor.view.dispatch(
          editor.state.tr.setMeta(citationPluginKey, { deactivate: true })
        );
      } else {
        // Insert at current cursor position (opened via panel, not trigger)
        editor
          .chain()
          .focus()
          .insertContent({
            type: 'text',
            marks: [
              {
                type: 'citation',
                attrs: {
                  citationId: result.id,
                  sourceType: result.sourceType,
                  sourceId: result.sourceId,
                  authors: JSON.stringify(result.authors),
                  year: String(result.year),
                  title: result.title,
                  doi: result.doi ?? null,
                },
              },
            ],
            text: label,
          })
          .run();
      }

      onClose();
    },
    [editor, onClose]
  );

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex((prev) =>
            results.length > 0 ? (prev + 1) % results.length : 0
          );
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex((prev) =>
            results.length > 0 ? (prev - 1 + results.length) % results.length : 0
          );
          break;
        case 'Enter':
          e.preventDefault();
          if (results[selectedIndex]) {
            insertCitation(results[selectedIndex]);
          }
          break;
        case 'Escape':
          e.preventDefault();
          onClose();
          // Deactivate the trigger plugin too
          editor.view.dispatch(
            editor.state.tr.setMeta(citationPluginKey, { deactivate: true })
          );
          editor.commands.focus();
          break;
      }
    },
    [results, selectedIndex, insertCitation, onClose, editor]
  );

  if (!isOpen) return null;

  return (
    <div
      className={cn(
        'fixed z-50 bg-white border border-zinc-200 rounded-xl shadow-2xl',
        'w-[420px] max-h-[480px] flex flex-col overflow-hidden',
        'animate-in fade-in slide-in-from-top-2 duration-150'
      )}
      style={{
        // Position near cursor — the parent component should set top/left via style prop
        // Fallback to centered if not positioned
      }}
      onKeyDown={handleKeyDown}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-zinc-100 bg-zinc-50/50">
        <BookOpen className="w-4 h-4 text-violet-600" />
        <span className="text-sm font-semibold text-zinc-800">Insert Citation</span>
        <div className="flex-1" />
        <button
          onClick={() => {
            onClose();
            editor.view.dispatch(
              editor.state.tr.setMeta(citationPluginKey, { deactivate: true })
            );
            editor.commands.focus();
          }}
          className="p-1 rounded-md hover:bg-zinc-200 transition-colors text-zinc-400 hover:text-zinc-600"
          aria-label="Close citation search"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Search input */}
      <div className="relative px-4 py-2 border-b border-zinc-100">
        <Search className="absolute left-7 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search citations, authors, studies..."
          className={cn(
            'w-full pl-8 pr-4 py-2 text-sm rounded-lg',
            'bg-zinc-50 border border-zinc-200',
            'focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400',
            'placeholder:text-zinc-400 text-zinc-800',
            'transition-all'
          )}
          autoComplete="off"
        />
        {loading && (
          <Loader2 className="absolute right-7 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-500 animate-spin" />
        )}
      </div>

      {/* Results */}
      <div ref={listRef} className="flex-1 overflow-y-auto">
        {error && (
          <div className="px-4 py-6 text-center">
            <p className="text-sm text-red-500">{error}</p>
            <button
              onClick={() => doSearch(query)}
              className="mt-2 text-xs text-blue-600 hover:underline"
            >
              Retry search
            </button>
          </div>
        )}

        {!error && !loading && query.trim() && results.length === 0 && (
          <div className="px-4 py-8 text-center">
            <BookOpen className="w-8 h-8 text-zinc-300 mx-auto mb-2" />
            <p className="text-sm text-zinc-500">No citations found</p>
            <p className="text-xs text-zinc-400 mt-1">
              Try a different search term
            </p>
          </div>
        )}

        {!error && !query.trim() && results.length === 0 && !loading && (
          <div className="px-4 py-8 text-center">
            <Search className="w-8 h-8 text-zinc-300 mx-auto mb-2" />
            <p className="text-sm text-zinc-500">
              Type to search project artifacts and CSR data
            </p>
            <p className="text-xs text-zinc-400 mt-1">
              Trigger with <kbd className="px-1.5 py-0.5 bg-zinc-100 rounded text-zinc-600 font-mono">[@</kbd> or{' '}
              <kbd className="px-1.5 py-0.5 bg-zinc-100 rounded text-zinc-600 font-mono">/cite</kbd>
            </p>
          </div>
        )}

        {results.map((result, index) => (
          <button
            key={result.id}
            data-selected={index === selectedIndex}
            onClick={() => insertCitation(result)}
            className={cn(
              'w-full text-left px-4 py-3 border-b border-zinc-50 transition-colors',
              'focus:outline-none',
              index === selectedIndex
                ? 'bg-blue-50/80 border-l-2 border-l-blue-500'
                : 'hover:bg-zinc-50 border-l-2 border-l-transparent'
            )}
          >
            <div className="flex items-start gap-3">
              <div className="flex-1 min-w-0">
                {/* Title */}
                <p className="text-sm font-medium text-zinc-800 truncate">
                  {result.title}
                </p>

                {/* Authors */}
                <p className="text-xs text-zinc-500 mt-0.5 truncate">
                  {result.authors?.join(', ') || 'Unknown authors'}
                </p>

                {/* Year + Source type */}
                <div className="flex items-center gap-2 mt-1.5">
                  <span className="text-xs font-medium text-zinc-600">
                    {result.year}
                  </span>
                  <span
                    className={cn(
                      'inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider',
                      sourceTypeBadgeClass(result.sourceType)
                    )}
                  >
                    {sourceTypeLabel(result.sourceType)}
                  </span>
                  {result.doi && (
                    <span className="inline-flex items-center gap-0.5 text-[10px] text-zinc-400">
                      <ExternalLink className="w-2.5 h-2.5" />
                      DOI
                    </span>
                  )}
                </div>

                {/* Snippet */}
                {result.snippet && (
                  <p className="text-xs text-zinc-400 mt-1 line-clamp-2">
                    {result.snippet}
                  </p>
                )}
              </div>

              {/* Preview of what will be inserted */}
              <div className="flex-shrink-0 mt-0.5">
                <span className="inline-flex items-center px-2 py-1 rounded bg-blue-50 text-blue-700 text-[11px] font-medium border border-blue-200">
                  {formatCitationLabel(result)}
                </span>
              </div>
            </div>
          </button>
        ))}
      </div>

      {/* Footer hint */}
      {results.length > 0 && (
        <div className="px-4 py-2 border-t border-zinc-100 bg-zinc-50/50 flex items-center gap-3">
          <span className="text-[10px] text-zinc-400">
            <kbd className="px-1 py-0.5 bg-zinc-100 rounded text-zinc-500 font-mono">↑↓</kbd>{' '}
            navigate
          </span>
          <span className="text-[10px] text-zinc-400">
            <kbd className="px-1 py-0.5 bg-zinc-100 rounded text-zinc-500 font-mono">Enter</kbd>{' '}
            insert
          </span>
          <span className="text-[10px] text-zinc-400">
            <kbd className="px-1 py-0.5 bg-zinc-100 rounded text-zinc-500 font-mono">Esc</kbd>{' '}
            close
          </span>
        </div>
      )}
    </div>
  );
}

// ── TipTap Extension ─────────────────────────────────────────────────────────

export const CitationPlugin = Extension.create({
  name: 'citationPlugin',

  addExtensions() {
    return [CitationMark];
  },

  addStorage() {
    return {
      onTrigger: null as ((state: CitationPluginState) => void) | null,
    };
  },

  addProseMirrorPlugins() {
    const onTrigger =
      this.storage.onTrigger ??
      (() => {
        /* no-op until React layer registers a handler */
      });

    return [createCitationTriggerPlugin(onTrigger)];
  },
});

export default CitationPlugin;
