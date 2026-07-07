import React, { useState, useEffect } from 'react';
import { I } from '../icons';
import { SampleTag, connected } from '../dataConnect';
import { AnswerLead } from '../AnswerLead';
import type { AnswerLeadProps } from '../AnswerLead';
import type { SurfaceViewProps } from '../surfaceViews';
import { C2CForm } from '../C2CForm';
import type { C2CFormConfig } from '../C2CForm';
import '../styles/project-home-v2.css';

import {
  GI_META,
  GI_ASSUMPTIONS,
  GI_DECISIONS,
  giForSeg,
  giApplyOverlay,
  giPromotionGate,
} from '../fixtures/governed-intelligence-data';
import type { GiFinding, GiPromotionGate } from '../fixtures/governed-intelligence-data';

/* ── Cross-surface data (IC_FACTS from CMC surface, not in our source) ── */
declare global {
  interface Window {
    IC_FACTS?: Array<{ id: string; label: string; value: string; refs?: unknown[] }>;
  }
}

/* ── Inline shared helpers (same pattern as Nonclinical.tsx) ── */

function useToast(): [string, (m: string) => void] {
  const [msg, setMsg] = useState('');
  const fire = (m: string) => {
    setMsg(m);
    setTimeout(() => setMsg(''), 2400);
  };
  return [msg, fire];
}

function C2CToast({ msg }: { msg: string }) {
  if (!msg) return null;
  return (
    <div className="de-toast">
      <span className="ico">{I.checkCircle}</span>
      {msg}
    </div>
  );
}

function giAudit(): string {
  return 'AUD-' + (Math.floor(Math.random() * 9000) + 1000);
}

/* ════ Inconsistency -- Governed Intelligence surface ════ */

