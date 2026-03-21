/**
 * AnAMemory — Persistent AI context memory for project intelligence.
 *
 * Stores and surfaces key decisions, preferences, context, and regulatory
 * strategy choices across sessions. Every AI call is enriched with relevant
 * memory entries for better contextual awareness.
 *
 * Features:
 * - Auto-capture: key decisions from AI interactions
 * - Memory browser: see what AnA knows about your project
 * - Edit/delete entries
 * - Category-based organization
 * - Context injection API for AI enrichment
 */

import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
  Brain,
  Plus,
  Trash2,
  Edit3,
  Check,
  X,
  Search,
  Clock,
  Tag,
  Loader2,
  Database,
  Lightbulb,
  Target,
  Shield,
  FileText,
  ChevronDown,
  ChevronRight,
  Download,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ── Types ──────────────────────────────────────────────────────────────────────

type MemoryCategory =
  | 'decision'
  | 'preference'
  | 'context'
  | 'strategy'
  | 'feedback'
  | 'regulatory'
  | 'clinical'
  | 'technical';

interface MemoryEntry {
  id: string;
  category: MemoryCategory;
  content: string;
  source: 'auto' | 'manual';
  createdAt: string;
  updatedAt?: string;
  tags: string[];
  relevanceScore?: number;
}

export interface AnAMemoryProps {
  projectId: string;
  projectName?: string;
  onClose?: () => void;
  /** Callback to inject memory into AI context */
  onMemoryUpdate?: (entries: MemoryEntry[]) => void;
}

// ── Category Config ────────────────────────────────────────────────────────────

const CATEGORY_CONFIG: Record<MemoryCategory, { label: string; icon: React.ElementType; color: string }> = {
  decision: { label: 'Decisions', icon: Target, color: 'text-violet-600 bg-violet-50' },
  preference: { label: 'Preferences', icon: Lightbulb, color: 'text-amber-600 bg-amber-50' },
  context: { label: 'Context', icon: Database, color: 'text-blue-600 bg-blue-50' },
  strategy: { label: 'Strategy', icon: Target, color: 'text-indigo-600 bg-indigo-50' },
  feedback: { label: 'Feedback', icon: FileText, color: 'text-emerald-600 bg-emerald-50' },
  regulatory: { label: 'Regulatory', icon: Shield, color: 'text-red-600 bg-red-50' },
  clinical: { label: 'Clinical', icon: Brain, color: 'text-cyan-600 bg-cyan-50' },
  technical: { label: 'Technical', icon: Database, color: 'text-zinc-600 bg-zinc-50' },
};

// ── Storage Helpers ────────────────────────────────────────────────────────────

const STORAGE_KEY_PREFIX = 'ana_memory_';

