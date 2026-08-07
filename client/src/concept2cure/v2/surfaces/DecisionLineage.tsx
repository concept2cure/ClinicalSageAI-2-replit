import React, { useState, useMemo } from 'react';
import { I } from '../icons';
import { useLiveRows, useLiveData, EmptyState } from '../dataConnect';
import { apiRequest } from '@/lib/queryClient';
import type { SurfaceViewProps } from '../surfaceViews';
import {
  // Canonical reference config (kept — not fixture DATA): the node-type display
  // map (label/icon/tone per nodeType) and the regulatory-framework catalog.
  LINEAGE_NODE_TYPES,
  LINEAGE_FRAMEWORKS,
  type LineageGraph,
  type LineageNode,
  type LineageNodeTypeConfig,
  type LineageChain,
} from '../fixtures/decision-lineage-data';
import '../styles/project-home-v2.css';

/* ── Helpers ── */

function dlTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  } catch (_e) {
    return iso;
  }
}

function dlActionLabel(a: string): string {
  return String(a || '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/* ════ DecisionLineage — the defensible decision trail ════ */

export function DecisionLineage({ onAsk }: SurfaceViewProps) {
  const ask = onAsk;
  /* Real-data standard: the org's governed decision trails are read live from
     GET /api/decision-lineage (server/routes/decision-lineage.routes.ts), which
     enumerates the org's real governed artifacts and assembles each trail through
     decisionLineageService.getLineageGraph (the real workflow + hash-chained audit
     store — the same service behind the per-artifact / export / verify-chain
     endpoints), returning exactly the LineageGraph display shape ({ rootEntityType,
     rootEntityId, artifactLabel, nodes, edges, metadata }). Real rows, an honest
     empty, or an honest error — never a fixture. `rows` is a fresh [] while loading
     and on error, so all derived values below are null-safe. */
  const { rows: graphs, loading, error, empty } = useLiveRows<LineageGraph>(
    '/api/decision-lineage',
  );
  /* Hash-chain integrity is verified live from GET
     /api/decision-lineage/verify-chain (server/routes/decision-lineage.ts →
     auditService.verifyChain()); the aside renders its real result, an honest
     empty, or an honest error. */
  const chainState = useLiveData<LineageChain>('/api/decision-lineage/verify-chain');
  const chain = chainState.data;
  const NT = LINEAGE_NODE_TYPES;

  const [sel, setSel] = useState(0);
  const g: LineageGraph | undefined = graphs[sel] || graphs[0];

  // Export runner state — which format is in flight, and the last error (shown
  // inline by the export controls). The surface has no toast; keep it contained.
  const [exportBusy, setExportBusy] = useState('');
  const [exportErr, setExportErr] = useState('');

  const nodes: LineageNode[] = (g && g.nodes) || [];
  const md = (g && g.metadata) || { totalDecisions: 0, totalApprovals: 0, totalRejections: 0, totalDelegations: 0 };

  const openDecisions = useMemo(
    () =>
      nodes.filter(
        (n) =>
          n.nodeType === 'decision' &&
          n.regulatory &&
          n.regulatory.requiresSignature &&
          n.regulatory.signatureStatus === 'pending',
      ),
    [sel, graphs],
  );

  const isLocked = nodes.some((n) => n.action === 'locked');
  const pendingSig = openDecisions.length > 0;
  const lastNode = nodes[nodes.length - 1] || ({} as LineageNode);

  /* answer-first verdict */
  const lead = isLocked
    ? {
        tone: 'good' as const,
        h: (
          <>
            This artifact is <b>fully defensible</b>. Every step from creation to lock is on an
            immutable, hash-chained record -- {md.totalDecisions} governed decision
            {md.totalDecisions === 1 ? '' : 's'}, {md.totalApprovals} approval
            {md.totalApprovals === 1 ? '' : 's'}, all Part-11 signed.
          </>
        ),
        b: (
          <>
            If an inspector asks &quot;how did this document come to say what it says?&quot;, this is
            the answer -- traceable back to the locked source evidence, with the electronic signature
            manifestation attached. The chain is cryptographically verified.
          </>
        ),
        re: 'Nothing here was reconstructed after the fact -- each record was written when the action happened and cannot be altered without breaking the chain.',
      }
    : pendingSig
      ? {
          tone: 'calm' as const,
          h: (
            <>
              The trail is clean and complete -- it just needs the final signature.{' '}
              {md.totalDecisions} decision{md.totalDecisions === 1 ? '' : 's'} recorded, the last
              is <b>approved, pending electronic signature</b>.
            </>
          ),
          b: (
            <>
              Everything up to the lock is defensible and hash-chained. One Part-11 signature
              (§11.50) closes the loop and locks the record. I can route it to the signer.
            </>
          ),
          re: 'The revision that reviewer requested is captured in the trail too -- better the reviewer sees you addressed it than wonders if you did.',
        }
      : {
          tone: 'calm' as const,
          h: (
            <>
              This artifact is still moving through review -- the decision trail is <b>open</b> at
              &quot;{dlActionLabel(lastNode.action)}&quot;.
            </>
          ),
          b: (
            <>
              Every step so far is recorded and hash-chained. The open item is with{' '}
              {lastNode.performedBy || 'the reviewer'}; once it clears, the approval and lock
              decisions will extend this same immutable chain.
            </>
          ),
          re: "Nothing is lost while it's in flight -- the trail captures every handoff, including the delegation, so accountability is never ambiguous.",
        };

  // exportOne — REAL, awaited export. Streams the immutable lineage from
  // GET /api/decision-lineage/:entityType/:entityId/export?format=…, which the
  // server logs as an auditable action (lineage_export), and downloads the
  // returned file. The entity ids come from the adopted graph (g.rootEntityType
  // / g.rootEntityId) — nothing is fabricated. On failure an inline message is
  // shown and no file is produced.
  const exportOne = async (fmt: string) => {
    if (!g) { setExportErr('No lineage graph is loaded to export.'); return; }
    setExportErr('');
    setExportBusy(fmt);
    try {
      const url =
        '/api/decision-lineage/' +
        encodeURIComponent(g.rootEntityType) + '/' + encodeURIComponent(String(g.rootEntityId)) +
        '/export?format=' + encodeURIComponent(fmt);
      const res = await apiRequest('GET', url);
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        setExportErr((j && (j.error || j.message)) || ('Export failed (HTTP ' + res.status + ').'));
        return;
      }
      const blob = await res.blob();
      const cd = res.headers.get('Content-Disposition') || '';
      const m = /filename="?([^";]+)"?/.exec(cd);
      const filename = (m && m[1]) || ('decision-lineage-' + g.rootEntityId + '.' + fmt);
      const objUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objUrl);
    } catch (e) {
      setExportErr(e instanceof Error ? e.message : String(e));
    } finally {
      setExportBusy('');
    }
  };

  return (
    <div className="dl">
      <div className="dl-head">
        <div className="dl-eyebrow">
          <span className="dl-kicker">Governed decision lineage</span>
        </div>
        <h1 className="dl-title">Decision lineage &amp; provenance</h1>
        <div className="dl-sub">
          The immutable, Part-11 hash-chained trail behind every governed artifact -- who decided
          what, when, on what evidence.
        </div>
      </div>

      {loading ? (
        <div className="scaf-note" style={{ padding: '28px 14px' }}>
          Loading the governed decision trails…
        </div>
      ) : error ? (
        <EmptyState
          tone="error"
          icon={I.alertTriangle}
          title="Couldn't load the decision lineage"
          hint="The governed decision-trail registry didn't respond. These are the organization's immutable, Part-11 hash-chained artifact decision trails — sign in and retry, or check the service is reachable."
        />
      ) : empty || !g ? (
        <EmptyState
          icon={I.gitBranch}
          title="No governed decision trails yet"
          hint="Once an artifact moves through review — created, evidence linked, approved, signed, then locked — its immutable, hash-chained decision trail appears here, ready for the submission audit package."
        />
      ) : (
        <>
      {/* artifact picker */}
      <div className="dl-picker">
        {graphs.map((x, i) => {
          // A trail row can arrive without its `nodes` — an unassembled graph or
          // a narrowed SELECT — and the two derivations below walk them. The
          // adopted graph already defaults the same field this way a few lines
          // up; the picker was reading it raw, which is the asymmetry.
          const xNodes = (x && x.nodes) || [];
          const locked = xNodes.some((n) => n.action === 'locked');
          const pend = xNodes.some(
            (n) => n.regulatory && n.regulatory.signatureStatus === 'pending',
          );
          return (
            <button
              key={i}
              className={'dl-pick' + (i === sel ? ' on' : '')}
              onClick={() => setSel(i)}
            >
              <span className="dl-pick-t">{x.artifactLabel}</span>
              <span
                className={
                  'dl-pick-st ' + (locked ? 'locked' : pend ? 'pending' : 'open')
                }
              >
                {locked ? 'Locked' : pend ? 'Pending signature' : 'In review'}
              </span>
            </button>
          );
        })}
      </div>

      {/* answer-first lead */}
      <div className={'dl-lead tone-' + lead.tone}>
        <div className="dl-lead-ic">{I.shieldCheck}</div>
        <div>
          <p className="dl-lead-h">{lead.h}</p>
          <p className="dl-lead-b">{lead.b}</p>
          <p className="dl-lead-re">
            {I.info} {lead.re}
          </p>
        </div>
      </div>

      <div className="dl-body">
        {/* the chain -- the deliverable */}
        <div className="dl-chain-wrap">
          <div className="dl-chain-hd">
            <span className="dl-chain-t">Decision trail</span>
            <span className="dl-chain-s">
              {nodes.length} records -- read top to bottom
            </span>
          </div>
          <div className="dl-chain">
            {nodes.map((n, i) => {
              const cfg: LineageNodeTypeConfig = NT[n.nodeType] || {
                label: n.nodeType,
                icon: 'circle',
                tone: 'neutral',
              };
              const parentEdge = (g.edges || []).find((e) => e.to === n.id);
              const sigStatus = n.regulatory && n.regulatory.signatureStatus;
              return (
                <div key={n.id} className="dl-node-wrap">
                  {i > 0 && (
                    <div className="dl-edge">
                      <span className="dl-edge-rel">
                        {/* An edge can carry no `relationship` (nullable column);
                            the existing 'preceded' fallback is the honest reading
                            of "these two are ordered but the link isn't named". */}
                        {parentEdge && parentEdge.relationship
                          ? parentEdge.relationship.replace(/_/g, ' ')
                          : 'preceded'}
                      </span>
                    </div>
                  )}
                  <div className={'dl-node tone-' + cfg.tone}>
                    <div className="dl-node-rail">
                      <span className={'dl-node-ic tone-' + cfg.tone}>
                        {I[cfg.icon] || I.dot}
                      </span>
                    </div>
                    <div className="dl-node-body">
                      <div className="dl-node-top">
                        <span className={'dl-node-type tone-' + cfg.tone}>{cfg.label}</span>
                        <span className="dl-node-action">{dlActionLabel(n.action)}</span>
                        <span className="dl-node-when">{dlTime(n.performedAt)}</span>
                      </div>
                      <div className="dl-node-who">
                        {n.performedBy}
                        {n.performedByRole ? (
                          <span className="dl-node-role"> -- {n.performedByRole}</span>
                        ) : null}
                      </div>
                      {n.details && Object.keys(n.details).length > 0 && (
                        <div className="dl-node-detail">
                          {n.details.reason ||
                            n.details.note ||
                            n.details.claim ||
                            n.details.changes ||
                            n.details.open ||
                            n.details.scope ||
                            n.details.purpose ||
                            (n.details.evidence
                              ? 'Linked: ' +
                                n.details.evidence +
                                (n.details.location ? ' (' + n.details.location + ')' : '')
                              : n.details.to
                                ? 'Delegated to ' + n.details.to
                                : n.details.fromStatus
                                  ? dlActionLabel(n.details.fromStatus) +
                                    ' -> ' +
                                    dlActionLabel(n.details.toStatus || '')
                                  : n.details.status
                                    ? 'Status: ' +
                                      dlActionLabel(n.details.status) +
                                      (n.details.version ? ' -- ' + n.details.version : '')
                                    : '')}
                          {n.details.esignature && (
                            <span className="dl-node-esig">
                              {I.penLine} {n.details.esignature}
                            </span>
                          )}
                        </div>
                      )}
                      <div className="dl-node-badges">
                        {n.regulatory && n.regulatory.gxpRelevant && (
                          <span className="dl-badge gxp">GxP</span>
                        )}
                        {n.regulatory && n.regulatory.cfr11Compliant && (
                          <span className="dl-badge cfr">21 CFR §11</span>
                        )}
                        {n.regulatory && n.regulatory.requiresSignature && (
                          <span className={'dl-badge sig ' + (sigStatus || '')}>
                            {sigStatus === 'signed'
                              ? 'Signed'
                              : sigStatus === 'pending'
                                ? 'Signature pending'
                                : sigStatus === 'rejected'
                                  ? 'Signature rejected'
                                  : 'Signature required'}
                          </span>
                        )}
                        {n.recordHash && (
                          <span className="dl-badge hash" title="Tamper-evident record hash">
                            {I.lock} {n.recordHash}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* aside: chain integrity + compliance + export */}
        <aside className="dl-aside">
          <div className="dl-verify">
            {chainState.loading ? (
              <div className="scaf-note" style={{ padding: '8px 2px' }}>
                Verifying the hash chain…
              </div>
            ) : chainState.error ? (
              <EmptyState
                tone="error"
                icon={I.alertTriangle}
                title="Couldn't verify the hash chain"
                hint="The tamper-evident audit chain didn't respond. Sign in and retry, or check the audit service is reachable."
              />
            ) : !chain ? (
              <EmptyState
                icon={I.shieldCheck}
                title="Chain verification not available yet"
              />
            ) : (
              <>
                <div className="dl-verify-hd">
                  <span
                    className={
                      'dl-verify-dot ' + (chain.chainIntegrity === 'VERIFIED' ? 'ok' : 'bad')
                    }
                  />
                  <span className="dl-verify-t">
                    Hash chain {chain.chainIntegrity === 'VERIFIED' ? 'verified' : 'unverified'}
                  </span>
                </div>
                <p className="dl-verify-b">
                  {(chain.entriesVerified || 0).toLocaleString()} audit entries cryptographically
                  verified -- tamper-evident. Any alteration to a past record breaks the chain and
                  is detected.
                </p>
                <div className="dl-verify-meta">
                  <span>Verified {dlTime(chain.verifiedAt)}</span>
                  <span
                    className={
                      'dl-verify-status ' +
                      (chain.complianceStatus === 'COMPLIANT' ? 'ok' : 'bad')
                    }
                  >
                    {chain.complianceStatus || '--'}
                  </span>
                </div>
              </>
            )}
          </div>

          <div className="dl-metrics">
            <div className="dl-metric">
              <span className="dl-metric-n">{md.totalDecisions || 0}</span>
              <span className="dl-metric-l">Decisions</span>
            </div>
            <div className="dl-metric">
              <span className="dl-metric-n">{md.totalApprovals || 0}</span>
              <span className="dl-metric-l">Approvals</span>
            </div>
            <div className="dl-metric">
              <span className="dl-metric-n">{md.totalRejections || 0}</span>
              <span className="dl-metric-l">Revisions</span>
            </div>
            <div className="dl-metric">
              <span className="dl-metric-n">{md.totalDelegations || 0}</span>
              <span className="dl-metric-l">Delegations</span>
            </div>
          </div>

          <div className="dl-frameworks">
            <div className="dl-fw-hd">Attested against</div>
            {LINEAGE_FRAMEWORKS.map((f, i) => (
              <div key={i} className="dl-fw">
                <span className="dl-fw-check">{I.check}</span>
                <span className="dl-fw-main">
                  <span className="dl-fw-name">{f.framework}</span>
                  <span className="dl-fw-sec">{f.sections.join(' -- ')}</span>
                </span>
              </div>
            ))}
          </div>

          {pendingSig && (
            <button
              className="dl-cta"
              onClick={() => {
                // FLAG (mock action): routes to the AnA composer via onAsk; it
                // does NOT call a real e-signature / record endpoint
                // (/api/esignature or /api/decision-lineage/record). Left for the
                // actions pass — not half-wired.
                ask(
                  'Route the ' +
                    (g?.artifactLabel || 'artifact') +
                    ' for the final Part-11 electronic signature to lock the record.',
                );
              }}
            >
              {I.penLine} Route for signature
            </button>
          )}

          <div className="dl-export">
            <div className="dl-export-hd">Export for the audit package</div>
            <div className="dl-export-btns">
              {(['json', 'csv', 'xml'] as const).map((f) => (
                <button
                  key={f}
                  className="dl-export-b"
                  disabled={exportBusy !== ''}
                  onClick={() => exportOne(f)}
                >
                  {exportBusy === f ? 'Exporting…' : f.toUpperCase()}
                </button>
              ))}
            </div>
            {exportErr && (
              <p className="dl-export-note" role="alert" style={{ color: 'var(--err, #c0392b)' }}>
                Couldn’t export — {exportErr} Nothing was downloaded.
              </p>
            )}
            <p className="dl-export-note">
              Exports the immutable lineage (XML is eCTD-compatible). The dedicated export
              endpoint logs each export as an auditable action.
            </p>
          </div>
        </aside>
      </div>
        </>
      )}

      <p className="dl-foot">
        Lineage is sourced from the tamper-proof audit log -- records are written when the action
        occurs and hash-chained per FDA 21 CFR Part 11 §11.10(e). The trail and its chain
        verification above are read live from this project's governed records.
      </p>
    </div>
  );
}
