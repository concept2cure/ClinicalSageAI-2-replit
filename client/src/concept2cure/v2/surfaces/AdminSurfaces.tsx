import React, { useState, useEffect, useMemo } from 'react';
import { I } from '../icons';
import { downloadText } from '../download';
import { useLiveRows, EmptyState } from '../dataConnect';
import { getAuthToken } from '@/utils/authToken';
import type { SurfaceViewProps } from '../surfaceViews';
import { usePublishSurfaceContext } from '../surfaceContext';
import {
  listedChoices,
  notifySurfaceActionReady,
  useSurfaceActionHandlers,
} from '../surfaceActions';
// Canonical config kept (not fixture DATA): AUDIT_KINDS is the audit-kind
// filter taxonomy the server's deriveKind() mirrors. The fixture DATA constants
// (audit log, workflow guide, app license, artifacts and access grants) were
// removed — every surface below now renders real persisted data, an honest
// empty state, or an honest error state.
import {
  AUDIT_KINDS,
} from '../fixtures/admin-data';
import type {
  AuditEntry,
} from '../fixtures/admin-data';
import { AuditEventChainBanner, auditEventChainForAna, useAuditEventChain } from './AuditEventChain';
import '../styles/project-home-v2.css';
import '../styles/ana-v2.css';
import '../styles/translation-v2.css';

/* `window.TXW_ADMIN` used to be published from the Setup panel below and was
   read by nothing in the repository. Its successor, the Translation workspace
   card, saved organizations.settings.translation — and nothing read that
   either: no server code consults it (the translation service takes each
   project's own target language, and approvalGuard() applies
   DEFAULT_GUARDRAILS without reading an org setting), as the card itself
   admitted. An audited save of a setting with no effect is a control that does
   nothing, so the card was removed in the settings/integrity audit of
   2026-10-17 (finding 5). */

/* ── Shared inline helpers ── */

interface AdminHeaderProps {
  eyebrow: string;
  title: React.ReactNode;
  sub?: string;
  actions?: React.ReactNode;
}

function AdminHeader({ eyebrow, title, sub, actions }: AdminHeaderProps) {
  return (
    <div className="ph">
      <div>
        <div className="ph-eyebrow">{eyebrow}</div>
        <h1 className="ph-title">{title}</h1>
        {sub && <div className="ph-sub">{sub}</div>}
      </div>
      {actions && <div style={{ display: 'flex', gap: 8 }}>{actions}</div>}
    </div>
  );
}

/* Setup (org config) folded into Admin and access (D2, 2026-10-29;
   docs/evidence/D2-ONE-ANA/2026-10-29/fold-setup/). Its name and client type
   are OrganizationProfileCard.tsx, and every setting card it mounted is on
   admin-console's Settings tab (AdminSettings.tsx, mounted by AdminAccess.tsx).
   `setup` is an alias of admin-console that opens that tab (registryModel.ts);
   foldSetup.test.ts holds it. */

/** The ledger route's `meta.chain` (server/routes/audit-trail-ledger.routes.ts
 *  AuditLedgerChainVerdict), reduced to what the banner and AnA state. */
type ChainVerdictView = {
  verdict: 'intact' | 'broken' | 'unverified';
  /** The server's reason when it verified nothing (no chained rows). */
  reason: string | null;
  rowsChecked: number;
  legacyRows: number;
  sequencedRows: number;
  /**
   * Where it breaks, as this organisation may be told (audited-export.ts
   * breakForTenant): its own entry by id, another organisation's only as such.
   * `commitsTo` is the entry the stored hash derives from, 'genesis', or null
   * when no predecessor derives it.
   */
  brokenAt: { id: string | null; segment: string; commitsTo: string | null } | null;
};

/** The break's "commits to" as a phrase: an entry id, genesis, another organisation's entry, or nothing. */
function commitsToOf(v: unknown): string | null {
  if (v && typeof v === 'object' && typeof (v as { id?: unknown }).id === 'string') return `entry ${(v as { id: string }).id}`;
  return typeof v === 'string' ? (v === 'genesis' ? 'genesis' : `an entry of ${v}`) : null;
}

