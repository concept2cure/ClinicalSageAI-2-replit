/**
 * IND Module-1 Forms panel — build, render, and file the real FDA form PDFs.
 *
 * Wired to server/routes/ind-forms.routes.ts (mounted /api/ind-forms, JWT +
 * regulatory-author role). The engine is stateless/deterministic:
 *   • GET  /?projectIdent      — the supported forms, what the engine WILL
 *                                produce for each (renderPlans), the open
 *                                program's recorded facts, and the sponsor-
 *                                completed forms already filed
 *   • POST /:formId/build      — builds the field map; returns
 *                                { formId, fields, missingRequired } so the gaps
 *                                are the SERVER's verdict, not a guess
 *   • POST /:formId/pdf        — streams the filled FDA form as application/pdf
 *   • POST /:formId/official-upload — files the sponsor's COMPLETED, SIGNED form
 *                                as a Module 1 leaf in the program's sequence
 *
 * ── Where the values come from ──────────────────────────────────────────────
 * Sponsor, product, indication and the agency application number are read from
 * the open program's record (regulatory_programs + its organisation) by the
 * SERVER, on every request. They are shown here read-only, exactly as the forms
 * will carry them, because a regulated filing's sponsor name must not depend on
 * who typed it into which panel. Only what the record has no column for — the
 * study phase, the submission's serial number — is entered here, and an unfilled
 * field arrives at the server as absent so `missingRequired` stays truthful.
 *
 * With no program open the panel still works standalone: every field is entered
 * here and nothing is claimed to come from a record.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { I } from '../icons';
import { EmptyState } from '../dataConnect';
import { apiRequest, apiUpload, serverMessage } from '@/lib/queryClient';
import type { FireToast } from '../toast';
import { downloadBlob } from '../download';

interface BuildResult { formId?: string; missingRequired?: string[]; fields?: Record<string, unknown> | Array<unknown>; }

/** What the engine will produce for a form — the server's own plan. */
interface RenderPlan {
  formId: string;
  method: 'official-acroform' | 'official-xfa-datasets' | 'reconstruction' | 'draft';
  officialTemplate: boolean;
  edition: string | null;
  reviewedBy: string | null;
  platformWrites: string[];
  sponsorCompletes: Array<{ id: string; label: string }>;
}

/** The open program's recorded facts, as the forms will carry them. */
interface ProgramFacts {
  id: string;
  code: string | null;
  name: string | null;
  programType: string | null;
  sponsorName: string | null;
  productName: string | null;
  indication: string | null;
  applicationNumber: string | null;
  formMetadata: Record<string, unknown>;
}

/** A sponsor-completed official form already filed into the sequence. */
interface Placement {
  formId: string;
  leafId: number;
  sectionCode: string;
  sequenceNumber: string;
  fileName: string;
  sha256: string;
  byteSize: number;
}

const FORM_LABELS: Record<string, string> = {
  'FDA_1571': 'FDA 1571 — IND application',
  'FDA_1572': 'FDA 1572 — Statement of investigator',
  'FDA_3674': 'FDA 3674 — ClinicalTrials.gov certification',
  'FDA_3454': 'FDA 3454 — Financial disclosure (none)',
  'FDA_3455': 'FDA 3455 — Financial disclosure (disclosed)',
  'FDA_356H': 'FDA 356h — NDA / ANDA / BLA application',
  'FDA_1574': 'FDA 1574 — Assurance of IRB review',
};

const PHASES = ['Phase 1', 'Phase 2', 'Phase 3'];

/** The open program's identifier — a regulatory_programs UUID, a program code,
 *  or a legacy numeric project id (a `proj_` prefix on a numeric id is
 *  stripped). The SERVER resolves whichever it is, org-scoped; this panel never
 *  demands a numeric id (window.C2C_PROJECT.id is a program UUID). */
function readProjectIdent(): string | null {
  const p = (window as unknown as { C2C_PROJECT?: { id?: unknown } }).C2C_PROJECT;
  const raw = String(p?.id ?? '').trim().replace(/^proj_(?=\d+$)/, '');
  return raw !== '' ? raw : null;
}

/** A legacy numeric project id addresses the artifact registry and carries no
 *  program facts — only a program ident does, which is what the server reads. */
