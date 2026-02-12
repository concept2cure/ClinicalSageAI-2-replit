/**
 * CERV2ExportPreviewPanel – Phase 7.6 Live Export Preview
 *
 * Collapsible right-side panel rendering a real-time preview
 * of the AI-populated document before export. Shows each section's
 * AI content, compliance status, word count, and export readiness.
 *
 * Features:
 *  - Per-section cards with AI content preview (expandable)
 *  - Inline compliance severity icon per section
 *  - Per-section readiness penalty badges (-15% error, -5% warning, Ready)
 *  - Word count per section and total
 *  - Export readiness score (penalizes errors/warnings)
 *  - Status badges: ready / loading / empty / dismissed
 *  - Expand-all / collapse-all controls
 *  - Thin toggle bar when hidden (matches CERV2ValidationPanel)
 *
 * Designed for regulatory professionals who need to review
 * the full document structure before generating PDF/DOCX/ZIP.
 */

import { useState, useMemo, useCallback } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Eye,
  EyeOff,
  FileText,
  ShieldCheck,
  AlertTriangle,
  XCircle,
  Loader2,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  FileWarning,
} from 'lucide-react';

// ── Severity classification ─────────────────────────────────────────────────
// Mirrors CERV2ValidationPanel's classifyHint — phrase-level matching to avoid
// false positives on standard regulatory language.

function classifyHint(hint) {
  if (!hint || typeof hint !== 'string') return 'none';
  const lower = hint.toLowerCase();

  // Error: explicit failure or missing-required language
  if (
    lower.includes('error validating') ||
    lower.includes('missing required') ||
    lower.includes('must include') ||
    lower.includes('does not comply') ||
    lower.includes('non-compliant')
  )
    return 'error';

  // Warning: unfilled placeholder tokens like [DEVICE NAME]
  if (/\[[A-Z][A-Z _/()-]{2,}\]/.test(hint)) return 'warning';

  // Warning: explicit advisory phrases
  if (
    lower.includes('consider adding') ||
    lower.includes('recommend including') ||
    lower.includes('no enhanced content available') ||
    lower.includes('no compliance data')
  )
    return 'warning';

  return 'pass';
}

const SEVERITY_ICONS = {
  error: { icon: XCircle, className: 'text-destructive' },
  warning: { icon: AlertTriangle, className: 'text-amber-500' },
  pass: { icon: ShieldCheck, className: 'text-primary' },
  none: { icon: ShieldCheck, className: 'text-muted-foreground' },
};

/** Per-section readiness penalty badges (Phase 7.8) */
const READINESS_BADGES = {
  error: {
    label: '-15%',
    bg: 'bg-destructive/10',
    text: 'text-destructive',
  },
  warning: {
    label: '-5%',
    bg: 'bg-amber-100 dark:bg-amber-900/30',
    text: 'text-amber-700 dark:text-amber-400',
  },
  pass: {
    label: 'Ready',
    bg: 'bg-primary/10',
    text: 'text-primary',
  },
  none: null,
};

const DOC_TYPE_LABELS = {
  cerv2_510k: '510(k)',
  cerv2_pma: 'PMA',
  cerv2_cer: 'CER',
};

function wordCount(text) {
  if (!text || typeof text !== 'string') return 0;
  return text.trim().split(/\s+/).filter(Boolean).length;
}

// ── Component ───────────────────────────────────────────────────────────────

/**
 * @param {Object}  props
 * @param {Array}   props.outline – [{ id, label }]
 * @param {Object}  props.aiSuggestions – { [outlineId]: string }
 * @param {Object}  props.validationHints – { [outlineId]: string }
 * @param {Object}  props.loadingSections – { [outlineId]: boolean }
 * @param {Set}     props.dismissedSuggestions
 * @param {string}  props.selectedDocType – "cerv2_510k" | "cerv2_pma" | "cerv2_cer"
 * @param {{ total: number, populated: number, percent: number }} props.completeness
 * @param {boolean} props.visible
 * @param {Function} props.onToggle – () => void
 * @param {string} [props.className]
 */
