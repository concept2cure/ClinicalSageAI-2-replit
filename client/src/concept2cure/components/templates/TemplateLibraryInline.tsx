/**
 * TemplateLibraryInline
 *
 * Inline (non-dialog) template browser for the Author workspace Templates tab.
 * Surfaces the full ArtifactsCatalog template set with IndustryContext filtering,
 * connects to eCTD Co-Author for AI-powered document drafting, and auto-stores
 * every generated artifact in the vault via ProjectContext.
 *
 * Claude.ai parity: like clicking "Start with a prompt" in a Claude project,
 * but tailored to regulatory document types.
 */

import React, { useState, useMemo, useCallback } from 'react';
import { useProject } from '../../context/ProjectContext';
import { useIndustry } from '../../contexts/IndustryContext';
import type { IndustrySegment } from '../../contexts/IndustryContext';
import type { ArtifactCategory, SubmissionType } from '../../types';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Search,
  FileText,
  BarChart3,
  Workflow,
  Star,
  Download,
  X,
  Filter,
  ArrowRight,
  Sparkles,
} from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// SEGMENT / TEMPLATE TYPES
// ─────────────────────────────────────────────────────────────────────────────

type SegmentTag = 'pharma' | 'biotech' | 'medtech' | 'diagnostics' | 'all';

