/**
 * @fileoverview AnA Memory Management Page
 * @module concept2cure/pages/AnAMemory
 *
 * @description
 * AnA's persistent memory page — shows what AnA remembers about the current
 * project and lets users view, add, and remove memory entries. Organized by
 * category (Preferences, Facts, Decisions, Context).
 */

import React, { useState, useEffect, useCallback } from 'react';
import { apiRequest } from '@/lib/queryClient';
import { cn } from '@/lib/utils';
import {
  Brain,
  Sparkles,
  Trash2,
  Plus,
  BookOpen,
  Lightbulb,
  GitBranch,
  Settings,
  Tag,
  Loader2,
  Pencil,
  Check,
  X,
} from 'lucide-react';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

type MemoryCategory = 'All' | 'Preferences' | 'Facts' | 'Decisions' | 'Context';

interface MemoryEntry {
  id: string;
  category: Exclude<MemoryCategory, 'All'>;
  content: string;
  createdAt: string;
}

interface ProjectContext {
  therapeuticArea: string;
  submissionType: string;
  targetAgency: string;
  drugProduct: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

const CATEGORIES: MemoryCategory[] = [
  'All',
  'Preferences',
  'Facts',
  'Decisions',
  'Context',
];

const CATEGORY_ICONS: Record<Exclude<MemoryCategory, 'All'>, React.ElementType> = {
  Preferences: Settings,
  Facts: BookOpen,
  Decisions: GitBranch,
  Context: Lightbulb,
};

const CATEGORY_COLORS: Record<Exclude<MemoryCategory, 'All'>, { bg: string; text: string; border: string }> = {
  Preferences: { bg: 'bg-stone-100', text: 'text-stone-600', border: 'border-stone-100' },
  Facts: { bg: 'bg-stone-100', text: 'text-stone-700', border: 'border-stone-100' },
  Decisions: { bg: 'bg-stone-100', text: 'text-stone-600', border: 'border-stone-100' },
  Context: { bg: 'bg-stone-100', text: 'text-stone-600', border: 'border-stone-100' },
};

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

function relativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 30) return `${diffDays}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export default function AnAMemory({ projectId }: { projectId?: string } = {}) {
  const [memories, setMemories] = useState<MemoryEntry[]>([]);
  const [projectContext, setProjectContext] = useState<ProjectContext>({
    therapeuticArea: '',
    submissionType: '',
    targetAgency: '',
    drugProduct: '',
  });
  const [activeCategory, setActiveCategory] = useState<MemoryCategory>('All');
  const [newMemory, setNewMemory] = useState('');
  const [newMemoryCategory, setNewMemoryCategory] = useState<Exclude<MemoryCategory, 'All'>>('Facts');
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Inline editing state for project context
  const [editingField, setEditingField] = useState<keyof ProjectContext | null>(null);
  const [editValue, setEditValue] = useState('');

  // ─── Fetch memories ─────────────────────────────────────────────────────────

  const fetchMemories = useCallback(async () => {
    try {
      const response = await apiRequest('GET', '/api/ana/memory/default-project');
      if (!response.ok) throw new Error(`Failed to load (${response.status})`);
      const data = await response.json();
      // Map server 'type' field to client 'category'
      const typeToCategory: Record<string, MemoryEntry['category']> = {
        preference: 'Preferences', fact: 'Facts', decision: 'Decisions', context: 'Context',
      };
      const mapped = (data.memories || []).map((m: any) => ({
        ...m,
        category: m.type ? typeToCategory[m.type] || m.category : m.category,
      }));
      setMemories(mapped);
      if (data.projectContext) {
        setProjectContext(data.projectContext);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load memories');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMemories();
  }, [fetchMemories]);

  // ─── Add memory ─────────────────────────────────────────────────────────────

  const addMemory = useCallback(async () => {
    if (!newMemory.trim()) return;

    setAdding(true);
    setError(null);

    try {
      const response = await apiRequest('POST', '/api/ana/memory/default-project', {
          content: newMemory.trim(),
          type: newMemoryCategory.toLowerCase() as 'preference' | 'fact' | 'decision' | 'context',
        });

      if (!response.ok) throw new Error(`Failed to add (${response.status})`);

      const data = await response.json();
      if (data.memory) {
        setMemories((prev) => [data.memory, ...prev]);
      } else {
        await fetchMemories();
      }
      setNewMemory('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add memory');
    } finally {
      setAdding(false);
    }
  }, [newMemory, newMemoryCategory, fetchMemories]);

  // ─── Delete memory ──────────────────────────────────────────────────────────

  const deleteMemory = useCallback(
    async (memoryId: string) => {
      setDeletingId(memoryId);
      setError(null);

      try {
        const response = await apiRequest('DELETE', `/api/ana/memory/default-project/${memoryId}`);

        if (!response.ok)
          throw new Error(`Failed to delete (${response.status})`);

        setMemories((prev) => prev.filter((m) => m.id !== memoryId));
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'Failed to delete memory'
        );
      } finally {
        setDeletingId(null);
      }
    },
    []
  );

  // ─── Inline editing ────────────────────────────────────────────────────────

  const startEditing = (field: keyof ProjectContext) => {
    setEditingField(field);
    setEditValue(projectContext[field]);
  };

  const saveEdit = () => {
    if (editingField) {
      setProjectContext((prev) => ({ ...prev, [editingField]: editValue }));
      setEditingField(null);
      setEditValue('');
    }
  };

  const cancelEdit = () => {
    setEditingField(null);
    setEditValue('');
  };

  // ─── Filter ─────────────────────────────────────────────────────────────────

  const filteredMemories =
    activeCategory === 'All'
      ? memories
      : memories.filter((m) => m.category === activeCategory);

  // ─── Context field labels ───────────────────────────────────────────────────

  const contextFields: { key: keyof ProjectContext; label: string }[] = [
    { key: 'therapeuticArea', label: 'Therapeutic Area' },
    { key: 'submissionType', label: 'Submission Type' },
    { key: 'targetAgency', label: 'Target Agency' },
    { key: 'drugProduct', label: 'Drug Product' },
  ];

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════════

  return (
    <div className="min-h-screen bg-stone-50">
      <div className="mx-auto max-w-5xl px-6 py-10">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-stone-100 border border-stone-100">
              <Brain className="h-5 w-5 text-stone-600" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-3">
                <h1 className="text-base font-semibold text-stone-900 tracking-tight">
                  AnA Memory
                </h1>
                <span className="inline-flex items-center rounded-full bg-stone-100 px-2.5 py-0.5 text-xs font-medium text-stone-700 border border-stone-200">
                  AnA v1.0
                </span>
              </div>
              <p className="text-sm text-stone-500">
                What AnA remembers about your project
              </p>
            </div>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="rounded-xl border border-stone-200 bg-stone-100 p-4 mb-6">
            <p className="text-sm text-stone-800">{error}</p>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-stone-900" />
            <span className="ml-3 text-sm text-stone-500">
              Loading memories...
            </span>
          </div>
        )}

        {!loading && (
          <div className="space-y-6">
            {/* Project Context Card */}
            <div className="rounded-xl border border-stone-200 bg-white p-5">
              <div className="flex items-center gap-2 mb-5">
                <Tag className="h-4 w-4 text-stone-500" />
                <h2 className="text-sm font-semibold text-stone-900">
                  Project Context
                </h2>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {contextFields.map(({ key, label }) => (
                  <div
                    key={key}
                    className="group rounded-lg border border-stone-200 bg-stone-50/50 px-4 py-3"
                  >
                    <p className="text-xs font-medium text-stone-500 mb-1">
                      {label}
                    </p>
                    {editingField === key ? (
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') saveEdit();
                            if (e.key === 'Escape') cancelEdit();
                          }}
                          autoFocus
                          className="flex-1 rounded border border-stone-300 bg-white px-2 py-1 text-sm text-stone-900 focus:border-stone-400 focus-visible:ring-2 outline-none focus:ring-stone-100"
                        />
                        <button
                          onClick={saveEdit}
                          className="rounded p-1 text-stone-700 hover:bg-stone-100 transition-colors duration-150"
                        >
                          <Check className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={cancelEdit}
                          className="rounded p-1 text-stone-400 hover:bg-stone-100 transition-colors duration-150"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between">
                        <p className="text-sm text-stone-900">
                          {projectContext[key] || (
                            <span className="italic text-stone-400">
                              Not set
                            </span>
                          )}
                        </p>
                        <button
                          onClick={() => startEditing(key)}
                          className="opacity-0 group-hover:opacity-100 rounded p-1 text-stone-400 hover:text-stone-600 hover:bg-stone-100 transition-all duration-150"
                          title={`Edit ${label}`}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Category Filter Pills */}
            <div className="flex items-center gap-2 flex-wrap">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-medium transition-all border',
                    activeCategory === cat
                      ? 'bg-stone-900 text-white border-stone-900'
                      : 'bg-white text-stone-600 border-stone-200 hover:border-stone-300 hover:bg-stone-50'
                  )}
                >
                  {cat === 'All' ? (
                    <Sparkles className="h-3 w-3" />
                  ) : (
                    React.createElement(CATEGORY_ICONS[cat], {
                      className: 'h-3 w-3',
                    })
                  )}
                  {cat}
                  {cat === 'All' ? (
                    <span className="ml-1 text-xs opacity-70">
                      {memories.length}
                    </span>
                  ) : (
                    <span className="ml-1 text-xs opacity-70">
                      {memories.filter((m) => m.category === cat).length}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* Memory List */}
            {filteredMemories.length === 0 && memories.length === 0 ? (
              /* Empty State */
              <div className="rounded-xl border border-stone-200 bg-white p-10 text-center">
                <Brain className="mx-auto h-10 w-10 text-stone-400 mb-4" />
                <p className="text-sm text-stone-600 max-w-md mx-auto leading-relaxed">
                  AnA doesn't have any memories for this project yet. As you
                  work together, she'll learn your preferences and project
                  context.
                </p>
              </div>
            ) : filteredMemories.length === 0 ? (
              <div className="rounded-xl border border-stone-200 bg-white p-5 text-center">
                <p className="text-sm text-stone-500">
                  No memories in the "{activeCategory}" category.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredMemories.map((memory) => {
                  const catConfig = CATEGORY_COLORS[memory.category];
                  const CatIcon = CATEGORY_ICONS[memory.category];
                  const isDeleting = deletingId === memory.id;

                  return (
                    <div
                      key={memory.id}
                      className={cn(
                        'group rounded-xl border bg-white p-4 transition-all duration-150',
                        isDeleting
                          ? 'border-stone-200 bg-stone-100/30 opacity-60'
                          : 'border-stone-200 hover:border-stone-300'
                      )}
                    >
                      <div className="flex items-start gap-3">
                        {/* Category Icon */}
                        <div
                          className={cn(
                            'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border',
                            catConfig.bg,
                            catConfig.border
                          )}
                        >
                          <CatIcon className={cn('h-4 w-4', catConfig.text)} />
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-stone-900 leading-relaxed">
                            {memory.content}
                          </p>
                          <div className="mt-2 flex items-center gap-3">
                            <span
                              className={cn(
                                'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
                                catConfig.bg,
                                catConfig.text
                              )}
                            >
                              {memory.category}
                            </span>
                            <span className="text-xs text-stone-400">
                              {relativeTime(memory.createdAt)}
                            </span>
                          </div>
                        </div>

                        {/* Delete */}
                        <button
                          onClick={() => {
                            if (window.confirm('Delete this memory entry? This cannot be undone.')) {
                              deleteMemory(memory.id);
                            }
                          }}
                          disabled={isDeleting}
                          className="opacity-0 group-hover:opacity-100 rounded-lg p-1.5 text-stone-400 hover:text-stone-900 hover:bg-stone-100 transition-all disabled:opacity-60"
                          title="Remove memory"
                          aria-label="Delete memory entry"
                        >
                          {isDeleting ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Add Memory */}
            <div className="rounded-xl border border-stone-200 bg-white p-5">
              <div className="flex items-center gap-2 mb-3">
                <Plus className="h-4 w-4 text-stone-500" />
                <h3 className="text-sm font-medium text-stone-700">
                  Add Memory
                </h3>
              </div>
              <div className="flex flex-col sm:flex-row gap-3">
                {/* Category selector */}
                <select
                  value={newMemoryCategory}
                  onChange={(e) =>
                    setNewMemoryCategory(
                      e.target.value as Exclude<MemoryCategory, 'All'>
                    )
                  }
                  className="rounded-lg border border-stone-200 bg-white px-3 py-2.5 text-sm text-stone-700 focus:border-stone-400 focus-visible:ring-2 outline-none focus:ring-stone-100 sm:w-36"
                >
                  <option value="Preferences">Preferences</option>
                  <option value="Facts">Facts</option>
                  <option value="Decisions">Decisions</option>
                  <option value="Context">Context</option>
                </select>

                {/* Input */}
                <input
                  type="text"
                  value={newMemory}
                  onChange={(e) => setNewMemory(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      addMemory();
                    }
                  }}
                  placeholder="e.g., Prefers Module 2.5 summaries under 15 pages..."
                  className="flex-1 rounded-lg border border-stone-200 bg-white px-3 py-2.5 text-sm text-stone-900 placeholder:text-stone-400 focus:border-stone-400 focus-visible:ring-2 outline-none focus:ring-stone-100"
                />

                {/* Add button */}
                <button
                  onClick={addMemory}
                  disabled={!newMemory.trim() || adding}
                  className={cn(
                    'inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-all shrink-0',
                    !newMemory.trim() || adding
                      ? 'bg-stone-100 text-stone-400 cursor-not-allowed'
                      : 'bg-stone-800 text-white hover:bg-stone-900 active:bg-stone-950 shadow-sm'
                  )}
                >
                  {adding ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Plus className="h-4 w-4" />
                  )}
                  Add memory
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
