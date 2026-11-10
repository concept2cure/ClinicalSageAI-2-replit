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
import { useFetchJson } from '../mdx/hooks/useFetchJson';
import { AskAnaButton, INLINE_ACTIONS, RegisterBody, RegisterTable } from './SopRegisterRow';
import { listOf } from './qmsList';
import { C2CForm } from '../v2/C2CForm';
import { EmptyState, ErrorState } from '../v2/dataConnect';
import { C2CToast, useToast } from '../v2/toast';
import { useCapasBySource } from './capaSources';
import { scopedPath, useQualityScope, useRegisterContext } from './registerContext';
import { EsignModal, esignSignerOf } from '../_shared/components/EsignModal';
import { useAuthUser } from '@/services/portal/authService';
import type { QmsRecordTab } from './qmsRecordData';
import { type Column, type RecordRegisterContext, type RowAction, type RegisterConfig, type SignedStep, inSentence } from './qmsRegisterKit';

/** How many rows AnA is passed; the count says when there are more. */
const MAX_FACT_ROWS = 100;
type ReportContext = (ctx: Omit<RecordRegisterContext, 'tab'>) => void;
import { CAPAS } from './qmsCapaRegister';
import { DEVIATIONS } from './qmsDeviationRegister';
import { AUDITS, NONCONFORMANCES, REVIEWS, SUPPLIERS } from './qmsRecordRegisters';

