import React, { useState, useMemo, useEffect, useRef } from 'react';
import { I } from '../icons';
import { useLiveData, useLiveRows, EmptyState, unwrapList } from '../dataConnect';
import { apiRequest, extractApiError } from '@/lib/queryClient';
import { AnswerLead } from '../AnswerLead';
import type { SurfaceViewProps } from '../surfaceViews';
import { usePublishSurfaceContext } from '../surfaceContext';
import { C2CForm } from '../C2CForm';
import type { C2CFormConfig } from '../C2CForm';
import '../styles/project-home-v2.css';
import { LABEL_ENUMS } from '../fixtures/labeling-data';
import type { LabelTranslation } from '../fixtures/labeling-data';
import { C2CToast, useToast } from '../toast';

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

/* The mdx-labeling POST/PATCH wrap the single updated row as { data: row }
   (ok/created helpers). Unwrap it back to the raw row so the shared list-mapper
   (mapLabelTranslations, which expects a list) can adopt it as one element. */
function envRow(json: unknown): unknown {
  return json && typeof json === 'object' && 'data' in json ? (json as { data: unknown }).data : json;
}

/* Trailing punctuation removed: every toast below appends its own
   ". Nothing was saved." clause, so a message that already ends in a full stop
   would render a doubled period. */
function clause(text: string): string {
  return text.replace(/[.\s]+$/, '');
}

/* The human sentence for a failed write, reduced for display.

   This used to read the body's `error` field FIRST, so against the envelope
   { error: 'VALIDATION_FAILED', message: '<a real sentence>' } the enum won and
   the toast showed the token. It also fell back to a bare `HTTP <status>`, which
   is a status code rather than user copy. extractApiError takes the sentence
   wherever the envelope put it — rejecting enum tokens and driver text — and
   substitutes a status-keyed sentence when the server sent none. */