function readChainVerdict(meta: Record<string, unknown> | undefined): ChainVerdictView {
  const c = meta?.chain as
    | {
        ok?: unknown;
        reason?: unknown;
        rowsChecked?: unknown;
        legacyRows?: unknown;
        sequencedRows?: unknown;
        brokenAt?: { id?: unknown; segment?: unknown; commitsTo?: unknown } | null;
      }
    | undefined;
  const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
  if (!c || typeof c.ok !== 'boolean') {
    const reason = c && c.ok === null && typeof c.reason === 'string' ? c.reason : null;
    return { verdict: 'unverified', reason, rowsChecked: 0, legacyRows: 0, sequencedRows: 0, brokenAt: null };
  }
  const b = c.brokenAt;
  return {
    verdict: c.ok ? 'intact' : 'broken',
    reason: null,
    rowsChecked: n(c.rowsChecked),
    legacyRows: n(c.legacyRows),
    sequencedRows: n(c.sequencedRows),
    brokenAt: b && typeof b === 'object'
      ? { id: typeof b.id === 'string' ? b.id : null, segment: String(b.segment ?? ''), commitsTo: commitsToOf(b.commitsTo) }
      : null,
  };
}

function chainTone(v: ChainVerdictView): string {
  return v.verdict === 'intact' ? 'var(--success)' : v.verdict === 'broken' ? 'var(--error)' : 'var(--warning)';
}

function chainSummary(v: ChainVerdictView): string {
  if (v.verdict === 'unverified') {
    return v.reason
      ? `The chain is not verified: ${v.reason.replace(/\.$/, '')}`
      : 'The server returned no chain verdict on this read, so the chain is not verified here';
  }
  const span = `${v.rowsChecked} chained ${v.rowsChecked === 1 ? 'entry' : 'entries'} verified server-side (${v.sequencedRows} sequenced, ${v.legacyRows} legacy)`;
  if (v.verdict === 'intact') return `Hash chain verifies intact over ${span}`;
  return `Hash chain breaks at ${v.brokenAt?.id ? `entry ${v.brokenAt.id}` : "another organisation's entry"} (${v.brokenAt?.segment || 'unknown'} segment, ${
    v.brokenAt?.commitsTo ? `commits to ${v.brokenAt.commitsTo}` : 'content does not derive from any predecessor'
  }) over ${span}`;
}

/* ════════════ Audit trail — immutable hash-chain viewer (§11.10(e)) ════════════
   Live-anchored to GET /api/audit-trail/ledger (mounted in
   server/bootstrap/register-regulatory-routes.ts, router
   server/routes/audit-trail-ledger.routes.ts). REAL: an org-scoped, newest-first
   slice of the append-only, hash-chained `audit_events` table, returned in this
   surface's exact AuditEntry display shape — hash/prevHash are the real stored
   SHA-256 chain (genesis row → prevHash 'genesis'), sig is a genuine §11.50
   signed status, reason/meaning are the stored values, and event/target/kind are
   documented presentation derivations of real columns. No fixture: the surface
   renders real rows, an honest empty state, or an honest error (a 503 when the
   hash-chain schema isn't provisioned surfaces as the error state). */

/** Fetch the signed, hash-verifiable audit export bundle and download it as a
 *  JSON file. GET /api/audit/export/signed is Bearer-gated and returns
 *  { export: { data, manifest, signature, verification } } — the inspection-ready
 *  bundle an auditor can independently verify (HMAC-SHA256 over the manifest,
 *  SHA-256 of the data). Never throws; returns an honest ok/error. */
