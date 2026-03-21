/**
 * Client Intelligence Page
 *
 * The client setup experience where organizations load their company persona,
 * upload documents for forensic analysis, and build the intelligence memory
 * that feeds AnA and all agents.
 *
 * Tabs:
 *   1. Company Persona — Identity, regulatory profile, culture, stakeholders
 *   2. Document Vault  — Upload & ingest PDFs, DOCX, XLSX, etc.
 *   3. Memory Explorer — Browse, verify, and manage learned intelligence
 *   4. Document Checklist — What we need from the client
 *
 * @module concept2cure/pages/ClientIntelligencePage
 */

import React, { useState, useCallback, useRef } from 'react';
import {
  Brain,
  Building2,
  Upload,
  FileText,
  CheckCircle2,
  AlertCircle,
  ChevronDown,
  ChevronRight,
  Shield,
  Sparkles,
  Trash2,
  BadgeCheck,
  ClipboardList,
  Database,
  Loader2,
  X,
  Plus,
} from 'lucide-react';
import { useClientIntelligence, type ClientProfile, type PipelineAsset, type Stakeholder } from '../hooks/useClientIntelligence';

// ─── Constants ──────────────────────────────────────────────────────────────

const INDUSTRIES = [
  'Pharmaceutical',
  'Biotechnology',
  'Medical Devices',
  'Diagnostics',
  'CRO',
  'Academic / Research',
  'Biosimilars',
  'Gene & Cell Therapy',
  'Digital Health',
  'Other',
];

const SUBMISSION_TYPES = [
  'IND', 'NDA', 'BLA', 'ANDA', '510(k)', 'PMA', 'De Novo',
  'EUA', 'MAA', 'IMPD', 'CTA', 'eCTD',
];

const REGULATORY_MARKETS = [
  'US-FDA', 'EU-EMA', 'UK-MHRA', 'JP-PMDA', 'CN-NMPA',
  'CA-Health Canada', 'AU-TGA', 'KR-MFDS', 'BR-ANVISA',
];

const THERAPEUTIC_AREAS = [
  'Oncology', 'Immunology', 'Neurology', 'Cardiovascular',
  'Rare Disease', 'Infectious Disease', 'Metabolic',
  'Respiratory', 'Hematology', 'Ophthalmology', 'Dermatology',
  'Gastroenterology', 'Musculoskeletal', 'Gene Therapy',
  'Cell Therapy', 'Vaccines', 'Other',
];

// ─── Sub-components ─────────────────────────────────────────────────────────

const SectionCard: React.FC<{
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  collapsible?: boolean;
  defaultOpen?: boolean;
}> = ({ title, icon, children, collapsible = false, defaultOpen = true }) => {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="bg-white border border-zinc-200 rounded-xl overflow-hidden">
      <button
        onClick={collapsible ? () => setOpen(o => !o) : undefined}
        className={`w-full flex items-center gap-3 px-5 py-4 text-left ${collapsible ? 'cursor-pointer hover:bg-zinc-50' : 'cursor-default'} transition-colors`}
      >
        <span className="text-blue-600">{icon}</span>
        <h3 className="text-sm font-semibold text-zinc-900 flex-1">{title}</h3>
        {collapsible && (
          open ? <ChevronDown className="w-4 h-4 text-zinc-400" /> : <ChevronRight className="w-4 h-4 text-zinc-400" />
        )}
      </button>
      {(!collapsible || open) && (
        <div className="px-5 pb-5 border-t border-zinc-200 pt-4">
          {children}
        </div>
      )}
    </div>
  );
};

const TagPicker: React.FC<{
  label: string;
  options: string[];
  selected: string[];
  onChange: (selected: string[]) => void;
}> = ({ label, options, selected, onChange }) => {
  return (
    <div>
      <label className="block text-xs font-medium text-zinc-600 mb-2">{label}</label>
      <div className="flex flex-wrap gap-1.5">
        {options.map(opt => {
          const isSelected = selected.includes(opt);
          return (
            <button
              key={opt}
              onClick={() =>
                onChange(isSelected ? selected.filter(s => s !== opt) : [...selected, opt])
              }
              className={`px-2.5 py-1 rounded-full text-xs font-medium transition-all ${
                isSelected
                  ? 'bg-blue-100 text-blue-700 ring-1 ring-blue-300'
                  : 'bg-zinc-100 text-zinc-500 hover:bg-zinc-200'
              }`}
            >
              {opt}
            </button>
          );
        })}
      </div>
    </div>
  );
};

