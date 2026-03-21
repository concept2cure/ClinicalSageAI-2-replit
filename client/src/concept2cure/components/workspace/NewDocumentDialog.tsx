/**
 * NewDocumentDialog — Enhanced document creation with template selection,
 * CTD section assignment, and regulatory context.
 *
 * Replaces the minimal inline text input with a proper 2-step flow:
 * 1. Choose creation mode: Blank / From Template / AI Generate
 * 2. Enter details: title, CTD section, document type
 */

import React, { useState, useMemo, useCallback, useEffect } from 'react';
import {
  FileText,
  Plus,
  Sparkles,
  BookOpen,
  X,
  ChevronRight,
  Layers,
  Tag,
  Loader2,
  ArrowLeft,
  FileCheck,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ── Types ──────────────────────────────────────────────────────────────────────

interface TemplateOption {
  id: string;
  name: string;
  description: string;
  category: string;
  ctdSection?: string;
  sections: { title: string; required?: boolean }[];
  complexity: 'simple' | 'moderate' | 'complex';
  estimatedPages?: number;
}

type CreationMode = 'blank' | 'template' | 'ai-generate';

interface NewDocumentDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateBlank: (title: string, ctdSection?: string) => void;
  onCreateFromTemplate: (templateId: string, title: string, ctdSection?: string) => void;
  onAIGenerate?: (templateId: string, title: string, ctdSection?: string) => void;
  submissionType?: string;
  isCreating?: boolean;
}

// ── CTD Sections for dropdown ────────────────────────────────────────────────

const CTD_SECTIONS = [
  { value: '', label: 'No section assignment' },
  { value: '1.2', label: '1.2 — Cover Letters' },
  { value: '1.14', label: '1.14 — Labeling' },
  { value: '2.2', label: '2.2 — Introduction' },
  { value: '2.3', label: '2.3 — Quality Overall Summary' },
  { value: '2.4', label: '2.4 — Nonclinical Overview' },
  { value: '2.5', label: '2.5 — Clinical Overview' },
  { value: '2.6', label: '2.6 — Nonclinical Summaries' },
  { value: '2.7', label: '2.7 — Clinical Summary' },
  { value: '2.7.1', label: '2.7.1 — Biopharmaceutic Studies' },
  { value: '2.7.2', label: '2.7.2 — Clinical Pharmacology' },
  { value: '2.7.3', label: '2.7.3 — Clinical Efficacy' },
  { value: '2.7.4', label: '2.7.4 — Clinical Safety' },
  { value: '3.2.S', label: '3.2.S — Drug Substance' },
  { value: '3.2.P', label: '3.2.P — Drug Product' },
  { value: '4.2', label: '4.2 — Study Reports' },
  { value: '5.3', label: '5.3 — Clinical Study Reports' },
];

// ── Built-in templates (subset for quick access) ─────────────────────────────

