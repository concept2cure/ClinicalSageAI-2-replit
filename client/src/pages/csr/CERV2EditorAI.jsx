/**
 * Phase 7 + 9 – CERV2 Editor AI Integration Page
 *
 * Phases 7.3–7.10: AI suggestions, export pipeline, validation, preview,
 * export simulation, readiness gating, keyboard shortcuts, UX polish.
 *
 * Phase 9 — Full UX/workflow improvements (P0–P3):
 * P0: Device context panel, auto-save persistence, user content in export
 * P1: Unified export, section progress indicators, word count targets
 * P2: Attachment upload, rules-based compliance, version history, undo dismiss
 * P3: Predicate device search, citation manager, review/approval workflow
 */

import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import MedicalDeviceDocumentEditor from '../../components/MedicalDeviceDocumentEditor.jsx';
import CERV2ExportControls from '../../components/CERV2ExportControls.jsx';
import CERV2ValidationPanel from '../../components/CERV2ValidationPanel.jsx';
import CERV2ExportPreviewPanel from '../../components/CERV2ExportPreviewPanel.jsx';
import CERV2FullExportSimulation from '../../components/CERV2FullExportSimulation.jsx';
import CERV2DeviceContextPanel from '../../components/CERV2DeviceContextPanel.jsx';
import CERV2AttachmentManager from '../../components/CERV2AttachmentManager.jsx';
import CERV2VersionHistory from '../../components/CERV2VersionHistory.jsx';
import CERV2PredicateSearch from '../../components/CERV2PredicateSearch.jsx';
import CERV2CitationManager from '../../components/CERV2CitationManager.jsx';
import CERV2ReviewWorkflow from '../../components/CERV2ReviewWorkflow.jsx';
import cerv2AIService from '../../services/CERV2AIService.js';
import autoSaveService from '../../services/CERV2AutoSaveService.js';
import { validateSection as complianceValidate } from '../../utils/CERV2ComplianceEngine.js';
import {
 computeSectionStatus,
 getSectionTarget,
 STATUS_CONFIG,
} from '../../utils/cerv2-section-targets.js';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
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
 Eye,
 Zap,
 X,
 Undo2,
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

 // ── Core State ──────────────────────────────────────────────────────────
 const [selectedDocType, setSelectedDocType] = useState('cerv2_510k');
 const [aiSuggestions, setAiSuggestions] = useState({});
 const [loadingSections, setLoadingSections] = useState({});
 const [showOutline, setShowOutline] = useState(true);
 const [expandedOutlineSections, setExpandedOutlineSections] = useState(new Set());
 const [scaffoldRefreshing, setScaffoldRefreshing] = useState(false);
 const [activeSectionId, setActiveSectionId] = useState(null);
 const [dismissedSuggestions, setDismissedSuggestions] = useState(new Set());

 // Phase 7.5 – Validation state
 const [validationHints, setValidationHints] = useState({});
 const [loadingValidation, setLoadingValidation] = useState({});
 const [showValidation, setShowValidation] = useState(true);

 // Phase 7.6 – Export preview state
 const [showExportPreview, setShowExportPreview] = useState(false);

 // Phase 7.7 – Full export simulation state
 const [showExportSim, setShowExportSim] = useState(false);

 // ── Phase 9 State ───────────────────────────────────────────────────────
 // P0: Device context
 const [deviceContext, setDeviceContext] = useState({});
 const [showDeviceContext, setShowDeviceContext] = useState(false);

 // P0: User-edited content tracking (separate from AI suggestions)
 const [userSectionContent, setUserSectionContent] = useState({});

 // P2: Attachments per section
 const [attachments, setAttachments] = useState({});
 const [showAttachments, setShowAttachments] = useState(false);

 // P2: Version history
 const [showVersionHistory, setShowVersionHistory] = useState(false);

 // P2: Rules-based compliance results
 const [complianceResults, setComplianceResults] = useState({});

 // P3: Predicate search
 const [showPredicateSearch, setShowPredicateSearch] = useState(false);

 // P3: Citations
 const [citations, setCitations] = useState([]);
 const [showCitations, setShowCitations] = useState(false);

 // P3: Review workflow
 const [reviewState, setReviewState] = useState({ status: 'draft', auditTrail: [] });
 const [showReview, setShowReview] = useState(false);

 // ── Computed ────────────────────────────────────────────────────────────
 const outline = useMemo(() => DOC_OUTLINES[selectedDocType] || [], [selectedDocType]);

 // P0: Merge user edits + AI suggestions — user content wins
 const mergedSectionContent = useMemo(() => {
 const merged = {};
 for (const section of DOC_OUTLINES[selectedDocType] || []) {
 const userContent = userSectionContent[section.id];
 const aiContent = (!dismissedSuggestions.has(section.id) && aiSuggestions[section.id]) || '';
 merged[section.id] = userContent && userContent.trim() ? userContent : aiContent;
 }
 return merged;
 }, [selectedDocType, userSectionContent, aiSuggestions, dismissedSuggestions]);

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

 // Refs for in-flight tracking (avoids stale closure issues with state objects)
 const inFlightSuggestions = useRef(new Set());
 const inFlightValidations = useRef(new Set());

 // ── AI Suggestion Fetch ─────────────────────────────────────────────────────

 const fetchAiSuggestion = useCallback(
 async (sectionId, content = '') => {
 if (inFlightSuggestions.current.has(sectionId)) return; // already in-flight

 try {
 inFlightSuggestions.current.add(sectionId);
 setLoadingSections(prev => ({ ...prev, [sectionId]: true }));

 const data = await cerv2AIService.fetchSuggestion(selectedDocType, sectionId, 'main', {
 existingContent: content,
 deviceName: deviceContext.deviceName,
 predicateDevice: deviceContext.predicateDevice,
 indication: deviceContext.intendedUse,
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
 inFlightSuggestions.current.delete(sectionId);
 setLoadingSections(prev => ({ ...prev, [sectionId]: false }));
 }
 },
 [selectedDocType, deviceContext]
 );

 // ── Phase 7.5: Compliance validation ───────────────────────────────────────

 const validateSection = useCallback(
 async (outlineId, content = '') => {
 if (inFlightValidations.current.has(outlineId)) return;
 try {
 inFlightValidations.current.add(outlineId);
 setLoadingValidation(prev => ({ ...prev, [outlineId]: true }));
 const result = await cerv2AIService.analyzeSection(selectedDocType, outlineId, content, {
 deviceContext,
 });
 setValidationHints(prev => ({
 ...prev,
 [outlineId]: result.suggestion || 'No compliance data.',
 }));
 } catch (err) {
 console.error(`[CERV2EditorAI] Validation failed for ${outlineId}:`, err);
 setValidationHints(prev => ({
 ...prev,
 [outlineId]: 'Error validating section.',
 }));
 } finally {
 inFlightValidations.current.delete(outlineId);
 setLoadingValidation(prev => ({ ...prev, [outlineId]: false }));
 }
 },
 [selectedDocType, deviceContext]
 );

 // Debounced version for live typing
 // The editor fires onSectionChange with its INTERNAL section IDs, so we need
 // to reverse-map them back to our outline IDs for the AI service.
 const debounceTimers = useRef({});
 const validationTimers = useRef({});
 const handleSectionChange = useCallback(
 (sectionId, content) => {
 // Reverse-map editor ID → outline ID (identity if no mapping exists)
 const reverseMap = EDITOR_TO_OUTLINE[selectedDocType] || {};
 const outlineId = reverseMap[sectionId] || sectionId;

 // P0: Track user-edited content
 setUserSectionContent(prev => ({ ...prev, [outlineId]: content }));

 // Clear stale cache for this section when content changes
 cerv2AIService.invalidateSection(selectedDocType, outlineId);

 // Debounced AI suggestion fetch (800ms)
 if (debounceTimers.current[outlineId]) {
 clearTimeout(debounceTimers.current[outlineId]);
 }
 debounceTimers.current[outlineId] = setTimeout(() => {
 fetchAiSuggestion(outlineId, content);
 }, 800);

 // Debounced compliance validation (1200ms — slightly slower to avoid noise)
 if (validationTimers.current[outlineId]) {
 clearTimeout(validationTimers.current[outlineId]);
 }
 validationTimers.current[outlineId] = setTimeout(() => {
 validateSection(outlineId, content);
 }, 1200);

 // P2: Rules-based compliance (instant, no debounce needed — pure JS)
 setComplianceResults(prev => ({
 ...prev,
 [outlineId]: complianceValidate(selectedDocType, outlineId, content, deviceContext),
 }));
 },
 [selectedDocType, fetchAiSuggestion, validateSection, deviceContext]
 );

 // ── Timer cleanup helpers ──────────────────────────────────────────────────

 const cancelAllTimers = useCallback(() => {
 for (const id of Object.values(debounceTimers.current)) clearTimeout(id);
 for (const id of Object.values(validationTimers.current)) clearTimeout(id);
 debounceTimers.current = {};
 validationTimers.current = {};
 }, []);

 // Cleanup on unmount to prevent setState on unmounted component
 useEffect(() => {
 return () => {
 cancelAllTimers();
 autoSaveService.cancelAll();
 };
 }, [cancelAllTimers]);

 // ── Phase 9 P0: Auto-save persistence ──────────────────────────────────

 // Load saved state on mount or doc type change
 useEffect(() => {
 autoSaveService.init(selectedDocType, 'default');
 const saved = autoSaveService.load();
 if (saved) {
 if (saved.deviceContext) setDeviceContext(saved.deviceContext);
 if (saved.userSectionContent) setUserSectionContent(saved.userSectionContent);
 if (saved.aiSuggestions) setAiSuggestions(saved.aiSuggestions);
 if (saved.dismissedSuggestions) setDismissedSuggestions(saved.dismissedSuggestions);
 if (saved.attachments) setAttachments(saved.attachments);
 if (saved.citations) setCitations(saved.citations);
 if (saved.reviewState) setReviewState(saved.reviewState);
 toast({ title: 'Session Restored', description: 'Your previous work has been loaded.' });
 }
 // eslint-disable-next-line react-hooks/exhaustive-deps
 }, [selectedDocType]);

 // Debounced auto-save on state changes
 useEffect(() => {
 autoSaveService.init(selectedDocType, 'default');
 autoSaveService.saveDebounced({
 deviceContext,
 userSectionContent,
 aiSuggestions,
 dismissedSuggestions,
 attachments,
 citations,
 reviewState,
 });
 }, [
 selectedDocType,
 deviceContext,
 userSectionContent,
 aiSuggestions,
 dismissedSuggestions,
 attachments,
 citations,
 reviewState,
 ]);

 // ── Scaffold Refresh ──────────────────────────────────────────────────────

 const handleScaffoldRefresh = useCallback(async () => {
 setScaffoldRefreshing(true);
 toast({ title: 'Refreshing AI Scaffold', description: 'Fetching latest templates…' });

 // P2: Snapshot current state before overwrite
 autoSaveService.init(selectedDocType, 'default');
 autoSaveService.pushVersion(
 { sectionData: mergedSectionContent, deviceContext, attachments, citations, reviewState },
 'Pre-scaffold snapshot'
 );

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
 }, [
 selectedDocType,
 outline,
 toast,
 mergedSectionContent,
 deviceContext,
 attachments,
 citations,
 reviewState,
 ]);

 // ── Phase 7.10: Keyboard shortcuts ───────────────────────────────────────
 // IMPORTANT: This useEffect MUST come after handleScaffoldRefresh's
 // useCallback declaration to avoid a Temporal Dead Zone reference error
 // (const is not accessible before initialization in ES2020+).
 useEffect(() => {
 const handler = e => {
 // All shortcuts use Ctrl+Shift+<key> (Cmd+Shift on Mac)
 if (!(e.ctrlKey || e.metaKey) || !e.shiftKey) return;

 switch (e.key.toLowerCase()) {
 case 'o': // Toggle outline
 e.preventDefault();
 setShowOutline(prev => !prev);
 break;
 case 'p': // Toggle export preview
 e.preventDefault();
 setShowExportPreview(prev => !prev);
 break;
 case 'v': // Toggle validation panel
 e.preventDefault();
 setShowValidation(prev => !prev);
 break;
 case 'e': // Toggle export simulation
 e.preventDefault();
 setShowExportSim(prev => !prev);
 break;
 case 'r': // Scaffold refresh
 e.preventDefault();
 if (!scaffoldRefreshing) handleScaffoldRefresh();
 break;
 case 'd': // Toggle device context (Phase 9)
 e.preventDefault();
 setShowDeviceContext(prev => !prev);
 break;
 default:
 break;
 }
 };
 window.addEventListener('keydown', handler);
 return () => window.removeEventListener('keydown', handler);
 }, [scaffoldRefreshing, handleScaffoldRefresh]);

 // ── Dismiss / Accept helpers ──────────────────────────────────────────────

 const dismissSuggestion = useCallback(sectionId => {
 setDismissedSuggestions(prev => new Set(prev).add(sectionId));
 }, []);

 // P2: Undo dismissed suggestion
 const undoDismiss = useCallback(sectionId => {
 setDismissedSuggestions(prev => {
 const next = new Set(prev);
 next.delete(sectionId);
 return next;
 });
 }, []);

 // P3: Predicate search auto-fill
 const handlePredicateSelect = useCallback(
 ({ deviceName, kNumber, applicant }) => {
 setDeviceContext(prev => ({
 ...prev,
 predicateDevice: deviceName,
 predicateK: kNumber,
 }));
 toast({ title: 'Predicate Selected', description: `${deviceName} (${kNumber})` });
 },
 [toast]
 );

 // P2: Version restore
 const handleVersionRestore = useCallback(
 state => {
 if (state.sectionData) {
 setUserSectionContent(state.sectionData);
 }
 if (state.deviceContext) setDeviceContext(state.deviceContext);
 if (state.attachments) setAttachments(state.attachments);
 if (state.citations) setCitations(state.citations);
 if (state.reviewState) setReviewState(state.reviewState);
 toast({
 title: 'Version Restored',
 description: 'Editor state has been restored from snapshot.',
 });
 },
 [toast]
 );

 // ── Doc Type Change ───────────────────────────────────────────────────────

 const handleDocTypeChange = useCallback(
 newType => {
 cancelAllTimers();
 autoSaveService.cancelAll();
 setSelectedDocType(newType);
 setAiSuggestions({});
 setLoadingSections({});
 setDismissedSuggestions(new Set());
 setValidationHints({});
 setLoadingValidation({});
 setUserSectionContent({});
 setDeviceContext({});
 setAttachments({});
 setComplianceResults({});
 setCitations([]);
 setReviewState({ status: 'draft', auditTrail: [] });
 inFlightSuggestions.current.clear();
 inFlightValidations.current.clear();
 cerv2AIService.clearCache();
 },
 [cancelAllTimers]
 );

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

 // ── Section completeness (uses merged content — P0) ─────────────────────
 const sectionCompleteness = useMemo(() => {
 const total = outline.length;
 const populated = outline.filter(
 s => mergedSectionContent[s.id] && mergedSectionContent[s.id].trim().length > 0
 ).length;
 return { total, populated, percent: total > 0 ? Math.round((populated / total) * 100) : 0 };
 }, [outline, mergedSectionContent]);

 // P1: Per-section status indicators
 const sectionStatuses = useMemo(() => {
 const statuses = {};
 for (const section of outline) {
 const content = mergedSectionContent[section.id] || '';
 statuses[section.id] = computeSectionStatus(selectedDocType, section.id, content);
 }
 return statuses;
 }, [outline, mergedSectionContent, selectedDocType]);

 // ── Render ────────────────────────────────────────────────────────────────

 return (
 <div className="flex flex-col w-full h-full min-h-screen bg-background">
 {/* ─── Top Bar ──────────────────────────────────────────────────── */}
 <div className="flex items-center justify-between px-3 py-1.5 border-b">
 <div className="flex items-center gap-2">
 <h2 className="text-sm font-semibold tracking-tight">CERV2 Editor</h2>
 {/* P3: Review status badge */}
 <Badge
 className={`text-[11px] px-1.5 py-0 ${
 reviewState.status === 'draft'
 ? 'bg-slate-100 text-slate-600'
 : reviewState.status === 'review'
 ? 'bg-amber-100 text-amber-700'
 : reviewState.status === 'approved'
 ? 'bg-green-100 text-green-700'
 : 'bg-stone-100 text-stone-700'
 }`}
 >
 {reviewState.status === 'draft'
 ? 'Draft'
 : reviewState.status === 'review'
 ? 'In Review'
 : reviewState.status === 'approved'
 ? 'Approved'
 : 'Released'}
 </Badge>
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

 {/* P0: Device Context Toggle — compact trigger in top bar */}
 <button
 onClick={() => setShowDeviceContext(prev => !prev)}
 className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs border rounded-md transition-colors ${
 showDeviceContext
 ? 'bg-stone-50 border-stone-300 text-stone-700'
 : 'hover:bg-slate-50 text-slate-600'
 }`}
 title="Toggle Device Context (Ctrl+Shift+D)"
 >
 <span className="font-medium">Device</span>
 {showDeviceContext ? (
 <ChevronDown className="w-3 h-3" />
 ) : (
 <ChevronRight className="w-3 h-3" />
 )}
 </button>

 {/* Outline Toggle */}
 <Button
 variant="ghost"
 size="icon"
 className="h-8 w-8"
 onClick={() => setShowOutline(prev => !prev)}
 title={`${showOutline ? 'Hide' : 'Show'} outline (⌃⇧O)`}
 >
 {showOutline ? (
 <PanelLeftClose className="h-4 w-4" />
 ) : (
 <PanelLeftOpen className="h-4 w-4" />
 )}
 </Button>

 {/* Export Preview Toggle */}
 <Button
 variant="ghost"
 size="icon"
 className="h-8 w-8"
 onClick={() => setShowExportPreview(prev => !prev)}
 title={`${showExportPreview ? 'Hide' : 'Show'} export preview (⌃⇧P)`}
 >
 <Eye className={`h-4 w-4 ${showExportPreview ? 'text-primary' : ''}`} />
 </Button>

 {/* Full Export Simulation Toggle (Phase 7.7) */}
 <Button
 variant="ghost"
 size="icon"
 className="h-8 w-8"
 onClick={() => setShowExportSim(prev => !prev)}
 title={`${showExportSim ? 'Hide' : 'Show'} export simulation (⌃⇧E)`}
 >
 <Zap className={`h-4 w-4 ${showExportSim ? 'text-primary' : ''}`} />
 </Button>

 {/* Scaffold Refresh */}
 <Button
 variant="ghost"
 size="icon"
 className="h-8 w-8"
 onClick={handleScaffoldRefresh}
 disabled={scaffoldRefreshing}
 title="Populate all sections with AI templates (⌃⇧R)"
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
 </div>
 </div>

 {/* P0: Device Context Panel — full form rendered below top bar when expanded */}
 {showDeviceContext && (
 <CERV2DeviceContextPanel
 selectedDocType={selectedDocType}
 deviceContext={deviceContext}
 onContextChange={setDeviceContext}
 visible={showDeviceContext}
 onToggle={() => setShowDeviceContext(false)}
 />
 )}

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
 const isDismissed =
 dismissedSuggestions.has(section.id) && aiSuggestions[section.id];
 const isLoading = loadingSections[section.id];
 const isActive = activeSectionId === section.id;
 const isExpanded = expandedOutlineSections.has(section.id);
 const status = sectionStatuses[section.id] || 'empty';
 const statusCfg = STATUS_CONFIG[status] || STATUS_CONFIG.empty;
 const target = getSectionTarget(selectedDocType, section.id);
 const content = mergedSectionContent[section.id] || '';
 const words = content.trim().split(/\s+/).filter(Boolean).length;
 const attachCount = (attachments[section.id] || []).length;
 const compliance = complianceResults[section.id];

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
 {/* P1: Status dot with section status color */}
 <span
 className={`h-1.5 w-1.5 rounded-full flex-shrink-0 ${
 isLoading ? 'bg-primary animate-pulse' : statusCfg.dot
 }`}
 title={statusCfg.text}
 />
 <span className="truncate flex-1">{section.label}</span>

 {/* P1: Word count / target */}
 <span className="text-[11px] tabular-nums text-muted-foreground flex-shrink-0">
 {words > 0 ? `${words}/${target.target}` : ''}
 </span>

 {/* P2: Attachment badge */}
 {attachCount > 0 && (
 <span className="text-[11px] text-muted-foreground">📎{attachCount}</span>
 )}

 {/* P2: Compliance issue indicator */}
 {compliance && compliance.severity === 'error' && (
 <span
 className="h-1.5 w-1.5 rounded-full bg-red-500 flex-shrink-0"
 title="Compliance issues"
 />
 )}
 {compliance && compliance.severity === 'warning' && (
 <span
 className="h-1.5 w-1.5 rounded-full bg-amber-400 flex-shrink-0"
 title="Compliance warnings"
 />
 )}

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

 {/* P2: Undo dismissed suggestion */}
 {isExpanded && isDismissed && (
 <div className="ml-7 mr-2 mt-0.5 mb-1.5">
 <button
 className="flex items-center gap-1 text-[11px] text-stone-600 hover:text-stone-800 transition-colors"
 onClick={e => {
 e.stopPropagation();
 undoDismiss(section.id);
 }}
 >
 <Undo2 className="h-3 w-3" />
 Restore dismissed AI suggestion
 </button>
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
 {/* P3: Predicate Search (above editor, only for 510k) */}
 {showPredicateSearch && selectedDocType === 'cerv2_510k' && (
 <div className="mx-4 mt-2">
 <CERV2PredicateSearch
 onSelectPredicate={handlePredicateSelect}
 visible={showPredicateSearch}
 onToggle={() => setShowPredicateSearch(prev => !prev)}
 />
 </div>
 )}

 <MedicalDeviceDocumentEditor
 documentType={selectedDocType}
 onSectionChange={handleSectionChange}
 aiSuggestionsExternal={aiSuggestionsForEditor}
 loadingSectionsExternal={loadingSectionsForEditor}
 deviceProfile={deviceContext}
 />

 {/* ─── Below-editor panels ────────────────────────────────────── */}
 <div className="mx-4 my-2 space-y-2">
 {/* P2: Attachment Manager */}
 {showAttachments && (
 <CERV2AttachmentManager
 activeSectionId={activeSectionId || outline[0]?.id}
 attachments={attachments}
 onAttachmentsChange={setAttachments}
 outline={outline}
 visible={showAttachments}
 onToggle={() => setShowAttachments(prev => !prev)}
 />
 )}

 {/* P2: Version History */}
 {showVersionHistory && (
 <CERV2VersionHistory
 docType={selectedDocType}
 projectId="default"
 outline={outline}
 currentState={{
 sectionData: mergedSectionContent,
 deviceContext,
 attachments,
 citations,
 reviewState,
 }}
 onRestore={handleVersionRestore}
 visible={showVersionHistory}
 onToggle={() => setShowVersionHistory(prev => !prev)}
 />
 )}

 {/* P3: Citation Manager */}
 {showCitations && (
 <CERV2CitationManager
 citations={citations}
 onCitationsChange={setCitations}
 outline={outline}
 activeSectionId={activeSectionId || outline[0]?.id}
 visible={showCitations}
 onToggle={() => setShowCitations(prev => !prev)}
 />
 )}

 {/* P3: Review Workflow */}
 {showReview && (
 <CERV2ReviewWorkflow
 reviewState={reviewState}
 onReviewStateChange={setReviewState}
 readinessScore={sectionCompleteness.percent}
 visible={showReview}
 onToggle={() => setShowReview(prev => !prev)}
 />
 )}

 {/* Full Export Simulation (Phase 7.7) */}
 {showExportSim && (
 <CERV2FullExportSimulation
 outline={outline}
 aiSuggestions={mergedSectionContent}
 validationHints={validationHints}
 dismissedSuggestions={dismissedSuggestions}
 selectedDocType={selectedDocType}
 completeness={sectionCompleteness}
 />
 )}
 </div>

 {/* ─── Sub-panel toggle strip ─────────────────────────────────── */}
 <div className="flex items-center gap-1.5 px-4 py-1.5 border-t bg-slate-50/50">
 <CERV2AttachmentManager
 activeSectionId={activeSectionId || outline[0]?.id}
 attachments={attachments}
 onAttachmentsChange={setAttachments}
 outline={outline}
 visible={false}
 onToggle={() => setShowAttachments(prev => !prev)}
 />
 <CERV2VersionHistory
 docType={selectedDocType}
 projectId="default"
 outline={outline}
 currentState={{}}
 onRestore={handleVersionRestore}
 visible={false}
 onToggle={() => setShowVersionHistory(prev => !prev)}
 />
 <CERV2CitationManager
 citations={citations}
 onCitationsChange={setCitations}
 outline={outline}
 activeSectionId={activeSectionId}
 visible={false}
 onToggle={() => setShowCitations(prev => !prev)}
 />
 <CERV2ReviewWorkflow
 reviewState={reviewState}
 onReviewStateChange={setReviewState}
 readinessScore={sectionCompleteness.percent}
 visible={false}
 onToggle={() => setShowReview(prev => !prev)}
 />
 {selectedDocType === 'cerv2_510k' && (
 <CERV2PredicateSearch
 onSelectPredicate={handlePredicateSelect}
 visible={false}
 onToggle={() => setShowPredicateSearch(prev => !prev)}
 />
 )}
 </div>

 {/* ─── Inline Export Controls (P1: statusOnly when sim is open) ─ */}
 <CERV2ExportControls
 docType={selectedDocType}
 aiSuggestions={mergedSectionContent}
 outline={outline}
 completeness={sectionCompleteness}
 dismissedSuggestions={dismissedSuggestions}
 statusOnly={showExportSim}
 onOpenExportSim={() => setShowExportSim(true)}
 />
 </main>

 {/* ─── Export Preview Panel (Phase 7.6) ────────────────────────── */}
 <CERV2ExportPreviewPanel
 outline={outline}
 aiSuggestions={mergedSectionContent}
 validationHints={validationHints}
 loadingSections={loadingSections}
 dismissedSuggestions={dismissedSuggestions}
 selectedDocType={selectedDocType}
 completeness={sectionCompleteness}
 visible={showExportPreview}
 onToggle={() => setShowExportPreview(prev => !prev)}
 />

 {/* ─── Compliance Validation Panel (Phase 7.5) ──────────────────── */}
 <CERV2ValidationPanel
 outline={outline}
 validationHints={validationHints}
 loadingValidation={loadingValidation}
 visible={showValidation}
 onToggle={() => setShowValidation(prev => !prev)}
 onRefreshSection={validateSection}
 />
 </div>
 </div>
 );
}
