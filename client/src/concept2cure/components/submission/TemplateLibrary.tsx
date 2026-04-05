/**
 * TemplateLibrary — Comprehensive regulatory document template browser.
 *
 * Browse and create documents from pre-structured templates for:
 * - IND, NDA/BLA, 510(k), PMA, MAA submissions
 * - Each template has pre-structured sections, guidance annotations
 * - "Generate from template" creates a full artifact with AI-filled placeholders
 */

import React, { useState, useMemo, useCallback } from 'react';
import {
  BookOpen,
  Search,
  FileText,
  Plus,
  Star,
  Clock,
  Filter,
  ChevronRight,
  Sparkles,
  Tag,
  Layers,
  X,
  Check,
  Loader2,
  ArrowRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ── Types ──────────────────────────────────────────────────────────────────────

type SubmissionCategory = 'IND' | 'NDA' | 'BLA' | '510k' | 'PMA' | 'MAA' | 'General';
type TemplateComplexity = 'simple' | 'moderate' | 'complex';

interface TemplateSection {
  title: string;
  guidance?: string;
  required?: boolean;
}

interface DocumentTemplate {
  id: string;
  name: string;
  description: string;
  category: SubmissionCategory;
  packageTags?: string[];
  ctdModule?: string;
  ctdSection?: string;
  sections: TemplateSection[];
  complexity: TemplateComplexity;
  estimatedPages?: number;
  tags: string[];
  aiGenerable: boolean;
}

interface TemplateLibraryProps {
  onSelectTemplate?: (template: DocumentTemplate) => void;
  onGenerateFromTemplate?: (template: DocumentTemplate) => void;
  onClose?: () => void;
  isGenerating?: boolean;
}

// ── Template definitions ─────────────────────────────────────────────────────

const TEMPLATES: DocumentTemplate[] = [
  // ── IND Templates ──
  {
    id: 'ind-cover-letter',
    name: 'IND Cover Letter',
    description: 'Cover letter for Initial IND submission to FDA with Form 1571 references.',
    category: 'IND',
    packageTags: ['ind-core', 'ind-initial'],
    ctdModule: '1',
    ctdSection: '1.2',
    sections: [
      { title: 'Addressee and Subject', required: true },
      { title: 'Submission Purpose', required: true },
      { title: 'Cross-References', guidance: 'List any referenced INDs or DMFs' },
      { title: 'Contents Summary', required: true },
      { title: 'Contact Information', required: true },
    ],
    complexity: 'simple',
    estimatedPages: 2,
    tags: ['IND', 'Cover Letter', 'Module 1'],
    aiGenerable: true,
  },
  {
    id: 'ind-investigator-brochure',
    name: 'Investigator\'s Brochure (IB)',
    description: 'Comprehensive compilation of clinical and nonclinical data relevant to the study drug.',
    category: 'IND',
    packageTags: ['ind-core', 'ind-initial'],
    ctdModule: '5',
    sections: [
      { title: 'Title Page', required: true },
      { title: 'Table of Contents', required: true },
      { title: 'Summary', required: true, guidance: 'Brief summary (2 pages max) of key information' },
      { title: 'Introduction', required: true },
      { title: 'Physical, Chemical, and Pharmaceutical Properties', required: true },
      { title: 'Nonclinical Studies', required: true, guidance: 'PK, toxicology, pharmacology summaries' },
      { title: 'Effects in Humans', required: true, guidance: 'PK, safety, efficacy, dose-response' },
      { title: 'Summary of Data and Guidance for the Investigator', required: true },
      { title: 'References' },
    ],
    complexity: 'complex',
    estimatedPages: 80,
    tags: ['IND', 'IB', 'Module 5', 'ICH E6'],
    aiGenerable: true,
  },
  {
    id: 'ind-clinical-protocol',
    name: 'Clinical Study Protocol',
    description: 'Phase I/II/III clinical study protocol per ICH E6(R2) and FDA guidance.',
    category: 'IND',
    packageTags: ['ind-core', 'ind-initial'],
    ctdModule: '5',
    ctdSection: '5.3',
    sections: [
      { title: 'Title Page', required: true },
      { title: 'Synopsis', required: true },
      { title: 'Table of Contents', required: true },
      { title: 'Introduction and Rationale', required: true },
      { title: 'Study Objectives', required: true },
      { title: 'Study Design', required: true, guidance: 'Design type, blinding, randomization' },
      { title: 'Study Population', required: true, guidance: 'Inclusion/exclusion criteria' },
      { title: 'Treatment Plan', required: true, guidance: 'Dosing, administration, duration' },
      { title: 'Efficacy Assessments', required: true },
      { title: 'Safety Assessments', required: true },
      { title: 'Statistical Analysis Plan', required: true },
      { title: 'Ethical Considerations', required: true },
      { title: 'References' },
      { title: 'Appendices' },
    ],
    complexity: 'complex',
    estimatedPages: 60,
    tags: ['IND', 'Protocol', 'ICH E6', 'Module 5'],
    aiGenerable: true,
  },

  // ── NDA/BLA Templates ──
  {
    id: 'nda-clinical-overview',
    name: 'Clinical Overview (2.5)',
    description: 'Critical analysis of clinical data providing overall interpretation of evidence.',
    category: 'NDA',
    ctdModule: '2',
    ctdSection: '2.5',
    sections: [
      { title: 'Product Development Rationale', required: true },
      { title: 'Overview of Biopharmaceutics', required: true },
      { title: 'Overview of Clinical Pharmacology', required: true },
      { title: 'Overview of Efficacy', required: true },
      { title: 'Overview of Safety', required: true },
      { title: 'Benefits and Risks Conclusions', required: true },
      { title: 'References' },
    ],
    complexity: 'complex',
    estimatedPages: 30,
    tags: ['NDA', 'BLA', 'Clinical Overview', 'Module 2.5'],
    aiGenerable: true,
  },
  {
    id: 'nda-quality-overall-summary',
    name: 'Quality Overall Summary (2.3)',
    description: 'Summary of Module 3 quality (CMC) data for drug substance and drug product.',
    category: 'NDA',
    ctdModule: '2',
    ctdSection: '2.3',
    sections: [
      { title: 'Introduction', required: true },
      { title: 'Drug Substance', required: true, guidance: 'General information, manufacture, characterization, controls' },
      { title: 'Drug Product', required: true, guidance: 'Description, composition, development, manufacture' },
      { title: 'Appendices', guidance: 'Facilities, excipients, container closure' },
      { title: 'Regional Information' },
    ],
    complexity: 'complex',
    estimatedPages: 40,
    tags: ['NDA', 'QOS', 'CMC', 'Module 2.3'],
    aiGenerable: true,
  },
  {
    id: 'nda-nonclinical-overview',
    name: 'Nonclinical Overview (2.4)',
    description: 'Integrated assessment of nonclinical evaluation strategy and findings.',
    category: 'NDA',
    ctdModule: '2',
    ctdSection: '2.4',
    sections: [
      { title: 'Overview of Nonclinical Testing Strategy', required: true },
      { title: 'Pharmacology', required: true },
      { title: 'Pharmacokinetics', required: true },
      { title: 'Toxicology', required: true },
      { title: 'Integrated Overview and Conclusions', required: true },
      { title: 'References' },
    ],
    complexity: 'complex',
    estimatedPages: 25,
    tags: ['NDA', 'BLA', 'Nonclinical', 'Module 2.4'],
    aiGenerable: true,
  },
  {
    id: 'nda-clinical-summary-efficacy',
    name: 'Summary of Clinical Efficacy (2.7.3)',
    description: 'Detailed summary presenting the efficacy database for the proposed indication.',
    category: 'NDA',
    ctdModule: '2',
    ctdSection: '2.7.3',
    sections: [
      { title: 'Background and Overview of Clinical Efficacy', required: true },
      { title: 'Summary of Results of Individual Studies', required: true },
      { title: 'Comparison and Analyses of Results Across Studies', required: true },
      { title: 'Analysis of Clinical Information Relevant to Dosing', required: true },
      { title: 'Persistence of Efficacy and Tolerance Effects' },
      { title: 'References' },
    ],
    complexity: 'complex',
    estimatedPages: 50,
    tags: ['NDA', 'BLA', 'Efficacy', 'Module 2.7.3'],
    aiGenerable: true,
  },
  {
    id: 'nda-clinical-summary-safety',
    name: 'Summary of Clinical Safety (2.7.4)',
    description: 'Comprehensive safety evaluation integrating all clinical safety data.',
    category: 'NDA',
    ctdModule: '2',
    ctdSection: '2.7.4',
    sections: [
      { title: 'Exposure to the Drug', required: true },
      { title: 'Adverse Events', required: true },
      { title: 'Clinical Laboratory Evaluations', required: true },
      { title: 'Vital Signs, Physical Findings, and Other Observations', required: true },
      { title: 'Safety in Special Groups and Situations', required: true },
      { title: 'Post-Marketing Data' },
      { title: 'References' },
    ],
    complexity: 'complex',
    estimatedPages: 60,
    tags: ['NDA', 'BLA', 'Safety', 'Module 2.7.4'],
    aiGenerable: true,
  },

  // ── 510(k) Templates ──
  {
    id: '510k-cover-letter',
    name: '510(k) Cover Letter',
    description: 'Cover letter for a traditional or abbreviated 510(k) premarket notification.',
    category: '510k',
    ctdModule: '1',
    sections: [
      { title: 'Submission Type and Device', required: true },
      { title: 'Predicate Device Identification', required: true },
      { title: 'Regulatory Classification', required: true },
      { title: 'Contents Summary', required: true },
      { title: 'Contact Information', required: true },
    ],
    complexity: 'simple',
    estimatedPages: 2,
    tags: ['510k', 'Cover Letter', 'Device'],
    aiGenerable: true,
  },
  {
    id: '510k-substantial-equivalence',
    name: 'Substantial Equivalence Discussion',
    description: 'SE comparison between subject device and predicate device per FDA guidance.',
    category: '510k',
    ctdModule: '1',
    sections: [
      { title: 'Device Description — Subject Device', required: true },
      { title: 'Device Description — Predicate Device', required: true },
      { title: 'Comparison Table', required: true, guidance: 'Side-by-side feature/specification comparison' },
      { title: 'Intended Use Comparison', required: true },
      { title: 'Technological Characteristics', required: true },
      { title: 'Performance Data Summary', required: true },
      { title: 'Conclusion of Substantial Equivalence', required: true },
    ],
    complexity: 'moderate',
    estimatedPages: 15,
    tags: ['510k', 'SE', 'Predicate', 'Device'],
    aiGenerable: true,
  },

  // ── MAA Templates ──
  {
    id: 'maa-clinical-expert-report',
    name: 'Clinical Expert Report',
    description: 'Expert evaluation of clinical data for EU Marketing Authorisation Application.',
    category: 'MAA',
    ctdModule: '2',
    ctdSection: '2.5',
    sections: [
      { title: 'Introduction', required: true },
      { title: 'Clinical Pharmacology', required: true },
      { title: 'Clinical Efficacy', required: true },
      { title: 'Clinical Safety', required: true },
      { title: 'Risk-Benefit Assessment', required: true },
      { title: 'References' },
    ],
    complexity: 'complex',
    estimatedPages: 35,
    tags: ['MAA', 'EU', 'Clinical Expert', 'Module 2'],
    aiGenerable: true,
  },

  // ── General Templates ──
  {
    id: 'gen-risk-management',
    name: 'Risk Management Plan',
    description: 'ICH-aligned risk management plan documenting safety specification and minimization measures.',
    category: 'General',
    sections: [
      { title: 'Safety Specification', required: true, guidance: 'Epidemiology, nonclinical/clinical safety profile' },
      { title: 'Pharmacovigilance Plan', required: true },
      { title: 'Risk Minimization Measures', required: true },
      { title: 'Summary of the Risk Management Plan', required: true },
    ],
    complexity: 'moderate',
    estimatedPages: 20,
    tags: ['Risk Management', 'ICH E2E', 'Safety'],
    aiGenerable: true,
  },
  {
    id: 'gen-csr-synopsis',
    name: 'CSR Synopsis',
    description: 'Clinical Study Report synopsis per ICH E3 guideline structure.',
    category: 'General',
    sections: [
      { title: 'Study Information', required: true },
      { title: 'Objectives', required: true },
      { title: 'Methodology', required: true, guidance: 'Design, duration, endpoints, statistical methods' },
      { title: 'Study Population', required: true },
      { title: 'Efficacy Results', required: true },
      { title: 'Safety Results', required: true },
      { title: 'Conclusions', required: true },
    ],
    complexity: 'moderate',
    estimatedPages: 5,
    tags: ['CSR', 'Synopsis', 'ICH E3'],
    aiGenerable: true,
  },
];

// ── Complexity badge ─────────────────────────────────────────────────────────

function complexityBadge(c: TemplateComplexity) {
  const styles: Record<TemplateComplexity, string> = {
    simple: 'text-stone-800 bg-stone-100',
    moderate: 'text-stone-700 bg-stone-100',
    complex: 'text-stone-800 bg-stone-100',
  };
  return (
    <span className={cn('text-[10px] font-medium px-1.5 py-0.5 rounded', styles[c])}>
      {c}
    </span>
  );
}

// ── Main component ──────────────────────────────────────────────────────────

export function TemplateLibrary({
  onSelectTemplate,
  onGenerateFromTemplate,
  onClose,
  isGenerating,
}: TemplateLibraryProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<SubmissionCategory | 'All'>('All');
  const [selectedPackage, setSelectedPackage] = useState<'all' | 'ind-core' | 'ind-initial'>('all');
  const [selectedTemplate, setSelectedTemplate] = useState<DocumentTemplate | null>(null);

  const categories: (SubmissionCategory | 'All')[] = ['All', 'IND', 'NDA', 'BLA', '510k', 'PMA', 'MAA', 'General'];

  const filtered = useMemo(() => {
    let list = TEMPLATES;
    if (selectedCategory !== 'All') {
      list = list.filter(t => t.category === selectedCategory);
    }
    if (selectedPackage !== 'all') {
      list = list.filter(t => t.packageTags?.includes(selectedPackage));
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        t =>
          t.name.toLowerCase().includes(q) ||
          t.description.toLowerCase().includes(q) ||
          t.tags.some(tag => tag.toLowerCase().includes(q)),
      );
    }
    return list;
  }, [selectedCategory, selectedPackage, searchQuery]);

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-stone-200">
        <div className="flex items-center gap-3">
          <BookOpen className="h-5 w-5 text-stone-900" />
          <div>
            <h2 className="text-base font-semibold text-stone-800">Template Library</h2>
            <p className="text-xs text-stone-500">{TEMPLATES.length} regulatory document templates</p>
          </div>
        </div>
        {onClose && (
          <button onClick={onClose} aria-label="Close template library" title="Close" className="p-1.5 text-stone-400 hover:text-stone-600 rounded-md hover:bg-stone-100 focus-visible:ring-2 focus-visible:ring-stone-400 outline-none">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Search + filters */}
      <div className="px-4 py-3 border-b border-stone-100 space-y-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-stone-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search templates..."
            className="w-full pl-9 pr-3 py-2 text-sm rounded-md border border-stone-200 focus-visible:ring-2 outline-none focus:ring-stone-300 focus:border-stone-400"
          />
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={cn(
                'px-2.5 py-1 text-xs font-medium rounded-full transition-colors duration-150',
                selectedCategory === cat
                  ? 'bg-stone-800 text-white'
                  : 'bg-stone-100 text-stone-600 hover:bg-stone-200',
              )}
            >
              {cat}
            </button>
          ))}
        </div>
        <div className="flex gap-1.5 flex-wrap pt-1">
          <button
            onClick={() => setSelectedPackage('all')}
            className={cn(
              'px-2.5 py-1 text-xs font-medium rounded-full transition-colors duration-150',
              selectedPackage === 'all'
                ? 'bg-stone-800 text-white'
                : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
            )}
          >
            All packages
          </button>
          <button
            onClick={() => setSelectedPackage('ind-core')}
            className={cn(
              'px-2.5 py-1 text-xs font-medium rounded-full transition-colors duration-150',
              selectedPackage === 'ind-core'
                ? 'bg-stone-800 text-white'
                : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
            )}
          >
            IND core
          </button>
          <button
            onClick={() => setSelectedPackage('ind-initial')}
            className={cn(
              'px-2.5 py-1 text-xs font-medium rounded-full transition-colors duration-150',
              selectedPackage === 'ind-initial'
                ? 'bg-stone-800 text-white'
                : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
            )}
          >
            Initial IND
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex flex-1 min-h-0">
        {/* Template list */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-stone-400">
              <FileText className="h-10 w-10 mb-3 text-stone-300" />
              <p className="text-sm font-medium">No templates found</p>
              <p className="text-xs mt-1">Try adjusting your search or filter</p>
            </div>
          ) : (
            filtered.map(t => (
              <div
                key={t.id}
                onClick={() => setSelectedTemplate(t)}
                className={cn(
                  'p-3 rounded-lg border cursor-pointer transition-all duration-150',
                  selectedTemplate?.id === t.id
                    ? 'border-stone-300 bg-stone-100 shadow-sm'
                    : 'border-stone-200 hover:border-stone-300 hover:bg-stone-50',
                )}
              >
                <div className="flex items-start justify-between mb-1">
                  <h3 className="text-sm font-semibold text-stone-800 leading-tight">{t.name}</h3>
                  {complexityBadge(t.complexity)}
                </div>
                <p className="text-xs text-stone-500 leading-relaxed mb-2">{t.description}</p>
                <div className="flex items-center gap-3 text-[10px] text-stone-400">
                  {t.ctdSection && (
                    <span className="flex items-center gap-0.5">
                      <Layers className="h-2.5 w-2.5" />
                      Section {t.ctdSection}
                    </span>
                  )}
                  {t.estimatedPages && (
                    <span>~{t.estimatedPages} pages</span>
                  )}
                  <span className="flex items-center gap-0.5">
                    <Tag className="h-2.5 w-2.5" />
                    {t.category}
                  </span>
                  {t.sections.length > 0 && (
                    <span>{t.sections.length} sections</span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Detail panel */}
        <div className="w-80 flex-shrink-0 border-l border-stone-100 overflow-y-auto">
          {selectedTemplate ? (
            <div className="p-4">
              <h3 className="text-sm font-semibold text-stone-800 mb-1">{selectedTemplate.name}</h3>
              <p className="text-xs text-stone-500 mb-4">{selectedTemplate.description}</p>

              {/* Actions */}
              <div className="flex gap-2 mb-4">
                <button
                  onClick={() => onSelectTemplate?.(selectedTemplate)}
                  className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-stone-600 bg-stone-100 rounded-md hover:bg-stone-100 transition-colors flex-1"
                >
                  <Plus className="h-3 w-3" />
                  Use Template
                </button>
                {selectedTemplate.aiGenerable && (
                  <button
                    onClick={() => onGenerateFromTemplate?.(selectedTemplate)}
                    disabled={isGenerating}
                    className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-white bg-stone-800 rounded-md hover:bg-stone-900 transition-colors flex-1 disabled:opacity-50"
                  >
                    {isGenerating ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Sparkles className="h-3 w-3" />
                    )}
                    AI Generate
                  </button>
                )}
              </div>

              {/* Template sections */}
              <h4 className="text-xs font-medium text-stone-600 mb-2">Template Sections</h4>
              <div className="space-y-1.5">
                {selectedTemplate.sections.map((s, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-2 p-2 rounded-md bg-stone-50"
                  >
                    <span className="text-[10px] font-mono text-stone-400 mt-0.5 w-4 text-right shrink-0">
                      {i + 1}.
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-stone-700">
                        {s.title}
                        {s.required && <span className="text-stone-400 ml-0.5">*</span>}
                      </p>
                      {s.guidance && (
                        <p className="text-[10px] text-stone-400 mt-0.5">{s.guidance}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Tags */}
              <div className="mt-4 flex flex-wrap gap-1">
                {selectedTemplate.tags.map(tag => (
                  <span
                    key={tag}
                    className="text-[10px] font-medium text-stone-500 bg-stone-100 px-1.5 py-0.5 rounded"
                  >
                    {tag}
                  </span>
                ))}
              </div>

              {/* Metadata */}
              <div className="mt-4 pt-3 border-t border-stone-100 space-y-1.5 text-[11px] text-stone-400">
                {selectedTemplate.ctdModule && (
                  <p>CTD Module: {selectedTemplate.ctdModule}</p>
                )}
                {selectedTemplate.ctdSection && (
                  <p>CTD Section: {selectedTemplate.ctdSection}</p>
                )}
                {selectedTemplate.estimatedPages && (
                  <p>Estimated length: ~{selectedTemplate.estimatedPages} pages</p>
                )}
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-center p-6 text-stone-400">
              <BookOpen className="h-10 w-10 mb-3 text-stone-300" />
              <p className="text-sm font-medium">Select a template</p>
              <p className="text-xs mt-1">Click a template to see its structure and create a document</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