function loadMemory(projectId: string): MemoryEntry[] {
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY_PREFIX}${projectId}`);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveMemory(projectId: string, entries: MemoryEntry[]): void {
  try {
    localStorage.setItem(`${STORAGE_KEY_PREFIX}${projectId}`, JSON.stringify(entries));
  } catch {
    // localStorage full — silently fail
  }
}

// ── Default Seeds ──────────────────────────────────────────────────────────────

function getDefaultMemory(projectName?: string): MemoryEntry[] {
  const now = new Date().toISOString();
  return [
    {
      id: 'seed-1',
      category: 'context',
      content: `Project "${projectName || 'Untitled'}" initialized. AnA RI is tracking all document decisions and regulatory strategy choices.`,
      source: 'auto',
      createdAt: now,
      tags: ['initialization'],
    },
    {
      id: 'seed-2',
      category: 'preference',
      content: 'Default document language: Formal regulatory English (FDA/EMA compliant).',
      source: 'auto',
      createdAt: now,
      tags: ['language', 'default'],
    },
    {
      id: 'seed-3',
      category: 'regulatory',
      content: 'Target regulatory agencies should be specified per submission type. AnA will tailor recommendations accordingly.',
      source: 'auto',
      createdAt: now,
      tags: ['agency', 'configuration'],
    },
  ];
}

// ── Component ──────────────────────────────────────────────────────────────────

export function AnAMemory({
  projectId,
  projectName,
  onClose,
  onMemoryUpdate,
}: AnAMemoryProps) {
  const [entries, setEntries] = useState<MemoryEntry[]>(() => {
    const loaded = loadMemory(projectId);
    return loaded.length > 0 ? loaded : getDefaultMemory(projectName);
  });

  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState<MemoryCategory | 'all'>('all');
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
    new Set(['decision', 'context', 'strategy']),
  );

  // New entry form
  const [showAddForm, setShowAddForm] = useState(false);
  const [newContent, setNewContent] = useState('');
  const [newCategory, setNewCategory] = useState<MemoryCategory>('context');
  const [newTags, setNewTags] = useState('');

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');

  // Persist on change
  useEffect(() => {
    saveMemory(projectId, entries);
    onMemoryUpdate?.(entries);
  }, [entries, projectId, onMemoryUpdate]);

  // Filter & search
  const filteredEntries = useMemo(() => {
    return entries.filter(entry => {
      if (filterCategory !== 'all' && entry.category !== filterCategory) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        return (
          entry.content.toLowerCase().includes(q) ||
          entry.tags.some(t => t.toLowerCase().includes(q))
        );
      }
      return true;
    });
  }, [entries, filterCategory, searchQuery]);

  // Group by category
  const grouped = useMemo(() => {
    const groups: Record<string, MemoryEntry[]> = {};
    for (const entry of filteredEntries) {
      if (!groups[entry.category]) groups[entry.category] = [];
      groups[entry.category].push(entry);
    }
    return groups;
  }, [filteredEntries]);

  const toggleCategory = useCallback((cat: string) => {
    setExpandedCategories(prev => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  }, []);

  // Add entry
  const handleAdd = useCallback(() => {
    if (!newContent.trim()) return;
    const entry: MemoryEntry = {
      id: `mem-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      category: newCategory,
      content: newContent.trim(),
      source: 'manual',
      createdAt: new Date().toISOString(),
      tags: newTags
        .split(',')
        .map(t => t.trim())
        .filter(Boolean),
    };
    setEntries(prev => [entry, ...prev]);
    setNewContent('');
    setNewTags('');
    setShowAddForm(false);
  }, [newContent, newCategory, newTags]);

  // Delete entry
  const handleDelete = useCallback((id: string) => {
    setEntries(prev => prev.filter(e => e.id !== id));
  }, []);

  // Edit entry
  const handleStartEdit = useCallback((entry: MemoryEntry) => {
    setEditingId(entry.id);
    setEditContent(entry.content);
  }, []);

  const handleSaveEdit = useCallback(() => {
    if (!editingId || !editContent.trim()) return;
    setEntries(prev =>
      prev.map(e =>
        e.id === editingId
          ? { ...e, content: editContent.trim(), updatedAt: new Date().toISOString() }
          : e,
      ),
    );
    setEditingId(null);
    setEditContent('');
  }, [editingId, editContent]);

  // Export memory
  const handleExport = useCallback(() => {
    const data = JSON.stringify(entries, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ana-memory-${projectId}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [entries, projectId]);

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header */}
      <div className="px-4 py-3 border-b border-zinc-200 bg-gradient-to-r from-violet-50 to-purple-50">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Brain className="w-5 h-5 text-violet-600" />
            <div>
              <h2 className="text-sm font-semibold text-zinc-900">AnA Memory</h2>
              <p className="text-[10px] text-zinc-500">
                {entries.length} entries · {projectName || 'Project'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setShowAddForm(!showAddForm)}
              className="p-1.5 rounded-md hover:bg-white/60 transition-colors duration-150"
              title="Add memory entry"
            >
              <Plus className="w-3.5 h-3.5 text-violet-600" />
            </button>
            <button
              onClick={handleExport}
              className="p-1.5 rounded-md hover:bg-white/60 transition-colors duration-150"
              title="Export memory"
            >
              <Download className="w-3.5 h-3.5 text-zinc-500" />
            </button>
            {onClose && (
              <button onClick={onClose} className="p-1.5 rounded-md hover:bg-white/60 transition-colors duration-150">
                <X className="w-3.5 h-3.5 text-zinc-500" />
              </button>
            )}
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search memory..."
            className="w-full pl-8 pr-3 py-1.5 text-xs border border-zinc-200 rounded-lg bg-white focus:ring-2 focus:ring-violet-200 focus:border-violet-300 outline-none"
          />
        </div>

        {/* Category filter */}
        <div className="flex items-center gap-1.5 mt-2 overflow-x-auto">
          <button
            onClick={() => setFilterCategory('all')}
            className={cn(
              'px-2 py-0.5 text-[10px] font-medium rounded-full whitespace-nowrap transition-colors',
              filterCategory === 'all'
                ? 'bg-violet-600 text-white'
                : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200',
            )}
          >
            All
          </button>
          {(Object.keys(CATEGORY_CONFIG) as MemoryCategory[]).map(cat => {
            const config = CATEGORY_CONFIG[cat];
            const count = entries.filter(e => e.category === cat).length;
            if (count === 0) return null;
            return (
              <button
                key={cat}
                onClick={() => setFilterCategory(filterCategory === cat ? 'all' : cat)}
                className={cn(
                  'px-2 py-0.5 text-[10px] font-medium rounded-full whitespace-nowrap transition-colors',
                  filterCategory === cat
                    ? 'bg-violet-600 text-white'
                    : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200',
                )}
              >
                {config.label} ({count})
              </button>
            );
          })}
        </div>
      </div>

      {/* Add form */}
      {showAddForm && (
        <div className="px-4 py-3 border-b border-violet-200 bg-violet-50/50">
          <div className="space-y-2">
            <select
              value={newCategory}
              onChange={e => setNewCategory(e.target.value as MemoryCategory)}
              className="w-full text-xs px-2.5 py-1.5 border border-zinc-200 rounded-lg bg-white"
            >
              {(Object.keys(CATEGORY_CONFIG) as MemoryCategory[]).map(cat => (
                <option key={cat} value={cat}>
                  {CATEGORY_CONFIG[cat].label}
                </option>
              ))}
            </select>
            <textarea
              value={newContent}
              onChange={e => setNewContent(e.target.value)}
              placeholder="What should AnA remember about this project?"
              rows={3}
              className="w-full text-xs px-2.5 py-1.5 border border-zinc-200 rounded-lg bg-white resize-none focus:ring-2 focus:ring-violet-200 focus:border-violet-300 outline-none"
            />
            <input
              type="text"
              value={newTags}
              onChange={e => setNewTags(e.target.value)}
              placeholder="Tags (comma-separated)"
              className="w-full text-xs px-2.5 py-1.5 border border-zinc-200 rounded-lg bg-white focus:ring-2 focus:ring-violet-200 focus:border-violet-300 outline-none"
            />
            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => setShowAddForm(false)}
                className="px-3 py-1 text-xs text-zinc-500 hover:text-zinc-700"
              >
                Cancel
              </button>
              <button
                onClick={handleAdd}
                disabled={!newContent.trim()}
                className="flex items-center gap-1 px-3 py-1 text-xs font-medium text-white bg-violet-600 rounded-lg hover:bg-violet-700 transition-colors disabled:opacity-50"
              >
                <Plus className="w-3 h-3" />
                Add Memory
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Memory entries */}
      <div className="flex-1 overflow-y-auto">
        {filteredEntries.length === 0 ? (
          <div className="text-center py-12">
            <Brain className="w-10 h-10 text-zinc-300 mx-auto mb-3" />
            <h3 className="text-sm font-semibold text-zinc-600 mb-1">No memories yet</h3>
            <p className="text-xs text-zinc-400">
              AnA will automatically capture key decisions and context as you work.
            </p>
          </div>
        ) : (
          Object.entries(grouped).map(([category, items]) => {
            const config = CATEGORY_CONFIG[category as MemoryCategory];
            if (!config) return null;
            const Icon = config.icon;
            const isExpanded = expandedCategories.has(category);

            return (
              <div key={category} className="border-b border-zinc-100">
                <button
                  onClick={() => toggleCategory(category)}
                  className="w-full flex items-center gap-2 px-4 py-2.5 text-left hover:bg-zinc-50 transition-colors duration-150"
                >
                  {isExpanded ? (
                    <ChevronDown className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                  ) : (
                    <ChevronRight className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                  )}
                  <Icon className={cn('w-4 h-4 shrink-0', config.color.split(' ')[0])} />
                  <span className="text-xs font-semibold text-zinc-700 flex-1">{config.label}</span>
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-zinc-100 text-zinc-600">
                    {items.length}
                  </span>
                </button>

                {isExpanded && (
                  <div className="px-4 pb-2 space-y-1.5">
                    {items.map(entry => (
                      <div
                        key={entry.id}
                        className={cn(
                          'p-2.5 rounded-lg border border-zinc-100 text-xs group hover:border-zinc-200 transition-colors',
                          entry.source === 'auto' ? 'bg-zinc-50/50' : 'bg-white',
                        )}
                      >
                        {editingId === entry.id ? (
                          /* Edit mode */
                          <div className="space-y-2">
                            <textarea
                              value={editContent}
                              onChange={e => setEditContent(e.target.value)}
                              rows={3}
                              className="w-full text-xs px-2 py-1 border border-zinc-200 rounded bg-white resize-none focus:ring-2 focus:ring-violet-200 outline-none"
                            />
                            <div className="flex items-center gap-1.5 justify-end">
                              <button
                                onClick={() => setEditingId(null)}
                                className="p-1 text-zinc-400 hover:text-zinc-600"
                              >
                                <X className="w-3 h-3" />
                              </button>
                              <button
                                onClick={handleSaveEdit}
                                className="p-1 text-emerald-600 hover:text-emerald-700"
                              >
                                <Check className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                        ) : (
                          /* Display mode */
                          <>
                            <p className="text-zinc-700 leading-relaxed">{entry.content}</p>
                            <div className="flex items-center justify-between mt-1.5">
                              <div className="flex items-center gap-1.5">
                                <Clock className="w-3 h-3 text-zinc-300" />
                                <span className="text-[10px] text-zinc-400">
                                  {new Date(entry.createdAt).toLocaleDateString()}
                                </span>
                                {entry.source === 'auto' && (
                                  <span className="px-1 py-0.5 rounded bg-zinc-100 text-[10px] text-zinc-400">
                                    auto
                                  </span>
                                )}
                                {entry.tags.map(tag => (
                                  <span
                                    key={tag}
                                    className="px-1 py-0.5 rounded bg-violet-50 text-[10px] text-violet-600"
                                  >
                                    {tag}
                                  </span>
                                ))}
                              </div>
                              <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button
                                  onClick={() => handleStartEdit(entry)}
                                  className="p-1 text-zinc-400 hover:text-zinc-600"
                                  title="Edit"
                                >
                                  <Edit3 className="w-3 h-3" />
                                </button>
                                <button
                                  onClick={() => handleDelete(entry.id)}
                                  className="p-1 text-zinc-400 hover:text-red-600"
                                  title="Delete"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </div>
                            </div>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-2 border-t border-zinc-200 bg-zinc-50 text-[10px] text-zinc-400 flex items-center justify-between">
        <span>{entries.length} total memories</span>
        <span>Stored locally · syncs per project</span>
      </div>
    </div>
  );
}

/**
 * getProjectMemoryContext — Returns formatted memory entries for AI context injection.
 * Call this before sending an AI request to enrich with project memory.
 */
export function getProjectMemoryContext(projectId: string, maxEntries = 10): string {
  const entries = loadMemory(projectId);
  if (entries.length === 0) return '';

  const relevant = entries.slice(0, maxEntries);
  const lines = relevant.map(
    e => `[${e.category.toUpperCase()}] ${e.content}`,
  );

  return `\n--- Project Memory (AnA RI) ---\n${lines.join('\n')}\n--- End Memory ---\n`;
}

export default AnAMemory;
