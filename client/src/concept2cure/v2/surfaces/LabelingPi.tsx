import React, { useMemo, useState } from 'react';
import { I } from '../icons';
import { useLiveRows, useLiveData, EmptyState, ErrorState } from '../dataConnect';
import { assessmentStateFor, hasAnswer } from '../assessmentState';
import { apiRequest, serverMessage } from '@/lib/queryClient';
import { C2CToast, useToast } from '../toast';
import { downloadBlob, downloadText, safeFileName } from '../download';
import { RedlineText } from '../RedlineText';
import { usePublishSurfaceContext } from '../surfaceContext';
import { useSurfaceActionHandlers, notifySurfaceActionReady } from '../surfaceActions';
import type { SurfaceViewProps } from '../surfaceViews';
import '../styles/project-home-v2.css';

/* ── Live read shapes ── */

interface LpContent {
  heading: string;
  body: string[];
  hl?: boolean;
  warn?: boolean;
}

interface LpNegotiation {
  round: string;
  cycle: string;
  sponsor: string;
  agency: string;
  rationale: string;
}

/* One row per label section — the live read shape (GET /api/labeling-pi,
   assembled from the REAL org-scoped labeling_pi_sections store written via
   POST /api/labeling-pi). The section number + label are catalog; `st`, `flag`,
   `content`, `program` and `negotiation` are per-org instance state.
   `content`/`negotiation` arrive as JSONB and are null for sections without
   them. */
interface LpRow {
  n: string;
  label: string;
  st: string;
  flag: string | null;
  program: string | null;
  content: LpContent | null;
  negotiation: LpNegotiation | null;
  updatedAt?: string | null;
}

/* EU SmPC readiness — GET /api/labeling-smpc, the QRD catalog merged with this
   org's per-section authoring status (c2c_smpc_sections). A different store and
   a different section tree from the USPI: the format tabs switch between two
   real documents, not between three renderings of one. */
interface SmpcSection {
  number: string;
  title: string;
  depth: number;
  required: boolean;
  status: 'missing' | 'draft' | 'review' | 'final';
}
interface SmpcReadiness {
  sections: SmpcSection[];
  finalRequired: number;
  totalRequired: number;
  completenessPct: number;
  ready: boolean;
  outstanding: string[];
}

type LabelFormat = 'uspi' | 'smpc' | 'spl';

const LP_FORMATS: ReadonlyArray<[LabelFormat, string]> = [
  ['uspi', 'USPI — PLLR'],
  ['smpc', 'EU SmPC — QRD'],
  ['spl', 'SPL — submission'],
];

/* The regulatory stage ladder. Fixed by the review process (21 CFR 314 /
   PDUFA cycle), but WHERE a label stands on it is not a user preference — it
   is a fact about the org's sections, so it is derived below and rendered as a
   read-out rather than as four buttons that set a state nothing stores. */
const LP_STAGES = ['Draft', 'FDA labeling review', 'Negotiation', 'Approved'] as const;

/**
 * Where this label actually stands, computed from the sections themselves.
 *
 * Reading, in order of precedence: an open agency edit or a stored negotiation
 * means the label is in negotiation; every section approved (and there is at
 * least one) means approved; anything in review means the agency's labeling
 * review; otherwise it is still a draft. Returns -1 when there are no sections
 * to read a stage from — the ladder then shows nothing rather than asserting
 * "Draft" about a label that does not exist yet.
 */
export function deriveLabelStage(rows: Array<Pick<LpRow, 'st' | 'flag' | 'negotiation'>>): number {
  const live = rows.filter((r) => r.st !== 'na');
  if (live.length === 0) return -1;
  if (live.some((r) => r.flag === 'agency' || r.negotiation != null)) return LP_STAGES.indexOf('Negotiation');
  if (live.every((r) => r.st === 'approved')) return LP_STAGES.indexOf('Approved');
  if (live.some((r) => r.st === 'review')) return LP_STAGES.indexOf('FDA labeling review');
  return LP_STAGES.indexOf('Draft');
}

