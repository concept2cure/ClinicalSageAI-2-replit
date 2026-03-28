/**
 * TemplateGeneratorPanel — AI-powered regulatory template prompt blocks.
 *
 * Fetches available templates from the backend, lets users fill in variable
 * slots, and generates regulatory content with Data Room evidence injection.
 * Results are returned as generated text ready to insert into the editor.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  FileText,
  Sparkles,
  Loader2,
  X,
  ChevronDown,
  ChevronRight,
  Clock,
  Database,
  Check,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { apiRequest } from '@/lib/queryClient';

// ── Types ───────────────────────────────────────────────────────────────────

interface PromptVariable {
  name: string;
  label: string;
  placeholder: string;
  required: boolean;
  type: 'text' | 'textarea' | 'select';
  options?: string[];
}

interface Template {
  id: string;
  name: string;
  category: string;
  description: string;
  variables: PromptVariable[];
  estimatedWords: number;
}

interface GenerationMetrics {
  wordCount: number;
  latencyMs: number;
  sourcesRetrieved: number;
  wordsPerMinute: number;
}

interface TemplateGeneratorPanelProps {
  projectId?: string;
  artifactId?: string | number;
  onGenerated: (content: string, templateName: string) => void;
  onClose: () => void;
}

const CATEGORY_LABELS: Record<string, string> = {
  ctd: 'CTD Modules',
  csr: 'Clinical Study Reports',
  ind: 'IND Submissions',
  safety: 'Safety & Pharmacovigilance',
  regulatory: 'Regulatory Correspondence',
};

// ── Component ───────────────────────────────────────────────────────────────

const TemplateGeneratorPanel: React.FC<TemplateGeneratorPanelProps> = ({
  projectId,
  artifactId,
  onGenerated,
  onClose,
}) => {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [variableValues, setVariableValues] = useState<Record<string, string>>({});
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<GenerationMetrics | null>(null);
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);

  // Fetch templates on mount
  useEffect(() => {
    (async () => {
      try {
        const res = await apiRequest('GET', '/api/concept2cure/ai/templates');
        if (res.ok) {
          const payload = await res.json();
          const data = payload.data?.templates ?? payload.templates ?? [];
          setTemplates(data);
          // Expand first category by default
          if (data.length > 0) {
            setExpandedCategory(data[0].category);
          }
        }
      } catch {
        // Templates unavailable
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleSelectTemplate = useCallback((template: Template) => {
    setSelectedTemplate(template);
    setResult(null);
    setMetrics(null);
    // Pre-fill variable values with empty strings
    const initial: Record<string, string> = {};
    for (const v of template.variables) {
      initial[v.name] = '';
    }
    setVariableValues(initial);
  }, []);

  const handleGenerate = useCallback(async () => {
    if (!selectedTemplate) return;
    setGenerating(true);
    setResult(null);
    setMetrics(null);

    try {
      const res = await apiRequest(
        'POST',
        `/api/concept2cure/ai/templates/${selectedTemplate.id}/generate`,
        {
          variables: variableValues,
          projectId: projectId || undefined,
          artifactId: artifactId || undefined,
        }
      );

      if (res.ok) {
        const payload = await res.json();
        const content = payload.data?.result ?? payload.result ?? '';
        const m = payload.data?.metrics ?? payload.metrics;
        setResult(content);
        if (m) setMetrics(m);
      }
    } catch {
      // Generation failed
    } finally {
      setGenerating(false);
    }
  }, [selectedTemplate, variableValues, projectId, artifactId]);

  const isFormValid = selectedTemplate?.variables
    .filter(v => v.required)
    .every(v => variableValues[v.name]?.trim());

  // Group templates by category
  const grouped = templates.reduce<Record<string, Template[]>>((acc, t) => {
    (acc[t.category] ||= []).push(t);
    return acc;
  }, {});

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-stone-200 bg-gradient-to-r from-violet-50/50 to-white">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-violet-100 flex items-center justify-center">
            <FileText className="w-4 h-4 text-violet-600" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-stone-800">Template Generator</h3>
            <p className="text-[11px] text-stone-500">AI-powered regulatory templates with variable insertion</p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="w-7 h-7 rounded-lg hover:bg-stone-100 flex items-center justify-center transition-colors"
        >
          <X className="w-4 h-4 text-stone-500" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-5 h-5 animate-spin text-stone-400" />
          </div>
        ) : !selectedTemplate ? (
          /* ── Template selection ─────────────────────────────────── */
          <div className="p-3 space-y-1">
            {Object.entries(grouped).map(([category, items]) => (
              <div key={category}>
                <button
                  onClick={() => setExpandedCategory(expandedCategory === category ? null : category)}
                  className="w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-stone-50 transition-colors"
                >
                  <span className="text-xs font-semibold text-stone-500 uppercase tracking-wider">
                    {CATEGORY_LABELS[category] || category}
                  </span>
                  {expandedCategory === category ? (
                    <ChevronDown className="w-3.5 h-3.5 text-stone-400" />
                  ) : (
                    <ChevronRight className="w-3.5 h-3.5 text-stone-400" />
                  )}
                </button>
                {expandedCategory === category && (
                  <div className="space-y-1 ml-1 mb-2">
                    {items.map(t => (
                      <button
                        key={t.id}
                        onClick={() => handleSelectTemplate(t)}
                        className="w-full text-left px-3 py-2.5 rounded-lg border border-stone-150 hover:border-violet-200 hover:bg-violet-50/30 transition-all duration-150 group"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium text-stone-700 group-hover:text-violet-700">
                            {t.name}
                          </span>
                          <span className="text-[10px] text-stone-400">
                            ~{t.estimatedWords} words
                          </span>
                        </div>
                        <p className="text-xs text-stone-500 mt-0.5 leading-relaxed">{t.description}</p>
                        <div className="flex gap-1 mt-1.5">
                          {t.variables.filter(v => v.required).map(v => (
                            <span
                              key={v.name}
                              className="text-[10px] px-1.5 py-0.5 rounded bg-stone-100 text-stone-500"
                            >
                              {v.label}
                            </span>
                          ))}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : result ? (
          /* ── Generated result ──────────────────────────────────── */
          <div className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-violet-500" />
                <span className="text-sm font-semibold text-stone-700">
                  Generated: {selectedTemplate.name}
                </span>
              </div>
              <button
                onClick={() => {
                  setSelectedTemplate(null);
                  setResult(null);
                  setMetrics(null);
                }}
                className="text-xs text-stone-500 hover:text-stone-700"
              >
                ← Back to templates
              </button>
            </div>

            {/* Metrics */}
            {metrics && (
              <div className="flex gap-3 text-[11px]">
                <span className="flex items-center gap-1 text-stone-500">
                  <Clock className="w-3 h-3" />
                  {(metrics.latencyMs / 1000).toFixed(1)}s
                </span>
                <span className="text-stone-500">
                  {metrics.wordCount} words
                </span>
                <span className="text-stone-500">
                  {metrics.wordsPerMinute} words/min
                </span>
                {metrics.sourcesRetrieved > 0 && (
                  <span className="flex items-center gap-1 text-emerald-600">
                    <Database className="w-3 h-3" />
                    {metrics.sourcesRetrieved} source{metrics.sourcesRetrieved !== 1 ? 's' : ''} cited
                  </span>
                )}
              </div>
            )}

            {/* Preview */}
            <div className="bg-stone-50 rounded-lg border border-stone-200 p-4 max-h-80 overflow-y-auto">
              <div
                className="prose prose-sm prose-stone max-w-none text-[13px] leading-relaxed"
                style={{ whiteSpace: 'pre-wrap' }}
              >
                {result}
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-2">
              <button
                onClick={() => {
                  onGenerated(result, selectedTemplate.name);
                }}
                className="flex-1 px-4 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition-colors shadow-sm flex items-center justify-center gap-1.5"
              >
                <Check className="w-3.5 h-3.5" />
                Insert into Editor
              </button>
              <button
                onClick={handleGenerate}
                disabled={generating}
                className="px-4 py-2 text-sm font-medium text-stone-600 bg-white border border-stone-200 rounded-lg hover:bg-stone-50 transition-colors"
              >
                Regenerate
              </button>
            </div>
          </div>
        ) : (
          /* ── Variable form ─────────────────────────────────────── */
          <div className="p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-sm font-semibold text-stone-700">{selectedTemplate.name}</h4>
                <p className="text-xs text-stone-500 mt-0.5">{selectedTemplate.description}</p>
              </div>
              <button
                onClick={() => setSelectedTemplate(null)}
                className="text-xs text-stone-500 hover:text-stone-700"
              >
                ← Back
              </button>
            </div>

            {/* Variable inputs */}
            <div className="space-y-3">
              {selectedTemplate.variables.map(v => (
                <div key={v.name}>
                  <label className="block text-xs font-medium text-stone-600 mb-1">
                    {v.label}
                    {v.required && <span className="text-red-400 ml-0.5">*</span>}
                  </label>
                  {v.type === 'select' ? (
                    <select
                      value={variableValues[v.name] || ''}
                      onChange={e => setVariableValues(prev => ({ ...prev, [v.name]: e.target.value }))}
                      className="w-full px-3 py-2 text-sm border border-stone-200 rounded-lg focus-visible:ring-2 focus-visible:ring-violet-400 outline-none bg-white"
                    >
                      <option value="">{v.placeholder}</option>
                      {v.options?.map(opt => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
                  ) : v.type === 'textarea' ? (
                    <textarea
                      value={variableValues[v.name] || ''}
                      onChange={e => setVariableValues(prev => ({ ...prev, [v.name]: e.target.value }))}
                      placeholder={v.placeholder}
                      rows={3}
                      className="w-full px-3 py-2 text-sm border border-stone-200 rounded-lg focus-visible:ring-2 focus-visible:ring-violet-400 outline-none resize-none"
                    />
                  ) : (
                    <input
                      type="text"
                      value={variableValues[v.name] || ''}
                      onChange={e => setVariableValues(prev => ({ ...prev, [v.name]: e.target.value }))}
                      placeholder={v.placeholder}
                      className="w-full px-3 py-2 text-sm border border-stone-200 rounded-lg focus-visible:ring-2 focus-visible:ring-violet-400 outline-none"
                    />
                  )}
                </div>
              ))}
            </div>

            {/* Generate button */}
            <button
              onClick={handleGenerate}
              disabled={!isFormValid || generating}
              className={cn(
                'w-full px-4 py-2.5 text-sm font-medium rounded-lg transition-all duration-150 flex items-center justify-center gap-2 shadow-sm',
                isFormValid && !generating
                  ? 'bg-violet-600 text-white hover:bg-violet-700'
                  : 'bg-stone-100 text-stone-400 cursor-not-allowed'
              )}
            >
              {generating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Generating (~{selectedTemplate.estimatedWords} words)...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  Generate {selectedTemplate.name}
                </>
              )}
            </button>

            {projectId && (
              <p className="text-[11px] text-stone-400 text-center">
                Data Room evidence will be automatically retrieved and cited
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default TemplateGeneratorPanel;