interface TemplateEntry {
  id: string;
  name: string;
  description: string;
  category: ArtifactCategory;
  submissionTypes: SubmissionType[];
  segments: SegmentTag[];
  ctdSection?: string;
  tags: string[];
  usageCount: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPREHENSIVE TEMPLATE DATA
// Covers ALL submission types across ALL client segments
// ─────────────────────────────────────────────────────────────────────────────

const TEMPLATES: TemplateEntry[] = [
  // ── Pharma / Biotech — IND ──
  { id: 'tl-ind-cover', name: 'IND Cover Letter (FDA Form 1571)', description: 'FDA IND cover letter with Form 1571 cross-references', category: 'document', submissionTypes: ['IND'], segments: ['pharma', 'biotech'], ctdSection: 'm1.2', tags: ['cover letter', 'FDA'], usageCount: 2134 },
  { id: 'tl-ind-intro', name: 'Introductory Statement & Investigational Plan', description: 'Clinical rationale, development strategy, and investigational approach', category: 'document', submissionTypes: ['IND'], segments: ['pharma', 'biotech'], ctdSection: 'm1.6', tags: ['intro', 'plan'], usageCount: 1567 },
  { id: 'tl-ib', name: "Investigator's Brochure (IB)", description: 'ICH E6(R2) compliant IB with nonclinical and clinical data compilation', category: 'document', submissionTypes: ['IND'], segments: ['pharma', 'biotech'], ctdSection: 'm1.7', tags: ['IB', 'GCP'], usageCount: 1876 },
  { id: 'tl-env-assess', name: 'Environmental Assessment / Categorical Exclusion', description: 'Environmental impact assessment or categorical exclusion claim per 21 CFR 25', category: 'document', submissionTypes: ['IND'], segments: ['pharma', 'biotech'], ctdSection: 'm1.9', tags: ['environment'], usageCount: 432 },

  // ── Pharma / Biotech — Module 2 CTD Summaries ──
  { id: 'tl-qos', name: 'Quality Overall Summary (M2.3)', description: 'ICH M4Q(R1) quality summary for drug substance and drug product', category: 'document', submissionTypes: ['IND', 'NDA', 'BLA', 'MAA'], segments: ['pharma', 'biotech'], ctdSection: 'm2.3', tags: ['QOS', 'CMC'], usageCount: 1876 },
  { id: 'tl-nonclin-overview', name: 'Nonclinical Overview (M2.4)', description: 'Integrated pharmacology, PK, and toxicology overview per ICH M4S', category: 'document', submissionTypes: ['IND', 'NDA', 'BLA', 'MAA'], segments: ['pharma', 'biotech'], ctdSection: 'm2.4', tags: ['nonclinical'], usageCount: 1234 },
  { id: 'tl-clin-overview', name: 'Clinical Overview (M2.5)', description: 'Integrated clinical assessment with benefit-risk per ICH M4E', category: 'document', submissionTypes: ['NDA', 'BLA', 'MAA'], segments: ['pharma', 'biotech'], ctdSection: 'm2.5', tags: ['clinical overview'], usageCount: 987 },
  { id: 'tl-nonclin-summ', name: 'Nonclinical Written Summaries (M2.6)', description: 'Pharmacology, PK, and toxicology written summaries', category: 'document', submissionTypes: ['IND', 'NDA', 'BLA'], segments: ['pharma', 'biotech'], ctdSection: 'm2.6', tags: ['nonclinical summaries'], usageCount: 876 },
  { id: 'tl-clin-summ', name: 'Clinical Summary (M2.7)', description: 'Biopharmaceutics, clinical pharmacology, efficacy, and safety summaries', category: 'document', submissionTypes: ['NDA', 'BLA', 'MAA'], segments: ['pharma', 'biotech'], ctdSection: 'm2.7', tags: ['clinical summary'], usageCount: 789 },

  // ── Pharma / Biotech — Module 3 CMC ──
  { id: 'tl-drug-sub', name: 'Drug Substance (M3.2.S)', description: 'Complete drug substance CMC: general info, manufacture, characterization, control, stability', category: 'document', submissionTypes: ['IND', 'NDA', 'BLA', 'MAA'], segments: ['pharma', 'biotech'], ctdSection: 'm3.2.S', tags: ['CMC', 'drug substance'], usageCount: 1654 },
  { id: 'tl-drug-prod', name: 'Drug Product (M3.2.P)', description: 'Drug product CMC: formulation, manufacture, control, container closure, stability', category: 'document', submissionTypes: ['IND', 'NDA', 'BLA', 'MAA'], segments: ['pharma', 'biotech'], ctdSection: 'm3.2.P', tags: ['CMC', 'drug product'], usageCount: 1543 },

  // ── Pharma / Biotech — Module 4 Nonclinical ──
  { id: 'tl-pharm-summ', name: 'Pharmacology Written Summary (M2.6.2)', description: 'Primary/secondary pharmacodynamics and safety pharmacology summary', category: 'document', submissionTypes: ['IND', 'NDA', 'BLA'], segments: ['pharma', 'biotech'], ctdSection: 'm2.6.2', tags: ['pharmacology'], usageCount: 876 },
  { id: 'tl-pk-summ', name: 'Pharmacokinetics Written Summary (M2.6.4)', description: 'ADME characterization and PK drug interactions', category: 'document', submissionTypes: ['IND', 'NDA', 'BLA'], segments: ['pharma', 'biotech'], ctdSection: 'm2.6.4', tags: ['pharmacokinetics'], usageCount: 765 },
  { id: 'tl-tox-summ', name: 'Toxicology Written Summary (M2.6.6)', description: 'Single/repeat dose, genotoxicity, carcinogenicity, reproductive toxicology', category: 'document', submissionTypes: ['IND', 'NDA', 'BLA'], segments: ['pharma', 'biotech'], ctdSection: 'm2.6.6', tags: ['toxicology'], usageCount: 789 },

  // ── Pharma / Biotech — Module 5 Clinical ──
  { id: 'tl-protocol', name: 'Clinical Study Protocol', description: 'ICH E6(R2) GCP-compliant protocol: objectives, design, endpoints, statistical plan', category: 'document', submissionTypes: ['IND', 'NDA', 'BLA', 'MAA'], segments: ['pharma', 'biotech', 'all'], ctdSection: 'm5.3', tags: ['protocol', 'GCP'], usageCount: 3456 },
  { id: 'tl-sap', name: 'Statistical Analysis Plan (SAP)', description: 'ICH E9(R1) SAP: estimands, analysis populations, multiplicity, missing data', category: 'document', submissionTypes: ['IND', 'NDA', 'BLA'], segments: ['pharma', 'biotech', 'all'], ctdSection: 'm5.3', tags: ['SAP', 'statistics'], usageCount: 2345 },
  { id: 'tl-csr', name: 'Clinical Study Report (ICH E3)', description: 'Full ICH E3 CSR: synopsis, methods, results, safety, efficacy, discussion', category: 'document', submissionTypes: ['NDA', 'BLA', 'MAA'], segments: ['pharma', 'biotech', 'all'], ctdSection: 'm5.3.5', tags: ['CSR', 'ICH E3'], usageCount: 2890 },
  { id: 'tl-icf', name: 'Informed Consent Form (ICF)', description: 'IRB/EC-compliant informed consent with all required elements per 21 CFR 50', category: 'document', submissionTypes: ['IND'], segments: ['pharma', 'biotech'], ctdSection: 'm5.3', tags: ['ICF', 'consent'], usageCount: 1234 },

  // ── Safety Reports ──
  { id: 'tl-dsur', name: 'Development Safety Update Report (DSUR)', description: 'ICH E2F annual safety report for active investigational drugs', category: 'document', submissionTypes: ['IND', 'NDA'], segments: ['pharma', 'biotech'], tags: ['DSUR', 'safety'], usageCount: 654 },
  { id: 'tl-psur', name: 'Periodic Safety Update Report (PSUR/PBRER)', description: 'ICH E2C(R2) periodic benefit-risk evaluation report', category: 'document', submissionTypes: ['NDA', 'BLA', 'MAA'], segments: ['pharma', 'biotech'], tags: ['PSUR', 'PBRER'], usageCount: 543 },

  // ── NDA / BLA Specific ──
  { id: 'tl-iss', name: 'Integrated Summary of Safety (ISS)', description: 'ISS per ICH E1: pooled safety data across studies with exposure analysis', category: 'document', submissionTypes: ['NDA', 'BLA'], segments: ['pharma', 'biotech'], ctdSection: 'm2.7.4', tags: ['ISS', 'safety'], usageCount: 567 },
  { id: 'tl-ise', name: 'Integrated Summary of Effectiveness (ISE)', description: 'ISE: pooled efficacy data with subgroup analyses and dose-response', category: 'document', submissionTypes: ['NDA', 'BLA'], segments: ['pharma', 'biotech'], ctdSection: 'm2.7.3', tags: ['ISE', 'efficacy'], usageCount: 543 },
  { id: 'tl-label', name: 'Prescribing Information / Label', description: 'FDA-compliant labeling with Highlights, Full PI, and Medication Guide per PLR', category: 'document', submissionTypes: ['NDA', 'BLA'], segments: ['pharma', 'biotech'], tags: ['label', 'PI'], usageCount: 876 },
  { id: 'tl-rems', name: 'Risk Evaluation and Mitigation Strategy (REMS)', description: 'REMS elements: medication guide, communication plan, ETASU', category: 'document', submissionTypes: ['NDA', 'BLA'], segments: ['pharma', 'biotech'], tags: ['REMS', 'risk'], usageCount: 345 },

  // ── Regulatory Strategy ──
  { id: 'tl-briefing', name: 'Briefing Document (Pre-IND / Type B Meeting)', description: 'FDA meeting briefing package with questions and supporting data', category: 'document', submissionTypes: ['IND', 'NDA', 'BLA'], segments: ['pharma', 'biotech', 'all'], tags: ['briefing', 'FDA meeting'], usageCount: 1567 },
  { id: 'tl-reg-response', name: 'Regulatory Response Letter', description: 'Response to FDA RTF, CR, AI/CRL with point-by-point deficiency resolution', category: 'document', submissionTypes: ['IND', 'NDA', 'BLA', '510K', 'PMA'], segments: ['all'], tags: ['response', 'deficiency'], usageCount: 987 },

  // ── MedTech / Device ──
  { id: 'tl-510k-cover', name: '510(k) Cover Letter', description: 'FDA 510(k) premarket notification cover letter', category: 'document', submissionTypes: ['510K'], segments: ['medtech', 'diagnostics'], ctdSection: '1.0', tags: ['510k', 'cover letter'], usageCount: 2847 },
  { id: 'tl-device-desc', name: 'Device Description', description: 'Comprehensive device description: intended use, technology, materials', category: 'document', submissionTypes: ['510K', 'PMA', 'DE_NOVO'], segments: ['medtech', 'diagnostics'], tags: ['device', 'description'], usageCount: 1923 },
  { id: 'tl-se-summary', name: 'Substantial Equivalence Summary', description: 'SE comparison: intended use, technology, and performance', category: 'document', submissionTypes: ['510K'], segments: ['medtech', 'diagnostics'], tags: ['SE', 'predicate'], usageCount: 1456 },
  { id: 'tl-biocompat', name: 'Biocompatibility Assessment (ISO 10993)', description: 'Biocompatibility evaluation per ISO 10993-1: biological testing strategy', category: 'document', submissionTypes: ['510K', 'PMA', 'DE_NOVO'], segments: ['medtech'], tags: ['biocompatibility'], usageCount: 876 },
  { id: 'tl-software', name: 'Software Documentation (IEC 62304)', description: 'SaMD/device software lifecycle docs: SRS, SAD, V&V, hazard analysis', category: 'document', submissionTypes: ['510K', 'PMA', 'DE_NOVO'], segments: ['medtech', 'diagnostics'], tags: ['software', 'SaMD'], usageCount: 645 },
  { id: 'tl-sterilization', name: 'Sterilization Validation Report', description: 'EO/radiation/steam sterilization validation per ISO 11135/11137/17665', category: 'document', submissionTypes: ['510K', 'PMA'], segments: ['medtech'], tags: ['sterilization'], usageCount: 432 },
  { id: 'tl-pma-ssed', name: 'PMA Summary of Safety & Effectiveness', description: 'SSED for Class III PMA devices with pivotal study data', category: 'document', submissionTypes: ['PMA'], segments: ['medtech'], tags: ['PMA', 'SSED'], usageCount: 567 },
  { id: 'tl-estar', name: 'eSTAR Submission Builder', description: 'Electronic 510(k) structured submission per FDA eSTAR format', category: 'document', submissionTypes: ['510K'], segments: ['medtech', 'diagnostics'], tags: ['eSTAR', 'electronic'], usageCount: 1234 },

  // ── EU / International ──
  { id: 'tl-cer', name: 'Clinical Evaluation Report (EU MDR)', description: 'CER per MEDDEV 2.7/1 Rev 4 for EU MDR 2017/745 conformity', category: 'document', submissionTypes: ['510K', 'PMA'], segments: ['medtech', 'diagnostics'], tags: ['CER', 'EU MDR'], usageCount: 1234 },
  { id: 'tl-ivdr', name: 'IVDR Technical Documentation', description: 'EU IVDR 2017/746 technical file: Annex II & III requirements', category: 'document', submissionTypes: ['IVDR'], segments: ['diagnostics'], tags: ['IVDR', 'technical file'], usageCount: 389 },
  { id: 'tl-maa-cover', name: 'MAA Cover Letter (EMA)', description: 'EMA Marketing Authorization Application cover letter', category: 'document', submissionTypes: ['MAA'], segments: ['pharma', 'biotech'], tags: ['MAA', 'EMA'], usageCount: 654 },
  { id: 'tl-impd', name: 'Investigational Medicinal Product Dossier (IMPD)', description: 'EMA IMPD for clinical trial authorization: quality, nonclinical, clinical', category: 'document', submissionTypes: ['MAA'], segments: ['pharma', 'biotech'], tags: ['IMPD', 'CTA'], usageCount: 543 },

  // ── Cross-Segment SOPs & QMS ──
  { id: 'tl-sop', name: 'Standard Operating Procedure (SOP)', description: 'GxP-compliant SOP: purpose, scope, responsibilities, procedure, references', category: 'document', submissionTypes: ['IND', 'NDA', 'BLA', '510K', 'PMA'], segments: ['all'], tags: ['SOP', 'GxP'], usageCount: 4567 },
  { id: 'tl-dmp', name: 'Data Management Plan', description: 'Clinical data management plan: EDC, coding, SAE reconciliation, database lock', category: 'document', submissionTypes: ['IND', 'NDA', 'BLA'], segments: ['pharma', 'biotech', 'all'], tags: ['DMP', 'data management'], usageCount: 876 },
  { id: 'tl-risk-mgmt', name: 'Risk Management Plan (ISO 14971)', description: 'Risk management file: hazard analysis, risk estimation, mitigation, residual risk', category: 'document', submissionTypes: ['510K', 'PMA', 'DE_NOVO'], segments: ['medtech', 'diagnostics'], tags: ['risk', 'ISO 14971'], usageCount: 987 },

  // ── Interactive Tools ──
  { id: 'tl-pyramid', name: 'Submission Pyramid Timeline', description: 'Interactive milestone-based project timeline with critical path analysis', category: 'interactive', submissionTypes: ['510K', 'IND', 'NDA', 'BLA', 'PMA'], segments: ['all'], tags: ['timeline', 'milestones'], usageCount: 987 },
  { id: 'tl-heatmap', name: 'Risk Analysis Heatmap', description: 'Interactive risk visualization across regulatory submission modules', category: 'interactive', submissionTypes: ['510K', 'IND', 'NDA', 'PMA'], segments: ['all'], tags: ['risk', 'heatmap'], usageCount: 876 },
  { id: 'tl-rtm', name: 'Requirements Traceability Matrix', description: 'Interactive RTM linking requirements to verification evidence', category: 'interactive', submissionTypes: ['510K', 'PMA', 'DE_NOVO'], segments: ['medtech', 'diagnostics'], tags: ['RTM', 'traceability'], usageCount: 765 },
  { id: 'tl-ifu-checker', name: 'IFU Consistency Checker', description: 'Check Indications for Use consistency across all submission documents', category: 'interactive', submissionTypes: ['510K'], segments: ['medtech', 'diagnostics'], tags: ['IFU', 'consistency'], usageCount: 543 },
];

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function segmentToTag(segment: string): SegmentTag {
  switch (segment) {
    case 'pharma': return 'pharma';
    case 'biotech': return 'biotech';
    case 'medtech': return 'medtech';
    case 'diagnostics': return 'diagnostics';
    default: return 'pharma';
  }
}

const categoryIcons: Record<ArtifactCategory, React.ElementType> = {
  document: FileText,
  interactive: Workflow,
  visualization: BarChart3,
};

const categoryColors: Record<ArtifactCategory, string> = {
  document: 'bg-stone-100 text-stone-600',
  interactive: 'bg-blue-50 text-blue-600',
  visualization: 'bg-emerald-50 text-emerald-600',
};

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

interface TemplateLibraryInlineProps {
  projectId?: string;
  onUseTemplate: (ctdSection?: string) => void;
}

export const TemplateLibraryInline: React.FC<TemplateLibraryInlineProps> = ({
  projectId,
  onUseTemplate,
}) => {
  const { activeProject, createArtifact, createConversation, setActiveConversation } = useProject();
  const { segment } = useIndustry();
  const tag = segmentToTag(segment);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<ArtifactCategory | 'all'>('all');
  const [selectedSubmissionType, setSelectedSubmissionType] = useState<SubmissionType | 'all'>('all');

  // Filter templates by segment + user filters
  const filteredTemplates = useMemo(() => {
    return TEMPLATES.filter((t) => {
      if (!t.segments.includes(tag) && !t.segments.includes('all')) return false;

      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        if (
          !t.name.toLowerCase().includes(q) &&
          !t.description.toLowerCase().includes(q) &&
          !t.tags.some((tag) => tag.toLowerCase().includes(q)) &&
          !(t.ctdSection && t.ctdSection.toLowerCase().includes(q))
        )
          return false;
      }

      if (selectedCategory !== 'all' && t.category !== selectedCategory) return false;
      if (selectedSubmissionType !== 'all' && !t.submissionTypes.includes(selectedSubmissionType)) return false;

      return true;
    });
  }, [searchQuery, selectedCategory, selectedSubmissionType, tag]);

