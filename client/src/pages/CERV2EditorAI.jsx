/**
 * Phase 7.3 – CERV2 Editor AI Integration Page
 *
 * Wraps MedicalDeviceDocumentEditor with live AI suggestion
 * capabilities from /api/cerv2/ai/*. Supports 510(k), PMA, and CER
 * document types with per-section AI auto-populate, equivalence text,
 * and benefit-risk analysis.
 *
 * UX features:
 *  - Outline panel with section navigation
 *  - Expand / collapse section toggling
 *  - Scaffold refresh (re-fetch AI templates without overwriting manual edits)
 *  - Inline AI suggestion badges with accept/dismiss
 */

import React, { useState, useCallback, useMemo, useRef } from 'react';
import MedicalDeviceDocumentEditor from '../components/MedicalDeviceDocumentEditor.jsx';
import cerv2AIService from '../services/CERV2AIService.js';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
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
  Bot,
  ChevronDown,
  ChevronRight,
  RefreshCw,
  Sparkles,
  CheckCircle2,
  Loader2,
  FileText,
  PanelLeftOpen,
  PanelLeftClose,
  Brain,
  Lightbulb,
  X,
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

  // Computed
  const outline = useMemo(() => DOC_OUTLINES[selectedDocType] || [], [selectedDocType]);
  const activeSuggestionCount = Object.keys(aiSuggestions).filter(
    k => !dismissedSuggestions.has(k) && aiSuggestions[k]
  ).length;

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
  const debounceTimers = useRef({});
  const handleSectionChange = useCallback(
    (sectionId, content) => {
      // Clear stale cache for this section when content changes
      cerv2AIService.invalidateSection(selectedDocType, sectionId);

      if (debounceTimers.current[sectionId]) {
        clearTimeout(debounceTimers.current[sectionId]);
      }
      debounceTimers.current[sectionId] = setTimeout(() => {
        fetchAiSuggestion(sectionId, content);
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

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col w-full h-full min-h-screen bg-background">
      {/* ─── Top Toolbar ─────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 py-2 border-b bg-muted/30">
        <div className="flex items-center gap-3">
          <Brain className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold">CERV2 Editor AI</h2>
          <Badge variant="outline" className="text-xs">
            Phase 7.3
          </Badge>
        </div>

        <div className="flex items-center gap-3">
          {/* Doc Type Selector */}
          <Select value={selectedDocType} onValueChange={handleDocTypeChange}>
            <SelectTrigger className="w-[180px]">
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
            size="sm"
            onClick={() => setShowOutline(prev => !prev)}
            title={showOutline ? 'Hide outline' : 'Show outline'}
          >
            {showOutline ? (
              <PanelLeftClose className="h-4 w-4" />
            ) : (
              <PanelLeftOpen className="h-4 w-4" />
            )}
          </Button>

          {/* Expand / Collapse All */}
          <Button
            variant="ghost"
            size="sm"
            onClick={expandAllSections}
            title="Expand all outline sections"
          >
            <ChevronDown className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={collapseAllSections}
            title="Collapse all outline sections"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>

          {/* Scaffold Refresh */}
          <Button
            variant="outline"
            size="sm"
            onClick={handleScaffoldRefresh}
            disabled={scaffoldRefreshing}
            title="Refresh AI scaffold templates"
          >
            <RefreshCw className={`h-4 w-4 mr-1 ${scaffoldRefreshing ? 'animate-spin' : ''}`} />
            {scaffoldRefreshing ? 'Refreshing…' : 'Scaffold Refresh'}
          </Button>

          {/* AI Suggestion Badge */}
          {activeSuggestionCount > 0 && (
            <Badge className="bg-amber-100 text-amber-800 border-amber-300">
              <Sparkles className="h-3 w-3 mr-1" />
              {activeSuggestionCount} AI Suggestion{activeSuggestionCount > 1 ? 's' : ''}
            </Badge>
          )}
        </div>
      </div>

      {/* ─── Main Body ───────────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">
        {/* ─── Outline Panel ─────────────────────────────────────────────── */}
        {showOutline && (
          <aside className="w-64 border-r bg-background flex-shrink-0">
            <div className="px-3 py-2 border-b">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                Outline
              </h3>
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
                        <FileText className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
                        <span className="truncate flex-1">{section.label}</span>

                        {isLoading && (
                          <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                        )}
                        {hasSuggestion && !isLoading && (
                          <Lightbulb className="h-3 w-3 text-amber-500" />
                        )}
                      </button>

                      {/* Expanded AI Preview */}
                      {isExpanded && hasSuggestion && (
                        <div className="ml-8 mr-2 mt-1 mb-2 p-2 rounded border border-amber-200 bg-amber-50/50 text-xs">
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-medium text-amber-700 flex items-center gap-1">
                              <Bot className="h-3 w-3" /> AI Suggestion
                            </span>
                            <button
                              className="text-muted-foreground hover:text-foreground"
                              onClick={e => {
                                e.stopPropagation();
                                dismissSuggestion(section.id);
                              }}
                              title="Dismiss"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </div>
                          <p className="text-muted-foreground line-clamp-3">
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
            aiSuggestionsExternal={aiSuggestions}
            loadingSectionsExternal={loadingSections}
          />

          {/* ─── AI Suggestions Summary Panel ────────────────────────────── */}
          {activeSuggestionCount > 0 && (
            <div className="border-t bg-amber-50/30 px-4 py-3">
              <h4 className="text-sm font-semibold text-amber-800 mb-2 flex items-center gap-2">
                <Sparkles className="h-4 w-4" />
                Active AI Suggestions
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                {Object.entries(aiSuggestions)
                  .filter(([id]) => !dismissedSuggestions.has(id))
                  .map(([sectionId, suggestion]) => {
                    const sectionDef = outline.find(s => s.id === sectionId);
                    return (
                      <Card key={sectionId} className="border-amber-200">
                        <CardContent className="p-3">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-medium text-amber-700">
                              {sectionDef?.label || sectionId}
                            </span>
                            <div className="flex items-center gap-1">
                              {loadingSections[sectionId] ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <CheckCircle2 className="h-3 w-3 text-green-500" />
                              )}
                              <button
                                onClick={() => dismissSuggestion(sectionId)}
                                className="text-muted-foreground hover:text-foreground"
                                title="Dismiss"
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </div>
                          </div>
                          <p className="text-xs text-muted-foreground line-clamp-2">
                            {loadingSections[sectionId] ? 'Loading…' : suggestion}
                          </p>
                        </CardContent>
                      </Card>
                    );
                  })}
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
