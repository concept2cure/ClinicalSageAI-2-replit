/**
 * eTMF Inspection Readiness -- kit app/etmf.jsx ported (registry id `etmf`).
 *
 * AnA produces the inspection-readiness package (the CRO deliverable). NOT
 * a dashboard: the hero is the generated package document; the readiness
 * verdict + missing-essentials punch-list are what AnA computed and drives
 * to closed.
 *
 * REAL-DATA STANDARD (no mock in product):
 *   Completeness is the ONE real slice. It is served, trial-scoped and
 *   org-scoped, by GET /api/etmf/trials/:trialId/completeness?scope= →
 *   getTrialTmfCompleteness() → db.select() on tmf_artifact_filings (drizzle).
 *   The surface renders that real assessment, an honest empty, or an honest
 *   error — never a fixture. SurfaceViewProps carries no trial, so the trial
 *   is named by the user (the honest way to reach the trial-scoped endpoint);
 *   the fabricated sample trial (ETMF_SAMPLE_TRIAL) is gone.
 *
 *   Timeliness and QUALITY (QC) have NO backend on this path:
 *   tmf_artifact_filings persists only the artifact CODE and filedAt — there
 *   is no document date to compute a filing lag against and no QC status
 *   column, and the completeness endpoint returns neither. The former
 *   ETMF_FILINGS fixture that fabricated those signals is removed; both lenses
 *   are shown as honest "not yet available" states.
 *
 * Grounded verbatim in concept2cure-v2:
 *   assessTmfCompleteness / TMF_REFERENCE_MODEL (server tmf-completeness.ts)
 *   GET  /api/etmf/trials/:trialId/completeness?scope=
 *   POST /api/etmf/trials/:trialId/artifacts {artifactCode,documentRef?}
 *   POST /api/etmf/trials/:trialId/artifacts/bulk
 *   GET  /api/etmf/trials/:trialId/inspection-package?scope= (streams ZIP)
 */
import React, { useState, useMemo, useRef } from 'react';
import { I } from '../icons';
import { EmptyState, useLiveData } from '../dataConnect';
import type { DataState } from '../dataConnect';
import { apiRequest, serverMessage } from '@/lib/queryClient';
import { AnswerLead } from '../AnswerLead';
import { assessmentStateFor, mayReassure } from '../assessmentState';
import type { SurfaceViewProps } from '../surfaceViews';
import { usePublishSurfaceContext } from '../surfaceContext';
// tmfArtifactName maps a reference-model code → its human name. It reads the
// DIA TMF Reference Model catalog (ICH E6(R2) §8) — canonical reference config,
// not fixture DATA — so a `missing` code the backend returns can be labelled.
import { tmfArtifactName } from '../fixtures/etmf';
import type { TmfCompletenessResult } from '../fixtures/etmf';
import '../styles/project-home-v2.css';
import { C2CToast, useToast } from '../toast';
import { downloadBlob } from '../download';
import { getAuthHeaders } from '@/utils/authToken';

type MissingDoc = { zone: number; zoneName: string; code: string; name: string };

/* The local copy of this helper is gone — see client/src/concept2cure/v2/download.ts. */