function programIdentOf(ident: string | null): string | null {
  return ident != null && !/^\d+$/.test(ident) ? ident : null;
}

/** The label an agency number carries on this program's forms. */
function applicationNumberLabel(programType: string | null): string {
  const t = (programType ?? '').toUpperCase();
  return t === 'IND' ? 'IND number'
    : t === 'NDA' ? 'NDA number'
      : t === 'BLA' ? 'BLA number'
        : t === 'MAA' ? 'MAA number'
          : 'Application number';
}

/** What the engine will produce, said plainly and without adjectives. */
function renderStatement(plan: RenderPlan | undefined): string {
  if (!plan) return '';
  const edition = plan.edition ? ` (edition ${plan.edition})` : '';
  switch (plan.method) {
    case 'official-acroform':
      return `Returns the official FDA form${edition} with the program's values filled in and flattened.`;
    case 'official-xfa-datasets':
      return `Returns the official FDA form${edition} with the program's values written into it. Complete the remaining boxes and sign it in Adobe Acrobat.`;
    case 'reconstruction':
      return 'No official template is installed, so this returns a labeled reconstruction — not the official FDA form.';
    default:
      return 'No official template is installed, so this returns a labeled draft — not the official FDA form.';
  }
}

/** `FDA_1571` → `1571`. Notes read "FDA 1571", not "FDA FDA_1571": the engine's
 *  ids are canonical (`FDA_1571`) and were being pasted after another "FDA". */
const shortFormId = (formId: string): string => formId.replace(/^FDA[_-]?/i, '');

