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
 * No live complaint-queue or PMCF-enrollment feed exists yet; the kit's KPI /
 * complaints / study fixtures render ONLY under the explicit sample-mode
 * guard, clearly bannered.
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
import { useSampleMode } from '../../components/DataGate';

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
        ? `Post-market backend unavailable — ${error}`
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
        : `Draft not created — ${outcome.error}`
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

      {!report && !loading && programId && (
        <div className="panel">
          <div
            role="status"
            style={{ padding: '24px 16px', textAlign: 'center', fontSize: 12, color: 'var(--text-300)' }}
          >
            <div style={{ fontWeight: 600, color: 'var(--text-200)', marginBottom: 4 }}>
              Post-market documentation status unavailable
            </div>
            {error ? `The post-market backend did not respond — ${error}` : 'No report was returned.'}
          </div>
        </div>
      )}

      <SampleDataBanner show={sampleOn} label="PMS metrics and complaint queue" />
      {sampleOn && <SamplePmsPanels />}
      {!sampleOn && (
        <div className="section-sub" role="note" style={{ marginTop: 12 }}>
          Complaint-queue metrics and PMCF enrollment tracking have no live backend feed yet —
          they appear here once a complaints source is connected.
        </div>
      )}
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
