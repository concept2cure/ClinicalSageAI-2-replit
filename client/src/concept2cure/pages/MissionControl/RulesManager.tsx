/**
 * @fileoverview Rules Engine Management Panel
 * @module concept2cure/pages/MissionControl/RulesManager
 * @version 1.0.0
 *
 * @description
 * Full CRUD interface for Pillar 2 — Project Rules Engine.
 * Allows users to view, create, edit, test, and delete automation rules.
 *
 * Features:
 * - Rule list with filters (scope, trigger, active status)
 * - Rule detail/edit panel
 * - Dry-run test against sample context
 * - Execution log viewer
 * - Template catalog for quick rule creation
 *
 * @compliance
 * - FDA 21 CFR Part 11: All rule changes are audit-logged server-side
 */

import React, { useState, useCallback, useMemo } from 'react';
import { cn } from '@/lib/utils';
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  CheckCircle2,
  ChevronDown,
  Copy,
  Edit3,
  Filter,
  ListChecks,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  Trash2,
  XCircle,
  Zap,
  BarChart3,
} from 'lucide-react';
import {
  useProjectRules,
  useProjectRule,
  useCreateRule,
  useUpdateRule,
  useDeleteRule,
  useTestRule,
  useRuleExecutionLogs,
  useRuleTemplates,
  type ProjectRule,
  type RuleTemplate,
  type RulesListFilters,
} from '../../hooks/useEnterprise';

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

const TRIGGER_EVENTS = [
  'project_created',
  'project_updated',
  'project_status_changed',
  'task_completed',
  'task_overdue',
  'budget_threshold_exceeded',
  'risk_level_changed',
  'module_linked',
  'module_unlinked',
  'sentinel_finding_created',
  'milestone_reached',
  'approval_requested',
  'document_version_created',
  'compliance_check_failed',
  'review_completed',
  'sla_breach',
  'resource_conflict',
  'phase_transition',
  'external_event',
  'scheduled',
] as const;

const SCOPE_OPTIONS = ['global', 'project', 'template'] as const;

const ACTION_TYPES = [
  { value: 'create_task', label: 'Create Task' },
  { value: 'send_notification', label: 'Send Notification' },
  { value: 'block_transition', label: 'Block Transition' },
  { value: 'escalate', label: 'Escalate' },
  { value: 'update_field', label: 'Update Field' },
  { value: 'trigger_ai_analysis', label: 'Trigger RI Analysis' },
  { value: 'advance_stage', label: 'Advance Stage' },
  { value: 'create_child_project', label: 'Create Child Project' },
] as const;

// ═══════════════════════════════════════════════════════════════════════════════
// SUB-COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════════

/** Rules list sidebar item */
interface RuleListItemProps {
  rule: ProjectRule;
  isSelected: boolean;
  onSelect: () => void;
}

const RuleListItem: React.FC<RuleListItemProps> = ({ rule, isSelected, onSelect }) => (
  <button
    onClick={onSelect}
    className={cn(
      'w-full text-left px-3 py-2.5 rounded-lg border transition-colors',
      isSelected
        ? 'bg-blue-50 border-blue-200 text-blue-900'
        : 'bg-white border-zinc-100 hover:border-zinc-200 hover:bg-zinc-50'
    )}
  >
    <div className="flex items-center gap-2 mb-1">
      <div
        className={cn(
          'w-2 h-2 rounded-full flex-shrink-0',
          rule.isActive ? 'bg-emerald-500' : 'bg-zinc-300'
        )}
      />
      <span className="text-sm font-medium truncate">{rule.name}</span>
    </div>
    <div className="flex items-center gap-2 text-xs text-zinc-500 pl-4">
      <span className="px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-600">
        {rule.triggerEvent.replace(/_/g, ' ')}
      </span>
      <span className="capitalize">{rule.scope}</span>
      {rule.executionCount > 0 && (
        <span className="ml-auto tabular-nums">{rule.executionCount} runs</span>
      )}
    </div>
  </button>
);

/** Template card for quick rule creation */
interface TemplateCardProps {
  template: RuleTemplate;
  onUse: (template: RuleTemplate) => void;
}

