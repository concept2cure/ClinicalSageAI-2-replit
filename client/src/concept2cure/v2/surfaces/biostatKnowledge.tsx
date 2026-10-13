/**
 * Biostatistics knowledge graph — the sponsor's own method precedent.
 *
 * Five `/api/biostat/knowledge/*` routes were mounted and reached by nothing.
 * This panel is their first caller. What each view can honestly show, and why
 * three of them are structurally empty, is in `biostatKnowledgeApi`'s header —
 * read that before changing an empty state here.
 *
 * CLAUDE.md RULE 2: a panel of the existing biostatistics workbench, not a new
 * destination.
 *
 * @module client/src/concept2cure/v2/surfaces/biostatKnowledge
 */
import React, { useCallback, useState } from 'react';
import {
  knowledgeApi,
  messageOf,
  PRECEDENT_STORE_EMPTY,
  type EndpointMethodMatrixEntry,
  type GraphQueryResult,
  type IngestResult,
  type MatrixFilters,
  type MethodLandscapeEntry,
  type MethodTrendEntry,
  type Read,
} from './biostatKnowledgeApi';
import { EmptyState } from '../dataConnect';
import { I } from '../icons';

/** A rate the server computed, as a percentage. Never a zero standing in. */
const pct = (v: unknown): string => (typeof v === 'number' && Number.isFinite(v) ? `${(v * 100).toFixed(1)}%` : '—');

/** One read, with its own failure. A failed read never renders as an empty one. */
function useRead<T>() {
  const [read, setRead] = useState<Read<T>>({ kind: 'idle' });
  const run = useCallback(async (fn: () => Promise<T>) => {
    setRead({ kind: 'loading' });
    try {
      setRead({ kind: 'ok', value: await fn() });
    } catch (e) {
      setRead({ kind: 'failed', message: messageOf(e) });
    }
  }, []);
  return { read, run };
}

/** The failure of a read, said as a failure. */
function ReadFailure({ read, what, retry }: { read: Read<unknown>; what: string; retry?: () => void }) {
  if (read.kind === 'loading') return <div role="status" className="scaf-note">Reading {what}…</div>;
  if (read.kind !== 'failed') return null;
  return <EmptyState tone="error" icon={I.alertTriangle} title={`${what} was not read`} hint={read.message} retry={retry} />;
}

/**
 * Why a precedent view holds nothing. It names this platform, not the
 * regulatory record — the distinction the whole view turns on.
 */
function PrecedentEmpty({ what }: { what: string }) {
  return (
    <EmptyState
      tone="idle"
      icon={I.info}
      title={`No regulatory outcome is recorded, so ${what} is empty`}
      hint={PRECEDENT_STORE_EMPTY}
    />
  );
}

/* ── Ingest ───────────────────────────────────────────────────────────────── */

/** Build the method graph from a CSR already in the sponsor's corpus. */
function IngestSection() {
  const [csrId, setCsrId] = useState('');
  const [invalid, setInvalid] = useState<string | null>(null);
  const { read, run } = useRead<IngestResult>();

  return (
    <section style={{ display: 'grid', gap: 8 }}>
      <div style={{ fontSize: 12, fontWeight: 600 }}>Build the graph from a CSR</div>
      <form
        style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}
        onSubmit={(e) => {
          e.preventDefault();
          const n = Number(csrId.trim());
          if (!Number.isInteger(n) || n <= 0) {
            setInvalid('A CSR id is a positive integer.');
            return;
          }
          setInvalid(null);
          void run(() => knowledgeApi.ingestCsr(n));
        }}
      >
        <label style={{ fontSize: 12 }}>
          CSR id
          <input className="c2c-input" style={{ height: 30 }} inputMode="numeric" value={csrId}
            onChange={(e) => setCsrId(e.target.value)} placeholder="e.g. 41" />
        </label>
        <button className="btn" style={{ height: 30 }} type="submit">{I.upload} Ingest</button>
      </form>
      {invalid && <div className="pde-refusal" role="status">{invalid}</div>}
      <ReadFailure read={read} what="the CSR" />
      {read.kind === 'ok' && (
        <div className="scaf-note" role="status">
          CSR {read.value.csrId}: {read.value.nodesCreated} node(s) and {read.value.edgesCreated} edge(s) recorded
          {read.value.indication ? ` for ${read.value.indication}` : ', with no indication on the report'}.
          {/* Said plainly, because the three precedent views below do not move. */}
          {' '}This builds the method graph; it records no agency decision.
        </div>
      )}
    </section>
  );
}

/* ── Query ────────────────────────────────────────────────────────────────── */