export function Inconsistency({ onAsk, onNav, segment }: SurfaceViewProps) {
  const ask = onAsk;
  const open = (id: string) => {
    try { localStorage.setItem('c2c_open_surface', id); } catch (_e) { /* noop */ }
    if (onNav) onNav(id);
  };
  const bind = giForSeg(segment);
  const prog = bind.program;
  const checks = bind.checks || [];

  const [reg, setReg] = useState('FDA');
  const [findings, setFindings] = useState<GiFinding[]>(() => (bind.findings || []).map(f => ({ ...f })));
  const [sample, setSample] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [scannedAt, setScannedAt] = useState<Date | null>(null);
  const [form, setForm] = useState<{ id: string; label: string; value: string; refs?: unknown[] } | null>(null);
  const [toast, fireToast] = useToast();

  /* AnA performs the scan -- POST /contradictions/scan/:projectId, live -> fixture. */
  const runScan = () => {
    setScanning(true);
    /* In live mode, the backend scan would run here. For now, always fall through to fixture. */
    setTimeout(() => {
      setFindings((bind.findings || []).map(f => ({ ...f })));
      setSample(true);
      setScannedAt(new Date());
      setScanning(false);
      const n = (bind.findings || []).length;
      fireToast(
        n > 0
          ? 'AnA scanned the ' + prog.code + ' dossier -- ' + n + ' potential ' + (n === 1 ? 'contradiction' : 'contradictions') + ' across governed records'
          : 'AnA scanned the ' + prog.code + ' dossier -- no contradictions across the checked cross-references',
      );
    }, 780);
  };

  useEffect(() => {
    setSample(true);
    runScan();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [segment]);

  /* Resolve one finding WITH AnA. */
  const resolve = (f: GiFinding) => {
    setFindings(fs => fs.map(x => x.id === f.id ? { ...x, reviewState: 'approved_resolution', resolvedBy: 'AnA + you', resolvedAt: new Date().toISOString() } : x));
    fireToast('Resolved -- ' + f.title + ' -- ' + giAudit());
  };
  const reopen = (f: GiFinding) => setFindings(fs => fs.map(x => x.id === f.id ? { ...x, reviewState: 'unresolved', resolvedBy: null } : x));

  const gate: GiPromotionGate = giPromotionGate(findings, reg);
  const total = findings.length;
  const resolvedN = findings.filter(f => f.reviewState === 'approved_resolution').length;
  const openN = total - resolvedN;
  const clean = openN === 0;
  const hasFindings = total > 0;
  const hasDosage = findings.some(f => f.contradictionType === 'dosage_conflict' && f.reviewState !== 'approved_resolution');

  /* Answer-first lead -- computed from the real gate, in AnA's voice, about the FILING. */
  const lead: AnswerLeadProps = (() => {
    if (clean) return {
      tone: 'good' as const, eyebrow: 'AnA -- path to a clean filing',
      headline: hasFindings
        ? <>The <b>{prog.code} {prog.app.split(' -- ')[0]}</b> is clean -- every contradiction resolved.</>
        : <>AnA scanned your <b>{prog.code} {prog.app.split(' -- ')[0]}</b> -- no contradictions.</>,
      body: hasFindings
        ? 'Nothing in the governed record contradicts anything else. This filing is ready to promote into the submission sequence.'
        : 'Every governed cross-reference AnA checks on a ' + prog.filing + ' dossier is consistent -- nothing stands between this filing and a clean submission.',
      reassure: 'This is what submission-ready looks like. I\'ll keep watching as new content lands.',
      action: { label: 'Promote to submission sequence', onClick: () => open('submission-center') },
    };
    if (gate.blocked) {
      const b = gate.blocking[0];
      return {
        tone: 'urgent' as const, eyebrow: 'AnA -- path to a clean filing',
        headline: <>Your <b>{prog.code} {prog.app.split(' -- ')[0]}</b> can't be filed yet -- {gate.blocking.length === 1 ? '1 issue would' : gate.blocking.length + ' issues would'} block it under {reg}.</>,
        body: b.title + '. ' + b.description,
        reassure: 'This is fixable, and I\'ll do the work with you -- one governed change and the block clears.',
        action: {
          label: 'Show me how to clear it',
          onClick: () => {
            const el = document.getElementById('gi-f-' + b.id);
            if (el) el.style.outline = '2px solid var(--accent-200)';
            setTimeout(() => { if (el) el.style.outline = ''; }, 1600);
          },
        },
      };
    }
    if (gate.needApproval.length) return {
      tone: 'calm' as const, eyebrow: 'AnA -- path to a clean filing',
      headline: <>{prog.code} won't be blocked under {reg}, but {gate.needApproval.length} {gate.needApproval.length === 1 ? 'item needs' : 'items need'} sign-off before filing.</>,
      body: 'Nothing hard-blocks the submission, but these carry a "requires approval" authority under ' + reg + ' -- get them approved and the filing is clean.',
      reassure: 'You\'re close. I\'ll draft the resolutions and route them for approval.',
      action: { label: 'Resolve the open items with AnA', onClick: () => ask('Draft resolutions for the open ' + prog.code + ' contradictions and route them for approval.') },
    };
    return {
      tone: 'calm' as const, eyebrow: 'AnA -- path to a clean filing',
      headline: <>{prog.code} has {openN} open {openN === 1 ? 'inconsistency' : 'inconsistencies'} to tidy before the filing is perfect.</>,
      body: 'None of them block the submission under ' + reg + ' -- they\'re advisory or review-level -- but a perfect filing carries none of them.',
      reassure: 'I\'ll clear them with you so the dossier reads as one coherent story.',
      action: { label: 'Clean them up with AnA', onClick: () => ask('Walk me through resolving the open ' + prog.code + ' inconsistencies.') },
    };
  })();

  /* Order findings: open blockers -> approval -> review -> advisory -> resolved. */
  const eff = gate.effective.reduce<Record<string, GiFinding>>((m, f) => { m[f.id] = f; return m; }, {});
  const rank = (f: GiFinding) => {
    if (f.reviewState === 'approved_resolution') return 99;
    const a = eff[f.id];
    return a ? (10 - (GI_META.authority[a.authorityState!]?.rank ?? 0)) : 50;
  };
  const ordered = [...findings].sort((a, b) => rank(a) - rank(b) || ((GI_META.severity[b.severity] ? 1 : 0) - (GI_META.severity[a.severity] ? 1 : 0)));

  const sevS = (s: string) => (GI_META.severity[s] || { s: 'low' }).s;
  const propagate = (v: Record<string, string>) => {
    const nv = (v.value || '').trim();
    if (!nv || !form) return;
    setForm(null);
    fireToast('Propagated ' + form.label + ' -> ' + nv + ' across the dossier -- draft sections updated, locked flagged for re-approval -- ' + giAudit());
  };

  const PROP_FORM: C2CFormConfig | null = form ? {
    eyebrow: 'Governed change',
    title: 'Change ' + form.label,
    sub: 'Current value ' + form.value + ' -- cited in ' + (form.refs ? form.refs.length : 0) + ' sections. AnA propagates the change and flags anything locked for re-approval.',
    governed: 'Governed change -- draft sections update inline; approved/locked sections are flagged for re-approval, all on the audit trail.',
    submitLabel: 'Propagate change',
    fields: [
      { key: 'value', label: 'New value', type: 'text', placeholder: form.value, required: true },
      { key: 'reason', label: 'Reason for change', type: 'textarea', placeholder: 'e.g. reconcile to the Protocol-specified dose', required: true },
    ],
  } : null;

  return (
    <div className="sp">
      <div className="sp-head">
        <div>
          <div className="sp-eyebrow" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>AnA {I.dot} Governed intelligence <SampleTag sample={sample} /></div>
          <h1 className="sp-title">{prog.code} {prog.app.split(' -- ')[0]} -- path to a clean filing</h1>
          <p className="sp-state">{prog.name} {I.dot} {prog.stage}. AnA continuously scans every governed record -- sections, specs, data and labeling -- for anything that contradicts anything else, and clears it with you before it can reach a reviewer.</p>
        </div>
        <button className="sp-primary" onClick={runScan} disabled={scanning}>{scanning ? I.rotateCcw : I.sparkles} {scanning ? 'AnA is scanning...' : 'Re-run contradiction scan'}</button>
      </div>

      <AnswerLead {...lead} />

      {/* Submission gate: the hero verdict -- can this filing go? */}
      <div className={'gi-gate ' + (clean ? 'is-clean' : gate.blocked ? 'is-blocked' : 'is-warn')}>
        <div className="gi-gate-main">
          <span className="gi-gate-ico">{clean ? I.shieldCheck : gate.blocked ? I.shieldAlert : I.clock}</span>
          <div>
            <div className="gi-gate-verdict">{clean ? 'Submission gate -- CLEAR' : gate.blocked ? 'Submission gate -- BLOCKED' : 'Submission gate -- clear, with open items'}</div>
            <div className="gi-gate-sub">{clean
              ? 'No contradictions block promotion. ' + prog.code + ' can enter the submission sequence.'
              : gate.blocked
                ? gate.blocking.length + ' unresolved ' + (gate.blocking.length === 1 ? 'contradiction' : 'contradictions') + ' with a "blocks promotion" authority under ' + reg + '. The filing is held until resolved.'
                : 'Nothing blocks promotion under ' + reg + ', but ' + openN + ' open ' + (openN === 1 ? 'item' : 'items') + ' should be cleared for a perfect filing.'}</div>
          </div>
        </div>
        <div className="gi-gate-side">
          <div className="gi-reg" role="group" aria-label="Regulator overlay">
            {(['FDA', 'EMA'] as const).map(r => (
              <button key={r} className={'gi-reg-b' + (reg === r ? ' on' : '')} onClick={() => setReg(r)}>{r}</button>
            ))}
          </div>
          <div className="gi-gate-counts">
            <span className="gi-c gi-c-bad">{gate.blocking.length} blocking</span>
            <span className="gi-c gi-c-warn">{gate.needApproval.length} approval</span>
            <span className="gi-c gi-c-rev">{gate.needReview.length} review</span>
            <span className="gi-c gi-c-ok">{resolvedN}/{total} resolved</span>
          </div>
        </div>
      </div>
      {hasDosage
        ? <div className="gi-overlay-note">{I.info} Same dossier, different regulator: the dosage conflict is <b>{reg === 'FDA' ? 'a hard filing block under FDA' : '"requires approval" under EMA -- not a hard block'}</b>. AnA re-scores authority from the active regulator's overlay rules.</div>
        : <div className="gi-overlay-note">{I.info} AnA scores every finding's authority from the active regulator's overlay rules -- switch <b>{reg}</b> to see how {prog.filing} severity shifts by regulator.</div>}

      {/* Findings -- each one a gap between here and a perfect filing */}
      {!hasFindings && (
        <div className="pj-card gi-checks">
          <div className="pj-card-h"><span className="t">What AnA checked</span><span className="s">{checks.length} cross-references {I.dot} all consistent</span></div>
          <div className="pj-card-b">
            <div className="sp-list">
              {checks.map((c, i) => (
                <div key={i} className="sp-row">
                  <span className="gi-check-ok">{I.check}</span>
                  <span className="sp-row-b"><span className="sp-row-t">{c.k}</span><span className="sp-row-s">{c.detail}</span></span>
                  <span className="rd-chip tone-ok">consistent</span>
                </div>
              ))}
            </div>
            <div className="scaf-note" style={{ marginTop: 12 }}>AnA re-runs these checks every time content changes. The moment a value disagrees with another governed record, it surfaces here as a contradiction with a consequence -- before it can reach a reviewer.</div>
          </div>
        </div>
      )}

      {hasFindings && <div className="gi-findings">
        {ordered.map(f => {
          const a = eff[f.id] || giApplyOverlay(f, reg);
          const done = f.reviewState === 'approved_resolution';
          const auth = GI_META.authority[a.authorityState!] || GI_META.authority.advisory_only;
          return (
            <div id={'gi-f-' + f.id} key={f.id} className={'gi-find' + (done ? ' is-done' : '') + (auth.blocks && !done ? ' is-block' : '')}>
              <div className="gi-find-top">
                <span className="sp-sev" data-s={sevS(a.severity)}>{(GI_META.severity[a.severity] || { label: a.severity }).label}</span>
                <span className="gi-type">{GI_META.type[f.contradictionType] || f.contradictionType}</span>
                <span className={'gi-auth tone-' + auth.tone}>{done ? 'Resolved' : auth.label}</span>
                {a.overlayApplied && !done && <span className="gi-ov">{reg} overlay</span>}
                <span className="gi-conf">{Math.round(f.confidenceScore * 100)}% {I.dot} {GI_META.source[f.sourceClassification]}</span>
              </div>
              <div className="gi-find-title">{f.title}</div>
              <div className="gi-xref">
                <span className="gi-obj"><span className="gi-obj-k">{f.objectA.type}</span>{f.objectA.label}</span>
                <span className="gi-vs">{I.gitCompare}</span>
                <span className="gi-obj"><span className="gi-obj-k">{f.objectB.type}</span>{f.objectB.label}</span>
              </div>
              <div className="gi-desc">{f.description}</div>
              <div className="gi-meta">
                <span title="Truth hierarchy level (1 = highest authority record)">Truth level {f.truthHierarchyLevel}</span>
                <span>{GI_META.llmRole[f.llmRole]}</span>
                {f.deterministicRule && <span className="gi-rule">{f.deterministicRule}</span>}
                <span>Consequence {I.dot} {String(f.consequenceType || '').replace(/_/g, ' ')}</span>
              </div>
              <div className="gi-find-actions">
                {!done && <button className="sp-primary gi-resolve" onClick={() => resolve(f)}>{I.check} Resolve with AnA</button>}
                {done && <button className="sp-ask" onClick={() => reopen(f)}>{I.undo} Re-open</button>}
                {!done && f.factId && <button className="sp-ask" onClick={() => {
                  const fact = (window.IC_FACTS || []).find(x => x.id === f.factId);
                  if (fact) setForm(fact);
                }}>{I.gitCompare} Change value everywhere</button>}
                {!done && <button className="sp-ask" onClick={() => ask('For the ' + prog.code + ' contradiction "' + f.title + '", draft the governed resolution and the decision record, and tell me which documents update.')}>{I.sparkles} Draft resolution</button>}
                <button className="sp-go" title="Open the source record" onClick={() => open(f.factId ? 'cmc' : 'document-authoring')}>{I.right}</button>
              </div>
              {done && <div className="gi-done-line">{I.check} Cleared by {f.resolvedBy || 'AnA'} -- logged to the audit trail, sections routed for re-approval where locked.</div>}
            </div>
          );
        })}
      </div>}

      {/* Supporting: where drift starts + how it's decided (secondary) */}
      {hasFindings && <div className="gi-support">
        <div className="pj-card">
          <div className="pj-card-h"><span className="t">Assumption registry</span><span className="s">drift origin</span></div>
          <div className="pj-card-b">
            <p className="gi-support-p">Contradictions like the dropout drift start here -- two governed assumptions sharing a category and domain but holding different values.</p>
            <div className="sp-list">
              {GI_ASSUMPTIONS.map(a => (
                <div key={a.id} className="sp-row">
                  <span className="sp-tag">{a.category}</span>
                  <span className="sp-row-b"><span className="sp-row-t">{a.title} {I.dot} <b style={{ color: 'var(--accent-200)' }}>{a.assumedValue}</b></span><span className="sp-row-s">{a.domainTrack} {I.dot} {a.source}</span></span>
                  <span className="rd-chip tone-ok">{a.status}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="pj-card">
          <div className="pj-card-h"><span className="t">Decision records</span><span className="s">governed resolution</span></div>
          <div className="pj-card-b">
            <p className="gi-support-p">Every resolution AnA proposes becomes a decision record -- proposed {'->'} approved {'->'} executed, linked to the exact artifact version it changed.</p>
            <div className="sp-list">
              {GI_DECISIONS.map(d => (
                <div key={d.id} className="sp-row">
                  <span className={'gi-dec-st st-' + d.actionState}>{d.actionState}</span>
                  <span className="sp-row-b"><span className="sp-row-t">{d.title}</span><span className="sp-row-s">{d.rationale}{d.executedArtifactId ? ' -- artifact #' + d.executedArtifactId + ' v' + d.executedArtifactVersion : ''}</span></span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>}

      {form && PROP_FORM && <C2CForm config={PROP_FORM} onCancel={() => setForm(null)} onSubmit={propagate} />}
      <C2CToast msg={toast} />
    </div>
  );
}