const TemplateCard: React.FC<TemplateCardProps> = ({ template, onUse }) => (
  <div className="bg-white border border-zinc-200 rounded-lg p-3 hover:border-blue-300 transition-colors">
    <div className="flex items-start justify-between gap-2 mb-2">
      <h4 className="text-sm font-medium text-zinc-900">{template.name}</h4>
      <button
        onClick={() => onUse(template)}
        className="flex-shrink-0 text-xs text-blue-600 hover:text-blue-800 font-medium flex items-center gap-0.5"
      >
        <Copy className="w-3 h-3" />
        Use
      </button>
    </div>
    <p className="text-xs text-zinc-500 line-clamp-2 mb-2">{template.description}</p>
    <div className="flex items-center gap-1 flex-wrap">
      {template.tags.slice(0, 3).map(tag => (
        <span
          key={tag}
          className="text-[10px] px-1.5 py-0.5 rounded-full bg-zinc-100 text-zinc-500"
        >
          {tag}
        </span>
      ))}
    </div>
  </div>
);

// ═══════════════════════════════════════════════════════════════════════════════
// RULE EDITOR FORM
// ═══════════════════════════════════════════════════════════════════════════════

interface RuleFormData {
  name: string;
  description: string;
  scope: string;
  triggerEvent: string;
  priority: number;
  isActive: boolean;
  cooldownMinutes: number;
  maxExecutions: number | null;
  tags: string[];
}

const defaultFormData: RuleFormData = {
  name: '',
  description: '',
  scope: 'global',
  triggerEvent: 'project_created',
  priority: 50,
  isActive: true,
  cooldownMinutes: 0,
  maxExecutions: null,
  tags: [],
};

interface RuleEditorProps {
  initialData?: Partial<RuleFormData>;
  isNew: boolean;
  onSave: (data: RuleFormData) => void;
  onCancel: () => void;
  isSaving: boolean;
}

