/**
 * Submission Twin — the "living submission intelligence" surface.
 *
 * Registry id: `submission-twin`.
 *
 * Wired to the real digital-twin engine (server/routes/submission-twin.ts →
 * submission-twin-service.ts, mounted /api/submission-twin), keyed on a numeric
 * submission package id, org-scoped from the JWT:
 *   • GET  /readiness/:pkg        — readiness + fragility scores + weak zones
 *   • POST /assess/:pkg           — run a full twin assessment
 *   • GET  /drift/:pkg            — active narrative-drift alerts
 *   • POST /drift/detect/:pkg     — detect drift; POST /drift/:id/resolve
 *   • GET  /challenges/:pkg       — simulated regulator challenges
 *   • POST /challenges/simulate/:pkg {assessmentId} — simulate (needs an assessment)
 *   • GET  /change-impacts/:pkg   — unresolved change impacts; resolve per id
 *   • GET  /next-artifact/:pkg    — highest-value next artifact to create
 *
 * HONESTY: every panel renders live server data, an honest empty, or an honest
 * error — never a fixture. Actions are real awaited writes; resolves/detects
 * refetch so status comes from the server. The package id is shown in an
 * editable field (defaulting to the open program's id when numeric) rather than
 * guessed silently — with no valid package, the surface says so.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { I } from '../icons';
import type { SurfaceViewProps } from '../surfaceViews';
import { usePublishSurfaceContext } from '../surfaceContext';
import { EmptyState } from '../dataConnect';
import { apiRequest } from '@/lib/queryClient';
import '../styles/project-home-v2.css';
import { C2CToast, useToast } from '../toast';

interface Readiness { readinessScore: number; fragilityScore: number; weakZones: Array<Record<string, unknown>>; }
interface Challenge { id: number | string; reviewerLens: string | null; challengeText: string; targetSection: string | null; severity: string | null; deficiencyLikelihood: string | number | null; suggestedResponse: string | null; suggestedArtifact: string | null; }
interface DriftAlert { id: number | string; driftType: string | null; severity: string | null; description: string | null; suggestedFix: string | null; resolved: boolean; }
interface ChangeImpact { id: number | string; changeType: string | null; impactSeverity: string | null; impactDescription: string | null; remediation: string | null; resolved: boolean; }
interface NextArtifact { artifactType: string | null; rationale: string | null; priority: string | null; }

/** Unwraps the {success,data} envelope; never throws. */
async function readData<T = any>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<{ ok: boolean; status: number; data: T | null; raw: any }> {
  try {
    const res = await apiRequest(method, path, body);
    const parsed = (await res.json().catch(() => null)) as any;
    return { ok: res.ok, status: res.status, data: (parsed?.data ?? null) as T | null, raw: parsed };
  } catch {
    return { ok: false, status: 0, data: null, raw: null };
  }
}

function sevTone(s: string | null | undefined) {
  const v = String(s ?? '').toLowerCase();
  return v === 'critical' || v === 'high' ? 'err' : v === 'medium' ? 'warn' : v === 'low' ? 'ok' : 'dim';
}
function zoneLabel(z: Record<string, unknown>): string {
  return String(z.section ?? z.sectionCode ?? z.label ?? z.artifact ?? z.id ?? 'zone');
}

function readNumericPackageId(): { id: number | null; raw: unknown } {
  const p = (window as unknown as { C2C_PROJECT?: { id?: unknown } }).C2C_PROJECT;
  const n = p?.id != null ? Number(p.id) : NaN;
  return { id: Number.isInteger(n) && n > 0 ? n : null, raw: p?.id };
}

