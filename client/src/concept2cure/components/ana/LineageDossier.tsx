/**
 * Document Lineage & Decision Dossier — viewer.
 *
 * Renders the per-document convergence dossier from
 * GET /api/ana-ri/documents/:artifactId/lineage-dossier: every iteration, the
 * AnA-vs-human decisions, the provenance trail, AnA's reasoning, the evidence
 * data-lineage, and the human control actions — the "report on all of this"
 * with an XML export of the full lineage metadata.
 *
 * Self-contained modal overlay: give it an `artifactId` and an `onClose`. All
 * styling is theme-neutral inline so it reads in both light and dark shells.
 */
import { useEffect, useState } from 'react';
import { getAuthHeaders, getOrgId } from '../../../utils/authToken';
import { createReportRun, fetchRenderedReport } from '../../insights/data/api';
import type { RenderedReport } from '../../insights/data/types';
import { ReportView } from '../../insights/surface/ReportView';

interface Dossier {
  schemaVersion: string;
  generatedAt: string;
  threadId: string | null;
  ledger: {
    artifact: {
      artifactId: string;
      title: string;
      status: string;
      version: number;
      ctdSection: string | null;
      contentHash: string | null;
    };
    project: { name: string | null };
    signatures: unknown[];
    auditLog: unknown[];
  };
  versionHistory: Array<{
    version: number;
    contentHash: string | null;
    changeDescription: string | null;
    contentLength: number;
    createdById: number | null;
    createdAt: string;
    isCurrent: boolean;
  }>;
  decisions: Array<{
    id: string;
    contextType: string;
    recommendationSummary: string;
    confidence: string;
    actionState: string;
    approvalState: string | null;
    authoredBy: 'ana' | 'human' | 'system';
    decidedBy: 'ana' | 'human' | null;
    rejectionReason: string | null;
    createdAt: string;
  }>;
  decisionSummary: {
    total: number;
    anaAuthored: number;
    humanAuthored: number;
    humanDecided: number;
    approved: number;
    rejected: number;
    pending: number;
  };
  provenanceEvents: Array<{
    eventId: string;
    eventType: string;
    eventAction: string;
    actorName: string | null;
    createdAt: string;
  }>;
  reasoning: Array<{ turn: number; reasoning: string; model: string | null; createdAt: string | null }>;
  humanControls: Array<{
    turn: number;
    action: string;
    message: string | null;
    round: number | null;
    at: string | null;
  }>;
  dataLineage: Array<{
    sourceObjectType: string;
    sourceObjectId: string;
    sourceTitle: string | null;
    linkageType: string;
    transformationType: string | null;
    confidenceScore: number | null;
    aiModelUsed: string | null;
  }>;
}

export interface LineageDossierProps {
  artifactId: string;
  onClose: () => void;
}

const overlay: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.45)',
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'flex-start',
  padding: '4vh 16px',
  zIndex: 1000,
  overflow: 'auto',
};

const panel: React.CSSProperties = {
  width: 'min(920px, 100%)',
  background: 'var(--surface, #fff)',
  color: 'var(--text, inherit)',
  borderRadius: 14,
  border: '1px solid rgba(127,127,127,0.25)',
  boxShadow: '0 20px 60px rgba(0,0,0,0.35)',
  overflow: 'hidden',
};

const sectionStyle: React.CSSProperties = {
  padding: '14px 20px',
  borderTop: '1px solid rgba(127,127,127,0.18)',
};

const chip = (bg: string): React.CSSProperties => ({
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  padding: '2px 8px',
  borderRadius: 999,
  fontSize: 12,
  background: bg,
  border: '1px solid rgba(127,127,127,0.25)',
});

function actorChip(actor: string | null) {
  if (actor === 'ana') return chip('rgba(59,130,246,0.15)');
  if (actor === 'human') return chip('rgba(34,197,94,0.15)');
  return chip('rgba(127,127,127,0.12)');
}

function fmt(ts: string | null): string {
  if (!ts) return '';
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return ts;
  }
}