function RecordRegister<R extends { id: number | string }>({ config, onAsk, onContext }: {
  config: RegisterConfig<R>; onAsk: (q: string) => void; onContext?: ReportContext;
}) {
  const scope = useQualityScope();
  const read = useFetchJson<unknown>(config.projectKept ? scopedPath(config.listPath, scope.programId) : config.listPath);
  /* Whose rows these are, said beside the figures and to AnA while a project is open (C14). */
  const scopeOf = React.useMemo<RecordRegisterContext['scope']>(() => (config.projectKept
    ? (scope.programId && scope.projectName ? { project: scope.projectName } : null)
    : (scope.programId ? { organisationWide: true } : null)), [config.projectKept, scope.programId, scope.projectName]);
  const rows = React.useMemo(() => listOf<R>(read.data), [read.data]);
  const [drawer, setDrawer] = React.useState<{ kind: 'create' } | { kind: 'row'; row: R; action: RowAction<R> } | null>(null);
  const [refusal, setRefusal] = React.useState<string | null>(null);
  /* A write's outcome is a toast (C3): it was a grey line inside the table, lost when the register re-read. */
  const [toast, fire] = useToast();
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
        if (codes === null) return capas.failed ? 'not read' : capas.partial ? 'not all read' : '…';
        return codes.length ? <span className="mono">{codes.join(', ')}</span> : '—';
      },
    }]
    : config.columns;

  const headId = React.useId();
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
      fire(text);
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
  /* A re-read keeps the rows it has on screen (C3, records-5): until 2026-11-10 every write blanked the register to
     "Loading the register…" and unmounted the open detail, with its confirmation. */
  const loaded = rows !== null;

  /* What AnA is told: the register as read, or that it is loading or failed. A
     failed read is never passed on as an empty register. */
  React.useEffect(() => {
    if (!onContext) return;
    const base = { title: config.title, noun: config.noun, about: config.sub, scope: scopeOf };
    if (failed) onContext({ ...base, state: 'failed', count: null, counts: [], records: [], truncated: false, partial: false });
    else if (!loaded || !rows) onContext({ ...base, state: 'loading', count: null, counts: [], records: [], truncated: false, partial: false });
    else onContext({
      ...base, state: 'ready', count: rows.length, partial: !!config.readCap && rows.length >= config.readCap.rows,
      counts: config.kpis(rows, today).map((k) => ({ label: k.label, val: k.val, ...(k.detail ? { detail: k.detail } : {}) })),
      records: rows.slice(0, MAX_FACT_ROWS).map((r) => config.facts(r, ctx)), truncated: rows.length > MAX_FACT_ROWS,
    });
  }, [onContext, config, failed, loaded, rows, today, ctx, scopeOf]);

  return (
    <>
      {/* One section (D7-B): the register's name, its figures as one line, its one create.
          The tab's own title, its "Ask AnA" (the starter row's first starter sends the same
          prompt) and its tiles went on 2026-11-06; the figures keep their unread arm. */}
      <section className="pj-sec qms-sec" aria-labelledby={headId}>
        <div className="pj-sec-h">
          <h2 id={headId}>{config.title}</h2>
          <div className="pj-sec-acts">
            <button type="button" className="btn primary small" onClick={() => open({ kind: 'create' })}>{config.createLabel}</button>
          </div>
        </div>
        {/* Said once (C1, C4): an unread or failed register is said by its own line below, never here too. */}
        {loaded && !failed && rows.length > 0 && <p className="sec-sub" data-testid="qms-record-figures">
              {scopeOf && 'organisationWide' in scopeOf && <span data-testid="qms-record-org-wide">Organisation-wide · </span>}
              {/* At the server's cap the register is the most recent rows, and its figures are theirs (C12). */}
              {config.readCap && rows.length >= config.readCap.rows && (
                <span data-testid="qms-record-partial">The {rows.length} {config.readCap.order} {config.noun[1]}: </span>
              )}
              {config.kpis(rows, today).map((k, i) => <React.Fragment key={k.label}>{i ? ' · ' : ''}{k.label}: <span data-tone={k.tone === 'err' || k.tone === 'warn' ? k.tone : undefined}>{k.val}</span>{k.detail ? ` (${k.detail})` : ''}</React.Fragment>)}
        </p>}
        {failed && (
          <ErrorState
            title={`The ${inSentence(config.title)} register could not be read`}
            message={read.error ?? 'The server did not return a list.'}
            retry={read.refresh}
            read={read.failure}
            readWhat={`the ${inSentence(config.title)} register`}
            testId="qms-record-failed"
          />
        )}
        {!failed && !loaded && <EmptyState title="Loading the register…" busy />}
        {loaded && rows.length === 0 && (scopeOf && 'project' in scopeOf
          ? <EmptyState title={`No ${config.noun[1]} filed under ${scopeOf.project}.`} hint={`The organisation's other ${config.noun[1]} are under Show the whole organisation.`} />
          : <EmptyState title={`No ${config.noun[1]} recorded yet.`} />)}
        {/* D0's table (C11), as the SOP register and the change log: a row shows the acts that fit its state (each
            configuration's `show`), the first two inline with Ask AnA as an icon, and More holds the rest (P-122; from
            C11 until P-122 only the first act showed). Until 2026-11-10 each row carried every action as an arrow chip
            and a sparkle, on a grid wider than the pane, so at 1440 the action column was scrolled out of the box. */}
        {loaded && rows.length > 0 && (
          <RegisterTable columns={columns.map((c) => c.label)}>
            {rows.map((r) => {
              const isOpen = openId === r.id;
              const acts = (config.rowActions ?? []).filter((a) => a.show?.(r) ?? true).map((a) => (
                <button key={a.label} type="button" className="btn ghost small" title={a.title} onClick={() => open({ kind: 'row', row: r, action: a })}>
                  {a.label}
                </button>
              ));
              const ask = <AskAnaButton key="ask" label="Ask AnA about this record" onAsk={() => onAsk(config.askRow(r))} />;
              return (
                <RegisterBody key={r.id} name={config.name(r)} className="qms-rec" columns={columns.length}
                  primary={acts.length ? <>{acts.slice(0, INLINE_ACTIONS)}</> : null} ask={ask} rest={acts.slice(INLINE_ACTIONS)}
                  cells={columns.map((c, n) => (
                    <td key={c.label} className={c.text ? 'qms-title' : undefined}>
                      {n === 0 && config.detail ? (
                        <button type="button" className="qms-num mono" aria-expanded={isOpen} title={config.detail.label}
                          onClick={() => setOpenId(isOpen ? null : r.id)}>
                          {c.cell(r, ctx)}
                        </button>
                      ) : c.cell(r, ctx)}
                    </td>
                  ))}
                  after={config.detail && isOpen && (
                    <tr className="qcc-detail-tr">
                      <td colSpan={columns.length + 1}>
                        <div className="qcc-detail" key={`${r.id}:${version}`}>{config.detail.render(r, (text) => { if (text) fire(text); read.refresh(); })}</div>
                      </td>
                    </tr>
                  )}
                />
              );
            })}
          </RegisterTable>
        )}
      </section>
      <C2CToast msg={toast} />

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
            fire(signing.done);
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
  { id: 'deviations', label: 'Deviations' },
  { id: 'nonconforming', label: 'Nonconformances' },
  { id: 'suppliers', label: 'Suppliers' },
  { id: 'audits', label: 'Internal audits' },
  { id: 'reviews', label: 'Management reviews' },
];

export const QMS_RECORD_ASK: Record<QmsRecordTab, string> = {
  capa: CAPAS.ask,
  deviations: DEVIATIONS.ask,
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
    case 'deviations': return <RecordRegister key={tab} config={DEVIATIONS} onAsk={onAsk} onContext={report} />;
    case 'nonconforming': return <RecordRegister key={tab} config={NONCONFORMANCES} onAsk={onAsk} onContext={report} />;
    case 'suppliers': return <RecordRegister key={tab} config={SUPPLIERS} onAsk={onAsk} onContext={report} />;
    case 'audits': return <RecordRegister key={tab} config={AUDITS} onAsk={onAsk} onContext={report} />;
    case 'reviews': return <RecordRegister key={tab} config={REVIEWS} onAsk={onAsk} onContext={report} />;
  }
}
