/**
 * CERV2ExportControls – Inline Export Panel
 *
 * Reusable export controls for CERV2 regulatory documents.
 * Supports PDF, DOCX, and eSTAR ZIP export via CERV2ExportService.
 * Renders as a compact horizontal bar below the editor.
 */

import { useState, useCallback, useMemo } from 'react';
import cerv2ExportService from '../services/CERV2ExportService.js';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { FileDown, FileType, FileArchive, Loader2, CheckCircle2 } from 'lucide-react';

const FORMAT_OPTIONS = [
  { value: 'pdf', label: 'PDF', icon: FileDown, description: 'Standard PDF document' },
  { value: 'docx', label: 'DOCX', icon: FileType, description: 'Word document' },
  { value: 'zip', label: 'eSTAR ZIP', icon: FileArchive, description: 'Submission package' },
];

/**
 * @param {Object} props
 * @param {string} props.docType – "cerv2_510k" | "cerv2_pma" | "cerv2_cer"
 * @param {Object} props.aiSuggestions – { [sectionId]: string }
 * @param {Array}  props.outline – [{ id, label }]
 * @param {{ total: number, populated: number, percent: number }} props.completeness
 * @param {Set}    [props.dismissedSuggestions] – dismissed section IDs
 * @param {boolean} [props.statusOnly] – compact status bar mode (P1)
 * @param {Function} [props.onOpenExportSim] – open full export simulation
 * @param {string} [props.className]
 */
