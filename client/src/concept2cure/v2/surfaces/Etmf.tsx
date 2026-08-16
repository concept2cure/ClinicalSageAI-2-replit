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
import React, { useState, useMemo } from 'react';
import { I } from '../icons';
import { EmptyState, useLiveData } from '../dataConnect';
import { apiRequest } from '@/lib/queryClient';
import { AnswerLead } from '../AnswerLead';
import type { SurfaceViewProps } from '../surfaceViews';
// tmfArtifactName maps a reference-model code → its human name. It reads the
// DIA TMF Reference Model catalog (ICH E6(R2) §8) — canonical reference config,
// not fixture DATA — so a `missing` code the backend returns can be labelled.
import { tmfArtifactName } from '../fixtures/etmf';
import type { TmfCompletenessResult } from '../fixtures/etmf';
import '../styles/project-home-v2.css';
import { C2CToast, useToast } from '../toast';

type MissingDoc = { zone: number; zoneName: string; code: string; name: string };

/* ---- Helper: file download ---- */
function downloadBlob(name: string, blob: Blob) {
  try {
    const u = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = u;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(u), 1500);
  } catch (_e) { /* noop */ }
}

/* ---- Helper: offline readiness report as markdown, from the REAL assessment ---- */
function readinessReportMd(
  trialId: string,
  scope: 'essential' | 'all',
  R: TmfCompletenessResult,
  missing: MissingDoc[],
): string {
  let s = '# Trial Master File -- Inspection-Readiness Package\n\n';
  s += '**Trial:** ' + trialId + '\n\n';
  s += '**Reference model:** DIA TMF Reference Model (ICH E6(R2) §8)  --  **Scope:** ' + (scope === 'all' ? 'All artifacts' : 'Essential (ICH E6(R2) §8)') + '\n\n';
  s += '**Verdict (completeness):** ' + (R.ready ? 'INSPECTION-READY' : 'NOT INSPECTION-READY') + '  --  Zones complete ' + R.summary.zonesComplete + '/' + R.summary.zoneCount + '  --  Open gaps ' + R.summary.totalMissing + '\n\n';
  s += '## Zone index\n\n| Zone | Name | Filed | Status |\n|---|---|---|---|\n';
  (R.zones || []).forEach((z) => { s += '| ' + z.number + ' | ' + z.name + ' | ' + z.present.length + '/' + z.required.length + ' | ' + (z.complete ? 'complete' : (z.required.length - z.present.length) + ' open') + ' |\n'; });
  s += '\n## Open essential documents\n\n';
  if (!missing.length) s += '_None -- every required document is filed._\n';
  else { s += '| Zone | Document | Code |\n|---|---|---|\n'; missing.forEach((m) => { s += '| ' + m.zone + ' | ' + m.name + ' | ' + m.code + ' |\n'; }); }
  s += '\n---\n_This package is the inspection index and completeness picture -- not the document bytes, which live in the systems of record referenced per artifact. Assessed against the DIA TMF Reference Model (ICH E6(R2) §8) from the trial\'s filed artifacts. Completeness only; timeliness and QC are not yet persisted._\n';
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
  const R = completeness.data;

  const missing = useMemo<MissingDoc[]>(() => {
    const out: MissingDoc[] = [];
    (R?.zones || []).forEach((z) => { (z.missing || []).forEach((code) => { out.push({ zone: z.number, zoneName: z.name, code, name: tmfArtifactName(code) }); }); });
    return out;
  }, [R]);
  const incompleteZones = (R?.zones || []).filter((z) => !z.complete).length;

  const reload = () => setReloadKey((k) => k + 1);

  /* File a missing essential — real POST /artifacts (drizzle-backed, audited),
     via the canonical apiRequest (bearer + x-organization-id auth). Refetches on
     success; an auth/network failure is stated honestly and nothing is filed. */
  const fileArtifact = async (code: string) => {
    if (!tid) return;
    setBusy(true);
    try {
      const res = await apiRequest('POST', '/api/etmf/trials/' + encodeURIComponent(tid) + '/artifacts', { artifactCode: code, documentRef: 'vault://' + tid + '/' + code });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      fireToast(tmfArtifactName(code) + ' filed to the TMF'); reload();
    } catch {
      fireToast('Couldn’t file ' + tmfArtifactName(code) + ' -- not persisted, try again', 'error');
    } finally {
      setBusy(false);
    }
  };

  /* Bulk file all open essentials — real POST /artifacts/bulk (audited), via the
     canonical apiRequest. Reads the server's filed/total counts from the
     response ({ data }-unwrapped); an auth/network failure is stated honestly. */
  const fileBulk = async (codes: string[]) => {
    if (!tid || !codes || !codes.length) return;
    setBusy(true);
    try {
      const res = await apiRequest('POST', '/api/etmf/trials/' + encodeURIComponent(tid) + '/artifacts/bulk',
        { artifacts: codes.map((c) => ({ artifactCode: c, documentRef: 'vault://' + tid + '/' + c })) });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const j = await res.json().catch(() => null);
      const body = (j && typeof j === 'object' && 'data' in j) ? (j as { data: { filed?: number; total?: number } }).data : j;
      const n = (body && body.filed != null) ? body.filed : codes.length;
      const t = (body && body.total != null) ? body.total : codes.length;
      fireToast(n + ' of ' + t + ' essentials filed to the TMF'); reload();
    } catch {
      fireToast('Couldn’t file the essentials -- not persisted, try again', 'error');
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
      const md = readinessReportMd(tid, scope, R, missing);
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
          <div className="surface-kicker">{I.vault || I.folder} Vault -- CRO / service view -- Trial Master File (DIA Reference Model v3)</div>
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
            style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid var(--c2c-border, rgba(120,130,150,0.35))', background: 'var(--c2c-surface-2, rgba(140,150,170,0.08))', color: 'inherit', font: 'inherit', minWidth: 200 }}
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
      ) : completeness.error ? (
        <EmptyState
          tone="error"
          icon={I.alertTriangle}
          title="Couldn't load inspection readiness"
          hint="The eTMF completeness service didn't respond. Readiness is computed from this trial's filed artifacts (org-scoped) — sign in and retry, or check the service is reachable."
        />
      ) : !R ? (
        // `empty` = the fetch resolved with no payload (a genuine honest empty);
        // otherwise the fetch is in flight (incl. the frame right after the trial
        // id changes, before the hook flips `loading`) → show loading, not empty.
        completeness.empty ? (
          <EmptyState
            icon={I.fileText}
            title={'No completeness data for ' + tid + ' yet'}
            hint="Nothing has been filed against this trial's TMF yet. File the essential documents below and the readiness picture will populate."
          />
        ) : (
          <div className="scaf-note" style={{ padding: '18px 10px' }}>Loading inspection readiness…</div>
        )
      ) : (
        <>
          <AnswerLead
            tone={R.ready ? 'good' : 'urgent'}
            eyebrow={"Whether " + tid + "'s TMF is complete for inspection"}
            headline={R.ready
              ? <>{tid}'s TMF holds every required {scope === 'all' ? 'artifact' : 'essential document'} across all {R.summary.zoneCount} DIA Reference-Model zones -- <b>complete</b> on a completeness basis.</>
              : <>{tid}'s TMF is missing <b>{R.summary.totalMissing} required {scope === 'all' ? 'artifact' : 'essential'} document{R.summary.totalMissing === 1 ? '' : 's'}</b> across {incompleteZones} zone{incompleteZones === 1 ? '' : 's'}.</>}
            body={<>This assessment is <b>completeness only</b> -- which DIA TMF Reference Model {scope === 'all' ? 'artifacts are' : 'essential documents are'} filed vs missing for this trial, computed from its filed artifacts. Timeliness and QC signals aren't persisted yet, so they are not part of this verdict.</>}
            reassure={R.ready ? 'Every required document is filed -- this is the clean completeness picture an inspector would see.' : 'None of these are findings yet -- they are gaps you can close before an inspector ever opens the file.'}
            action={{ label: R.ready ? 'Generate the inspection package' : 'Generate the readiness package', onClick: generatePackage }}
            secondary="Live from the trial's filed TMF artifacts."
          />

          {/* AnA's read across the inspection lenses */}
          <div className="etmf-lenses">
            <div className={'etmf-lens' + (R.ready ? ' ok' : ' warn')}>
              <div className="etmf-lens-k">{I.checkSquare} Completeness</div>
              <div className="etmf-lens-v">{R.summary.zonesComplete}/{R.summary.zoneCount} zones</div>
              <div className="etmf-lens-s">{R.ready ? 'All essentials filed' : R.summary.totalMissing + ' essential' + (R.summary.totalMissing === 1 ? '' : 's') + ' open'}</div>
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
              <div className="etmf-panel">
                <div className="etmf-panel-h">{I.checkSquare} AnA punch-list <span className="x">-- {missing.length} to file before inspection</span>
                  {missing.length > 1 && <button className="btn ghost sm" style={{ marginLeft: 'auto' }} disabled={busy} onClick={() => fileBulk(missing.map((m) => m.code))}>{I.filePlus || I.plus} File all {missing.length}</button>}
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
                        <button className="btn ghost sm" disabled={busy} onClick={() => fileArtifact(m.code)}>{I.filePlus || I.plus} File</button>
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
              <div className="etmf-sec">Inspection-readiness package <span className="etmf-sec-x">-- generated by AnA from the DIA Reference Model assessment -- the index + readiness picture, not the document bytes (those stay in the systems of record)</span></div>
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
                    <div className="etmf-cover-badge" data-ready={R.ready || undefined}>{R.ready ? 'INSPECTION-READY' : 'NOT INSPECTION-READY'}</div>
                    <h2>Trial Master File -- Inspection-Readiness Package</h2>
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

                  <h3>1 -- Readiness verdict (completeness)</h3>
                  <p>{R.ready
                    ? <>This trial's TMF holds every required {scope === 'all' ? 'artifact' : 'essential document'} across all {R.summary.zoneCount} DIA Reference-Model zones. On a completeness basis it is <b>inspection-ready</b>.</>
                    : <>This trial's TMF is missing <b>{R.summary.totalMissing} required {scope === 'all' ? 'artifact' : 'essential'} document{R.summary.totalMissing === 1 ? '' : 's'}</b> across {incompleteZones} zone{incompleteZones === 1 ? '' : 's'}. It is <b>not yet inspection-ready</b>; the open items are listed in §3.</>}</p>

                  <h3>2 -- Zone index (DIA TMF Reference Model)</h3>
                  <table className="etmf-tbl">
                    <thead><tr><th>Zone</th><th>Name</th><th>Filed</th><th>Status</th></tr></thead>
                    <tbody>
                      {(R.zones || []).map((z) => (
                        <tr key={z.number}><td className="mono">{z.number}</td><td>{z.name}</td><td className="mono">{z.present.length}/{z.required.length}</td>
                          <td><span className={'etmf-tag' + (z.complete ? ' ok' : ' warn')}>{z.complete ? 'complete' : (z.required.length - z.present.length) + ' open'}</span></td></tr>
                      ))}
                    </tbody>
                  </table>

                  <h3>3 -- Open essential documents</h3>
                  {missing.length === 0
                    ? <p className="etmf-none">None -- every required {scope === 'all' ? 'artifact' : 'essential document'} is filed.</p>
                    : (<table className="etmf-tbl">
                        <thead><tr><th>Zone</th><th>Document</th><th>Artifact code</th></tr></thead>
                        <tbody>{missing.map((m) => <tr key={m.code}><td className="mono">{m.zone}</td><td>{m.name}</td><td className="mono">{m.code}</td></tr>)}</tbody>
                      </table>)}

                  <h3>4 -- What this package is</h3>
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
