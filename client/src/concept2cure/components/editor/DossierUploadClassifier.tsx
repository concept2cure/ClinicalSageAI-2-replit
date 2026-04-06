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

import React, { useState, useCallback, useRef } from 'react';
import {
  Upload,
  Tag,
  FileText,
  ChevronDown,
  ChevronUp,
  Loader2,
  CheckCircle,
  Beaker,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';

// ── Types ───────────────────────────────────────────────────────────────────��

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
  { value: 'none', label: 'Not specified' },
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
  { value: 'none', label: 'Not specified' },
  { value: '1', label: 'Module 1 — Administrative' },
  { value: '2', label: 'Module 2 — Summaries' },
  { value: '3', label: 'Module 3 — Quality (CMC)' },
  { value: '4', label: 'Module 4 — Nonclinical' },
  { value: '5', label: 'Module 5 — Clinical' },
];

const MODULE3_SECTIONS = [
  { value: 'none', label: 'Not specified' },
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
  { value: 'none', label: 'Not specified' },
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
  { value: 'none', label: 'Not specified' },
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
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [tagInput, setTagInput] = useState('');

  const [classification, setClassification] = useState<DossierClassification>({
    submissionTrack: 'none',
    moduleCode: '3',
    ctdSection: 'none',
    documentFamily: 'none',
    sourceType: 'none',
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

  const clearFile = useCallback(() => {
    setFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

  const handleUpload = useCallback(async () => {
    if (!file || !projectId) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('projectId', projectId);
      const track = classification.submissionTrack !== 'none' ? classification.submissionTrack : '';
      const mod = classification.moduleCode !== 'none' ? classification.moduleCode : '';
      const section = classification.ctdSection !== 'none' ? classification.ctdSection : '';
      const family = classification.documentFamily !== 'none' ? classification.documentFamily : '';
      const srcType = classification.sourceType !== 'none' ? classification.sourceType : '';
      if (track) formData.append('submissionTrack', track);
      if (mod) formData.append('moduleCode', mod);
      if (section) formData.append('ctdSection', section);
      if (family) formData.append('documentFamily', family);
      if (srcType) formData.append('sourceType', srcType);
      if (classification.tags.length > 0) {
        for (const tag of classification.tags) formData.append('tags', tag);
      }
      formData.append('feedsModule3', String(classification.feedsModule3));
      formData.append('sourceProcessingMode', classification.sourceProcessingMode);

      const res = await apiRequest('POST', '/api/concept2cure/documents/upload', formData);
      const json = await res.json();

      if (json.success || res.ok) {
        toast({
          title: 'Source uploaded',
          description: `${file.name} classified${section ? ` to ${section}` : ''}${classification.feedsModule3 ? ' — feeding Module 3' : ''}`,
        });
        clearFile();
        onUploadComplete?.();
      } else {
        toast({
          title: 'Upload failed',
          description: json.error || 'The upload could not be completed.',
          variant: 'destructive',
        });
      }
    } catch (err: any) {
      toast({
        title: 'Upload error',
        description: err?.message || 'Network error during upload.',
        variant: 'destructive',
      });
    } finally {
      setUploading(false);
    }
  }, [file, projectId, classification, onUploadComplete, toast, clearFile]);

  const isModule3 = classification.moduleCode === '3';
  const classificationSummary = [
    classification.submissionTrack !== 'none' ? classification.submissionTrack : null,
    classification.ctdSection !== 'none' ? classification.ctdSection : null,
    classification.sourceType !== 'none' ? SOURCE_TYPES.find(s => s.value === classification.sourceType)?.label : null,
  ].filter(Boolean);

  return (
    <div className={cn('border border-stone-200 rounded-lg bg-white overflow-hidden', className)}>
      {/* Header — always visible */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-stone-50/50 transition-colors"
      >
        <Beaker className="w-3.5 h-3.5 text-stone-500 shrink-0" />
        <div className="flex-1 min-w-0">
          <span className="text-[11px] font-medium text-stone-700">Dossier-Aware Upload</span>
          {!expanded && classificationSummary.length > 0 && (
            <div className="flex items-center gap-1 mt-0.5">
              {classificationSummary.map((s) => (
                <Badge key={s} variant="secondary" className="text-[9px] px-1 py-0 h-4 font-normal">
                  {s}
                </Badge>
              ))}
            </div>
          )}
        </div>
        {expanded ? (
          <ChevronUp className="w-3.5 h-3.5 text-stone-400 shrink-0" />
        ) : (
          <ChevronDown className="w-3.5 h-3.5 text-stone-400 shrink-0" />
        )}
      </button>

      {expanded && (
        <div className="px-3 pb-3 space-y-3 border-t border-stone-100">
          {/* File picker */}
          <div className="pt-2.5">
            {file ? (
              <div className="flex items-center gap-2 px-2.5 py-2 bg-stone-50 rounded-lg border border-stone-100">
                <FileText className="w-3.5 h-3.5 text-stone-500 shrink-0" />
                <span className="text-[11px] text-stone-700 truncate flex-1">{file.name}</span>
                <span className="text-[10px] text-stone-400 shrink-0">
                  {(file.size / 1024).toFixed(0)} KB
                </span>
                <button
                  type="button"
                  onClick={clearFile}
                  className="text-stone-400 hover:text-stone-600 transition-colors"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ) : (
              <label className="flex items-center justify-center gap-2 px-3 py-3 border border-dashed border-stone-300 rounded-lg cursor-pointer hover:bg-stone-50 hover:border-stone-400 transition-all">
                <Upload className="w-4 h-4 text-stone-400" />
                <span className="text-[11px] text-stone-500">Choose source document</span>
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  accept=".pdf,.docx,.xlsx,.csv,.txt,.md"
                  onChange={(e) => {
                    setFile(e.target.files?.[0] || null);
                    e.target.value = '';
                  }}
                />
              </label>
            )}
          </div>

          {/* Classification grid */}
          <div className="space-y-2.5">
            <div className="grid grid-cols-2 gap-2">
              <ClassificationSelect
                label="Track"
                value={classification.submissionTrack}
                options={SUBMISSION_TRACKS}
                onChange={(v) => updateField('submissionTrack', v)}
              />
              <ClassificationSelect
                label="Module"
                value={classification.moduleCode}
                options={MODULE_CODES}
                onChange={(v) => updateField('moduleCode', v)}
              />
            </div>

            {isModule3 && (
              <ClassificationSelect
                label="CTD Section"
                value={classification.ctdSection}
                options={MODULE3_SECTIONS}
                onChange={(v) => updateField('ctdSection', v)}
              />
            )}

            <div className="grid grid-cols-2 gap-2">
              <ClassificationSelect
                label="Source Type"
                value={classification.sourceType}
                options={SOURCE_TYPES}
                onChange={(v) => updateField('sourceType', v)}
              />
              <ClassificationSelect
                label="Document Family"
                value={classification.documentFamily}
                options={DOCUMENT_FAMILIES}
                onChange={(v) => updateField('documentFamily', v)}
              />
            </div>
          </div>

          {/* Tags */}
          <div>
            <label className="text-[10px] font-medium text-stone-500 uppercase tracking-wide">Tags</label>
            <div className="flex items-center gap-1.5 mt-1">
              <Input
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addTag();
                  }
                }}
                placeholder="Add tag..."
                className="h-7 text-xs"
              />
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0 shrink-0" onClick={addTag}>
                <Tag className="w-3 h-3" />
              </Button>
            </div>
            {classification.tags.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1.5">
                {classification.tags.map((tag) => (
                  <Badge
                    key={tag}
                    variant="secondary"
                    className="text-[10px] px-1.5 py-0 h-5 gap-1 font-normal"
                  >
                    {tag}
                    <button
                      type="button"
                      onClick={() => removeTag(tag)}
                      className="hover:text-stone-900 transition-colors"
                    >
                      <X className="w-2.5 h-2.5" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>

          {/* Module 3 feed toggle */}
          {isModule3 && (
            <div className="flex items-center justify-between gap-2 px-2.5 py-2 bg-stone-50 rounded-lg">
              <span className="text-[11px] text-stone-600">Feed Module 3 source extraction</span>
              <Switch
                checked={classification.feedsModule3}
                onCheckedChange={(checked) => updateField('feedsModule3', checked)}
              />
            </div>
          )}

          {/* Upload button */}
          <Button
            onClick={handleUpload}
            disabled={!file || uploading}
            className="w-full h-8 text-xs"
            size="sm"
          >
            {uploading ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
                Uploading...
              </>
            ) : (
              <>
                <Upload className="w-3.5 h-3.5 mr-1.5" />
                Upload with Classification
              </>
            )}
          </Button>
        </div>
      )}
    </div>
  );
};

// ── Classification select helper ─────────────────────────────────────────────

function ClassificationSelect({
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
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-7 text-xs mt-0.5">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value} className="text-xs">
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export default DossierUploadClassifier;
