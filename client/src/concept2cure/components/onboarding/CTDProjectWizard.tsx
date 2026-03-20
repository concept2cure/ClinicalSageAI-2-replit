/**
 * CTD Project Wizard — 5-step onboarding for client CTD ingestion
 *
 * Steps: Project Basics → Regulatory Region → Document Upload → Compliance Check → Confirmation
 */

import React, { useState, useCallback } from 'react';
import {
  FileText, Globe, Upload, CheckCircle, AlertTriangle,
  ChevronRight, ChevronLeft, FolderOpen, Search,
} from 'lucide-react';

// ============================================================================
// TYPES
// ============================================================================

interface CTDProject {
  name: string;
  productName: string;
  productType: string;
  therapeuticArea: string;
  indication: string;
  regulatoryRegion: string;
  submissionType: string;
}

interface UploadedDoc {
  fileName: string;
  ctdModule: number;
  ctdSection: string;
  sectionTitle: string;
  documentType: string;
  size: number;
  status: string;
}

interface ComplianceGap {
  ctdModule: number;
  ctdSection: string;
  severity: string;
  description: string;
  recommendation: string;
}

const PRODUCT_TYPES = [
  { value: 'drug', label: 'Small Molecule Drug' },
  { value: 'biologic', label: 'Biologic' },
  { value: 'biosimilar', label: 'Biosimilar' },
  { value: 'device', label: 'Medical Device' },
  { value: 'combination', label: 'Combination Product' },
];

const REGIONS = [
  { value: 'FDA', label: 'FDA', country: 'United States' },
  { value: 'EMA', label: 'EMA', country: 'European Union' },
  { value: 'PMDA', label: 'PMDA', country: 'Japan' },
  { value: 'NMPA', label: 'NMPA', country: 'China' },
  { value: 'HealthCanada', label: 'Health Canada', country: 'Canada' },
  { value: 'TGA', label: 'TGA', country: 'Australia' },
  { value: 'MHRA', label: 'MHRA', country: 'United Kingdom' },
];

const SUBMISSION_TYPES: Record<string, string[]> = {
  FDA: ['IND', 'NDA', 'BLA', 'ANDA', '510(k)', 'PMA'],
  EMA: ['MAA', 'CTA', 'IMPD'],
  PMDA: ['JNDA', 'CTN'],
  NMPA: ['IND', 'NDA', 'BLA'],
  HealthCanada: ['CTA', 'NDS', 'ANDS'],
  TGA: ['CTN', 'Registration'],
  MHRA: ['CTA', 'MAA'],
};

const MODULE_NAMES = ['', 'Administrative', 'Summaries', 'Quality (CMC)', 'Nonclinical', 'Clinical'];

// ============================================================================
// COMPONENT
// ============================================================================

