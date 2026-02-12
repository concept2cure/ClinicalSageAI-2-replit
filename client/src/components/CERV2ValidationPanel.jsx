/**
 * CERV2ValidationPanel – Phase 7.5 Compliance Hints
 *
 * Collapsible right-side panel showing AI-powered per-section
 * compliance validation hints. Each section displays a status
 * indicator (pass / warning / loading) and the full hint text.
 *
 * Designed for regulatory professionals who need inline feedback
 * while editing 510(k), PMA, or CER documents.
 */

import { useCallback } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  ShieldCheck,
  AlertTriangle,
  Loader2,
  RefreshCw,
  PanelRightClose,
  PanelRightOpen,
  XCircle,
} from 'lucide-react';

/**
 * Severity classification for validation hints.
 * The AI backend returns a suggestion string — we parse keywords to assign severity.
 */
function classifyHint(hint) {
  if (!hint || typeof hint !== 'string') return 'none';
  const lower = hint.toLowerCase();
  if (
    lower.includes('error') ||
    lower.includes('missing required') ||
    lower.includes('must include')
  )
    return 'error';
  if (
    lower.includes('warning') ||
    lower.includes('consider') ||
    lower.includes('recommend') ||
    lower.includes('should') ||
    lower.includes('placeholder')
  )
    return 'warning';
  return 'pass';
}

const SEVERITY_CONFIG = {
  error: {
    icon: XCircle,
    dot: 'bg-destructive',
    text: 'text-destructive',
    bg: 'bg-destructive/5',
    border: 'border-destructive/20',
    label: 'Issue',
  },
  warning: {
    icon: AlertTriangle,
    dot: 'bg-amber-500',
    text: 'text-amber-600 dark:text-amber-400',
    bg: 'bg-amber-50 dark:bg-amber-950/20',
    border: 'border-amber-200 dark:border-amber-800',
    label: 'Review',
  },
  pass: {
    icon: ShieldCheck,
    dot: 'bg-primary',
    text: 'text-primary',
    bg: 'bg-primary/5',
    border: 'border-primary/20',
    label: 'OK',
  },
  none: {
    icon: ShieldCheck,
    dot: 'bg-border',
    text: 'text-muted-foreground',
    bg: 'bg-muted/30',
    border: 'border-border',
    label: '—',
  },
};

/**
 * @param {Object} props
 * @param {Array}  props.outline – [{ id, label }]
 * @param {Object} props.validationHints – { [outlineId]: string }
 * @param {Object} props.loadingValidation – { [outlineId]: boolean }
 * @param {boolean} props.visible
 * @param {Function} props.onToggle – () => void
 * @param {Function} props.onRefreshSection – (sectionId) => void
 * @param {string} [props.className]
 */
export default function CERV2ValidationPanel({
  outline = [],
  validationHints = {},
  loadingValidation = {},
  visible = true,
  onToggle,
  onRefreshSection,
  className = '',
}) {
  // Summary counts
  const counts = outline.reduce(
    (acc, s) => {
      if (loadingValidation[s.id]) {
        acc.loading++;
      } else if (validationHints[s.id]) {
        const sev = classifyHint(validationHints[s.id]);
        acc[sev] = (acc[sev] || 0) + 1;
        acc.validated++;
      }
      return acc;
    },
    { error: 0, warning: 0, pass: 0, loading: 0, validated: 0 }
  );

  const handleRefresh = useCallback(
    sectionId => {
      if (onRefreshSection) onRefreshSection(sectionId);
    },
    [onRefreshSection]
  );

  // Toggle button (always visible)
  if (!visible) {
    return (
      <button
        onClick={onToggle}
        className="flex items-center justify-center w-8 border-l bg-muted/20 hover:bg-muted/40 transition-colors"
        title="Show compliance panel"
      >
        <PanelRightOpen className="h-4 w-4 text-muted-foreground" />
      </button>
    );
  }

  return (
    <aside className={`w-64 border-l flex-shrink-0 flex flex-col bg-background ${className}`}>
      {/* Header */}
      <div className="px-3 py-1.5 border-b flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <ShieldCheck className="h-3.5 w-3.5 text-primary" />
          <h3 className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
            Compliance
          </h3>
        </div>
        <div className="flex items-center gap-1.5">
          {/* Summary badges */}
          {counts.error > 0 && (
            <span className="text-[10px] tabular-nums px-1 py-0.5 rounded bg-destructive/10 text-destructive font-medium">
              {counts.error}
            </span>
          )}
          {counts.warning > 0 && (
            <span className="text-[10px] tabular-nums px-1 py-0.5 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 font-medium">
              {counts.warning}
            </span>
          )}
          {counts.pass > 0 && (
            <span className="text-[10px] tabular-nums px-1 py-0.5 rounded bg-primary/10 text-primary font-medium">
              {counts.pass}
            </span>
          )}
          <button
            onClick={onToggle}
            className="p-0.5 text-muted-foreground/60 hover:text-foreground rounded"
            title="Hide compliance panel"
          >
            <PanelRightClose className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Section list */}
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          {outline.map(section => {
            const hint = validationHints[section.id];
            const isLoading = loadingValidation[section.id];
            const severity = isLoading ? 'none' : classifyHint(hint);
            const config = SEVERITY_CONFIG[severity];
            const Icon = config.icon;

            return (
              <div
                key={section.id}
                className={`rounded border px-2.5 py-2 text-xs transition-colors ${config.bg} ${config.border}`}
              >
                {/* Section header row */}
                <div className="flex items-center gap-1.5 mb-0.5">
                  {isLoading ? (
                    <Loader2 className="h-3 w-3 animate-spin text-muted-foreground flex-shrink-0" />
                  ) : (
                    <Icon className={`h-3 w-3 flex-shrink-0 ${config.text}`} />
                  )}
                  <span className="font-medium text-foreground truncate flex-1">
                    {section.label}
                  </span>
                  <button
                    onClick={() => handleRefresh(section.id)}
                    disabled={isLoading}
                    className="p-0.5 text-muted-foreground/50 hover:text-foreground rounded disabled:opacity-30"
                    title="Re-validate"
                  >
                    <RefreshCw className={`h-2.5 w-2.5 ${isLoading ? 'animate-spin' : ''}`} />
                  </button>
                </div>

                {/* Hint text */}
                {isLoading ? (
                  <p className="text-muted-foreground leading-relaxed">Validating…</p>
                ) : hint ? (
                  <p className="text-muted-foreground leading-relaxed line-clamp-3">{hint}</p>
                ) : (
                  <p className="text-muted-foreground/50 leading-relaxed italic">
                    Edit section to trigger validation
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </ScrollArea>

      {/* Footer summary */}
      <div className="px-3 py-1.5 border-t text-[11px] text-muted-foreground flex items-center justify-between">
        <span>
          {counts.validated}/{outline.length} validated
        </span>
        {counts.loading > 0 && (
          <span className="flex items-center gap-1">
            <Loader2 className="h-2.5 w-2.5 animate-spin" />
            {counts.loading} checking
          </span>
        )}
      </div>
    </aside>
  );
}
