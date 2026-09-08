/**
 * PmsPmcfTab — Article 83 PMS + Annex XIV Part B PMCF, backed by the real
 * /api/post-market backend:
 *
 *   · Documentation status — the server's honest per-type report (required
 *     vs present vs approved, validation-gate result, MDR/IVDR citation).
 *   · Draft generation — POST …/documents/:type/generate authors a DRAFT
 *     server-side from the device profile; it never approves or asserts
 *     sufficiency, and the button says what it produces.
 *
 *   · Complaint queue and PMCF enrolment — the program's own rows from
 *     /api/capa-mdr/complaints and …/pmcf-enrollment (useCerPmsFeeds). Every
 *     figure is computed from those rows or taken from the server's summary
 *     over them; a figure the rows cannot support is shown as absent.
 *
 * The kit's KPI / complaints / study / calendar fixtures render ONLY under the
 * explicit sample-mode guard, clearly bannered. The reporting calendar has no
 * backend and is therefore sample-only.
 */

import * as React from 'react';
import { I } from '../../icons';
import {
  CER_PMS_COMPLAINTS,
  CER_PMS_KPIS,
  CER_PMCF_STUDIES,
  CER_PMS_TIMELINE,
} from '../../data/cer';
import type { DeviceProfileView } from '../../hooks/useDeviceProfile';
import {
  POST_MARKET_DOC_LABELS,
  useCerPostMarketStatus,
  useGeneratePostMarketDraft,
  type PostMarketDocType,
} from '../../hooks/useCerPostMarket';
import { SampleDataBanner } from '../../components/SampleDataBanner';
import { EmptyState, ErrorState } from '../../../v2/dataConnect';
import { redactInternals } from '@/lib/queryClient';
import { useSampleMode } from '../../components/DataGate';
import {
  isOpenComplaint,
  isSeriousComplaint,
  useCerComplaints,
  useCerPmcfEnrollment,
  type CerComplaint,
  type CerPmcfActivity,
  type CerPmcfSummary,
  type ComplaintFigures,
} from '../../hooks/useCerPmsFeeds';

export interface PmsPmcfTabProps {
  programId: string | null;
  profile: DeviceProfileView | null;
  onAskAna: (text: string) => void;
}

const LIFECYCLE_PILL: Record<string, string> = {
  missing: 'empty',
  draft: 'draft',
  under_review: 'review',
  approved: 'complete',
  superseded: 'na',
  withdrawn: 'na',
};

