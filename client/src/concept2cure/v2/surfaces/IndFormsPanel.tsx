/**
 * IND Module-1 Forms panel — build, QC, and download the real FDA form PDFs.
 *
 * Wired to server/routes/ind-forms.routes.ts (mounted /api/ind-forms, JWT +
 * regulatory-author role). The engine is stateless/deterministic:
 *   • GET  /                — the supported form ids ({ forms: ['1571',…] })
 *   • POST /:formId/build   — builds the field map from the metadata provided;
 *                             returns { formId, fields, missingRequired } so the
 *                             gaps are the SERVER's verdict, not a guess
 *   • POST /:formId/pdf     — streams the filled FDA form as application/pdf
 *
 * The metadata the forms are filled from is entered here (sponsor, drug, IND
 * number, phase, indication, serial). Nothing is fabricated: an unfilled field
 * arrives at the server as absent and comes back in missingRequired; a 403
 * (role) or 401 is surfaced honestly.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { I } from '../icons';
import { EmptyState } from '../dataConnect';
import { apiRequest, serverMessage } from '@/lib/queryClient';
import type { FireToast } from '../toast';
import { downloadBlob } from '../download';

interface BuildResult { formId?: string; missingRequired?: string[]; fields?: Record<string, unknown> | Array<unknown>; }

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

export function IndFormsPanel({ note }: { note: FireToast }) {
  const [forms, setForms] = useState<string[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'forbidden' | 'error'>('loading');
  const [meta, setMeta] = useState({ sponsorName: '', drugName: '', indNumber: '', studyPhase: 'Phase 1', indication: '', serialNumber: '' });
  const [checks, setChecks] = useState<Record<string, BuildResult>>({});
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const res = await apiRequest('GET', '/api/ind-forms/');
        const json = await res.json().catch(() => null);
        if (res.status === 401 || res.status === 403) { setState('forbidden'); return; }
        if (!res.ok || !Array.isArray(json?.forms)) { setState('error'); return; }
        setForms(json.forms.map(String));
        setState('ready');
      } catch { setState('error'); }
    })();
  }, []);

  const metadataBody = useCallback(() => {
    // Only send what the user actually entered — absent fields must reach the
    // server as absent so missingRequired is truthful.
    return Object.fromEntries(Object.entries(meta).filter(([, v]) => v !== ''));
  }, [meta]);

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
        note(serverMessage(json) ?? `Couldn’t build form ${formId} (HTTP ${res.status}).`, 'error');
        return;
      }
      // 1572 returns one build per investigator; summarize the first.
      const result = Array.isArray(json) ? (json[0] ?? {}) : json;
      setChecks((c) => ({ ...c, [formId]: result }));
      const missing = Array.isArray(result.missingRequired) ? result.missingRequired.length : 0;
      note(`Form ${formId} built — ${missing === 0 ? 'no required fields missing' : missing + ' required field(s) missing'}.`);
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
        note(`Couldn’t render form ${formId} — ` + detail + '.', 'error');
        return;
      }
      // downloadBlob reports whether the anchor click actually reached the
      // browser. It was called for its side effect and the note below claimed
      // the PDF had arrived either way — so a blocked download read as a
      // successful render.
      const delivered = downloadBlob(`FDA-${formId}.pdf`, await res.blob());
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
      const missingHdr = hdr('X-Form-Missing-Required');
      const missingCount = missingHdr ? missingHdr.split(',').filter(Boolean).length : 0;
      // Boxes the platform did not write. On an official form these are boxes
      // the sponsor completes in Acrobat before signing, so naming the count is
      // the difference between "here is your form" and "here is your form, and
      // here is what is still blank on it".
      const unmappedHdr = hdr('X-Form-Unmapped');
      const unmappedCount = unmappedHdr ? unmappedHdr.split(',').filter(Boolean).length : 0;
      const detail = `${coverage ? ' · coverage ' + coverage : ''}`
        + `${missingCount ? ' · ' + missingCount + ' required field(s) still missing' : ''}`
        + `${unmappedCount ? ' · ' + unmappedCount + ' box(es) left for you to complete on the form' : ''}`;
      if (!delivered) {
        note(`FDA ${formId} rendered (${kind})${detail}, but the browser blocked the download.`, 'error');
        return;
      }
      note(`FDA ${formId} PDF: ${kind}${detail}.`);
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
      const readiness = json?.ready ? ' (ready)' : missing ? ` (draft · ${missing} required field(s) missing)` : ' (draft)';
      if (res.ok && json?.artifactId) {
        note(`FDA ${formId} saved to the dossier as a governed artifact${readiness}.`);
        return;
      }
      if (res.ok && json?.audited === true && json?.governed === false) {
        // Honest degradation, in the server's terms: the form was built and
        // audit-logged with its content hash, but NOT placed in the dossier
        // registry — this program has no legacy project row for it yet.
        note(`FDA ${formId} built and audit-logged (content hash recorded)${readiness} — not placed in the dossier registry: this program has no legacy project row for the registry yet.`);
        return;
      }
      // This read only `error.message`, so a server that put its sentence in
      // `message` or `detail` degraded to a bare status. serverMessage reads all
      // three in order and rejects codes and infrastructure text.
      const detail = serverMessage(json) ?? `the save was refused (HTTP ${res.status})`;
      note(`Couldn’t save form ${formId} — ` + detail + '.', 'error');
    } finally { setBusy(null); }
  }, [metadataBody, note]);

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
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 8, marginBottom: 12 }}>
        <label style={{ fontSize: 12 }}>Sponsor name<input className="c2c-input" style={{ height: 30 }} value={meta.sponsorName} onChange={(e) => setMeta({ ...meta, sponsorName: e.target.value })} /></label>
        <label style={{ fontSize: 12 }}>Drug name<input className="c2c-input" style={{ height: 30 }} value={meta.drugName} onChange={(e) => setMeta({ ...meta, drugName: e.target.value })} /></label>
        <label style={{ fontSize: 12 }}>IND number<input className="c2c-input" style={{ height: 30 }} value={meta.indNumber} onChange={(e) => setMeta({ ...meta, indNumber: e.target.value })} placeholder="blank if original" /></label>
        <label style={{ fontSize: 12 }}>Phase<select className="c2c-input" style={{ height: 30 }} value={meta.studyPhase} onChange={(e) => setMeta({ ...meta, studyPhase: e.target.value })}>{PHASES.map((p) => <option key={p}>{p}</option>)}</select></label>
        <label style={{ fontSize: 12 }}>Indication<input className="c2c-input" style={{ height: 30 }} value={meta.indication} onChange={(e) => setMeta({ ...meta, indication: e.target.value })} /></label>
        <label style={{ fontSize: 12 }}>Serial number<input className="c2c-input" style={{ height: 30 }} value={meta.serialNumber} onChange={(e) => setMeta({ ...meta, serialNumber: e.target.value })} placeholder="e.g. 0000" /></label>
      </div>

      <table className="reg-tbl"><thead><tr><th>Form</th><th>Field check</th><th style={{ textAlign: 'right' }}>Actions</th></tr></thead>
        <tbody>{forms.map((f) => {
          const chk = checks[f];
          const missing = Array.isArray(chk?.missingRequired) ? chk!.missingRequired! : null;
          return (
            <tr key={f}>
              <td style={{ fontWeight: 600 }}>{FORM_LABELS[f] ?? 'FDA ' + f}</td>
              <td>
                {!chk ? <span style={{ color: 'var(--c2c-dim,#667085)', fontSize: 13 }}>Not checked yet</span>
                  : missing && missing.length > 0
                    ? <span className="rd-chip tone-warn" title={missing.join(', ')}>{missing.length} required missing</span>
                    : <span className="rd-chip tone-ok">required fields present</span>}
                {missing && missing.length > 0 && (
                  <div style={{ fontSize: 12, color: 'var(--c2c-dim,#667085)', marginTop: 2 }}>{missing.slice(0, 4).join(', ')}{missing.length > 4 ? '…' : ''}</div>
                )}
              </td>
              <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                <button className="nda-open" onClick={() => check(f)} disabled={busy != null}>{I.checkCircle} {busy === 'check-' + f ? 'Building…' : 'Build & check'}</button>
                <button className="nda-open" style={{ marginLeft: 6 }} onClick={() => download(f)} disabled={busy != null}>{I.download} {busy === 'pdf-' + f ? 'Rendering…' : 'PDF'}</button>
                <button className="nda-open" style={{ marginLeft: 6 }} onClick={() => save(f)} disabled={busy != null} title="Persist as a governed artifact in the project dossier">{I.database} {busy === 'save-' + f ? 'Saving…' : 'Save to dossier'}</button>
              </td>
            </tr>
          );
        })}</tbody></table>
    </div>
  );
}