const bytesLabel = (n: number): string => (n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${Math.round(n / 1024)} KB` : `${(n / (1024 * 1024)).toFixed(1)} MB`);

export function IndFormsPanel({ note }: { note: FireToast }) {
  const [forms, setForms] = useState<string[]>([]);
  const [plans, setPlans] = useState<Record<string, RenderPlan>>({});
  const [program, setProgram] = useState<ProgramFacts | null>(null);
  const [placements, setPlacements] = useState<Record<string, Placement>>({});
  const [state, setState] = useState<'loading' | 'ready' | 'forbidden' | 'error'>('loading');
  const [meta, setMeta] = useState({ sponsorName: '', drugName: '', indNumber: '', studyPhase: 'Phase 1', indication: '', serialNumber: '' });
  const [checks, setChecks] = useState<Record<string, BuildResult>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const programIdent = programIdentOf(readProjectIdent());

  const load = useCallback(async () => {
    const url = programIdent ? `/api/ind-forms/?projectIdent=${encodeURIComponent(programIdent)}` : '/api/ind-forms/';
    try {
      const res = await apiRequest('GET', url);
      const json = await res.json().catch(() => null);
      if (res.status === 401 || res.status === 403) { setState('forbidden'); return; }
      if (!res.ok || !Array.isArray(json?.forms)) { setState('error'); return; }
      setForms(json.forms.map(String));
      setPlans(Object.fromEntries(((json.renderPlans ?? []) as RenderPlan[]).map((p) => [p.formId, p])));
      setProgram((json.program ?? null) as ProgramFacts | null);
      setPlacements(Object.fromEntries(((json.placements ?? []) as Placement[]).map((p) => [p.formId, p])));
      setState('ready');
    } catch { setState('error'); }
  }, [programIdent]);

  useEffect(() => { void load(); }, [load]);

  const metadataBody = useCallback(() => {
    // Only send what the user actually entered, plus the program the server
    // reads the recorded facts from. Absent fields must reach the server as
    // absent so missingRequired is truthful; the record-backed fields are NOT
    // echoed back from here — the server reads them itself, so there is one
    // source for them rather than a copy this panel could hold stale.
    const entered = Object.fromEntries(Object.entries(meta).filter(([, v]) => v !== ''));
    return programIdent ? { ...entered, projectIdent: programIdent } : entered;
  }, [meta, programIdent]);

  const check = useCallback(async (formId: string) => {
    setBusy('check-' + formId);
    try {
      const res = await apiRequest('POST', `/api/ind-forms/${formId}/build`, metadataBody());
      const json = (await res.json().catch(() => null)) as BuildResult | BuildResult[] | null;
      if (res.status === 401 || res.status === 403) { note('Building forms requires the regulatory-author role.', 'error'); return; }
      // The server's own sentence when it sent one — filtered, so a code or a
      // driver message degrades to the panel's own copy rather than reaching the
      // note line.
      if (!res.ok || !json) {
        note(serverMessage(json) ?? `Couldn’t build form ${shortFormId(formId)} (HTTP ${res.status}).`, 'error');
        return;
      }
      // 1572 returns one build per investigator; summarize the first.
      const result = Array.isArray(json) ? (json[0] ?? {}) : json;
      setChecks((c) => ({ ...c, [formId]: result }));
      const missing = Array.isArray(result.missingRequired) ? result.missingRequired.length : 0;
      note(`Form ${shortFormId(formId)} built — ${missing === 0 ? 'no required fields missing' : missing + ' required field(s) missing'}.`);
    } finally { setBusy(null); }
  }, [metadataBody, note]);

  const download = useCallback(async (formId: string) => {
    setBusy('pdf-' + formId);
    try {
      const res = await apiRequest('POST', `/api/ind-forms/${formId}/pdf`, metadataBody());
      if (res.status === 401 || res.status === 403) { note('Rendering forms requires the regulatory-author role.', 'error'); return; }
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        // `json.error` was read raw: an enum token printed as itself, and an
        // object-shaped error printed as "[object Object]". serverMessage takes
        // the sentence beside the code, and nothing at all when there is none.
        const detail = serverMessage(json) ?? `the render was refused (HTTP ${res.status})`;
        note(`Couldn’t render form ${shortFormId(formId)} — ` + detail + '.', 'error');
        return;
      }
      // downloadBlob reports whether the anchor click actually reached the
      // browser. It was called for its side effect and the note below claimed
      // the PDF had arrived either way — so a blocked download read as a
      // successful render.
      const delivered = downloadBlob(`FDA-${shortFormId(formId)}.pdf`, await res.blob());
      // Say honestly WHAT was rendered: the official FDA template (filled
      // through its AcroForm layer, or through the XFA datasets packet for
      // 1571/3674), a faithful reconstruction, or the labeled draft when no
      // template is installed. A tester must never mistake a reconstruction or
      // a draft for the official form.
      const hdr = (k: string) => res.headers?.get?.(k) ?? null;
      const kind = hdr('X-Form-Used-Official-Template') === 'true'
        ? 'official FDA template'
        : hdr('X-Form-Reconstructed') === 'true'
          ? 'faithful reconstruction — NOT the official Adobe-rendered form'
          : 'labeled draft — official template not installed';
      const coverage = hdr('X-Form-Field-Coverage');
      const headerCount = (k: string): number | null => {
        const v = hdr(k);
        return v === null ? null : v.split(',').filter(Boolean).length;
      };
      /* WHICH REQUIRED BOXES ARE BLANK ON THE BYTES THAT JUST ARRIVED.
         This counted `X-Form-Unmapped` — every box no reviewed mapping writes,
         required OR OPTIONAL — and called it "left for you to complete". That is
         wrong in both directions: it bills the sponsor for optional boxes they
         need not touch, and it MISSES a required box that a mapping does write
         but the project record has no value for, which goes out empty and is
         absent from `unmapped`. That case reported nothing at all over a form
         with a blank required box on it.

         `X-Form-Required-Blank` is the renderer's own documented answer to this
         one question (required-and-empty, whatever the cause) and is set on
         every path INCLUDING when the list is empty — so an absent header is an
         older server, not a clean form, and is said as such rather than counted
         as zero. `X-Form-Missing-Required` is the subset with no value in the
         record; it is reported as a subset because the two causes need
         different actions — enter it in the project, or complete it in
         Acrobat. */
      const requiredBlank = headerCount('X-Form-Required-Blank');
      const missingCount = headerCount('X-Form-Missing-Required') ?? 0;
      const blankClause = requiredBlank === null
        ? ' · this server did not report which required boxes are still blank'
        : requiredBlank > 0
          ? ` · ${requiredBlank} required box(es) blank on the form for you to complete`
            + (missingCount ? ` (${missingCount} because the project record has no value)` : '')
          : '';
      const detail = `${coverage ? ' · coverage ' + coverage : ''}${blankClause}`;
      if (!delivered) {
        note(`FDA ${shortFormId(formId)} rendered (${kind})${detail}, but the browser blocked the download.`, 'error');
        return;
      }
      note(`FDA ${shortFormId(formId)} PDF: ${kind}${detail}.`);
    } finally { setBusy(null); }
  }, [metadataBody, note]);

  // Persist the form as a GOVERNED artifact the platform records (not just a
  // downloaded file). Needs the open program's identity — without it we do NOT
  // guess; we tell the user to open a project. A legacy numeric id takes the
  // governed-artifact path; a program UUID/code takes the server's
  // audited-unplaced path (the artifact registry has no program mapping yet)
  // and the note says exactly which of the two happened.
  const save = useCallback(async (formId: string) => {
    const ident = readProjectIdent();
    if (ident == null) {
      note('Open a project first — a governed artifact must be saved to a project’s dossier.', 'error');
      return;
    }
    setBusy('save-' + formId);
    try {
      const idBody = /^\d+$/.test(ident) ? { projectId: Number(ident) } : { projectIdent: ident };
      const res = await apiRequest('POST', `/api/ind-forms/${formId}/artifact`, { ...metadataBody(), ...idBody });
      const json = await res.json().catch(() => null);
      if (res.status === 401 || res.status === 403) { note('Saving a governed artifact requires the regulatory-author role.', 'error'); return; }
      if (res.status === 404) { note('Couldn’t save — the open project isn’t in your organization.', 'error'); return; }
      const missing = Array.isArray(json?.missingRequired) ? json.missingRequired.length : 0;
      /* TWO FACTS, NOT ONE. `ready` answers "is the project DATA complete" —
         this artifact stores a field map, not a PDF — and `sponsorMustComplete`
         answers "which required boxes does an official render leave for the
         sponsor whatever the data". FDA 1571's ind_type and phase_of_study are
         deliberately unmapped, so a fully populated 1571 artifact is
         data-complete AND still arrives with two boxes to tick in Acrobat.
         Printing "(ready)" off `ready` alone announced that artifact as a
         finished form. The route returns `sponsorMustComplete` on every 201, so
         its ABSENCE is an older server rather than a form with nothing left —
         reading it as [] would reintroduce the same fail-open one level up. */
      const sponsorBoxes = Array.isArray(json?.sponsorMustComplete) ? json.sponsorMustComplete.length : null;
      const readiness = !json?.ready
        ? (missing ? ` (draft · ${missing} required field(s) missing)` : ' (draft)')
        : sponsorBoxes === null
          ? ' (project data complete — this server did not report which boxes are left on the form)'
          : sponsorBoxes > 0
            ? ` (project data complete · ${sponsorBoxes} required box(es) for you to complete and sign in Acrobat)`
            : ' (ready)';
      if (res.ok && json?.artifactId) {
        note(`FDA ${shortFormId(formId)} saved to the dossier as a governed artifact${readiness}.`);
        return;
      }
      if (res.ok && json?.audited === true && json?.governed === false) {
        // Honest degradation, in the server's terms: the form was built and
        // audit-logged with its content hash, but NOT placed in the dossier
        // registry — this program has no legacy project row for it yet.
        note(`FDA ${shortFormId(formId)} built and audit-logged (content hash recorded)${readiness} — not placed in the dossier registry: this program has no legacy project row for the registry yet.`);
        return;
      }
      // This read only `error.message`, so a server that put its sentence in
      // `message` or `detail` degraded to a bare status. serverMessage reads all
      // three in order and rejects codes and infrastructure text.
      const detail = serverMessage(json) ?? `the save was refused (HTTP ${res.status})`;
      note(`Couldn’t save form ${shortFormId(formId)} — ` + detail + '.', 'error');
    } finally { setBusy(null); }
  }, [metadataBody, note]);

  /* File the sponsor's COMPLETED, SIGNED official form into the program's eCTD
     sequence. The platform cannot sign a form; this is how the signed one gets
     into the filing. Every refusal is reported in the server's own words — a
     blank template, a file that is not a PDF, a program with no sequence to
     file into — because each names something the user has to do differently. */
  const attach = useCallback(async (formId: string, file: File | null | undefined) => {
    if (!file) return;
    if (!programIdent) {
      note('Open a program first — a completed form is filed into that program’s sequence.', 'error');
      return;
    }
    setBusy('attach-' + formId);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('projectIdent', programIdent);
      const res = await apiUpload('POST', `/api/ind-forms/${formId}/official-upload`, form);
      const json = await res.json().catch(() => null);
      if (res.status === 401 || res.status === 403) { note('Filing a completed form requires the regulatory-author role.', 'error'); return; }
      if (!res.ok || !json?.leafId) {
        const detail = serverMessage(json) ?? `the file was refused (HTTP ${res.status})`;
        note(`Couldn’t file the completed FDA ${shortFormId(formId)} — ` + detail, 'error');
        return;
      }
      setPlacements((p) => ({ ...p, [formId]: json as Placement }));
      note(`Completed FDA ${shortFormId(formId)} filed at ${json.sectionCode} in sequence ${json.sequenceNumber}${json.replaced ? ', replacing the form previously attached' : ''}.`);
      // Re-read rather than trusting the local merge: the listing is what the
      // next visitor sees, and it is the server's record of the placement.
      void load();
    } finally { setBusy(null); }
  }, [programIdent, note, load]);

  const recordFacts = useMemo(() => {
    if (!program) return null;
    return [
      { label: 'Sponsor', value: program.sponsorName, missing: 'not recorded' },
      { label: 'Drug', value: program.productName, missing: 'not recorded' },
      { label: 'Indication', value: program.indication, missing: 'not recorded' },
      { label: applicationNumberLabel(program.programType), value: program.applicationNumber, missing: 'not assigned' },
    ];
  }, [program]);

  if (state === 'forbidden') {
    return <EmptyState icon={I.lock} title="Regulatory-author role required"
      hint="Building and rendering FDA Module-1 forms (1571/1572/3674) requires the regulatory-author role. Sign in with an authoring account." />;
  }
  if (state === 'error') {
    return <EmptyState tone="error" icon={I.alertTriangle} title="Couldn’t reach the IND forms engine"
      hint="The IND forms engine didn’t respond. Sign in to your tenant and retry." />;
  }
  if (state === 'loading') {
    return <EmptyState icon={I.fileText} title="Loading the forms engine…" />;
  }

  return (
    <div>
      {recordFacts && (
        <section className="indf-record" aria-label="Values read from the program record"
          style={{ border: '1px solid var(--text-400)', borderRadius: 6, padding: '10px 12px', marginBottom: 12 }}>
          <div style={{ fontSize: 12, color: 'var(--text-400)', marginBottom: 6 }}>
            Read from the program record — every form below is filled with these values.
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,max-content))', gap: '6px 24px' }}>
            {recordFacts.map((f) => (
              <dl key={f.label} className="indf-fact" style={{ margin: 0 }}>
                <dt style={{ fontSize: 11, color: 'var(--text-400)', textTransform: 'uppercase', letterSpacing: '.04em' }}>{f.label}</dt>
                <dd style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>
                  {f.value ?? <span style={{ fontWeight: 400, color: 'var(--text-400)' }}>{f.missing}</span>}
                </dd>
              </dl>
            ))}
          </div>
        </section>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 8, marginBottom: 12 }}>
        {!program && (
          <>
            <label style={{ fontSize: 12 }}>Sponsor name<input className="c2c-input" style={{ height: 30 }} value={meta.sponsorName} onChange={(e) => setMeta({ ...meta, sponsorName: e.target.value })} /></label>
            <label style={{ fontSize: 12 }}>Drug name<input className="c2c-input" style={{ height: 30 }} value={meta.drugName} onChange={(e) => setMeta({ ...meta, drugName: e.target.value })} /></label>
            <label style={{ fontSize: 12 }}>IND number<input className="c2c-input" style={{ height: 30 }} value={meta.indNumber} onChange={(e) => setMeta({ ...meta, indNumber: e.target.value })} placeholder="blank if original" /></label>
            <label style={{ fontSize: 12 }}>Indication<input className="c2c-input" style={{ height: 30 }} value={meta.indication} onChange={(e) => setMeta({ ...meta, indication: e.target.value })} /></label>
          </>
        )}
        <label style={{ fontSize: 12 }}>Phase<select className="c2c-input" style={{ height: 30 }} value={meta.studyPhase} onChange={(e) => setMeta({ ...meta, studyPhase: e.target.value })}>{PHASES.map((p) => <option key={p}>{p}</option>)}</select></label>
        <label style={{ fontSize: 12 }}>Serial number<input className="c2c-input" style={{ height: 30 }} value={meta.serialNumber} onChange={(e) => setMeta({ ...meta, serialNumber: e.target.value })} placeholder="e.g. 0000" /></label>
      </div>

      <table className="reg-tbl"><thead><tr><th>Form</th><th>Field check</th><th style={{ textAlign: 'right' }}>Actions</th></tr></thead>
        <tbody>{forms.map((f) => {
          const chk = checks[f];
          const missing = Array.isArray(chk?.missingRequired) ? chk!.missingRequired! : null;
          const plan = plans[f];
          const placed = placements[f];
          const sponsorBoxes = plan?.sponsorCompletes ?? [];
          return (
            <tr key={f}>
              <td style={{ fontWeight: 600, verticalAlign: 'top' }}>
                {FORM_LABELS[f] ?? 'FDA ' + f}
                {plan && (
                  <div style={{ fontWeight: 400, fontSize: 12, color: 'var(--text-400)', marginTop: 3, maxWidth: 420 }}>
                    {renderStatement(plan)}
                    {plan.officialTemplate && sponsorBoxes.length > 0 && (
                      <div style={{ marginTop: 2 }} title={sponsorBoxes.map((b) => b.label).join(', ')}>
                        {sponsorBoxes.length} box(es) left for you to complete on the form.
                      </div>
                    )}
                    {plan.officialTemplate && (
                      <div style={{ marginTop: 2 }}>
                        {plan.reviewedBy
                          ? `Asset reviewed by ${plan.reviewedBy}.`
                          : 'This asset has no named reviewer yet.'}
                      </div>
                    )}
                  </div>
                )}
              </td>
              <td style={{ verticalAlign: 'top' }}>
                {!chk ? <span style={{ color: 'var(--text-400)', fontSize: 13 }}>Not checked yet</span>
                  : missing && missing.length > 0
                    ? <span className="rd-chip tone-warn" title={missing.join(', ')}>{missing.length} required missing</span>
                    : <span className="rd-chip tone-ok">required fields present</span>}
                {missing && missing.length > 0 && (
                  <div style={{ fontSize: 12, color: 'var(--text-400)', marginTop: 2 }}>{missing.slice(0, 4).join(', ')}{missing.length > 4 ? '…' : ''}</div>
                )}
                {placed && (
                  <div style={{ fontSize: 12, marginTop: 6 }}>
                    <span className="rd-chip tone-ok">completed form filed</span>
                    <div style={{ color: 'var(--text-400)', marginTop: 2 }}>
                      {placed.sectionCode} · sequence {placed.sequenceNumber} · {bytesLabel(placed.byteSize)} · SHA-256 {placed.sha256.slice(0, 12)}…
                    </div>
                  </div>
                )}
              </td>
              <td style={{ textAlign: 'right', whiteSpace: 'nowrap', verticalAlign: 'top' }}>
                <button className="nda-open" onClick={() => check(f)} disabled={busy != null}>{I.checkCircle} {busy === 'check-' + f ? 'Building…' : 'Build & check'}</button>
                <button className="nda-open" style={{ marginLeft: 6 }} onClick={() => download(f)} disabled={busy != null}>{I.download} {busy === 'pdf-' + f ? 'Rendering…' : 'PDF'}</button>
                <button className="nda-open" style={{ marginLeft: 6 }} onClick={() => save(f)} disabled={busy != null} title="Persist as a governed artifact in the project dossier">{I.database} {busy === 'save-' + f ? 'Saving…' : 'Save to dossier'}</button>
                {programIdent && (
                  <label className="nda-open" style={{ marginLeft: 6, display: 'inline-flex', alignItems: 'center', gap: 4, cursor: busy != null ? 'default' : 'pointer' }}
                    title="File the completed, signed form into this program's eCTD sequence">
                    {I.paperclip}
                    {busy === 'attach-' + f ? 'Filing…' : placed ? 'Replace completed form' : 'Attach completed form'}
                    <input type="file" accept="application/pdf,.pdf" disabled={busy != null}
                      aria-label={`Attach the completed ${FORM_LABELS[f] ?? f}`}
                      style={{ display: 'none' }}
                      onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ''; void attach(f, file); }} />
                  </label>
                )}
              </td>
            </tr>
          );
        })}</tbody></table>
    </div>
  );
}
