/**
 * CERV2FullExportSimulation – Phase 7.7 + 7.9 End-to-End Export Simulation
 *
 * Combines the live Export Preview with a multi-format export workflow:
 *
 * 1. Pre-export readiness gate — blocks export below configurable threshold
 * 2. Borderline warning (score 30–50%): inline confirmation with impacting sections
 * 3. Three-step simulation pipeline (per CERV2ExportService):
 * AI suggestions → TipTap editor JSON → format render (PDF / DOCX / ZIP)
 * 4. Mock-export fallback for demo/QA use
 * 5. Per-step progress indicators (converting → rendering → downloading)
 * 6. Post-export receipt with filename + timestamp
 *
 * Uses CERV2ExportService singleton (never raw axios) to ensure consistent
 * caching, error handling, and blob download behavior across the app.
 *
 * Renders as a vertically stacked panel:
 * ┌────────────────────────────────────┐
 * │ Header: doc type + readiness score │
 * ├────────────────────────────────────┤
 * │ Export buttons + format picker │
 * ├────────────────────────────────────┤
 * │ Pre-export summary (if borderline) │
 * ├────────────────────────────────────┤
 * │ Step-by-step progress log │
 * ├────────────────────────────────────┤
 * │ Export history (last 5 exports) │
 * └────────────────────────────────────┘
 */

import { useState, useCallback, useMemo } from 'react';
import cerv2ExportService from '../services/CERV2ExportService.js';
import { classifyHint, DOC_TYPE_LABELS } from '../utils/cerv2-validation-utils.js';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
 Select,
 SelectContent,
 SelectItem,
 SelectTrigger,
 SelectValue,
} from '@/components/ui/select';
import {
 FileDown,
 FileType,
 FileArchive,
 Loader2,
 CheckCircle2,
 XCircle,
 Clock,
 Zap,
 ShieldAlert,
 ArrowRight,
 AlertTriangle,
} from 'lucide-react';

// ── Constants ───────────────────────────────────────────────────────────────

const FORMAT_OPTIONS = [
 { value: 'pdf', label: 'PDF', icon: FileDown },
 { value: 'docx', label: 'DOCX', icon: FileType },
 { value: 'zip', label: 'eSTAR ZIP', icon: FileArchive },
];

/** Minimum readiness % to allow export (errors/warnings penalize this) */
const READINESS_THRESHOLD = 30;

/** Borderline zone — export allowed but requires confirmation */
const WARNING_THRESHOLD = 50;

// ── Component ───────────────────────────────────────────────────────────────

/**
 * @param {Object} props
 * @param {Array} props.outline – [{ id, label }]
 * @param {Object} props.aiSuggestions – { [outlineId]: string }
 * @param {Object} props.validationHints – { [outlineId]: string }
 * @param {Set} props.dismissedSuggestions
 * @param {string} props.selectedDocType
 * @param {{ total: number, populated: number, percent: number }} props.completeness
 * @param {string} [props.className]
 */
