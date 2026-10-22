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
 *                                as a Module 1 leaf in the sequence the person
 *                                chose (the shared filing-target picker)
 *
 * ── Where the values come from ──────────────────────────────────────────────
 * Sponsor, product, indication and the agency application number are read from
 * the open program's record (regulatory_programs + its organisation) by the
 * SERVER, on every request. They are shown here read-only, exactly as the forms
 * will carry them. The existing fact editor records the agency application
 * number and an explicit sponsor-registry selection; unsaved edits never enter
 * a form build.
 *
 * The sponsor's address and the IND type are recorded ON THE PROGRAM too
 * (P-20 follow-up, 2026-10-08; regulatory_programs.sponsor_address / ind_type).
 * They are edited here and saved to the record with "Save to program"
 * (PUT /api/ind-forms/program-facts); every build reads the recorded values,
 * so with a program open they are not sent with a build. They used to travel
 * with each request (QA 2026-10-08, j7 finding 3c), so the program never held
 * them. Only the study phase and the submission's serial number, which belong
 * to one submission rather than to the program, are still sent with each
 * request, and an unfilled one arrives as absent so `missingRequired` stays
 * truthful.
 *
 * The IND type and the phase are regulated choices: they start on "Not stated
 * — choose" and send nothing until chosen (P-21, 2026-10-08; the phase used to
 * start on "Phase 1" and was written into the 1571 as a satisfied required
 * value). Their options are the registry's own (formDefinitions FDA_1571
 * ind_type / phase_of_study), never a list held here.
 *
 * With no program open the panel still works standalone: every field is entered
 * here and nothing is claimed to come from a record.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { I } from '../icons';
import { EmptyState } from '../dataConnect';
import { apiRequest, apiUpload, serverMessage } from '@/lib/queryClient';
import type { FireToast } from '../toast';
import { downloadBlob } from '../download';
import { useFilingTarget, FilingTargetFields } from './filingTarget';
import { captureShellProjectGuard, useShellProject, type ShellProject } from '../shellProject';
import { useSubmissionReadSession } from './submissionScopedRead';
import { IndApplicantIdentity, type IndProgramFacts } from './IndApplicantIdentity';
import { checkedBuildResult, completedFormBody, downloadDescription, formsReadFailure, parseFormsListing, programInputKey, requestFailure, shortFormId, startable, type BuildResult, type Placement, type RenderPlan } from './indFormsPanelRecords';

type ProgramFacts = IndProgramFacts;

/* What an attachment's recorded check and attestation say, in the panel's
   words. 2026-10-15 (report_ind_ivd_irb #15): a clean check alone read
   "completed form filed", but the check reads the program record, not the
   file — an edited, unsigned PDF passed it. It is the completed form only once
   the uploader has attested it. */
function placementVerdict(p: Placement): { chip: string; tone: string; detail: string | null } {
  const missing = p.requiredFieldsMissing;
  if (Array.isArray(missing) && missing.length > 0) return { chip: 'attached · not complete', tone: 'tone-warn', detail: `missing: ${missing.join(', ')}` };
  if (!Array.isArray(missing)) return { chip: 'attached · not checked', tone: 'tone-warn', detail: 'Attach it again to have it checked.' };
  if (p.attestedAt === undefined) return { chip: 'checked · attestation not reported', tone: 'tone-warn', detail: 'This listing does not say whether the file was attested; the checklist above says whether the form counts.' };
  if (p.attestedAt === null) return { chip: 'attached · not attested', tone: 'tone-warn', detail: 'Nobody has attested it is the completed, signed form. Attach it again with the attestation ticked.' };
  return { chip: 'completed form filed', tone: 'tone-ok', detail: null };
}