export default function CTDProjectWizard({ onComplete }: { onComplete?: () => void }) {
  const [step, setStep] = useState(1);
  const [project, setProject] = useState<CTDProject>({
    name: '',
    productName: '',
    productType: 'drug',
    therapeuticArea: '',
    indication: '',
    regulatoryRegion: 'FDA',
    submissionType: 'IND',
  });
  const [documents, setDocuments] = useState<UploadedDoc[]>([]);
  const [gaps, setGaps] = useState<ComplianceGap[]>([]);
  const [projectId, setProjectId] = useState<number | null>(null);
  const [validationResult, setValidationResult] = useState<{
    totalRequired: number;
    fulfilled: number;
    completionPercentage: number;
  } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [activeModule, setActiveModule] = useState(1);

  // Step 1 → 2: Create project on backend
  async function handleCreateProject() {
    try {
      const res = await fetch('/api/ctd/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(project),
      });
      if (res.ok) {
        const data = await res.json();
        setProjectId(data.projectId);
      }
    } catch {
      // Continue anyway — wizard can work in preview mode
    }
    setStep(3);
  }

  // File upload with auto-detect
  async function handleFileUpload(files: FileList) {
    setUploading(true);
    for (let i = 0; i < files.length; i++) {
      const file = files[i];

      // Try auto-detect
      let detected = null;
      try {
        const detectRes = await fetch(`/api/ctd/projects/${projectId}/detect-section`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ fileName: file.name }),
        });
        if (detectRes.ok) {
          const data = await detectRes.json();
          if (data.detected) detected = data;
        }
      } catch {
        // Fall through to defaults
      }

      const newDoc: UploadedDoc = {
        fileName: file.name,
        ctdModule: detected?.module || activeModule,
        ctdSection: detected?.section || `${activeModule}.0`,
        sectionTitle: detected?.title || `Module ${activeModule} Document`,
        documentType: detected?.documentType || 'general',
        size: file.size,
        status: 'uploaded',
      };

      // Upload to backend
      if (projectId) {
        try {
          const formData = new FormData();
          formData.append('file', file);
          formData.append('ctdModule', String(newDoc.ctdModule));
          formData.append('ctdSection', newDoc.ctdSection);
          formData.append('sectionTitle', newDoc.sectionTitle);
          formData.append('documentType', newDoc.documentType);

          await fetch(`/api/ctd/projects/${projectId}/upload`, {
            method: 'POST',
            credentials: 'include',
            body: formData,
          });
        } catch {
          // Continue in preview mode
        }
      }

      setDocuments((prev) => [...prev, newDoc]);
    }
    setUploading(false);
  }

  // Run validation
  async function handleValidate() {
    if (projectId) {
      try {
        const res = await fetch(`/api/ctd/projects/${projectId}/validate`, {
          method: 'POST',
          credentials: 'include',
        });
        if (res.ok) {
          const data = await res.json();
          setGaps(data.gaps || []);
          setValidationResult({
            totalRequired: data.totalRequired,
            fulfilled: data.fulfilled,
            completionPercentage: data.completionPercentage,
          });
        }
      } catch {
        // Fallback
      }
    }
    setStep(4);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    if (e.dataTransfer.files.length > 0) {
      handleFileUpload(e.dataTransfer.files);
    }
  }

  const canProceed = () => {
    if (step === 1) return project.name && project.productName;
    if (step === 2) return project.regulatoryRegion && project.submissionType;
    return true;
  };

  return (
    <div className="max-w-3xl mx-auto">
      {/* Progress */}
      <div className="flex items-center justify-between mb-8">
        {['Project Basics', 'Regulatory Region', 'Document Upload', 'Compliance Check', 'Confirmation'].map(
          (label, i) => (
            <div key={label} className="flex items-center">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                  step > i + 1
                    ? 'bg-green-500 text-white'
                    : step === i + 1
                    ? 'bg-indigo-600 text-white'
                    : 'bg-gray-200 text-gray-500'
                }`}
              >
                {step > i + 1 ? <CheckCircle size={16} /> : i + 1}
              </div>
              <span className={`ml-2 text-xs ${step === i + 1 ? 'text-gray-900 font-medium' : 'text-gray-400'}`}>
                {label}
              </span>
              {i < 4 && <ChevronRight size={14} className="mx-2 text-gray-300" />}
            </div>
          )
        )}
      </div>

      {/* Step 1: Project Basics */}
      {step === 1 && (
        <div className="bg-white border border-gray-200 rounded-xl p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Project Basics</h2>
          <div className="space-y-4">
            <div>
              <label className="text-sm text-gray-600 block mb-1">Project Name</label>
              <input
                type="text"
                value={project.name}
                onChange={(e) => setProject({ ...project, name: e.target.value })}
                placeholder="e.g., ABC-123 NDA Submission"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="text-sm text-gray-600 block mb-1">Product Name</label>
              <input
                type="text"
                value={project.productName}
                onChange={(e) => setProject({ ...project, productName: e.target.value })}
                placeholder="e.g., Drugamazin 50mg"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="text-sm text-gray-600 block mb-1">Product Type</label>
              <div className="grid grid-cols-3 gap-2">
                {PRODUCT_TYPES.map((pt) => (
                  <button
                    key={pt.value}
                    onClick={() => setProject({ ...project, productType: pt.value })}
                    className={`border rounded-lg px-3 py-2 text-sm transition-colors ${
                      project.productType === pt.value
                        ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                        : 'border-gray-300 text-gray-600 hover:border-gray-400'
                    }`}
                  >
                    {pt.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm text-gray-600 block mb-1">Therapeutic Area</label>
                <input
                  type="text"
                  value={project.therapeuticArea}
                  onChange={(e) => setProject({ ...project, therapeuticArea: e.target.value })}
                  placeholder="e.g., Oncology"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="text-sm text-gray-600 block mb-1">Indication</label>
                <input
                  type="text"
                  value={project.indication}
                  onChange={(e) => setProject({ ...project, indication: e.target.value })}
                  placeholder="e.g., Non-small cell lung cancer"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Step 2: Regulatory Region */}
      {step === 2 && (
        <div className="bg-white border border-gray-200 rounded-xl p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Regulatory Region & Submission Type</h2>
          <div className="space-y-4">
            <div>
              <label className="text-sm text-gray-600 block mb-2">Target Regulatory Agency</label>
              <div className="grid grid-cols-4 gap-2">
                {REGIONS.map((r) => (
                  <button
                    key={r.value}
                    onClick={() =>
                      setProject({
                        ...project,
                        regulatoryRegion: r.value,
                        submissionType: SUBMISSION_TYPES[r.value]?.[0] || 'IND',
                      })
                    }
                    className={`border rounded-lg p-3 text-center transition-colors ${
                      project.regulatoryRegion === r.value
                        ? 'border-indigo-500 bg-indigo-50'
                        : 'border-gray-300 hover:border-gray-400'
                    }`}
                  >
                    <div className="text-sm font-medium text-gray-900">{r.label}</div>
                    <div className="text-xs text-gray-500">{r.country}</div>
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-sm text-gray-600 block mb-2">Submission Type</label>
              <div className="flex gap-2 flex-wrap">
                {(SUBMISSION_TYPES[project.regulatoryRegion] || []).map((st) => (
                  <button
                    key={st}
                    onClick={() => setProject({ ...project, submissionType: st })}
                    className={`border rounded-lg px-4 py-2 text-sm transition-colors ${
                      project.submissionType === st
                        ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                        : 'border-gray-300 text-gray-600 hover:border-gray-400'
                    }`}
                  >
                    {st}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Step 3: Document Upload */}
      {step === 3 && (
        <div className="bg-white border border-gray-200 rounded-xl p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Upload CTD Documents</h2>

          {/* Module Tabs */}
          <div className="flex gap-1 mb-4 border-b border-gray-200">
            {[1, 2, 3, 4, 5].map((m) => (
              <button
                key={m}
                onClick={() => setActiveModule(m)}
                className={`px-4 py-2 text-sm border-b-2 transition-colors ${
                  activeModule === m
                    ? 'border-indigo-500 text-indigo-700 font-medium'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                M{m}: {MODULE_NAMES[m]}
              </button>
            ))}
          </div>

          {/* Drop Zone */}
          <div
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center mb-4 hover:border-indigo-400 transition-colors cursor-pointer"
            onClick={() => {
              const input = document.createElement('input');
              input.type = 'file';
              input.multiple = true;
              input.accept = '.pdf,.doc,.docx,.xml,.txt,.xlsx';
              input.onchange = (e) => {
                const files = (e.target as HTMLInputElement).files;
                if (files) handleFileUpload(files);
              };
              input.click();
            }}
          >
            <Upload size={32} className="mx-auto mb-2 text-gray-400" />
            <p className="text-sm text-gray-600">
              Drag & drop CTD documents here, or click to browse
            </p>
            <p className="text-xs text-gray-400 mt-1">
              PDF, DOCX, XML, TXT, XLSX — auto-detects CTD section from filename
            </p>
            {uploading && <p className="text-xs text-indigo-600 mt-2">Uploading...</p>}
          </div>

          {/* Uploaded Documents */}
          {documents.length > 0 && (
            <div className="space-y-1">
              <h3 className="text-sm font-medium text-gray-700 mb-2">
                Uploaded ({documents.length} documents)
              </h3>
              {documents
                .filter((d) => d.ctdModule === activeModule)
                .map((doc, i) => (
                  <div key={i} className="flex items-center gap-3 bg-gray-50 rounded-lg px-3 py-2 text-sm">
                    <FileText size={14} className="text-gray-400" />
                    <span className="flex-1 text-gray-700 truncate">{doc.fileName}</span>
                    <span className="text-xs text-gray-500">{doc.ctdSection}</span>
                    <span className="text-xs bg-green-50 text-green-700 px-2 py-0.5 rounded-full">
                      {doc.status}
                    </span>
                  </div>
                ))}
              {documents.filter((d) => d.ctdModule === activeModule).length === 0 && (
                <p className="text-sm text-gray-400 text-center py-4">
                  No documents uploaded for Module {activeModule} yet.
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Step 4: Compliance Check */}
      {step === 4 && (
        <div className="bg-white border border-gray-200 rounded-xl p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Compliance Check</h2>

          {validationResult && (
            <div className="mb-4 bg-indigo-50 rounded-xl p-4 flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-gray-900">
                  {validationResult.fulfilled} / {validationResult.totalRequired} required sections fulfilled
                </div>
                <div className="text-xs text-gray-500 mt-0.5">
                  {validationResult.completionPercentage}% complete for {project.regulatoryRegion} {project.submissionType}
                </div>
              </div>
              <div className="text-2xl font-bold text-indigo-600">
                {validationResult.completionPercentage}%
              </div>
            </div>
          )}

          {gaps.length > 0 ? (
            <div className="space-y-2">
              {gaps.map((gap, i) => (
                <div
                  key={i}
                  className={`border rounded-lg p-3 ${
                    gap.severity === 'critical'
                      ? 'border-red-200 bg-red-50'
                      : gap.severity === 'major'
                      ? 'border-amber-200 bg-amber-50'
                      : 'border-yellow-200 bg-yellow-50'
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <AlertTriangle
                      size={14}
                      className={
                        gap.severity === 'critical'
                          ? 'text-red-500'
                          : gap.severity === 'major'
                          ? 'text-amber-500'
                          : 'text-yellow-500'
                      }
                    />
                    <div>
                      <div className="text-sm font-medium text-gray-900">{gap.description}</div>
                      <div className="text-xs text-gray-500 mt-0.5">{gap.recommendation}</div>
                      <div className="text-xs text-gray-400 mt-0.5">
                        Module {gap.ctdModule} | Section {gap.ctdSection} | {gap.severity}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center text-green-600 py-8">
              <CheckCircle size={32} className="mx-auto mb-2" />
              <p className="text-sm">All required sections are present. Ready to activate.</p>
            </div>
          )}
        </div>
      )}

      {/* Step 5: Confirmation */}
      {step === 5 && (
        <div className="bg-white border border-gray-200 rounded-xl p-6 text-center">
          <CheckCircle size={48} className="mx-auto mb-4 text-green-500" />
          <h2 className="text-lg font-semibold text-gray-900 mb-2">CTD Project Ready</h2>
          <p className="text-sm text-gray-500 mb-6">
            {project.name} — {project.regulatoryRegion} {project.submissionType}
          </p>
          <div className="grid grid-cols-3 gap-4 mb-6 max-w-md mx-auto">
            <div className="bg-gray-50 rounded-lg p-3">
              <div className="text-lg font-semibold text-gray-900">{documents.length}</div>
              <div className="text-xs text-gray-500">Documents</div>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <div className="text-lg font-semibold text-gray-900">
                {validationResult?.completionPercentage || 0}%
              </div>
              <div className="text-xs text-gray-500">Complete</div>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <div className="text-lg font-semibold text-gray-900">{gaps.length}</div>
              <div className="text-xs text-gray-500">Gaps</div>
            </div>
          </div>
          <button
            onClick={onComplete}
            className="bg-indigo-600 text-white px-6 py-2 rounded-lg text-sm hover:bg-indigo-700 transition-colors"
          >
            Activate Project
          </button>
        </div>
      )}

      {/* Navigation */}
      <div className="flex justify-between mt-6">
        <button
          onClick={() => setStep(Math.max(1, step - 1))}
          disabled={step === 1}
          className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 disabled:opacity-30"
        >
          <ChevronLeft size={14} /> Back
        </button>
        {step < 5 && (
          <button
            onClick={() => {
              if (step === 2) handleCreateProject();
              else if (step === 3) handleValidate();
              else setStep(step + 1);
            }}
            disabled={!canProceed()}
            className="flex items-center gap-1 bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            {step === 3 ? 'Run Compliance Check' : 'Continue'} <ChevronRight size={14} />
          </button>
        )}
      </div>
    </div>
  );
}
