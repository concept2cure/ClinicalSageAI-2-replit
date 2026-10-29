/**
 * QmsRecords — the Quality registers beside controlled documents and change
 * control: CAPA, nonconformances, suppliers, internal audits and management
 * reviews.
 *
 * One register component, five configurations: CAPA (qmsCapaRegister.tsx) and
 * the four records (qmsRecordRegisters.tsx), built from qmsRegisterKit.tsx.
 * Each reads its tenant-scoped list route, raises a record through a drawer,
 * and (where the server has an update route) records the next fact about a
 * row: a nonconformance's disposition, a supplier's approval and audit dates,
 * an audit's progress and findings, a CAPA's next lifecycle move and its action
 * items. Every write is the server's, and each records its audit row under the
 * signed-in person (server/routes/mdx-qms.ts, server/routes/capa-mdr.ts). A
 * failed read is shown as a failure, never as an empty register. Counts are
 * taken from the rows shown.
 *
 * @module client/src/concept2cure/quality/QmsRecords
 */

import * as React from 'react';
import { I } from '../v2/icons';
import { useFetchJson } from '../mdx/hooks/useFetchJson';
import { registerRowMinWidth } from './registerGrid';
import { listOf } from './qmsList';
import { Kpi } from './Kpi';
import { C2CForm } from '../v2/C2CForm';
import { EmptyState, ErrorState } from '../v2/dataConnect';
import { useCapasBySource } from './capaSources';
import { useRegisterContext } from './registerContext';
import { EsignModal, esignSignerOf } from '../_shared/components/EsignModal';
import { useAuthUser } from '@/services/portal/authService';
import type { QmsRecordTab } from './qmsRecordData';
import { type Column, type RecordRegisterContext, type RowAction, type RegisterConfig, type SignedStep, plural } from './qmsRegisterKit';

/** How many rows AnA is passed; the count says when there are more. */
const MAX_FACT_ROWS = 100;
type ReportContext = (ctx: Omit<RecordRegisterContext, 'tab'>) => void;
import { CAPAS } from './qmsCapaRegister';
import { AUDITS, NONCONFORMANCES, REVIEWS, SUPPLIERS } from './qmsRecordRegisters';