  // Available submission types for segment
  const availableTypes = useMemo(() => {
    const types = new Set<SubmissionType>();
    TEMPLATES.forEach((t) => {
      if (t.segments.includes(tag) || t.segments.includes('all')) {
        t.submissionTypes.forEach((st) => types.add(st));
      }
    });
    return Array.from(types).sort();
  }, [tag]);

  const handleUse = useCallback(
    async (template: TemplateEntry) => {
      if (!activeProject) return;

      // Create conversation and artifact in vault
      const conversation = await createConversation(
        activeProject.id,
        `Draft: ${template.name}`
      );
      setActiveConversation(conversation.id);

      createArtifact({
        projectId: activeProject.id,
        conversationId: conversation.id,
        type: 'document',
        category: template.category,
        title: template.name,
        content: `# ${template.name}\n\n*${template.description}*\n\n---\n\n[AI-generated content will be drafted here by AnA RI]`,
      });

      // Navigate to co-author with CTD section context
      onUseTemplate(template.ctdSection);
    },
    [activeProject, createArtifact, createConversation, setActiveConversation, onUseTemplate]
  );

  const clearFilters = () => {
    setSearchQuery('');
    setSelectedCategory('all');
    setSelectedSubmissionType('all');
  };

  const hasActiveFilters =
    searchQuery || selectedCategory !== 'all' || selectedSubmissionType !== 'all';

