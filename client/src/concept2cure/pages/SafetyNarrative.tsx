/**
 * Safety Narrative — ICH E3 §12 compliant safety narrative generation
 *
 * Surfaces the 5 backend endpoints:
 * 1. Aggregate safety narrative (TEAE tables → narrative)
 * 2. Individual SAE case narratives
 * 3. Benefit-risk assessment summaries
 * 4. Safety signal assessment summaries
 * 5. Cross-study integrated safety summaries
 */

import React, { useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  FileText,
  Loader2,
  Shield,
  Sparkles,
  TrendingDown,
  Activity,
} from 'lucide-react';

interface SafetyNarrativeProps {
  projectId?: number | null;
}

type NarrativeType = 'aggregate' | 'sae' | 'benefit-risk' | 'signal-summary' | 'cross-study';

interface NarrativeConfig {
  type: NarrativeType;
  label: string;
  description: string;
  icon: React.ReactNode;
  endpoint: string;
  fields: Field[];
}

interface Field {
  key: string;
  label: string;
  type: 'text' | 'textarea' | 'select';
  required: boolean;
  placeholder?: string;
  options?: string[];
}

const NARRATIVE_TYPES: NarrativeConfig[] = [
  {
    type: 'aggregate',
    label: 'Aggregate Safety Narrative',
    description: 'ICH E3 Section 12 — TEAE tables to regulatory narrative',
    icon: <FileText className="w-4 h-4 text-indigo-500" />,
    endpoint: '/api/safety-narratives/aggregate',
    fields: [
      { key: 'studyId', label: 'Study ID', type: 'text', required: true, placeholder: 'e.g., STUDY-2026-001' },
      { key: 'studyTitle', label: 'Study Title', type: 'text', required: true, placeholder: 'Phase III randomized...' },
      { key: 'indication', label: 'Indication', type: 'text', required: true, placeholder: 'e.g., Non-Small Cell Lung Cancer' },
      { key: 'drugName', label: 'Drug Name', type: 'text', required: true, placeholder: 'e.g., Pembrolizumab' },
      { key: 'studyPhase', label: 'Study Phase', type: 'select', required: true, options: ['Phase I', 'Phase II', 'Phase III', 'Phase IV'] },
    ],
  },
  {
    type: 'sae',
    label: 'SAE Case Narrative',
    description: 'Individual Serious Adverse Event narrative for CIOMS/MedWatch',
    icon: <AlertTriangle className="w-4 h-4 text-red-500" />,
    endpoint: '/api/safety-narratives/sae',
    fields: [
      { key: 'studyId', label: 'Study ID', type: 'text', required: true },
      { key: 'subjectId', label: 'Subject ID', type: 'text', required: true, placeholder: 'e.g., SUBJ-0042' },
      { key: 'eventTerm', label: 'SAE Preferred Term', type: 'text', required: true, placeholder: 'e.g., Hepatotoxicity' },
      { key: 'seriousnessCriteria', label: 'Seriousness Criteria', type: 'select', required: true, options: ['Death', 'Life-threatening', 'Hospitalization', 'Disability', 'Congenital anomaly', 'Other medically important'] },
      { key: 'narrative', label: 'Clinical Summary', type: 'textarea', required: false, placeholder: 'Provide any clinical context...' },
    ],
  },
  {
    type: 'benefit-risk',
    label: 'Benefit-Risk Summary',
    description: 'FDA/EMA framework — structured benefit-risk assessment',
    icon: <TrendingDown className="w-4 h-4 text-amber-500" />,
    endpoint: '/api/safety-narratives/benefit-risk',
    fields: [
      { key: 'studyId', label: 'Study ID', type: 'text', required: true },
      { key: 'indication', label: 'Indication', type: 'text', required: true },
      { key: 'drugName', label: 'Drug Name', type: 'text', required: true },
      { key: 'framework', label: 'Framework', type: 'select', required: true, options: ['FDA Benefit-Risk', 'EMA BRAT', 'ICH E1'] },
    ],
  },
  {
    type: 'signal-summary',
    label: 'Safety Signal Summary',
    description: 'CIOMS/ICH E2E — safety signal assessment narrative',
    icon: <Activity className="w-4 h-4 text-orange-500" />,
    endpoint: '/api/safety-narratives/signal-summary',
    fields: [
      { key: 'signalTerm', label: 'Signal Term', type: 'text', required: true, placeholder: 'e.g., QT Prolongation' },
      { key: 'drugName', label: 'Drug Name', type: 'text', required: true },
      { key: 'signalSource', label: 'Signal Source', type: 'select', required: true, options: ['Clinical trial', 'Post-marketing', 'Literature', 'Regulatory authority'] },
    ],
  },
  {
    type: 'cross-study',
    label: 'Cross-Study Safety Summary',
    description: 'Integrated safety across multiple studies for ISS/ISE',
    icon: <Shield className="w-4 h-4 text-violet-500" />,
    endpoint: '/api/safety-narratives/cross-study',
    fields: [
      { key: 'drugName', label: 'Drug Name', type: 'text', required: true },
      { key: 'indication', label: 'Indication', type: 'text', required: true },
      { key: 'studyCount', label: 'Number of Studies', type: 'text', required: true, placeholder: 'e.g., 5' },
    ],
  },
];

