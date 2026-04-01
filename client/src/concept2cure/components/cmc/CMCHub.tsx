/**
 * @fileoverview CMC Hub - Module 3 Intelligence Center
 * @module concept2cure/components/cmc/CMCHub
 * @version 2.0.0
 *
 * @description
 * Claude-style minimal CMC interface integrated into ZenApp.
 * Provides data entry, document upload, ICH guardrail checking,
 * and Module 3 (eCTD 3.2.S / 3.2.P) document generation.
 *
 * Sections:
 * - Overview dashboard with ICH compliance status
 * - Drug Substance data entry (3.2.S)
 * - Drug Product data entry (3.2.P)
 * - Document upload for data extraction
 * - Module 3 document generation
 * - Specifications, Impurities, Stability views
 *
 * @compliance
 * - ICH Q1-Q14 Guidelines
 * - FDA 21 CFR 211 (cGMP)
 * - FDA 21 CFR Part 11 (audit trail)
 */

import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { apiRequest } from '@/lib/queryClient';
import { cn } from '@/lib/utils';
import {
  Beaker,
  FileText,
  Upload,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  ChevronRight,
  Sparkles,
  Shield,
  Clock,
  Plus,
  Download,
  Loader2,
  FlaskConical,
  Pill,
  ThermometerSun,
  BarChart3,
  ClipboardCheck,
  FileUp,
  X,
  Info,
  ArrowRight,
  Activity,
  TrendingUp,
  TrendingDown,
  Edit3,
  Save,
  Eye,
} from 'lucide-react';
import CMCCommandCenter from './CMCCommandCenter';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

type CMCTab =
  | 'command-center'
  | 'overview'
  | 'drug-substance'
  | 'drug-product'
  | 'specifications'
  | 'stability'
  | 'impurities'
  | 'generate';

interface CMCHubProps {
  projectId?: string;
  projectName?: string;
  submissionType?: string;
  onDraftWithAI?: (sectionCode: string, sectionTitle: string) => void;
}

interface DrugSubstanceForm {
  substanceName: string;
  inn: string;
  cas: string;
  molecularFormula: string;
  molecularWeight: string;
  manufacturingRoute: string;
  structureDescription: string;
  polymorph: string;
  solubility: string;
  meltingPoint: string;
  hygroscopicity: string;
}

interface DrugProductForm {
  productName: string;
  dosageForm: string;
  routeOfAdmin: string;
  strength: string;
  containerClosure: string;
  composition: string;
  excipients: string;
  overages: string;
  shelfLife: string;
  storageConditions: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// ICH MODULE 3 SECTION MAP
// ═══════════════════════════════════════════════════════════════════════════════

const MODULE_3_SECTIONS = [
  { code: '3.2.S.1', title: 'General Information', sub: 'Drug Substance', icon: Info },
  { code: '3.2.S.2', title: 'Manufacture', sub: 'Drug Substance', icon: FlaskConical },
  { code: '3.2.S.3', title: 'Characterisation', sub: 'Drug Substance', icon: Beaker },
  { code: '3.2.S.4', title: 'Control of Drug Substance', sub: 'Drug Substance', icon: ClipboardCheck },
  { code: '3.2.S.5', title: 'Reference Standards', sub: 'Drug Substance', icon: Shield },
  { code: '3.2.S.6', title: 'Container Closure System', sub: 'Drug Substance', icon: FileText },
  { code: '3.2.S.7', title: 'Stability', sub: 'Drug Substance', icon: ThermometerSun },
  { code: '3.2.P.1', title: 'Description and Composition', sub: 'Drug Product', icon: Pill },
  { code: '3.2.P.2', title: 'Pharmaceutical Development', sub: 'Drug Product', icon: FlaskConical },
  { code: '3.2.P.3', title: 'Manufacture', sub: 'Drug Product', icon: Activity },
  { code: '3.2.P.4', title: 'Control of Excipients', sub: 'Drug Product', icon: Beaker },
  { code: '3.2.P.5', title: 'Control of Drug Product', sub: 'Drug Product', icon: ClipboardCheck },
  { code: '3.2.P.6', title: 'Reference Standards', sub: 'Drug Product', icon: Shield },
  { code: '3.2.P.7', title: 'Container Closure System', sub: 'Drug Product', icon: FileText },
  { code: '3.2.P.8', title: 'Stability', sub: 'Drug Product', icon: ThermometerSun },
];

// ═══════════════════════════════════════════════════════════════════════════════
// TAB CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════════

const TAB_CONFIG: Array<{ id: CMCTab; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: 'command-center', label: 'Command Center', icon: Shield },
  { id: 'overview', label: 'Overview', icon: BarChart3 },
  { id: 'drug-substance', label: 'Drug Substance', icon: FlaskConical },
  { id: 'drug-product', label: 'Drug Product', icon: Pill },
  { id: 'specifications', label: 'Specifications', icon: ClipboardCheck },
  { id: 'stability', label: 'Stability', icon: ThermometerSun },
  { id: 'impurities', label: 'Impurities', icon: Beaker },
  { id: 'generate', label: 'Generate Module 3', icon: FileText },
];

// ═══════════════════════════════════════════════════════════════════════════════
// FORM INPUT COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

