/**
 * DossierUploadClassifier — Inline classification panel for project uploads.
 *
 * Extends the existing Data Room upload flow with dossier-aware metadata:
 * submission track, module, CTD section, source type, tags, and Module 3 feed toggle.
 *
 * Phase 1 — Module 3 Workflow Convergence
 * Uses: existing upload endpoint with new classification fields.
 * No new screens — this is an inline panel inside the existing Data Room.
 */

import React, { useState, useCallback } from 'react';
import {
  Upload,
  Tag,
  FileText,
  ChevronDown,
  ChevronUp,
  Loader2,
  CheckCircle,
  Beaker,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { getAuthHeaders } from '@/utils/authToken';

// ── Types ────────────────────────────────────────────────────────────────────

interface DossierClassification {
  submissionTrack: string;
  moduleCode: string;
  ctdSection: string;
  documentFamily: string;
  sourceType: string;
  tags: string[];
  feedsModule3: boolean;
  sourceProcessingMode: 'artifact_only' | 'artifact_plus_source_object';
}

interface DossierUploadClassifierProps {
  projectId: string;
  onUploadComplete?: () => void;
  className?: string;
}

// ── Constants ────────────────────────────────────────────────────────────────

const SUBMISSION_TRACKS = [
  { value: '', label: 'Not specified' },
  { value: 'IND', label: 'IND' },
  { value: 'NDA', label: 'NDA' },
  { value: 'BLA', label: 'BLA' },
  { value: '510K', label: '510(k)' },
  { value: 'PMA', label: 'PMA' },
  { value: 'SOP', label: 'SOP' },
  { value: 'CER', label: 'CER' },
  { value: 'general', label: 'General' },
];

const MODULE_CODES = [
  { value: '', label: 'Not specified' },
  { value: '1', label: 'Module 1 — Administrative' },
  { value: '2', label: 'Module 2 — Summaries' },
  { value: '3', label: 'Module 3 — Quality (CMC)' },
  { value: '4', label: 'Module 4 — Nonclinical' },
  { value: '5', label: 'Module 5 — Clinical' },
];

const MODULE3_SECTIONS = [
  { value: '', label: 'Not specified' },
  { value: '3.2.S.1', label: '3.2.S.1 — General Information' },
  { value: '3.2.S.2', label: '3.2.S.2 — Manufacture (DS)' },
  { value: '3.2.S.3', label: '3.2.S.3 — Characterisation' },
  { value: '3.2.S.4', label: '3.2.S.4 — Control of Drug Substance' },
  { value: '3.2.S.5', label: '3.2.S.5 — Reference Standards (DS)' },
  { value: '3.2.S.6', label: '3.2.S.6 — Container Closure (DS)' },
  { value: '3.2.S.7', label: '3.2.S.7 — Stability (DS)' },
  { value: '3.2.P.1', label: '3.2.P.1 — Description & Composition' },
  { value: '3.2.P.2', label: '3.2.P.2 — Pharmaceutical Development' },
  { value: '3.2.P.3', label: '3.2.P.3 — Manufacture (DP)' },
  { value: '3.2.P.4', label: '3.2.P.4 — Control of Excipients' },
  { value: '3.2.P.5', label: '3.2.P.5 — Control of Drug Product' },
  { value: '3.2.P.6', label: '3.2.P.6 — Reference Standards (DP)' },
  { value: '3.2.P.7', label: '3.2.P.7 — Container Closure (DP)' },
  { value: '3.2.P.8', label: '3.2.P.8 — Stability (DP)' },
];

const SOURCE_TYPES = [
  { value: '', label: 'Not specified' },
  { value: 'drug_substance', label: 'Drug Substance' },
  { value: 'drug_product', label: 'Drug Product' },
  { value: 'specification', label: 'Specification' },
  { value: 'method', label: 'Analytical Method' },
  { value: 'stability', label: 'Stability Data' },
  { value: 'batch', label: 'Batch Record' },
  { value: 'change_control', label: 'Change Control' },
  { value: 'comparability', label: 'Comparability' },
  { value: 'manufacturing_process', label: 'Manufacturing Process' },
  { value: 'characterization', label: 'Characterization' },
  { value: 'reference_standard', label: 'Reference Standard' },
  { value: 'container_closure', label: 'Container Closure' },
  { value: 'excipient', label: 'Excipient' },
];

const DOCUMENT_FAMILIES = [
  { value: '', label: 'Not specified' },
  { value: 'spec', label: 'Specification' },
  { value: 'method', label: 'Analytical Method' },
  { value: 'stability', label: 'Stability Report' },
  { value: 'batch', label: 'Batch Record' },
  { value: 'narrative', label: 'Manufacturing Narrative' },
  { value: 'sop', label: 'SOP / Process Description' },
  { value: 'ref_std', label: 'Reference Standard CoA' },
  { value: 'validation', label: 'Method Validation Report' },
  { value: 'characterization', label: 'Characterization Report' },
  { value: 'container_closure', label: 'Container Closure Data' },
  { value: 'excipient', label: 'Excipient Specification' },
  { value: 'development', label: 'Development Report' },
  { value: 'comparability', label: 'Comparability Study' },
  { value: 'other', label: 'Other' },
];

// ── Component ────────────────────────────────────────────────────────────────

const DossierUploadClassifier: React.FC<DossierUploadClassifierProps> = ({
  projectId,
  onUploadComplete,
  className,
}) => {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [tagInput, setTagInput] = useState('');

  const [classification, setClassification] = useState<DossierClassification>({
    submissionTrack: '',
    moduleCode: '3',
    ctdSection: '',
    documentFamily: '',
    sourceType: '',
    tags: [],
    feedsModule3: true,
    sourceProcessingMode: 'artifact_plus_source_object',
  });

  const updateField = useCallback(
    <K extends keyof DossierClassification>(key: K, value: DossierClassification[K]) => {
      setClassification((prev) => ({ ...prev, [key]: value }));
    },
    []
  );

  const addTag = useCallback(() => {
    const tag = tagInput.trim();
    if (tag && !classification.tags.includes(tag)) {
      updateField('tags', [...classification.tags, tag]);
    }
    setTagInput('');
  }, [tagInput, classification.tags, updateField]);

  const removeTag = useCallback(
    (tag: string) => {
      updateField(
        'tags',
        classification.tags.filter((t) => t !== tag)
      );
    },
    [classification.tags, updateField]
  );

  const handleUpload = useCallback(async () => {
    if (!file || !projectId) return;
    setUploading(true);
    setSuccess(false);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('projectId', projectId);
      // Append dossier classification fields
      if (classification.submissionTrack) formData.append('submissionTrack', classification.submissionTrack);
      if (classification.moduleCode) formData.append('moduleCode', classification.moduleCode);
      if (classification.ctdSection) formData.append('ctdSection', classification.ctdSection);
      if (classification.documentFamily) formData.append('documentFamily', classification.documentFamily);
      if (classification.sourceType) formData.append('sourceType', classification.sourceType);
      if (classification.tags.length > 0) {
        for (const tag of classification.tags) formData.append('tags', tag);
      }
      formData.append('feedsModule3', String(classification.feedsModule3));
      formData.append('sourceProcessingMode', classification.sourceProcessingMode);

      const headers: Record<string, string> = getAuthHeaders();
      delete headers['Content-Type'];

      const res = await fetch('/api/concept2cure/documents/upload', {
        method: 'POST',
        body: formData,
        headers,
        credentials: 'include',
      });

      if (res.ok) {
        setSuccess(true);
        setFile(null);
        setTimeout(() => setSuccess(false), 3000);
        onUploadComplete?.();
      }
    } catch {
      // Upload failed
    } finally {
      setUploading(false);
    }
  }, [file, projectId, classification, onUploadComplete]);

  return (
    <div className={cn('border border-stone-200 rounded-lg bg-white', className)}>
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 p-2.5 text-left hover:bg-stone-50 transition-colors rounded-t-lg"
      >
        <Beaker className="w-4 h-4 text-stone-700" />
        <span className="text-xs font-semibold text-stone-800">Dossier-Aware Upload</span>
        <span className="ml-auto">
          {expanded ? (
            <ChevronUp className="w-3.5 h-3.5 text-stone-400" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5 text-stone-400" />
          )}
        </span>
      </button>

      {expanded && (
        <div className="px-3 pb-3 space-y-2.5 border-t border-stone-100">
          {/* File picker */}
          <div className="pt-2">
            <label className="flex items-center justify-center gap-1.5 px-3 py-2 text-xs border border-dashed border-stone-300 rounded-lg cursor-pointer hover:bg-stone-50 transition-colors">
              <Upload className="w-3.5 h-3.5 text-stone-500" />
              {file ? (
                <span className="text-stone-700 truncate max-w-[200px]">{file.name}</span>
              ) : (
                <span className="text-stone-500">Choose file...</span>
              )}
              <input
                type="file"
                className="hidden"
                accept=".pdf,.docx,.xlsx,.csv,.txt,.md"
                onChange={(e) => {
                  setFile(e.target.files?.[0] || null);
                  setSuccess(false);
                  e.target.value = '';
                }}
              />
            </label>
          </div>

          {/* Classification fields */}
          <div className="grid grid-cols-2 gap-2">
            <SelectField
              label="Track"
              value={classification.submissionTrack}
              options={SUBMISSION_TRACKS}
              onChange={(v) => updateField('submissionTrack', v)}
            />
            <SelectField
              label="Module"
              value={classification.moduleCode}
              options={MODULE_CODES}
              onChange={(v) => updateField('moduleCode', v)}
            />
          </div>

          {classification.moduleCode === '3' && (
            <SelectField
              label="CTD Section"
              value={classification.ctdSection}
              options={MODULE3_SECTIONS}
              onChange={(v) => updateField('ctdSection', v)}
            />
          )}

          <div className="grid grid-cols-2 gap-2">
            <SelectField
              label="Source Type"
              value={classification.sourceType}
              options={SOURCE_TYPES}
              onChange={(v) => updateField('sourceType', v)}
            />
            <SelectField
              label="Document Family"
              value={classification.documentFamily}
              options={DOCUMENT_FAMILIES}
              onChange={(v) => updateField('documentFamily', v)}
            />
          </div>

          {/* Tags */}
          <div>
            <label className="text-[10px] font-medium text-stone-500 uppercase tracking-wide">Tags</label>
            <div className="flex items-center gap-1 mt-0.5">
              <input
                type="text"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addTag())}
                placeholder="Add tag..."
                className="flex-1 text-xs px-2 py-1 border border-stone-200 rounded focus:ring-1 focus:ring-stone-400 outline-none"
              />
              <button
                onClick={addTag}
                className="text-xs px-2 py-1 text-stone-600 hover:bg-stone-100 rounded"
              >
                <Tag className="w-3 h-3" />
              </button>
            </div>
            {classification.tags.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1">
                {classification.tags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 bg-stone-100 rounded text-stone-600"
                  >
                    {tag}
                    <button onClick={() => removeTag(tag)} className="hover:text-stone-900">
                      &times;
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Module 3 feed toggle */}
          {classification.moduleCode === '3' && (
            <div className="flex items-center gap-2 p-2 bg-stone-50 rounded-lg">
              <button
                onClick={() => updateField('feedsModule3', !classification.feedsModule3)}
                className={cn(
                  'relative w-8 h-4 rounded-full transition-colors',
                  classification.feedsModule3 ? 'bg-stone-800' : 'bg-stone-300'
                )}
              >
                <span
                  className={cn(
                    'absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform',
                    classification.feedsModule3 ? 'left-[18px]' : 'left-0.5'
                  )}
                />
              </button>
              <span className="text-xs text-stone-700">Feed Module 3 source extraction</span>
            </div>
          )}

          {/* Upload button */}
          <button
            onClick={handleUpload}
            disabled={!file || uploading}
            className={cn(
              'w-full flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg transition-colors',
              file && !uploading
                ? 'bg-stone-900 text-white hover:bg-stone-800'
                : 'bg-stone-100 text-stone-400 cursor-not-allowed'
            )}
          >
            {uploading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : success ? (
              <CheckCircle className="w-3.5 h-3.5" />
            ) : (
              <FileText className="w-3.5 h-3.5" />
            )}
            {uploading ? 'Uploading...' : success ? 'Uploaded' : 'Upload with Classification'}
          </button>
        </div>
      )}
    </div>
  );
};

// ── Select field helper ──────────────────────────────────────────────────────

function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label className="text-[10px] font-medium text-stone-500 uppercase tracking-wide">
        {label}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full mt-0.5 text-xs px-2 py-1 border border-stone-200 rounded bg-white text-stone-700 focus:ring-1 focus:ring-stone-400 outline-none"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export default DossierUploadClassifier;