/** The rows a query matched. These are database rows, not a model's output. */
function QueryRows({ result }: { result: GraphQueryResult }) {
  if (result.nodes.length === 0) {
    return (
      <div style={{ fontSize: 12, color: 'var(--text-300,#6b6963)' }}>
        Nothing in your graph matched. Ingest a CSR above to build it.
      </div>
    );
  }
  return (
    <div style={{ overflowX: 'auto' }}>
      <table className="reg-tbl" aria-label="Nodes matched in the knowledge graph">
        <thead><tr><th scope="col">Type</th><th scope="col">Name</th><th scope="col">Seen in</th></tr></thead>
        <tbody>
          {result.nodes.map((n) => (
            <tr key={n.id}>
              <td>{n.nodeType.replace(/_/g, ' ')}</td>
              <td>{n.name}</td>
              {/* A null source count is "not recorded", not zero CSRs. */}
              <td className="mono">{n.sourceCount === null ? 'not recorded' : `${n.sourceCount} CSR(s)`}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Narration, labelled as narration; or the reason there is none. */
function QueryNarration({ result }: { result: GraphQueryResult }) {
  if (result.answer === null) {
    return (
      <div className="scaf-note" role="status">
        {result.answerUnavailableReason ?? 'No summary was returned. The rows below are the result.'}
      </div>
    );
  }
  return (
    <div style={{ display: 'grid', gap: 4 }}>
      <div style={{ fontSize: 11, color: 'var(--text-300,#6b6963)' }}>
        Narration over the rows below. It derives no figure; the counts and the rows are the result.
      </div>
      <div style={{ fontSize: 13, lineHeight: 1.5 }}>{result.answer}</div>
    </div>
  );
}

function QuerySection() {
  const [question, setQuestion] = useState('');
  const { read, run } = useRead<GraphQueryResult>();

  return (
    <section style={{ display: 'grid', gap: 8, borderTop: '1px solid var(--border-200,#e5e3df)', paddingTop: 10 }}>
      <div style={{ fontSize: 12, fontWeight: 600 }}>Ask the graph</div>
      <form
        style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}
        onSubmit={(e) => { e.preventDefault(); void run(() => knowledgeApi.query(question)); }}
      >
        <label style={{ fontSize: 12, flex: 1, minWidth: 260 }}>
          Question
          <input className="c2c-input" style={{ height: 30 }} value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="e.g. which methods have we used for HbA1c endpoints" />
        </label>
        <button className="btn" style={{ height: 30 }} type="submit" disabled={question.trim().length === 0}
          title={question.trim().length === 0 ? 'Type a question' : 'Search your graph'}>
          {I.search} Ask
        </button>
      </form>
      <ReadFailure read={read} what="the graph" />
      {read.kind === 'ok' && (
        <div style={{ display: 'grid', gap: 8 }}>
          {/* A parser outage is reported, so a short result is never its disguise. */}
          {!read.value.parsedByModel && read.value.parseNote && (
            <div className="pde-refusal" role="status">{read.value.parseNote}</div>
          )}
          <div style={{ fontSize: 11, color: 'var(--text-300,#6b6963)' }}>
            {read.value.matchedNodeCount} node(s) and {read.value.matchedEdgeCount} edge(s) matched.
          </div>
          <QueryNarration result={read.value} />
          <QueryRows result={read.value} />
        </div>
      )}
    </section>
  );
}

/* ── The three outcome-backed views ───────────────────────────────────────── */

/** Methods used for an indication, with the agency outcome of each. */
function LandscapeSection() {
  const [indication, setIndication] = useState('');
  const { read, run } = useRead<MethodLandscapeEntry[]>();

  return (
    <section style={{ display: 'grid', gap: 8, borderTop: '1px solid var(--border-200,#e5e3df)', paddingTop: 10 }}>
      <div style={{ fontSize: 12, fontWeight: 600 }}>Method landscape by indication</div>
      <form
        style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}
        onSubmit={(e) => { e.preventDefault(); void run(() => knowledgeApi.methodLandscape(indication.trim())); }}
      >
        <label style={{ fontSize: 12, flex: 1, minWidth: 220 }}>
          Indication
          <input className="c2c-input" style={{ height: 30 }} value={indication}
            onChange={(e) => setIndication(e.target.value)} placeholder="e.g. type 2 diabetes" />
        </label>
        <button className="btn" style={{ height: 30 }} type="submit" disabled={indication.trim().length === 0}>
          {I.search} Load
        </button>
      </form>
      <ReadFailure read={read} what="the method landscape" />
      {read.kind === 'ok' && read.value.length === 0 && <PrecedentEmpty what="the method landscape" />}
      {read.kind === 'ok' && read.value.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table className="reg-tbl" aria-label="Method landscape">
            <thead>
              <tr>
                <th scope="col">Method</th><th scope="col">Uses</th><th scope="col">Accepted</th>
                <th scope="col">Rejected</th><th scope="col">Acceptance rate</th>
                <th scope="col">Agencies</th><th scope="col">Phases</th>
              </tr>
            </thead>
            <tbody>
              {read.value.map((m) => (
                <tr key={m.methodName}>
                  <td>{m.methodName}</td>
                  <td className="mono">{m.totalUses}</td>
                  <td className="mono">{m.acceptedCount}</td>
                  <td className="mono">{m.rejectedCount}</td>
                  <td className="mono">{pct(m.successRate)}</td>
                  <td>{m.agencies.join(', ') || 'not recorded'}</td>
                  <td>{m.phases.join(', ') || 'not recorded'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/** Which methods have carried which endpoints, and how often they were accepted. */
function MatrixSection() {
  const [filters, setFilters] = useState<MatrixFilters>({});
  const { read, run } = useRead<EndpointMethodMatrixEntry[]>();
  const set = (k: keyof MatrixFilters) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setFilters((f) => ({ ...f, [k]: e.target.value }));

  return (
    <section style={{ display: 'grid', gap: 8, borderTop: '1px solid var(--border-200,#e5e3df)', paddingTop: 10 }}>
      <div style={{ fontSize: 12, fontWeight: 600 }}>Endpoint–method matrix</div>
      <form
        style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}
        onSubmit={(e) => { e.preventDefault(); void run(() => knowledgeApi.endpointMethodMatrix(filters)); }}
      >
        {/* All three are honoured by the server. The landscape above offers no
            phase or agency filter because there they would be dropped. */}
        <label style={{ fontSize: 12 }}>
          Indication
          <input className="c2c-input" style={{ height: 30 }} value={filters.indication ?? ''}
            onChange={set('indication')} placeholder="any" />
        </label>
        <label style={{ fontSize: 12 }}>
          Phase
          <input className="c2c-input" style={{ height: 30 }} value={filters.phase ?? ''}
            onChange={set('phase')} placeholder="any" />
        </label>
        <label style={{ fontSize: 12 }}>
          Agency
          <input className="c2c-input" style={{ height: 30 }} value={filters.agency ?? ''}
            onChange={set('agency')} placeholder="any" />
        </label>
        <button className="btn" style={{ height: 30 }} type="submit">{I.grid} Load matrix</button>
      </form>
      <ReadFailure read={read} what="the endpoint–method matrix" />
      {read.kind === 'ok' && read.value.length === 0 && <PrecedentEmpty what="the endpoint–method matrix" />}
      {read.kind === 'ok' && read.value.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table className="reg-tbl" aria-label="Endpoint-method matrix">
            <thead>
              <tr>
                <th scope="col">Endpoint</th><th scope="col">Method</th><th scope="col">Uses</th>
                <th scope="col">Accepted</th><th scope="col">Acceptance rate</th><th scope="col">Agencies</th>
              </tr>
            </thead>
            <tbody>
              {read.value.map((m) => (
                <tr key={`${m.endpoint}|${m.method}`}>
                  <td>{m.endpoint}</td>
                  <td>{m.method}</td>
                  <td className="mono">{m.totalCount}</td>
                  <td className="mono">{m.acceptedCount}</td>
                  <td className="mono">{pct(m.successRate)}</td>
                  <td>{m.agencies.join(', ') || 'not recorded'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/** A method's acceptance over the years it was reviewed in. */
function TrendSection() {
  const [concept, setConcept] = useState('');
  const { read, run } = useRead<MethodTrendEntry[]>();

  return (
    <section style={{ display: 'grid', gap: 8, borderTop: '1px solid var(--border-200,#e5e3df)', paddingTop: 10 }}>
      <div style={{ fontSize: 12, fontWeight: 600 }}>Acceptance over time</div>
      <form
        style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}
        onSubmit={(e) => { e.preventDefault(); void run(() => knowledgeApi.trend(concept.trim())); }}
      >
        <label style={{ fontSize: 12, flex: 1, minWidth: 220 }}>
          Method
          <input className="c2c-input" style={{ height: 30 }} value={concept}
            onChange={(e) => setConcept(e.target.value)} placeholder="e.g. MMRM" />
        </label>
        <button className="btn" style={{ height: 30 }} type="submit" disabled={concept.trim().length === 0}>
          {I.barChart} Load trend
        </button>
      </form>
      <ReadFailure read={read} what="the trend" />
      {read.kind === 'ok' && read.value.length === 0 && <PrecedentEmpty what="the trend" />}
      {read.kind === 'ok' && read.value.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table className="reg-tbl" aria-label="Method acceptance by year">
            <thead>
              <tr><th scope="col">Review year</th><th scope="col">Reviews</th><th scope="col">Accepted</th><th scope="col">Acceptance rate</th></tr>
            </thead>
            <tbody>
              {read.value.map((t) => (
                <tr key={t.year}>
                  <td className="mono">{t.year}</td>
                  <td className="mono">{t.count}</td>
                  <td className="mono">{t.acceptedCount}</td>
                  <td className="mono">{pct(t.successRate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export function BiostatKnowledgePanel() {
  return (
    <div className="pj-card">
      <div className="pj-card-h">
        <span className="t">Method precedent</span>
        <span className="s">your own CSR corpus, as a graph of indications, endpoints and methods</span>
      </div>
      <div className="pj-card-b" style={{ padding: 12, display: 'grid', gap: 12 }}>
        <div style={{ fontSize: 12, color: 'var(--text-300,#6b6963)', lineHeight: 1.5 }}>
          Ingesting a clinical study report extracts its indication, endpoints, statistical methods and design
          into a graph you can then ask questions of. The three precedent views below aggregate agency outcomes,
          which nothing records yet &mdash; each says so where the figures would be rather than reading as an
          absence of precedent.
        </div>
        <IngestSection />
        <QuerySection />
        <LandscapeSection />
        <MatrixSection />
        <TrendSection />
      </div>
    </div>
  );
}