async function downloadSignedAuditExport(): Promise<{ ok: boolean; error?: string }> {
  try {
    const token = getAuthToken();
    const res = await fetch('/api/audit/export/signed?format=json', {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) {
      return {
        ok: false,
        error:
          res.status === 401 || res.status === 403
            ? 'Admin session required to export the audit trail.'
            : `Export failed (HTTP ${res.status}).`,
      };
    }
    const json = (await res.json().catch(() => null)) as { export?: unknown } | null;
    if (!json?.export) return { ok: false, error: 'The export response was malformed.' };
    const saved = downloadText(
      'audit-trail-signed-export.json',
      JSON.stringify(json.export, null, 2),
      'application/json',
    );
    if (!saved) return { ok: false, error: 'The export was produced but the browser refused the download.' };
    return { ok: true };
  } catch {
    // Raw fetch: the only throw reachable here is the request itself failing,
    // whose native message is "Failed to fetch" — not an export failure the
    // server described, and not copy.
    return { ok: false, error: 'Export failed.' };
  }
}

/** The account beside an actor's name: a name alone does not say which account acted (VSR-001 F-42). */
function ActorRef({ value }: { value?: string | null }) {
  if (!value) return null;
  return (
    <span className="mono" style={{ marginLeft: 6, fontSize: 10.5, color: 'var(--text-400)' }}>
      {value}
    </span>
  );
}

export function AuditTrail({ onAsk, onNav }: SurfaceViewProps) {
  const [kind, setKind] = useState('all');
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<string | null>(null);
  const [chainView, setChainView] = useState(false);
  const [exporting, setExporting] = useState(false);
  const term = q.toLowerCase();

  // Real hash-chained ledger. useLiveRows unwraps the { success, data } envelope,
  // returns a fresh [] while loading / on error (rendered directly, so no seed
  // loop), and sets `error` only on a genuine fetch failure.
  const { rows: entries, loading, error, status: readStatus, meta } = useLiveRows<AuditEntry>('/api/audit-trail/ledger');
  // The second chain (audit_events), read on its own: its verdict is stated
  // whatever the ledger read does (AuditEventChain.tsx, folded from part11-console).
  const eventChain = useAuditEventChain();

  const log = entries.filter(
    (e) =>
      (kind === 'all' || e.kind === kind) &&
      (!term ||
        e.event.toLowerCase().includes(term) ||
        e.actor.toLowerCase().includes(term) ||
        (e.actorRef ?? '').toLowerCase().includes(term) ||
        e.target.toLowerCase().includes(term) ||
        (e.targetRef ?? '').toLowerCase().includes(term) ||
        e.id.toLowerCase().includes(term)),
  );

  const kindCounts = AUDIT_KINDS.map((k) => ({
    ...k,
    n: k.id === 'all' ? entries.length : entries.filter((e) => e.kind === k.id).length,
  }));

  const kindColor: Record<string, string> = {
    esign: 'var(--accent-200)',
    authoring: 'var(--info)',
    review: 'var(--warning)',
    submission: 'var(--success)',
    vault: 'var(--ai)',
    validation: 'var(--text-300)',
    admin: 'var(--text-400)',
  };

  const entry = sel ? entries.find((e) => e.id === sel) : null;

  // REAL, audited signed export — GET /api/audit/export/signed streams the
  // inspection-ready bundle (data + manifest + HMAC signature) which downloads
  // as a JSON file. Honest failure surfaced inline; nothing is faked.
  const [exportErr, setExportErr] = useState('');
  const doExport = async () => {
    setExporting(true);
    setExportErr('');
    const r = await downloadSignedAuditExport();
    if (!r.ok) setExportErr(r.error || 'Could not generate the signed export.');
    setExporting(false);
  };

  /* Hash-chain verdict — the SERVER's (route meta.chain, computed by the one
     verifier over the tenant's whole audit_logs chain). This surface used to
     count prevHash === next.hash over the rows on screen; that window merges
     two stores, is cut by `limit`, and since the chain became per tenant a
     legacy row may legitimately link to the global head — so the count was
     not a verdict. No verdict from the server is reported as exactly that,
     never as "intact". */
  const chainStatus = readChainVerdict(meta);

  /* What AnA can see of this screen.
     A FAILED read publishes the failure, and on this surface that is not a
     nicety: the audit trail is the 21 CFR Part 11 §11.10(e) record, and an
     assistant reporting "no audit events" because the ledger did not respond
     would be asserting the absence of a regulated record. The surface itself
     already refuses to render that as an empty state; the same rule applies to
     what AnA is told.

     The hash-chain verdict travels with it, because "intact" is the claim an
     inspector acts on and it is computed here from the rows on screen. So
     does the second chain's (audit_events), in every state of the ledger read,
     because its read does not depend on that one. */
  const anaContext = useMemo(() => {
    const second = auditEventChainForAna(eventChain.read);
    if (loading) {
      return { summary: `The audit trail is still loading; nothing on screen is final yet. ${second.sentence}`, facts: second.facts };
    }
    if (error) {
      return {
        summary:
          'The append-only, hash-chained Part 11 ledger could not be read, so this screen is showing no ' +
          'audit events because of a failure. That is NOT the same as the trail being empty and must not ' +
          `be reported as one. ${second.sentence}`,
        facts: second.facts,
        availableActions: ['Retry the audit-trail read'],
      };
    }
    const filtered = kind !== 'all' || term.length > 0;
    return {
      summary:
        `Audit trail: ${entries.length} hash-chained ${entries.length === 1 ? 'entry' : 'entries'}` +
        (filtered ? `, filtered to ${log.length} by kind "${kind}"${term ? ` and the search "${q}"` : ''}` : '') +
        `. ${chainSummary(chainStatus)}. ${second.sentence}` +
        (entry ? ` Entry ${entry.id} is open.` : ''),
      facts: {
        ...second.facts,
        totalEntries: entries.length,
        shownInList: log.length,
        kindFilter: kind,
        searchTerm: term || null,
        entriesByKind: Object.fromEntries(kindCounts.map((k) => [k.id, k.n])),
        hashChain: chainStatus,
        hashChainViewOpen: chainView,
        // Enough to name an event back to the user, not the whole ledger.
        // `actor` (an individual's name, or an email via the server's
        // actorName fallback) and `reason` (user-authored signing/decision
        // free-text) are deliberately NOT published: the name/email is PII and
        // the free-text is both sensitive content and a prompt-injection vector
        // folded verbatim into the model prompt. `meaning` (an
        // APPROVAL/AUTHORSHIP/… enum) and `hasReason` carry the same grounding
        // without the payload — the way this block already omits `e.ip`. The
        // actor and reason stay on the ledger row, where the person reads them.
        recentEntries: log.slice(0, 10).map((e) => ({
          id: e.id, when: e.when, event: e.event,
          target: e.target, kind: e.kind, eSigned: e.sig,
          hasReason: Boolean(e.reason), meaning: e.meaning,
        })),
        selectedEntry: entry
          ? {
              id: entry.id, when: entry.when, event: entry.event,
              target: entry.target, kind: entry.kind, eSigned: entry.sig,
              hasReason: Boolean(entry.reason), meaning: entry.meaning,
            }
          : null,
        lastExportFailure: exportErr || null,
      },
      availableActions: [
        'Filter the ledger by event kind, or search actor, event, target or entry id',
        'Open an entry to read its reason, signature meaning and chain links',
        'Show the hash-chain view',
        'Export the signed, inspection-ready audit bundle (data + manifest + HMAC signature)',
      ],
    };
  }, [loading, error, entries, log, kind, term, q, kindCounts, chainStatus, chainView, entry, exportErr, eventChain.read]);
  /* AnA's hands on this screen (wave 7). The audit trail is where the training
     demonstration ends and where an inspector starts, and she had no action
     here at all: she could walk in and then do nothing. Every handler drives
     the same state the controls above drive — the kind buttons, the search
     box, a row click, the hash-chain toggle. Reading only: the signed export
     is a governed act and stays a human one. */
  useSurfaceActionHandlers('audit-trail', {
    'audit-trail.filter-entries': (params) => {
      const wanted = (params.kind ?? '').trim().toLowerCase();
      const legal = AUDIT_KINDS.map((k) => k.id);
      if (!legal.includes(wanted)) {
        return { ok: false, reason: `No audit kind "${params.kind}" — this ledger files events as ${legal.join(', ')}.` };
      }
      if (loading) return { ok: false, reason: 'The audit trail is still loading.', retry: true };
      if (error) {
        return {
          ok: false,
          reason:
            'The hash-chained ledger could not be read, so there is nothing on screen to filter. ' +
            'That is not the same as the trail being empty.',
        };
      }
      if (entries.length === 0) return { ok: false, reason: 'This workspace has no audit entries yet, so there is nothing to filter.' };
      const n = wanted === 'all' ? entries.length : entries.filter((e) => e.kind === wanted).length;
      const label = AUDIT_KINDS.find((k) => k.id === wanted)?.label ?? wanted;
      if (kind === wanted) return { ok: true, detail: `Already filtered to ${label} (${n} entries)` };
      setKind(wanted);
      // A kind with no entries still applies; the count is told truthfully
      // rather than letting an empty table read as an empty ledger.
      return { ok: true, detail: `Filtered to ${label} — ${n} of ${entries.length} entries` };
    },
    'audit-trail.search': (params) => {
      const wanted = (params.query ?? '').trim();
      if (!wanted) return { ok: false, reason: 'Name what to search the audit trail for.' };
      if (loading) return { ok: false, reason: 'The audit trail is still loading.', retry: true };
      if (error) return { ok: false, reason: 'The hash-chained ledger could not be read, so there is nothing on screen to search.' };
      if (entries.length === 0) return { ok: false, reason: 'This workspace has no audit entries yet, so there is nothing to search.' };
      setQ(wanted);
      const hits = entries.filter(
        (e) =>
          (kind === 'all' || e.kind === kind) &&
          [e.id, e.event, e.target, e.actor].some((f) => String(f ?? '').toLowerCase().includes(wanted.toLowerCase())),
      ).length;
      return { ok: true, detail: `Searched the audit trail for "${wanted}" — ${hits} matching ${hits === 1 ? 'entry' : 'entries'}` };
    },
    'audit-trail.select-entry': (params) => {
      const wanted = (params.entry ?? '').trim();
      if (!wanted) return { ok: false, reason: 'Name an audit entry to open.' };
      if (loading) return { ok: false, reason: 'The audit trail is still loading.', retry: true };
      if (error) return { ok: false, reason: 'The hash-chained ledger could not be read, so there are no entries to open.' };
      if (log.length === 0) {
        return {
          ok: false,
          reason:
            entries.length === 0
              ? 'This workspace has no audit entries yet.'
              : 'No entries match the filter and search on screen, so there is none to open.',
        };
      }
      const lower = wanted.toLowerCase();
      const exact = log.find((e) => e.id.toLowerCase() === lower);
      const contains = exact ? [] : log.filter((e) => [e.id, e.event, e.target].some((f) => String(f ?? '').toLowerCase().includes(lower)));
      const match = exact ?? (contains.length === 1 ? contains[0] : null);
      if (!match) {
        return {
          ok: false,
          reason:
            (contains.length > 1
              ? `"${wanted}" matches ${contains.length} entries — name one exactly.`
              : `No audit entry matching "${wanted}" on screen.`) + listedChoices(log.slice(0, 8).map((e) => e.id), 'On screen'),
        };
      }
      if (sel === match.id) return { ok: true, detail: `Already showing ${match.id}` };
      setSel(match.id);
      return { ok: true, detail: `Opened ${match.id} — ${match.event}` };
    },
    'audit-trail.set-chain-view': (params) => {
      const want = (params.state ?? '').trim().toLowerCase();
      if (want !== 'shown' && want !== 'hidden') {
        return { ok: false, reason: `"${params.state}" is not a hash-chain view state — choose shown or hidden.` };
      }
      const next = want === 'shown';
      if (chainView === next) return { ok: true, detail: `The hash chain is already ${want}` };
      setChainView(next);
      return { ok: true, detail: next ? 'Showing the hash chain' : 'Hid the hash chain' };
    },
    'audit-trail.close-entry': () => {
      if (!sel) return { ok: true, detail: 'No audit entry is open' };
      const was = sel;
      setSel(null);
      return { ok: true, detail: `Closed ${was}` };
    },
  });
  /* The ready signal for the holds above. Gated on the read settling and
     nothing else: a failed read must reach a held action as the handler's own
     refusal, not as a twenty-second timeout (surfaceReadySignal.test.ts). */
  useEffect(() => {
    if (!loading) notifySurfaceActionReady('audit-trail');
  }, [loading]);
  usePublishSurfaceContext('audit-trail', anaContext);

  return (
    <div className="page-inner">
      <AdminHeader
        eyebrow="Admin — compliance"
        title="Audit trail"
        sub={`${entries.length} ${entries.length === 1 ? 'entry' : 'entries'} — hash-chained — append-only — 21 CFR Part 11 §11.10(e)`}
        actions={
          <React.Fragment>
            <button
              className={`btn ghost${chainView ? ' on' : ''}`}
              onClick={() => setChainView((v) => !v)}
              style={
                chainView
                  ? { background: 'var(--accent-000)', borderColor: 'var(--accent-100)' }
                  : {}
              }
            >
              {I.link || I.network} Hash chain
            </button>
            {/* The scoped, per-question reports (access review, sign-ins,
                signatures, retention) are sealed the same way and live on
                their own surface. */}
            <button type="button" className="btn ghost" onClick={() => onNav('compliance-reports')}>
              {I.fileCheck} Compliance reports
            </button>
            <button className="btn primary" onClick={doExport} disabled={exporting}>
              {I.scroll} {exporting ? 'Generating…' : 'Export signed bundle'}
            </button>
          </React.Fragment>
        }
      />
      {exportErr && (
        <div className="scaf-note" role="alert" style={{ padding: '10px 12px', margin: '0 0 12px', color: 'var(--error)', border: '1px solid var(--error)', borderRadius: 8 }}>
          {exportErr}
        </div>
      )}

      {loading ? (
        <div role="status" className="scaf-note" style={{ padding: '18px 10px', maxWidth: 680 }}>
          Loading audit trail…
        </div>
      ) : error && readStatus === 403 ? (
        /* A refusal is not an outage (QA 2026-10-08, j8): a member was told the
           ledger "didn't respond" and to retry, when the server had refused the
           read for the member's role. The server's own sentence says who reads it. */
        <EmptyState
          icon={I.lock}
          title="The audit trail is not available to your role"
          hint={error}
        />
      ) : error ? (
        <EmptyState
          tone="error"
          icon={I.alertTriangle}
          title="Couldn't load the audit trail"
          hint="The append-only, hash-chained 21 CFR Part 11 ledger didn't respond. Sign in and retry, or check the audit service is reachable — the trail is never shown as an empty 'no events' state when it can't be read."
        />
      ) : entries.length === 0 ? (
        <EmptyState
          icon={I.scroll}
          title="No audit entries yet"
          hint="Governed actions — authoring, review, submission, vault locks and e-signatures — are written here to the immutable hash-chained ledger as they happen."
        />
      ) : (
        <React.Fragment>
      {/* Chain integrity banner */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '10px 14px',
          borderRadius: 8,
          background: `color-mix(in srgb,${chainTone(chainStatus)} 10%,transparent)`,
          border: `1px solid ${chainTone(chainStatus)}`,
          marginBottom: 16,
          maxWidth: 680,
        }}
      >
        <span style={{ fontSize: 18 }}>
          {chainStatus.verdict === 'intact' ? I.shieldCheck : I.alertTriangle}
        </span>
        <div style={{ flex: 1 }}>
          <div
            style={{
              fontWeight: 600,
              fontSize: 13,
              color: chainTone(chainStatus),
            }}
          >
            {chainStatus.verdict === 'intact'
              ? 'Hash chain intact'
              : chainStatus.verdict === 'broken'
                ? 'Chain verification failed'
                : 'Chain not verified'}
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--text-400)', marginTop: 2 }}>
            {chainSummary(chainStatus)} — SHA-256 — append-only ledger
          </div>
        </div>
        <span className="mono" style={{ fontSize: 10, color: 'var(--text-400)' }}>
          HEAD {entries[0]?.hash}
        </span>
      </div>
      {/* The second verdict: the audit_events chain, which the one above does not cover. */}
      <AuditEventChainBanner read={eventChain.read} onRetry={eventChain.retry} />

      {/* Filters */}
      <div
        style={{
          display: 'flex',
          gap: 10,
          marginBottom: 16,
          flexWrap: 'wrap',
          alignItems: 'center',
        }}
      >
        <div className="vault-search" style={{ flex: '1 1 240px', maxWidth: 360 }}>
          <span className="ico">{I.search}</span>
          <input
            aria-label="Search audit trail entries"
            placeholder="Search entries..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <div className="seg" style={{ flexWrap: 'wrap' }}>
          {kindCounts.map((k) => (
            <button
              key={k.id}
              className={`seg-b${kind === k.id ? ' on' : ''}`}
              onClick={() => setKind(k.id)}
            >
              {k.label}
              <span className="mono" style={{ fontSize: 10, marginLeft: 4, opacity: 0.6 }}>
                {k.n}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Hash chain view */}
      {chainView && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 0,
            marginBottom: 20,
            maxWidth: 720,
            position: 'relative',
          }}
        >
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-300)', marginBottom: 8 }}>
            Hash chain — newest to oldest
          </div>
          {entries.map((e, i) => (
            <div key={e.id} style={{ display: 'flex', alignItems: 'stretch', gap: 0 }}>
              <div
                style={{
                  width: 32,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                }}
              >
                <div
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: '50%',
                    background: e.sig ? 'var(--accent-200)' : 'var(--bg-300)',
                    border:
                      '2px solid ' + (e.sig ? 'var(--accent-200)' : 'var(--border)'),
                    flexShrink: 0,
                    marginTop: 8,
                  }}
                />
                {i < entries.length - 1 && (
                  <div style={{ width: 2, flex: 1, background: 'var(--border)' }} />
                )}
              </div>
              <button
                onClick={() => setSel(e.id)}
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'baseline',
                  gap: 8,
                  padding: '6px 10px',
                  borderRadius: 6,
                  background: sel === e.id ? 'var(--accent-000)' : 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  textAlign: 'left',
                  fontSize: 12,
                }}
              >
                <span
                  className="mono"
                  style={{ color: 'var(--accent-200)', fontSize: 10, flexShrink: 0 }}
                >
                  {e.id}
                </span>
                <span
                  className="mono"
                  style={{ color: 'var(--text-400)', fontSize: 10, flexShrink: 0 }}
                >
                  {e.hash}
                </span>
                <span
                  style={{
                    color: sel === e.id ? 'var(--text-100)' : 'var(--text-300)',
                    flex: 1,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {e.event}
                </span>
                {e.sig && (
                  <span style={{ color: 'var(--accent-200)', flexShrink: 0 }}>
                    {I.shieldCheck}
                  </span>
                )}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Main table */}
      <div className="ctable">
        <div
          className="ct-head"
          style={{ gridTemplateColumns: '90px 130px 110px 1fr 90px 40px 40px' }}
        >
          <div>ID</div>
          <div>When</div>
          <div>Actor</div>
          <div>Event</div>
          <div>Target</div>
          <div>Sig</div>
          <div></div>
        </div>
        {log.map((e) => (
          <button
            key={e.id}
            className="ct-row"
            data-on={sel === e.id || undefined}
            style={{
              gridTemplateColumns: '90px 130px 110px 1fr 90px 40px 40px',
              background: sel === e.id ? 'var(--accent-000)' : undefined,
            }}
            onClick={() => setSel(sel === e.id ? null : e.id)}
          >
            <div className="mono" style={{ color: 'var(--accent-200)', fontSize: 11 }}>
              {e.id}
            </div>
            <div className="mono" style={{ fontSize: 10.5, color: 'var(--text-400)' }}>
              {e.when}
            </div>
            <div style={{ fontSize: 12 }}>
              {e.actor}
              <ActorRef value={e.actorRef} />
            </div>
            <div style={{ fontWeight: 400, fontSize: 12 }}>
              <span
                style={{
                  display: 'inline-block',
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: kindColor[e.kind] || 'var(--text-400)',
                  marginRight: 6,
                  verticalAlign: 'middle',
                }}
              />
              {e.event}
            </div>
            <div style={{ color: 'var(--text-400)', fontSize: 11.5 }}>{e.target}</div>
            <div>
              {e.sig ? (
                <span className="esig" role="img" aria-label="E-signed (21 CFR Part 11)">{I.shieldCheck}</span>
              ) : (
                <span style={{ color: 'var(--text-500)' }}>--</span>
              )}
            </div>
            <div style={{ color: 'var(--text-400)', fontSize: 13 }}>{I.chevDown}</div>
          </button>
        ))}
      </div>

      {/* Detail drawer */}
      {entry && (
        <div
          style={{
            marginTop: 16,
            padding: 16,
            borderRadius: 'var(--radius-lg)',
            border: '1px solid var(--border)',
            background: 'var(--bg-100)',
            maxWidth: 720,
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 12,
            }}
          >
            <div style={{ fontWeight: 600, fontSize: 14 }}>{entry.id} — Entry detail</div>
            <button className="tbtn" aria-label="Close" onClick={() => setSel(null)} style={{ fontSize: 16 }}>
              {I.close}
            </button>
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '120px 1fr',
              gap: '8px 16px',
              fontSize: 12.5,
            }}
          >
            <span style={{ color: 'var(--text-400)', fontWeight: 500 }}>Event</span>
            <span style={{ fontWeight: 500 }}>{entry.event}</span>
            <span style={{ color: 'var(--text-400)', fontWeight: 500 }}>Actor</span>
            <span>
              {entry.actor}
              <ActorRef value={entry.actorRef} />
            </span>
            <span style={{ color: 'var(--text-400)', fontWeight: 500 }}>Timestamp</span>
            <span className="mono">{entry.when}</span>
            <span style={{ color: 'var(--text-400)', fontWeight: 500 }}>Target</span>
            <span>{entry.target}</span>
            {entry.targetRef && (
              <React.Fragment>
                <span style={{ color: 'var(--text-400)', fontWeight: 500 }}>Record</span>
                <span className="mono">{entry.targetRef}</span>
              </React.Fragment>
            )}
            {entry.signatureRef && (
              <React.Fragment>
                <span style={{ color: 'var(--text-400)', fontWeight: 500 }}>Signature record</span>
                <span className="mono">{entry.signatureRef}</span>
              </React.Fragment>
            )}
            <span style={{ color: 'var(--text-400)', fontWeight: 500 }}>Kind</span>
            <span>
              <span
                style={{
                  display: 'inline-block',
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: kindColor[entry.kind] || 'var(--text-400)',
                  marginRight: 6,
                  verticalAlign: 'middle',
                }}
              />
              {entry.kind}
            </span>
            <span style={{ color: 'var(--text-400)', fontWeight: 500 }}>Origin IP</span>
            <span className="mono">{entry.ip}</span>
            {entry.reason && (
              <React.Fragment>
                <span style={{ color: 'var(--text-400)', fontWeight: 500 }}>
                  Reason for change
                </span>
                <span style={{ fontStyle: 'italic' }}>{entry.reason}</span>
              </React.Fragment>
            )}
            {entry.meaning && (
              <React.Fragment>
                <span style={{ color: 'var(--text-400)', fontWeight: 500 }}>
                  Signature meaning
                </span>
                <span>
                  <span className="esig" style={{ marginRight: 6 }} role="img" aria-label="E-signed (21 CFR Part 11)">
                    {I.shieldCheck}
                  </span>
                  {entry.meaning} (§11.50)
                </span>
              </React.Fragment>
            )}
            <span style={{ color: 'var(--text-400)', fontWeight: 500 }}>Entry hash</span>
            <span className="mono" style={{ fontSize: 11, wordBreak: 'break-all' }}>
              SHA-256: {entry.hash}
            </span>
            <span style={{ color: 'var(--text-400)', fontWeight: 500 }}>Previous hash</span>
            <span className="mono" style={{ fontSize: 11, wordBreak: 'break-all' }}>
              {entry.prevHash === 'genesis' ? 'genesis block' : entry.prevHash}
            </span>
          </div>
          {entry.sig && (
            <div
              style={{
                marginTop: 12,
                padding: '8px 12px',
                borderRadius: 6,
                background: 'color-mix(in srgb,var(--success) 8%,transparent)',
                border: '1px solid var(--success)',
                fontSize: 11.5,
                display: 'flex',
                gap: 8,
                alignItems: 'center',
              }}
            >
              {I.shieldCheck}
              <span>
                This entry was digitally signed per 21 CFR §11.50. Meaning:{' '}
                <strong>{entry.meaning}</strong>. Signature is hash-bound and tamper-evident.
              </span>
            </div>
          )}
        </div>
      )}

      {/* Footer */}
      <div className="scaf-note" style={{ marginTop: 16, maxWidth: 760 }}>
        Entries are append-only, hash-chained (SHA-256), and timestamped. Each entry's hash
        incorporates the previous entry's hash, creating a verifiable chain. Any modification to a
        historical entry breaks the chain. Export downloads the entries as a signed JSON bundle:
        the data, a verification manifest and an HMAC-SHA256 signature over both.
      </div>
        </React.Fragment>
      )}
      {/* With no ledger rows on screen (loading, refused, failed or empty) the
          second chain's verdict still stands on its own read. */}
      {(loading || error || entries.length === 0) && (
        <AuditEventChainBanner read={eventChain.read} onRetry={eventChain.retry} />
      )}
    </div>
  );
}