/** The whole label as plain text, in USPI document order — what an export carries. */
function labelDocumentText(rows: LpRow[]): string {
  return rows
    .filter((r) => r.content && r.content.body.length > 0)
    .map((r) => {
      const c = r.content as LpContent;
      return `${c.heading}\n\n${c.body.join('\n\n')}`;
    })
    .join('\n\n');
}

/** The product this label belongs to, as the org recorded it — or null. */
function labelProgram(rows: LpRow[]): string | null {
  for (const r of rows) {
    const p = (r.program ?? '').trim();
    if (p) return p;
  }
  return null;
}

const SMPC_STATUS_LABEL: Record<SmpcSection['status'], string> = {
  missing: 'Not started',
  draft: 'Draft',
  review: 'In review',
  final: 'Final',
};

/* ════ Labeling PI -- prescribing information surface ════ */

export function LabelingPI({ onAsk }: SurfaceViewProps) {
  const [fmt, setFmt] = useState<LabelFormat>('uspi');
  const [active, setActive] = useState('1');
  const [toast, fireToast] = useToast();
  const [busy, setBusy] = useState('');
  const [reason, setReason] = useState('');
  const [redlineOpen, setRedlineOpen] = useState(false);
  const [reload, setReload] = useState(0);

  /* Fixture-free (real-data standard): the org's label worklist is read live
     from the REAL labeling_pi_sections store (written via POST /api/labeling-pi).
     Real rows, an honest empty state, or an honest error — never a fixture. */
  const { rows, loading, error, empty } = useLiveRows<LpRow>('/api/labeling-pi', [
    '/api/labeling-pi',
    reload,
  ]);

  /* The EU document is a genuinely different read. It is only fetched when the
     SmPC tab is open — switching format should not cost a request against a
     store the user is not looking at. */
  const smpc = useLiveData<SmpcReadiness>(fmt === 'smpc' ? '/api/labeling-smpc' : null, [
    fmt,
    reload,
  ]);

  /* Whether this surface has an ANSWER to state, as opposed to a count it can
     compute. The KPI row renders above the error branch, so on a failed read
     `rows` is [] and every metric derived from it reads zero — and one of them
     is "Boxed warning proposed". A boxed warning is the most serious element of
     a US label; reporting zero proposed when the read failed tells a regulatory
     director the label carries none, in the neutral tone, on the strength of
     nothing. That is BP-W0-3's defect — an empty result standing in for an
     unexamined one — on a surface the fix did not reach. */
  const answerable = hasAnswer(
    assessmentStateFor(
      { loading, error },
      { scopeExists: true, findingCount: rows.length, assessmentRan: !loading && !error },
    ),
  );
  const stIdx = useMemo(() => deriveLabelStage(rows), [rows]);
  const numberedSections = rows.filter((s) => /^\d/.test(s.n)).length;
  const boxedProposed = rows.filter((s) => s.n === 'BW' && s.st !== 'na').length;
  const sec = rows.find((s) => s.n === active) || rows[2] || rows[0];
  const content = sec?.content || {
    heading: (sec?.n ?? active) + '  ' + (sec?.label ?? ''),
    body: [
      'Section content is maintained in the structured label and rendered here. Open in the editor to author, or ask AnA to draft from the clinical and safety files.',
    ],
  };
  const neg = sec?.negotiation ?? null;
  const agencyOpen = rows.filter((s) => s.flag === 'agency').length;
  const program = labelProgram(rows);

  /* ── The document identity bar ──────────────────────────────────────────────
     This read `BX-204 (rezatinib) -- USPI — v3.2` for every organization that
     ever opened the surface: an invented product, molecule and version number
     headed above whatever real sections the tenant's own store returned. The
     product now comes from the sections themselves (`program`, recorded on the
     row at write time) and the version claim is gone entirely — the label store
     carries no version, and a number that is not a fact about the document is
     worse than no number at all. */
  const docTitle = program
    ? `${program} — US prescribing information`
    : 'US prescribing information';
  const docId = program ?? 'Label — no product recorded';

  /* ── Export: what is on screen, rendered ────────────────────────────────────
     "PDF" and "Word" were bare <button>s with no handler. Both renderers exist
     and take { title, content }; what gets exported is the label assembled from
     the same rows the page renders, in the same USPI document order — not a
     re-derivation, and never AnA-generated prose. */
  const exportLabel = async (format: 'pdf' | 'docx') => {
    if (busy) return;
    const body = labelDocumentText(rows);
    if (!body) {
      fireToast('Nothing to export — no section in this label has authored text yet.', 'error');
      return;
    }
    setBusy(format);
    try {
      const res = await apiRequest(
        'POST',
        `/api/concept2cure/artifacts/export-${format === 'pdf' ? 'pdf' : 'docx'}`,
        { title: docTitle, content: body },
      );
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        fireToast(
          `The ${format.toUpperCase()} was not produced — ` +
            (serverMessage(j) ?? `the server refused it (HTTP ${res.status})`) +
            '. The label is unchanged.',
          'error',
        );
        return;
      }
      const ok = downloadBlob(safeFileName(docTitle, 'prescribing-information') + '.' + format, await res.blob());
      fireToast(
        ok
          ? `${format.toUpperCase()} downloaded — ${rows.filter((r) => r.content).length} authored sections in USPI document order.`
          : 'The file was produced but the browser refused the download.',
        ok ? 'ok' : 'error',
      );
    } catch (e) {
      fireToast(
        `The ${format.toUpperCase()} was not produced — ` +
          (e instanceof Error ? e.message : String(e)) +
          '. The label is unchanged.',
        'error',
      );
    } finally {
      setBusy('');
    }
  };

  /* ── Accept FDA text: a governed record change ───────────────────────────────
     The primary button in the negotiation panel did nothing at all. It now
     performs the write it names — POST /api/labeling-pi/:n/accept-agency-text —
     which replaces the sponsor's words with the agency's, moves the section to
     approved, clears the agency flag, and records both sides plus the reason in
     the Part 11 audit trail. The reason is required by the server; the button
     stays disabled until one is typed so the refusal is not a round trip. */
  const acceptAgencyText = async () => {
    if (busy || !sec || !neg) return;
    if (reason.trim().length < 8) {
      fireToast('Enter a reason for change (at least 8 characters) before accepting agency text.', 'error');
      return;
    }
    setBusy('accept');
    try {
      const res = await apiRequest('POST', `/api/labeling-pi/${encodeURIComponent(sec.n)}/accept-agency-text`, {
        reasonForChange: reason.trim(),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) {
        fireToast(
          'The agency text was not accepted — ' +
            (serverMessage(j) ?? `the server refused it (HTTP ${res.status})`) +
            `. §${sec.n} is unchanged.`,
          'error',
        );
        return;
      }
      setReason('');
      setRedlineOpen(false);
      setReload((r) => r + 1);
      fireToast(`§${sec.n} now carries the agency's text and is marked approved. The change is in the audit trail.`);
    } catch (e) {
      fireToast(
        'The agency text was not accepted — ' +
          (e instanceof Error ? e.message : String(e)) +
          `. §${sec.n} is unchanged.`,
        'error',
      );
    } finally {
      setBusy('');
    }
  };

  /* ── SPL: the submission format, built from the org's own label text ─────────
     Product identity (name, manufacturer) is not carried in the label store, so
     it is collected here and validated server-side; the PROSE is always the
     org's stored sections. */
  const [spl, setSpl] = useState({ productName: '', manufacturer: '', ndc: '', ingredient: '', strength: '' });
  const buildSpl = async () => {
    if (busy) return;
    setBusy('spl');
    try {
      const res = await apiRequest('POST', '/api/labeling-pi/spl', {
        productName: spl.productName,
        manufacturer: spl.manufacturer,
        ndc: spl.ndc || undefined,
        activeIngredients: [{ name: spl.ingredient, strength: spl.strength || undefined }],
      });
      const j = (await res.json().catch(() => null)) as
        | { data?: { xml: string; sectionCount: number; validation: { valid: boolean; findings: Array<{ message: string }> } } }
        | null;
      if (!res.ok || !j?.data?.xml) {
        fireToast(
          'The SPL was not built — ' + (serverMessage(j) ?? `the server refused it (HTTP ${res.status})`) + '.',
          'error',
        );
        return;
      }
      const ok = downloadText(
        safeFileName(spl.productName || 'label', 'label') + '-spl.xml',
        j.data.xml,
        'application/xml;charset=utf-8',
      );
      const v = j.data.validation;
      fireToast(
        ok
          ? `SPL downloaded — ${j.data.sectionCount} sections from this label. ` +
              (v?.valid
                ? 'It passes the structural check.'
                : `It does NOT pass the structural check: ${(v?.findings ?? []).map((f) => f.message).join('; ')}`)
          : 'The SPL was built but the browser refused the download.',
        ok && v?.valid ? 'ok' : 'error',
      );
    } catch (e) {
      fireToast('The SPL was not built — ' + (e instanceof Error ? e.message : String(e)) + '.', 'error');
    } finally {
      setBusy('');
    }
  };

  /* WHAT ANA SEES HERE — one publish, every branch. Loading, error and empty
     publish as themselves: a failed read is a failure, never an empty label. */
  const anaContext = useMemo(() => {
    const actions = [
      'Switch USPI / EU SmPC / SPL views; open a numbered section',
      'Accepting agency text (reason-for-change gated, Part 11 audited), exporting the label, and building SPL are governed — AnA proposes them in conversation, never through screen controls; the reason field is audited evidence and is never auto-filled.',
    ];
    if (loading) {
      return { summary: 'The label worklist is still loading; nothing on screen is final yet.' };
    }
    if (error) {
      // The same message the ErrorState shows — a failed read, not an empty label.
      return {
        summary: `The label could not be loaded — ${error}. A failed read, not an empty label.`,
        facts: { error },
      };
    }
    if (empty) {
      return {
        summary:
          'Labeling — prescribing information: no label sections yet. Record or author USPI sections and the section tree, rendered label text and agency negotiation appear here.',
      };
    }
    if (fmt === 'smpc') {
      // A second document with its own read — its triple publishes as itself.
      if (smpc.loading) {
        return { summary: 'EU SmPC (QRD): readiness is still loading.', availableActions: actions };
      }
      if (smpc.error) {
        return {
          summary: `The EU SmPC could not be loaded — ${smpc.error}. A failed read, not an empty document.`,
          facts: { format: fmt, error: smpc.error },
          availableActions: actions,
        };
      }
      if (!smpc.data) {
        return {
          summary: 'EU SmPC (QRD): no readiness available — the section statuses for this organization could not be read.',
          facts: { format: fmt },
          availableActions: actions,
        };
      }
      return {
        summary:
          `EU SmPC (QRD): ${smpc.data.completenessPct}% complete — ` +
          `${smpc.data.finalRequired} of ${smpc.data.totalRequired} required sections final; ` +
          (smpc.data.ready ? 'the set reports as ready.' : `${smpc.data.outstanding.length} section(s) outstanding.`),
        facts: {
          format: fmt,
          completenessPct: smpc.data.completenessPct,
          finalRequired: smpc.data.finalRequired,
          totalRequired: smpc.data.totalRequired,
          ready: smpc.data.ready,
          outstanding: smpc.data.outstanding,
        },
        availableActions: actions,
      };
    }
    if (fmt === 'spl') {
      return {
        summary:
          'SPL: the SPL build form — a submission artifact builder; its fields are product identity for a governed build from this label\'s own sections.',
        facts: { format: fmt },
        availableActions: actions,
      };
    }
    // USPI. Counts only when `answerable` — zero-proposed over a failed read is
    // the exact lie this surface documents against. The store carries no
    // version; none is invented.
    return {
      summary:
        'US prescribing information (USPI — PLLR)' +
        (program ? ` for ${program}` : '') +
        (stIdx >= 0 ? `, at ${LP_STAGES[stIdx]}` : '') +
        (answerable
          ? ` — ${numberedSections} numbered section(s), ${agencyOpen} open agency edit(s), ${boxedProposed} boxed warning(s) proposed`
          : '') +
        `. §${active} is open.`,
      facts: {
        format: fmt,
        ...(stIdx >= 0 ? { stage: LP_STAGES[stIdx] } : {}),
        activeSection: active,
        ...(answerable ? { sections: numberedSections, agencyOpen, boxedProposed } : {}),
        ...(program ? { docTitle } : {}),
      },
      availableActions: actions,
    };
  }, [loading, error, empty, fmt, smpc.loading, smpc.error, smpc.data, stIdx, active, answerable, numberedSections, agencyOpen, boxedProposed, program, docTitle]);
  /* View state only. Accepting agency text, exporting and building SPL are
     governed acts, and the reason field is never filled by AnA — the section
     handler clears it exactly as the person's own click does. */
  useSurfaceActionHandlers('labeling-pi', {
    'labeling-pi.set-format': (params) => {
      const target = String(params.format ?? '');
      if (!['uspi', 'smpc', 'spl'].includes(target)) {
        return { ok: false, reason: `No label format named "${params.format}".` };
      }
      if (fmt === target) return { ok: true, detail: `Already showing the ${target.toUpperCase()} view` };
      setFmt(target as LabelFormat);
      return { ok: true, detail: `Opened the ${target.toUpperCase()} view` };
    },
    'labeling-pi.open-section': (params) => {
      const raw = String(params.section ?? '').trim();
      if (!raw) return { ok: false, reason: 'Name a section to open.' };
      if (loading) return { ok: false, reason: 'The label worklist is still loading.', retry: true };
      if (error) return { ok: false, reason: 'The label could not be read, so no sections are listed to open.' };
      const needle = raw.toLowerCase();
      const exact = rows.filter((r) => r.n.toLowerCase() === needle || r.label.toLowerCase() === needle);
      const hits = exact.length ? exact : rows.filter((r) => r.label.toLowerCase().includes(needle));
      if (hits.length === 0) return { ok: false, reason: `No label section named "${raw}".` };
      if (hits.length > 1) return { ok: false, reason: `"${raw}" matches ${hits.length} sections — name one exactly.` };
      const row = hits[0];
      const switched = fmt !== 'uspi';
      if (switched) setFmt('uspi');
      // The person's own click: select, close any redline, clear the reason box.
      setActive(row.n);
      setRedlineOpen(false);
      setReason('');
      return {
        ok: true,
        detail: `Opened §${row.n} ${row.label}` + (switched ? ' on the USPI view' : ''),
      };
    },
  });
  React.useEffect(() => {
    if (!loading && !error) notifySurfaceActionReady('labeling-pi');
  }, [loading, error]);

  usePublishSurfaceContext('labeling-pi', anaContext);

  return (
    <div className="reg-wrap">
      <div className="reg-head">
        <div>
          <div className="reg-eyebrow">Platform — authoring</div>
          <h1 className="reg-title">Labeling — prescribing information</h1>
          <p className="reg-sub">The label itself — PLLR / 21 CFR 201.57 (USPI), EU SmPC (QRD), and SPL for submission. The highest-stakes document of the review, negotiated with the agency at end of cycle.</p>
        </div>
        <button
          className="reg-cta"
          onClick={() =>
            onAsk &&
            onAsk(
              program
                ? `Draft the ${program} USPI from the clinical studies, safety file, and CMC`
                : 'Draft the USPI from the clinical studies, safety file, and CMC',
            )
          }
        >
          {I.sparkles} Draft with AnA
        </button>
      </div>

      <div className="reg-kpis">
        <div className="reg-kpi"><div className="reg-kpi-v">PLLR</div><div className="reg-kpi-l">USPI format — 21 CFR 201.57</div></div>
        <div className="reg-kpi"><div className="reg-kpi-v">{answerable ? numberedSections : '--'}</div><div className="reg-kpi-l">Full PI sections</div></div>
        <div className="reg-kpi" data-tone={answerable ? 'warn' : undefined}><div className="reg-kpi-v">{answerable ? agencyOpen : '--'}</div><div className="reg-kpi-l">Open agency edits</div></div>
        <div className="reg-kpi" data-tone={answerable && boxedProposed ? 'err' : undefined}><div className="reg-kpi-v">{answerable ? boxedProposed : '--'}</div><div className="reg-kpi-l">Boxed warning proposed</div></div>
      </div>

      <div className="lp-fmt">
        {LP_FORMATS.map(([id, l]) => (
          <button
            key={id}
            type="button"
            className={'lp-fmt-b' + (fmt === id ? ' on' : '')}
            aria-pressed={fmt === id}
            onClick={() => setFmt(id)}
          >
            {l}
          </button>
        ))}
        {/* Read-out, not a control: where the label stands is derived from the
            sections (deriveLabelStage), so there is nothing here for a click to
            set. It used to be four buttons over a local useState('Negotiation')
            that started on "Negotiation" for every org and persisted nothing. */}
        <ol className="lp-stages" aria-label="Regulatory stage of this label">
          {LP_STAGES.map((s, i) => (
            <li
              key={s}
              className={'lp-stage' + (i === stIdx ? ' on' : '') + (i < stIdx ? ' done' : '')}
              aria-current={i === stIdx ? 'step' : undefined}
              title={stIdx < 0 ? 'No label sections recorded yet' : undefined}
            >
              <span className="lp-stage-dot">{i < stIdx ? I.check : i + 1}</span>{s}
            </li>
          ))}
        </ol>
      </div>

      {loading ? (
        <div className="scaf-note" style={{ padding: '18px 10px' }}>Loading the label worklist…</div>
      ) : error ? (
        <ErrorState
          title="Couldn't load the label"
          message={error}
          retry={() => setReload((r) => r + 1)}
        />
      ) : empty ? (
        <EmptyState
          icon={I.fileText}
          title="No label sections yet"
          hint="Record or author USPI sections and the section tree, rendered label text, and agency negotiation appear here."
        />
      ) : fmt === 'smpc' ? (
        /* ── EU SmPC — a real second document, not the US label relabelled ──
           Switching to this tab used to move a highlight and nothing else: the
           US section tree and US label text stayed on screen under a heading
           that said EU SmPC. It now reads the org's own QRD section statuses
           and readiness rollup from /api/labeling-smpc. */
        <div className="lp-smpc">
          {smpc.loading ? (
            <div className="scaf-note" style={{ padding: '18px 10px' }}>Loading the EU SmPC…</div>
          ) : smpc.error ? (
            <ErrorState title="Couldn't load the EU SmPC" message={smpc.error} retry={() => setReload((r) => r + 1)} />
          ) : !smpc.data ? (
            <EmptyState
              icon={I.fileText}
              title="No EU SmPC readiness available"
              hint="The QRD section statuses for this organization could not be read."
            />
          ) : (
            <>
              <div className="reg-kpis" style={{ marginBottom: 12 }}>
                <div className="reg-kpi"><div className="reg-kpi-v">{smpc.data.completenessPct}%</div><div className="reg-kpi-l">Required QRD sections final</div></div>
                <div className="reg-kpi"><div className="reg-kpi-v">{smpc.data.finalRequired}/{smpc.data.totalRequired}</div><div className="reg-kpi-l">Final of required</div></div>
                <div className="reg-kpi" data-tone={smpc.data.ready ? undefined : 'warn'}><div className="reg-kpi-v">{smpc.data.outstanding.length}</div><div className="reg-kpi-l">Outstanding sections</div></div>
              </div>
              <aside className="lp-tree" style={{ maxWidth: 'none' }}>
                <div className="lp-tree-h">EU SmPC — QRD sections</div>
                {smpc.data.sections.map((s) => (
                  <div key={s.number} className="lp-sec" data-st={s.status} style={{ paddingLeft: 10 + s.depth * 14 }}>
                    <span className="lp-sec-n">{s.number}</span>
                    <span className="lp-sec-l">{s.title}</span>
                    <span className="lp-sec-st">{SMPC_STATUS_LABEL[s.status]}{s.required ? '' : ' · optional'}</span>
                    <span className="lp-sec-dot" data-st={s.status} />
                  </div>
                ))}
              </aside>
            </>
          )}
        </div>
      ) : fmt === 'spl' ? (
        /* ── SPL — the submission format, built from this label's own text ──
           The prose is the org's stored USPI sections; only the product
           identity SPL requires and the label store does not carry is asked
           for here. The server refuses to emit an SPL with an empty
           Indications or Warnings element and says which section is empty. */
        <div className="lp-spl">
          <p className="scaf-note" style={{ margin: '0 0 12px' }}>
            SPL (Structured Product Labeling) is the XML FDA accepts for submission. It is generated
            from §1 Indications, §2 Dosage and administration, §4 Contraindications and §5 Warnings
            and precautions as they stand in this label — nothing is re-authored. Product identity is
            not held in the label store, so supply it here — an SPL without a product name,
            manufacturer or active ingredient is refused rather than emitted incomplete.
          </p>
          <div className="lp-spl-form">
            <label className="lp-spl-f">
              <span>Product name</span>
              <input
                value={spl.productName}
                onChange={(e) => setSpl((s) => ({ ...s, productName: e.target.value }))}
                placeholder={program ?? 'Proprietary name'}
              />
            </label>
            <label className="lp-spl-f">
              <span>Manufacturer</span>
              <input
                value={spl.manufacturer}
                onChange={(e) => setSpl((s) => ({ ...s, manufacturer: e.target.value }))}
                placeholder="Labeler / manufacturer name"
              />
            </label>
            <label className="lp-spl-f">
              <span>Active ingredient</span>
              <input
                value={spl.ingredient}
                onChange={(e) => setSpl((s) => ({ ...s, ingredient: e.target.value }))}
                placeholder="Established (non-proprietary) name"
              />
            </label>
            <label className="lp-spl-f">
              <span>Strength (optional)</span>
              <input
                value={spl.strength}
                onChange={(e) => setSpl((s) => ({ ...s, strength: e.target.value }))}
                placeholder="e.g. 50 mg"
              />
            </label>
            <label className="lp-spl-f">
              <span>NDC (optional)</span>
              <input
                value={spl.ndc}
                onChange={(e) => setSpl((s) => ({ ...s, ndc: e.target.value }))}
                placeholder="00000-000-00"
              />
            </label>
          </div>
          <button
            className="reg-btn pri"
            onClick={buildSpl}
            disabled={busy === 'spl' || !spl.productName.trim() || !spl.manufacturer.trim() || !spl.ingredient.trim()}
          >
            {I.download} {busy === 'spl' ? 'Building SPL…' : 'Build and download SPL XML'}
          </button>
        </div>
      ) : (
      <div className="lp-split">
        <aside className="lp-tree">
          <div className="lp-tree-h">Label sections</div>
          {rows.map(s => (
            <button key={s.n} className={'lp-sec' + (s.n === active ? ' on' : '')} data-st={s.st} onClick={() => { setActive(s.n); setRedlineOpen(false); setReason(''); }}>
              <span className="lp-sec-n">{s.n}</span>
              <span className="lp-sec-l">{s.label}</span>
              {s.flag === 'agency' && <span className="lp-sec-flag" title="FDA proposed an edit">{I.gitBranch || I.alertTriangle}</span>}
              <span className="lp-sec-dot" data-st={s.st} />
            </button>
          ))}
        </aside>

        <div className="lp-main">
          <div className="lp-doc">
            <div className="lp-doc-bar">
              <span className="lp-doc-id">{docId} — USPI</span>
              <div className="lp-doc-acts">
                <button className="reg-mini" onClick={() => exportLabel('pdf')} disabled={busy === 'pdf'}>
                  {I.fileText} {busy === 'pdf' ? 'Rendering…' : 'PDF'}
                </button>
                <button className="reg-mini" onClick={() => exportLabel('docx')} disabled={busy === 'docx'}>
                  {I.download} {busy === 'docx' ? 'Rendering…' : 'Word'}
                </button>
                <button
                  className="reg-mini"
                  onClick={() =>
                    onAsk &&
                    onAsk(
                      `Open §${active} of the ${program ? program + ' ' : ''}USPI in the editor`,
                    )
                  }
                >
                  {I.penLine} Open in editor
                </button>
              </div>
            </div>
            <div className={'lp-page' + (content.hl ? ' hl' : '')}>
              {content.warn && <div className="lp-bw">{content.body[0]}</div>}
              {!content.warn && <>
                <div className="lp-page-h">{content.heading}</div>
                {content.body.map((p, i) => <p key={i} className="lp-page-p">{p}</p>)}
              </>}
              {content.hl && <div className="lp-hl-note">Highlights are a concise summary; see the numbered full prescribing information for complete labeling.</div>}
            </div>
          </div>

          {neg && (
            <div className="lp-neg">
              <div className="lp-neg-h">
                <span className="lp-neg-t">{I.gitBranch || I.alertTriangle} Agency labeling negotiation -- §{active}</span>
                <span className="lp-neg-m">{neg.round} -- {neg.cycle}</span>
              </div>
              <div className="lp-neg-diff">
                <div className="lp-neg-row sponsor"><span className="lp-neg-tag">Sponsor</span><p>{neg.sponsor}</p></div>
                <div className="lp-neg-row agency"><span className="lp-neg-tag">FDA proposed</span><p>{neg.agency}</p></div>
              </div>
              <div className="lp-neg-rat"><span>{I.sparkles}</span><p>{neg.rationale}</p></div>

              {/* The full redline. This was a ghost button; the word-level diff
                  is computed here from the two texts already on screen — nothing
                  is fetched and nothing is inferred server-side. */}
              {redlineOpen && (
                <div className="lp-neg-redline">
                  <div className="lp-neg-redline-h">
                    Full redline — sponsor text as the agency would change it
                  </div>
                  <RedlineText previous={neg.sponsor} current={neg.agency} />
                </div>
              )}

              <label className="lp-neg-reason">
                <span>Reason for change (audited)</span>
                <input
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Why this agency wording is being adopted"
                  aria-label="Reason for change, required to accept agency text"
                />
              </label>
              <div className="lp-neg-acts">
                <button
                  className="reg-btn pri"
                  onClick={acceptAgencyText}
                  disabled={busy === 'accept' || reason.trim().length < 8}
                  title={reason.trim().length < 8 ? 'Enter a reason for change to accept' : undefined}
                >
                  {I.check} {busy === 'accept' ? 'Recording…' : 'Accept FDA text'}
                </button>
                <button className="reg-btn" onClick={() => onAsk && onAsk('Draft a counter-proposal to FDA labeling edit on §' + active)}>Counter with AnA</button>
                <button
                  className="reg-btn ghost"
                  onClick={() => setRedlineOpen((o) => !o)}
                  aria-expanded={redlineOpen}
                >
                  {redlineOpen ? 'Hide full redline' : 'View full redline'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
      )}
      <C2CToast msg={toast} />
    </div>
  );
}
