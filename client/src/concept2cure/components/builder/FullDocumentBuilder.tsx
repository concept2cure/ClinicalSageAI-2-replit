/**
 * @fileoverview Full Document Builder Wizard
 * @module concept2cure/components/builder/FullDocumentBuilder
 *
 * Wizard-style interface for building complete CSRs and CTDs.
 * Steps: Select type -> Select agencies -> Study info -> Generate -> Review -> Export
 */

import React, { useState, useCallback } from 'react';
import NanoBananaImageGenerator from '@/components/NanoBananaImageGenerator';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

type BuilderStep = 'type' | 'agencies' | 'study_info' | 'generating' | 'review';

interface StudyInfo {
  title: string;
  protocolNumber: string;
  phase: string;
  indication: string;
  sponsor: string;
  investigationalProduct: string;
  comparator: string;
  studyDesign: string;
  primaryEndpoint: string;
  secondaryEndpoints: string;
  sampleSize: string;
  treatmentDuration: string;
}

interface GeneratedSection {
  number: string;
  title: string;
  content: string;
  status: string;
  wordCount: number;
  agency?: string;
}

interface BuildResult {
  sections: GeneratedSection[];
  validationResults: { sectionNumber: string; agency: string; status: string; message: string }[];
}

const DOC_TYPES = [
  { type: 'csr', name: 'Clinical Study Report', description: 'Full ICH E3 CSR with all sections', tier: 'standard', icon: 'doc' },
  { type: 'ctd_full', name: 'Full CTD (Modules 1-5)', description: 'Complete submission dossier for regulatory filing', tier: 'professional', icon: 'layers' },
  { type: 'ctd_module2', name: 'CTD Module 2 — Summaries', description: 'Quality, nonclinical, and clinical summaries', tier: 'professional', icon: 'list' },
  { type: 'ctd_module5', name: 'CTD Module 5 — Clinical', description: 'Clinical study reports and data', tier: 'professional', icon: 'chart' },
];

const AGENCIES = [
  { id: 'FDA', name: 'FDA', country: 'United States', flag: '\u{1F1FA}\u{1F1F8}' },
  { id: 'EMA', name: 'EMA', country: 'European Union', flag: '\u{1F1EA}\u{1F1FA}' },
  { id: 'PMDA', name: 'PMDA', country: 'Japan', flag: '\u{1F1EF}\u{1F1F5}' },
  { id: 'NMPA', name: 'NMPA', country: 'China', flag: '\u{1F1E8}\u{1F1F3}' },
];