// The catalog is implemented once in WorkflowCatalog. Keep Apps as the stable
// surface export/deep-link id.
export { Apps } from './WorkflowCatalog';

/* No Artifacts center. The gallery folded into the Vault as its organization
   view (D2, fold F3 slice C, 2026-10-29; surfaces/VaultOrganizationArtifacts.tsx,
   reached as 'vault', and 'artifacts-center' is an alias of it). Its read, GET
   /api/artifacts-center, is the Vault's now, bound to the projects the caller
   can open; its manifest, governed DOCX, editor hand-off and AnA focus moved
   with it. docs/evidence/D2-ONE-ANA/2026-10-29/fold-f3-vault/. */

/* No Admin Console. Its GAMP 5 validation package moved to administration's
   Settings as ValidationKitCard (decision P-67, surfaces/ValidationKitCard.tsx,
   mounted by AdminSettings.tsx), and every other section already had its home
   there: platform role grants (AdminPlatformGrants.tsx), API keys
   (AdminAccess.tsx, AdminApiKeyCreate.tsx, AdminApiKeyUsage.tsx), modules (the
   Apps catalogue, WorkflowCatalog.tsx), the organization profile
   (OrganizationProfileCard.tsx), session policy (SessionPolicySetting.tsx),
   the subscription (Licensing) and the audit trail (AuditTrail, above). It was
   unmounted from af973c5e8. docs/evidence/D4/2026-10-29/validation-kit-settings/. */
