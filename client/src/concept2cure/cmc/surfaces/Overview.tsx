// CMC Module 3 overview — live portfolio RPI cards + Module 3 build-state
// readiness for the selected project. Every value is bound to a live endpoint;
// blocks with no endpoint are omitted rather than faked.

import * as React from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { CmcIcon } from '../icons';
import {
  usePortfolioOverview,
  useModule3Readiness,
  useModule3Sections,
  useApproveModule3Section,
  useICHComplianceCheck,
  useContradictions,
  useCompileModule3,
  useDetectContradictions,
  useResolveContradiction,
  cmcQueryKeys,
} from '../../hooks/useCMC';
import type { CmcPortfolioRow, CmcModule3Section } from '../../services/cmcService';
import { EsignModal, type EsigSignedManifest } from '../../_shared/components';
import { CMC_SUGGESTIONS } from '../data/nav';
import { Loading, ErrorState, Empty, NoProject, StatusChip } from './state';

function KpiCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="bp-kpi">
      <div className="bp-kpi-lbl">{label}</div>
      <div className="bp-kpi-val">{value}</div>
      {sub && <div className="bp-kpi-sub">{sub}</div>}
    </div>
  );
}

function sectionTone(state: string): 'ok' | 'warn' | 'err' | 'dim' {
  const v = state.toLowerCase();
  if (v.includes('approv')) return 'ok';
  if (v.includes('review')) return 'warn';
  return 'dim';
}

/**
 * Module 3 section approvals — a genuinely governed mutation. Each unapproved
 * section can be approved through the shared 21 CFR Part 11 e-signature modal
 * (meaning = approval, reason required, re-authentication). On a signed
 * approval the section map and readiness re-fetch.
 */
