/**
 * InsightsSurface — the top-level, scope-aware, chat-first Insights screen.
 *
 * Composes the scope switcher, the report catalog (dashboard mode), and the
 * rendered report view (report mode). All data is live, pulled through the
 * Insights hooks — no fixtures. The surface owns selection state (active scope
 * and the run being viewed) and the generate mutation; the children stay
 * presentational.
 *
 * Empty, loading, and error states are honest: each names what will appear or
 * what failed, never "Nothing here yet". The "Ask AnA about this report"
 * affordance hands a scoped prompt up to the optional `onAsk` prop; it is not
 * wired to a backend here.
 *
 * Voice + color follow the design system: sentence case, numbers over
 * adjectives, calm earthy tones.
 *
 * @module client/src/concept2cure/insights/surface/InsightsSurface
 */

import * as React from 'react';
import { Button } from '@/components/ui/button';
import {
  useGenerateReport,
  useRenderedReport,
  useReportRuns,
  useReportTypes,
} from '../hooks/useInsights';
import type { ReportRunSummary, ReportScope } from '../data/types';
import { ReportCatalog } from './ReportCatalog';
import { ReportView } from './ReportView';
import { ScopeSwitcher, type ScopeValue } from './ScopeSwitcher';

export interface InsightsSurfaceProps {
  /**
   * Organization the runs belong to. Required by `POST /runs` and the runs
   * filter; the server still binds the org from the JWT, this scopes the cache
   * and the request body. Falls back to the persisted org id when absent.
   */
  organizationId?: number;
  /** The initial scope; defaults to the account scope. */
  initialScope?: ScopeValue;
  /**
   * Optional hand-off to the AnA assistant. Receives a scoped prompt string when
   * the user asks about the active report. Not wired to a backend here.
   */
  onAsk?: (prompt: string) => void;
}

