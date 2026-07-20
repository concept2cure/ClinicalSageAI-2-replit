import React, { useState, useMemo, useEffect, useRef } from 'react';
import { I } from '../icons';
import { useLiveData, useLiveRows, EmptyState, unwrapList } from '../dataConnect';
import { AnswerLead } from '../AnswerLead';
import type { SurfaceViewProps } from '../surfaceViews';
import { C2CForm } from '../C2CForm';
import type { C2CFormConfig } from '../C2CForm';
import '../styles/project-home-v2.css';
import { LABEL_ENUMS } from '../fixtures/labeling-data';
import type { LabelTranslation } from '../fixtures/labeling-data';

/* ---- Labeling and IFU ---- */

/** Human-readable language name for a code ('de' → 'German'), via the platform
 *  Intl data; passes through anything it can't resolve (incl. a name already
 *  stored in the language column) so the label is never blank. */
function languageName(code: string): string {
  if (!code) return code;
  // Only resolve BCP-47-ish subtags ('de', 'pt-BR'); pass anything else through
  // unchanged — a full name already stored in the column stays as written
  // rather than being lower-cased by Intl's normalization of unknown input.
  if (!/^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/i.test(code)) return code;
  try {
    return new Intl.DisplayNames(['en'], { type: 'language' }).of(code) || code;
  } catch {
    return code;
  }
}

/**
 * Map the raw `labeling_translations` rows the backend returns
 * (GET /api/mdx/labeling/:id/translations — DB columns: translation_method,
 * back_translation_verified, …) onto the LabelTranslation display contract the
 * translation board renders. `name` has no column — it is a display label
 * derived from the language, exactly as the surface's own addTrans does
 * (`name = v.name || v.language`). method/btv/status map straight across from
 * the write path's columns.
 *
 * Fail-closed (returns null) unless the payload is a non-empty list of rows
 * carrying the translation signature (language + status). The surface renders
 * that null as an honest empty/loading state — never a fixture. Exported for
 * unit coverage.
 */
export function mapLabelTranslations(payload: unknown): LabelTranslation[] | null {
  const list = unwrapList(payload);
  if (!Array.isArray(list) || list.length === 0) return null;

  const str = (v: unknown, fallback = ''): string => (typeof v === 'string' && v ? v : fallback);
  const out: LabelTranslation[] = [];
  for (const raw of list) {
    if (!raw || typeof raw !== 'object') return null;
    const r = raw as Record<string, unknown>;
    // Signature gate — a labeling_translations row, not the display fixture
    // (which carries `method`/`btv`, not `translation_method`).
    if (!str(r.language) || !str(r.status)) return null;
    if (!('translation_method' in r) && !('back_translation_verified' in r)) return null;

    const language = str(r.language);
    out.push({
      id: r.id != null ? String(r.id) : 'TR-' + language,
      language,
      name: languageName(language),
      method: str(r.translation_method, 'machine'),
      btv: r.back_translation_verified === true,
      status: str(r.status, 'pending'),
    });
  }
  return out.length ? out : null;
}

/* ── Live display types, aligned to the mdx-labeling backend columns ── */

/** A labeling_documents row as GET /api/mdx/labeling (SELECT *) returns it. */
interface LabelDocRow {
  id: number;
  device_name: string;
  doc_kind: string;
  version: string;
  status: string;
  udi_di: string | null;
}

/** A labeling_symbols row as GET /api/mdx/labeling/:id/symbols (SELECT *)
 *  returns it. The table has NO status / blocker columns — the surface's old
 *  "placed / needed / blocker" state was a fixture and is not rendered.
 *  description / required_by are nullable and rendered null-safe. */
interface LabelSymbolRow {
  id: number;
  symbol_code: string;
  symbol_name: string;
  description: string | null;
  required_by: string[] | null;
}

/* Stable empty seed for the optimistic translation store while the live list is
   loading or unavailable. useLiveData returns a fresh null every render until it
   resolves; mapping that to a module constant keeps the re-seed effect from
   thrashing (loop-safety). */
const EMPTY_TRANS: LabelTranslation[] = [];