function SectionApprovals({ projectId }: { projectId: string }) {
  const sections = useModule3Sections(projectId);
  const approve = useApproveModule3Section();
  const queryClient = useQueryClient();
  const rows = sections.data ?? [];

  const [signing, setSigning] = React.useState<CmcModule3Section | null>(null);

  const onSign = React.useCallback(
    async ({ reason }: { reason: string }): Promise<EsigSignedManifest> => {
      if (!signing) throw new Error('No section selected for approval.');
      await approve.mutateAsync({ projectId, sectionKey: signing.sectionKey });
      await queryClient.invalidateQueries({ queryKey: cmcQueryKeys.module3Readiness(projectId) });
      return { meaning: 'approval', reason, signedAt: new Date().toISOString() };
    },
    [signing, approve, projectId, queryClient],
  );

  return (
    <div className="bp-card" style={{ marginTop: 14 }}>
      <div className="bp-card-head">
        <span>Section approvals</span>
        <span className="bp-meta">{rows.length} sections</span>
      </div>
      {sections.isLoading ? (
        <Loading label="Loading sections…" />
      ) : sections.isError ? (
        <ErrorState message="Could not load Module 3 sections." />
      ) : rows.length === 0 ? (
        <Empty>No Module 3 sections built yet for this project.</Empty>
      ) : (
        <table className="bp-table">
          <thead>
            <tr>
              <th>Section</th>
              <th>Path</th>
              <th>State</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => {
              const approved = s.approvalState.toLowerCase().includes('approv');
              return (
                <tr key={s.sectionKey}>
                  <td className="cmc-mono" style={{ fontWeight: 600 }}>{s.sectionKey}</td>
                  <td>{s.sectionPath ?? '—'}</td>
                  <td><StatusChip tone={sectionTone(s.approvalState)} label={s.approvalState} /></td>
                  <td>
                    {approved ? (
                      <span className="bp-meta">Approved</span>
                    ) : (
                      <button className="bp-btn-tert" type="button" onClick={() => setSigning(s)}>
                        <CmcIcon name="shield" size={14} /> Approve section
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      <EsignModal
        open={!!signing}
        action="Approve section"
        target={signing ? `Section ${signing.sectionKey}` : ''}
        targetMeta="Signs the section approval per 21 CFR Part 11 and locks the approved version"
        defaultMeaning="approval"
        onClose={() => setSigning(null)}
        onSign={onSign}
      />
    </div>
  );
}

interface OverviewProps {
  projectId: string | null;
  portfolioRows: CmcPortfolioRow[];
  onAskAna: (text: string) => void;
}

// Map an ICH status string to a StatusChip tone.
function ichTone(status: unknown): 'ok' | 'warn' | 'err' {
  const s = String(status ?? '').toLowerCase();
  if (/fail|critical|non-?compliant|gap|block|missing/.test(s)) return 'err';
  if (/pass|compliant|met|ready|ok/.test(s) && !/non/.test(s)) return 'ok';
  return 'warn';
}

export function CmcOverview({ projectId, portfolioRows, onAskAna }: OverviewProps) {
  const portfolio = usePortfolioOverview();
  const readiness = useModule3Readiness(projectId);
  const ichCheck = useICHComplianceCheck();

  const rows = portfolio.data ?? portfolioRows;
  const avgRpi = rows.length
    ? Math.round(rows.reduce((a, r) => a + (r.rpi ?? 0), 0) / rows.length)
    : 0;
  const irOverdue = rows.reduce((a, r) => a + (r.ir_overdue ?? 0), 0);
  const m3Missing = rows.reduce((a, r) => a + (r.m3_missing ?? 0), 0);

  const suggestions = CMC_SUGGESTIONS.overview;
  const r = readiness.data;
  const readyPct = r && r.totalSections > 0
    ? Math.round((r.approvedSections / r.totalSections) * 100)
    : 0;
  const readyTone = readyPct >= 80 ? 'ok' : readyPct >= 50 ? 'warn' : 'err';

  return (
    <div className="bp-surface">
      <div className="bp-page-head">
        <div>
          <div className="bp-kicker">CMC · Module 3 operating system</div>
          <h1 className="bp-title">Module 3 overview</h1>
          <div className="bp-meta">{rows.length} submissions · RPI {avgRpi} average</div>
        </div>
        <div className="bp-page-actions">
          <button
            className="bp-btn-tert"
            type="button"
            disabled={!projectId || ichCheck.isPending}
            onClick={() => projectId && ichCheck.mutate(projectId)}
            title="Run the deterministic ICH rule check for this project"
          >
            {ichCheck.isPending ? 'Running ICH check…' : 'Run ICH check'}
          </button>
          <button className="bp-btn-primary" type="button"
                  onClick={() => onAskAna('Run the ICH compliance check and show every gap')}>
            <CmcIcon name="sparkles" /> Ask AnA
          </button>
        </div>
      </div>

      <div className="bp-od-starters">
        {suggestions.map((s, i) => (
          <button key={i} className="bp-od-starter" type="button" onClick={() => onAskAna(s)}>
            <span className="bp-od-starter-ico"><CmcIcon name="sparkles" /></span>
            {s}
          </button>
        ))}
      </div>

      {/* Portfolio RPI cards */}
      <div className="bp-kpi-row">
        <KpiCard label="Submissions" value={rows.length} sub="across the portfolio" />
        <KpiCard label="RPI average" value={avgRpi} sub="regulatory preparedness index" />
        <KpiCard label="IR overdue" value={irOverdue} sub="information requests" />
        <KpiCard label="Module 3 gaps" value={m3Missing} sub="sections missing" />
      </div>

      {/* Portfolio table */}
      <div className="bp-card">
        <div className="bp-card-head">
          <span>Portfolio</span>
          <span className="bp-meta">{rows.length} submissions</span>
        </div>
        {portfolio.isLoading ? (
          <Loading label="Loading portfolio…" />
        ) : portfolio.isError ? (
          <ErrorState message="Could not load the portfolio overview." />
        ) : rows.length === 0 ? (
          <Empty>No submissions found for your organization.</Empty>
        ) : (
          <table className="bp-table">
            <thead>
              <tr>
                <th>Submission</th>
                <th>Product</th>
                <th>Region</th>
                <th>Type</th>
                <th>RPI</th>
                <th>IR overdue</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(row => (
                <tr key={row.sub_id}>
                  <td style={{ fontWeight: 600 }}>{row.sub_id}</td>
                  <td>{row.product_id ?? '—'}</td>
                  <td>{row.region ?? '—'}</td>
                  <td><span className="bp-pill">{row.app_type ?? '—'}</span></td>
                  <td style={{ fontVariantNumeric: 'tabular-nums' }}>{row.rpi}</td>
                  <td>{row.ir_overdue ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Module 3 build-state readiness for the selected project */}
      <div className="bp-card" style={{ marginTop: 14 }}>
        <div className="bp-card-head">
          <span>Module 3 build state</span>
          <span className="bp-meta">§3.2.S drug substance · §3.2.P drug product</span>
        </div>
        {!projectId ? (
          <NoProject />
        ) : readiness.isLoading ? (
          <Loading label="Computing readiness…" />
        ) : readiness.isError ? (
          <ErrorState message="Could not compute Module 3 readiness." />
        ) : !r || r.totalSections === 0 ? (
          <Empty>No Module 3 sections built yet for this project.</Empty>
        ) : (
          <div style={{ padding: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
              <div className="cmc-prog-bar" style={{ flex: 1 }}>
                <div className="cmc-prog-fill" data-tone={readyTone} style={{ width: `${readyPct}%` }} />
              </div>
              <span className="cmc-sec-conv">{readyPct}%</span>
              {r.exportReady
                ? <StatusChip tone="ok" label="Export ready" />
                : <StatusChip tone="warn" label="Not export ready" />}
            </div>
            <div className="bp-meta">
              {r.approvedSections} of {r.totalSections} sections approved
              {r.staleSections > 0 ? ` · ${r.staleSections} stale` : ''}
              {r.openCriticalContradictions > 0
                ? ` · ${r.openCriticalContradictions} open critical contradictions`
                : ''}
            </div>
          </div>
        )}
      </div>

      {/* ICH compliance — real deterministic rule check (POST /api/cmc/ich-compliance) */}
      {projectId && (
        <div className="bp-card" style={{ marginTop: 14 }}>
          <div className="bp-card-head">
            <span>ICH compliance</span>
            <span className="bp-meta">Rule check across specs · stability · impurities · batches</span>
          </div>
          {ichCheck.isPending ? (
            <Loading label="Running ICH compliance check…" />
          ) : ichCheck.isError ? (
            <ErrorState message="Could not run the ICH compliance check." />
          ) : !ichCheck.data ? (
            <div style={{ padding: 12 }}>
              <div className="bp-meta" style={{ marginBottom: 10 }}>
                Run a deterministic ICH Q1/Q2/Q3/Q6/Q8–Q11 rule check for this project and see
                every finding with its guideline reference.
              </div>
              <button
                className="bp-btn-tert"
                type="button"
                onClick={() => ichCheck.mutate(projectId)}
              >
                Run ICH compliance check
              </button>
            </div>
          ) : (
            <div style={{ padding: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                {ichCheck.data.overallStatus != null && (
                  <StatusChip
                    tone={ichTone(ichCheck.data.overallStatus)}
                    label={String(ichCheck.data.overallStatus)}
                  />
                )}
                {typeof ichCheck.data.score === 'number' && (
                  <span className="cmc-sec-conv" style={{ fontVariantNumeric: 'tabular-nums' }}>
                    Score {ichCheck.data.score}
                  </span>
                )}
              </div>
              {(ichCheck.data.guidelines ?? []).length === 0 ? (
                <Empty>No guideline findings returned.</Empty>
              ) : (
                <div style={{ display: 'grid', gap: 10 }}>
                  {(ichCheck.data.guidelines ?? []).map((g, i) => (
                    <div key={i} style={{ borderTop: '1px solid var(--cmc-border, #e5e7eb)', paddingTop: 8 }}>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
                        <strong>{g.guideline}</strong>
                        <StatusChip tone={ichTone(g.status)} label={String(g.status)} />
                      </div>
                      {(g.findings ?? []).map((f, j) => (
                        <div key={j} className="bp-meta" style={{ marginBottom: 2 }}>
                          • {f.description}
                          {f.reference ? ` (${f.reference})` : ''}
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Governed section approvals for the selected project */}
      {projectId && <SectionApprovals projectId={projectId} />}

      {/* Module 3 build & contradictions — the compile action + the drill-in the
          readiness rollup only ever counted */}
      {projectId && <Module3Console projectId={projectId} />}
    </div>
  );
}

function Module3Console({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const contradictions = useContradictions(projectId);
  const compile = useCompileModule3();
  const detect = useDetectContradictions();
  const resolve = useResolveContradiction();
  const [resolving, setResolving] = React.useState<{ id: string; note: string } | null>(null);

  const refetchAll = React.useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: cmcQueryKeys.module3Readiness(projectId) });
    void contradictions.refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryClient, projectId]);

  const onCompile = async () => {
    try {
      await compile.mutateAsync(projectId);
      refetchAll();
    } catch {
      /* surfaced via compile.isError */
    }
  };
  const onDetect = async () => {
    try {
      await detect.mutateAsync(projectId);
      refetchAll();
    } catch {
      /* surfaced via detect.isError */
    }
  };
  const onResolve = async () => {
    if (!resolving || !resolving.note.trim()) return;
    try {
      await resolve.mutateAsync({ id: resolving.id, resolutionNote: resolving.note.trim() });
      setResolving(null);
      refetchAll();
    } catch {
      /* surfaced via resolve.isError */
    }
  };

  const rows = contradictions.data ?? [];
  const open = rows.filter((r) => r.status !== 'resolved');

  return (
    <div className="bp-card" style={{ marginTop: 14 }}>
      <div className="bp-card-head">
        <span>Module 3 build &amp; contradictions</span>
        <span className="bp-meta">{open.length} open · {rows.length} total</span>
      </div>
      <div style={{ padding: 12 }}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
          <button className="bp-btn-tert" type="button" disabled={compile.isPending} onClick={onCompile}>
            {compile.isPending ? 'Compiling…' : 'Compile Module 3'}
          </button>
          <button className="bp-btn-tert" type="button" disabled={detect.isPending} onClick={onDetect}>
            {detect.isPending ? 'Detecting…' : 'Detect contradictions'}
          </button>
        </div>
        {compile.isError && (
          <div style={{ marginBottom: 10 }}>
            <ErrorState message={compile.error?.message ?? 'Compile failed.'} />
          </div>
        )}
        {detect.isError && (
          <div style={{ marginBottom: 10 }}>
            <ErrorState message={detect.error?.message ?? 'Detection failed.'} />
          </div>
        )}

        {contradictions.isLoading ? (
          <Loading label="Loading contradictions…" />
        ) : contradictions.isError ? (
          <ErrorState message="Could not load contradictions." />
        ) : rows.length === 0 ? (
          <Empty>No contradictions recorded. Compile, then detect to check.</Empty>
        ) : (
          <div style={{ display: 'grid', gap: 10 }}>
            {rows.map((c) => (
              <div key={c.id} style={{ borderTop: '1px solid var(--cmc-border, #e5e7eb)', paddingTop: 8 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4, flexWrap: 'wrap' }}>
                  <StatusChip
                    tone={c.status === 'resolved' ? 'ok' : /critical|high/i.test(c.severity) ? 'err' : 'warn'}
                    label={c.status === 'resolved' ? 'resolved' : c.severity}
                  />
                  <strong>{c.contradictionType}</strong>
                  {(c.impactedSections ?? []).map((s, i) => (
                    <span key={i} className="bp-pill">{s}</span>
                  ))}
                </div>
                <div className="bp-meta" style={{ marginBottom: 6 }}>
                  {typeof c.details === 'string' ? c.details : JSON.stringify(c.details)}
                </div>
                {c.status !== 'resolved' &&
                  (resolving?.id === c.id ? (
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <input
                        style={{ flex: 1, fontSize: 12, padding: '4px 8px' }}
                        placeholder="Resolution note (required)"
                        value={resolving.note}
                        onChange={(e) => setResolving({ id: c.id, note: e.target.value })}
                      />
                      <button
                        className="bp-btn-tert"
                        type="button"
                        disabled={!resolving.note.trim() || resolve.isPending}
                        onClick={onResolve}
                      >
                        {resolve.isPending ? 'Resolving…' : 'Confirm'}
                      </button>
                      <button className="bp-btn-tert" type="button" onClick={() => setResolving(null)}>
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      className="bp-btn-tert"
                      type="button"
                      onClick={() => setResolving({ id: c.id, note: '' })}
                    >
                      Resolve…
                    </button>
                  ))}
                {resolve.isError && resolving?.id === c.id && (
                  <div style={{ marginTop: 6 }}>
                    <ErrorState message={resolve.error?.message ?? 'Resolve failed.'} />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
