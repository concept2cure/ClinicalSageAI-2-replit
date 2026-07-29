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

export function CmcOverview({ projectId, portfolioRows, onAskAna }: OverviewProps) {
  const portfolio = usePortfolioOverview();
  const readiness = useModule3Readiness(projectId);

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

      {/* Governed section approvals for the selected project */}
      {projectId && <SectionApprovals projectId={projectId} />}
    </div>
  );
}