const RuleEditor: React.FC<RuleEditorProps> = ({
  initialData,
  isNew,
  onSave,
  onCancel,
  isSaving,
}) => {
  const [form, setForm] = useState<RuleFormData>({
    ...defaultFormData,
    ...initialData,
  });
  const [tagInput, setTagInput] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(form);
  };

  const addTag = () => {
    const tag = tagInput.trim();
    if (tag && !form.tags.includes(tag)) {
      setForm(prev => ({ ...prev, tags: [...prev.tags, tag] }));
      setTagInput('');
    }
  };

  const removeTag = (tag: string) => {
    setForm(prev => ({ ...prev, tags: prev.tags.filter(t => t !== tag) }));
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Name */}
      <div>
        <label className="block text-xs font-medium text-zinc-700 mb-1">Rule Name *</label>
        <input
          type="text"
          value={form.name}
          onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))}
          className="w-full px-3 py-2 rounded-lg border border-zinc-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          placeholder="e.g., Auto-assign reviewer on draft complete"
          required
        />
      </div>

      {/* Description */}
      <div>
        <label className="block text-xs font-medium text-zinc-700 mb-1">Description</label>
        <textarea
          value={form.description}
          onChange={e => setForm(prev => ({ ...prev, description: e.target.value }))}
          className="w-full px-3 py-2 rounded-lg border border-zinc-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
          placeholder="Describe what this rule does..."
          rows={2}
        />
      </div>

      {/* Trigger + Scope row */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-zinc-700 mb-1">Trigger Event *</label>
          <select
            value={form.triggerEvent}
            onChange={e => setForm(prev => ({ ...prev, triggerEvent: e.target.value }))}
            className="w-full px-3 py-2 rounded-lg border border-zinc-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {TRIGGER_EVENTS.map(ev => (
              <option key={ev} value={ev}>
                {ev.replace(/_/g, ' ')}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-zinc-700 mb-1">Scope *</label>
          <select
            value={form.scope}
            onChange={e => setForm(prev => ({ ...prev, scope: e.target.value }))}
            className="w-full px-3 py-2 rounded-lg border border-zinc-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {SCOPE_OPTIONS.map(s => (
              <option key={s} value={s}>
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Priority + Cooldown + Max Executions */}
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="block text-xs font-medium text-zinc-700 mb-1">Priority</label>
          <input
            type="number"
            value={form.priority}
            onChange={e =>
              setForm(prev => ({ ...prev, priority: parseInt(e.target.value, 10) || 50 }))
            }
            className="w-full px-3 py-2 rounded-lg border border-zinc-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            min={0}
            max={100}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-zinc-700 mb-1">Cooldown (min)</label>
          <input
            type="number"
            value={form.cooldownMinutes}
            onChange={e =>
              setForm(prev => ({
                ...prev,
                cooldownMinutes: parseInt(e.target.value, 10) || 0,
              }))
            }
            className="w-full px-3 py-2 rounded-lg border border-zinc-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            min={0}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-zinc-700 mb-1">Max Executions</label>
          <input
            type="number"
            value={form.maxExecutions ?? ''}
            onChange={e => {
              const val = e.target.value;
              setForm(prev => ({
                ...prev,
                maxExecutions: val ? parseInt(val, 10) : null,
              }));
            }}
            className="w-full px-3 py-2 rounded-lg border border-zinc-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="∞"
            min={1}
          />
        </div>
      </div>

      {/* Active toggle */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setForm(prev => ({ ...prev, isActive: !prev.isActive }))}
          className={cn(
            'relative w-10 h-5 rounded-full transition-colors',
            form.isActive ? 'bg-blue-500' : 'bg-zinc-300'
          )}
        >
          <div
            className={cn(
              'absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform',
              form.isActive ? 'translate-x-5' : 'translate-x-0.5'
            )}
          />
        </button>
        <span className="text-sm text-zinc-700">{form.isActive ? 'Active' : 'Inactive'}</span>
      </div>

      {/* Tags */}
      <div>
        <label className="block text-xs font-medium text-zinc-700 mb-1">Tags</label>
        <div className="flex items-center gap-1 flex-wrap mb-1">
          {form.tags.map(tag => (
            <span
              key={tag}
              className="inline-flex items-center gap-0.5 text-xs bg-zinc-100 text-zinc-600 px-2 py-0.5 rounded-full"
            >
              {tag}
              <button type="button" onClick={() => removeTag(tag)} className="hover:text-red-600">
                ×
              </button>
            </span>
          ))}
        </div>
        <div className="flex items-center gap-1">
          <input
            type="text"
            value={tagInput}
            onChange={e => setTagInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addTag();
              }
            }}
            className="flex-1 px-3 py-1.5 rounded-lg border border-zinc-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Add tag..."
          />
          <button
            type="button"
            onClick={addTag}
            className="px-2 py-1.5 rounded-lg border border-zinc-200 text-zinc-600 hover:bg-zinc-50 text-sm"
          >
            Add
          </button>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 pt-2 border-t border-zinc-100">
        <button
          type="submit"
          disabled={isSaving || !form.name}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isSaving ? (
            <RefreshCw className="w-4 h-4 animate-spin" />
          ) : (
            <Check className="w-4 h-4" />
          )}
          {isNew ? 'Create Rule' : 'Save Changes'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 rounded-lg text-sm text-zinc-600 hover:bg-zinc-100 transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

type ViewMode = 'list' | 'detail' | 'create' | 'edit' | 'templates' | 'logs';

export interface RulesManagerProps {
  /** Callback to navigate back to Mission Control */
  onBack?: () => void;
}

export const RulesManager: React.FC<RulesManagerProps> = ({ onBack }) => {
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [selectedRuleId, setSelectedRuleId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filters, setFilters] = useState<RulesListFilters>({ limit: 50 });

  // ── Data hooks ──────────────────────────────────────────────────────────
  const { data: rulesData, isLoading: rulesLoading } = useProjectRules(filters);
  const { data: selectedRule } = useProjectRule(selectedRuleId ?? undefined);
  const { data: logsData, isLoading: logsLoading } = useRuleExecutionLogs({
    ruleId: selectedRuleId ? String(selectedRuleId) : undefined,
    limit: 20,
  });
  const { data: templates } = useRuleTemplates();

  const createRule = useCreateRule();
  const updateRule = useUpdateRule();
  const deleteRule = useDeleteRule();
  const testRule = useTestRule();

  const rules = rulesData?.rules ?? [];
  const logs = logsData?.logs ?? [];

  // ── Filtered rules ─────────────────────────────────────────────────────
  const filteredRules = useMemo(() => {
    if (!searchQuery) return rules;
    const q = searchQuery.toLowerCase();
    return rules.filter(
      r =>
        r.name.toLowerCase().includes(q) ||
        r.triggerEvent.toLowerCase().includes(q) ||
        r.description?.toLowerCase().includes(q)
    );
  }, [rules, searchQuery]);

  // ── Handlers ────────────────────────────────────────────────────────────
  const handleSelectRule = useCallback((id: number) => {
    setSelectedRuleId(id);
    setViewMode('detail');
  }, []);

  const handleCreateFromTemplate = useCallback((template: RuleTemplate) => {
    setViewMode('create');
    // Template data will be passed as initial data to the form
  }, []);

  const handleSaveNew = useCallback(
    (data: RuleFormData) => {
      createRule.mutate(
        {
          ruleId: `rule_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          organizationId: 1, // set by server from JWT
          ...data,
          conditions: null,
          actions: null,
          scopeProjectId: null,
          scopeTemplateId: null,
          isBuiltIn: false,
          metadata: null,
          createdById: null,
        } as any,
        {
          onSuccess: () => setViewMode('list'),
        }
      );
    },
    [createRule]
  );

  const handleSaveEdit = useCallback(
    (data: RuleFormData) => {
      if (!selectedRuleId) return;
      updateRule.mutate({ id: selectedRuleId, data: data as unknown as Partial<ProjectRule> }, { onSuccess: () => setViewMode('detail') });
    },
    [selectedRuleId, updateRule]
  );

  const handleDelete = useCallback(() => {
    if (!selectedRuleId) return;
    if (!window.confirm('Delete this rule? This action cannot be undone.')) return;
    deleteRule.mutate(selectedRuleId, {
      onSuccess: () => {
        setSelectedRuleId(null);
        setViewMode('list');
      },
    });
  }, [selectedRuleId, deleteRule]);

  const handleToggleActive = useCallback(
    (rule: ProjectRule) => {
      updateRule.mutate({ id: rule.id, data: { isActive: !rule.isActive } });
    },
    [updateRule]
  );

  const handleTestRule = useCallback(() => {
    if (!selectedRuleId) return;
    testRule.mutate({ id: selectedRuleId, context: { projectId: 1, status: 'active' } });
  }, [selectedRuleId, testRule]);

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <div className="flex-1 h-full overflow-hidden bg-[#FAFAF9] flex flex-col">
      {/* Header */}
      <div className="px-6 py-4 border-b border-zinc-200 bg-white flex items-center gap-3">
        {onBack && (
          <button onClick={onBack} className="p-1.5 rounded-md hover:bg-zinc-100 transition-colors">
            <ArrowLeft className="w-4 h-4 text-zinc-600" />
          </button>
        )}
        <div className="flex-1">
          <h1 className="text-lg font-bold text-zinc-900 flex items-center gap-2">
            <Zap className="w-5 h-5 text-violet-600" />
            Rules Engine
          </h1>
          <p className="text-xs text-zinc-500">
            {rules.length} rules configured &middot; {rules.filter(r => r.isActive).length} active
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setViewMode('templates')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-300 text-sm text-zinc-700 hover:bg-zinc-50 transition-colors"
          >
            <ListChecks className="w-4 h-4" />
            Templates
          </button>
          <button
            onClick={() => setViewMode('create')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 text-sm text-white font-medium hover:bg-blue-700 transition-colors"
          >
            <Plus className="w-4 h-4" />
            New Rule
          </button>
        </div>
      </div>

      <div className="flex-1 flex min-h-0">
        {/* ── Left: Rules List ────────────────────────────────────────── */}
        <div className="w-72 border-r border-zinc-200 bg-white flex flex-col">
          {/* Search */}
          <div className="p-3 border-b border-zinc-100">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-zinc-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Search rules..."
              />
            </div>
          </div>

          {/* Rules list */}
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {rulesLoading ? (
              <div className="flex items-center justify-center py-12 text-zinc-400">
                <RefreshCw className="w-4 h-4 animate-spin mr-2" />
                Loading...
              </div>
            ) : filteredRules.length === 0 ? (
              <div className="text-center py-8">
                <ListChecks className="w-8 h-8 text-zinc-300 mx-auto mb-2" />
                <p className="text-sm text-zinc-500">No rules found</p>
              </div>
            ) : (
              filteredRules.map(rule => (
                <RuleListItem
                  key={rule.id}
                  rule={rule}
                  isSelected={selectedRuleId === rule.id}
                  onSelect={() => handleSelectRule(rule.id)}
                />
              ))
            )}
          </div>
        </div>

        {/* ── Right: Detail/Editor Panel ─────────────────────────────── */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Templates View */}
          {viewMode === 'templates' && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-zinc-900">Rule Templates</h2>
                <button
                  onClick={() => setViewMode('list')}
                  className="text-sm text-zinc-500 hover:text-zinc-700"
                >
                  Back to list
                </button>
              </div>
              {templates && templates.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {templates.map(t => (
                    <TemplateCard key={t.id} template={t} onUse={handleCreateFromTemplate} />
                  ))}
                </div>
              ) : (
                <p className="text-sm text-zinc-500 text-center py-8">
                  No templates available yet.
                </p>
              )}
            </div>
          )}

          {/* Create View */}
          {viewMode === 'create' && (
            <div className="max-w-xl">
              <h2 className="text-lg font-semibold text-zinc-900 mb-4">Create New Rule</h2>
              <RuleEditor
                isNew
                onSave={handleSaveNew}
                onCancel={() => setViewMode('list')}
                isSaving={createRule.isPending}
              />
            </div>
          )}

          {/* Edit View */}
          {viewMode === 'edit' && selectedRule && (
            <div className="max-w-xl">
              <h2 className="text-lg font-semibold text-zinc-900 mb-4">Edit Rule</h2>
              <RuleEditor
                initialData={{
                  name: selectedRule.name,
                  description: selectedRule.description ?? '',
                  scope: selectedRule.scope,
                  triggerEvent: selectedRule.triggerEvent,
                  priority: selectedRule.priority,
                  isActive: selectedRule.isActive,
                  cooldownMinutes: selectedRule.cooldownMinutes,
                  maxExecutions: selectedRule.maxExecutions,
                  tags: selectedRule.tags ?? [],
                }}
                isNew={false}
                onSave={handleSaveEdit}
                onCancel={() => setViewMode('detail')}
                isSaving={updateRule.isPending}
              />
            </div>
          )}

          {/* Detail View */}
          {viewMode === 'detail' && selectedRule && (
            <div>
              <div className="flex items-start justify-between mb-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <div
                      className={cn(
                        'w-2.5 h-2.5 rounded-full',
                        selectedRule.isActive ? 'bg-emerald-500' : 'bg-zinc-300'
                      )}
                    />
                    <h2 className="text-lg font-bold text-zinc-900">{selectedRule.name}</h2>
                  </div>
                  {selectedRule.description && (
                    <p className="text-sm text-zinc-500">{selectedRule.description}</p>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={handleTestRule}
                    disabled={testRule.isPending}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-zinc-200 text-xs text-zinc-600 hover:bg-zinc-50 transition-colors"
                  >
                    {testRule.isPending ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Play className="w-3.5 h-3.5" />
                    )}
                    Test
                  </button>
                  <button
                    onClick={() => setViewMode('edit')}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-zinc-200 text-xs text-zinc-600 hover:bg-zinc-50 transition-colors"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    Edit
                  </button>
                  <button
                    onClick={() => handleToggleActive(selectedRule)}
                    className={cn(
                      'flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-xs transition-colors',
                      selectedRule.isActive
                        ? 'border-amber-200 text-amber-700 hover:bg-amber-50'
                        : 'border-emerald-200 text-emerald-700 hover:bg-emerald-50'
                    )}
                  >
                    {selectedRule.isActive ? (
                      <>
                        <Pause className="w-3.5 h-3.5" />
                        Deactivate
                      </>
                    ) : (
                      <>
                        <Play className="w-3.5 h-3.5" />
                        Activate
                      </>
                    )}
                  </button>
                  <button
                    onClick={handleDelete}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-red-200 text-xs text-red-600 hover:bg-red-50 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Test result */}
              {testRule.data && (
                <div
                  className={cn(
                    'rounded-lg border p-3 mb-4',
                    testRule.data.matched
                      ? 'bg-emerald-50 border-emerald-200'
                      : 'bg-zinc-50 border-zinc-200'
                  )}
                >
                  <h4 className="text-xs font-semibold text-zinc-700 mb-1">
                    Dry Run Result:{' '}
                    {testRule.data.matched ? (
                      <span className="text-emerald-700">MATCHED</span>
                    ) : (
                      <span className="text-zinc-500">NOT MATCHED</span>
                    )}
                  </h4>
                  {testRule.data.wouldExecuteActions.length > 0 && (
                    <ul className="text-xs text-zinc-600 space-y-0.5">
                      {testRule.data.wouldExecuteActions.map((a, i) => (
                        <li key={i} className="flex items-center gap-1">
                          <Zap className="w-3 h-3 text-violet-500" />
                          {a.description || a.type}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              {/* Rule metadata grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                <div className="bg-zinc-50 rounded-lg p-3">
                  <div className="text-xs text-zinc-500">Trigger</div>
                  <div className="text-sm font-medium text-zinc-800 capitalize">
                    {selectedRule.triggerEvent.replace(/_/g, ' ')}
                  </div>
                </div>
                <div className="bg-zinc-50 rounded-lg p-3">
                  <div className="text-xs text-zinc-500">Scope</div>
                  <div className="text-sm font-medium text-zinc-800 capitalize">
                    {selectedRule.scope}
                  </div>
                </div>
                <div className="bg-zinc-50 rounded-lg p-3">
                  <div className="text-xs text-zinc-500">Priority</div>
                  <div className="text-sm font-medium text-zinc-800">{selectedRule.priority}</div>
                </div>
                <div className="bg-zinc-50 rounded-lg p-3">
                  <div className="text-xs text-zinc-500">Cooldown</div>
                  <div className="text-sm font-medium text-zinc-800">
                    {selectedRule.cooldownMinutes > 0
                      ? `${selectedRule.cooldownMinutes} min`
                      : 'None'}
                  </div>
                </div>
              </div>

              {/* Execution stats */}
              <div className="bg-white border border-zinc-200 rounded-lg p-4 mb-4">
                <h3 className="text-sm font-semibold text-zinc-900 mb-3 flex items-center gap-1.5">
                  <BarChart3 className="w-4 h-4 text-zinc-400" />
                  Execution Statistics
                </h3>
                <div className="grid grid-cols-3 gap-3">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-zinc-900 tabular-nums">
                      {selectedRule.executionCount}
                    </div>
                    <div className="text-xs text-zinc-500">Total Runs</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-emerald-600 tabular-nums">
                      {selectedRule.successCount}
                    </div>
                    <div className="text-xs text-zinc-500">Succeeded</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-red-600 tabular-nums">
                      {selectedRule.failureCount}
                    </div>
                    <div className="text-xs text-zinc-500">Failed</div>
                  </div>
                </div>
              </div>

              {/* Execution Log */}
              <div className="bg-white border border-zinc-200 rounded-lg overflow-hidden">
                <div className="px-4 py-3 border-b border-zinc-100">
                  <h3 className="text-sm font-semibold text-zinc-900">Recent Executions</h3>
                </div>
                <div className="divide-y divide-zinc-50">
                  {logsLoading ? (
                    <div className="flex items-center justify-center py-6 text-zinc-400">
                      <RefreshCw className="w-4 h-4 animate-spin mr-2" />
                      Loading logs...
                    </div>
                  ) : logs.length === 0 ? (
                    <div className="text-center py-6 text-sm text-zinc-500">No executions yet</div>
                  ) : (
                    logs.map(log => (
                      <div key={log.id} className="px-4 py-2.5 flex items-center gap-2">
                        {log.success ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                        ) : (
                          <XCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                        )}
                        <span className="text-sm text-zinc-700 flex-1">
                          {log.triggerEvent.replace(/_/g, ' ')}
                        </span>
                        {log.errorMessage && (
                          <span className="text-xs text-red-500 truncate max-w-40">
                            {log.errorMessage}
                          </span>
                        )}
                        <span className="text-xs text-zinc-400 tabular-nums flex-shrink-0">
                          {log.durationMs != null ? `${log.durationMs}ms` : '—'}
                        </span>
                        <span className="text-xs text-zinc-400 flex-shrink-0">
                          {new Date(log.createdAt).toLocaleString()}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Empty state (no rule selected) */}
          {viewMode === 'list' && !selectedRuleId && (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <Settings2 className="w-12 h-12 text-zinc-300 mx-auto mb-3" />
                <h3 className="text-base font-semibold text-zinc-700">
                  Select a rule to view details
                </h3>
                <p className="text-sm text-zinc-500 mt-1">
                  Or create a new rule to automate your workflow
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default RulesManager;