export function SubmissionTwin(_props: SurfaceViewProps) {
  const seed = readNumericPackageId();
  const [pkgInput, setPkgInput] = useState<string>(seed.id != null ? String(seed.id) : '');
  const [pkg, setPkg] = useState<number | null>(seed.id);

  const [readiness, setReadiness] = useState<Readiness | null>(null);
  const [readyState, setReadyState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [drift, setDrift] = useState<DriftAlert[]>([]);
  const [impacts, setImpacts] = useState<ChangeImpact[]>([]);
  const [nextArtifact, setNextArtifact] = useState<NextArtifact | null>(null);
  // Per-panel read-error flags. Without these, a failed secondary GET fell into
  // its "No X" empty state, indistinguishable from a genuine zero — a false
  // claim about the submission's own drift / challenge / impact history.
  const [secErr, setSecErr] = useState<{ challenges: boolean; drift: boolean; impacts: boolean }>({
    challenges: false, drift: false, impacts: false,
  });
  const [lastAssessmentId, setLastAssessmentId] = useState<number | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, fireToast] = useToast();

  const refreshAll = useCallback(async (id: number) => {
    setReadyState('loading');
    const [r, c, d, ci, na] = await Promise.all([
      readData<Readiness>('GET', `/api/submission-twin/readiness/${id}`),
      readData<Challenge[]>('GET', `/api/submission-twin/challenges/${id}`),
      readData<DriftAlert[]>('GET', `/api/submission-twin/drift/${id}`),
      readData<ChangeImpact[]>('GET', `/api/submission-twin/change-impacts/${id}`),
      readData<NextArtifact>('GET', `/api/submission-twin/next-artifact/${id}`),
    ]);
    if (!r.ok) { setReadyState('error'); setReadiness(null); } else { setReadiness(r.data); setReadyState('ready'); }
    setSecErr({ challenges: !c.ok, drift: !d.ok, impacts: !ci.ok });
    setChallenges(Array.isArray(c.data) ? c.data : []);
    setDrift(Array.isArray(d.data) ? d.data : []);
    setImpacts(Array.isArray(ci.data) ? ci.data : []);
    setNextArtifact(na.data ?? null);
  }, []);

  useEffect(() => { if (pkg != null) void refreshAll(pkg); }, [pkg, refreshAll]);

  const applyPkg = () => {
    const n = Number(pkgInput);
    setPkg(Number.isInteger(n) && n > 0 ? n : null);
  };

  const runAssessment = useCallback(async () => {
    if (pkg == null) return;
    setBusy('assess');
    try {
      const { ok, status, data } = await readData<any>('POST', `/api/submission-twin/assess/${pkg}`);
      if (!ok) { fireToast(status === 401 ? 'Sign in to assess.' : `Assessment failed (HTTP ${status}).`, 'error'); return; }
      const aid = Number(data?.assessmentId ?? data?.id ?? data?.assessment?.id);
      if (Number.isInteger(aid) && aid > 0) setLastAssessmentId(aid);
      fireToast('Twin assessment complete.');
      void refreshAll(pkg);
    } finally { setBusy(null); }
  }, [pkg, refreshAll, fireToast]);

  const detectDrift = useCallback(async () => {
    if (pkg == null) return;
    setBusy('drift');
    try {
      const { ok, status } = await readData('POST', `/api/submission-twin/drift/detect/${pkg}`);
      if (!ok) { fireToast(status === 401 ? 'Sign in to detect drift.' : `Drift detection failed (HTTP ${status}).`, 'error'); return; }
      fireToast('Narrative-drift scan complete.');
      void refreshAll(pkg);
    } finally { setBusy(null); }
  }, [pkg, refreshAll, fireToast]);

  const simulateChallenges = useCallback(async () => {
    if (pkg == null || lastAssessmentId == null) return;
    setBusy('challenges');
    try {
      const { ok, status } = await readData('POST', `/api/submission-twin/challenges/simulate/${pkg}`, { assessmentId: lastAssessmentId });
      if (!ok) { fireToast(status === 401 ? 'Sign in to simulate.' : `Challenge simulation failed (HTTP ${status}).`, 'error'); return; }
      fireToast('Reviewer-challenge simulation complete.');
      void refreshAll(pkg);
    } finally { setBusy(null); }
  }, [pkg, lastAssessmentId, refreshAll, fireToast]);

  const resolveDrift = useCallback(async (alertId: number | string) => {
    const { ok } = await readData('POST', `/api/submission-twin/drift/${alertId}/resolve`);
    if (ok && pkg != null) { fireToast('Drift alert resolved.'); void refreshAll(pkg); } else fireToast('Couldn’t resolve the drift alert.', 'error');
  }, [pkg, refreshAll, fireToast]);

  const resolveImpact = useCallback(async (impactId: number | string) => {
    const { ok } = await readData('POST', `/api/submission-twin/change-impact/${impactId}/resolve`);
    if (ok && pkg != null) { fireToast('Change impact resolved.'); void refreshAll(pkg); } else fireToast('Couldn’t resolve the change impact.', 'error');
  }, [pkg, refreshAll, fireToast]);

  /* What AnA can see of this screen.
     NO PACKAGE LOADED is its own state: every panel is empty until an id is
     entered, and reporting that as "no drift, no challenges" would be a
     readiness statement about a submission nobody selected.

     The reviewer challenges are SIMULATED — the surface's own button says so —
     and they are labelled as such here, because an assistant repeating a
     simulated reviewer deficiency as a real one manufactures agency feedback.
     `lastAssessmentId` travels too: challenges can only be simulated after an
     assessment has run, so their absence often means "no assessment yet"
     rather than "no challenges found". */
  const anaContext = React.useMemo(() => {
    if (pkg == null) {
      return {
        summary:
          'Submission Twin has no submission package loaded, so nothing on screen is populated — this is a ' +
          'missing selection, not a clean twin.',
        availableActions: ['Enter a submission package id and load it'],
      };
    }
    if (readyState === 'loading' || readyState === 'idle') {
      return { summary: `Submission Twin for package ${pkg}: the readiness model is still loading.`, facts: { packageId: pkg } };
    }
    if (readyState === 'error' || !readiness) {
      return {
        summary:
          `Submission Twin for package ${pkg}: the readiness model could not be read, so no readiness or ` +
          'fragility score is on screen — a failure, not a zero.',
        facts: { packageId: pkg },
        availableActions: ['Re-run the twin assessment'],
      };
    }
    const openDrift = drift.filter((d) => !d.resolved);
    const openImpacts = impacts.filter((i) => !i.resolved);
    return {
      summary:
        `Submission Twin for package ${pkg}: readiness ${readiness.readinessScore}, fragility ` +
        `${readiness.fragilityScore}, ${(readiness.weakZones ?? []).length} weak zone(s). ` +
        `${openDrift.length} unresolved drift alert(s), ${openImpacts.length} unresolved change impact(s), ` +
        `${challenges.length} SIMULATED reviewer challenge(s)` +
        (lastAssessmentId == null ? ' (no assessment has been run in this session, so challenges cannot be simulated yet)' : '') +
        '.',
      facts: {
        packageId: pkg,
        readinessScore: readiness.readinessScore,
        fragilityScore: readiness.fragilityScore,
        weakZones: readiness.weakZones ?? [],
        lastAssessmentId,
        /* Simulated, not received. Never repeat these as agency feedback. */
        simulatedReviewerChallenges: challenges.slice(0, 10).map((c) => ({
          id: c.id, reviewerLens: c.reviewerLens, challenge: c.challengeText,
          targetSection: c.targetSection, severity: c.severity,
          deficiencyLikelihood: c.deficiencyLikelihood,
          suggestedResponse: c.suggestedResponse, suggestedArtifact: c.suggestedArtifact,
        })),
        challengesAreSimulated: true,
        driftAlerts: drift.slice(0, 10).map((d) => ({
          id: d.id, type: d.driftType, severity: d.severity,
          description: d.description, suggestedFix: d.suggestedFix, resolved: d.resolved,
        })),
        changeImpacts: impacts.slice(0, 10).map((i) => ({
          id: i.id, changeType: i.changeType, severity: i.impactSeverity,
          description: i.impactDescription, remediation: i.remediation, resolved: i.resolved,
        })),
        nextArtifact: nextArtifact
          ? { type: nextArtifact.artifactType, rationale: nextArtifact.rationale, priority: nextArtifact.priority }
          : null,
      },
      availableActions: [
        'Run a twin assessment on the loaded package',
        'Detect drift, and resolve a drift alert',
        'Simulate reviewer challenges (requires an assessment first)',
        'Resolve a change impact',
        'Load a different submission package',
      ],
    };
  }, [pkg, readyState, readiness, challenges, drift, impacts, nextArtifact, lastAssessmentId]);
  usePublishSurfaceContext('submission-twin', anaContext);

  return (
    <div className="cm-body">
      <div className="pj-card">
        <div className="pj-card-h"><span className="t">Submission Twin</span><span className="s">Living readiness · drift · reviewer challenges · change impact</span></div>
        <div className="pj-card-b" style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <label style={{ fontSize: 12, color: 'var(--c2c-dim,#667085)' }}>Submission package id</label>
          <input className="c2c-input" style={{ height: 30, width: 120 }} inputMode="numeric" value={pkgInput}
            onChange={(e) => setPkgInput(e.target.value.replace(/\D/g, ''))} onKeyDown={(e) => { if (e.key === 'Enter') applyPkg(); }} aria-label="Package size" placeholder="e.g. 1024" />
          <button className="nda-open" onClick={applyPkg} disabled={!pkgInput}>{I.search} Load</button>
          {pkg != null && (
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
              <button className="nda-open" onClick={detectDrift} disabled={busy != null}>{I.zap} {busy === 'drift' ? 'Scanning…' : 'Detect drift'}</button>
              <button className="nda-open" onClick={simulateChallenges} disabled={busy != null || lastAssessmentId == null} title={lastAssessmentId == null ? 'Run an assessment first' : ''}>{I.eye} {busy === 'challenges' ? 'Simulating…' : 'Simulate challenges'}</button>
              <button className="btn primary" style={{ height: 32 }} onClick={runAssessment} disabled={busy != null}>{I.sparkles} {busy === 'assess' ? 'Assessing…' : 'Run assessment'}</button>
            </div>
          )}
        </div>
      </div>

      {pkg == null ? (
        <div className="pj-card"><div className="pj-card-b"><EmptyState icon={I.layers}
          title={seed.raw == null ? 'Enter a submission package to assess' : 'This program has no numeric package id'}
          hint="The Submission Twin operates on a numeric submission package id. Enter one above (it defaults to the open program when that id is numeric), then load its living readiness, drift, and reviewer-challenge intelligence." /></div></div>
      ) : (
        <>
          {/* Readiness & fragility */}
          <div className="pj-card">
            <div className="pj-card-h"><span className="t">Readiness &amp; fragility</span></div>
            <div className="pj-card-b">
              {readyState === 'loading' ? <EmptyState icon={I.zap} title="Loading twin intelligence…" />
                : readyState === 'error' ? <EmptyState tone="error" icon={I.alertTriangle} title="Couldn’t load readiness" hint="Package readiness didn’t respond. Confirm the package id and that you’re signed in." />
                : !readiness ? <EmptyState icon={I.layers} title="No assessment yet" hint="Run an assessment to compute readiness and fragility for this package." />
                : (
                  <div>
                    <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', marginBottom: 12 }}>
                      <div><div style={{ fontSize: 30, fontWeight: 700 }}>{readiness.readinessScore}</div><div style={{ fontSize: 12, color: 'var(--c2c-dim,#667085)' }}>Readiness</div></div>
                      <div><div style={{ fontSize: 30, fontWeight: 700, color: readiness.fragilityScore >= 50 ? 'var(--c2c-err,#b42318)' : undefined }}>{readiness.fragilityScore}</div><div style={{ fontSize: 12, color: 'var(--c2c-dim,#667085)' }}>Fragility</div></div>
                    </div>
                    {readiness.weakZones.length > 0 && (
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Weakest zones</div>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          {readiness.weakZones.slice(0, 8).map((z, i) => (
                            <span key={i} className="rd-chip tone-warn">{zoneLabel(z)}{z.score != null ? ' · ' + String(z.score) : ''}</span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
            </div>
          </div>

          {/* Next best artifact */}
          {nextArtifact && (nextArtifact.artifactType || nextArtifact.rationale) && (
            <div className="pj-con" style={{ margin: '0 0 14px' }}>
              <span className="ico">{I.sparkles}</span>
              <div><div className="pj-con-t">Next best artifact: {nextArtifact.artifactType}{nextArtifact.priority ? ' · ' + nextArtifact.priority : ''}</div>
                <div className="pj-con-d">{nextArtifact.rationale}</div></div>
            </div>
          )}

          {/* Reviewer challenges */}
          <div className="pj-card">
            <div className="pj-card-h"><span className="t">Simulated reviewer challenges</span><span className="s">{challenges.length}</span></div>
            <div className="pj-card-b" style={{ padding: 0 }}>
              {secErr.challenges ? <div style={{ padding: 16 }}><EmptyState tone="error" icon={I.alertTriangle} title="Couldn’t load challenges" hint="The challenges read didn’t respond — this is not an empty list. Retry." /></div>
                : challenges.length === 0 ? <div style={{ padding: 16 }}><EmptyState icon={I.eye} title="No challenges yet" hint="Run an assessment, then Simulate challenges to surface the questions a reviewer is likely to raise." /></div>
                : <table className="reg-tbl"><thead><tr><th>Lens</th><th>Challenge</th><th>Section</th><th>Likelihood</th><th style={{ textAlign: 'right' }}>Severity</th></tr></thead>
                  <tbody>{challenges.map((c) => (
                    <tr key={String(c.id)}>
                      <td style={{ fontWeight: 600 }}>{c.reviewerLens ?? '—'}</td>
                      <td>{c.challengeText}{c.suggestedResponse ? <div style={{ fontSize: 12, color: 'var(--c2c-dim,#667085)', marginTop: 2 }}>Response: {c.suggestedResponse}</div> : null}</td>
                      <td className="mono">{c.targetSection ?? '—'}</td>
                      <td>{c.deficiencyLikelihood != null ? String(c.deficiencyLikelihood) : '—'}</td>
                      <td style={{ textAlign: 'right' }}><span className={'rd-chip tone-' + sevTone(c.severity)}>{c.severity ?? '—'}</span></td>
                    </tr>))}</tbody></table>}
            </div>
          </div>

          {/* Drift alerts */}
          <div className="pj-card">
            <div className="pj-card-h"><span className="t">Narrative-drift alerts</span><span className="s">{drift.length}</span></div>
            <div className="pj-card-b" style={{ padding: 0 }}>
              {secErr.drift ? <div style={{ padding: 16 }}><EmptyState tone="error" icon={I.alertTriangle} title="Couldn’t load drift alerts" hint="The drift read didn’t respond — this is not a clean result. Retry." /></div>
                : drift.length === 0 ? <div style={{ padding: 16 }}><EmptyState icon={I.zap} title="No active drift" hint="Detect drift compares the same claim across artifacts and flags inconsistencies here." /></div>
                : <table className="reg-tbl"><thead><tr><th>Type</th><th>Description</th><th>Suggested fix</th><th style={{ textAlign: 'right' }}>Action</th></tr></thead>
                  <tbody>{drift.map((d) => (
                    <tr key={String(d.id)}>
                      <td><span className={'rd-chip tone-' + sevTone(d.severity)}>{d.driftType ?? d.severity ?? 'drift'}</span></td>
                      <td>{d.description ?? '—'}</td>
                      <td style={{ color: 'var(--c2c-dim,#667085)' }}>{d.suggestedFix ?? ''}</td>
                      <td style={{ textAlign: 'right' }}><button className="nda-open" onClick={() => resolveDrift(d.id)}>{I.check} Resolve</button></td>
                    </tr>))}</tbody></table>}
            </div>
          </div>

          {/* Change impacts */}
          <div className="pj-card">
            <div className="pj-card-h"><span className="t">Unresolved change impacts</span><span className="s">{impacts.length}</span></div>
            <div className="pj-card-b" style={{ padding: 0 }}>
              {secErr.impacts ? <div style={{ padding: 16 }}><EmptyState tone="error" icon={I.alertTriangle} title="Couldn’t load change impacts" hint="The change-impacts read didn’t respond — this is not an empty list. Retry." /></div>
                : impacts.length === 0 ? <div style={{ padding: 16 }}><EmptyState icon={I.gitBranch} title="No unresolved impacts" hint="When an artifact changes, its downstream consequences are analyzed and listed here to resolve." /></div>
                : <table className="reg-tbl"><thead><tr><th>Change</th><th>Impact</th><th>Remediation</th><th style={{ textAlign: 'right' }}>Action</th></tr></thead>
                  <tbody>{impacts.map((im) => (
                    <tr key={String(im.id)}>
                      <td><span className={'rd-chip tone-' + sevTone(im.impactSeverity)}>{im.changeType ?? 'change'}</span></td>
                      <td>{im.impactDescription ?? '—'}</td>
                      <td style={{ color: 'var(--c2c-dim,#667085)' }}>{im.remediation ?? ''}</td>
                      <td style={{ textAlign: 'right' }}><button className="nda-open" onClick={() => resolveImpact(im.id)}>{I.check} Resolve</button></td>
                    </tr>))}</tbody></table>}
            </div>
          </div>
        </>
      )}

      <C2CToast msg={toast} />
    </div>
  );
}