const QUICK_TEMPLATES: TemplateOption[] = [
  {
    id: 'blank-regulatory',
    name: 'Blank Regulatory Document',
    description: 'Start with a clean slate and regulatory formatting.',
    category: 'General',
    sections: [{ title: 'Introduction', required: true }, { title: 'Content' }],
    complexity: 'simple',
    estimatedPages: 1,
  },
  {
    id: 'clinical-overview',
    name: 'Clinical Overview (2.5)',
    description: 'Critical analysis of clinical data for NDA/BLA submission.',
    category: 'NDA',
    ctdSection: '2.5',
    sections: [
      { title: 'Product Development Rationale', required: true },
      { title: 'Overview of Biopharmaceutics', required: true },
      { title: 'Overview of Clinical Pharmacology', required: true },
      { title: 'Overview of Efficacy', required: true },
      { title: 'Overview of Safety', required: true },
      { title: 'Benefits and Risks Conclusions', required: true },
    ],
    complexity: 'complex',
    estimatedPages: 30,
  },
  {
    id: 'clinical-safety-summary',
    name: 'Clinical Safety Summary (2.7.4)',
    description: 'Comprehensive safety evaluation integrating all clinical safety data.',
    category: 'NDA',
    ctdSection: '2.7.4',
    sections: [
      { title: 'Exposure to Drug', required: true },
      { title: 'Adverse Events', required: true },
      { title: 'Laboratory Evaluations', required: true },
      { title: 'Vital Signs', required: true },
      { title: 'Safety in Special Groups', required: true },
    ],
    complexity: 'complex',
    estimatedPages: 60,
  },
  {
    id: 'csr-synopsis',
    name: 'CSR Synopsis',
    description: 'Clinical Study Report synopsis per ICH E3.',
    category: 'General',
    ctdSection: '5.3',
    sections: [
      { title: 'Study Information', required: true },
      { title: 'Objectives', required: true },
      { title: 'Methodology', required: true },
      { title: 'Results', required: true },
      { title: 'Conclusions', required: true },
    ],
    complexity: 'moderate',
    estimatedPages: 5,
  },
  {
    id: 'quality-overall-summary',
    name: 'Quality Overall Summary (2.3)',
    description: 'Summary of Module 3 quality (CMC) data.',
    category: 'NDA',
    ctdSection: '2.3',
    sections: [
      { title: 'Introduction', required: true },
      { title: 'Drug Substance', required: true },
      { title: 'Drug Product', required: true },
      { title: 'Appendices' },
    ],
    complexity: 'complex',
    estimatedPages: 40,
  },
  {
    id: 'cover-letter',
    name: 'Cover Letter',
    description: 'Regulatory submission cover letter with cross-references.',
    category: 'General',
    ctdSection: '1.2',
    sections: [
      { title: 'Addressee', required: true },
      { title: 'Submission Purpose', required: true },
      { title: 'Contents Summary', required: true },
      { title: 'Contact Information', required: true },
    ],
    complexity: 'simple',
    estimatedPages: 2,
  },
];

// ── Component ────────────────────────────────────────────────────────────────