/* ---- Helper: offline readiness report as markdown, from the REAL assessment ---- */
function readinessReportMd(
  trialId: string,
  scope: 'essential' | 'all',
  R: TmfCompletenessResult,
  missing: MissingDoc[],
  /* The verdict the SURFACE reached, passed in rather than re-derived from
     `R.ready`. The offline report is the same claim in a file the reader keeps,
     so it must not be able to say INSPECTION-READY over an assessment the
     screen declined to call clear. */
  ready: boolean,
): string {
  let s = '# Trial Master File — Inspection-Readiness Package\n\n';
  s += '**Trial:** ' + trialId + '\n\n';
  s += '**Reference model:** DIA TMF Reference Model (ICH E6(R2) §8)  --  **Scope:** ' + (scope === 'all' ? 'All artifacts' : 'Essential (ICH E6(R2) §8)') + '\n\n';
  s += '**Verdict (completeness):** ' + (ready ? 'INSPECTION-READY' : 'NOT INSPECTION-READY') + '  --  Zones complete ' + R.summary.zonesComplete + '/' + R.summary.zoneCount + '  --  Open gaps ' + R.summary.totalMissing + '\n\n';
  s += '## Zone index\n\n| Zone | Name | Filed | Status |\n|---|---|---|---|\n';
  (R.zones || []).forEach((z) => { s += '| ' + z.number + ' | ' + z.name + ' | ' + z.present.length + '/' + z.required.length + ' | ' + (z.complete ? 'complete' : (z.required.length - z.present.length) + ' open') + ' |\n'; });
  s += '\n## Open essential documents\n\n';
  if (!missing.length) s += '_None — every required document is filed._\n';
  else { s += '| Zone | Document | Code |\n|---|---|---|\n'; missing.forEach((m) => { s += '| ' + m.zone + ' | ' + m.name + ' | ' + m.code + ' |\n'; }); }
  s += '\n---\n_This package is the inspection index and completeness picture — not the document bytes, which live in the systems of record referenced per artifact. Assessed against the DIA TMF Reference Model (ICH E6(R2) §8) from the trial\'s filed artifacts. Completeness only; timeliness and QC are not yet persisted._\n';
  return s;
}

/* ---- Component ---- */