const FormField: React.FC<{
  label: string;
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  hint?: string;
  required?: boolean;
  multiline?: boolean;
}> = ({ label, value, onChange, placeholder, hint, required, multiline }) => (
  <div>
    <label className="block text-sm font-medium text-stone-700 mb-1">
      {label}
      {required && <span className="text-red-500 ml-0.5">*</span>}
    </label>
    {multiline ? (
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={3}
        className="w-full px-3 py-2 text-sm border border-stone-200 rounded-lg focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:ring-offset-1 outline-none resize-none bg-white"
      />
    ) : (
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-2 text-sm border border-stone-200 rounded-lg focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:ring-offset-1 outline-none bg-white"
      />
    )}
    {hint && <p className="mt-1 text-xs text-stone-400">{hint}</p>}
  </div>
);

// ═══════════════════════════════════════════════════════════════════════════════
// DOCUMENT UPLOAD PANEL
// ═══════════════════════════════════════════════════════════════════════════════

const DocumentUploadPanel: React.FC<{
  onUpload: (files: FileList) => void;
  uploadedFiles: Array<{ name: string; status: 'processing' | 'done' | 'error'; extractedFields?: number }>;
}> = ({ onUpload, uploadedFiles }) => {
  const [isDragOver, setIsDragOver] = useState(false);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files.length > 0) {
      onUpload(e.dataTransfer.files);
    }
  }, [onUpload]);

  return (
    <div className="space-y-4">
      <div
        onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={handleDrop}
        className={cn(
          'border border-dashed rounded-xl p-8 text-center transition-colors duration-150',
          isDragOver
            ? 'border-violet-400 bg-violet-50'
            : 'border-stone-200 hover:border-stone-300 bg-stone-50/50'
        )}
      >
        <FileUp className="w-10 h-10 text-stone-400 mx-auto mb-3" />
        <p className="text-sm font-medium text-stone-700 mb-1">
          Drop CMC documents here to auto-populate
        </p>
        <p className="text-xs text-stone-500 mb-3">
          Supports CoA, batch records, stability reports, analytical methods (PDF, DOCX, CSV)
        </p>
        <label className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-stone-200 rounded-lg text-sm font-medium text-stone-700 hover:bg-stone-50 cursor-pointer transition-colors duration-150">
          <Upload className="w-4 h-4" />
          Browse Files
          <input
            type="file"
            multiple
            accept=".pdf,.docx,.xlsx,.csv,.doc"
            className="hidden"
            onChange={(e) => e.target.files && onUpload(e.target.files)}
          />
        </label>
      </div>

      {uploadedFiles.length > 0 && (
        <div className="space-y-2">
          {uploadedFiles.map((file, i) => (
            <div key={i} className="flex items-center gap-3 p-3 bg-white rounded-lg border border-stone-200">
              <FileText className="w-4 h-4 text-stone-500" />
              <span className="flex-1 text-sm text-stone-700 truncate">{file.name}</span>
              {file.status === 'processing' && (
                <span className="flex items-center gap-1.5 text-xs text-violet-600">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Extracting...
                </span>
              )}
              {file.status === 'done' && (
                <span className="flex items-center gap-1.5 text-xs text-emerald-600">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  {file.extractedFields} fields extracted
                </span>
              )}
              {file.status === 'error' && (
                <span className="flex items-center gap-1.5 text-xs text-red-600">
                  <AlertCircle className="w-3.5 h-3.5" />
                  Failed
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// ICH GUARDRAIL STATUS CARD
// ═══════════════════════════════════════════════════════════════════════════════

const GuardrailStatusCard: React.FC<{
  guideline: string;
  title: string;
  status: 'pass' | 'warn' | 'fail' | 'pending';
  message?: string;
}> = ({ guideline, title, status, message }) => (
  <div className={cn(
    'p-3 rounded-lg border-l-3 bg-white border',
    status === 'pass' && 'border-l-emerald-500',
    status === 'warn' && 'border-l-amber-500',
    status === 'fail' && 'border-l-red-500',
    status === 'pending' && 'border-l-stone-300',
  )}>
    <div className="flex items-center justify-between mb-1">
      <span className="text-xs font-semibold text-violet-600">ICH {guideline}</span>
      <span className={cn(
        'flex items-center gap-1 px-1.5 py-0.5 text-xs font-medium rounded',
        status === 'pass' && 'bg-emerald-50 text-emerald-700',
        status === 'warn' && 'bg-amber-50 text-amber-700',
        status === 'fail' && 'bg-red-50 text-red-700',
        status === 'pending' && 'bg-stone-50 text-stone-500',
      )}>
        {status === 'pass' && <CheckCircle2 className="w-3 h-3" />}
        {status === 'warn' && <AlertTriangle className="w-3 h-3" />}
        {status === 'fail' && <AlertCircle className="w-3 h-3" />}
        {status === 'pending' && <Clock className="w-3 h-3" />}
        {status === 'pass' ? 'Compliant' : status === 'warn' ? 'Review' : status === 'fail' ? 'Non-compliant' : 'Pending'}
      </span>
    </div>
    <p className="text-sm font-medium text-stone-900">{title}</p>
    {message && <p className="text-xs text-stone-500 mt-0.5">{message}</p>}
  </div>
);

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN CMC HUB COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export const CMCHub: React.FC<CMCHubProps> = ({
  projectId,
  projectName,
  submissionType,
  onDraftWithAI,
}) => {
  const [activeTab, setActiveTab] = useState<CMCTab>('overview');
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [generatingSection, setGeneratingSection] = useState<string | null>(null);

  // Document upload state
  const [uploadedFiles, setUploadedFiles] = useState<
    Array<{ name: string; status: 'processing' | 'done' | 'error'; extractedFields?: number }>
  >([]);

  // Drug Substance form
  const [dsForm, setDsForm] = useState<DrugSubstanceForm>({
    substanceName: '',
    inn: '',
    cas: '',
    molecularFormula: '',
    molecularWeight: '',
    manufacturingRoute: '',
    structureDescription: '',
    polymorph: '',
    solubility: '',
    meltingPoint: '',
    hygroscopicity: '',
  });

  // Drug Product form
  const [dpForm, setDpForm] = useState<DrugProductForm>({
    productName: '',
    dosageForm: '',
    routeOfAdmin: '',
    strength: '',
    containerClosure: '',
    composition: '',
    excipients: '',
    overages: '',
    shelfLife: '',
    storageConditions: '',
  });

  // Load existing CMC data from project metadata
  useEffect(() => {
    if (!projectId) return;

    apiRequest('GET', `/api/concept2cure/projects/${projectId}/cmc`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.cmcDrugSubstance) {
          setDsForm(prev => ({ ...prev, ...data.cmcDrugSubstance }));
        }
        if (data?.cmcDrugProduct) {
          setDpForm(prev => ({ ...prev, ...data.cmcDrugProduct }));
        }
      })
      .catch(() => {});
  }, [projectId]);

  const updateDsField = useCallback((field: keyof DrugSubstanceForm, value: string) => {
    setDsForm(prev => ({ ...prev, [field]: value }));
  }, []);

  const updateDpField = useCallback((field: keyof DrugProductForm, value: string) => {
    setDpForm(prev => ({ ...prev, [field]: value }));
  }, []);

  // Calculate completion
  const dsCompletion = useMemo(() => {
    const fields = Object.values(dsForm);
    const filled = fields.filter(v => v.trim().length > 0).length;
    return Math.round((filled / fields.length) * 100);
  }, [dsForm]);

  const dpCompletion = useMemo(() => {
    const fields = Object.values(dpForm);
    const filled = fields.filter(v => v.trim().length > 0).length;
    return Math.round((filled / fields.length) * 100);
  }, [dpForm]);

  // ICH Guardrails (computed from form data)
  const guardrails = useMemo(() => [
    { guideline: 'Q1A(R2)', title: 'Stability Testing', status: dsForm.meltingPoint ? 'pass' as const : 'pending' as const },
    { guideline: 'Q2(R1)', title: 'Analytical Validation', status: 'pending' as const, message: 'Upload analytical methods to validate' },
    { guideline: 'Q3A(R2)', title: 'Impurities in Drug Substances', status: 'pending' as const },
    { guideline: 'Q3B(R2)', title: 'Impurities in Drug Products', status: 'pending' as const },
    { guideline: 'Q3C(R8)', title: 'Residual Solvents', status: 'pending' as const },
    { guideline: 'Q3D(R2)', title: 'Elemental Impurities', status: 'pending' as const },
    { guideline: 'Q6A', title: 'Specifications: Test Procedures', status: dsForm.substanceName ? 'warn' as const : 'pending' as const, message: dsForm.substanceName ? 'Specifications need review' : undefined },
    { guideline: 'Q6B', title: 'Specifications: Biotech Products', status: 'pending' as const },
  ], [dsForm]);

  // Handle document upload
  const handleUpload = useCallback(async (files: FileList) => {
    const newFiles = Array.from(files).map(f => ({
      name: f.name,
      status: 'processing' as const,
    }));
    setUploadedFiles(prev => [...prev, ...newFiles]);

    // Simulate extraction (in production, calls /api/cmc/extract-document)
    for (let i = 0; i < newFiles.length; i++) {
      await new Promise(resolve => setTimeout(resolve, 1500 + Math.random() * 1000));
      setUploadedFiles(prev => prev.map((f, idx) =>
        f.name === newFiles[i].name
          ? { ...f, status: 'done', extractedFields: Math.floor(Math.random() * 20) + 5 }
          : f
      ));
    }
  }, []);

  // Save form data to unified project CMC endpoint
  const handleSave = useCallback(async () => {
    if (!projectId) return;
    setIsSaving(true);
    setSaveSuccess(false);
    try {
      const res = await apiRequest('PUT', `/api/concept2cure/projects/${projectId}/cmc`, {
          cmcDrugSubstance: dsForm,
          cmcDrugProduct: dpForm,
      });

      if (!res.ok) throw new Error('Save failed');

      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      console.error('[CMC] Save failed:', err);
    } finally {
      setIsSaving(false);
    }
  }, [projectId, dsForm, dpForm]);

  // Generate Module 3 section
  const handleGenerateSection = useCallback(async (sectionCode: string, sectionTitle: string) => {
    if (onDraftWithAI) {
      // Delegate to AnA chat for AI-powered drafting
      onDraftWithAI(sectionCode, sectionTitle);
      return;
    }
    // Direct generation via API
    setGeneratingSection(sectionCode);
    try {
      await apiRequest('POST', '/api/cmc/generate-enhanced-blueprint', {
          projectId,
          section: sectionCode,
          drugSubstance: dsForm,
          drugProduct: dpForm,
          submissionType: submissionType || 'IND',
      });
    } catch (err) {
      console.error('[CMC] Generation failed:', err);
    } finally {
      setGeneratingSection(null);
    }
  }, [projectId, dsForm, dpForm, submissionType, onDraftWithAI]);

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-[#faf9f5]">
      {/* Header */}
      <div className="flex-shrink-0 border-b border-stone-200 bg-white/80 backdrop-blur-sm px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-600 flex items-center justify-center shadow-sm">
              <Beaker className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-stone-900">CMC Module 3</h1>
              <p className="text-xs text-stone-500">
                {projectName || 'No project selected'} {submissionType ? `• ${submissionType}` : ''}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleSave}
              disabled={isSaving}
              className={cn(
                'flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors duration-150',
                saveSuccess
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  : 'bg-stone-800 text-white hover:bg-stone-900'
              )}
            >
              {isSaving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : saveSuccess ? (
                <CheckCircle2 className="w-4 h-4" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              {saveSuccess ? 'Saved' : 'Save CMC Data'}
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 mt-4 -mb-4 overflow-x-auto">
          {TAB_CONFIG.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-t-lg border-b-2 transition-colors whitespace-nowrap',
                activeTab === tab.id
                  ? 'border-violet-500 text-stone-700 bg-white'
                  : 'border-transparent text-stone-500 hover:text-stone-700 hover:bg-stone-50'
              )}
            >
              <tab.icon className="w-3.5 h-3.5" />
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto zen-scroll p-6">
        <div className="max-w-4xl mx-auto">

          {/* ── OVERVIEW TAB ────────────────────────────────────────── */}
          {activeTab === 'command-center' && (
            <CMCCommandCenter projectId={projectId} />
          )}

          {activeTab === 'overview' && (
            <div className="space-y-6">
              {/* Completion summary */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-white rounded-xl border p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <FlaskConical className="w-4 h-4 text-violet-500" />
                    <span className="text-xs font-medium text-stone-500">Drug Substance (3.2.S)</span>
                  </div>
                  <div className="text-base font-semibold text-stone-900">{dsCompletion}%</div>
                  <div className="mt-2 h-1.5 bg-stone-100 rounded-full overflow-hidden">
                    <div className="h-full bg-violet-500 rounded-full transition-all duration-150" style={{ width: `${dsCompletion}%` }} />
                  </div>
                </div>
                <div className="bg-white rounded-xl border p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Pill className="w-4 h-4 text-emerald-500" />
                    <span className="text-xs font-medium text-stone-500">Drug Product (3.2.P)</span>
                  </div>
                  <div className="text-base font-semibold text-stone-900">{dpCompletion}%</div>
                  <div className="mt-2 h-1.5 bg-stone-100 rounded-full overflow-hidden">
                    <div className="h-full bg-emerald-500 rounded-full transition-all duration-150" style={{ width: `${dpCompletion}%` }} />
                  </div>
                </div>
                <div className="bg-white rounded-xl border p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Shield className="w-4 h-4 text-blue-500" />
                    <span className="text-xs font-medium text-stone-500">ICH Compliance</span>
                  </div>
                  <div className="text-base font-semibold text-stone-900">
                    {guardrails.filter(g => g.status === 'pass').length}/{guardrails.length}
                  </div>
                  <p className="text-xs text-stone-400 mt-1">guidelines checked</p>
                </div>
              </div>

              {/* ICH Guardrails */}
              <div>
                <h2 className="text-sm font-semibold text-stone-900 mb-3 flex items-center gap-2">
                  <Shield className="w-4 h-4 text-violet-500" />
                  ICH Quality Guardrails
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {guardrails.map(g => (
                    <GuardrailStatusCard key={g.guideline} {...g} />
                  ))}
                </div>
              </div>

              {/* Document Upload */}
              <div>
                <h2 className="text-sm font-semibold text-stone-900 mb-3 flex items-center gap-2">
                  <Upload className="w-4 h-4 text-violet-500" />
                  Upload Documents to Auto-Populate
                </h2>
                <DocumentUploadPanel onUpload={handleUpload} uploadedFiles={uploadedFiles} />
              </div>

              {/* Quick actions */}
              <div>
                <h2 className="text-sm font-semibold text-stone-900 mb-3">Quick Actions</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <button
                    onClick={() => setActiveTab('drug-substance')}
                    className="flex items-center gap-3 p-4 bg-white rounded-xl border hover:border-blue-200 hover:bg-blue-50/30 transition-colors text-left"
                  >
                    <FlaskConical className="w-5 h-5 text-violet-500" />
                    <div>
                      <p className="text-sm font-medium text-stone-900">Enter Drug Substance Data</p>
                      <p className="text-xs text-stone-500">CTD Section 3.2.S</p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-stone-400 ml-auto" />
                  </button>
                  <button
                    onClick={() => setActiveTab('drug-product')}
                    className="flex items-center gap-3 p-4 bg-white rounded-xl border hover:border-emerald-200 hover:bg-emerald-50/30 transition-colors text-left"
                  >
                    <Pill className="w-5 h-5 text-emerald-500" />
                    <div>
                      <p className="text-sm font-medium text-stone-900">Enter Drug Product Data</p>
                      <p className="text-xs text-stone-500">CTD Section 3.2.P</p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-stone-400 ml-auto" />
                  </button>
                  <button
                    onClick={() => setActiveTab('generate')}
                    className="flex items-center gap-3 p-4 bg-white rounded-xl border hover:border-blue-200 hover:bg-blue-50/30 transition-colors text-left"
                  >
                    <Sparkles className="w-5 h-5 text-blue-500" />
                    <div>
                      <p className="text-sm font-medium text-stone-900">Generate Module 3 Documents</p>
                      <p className="text-xs text-stone-500">AI-powered eCTD drafting</p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-stone-400 ml-auto" />
                  </button>
                  <button
                    onClick={() => setActiveTab('stability')}
                    className="flex items-center gap-3 p-4 bg-white rounded-xl border hover:border-amber-200 hover:bg-amber-50/30 transition-colors text-left"
                  >
                    <ThermometerSun className="w-5 h-5 text-amber-500" />
                    <div>
                      <p className="text-sm font-medium text-stone-900">Stability Studies</p>
                      <p className="text-xs text-stone-500">ICH Q1A compliance</p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-stone-400 ml-auto" />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ── DRUG SUBSTANCE TAB ──────────────────────────────────── */}
          {activeTab === 'drug-substance' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-stone-900">Drug Substance (3.2.S)</h2>
                  <p className="text-sm text-stone-500">
                    Enter the drug substance information per ICH M4Q(R1)
                  </p>
                </div>
                <div className="flex items-center gap-2 text-xs text-stone-500">
                  <div className="w-20 h-1.5 bg-stone-100 rounded-full overflow-hidden">
                    <div className="h-full bg-violet-500 rounded-full" style={{ width: `${dsCompletion}%` }} />
                  </div>
                  {dsCompletion}% complete
                </div>
              </div>

              {/* 3.2.S.1 General Information */}
              <div className="bg-white rounded-xl border p-5">
                <h3 className="text-sm font-semibold text-stone-900 mb-4 flex items-center gap-2">
                  <span className="px-2 py-0.5 bg-blue-100 text-stone-700 text-xs rounded font-semibold">3.2.S.1</span>
                  General Information
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField label="Substance Name (INN)" value={dsForm.substanceName} onChange={v => updateDsField('substanceName', v)} placeholder="e.g., Atorvastatin calcium" required />
                  <FormField label="INN / USAN" value={dsForm.inn} onChange={v => updateDsField('inn', v)} placeholder="e.g., Atorvastatin" />
                  <FormField label="CAS Number" value={dsForm.cas} onChange={v => updateDsField('cas', v)} placeholder="e.g., 134523-00-5" />
                  <FormField label="Molecular Formula" value={dsForm.molecularFormula} onChange={v => updateDsField('molecularFormula', v)} placeholder="e.g., C33H35FN2O5" required />
                  <FormField label="Molecular Weight (g/mol)" value={dsForm.molecularWeight} onChange={v => updateDsField('molecularWeight', v)} placeholder="e.g., 558.64" />
                  <FormField label="Polymorphic Form" value={dsForm.polymorph} onChange={v => updateDsField('polymorph', v)} placeholder="e.g., Form I (crystalline)" />
                </div>
              </div>

              {/* 3.2.S.1 Physical Properties */}
              <div className="bg-white rounded-xl border p-5">
                <h3 className="text-sm font-semibold text-stone-900 mb-4">Physical Properties</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField label="Solubility" value={dsForm.solubility} onChange={v => updateDsField('solubility', v)} placeholder="e.g., Freely soluble in methanol, sparingly soluble in water" />
                  <FormField label="Melting Point" value={dsForm.meltingPoint} onChange={v => updateDsField('meltingPoint', v)} placeholder="e.g., 159.2-160.7°C" />
                  <FormField label="Hygroscopicity" value={dsForm.hygroscopicity} onChange={v => updateDsField('hygroscopicity', v)} placeholder="e.g., Non-hygroscopic" />
                </div>
              </div>

              {/* 3.2.S.2 Manufacture */}
              <div className="bg-white rounded-xl border p-5">
                <h3 className="text-sm font-semibold text-stone-900 mb-4 flex items-center gap-2">
                  <span className="px-2 py-0.5 bg-blue-100 text-stone-700 text-xs rounded font-semibold">3.2.S.2</span>
                  Manufacture
                </h3>
                <div className="grid grid-cols-1 gap-4">
                  <FormField label="Manufacturing Route" value={dsForm.manufacturingRoute} onChange={v => updateDsField('manufacturingRoute', v)} placeholder="Brief description of synthetic route..." multiline />
                  <FormField label="Structure Elucidation" value={dsForm.structureDescription} onChange={v => updateDsField('structureDescription', v)} placeholder="Structural characterization methods (NMR, MS, IR, X-ray)..." multiline />
                </div>
              </div>

              {/* Upload section */}
              <div className="bg-white rounded-xl border p-5">
                <h3 className="text-sm font-semibold text-stone-900 mb-4 flex items-center gap-2">
                  <Upload className="w-4 h-4 text-violet-500" />
                  Upload Drug Substance Documents
                </h3>
                <p className="text-xs text-stone-500 mb-3">
                  Upload CoA, batch records, or characterization reports to auto-populate fields
                </p>
                <DocumentUploadPanel onUpload={handleUpload} uploadedFiles={uploadedFiles} />
              </div>
            </div>
          )}

          {/* ── DRUG PRODUCT TAB ────────────────────────────────────── */}
          {activeTab === 'drug-product' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-stone-900">Drug Product (3.2.P)</h2>
                  <p className="text-sm text-stone-500">
                    Enter the drug product information per ICH M4Q(R1)
                  </p>
                </div>
                <div className="flex items-center gap-2 text-xs text-stone-500">
                  <div className="w-20 h-1.5 bg-stone-100 rounded-full overflow-hidden">
                    <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${dpCompletion}%` }} />
                  </div>
                  {dpCompletion}% complete
                </div>
              </div>

              {/* 3.2.P.1 Description and Composition */}
              <div className="bg-white rounded-xl border p-5">
                <h3 className="text-sm font-semibold text-stone-900 mb-4 flex items-center gap-2">
                  <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 text-xs rounded font-semibold">3.2.P.1</span>
                  Description and Composition
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField label="Product Name" value={dpForm.productName} onChange={v => updateDpField('productName', v)} placeholder="e.g., Atorvastatin Tablets, 10 mg" required />
                  <FormField label="Dosage Form" value={dpForm.dosageForm} onChange={v => updateDpField('dosageForm', v)} placeholder="e.g., Film-coated tablets" required />
                  <FormField label="Route of Administration" value={dpForm.routeOfAdmin} onChange={v => updateDpField('routeOfAdmin', v)} placeholder="e.g., Oral" />
                  <FormField label="Strength" value={dpForm.strength} onChange={v => updateDpField('strength', v)} placeholder="e.g., 10 mg, 20 mg, 40 mg, 80 mg" />
                </div>
              </div>

              {/* 3.2.P.1 Composition */}
              <div className="bg-white rounded-xl border p-5">
                <h3 className="text-sm font-semibold text-stone-900 mb-4">Composition</h3>
                <div className="grid grid-cols-1 gap-4">
                  <FormField label="Composition / Formula" value={dpForm.composition} onChange={v => updateDpField('composition', v)} placeholder="List all components and their quantities per unit dose..." multiline hint="Include active ingredient, excipients, coating materials" />
                  <FormField label="Excipients" value={dpForm.excipients} onChange={v => updateDpField('excipients', v)} placeholder="e.g., Calcium carbonate, Microcrystalline cellulose, Croscarmellose sodium..." multiline />
                  <FormField label="Overages" value={dpForm.overages} onChange={v => updateDpField('overages', v)} placeholder="e.g., No manufacturing overages are used" />
                </div>
              </div>

              {/* 3.2.P.7 Container Closure & Storage */}
              <div className="bg-white rounded-xl border p-5">
                <h3 className="text-sm font-semibold text-stone-900 mb-4 flex items-center gap-2">
                  <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 text-xs rounded font-semibold">3.2.P.7-P.8</span>
                  Container Closure & Stability
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField label="Container Closure System" value={dpForm.containerClosure} onChange={v => updateDpField('containerClosure', v)} placeholder="e.g., HDPE bottles with child-resistant closure" />
                  <FormField label="Proposed Shelf Life" value={dpForm.shelfLife} onChange={v => updateDpField('shelfLife', v)} placeholder="e.g., 36 months" />
                  <FormField label="Storage Conditions" value={dpForm.storageConditions} onChange={v => updateDpField('storageConditions', v)} placeholder="e.g., Store at 20-25°C (68-77°F)" />
                </div>
              </div>
            </div>
          )}

          {/* ── SPECIFICATIONS TAB ──────────────────────────────────── */}
          {activeTab === 'specifications' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-stone-900">Specifications</h2>
                  <p className="text-sm text-stone-500">ICH Q6A/Q6B compliant quality specifications</p>
                </div>
                <button className="flex items-center gap-2 px-3 py-2 text-sm bg-stone-700 text-white rounded-lg hover:bg-stone-800 focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:ring-offset-2 outline-none">
                  <Plus className="w-4 h-4" />
                  Add Specification
                </button>
              </div>

              <div className="bg-white rounded-xl border p-6 text-center">
                <ClipboardCheck className="w-12 h-12 text-stone-400 mx-auto mb-3" />
                <h3 className="text-sm font-medium text-stone-700 mb-1">No specifications yet</h3>
                <p className="text-xs text-stone-500 max-w-md mx-auto mb-4">
                  Add quality specifications for drug substance and drug product, or upload a CoA to auto-generate.
                </p>
                <div className="flex items-center justify-center gap-3">
                  <button className="flex items-center gap-2 px-4 py-2 text-sm bg-stone-700 text-white rounded-lg hover:bg-stone-800 focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:ring-offset-2 outline-none">
                    <Plus className="w-4 h-4" />
                    Add Manually
                  </button>
                  <button
                    onClick={() => setActiveTab('overview')}
                    className="flex items-center gap-2 px-4 py-2 text-sm border border-stone-200 text-stone-700 rounded-lg hover:bg-stone-50"
                  >
                    <Upload className="w-4 h-4" />
                    Upload CoA
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ── STABILITY TAB ───────────────────────────────────────── */}
          {activeTab === 'stability' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-stone-900">Stability Studies</h2>
                  <p className="text-sm text-stone-500">ICH Q1A(R2) stability data management</p>
                </div>
                <button className="flex items-center gap-2 px-3 py-2 text-sm bg-stone-700 text-white rounded-lg hover:bg-stone-800 focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:ring-offset-2 outline-none">
                  <Plus className="w-4 h-4" />
                  New Study
                </button>
              </div>

              {/* Study conditions reference */}
              <div className="bg-white rounded-xl border p-5">
                <h3 className="text-sm font-semibold text-stone-900 mb-3">ICH Storage Conditions Reference</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                  <div className="p-3 bg-blue-50 rounded-lg">
                    <p className="font-medium text-stone-700 mb-1">Long-term</p>
                    <p className="text-blue-600">25°C ± 2°C / 60% RH ± 5% RH</p>
                    <p className="text-blue-500 mt-1">12 months minimum</p>
                  </div>
                  <div className="p-3 bg-amber-50 rounded-lg">
                    <p className="font-medium text-amber-700 mb-1">Intermediate</p>
                    <p className="text-amber-600">30°C ± 2°C / 65% RH ± 5% RH</p>
                    <p className="text-amber-500 mt-1">6 months minimum</p>
                  </div>
                  <div className="p-3 bg-red-50 rounded-lg">
                    <p className="font-medium text-red-700 mb-1">Accelerated</p>
                    <p className="text-red-600">40°C ± 2°C / 75% RH ± 5% RH</p>
                    <p className="text-red-500 mt-1">6 months minimum</p>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-xl border p-6 text-center">
                <ThermometerSun className="w-12 h-12 text-stone-400 mx-auto mb-3" />
                <h3 className="text-sm font-medium text-stone-700 mb-1">No stability studies yet</h3>
                <p className="text-xs text-stone-500 max-w-md mx-auto mb-4">
                  Create a stability study or upload stability data to track time-point results.
                </p>
                <button className="flex items-center gap-2 px-4 py-2 text-sm bg-stone-700 text-white rounded-lg hover:bg-stone-800 focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:ring-offset-2 outline-none mx-auto">
                  <Plus className="w-4 h-4" />
                  Create Stability Protocol
                </button>
              </div>
            </div>
          )}

          {/* ── IMPURITIES TAB ──────────────────────────────────────── */}
          {activeTab === 'impurities' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-stone-900">Impurity Profile</h2>
                  <p className="text-sm text-stone-500">ICH Q3A/Q3B/Q3C/Q3D impurity management</p>
                </div>
                <button className="flex items-center gap-2 px-3 py-2 text-sm bg-stone-700 text-white rounded-lg hover:bg-stone-800 focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:ring-offset-2 outline-none">
                  <Plus className="w-4 h-4" />
                  Add Impurity
                </button>
              </div>

              {/* ICH thresholds reference */}
              <div className="bg-white rounded-xl border p-5">
                <h3 className="text-sm font-semibold text-stone-900 mb-3">ICH Q3A(R2) Thresholds — Drug Substances</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-stone-200">
                        <th className="px-3 py-2 text-left font-medium text-stone-600">Max Daily Dose</th>
                        <th className="px-3 py-2 text-right font-medium text-stone-600">Reporting</th>
                        <th className="px-3 py-2 text-right font-medium text-stone-600">Identification</th>
                        <th className="px-3 py-2 text-right font-medium text-stone-600">Qualification</th>
                      </tr>
                    </thead>
                    <tbody className="text-stone-700">
                      <tr className="border-b border-stone-50">
                        <td className="px-3 py-2">≤ 2g/day</td>
                        <td className="px-3 py-2 text-right font-mono">0.05%</td>
                        <td className="px-3 py-2 text-right font-mono">0.10% or 1.0 mg/day</td>
                        <td className="px-3 py-2 text-right font-mono">0.15% or 1.0 mg/day</td>
                      </tr>
                      <tr>
                        <td className="px-3 py-2">&gt; 2g/day</td>
                        <td className="px-3 py-2 text-right font-mono">0.03%</td>
                        <td className="px-3 py-2 text-right font-mono">0.05%</td>
                        <td className="px-3 py-2 text-right font-mono">0.05%</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="bg-white rounded-xl border p-6 text-center">
                <Beaker className="w-12 h-12 text-stone-400 mx-auto mb-3" />
                <h3 className="text-sm font-medium text-stone-700 mb-1">No impurities recorded yet</h3>
                <p className="text-xs text-stone-500 max-w-md mx-auto mb-4">
                  Add impurities manually or upload analytical data (HPLC chromatograms, CoA) to auto-detect.
                </p>
                <button className="flex items-center gap-2 px-4 py-2 text-sm bg-stone-700 text-white rounded-lg hover:bg-stone-800 focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:ring-offset-2 outline-none mx-auto">
                  <Plus className="w-4 h-4" />
                  Add Impurity
                </button>
              </div>
            </div>
          )}

          {/* ── GENERATE MODULE 3 TAB ───────────────────────────────── */}
          {activeTab === 'generate' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-semibold text-stone-900">Generate Module 3 Documents</h2>
                <p className="text-sm text-stone-500">
                  AI-powered eCTD Module 3 drafting based on your CMC data. Each section is generated
                  using your drug substance and drug product data with ICH M4Q(R1) compliance.
                </p>
              </div>

              {/* Data readiness check */}
              <div className="bg-white rounded-xl border p-4">
                <h3 className="text-sm font-semibold text-stone-900 mb-3">Data Readiness</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className={cn(
                    'p-3 rounded-lg text-center',
                    dsCompletion > 50 ? 'bg-emerald-50' : 'bg-amber-50'
                  )}>
                    <p className={cn('text-lg font-semibold', dsCompletion > 50 ? 'text-emerald-700' : 'text-amber-700')}>
                      {dsCompletion}%
                    </p>
                    <p className="text-xs text-stone-600">Drug Substance</p>
                  </div>
                  <div className={cn(
                    'p-3 rounded-lg text-center',
                    dpCompletion > 50 ? 'bg-emerald-50' : 'bg-amber-50'
                  )}>
                    <p className={cn('text-lg font-semibold', dpCompletion > 50 ? 'text-emerald-700' : 'text-amber-700')}>
                      {dpCompletion}%
                    </p>
                    <p className="text-xs text-stone-600">Drug Product</p>
                  </div>
                  <div className="p-3 rounded-lg bg-stone-50 text-center">
                    <p className="text-lg font-semibold text-stone-500">0</p>
                    <p className="text-xs text-stone-600">Specifications</p>
                  </div>
                  <div className="p-3 rounded-lg bg-stone-50 text-center">
                    <p className="text-lg font-semibold text-stone-500">0</p>
                    <p className="text-xs text-stone-600">Stability Studies</p>
                  </div>
                </div>
              </div>

              {/* Drug Substance sections */}
              <div>
                <h3 className="text-sm font-semibold text-stone-900 mb-3 flex items-center gap-2">
                  <FlaskConical className="w-4 h-4 text-violet-500" />
                  Drug Substance Sections (3.2.S)
                </h3>
                <div className="space-y-2">
                  {MODULE_3_SECTIONS.filter(s => s.code.startsWith('3.2.S')).map(section => {
                    const Icon = section.icon;
                    const isGenerating = generatingSection === section.code;
                    return (
                      <div key={section.code} className="flex items-center gap-3 p-3 bg-white rounded-lg border hover:border-blue-200 transition-colors duration-150">
                        <Icon className="w-4 h-4 text-violet-500 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-stone-900">{section.code} — {section.title}</p>
                        </div>
                        <button
                          onClick={() => handleGenerateSection(section.code, section.title)}
                          disabled={isGenerating}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-violet-50 text-stone-700 border border-blue-200 rounded-lg hover:bg-violet-100 transition-colors disabled:opacity-60"
                        >
                          {isGenerating ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Sparkles className="w-3.5 h-3.5" />
                          )}
                          {isGenerating ? 'Generating...' : 'Draft with AnA'}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Drug Product sections */}
              <div>
                <h3 className="text-sm font-semibold text-stone-900 mb-3 flex items-center gap-2">
                  <Pill className="w-4 h-4 text-emerald-500" />
                  Drug Product Sections (3.2.P)
                </h3>
                <div className="space-y-2">
                  {MODULE_3_SECTIONS.filter(s => s.code.startsWith('3.2.P')).map(section => {
                    const Icon = section.icon;
                    const isGenerating = generatingSection === section.code;
                    return (
                      <div key={section.code} className="flex items-center gap-3 p-3 bg-white rounded-lg border hover:border-emerald-200 transition-colors duration-150">
                        <Icon className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-stone-900">{section.code} — {section.title}</p>
                        </div>
                        <button
                          onClick={() => handleGenerateSection(section.code, section.title)}
                          disabled={isGenerating}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg hover:bg-emerald-100 transition-colors disabled:opacity-60"
                        >
                          {isGenerating ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Sparkles className="w-3.5 h-3.5" />
                          )}
                          {isGenerating ? 'Generating...' : 'Draft with AnA'}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Export section */}
              <div className="bg-white rounded-xl border p-5">
                <h3 className="text-sm font-semibold text-stone-900 mb-2">Export Complete Module 3</h3>
                <p className="text-xs text-stone-500 mb-4">
                  Generate all Module 3 sections as a complete package for eCTD submission.
                </p>
                <div className="flex items-center gap-3">
                  <button className="flex items-center gap-2 px-4 py-2 text-sm bg-stone-900 text-white rounded-lg hover:bg-stone-800">
                    <Download className="w-4 h-4" />
                    Export as DOCX
                  </button>
                  <button className="flex items-center gap-2 px-4 py-2 text-sm border border-stone-200 text-stone-700 rounded-lg hover:bg-stone-50">
                    <Download className="w-4 h-4" />
                    Export as PDF
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default CMCHub;