export function NewDocumentDialog({
  isOpen,
  onClose,
  onCreateBlank,
  onCreateFromTemplate,
  onAIGenerate,
  submissionType,
  isCreating,
}: NewDocumentDialogProps) {
  const [step, setStep] = useState<1 | 2>(1);
  const [mode, setMode] = useState<CreationMode>('blank');
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateOption | null>(null);
  const [title, setTitle] = useState('');
  const [ctdSection, setCtdSection] = useState('');

  const reset = useCallback(() => {
    setStep(1);
    setMode('blank');
    setSelectedTemplate(null);
    setTitle('');
    setCtdSection('');
  }, []);

  const handleClose = useCallback(() => {
    reset();
    onClose();
  }, [reset, onClose]);

  const handleCreate = useCallback(() => {
    const docTitle = title.trim() || selectedTemplate?.name || 'Untitled Document';
    const section = ctdSection || selectedTemplate?.ctdSection || undefined;

    if (mode === 'ai-generate' && selectedTemplate && onAIGenerate) {
      onAIGenerate(selectedTemplate.id, docTitle, section);
    } else if (mode === 'template' && selectedTemplate) {
      onCreateFromTemplate(selectedTemplate.id, docTitle, section);
    } else {
      onCreateBlank(docTitle, section);
    }
  }, [mode, title, ctdSection, selectedTemplate, onCreateBlank, onCreateFromTemplate, onAIGenerate]);

  // Escape key to close dialog
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handleClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div role="dialog" aria-modal="true" aria-label="Create new document" className="w-full max-w-2xl rounded-xl bg-white shadow-lg border border-zinc-200 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-100">
          <div className="flex items-center gap-3">
            {step === 2 && (
              <button
                onClick={() => setStep(1)}
                className="p-1 text-zinc-400 hover:text-zinc-600 rounded-md hover:bg-zinc-100"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
            )}
            <div>
              <h2 className="text-base font-semibold text-zinc-900">
                {step === 1 ? 'Create New Document' : 'Document Details'}
              </h2>
              <p className="text-xs text-zinc-500 mt-0.5">
                {step === 1 ? 'Choose how to start your document' : 'Configure your new document'}
              </p>
            </div>
          </div>
          <button onClick={handleClose} aria-label="Close dialog" title="Close" className="p-1.5 text-zinc-400 hover:text-zinc-600 rounded-md hover:bg-zinc-100 focus-visible:ring-2 focus-visible:ring-blue-500 outline-none">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Step 1: Choose mode */}
        {step === 1 && (
          <div className="p-6">
            {/* Mode cards */}
            <div className="grid grid-cols-3 gap-3 mb-6">
              <button
                onClick={() => { setMode('blank'); setSelectedTemplate(null); setStep(2); }}
                className={cn(
                  'flex flex-col items-center gap-2 p-4 rounded-lg border transition-all text-center',
                  'border-zinc-200 hover:border-blue-300 hover:bg-blue-50/50',
                )}
              >
                <div className="h-10 w-10 rounded-lg bg-zinc-100 flex items-center justify-center">
                  <FileText className="h-5 w-5 text-zinc-500" />
                </div>
                <span className="text-sm font-semibold text-zinc-900">Blank Document</span>
                <span className="text-[11px] text-zinc-500">Start from scratch</span>
              </button>

              <button
                onClick={() => { setMode('template'); }}
                className={cn(
                  'flex flex-col items-center gap-2 p-4 rounded-lg border transition-all text-center',
                  mode === 'template'
                    ? 'border-blue-400 bg-blue-50'
                    : 'border-zinc-200 hover:border-blue-300 hover:bg-blue-50/50',
                )}
              >
                <div className="h-10 w-10 rounded-lg bg-blue-100 flex items-center justify-center">
                  <BookOpen className="h-5 w-5 text-blue-500" />
                </div>
                <span className="text-sm font-semibold text-zinc-900">From Template</span>
                <span className="text-[11px] text-zinc-500">Pre-structured sections</span>
              </button>

              <button
                onClick={() => { setMode('ai-generate'); }}
                className={cn(
                  'flex flex-col items-center gap-2 p-4 rounded-lg border transition-all text-center',
                  mode === 'ai-generate'
                    ? 'border-violet-400 bg-violet-50'
                    : 'border-zinc-200 hover:border-blue-200 hover:bg-blue-50/50',
                )}
              >
                <div className="h-10 w-10 rounded-lg bg-violet-100 flex items-center justify-center">
                  <Sparkles className="h-5 w-5 text-violet-500" />
                </div>
                <span className="text-sm font-semibold text-zinc-900">AI Generate</span>
                <span className="text-[11px] text-zinc-500">AI-drafted content</span>
              </button>
            </div>

            {/* Template grid (shown when template or ai-generate is selected) */}
            {(mode === 'template' || mode === 'ai-generate') && (
              <div>
                <h3 className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-3">
                  Choose a Template
                </h3>
                <div className="grid grid-cols-2 gap-2 max-h-[280px] overflow-y-auto">
                  {QUICK_TEMPLATES.map(t => (
                    <button
                      key={t.id}
                      onClick={() => { setSelectedTemplate(t); setCtdSection(t.ctdSection || ''); setStep(2); }}
                      className={cn(
                        'flex items-start gap-3 p-3 rounded-lg border text-left transition-all duration-150',
                        selectedTemplate?.id === t.id
                          ? 'border-blue-300 bg-blue-50'
                          : 'border-zinc-200 hover:border-zinc-300 hover:bg-zinc-50',
                      )}
                    >
                      <FileCheck className="h-4 w-4 text-blue-400 mt-0.5 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-zinc-900 leading-tight">{t.name}</p>
                        <p className="text-[11px] text-zinc-500 mt-0.5 line-clamp-2">{t.description}</p>
                        <div className="flex items-center gap-2 mt-1.5">
                          {t.ctdSection && (
                            <span className="text-[10px] text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded font-medium">
                              {t.ctdSection}
                            </span>
                          )}
                          <span className="text-[10px] text-zinc-400">
                            {t.sections.length} sections
                          </span>
                          {t.estimatedPages && (
                            <span className="text-[10px] text-zinc-400">~{t.estimatedPages}p</span>
                          )}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Step 2: Document details */}
        {step === 2 && (
          <div className="p-6 space-y-4">
            {/* Selected template indicator */}
            {selectedTemplate && (
              <div className="flex items-center gap-2 p-2.5 rounded-lg bg-blue-50 border border-blue-200">
                <FileCheck className="h-4 w-4 text-blue-500 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-blue-700">{selectedTemplate.name}</p>
                  <p className="text-[10px] text-blue-500">{selectedTemplate.sections.length} sections · {selectedTemplate.complexity}</p>
                </div>
                {mode === 'ai-generate' && (
                  <span className="text-[10px] font-medium text-violet-600 bg-violet-100 px-2 py-0.5 rounded-full flex items-center gap-1">
                    <Sparkles className="h-2.5 w-2.5" />
                    AI will generate content
                  </span>
                )}
                <button
                  onClick={() => { setSelectedTemplate(null); setStep(1); }}
                  className="text-blue-400 hover:text-blue-600 p-0.5"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            )}

            {/* Title input */}
            <div>
              <label className="block text-xs font-medium text-zinc-600 mb-1.5">
                Document Title
              </label>
              <input
                type="text"
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder={selectedTemplate?.name || 'Enter document title...'}
                className="w-full px-3 py-2 text-sm rounded-lg border border-zinc-200 focus-visible:ring-2 outline-none focus:ring-blue-200 focus:border-blue-400"
                autoFocus
                onKeyDown={e => {
                  if (e.key === 'Enter' && !isCreating) handleCreate();
                  if (e.key === 'Escape') handleClose();
                }}
              />
            </div>

            {/* CTD Section */}
            <div>
              <label className="block text-xs font-medium text-zinc-600 mb-1.5">
                CTD Section
                <span className="text-zinc-400 font-normal ml-1">(optional)</span>
              </label>
              <select
                value={ctdSection}
                onChange={e => setCtdSection(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-zinc-200 focus-visible:ring-2 outline-none focus:ring-blue-200 focus:border-blue-400 bg-white"
              >
                {CTD_SECTIONS.map(s => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </div>

            {/* Template sections preview */}
            {selectedTemplate && selectedTemplate.sections.length > 0 && (
              <div>
                <label className="block text-xs font-medium text-zinc-600 mb-1.5">
                  Template Sections
                </label>
                <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-2.5 max-h-32 overflow-y-auto">
                  {selectedTemplate.sections.map((s, i) => (
                    <div key={i} className="flex items-center gap-2 py-0.5">
                      <span className="text-[10px] text-zinc-400 w-4 text-right">{i + 1}.</span>
                      <span className="text-xs text-zinc-700">{s.title}</span>
                      {s.required && <span className="text-[9px] text-red-400">*</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        {step === 2 && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-zinc-100 bg-zinc-50/50">
            <button
              onClick={handleClose}
              className="px-4 py-2 text-sm text-zinc-500 hover:text-zinc-700 rounded-lg hover:bg-zinc-100 transition-colors duration-150"
            >
              Cancel
            </button>
            <button
              onClick={handleCreate}
              disabled={isCreating}
              className={cn(
                'flex items-center gap-2 px-5 py-2 text-sm font-medium rounded-lg transition-colors duration-150',
                mode === 'ai-generate'
                  ? 'bg-blue-600 text-white hover:bg-blue-700'
                  : 'bg-blue-600 text-white hover:bg-blue-700',
                'disabled:opacity-50',
              )}
            >
              {isCreating ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : mode === 'ai-generate' ? (
                <Sparkles className="h-3.5 w-3.5" />
              ) : (
                <Plus className="h-3.5 w-3.5" />
              )}
              {isCreating
                ? 'Creating...'
                : mode === 'ai-generate'
                  ? 'Generate with AI'
                  : 'Create Document'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