/** Read the persisted org id used elsewhere in the client as a fallback. */
function readPersistedOrgId(): number | undefined {
  if (typeof window === 'undefined') return undefined;
  const raw =
    window.sessionStorage.getItem('trialsage_org_id') ||
    window.localStorage.getItem('trialsage_org_id');
  if (!raw) return undefined;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function runLabel(run: ReportRunSummary): string {
  const confidence =
    run.confidence !== null && run.confidence !== undefined
      ? `confidence ${(run.confidence * 100).toFixed(0)}%`
      : 'confidence not yet computed';
  return `${run.reportTypeId} · ${run.status} · ${confidence}`;
}

export function InsightsSurface({
  organizationId,
  initialScope,
  onAsk,
}: InsightsSurfaceProps): React.ReactElement {
  const orgId = organizationId ?? readPersistedOrgId();

  const [scope, setScope] = React.useState<ScopeValue>(
    initialScope ?? { scopeType: 'account', scopeId: '' },
  );
  const [selectedRunId, setSelectedRunId] = React.useState<string | null>(null);

  const typesQuery = useReportTypes();
  const runsQuery = useReportRuns({
    organizationId: orgId ?? 0,
    scopeType: scope.scopeType,
    scopeId: scope.scopeId || undefined,
  });
  const renderedQuery = useRenderedReport(selectedRunId);
  const generate = useGenerateReport();

  // Generating a report selects its run so the view follows the new document.
  const handleGenerate = React.useCallback(
    (typeId: string) => {
      if (orgId === undefined) return;
      generate.mutate(
        {
          organizationId: orgId,
          scopeType: scope.scopeType,
          scopeId: scope.scopeId,
          reportTypeId: typeId,
        },
        {
          onSuccess: (result) => {
            if (result.run?.id) setSelectedRunId(String(result.run.id));
          },
        },
      );
    },
    [generate, orgId, scope.scopeId, scope.scopeType],
  );

  const handleScopeChange = React.useCallback((next: ScopeValue) => {
    setScope(next);
    setSelectedRunId(null);
  }, []);

  const report = renderedQuery.data;
  const askPrompt = report
    ? `Explain the ${report.reportTypeId} report for ${report.scopeType} ${report.scopeId}`
    : `Explain the latest insights for ${scope.scopeType}${scope.scopeId ? ` ${scope.scopeId}` : ''}`;

  return (
    <>
      <h1 className="in-h1">Insights</h1>
      <p className="in-sub">
        Scope-aware regulatory reporting over the Report-OS render model. Pick a
        scope, generate a report type, and read the rendered document. Read-only —
        drives decisions, not edits.
      </p>

      <div className="in-card" style={{ marginBottom: 16 }}>
        <h3>Scope</h3>
        <ScopeSwitcher
          value={scope}
          onChange={handleScopeChange}
          disabled={generate.isPending}
        />
        {orgId === undefined ? (
          <p className="in-sub" style={{ marginTop: 12, marginBottom: 0 }}>
            No organization is selected. Sign in to an organization to generate and
            list reports.
          </p>
        ) : null}
      </div>

      <div className="in-split">
        <div>
          {typesQuery.isLoading ? (
            <div className="in-card">
              <h3>Report catalog</h3>
              <p className="in-sub" style={{ margin: 0 }}>
                Loading the report types enabled for your organization.
              </p>
            </div>
          ) : typesQuery.isError ? (
            <div className="in-card">
              <h3>Report catalog</h3>
              <p className="in-sub" style={{ margin: 0 }}>
                The report taxonomy could not be loaded. Check your connection and
                retry; the catalog of report types will appear here.
              </p>
            </div>
          ) : (
            <ReportCatalog
              scope={scope.scopeType as ReportScope}
              types={typesQuery.data ?? []}
              onGenerate={handleGenerate}
              generating={generate.isPending || orgId === undefined}
            />
          )}

          {generate.isError ? (
            <p
              role="alert"
              className="in-sub"
              style={{ marginTop: 8, color: '#c84a4a' }}
            >
              The report could not be generated. {generate.error.message}
            </p>
          ) : null}
        </div>

        <div className="in-card">
          <h3>Recent runs</h3>
          {!scope.scopeId ? (
            <p className="in-sub" style={{ margin: 0 }}>
              Enter a scope identifier to list the runs generated for it.
            </p>
          ) : runsQuery.isLoading ? (
            <p className="in-sub" style={{ margin: 0 }}>
              Loading runs for {scope.scopeType} {scope.scopeId}.
            </p>
          ) : runsQuery.isError ? (
            <p className="in-sub" style={{ margin: 0 }}>
              Runs for this scope could not be loaded. Retry to see the report runs
              generated for {scope.scopeType} {scope.scopeId}.
            </p>
          ) : (runsQuery.data ?? []).length === 0 ? (
            <p className="in-sub" style={{ margin: 0 }}>
              No runs have been generated for {scope.scopeType} {scope.scopeId}.
              Generate a report from the catalog to see it here.
            </p>
          ) : (
            (runsQuery.data ?? []).map((run) => (
              <div
                key={run.id}
                className="row"
                style={{ gridTemplateColumns: 'minmax(0,1fr) auto', alignItems: 'center' }}
              >
                <div className="k">
                  <div>{run.reportTypeId}</div>
                  <div className="sub">{runLabel(run)}</div>
                </div>
                <div className="v">
                  <Button
                    type="button"
                    size="sm"
                    variant={selectedRunId === run.id ? 'default' : 'outline'}
                    onClick={() => setSelectedRunId(run.id)}
                  >
                    {selectedRunId === run.id ? 'Viewing' : 'View'}
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="in-sec">
        {selectedRunId === null ? (
          <p className="in-sub" style={{ margin: 0 }}>
            Select a run or generate a report to read its rendered document here.
          </p>
        ) : renderedQuery.isLoading ? (
          <p className="in-sub" style={{ margin: 0 }}>
            Rendering the report document for the selected run.
          </p>
        ) : renderedQuery.isError ? (
          <p role="alert" className="in-sub" style={{ margin: 0 }}>
            The rendered report could not be loaded. {renderedQuery.error.message}
          </p>
        ) : report ? (
          <>
            <div className="in-sec-head" style={{ marginBottom: 12 }}>
              <span className="spacer" />
              {onAsk ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => onAsk(askPrompt)}
                >
                  Ask AnA about this report
                </Button>
              ) : null}
            </div>
            <ReportView report={report} runId={selectedRunId} />
          </>
        ) : (
          <p className="in-sub" style={{ margin: 0 }}>
            The selected run has no rendered document yet.
          </p>
        )}
      </div>
    </>
  );
}
