/**
 * INDAutoDraftWizard — Zero-prompt IND generation wizard.
 *
 * Multi-step dialog:
 *   Step 1: Upload source documents (nonclinical, CMC, protocols, IBs)
 *   Step 2: Configure — auto-detect drug name / indication / phase, select modules
 *   Step 3: Generate — real-time progress per CTD module section
 *   Step 4: Review — generated sections list with word counts and "Open in Editor"
 *
 * @module client/src/concept2cure/components/editor/INDAutoDraftWizard
 */

import React, { useState, useCallback, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import {
  Upload,
  FileText,
  X,
  ChevronRight,
  ChevronLeft,
  Loader2,
  CheckCircle,
  AlertCircle,
  Sparkles,
  File,
  ExternalLink,
} from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';

// ── Types ──────────────────────────────────────────────────────────────────

interface UploadedFile {
  name: string;
  size: number;
  extractedLength: number;
  detectedType: string;
}

interface DetectedMetadata {
  drugName: string;
  indication: string;
  phase: string;
}

interface GeneratedSection {
  code: string;
  title: string;
  content: string;
  wordCount: number;
  sourceCount: number;
  artifactId?: string;
}

interface INDAutoDraftWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  /** Called when a section should be opened in the editor */
  onOpenArtifact?: (artifactId: string) => void;
  /** Called after all generation is complete to refresh artifact list */
  onComplete?: () => void;
}

const MODULE_OPTIONS = [
  { module: 1, label: 'Module 1 — Administrative', description: 'Cover letter, FDA forms, table of contents' },
  { module: 2, label: 'Module 2 — CTD Summaries', description: 'Overviews, quality/nonclinical/clinical summaries' },
  { module: 3, label: 'Module 3 — Quality (CMC)', description: 'Drug substance and drug product data' },
  { module: 4, label: 'Module 4 — Nonclinical', description: 'Pharmacology, PK, toxicology' },
  { module: 5, label: 'Module 5 — Clinical', description: 'Clinical study reports and references' },
];

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ── Component ──────────────────────────────────────────────────────────────