function errText(json: unknown, status: number): string {
  return clause(extractApiError(json, status).message);
}

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
  const [toast, fire] = useToast();

  const cov = useMemo(() => {
    const total = trans.length;
    const approved = trans.filter(t => t.status === 'approved').length;
    const btv = trans.filter(t => t.btv).length;
    return { total, approved, btv, pct: total ? Math.round(approved / total * 100) : 0 };
  }, [trans]);

  // addTrans — REAL, awaited write. POSTs to the labeling backend, then adopts
  // the SERVER's row (real numeric id, via the shared mapLabelTranslations) so
  // the board and every later status advance act on the persisted record — no
  // optimistic row, no fabricated TR-<lang> id. The toast reports success only
  // after the write is confirmed; a duplicate or other failure is stated and
  // nothing is added to the view.
  const addTrans = async (v: Record<string, string>) => {
    const language = v.language;
    if (!language) { fire('Pick a target language first'); return; }
    if (!docId) { fire('No labeling document is loaded — nothing to add a translation to'); return; }
    if (trans.some(t => t.language === language)) { fire('A translation for ' + language + ' already exists'); setTForm(false); return; }
    const method = v.method || 'mt_postedited';
    try {
      const res = await apiRequest('POST', '/api/mdx/labeling/' + docId + '/translations', { language, translationMethod: method, status: 'pending' });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        fire(res.status === 409
          ? 'A translation for ' + language + ' already exists'
          : 'Couldn’t add the translation — ' + errText(json, res.status) + '. Nothing was saved.');
        return;
      }
      const adopted = mapLabelTranslations([envRow(json)])?.[0];
      if (!adopted) { fire('Saved, but the server returned an unexpected shape — reload to see it'); return; }
      setTrans(ts => [...ts.filter(t => t.id !== adopted.id && t.language !== adopted.language), { ...adopted, _new: true }]);
      setTForm(false);
      fire('Translation ' + language + ' saved · status Pending');
    } catch (e) {
      // A caught throw is only safe to render when it is an ApiRequestError: its
      // message has already been through the same reduction as errText above.
      // Anything else reaching here is a browser-native fetch rejection, whose
      // message ("Failed to fetch", "Load failed") is not user copy.
      const known = (e as { name?: unknown })?.name === 'ApiRequestError';
      const msg = known && (e as Error).message
        ? clause((e as Error).message)
        : 'the labeling service could not be reached';
      fire('Couldn’t add the translation — ' + msg + '. Nothing was saved.');
    }
  };
  // advTrans — REAL, awaited status advance. PATCHes the labeling backend, then
  // adopts the SERVER's updated row (persisted status). btv stays at whatever the
  // backend records — the client never sets back-translation verification, so the
  // "back-trans verified" chip can't appear from a client advance. On failure the
  // row is left untouched and the toast states nothing was persisted. (Rows carry
  // the real numeric id now, so the former TR-<lang> id.replace hack is gone.)
  const advTrans = async (id: string) => {
    const cur = trans.find(t => t.id === id);
    if (!cur) return;
    const order = ['pending', 'in_progress', 'review', 'approved'];
    const i = order.indexOf(cur.status);
    if (i < 0 || i >= order.length - 1) return;
    const nxt = order[i + 1];
    try {
      const res = await apiRequest('PATCH', '/api/mdx/labeling/translations/' + encodeURIComponent(id), { status: nxt });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        fire('Couldn’t advance the status — ' + errText(json, res.status) + '. Nothing was persisted.');
        return;
      }
      const adopted = mapLabelTranslations([envRow(json)])?.[0];
      setTrans(ts => ts.map(t => (t.id === id ? (adopted ?? { ...t, status: nxt }) : t)));
      fire('Status advanced to ' + nxt.replace('_', ' '));
    } catch (e) {
      // Same restriction as addTrans: only an ApiRequestError message has been
      // reduced to user copy; a native fetch rejection must not reach the toast.
      const known = (e as { name?: unknown })?.name === 'ApiRequestError';
      const msg = known && (e as Error).message
        ? clause((e as Error).message)
        : 'the labeling service could not be reached';
      fire('Couldn’t advance the status — ' + msg + '. Nothing was persisted.');
    }
  };

  const tTone: Record<string, string> = { approved: 'ok', review: 'warn', in_progress: 'ai', pending: 'idle', rejected: 'err' };

  /* What AnA can see of this screen.
     The three reads here are chained — no labeling document means no symbols and
     no translations — so "there is no document" has to be published as itself.
     Reported as an empty translation board it would read to AnA as a label with
     nothing left to translate, which is the opposite claim. */
  const anaContext = useMemo(() => {
    if (docsLive.loading) {
      return { summary: 'The labeling document is still loading; nothing on screen is final yet.' };
    }
    if (docsLive.error) {
      return {
        summary:
          'The labeling store could not be read, so this screen is showing no label because of a failure, ' +
          'not because none exists.',
        availableActions: ['Retry the labeling document read'],
      };
    }
    if (!docRow) {
      return {
        summary:
          'Labeling: this organisation has no labeling document yet, so there are no symbols or ' +
          'translations to show — the boards below are empty for that reason.',
        availableActions: ['Create a labeling document for a device'],
      };
    }
    const byStatus = trans.reduce<Record<string, number>>((acc, t) => {
      acc[t.status] = (acc[t.status] ?? 0) + 1;
      return acc;
    }, {});
    return {
      summary:
        `Labeling: "${docRow.device_name}" ${kindLabel} v${docRow.version} (${docRow.status})` +
        (docRow.udi_di ? `, UDI-DI ${docRow.udi_di}` : '') +
        '. ' +
        // Gated on the SEPARATE translations read, mirroring the on-screen lead:
        // a failed/in-flight fetch must not report "0 translation(s) — none yet"
        // for a label that may hold a fully approved set. The facts already
        // carried translationsUnavailable; the summary was the gap.
        (transState.loading
          ? 'Translations are still loading. '
          : transState.error
            ? 'The translation set could not be read — its coverage is unknown, not zero. '
            : `${trans.length} translation(s) — ` +
              (Object.keys(byStatus).length
                ? Object.entries(byStatus).map(([k, n]) => `${n} ${k.replace('_', ' ')}`).join(', ')
                : 'none yet') +
              '. ') +
        (symbolsLive.loading
          ? 'Symbols are still loading.'
          : symbolsLive.error
            ? 'The symbol list could not be read.'
            : `${symbolsLive.rows.length} symbol(s) recorded.`),
      facts: {
        document: {
          id: docRow.id, device: docRow.device_name, kind: kindLabel,
          version: docRow.version, status: docRow.status, udiDi: docRow.udi_di,
        },
        translations: trans.map((t) => ({
          id: t.id, language: t.language, name: t.name,
          method: t.method, backTranslationVerified: t.btv, status: t.status,
        })),
        translationsByStatus: byStatus,
        translationsUnavailable: transState.error ? 'the translation read failed' : null,
        symbols: symbolsLive.loading || symbolsLive.error
          ? null
          : symbolsLive.rows.map((sy) => ({
              code: sy.symbol_code, name: sy.symbol_name,
              description: sy.description, requiredBy: sy.required_by ?? [],
            })),
        symbolsUnavailable: symbolsLive.error ? 'the symbol read failed' : null,
      },
      availableActions: [
        'Add a target-language translation (a real persisted write)',
        'Advance a translation through pending, in progress, review, approved',
        'Read the symbol set and what each symbol is required by',
      ],
    };
  }, [docsLive.loading, docsLive.error, docRow, kindLabel, trans, transState.loading, transState.error, symbolsLive.loading, symbolsLive.error, symbolsLive.rows]);
  usePublishSurfaceContext('labeling', anaContext);

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
      /* ── "Language name" is gone ────────────────────────────────────────
         It was REQUIRED — the form refused to submit without it — and then
         `addTrans` never read `v.name`. The typed name was discarded on every
         submit, silently.

         It could not have been saved: `labeling_translations` keys a
         translation on its ISO language code and has no name column, and the
         display name is DERIVED from the code by `languageName()` (Intl
         DisplayNames). A free-text name beside the code would be a second
         spelling of one fact — the case where the two disagree has no correct
         resolution. So the code carries the guidance the name field was
         giving, and the row is titled from it. */
      {
        key: 'language',
        label: 'Language code',
        type: 'text',
        placeholder: 'e.g. pt, sv, cs, pt-BR',
        desc: 'The ISO 639-1 code (or BCP-47 tag). The language name shown on the board is derived from it.',
        required: true,
      },
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
            /* Gated on the TRANSLATIONS read, not the document read.
               This lead sits inside the document-read gate, while `cov` derives
               from a separate translations read — so a failed or in-flight
               translations fetch made `cov.total` 0 and the headline told a
               device owner that no target-language IFU exists, for an EU MDR
               filing that may hold a fully approved set. The table twelve lines
               below said "Couldn't load translations" at the same moment. */
            headline={transState.loading
              ? <>Reading this label's translation coverage…</>
              : transState.error
              ? <>Couldn't read this label's translation coverage, so nothing is claimed about it here.</>
              : cov.total === 0
              ? <>No translations are recorded for this label yet.</>
              : cov.approved < cov.total
                ? <>The label content is controlled; <b>{cov.total - cov.approved}</b> of {cov.total} translation{cov.total === 1 ? '' : 's'} {cov.total - cov.approved === 1 ? 'is' : 'are'} still short of approved.</>
                : <>All {cov.total} translation{cov.total === 1 ? '' : 's'} are approved.</>}
            body={transState.loading
              /* The body was gated only on `cov.total === 0`, so during a
                 pending or failed read it printed the "add translations to
                 start tracking" call to action directly under a headline that
                 said "Reading…" / "Couldn't read". It now follows the headline. */
              ? <>Coverage figures appear once the translations have been read.</>
              : transState.error
              ? <>No coverage figure is claimed until the translations can be read.</>
              : cov.total === 0
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
              {/* "0/0 approved / 0 back-translation verified" printed over a
                  pending or failed read, directly above a table that said
                  "Loading…" / "Couldn't load". Figures only from a settled read. */}
              <div className="sec-sub">{transState.loading ? 'Reading translations…' : transState.error ? 'Coverage not read' : `${cov.approved}/${cov.total} approved / ${cov.btv} back-translation verified`}</div>
              <button className="btn ghost" style={{ marginLeft: 'auto' }} onClick={() => setTForm(true)}>{I.plus} Add translation</button>
            </div>
            <div className="lbl-cov-bar"><div className="lbl-cov-fill" style={{ width: (transState.loading || transState.error ? 0 : cov.pct) + '%' }} /></div>
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

      <C2CToast msg={toast} />
    </div>
  );
}