/** The sentence after a filing: filed, and whether it counts as the completed form. */
function filedSentence(formId: string, json: Record<string, unknown>): string {
  const where = `filed at ${String(json.sectionCode)} in sequence ${String(json.sequenceNumber)}${json.replaced ? ', replacing the form previously attached' : ''}`;
  const missing = json.requiredFieldsMissing;
  if (json.complete === true && Array.isArray(missing) && missing.length === 0) {
    return `Completed FDA ${shortFormId(formId)} ${where}, with your attestation that it is the completed, signed form.`;
  }
  if (Array.isArray(missing) && missing.length > 0) {
    return `FDA ${shortFormId(formId)} ${where}, and not counted as complete: ${missing.length} required field(s) missing — `
      + `${missing.join(', ')}. Record or state them, then attach the completed form again.`;
  }
  if (Array.isArray(missing)) {
    return `FDA ${shortFormId(formId)} ${where}, and not counted as complete: not attested as the completed, signed form. `
      + 'If it is, tick the attestation and attach it again.';
  }
  return `FDA ${shortFormId(formId)} ${where}, and not counted as complete: the forms engine could not check it.`;
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

/** The prompt a regulated select shows until the person states a value (P-21). */
const NOT_STATED = 'Not stated — choose';

/** The open program's identifier — a regulatory_programs UUID, a program code,
 *  or a legacy numeric project id (a `proj_` prefix on a numeric id is
 *  stripped). The SERVER resolves whichever it is, org-scoped; this panel never
 *  demands a numeric id (window.C2C_PROJECT.id is a program UUID). */
function readProjectIdent(p: ShellProject | null): string | null {
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

const bytesLabel = (n: number): string => (n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${Math.round(n / 1024)} KB` : `${(n / (1024 * 1024)).toFixed(1)} MB`);

/** An IND program, or standalone, is the only case with an IND type. */
function isIndProgram(program: ProgramFacts | null): boolean {
  return !program || (program.programType ?? '').trim().toUpperCase() === 'IND';
}

export function IndFormsPanel({ note }: { note: FireToast }) {
  const project = useShellProject();
  const session = useSubmissionReadSession();
  const projectIdent = readProjectIdent(project);
  const context = JSON.stringify([session.key, projectIdent]);
  const visit = useRef({ context, generation: 0, projectCurrent: captureShellProjectGuard() });
  if (visit.current.context !== context || !visit.current.projectCurrent()) {
    visit.current = { context, generation: visit.current.generation + 1, projectCurrent: captureShellProjectGuard() };
  }
  const owner = visit.current;
  const current = useCallback(() => visit.current === owner && session.sameRevision() && owner.projectCurrent(), [owner, session]);
  return <IndFormsPanelForScope key={`${context}:${owner.generation}`} note={note} projectIdent={projectIdent} isScopeCurrent={current} />;
}

function IndFormsPanelForScope({ note, projectIdent, isScopeCurrent }: { note: FireToast; projectIdent: string | null; isScopeCurrent: () => boolean }) {
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const current = useCallback(() => mounted.current && isScopeCurrent(), [isScopeCurrent]);
  const loadGeneration = useRef(0);
  const loadedOnce = useRef(false);
  const [forms, setForms] = useState<string[]>([]);
  const [plans, setPlans] = useState<Record<string, RenderPlan>>({});
  const [program, setProgram] = useState<ProgramFacts | null>(null);
  const [placements, setPlacements] = useState<Record<string, Placement[]>>({});
  const [state, setState] = useState<'loading' | 'ready' | 'forbidden' | 'error'>('loading');
  const [meta, setMeta] = useState({ sponsorName: '', sponsorAddress: '', drugName: '', indNumber: '', indType: '', studyPhase: '', indication: '', serialNumber: '' });
  const [choices, setChoices] = useState<{ indType: string[]; studyPhase: string[] }>({ indType: [], studyPhase: [] });
  const [checks, setChecks] = useState<Record<string, BuildResult>>({});
  const inputRevision = useRef(0);
  const recordedInputKey = useRef('');
  const recordProgram = useCallback((next: ProgramFacts | null) => {
    const key = programInputKey(next);
    if (recordedInputKey.current !== key) { recordedInputKey.current = key; inputRevision.current += 1; setChecks({}); }
    setProgram(next);
  }, []);
  const editMeta = (next: typeof meta) => { inputRevision.current += 1; setChecks({}); setMeta(next); };
  /* Per form: the person ticked that the file they attach next IS the
     completed, signed form. Sent only when ticked, cleared after each filing. */
  const [attest, setAttest] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState<string | null>(null);
  // One hidden file picker per form, opened by that row's button. The picker
  // cannot be the visible control: a display:none input is outside the tab
  // order, and the <label> that used to wrap it is not focusable either.
  const attachPickers = useRef(new Map<string, HTMLInputElement>());

  const programIdent = programIdentOf(projectIdent);

  /* WHERE a completed form is filed is the person's choice. The upload used to
     file into the program's NEWEST sequence silently, so once an amendment
     existed the initial-IND 1571 and 1572 landed in the draft 0001 while the
     original 0000 still reported 1.1 empty (QA 2026-10-08, j7). The shared
     submission → sequence picker (filingTarget.tsx) is reused, not copied:
     it offers only this program's submissions and refuses frozen or
     dispatched sequences with the reason said. */
  const target = useFilingTarget(undefined, programIdent);
  const { load: loadTargets } = target;
  useEffect(() => { if (programIdent) loadTargets(); }, [programIdent, loadTargets]);

  const load = useCallback(async (): Promise<ProgramFacts | null> => {
    if (!current()) return null;
    const generation = ++loadGeneration.current;
    const owns = () => current() && generation === loadGeneration.current;
    const url = programIdent ? `/api/ind-forms/?projectIdent=${encodeURIComponent(programIdent)}` : '/api/ind-forms/';
    try {
      const res = await apiRequest('GET', url);
      if (!owns()) return null;
      const json = await res.json().catch(() => null);
      if (!owns()) return null;
      if ([401, 403].includes(res.status)) { setState('forbidden'); return null; }
      const listing = res.ok ? parseFormsListing(json, programIdent) : null;
      if (!listing) { if (!loadedOnce.current) setState('error'); return null; }
      setForms(listing.forms); setChoices(listing.choices); setPlans(listing.plans);
      recordProgram(listing.program); setPlacements(listing.placements);
      setState('ready');
      loadedOnce.current = true;
      return listing.program;
    } catch (error) {
      if (owns()) {
        const failure = formsReadFailure((error as { status?: number } | null)?.status, loadedOnce.current);
        if (failure) setState(failure);
      }
      return null;
    }
  }, [programIdent, current, recordProgram]);

  useEffect(() => { void load(); }, [load]);

  const metadataBody = useCallback(() => {
    // Only send what the user actually entered, plus the program the server
    // reads the recorded facts from. Absent fields must reach the server as
    // absent so missingRequired is truthful; the record-backed fields are NOT
    // echoed back from here — the server reads them itself, so there is one
    // source for them rather than a copy this panel could hold stale.
    const { sponsorAddress, indType, ...flat } = meta;
    const entered: Record<string, unknown> = Object.fromEntries(Object.entries(flat).filter(([, v]) => v.trim() !== ''));
    // With a program open the address and IND type are the program's RECORDED
    // values, which the server reads itself; sending the panel's copy would
    // make an unsaved edit look recorded. Standalone, they are sent as typed.
    if (programIdent) return { ...entered, projectIdent: programIdent };
    if (indType.trim() !== '') entered.indType = indType.trim();
    // The 1571 builder reads the sponsor's address from `sponsor.address`
    // (SponsorInfo), the shape the master-data path fills.
    if (sponsorAddress.trim() !== '') entered.sponsor = { address: sponsorAddress.trim() };
    return entered;
  }, [meta, programIdent]);

  const indProgram = isIndProgram(program);

  const check = useCallback(async (formId: string) => {
    if (!startable(current, busy)) return;
    const revision = inputRevision.current;
    const actionCurrent = () => current() && inputRevision.current === revision;
    setBusy('check-' + formId);
    try {
      const res = await apiRequest('POST', `/api/ind-forms/${formId}/build`, metadataBody());
      if (!actionCurrent()) return;
      const json: unknown = await res.json().catch(() => null);
      if (!actionCurrent()) return;
      if ([401, 403].includes(res.status)) { note('Building forms requires the regulatory-author role.', 'error'); return; }
      // The server's own sentence when it sent one — filtered, so a code or a
      // driver message degrades to the panel's own copy rather than reaching the
      // note line.
      if (!res.ok || !json) {
        note(serverMessage(json) ?? `Couldn’t build form ${shortFormId(formId)} (HTTP ${res.status}).`, 'error');
        return;
      }
      const result = checkedBuildResult(json, formId);
      if (!result) { note(`Form ${shortFormId(formId)} could not be checked: the engine did not return a verifiable field result.`, 'error'); return; }
      setChecks((c) => ({ ...c, [formId]: result }));
      const missing = result.missingRequired.length;
      note(`Form ${shortFormId(formId)} built — ${missing === 0 ? 'no required fields missing' : missing + ' required field(s) missing'}.`);
    } catch (error) {
      if (actionCurrent()) note(requestFailure(error, 'The forms request could not be completed. Retry the current selection.'), 'error');
    } finally { if (current()) setBusy(null); }
  }, [metadataBody, note, current, busy]);

  const download = useCallback(async (formId: string) => {
    if (!startable(current, busy)) return;
    const revision = inputRevision.current;
    const actionCurrent = () => current() && inputRevision.current === revision;
    setBusy('pdf-' + formId);
    try {
      const res = await apiRequest('POST', `/api/ind-forms/${formId}/pdf`, metadataBody());
      if (!actionCurrent()) return;
      if ([401, 403].includes(res.status)) { note('Rendering forms requires the regulatory-author role.', 'error'); return; }
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        if (!actionCurrent()) return;
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
      const bytes = await res.blob();
      if (!actionCurrent()) return;
      const delivered = downloadBlob(`FDA-${shortFormId(formId)}.pdf`, bytes);
      // Say honestly WHAT was rendered: the official FDA template (filled
      // through its AcroForm layer, or through the XFA datasets packet for
      // 1571/3674), a faithful reconstruction, or the labeled draft when no
      // template is installed. A tester must never mistake a reconstruction or
      // a draft for the official form.
      const { kind, detail } = downloadDescription(res);
      if (!delivered) {
        note(`FDA ${shortFormId(formId)} rendered (${kind})${detail}, but the browser blocked the download.`, 'error');
        return;
      }
      note(`FDA ${shortFormId(formId)} PDF: ${kind}${detail}.`);
    } catch (error) {
      if (actionCurrent()) note(requestFailure(error, 'The forms request could not be completed. Retry the current selection.'), 'error');
    } finally { if (current()) setBusy(null); }
  }, [metadataBody, note, current, busy]);

  // Persist the form as a GOVERNED artifact the platform records (not just a
  // downloaded file). Needs the open program's identity — without it we do NOT
  // guess; we tell the user to open a project. A program UUID/code is placed
  // against the program's project record (resolveProgramProjectAnchor; every
  // program has one, P-19); a program without one is refused 409 and nothing
  // is saved (P-20 follow-up: it was a 200 "audited-unplaced" answer).
  const save = useCallback(async (formId: string) => {
    if (!startable(current, busy)) return;
    const revision = inputRevision.current;
    const actionCurrent = () => current() && inputRevision.current === revision;
    const ident = projectIdent;
    if (ident == null) {
      note('Open a project first — a governed artifact must be saved to a project’s dossier.', 'error');
      return;
    }
    setBusy('save-' + formId);
    try {
      const idBody = /^\d+$/.test(ident) ? { projectId: Number(ident) } : { projectIdent: ident };
      const res = await apiRequest('POST', `/api/ind-forms/${formId}/artifact`, { ...metadataBody(), ...idBody });
      if (!actionCurrent()) return;
      const json = await res.json().catch(() => null);
      if (!actionCurrent()) return;
      if ([401, 403].includes(res.status)) { note('Saving a governed artifact requires the regulatory-author role.', 'error'); return; }
      if (res.status === 404) { note('Couldn’t save — the open project isn’t in your organization.', 'error'); return; }
      if (res.status === 409) {
        // The program has no project record, so it has no dossier: the server
        // says so and saved nothing. Its own sentence names who can close it.
        note(`FDA ${shortFormId(formId)} was not saved to the dossier. ${serverMessage(json) ?? 'This program has no project record, so nothing was saved.'}`, 'error');
        return;
      }
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
      // This read only `error.message`, so a server that put its sentence in
      // `message` or `detail` degraded to a bare status. serverMessage reads all
      // three in order and rejects codes and infrastructure text.
      const detail = serverMessage(json) ?? `the save was refused (HTTP ${res.status})`;
      note(`Couldn’t save form ${shortFormId(formId)} — ` + detail + '.', 'error');
    } catch (error) {
      if (actionCurrent()) note(requestFailure(error, 'We cannot confirm whether the form was saved. Check the dossier before retrying.'), 'error');
    } finally { if (current()) setBusy(null); }
  }, [metadataBody, note, current, busy, projectIdent]);

  /* File the sponsor's COMPLETED, SIGNED official form into the program's eCTD
     sequence. The platform cannot sign a form; this is how the signed one gets
     into the filing. Every refusal is reported in the server's own words — a
     blank template, a file that is not a PDF, a program with no sequence to
     file into — because each names something the user has to do differently. */
  const attach = useCallback(async (formId: string, file: File | null | undefined) => {
    if (!file || !startable(current, busy)) return;
    const revision = inputRevision.current;
    const actionCurrent = () => current() && inputRevision.current === revision;
    if (!programIdent) {
      note('Open a program first — a completed form is filed into that program’s sequence.', 'error');
      return;
    }
    const sequenceId = target.seqId;
    if (sequenceId == null) {
      note('Choose the submission and the sequence to file into first — the sequence is never picked for you.', 'error');
      return;
    }
    setBusy('attach-' + formId);
    try {
      const form = completedFormBody(file, programIdent, sequenceId, metadataBody(), attest[formId] === true);
      const res = await apiUpload('POST', `/api/ind-forms/${formId}/official-upload`, form);
      if (!actionCurrent()) return;
      const json = await res.json().catch(() => null);
      if (!actionCurrent()) return;
      if ([401, 403].includes(res.status)) { note('Filing a completed form requires the regulatory-author role.', 'error'); return; }
      if (!res.ok || !json?.leafId) {
        const detail = serverMessage(json) ?? `the file was refused (HTTP ${res.status})`;
        note(`Couldn’t file the completed FDA ${shortFormId(formId)} — ` + detail, 'error');
        return;
      }
      setPlacements((p) => ({
        ...p,
        [formId]: [json as Placement, ...(p[formId] ?? []).filter((x) => x.sequenceId !== (json as Placement).sequenceId)],
      }));
      note(filedSentence(formId, json as Record<string, unknown>));
      setAttest((a) => ({ ...a, [formId]: false }));
      // Re-read rather than trusting the local merge: the listing is what the
      // next visitor sees, and it is the server's record of the placement.
      void load();
    } catch (error) {
      if (actionCurrent()) note(requestFailure(error, 'We cannot confirm whether the form was filed. Check the selected sequence before retrying.'), 'error');
    } finally { if (current()) setBusy(null); }
  }, [programIdent, target.seqId, note, load, metadataBody, attest, current, busy]);

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
        <section className="indf-record" aria-label="Values read from the program record">
          <div className="indf-record-lead">
            Read from the program record — every form below is filled with these values.
          </div>
          <div className="indf-record-grid">
            {recordFacts.map((f) => (
              <dl key={f.label} className="indf-fact">
                <dt>{f.label}</dt>
                <dd>{f.value ?? <span className="indf-missing">{f.missing}</span>}</dd>
              </dl>
            ))}
          </div>
        </section>
      )}

      {program && programIdent && <IndApplicantIdentity program={program} projectIdent={programIdent} indTypes={choices.indType} isCurrent={current} onReload={load} onRecorded={recordProgram} note={note} busy={busy != null} />}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 8, marginBottom: 12 }}>
        {!program && (
          <>
            <label style={{ fontSize: 12 }}>Sponsor name<input className="c2c-input" style={{ height: 30 }} value={meta.sponsorName} onChange={(e) => editMeta({ ...meta, sponsorName: e.target.value })} /></label>
            <label style={{ fontSize: 12 }}>Drug name<input className="c2c-input" style={{ height: 30 }} value={meta.drugName} onChange={(e) => editMeta({ ...meta, drugName: e.target.value })} /></label>
            <label style={{ fontSize: 12 }}>IND number<input className="c2c-input" style={{ height: 30 }} value={meta.indNumber} onChange={(e) => editMeta({ ...meta, indNumber: e.target.value })} placeholder="blank if original" /></label>
            <label style={{ fontSize: 12 }}>Indication<input className="c2c-input" style={{ height: 30 }} value={meta.indication} onChange={(e) => editMeta({ ...meta, indication: e.target.value })} /></label>
          </>
        )}
        {!program && <label style={{ fontSize: 12 }}>Sponsor address<input className="c2c-input" style={{ height: 30 }} value={meta.sponsorAddress} onChange={(e) => editMeta({ ...meta, sponsorAddress: e.target.value })} placeholder={undefined} /></label>}
        {!program && indProgram && (
          <label style={{ fontSize: 12 }}>IND type<select className="c2c-input" style={{ height: 30 }} value={meta.indType} onChange={(e) => editMeta({ ...meta, indType: e.target.value })}><option value="">{NOT_STATED}</option>{choices.indType.map((t) => <option key={t} value={t}>{t}</option>)}</select></label>
        )}
        <label style={{ fontSize: 12 }}>Phase<select className="c2c-input" style={{ height: 30 }} value={meta.studyPhase} onChange={(e) => editMeta({ ...meta, studyPhase: e.target.value })}><option value="">{NOT_STATED}</option>{choices.studyPhase.map((p) => <option key={p} value={p}>{p}</option>)}</select></label>
        <label style={{ fontSize: 12 }}>Serial number<input className="c2c-input" style={{ height: 30 }} value={meta.serialNumber} onChange={(e) => editMeta({ ...meta, serialNumber: e.target.value })} placeholder="e.g. 0000" /></label>
      </div>

      {programIdent && (
        <section className="indf-target" aria-label="Where completed forms are filed">
          <div style={{ fontSize: 12, marginBottom: 4 }}>
            File completed, signed forms into — choose the submission and the sequence. Nothing is filed until you choose.
          </div>
          <FilingTargetFields target={target} idPrefix="indf-target" />
        </section>
      )}

      <table className="reg-tbl"><thead><tr><th>Form</th><th>Field check</th><th style={{ textAlign: 'right' }}>Actions</th></tr></thead>
        <tbody>{forms.map((f) => {
          const chk = checks[f];
          const missing = Array.isArray(chk?.missingRequired) ? chk!.missingRequired! : null;
          const plan = plans[f];
          const placedIn = placements[f] ?? [];
          const placedHere = target.seqId != null && placedIn.some((p) => p.sequenceId === target.seqId);
          const sponsorBoxes = plan?.sponsorCompletes ?? [];
          const attachText = busy === 'attach-' + f ? 'Filing…' : placedHere ? 'Replace completed form' : 'Attach completed form';
          const noTarget = target.seqId == null;
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
                {placedIn.length > 0 && (
                  <div style={{ fontSize: 12, marginTop: 6 }}>
                    {/* One verdict per attachment: an attached PDF completes its
                        form only when the forms engine's recorded check found
                        nothing required missing (QA 2026-10-08, j7). */}
                    {placedIn.map((placed) => {
                      const verdict = placementVerdict(placed);
                      return (
                        <div key={placed.leafId} style={{ marginTop: 4 }}>
                          <span className={`rd-chip ${verdict.tone}`}>{verdict.chip}</span>
                          <div style={{ color: 'var(--text-400)', marginTop: 2 }}>
                            {placed.sectionCode} · sequence {placed.sequenceNumber} · {bytesLabel(placed.byteSize)} · SHA-256 {placed.sha256.slice(0, 12)}…
                          </div>
                          {verdict.detail && <div style={{ color: 'var(--text-400)', marginTop: 2 }}>{verdict.detail}</div>}
                        </div>
                      );
                    })}
                  </div>
                )}
              </td>
              <td style={{ textAlign: 'right', whiteSpace: 'nowrap', verticalAlign: 'top' }}>
                <button className="nda-open" onClick={() => check(f)} disabled={busy != null}>{I.checkCircle} {busy === 'check-' + f ? 'Building…' : 'Build & check'}</button>
                <button className="nda-open" style={{ marginLeft: 6 }} onClick={() => download(f)} disabled={busy != null}>{I.download} {busy === 'pdf-' + f ? 'Rendering…' : 'PDF'}</button>
                <button className="nda-open" style={{ marginLeft: 6 }} onClick={() => save(f)} disabled={busy != null} title="Persist as a governed artifact in the project dossier">{I.database} {busy === 'save-' + f ? 'Saving…' : 'Save to dossier'}</button>
                {programIdent && (
                  <>
                    <input type="file" accept="application/pdf,.pdf" disabled={busy != null}
                      ref={(el) => { if (el) attachPickers.current.set(f, el); else attachPickers.current.delete(f); }}
                      aria-label={`Attach the completed ${FORM_LABELS[f] ?? f}`}
                      style={{ display: 'none' }}
                      onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ''; void attach(f, file); }} />
                    {/* Named for its form, visible text first (WCAG 2.5.3), so
                        a table of five rows is not five identical buttons. */}
                    <button className="nda-open" style={{ marginLeft: 6 }} disabled={busy != null || noTarget}
                      onClick={() => attachPickers.current.get(f)?.click()}
                      aria-label={`${attachText}: ${FORM_LABELS[f] ?? shortFormId(f)}`}
                      title={noTarget
                        ? 'Choose the submission and sequence to file into first'
                        : `File the completed, signed form into sequence ${target.seq?.sequenceNumber ?? ''}`}>
                      {I.paperclip} {attachText}
                    </button>
                    {/* Unticked, the file is filed and does not count as the
                        completed form: the platform cannot see a signature. */}
                    <label style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 6, fontSize: 12, marginTop: 6, whiteSpace: 'normal' }}
                      title="Recorded with the file, under your name and the time. Without it the form is filed but not counted as complete.">
                      <input type="checkbox" checked={attest[f] === true} disabled={busy != null}
                        aria-label={`I attest the file I attach is the completed, signed form: ${FORM_LABELS[f] ?? shortFormId(f)}`}
                        onChange={(e) => { const on = e.target.checked; setAttest((a) => ({ ...a, [f]: on })); }} />
                      I attest the file I attach is the completed, signed form
                    </label>
                  </>
                )}
              </td>
            </tr>
          );
        })}</tbody></table>
    </div>
  );
}