export default function SafetyNarrative({ projectId }: SafetyNarrativeProps) {
  const [selectedType, setSelectedType] = useState<NarrativeType>('aggregate');
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const config = NARRATIVE_TYPES.find(n => n.type === selectedType)!;

  const handleGenerate = async () => {
    setGenerating(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch(config.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...formData, projectId }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Generation failed' }));
        throw new Error(err.error || `HTTP ${res.status}`);
      }

      const data = await res.json();
      setResult(data.narrative || data.summary || JSON.stringify(data, null, 2));
    } catch (e: any) {
      setError(e.message || 'Failed to generate narrative');
    } finally {
      setGenerating(false);
    }
  };

  const isFormValid = config.fields
    .filter(f => f.required)
    .every(f => formData[f.key]?.trim());

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-zinc-50">
      {/* Header */}
      <div className="shrink-0 border-b border-zinc-200 bg-white px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-rose-100 rounded-lg flex items-center justify-center">
            <Shield className="w-4 h-4 text-rose-600" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-zinc-900">Safety Narrative Generator</h1>
            <p className="text-xs text-zinc-500">ICH E3 · CIOMS · FDA/EMA frameworks</p>
          </div>
        </div>
      </div>

      <div className="flex-1 flex min-h-0">
        {/* Left: Narrative Type Selector */}
        <div className="w-72 shrink-0 border-r border-zinc-200 bg-white p-4 overflow-y-auto">
          <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">Narrative Type</h3>
          <div className="space-y-2">
            {NARRATIVE_TYPES.map(nt => (
              <button
                key={nt.type}
                onClick={() => {
                  setSelectedType(nt.type);
                  setFormData({});
                  setResult(null);
                  setError(null);
                }}
                className={`w-full text-left p-3 rounded-lg border transition-colors ${
                  selectedType === nt.type
                    ? 'border-violet-300 bg-violet-50'
                    : 'border-zinc-100 hover:border-zinc-200'
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  {nt.icon}
                  <span className="text-sm font-medium text-zinc-800">{nt.label}</span>
                </div>
                <p className="text-xs text-zinc-500 ml-6">{nt.description}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Right: Form + Output */}
        <div className="flex-1 flex flex-col min-h-0 overflow-y-auto p-6">
          {/* Form */}
          <div className="bg-white rounded-lg border border-zinc-200 p-5 mb-6">
            <h3 className="text-sm font-semibold text-zinc-800 mb-4 flex items-center gap-2">
              {config.icon}
              {config.label}
            </h3>
            <div className="grid grid-cols-2 gap-4">
              {config.fields.map(field => (
                <div key={field.key} className={field.type === 'textarea' ? 'col-span-2' : ''}>
                  <label className="block text-xs font-medium text-zinc-600 mb-1">
                    {field.label}
                    {field.required && <span className="text-red-400 ml-0.5">*</span>}
                  </label>
                  {field.type === 'textarea' ? (
                    <textarea
                      value={formData[field.key] || ''}
                      onChange={e => setFormData(prev => ({ ...prev, [field.key]: e.target.value }))}
                      placeholder={field.placeholder}
                      rows={3}
                      className="w-full px-3 py-2 text-sm border border-zinc-200 rounded-md focus:outline-none focus:ring-2 focus:ring-violet-200 focus:border-violet-400"
                    />
                  ) : field.type === 'select' ? (
                    <select
                      value={formData[field.key] || ''}
                      onChange={e => setFormData(prev => ({ ...prev, [field.key]: e.target.value }))}
                      className="w-full px-3 py-2 text-sm border border-zinc-200 rounded-md focus:outline-none focus:ring-2 focus:ring-violet-200 focus:border-violet-400"
                    >
                      <option value="">Select...</option>
                      {field.options?.map(opt => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      value={formData[field.key] || ''}
                      onChange={e => setFormData(prev => ({ ...prev, [field.key]: e.target.value }))}
                      placeholder={field.placeholder}
                      className="w-full px-3 py-2 text-sm border border-zinc-200 rounded-md focus:outline-none focus:ring-2 focus:ring-violet-200 focus:border-violet-400"
                    />
                  )}
                </div>
              ))}
            </div>

            <button
              onClick={handleGenerate}
              disabled={!isFormValid || generating}
              className="mt-4 flex items-center gap-2 px-4 py-2 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {generating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  Generate Narrative
                </>
              )}
            </button>
          </div>

          {/* Error */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
              <div className="flex items-center gap-2 text-sm text-red-700">
                <AlertTriangle className="w-4 h-4" />
                {error}
              </div>
            </div>
          )}

          {/* Result */}
          {result && (
            <div className="bg-white rounded-lg border border-zinc-200 p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-zinc-800 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                  Generated Narrative
                </h3>
                <button
                  onClick={() => navigator.clipboard.writeText(result)}
                  className="text-xs text-violet-600 hover:text-violet-700"
                >
                  Copy
                </button>
              </div>
              <div className="prose prose-sm max-w-none text-zinc-700 whitespace-pre-wrap">
                {result}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
