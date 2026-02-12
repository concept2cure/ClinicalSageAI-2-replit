/**
 * Phase 7.3 + 7.4 – CERV2 Editor AI Integration Page
 *
 * Wraps MedicalDeviceDocumentEditor with live AI suggestion
 * capabilities from /api/cerv2/ai/*. Supports 510(k), PMA, and CER
 * document types with per-section AI auto-populate, equivalence text,
 * and benefit-risk analysis.
 *
 * Phase 7.4 additions:
 *  - Export toolbar: PDF, DOCX, eSTAR ZIP from AI-populated sections
 *  - Mock export for dev/demo without live editor data
 *  - AI suggestions → TipTap editor JSON → server-side rendering pipeline
 *
 * UX features:
 *  - Outline panel with section navigation
 *  - Expand / collapse section toggling
 *  - Scaffold refresh (re-fetch AI templates without overwriting manual edits)
 *  - Inline AI suggestion badges with accept/dismiss
 *  - Export dropdown with format selection and progress feedback
 */

import React, { useState, useCallback, useMemo, useRef } from 'react';
import MedicalDeviceDocumentEditor from '../components/MedicalDeviceDocumentEditor.jsx';
import cerv2AIService from '../services/CERV2AIService.js';
import cerv2ExportService from '../services/CERV2ExportService.js';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  ChevronDown,
  ChevronRight,
  RefreshCw,
  Loader2,
  PanelLeftOpen,
  PanelLeftClose,
  X,
  Download,
  FileDown,
  FileArchive,
  FileType,
} from 'lucide-react';

// ── Constants ──────────────────────────────────────────────────────────────────

const DOC_TYPE_OPTIONS = [
  { value: 'cerv2_510k', label: 'FDA 510(k)', icon: '🇺🇸' },
  { value: 'cerv2_pma', label: 'FDA PMA', icon: '🇺🇸' },
  { value: 'cerv2_cer', label: 'EU MDR CER', icon: '🇪🇺' },
];

// Section outlines per doc type (mirrors cerv2-ai-routes template keys)
const DOC_OUTLINES = {
  cerv2_510k: [
    { id: 'cover_letter', label: 'Cover Letter' },
    { id: 'admin', label: 'Administrative Info' },
    { id: 'ifu', label: 'Indications for Use' },
    { id: 'summary', label: '510(k) Summary' },
    { id: 'desc', label: 'Device Description' },
    { id: 'pred', label: 'Predicate Comparison' },
    { id: 'se', label: 'SE Discussion' },
    { id: 'testing', label: 'Performance Testing' },
    { id: 'labeling', label: 'Labeling' },
    { id: 'concl', label: 'Conclusion' },
  ],
  cerv2_pma: [
    { id: 'summary', label: 'PMA Summary' },
    { id: 'nonclin', label: 'Nonclinical Testing' },
    { id: 'clin', label: 'Clinical Data' },
    { id: 'mfgqa', label: 'Manufacturing / QA' },
    { id: 'labeling', label: 'Labeling' },
    { id: 'risk', label: 'Benefit-Risk' },
    { id: 'pms', label: 'Post-Market Surveillance' },
  ],
  cerv2_cer: [
    { id: 'sota', label: 'State of the Art' },
    { id: 'device', label: 'Device Description' },
    { id: 'dataset', label: 'Clinical Data / Literature' },
    { id: 'appraisal', label: 'Appraisal' },
    { id: 'benefitrisk', label: 'Benefit-Risk' },
    { id: 'gspr', label: 'GSPR Mapping' },
    { id: 'pms', label: 'PMS / PMCF' },
    { id: 'concl', label: 'Conclusion' },
  ],
};

// ── Section ID Mapping ──────────────────────────────────────────────────────────
// Maps AI outline section IDs → MedicalDeviceDocumentEditor internal section IDs.
// PMA and CER IDs already match; 510(k) has different internal IDs.
const OUTLINE_TO_EDITOR = {
  cerv2_510k: {
    cover_letter: 'user-fee-cover',
    admin: 'cdrh-cover-sheet',
    ifu: 'indications-for-use',
    summary: '510k-summary',
    desc: 'device-description',
    pred: 'substantial-equivalence',
    se: 'substantial-equivalence', // SE is part of the same SE section
    testing: 'executive-studies',
    labeling: 'proposed-labeling',
    concl: 'executive-summary', // Conclusion maps to Executive Summary's se_conclusion field
  },
  // PMA and CER IDs match the editor's section IDs directly
  cerv2_pma: {},
  cerv2_cer: {},
};