  // Group templates by category for display
  const documentTemplates = filteredTemplates.filter((t) => t.category === 'document');
  const interactiveTemplates = filteredTemplates.filter((t) => t.category !== 'document');

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-stone-900">
          Template Library
        </h2>
        <p className="text-sm text-stone-500 mt-1">
          {filteredTemplates.length} templates for {segment} workflows. Select a template to draft with AnA RI.
        </p>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-stone-400" />
          <Input
            placeholder="Search templates, CTD sections..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 border-stone-200 h-9 text-sm"
          />
        </div>

        <Select
          value={selectedCategory}
          onValueChange={(v) => setSelectedCategory(v as ArtifactCategory | 'all')}
        >
          <SelectTrigger className="w-[140px] border-stone-200 h-9 text-sm">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="document">Documents</SelectItem>
            <SelectItem value="interactive">Interactive</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={selectedSubmissionType}
          onValueChange={(v) => setSelectedSubmissionType(v as SubmissionType | 'all')}
        >
          <SelectTrigger className="w-[130px] border-stone-200 h-9 text-sm">
            <SelectValue placeholder="Submission" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            {availableTypes.map((st) => (
              <SelectItem key={st} value={st}>
                {st === '510K' ? '510(k)' : st === 'DE_NOVO' ? 'De Novo' : st}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters} className="text-stone-400 h-9 text-sm">
            <X className="h-3.5 w-3.5 mr-1" />
            Clear
          </Button>
        )}
      </div>

