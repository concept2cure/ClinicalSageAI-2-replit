import React, { useEffect, useState, useMemo } from 'react';
import { I } from '../icons';
import { useLiveRows, useLiveData, EmptyState } from '../dataConnect';
import { apiRequest, serverMessage } from '@/lib/queryClient';
import { usePublishSurfaceContext } from '../surfaceContext';
import { useSurfaceActionHandlers, notifySurfaceActionReady } from '../surfaceActions';
import type { SurfaceViewProps } from '../surfaceViews';
import {
  // Canonical reference config (kept — not fixture DATA): the node-type display
  // map (label/icon/tone per nodeType) and the regulatory-framework catalog.
  LINEAGE_NODE_TYPES,
  LINEAGE_FRAMEWORKS,
  type LineageFrameworkAssessment,
  type LineageGraph,
  type LineageNode,
  type LineageNodeTypeConfig,
  type LineageChain,
} from '../fixtures/decision-lineage-data';
import '../styles/project-home-v2.css';
import { downloadBlob } from '../download';

/* ── Helpers ── */

function dlTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return iso;
  }
}

/** How each framework standing reads in the aside. Never "attested". */
const FW_STATUS_LABEL: Record<LineageFrameworkAssessment['status'], string> = {
  COMPLIANT: 'Chain verified',
  REVIEW_REQUIRED: 'Chain verification failed — review required',
  UNVERIFIABLE: 'Chain verifier could not run',
  NOT_ASSESSED: 'Not assessed by this trail',
};

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

  /* AnA can open the lineage graph for an artifact by its label — the same row
     click a person makes — so a drive can land on a specific artifact's
     derivation. Resolved against the REAL graphs with honest misses; held
     (retry) while they load, re-attempted on the ready signal below. */
  useSurfaceActionHandlers('decision-lineage', {
    'decision-lineage.select-graph': (params) => {
      const raw = String(params.artifact ?? '').trim();
      if (!raw) return { ok: false, reason: 'Name an artifact by its label.' };
      if (loading) return { ok: false, reason: 'The lineage graphs are still loading.', retry: true };
      if (error) return { ok: false, reason: 'The lineage graphs did not load, so there are none to open.' };
      if (graphs.length === 0) return { ok: false, reason: 'No decision-lineage graphs are recorded yet.' };
      const needle = raw.toLowerCase();
      let idx = graphs.findIndex((x) => x.artifactLabel.toLowerCase() === needle);
      if (idx < 0) {
        const partial = graphs
          .map((x, i) => ({ label: x.artifactLabel.toLowerCase(), i }))
          .filter((p) => p.label.includes(needle));
        if (partial.length === 0) return { ok: false, reason: `No artifact labelled "${raw}".` };
        if (partial.length > 1) return { ok: false, reason: `"${raw}" matches ${partial.length} artifacts — name one exactly.` };
        idx = partial[0].i;
      }
      if (sel === idx) return { ok: true, detail: `Already on ${graphs[idx].artifactLabel}` };
      setSel(idx);
      return { ok: true, detail: `Opened ${graphs[idx].artifactLabel}` };
    },
  });
  useEffect(() => {
    if (!loading && !error) notifySurfaceActionReady('decision-lineage');
  }, [loading, error]);

  // Export runner state — which format is in flight, and the last error (shown
  // inline by the export controls). The surface has no toast; keep it contained.
  const [exportBusy, setExportBusy] = useState('');
  const [exportErr, setExportErr] = useState('');

  const nodes: LineageNode[] = (g && g.nodes) || [];
  const md = (g && g.metadata) || { totalDecisions: 0, totalApprovals: 0, totalRejections: 0, totalDelegations: 0 };

  /* WO-16C #70, second follow-up review. `signatureStatus === 'pending'` is an
     approval step nobody has decided yet — `workflow_approvals.status`, which
     carries no signature information at all. These are steps AWAITING A
     DECISION, and the surface now says that rather than "pending signature";
     the server no longer emits a 'signed' value for this field, because
     nothing here reads a signature store. */
  const awaitingDecisionNodes = useMemo(
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
  const awaitingDecision = awaitingDecisionNodes.length > 0;

  /* The per-framework standings the SERVER computed for this trail, joined to
     the section citations in the reference catalogue. A framework the server
     does not send is not shown; the catalogue supplies citations, never a
     status. */
  const frameworkRows = useMemo(() => {
    const assessed: LineageFrameworkAssessment[] = (md as { complianceFrameworks?: LineageFrameworkAssessment[] })
      .complianceFrameworks ?? [];
    return assessed.map((a) => ({
      framework: a.framework,
      status: a.status,
      sections: LINEAGE_FRAMEWORKS.find((f) => f.framework === a.framework)?.sections ?? [],
    }));
  }, [md]);
  const lastNode = nodes[nodes.length - 1] || ({} as LineageNode);

  /* answer-first verdict.

     WO-16C #70, second follow-up review. The locked branch used to open "This
     artifact is fully defensible … all Part-11 signed", and close "with the
     electronic signature manifestation attached. The chain is cryptographically
     verified." Three assertions, none of them checked: `isLocked` is only
     `nodes.some(n => n.action === 'locked')`, no signature store is read on
     this surface or in the service behind it, and the chain result lives in
     `chainState` — which this text did not consult and which can be
     unverifiable. The awaiting branch called the open step "approved, pending
     electronic signature"; a step with `signatureStatus === 'pending'` has not
     been approved, it has not been decided.

     What each branch says now is what the trail records. The chain verdict is
     rendered from the live result in the panel beside it, once. */
  const lead = isLocked
    ? {
        tone: 'good' as const,
        h: (
          <>
            This artifact&apos;s decision trail runs <b>through to lock</b> — {md.totalDecisions}{' '}
            governed decision{md.totalDecisions === 1 ? '' : 's'} and {md.totalApprovals} approval
            {md.totalApprovals === 1 ? '' : 's'}, ending in a lock record.
          </>
        ),
        b: (
          <>
            If an inspector asks &quot;how did this document come to say what it says?&quot;, this is
            the trail — each step with the actor and the time its own record carries. Whether a
            binding §11 signature was applied is not read here; the hash-chain result is in the
            panel on the right.
          </>
        ),
        re: 'Nothing here was reconstructed after the fact — each record was written when the action happened and cannot be altered without breaking the chain.',
      }
    : awaitingDecision
      ? {
          tone: 'calm' as const,
          h: (
            <>
              The trail is <b>open</b> — {md.totalDecisions} decision
              {md.totalDecisions === 1 ? '' : 's'} recorded, {awaitingDecisionNodes.length} step
              {awaitingDecisionNodes.length === 1 ? '' : 's'} still awaiting a decision.
            </>
          ),
          b: (
            <>
              Every step recorded so far is on the hash-chained audit store. Once the open step is
              decided, a binding §11 signature is applied in the authoring workspace — this surface
              records the decision, it does not read the signature.
            </>
          ),
          re: 'A revision a reviewer requested is captured in the trail too — better the reviewer sees you addressed it than wonders if you did.',
        }
      : {
          tone: 'calm' as const,
          h: (
            <>
              This artifact is still moving through review — the decision trail is <b>open</b> at
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
          re: "Nothing is lost while it's in flight — the trail captures every handoff, including the delegation, so accountability is never ambiguous.",
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
        // `j.error` was read before `j.message`, so an envelope shaped
        // { error: 'FORBIDDEN', message: '<a real sentence>' } showed the enum
        // token. serverMessage reads the sentence first and rejects codes and
        // infrastructure text outright.
        setExportErr(serverMessage(j) ?? 'Export failed (HTTP ' + res.status + ').');
        return;
      }
      const blob = await res.blob();
      const cd = res.headers.get('Content-Disposition') || '';
      const m = /filename="?([^";]+)"?/.exec(cd);
      const filename = (m && m[1]) || ('decision-lineage-' + g.rootEntityId + '.' + fmt);
      downloadBlob(filename, blob);
    } catch (e) {
      // `String(e)` rendered anything at all — including the browser's own
      // "Failed to fetch" and non-Error throws. Only ApiRequestError has been
      // through the envelope reduction, so only it is shown.
      const known = (e as { name?: unknown })?.name === 'ApiRequestError';
      setExportErr(
        known && (e as Error).message
          ? (e as Error).message
          : 'Could not reach the lineage export service. No file was produced.',
      );
    } finally {
      setExportBusy('');
    }
  };

  /* WHAT ANA SEES HERE. This is the surface that answers "when did this change,
     who approved it, and what source does it trace back to", so the context has
     to carry the chain verdict rather than just the trail. `chainVerified` is
     three-valued on purpose — verified, broken, and not-yet-answered are three
     different facts, and collapsing the third into "broken" would have AnA
     report tampering on a slow endpoint. */
  const anaContext = useMemo(() => {
    // Publish NO counts while loading or on a failed read — a zeroed trailCount
    // beside an 'error' flag reads as a false "0 governed trails" on a Part-11
    // audit-trail surface. Only the success branch carries facts.
    if (loading) {
      return { summary: 'Decision lineage, still loading the org\'s governed decision trails.' };
    }
    if (error) {
      return {
        summary: 'Decision lineage could not be loaded — the trails are unavailable, not empty.',
        availableActions: ['Retry the decision-lineage read'],
      };
    }
    return {
      summary: empty
        ? 'Decision lineage: no governed decision trails recorded for this org yet.'
        : `Decision lineage: ${graphs.length} governed trail(s)` +
          (g ? `, "${g.artifactLabel}" selected with ${g.nodes?.length ?? 0} node(s)` : '') + '.',
      facts: {
        trailsState: empty ? 'empty' : 'ready',
        trailCount: graphs.length,
        ...(g
          ? {
              selectedArtifact: g.artifactLabel,
              selectedRootType: g.rootEntityType,
              selectedRootId: g.rootEntityId,
              nodeCount: g.nodes?.length ?? 0,
              edgeCount: g.edges?.length ?? 0,
            }
          : {}),
        // Absent is not "broken". See the comment above.
        chainIntegrity: chainState.loading ? 'not-yet-checked' : (chain?.chainIntegrity ?? 'unavailable'),
        ...(chain
          ? { chainEntriesVerified: chain.entriesVerified, chainComplianceStatus: chain.complianceStatus }
          : {}),
      },
      availableActions: [
        'Explain this decision trail — what changed, when, who approved it',
        'Trace a value back to its source document',
        'Explain what the hash-chain verification result means',
        'Export this lineage trail',
      ],
    };
  }, [loading, error, empty, graphs.length, g, chainState.loading, chain]);
  usePublishSurfaceContext('decision-lineage', anaContext);

  return (
    <div className="dl">
      <div className="dl-head">
        <div className="dl-eyebrow">
          <span className="dl-kicker">Governed decision lineage</span>
        </div>
        <h1 className="dl-title">Decision lineage &amp; provenance</h1>
        <div className="dl-sub">
          The immutable, Part-11 hash-chained trail behind every governed artifact — who decided
          what, when, on what evidence.
        </div>
      </div>

      {loading ? (
        <div role="status" className="scaf-note" style={{ padding: '28px 14px' }}>
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
          // `signatureStatus === 'pending'` is an undecided approval step, not
          // a signature waiting to be applied — see the note on
          // awaitingDecisionNodes above.
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
                {locked ? 'Locked' : pend ? 'Awaiting decision' : 'In review'}
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
        {/* the chain — the deliverable */}
        <div className="dl-chain-wrap">
          <div className="dl-chain-hd">
            <span className="dl-chain-t">Decision trail</span>
            <span className="dl-chain-s">
              {nodes.length} records — read top to bottom
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
                        <span className="dl-node-when">
                          {n.performedAt ? dlTime(n.performedAt) : 'not recorded'}
                        </span>
                      </div>
                      <div className="dl-node-who">
                        {n.performedBy || 'unattributed'}
                        {n.performedByRole ? (
                          <span className="dl-node-role"> — {n.performedByRole}</span>
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
                                      (n.details.version ? ' — ' + n.details.version : '')
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
                        {/* WO-16C finding 70: this badge used to render from a
                            server-side literal `cfr11Compliant: true`, so every
                            node in every trail carried a Part 11 verdict nothing
                            computed. It now renders the per-record element check
                            the server actually performs, in both directions. */}
                        {n.regulatory && n.regulatory.part11RecordCheck && (
                          <span
                            className={
                              'dl-badge' +
                              (n.regulatory.part11RecordCheck.status === 'COMPLETE' ? ' cfr' : '')
                            }
                            title={
                              n.regulatory.part11RecordCheck.status === 'COMPLETE'
                                ? 'This record carries what 21 CFR Part 11 requires an entry to carry: an attributed actor and a recorded timestamp. Not a compliance verdict.'
                                : [
                                    n.regulatory.part11RecordCheck.missing.length
                                      ? 'This record is missing: ' +
                                        n.regulatory.part11RecordCheck.missing
                                          .map((m) => m.replace(/-/g, ' '))
                                          .join(', ')
                                      : '',
                                    n.regulatory.part11RecordCheck.notAssessed.length
                                      ? 'Not checked here: ' +
                                        n.regulatory.part11RecordCheck.notAssessed
                                          .map((m) => m.replace(/-/g, ' '))
                                          .join(', ') +
                                        '. This surface reads no signature store, so an approval status is not taken as a signature.'
                                      : '',
                                  ]
                                    .filter(Boolean)
                                    .join(' ')
                            }
                          >
                            {n.regulatory.part11RecordCheck.status === 'COMPLETE'
                              ? 'Part 11 record complete'
                              : n.regulatory.part11RecordCheck.status === 'PARTIAL'
                                ? 'Part 11 record partly checked'
                                : 'Part 11 record incomplete'}
                          </span>
                        )}
                        {/* WO-16C #70, second follow-up review: the 'Signed'
                            badge came from `status === 'approved'` relabelled.
                            No signature store is read on this surface or in the
                            service behind it, so the only honest readings are
                            "no signature, and here is why" and "not checked". */}
                        {n.regulatory && n.regulatory.requiresSignature && (
                          <span
                            className={'dl-badge sig ' + (sigStatus || 'not_assessed')}
                            title={
                              sigStatus === 'pending' || sigStatus === 'rejected'
                                ? 'The source record positively shows no signature has been applied.'
                                : 'This surface reads no signature store, so it cannot say whether a §11.50 signature was applied. The authoring workspace holds the binding signatures.'
                            }
                          >
                            {sigStatus === 'pending'
                              ? 'Unsigned — awaiting decision'
                              : sigStatus === 'rejected'
                                ? 'Unsigned — rejected'
                                : 'Signature not checked here'}
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
                {/* WO-16C #70, second follow-up review: this sentence printed
                    "N audit entries cryptographically verified — tamper-evident"
                    beside the words "Hash chain unverified" whenever the
                    verifier came back INTEGRITY_FAILURE, which is a 200. A
                    failed verification verified nothing; it found a break. */}
                <p className="dl-verify-b">
                  {chain.chainIntegrity === 'VERIFIED' ? (
                    <>
                      {(chain.entriesVerified || 0).toLocaleString()} audit entries cryptographically
                      verified — tamper-evident. Any alteration to a past record breaks the chain and
                      is detected.
                    </>
                  ) : (
                    <>
                      The chain check did not come back clean over{' '}
                      {(chain.entriesVerified || 0).toLocaleString()} audit entries. Treat the trail
                      as unverified until it does — the audit service has the detail.
                    </>
                  )}
                </p>
                <div className="dl-verify-meta">
                  <span>
                    {chain.chainIntegrity === 'VERIFIED' ? 'Verified' : 'Checked'}{' '}
                    {dlTime(chain.verifiedAt)}
                  </span>
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

          {/* WO-16C #71, second follow-up review. This block used to map a
              STATIC four-item constant and put a check beside each under the
              heading "Attested against" — an attestation computed from nothing
              and independent of the graph it sat next to. The server already
              assesses each framework (assessComplianceFrameworks in
              DecisionLineageService) and sends the result in the graph's own
              metadata: three follow the hash-chain verifier's three-valued
              result, and two are NOT_ASSESSED because nothing in this
              subsystem evaluates them. The client type said `string[]`, so the
              surface could not read them. It reads them now, and the section
              names each framework's standing instead of asserting conformance.
              The constant stays as what it always was — the section catalogue —
              and is looked up for the citations only. */}
          <div className="dl-frameworks">
            <div className="dl-fw-hd">Compliance frameworks</div>
            {frameworkRows.length === 0 ? (
              <div className="dl-fw-none">
                This trail carries no framework assessment.
              </div>
            ) : (
              frameworkRows.map((f, i) => (
                <div key={i} className="dl-fw">
                  <span className={'dl-fw-check st-' + f.status.toLowerCase().replace(/_/g, '-')}>
                    {f.status === 'COMPLIANT' ? I.check : f.status === 'REVIEW_REQUIRED' ? I.alertTriangle : I.minus}
                  </span>
                  <span className="dl-fw-main">
                    <span className="dl-fw-name">{f.framework}</span>
                    {f.sections.length > 0 && (
                      <span className="dl-fw-sec">{f.sections.join(' — ')}</span>
                    )}
                    <span className="dl-fw-st">{FW_STATUS_LABEL[f.status]}</span>
                  </span>
                </div>
              ))
            )}
          </div>

          {/* The control below is named for what it does: it opens the assistant
              with the request. It does not route anything to a signer, and is
              deliberately not wired to either candidate endpoint.

              POST /api/decision-lineage/record is real and mounted, but it
              RECORDS a decision into the tamper-evident GxP lineage chain (it
              carries a `requiresSignature` flag; it does not dispatch a
              signature, notify a signer, or create a signing task). Calling it
              here would write an entry into a regulated audit chain asserting a
              routing that never happened — worse than doing nothing, and not
              undoable the way a UI state is.

              The binding signature path is real elsewhere: POST
              /api/authoring/docs/:docId/e-sign writes authoring_signatures
              against a frozen document version. It needs an authoring docId,
              which this surface does not hold — its rows carry rootEntityId /
              artifactLabel for the lineage graph, not authoring document ids. So
              the honest thing is to say where signing happens rather than to
              guess an id into a §11 write. */}
          {awaitingDecision && (
            <>
            <button
              className="dl-cta"
              onClick={() => {
                ask(
                  'Prepare the ' +
                    (g?.artifactLabel || 'artifact') +
                    ' for the final Part-11 electronic signature: confirm the lineage is complete, then tell me what is needed to sign it in the authoring workspace.',
                );
              }}
            >
              {I.penLine} Prepare for signature with AnA
            </button>
            <div className="dl-sign-note">
              Opens the assistant — nothing is routed to a signer from here. A
              binding 21 CFR §11 signature is applied in the authoring workspace,
              where it is PIN-verified and sealed against a frozen version.
            </div>
            </>
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
        Lineage is sourced from the tamper-proof audit log — records are written when the action
        occurs and hash-chained per FDA 21 CFR Part 11 §11.10(e). The trail and its chain
        verification above are read live from this project's governed records.
      </p>
    </div>
  );
}
