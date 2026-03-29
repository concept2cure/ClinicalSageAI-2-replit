/**
 * ExportDialog — Rich export dialog with format selection, options, and progress.
 *
 * Replaces the simple dropdown export with a proper dialog showing
 * format options, customization, and download progress.
 */

import React, { useState, useCallback } from 'react';
import {
  X,
  Download,
  FileText,
  FileType,
  Presentation,
  Code,
  Loader2,
  CheckCircle,
  AlertCircle,
  ChevronRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

// ── Types ──────────────────────────────────────────────────────────────────

type ExportFormat = 'docx' | 'pdf' | 'pptx' | 'markdown';

interface ExportOption {
  id: ExportFormat;
  label: string;
  description: string;
  icon: React.ElementType;
  iconColor: string;
  available: boolean;
}

interface ExportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  documentTitle: string;
  documentContent: string;
  ctdSection?: string;
  onExport: (format: ExportFormat, options: ExportOptions) => Promise<void>;
}

export interface ExportOptions {
  format: ExportFormat;
  includeMetadata: boolean;
  includeComments: boolean;
  includeVersionHistory: boolean;
  pageSize: 'letter' | 'a4';
  headerFooter: boolean;
}

// ── Format definitions ─────────────────────────────────────────────────────

const FORMATS: ExportOption[] = [
  {
    id: 'docx',
    label: 'Microsoft Word (.docx)',
    description: 'Editable document with formatting preserved',
    icon: FileText,
    iconColor: 'text-blue-600 bg-blue-50',
    available: true,
  },
  {
    id: 'pdf',
    label: 'PDF Document (.pdf)',
    description: 'Fixed-layout document for review and submission',
    icon: FileType,
    iconColor: 'text-red-600 bg-red-50',
    available: true,
  },
  {
    id: 'pptx',
    label: 'PowerPoint (.pptx)',
    description: 'Presentation slides for regulatory meetings',
    icon: Presentation,
    iconColor: 'text-orange-600 bg-orange-50',
    available: true,
  },
  {
    id: 'markdown',
    label: 'Markdown (.md)',
    description: 'Plain text with formatting for technical docs',
    icon: Code,
    iconColor: 'text-stone-600 bg-stone-100',
    available: true,
  },
];

// ── Component ──────────────────────────────────────────────────────────────