function RecordRegister<R extends { id: number | string }>({ config, onAsk, onContext }: {
  config: RegisterConfig<R>; onAsk: (q: string) => void; onContext?: ReportContext;
}) {
  const read = useFetchJson<unknown>(config.listPath);
  const rows = React.useMemo(() => listOf<R>(read.data), [read.data]);
  const [drawer, setDrawer] = React.useState<{ kind: 'create' } | { kind: 'row'; row: R; action: RowAction<R> } | null>(null);
  const [refusal, setRefusal] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const writing = React.useRef(false);
  const [openId, setOpenId] = React.useState<R['id'] | null>(null);
  /* Bumped by every write, so an open detail re-reads what the write changed. */
  const [version, setVersion] = React.useState(0);
  const today = new Date().toISOString().slice(0, 10);
  const capas = useCapasBySource(config.capaSourceKind);
  const ctx = useRegisterContext(config.needs);
  const user = useAuthUser(); // display only; the server resolves the signer
  const [signing, setSigning] = React.useState<SignedStep | null>(null);
  /* The CAPAs raised from each row, from the CAPA register (capaSources.ts). */
  const columns: Column<R>[] = config.capaSourceKind
    ? [...config.columns, {
      label: 'CAPA',
      cell: (r) => {
        const codes = capas.codesFor(String(r.id));
        if (codes === null) return capas.failed ? 'not read' : '…';
        return codes.length ? <span className="mono">{codes.join(', ')}</span> : '—';
      },
    }]
    : config.columns;
  const grid = config.grid + (config.capaSourceKind ? ' 120px' : '') + ' 230px';
  const rowMin = registerRowMinWidth(grid);

  const open = (d: NonNullable<typeof drawer>) => { setRefusal(null); setDrawer(d); };
  /* A row action that signs hands its decision to the EsignModal; one that submits writes now. */
  const submitRow = (row: R, action: RowAction<R>, v: Record<string, string>) => {
    if (!action.sign) { void run(() => action.submit(row, v)); return; }
    try {
      setSigning(action.sign(row, v));
      setDrawer(null);
    } catch (err) {
      setRefusal(`Not recorded — ${err instanceof Error ? err.message : String(err)}`);
    }
  };
  const run = async (write: () => Promise<string>) => {
    if (writing.current) return;
    writing.current = true;
    setRefusal(null);
    try {
      const text = await write();
      setDrawer(null);
      setNotice(text);
      setVersion((n) => n + 1);
      read.refresh();
    } catch (err) {
      setRefusal(`Not recorded — ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      writing.current = false;
    }
  };

  /* No list in the body is a failed read, not an empty register. */
  const failed = !read.loading && (read.error != null || (read.data != null && rows === null));
  const loaded = rows !== null && !read.loading;

  /* What AnA is told: the register as read, or that it is loading or failed. A
     failed read is never passed on as an empty register. */
  React.useEffect(() => {
    if (!onContext) return;
    const base = { title: config.title, noun: config.noun };
    if (failed) onContext({ ...base, state: 'failed', count: null, counts: [], records: [], truncated: false });
    else if (!loaded || !rows) onContext({ ...base, state: 'loading', count: null, counts: [], records: [], truncated: false });
    else onContext({
      ...base, state: 'ready', count: rows.length,
      counts: config.kpis(rows, today).map((k) => ({ label: k.label, val: k.val })),
      records: rows.slice(0, MAX_FACT_ROWS).map((r) => config.facts(r, ctx)), truncated: rows.length > MAX_FACT_ROWS,
    });
  }, [onContext, config, failed, loaded, rows, today, ctx]);

  return (
    <>
      <div className="qms-head">
        <div>
          <div className="qms-eyebrow">Quality records</div>
          <h1 className="qms-h1">{config.title}</h1>
          <div className="qms-sub">{config.sub}</div>
        </div>
        <div className="qms-actions">
          <button className="qms-btn ghost" title="Sends this request to AnA; nothing in the register changes" onClick={() => onAsk(config.ask)}>
            {I.sparkles} Ask AnA
          </button>
          <button className="qms-btn primary" onClick={() => open({ kind: 'create' })}>
            {I.plus} {config.createLabel}
          </button>
        </div>
      </div>

      <div className="qms-kpis">
        {loaded ? (
          config.kpis(rows, today).map((k) => <Kpi key={k.label} {...k} />)
        ) : (
          <EmptyState
            title={`${config.title} totals are unavailable`}
            hint="The counts appear once the register loads."
            testId="qms-record-kpis-absent"
          />
        )}
      </div>

      <section className="qms-sec">
        <div className="qms-sec-head">
          <h2>Register</h2>
          {loaded && <span className="meta">{plural(rows.length, config.noun)}</span>}
        </div>
        <div className="qms-table">
          <div className="qms-thead" style={{ gridTemplateColumns: grid, minWidth: rowMin }}>
            {columns.map((c) => <div key={c.label}>{c.label}</div>)}
            <div />
          </div>
          {notice && <div className="qms-empty" role="status" data-tone="ok">{notice}</div>}
          {failed && (
            <ErrorState
              title={`The ${config.title.toLowerCase()} register could not be read`}
              message={read.error ?? 'The server did not return a list.'}
              retry={read.refresh}
              testId="qms-record-failed"
            />
          )}
          {!failed && !loaded && <div className="qms-empty" role="status">Loading the register…</div>}
          {loaded && rows.length === 0 && (
            <div className="qms-empty">No {config.noun[1]} recorded yet.</div>
          )}
          {loaded && rows.map((r) => (
            <React.Fragment key={r.id}>
            <div className="qms-row" style={{ gridTemplateColumns: grid, minWidth: rowMin }}>
              {columns.map((c, i) => (i === 0 && config.detail ? (
                <button key={c.label} className="qms-cell qms-num" aria-expanded={openId === r.id} title={config.detail.label}
                  onClick={() => setOpenId(openId === r.id ? null : r.id)}>
                  {c.cell(r, ctx)}
                </button>
              ) : <div key={c.label} className="qms-cell">{c.cell(r, ctx)}</div>))}
              <div className="qms-cell qms-rowacts">
                {config.rowActions?.filter((a) => a.show?.(r) ?? true).map((a) => (
                  <button key={a.label} className="qms-chip" title={a.title} onClick={() => open({ kind: 'row', row: r, action: a })}>
                    {I.arrowRight} {a.label}
                  </button>
                ))}
                <button className="qms-chip ghost" title="Ask AnA about this record" aria-label="Ask AnA about this record" onClick={() => onAsk(config.askRow(r))}>
                  {I.sparkles}
                </button>
              </div>
            </div>
            {config.detail && openId === r.id && (
              <div className="qcc-detail" key={`${r.id}:${version}`}>{config.detail.render(r, read.refresh)}</div>
            )}
            </React.Fragment>
          ))}
        </div>
      </section>

      {drawer?.kind === 'create' && (
        <C2CForm
          config={{ ...(typeof config.createForm === 'function' ? config.createForm(ctx) : config.createForm), ...(refusal ? { notice: refusal } : {}) }}
          onCancel={() => setDrawer(null)}
          onSubmit={(v) => void run(() => config.create(v))}
        />
      )}
      {drawer?.kind === 'row' && (
        <C2CForm
          config={{ ...drawer.action.form(drawer.row, ctx), ...(refusal ? { notice: refusal } : {}) }}
          onCancel={() => setDrawer(null)}
          onSubmit={(v) => submitRow(drawer.row, drawer.action, v)}
        />
      )}
      {signing && (
        <EsignModal
          open
          action={signing.action}
          target={signing.target}
          targetMeta={signing.meta}
          signedRows={signing.rows}
          defaultMeaning={signing.meanings[0]}
          meanings={signing.meanings}
          signer={esignSignerOf(user as Parameters<typeof esignSignerOf>[0])}
          onClose={() => setSigning(null)}
          onSign={async (input) => {
            const manifest = await signing.post(input);
            setNotice(signing.done);
            setVersion((n) => n + 1);
            read.refresh();
            return manifest;
          }}
        />
      )}
    </>
  );
}

export const QMS_RECORD_TABS: { id: QmsRecordTab; label: string }[] = [
  { id: 'capa', label: 'CAPA' },
  { id: 'nonconforming', label: 'Nonconformances' },
  { id: 'suppliers', label: 'Suppliers' },
  { id: 'audits', label: 'Internal audits' },
  { id: 'reviews', label: 'Management reviews' },
];

export const QMS_RECORD_ASK: Record<QmsRecordTab, string> = {
  capa: CAPAS.ask,
  nonconforming: NONCONFORMANCES.ask,
  suppliers: SUPPLIERS.ask,
  audits: AUDITS.ask,
  reviews: REVIEWS.ask,
};

export function QmsRecords({ tab, onAsk, onContext }: {
  tab: QmsRecordTab; onAsk: (q: string) => void; onContext?: (ctx: RecordRegisterContext) => void;
}) {
  const report = React.useCallback<ReportContext>((ctx) => onContext?.({ ...ctx, tab }), [onContext, tab]);
  switch (tab) {
    case 'capa': return <RecordRegister key={tab} config={CAPAS} onAsk={onAsk} onContext={report} />;
    case 'nonconforming': return <RecordRegister key={tab} config={NONCONFORMANCES} onAsk={onAsk} onContext={report} />;
    case 'suppliers': return <RecordRegister key={tab} config={SUPPLIERS} onAsk={onAsk} onContext={report} />;
    case 'audits': return <RecordRegister key={tab} config={AUDITS} onAsk={onAsk} onContext={report} />;
    case 'reviews': return <RecordRegister key={tab} config={REVIEWS} onAsk={onAsk} onContext={report} />;
  }
}