export default function CERV2FullExportSimulation({
 outline = [],
 aiSuggestions = {},
 validationHints = {},
 dismissedSuggestions = new Set(),
 selectedDocType = 'cerv2_510k',
 completeness = { total: 0, populated: 0, percent: 0 },
 className = '',
}) {
 const { toast } = useToast();

 const [selectedFormat, setSelectedFormat] = useState('pdf');
 const [exporting, setExporting] = useState(false);
 const [exportStep, setExportStep] = useState(null); // 'converting' | 'rendering' | 'downloading' | null
 const [exportHistory, setExportHistory] = useState([]); // [{ format, filename, timestamp, success }]
 const [showConfirmation, setShowConfirmation] = useState(false); // Phase 7.9 borderline confirm

 // ── Readiness calculation ───────────────────────────────────────────────
 const readiness = useMemo(() => {
 let score = completeness.percent;
 let errorCount = 0;
 let warningCount = 0;

 for (const section of outline) {
 const hint = validationHints[section.id];
 if (!hint) continue;
 const severity = classifyHint(hint);
 if (severity === 'error') errorCount++;
 if (severity === 'warning') warningCount++;
 }

 // Penalize errors heavily, warnings slightly
 if (errorCount > 0) score = Math.max(0, score - errorCount * 15);
 if (warningCount > 0) score = Math.max(0, score - warningCount * 5);
 score = Math.min(100, Math.round(score));

 const canExport = score >= READINESS_THRESHOLD && completeness.populated > 0;
 const isBorderline = canExport && score < WARNING_THRESHOLD;

 return { score, errorCount, warningCount, canExport, isBorderline };
 }, [completeness, outline, validationHints]);

 // ── Active suggestions (excluding dismissed) ────────────────────────────
 const activeSuggestions = useMemo(() => {
 const active = {};
 for (const [key, value] of Object.entries(aiSuggestions)) {
 if (!dismissedSuggestions.has(key)) {
 active[key] = value;
 }
 }
 return active;
 }, [aiSuggestions, dismissedSuggestions]);

 // ── Impacting sections (for pre-export summary) ────────────────────────
 const impactingSections = useMemo(() => {
 return outline
 .map(section => {
 const hint = validationHints[section.id];
 if (!hint) return null;
 const severity = classifyHint(hint);
 if (severity === 'error' || severity === 'warning') {
 return { id: section.id, label: section.label, severity, hint };
 }
 return null;
 })
 .filter(Boolean);
 }, [outline, validationHints]);

 // ── Full pipeline export ────────────────────────────────────────────────
 const executeExport = useCallback(async () => {
 setShowConfirmation(false);
 setExporting(true);
 const startTime = Date.now();

 try {
 // Step 1: Converting AI suggestions → editor JSON
 setExportStep('converting');
 toast({
 title: 'Export Started',
 description: `Converting ${completeness.populated} sections to ${selectedFormat.toUpperCase()}…`,
 });

 // The CERV2ExportService.exportFromAiSuggestions method handles the full
 // 3-step pipeline: section map → TipTap JSON → format render.
 // We simulate step transitions for UX feedback.
 await new Promise(r => setTimeout(r, 300)); // brief visual feedback for step 1

 setExportStep('rendering');
 await new Promise(r => setTimeout(r, 200)); // brief visual feedback for step 2

 setExportStep('downloading');
 const result = await cerv2ExportService.exportFromAiSuggestions(
 selectedFormat,
 selectedDocType,
 activeSuggestions,
 outline,
 { title: `${DOC_TYPE_LABELS[selectedDocType] || selectedDocType}_Export` }
 );

 const duration = ((Date.now() - startTime) / 1000).toFixed(1);
 const entry = {
 format: selectedFormat,
 filename: result.filename || `${selectedDocType}_export.${selectedFormat}`,
 timestamp: new Date().toLocaleTimeString(),
 duration: `${duration}s`,
 success: !!result.success,
 error: result.error || null,
 };

 // Prepend to history (keep last 5)
 setExportHistory(prev => [entry, ...prev].slice(0, 5));

 if (result.success) {
 toast({
 title: 'Export Complete',
 description: `Downloaded ${result.filename} in ${duration}s`,
 });
 } else {
 toast({
 title: 'Export Failed',
 description: result.error || 'Unknown error during export.',
 variant: 'destructive',
 });
 }
 } catch (err) {
 console.error('[CERV2FullExportSimulation] Export error:', err);
 const entry = {
 format: selectedFormat,
 filename: null,
 timestamp: new Date().toLocaleTimeString(),
 duration: `${((Date.now() - startTime) / 1000).toFixed(1)}s`,
 success: false,
 error: err.message || 'Unexpected failure.',
 };
 setExportHistory(prev => [entry, ...prev].slice(0, 5));
 toast({
 title: 'Export Error',
 description: err.message || 'Unexpected failure.',
 variant: 'destructive',
 });
 } finally {
 setExporting(false);
 setExportStep(null);
 }
 }, [selectedFormat, selectedDocType, activeSuggestions, outline, completeness, toast]);

 // ── Export with gating (Phase 7.9) ──────────────────────────────────────
 const handleFullExport = useCallback(() => {
 if (!readiness.canExport) {
 toast({
 title: 'Export Blocked',
 description: `Readiness score is ${readiness.score}% — minimum ${READINESS_THRESHOLD}% required. Populate more sections or resolve compliance issues.`,
 variant: 'destructive',
 });
 return;
 }

 // Borderline: show confirmation with impacting sections
 if (readiness.isBorderline) {
 setShowConfirmation(true);
 return;
 }

 // Above warning threshold: export directly
 executeExport();
 }, [readiness, toast, executeExport]);

 // ── Mock export ─────────────────────────────────────────────────────────
 const handleMockExport = useCallback(async () => {
 setExporting(true);
 setExportStep('rendering');

 try {
 let result;
 switch (selectedFormat) {
 case 'pdf':
 result = await cerv2ExportService.exportMockPdf(selectedDocType);
 break;
 case 'docx':
 result = await cerv2ExportService.exportMockDocx(selectedDocType);
 break;
 case 'zip':
 result = await cerv2ExportService.exportMockZip(selectedDocType);
 break;
 default:
 result = { success: false, error: `Unknown format: ${selectedFormat}` };
 }

 const entry = {
 format: selectedFormat,
 filename: result.filename || `${selectedDocType}_mock.${selectedFormat}`,
 timestamp: new Date().toLocaleTimeString(),
 duration: '—',
 success: !!result.success,
 error: result.error || null,
 isMock: true,
 };
 setExportHistory(prev => [entry, ...prev].slice(0, 5));

 if (result.success) {
 toast({ title: 'Mock Export Complete', description: `Downloaded ${result.filename}` });
 } else {
 toast({
 title: 'Mock Export Failed',
 description: result.error || 'Unknown error.',
 variant: 'destructive',
 });
 }
 } catch (err) {
 console.error('[CERV2FullExportSimulation] Mock export error:', err);
 toast({
 title: 'Export Error',
 description: err.message || 'Unexpected failure.',
 variant: 'destructive',
 });
 } finally {
 setExporting(false);
 setExportStep(null);
 }
 }, [selectedFormat, selectedDocType, toast]);

 // ── Readiness color theming ─────────────────────────────────────────────
 const readinessColor =
 readiness.score >= 80
 ? 'text-primary'
 : readiness.score >= 50
 ? 'text-amber-500'
 : 'text-destructive';

 const readinessBg =
 readiness.score >= 80
 ? 'bg-primary'
 : readiness.score >= 50
 ? 'bg-amber-500'
 : 'bg-destructive';

 const FormatIcon = FORMAT_OPTIONS.find(f => f.value === selectedFormat)?.icon || FileDown;

 // ── Step progress indicator ─────────────────────────────────────────────
 const steps = [
 { key: 'converting', label: 'Converting AI → JSON' },
 { key: 'rendering', label: `Rendering ${selectedFormat.toUpperCase()}` },
 { key: 'downloading', label: 'Downloading' },
 ];

 return (
 <div className={`flex flex-col border rounded-lg bg-background overflow-hidden ${className}`}>
 {/* ─── Header ─────────────────────────────────────────────────────── */}
 <div className="px-4 py-2.5 border-b flex items-center justify-between bg-muted/20">
 <div className="flex items-center gap-2">
 <Zap className="h-4 w-4 text-primary" />
 <h3 className="text-sm font-semibold tracking-tight">Full Export Simulation</h3>
 <span className="text-xs text-muted-foreground">
 {DOC_TYPE_LABELS[selectedDocType] || selectedDocType}
 </span>
 </div>
 <div className="flex items-center gap-2">
 <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
 <div
 className={`h-full rounded-full transition-all ${readinessBg}`}
 style={{ width: `${readiness.score}%` }}
 />
 </div>
 <span className={`text-xs font-bold tabular-nums ${readinessColor}`}>
 {readiness.score}%
 </span>
 </div>
 </div>

 {/* ─── Export Controls ────────────────────────────────────────────── */}
 <div className="px-4 py-3 border-b flex items-center gap-3 flex-wrap">
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
 onClick={handleFullExport}
 disabled={exporting || !readiness.canExport}
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
 variant="outline"
 size="sm"
 className="h-8 text-xs"
 onClick={handleMockExport}
 disabled={exporting}
 >
 Mock Sample
 </Button>

 {/* Readiness gate warning */}
 {!readiness.canExport && (
 <div className="flex items-center gap-1.5 text-xs text-destructive ml-auto">
 <ShieldAlert className="h-3.5 w-3.5" />
 <span>
 {completeness.populated === 0
 ? 'No sections populated'
 : `Readiness ${readiness.score}% < ${READINESS_THRESHOLD}% min`}
 </span>
 </div>
 )}

 {/* Borderline warning badge */}
 {readiness.isBorderline && !showConfirmation && (
 <div className="flex items-center gap-1.5 text-xs text-amber-500 ml-auto">
 <AlertTriangle className="h-3.5 w-3.5" />
 <span>Borderline ({readiness.score}%) — will ask to confirm</span>
 </div>
 )}

 {/* Compliance summary */}
 {readiness.canExport && (readiness.errorCount > 0 || readiness.warningCount > 0) && (
 <div className="flex items-center gap-2 text-xs text-muted-foreground ml-auto">
 {readiness.errorCount > 0 && (
 <span className="flex items-center gap-0.5 text-destructive">
 <XCircle className="h-3 w-3" />
 {readiness.errorCount} error{readiness.errorCount > 1 ? 's' : ''}
 </span>
 )}
 {readiness.warningCount > 0 && (
 <span className="flex items-center gap-0.5 text-amber-500">
 <ShieldAlert className="h-3 w-3" />
 {readiness.warningCount} warning{readiness.warningCount > 1 ? 's' : ''}
 </span>
 )}
 </div>
 )}
 </div>

 {/* ─── Pre-Export Confirmation (Phase 7.9 — borderline zone) ───── */}
 {showConfirmation && (
 <div className="px-4 py-3 border-b bg-amber-50 dark:bg-amber-950/20">
 <div className="flex items-center gap-2 mb-2">
 <AlertTriangle className="h-4 w-4 text-amber-500 flex-shrink-0" />
 <span className="text-sm font-medium text-foreground">
 Export readiness is {readiness.score}% — review before exporting
 </span>
 </div>
 {impactingSections.length > 0 && (
 <div className="ml-6 mb-2.5 space-y-1">
 <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
 Sections impacting readiness
 </span>
 {impactingSections.map(s => (
 <div
 key={s.id}
 className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded border ${
 s.severity === 'error'
 ? 'bg-destructive/5 border-destructive/20 text-destructive'
 : 'bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-400'
 }`}
 >
 {s.severity === 'error' ? (
 <XCircle className="h-3 w-3 flex-shrink-0" />
 ) : (
 <AlertTriangle className="h-3 w-3 flex-shrink-0" />
 )}
 <span className="font-medium">{s.label}</span>
 <span className="text-muted-foreground truncate">
 {s.severity === 'error' ? '-15%' : '-5%'}
 </span>
 </div>
 ))}
 </div>
 )}
 <div className="flex items-center gap-2 ml-6">
 <Button
 size="sm"
 variant="destructive"
 className="h-7 text-xs gap-1"
 onClick={executeExport}
 >
 Export Anyway
 </Button>
 <Button
 size="sm"
 variant="ghost"
 className="h-7 text-xs"
 onClick={() => setShowConfirmation(false)}
 >
 Cancel
 </Button>
 </div>
 </div>
 )}

 {/* ─── Step Progress (visible during export) ──────────────────────── */}
 {exporting && exportStep && (
 <div className="px-4 py-2.5 border-b bg-primary/[0.02]">
 <div className="flex items-center gap-2 text-xs">
 {steps.map((step, idx) => {
 const isCurrent = step.key === exportStep;
 const isPast = steps.findIndex(s => s.key === exportStep) > idx;

 return (
 <div key={step.key} className="flex items-center gap-1.5">
 {idx > 0 && (
 <ArrowRight
 className={`h-2.5 w-2.5 ${isPast ? 'text-primary' : 'text-muted-foreground/30'}`}
 />
 )}
 {isCurrent ? (
 <Loader2 className="h-3 w-3 animate-spin text-primary" />
 ) : isPast ? (
 <CheckCircle2 className="h-3 w-3 text-primary" />
 ) : (
 <Clock className="h-3 w-3 text-muted-foreground/40" />
 )}
 <span
 className={
 isCurrent
 ? 'font-medium text-foreground'
 : isPast
 ? 'text-primary'
 : 'text-muted-foreground/50'
 }
 >
 {step.label}
 </span>
 </div>
 );
 })}
 </div>
 </div>
 )}

 {/* ─── Export History ──────────────────────────────────────────────── */}
 {exportHistory.length > 0 && (
 <ScrollArea className="max-h-40">
 <div className="px-4 py-2 space-y-1.5">
 <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
 Recent Exports
 </span>
 {exportHistory.map((entry, idx) => (
 <div
 key={`${entry.timestamp}-${idx}`}
 className={`flex items-center gap-2 text-xs px-2.5 py-1.5 rounded border ${
 entry.success
 ? 'bg-primary/[0.02] border-primary/20'
 : 'bg-destructive/[0.02] border-destructive/20'
 }`}
 >
 {entry.success ? (
 <CheckCircle2 className="h-3 w-3 text-primary flex-shrink-0" />
 ) : (
 <XCircle className="h-3 w-3 text-destructive flex-shrink-0" />
 )}
 <span className="font-medium text-foreground">
 {entry.format.toUpperCase()}
 {entry.isMock && (
 <span className="ml-1 text-muted-foreground font-normal">(mock)</span>
 )}
 </span>
 {entry.filename && (
 <span className="text-muted-foreground truncate max-w-[160px]">
 {entry.filename}
 </span>
 )}
 {entry.error && (
 <span className="text-destructive truncate max-w-[160px]">{entry.error}</span>
 )}
 <span className="ml-auto text-muted-foreground/60 tabular-nums flex-shrink-0">
 {entry.duration} · {entry.timestamp}
 </span>
 </div>
 ))}
 </div>
 </ScrollArea>
 )}

 {/* ─── Empty state ────────────────────────────────────────────────── */}
 {exportHistory.length === 0 && !exporting && (
 <div className="px-4 py-6 text-center text-xs text-muted-foreground/60">
 <FileDown className="h-5 w-5 mx-auto mb-1.5 text-muted-foreground/30" />
 <p>No exports yet — select a format and click Export</p>
 </div>
 )}
 </div>
 );
}