export function LineageDossier({ artifactId, onClose }: LineageDossierProps) {
  const [dossier, setDossier] = useState<Dossier | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Governed Report-OS "evidence_trace_report" for this document, shown in a
  // nested overlay. Reuses the existing Report-OS client API + ReportView.
  const [reportOpen, setReportOpen] = useState(false);
  const [report, setReport] = useState<RenderedReport | null>(null);
  const [reportRunId, setReportRunId] = useState<string | null>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/ana-ri/documents/${encodeURIComponent(artifactId)}/lineage-dossier`, {
      headers: getAuthHeaders(),
      credentials: 'include',
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(res.status === 404 ? 'Document not found' : `Error ${res.status}`);
        return (await res.json()) as Dossier;
      })
      .then((d) => {
        if (!cancelled) setDossier(d);
      })
      .catch((e) => {
        if (!cancelled) setError(e?.message || 'Failed to load dossier');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [artifactId]);

  const exportXml = async () => {
    try {
      const res = await fetch(
        `/api/ana-ri/documents/${encodeURIComponent(artifactId)}/lineage-dossier.xml`,
        { headers: getAuthHeaders(), credentials: 'include' },
      );
      if (!res.ok) return;
      const text = await res.text();
      const blob = new Blob([text], { type: 'application/xml' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `lineage-dossier-${artifactId}.xml`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      /* best-effort export */
    }
  };

  // Launch the governed evidence-trace report for this document via the existing
  // Report-OS run API, then render the returned document with <ReportView>. Auth
  // + org scoping come from apiRequest (same token/org source as the dossier's
  // own fetches); the org id for the run body is the canonical getOrgId().
  const generateReport = async () => {
    setReportOpen(true);
    setReportLoading(true);
    setReportError(null);
    setReport(null);
    setReportRunId(null);
    try {
      const result = await createReportRun({
        organizationId: Number(getOrgId()),
        scopeType: 'document',
        scopeId: artifactId,
        reportTypeId: 'provenance.evidence_trace_report',
      });
      const runId = result.run?.id != null ? String(result.run.id) : null;
      if (!runId) throw new Error('The report run did not return an id.');
      setReportRunId(runId);
      const rendered = await fetchRenderedReport(runId);
      setReport(rendered);
    } catch (e) {
      // apiRequest throws an error carrying the HTTP status; duck-type it rather
      // than depend on a class import (the alias doesn't re-export the class).
      const status = (e as { status?: number } | null)?.status;
      if (status === 403) {
        setReportError('Requires the standard plan.');
      } else {
        setReportError((e as Error)?.message || 'The governed report could not be generated.');
      }
    } finally {
      setReportLoading(false);
    }
  };

  const s = dossier?.decisionSummary;

  return (
    <>
    <div style={overlay} onClick={onClose} role="dialog" aria-modal="true" aria-label="Lineage dossier">
      <div style={panel} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            padding: '16px 20px',
          }}
        >
          <div>
            <div style={{ fontSize: 15, fontWeight: 600 }}>Lineage &amp; Decision Dossier</div>
            <div style={{ fontSize: 12, opacity: 0.7 }}>
              {dossier ? dossier.ledger.artifact.title : artifactId}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              onClick={generateReport}
              disabled={reportLoading}
              style={{
                padding: '5px 12px',
                borderRadius: 8,
                border: '1px solid rgba(127,127,127,0.35)',
                background: 'transparent',
                color: 'inherit',
                cursor: reportLoading ? 'default' : 'pointer',
                font: 'inherit',
              }}
            >
              {reportLoading ? 'Generating…' : 'Generate governed report'}
            </button>
            <button
              type="button"
              onClick={exportXml}
              disabled={!dossier}
              style={{
                padding: '5px 12px',
                borderRadius: 8,
                border: '1px solid rgba(127,127,127,0.35)',
                background: 'transparent',
                color: 'inherit',
                cursor: dossier ? 'pointer' : 'default',
                font: 'inherit',
              }}
            >
              Export XML
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close dossier"
              style={{
                padding: '5px 12px',
                borderRadius: 8,
                border: '1px solid rgba(127,127,127,0.35)',
                background: 'transparent',
                color: 'inherit',
                cursor: 'pointer',
                font: 'inherit',
              }}
            >
              Close
            </button>
          </div>
        </div>

        {loading && <div style={{ ...sectionStyle, opacity: 0.7 }}>Assembling dossier…</div>}
        {error && <div style={{ ...sectionStyle, color: '#ef4444' }}>{error}</div>}

        {dossier && (
          <>
            {/* Summary chips */}
            <div style={{ ...sectionStyle, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              <span style={chip('rgba(127,127,127,0.12)')}>
                {dossier.versionHistory.length} iteration
                {dossier.versionHistory.length === 1 ? '' : 's'}
              </span>
              {s && (
                <>
                  <span style={chip('rgba(59,130,246,0.15)')}>{s.anaAuthored} AnA-authored</span>
                  <span style={chip('rgba(34,197,94,0.15)')}>{s.humanDecided} human-decided</span>
                  <span style={chip('rgba(34,197,94,0.10)')}>{s.approved} approved</span>
                  <span style={chip('rgba(239,68,68,0.12)')}>{s.rejected} rejected</span>
                  <span style={chip('rgba(245,158,11,0.12)')}>{s.pending} pending</span>
                </>
              )}
              <span style={chip('rgba(127,127,127,0.12)')}>{dossier.reasoning.length} reasoning turns</span>
              <span style={chip('rgba(127,127,127,0.12)')}>{dossier.dataLineage.length} evidence links</span>
              <span style={chip('rgba(127,127,127,0.12)')}>
                {dossier.humanControls.length} human controls
              </span>
              <span style={chip('rgba(127,127,127,0.12)')}>
                {dossier.ledger.signatures.length} signatures
              </span>
            </div>

            {/* Iterations */}
            <Section title={`Iterations (${dossier.versionHistory.length})`}>
              {dossier.versionHistory.length === 0 && <Muted>No version history recorded.</Muted>}
              {dossier.versionHistory.map((v) => (
                <Row key={v.version}>
                  <strong>v{v.version}</strong>
                  {v.isCurrent && <span style={chip('rgba(34,197,94,0.15)')}>current</span>}
                  <span style={{ opacity: 0.8 }}>{v.changeDescription || 'No description'}</span>
                  <Meta>
                    {v.contentLength.toLocaleString()} chars · {fmt(v.createdAt)}
                  </Meta>
                </Row>
              ))}
            </Section>

            {/* Decisions */}
            <Section title={`Decisions — AnA & human (${dossier.decisions.length})`}>
              {dossier.decisions.length === 0 && (
                <Muted>No decisions recorded against this document.</Muted>
              )}
              {dossier.decisions.map((d) => (
                <Row key={d.id}>
                  <span style={actorChip(d.authoredBy)}>{d.authoredBy} authored</span>
                  {d.decidedBy && <span style={actorChip(d.decidedBy)}>{d.decidedBy} decided</span>}
                  <span style={{ opacity: 0.9 }}>{d.recommendationSummary}</span>
                  <Meta>
                    {d.contextType} · {d.actionState}
                    {d.approvalState ? ` · ${d.approvalState}` : ''} · {fmt(d.createdAt)}
                    {d.rejectionReason ? ` · rejected: ${d.rejectionReason}` : ''}
                  </Meta>
                </Row>
              ))}
            </Section>

            {/* Reasoning */}
            <Section title={`AnA reasoning (${dossier.reasoning.length})`}>
              {dossier.reasoning.length === 0 && <Muted>No reasoning captured for this document.</Muted>}
              {dossier.reasoning.map((r) => (
                <Row key={r.turn}>
                  <strong>Turn {r.turn}</strong>
                  <span style={{ opacity: 0.85, whiteSpace: 'pre-wrap' }}>{r.reasoning}</span>
                  <Meta>
                    {r.model || ''} {r.createdAt ? `· ${fmt(r.createdAt)}` : ''}
                  </Meta>
                </Row>
              ))}
            </Section>

            {/* Human controls */}
            {dossier.humanControls.length > 0 && (
              <Section title={`Human control actions (${dossier.humanControls.length})`}>
                {dossier.humanControls.map((c, i) => (
                  <Row key={`${c.turn}-${i}`}>
                    <span style={chip('rgba(245,158,11,0.15)')}>{c.action}</span>
                    {c.message && <span style={{ opacity: 0.9 }}>{c.message}</span>}
                    <Meta>
                      turn {c.turn}
                      {c.round != null ? ` · round ${c.round}` : ''} {c.at ? `· ${fmt(c.at)}` : ''}
                    </Meta>
                  </Row>
                ))}
              </Section>
            )}

            {/* Data lineage */}
            <Section title={`Evidence data-lineage (${dossier.dataLineage.length})`}>
              {dossier.dataLineage.length === 0 && (
                <Muted>No evidence lineage links recorded.</Muted>
              )}
              {dossier.dataLineage.map((l, i) => (
                <Row key={i}>
                  <span style={chip('rgba(127,127,127,0.12)')}>{l.linkageType}</span>
                  <span style={{ opacity: 0.9 }}>
                    {l.sourceTitle || l.sourceObjectId} <Meta>({l.sourceObjectType})</Meta>
                  </span>
                  <Meta>
                    {l.transformationType || ''}
                    {l.confidenceScore != null ? ` · ${l.confidenceScore}% conf` : ''}
                    {l.aiModelUsed ? ` · ${l.aiModelUsed}` : ''}
                  </Meta>
                </Row>
              ))}
            </Section>

            {/* Provenance */}
            <Section title={`Provenance events (${dossier.provenanceEvents.length})`}>
              {dossier.provenanceEvents.length === 0 && <Muted>No provenance events recorded.</Muted>}
              {dossier.provenanceEvents.map((e) => (
                <Row key={e.eventId}>
                  <span style={chip('rgba(127,127,127,0.12)')}>{e.eventType}</span>
                  <span style={{ opacity: 0.9 }}>{e.eventAction}</span>
                  <Meta>
                    {e.actorName || 'system'} · {fmt(e.createdAt)}
                  </Meta>
                </Row>
              ))}
            </Section>

            <div style={{ ...sectionStyle, fontSize: 11, opacity: 0.55 }}>
              Dossier schema v{dossier.schemaVersion} · generated {fmt(dossier.generatedAt)} ·{' '}
              {dossier.ledger.auditLog.length} audit entries
            </div>
          </>
        )}
      </div>
    </div>

    {reportOpen && (
      <div
        style={overlay}
        onClick={() => setReportOpen(false)}
        role="dialog"
        aria-modal="true"
        aria-label="Governed evidence trace report"
      >
        <div style={panel} onClick={(e) => e.stopPropagation()}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              padding: '16px 20px',
            }}
          >
            <div>
              <div style={{ fontSize: 15, fontWeight: 600 }}>Governed evidence trace report</div>
              <div style={{ fontSize: 12, opacity: 0.7 }}>
                {dossier ? dossier.ledger.artifact.title : artifactId}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setReportOpen(false)}
              aria-label="Close report"
              style={{
                padding: '5px 12px',
                borderRadius: 8,
                border: '1px solid rgba(127,127,127,0.35)',
                background: 'transparent',
                color: 'inherit',
                cursor: 'pointer',
                font: 'inherit',
              }}
            >
              Close
            </button>
          </div>

          {reportLoading && (
            <div style={{ ...sectionStyle, opacity: 0.7 }}>Generating governed report…</div>
          )}
          {reportError && <div style={{ ...sectionStyle, color: '#ef4444' }}>{reportError}</div>}
          {report && (
            <div style={sectionStyle}>
              <ReportView report={report} runId={reportRunId ?? undefined} />
            </div>
          )}
        </div>
      </div>
    )}
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={sectionStyle}>
      <div
        style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4, opacity: 0.7, marginBottom: 8 }}
      >
        {title}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>{children}</div>
    </div>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: 8, fontSize: 13 }}>
      {children}
    </div>
  );
}

function Meta({ children }: { children: React.ReactNode }) {
  return <span style={{ fontSize: 11, opacity: 0.55 }}>{children}</span>;
}

function Muted({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 13, opacity: 0.6 }}>{children}</div>;
}