export default function CERV2ExportPreviewPanel({
  outline = [],
  aiSuggestions = {},
  validationHints = {},
  loadingSections = {},
  dismissedSuggestions = new Set(),
  selectedDocType = 'cerv2_510k',
  completeness = { total: 0, populated: 0, percent: 0 },
  visible = false,
  onToggle,
  className = '',
}) {
  const [expandedSections, setExpandedSections] = useState(new Set());

  // ── Per-section preview data ────────────────────────────────────────────
  const sectionPreviews = useMemo(() => {
    return outline.map(section => {
      const content = aiSuggestions[section.id];
      const hint = validationHints[section.id];
      const isLoading = !!loadingSections[section.id];
      const isDismissed = dismissedSuggestions.has(section.id);
      const hasContent = !!content && !isDismissed;
      const severity = hint ? classifyHint(hint) : 'none';
      const words = hasContent ? wordCount(content) : 0;

      let status;
      if (isLoading) status = 'loading';
      else if (isDismissed) status = 'dismissed';
      else if (hasContent) status = 'ready';
      else status = 'empty';

      return {
        id: section.id,
        label: section.label,
        content: hasContent ? content : null,
        hint,
        severity,
        status,
        words,
        isLoading,
      };
    });
  }, [outline, aiSuggestions, validationHints, loadingSections, dismissedSuggestions]);

  // ── Aggregate stats ─────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const totalWords = sectionPreviews.reduce((sum, s) => sum + s.words, 0);
    const readyCount = sectionPreviews.filter(s => s.status === 'ready').length;
    const errorCount = sectionPreviews.filter(s => s.severity === 'error').length;
    const warningCount = sectionPreviews.filter(s => s.severity === 'warning').length;
    const passCount = sectionPreviews.filter(s => s.severity === 'pass').length;
    const emptyCount = sectionPreviews.filter(
      s => s.status === 'empty' || s.status === 'dismissed'
    ).length;

    // Export readiness — penalize errors heavily, warnings slightly
    let readiness = completeness.percent;
    if (errorCount > 0) readiness = Math.max(0, readiness - errorCount * 15);
    if (warningCount > 0) readiness = Math.max(0, readiness - warningCount * 5);
    readiness = Math.min(100, Math.round(readiness));

    return { totalWords, readyCount, errorCount, warningCount, passCount, emptyCount, readiness };
  }, [sectionPreviews, completeness.percent]);

  // ── Section expand/collapse ─────────────────────────────────────────────
  const toggleSection = useCallback(sectionId => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(sectionId)) next.delete(sectionId);
      else next.add(sectionId);
      return next;
    });
  }, []);

  const expandAll = useCallback(() => {
    setExpandedSections(new Set(outline.map(s => s.id)));
  }, [outline]);

  const collapseAll = useCallback(() => {
    setExpandedSections(new Set());
  }, []);

  // ── Collapsed state ─────────────────────────────────────────────────────
  if (!visible) {
    return (
      <button
        onClick={onToggle}
        className="flex items-center justify-center w-8 border-l bg-muted/20 hover:bg-muted/40 transition-colors"
        title="Show export preview"
      >
        <Eye className="h-4 w-4 text-muted-foreground" />
      </button>
    );
  }

  // ── Readiness color theming ─────────────────────────────────────────────
  const readinessColor =
    stats.readiness >= 80
      ? 'text-primary'
      : stats.readiness >= 50
        ? 'text-amber-500'
        : 'text-destructive';

  const readinessBg =
    stats.readiness >= 80
      ? 'bg-primary'
      : stats.readiness >= 50
        ? 'bg-amber-500'
        : 'bg-destructive';

  return (
    <aside className={`w-72 border-l flex-shrink-0 flex flex-col bg-background ${className}`}>
      {/* ─── Header ─────────────────────────────────────────────────────── */}
      <div className="px-3 py-1.5 border-b flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <FileText className="h-3.5 w-3.5 text-primary" />
          <h3 className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
            Export Preview
          </h3>
        </div>
        <div className="flex items-center gap-1.5">
          <span className={`text-[10px] tabular-nums font-bold ${readinessColor}`}>
            {stats.readiness}%
          </span>
          <button
            onClick={onToggle}
            className="p-0.5 text-muted-foreground/60 hover:text-foreground rounded"
            title="Hide export preview"
          >
            <EyeOff className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* ─── Readiness Bar ──────────────────────────────────────────────── */}
      <div className="px-3 py-2 border-b bg-muted/20">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[11px] text-muted-foreground">
            Export Readiness — {DOC_TYPE_LABELS[selectedDocType] || selectedDocType}
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={expandAll}
              className="p-0.5 text-muted-foreground/60 hover:text-foreground rounded"
              title="Expand all"
            >
              <ChevronDown className="h-3 w-3" />
            </button>
            <button
              onClick={collapseAll}
              className="p-0.5 text-muted-foreground/60 hover:text-foreground rounded"
              title="Collapse all"
            >
              <ChevronRight className="h-3 w-3" />
            </button>
          </div>
        </div>
        <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${readinessBg}`}
            style={{ width: `${stats.readiness}%` }}
          />
        </div>
        {/* Compact stats row */}
        <div className="flex items-center gap-2 mt-1.5 text-[10px] text-muted-foreground">
          {stats.readyCount > 0 && (
            <span className="flex items-center gap-0.5">
              <CheckCircle2 className="h-2.5 w-2.5 text-primary" />
              {stats.readyCount} ready
            </span>
          )}
          {stats.emptyCount > 0 && (
            <span className="flex items-center gap-0.5">
              <FileWarning className="h-2.5 w-2.5 text-muted-foreground" />
              {stats.emptyCount} empty
            </span>
          )}
          {stats.errorCount > 0 && (
            <span className="flex items-center gap-0.5">
              <XCircle className="h-2.5 w-2.5 text-destructive" />
              {stats.errorCount}
            </span>
          )}
          {stats.warningCount > 0 && (
            <span className="flex items-center gap-0.5">
              <AlertTriangle className="h-2.5 w-2.5 text-amber-500" />
              {stats.warningCount}
            </span>
          )}
        </div>
      </div>

      {/* ─── Section Previews ───────────────────────────────────────────── */}
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          {sectionPreviews.map(section => {
            const isExpanded = expandedSections.has(section.id);
            const SeverityIcon = SEVERITY_ICONS[section.severity]?.icon || ShieldCheck;
            const severityClass =
              SEVERITY_ICONS[section.severity]?.className || 'text-muted-foreground';

            // Card styling based on status + severity highlighting (Phase 7.10)
            const isImpacting = section.severity === 'error' || section.severity === 'warning';
            const borderClass =
              isImpacting && section.severity === 'error'
                ? 'border-destructive/40 ring-1 ring-destructive/20'
                : isImpacting && section.severity === 'warning'
                  ? 'border-amber-300 dark:border-amber-700 ring-1 ring-amber-200/40 dark:ring-amber-800/40'
                  : section.status === 'ready'
                    ? 'border-primary/20'
                    : section.status === 'loading'
                      ? 'border-primary/30'
                      : 'border-border';

            const bgClass =
              section.status === 'ready'
                ? 'bg-primary/[0.02]'
                : section.status === 'loading'
                  ? 'bg-muted/40'
                  : 'bg-muted/20';

            return (
              <div
                key={section.id}
                className={`rounded border px-2.5 py-1.5 text-xs transition-colors ${borderClass} ${bgClass}`}
              >
                {/* Section header */}
                <button
                  className="w-full flex items-center gap-1.5 text-left"
                  onClick={() => toggleSection(section.id)}
                >
                  {isExpanded ? (
                    <ChevronDown className="h-3 w-3 flex-shrink-0 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-3 w-3 flex-shrink-0 text-muted-foreground" />
                  )}
                  {section.isLoading ? (
                    <Loader2 className="h-3 w-3 animate-spin text-primary flex-shrink-0" />
                  ) : (
                    <SeverityIcon className={`h-3 w-3 flex-shrink-0 ${severityClass}`} />
                  )}
                  <span className="font-medium text-foreground truncate flex-1">
                    {section.label}
                  </span>
                  {/* Per-section readiness penalty badge (Phase 7.8) */}
                  {section.severity !== 'none' && READINESS_BADGES[section.severity] && (
                    <span
                      className={`text-[9px] font-semibold tabular-nums px-1 py-0.5 rounded ${READINESS_BADGES[section.severity].bg} ${READINESS_BADGES[section.severity].text}`}
                    >
                      {READINESS_BADGES[section.severity].label}
                    </span>
                  )}
                  {section.status === 'ready' && (
                    <span className="text-[10px] tabular-nums text-muted-foreground">
                      {section.words}w
                    </span>
                  )}
                  {section.status === 'empty' && (
                    <span className="text-[10px] text-muted-foreground/50 italic">empty</span>
                  )}
                  {section.status === 'dismissed' && (
                    <span className="text-[10px] text-muted-foreground/50 italic">dismissed</span>
                  )}
                </button>

                {/* Expanded content preview */}
                {isExpanded && (
                  <div className="mt-1.5 ml-5 space-y-1.5">
                    {section.isLoading ? (
                      <p className="text-muted-foreground italic">Generating AI content…</p>
                    ) : section.content ? (
                      <>
                        <div className="rounded bg-background/60 border px-2 py-1.5">
                          <p className="text-muted-foreground leading-relaxed line-clamp-4 whitespace-pre-line">
                            {section.content}
                          </p>
                        </div>
                        {section.hint && (
                          <div className="flex items-start gap-1 px-1">
                            <SeverityIcon
                              className={`h-2.5 w-2.5 mt-0.5 flex-shrink-0 ${severityClass}`}
                            />
                            <p className="text-muted-foreground/80 leading-relaxed line-clamp-2">
                              {section.hint}
                            </p>
                          </div>
                        )}
                      </>
                    ) : (
                      <p className="text-muted-foreground/50 italic">
                        No content — use AI scaffold or edit section to populate
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </ScrollArea>

      {/* ─── Footer ─────────────────────────────────────────────────────── */}
      <div className="px-3 py-1.5 border-t text-[11px] text-muted-foreground flex items-center justify-between">
        <span className="tabular-nums">~{stats.totalWords.toLocaleString()} words</span>
        <div className="flex items-center gap-2">
          <span className="tabular-nums">
            {stats.readyCount}/{outline.length} sections
          </span>
          <span className={`font-bold tabular-nums ${readinessColor}`}>{stats.readiness}%</span>
        </div>
      </div>
    </aside>
  );
}