const FieldInput: React.FC<{
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: 'text' | 'number' | 'url';
}> = ({ label, value, onChange, placeholder, type = 'text' }) => (
  <div>
    <label className="block text-xs font-medium text-zinc-600 mb-1">{label}</label>
    <input
      type={type}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full px-3 py-2 text-sm border border-zinc-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all duration-150"
    />
  </div>
);

const TextArea: React.FC<{
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
  hint?: string;
}> = ({ label, value, onChange, placeholder, rows = 4, hint }) => (
  <div>
    <label className="block text-xs font-medium text-zinc-600 mb-1">{label}</label>
    {hint && <p className="text-xs text-zinc-400 mb-1.5">{hint}</p>}
    <textarea
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      className="w-full px-3 py-2 text-sm border border-zinc-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all resize-y"
    />
  </div>
);

// ─── Main Page ──────────────────────────────────────────────────────────────

export default function ClientIntelligencePage() {
  const {
    profile,
    isProfileLoading,
    saveProfile,
    isSavingProfile,
    memoryEntries,
    memoryTotalCount,
    isMemoryLoading,
    verifyEntry,
    archiveEntry,
    ingestedDocuments,
    isDocumentsLoading,
    uploadDocument,
    isUploading,
    uploadProgress,
    documentChecklist,
  } = useClientIntelligence();

  const [activeTab, setActiveTab] = useState<'persona' | 'documents' | 'memory' | 'checklist'>('persona');
  const [saveMessage, setSaveMessage] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Form state (initialized from profile) ───────────────────────
  const [formState, setFormState] = useState<Partial<ClientProfile>>({});

  // Merge profile data with local form state
  const merged = { ...profile, ...formState };

  const updateField = useCallback((field: string, value: any) => {
    setFormState(prev => ({ ...prev, [field]: value }));
  }, []);

  // ── Save handler ────────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    try {
      const dataToSave = {
        companyName: merged.companyName || 'Unnamed Client',
        industry: merged.industry,
        subIndustry: merged.subIndustry,
        companySize: merged.companySize,
        headquarters: merged.headquarters,
        website: merged.website,
        yearFounded: merged.yearFounded,
        primarySubmissionTypes: merged.primarySubmissionTypes || [],
        regulatoryMarkets: merged.regulatoryMarkets || [],
        therapeuticAreas: merged.therapeuticAreas || [],
        technologyPlatforms: merged.technologyPlatforms || [],
        pipelineAssets: merged.pipelineAssets || [],
        companyPersona: merged.companyPersona,
        regulatoryPhilosophy: merged.regulatoryPhilosophy,
        communicationPreferences: merged.communicationPreferences,
        keyStakeholders: merged.keyStakeholders || [],
      };

      await saveProfile(dataToSave as any);
      setFormState({});
      setSaveMessage('Profile saved successfully');
      setTimeout(() => setSaveMessage(''), 3000);
    } catch (err: any) {
      setSaveMessage(`Error: ${err.message}`);
      setTimeout(() => setSaveMessage(''), 5000);
    }
  }, [merged, saveProfile]);

  // ── File upload handler ─────────────────────────────────────────
  const handleFileUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files?.length) return;

      for (const file of Array.from(files)) {
        await uploadDocument(file);
      }

      // Reset input
      if (fileInputRef.current) fileInputRef.current.value = '';
    },
    [uploadDocument]
  );

  // ── Drop handler ────────────────────────────────────────────────
  const [isDragging, setIsDragging] = useState(false);
  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const files = e.dataTransfer.files;
      for (const file of Array.from(files)) {
        await uploadDocument(file);
      }
    },
    [uploadDocument]
  );

  // ── Pipeline assets management ──────────────────────────────────
  const addPipelineAsset = useCallback(() => {
    const current = (merged.pipelineAssets || []) as PipelineAsset[];
    updateField('pipelineAssets', [...current, { name: '', phase: '', indication: '' }]);
  }, [merged.pipelineAssets, updateField]);

  const updatePipelineAsset = useCallback(
    (index: number, field: string, value: string) => {
      const current = [...((merged.pipelineAssets || []) as PipelineAsset[])];
      current[index] = { ...current[index], [field]: value };
      updateField('pipelineAssets', current);
    },
    [merged.pipelineAssets, updateField]
  );

  const removePipelineAsset = useCallback(
    (index: number) => {
      const current = [...((merged.pipelineAssets || []) as PipelineAsset[])];
      current.splice(index, 1);
      updateField('pipelineAssets', current);
    },
    [merged.pipelineAssets, updateField]
  );

  // ── Tab definitions ─────────────────────────────────────────────
  const tabs = [
    { id: 'persona' as const, label: 'Company Persona', icon: <Building2 className="w-4 h-4" /> },
    { id: 'documents' as const, label: 'Document Vault', icon: <Upload className="w-4 h-4" /> },
    { id: 'memory' as const, label: 'Memory Explorer', icon: <Brain className="w-4 h-4" />, badge: memoryTotalCount > 0 ? String(memoryTotalCount) : undefined },
    { id: 'checklist' as const, label: 'Document Checklist', icon: <ClipboardList className="w-4 h-4" /> },
  ];

  // ── Loading state ───────────────────────────────────────────────
  if (isProfileLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <Loader2 className="w-8 h-8 text-blue-500 animate-spin mx-auto mb-3" />
          <p className="text-sm text-zinc-500">Loading client intelligence...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-zinc-50/50">
      {/* ── Header ─────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 bg-white border-b border-zinc-200 px-6 py-4">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center shadow-sm">
            <Brain className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-zinc-900">Client Intelligence</h1>
            <p className="text-xs text-zinc-500">
              Build deep organizational memory so AnA and all agents intimately understand your needs
            </p>
          </div>
          {saveMessage && (
            <div className={`ml-auto px-3 py-1.5 rounded-lg text-xs font-medium ${
              saveMessage.startsWith('Error') ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'
            }`}>
              {saveMessage}
            </div>
          )}
        </div>

        {/* Tab bar */}
        <div className="flex gap-1">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium transition-all ${
                activeTab === tab.id
                  ? 'bg-blue-50 text-blue-700 ring-1 ring-blue-200'
                  : 'text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700'
              }`}
            >
              {tab.icon}
              {tab.label}
              {tab.badge && (
                <span className="px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-600 text-xs font-semibold">
                  {tab.badge}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ── Tab Content ────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto p-6">
        {/* ═══ COMPANY PERSONA TAB ═══ */}
        {activeTab === 'persona' && (
          <div className="max-w-3xl mx-auto space-y-5">
            {/* Company Identity */}
            <SectionCard title="Company Identity" icon={<Building2 className="w-5 h-5" />}>
              <div className="grid grid-cols-2 gap-4">
                <FieldInput
                  label="Company Name"
                  value={merged.companyName || ''}
                  onChange={v => updateField('companyName', v)}
                  placeholder="e.g., Acme Therapeutics"
                />
                <div>
                  <label className="block text-xs font-medium text-zinc-600 mb-1">Industry</label>
                  <select
                    value={merged.industry || ''}
                    onChange={e => updateField('industry', e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-zinc-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  >
                    <option value="">Select industry...</option>
                    {INDUSTRIES.map(ind => (
                      <option key={ind} value={ind.toLowerCase().replace(/\s+/g, '-')}>{ind}</option>
                    ))}
                  </select>
                </div>
                <FieldInput
                  label="Company Size"
                  value={merged.companySize || ''}
                  onChange={v => updateField('companySize', v)}
                  placeholder="e.g., 250 employees"
                />
                <FieldInput
                  label="Headquarters"
                  value={merged.headquarters || ''}
                  onChange={v => updateField('headquarters', v)}
                  placeholder="e.g., Cambridge, MA"
                />
                <FieldInput
                  label="Website"
                  value={merged.website || ''}
                  onChange={v => updateField('website', v)}
                  placeholder="https://..."
                  type="url"
                />
                <FieldInput
                  label="Year Founded"
                  value={String(merged.yearFounded || '')}
                  onChange={v => updateField('yearFounded', parseInt(v) || undefined)}
                  placeholder="e.g., 2015"
                  type="number"
                />
              </div>
            </SectionCard>

            {/* Regulatory Profile */}
            <SectionCard title="Regulatory Profile" icon={<Shield className="w-5 h-5" />}>
              <div className="space-y-4">
                <TagPicker
                  label="Primary Submission Types"
                  options={SUBMISSION_TYPES}
                  selected={(merged.primarySubmissionTypes as string[]) || []}
                  onChange={v => updateField('primarySubmissionTypes', v)}
                />
                <TagPicker
                  label="Regulatory Markets"
                  options={REGULATORY_MARKETS}
                  selected={(merged.regulatoryMarkets as string[]) || []}
                  onChange={v => updateField('regulatoryMarkets', v)}
                />
                <TagPicker
                  label="Therapeutic Areas"
                  options={THERAPEUTIC_AREAS}
                  selected={(merged.therapeuticAreas as string[]) || []}
                  onChange={v => updateField('therapeuticAreas', v)}
                />
              </div>
            </SectionCard>

            {/* Pipeline Assets */}
            <SectionCard title="Pipeline Assets" icon={<Database className="w-5 h-5" />} collapsible defaultOpen={false}>
              <div className="space-y-3">
                {((merged.pipelineAssets || []) as PipelineAsset[]).map((asset, idx) => (
                  <div key={idx} className="flex gap-2 items-start p-3 bg-zinc-50 rounded-lg">
                    <div className="grid grid-cols-3 gap-2 flex-1">
                      <input
                        value={asset.name}
                        onChange={e => updatePipelineAsset(idx, 'name', e.target.value)}
                        placeholder="Drug/Device Name"
                        className="px-2.5 py-1.5 text-xs border border-zinc-200 rounded-md"
                      />
                      <input
                        value={asset.phase}
                        onChange={e => updatePipelineAsset(idx, 'phase', e.target.value)}
                        placeholder="Phase (e.g., Phase 2)"
                        className="px-2.5 py-1.5 text-xs border border-zinc-200 rounded-md"
                      />
                      <input
                        value={asset.indication}
                        onChange={e => updatePipelineAsset(idx, 'indication', e.target.value)}
                        placeholder="Indication"
                        className="px-2.5 py-1.5 text-xs border border-zinc-200 rounded-md"
                      />
                    </div>
                    <button onClick={() => removePipelineAsset(idx)} className="p-1 text-zinc-400 hover:text-red-500">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
                <button
                  onClick={addPipelineAsset}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-600 hover:bg-blue-50 rounded-lg transition-colors duration-150"
                >
                  <Plus className="w-3.5 h-3.5" /> Add pipeline asset
                </button>
              </div>
            </SectionCard>

            {/* Company Persona (SKILL.md style) */}
            <SectionCard title="Company Persona & Culture" icon={<Sparkles className="w-5 h-5" />}>
              <div className="space-y-4">
                <TextArea
                  label="Company Persona"
                  value={merged.companyPersona || ''}
                  onChange={v => updateField('companyPersona', v)}
                  placeholder="Describe your company's mission, values, culture, and what makes your team unique. This is your SKILL.md — the richer the description, the more personalized AnA's guidance becomes..."
                  rows={6}
                  hint="Think of this as your company's personality card. AnA reads this before every interaction."
                />
                <TextArea
                  label="Regulatory Philosophy"
                  value={merged.regulatoryPhilosophy || ''}
                  onChange={v => updateField('regulatoryPhilosophy', v)}
                  placeholder="How does your company approach regulatory strategy? Conservative? Innovative? Early agency engagement? Rolling submissions? etc."
                  rows={4}
                  hint="This helps AnA align regulatory recommendations with your preferred approach."
                />
                <TextArea
                  label="Communication Preferences"
                  value={merged.communicationPreferences || ''}
                  onChange={v => updateField('communicationPreferences', v)}
                  placeholder="e.g., We prefer detailed, data-driven responses with citations. Our team is highly technical — skip the basics. Use formal language for regulatory docs but casual for internal notes."
                  rows={3}
                />
              </div>
            </SectionCard>

            {/* Save button */}
            <div className="flex justify-end">
              <button
                onClick={handleSave}
                disabled={isSavingProfile}
                className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed transition-all shadow-sm"
              >
                {isSavingProfile ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="w-4 h-4" />
                )}
                Save Client Profile
              </button>
            </div>
          </div>
        )}

        {/* ═══ DOCUMENT VAULT TAB ═══ */}
        {activeTab === 'documents' && (
          <div className="max-w-3xl mx-auto space-y-5">
            {!profile?.id ? (
              <div className="text-center py-12">
                <Building2 className="w-12 h-12 text-zinc-400 mx-auto mb-3" />
                <p className="text-sm text-zinc-500 mb-2">Create a client profile first</p>
                <button
                  onClick={() => setActiveTab('persona')}
                  className="text-xs text-blue-600 hover:underline"
                >
                  Go to Company Persona tab
                </button>
              </div>
            ) : (
              <>
                {/* Upload zone */}
                <div
                  onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={handleDrop}
                  className={`border-2 border-dashed rounded-xl p-8 text-center transition-all ${
                    isDragging
                      ? 'border-blue-400 bg-blue-50'
                      : 'border-zinc-300 bg-white hover:border-blue-300 hover:bg-blue-50/30'
                  }`}
                >
                  {isUploading ? (
                    <div>
                      <Loader2 className="w-10 h-10 text-blue-500 animate-spin mx-auto mb-3" />
                      <p className="text-sm font-medium text-zinc-700 mb-2">
                        Processing document...
                      </p>
                      <div className="w-48 mx-auto bg-zinc-200 rounded-full h-2">
                        <div
                          className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                          style={{ width: `${uploadProgress}%` }}
                        />
                      </div>
                      <p className="text-xs text-zinc-400 mt-2">
                        Extracting text, analyzing content, building memory...
                      </p>
                    </div>
                  ) : (
                    <>
                      <Upload className="w-10 h-10 text-zinc-400 mx-auto mb-3" />
                      <p className="text-sm font-medium text-zinc-700 mb-1">
                        Drop files here or click to upload
                      </p>
                      <p className="text-xs text-zinc-400 mb-4">
                        PDF, DOCX, XLSX, CSV, TXT — up to 50MB each
                      </p>
                      <input
                        ref={fileInputRef}
                        type="file"
                        multiple
                        accept=".pdf,.docx,.doc,.xlsx,.xls,.csv,.txt,.md,.pptx"
                        onChange={handleFileUpload}
                        className="hidden"
                        id="file-upload"
                      />
                      <label
                        htmlFor="file-upload"
                        className="inline-flex items-center gap-2 px-5 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium cursor-pointer hover:bg-blue-700 transition-colors duration-150"
                      >
                        <Upload className="w-4 h-4" /> Choose Files
                      </label>
                    </>
                  )}
                </div>

                {/* Ingested documents list */}
                {ingestedDocuments.length > 0 && (
                  <SectionCard
                    title={`Ingested Documents (${ingestedDocuments.length})`}
                    icon={<FileText className="w-5 h-5" />}
                  >
                    <div className="space-y-2">
                      {ingestedDocuments.map(doc => (
                        <div
                          key={doc.id}
                          className="flex items-center gap-3 p-3 bg-zinc-50 rounded-lg"
                        >
                          <FileText className="w-5 h-5 text-zinc-400 flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-zinc-900 truncate">
                              {doc.fileName}
                            </p>
                            <div className="flex items-center gap-3 text-xs text-zinc-400">
                              <span>{doc.fileType?.toUpperCase()}</span>
                              {doc.fileSizeBytes && (
                                <span>{(doc.fileSizeBytes / 1024).toFixed(0)} KB</span>
                              )}
                              {doc.tokenCount && <span>{doc.tokenCount.toLocaleString()} tokens</span>}
                              {doc.memoryEntriesGenerated !== undefined && doc.memoryEntriesGenerated > 0 && (
                                <span className="text-emerald-600">
                                  {doc.memoryEntriesGenerated} insights extracted
                                </span>
                              )}
                            </div>
                          </div>
                          <span
                            className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                              doc.processingStatus === 'completed'
                                ? 'bg-emerald-100 text-emerald-700'
                                : doc.processingStatus === 'failed'
                                ? 'bg-red-100 text-red-700'
                                : 'bg-amber-100 text-amber-700'
                            }`}
                          >
                            {doc.processingStatus}
                          </span>
                        </div>
                      ))}
                    </div>
                  </SectionCard>
                )}

                {/* Stats */}
                {profile && (
                  <div className="grid grid-cols-3 gap-4">
                    <div className="bg-white border border-zinc-200 rounded-xl p-4 text-center">
                      <p className="text-2xl font-semibold text-blue-600">
                        {profile.totalDocumentsIngested || 0}
                      </p>
                      <p className="text-xs text-zinc-500">Documents Ingested</p>
                    </div>
                    <div className="bg-white border border-zinc-200 rounded-xl p-4 text-center">
                      <p className="text-2xl font-semibold text-violet-600">
                        {((profile.totalTokensProcessed || 0) / 1000).toFixed(0)}K
                      </p>
                      <p className="text-xs text-zinc-500">Tokens Processed</p>
                    </div>
                    <div className="bg-white border border-zinc-200 rounded-xl p-4 text-center">
                      <p className="text-2xl font-semibold text-emerald-600">
                        {memoryTotalCount}
                      </p>
                      <p className="text-xs text-zinc-500">Memory Entries</p>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ═══ MEMORY EXPLORER TAB ═══ */}
        {activeTab === 'memory' && (
          <div className="max-w-3xl mx-auto space-y-5">
            {memoryEntries.length === 0 ? (
              <div className="text-center py-12">
                <Brain className="w-12 h-12 text-zinc-400 mx-auto mb-3" />
                <p className="text-sm text-zinc-500 mb-1">No memory entries yet</p>
                <p className="text-xs text-zinc-400">
                  Upload documents in the Document Vault tab to start building intelligence
                </p>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-zinc-700">
                    {memoryTotalCount} Knowledge Atoms
                  </h2>
                  <span className="text-xs text-zinc-400">
                    AI-extracted insights from your uploaded documents
                  </span>
                </div>

                {/* Category filter chips */}
                <div className="flex flex-wrap gap-1.5">
                  {['all', 'persona', 'regulatory', 'pipeline', 'competitive', 'clinical', 'operational', 'history'].map(cat => {
                    const count = cat === 'all'
                      ? memoryTotalCount
                      : memoryEntries.filter(e => e.category === cat).length;
                    return (
                      <span
                        key={cat}
                        className="px-2.5 py-1 rounded-full text-xs font-medium bg-zinc-100 text-zinc-600"
                      >
                        {cat === 'all' ? 'All' : cat.charAt(0).toUpperCase() + cat.slice(1)} ({count})
                      </span>
                    );
                  })}
                </div>

                {/* Memory entries */}
                <div className="space-y-2">
                  {memoryEntries.map(entry => (
                    <div
                      key={entry.id}
                      className="bg-white border border-zinc-200 rounded-xl p-4 hover:border-blue-200 transition-colors duration-150"
                    >
                      <div className="flex items-start gap-3">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                          entry.importanceLevel === 'high' || entry.importanceLevel === 'critical'
                            ? 'bg-amber-100'
                            : 'bg-zinc-100'
                        }`}>
                          <Brain className={`w-4 h-4 ${
                            entry.importanceLevel === 'high' || entry.importanceLevel === 'critical'
                              ? 'text-amber-600'
                              : 'text-zinc-400'
                          }`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <h4 className="text-sm font-medium text-zinc-900 truncate">
                              {entry.title}
                            </h4>
                            {entry.isVerifiedByUser && (
                              <BadgeCheck className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                            )}
                          </div>
                          <p className="text-xs text-zinc-600 leading-relaxed mb-2">
                            {entry.content}
                          </p>
                          <div className="flex items-center gap-3 text-xs text-zinc-400">
                            <span className="px-1.5 py-0.5 rounded bg-zinc-100 font-medium">
                              {entry.category}
                            </span>
                            {entry.sourceDocumentName && (
                              <span>from: {entry.sourceDocumentName}</span>
                            )}
                            {entry.confidenceScore !== undefined && (
                              <span>{Math.round((entry.confidenceScore || 0) * 100)}% confidence</span>
                            )}
                          </div>
                        </div>
                        <div className="flex gap-1 flex-shrink-0">
                          {!entry.isVerifiedByUser && (
                            <button
                              onClick={() => verifyEntry(entry.id)}
                              className="p-1.5 rounded-lg text-zinc-400 hover:text-emerald-600 hover:bg-emerald-50 transition-colors duration-150"
                              title="Verify this insight"
                            >
                              <CheckCircle2 className="w-4 h-4" />
                            </button>
                          )}
                          <button
                            onClick={() => archiveEntry(entry.id)}
                            className="p-1.5 rounded-lg text-zinc-400 hover:text-red-500 hover:bg-red-50 transition-colors duration-150"
                            title="Remove this insight"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* ═══ DOCUMENT CHECKLIST TAB ═══ */}
        {activeTab === 'checklist' && (
          <div className="max-w-3xl mx-auto space-y-5">
            <div className="bg-white border border-zinc-200 rounded-xl p-5">
              <div className="flex items-center gap-3 mb-4">
                <ClipboardList className="w-5 h-5 text-blue-600" />
                <div>
                  <h2 className="text-sm font-semibold text-zinc-900">
                    What We Need From You
                  </h2>
                  <p className="text-xs text-zinc-500">
                    Upload these documents to build comprehensive intelligence. The more you provide, the smarter AnA becomes.
                  </p>
                </div>
              </div>

              {documentChecklist.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-sm text-zinc-500">
                    Create a client profile first to see the document checklist
                  </p>
                </div>
              ) : (
                <div className="space-y-6">
                  {documentChecklist.map((cat, catIdx) => (
                    <div key={catIdx}>
                      <h3 className="text-xs font-semibold text-zinc-600 uppercase tracking-wide mb-2">
                        {cat.category}
                      </h3>
                      <div className="space-y-1.5">
                        {cat.items.map((item, itemIdx) => (
                          <div
                            key={itemIdx}
                            className={`flex items-center gap-3 p-3 rounded-lg ${
                              item.uploaded ? 'bg-emerald-50' : 'bg-zinc-50'
                            }`}
                          >
                            {item.uploaded ? (
                              <CheckCircle2 className="w-5 h-5 text-emerald-500 flex-shrink-0" />
                            ) : item.priority === 'required' ? (
                              <AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0" />
                            ) : (
                              <div className="w-5 h-5 rounded-full border-2 border-zinc-300 flex-shrink-0" />
                            )}
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-zinc-700">{item.label}</p>
                              <p className="text-xs text-zinc-400">{item.description}</p>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              <span className="text-xs text-zinc-400">
                                {item.fileTypes.map(t => t.toUpperCase()).join(', ')}
                              </span>
                              <span
                                className={`px-1.5 py-0.5 rounded text-xs font-semibold ${
                                  item.priority === 'required'
                                    ? 'bg-amber-100 text-amber-700'
                                    : item.priority === 'recommended'
                                    ? 'bg-blue-100 text-blue-700'
                                    : 'bg-zinc-100 text-zinc-500'
                                }`}
                              >
                                {item.priority}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