const PHASES = ['Phase 1', 'Phase 1/2', 'Phase 2', 'Phase 2/3', 'Phase 3', 'Phase 4'];
const DESIGNS = [
  'Randomized, double-blind, placebo-controlled',
  'Randomized, open-label, active-controlled',
  'Single-arm, open-label',
  'Randomized, double-blind, dose-ranging',
  'Cross-over, double-blind',
  'Other',
];

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export const FullDocumentBuilder: React.FC = () => {
  const [step, setStep] = useState<BuilderStep>('type');
  const [selectedType, setSelectedType] = useState('');
  const [selectedAgencies, setSelectedAgencies] = useState<string[]>(['FDA']);
  const [buildResult, setBuildResult] = useState<BuildResult | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generateProgress, setGenerateProgress] = useState(0);

  const [studyInfo, setStudyInfo] = useState<StudyInfo>({
    title: '',
    protocolNumber: '',
    phase: '',
    indication: '',
    sponsor: '',
    investigationalProduct: '',
    comparator: '',
    studyDesign: '',
    primaryEndpoint: '',
    secondaryEndpoints: '',
    sampleSize: '',
    treatmentDuration: '',
  });

  const updateStudyInfo = useCallback((field: keyof StudyInfo, value: string) => {
    setStudyInfo(prev => ({ ...prev, [field]: value }));
  }, []);

  const toggleAgency = useCallback((id: string) => {
    setSelectedAgencies(prev =>
      prev.includes(id) ? prev.filter(a => a !== id) : [...prev, id]
    );
  }, []);

  const handleGenerate = useCallback(async () => {
    setIsGenerating(true);
    setGenerateProgress(0);
    setStep('generating');

    try {
      // Simulate progress while waiting for API
      const progressInterval = setInterval(() => {
        setGenerateProgress(prev => Math.min(prev + 8, 90));
      }, 500);

      const response = await fetch('/api/deep-research/document/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify({
          documentType: selectedType,
          targetAgencies: selectedAgencies,
          studyInfo: {
            ...studyInfo,
            secondaryEndpoints: studyInfo.secondaryEndpoints
              .split('\n')
              .map(s => s.trim())
              .filter(Boolean),
            sampleSize: studyInfo.sampleSize ? parseInt(studyInfo.sampleSize, 10) : undefined,
          },
        }),
      });

      clearInterval(progressInterval);
      setGenerateProgress(100);

      if (response.ok) {
        const result = await response.json();
        setBuildResult(result);
        setStep('review');
      } else {
        const err = await response.json().catch(() => ({ error: 'Generation failed' }));
        alert(err.error || 'Document generation failed');
        setStep('study_info');
      }
    } catch (err) {
      alert('Network error — please try again');
      setStep('study_info');
    } finally {
      setIsGenerating(false);
    }
  }, [selectedType, selectedAgencies, studyInfo]);

  // ─────────────────────────────────────────────────────────────────────────────
  // INPUT HELPER
  // ─────────────────────────────────────────────────────────────────────────────

  const Input: React.FC<{
    label: string; field: keyof StudyInfo; placeholder?: string;
    type?: 'text' | 'select' | 'textarea'; options?: string[];
  }> = ({ label, field, placeholder, type = 'text', options }) => (
    <div className="space-y-1">
      <label className="text-sm font-medium text-zinc-700">{label}</label>
      {type === 'select' ? (
        <select
          value={studyInfo[field]}
          onChange={e => updateStudyInfo(field, e.target.value)}
          className="w-full px-3 py-2.5 border border-zinc-200 rounded-lg text-sm bg-white outline-none focus:border-blue-500"
        >
          <option value="">Select...</option>
          {options?.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      ) : type === 'textarea' ? (
        <textarea
          value={studyInfo[field]}
          onChange={e => updateStudyInfo(field, e.target.value)}
          placeholder={placeholder}
          rows={3}
          className="w-full px-3 py-2.5 border border-zinc-200 rounded-lg text-sm outline-none focus:border-blue-500 resize-none"
        />
      ) : (
        <input
          value={studyInfo[field]}
          onChange={e => updateStudyInfo(field, e.target.value)}
          placeholder={placeholder}
          className="w-full px-3 py-2.5 border border-zinc-200 rounded-lg text-sm outline-none focus:border-blue-500"
        />
      )}
    </div>
  );

  // ─────────────────────────────────────────────────────────────────────────────
  // STEP RENDERS
  // ─────────────────────────────────────────────────────────────────────────────

  const renderTypeStep = () => (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-zinc-900">Select Document Type</h2>
        <p className="text-sm text-zinc-500 mt-1">Choose the type of regulatory document to build</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {DOC_TYPES.map(dt => (
          <button
            key={dt.type}
            onClick={() => { setSelectedType(dt.type); setStep('agencies'); }}
            className={`p-5 rounded-xl border text-left transition-all hover:shadow-md ${
              selectedType === dt.type ? 'border-blue-500 bg-blue-50/50' : 'border-zinc-200 hover:border-zinc-300'
            }`}
          >
            <div className="font-semibold text-zinc-900">{dt.name}</div>
            <div className="text-sm text-zinc-500 mt-1">{dt.description}</div>
            <div className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-blue-600 bg-blue-50 px-2 py-0.5 rounded">
              {dt.tier === 'standard' ? 'Starter+' : 'Growth+'}
            </div>
          </button>
        ))}
      </div>
    </div>
  );

  const renderAgenciesStep = () => (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-zinc-900">Target Regulatory Agencies</h2>
        <p className="text-sm text-zinc-500 mt-1">Select which agencies you're filing with (Module 1 will be customized per agency)</p>
      </div>
      <div className="grid grid-cols-2 gap-4">
        {AGENCIES.map(a => (
          <button
            key={a.id}
            onClick={() => toggleAgency(a.id)}
            className={`p-4 rounded-xl border flex items-center gap-3 transition-all ${
              selectedAgencies.includes(a.id)
                ? 'border-blue-500 bg-blue-50/50'
                : 'border-zinc-200 hover:border-zinc-300'
            }`}
          >
            <span className="text-2xl">{a.flag}</span>
            <div className="text-left">
              <div className="font-semibold text-zinc-900">{a.name}</div>
              <div className="text-xs text-zinc-500">{a.country}</div>
            </div>
            {selectedAgencies.includes(a.id) && (
              <svg className="w-5 h-5 text-blue-500 ml-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            )}
          </button>
        ))}
      </div>
      <div className="flex gap-3">
        <button onClick={() => setStep('type')} className="px-4 py-2.5 text-sm text-zinc-600 border border-zinc-200 rounded-lg hover:bg-zinc-50">
          Back
        </button>
        <button
          onClick={() => setStep('study_info')}
          disabled={selectedAgencies.length === 0}
          className="px-6 py-2.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-60"
        >
          Continue
        </button>
      </div>
    </div>
  );

  const renderStudyInfoStep = () => (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-zinc-900">Study Information</h2>
        <p className="text-sm text-zinc-500 mt-1">Provide study details for document generation</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Input label="Study Title" field="title" placeholder="A Phase 3 Study of..." />
        <Input label="Protocol Number" field="protocolNumber" placeholder="PROT-2024-001" />
        <Input label="Phase" field="phase" type="select" options={PHASES} />
        <Input label="Study Design" field="studyDesign" type="select" options={DESIGNS} />
        <Input label="Indication" field="indication" placeholder="Type 2 Diabetes Mellitus" />
        <Input label="Sponsor" field="sponsor" placeholder="Acme Pharma Inc." />
        <Input label="Investigational Product" field="investigationalProduct" placeholder="Drug XYZ 100mg" />
        <Input label="Comparator" field="comparator" placeholder="Placebo (or active comparator)" />
        <Input label="Primary Endpoint" field="primaryEndpoint" placeholder="Change in HbA1c from baseline at Week 24" />
        <Input label="Sample Size" field="sampleSize" placeholder="500" />
        <Input label="Treatment Duration" field="treatmentDuration" placeholder="24 weeks" />
      </div>
      <Input label="Secondary Endpoints (one per line)" field="secondaryEndpoints" type="textarea" placeholder="Proportion achieving HbA1c <7%&#10;Change in fasting plasma glucose&#10;Change in body weight" />

      <div className="flex gap-3">
        <button onClick={() => setStep('agencies')} className="px-4 py-2.5 text-sm text-zinc-600 border border-zinc-200 rounded-lg hover:bg-zinc-50">
          Back
        </button>
        <button
          onClick={handleGenerate}
          disabled={!studyInfo.title || !studyInfo.indication || !studyInfo.primaryEndpoint}
          className="px-6 py-2.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-60"
        >
          Generate Document
        </button>
      </div>
    </div>
  );

  const renderGeneratingStep = () => (
    <div className="flex flex-col items-center justify-center py-20 space-y-6">
      <div className="w-12 h-12 rounded-lg bg-blue-50 flex items-center justify-center">
        <svg className="w-8 h-8 text-blue-600 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      </div>
      <div className="text-center">
        <h3 className="text-lg font-semibold text-zinc-900">Generating your document</h3>
        <p className="text-sm text-zinc-500 mt-1">
          Building {selectedType === 'csr' ? 'Clinical Study Report' : 'CTD'} for {selectedAgencies.join(', ')}
        </p>
      </div>
      <div className="w-64">
        <div className="h-2 bg-zinc-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-blue-600 rounded-full transition-all duration-500"
            style={{ width: `${generateProgress}%` }}
          />
        </div>
        <p className="text-xs text-zinc-400 text-center mt-2">{generateProgress}%</p>
      </div>
    </div>
  );

  const renderReviewStep = () => {
    if (!buildResult) return null;
    const draftedSections = buildResult.sections.filter(s => s.status === 'drafted');
    const validationPasses = buildResult.validationResults?.filter(v => v.status === 'pass').length || 0;
    const validationTotal = buildResult.validationResults?.length || 0;

    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-zinc-900">Document Generated</h2>
            <p className="text-sm text-zinc-500 mt-1">
              {buildResult.sections.length} sections | {draftedSections.length} drafted | Validation: {validationPasses}/{validationTotal} passed
            </p>
          </div>
          <button className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700">
            Open in Editor
          </button>
        </div>

        {/* Sections list */}
        <div className="border border-zinc-200 rounded-xl overflow-hidden">
          <div className="bg-zinc-50 px-4 py-2.5 border-b border-zinc-200">
            <h3 className="text-sm font-medium text-zinc-700">Document Sections</h3>
          </div>
          <div className="max-h-96 overflow-y-auto divide-y divide-zinc-100">
            {buildResult.sections.map(section => (
              <div key={`${section.number}-${section.agency || ''}`} className="px-4 py-3 flex items-center gap-3 hover:bg-zinc-50">
                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                  section.status === 'drafted' ? 'bg-green-500' :
                  section.status === 'template_only' ? 'bg-yellow-500' : 'bg-zinc-300'
                }`} />
                <span className="text-xs font-mono text-zinc-400 w-10">{section.number}</span>
                <span className="text-sm text-zinc-900 flex-1">{section.title}</span>
                {section.agency && (
                  <span className="text-xs text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">{section.agency}</span>
                )}
                <span className="text-xs text-zinc-400">{section.wordCount} words</span>
              </div>
            ))}
          </div>
        </div>

        {/* Validation results */}
        {buildResult.validationResults && buildResult.validationResults.length > 0 && (
          <div className="border border-zinc-200 rounded-xl overflow-hidden">
            <div className="bg-zinc-50 px-4 py-2.5 border-b border-zinc-200">
              <h3 className="text-sm font-medium text-zinc-700">Compliance Validation</h3>
            </div>
            <div className="max-h-48 overflow-y-auto divide-y divide-zinc-100">
              {buildResult.validationResults.filter(v => v.status !== 'pass').map((v, i) => (
                <div key={i} className="px-4 py-2 flex items-center gap-3">
                  <span className={`w-2 h-2 rounded-full ${v.status === 'fail' ? 'bg-red-500' : 'bg-yellow-500'}`} />
                  <span className="text-xs font-medium text-zinc-500">{v.agency}</span>
                  <span className="text-sm text-zinc-700 flex-1">{v.message}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex gap-3">
          <button onClick={() => { setBuildResult(null); setStep('type'); }} className="px-4 py-2.5 text-sm text-zinc-600 border border-zinc-200 rounded-lg hover:bg-zinc-50">
            Start New
          </button>
        </div>

        {/* Nano Banana — Generate visuals for this document */}
        <div className="mt-6 pt-6 border-t border-zinc-200">
          <NanoBananaImageGenerator
            context={`${selectedType === 'csr' ? 'Clinical Study Report' : 'CTD submission'} figures for ${studyInfo.indication || 'regulatory document'} — ${studyInfo.phase || ''} ${studyInfo.studyDesign || ''}`}
            mode="infographic"
            promptSuffix="Professional regulatory document style. Clean, publication-ready."
          />
        </div>
      </div>
    );
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // MAIN RENDER
  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div className="h-full overflow-y-auto bg-[#FAFAF9]">
      <div className="max-w-3xl mx-auto px-6 py-8">
        {/* Progress bar */}
        {step !== 'generating' && (
          <div className="flex items-center gap-2 mb-8">
            {(['type', 'agencies', 'study_info', 'review'] as BuilderStep[]).map((s, i) => (
              <React.Fragment key={s}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium ${
                  step === s ? 'bg-blue-600 text-white' :
                  (['type', 'agencies', 'study_info', 'review'].indexOf(step) > i) ? 'bg-blue-100 text-blue-600' :
                  'bg-zinc-100 text-zinc-400'
                }`}>
                  {i + 1}
                </div>
                {i < 3 && <div className={`flex-1 h-0.5 ${(['type', 'agencies', 'study_info', 'review'].indexOf(step) > i) ? 'bg-blue-200' : 'bg-zinc-100'}`} />}
              </React.Fragment>
            ))}
          </div>
        )}

        {step === 'type' && renderTypeStep()}
        {step === 'agencies' && renderAgenciesStep()}
        {step === 'study_info' && renderStudyInfoStep()}
        {step === 'generating' && renderGeneratingStep()}
        {step === 'review' && renderReviewStep()}
      </div>
    </div>
  );
};

export default FullDocumentBuilder;
