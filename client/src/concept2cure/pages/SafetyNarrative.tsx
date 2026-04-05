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

import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  ClipboardCopy,
  Download,
  FileText,
  Inbox,
  Loader2,
  Shield,
  Sparkles,
  TrendingDown,
} from 'lucide-react';
import { GenerateButton, ExportButton } from '../components/ui/ActionButton';

// ─── Types ────────────────────────────────────────────────────────────────────

interface SafetyNarrativeProps {
  projectId?: number | null;
}

type NarrativeType = 'aggregate' | 'sae' | 'benefit-risk' | 'signal-summary' | 'cross-study';

interface Field {
  key: string;
  label: string;
  type: 'text' | 'textarea' | 'select';
  required: boolean;
  placeholder?: string;
  options?: string[];
}

interface NarrativeConfig {
  type: NarrativeType;
  label: string;
  description: string;
  icon: React.ReactNode;
  accentColor: string;
  endpoint: string;
  fields: Field[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

const fade = {
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -4 },
  transition: { duration: 0.18, ease: 'easeOut' },
};

const NARRATIVE_TYPES: NarrativeConfig[] = [
  {
    type: 'aggregate',
    label: 'Aggregate Safety Narrative',
    description: 'ICH E3 Section 12 — TEAE tables to regulatory narrative',
    icon: <FileText className="w-4 h-4 text-stone-500" aria-hidden="true" />,
    accentColor: 'indigo',
    endpoint: '/api/safety-narratives/aggregate',
    fields: [
      { key: 'studyId', label: 'Study ID', type: 'text', required: true, placeholder: 'e.g., STUDY-2026-001' },
      { key: 'studyTitle', label: 'Study Title', type: 'text', required: true, placeholder: 'Phase III randomized controlled trial...' },
      { key: 'indication', label: 'Indication', type: 'text', required: true, placeholder: 'e.g., Non-Small Cell Lung Cancer' },
      { key: 'drugName', label: 'Drug Name', type: 'text', required: false, placeholder: 'e.g., Pembrolizumab' },
      { key: 'studyPhase', label: 'Study Phase', type: 'select', required: true, options: ['Phase I', 'Phase II', 'Phase III', 'Phase IV'] },
      { key: 'narrativeType', label: 'Narrative Type', type: 'select', required: true, options: ['aggregate_teae', 'deaths_summary', 'sae_overview', 'dose_modifications'] },
    ],
  },
  {
    type: 'sae',
    label: 'SAE Case Narrative',
    description: 'Individual Serious Adverse Event narrative for CIOMS/MedWatch',
    icon: <AlertTriangle className="w-4 h-4 text-stone-900" aria-hidden="true" />,
    accentColor: 'red',
    endpoint: '/api/safety-narratives/sae',
    fields: [
      { key: 'caseId', label: 'Case ID', type: 'text', required: true, placeholder: 'e.g., SAE-0042' },
      { key: 'eventTerm', label: 'SAE Preferred Term (MedDRA)', type: 'text', required: true, placeholder: 'e.g., Hepatotoxicity' },
      { key: 'drugName', label: 'Drug Name', type: 'text', required: true, placeholder: 'e.g., Semaglutide' },
      { key: 'seriousnessCriteria', label: 'Seriousness Criteria', type: 'select', required: true, options: ['Death', 'Life-threatening', 'Hospitalization', 'Disability', 'Congenital anomaly', 'Other medically important'] },
      { key: 'narrative', label: 'Clinical Summary / Notes', type: 'textarea', required: false, placeholder: 'Provide any clinical context, demographics, concomitant medications, timelines...' },
    ],
  },
  {
    type: 'benefit-risk',
    label: 'Benefit-Risk Summary',
    description: 'FDA/EMA framework — structured benefit-risk assessment',
    icon: <TrendingDown className="w-4 h-4 text-stone-900" aria-hidden="true" />,
    accentColor: 'amber',
    endpoint: '/api/safety-narratives/benefit-risk',
    fields: [
      { key: 'indication', label: 'Indication', type: 'text', required: true, placeholder: 'e.g., Type 2 Diabetes Mellitus' },
      { key: 'treatmentName', label: 'Treatment Name', type: 'text', required: true, placeholder: 'e.g., Semaglutide 1 mg' },
      { key: 'efficacySummary', label: 'Efficacy Summary', type: 'textarea', required: true, placeholder: 'Key efficacy findings from clinical program...' },
      { key: 'safetySummary', label: 'Safety Summary', type: 'textarea', required: true, placeholder: 'Key safety findings, AE profile, serious events...' },
      { key: 'framework', label: 'Assessment Framework', type: 'select', required: true, options: ['FDA Benefit-Risk', 'EMA BRAT', 'ICH E1'] },
    ],
  },
  {
    type: 'signal-summary',
    label: 'Safety Signal Summary',
    description: 'CIOMS/ICH E2E — safety signal assessment narrative',
    icon: <Activity className="w-4 h-4 text-stone-900" aria-hidden="true" />,
    accentColor: 'orange',
    endpoint: '/api/safety-narratives/signal-summary',
    fields: [
      { key: 'signalTerm', label: 'Signal Term', type: 'text', required: true, placeholder: 'e.g., QT Prolongation' },
      { key: 'drugName', label: 'Drug Name', type: 'text', required: true, placeholder: 'e.g., Vandetanib' },
      { key: 'signalSource', label: 'Signal Source', type: 'select', required: true, options: ['Clinical trial', 'Post-marketing', 'Literature', 'Regulatory authority'] },
      { key: 'signalDetails', label: 'Signal Details', type: 'textarea', required: false, placeholder: 'Provide signal assessment context, disproportionality analysis results...' },
    ],
  },
  {
    type: 'cross-study',
    label: 'Cross-Study Safety Summary',
    description: 'Integrated safety across multiple studies for ISS/ISE',
    icon: <Shield className="w-4 h-4 text-stone-900" aria-hidden="true" />,
    accentColor: 'violet',
    endpoint: '/api/safety-narratives/cross-study',
    fields: [
      { key: 'drugName', label: 'Drug Name', type: 'text', required: true, placeholder: 'e.g., Atezolizumab' },
      { key: 'indication', label: 'Indication', type: 'text', required: true, placeholder: 'e.g., Urothelial Carcinoma' },
      { key: 'studyCount', label: 'Number of Studies', type: 'text', required: true, placeholder: 'e.g., 5' },
      { key: 'studySummary', label: 'Study Program Summary', type: 'textarea', required: false, placeholder: 'Brief overview of the clinical program, phases, designs...' },
    ],
  },
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function SafetyNarrative({ projectId }: SafetyNarrativeProps) {
  const [selectedType, setSelectedType] = useState<NarrativeType>('aggregate');
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [exporting, setExporting] = useState(false);
  const resultRef = useRef<HTMLDivElement>(null);

  const config = NARRATIVE_TYPES.find(n => n.type === selectedType);
  if (!config) return null;

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
        const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error(err.error || err.message || `Server returned ${res.status}`);
      }

      const data = await res.json();
      setResult(data.narrative || data.summary || data.result || JSON.stringify(data, null, 2));

      // Scroll result into view
      setTimeout(() => resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 100);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to generate narrative');
    } finally {
      setGenerating(false);
    }
  };

  const handleCopy = async () => {
    if (!result) return;
    await navigator.clipboard.writeText(result);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleExportDocx = async () => {
    if (!result) return;
    setExporting(true);
    try {
      const blob = new Blob([result], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `safety-narrative-${config.type}-${new Date().toISOString().slice(0, 10)}.txt`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  };

  const isFormValid = config.fields
    .filter(f => f.required)
    .every(f => formData[f.key]?.trim());

  const handleSelectType = (type: NarrativeType) => {
    setSelectedType(type);
    setFormData({});
    setResult(null);
    setError(null);
    setCopied(false);
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-stone-50">
      {/* Header */}
      <div className="shrink-0 border-b border-stone-100 bg-white px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-stone-100 rounded-lg flex items-center justify-center">
            <Shield className="w-4 h-4 text-stone-700" aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-stone-900">Safety Narrative Generator</h1>
            <p className="text-xs text-stone-500">ICH E3 · CIOMS · FDA/EMA regulatory frameworks · AI-assisted authoring</p>
          </div>
        </div>
      </div>

      <div className="flex-1 flex min-h-0">
        {/* Left: Narrative Type Selector */}
        <div className="w-80 shrink-0 border-r border-stone-100 bg-white p-4 overflow-y-auto">
          <p className="text-[11px] font-medium text-stone-400 uppercase tracking-wider mb-3">Narrative Type</p>
          <nav className="space-y-2" aria-label="Narrative types">
            {NARRATIVE_TYPES.map((nt, i) => (
              <motion.button
                key={nt.type}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.04, duration: 0.15 }}
                onClick={() => handleSelectType(nt.type)}
                aria-current={selectedType === nt.type ? 'page' : undefined}
                className={`w-full text-left p-3 rounded-lg border transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-stone-300 focus:ring-offset-1 ${
                  selectedType === nt.type
                    ? 'border-stone-300 bg-stone-100 shadow-sm'
                    : 'border-stone-100 hover:border-stone-200 hover:bg-stone-50/50'
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  {nt.icon}
                  <span className="text-sm font-medium text-stone-800">{nt.label}</span>
                </div>
                <p className="text-xs text-stone-500 ml-6">{nt.description}</p>
              </motion.button>
            ))}
          </nav>

          {/* Quick help */}
          <div className="mt-6 p-3 bg-stone-50 rounded-lg border border-stone-100">
            <p className="text-[11px] font-medium text-stone-400 uppercase tracking-wider mb-2">Quick Guide</p>
            <div className="space-y-1.5 text-xs text-stone-500">
              <p><strong className="text-stone-600">Aggregate</strong> — Full TEAE summary per ICH E3 §12</p>
              <p><strong className="text-stone-600">SAE</strong> — Individual case for CIOMS/MedWatch</p>
              <p><strong className="text-stone-600">Benefit-Risk</strong> — FDA/EMA framework assessment</p>
              <p><strong className="text-stone-600">Signal</strong> — CIOMS/ICH E2E signal evaluation</p>
              <p><strong className="text-stone-600">Cross-Study</strong> — Integrated ISS/ISE safety</p>
            </div>
          </div>
        </div>

        {/* Right: Form + Output */}
        <div className="flex-1 flex flex-col min-h-0 overflow-y-auto p-6">
          <AnimatePresence mode="wait">
            <motion.div key={selectedType} {...fade} className="space-y-6">
              {/* Form */}
              <div className="bg-white rounded-lg border border-stone-100 p-5">
                <h3 className="text-sm font-semibold text-stone-800 mb-4 flex items-center gap-2">
                  {config.icon}
                  {config.label}
                </h3>

                <div className="grid grid-cols-2 gap-4">
                  {config.fields.map(field => (
                    <div key={field.key} className={field.type === 'textarea' ? 'col-span-2' : ''}>
                      <label
                        htmlFor={`field-${field.key}`}
                        className="block text-xs font-medium text-stone-600 mb-1"
                      >
                        {field.label}
                        {field.required && <span className="text-stone-400 ml-0.5" aria-label="required">*</span>}
                      </label>
                      {field.type === 'textarea' ? (
                        <textarea
                          id={`field-${field.key}`}
                          value={formData[field.key] || ''}
                          onChange={e => setFormData(prev => ({ ...prev, [field.key]: e.target.value }))}
                          placeholder={field.placeholder}
                          aria-required={field.required}
                          rows={4}
                          className="w-full px-3 py-2 text-sm border border-stone-200 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-stone-200 focus:border-stone-400 placeholder:text-stone-300"
                        />
                      ) : field.type === 'select' ? (
                        <select
                          id={`field-${field.key}`}
                          value={formData[field.key] || ''}
                          onChange={e => setFormData(prev => ({ ...prev, [field.key]: e.target.value }))}
                          aria-required={field.required}
                          className="w-full px-3 py-2 text-sm border border-stone-200 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-stone-200 focus:border-stone-400"
                        >
                          <option value="">Select...</option>
                          {field.options?.map(opt => (
                            <option key={opt} value={opt}>{opt}</option>
                          ))}
                        </select>
                      ) : (
                        <input
                          id={`field-${field.key}`}
                          type="text"
                          value={formData[field.key] || ''}
                          onChange={e => setFormData(prev => ({ ...prev, [field.key]: e.target.value }))}
                          placeholder={field.placeholder}
                          aria-required={field.required}
                          className="w-full px-3 py-2 text-sm border border-stone-200 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-stone-200 focus:border-stone-400 placeholder:text-stone-300"
                        />
                      )}
                    </div>
                  ))}
                </div>

                <div className="mt-5 flex items-center gap-3">
                  <GenerateButton
                    label="Generate Narrative"
                    produces={`${config.label} (regulatory narrative)`}
                    isLoading={generating}
                    disabled={!isFormValid}
                    onClick={handleGenerate}
                    size="md"
                  />
                  {result && (
                    <span className="text-xs text-stone-700 flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" aria-hidden="true" />
                      Generated successfully
                    </span>
                  )}
                </div>
              </div>

              {/* Error */}
              <AnimatePresence>
                {error && (
                  <motion.div
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    className="bg-stone-100 border border-stone-200 rounded-lg p-4"
                    role="alert"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-sm text-stone-800">
                        <AlertTriangle className="w-4 h-4 shrink-0" aria-hidden="true" />
                        {error}
                      </div>
                      <button
                        onClick={handleGenerate}
                        className="text-xs font-medium text-stone-700 hover:text-stone-800 underline focus:outline-none focus:ring-2 focus:ring-stone-300 rounded ml-4"
                      >
                        Retry
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Result */}
              <AnimatePresence>
                {result && (
                  <motion.div
                    ref={resultRef}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.25 }}
                    className="bg-white rounded-lg border border-stone-100 p-5"
                  >
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-sm font-semibold text-stone-800 flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-stone-900" aria-hidden="true" />
                        Generated Narrative
                      </h3>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={handleCopy}
                          aria-label={copied ? 'Copied to clipboard' : 'Copy narrative to clipboard'}
                          className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-stone-600 bg-stone-50 rounded-md hover:bg-stone-100 transition-colors focus:outline-none focus:ring-2 focus:ring-stone-300"
                        >
                          {copied ? (
                            <>
                              <CheckCircle2 className="w-3 h-3 text-stone-900" aria-hidden="true" />
                              Copied
                            </>
                          ) : (
                            <>
                              <ClipboardCopy className="w-3 h-3" aria-hidden="true" />
                              Copy
                            </>
                          )}
                        </button>
                        <ExportButton
                          label="Download"
                          produces={`${config.label} (TXT)`}
                          isLoading={exporting}
                          onClick={handleExportDocx}
                          size="sm"
                        />
                      </div>
                    </div>

                    {/* Word count + meta */}
                    <div className="flex items-center gap-3 mb-3 text-[10px] text-stone-400">
                      <span>{result.split(/\s+/).length} words</span>
                      <span aria-hidden="true">·</span>
                      <span>{result.length} characters</span>
                      <span aria-hidden="true">·</span>
                      <span>Generated {new Date().toLocaleTimeString()}</span>
                    </div>

                    <div className="prose prose-sm max-w-none text-stone-700 whitespace-pre-wrap leading-relaxed border-t border-stone-100 pt-4">
                      {result}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Placeholder when no result */}
              {!result && !generating && !error && (
                <div className="bg-white rounded-lg border border-stone-100 py-16 text-center">
                  <Sparkles className="w-8 h-8 text-stone-200 mx-auto mb-3" aria-hidden="true" />
                  <p className="text-sm text-stone-500">Fill in the form above and click Generate</p>
                  <p className="text-xs text-stone-400 mt-1">
                    Ana will produce an ICH-compliant narrative tailored to your inputs
                  </p>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