export function ExportDialog({
  isOpen,
  onClose,
  documentTitle,
  documentContent,
  ctdSection,
  onExport,
}: ExportDialogProps) {
  const [selectedFormat, setSelectedFormat] = useState<ExportFormat>('docx');
  const [options, setOptions] = useState<ExportOptions>({
    format: 'docx',
    includeMetadata: true,
    includeComments: false,
    includeVersionHistory: false,
    pageSize: 'letter',
    headerFooter: true,
  });
  const [exporting, setExporting] = useState(false);
  const [exportResult, setExportResult] = useState<'success' | 'error' | null>(null);

  const wordCount = documentContent.replace(/<[^>]*>/g, '').split(/\s+/).filter(Boolean).length;

  const handleExport = useCallback(async () => {
    setExporting(true);
    setExportResult(null);
    try {
      await onExport(selectedFormat, { ...options, format: selectedFormat });
      setExportResult('success');
      setTimeout(() => {
        onClose();
        setExportResult(null);
      }, 1500);
    } catch {
      setExportResult('error');
    } finally {
      setExporting(false);
    }
  }, [selectedFormat, options, onExport, onClose]);

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50" onClick={onClose} />
      <div className="fixed top-[15%] left-1/2 -translate-x-1/2 w-full max-w-lg bg-white rounded-xl shadow-sm overflow-hidden z-50 animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-stone-200">
          <div>
            <h2 className="text-sm font-semibold text-stone-900">Export Document</h2>
            <p className="text-xs text-stone-500 mt-0.5 truncate max-w-[300px]">{documentTitle}</p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close export dialog" title="Close" className="h-7 w-7 text-stone-400 hover:text-stone-600">
            <X className="w-4 h-4" />
          </Button>
        </div>

        {/* Document info */}
        <div className="px-5 py-3 bg-stone-50 border-b border-stone-100 flex items-center gap-4">
          <span className="text-xs text-stone-500">{wordCount.toLocaleString()} words</span>
          {ctdSection && (
            <span className="text-xs text-violet-600 font-medium">CTD {ctdSection}</span>
          )}
        </div>

        {/* Format selection */}
        <div className="px-5 py-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-stone-400 mb-3">Select Format</h3>
          <div className="grid grid-cols-2 gap-2">
            {FORMATS.map(fmt => {
              const Icon = fmt.icon;
              const isSelected = selectedFormat === fmt.id;
              return (
                <Button
                  key={fmt.id}
                  variant="outline"
                  onClick={() => setSelectedFormat(fmt.id)}
                  disabled={!fmt.available}
                  className={cn(
                    'flex items-start gap-3 p-3 h-auto rounded-xl text-left transition-all duration-150',
                    isSelected
                      ? 'border-stone-600 bg-blue-50/50 shadow-sm'
                      : 'border-stone-200 hover:border-stone-300 hover:bg-stone-50',
                    !fmt.available && 'opacity-40 cursor-not-allowed',
                  )}
                >
                  <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center shrink-0', fmt.iconColor)}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-stone-900">{fmt.label}</p>
                    <p className="text-[10px] text-stone-500 mt-0.5 leading-snug">{fmt.description}</p>
                  </div>
                </Button>
              );
            })}
          </div>
        </div>

        {/* Options */}
        <div className="px-5 py-3 border-t border-stone-100">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-stone-400 mb-2">Options</h3>
          <div className="space-y-2">
            <div className="flex items-center gap-2.5 cursor-pointer">
              <Checkbox
                id="export-metadata"
                checked={options.includeMetadata}
                onCheckedChange={(checked) => setOptions(prev => ({ ...prev, includeMetadata: !!checked }))}
              />
              <label htmlFor="export-metadata" className="text-xs text-stone-700 cursor-pointer">Include document metadata (author, date, version)</label>
            </div>
            <div className="flex items-center gap-2.5 cursor-pointer">
              <Checkbox
                id="export-header-footer"
                checked={options.headerFooter}
                onCheckedChange={(checked) => setOptions(prev => ({ ...prev, headerFooter: !!checked }))}
              />
              <label htmlFor="export-header-footer" className="text-xs text-stone-700 cursor-pointer">Add header & footer (document title, page numbers)</label>
            </div>
            {(selectedFormat === 'docx' || selectedFormat === 'pdf') && (
              <div className="flex items-center gap-3 mt-1">
                <span className="text-xs text-stone-500">Page size:</span>
                <Select value={options.pageSize} onValueChange={(val) => setOptions(prev => ({ ...prev, pageSize: val as 'letter' | 'a4' }))}>
                  <SelectTrigger className="h-7 text-xs w-auto min-w-[110px] border-stone-200 bg-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="letter">US Letter</SelectItem>
                    <SelectItem value="a4">A4</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        </div>

        {/* Footer with export button */}
        <div className="flex items-center justify-between px-5 py-4 border-t border-stone-200 bg-stone-50">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-xs font-medium text-stone-600 hover:text-stone-900 transition-colors duration-150"
          >
            Cancel
          </button>
          <button
            onClick={handleExport}
            disabled={exporting}
            className={cn(
              'flex items-center gap-2 px-4 py-2 text-xs font-medium rounded-lg transition-all duration-150',
              exportResult === 'success'
                ? 'bg-emerald-600 text-white'
                : exportResult === 'error'
                ? 'bg-red-600 text-white'
                : 'bg-stone-800 text-white hover:bg-stone-900 shadow-sm',
              exporting && 'opacity-70',
            )}
          >
            {exporting ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Exporting...
              </>
            ) : exportResult === 'success' ? (
              <>
                <CheckCircle className="w-3.5 h-3.5" />
                Downloaded!
              </>
            ) : exportResult === 'error' ? (
              <>
                <AlertCircle className="w-3.5 h-3.5" />
                Export Failed
              </>
            ) : (
              <>
                <Download className="w-3.5 h-3.5" />
                Export as {FORMATS.find(f => f.id === selectedFormat)?.label.split(' ')[0]}
              </>
            )}
          </button>
        </div>
      </div>
    </>
  );
}

export default ExportDialog;