// Build reverse mapping (editor → outline) for each doc type
const EDITOR_TO_OUTLINE = {};
for (const [docType, map] of Object.entries(OUTLINE_TO_EDITOR)) {
  EDITOR_TO_OUTLINE[docType] = {};
  for (const [outlineId, editorId] of Object.entries(map)) {
    EDITOR_TO_OUTLINE[docType][editorId] = outlineId;
  }
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function CERV2EditorAI() {
  const { toast } = useToast();

  // State
  const [selectedDocType, setSelectedDocType] = useState('cerv2_510k');
  const [aiSuggestions, setAiSuggestions] = useState({});
  const [loadingSections, setLoadingSections] = useState({});
  const [showOutline, setShowOutline] = useState(true);
  const [expandedOutlineSections, setExpandedOutlineSections] = useState(new Set());
  const [scaffoldRefreshing, setScaffoldRefreshing] = useState(false);
  const [activeSectionId, setActiveSectionId] = useState(null);
  const [dismissedSuggestions, setDismissedSuggestions] = useState(new Set());

  // Phase 7.4 – Export state
  const [exporting, setExporting] = useState(null); // 'pdf' | 'docx' | 'zip' | 'mock-pdf' | 'mock-docx' | 'mock-zip' | null

  // Computed
  const outline = useMemo(() => DOC_OUTLINES[selectedDocType] || [], [selectedDocType]);
  const activeSuggestionCount = Object.keys(aiSuggestions).filter(
    k => !dismissedSuggestions.has(k) && aiSuggestions[k]
  ).length;

  // ── Key Transformation: outline keys → editor-compatible keys ─────────────
  // The editor renders AI suggestions using `${section.id}-main` compound keys.
  // This transforms our flat outline keys into that format, applying the
  // 510(k) section-ID mapping where needed.
  const aiSuggestionsForEditor = useMemo(() => {
    const mapped = {};
    const idMap = OUTLINE_TO_EDITOR[selectedDocType] || {};

    for (const [outlineKey, value] of Object.entries(aiSuggestions)) {
      if (dismissedSuggestions.has(outlineKey)) continue;
      // Map outline ID → editor section ID (identity if no mapping exists)
      const editorSectionId = idMap[outlineKey] || outlineKey;
      mapped[`${editorSectionId}-main`] = value;
    }
    return mapped;
  }, [aiSuggestions, selectedDocType, dismissedSuggestions]);

  const loadingSectionsForEditor = useMemo(() => {
    const mapped = {};
    const idMap = OUTLINE_TO_EDITOR[selectedDocType] || {};

    for (const [outlineKey, value] of Object.entries(loadingSections)) {
      const editorSectionId = idMap[outlineKey] || outlineKey;
      // Set both compound key (for field-level) and plain key (for section-level checks)
      mapped[`${editorSectionId}-main`] = value;
      mapped[editorSectionId] = value;
    }
    return mapped;
  }, [loadingSections, selectedDocType]);

  // ── AI Suggestion Fetch ─────────────────────────────────────────────────────

  const fetchAiSuggestion = useCallback(
    async (sectionId, content = '') => {
      if (loadingSections[sectionId]) return; // already in-flight

      try {
        setLoadingSections(prev => ({ ...prev, [sectionId]: true }));

        const data = await cerv2AIService.fetchSuggestion(selectedDocType, sectionId, 'main', {
          existingContent: content,
        });

        setAiSuggestions(prev => ({
          ...prev,
          [sectionId]: data.suggestion || 'No suggestion available.',
        }));

        // Remove from dismissed so new data shows
        setDismissedSuggestions(prev => {
          const next = new Set(prev);
          next.delete(sectionId);
          return next;
        });
      } catch (err) {
        console.error(`[CERV2EditorAI] AI suggestion failed for ${sectionId}:`, err);
        setAiSuggestions(prev => ({
          ...prev,
          [sectionId]: 'Error fetching suggestion.',
        }));
      } finally {
        setLoadingSections(prev => ({ ...prev, [sectionId]: false }));
      }
    },
    [selectedDocType, loadingSections]
  );

  // Debounced version for live typing
  // The editor fires onSectionChange with its INTERNAL section IDs, so we need
  // to reverse-map them back to our outline IDs for the AI service.
  const debounceTimers = useRef({});
  const handleSectionChange = useCallback(
    (sectionId, content) => {
      // Reverse-map editor ID → outline ID (identity if no mapping exists)
      const reverseMap = EDITOR_TO_OUTLINE[selectedDocType] || {};
      const outlineId = reverseMap[sectionId] || sectionId;

      // Clear stale cache for this section when content changes
      cerv2AIService.invalidateSection(selectedDocType, outlineId);

      if (debounceTimers.current[outlineId]) {
        clearTimeout(debounceTimers.current[outlineId]);
      }
      debounceTimers.current[outlineId] = setTimeout(() => {
        fetchAiSuggestion(outlineId, content);
      }, 800);
    },
    [selectedDocType, fetchAiSuggestion]
  );

  // ── Scaffold Refresh ──────────────────────────────────────────────────────

  const handleScaffoldRefresh = useCallback(async () => {
    setScaffoldRefreshing(true);
    toast({ title: 'Refreshing AI Scaffold', description: 'Fetching latest templates…' });

    try {
      cerv2AIService.clearCache();

      const templatesData = await cerv2AIService.fetchTemplates(selectedDocType);
      const templates = templatesData.templates || {};

      const newSuggestions = {};
      for (const [key, value] of Object.entries(templates)) {
        // Only populate if we have an outline section matching
        if (outline.some(s => s.id === key)) {
          newSuggestions[key] = value;
        }
      }

      setAiSuggestions(prev => ({ ...prev, ...newSuggestions }));
      setDismissedSuggestions(new Set());

      toast({
        title: 'Scaffold Refreshed',
        description: `${Object.keys(newSuggestions).length} section templates loaded.`,
      });
    } catch (err) {
      console.error('[CERV2EditorAI] Scaffold refresh error:', err);
      toast({
        title: 'Scaffold Error',
        description: 'Failed to refresh AI templates.',
        variant: 'destructive',
      });
    } finally {
      setScaffoldRefreshing(false);
    }
  }, [selectedDocType, outline, toast]);

  // ── Dismiss / Accept helpers ──────────────────────────────────────────────

  const dismissSuggestion = useCallback(sectionId => {
    setDismissedSuggestions(prev => new Set(prev).add(sectionId));
  }, []);

  // ── Doc Type Change ───────────────────────────────────────────────────────

  const handleDocTypeChange = useCallback(newType => {
    setSelectedDocType(newType);
    setAiSuggestions({});
    setLoadingSections({});
    setDismissedSuggestions(new Set());
    cerv2AIService.clearCache();
  }, []);

  // ── Outline toggle ────────────────────────────────────────────────────────

  const toggleOutlineSection = useCallback(sectionId => {
    setExpandedOutlineSections(prev => {
      const next = new Set(prev);
      if (next.has(sectionId)) next.delete(sectionId);
      else next.add(sectionId);
      return next;
    });
  }, []);

  const expandAllSections = useCallback(() => {
    setExpandedOutlineSections(new Set(outline.map(s => s.id)));
  }, [outline]);

  const collapseAllSections = useCallback(() => {
    setExpandedOutlineSections(new Set());
  }, []);

  // ── Phase 7.4: Export handlers ────────────────────────────────────────────

  // Section completeness: count how many outline sections have AI content
  const sectionCompleteness = useMemo(() => {
    const total = outline.length;
    const populated = outline.filter(
      s => aiSuggestions[s.id] && !dismissedSuggestions.has(s.id)
    ).length;
    return { total, populated, percent: total > 0 ? Math.round((populated / total) * 100) : 0 };
  }, [outline, aiSuggestions, dismissedSuggestions]);

  const handleExport = useCallback(
    async format => {
      // Pre-export validation: warn if <50% of sections populated
      if (sectionCompleteness.percent < 50) {
        const missing = outline
          .filter(s => !aiSuggestions[s.id] || dismissedSuggestions.has(s.id))
          .map(s => s.label);

        toast({
          title: 'Incomplete Document',
          description: `Only ${sectionCompleteness.populated}/${sectionCompleteness.total} sections populated. Missing: ${missing.slice(0, 3).join(', ')}${missing.length > 3 ? ` (+${missing.length - 3} more)` : ''}. Use "Scaffold Refresh" to auto-populate templates.`,
          variant: 'destructive',
          duration: 6000,
        });
        return;
      }

      setExporting(format);
      toast({
        title: 'Exporting…',
        description: `Generating ${format.toUpperCase()} from ${sectionCompleteness.populated} AI-populated sections.`,
      });

      try {
        const result = await cerv2ExportService.exportFromAiSuggestions(
          format,
          selectedDocType,
          aiSuggestions,
          outline,
          { title: `${selectedDocType}_AI_Export` }
        );

        if (result.success) {
          toast({
            title: 'Export Complete',
            description: `Downloaded ${result.filename}`,
          });
        } else {
          toast({
            title: 'Export Failed',
            description: result.error || 'Unknown error',
            variant: 'destructive',
          });
        }
      } catch (err) {
        console.error('[CERV2EditorAI] Export error:', err);
        toast({
          title: 'Export Error',
          description: err.message || 'Unexpected failure.',
          variant: 'destructive',
        });
      } finally {
        setExporting(null);
      }
    },
    [selectedDocType, aiSuggestions, outline, toast, sectionCompleteness, dismissedSuggestions]
  );

  const handleMockExport = useCallback(
    async format => {
      const key = `mock-${format}`;
      setExporting(key);
      toast({
        title: 'Mock Export…',
        description: `Generating mock ${format.toUpperCase()} from vault data.`,
      });

      try {
        let result;
        switch (format) {
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
            result = { success: false, error: `Unknown format: ${format}` };
        }

        if (result.success) {
          toast({
            title: 'Mock Export Complete',
            description: `Downloaded ${result.filename}`,
          });
        } else {
          toast({
            title: 'Mock Export Failed',
            description: result.error || 'Unknown error',
            variant: 'destructive',
          });
        }
      } catch (err) {
        console.error('[CERV2EditorAI] Mock export error:', err);
        toast({
          title: 'Export Error',
          description: err.message || 'Unexpected failure.',
          variant: 'destructive',
        });
      } finally {
        setExporting(null);
      }
    },
    [selectedDocType, toast]
  );

  const isExporting = exporting !== null;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col w-full h-full min-h-screen bg-background">
      {/* ─── Top Bar ──────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold tracking-tight">CERV2 Editor</h2>
        </div>

        <div className="flex items-center gap-2">
          {/* Doc Type Selector */}
          <Select value={selectedDocType} onValueChange={handleDocTypeChange}>
            <SelectTrigger className="w-[160px] h-8 text-xs">
              <SelectValue placeholder="Document type" />
            </SelectTrigger>
            <SelectContent>
              {DOC_TYPE_OPTIONS.map(opt => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.icon} {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Outline Toggle */}
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => setShowOutline(prev => !prev)}
            title={showOutline ? 'Hide outline' : 'Show outline'}
          >
            {showOutline ? (
              <PanelLeftClose className="h-4 w-4" />
            ) : (
              <PanelLeftOpen className="h-4 w-4" />
            )}
          </Button>

          {/* Scaffold Refresh */}
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={handleScaffoldRefresh}
            disabled={scaffoldRefreshing}
            title="Populate all sections with AI templates"
          >
            <RefreshCw className={`h-4 w-4 ${scaffoldRefreshing ? 'animate-spin' : ''}`} />
          </Button>

          {/* Section Completeness */}
          <div
            className="flex items-center gap-1.5"
            title={`${sectionCompleteness.populated} of ${sectionCompleteness.total} sections populated`}
          >
            <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  sectionCompleteness.percent === 100
                    ? 'bg-primary'
                    : sectionCompleteness.percent >= 50
                      ? 'bg-primary/60'
                      : 'bg-muted-foreground/40'
                }`}
                style={{ width: `${sectionCompleteness.percent}%` }}
              />
            </div>
            <span className="text-[11px] tabular-nums text-muted-foreground">
              {sectionCompleteness.populated}/{sectionCompleteness.total}
            </span>
          </div>

          {/* Export */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" disabled={isExporting} className="h-8 gap-1.5">
                {isExporting ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Download className="h-3.5 w-3.5" />
                )}
                Export
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem
                onClick={() => handleExport('pdf')}
                disabled={activeSuggestionCount === 0 || isExporting}
              >
                <FileDown className="h-4 w-4 mr-2" />
                PDF
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => handleExport('docx')}
                disabled={activeSuggestionCount === 0 || isExporting}
              >
                <FileType className="h-4 w-4 mr-2" />
                DOCX
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => handleExport('zip')}
                disabled={activeSuggestionCount === 0 || isExporting}
              >
                <FileArchive className="h-4 w-4 mr-2" />
                eSTAR ZIP
              </DropdownMenuItem>

              <DropdownMenuSeparator />

              <DropdownMenuItem
                onClick={() => handleMockExport('pdf')}
                disabled={isExporting}
                className="text-xs text-muted-foreground"
              >
                Sample PDF
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => handleMockExport('docx')}
                disabled={isExporting}
                className="text-xs text-muted-foreground"
              >
                Sample DOCX
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* ─── Main Body ───────────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">
        {/* ─── Outline Panel ─────────────────────────────────────────────── */}
        {showOutline && (
          <aside className="w-56 border-r flex-shrink-0">
            <div className="px-3 py-1.5 border-b flex items-center justify-between">
              <h3 className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                Sections
              </h3>
              <div className="flex items-center gap-1">
                <button
                  onClick={expandAllSections}
                  className="p-0.5 text-muted-foreground/60 hover:text-foreground rounded"
                  title="Expand all"
                >
                  <ChevronDown className="h-3 w-3" />
                </button>
                <button
                  onClick={collapseAllSections}
                  className="p-0.5 text-muted-foreground/60 hover:text-foreground rounded"
                  title="Collapse all"
                >
                  <ChevronRight className="h-3 w-3" />
                </button>
                <span className="text-[11px] tabular-nums text-muted-foreground ml-1">
                  {sectionCompleteness.populated}/{sectionCompleteness.total}
                </span>
              </div>
            </div>
            <ScrollArea className="h-[calc(100vh-120px)]">
              <div className="p-2 space-y-0.5">
                {outline.map(section => {
                  const hasSuggestion =
                    aiSuggestions[section.id] && !dismissedSuggestions.has(section.id);
                  const isLoading = loadingSections[section.id];
                  const isActive = activeSectionId === section.id;
                  const isExpanded = expandedOutlineSections.has(section.id);

                  return (
                    <div key={section.id}>
                      {/* Section Row */}
                      <button
                        className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm text-left transition-colors ${
                          isActive
                            ? 'bg-primary/10 text-primary font-medium'
                            : 'hover:bg-muted text-foreground'
                        }`}
                        onClick={() => {
                          setActiveSectionId(section.id);
                          toggleOutlineSection(section.id);
                        }}
                      >
                        {isExpanded ? (
                          <ChevronDown className="h-3 w-3 flex-shrink-0" />
                        ) : (
                          <ChevronRight className="h-3 w-3 flex-shrink-0" />
                        )}
                        {/* Status dot: populated / loading / empty */}
                        <span
                          className={`h-1.5 w-1.5 rounded-full flex-shrink-0 ${
                            isLoading
                              ? 'bg-primary animate-pulse'
                              : hasSuggestion
                                ? 'bg-primary'
                                : 'bg-border'
                          }`}
                        />
                        <span className="truncate flex-1">{section.label}</span>

                        {isLoading && (
                          <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                        )}
                      </button>

                      {/* Expanded AI Preview */}
                      {isExpanded && hasSuggestion && (
                        <div className="ml-7 mr-2 mt-0.5 mb-1.5 px-2 py-1.5 rounded border text-xs">
                          <div className="flex items-center justify-between mb-0.5">
                            <span className="font-medium text-muted-foreground text-[11px] uppercase tracking-wide">
                              AI Draft
                            </span>
                            <button
                              className="text-muted-foreground/60 hover:text-foreground"
                              onClick={e => {
                                e.stopPropagation();
                                dismissSuggestion(section.id);
                              }}
                              title="Dismiss"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </div>
                          <p className="text-muted-foreground line-clamp-2 leading-relaxed">
                            {aiSuggestions[section.id]}
                          </p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          </aside>
        )}

        {/* ─── Editor Pane ───────────────────────────────────────────────── */}
        <main className="flex-1 flex flex-col overflow-auto">
          <MedicalDeviceDocumentEditor
            documentType={selectedDocType}
            onSectionChange={handleSectionChange}
            aiSuggestionsExternal={aiSuggestionsForEditor}
            loadingSectionsExternal={loadingSectionsForEditor}
          />
        </main>
      </div>
    </div>
  );
}