export function Labeling({ onAsk }: SurfaceViewProps) {
  const EN = LABEL_ENUMS;

  // Root of this surface's real data: the org's labeling document(s). REAL —
  // GET /api/mdx/labeling queries labeling_documents (org-scoped). The first
  // row drives the header + is the parent id for translations / symbols.
  const docsLive = useLiveRows<LabelDocRow>('/api/mdx/labeling');
  const docRow = docsLive.rows.length ? docsLive.rows[0] : null;
  const docId = docRow ? docRow.id : null;

  const kindLabel = docRow
    ? (EN.kind.find(k => k[0] === docRow.doc_kind) || [])[1] || docRow.doc_kind
    : 'Labeling';

  // Symbols — REAL (GET /api/mdx/labeling/:id/symbols → labeling_symbols).
  // Idle until a document id is known; honest empty / error otherwise.
  const symbolsLive = useLiveRows<LabelSymbolRow>(
    docId ? `/api/mdx/labeling/${docId}/symbols` : null,
    [docId],
  );

  // Translations — REAL (GET /api/mdx/labeling/:id/translations →
  // labeling_translations). useLiveData unwraps the `{ data }` envelope; the
  // rows are mapped onto the display contract by mapLabelTranslations (fails
  // closed to null → honest empty, never a fixture).
  const transState = useLiveData<unknown>(
    docId ? `/api/mdx/labeling/${docId}/translations` : null,
    [docId],
  );
  const liveTransRows = useMemo(
    () => (!transState.loading && !transState.error ? mapLabelTranslations(transState.data) : null),
    [transState.loading, transState.error, transState.data],
  );
  const seedTrans = liveTransRows ?? EMPTY_TRANS;
  // Optimistic local store: seed from the live rows, re-seed once when the live
  // list resolves (seed identity changes). User-added rows before that are
  // optimistic. Gated on identity so the fresh-null render never thrashes.
  const [trans, setTrans] = useState<LabelTranslation[]>(seedTrans);
  const transSeed = useRef<LabelTranslation[]>(seedTrans);
  useEffect(() => {
    if (seedTrans !== transSeed.current) {
      transSeed.current = seedTrans;
      setTrans(seedTrans);
    }
  }, [seedTrans]);

  const [tForm, setTForm] = useState(false);
  const [toast, setToast] = useState('');
  const fire = (m: string) => { setToast(m); setTimeout(() => setToast(''), 2600); };

  const cov = useMemo(() => {
    const total = trans.length;
    const approved = trans.filter(t => t.status === 'approved').length;
    const btv = trans.filter(t => t.btv).length;
    return { total, approved, btv, pct: total ? Math.round(approved / total * 100) : 0 };
  }, [trans]);

  // MOCK ACTION (flagged for the actions pass): optimistic local add + a
  // fire-and-forget POST to the real endpoint. The toast reports success before
  // the write is confirmed and the row is not reconciled from the response.
  const addTrans = (v: Record<string, string>) => {
    const id = 'TR-' + (v.language || 'xx').toLowerCase();
    if (trans.some(t => t.language === v.language)) { fire('A translation for ' + v.language + ' already exists'); setTForm(false); return; }
    const nt: LabelTranslation = { id, language: v.language, name: v.name || v.language, method: v.method || 'mt_postedited', btv: false, status: 'pending', _new: true };
    setTrans(ts => [...ts, nt]); setTForm(false);
    const api = (window as any).C2C_API;
    if (api && api.connected() && docId) { api.post('/api/mdx/labeling/' + docId + '/translations', { language: nt.language, translationMethod: nt.method, status: 'pending' }).catch(() => {}); }
    fire('Translation ' + v.language + ' added / status Pending');
  };
  // MOCK ACTION (flagged): optimistic local status advance + fire-and-forget
  // PATCH to the real endpoint. Does NOT fabricate back-translation
  // verification — btv stays at its persisted value (the backend does not set
  // it on a status change, so the "back-trans verified" chip must not appear
  // from a client-side advance).
  const advTrans = (id: string) => setTrans(ts => ts.map(t => {
    if (t.id !== id) return t;
    const order = ['pending', 'in_progress', 'review', 'approved'];
    const i = order.indexOf(t.status);
    const nxt = i >= 0 && i < order.length - 1 ? order[i + 1] : t.status;
    const api = (window as any).C2C_API;
    if (api && api.connected()) { api.patch('/api/mdx/labeling/translations/' + id.replace('TR-', ''), { status: nxt }).catch(() => {}); }
    return { ...t, status: nxt };
  }));

  const tTone: Record<string, string> = { approved: 'ok', review: 'warn', in_progress: 'ai', pending: 'idle', rejected: 'err' };

  const transFormConfig: C2CFormConfig = {
    eyebrow: 'Labeling / translation',
    title: 'Add translation',
    sub: docRow
      ? 'Adds a target language to the ' + docRow.device_name + ' ' + kindLabel + '.'
      : 'Adds a target language to this label.',
    // Softened from an enforced-gate claim: the PATCH endpoint stamps approval
    // but does not enforce a back-translation check, so this states the expected
    // practice rather than asserting a control that runs.
    governed: 'Back-translation QC is expected before a language reaches Approved.',
    submitLabel: 'Add translation',
    fields: [
      { key: 'language', label: 'Language code', type: 'text', placeholder: 'e.g. pt, sv, cs', required: true },
      { key: 'name', label: 'Language name', type: 'text', placeholder: 'e.g. Portuguese', required: true },
      { key: 'method', label: 'Translation method', type: 'select', options: EN.method.map(m => ({ value: m[0], label: m[1] })), required: true },
    ],
  };

  return (
    <div className="page-inner">
      <div className="ph">
        <div>
          <div className="ph-eyebrow">
            {docRow ? 'Specialist / device / ' + kindLabel + ' v' + docRow.version : 'Specialist / device / Labeling'}
          </div>
          <h1 className="ph-title">Labeling and IFU</h1>
          <div className="ph-sub">
            Label, IFU and symbols authoring — ISO 15223-1 symbols, UDI placement (21 CFR 801.45 / GUDID), translations with back-translation QC, and warnings traced to the ISO 14971 risk file.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn ghost" onClick={() => onAsk('Check labeling compliance and reconcile warnings against the risk file')}>{I.sparkles} Ask AnA</button>
        </div>
      </div>

      {docsLive.loading ? (
        <div className="scaf-note" style={{ padding: '18px 10px' }}>Loading the labeling document…</div>
      ) : docsLive.error ? (
        <EmptyState
          tone="error"
          icon={I.alertTriangle}
          title="Couldn't load the labeling document"
          hint="The labeling service didn't respond. These are the organization's governed IFU / label documents — sign in and retry, or check the service is reachable."
        />
      ) : !docRow ? (
        <EmptyState
          icon={I.fileText}
          title="No labeling document yet"
          hint="Create a device IFU, package insert, or patient label to author its symbols, UDI, translations and warnings here."
        />
      ) : (
        <>
          <AnswerLead
            tone={cov.total > 0 && cov.approved === cov.total ? 'good' : 'calm'}
            eyebrow="Where the label package stands right now"
            headline={cov.total === 0
              ? <>No translations are recorded for this label yet.</>
              : cov.approved < cov.total
                ? <>The label content is controlled; <b>{cov.total - cov.approved}</b> of {cov.total} translation{cov.total === 1 ? '' : 's'} {cov.total - cov.approved === 1 ? 'is' : 'are'} still short of approved.</>
                : <>All {cov.total} translation{cov.total === 1 ? '' : 's'} are approved.</>}
            body={cov.total === 0
              ? <>Add the target-language IFU/label translations to start tracking back-translation QC and approval coverage.</>
              : <>Translation coverage is <b>{cov.approved}/{cov.total}</b> approved ({cov.pct}%), <b>{cov.btv}</b> back-translation verified. Each warning should trace to the ISO 14971 hazard it controls.</>}
            reassure="I will draft the missing-language IFU and run the back-translation check, and flag any language that stalls in QC — you approve each one."
            action={{ label: 'Add a translation', onClick: () => setTForm(true) }}
            secondary="Or work the symbols and translations below."
          />

          <div className="split2">
            <div className="sec">
              <div className="sec-hdr">
                <div className="sec-title">ISO 15223-1 symbols</div>
                <div className="sec-sub">symbol glossary</div>
              </div>
              {symbolsLive.loading ? (
                <div className="scaf-note" style={{ padding: '18px 10px' }}>Loading symbols…</div>
              ) : symbolsLive.error ? (
                <EmptyState
                  tone="error"
                  icon={I.alertTriangle}
                  title="Couldn't load the symbol glossary"
                  hint="The ISO 15223-1 symbol set for this label didn't respond. Sign in and retry, or check the service is reachable."
                />
              ) : symbolsLive.rows.length === 0 ? (
                <EmptyState
                  icon={I.info}
                  title="No symbols in the glossary yet"
                  hint="Add the ISO 15223-1 symbols that appear on this label — each carries its standard reference and where it's required."
                />
              ) : (
                <div className="lbl-symgrid">
                  {symbolsLive.rows.map((s, i) => (
                    <div key={s.id ?? i} className="lbl-sym" title={s.description || undefined}>
                      <div className="lbl-sym-box"><span className="lbl-sym-ref">{s.symbol_code}</span></div>
                      <div className="lbl-sym-name">{s.symbol_name}</div>
                      {Array.isArray(s.required_by) && s.required_by.length > 0 && (
                        <div style={{ fontSize: 10, color: 'var(--text-400)', marginTop: 2 }}>{s.required_by.join(' · ')}</div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="sec">
              <div className="sec-hdr">
                <div className="sec-title">Warnings and precautions</div>
                <div className="sec-sub">traced to the risk file (ISO 14971)</div>
              </div>
              {/* Backend gap: mdx-labeling exposes documents / translations /
                  symbols / coverage only — there is no warnings endpoint and no
                  persisted risk-file trace. Honest empty, not a fixture. */}
              <EmptyState
                icon={I.alertTriangle}
                title="No label warnings yet"
                hint="Warnings and their ISO 14971 hazard trace aren't captured by the labeling service yet."
              />
            </div>
          </div>

          <div className="split2">
            <div className="sec">
              <div className="sec-hdr">
                <div className="sec-title">UDI placement</div>
                <div className="sec-sub">21 CFR 801.45 / GUDID</div>
              </div>
              {/* Backend gap: only the scalar udi_di is persisted
                  (labeling_documents.udi_di). The carrier, PI qualifiers and
                  per-location placement checklist have no backend, so the
                  structured placement view is an honest empty — the real DI is
                  surfaced when present. */}
              <EmptyState
                icon={I.info}
                title="UDI placement not captured yet"
                hint={docRow.udi_di
                  ? <>The document records UDI-DI <code>{docRow.udi_di}</code>, but the carrier, PI qualifiers and per-location placement checklist aren't backed by the labeling service yet.</>
                  : 'No UDI-DI is set on this labeling document, and carrier / PI / placement tracking isn’t captured yet.'}
              />
            </div>
            <div className="sec">
              <div className="sec-hdr"><div className="sec-title">Compliance checks</div></div>
              {/* Backend gap: no compliance-checks endpoint (reading level,
                  symbol-legend conformance, eIFU-URL resolution). Honest empty,
                  not a fixture. */}
              <EmptyState
                icon={I.info}
                title="No automated compliance checks yet"
                hint="Reading-level, symbol-legend and eIFU-URL checks aren't run by the labeling service yet."
              />
            </div>
          </div>

          <div className="sec">
            <div className="sec-hdr"><div className="sec-title">Label and IFU sections</div></div>
            {/* Backend gap: no per-section authoring-status model is persisted on
                the labeling document. Honest empty, not a fixture. */}
            <EmptyState
              icon={I.fileText}
              title="No section breakdown yet"
              hint="Per-section authoring status for this label isn't captured by the labeling service yet."
            />
          </div>

          <div className="sec">
            <div className="sec-hdr">
              <div className="sec-title">Translations and coverage</div>
              <div className="sec-sub">{cov.approved}/{cov.total} approved / {cov.btv} back-translation verified</div>
              <button className="btn ghost" style={{ marginLeft: 'auto' }} onClick={() => setTForm(true)}>{I.plus} Add translation</button>
            </div>
            <div className="lbl-cov-bar"><div className="lbl-cov-fill" style={{ width: cov.pct + '%' }} /></div>
            <div className="ctable" style={{ marginTop: 10 }}>
              {transState.loading && trans.length === 0 ? (
                <div className="scaf-note" style={{ padding: '18px 10px' }}>Loading translations…</div>
              ) : transState.error && trans.length === 0 ? (
                <EmptyState
                  tone="error"
                  icon={I.alertTriangle}
                  title="Couldn't load translations"
                  hint="The label's translation set didn't respond. Sign in and retry, or check the service is reachable."
                />
              ) : trans.length === 0 ? (
                <EmptyState
                  icon={I.info}
                  title="No translations yet"
                  hint="Add a target-language IFU/label translation to start tracking back-translation QC and approval."
                />
              ) : (
                trans.map(t => (
                  <div key={t.id} className="ct-row" style={{ gridTemplateColumns: '1.4fr 1fr 0.9fr 120px', alignItems: 'center' }} data-fresh={t._new || undefined}>
                    <div className="vn"><span className="ct-strong">{t.name}</span> <span className="mono" style={{ fontSize: 11, color: 'var(--text-400)' }}>{t.language}</span></div>
                    <div style={{ fontSize: 12, color: 'var(--text-300)' }}>
                      {(EN.method.find(m => m[0] === t.method) || [])[1] || t.method}
                      {t.btv && <span className="rd-chip tone-ok" style={{ marginLeft: 6, fontSize: 9 }}>back-trans verified</span>}
                    </div>
                    <div><span className={`rd-chip tone-${tTone[t.status] || 'idle'}`}>{(EN.transStatus.find(s => s[0] === t.status) || [])[1] || t.status}</span></div>
                    <div style={{ textAlign: 'right' }}>{t.status !== 'approved' && <button className="btn ghost" style={{ height: 26 }} onClick={() => advTrans(t.id)}>{I.arrowRight} Advance</button>}</div>
                  </div>
                ))
              )}
            </div>
          </div>

          {tForm && <C2CForm config={transFormConfig} onCancel={() => setTForm(false)} onSubmit={addTrans} />}
        </>
      )}

      {toast && <div className="pdev-toast">{I.check} {toast}</div>}
    </div>
  );
}