export default function CERV2ExportControls({
  docType,
  aiSuggestions = {},
  outline = [],
  completeness = { total: 0, populated: 0, percent: 0 },
  dismissedSuggestions = new Set(),
  statusOnly = false,
  onOpenExportSim,
  className = '',
}) {
  const { toast } = useToast();
  const [selectedFormat, setSelectedFormat] = useState('pdf');
  const [exporting, setExporting] = useState(false);
  const [lastExport, setLastExport] = useState(null); // { format, filename, timestamp }

  const canExport = completeness.populated > 0;
  // Inline export controls use a 50% threshold (more conservative than the
  // Full Export Simulation's 30% gated+borderline flow, which has explicit
  // confirmation UI). This is intentional — inline bar has no confirmation step.
  const isIncomplete = completeness.percent < 50;

  // Filter out dismissed suggestions so they are NOT included in exports
  const activeSuggestions = useMemo(() => {
    const active = {};
    for (const [key, value] of Object.entries(aiSuggestions)) {
      if (!dismissedSuggestions.has(key)) {
        active[key] = value;
      }
    }
    return active;
  }, [aiSuggestions, dismissedSuggestions]);

  // ── Export handler ──────────────────────────────────────────────────────

  const handleExport = useCallback(async () => {
    if (!canExport) return;

    // Warn on incomplete documents
    if (isIncomplete) {
      const missing = outline.filter(s => !activeSuggestions[s.id]).map(s => s.label);

      toast({
        title: 'Incomplete Document',
        description: `Only ${completeness.populated}/${completeness.total} sections populated. Missing: ${missing.slice(0, 3).join(', ')}${missing.length > 3 ? ` (+${missing.length - 3} more)` : ''}`,
        variant: 'destructive',
        duration: 5000,
      });
      return;
    }

    setExporting(true);
    toast({
      title: 'Exporting…',
      description: `Generating ${selectedFormat.toUpperCase()} from ${completeness.populated} sections.`,
    });

    try {
      const result = await cerv2ExportService.exportFromAiSuggestions(
        selectedFormat,
        docType,
        activeSuggestions,
        outline,
        { title: `${docType}_AI_Export` }
      );

      if (result.success) {
        setLastExport({
          format: selectedFormat,
          filename: result.filename,
          timestamp: new Date().toLocaleTimeString(),
        });
        toast({ title: 'Export Complete', description: `Downloaded ${result.filename}` });
      } else {
        toast({
          title: 'Export Failed',
          description: result.error || 'Unknown error',
          variant: 'destructive',
        });
      }
    } catch (err) {
      console.error('[CERV2ExportControls] Export error:', err);
      toast({
        title: 'Export Error',
        description: err.message || 'Unexpected failure.',
        variant: 'destructive',
      });
    } finally {
      setExporting(false);
    }
  }, [
    canExport,
    isIncomplete,
    selectedFormat,
    docType,
    activeSuggestions,
    outline,
    completeness,
    toast,
  ]);

  // ── Mock export handler ─────────────────────────────────────────────────

  const handleMockExport = useCallback(async () => {
    setExporting(true);
    toast({
      title: 'Mock Export…',
      description: `Generating sample ${selectedFormat.toUpperCase()} from vault data.`,
    });

    try {
      let result;
      switch (selectedFormat) {
        case 'pdf':
          result = await cerv2ExportService.exportMockPdf(docType);
          break;
        case 'docx':
          result = await cerv2ExportService.exportMockDocx(docType);
          break;
        case 'zip':
          result = await cerv2ExportService.exportMockZip(docType);
          break;
        default:
          result = { success: false, error: `Unknown format: ${selectedFormat}` };
      }

      if (result.success) {
        setLastExport({
          format: selectedFormat,
          filename: result.filename,
          timestamp: new Date().toLocaleTimeString(),
        });
        toast({ title: 'Mock Export Complete', description: `Downloaded ${result.filename}` });
      } else {
        toast({
          title: 'Mock Export Failed',
          description: result.error || 'Unknown error',
          variant: 'destructive',
        });
      }
    } catch (err) {
      console.error('[CERV2ExportControls] Mock export error:', err);
      toast({
        title: 'Export Error',
        description: err.message || 'Unexpected failure.',
        variant: 'destructive',
      });
    } finally {
      setExporting(false);
    }
  }, [selectedFormat, docType, toast]);

  // ── Render ──────────────────────────────────────────────────────────────

  const FormatIcon = FORMAT_OPTIONS.find(f => f.value === selectedFormat)?.icon || FileDown;

  // P1: Compact status bar when export simulation is open
  if (statusOnly) {
    return (
      <div className={`flex items-center gap-3 px-4 py-2 border-t bg-muted/30 ${className}`}>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                completeness.percent === 100
                  ? 'bg-primary'
                  : completeness.percent >= 50
                    ? 'bg-primary/60'
                    : 'bg-muted-foreground/40'
              }`}
              style={{ width: `${completeness.percent}%` }}
            />
          </div>
          <span className="tabular-nums">
            {completeness.populated}/{completeness.total} sections
          </span>
        </div>
        {lastExport && (
          <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <CheckCircle2 className="h-3 w-3 text-primary" />
            <span className="truncate max-w-[120px]">{lastExport.filename}</span>
          </div>
        )}
        {onOpenExportSim && (
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs ml-auto"
            onClick={onOpenExportSim}
          >
            Open Export Panel
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-3 px-4 py-2.5 border-t bg-muted/30 ${className}`}>
      {/* Format picker */}
      <Select value={selectedFormat} onValueChange={setSelectedFormat}>
        <SelectTrigger className="w-[140px] h-8 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {FORMAT_OPTIONS.map(opt => (
            <SelectItem key={opt.value} value={opt.value}>
              <span className="flex items-center gap-1.5">
                <opt.icon className="h-3.5 w-3.5" />
                {opt.label}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Primary export */}
      <Button
        size="sm"
        className="h-8 gap-1.5"
        onClick={handleExport}
        disabled={exporting || !canExport}
      >
        {exporting ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <FormatIcon className="h-3.5 w-3.5" />
        )}
        Export {selectedFormat.toUpperCase()}
      </Button>

      {/* Mock export */}
      <Button
        variant="ghost"
        size="sm"
        className="h-8 text-xs text-muted-foreground"
        onClick={handleMockExport}
        disabled={exporting}
      >
        Sample
      </Button>

      {/* Completeness indicator */}
      <div className="flex items-center gap-1.5 ml-auto text-xs text-muted-foreground">
        <div className="w-12 h-1.5 bg-muted rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${
              completeness.percent === 100
                ? 'bg-primary'
                : completeness.percent >= 50
                  ? 'bg-primary/60'
                  : 'bg-muted-foreground/40'
            }`}
            style={{ width: `${completeness.percent}%` }}
          />
        </div>
        <span className="tabular-nums">
          {completeness.populated}/{completeness.total}
        </span>
      </div>

      {/* Last export indicator */}
      {lastExport && !exporting && (
        <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
          <CheckCircle2 className="h-3 w-3 text-primary" />
          <span className="truncate max-w-[120px]">{lastExport.filename}</span>
        </div>
      )}
    </div>
  );
}