export function Etmf({ onAsk, onNav }: SurfaceViewProps) {
  const ask = onAsk;
  const [trialId, setTrialId] = useState('');
  const [scope, setScope] = useState<'essential' | 'all'>('essential');
  const [busy, setBusy] = useState(false);
  const [toast, fireToast] = useToast();
  const [dl, setDl] = useState<string | null>(null);
  // Bumped after a successful real file/bulk-file to re-fetch the live
  // completeness so the surface reflects the persisted truth (no optimistic
  // local list that would claim a filing the backend didn't accept).
  const [reloadKey, setReloadKey] = useState(0);

  const tid = trialId.trim();

  // The ONE real slice: inspection completeness for a named trial, computed by
  // the backend from persisted tmf_artifact_filings (org-scoped). useLiveData
  // unwraps the success envelope; path is null until a trial is named, so the
  // hook stays idle and we render the "name a trial" prompt. Real object, an
  // honest empty, or an honest error — never a fixture.
  const completenessPath = tid
    ? '/api/etmf/trials/' + encodeURIComponent(tid) + '/completeness?scope=' + scope
    : null;
  const completeness = useLiveData<TmfCompletenessResult>(completenessPath, [completenessPath, reloadKey]);
  // The exact read this render is asking for. `reloadKey` is part of the key
  // because a successful file re-reads the SAME path: until that read lands,
  // the counts in hand are the pre-filing ones.
  const fetchKey = completenessPath ? completenessPath + '#' + reloadKey : null;

  /* ── Correlating the payload in hand with the trial named RIGHT NOW ────────
     THE FINDING. Every sentence below is attributed by name to `tid`, and `tid`
     changes SYNCHRONOUSLY as the user edits the trial-identifier input — while
     `completeness.data` still holds the PREVIOUS trial's assessment.
     `useLiveData` merges `{ ...s, loading: true }` on a dependency change
     (dataConnect.tsx), which preserves `data`, `error` and `empty` from the
     previous read, so the old payload outlives the whole round trip of the new
     fetch. The guard here used to be `!R`, and a previous trial's payload is
     truthy, so for the full fetch latency the headline read

       "<newly typed trial>'s TMF holds every required essential document
        across all <previous trial's> zones -- complete on a completeness basis"

     with "Every required document is filed" in the reassure slot and "Live from
     the trial's filed TMF artifacts" as the caption. Gating on
     `completeness.loading` narrows that window but does not close it: the hook
     flips `loading` from its effect, one commit later, so the commit React can
     paint immediately after the keystroke still holds `loading: false` and the
     previous trial's `data`. The same carry-over attributes a previous trial's
     failed read, or its honest empty, to the newly named one. Changing `scope`
     does all of the above too — it is part of the path.

     The correlation is by object identity, the one signal available without
     changing the shared hook: `useLiveData` builds a NEW state object at every
     settle, and a settle belonging to a superseded read cannot arrive (its
     effect cleanup cancels it first). So the object held at the moment the
     fetch key changed is by construction the PREVIOUS read's; any later object
     that is no longer loading belongs to this one. */
  const fetchKeyRef = useRef<string | null>(fetchKey);
  const supersededRef = useRef<DataState<TmfCompletenessResult> | null>(null);
  if (fetchKeyRef.current !== fetchKey) {
    fetchKeyRef.current = fetchKey;
    supersededRef.current = completeness;
  }
  /** Does the payload in hand belong to the read this render is asking for? */
  const inSync = completeness !== supersededRef.current && !completeness.loading;

  // Nothing below reads `completeness` directly. These four are the read AS IT
  // APPLIES to the trial and scope named now; uncorrelated means still loading,
  // never "complete", never "failed", never "nothing filed".
  const readLoading = !inSync;
  const readError = inSync ? completeness.error : undefined;
  const readEmpty = inSync ? completeness.empty : false;
  const R = inSync ? completeness.data : null;

  const missing = useMemo<MissingDoc[]>(() => {
    const out: MissingDoc[] = [];
    (R?.zones || []).forEach((z) => { (z.missing || []).forEach((code) => { out.push({ zone: z.number, zoneName: z.name, code, name: tmfArtifactName(code) }); }); });
    return out;
  }, [R]);
  const incompleteZones = (R?.zones || []).filter((z) => !z.complete).length;

  /* ── What counts as "an assessment ran" (assessmentState.ts) ───────────────
     Positive evidence, never a restatement of emptiness. Here it is the
     DENOMINATOR the backend reports: `summary.zoneCount` and
     `summary.totalRequired` are the reference-model zones and required
     artifacts it actually evaluated this trial's filings against. A payload
     with a zero denominator evaluated nothing — and `ready` is `true` on it,
     which is how "holds every required essential document across all 0 DIA
     Reference-Model zones -- complete" could be presented as the clean picture
     an inspector would see. Deliberately NOT derived from `missing.length === 0`;
     that inference is the defect. */
  const assessmentRan = Boolean(R && R.summary.zoneCount > 0 && R.summary.totalRequired > 0);

  /* Open gaps. A payload the backend did not call `ready` counts as carrying at
     least one finding even where the zone arrays enumerated none, so a gap in
     the enumeration can never be read as a clear verdict. */
  const enumeratedGaps = R ? Math.max(missing.length, R.summary.totalMissing || 0) : 0;
  const openGaps = R && !R.ready ? Math.max(1, enumeratedGaps) : enumeratedGaps;

  // loading / unreadable / not-assessed / assessed-with-findings / assessed-clear.
  const tmfState = assessmentStateFor({ loading: readLoading, error: readError }, {
    scopeExists: Boolean(tid),
    findingCount: openGaps,
    assessmentRan,
  });
  /** The completeness verdict. Only an assessment that ran may read clear. */
  const clear = tmfState === 'assessed-clear';

  const reload = () => setReloadKey((k) => k + 1);

  /* What AnA can see of this screen.
     The four states are published as themselves: no trial named yet is not an
     empty TMF, and a failed completeness read is not a zero-readiness verdict.
     Inspection readiness is a claim a sponsor acts on, so it is never inferred
     from an absent response. */
  const anaContext = useMemo(() => {
    if (!tid) {
      return {
        summary:
          'eTMF inspection readiness is computed per trial and no trial is named yet, so there is no ' +
          'completeness verdict on screen — this is not an empty or unready TMF.',
        availableActions: ['Name a trial to compute its inspection-readiness completeness'],
      };
    }
    if (completeness.loading) {
      return { summary: `Inspection completeness for trial ${tid} is still being computed; nothing on screen is final yet.` };
    }
    if (completeness.error || !R) {
      return {
        summary:
          `Inspection completeness for trial ${tid} could not be read, so this screen is showing no ` +
          'readiness verdict because of a failure, not because the TMF is empty.',
        availableActions: ['Retry the completeness read'],
      };
    }
    return {
      summary:
        `eTMF inspection readiness for trial ${tid} (${scope} scope): ` +
        `${R.ready ? 'ready' : 'NOT ready'} — ${R.summary.zonesComplete} of ${R.summary.zoneCount} zone(s) ` +
        `complete, ${R.summary.totalMissing} of ${R.summary.totalRequired} required artifact(s) missing, ` +
        `${incompleteZones} zone(s) still incomplete.`,
      facts: {
        trialId: tid,
        scope,
        inspectionReady: R.ready,
        summary: R.summary ?? null,
        zones: (R.zones ?? []).map((z) => ({
          number: z.number, name: z.name, complete: z.complete,
          required: z.required.length, present: z.present.length, missing: z.missing.length,
        })),
        // The punch-list, capped — enough to name a document back to the user.
        missingEssentials: missing.slice(0, 20).map((d) => ({
          zone: d.zone, zoneName: d.zoneName, code: d.code, name: d.name,
        })),
      },
      availableActions: [
        'File a missing essential document into the TMF (a real, audited write)',
        'Bulk-file every open essential for this trial',
        'Switch the completeness scope between essential documents and all documents',
        'Generate and download the inspection-readiness package',
      ],
    };
  }, [tid, scope, completeness.loading, completeness.error, R, missing, incompleteZones]);
  usePublishSurfaceContext('etmf', anaContext);

  /* ── Filing an essential document now requires an actual document ──────────
     Both handlers used to MANUFACTURE the reference they filed against:

       documentRef: 'vault://' + tid + '/' + code

     — a path built from the two things the surface already knew. No document
     was uploaded, none existed, and the TMF recorded the essential document as
     filed against a location pointing at nothing. "File all N" did it for every
     outstanding document in ONE click, which is how a trial reached
     INSPECTION-READY without a single document having been filed. That is a
     false GCP record: inspection readiness is a verdict a sponsor acts on.

     Filing is now attach-then-file. The picker opens for the artifact the user
     pressed File on, the document goes to the vault (POST /api/vault/ingest,
     which hashes it and writes its Part 11 audit row), and the artifact is
     filed against the id the VAULT returned. If the upload fails, nothing is
     filed — the gap stays open, which is the truth.

     The store refuses a manufactured reference now too
     (tmf-artifact-persistence.assertDocumentRefResolves), so no future client
     can reintroduce this. */
  const [pendingCode, setPendingCode] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const beginFiling = (code: string) => {
    if (!tid) return;
    setPendingCode(code);
    fileInputRef.current?.click();
  };

  const onFilePicked = async (file: File | undefined) => {
    const code = pendingCode;
    setPendingCode(null);
    if (!tid || !code || !file) return;
    setBusy(true);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('documentCode', code);
      form.append('documentTitle', tmfArtifactName(code));
      form.append('documentType', 'tmf_essential');
      const up = await fetch('/api/vault/ingest', {
        method: 'POST',
        body: form,
        credentials: 'include',
        headers: { ...getAuthHeaders() },
      });
      const uj = (await up.json().catch(() => null)) as { document?: { id?: string | number } } | null;
      const docId = uj?.document?.id;
      if (!up.ok || docId == null) {
        fireToast(
          'Not filed — ' + (serverMessage(uj) ?? `the vault refused the upload (HTTP ${up.status})`) +
            '. ' + tmfArtifactName(code) + ' is still outstanding.',
          'error',
        );
        return;
      }
      const res = await apiRequest(
        'POST',
        '/api/etmf/trials/' + encodeURIComponent(tid) + '/artifacts',
        { artifactCode: code, documentRef: 'vault://' + String(docId) },
      );
      if (!res.ok) {
        const b = await res.json().catch(() => null);
        fireToast(
          'The document is in the vault but was NOT filed to the TMF — ' +
            (serverMessage(b) ?? `HTTP ${res.status}`) + '. The gap is still open.',
          'error',
        );
        return;
      }
      fireToast(tmfArtifactName(code) + ' filed to the TMF against ' + file.name + '.');
      reload();
    } catch (e) {
      fireToast(
        'Not filed — ' + (e instanceof Error ? e.message : String(e)) + '. ' +
          tmfArtifactName(code) + ' is still outstanding.',
        'error',
      );
    } finally {
      setBusy(false);
    }
  };

  /* Generate / download the inspection package from the REAL assessment, via the
     canonical apiRequest (auth handled). On any failure it falls back to the
     honest markdown readiness report built from the real completeness `R` (never
     a fixture), so the user always gets a real artifact. */
  const generatePackage = async () => {
    if (!R || !tid) return;
    setBusy(true);
    setDl(null);
    const finish = (kind: string) => { setBusy(false); setDl(kind); setTimeout(() => setDl(null), 3200); };
    const downloadReport = () => {
      const md = readinessReportMd(tid, scope, R, missing, clear);
      downloadBlob(tid + '_inspection-readiness.md', new Blob([md], { type: 'text/markdown' }));
    };
    try {
      const res = await apiRequest('GET', '/api/etmf/trials/' + encodeURIComponent(tid) + '/inspection-package?scope=' + scope);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const blob = await res.blob();
      downloadBlob(tid + '_inspection-package.zip', blob);
      const sha = res.headers.get('X-TMF-SHA256');
      const rdy = res.headers.get('X-TMF-Ready');
      fireToast('Inspection index generated' + (rdy != null ? ' -- ' + ((rdy === 'true' || rdy === '1') ? 'ready' : 'gaps remain') : '') + (sha ? ' -- SHA-256 ' + String(sha).slice(0, 10) + '...' : '') + ' -- index + readiness, not the document bytes');
      finish('zip');
    } catch {
      downloadReport();
      finish('report');
    }
  };

  const scopeLabel = scope === 'all' ? 'All artifacts' : 'Essential (ICH E6(R2) §8)';

  return (
    <div className="page-inner etmf">
      <div className="surface-head">
        <div>
          <div className="surface-kicker">{I.vault || I.folder} Vault — CRO / service view — Trial Master File (DIA Reference Model v3)</div>
          <h1>Inspection readiness</h1>
          <p className="surface-sub">{tid ? 'Trial ' + tid : 'Name a trial to begin'} -- completeness against the DIA TMF Reference Model (ICH E6(R2) §8)</p>
        </div>
        <div className="surface-head-actions">
          <input
            className="etmf-trial-input"
            value={trialId}
            onChange={(e) => setTrialId(e.target.value)}
            placeholder="Trial identifier"
            aria-label="Trial identifier"
            spellCheck={false}
          />
          <div className="etmf-scope" role="tablist" aria-label="Completeness scope">
            <button role="tab" className={scope === 'essential' ? 'on' : ''} onClick={() => setScope('essential')}>Essential (ICH E6 §8)</button>
            <button role="tab" className={scope === 'all' ? 'on' : ''} onClick={() => setScope('all')}>All artifacts</button>
          </div>
          <button className="btn ghost" onClick={() => onNav && onNav('project-home')} title="Open the study in Project management">{I.folder} Open in Project management</button>
          <button className="btn ghost" onClick={() => ask(tid ? 'What TMF gaps would an inspector flag on ' + tid + ' and how do I close them?' : 'What TMF gaps would an inspector flag and how do I close them?')}>{I.sparkles} Ask AnA</button>
        </div>
      </div>

      {!completenessPath ? (
        <EmptyState
          icon={I.folder}
          title="Name a trial to assess its TMF"
          hint="Enter a trial identifier above. AnA computes inspection readiness from that trial's filed TMF artifacts against the DIA TMF Reference Model (ICH E6(R2) §8) — the essential-document completeness an inspector would check."
        />
      ) : tmfState === 'loading' ? (
        /* First, not last. This branch now also catches the whole window in
           which a payload is in hand but belongs to a different trial or scope
           — the window the assessed block used to render through. */
        <div className="scaf-note" style={{ padding: '18px 10px' }}>
          Reading {tid}'s TMF completeness… Nothing is stated about this trial's readiness until the read lands.
        </div>
      ) : tmfState === 'unreadable' ? (
        <EmptyState
          tone="error"
          icon={I.alertTriangle}
          title="Couldn't load inspection readiness"
          hint="The eTMF completeness service didn't respond. Readiness is computed from this trial's filed artifacts (org-scoped) — sign in and retry, or check the service is reachable."
        />
      ) : !R || !assessmentRan ? (
        /* Nothing was assessed. Two ways to get here, both honest empties of a
           SETTLED read: no payload at all, or a payload whose reference-model
           denominator is zero (nothing was evaluated, so `ready: true` on it
           states nothing). Neither may borrow the vocabulary of a clean file. */
        <EmptyState
          icon={I.fileText}
          title={'No TMF assessment for ' + tid + ' yet'}
          hint={readEmpty
            ? "The completeness service returned no assessment for this trial identifier, so nothing has been assessed against the DIA TMF Reference Model and no readiness verdict is stated here. Check the identifier, or file this trial's essential documents and the readiness picture will populate."
            : 'The completeness read returned no reference-model zones or required artifacts for this trial, so nothing was evaluated against the DIA TMF Reference Model (ICH E6(R2) §8). No readiness verdict is stated on an assessment with nothing in it.'}
        />
      ) : (
        <>
          {/* Every claim in this lead is now gated on `clear` / `tmfState`
              rather than on `R.ready` alone: `R` is the correlated payload, so
              reaching this block is itself evidence that the assessment on
              screen was computed for the trial and scope named in it. */}
          <AnswerLead
            tone={clear ? 'good' : 'urgent'}
            eyebrow={"Whether " + tid + "'s TMF is complete for inspection"}
            headline={clear
              ? <>{tid}'s TMF holds every required {scope === 'all' ? 'artifact' : 'essential document'} across all {R.summary.zoneCount} DIA Reference-Model zones -- <b>complete</b> on a completeness basis.</>
              : <>{tid}'s TMF is missing <b>{R.summary.totalMissing} required {scope === 'all' ? 'artifact' : 'essential'} document{R.summary.totalMissing === 1 ? '' : 's'}</b> across {incompleteZones} zone{incompleteZones === 1 ? '' : 's'}.</>}
            body={<>This assessment is <b>completeness only</b> -- which DIA TMF Reference Model {scope === 'all' ? 'artifacts are' : 'essential documents are'} filed vs missing for this trial, computed from its filed artifacts. Timeliness and QC signals aren't persisted yet, so they are not part of this verdict.</>}
            /* The single most reassuring sentence on the surface. It may be
               spoken from one state only — an assessment that ran and came back
               with nothing open — which is what mayReassure gates on. */
            reassure={mayReassure(tmfState) ? 'Every required document is filed — this is the clean completeness picture an inspector would see.' : 'None of these are findings yet — they are gaps you can close before an inspector ever opens the file.'}
            action={{ label: clear ? 'Generate the inspection package' : 'Generate the readiness package', onClick: generatePackage }}
            /* Was the unconditional string "Live from the trial's filed TMF
               artifacts." — the surface's own liveness guarantee, carrying no
               gate whatsoever, printed under counts that during the carry-over
               window belonged to a different trial. It now names the trial and
               scope the assessment on screen was actually computed for, and is
               reachable only from the correlated, assessed state. */
            secondary={'Read live from ' + tid + "'s filed TMF artifacts -- " + scopeLabel + ' scope.'}
          />

          {/* AnA's read across the inspection lenses */}
          <div className="etmf-lenses">
            {/* `clear` rather than `R.ready`: one verdict variable for the whole
                surface, so the lens, the cover badge and the headline cannot
                disagree about whether this file reads clean. */}
            <div className={'etmf-lens' + (clear ? ' ok' : ' warn')}>
              <div className="etmf-lens-k">{I.checkSquare} Completeness</div>
              <div className="etmf-lens-v">{R.summary.zonesComplete}/{R.summary.zoneCount} zones</div>
              <div className="etmf-lens-s">{clear ? 'All essentials filed' : R.summary.totalMissing + ' essential' + (R.summary.totalMissing === 1 ? '' : 's') + ' open'}</div>
            </div>
            {/* Timeliness + Quality have NO backend on the trials/:trialId path:
                tmf_artifact_filings stores only artifact CODE + filedAt (no
                document date to compute filing lag, no QC status), and the
                completeness endpoint returns neither. Honest "not yet
                available" — never the removed ETMF_FILINGS fixture. */}
            <div className="etmf-lens">
              <div className="etmf-lens-k">{I.clock} Timeliness</div>
              <div className="etmf-lens-v">Not yet available</div>
              <div className="etmf-lens-s">No filing-lag signal is persisted for TMF artifacts yet</div>
            </div>
            <div className="etmf-lens">
              <div className="etmf-lens-k">{I.shieldCheck} Quality (QC)</div>
              <div className="etmf-lens-v">Not yet available</div>
              <div className="etmf-lens-s">No QC status is persisted for TMF artifacts yet</div>
            </div>
          </div>

          <div className="etmf-body">
            {/* Left -- AnA's punch list: the essentials still to file */}
            <div className="etmf-left">
              <input
                ref={fileInputRef}
                type="file"
                className="ana-hidden-input"
                aria-label="Choose the essential document to file to the TMF"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = '';
                  void onFilePicked(f);
                }}
              />
              <div className="etmf-panel">
                <div className="etmf-panel-h">{I.checkSquare} AnA punch-list <span className="x">-- {missing.length} to file before inspection</span>
                  {/* "File all N" is gone. It filed every outstanding essential
                      document against a manufactured vault path in one click,
                      flipping the trial to INSPECTION-READY with nothing
                      uploaded. There is no honest bulk form of this action: N
                      documents require N documents. Each row files its own. */}
                </div>
                {missing.length === 0 ? (
                  <div className="etmf-clean">{I.check} Every {scope === 'all' ? '' : 'essential '}document is filed. The package is inspection-clean.</div>
                ) : (
                  <div className="etmf-missing">
                    {missing.map((m) => (
                      <div key={m.code} className="etmf-miss">
                        <div className="etmf-miss-main">
                          <div className="etmf-miss-name">{m.name}</div>
                          <div className="etmf-miss-zone">Zone {m.zone} -- {m.zoneName} -- <span className="mono">{m.code}</span></div>
                        </div>
                        <button
                          className="btn ghost sm"
                          disabled={busy}
                          title={'Attach the ' + m.name + ' document and file it to the TMF'}
                          onClick={() => beginFiling(m.code)}
                        >
                          {I.filePlus || I.plus} {busy && pendingCode === m.code ? 'Filing…' : 'Attach & file'}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="etmf-panel">
                <div className="etmf-panel-h">{I.grid} Zone completeness <span className="x">-- {R.summary.zonesComplete}/{R.summary.zoneCount} complete</span></div>
                <div className="etmf-zones">
                  {(R.zones || []).map((z) => (
                    <div key={z.number} className={'etmf-zone' + (z.complete ? ' ok' : '')}>
                      <span className="etmf-zone-n">{z.number}</span>
                      <span className="etmf-zone-name">{z.name}</span>
                      <span className="etmf-zone-cnt">{z.present.length}/{z.required.length}</span>
                      <span className="etmf-zone-dot">{z.complete ? I.check : I.alertTriangle}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Right -- THE DELIVERABLE: the generated inspection-readiness package */}
            <div className="etmf-right">
              <div className="etmf-sec">Inspection-readiness package <span className="etmf-sec-x">-- generated by AnA from the DIA Reference Model assessment — the index + readiness picture, not the document bytes (those stay in the systems of record)</span></div>
              <div className="cm-doc etmf-doc">
                <div className="cm-doc-bar">
                  <span className="cm-doc-name">{tid}_inspection-package{scope === 'all' ? '_all' : ''}</span>
                  <div className="cm-doc-bar-r">
                    {dl === 'zip' && <span className="etmf-dl ok">{I.check} governed ZIP downloaded</span>}
                    {dl === 'report' && <span className="etmf-dl">{I.download} readiness report downloaded</span>}
                    <button className="btn primary sm" disabled={busy} onClick={generatePackage}>{busy ? 'Generating...' : <>{I.download} Generate package</>}</button>
                  </div>
                </div>
                <div className="cm-doc-body etmf-doc-body">
                  <div className="etmf-cover">
                    <div className="etmf-cover-badge" data-ready={clear || undefined}>{clear ? 'INSPECTION-READY' : 'NOT INSPECTION-READY'}</div>
                    <h2>Trial Master File — Inspection-Readiness Package</h2>
                    <div className="etmf-cover-meta">
                      <span>Trial {tid}</span><span>DIA TMF Reference Model (ICH E6(R2) §8)</span>
                      <span>Scope: {scopeLabel}</span>
                      <span>Generated {new Date().toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' })}</span>
                    </div>
                  </div>

                  <div className="etmf-doc-kpis">
                    <div className="etmf-kpi"><div className="v">{R.summary.zonesComplete}/{R.summary.zoneCount}</div><div className="k">Zones complete</div></div>
                    <div className="etmf-kpi"><div className="v">{R.summary.totalRequired - R.summary.totalMissing}/{R.summary.totalRequired}</div><div className="k">{scope === 'all' ? 'Artifacts' : 'Essential docs'} filed</div></div>
                    <div className={'etmf-kpi' + (R.summary.totalMissing ? ' warn' : '')}><div className="v">{R.summary.totalMissing}</div><div className="k">Open gaps</div></div>
                  </div>

                  <h3>1 — Readiness verdict (completeness)</h3>
                  <p>{clear
                    ? <>This trial's TMF holds every required {scope === 'all' ? 'artifact' : 'essential document'} across all {R.summary.zoneCount} DIA Reference-Model zones. On a completeness basis it is <b>inspection-ready</b>.</>
                    : <>This trial's TMF is missing <b>{R.summary.totalMissing} required {scope === 'all' ? 'artifact' : 'essential'} document{R.summary.totalMissing === 1 ? '' : 's'}</b> across {incompleteZones} zone{incompleteZones === 1 ? '' : 's'}. It is <b>not yet inspection-ready</b>; the open items are listed in §3.</>}</p>

                  <h3>2 — Zone index (DIA TMF Reference Model)</h3>
                  <table className="etmf-tbl">
                    <thead><tr><th>Zone</th><th>Name</th><th>Filed</th><th>Status</th></tr></thead>
                    <tbody>
                      {(R.zones || []).map((z) => (
                        <tr key={z.number}><td className="mono">{z.number}</td><td>{z.name}</td><td className="mono">{z.present.length}/{z.required.length}</td>
                          <td><span className={'etmf-tag' + (z.complete ? ' ok' : ' warn')}>{z.complete ? 'complete' : (z.required.length - z.present.length) + ' open'}</span></td></tr>
                      ))}
                    </tbody>
                  </table>

                  <h3>3 — Open essential documents</h3>
                  {missing.length === 0
                    ? <p className="etmf-none">None — every required {scope === 'all' ? 'artifact' : 'essential document'} is filed.</p>
                    : (<table className="etmf-tbl">
                        <thead><tr><th>Zone</th><th>Document</th><th>Artifact code</th></tr></thead>
                        <tbody>{missing.map((m) => <tr key={m.code}><td className="mono">{m.zone}</td><td>{m.name}</td><td className="mono">{m.code}</td></tr>)}</tbody>
                      </table>)}

                  <h3>4 — What this package is</h3>
                  <p className="etmf-readme">This package is the inspection <b>index and readiness picture</b> -- the manifest of filed artifacts, the completeness assessment, and the zone-by-zone gap list. The document bytes themselves live in the systems of record referenced per artifact; this package does not contain them. It reports completeness only; timeliness and QC signals are not yet persisted for TMF artifacts. Present it to an inspector as the map to the file, not the file itself.</p>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      <C2CToast msg={toast} />
    </div>
  );
}