export function PmsPmcfTab({ programId, profile, onAskAna }: PmsPmcfTabProps) {
  const sampleOn = useSampleMode();
  const deviceClass = profile?.deviceClass ?? null;
  const { report, loading, error, refresh } = useCerPostMarketStatus(programId, deviceClass);
  const { busy, outcome, generate } = useGeneratePostMarketDraft(refresh);

  const deviceName = (profile?.productName ?? profile?.name ?? '').trim();

  const summary = !programId
    ? 'Post-market documentation is held per program'
    : loading
      ? 'Loading post-market documentation status…'
      : error
        /* `error` is `useFetchJson`'s `HTTP ${status}: ${body.slice(0,200)}` —
           transport jargon plus up to 200 characters of unparsed response body.
           The panel below reports the failure properly; this one-line subtitle
           states it without carrying the payload. */
        ? 'Post-market documentation status is unavailable'
        : report
          ? `${report.requiredPresent} of ${report.requiredTotal} required documents present · ` +
            `${report.requiredApprovedCount} approved · ${report.regulation}` +
            (report.deviceClass ? ` · class ${report.deviceClass}` : ' · device class not set')
          : 'No status yet';

  const generateStatus = busy
    ? `Authoring a draft ${POST_MARKET_DOC_LABELS[busy]}…`
    : outcome
      ? outcome.ok
        ? `Draft ${outcome.draft?.document?.documentType?.replace(/_/g, ' ') ?? 'document'} created in draft status — specialise and approve it before use`
        /* `outcome.error` is whatever the write path produced, and this line is
           rendered. Through the shared filter first — a failed governed write
           reports its reason, not its plumbing. */
        : `Draft not created — ${redactInternals(outcome.error, 'the server did not accept it')}`
      : null;

  return (
    <>
      <div className="section-hdr">
        <div>
          <div className="section-title">Post-market surveillance · PMS and PMCF</div>
          <div className="section-sub" role="status" aria-live="polite">{summary}</div>
        </div>
        <button
          className="section-more"
          onClick={() =>
            onAskAna(
              'Review the post-market documentation set for this program — which required documents ' +
                'are missing or unapproved, and what should the next PSUR draw on?',
            )
          }
        >
          Review with AnA {I.sparkles}
        </button>
      </div>

      {report && (
        <div className="panel">
          <div className="panel-hdr">
            <div>
              <div className="t">Documentation status</div>
              <div className="s">
                Factual presence and gate results per document type — not a readiness score
              </div>
            </div>
          </div>
          <div className="tbl-scroll">
            <table className="tbl">
              <thead>
                <tr>
                  <th style={{ width: '18%' }}>Document</th>
                  <th style={{ width: '12%' }}>Required</th>
                  <th style={{ width: '14%' }}>Status</th>
                  <th style={{ width: '14%' }}>Validation gate</th>
                  <th style={{ width: '24%' }}>Citation</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {report.documents.map((d) => (
                  <tr key={d.documentType}>
                    <td>
                      <div className="k-name" style={{ fontWeight: 500, fontSize: 12 }}>
                        {POST_MARKET_DOC_LABELS[d.documentType]}
                      </div>
                      {d.present && (
                        <div className="k-holder">v{d.latestVersion ?? 1}</div>
                      )}
                    </td>
                    <td style={{ fontSize: 11, color: 'var(--text-300)' }}>
                      {d.required ? 'required' : 'optional'}
                    </td>
                    <td>
                      <span className={`status-pill ${LIFECYCLE_PILL[d.status] ?? 'draft'}`}>
                        {d.status.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td style={{ fontSize: 11, color: 'var(--text-300)' }}>
                      {!d.present
                        ? '—'
                        : d.gatePasses
                          ? 'passes'
                          : `${d.criticalFindings ?? 0} critical finding${(d.criticalFindings ?? 0) === 1 ? '' : 's'}`}
                    </td>
                    <td style={{ fontSize: 11, color: 'var(--text-300)' }}>{d.citation}</td>
                    <td>
                      {!d.present && programId && (
                        <button
                          className="section-more"
                          disabled={busy !== null || !deviceName}
                          title={
                            deviceName
                              ? `Author a draft ${POST_MARKET_DOC_LABELS[d.documentType]} from the device profile — it stays in draft until you approve it`
                              : 'Set the product name on the device profile first'
                          }
                          onClick={() =>
                            void generate({
                              programId,
                              documentType: d.documentType as PostMarketDocType,
                              deviceName,
                              deviceClass,
                            })
                          }
                        >
                          {busy === d.documentType ? 'Drafting…' : 'Author draft'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {generateStatus && (
            <div
              role="status"
              aria-live="polite"
              style={{ padding: '8px 16px 12px', fontSize: 11, color: 'var(--text-300)' }}
            >
              {generateStatus}
            </div>
          )}
        </div>
      )}

      {/* A FAILURE AND AN EMPTY RESULT ARE NOT THE SAME PANEL, and this drew one
          for both — announced as `role="status"`, which is polite, so a screen
          reader was told nothing had gone wrong. It also interpolated `error`
          verbatim and offered no retry, on a hook that has exposed `refresh`
          all along. */}
      {!report && !loading && programId && (
        <div className="panel">
          {error ? (
            <ErrorState
              variant="panel"
              title="Couldn't load the post-market documentation status"
              retry={refresh}
              /* No `regulation` here: <ErrorState> deliberately has no such
                 slot. A failure is not an empty state — the one action on it is
                 recovery, and naming the record a screen cannot show is
                 explanation the user did not ask for. That is upstream's W0-5
                 call and it is right. */
              testId="pms-status-error"
            />
          ) : (
            <EmptyState
              icon={I.folder}
              title="No post-market documentation status yet"
              hint="The status is computed once post-market documents exist for this program."
              action={{ label: 'Check again', onAct: refresh }}
              regulation="Serves the post-market surveillance record"
              testId="pms-status-empty"
            />
          )}
        </div>
      )}

      <SampleDataBanner show={sampleOn} label="PMS metrics and complaint queue" />
      {sampleOn ? <SamplePmsPanels /> : <LivePmsPanels programId={programId} />}
    </>
  );
}

/* ─── Live feeds ─────────────────────────────────────────────────────────── */

const COMPLAINT_STATE_PILL: Record<CerComplaint['triageState'], string> = {
  new: 'review',
  triaged: 'review',
  investigation: 'review',
  escalated_capa: 'review',
  escalated_mdr: 'review',
  resolved: 'complete',
  closed: 'complete',
};

const PMCF_STATUS_PILL: Record<CerPmcfActivity['status'], string> = {
  planned: 'draft',
  enrolling: 'review',
  follow_up: 'review',
  completed: 'complete',
  terminated: 'na',
};

const shortDate = (iso: string | null): string =>
  iso ? new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' }) : '—';

/** One KPI card. `value` null means the rows cannot support the figure. */
function Kpi({
  label,
  value,
  unit,
  foot,
  tone,
}: {
  label: string;
  value: string | null;
  unit?: string;
  foot: string;
  tone?: 'ok' | 'warn' | 'err';
}) {
  return (
    <div className="metric-card" data-tone={value === null ? undefined : tone}>
      <div className="metric-label">{label}</div>
      <div className="metric-val">
        {value ?? '—'}
        {value !== null && unit && <span className="unit">{unit}</span>}
      </div>
      <div className="metric-meta">{foot}</div>
    </div>
  );
}

function LiveKpis({ figures, summary }: { figures: ComplaintFigures | null; summary: CerPmcfSummary | null }) {
  const enrolled = summary?.enrolledInReporting ?? null;
  const target = summary?.targetInReporting ?? null;
  const pct = enrolled !== null && target !== null && target > 0 ? Math.round((enrolled / target) * 100) : null;
  return (
    <div className="metrics-row" data-testid="pms-live-kpis">
      <Kpi
        label="Open complaints"
        value={figures ? String(figures.open) : null}
        unit={figures ? ` / ${figures.total}${figures.capped ? '+' : ''}` : undefined}
        foot={
          figures
            ? `${figures.total}${figures.capped ? ' or more' : ''} received · ${figures.open} still open`
            : 'Complaint rows not loaded'
        }
        tone={figures ? (figures.open > 0 ? 'warn' : 'ok') : undefined}
      />
      <Kpi
        label="Serious, open"
        value={figures ? String(figures.seriousOpen) : null}
        foot="Severity assessed serious or critical, not yet closed"
        tone={figures ? (figures.seriousOpen > 0 ? 'err' : 'ok') : undefined}
      />
      <Kpi
        label="Mean time to triage"
        value={figures && figures.meanTriageDays !== null ? figures.meanTriageDays.toFixed(1) : null}
        unit=" d"
        foot={
          figures && figures.meanTriageDays !== null
            ? `Over ${figures.triagedCount} triaged complaint${figures.triagedCount === 1 ? '' : 's'}`
            : 'No complaint has been triaged yet'
        }
        tone={figures && figures.meanTriageDays !== null ? (figures.meanTriageDays > 1 ? 'warn' : 'ok') : undefined}
      />
      <Kpi
        label="PMCF enrolment"
        value={pct !== null ? String(pct) : null}
        unit="%"
        foot={
          pct !== null && summary
            ? `${(enrolled as number).toLocaleString()} of ${(target as number).toLocaleString()} across ${summary.ratioBasisActivityCount} reporting activit${summary.ratioBasisActivityCount === 1 ? 'y' : 'ies'}`
            : summary && summary.activityCount > 0
              ? 'No activity has reported enrolment against a planned sample size'
              : 'No PMCF activity recorded'
        }
        tone={pct !== null ? (pct >= 80 ? 'ok' : 'warn') : undefined}
      />
    </div>
  );
}

function LivePmsPanels({ programId }: { programId: string | null }) {
  const complaints = useCerComplaints(programId);
  const pmcf = useCerPmcfEnrollment(programId);

  if (!programId) {
    return (
      <div className="section-sub" role="note" style={{ marginTop: 12 }}>
        Complaint and PMCF feeds are held per program.
      </div>
    );
  }

  return (
    <>
      <LiveKpis figures={complaints.figures} summary={pmcf.summary} />

      <div className="col2">
        <div>
          <div className="panel">
            <div className="panel-hdr">
              <div>
                <div className="t">Complaint queue</div>
                <div className="s">
                  {complaints.state.status === 'ready'
                    ? `${complaints.figures?.open ?? 0} open of ${complaints.figures?.total ?? 0} received, newest first`
                    : 'The program’s complaints, newest first'}
                </div>
              </div>
            </div>
            {complaints.state.status === 'loading' && (
              <div className="section-sub" role="status" style={{ padding: '12px 16px' }}>
                Loading complaints…
              </div>
            )}
            {complaints.state.status === 'error' && (
              <ErrorState
                variant="panel"
                title="Couldn’t load the complaint queue"
                message={complaints.state.message}
                retry={complaints.refresh}
                testId="pms-complaints-error"
              />
            )}
            {complaints.state.status === 'empty' && (
              <EmptyState
                icon={I.folder}
                title="No complaints recorded for this program"
                hint="Complaints logged through the vigilance triage appear here as they are received."
                action={{ label: 'Check again', onAct: complaints.refresh }}
                regulation="Serves MDR Article 83 post-market surveillance"
                testId="pms-complaints-empty"
              />
            )}
            {complaints.state.status === 'ready' && (
              <div className="tbl-scroll">
                <table className="tbl" data-testid="pms-complaints-table">
                  <thead>
                    <tr>
                      <th>Code</th>
                      <th>Event</th>
                      <th>Severity</th>
                      <th>State</th>
                      <th>Harm</th>
                    </tr>
                  </thead>
                  <tbody>
                    {complaints.state.data.map((c) => (
                      <tr key={c.id} data-open={isOpenComplaint(c) || undefined}>
                        <td>
                          <span className="k-num">{c.complaintCode}</span>
                          <div className="k-holder">
                            {shortDate(c.receivedAt)} · {c.source.replace(/_/g, ' ')}
                          </div>
                        </td>
                        <td>
                          <div className="k-name" style={{ fontWeight: 400, fontSize: 12 }}>
                            {c.eventNarrative.length > 90 ? `${c.eventNarrative.slice(0, 90)}…` : c.eventNarrative}
                          </div>
                        </td>
                        <td>
                          <span className={`status-pill ${isSeriousComplaint(c) ? 'review' : 'draft'}`}>
                            {c.severityAssessment}
                          </span>
                        </td>
                        <td>
                          <span className={`status-pill ${COMPLAINT_STATE_PILL[c.triageState] ?? 'draft'}`}>
                            {c.triageState.replace(/_/g, ' ')}
                          </span>
                        </td>
                        <td style={{ fontSize: 11, color: 'var(--text-300)' }}>{c.patientHarm.replace(/_/g, ' ')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        <div>
          <div className="panel">
            <div className="panel-hdr">
              <div>
                <div className="t">PMCF activities</div>
                <div className="s">
                  {pmcf.summary
                    ? `${pmcf.summary.activityCount} recorded · ${pmcf.summary.reportingActivityCount} reporting enrolment` +
                      (pmcf.summary.unlinkedToPlanCount > 0
                        ? ` · ${pmcf.summary.unlinkedToPlanCount} not linked to a PMCF plan`
                        : '')
                    : 'Annex XIV Part B activities and their reported enrolment'}
                </div>
              </div>
            </div>
            {pmcf.state.status === 'loading' && (
              <div className="section-sub" role="status" style={{ padding: '12px 16px' }}>
                Loading PMCF activities…
              </div>
            )}
            {pmcf.state.status === 'error' && (
              <ErrorState
                variant="panel"
                title="Couldn’t load the PMCF activities"
                message={pmcf.state.message}
                retry={pmcf.refresh}
                testId="pms-pmcf-error"
              />
            )}
            {pmcf.state.status === 'empty' && (
              <EmptyState
                icon={I.folder}
                title="No PMCF activity recorded for this program"
                hint="Record each PMCF study, registry or survey with its planned sample size; enrolment reports accrue against it."
                action={{ label: 'Check again', onAct: pmcf.refresh }}
                regulation="Serves MDR Annex XIV Part B"
                testId="pms-pmcf-empty"
              />
            )}
            {pmcf.state.status === 'ready' && (
              <div className="estar" data-testid="pms-pmcf-list">
                {pmcf.state.data.map((a, i) => (
                  <div key={a.id} className="estar-row">
                    <div className="estar-num">{String(i + 1).padStart(2, '0')}</div>
                    <div className="estar-label">
                      <div>
                        {a.activityCode} · {a.title}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-400)', marginTop: 2 }}>
                        {a.activityKind.replace(/_/g, ' ')}
                        {a.primaryEndpoint ? ` · ${a.primaryEndpoint}` : ''}
                        {' · '}
                        {a.enrolledCount === null
                          ? 'enrolment not reported'
                          : `${a.enrolledCount.toLocaleString()}${a.targetEnrollment !== null ? ` / ${a.targetEnrollment.toLocaleString()}` : ''} as of ${shortDate(a.enrollmentAsOf)}`}
                        {a.dataCollectionThrough ? ` · through ${shortDate(a.dataCollectionThrough)}` : ''}
                      </div>
                    </div>
                    <span className={`status-pill ${PMCF_STATUS_PILL[a.status] ?? 'draft'}`}>
                      {a.status.replace(/_/g, ' ')}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

/** The kit's PMS KPI / complaints / PMCF fixtures — sample mode only. */
function SamplePmsPanels() {
  const totalEnrolled = CER_PMCF_STUDIES.reduce((s, x) => s + x.n, 0);
  const totalTarget = CER_PMCF_STUDIES.reduce((s, x) => s + x.target, 0);
  const enrollPct = Math.round((totalEnrolled / totalTarget) * 100);

  return (
    <>
      <div className="metrics-row">
        {CER_PMS_KPIS.map((k, i) => (
          <div
            key={i}
            className="metric-card"
            data-tone={k.tone === 'good' ? 'ok' : k.tone === 'warn' ? 'warn' : k.tone === 'bad' ? 'err' : undefined}
          >
            <div className="metric-label">{k.label}</div>
            <div className="metric-val">
              {k.value}
              {k.delta && <span className="unit">{k.delta}</span>}
            </div>
            <div className="metric-meta">{k.foot}</div>
          </div>
        ))}
      </div>

      <div className="col2">
        <div>
          <div className="panel">
            <div className="panel-hdr">
              <div>
                <div className="t">Complaint queue · sample</div>
                <div className="s">Canonical example content</div>
              </div>
            </div>
            <div className="tbl-scroll">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Category</th>
                    <th>Severity</th>
                    <th>Status</th>
                    <th>Owner</th>
                  </tr>
                </thead>
                <tbody>
                  {CER_PMS_COMPLAINTS.map((c) => (
                    <tr key={c.code}>
                      <td>
                        <span className="k-num">{c.code}</span>
                        <div className="k-holder">
                          {c.received} · {c.source}
                        </div>
                      </td>
                      <td>
                        <div className="k-name" style={{ fontWeight: 400, fontSize: 12 }}>
                          {c.category}
                        </div>
                      </td>
                      <td>
                        <span className={`status-pill ${c.severity}`}>{c.severity}</span>
                      </td>
                      <td>
                        <span className={`status-pill ${c.status === 'open' ? 'review' : c.status === 'closed' ? 'complete' : 'draft'}`}>
                          {c.status}
                        </span>
                      </td>
                      <td style={{ fontSize: 11, color: 'var(--text-300)' }}>{c.owner}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div>
          <div className="panel">
            <div className="panel-hdr">
              <div>
                <div className="t">PMCF studies · sample</div>
                <div className="s">
                  {CER_PMCF_STUDIES.length} active · {totalEnrolled.toLocaleString()} of{' '}
                  {totalTarget.toLocaleString()} enrolled · {enrollPct}%
                </div>
              </div>
            </div>
            <div className="estar">
              {CER_PMCF_STUDIES.map((st) => (
                <div key={st.id} className="estar-row">
                  <div className="estar-num">{st.id.slice(-2)}</div>
                  <div className="estar-label">
                    <div>
                      {st.id} · {st.kind}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-400)', marginTop: 2 }}>
                      {st.primary} · {st.n.toLocaleString()} / {st.target.toLocaleString()} · through {st.through}
                    </div>
                  </div>
                  <span className={`status-pill ${st.status === 'closed' ? 'complete' : 'review'}`}>
                    {st.status}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="panel">
            <div className="panel-hdr">
              <div>
                <div className="t">Reporting calendar · sample</div>
                <div className="s">PMS deliverables required by NB and competent authorities</div>
              </div>
            </div>
            <div className="estar">
              {CER_PMS_TIMELINE.map((t, i) => (
                <div key={i} className="estar-row">
                  <div className="estar-num">{String(i + 1).padStart(2, '0')}</div>
                  <div className="estar-label">
                    <div>{t.label}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-400)', marginTop: 2 }}>{t.when}</div>
                  </div>
                  <span className={`status-pill ${t.status}`}>{t.status}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
