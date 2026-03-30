/**
 * SaveToDialog — Save documents to external storage destinations.
 *
 * Destinations:
 * - Project Vault (internal DMS linked to project)
 * - Local PC (browser download as DOCX/PDF)
 * - Veeva Vault
 * - Microsoft SharePoint
 * - Microsoft OneDrive
 * - Google Drive
 */

import React, { useState, useCallback } from 'react';
import {
  X,
  Download,
  Database,
  Cloud,
  HardDrive,
  FolderOpen,
  Loader2,
  CheckCircle,
  AlertCircle,
  ExternalLink,
  ChevronRight,
  Printer,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { apiRequest } from '@/lib/queryClient';
import { downloadBlob } from '../../hooks/useDocumentFactory';

// ── Types ──────────────────────────────────────────────────────────────────

type SaveFormat = 'docx' | 'pdf';

interface SaveDestination {
  id: string;
  label: string;
  description: string;
  icon: React.ElementType;
  iconColor: string;
  requiresSetup: boolean;
  category: 'local' | 'cloud';
}

interface SaveToDialogProps {
  isOpen: boolean;
  onClose: () => void;
  documentTitle: string;
  documentContent: string;
  projectId?: string;
  artifactId?: string;
  ctdSection?: string;
  onSaveComplete?: (destination: string) => void;
}

// ── Destinations ───────────────────────────────────────────────────────────

const DESTINATIONS: SaveDestination[] = [
  {
    id: 'local',
    label: 'Local Download',
    description: 'Download to your computer as DOCX or PDF',
    icon: Download,
    iconColor: 'text-stone-600 bg-stone-100',
    requiresSetup: false,
    category: 'local',
  },
  {
    id: 'print',
    label: 'Print',
    description: 'Print document or save as PDF via print dialog',
    icon: Printer,
    iconColor: 'text-stone-600 bg-stone-100',
    requiresSetup: false,
    category: 'local',
  },
  {
    id: 'vault_dms',
    label: 'Project Vault',
    description: 'Save to the project document vault (internal DMS)',
    icon: Database,
    iconColor: 'text-indigo-600 bg-indigo-50',
    requiresSetup: false,
    category: 'local',
  },
  {
    id: 'veeva_vault',
    label: 'Veeva Vault',
    description: 'Upload to your Veeva Vault document library',
    icon: FolderOpen,
    iconColor: 'text-orange-600 bg-orange-50',
    requiresSetup: true,
    category: 'cloud',
  },
  {
    id: 'sharepoint',
    label: 'Microsoft SharePoint',
    description: 'Save to SharePoint document library',
    icon: Cloud,
    iconColor: 'text-blue-600 bg-blue-50',
    requiresSetup: true,
    category: 'cloud',
  },
  {
    id: 'onedrive',
    label: 'Microsoft OneDrive',
    description: 'Save to OneDrive for Business or personal',
    icon: Cloud,
    iconColor: 'text-sky-600 bg-sky-50',
    requiresSetup: true,
    category: 'cloud',
  },
  {
    id: 'google_drive',
    label: 'Google Drive',
    description: 'Upload to Google Drive via service account',
    icon: HardDrive,
    iconColor: 'text-emerald-600 bg-emerald-50',
    requiresSetup: true,
    category: 'cloud',
  },
];

// ── Component ──────────────────────────────────────────────────────────────

export function SaveToDialog({
  isOpen,
  onClose,
  documentTitle,
  documentContent,
  projectId,
  artifactId,
  ctdSection,
  onSaveComplete,
}: SaveToDialogProps) {
  const [selectedDest, setSelectedDest] = useState<string | null>(null);
  const [format, setFormat] = useState<SaveFormat>('docx');
  const [folderPath, setFolderPath] = useState('');
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string; url?: string } | null>(null);

  const handleSave = useCallback(async () => {
    if (!selectedDest) return;
    setSaving(true);
    setResult(null);

    try {
      // Print — open browser print dialog with styled document
      if (selectedDest === 'print') {
        const printWindow = window.open('', '_blank');
        if (printWindow) {
          printWindow.document.write(`<!DOCTYPE html><html><head>
            <meta charset="utf-8">
            <title>${documentTitle}</title>
            <style>
              @page { size: A4; margin: 2.5cm; }
              body { font-family: 'Times New Roman', serif; font-size: 12pt; line-height: 1.6; color: #1a1a1a; max-width: 21cm; margin: 0 auto; padding: 2cm; }
              h1 { font-size: 18pt; margin-bottom: 12pt; }
              h2 { font-size: 15pt; margin-bottom: 10pt; }
              h3 { font-size: 13pt; margin-bottom: 8pt; }
              table { border-collapse: collapse; width: 100%; margin: 12pt 0; }
              th, td { border: 1px solid #ccc; padding: 6pt 8pt; text-align: left; font-size: 11pt; }
              th { background: #f5f5f5; font-weight: bold; }
              img { max-width: 100%; height: auto; }
              @media print { body { padding: 0; } }
            </style>
          </head><body>
            <h1>${documentTitle}</h1>
            ${documentContent}
          </body></html>`);
          printWindow.document.close();
          printWindow.focus();
          setTimeout(() => printWindow.print(), 300);
        }
        setResult({ success: true, message: 'Print dialog opened' });
        onSaveComplete?.('print');
        return;
      }

      // Local download — handle client-side
      if (selectedDest === 'local') {
        if (format === 'docx') {
          // Use the DOCX generation endpoint
          const res = await apiRequest('POST', '/api/knowledge-base/generate-docx', {
            title: documentTitle,
            content: documentContent,
            sections: [{
              title: documentTitle,
              content: documentContent,
              sectionCode: ctdSection || '',
            }],
          });
          const blob = await res.blob();
          const filename = `${documentTitle.replace(/[^a-zA-Z0-9_-]/g, '_')}.docx`;
          downloadBlob(blob, filename);
          setResult({ success: true, message: `Downloaded ${filename}` });
        } else {
          // PDF export
          const res = await apiRequest('POST', '/api/concept2cure/artifacts/export-pdf', {
            title: documentTitle,
            content: documentContent,
          });
          if (res.ok) {
            const blob = await res.blob();
            const filename = `${documentTitle.replace(/[^a-zA-Z0-9_-]/g, '_')}.pdf`;
            downloadBlob(blob, filename);
            setResult({ success: true, message: `Downloaded ${filename}` });
          } else {
            throw new Error('PDF export failed');
          }
        }
        onSaveComplete?.(selectedDest);
        return;
      }

      // External connector — call server endpoint
      const res = await apiRequest('POST', '/api/knowledge-base/save-to-connector', {
        connectorId: selectedDest,
        projectId,
        artifactId,
        title: documentTitle,
        content: documentContent,
        format,
        folderPath: folderPath || undefined,
        metadata: {
          ctdSection,
          savedAt: new Date().toISOString(),
          source: 'ClinicalSageAI Editor',
        },
      });

      if (res.ok) {
        const data = await res.json();
        setResult({
          success: true,
          message: data.message || `Saved to ${DESTINATIONS.find(d => d.id === selectedDest)?.label}`,
          url: data.url,
        });
        onSaveComplete?.(selectedDest);
      } else {
        const err = await res.json().catch(() => ({ error: 'Save failed' }));
        setResult({
          success: false,
          message: err.error || err.message || 'Save failed',
        });
      }
    } catch (err: any) {
      setResult({
        success: false,
        message: err.message || 'Save failed — check your connection',
      });
    } finally {
      setSaving(false);
    }
  }, [selectedDest, format, folderPath, documentTitle, documentContent, projectId, artifactId, ctdSection, onSaveComplete]);

  const handleClose = useCallback(() => {
    setSelectedDest(null);
    setResult(null);
    setSaving(false);
    setFolderPath('');
    onClose();
  }, [onClose]);

  if (!isOpen) return null;

  const dest = DESTINATIONS.find(d => d.id === selectedDest);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-[2px]"
      onClick={handleClose}
      role="dialog"
      aria-label="Save document to destination"
    >
      <div
        className="bg-white rounded-xl shadow-lg w-full max-w-lg mx-4 overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* ── Header ── */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-stone-100">
          <div>
            <h2 className="text-[14px] font-semibold text-stone-800">Save To</h2>
            <p className="text-[11px] text-stone-400 mt-0.5 truncate max-w-[340px]">
              {documentTitle}
            </p>
          </div>
          <button
            onClick={handleClose}
            className="p-1.5 rounded-md text-stone-400 hover:text-stone-600 hover:bg-stone-50 transition-colors duration-200"
            aria-label="Close save dialog"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* ── Result feedback ── */}
        {result && (
          <div
            className={cn(
              'mx-5 mt-3 px-3 py-2.5 rounded-lg flex items-start gap-2.5 text-[12px]',
              result.success
                ? 'bg-emerald-50 text-emerald-700'
                : 'bg-red-50 text-red-700'
            )}
          >
            {result.success ? (
              <CheckCircle className="w-4 h-4 shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            )}
            <div className="flex-1 min-w-0">
              <p>{result.message}</p>
              {result.url && (
                <a
                  href={result.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 mt-1 text-[11px] text-emerald-600 hover:underline"
                >
                  Open in destination <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
          </div>
        )}

        {/* ── Destination list ── */}
        <div className="px-5 py-3">
          {/* Local destinations */}
          <p className="text-[10px] font-medium text-stone-400 uppercase tracking-wider mb-2">
            Local
          </p>
          <div className="space-y-1 mb-3">
            {DESTINATIONS.filter(d => d.category === 'local').map(d => (
              <button
                key={d.id}
                onClick={() => { setSelectedDest(d.id); setResult(null); }}
                className={cn(
                  'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-all duration-200',
                  selectedDest === d.id
                    ? 'bg-stone-100 ring-1 ring-stone-300'
                    : 'hover:bg-stone-50'
                )}
                aria-label={`Save to ${d.label}`}
              >
                <div className={cn('p-1.5 rounded-md', d.iconColor)}>
                  <d.icon className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium text-stone-700">{d.label}</p>
                  <p className="text-[11px] text-stone-400 truncate">{d.description}</p>
                </div>
                <ChevronRight
                  className={cn(
                    'w-3.5 h-3.5 text-stone-300 transition-transform duration-200',
                    selectedDest === d.id && 'rotate-90 text-stone-500'
                  )}
                />
              </button>
            ))}
          </div>

          {/* Cloud destinations */}
          <p className="text-[10px] font-medium text-stone-400 uppercase tracking-wider mb-2">
            Cloud & Enterprise DMS
          </p>
          <div className="space-y-1">
            {DESTINATIONS.filter(d => d.category === 'cloud').map(d => (
              <button
                key={d.id}
                onClick={() => { setSelectedDest(d.id); setResult(null); }}
                className={cn(
                  'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-all duration-200',
                  selectedDest === d.id
                    ? 'bg-stone-100 ring-1 ring-stone-300'
                    : 'hover:bg-stone-50'
                )}
                aria-label={`Save to ${d.label}`}
              >
                <div className={cn('p-1.5 rounded-md', d.iconColor)}>
                  <d.icon className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium text-stone-700">{d.label}</p>
                  <p className="text-[11px] text-stone-400 truncate">{d.description}</p>
                </div>
                <ChevronRight
                  className={cn(
                    'w-3.5 h-3.5 text-stone-300 transition-transform duration-200',
                    selectedDest === d.id && 'rotate-90 text-stone-500'
                  )}
                />
              </button>
            ))}
          </div>
        </div>

        {/* ── Options panel (shown when destination selected) ── */}
        {selectedDest && (
          <div className="px-5 py-3 border-t border-stone-100 bg-stone-50/50">
            <div className="flex items-center gap-3 mb-3">
              {/* Format selector */}
              <div className="flex-1">
                <label className="text-[10px] font-medium text-stone-500 uppercase tracking-wider block mb-1">
                  Format
                </label>
                <Select value={format} onValueChange={v => setFormat(v as SaveFormat)}>
                  <SelectTrigger className="h-8 text-[12px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="docx">Microsoft Word (.docx)</SelectItem>
                    <SelectItem value="pdf">PDF Document (.pdf)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Folder path (for cloud destinations) */}
              {dest?.category === 'cloud' && (
                <div className="flex-1">
                  <label className="text-[10px] font-medium text-stone-500 uppercase tracking-wider block mb-1">
                    Folder Path
                  </label>
                  <Input
                    value={folderPath}
                    onChange={e => setFolderPath(e.target.value)}
                    placeholder={
                      selectedDest === 'sharepoint'
                        ? '/Shared Documents'
                        : selectedDest === 'veeva_vault'
                        ? '/Regulatory/IND'
                        : '/ClinicalSageAI'
                    }
                    className="h-8 text-[12px]"
                  />
                </div>
              )}
            </div>

            {/* Save button */}
            <Button
              onClick={handleSave}
              disabled={saving}
              className="w-full h-9 text-[13px] font-medium bg-stone-800 text-white hover:bg-stone-700 disabled:opacity-50 transition-colors duration-200"
            >
              {saving ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Saving…
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  {dest && <dest.icon className="w-3.5 h-3.5" />}
                  Save to {dest?.label || 'Destination'}
                </span>
              )}
            </Button>

            {/* Setup hint for cloud connectors */}
            {dest?.requiresSetup && (
              <p className="text-[10px] text-stone-400 mt-2 text-center">
                Requires connector setup in Settings → Connector Library
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