      {/* Document Templates */}
      {documentTemplates.length > 0 && (
        <div className="mb-8">
          <div className="text-xs font-semibold text-stone-400 uppercase tracking-wider mb-3">
            Documents ({documentTemplates.length})
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {documentTemplates.map((t) => (
              <button
                key={t.id}
                onClick={() => handleUse(t)}
                className="group text-left p-4 rounded-lg border border-stone-200 hover:border-stone-300 bg-white transition-all duration-150"
              >
                <div className="flex items-start gap-3">
                  <div className={cn('p-1.5 rounded-md flex-shrink-0', categoryColors[t.category])}>
                    <FileText className="h-3.5 w-3.5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-stone-900 group-hover:text-stone-700 truncate">
                      {t.name}
                    </div>
                    <div className="text-xs text-stone-500 line-clamp-2 mt-0.5">
                      {t.description}
                    </div>
                    <div className="flex items-center gap-2 mt-2">
                      {t.ctdSection && (
                        <Badge variant="outline" className="text-xs px-1 py-0 border-blue-200 text-blue-500">
                          {t.ctdSection}
                        </Badge>
                      )}
                      {t.submissionTypes.slice(0, 3).map((st) => (
                        <Badge key={st} variant="outline" className="text-xs px-1 py-0 border-stone-200 text-stone-400">
                          {st}
                        </Badge>
                      ))}
                      <span className="text-xs text-stone-400 ml-auto flex items-center gap-0.5">
                        <Download className="h-2.5 w-2.5" />
                        {t.usageCount.toLocaleString()}
                      </span>
                    </div>
                  </div>
                  <ArrowRight className="h-4 w-4 text-stone-400 group-hover:text-stone-500 flex-shrink-0 mt-1 transition-colors duration-150" />
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Interactive Tools */}
      {interactiveTemplates.length > 0 && (
        <div className="mb-8">
          <div className="text-xs font-semibold text-stone-400 uppercase tracking-wider mb-3">
            Interactive Tools ({interactiveTemplates.length})
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {interactiveTemplates.map((t) => (
              <button
                key={t.id}
                onClick={() => handleUse(t)}
                className="group text-left p-4 rounded-lg border border-stone-200 hover:border-blue-200 bg-white transition-all duration-150"
              >
                <div className="flex items-start gap-3">
                  <div className={cn('p-1.5 rounded-md flex-shrink-0', categoryColors[t.category])}>
                    <Workflow className="h-3.5 w-3.5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-stone-900 group-hover:text-blue-700 truncate">
                      {t.name}
                    </div>
                    <div className="text-xs text-stone-500 line-clamp-2 mt-0.5">
                      {t.description}
                    </div>
                  </div>
                  <ArrowRight className="h-4 w-4 text-stone-400 group-hover:text-blue-500 flex-shrink-0 mt-1 transition-colors duration-150" />
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {filteredTemplates.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Filter className="h-10 w-10 text-stone-200 mb-4" />
          <h3 className="text-sm font-medium text-stone-900 mb-1">No templates found</h3>
          <p className="text-xs text-stone-500 mb-4">Try adjusting your filters.</p>
          <Button variant="outline" size="sm" onClick={clearFilters} className="border-stone-200 text-sm">
            Clear filters
          </Button>
        </div>
      )}

      {/* Quick draft CTA */}
      <div className="mt-6 p-4 rounded-lg border border-dashed border-stone-200 bg-stone-50/50 text-center">
        <Sparkles className="h-5 w-5 text-stone-400 mx-auto mb-2" />
        <p className="text-sm font-medium text-stone-700 mb-1">
          Don't see what you need?
        </p>
        <p className="text-xs text-stone-500 mb-3">
          Ask AnA RI to draft any regulatory document — just describe what you need in the chat.
        </p>
        <Button
          variant="outline"
          size="sm"
          className="border-stone-200 text-sm"
          onClick={() => onUseTemplate(undefined)}
        >
          Open Co-Author
        </Button>
      </div>
    </div>
  );
};

export default TemplateLibraryInline;