export function INDAutoDraftWizard({
  open,
  onOpenChange,
  projectId,
  onOpenArtifact,
  onComplete,
}: INDAutoDraftWizardProps) {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);

  // Step 1 state
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Step 2 state
  const [drugName, setDrugName] = useState('');
  const [indication, setIndication] = useState('');
  const [phase, setPhase] = useState('');
  const [sponsor, setSponsor] = useState('');
  const [selectedModules, setSelectedModules] = useState<number[]>([1, 2, 3, 4, 5]);

  // Step 3 state
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [currentSection, setCurrentSection] = useState<string | null>(null);
  const [progressPercent, setProgressPercent] = useState(0);

  // Step 4 state
  const [generatedSections, setGeneratedSections] = useState<GeneratedSection[]>([]);

  // ── Reset ──────────────────────────────────────────────────────────────

  const resetWizard = useCallback(() => {
    setStep(1);
    setUploading(false);
    setUploadError(null);
    setSessionId(null);
    setUploadedFiles([]);
    setPendingFiles([]);
    setDrugName('');
    setIndication('');
    setPhase('');
    setSponsor('');
    setSelectedModules([1, 2, 3, 4, 5]);
    setGenerating(false);
    setGenerateError(null);
    setCurrentSection(null);
    setProgressPercent(0);
    setGeneratedSections([]);
  }, []);

  const handleClose = useCallback(() => {
    onOpenChange(false);
    // Reset after animation completes
    setTimeout(resetWizard, 200);
  }, [onOpenChange, resetWizard]);

  // ── Step 1: File handling ─────────────────────────────────────────────

  const handleFilesSelected = useCallback((files: FileList | File[]) => {
    const fileArray = Array.from(files);
    const accepted = fileArray.filter(f => {
      const ext = f.name.split('.').pop()?.toLowerCase();
      return ext && ['pdf', 'docx', 'xlsx', 'doc', 'txt', 'csv'].includes(ext);
    });
    setPendingFiles(prev => [...prev, ...accepted]);
    setUploadError(null);
  }, []);

  const handleRemovePending = useCallback((index: number) => {
    setPendingFiles(prev => prev.filter((_, i) => i !== index));
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files.length > 0) {
      handleFilesSelected(e.dataTransfer.files);
    }
  }, [handleFilesSelected]);

  const handleUpload = useCallback(async () => {
    if (pendingFiles.length === 0) return;
    setUploading(true);
    setUploadError(null);

    try {
      const formData = new FormData();
      for (const file of pendingFiles) {
        formData.append('files', file);
      }
      if (sessionId) {
        formData.append('sessionId', sessionId);
      }

      // File upload requires raw fetch (apiRequest sets Content-Type: application/json)
      const authToken = sessionStorage.getItem('auth_token') || localStorage.getItem('auth_token');
      const orgId = sessionStorage.getItem('organization_id') || localStorage.getItem('organization_id') || '';
      const res = await fetch('/api/knowledge-base/ind-autodraft/upload', {
        method: 'POST',
        body: formData,
        credentials: 'include',
        headers: {
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
          'x-organization-id': orgId,
        },
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Upload failed' }));
        throw new Error(err.error || `Upload failed (${res.status})`);
      }

      const data = await res.json();
      setSessionId(data.sessionId);
      setUploadedFiles(prev => [...prev, ...data.files]);
      setPendingFiles([]);

      // Auto-fill detected metadata
      if (data.detectedMetadata) {
        if (data.detectedMetadata.drugName && !drugName) {
          setDrugName(data.detectedMetadata.drugName);
        }
        if (data.detectedMetadata.indication && !indication) {
          setIndication(data.detectedMetadata.indication);
        }
        if (data.detectedMetadata.phase && !phase) {
          setPhase(data.detectedMetadata.phase);
        }
      }
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  }, [pendingFiles, sessionId, drugName, indication, phase]);

  // ── Step 3: Generate ──────────────────────────────────────────────────

  const handleGenerate = useCallback(async () => {
    if (!sessionId) return;
    setGenerating(true);
    setGenerateError(null);
    setProgressPercent(0);
    setCurrentSection('Initializing...');

    try {
      const res = await apiRequest('POST', '/api/knowledge-base/ind-autodraft/generate', {
        sessionId,
        projectId,
        modules: selectedModules,
        metadata: { drugName, indication, phase, sponsor },
      });

      const data = await res.json();

      if (data.error) {
        throw new Error(data.error);
      }

      setGeneratedSections(data.sections || []);
      setProgressPercent(100);
      setCurrentSection(null);
      setStep(4);
      onComplete?.();
    } catch (err) {
      setGenerateError(err instanceof Error ? err.message : 'Generation failed');
    } finally {
      setGenerating(false);
    }
  }, [sessionId, projectId, selectedModules, drugName, indication, phase, sponsor, onComplete]);

  // ── Step 4: Open in editor ────────────────────────────────────────────

  const handleOpenSection = useCallback((section: GeneratedSection) => {
    if (section.artifactId && onOpenArtifact) {
      onOpenArtifact(section.artifactId);
      handleClose();
    }
  }, [onOpenArtifact, handleClose]);

  const handleOpenAll = useCallback(() => {
    const first = generatedSections.find(s => s.artifactId);
    if (first?.artifactId && onOpenArtifact) {
      onOpenArtifact(first.artifactId);
      handleClose();
    }
  }, [generatedSections, onOpenArtifact, handleClose]);

  // ── Module toggle ─────────────────────────────────────────────────────

  const toggleModule = useCallback((mod: number) => {
    setSelectedModules(prev =>
      prev.includes(mod) ? prev.filter(m => m !== mod) : [...prev, mod].sort()
    );
  }, []);

  // ── Step titles ───────────────────────────────────────────────────────

  const stepTitles = ['Upload Sources', 'Configure', 'Generate', 'Review'];

  // ── Render ────────────────────────────────────────────────────────────

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col"
        aria-label="IND AutoDraft Wizard"
      >
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold text-stone-900 tracking-tight">
            IND AutoDraft
          </DialogTitle>
          <DialogDescription className="text-[13px] text-stone-500">
            Generate a complete IND draft from your source documents — no prompt engineering required.
          </DialogDescription>
        </DialogHeader>

        {/* Step indicator */}
        <div className="flex items-center gap-1 px-1 py-2" role="navigation" aria-label="Wizard steps">
          {stepTitles.map((title, i) => {
            const stepNum = (i + 1) as 1 | 2 | 3 | 4;
            const isActive = step === stepNum;
            const isComplete = step > stepNum;
            return (
              <React.Fragment key={stepNum}>
                {i > 0 && <div className="flex-1 h-px bg-stone-200" />}
                <div
                  className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-[12px] font-medium transition-colors duration-200 ${
                    isActive
                      ? 'text-stone-900 bg-stone-100'
                      : isComplete
                        ? 'text-stone-500'
                        : 'text-stone-400'
                  }`}
                  aria-current={isActive ? 'step' : undefined}
                >
                  <span
                    className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                      isActive
                        ? 'bg-stone-800 text-white'
                        : isComplete
                          ? 'bg-stone-300 text-white'
                          : 'bg-stone-200 text-stone-400'
                    }`}
                  >
                    {isComplete ? <CheckCircle className="w-3 h-3" /> : stepNum}
                  </span>
                  <span className="hidden sm:inline">{title}</span>
                </div>
              </React.Fragment>
            );
          })}
        </div>

        {/* Step content */}
        <div className="flex-1 overflow-y-auto px-1 py-2 min-h-0">
          {/* ── Step 1: Upload ──────────────────────────────────────────── */}
          {step === 1 && (
            <div className="space-y-4" data-testid="autodraft-step-upload">
              {/* Drop zone */}
              <div
                className="border-2 border-dashed border-stone-200 rounded-lg p-8 text-center hover:border-stone-300 transition-colors duration-200 cursor-pointer"
                onDragOver={e => e.preventDefault()}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                role="button"
                tabIndex={0}
                aria-label="Drop source documents here or click to browse"
                onKeyDown={e => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    fileInputRef.current?.click();
                  }
                }}
              >
                <Upload className="w-8 h-8 text-stone-300 mx-auto mb-3" />
                <p className="text-[13px] text-stone-600 font-medium">
                  Drop source documents here
                </p>
                <p className="text-[11px] text-stone-400 mt-1">
                  PDF, DOCX, XLSX, TXT, CSV — nonclinical reports, CMC data, protocols, IBs
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept=".pdf,.docx,.doc,.xlsx,.txt,.csv"
                  className="hidden"
                  onChange={e => {
                    if (e.target.files) handleFilesSelected(e.target.files);
                    e.target.value = '';
                  }}
                  aria-label="Select source documents"
                />
              </div>

              {/* Pending files */}
              {pendingFiles.length > 0 && (
                <div className="space-y-1" aria-label="Files ready to upload">
                  <p className="text-[11px] text-stone-500 font-medium uppercase tracking-wider">
                    Ready to upload
                  </p>
                  {pendingFiles.map((file, i) => (
                    <div
                      key={`${file.name}-${i}`}
                      className="flex items-center justify-between px-3 py-2 bg-stone-50 rounded-md"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <File className="w-3.5 h-3.5 text-stone-400 flex-shrink-0" />
                        <span className="text-[12px] text-stone-700 truncate">{file.name}</span>
                        <span className="text-[10px] text-stone-400 flex-shrink-0">
                          {formatFileSize(file.size)}
                        </span>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemovePending(i)}
                        className="p-0.5 h-auto text-stone-400 hover:text-stone-600"
                        aria-label={`Remove ${file.name}`}
                      >
                        <X className="w-3 h-3" />
                      </Button>
                    </div>
                  ))}
                  <Button
                    onClick={handleUpload}
                    disabled={uploading}
                    className="w-full mt-2 bg-stone-800 text-white hover:bg-stone-700 text-[13px]"
                    aria-label="Upload selected files"
                  >
                    {uploading ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                        Uploading...
                      </>
                    ) : (
                      <>
                        <Upload className="w-3.5 h-3.5 mr-1.5" />
                        Upload {pendingFiles.length} file{pendingFiles.length !== 1 ? 's' : ''}
                      </>
                    )}
                  </Button>
                </div>
              )}

              {/* Uploaded files */}
              {uploadedFiles.length > 0 && (
                <div className="space-y-1" aria-label="Uploaded files">
                  <p className="text-[11px] text-stone-500 font-medium uppercase tracking-wider">
                    Uploaded ({uploadedFiles.length})
                  </p>
                  {uploadedFiles.map((file, i) => (
                    <div
                      key={`${file.name}-${i}`}
                      className="flex items-center justify-between px-3 py-2 bg-emerald-50/50 rounded-md"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <CheckCircle className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                        <span className="text-[12px] text-stone-700 truncate">{file.name}</span>
                        <span className="text-[10px] text-stone-400 flex-shrink-0">
                          {formatFileSize(file.size)}
                        </span>
                      </div>
                      <span className="text-[10px] text-stone-400 flex-shrink-0">
                        {file.detectedType}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {uploadError && (
                <div className="flex items-center gap-2 px-3 py-2 bg-red-50 rounded-md" role="alert">
                  <AlertCircle className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />
                  <span className="text-[12px] text-red-700">{uploadError}</span>
                </div>
              )}
            </div>
          )}

          {/* ── Step 2: Configure ────────────────────────────────────────── */}
          {step === 2 && (
            <div className="space-y-5" data-testid="autodraft-step-configure">
              {/* Auto-detected metadata */}
              <div className="space-y-3">
                <p className="text-[11px] text-stone-500 font-medium uppercase tracking-wider">
                  Submission metadata
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label
                      htmlFor="autodraft-drug-name"
                      className="text-[11px] text-stone-500 font-medium block mb-1"
                    >
                      Drug name
                    </label>
                    <Input
                      id="autodraft-drug-name"
                      value={drugName}
                      onChange={e => setDrugName(e.target.value)}
                      placeholder="e.g. Compound X-123"
                      className="text-[13px] h-9"
                      aria-label="Drug name"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="autodraft-indication"
                      className="text-[11px] text-stone-500 font-medium block mb-1"
                    >
                      Indication
                    </label>
                    <Input
                      id="autodraft-indication"
                      value={indication}
                      onChange={e => setIndication(e.target.value)}
                      placeholder="e.g. Non-small cell lung cancer"
                      className="text-[13px] h-9"
                      aria-label="Indication"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="autodraft-phase"
                      className="text-[11px] text-stone-500 font-medium block mb-1"
                    >
                      Phase
                    </label>
                    <Input
                      id="autodraft-phase"
                      value={phase}
                      onChange={e => setPhase(e.target.value)}
                      placeholder="e.g. Phase 1"
                      className="text-[13px] h-9"
                      aria-label="Clinical trial phase"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="autodraft-sponsor"
                      className="text-[11px] text-stone-500 font-medium block mb-1"
                    >
                      Sponsor
                    </label>
                    <Input
                      id="autodraft-sponsor"
                      value={sponsor}
                      onChange={e => setSponsor(e.target.value)}
                      placeholder="e.g. Acme Therapeutics"
                      className="text-[13px] h-9"
                      aria-label="Sponsor name"
                    />
                  </div>
                </div>
              </div>

              {/* Module selection */}
              <div className="space-y-2">
                <p className="text-[11px] text-stone-500 font-medium uppercase tracking-wider">
                  Modules to generate
                </p>
                <div className="space-y-1.5">
                  {MODULE_OPTIONS.map(opt => (
                    <label
                      key={opt.module}
                      className="flex items-start gap-3 px-3 py-2.5 rounded-md hover:bg-stone-50 transition-colors duration-200 cursor-pointer"
                      htmlFor={`mod-${opt.module}`}
                    >
                      <Checkbox
                        id={`mod-${opt.module}`}
                        checked={selectedModules.includes(opt.module)}
                        onCheckedChange={() => toggleModule(opt.module)}
                        aria-label={`Include ${opt.label}`}
                        className="mt-0.5"
                      />
                      <div>
                        <span className="text-[13px] text-stone-700 font-medium">{opt.label}</span>
                        <span className="text-[11px] text-stone-400 block mt-0.5">
                          {opt.description}
                        </span>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── Step 3: Generate ─────────────────────────────────────────── */}
          {step === 3 && (
            <div className="space-y-4 py-4" data-testid="autodraft-step-generate">
              <div className="text-center space-y-3">
                <Sparkles className="w-8 h-8 text-stone-400 mx-auto" />
                <div>
                  <p className="text-[13px] text-stone-700 font-medium">
                    {generating ? 'Generating IND draft...' : generateError ? 'Generation failed' : 'Ready to generate'}
                  </p>
                  {currentSection && (
                    <p
                      className="text-[12px] text-stone-500 mt-1 transition-all duration-200"
                      aria-live="polite"
                    >
                      {currentSection}
                    </p>
                  )}
                </div>
              </div>

              <div className="px-4">
                <Progress
                  value={progressPercent}
                  className="h-2"
                  aria-label="Generation progress"
                />
                <p className="text-[10px] text-stone-400 text-center mt-1.5 tabular-nums">
                  {progressPercent}% complete
                </p>
              </div>

              {generateError && (
                <div className="flex items-center gap-2 px-3 py-2 bg-red-50 rounded-md mx-4" role="alert">
                  <AlertCircle className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />
                  <span className="text-[12px] text-red-700">{generateError}</span>
                </div>
              )}

              {!generating && !generateError && (
                <div className="px-4">
                  <Button
                    onClick={handleGenerate}
                    className="w-full bg-stone-800 text-white hover:bg-stone-700 text-[13px]"
                    aria-label="Start IND generation"
                  >
                    <Sparkles className="w-3.5 h-3.5 mr-1.5" />
                    Generate {selectedModules.length} module{selectedModules.length !== 1 ? 's' : ''}
                  </Button>
                  <p className="text-[10px] text-stone-400 text-center mt-2">
                    {uploadedFiles.length} source document{uploadedFiles.length !== 1 ? 's' : ''} will
                    be used as context for generation.
                  </p>
                </div>
              )}

              {generating && (
                <div className="flex justify-center">
                  <Loader2 className="w-5 h-5 text-stone-400 animate-spin" />
                </div>
              )}
            </div>
          )}

          {/* ── Step 4: Review ───────────────────────────────────────────── */}
          {step === 4 && (
            <div className="space-y-3" data-testid="autodraft-step-review">
              <div className="flex items-center justify-between">
                <p className="text-[11px] text-stone-500 font-medium uppercase tracking-wider">
                  Generated sections ({generatedSections.length})
                </p>
                {generatedSections.some(s => s.artifactId) && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleOpenAll}
                    className="text-[11px] text-stone-600 hover:text-stone-800"
                    aria-label="Open first generated section in editor"
                  >
                    <ExternalLink className="w-3 h-3 mr-1" />
                    Open All
                  </Button>
                )}
              </div>

              <div className="space-y-1">
                {generatedSections.map(section => (
                  <div
                    key={section.code}
                    className="flex items-center justify-between px-3 py-2.5 rounded-md hover:bg-stone-50 transition-colors duration-200 group"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <FileText className="w-3.5 h-3.5 text-stone-400 flex-shrink-0" />
                      <div className="min-w-0">
                        <p className="text-[12px] text-stone-700 font-medium truncate">
                          {section.code} {section.title}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[10px] text-stone-400 tabular-nums">
                            {section.wordCount.toLocaleString()} words
                          </span>
                          <span className="text-[10px] text-stone-400">
                            {section.sourceCount} source{section.sourceCount !== 1 ? 's' : ''}
                          </span>
                        </div>
                      </div>
                    </div>
                    {section.artifactId && onOpenArtifact && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleOpenSection(section)}
                        className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 text-[11px] text-stone-500 hover:text-stone-700"
                        aria-label={`Open ${section.title} in editor`}
                      >
                        Open in Editor
                      </Button>
                    )}
                  </div>
                ))}
              </div>

              {generatedSections.length === 0 && (
                <div className="text-center py-8">
                  <AlertCircle className="w-6 h-6 text-stone-300 mx-auto mb-2" />
                  <p className="text-[12px] text-stone-500">No sections were generated.</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer navigation */}
        <div className="flex items-center justify-between pt-3 border-t border-stone-100">
          <div>
            {step > 1 && step < 4 && !generating && (
              <Button
                variant="ghost"
                onClick={() => setStep((step - 1) as 1 | 2 | 3 | 4)}
                className="text-[13px] text-stone-500"
                aria-label="Go to previous step"
              >
                <ChevronLeft className="w-3.5 h-3.5 mr-1" />
                Back
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2">
            {step === 4 && (
              <Button variant="ghost" onClick={handleClose} className="text-[13px] text-stone-500">
                Close
              </Button>
            )}
            {step === 1 && (
              <Button
                onClick={() => setStep(2)}
                disabled={uploadedFiles.length === 0}
                className="bg-stone-800 text-white hover:bg-stone-700 text-[13px]"
                aria-label="Continue to configuration"
              >
                Continue
                <ChevronRight className="w-3.5 h-3.5 ml-1" />
              </Button>
            )}
            {step === 2 && (
              <Button
                onClick={() => setStep(3)}
                disabled={selectedModules.length === 0 || !drugName.trim()}
                className="bg-stone-800 text-white hover:bg-stone-700 text-[13px]"
                aria-label="Continue to generation"
              >
                Continue
                <ChevronRight className="w-3.5 h-3.5 ml-1" />
              </Button>
            )}
            {step === 3 && generateError && (
              <Button
                onClick={handleGenerate}
                className="bg-stone-800 text-white hover:bg-stone-700 text-[13px]"
                aria-label="Retry generation"
              >
                Retry
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default INDAutoDraftWizard;
