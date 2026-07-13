/* DeviceIntel.tsx -- Narrow-dock intelligence panels for device submissions.
   Ported from design kit device-sub.jsx. */
import React from 'react';
import { I } from '../icons';

/* ── Helpers ── */
export function tone515(l: number, i: number): string {
  const s = l * i;
  return s >= 15 ? 'err' : s >= 8 ? 'warn' : s >= 4 ? 'ai' : 'ok';
}

export function Ic({ n }: { n: string }) {
  const icon = (I as Record<string, React.ReactElement>)[n];
  return icon ? <span className="ico">{icon}</span> : null;
}

export function labelize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, ' ');
}

export function KV({ k, v }: { k: string; v: React.ReactNode }) {
  return <div className="pd-kv"><span className="pd-kv-k">{k}</span><span className="pd-kv-v">{v}</span></div>;
}

/* ── StatusBadge (replaces kit PG.StatusBadge) ── */
export function StatusBadge({ status }: { status: string }) {
  const tone = status === 'complete' ? 'ok' : status === 'review' ? 'ai' : status === 'draft' ? 'warn' : 'idle';
  return <span className="pg-badge" data-tone={tone}>{labelize(status)}</span>;
}

/* ── CompletenessGate (replaces kit PG.CompletenessGate) ── */
export function CompletenessGate({ pct, complete, total, findings, ready, readyLabel }: {
  pct: number; complete: number; total: number; findings: any[]; ready: boolean; readyLabel: string;
}) {
  return (
    <div className="dv-mini">
      <div className="dv-mini-det" data-tone={ready ? 'ok' : 'warn'}>
        <span className="ra-det-l">{readyLabel}</span>
        <span className="dv-mini-detv">{pct}% ({complete}/{total} required)</span>
      </div>
      {findings.map((f: any, i: number) => (
        <div key={i} className="dv-rsim-f" data-sev={f.sev}><div className="dv-rsim-txt">{f.text}</div></div>
      ))}
    </div>
  );
}

/* ── Accordion (dock collapsible) ── */
export function DeviceAcc({ title, icon, open, onToggle, badge, children }: {
  id?: string; title: string; icon: string; open: boolean; onToggle: () => void;
  badge?: string | number | null; children?: React.ReactNode;
}) {
  return (
    <div className={'dv-acc' + (open ? ' open' : '')}>
      <button className="dv-acc-h" onClick={onToggle}>
        <Ic n={icon} /><span className="dv-acc-t">{title}</span>
        {badge != null && <span className="dv-acc-badge">{badge}</span>}
        <span className="dv-acc-chev">{open ? '▾' : '▸'}</span>
      </button>
      {open && <div className="dv-acc-body">{children}</div>}
    </div>
  );
}

/* ── Section tree (left column) ── */
export function Tree({ pw, activeSec, onSec }: { pw: any; activeSec: string; onSec: (s: any) => void }) {
  return (
    <div className="dv-tree">
      <div className="dv-tree-h">
        <span>Document sections</span>
        <span className="dv-tree-c">{pw.sections.filter((s: any) => s.status === 'complete').length}/{pw.sections.length}</span>
      </div>
      <div className="dv-tree-list">
        {pw.sections.map((s: any) => (
          <button key={s.id} className={'dv-tree-row' + (activeSec === s.id ? ' on' : '')} onClick={() => onSec(s)}>
            <span className="pd-tree-dot" data-status={s.status} />
            <span className="dv-tree-num">{s.num}</span>
            <span className="dv-tree-t">{s.title}</span>
            {!s.required && <span className="pd-tree-opt">opt</span>}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ── Document page (centre hero) ── */
export function DocumentPage({ pw, sec, onAsk }: { pw: any; sec: any; onAsk: (m: string) => void }) {
  const blocks = pw.content[sec.id];
  const DocCanvas = (window as any).DocCanvas;
  if (DocCanvas) {
    return (
      <div className="dv-desk" style={{ height: '100%', overflow: 'hidden', padding: 0 }}>
        <DocCanvas
          sec={{ id: sec.id, num: sec.num, title: sec.title, status: sec.status, guidance: sec.guidance }}
          blocks={blocks} code={pw.full} context={pw.device ? pw.device.name : ''}
          onAsk={onAsk} market={{ agency: pw.agency || 'FDA', region: pw.region || '' }}
          storageKey={'dv::' + pw.id + '::' + sec.id}
        />
      </div>
    );
  }
  return (
    <div className="dv-desk">
      <div className="dv-page">
        <div className="dv-page-eyebrow">{pw.full}  {'·'}  {pw.device ? pw.device.name : ''}</div>
        <div className="dv-page-sechead">
          <div>
            <span className="dv-page-secnum">Section {sec.num}</span>
            <h1 className="dv-page-title">{sec.title}</h1>
          </div>
          <StatusBadge status={sec.status} />
        </div>
        <div className="dv-page-guidance"><Ic n="scale" />{sec.guidance}</div>
        {blocks && (
          <div className="dv-page-body">
            {blocks.map((b: any, i: number) => (
              <div key={i} className="dv-blk"><h2>{b.h}</h2><p>{b.p}</p></div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ════ Intelligence panels ════ */
export function IntelReadiness({ pw }: { pw: any }) {
  const reqTotal = pw.sections.filter((s: any) => s.required).length;
  const reqDone = pw.sections.filter((s: any) => s.required && s.status === 'complete').length;
  const ready = !pw.findings.some((f: any) => ['critical', 'blocking'].includes(f.sev));
  return <CompletenessGate pct={pw.readiness} complete={reqDone} total={reqTotal} findings={pw.findings} ready={ready} readyLabel="Submission readiness" />;
}

export function IntelPredicate({ pw }: { pw: any }) {
  const p = pw.predicate;
  if (!p) return null;
  const det = p.determination;
  const t = det === 'SE' ? 'ok' : det === 'NSE' ? 'err' : 'warn';
  const bandTone = (b: string) => b === 'adequate' ? 'ok' : b === 'marginal' ? 'warn' : 'err';
  const bandTier = (b: string) => b === 'adequate' ? 'hi' : b === 'marginal' ? 'mid' : 'lo';
  return (
    <div className="dv-mini">
      <div className="dv-mini-det" data-tone={t}>
        <span className="ra-det-l">SE determination</span>
        <span className="dv-mini-detv">{det === 'SE' ? 'Substantially equivalent' : det === 'NSE' ? 'Not SE' : 'Insufficient'}</span>
      </div>
      {p.candidates.filter((c: any) => c.adequacy > 0).map((c: any) => (
        <div key={c.id} className="dv-mini-predcard">
          <div className="dv-mini-pred">
            <span className="pg-mono">{c.id}</span>
            <span className="dv-mini-score" data-tier={bandTier(c.band)}>{c.adequacy}</span>
            {c.band && <span className="pg-badge" data-tone={bandTone(c.band)}>{c.band}</span>}
            <span className="dv-mini-predname">{c.name}</span>
          </div>
          {c.factors && (
            <div className="dv-fac">
              {c.factors.map((f: any, i: number) => (
                <div key={i} className="dv-fac-row">
                  <span className="dv-fac-f">{f.f}</span>
                  <span className="dv-fac-bar"><span style={{ width: (f.a / f.m * 100) + '%' }} data-full={f.a === f.m || undefined} /></span>
                  <span className="dv-fac-n">{f.a}/{f.m}</span>
                </div>
              ))}
            </div>
          )}
          {(c.concerns || []).map((cn: string, i: number) => (
            <div key={i} className="dv-fac-concern">{'⚠ ' + cn}</div>
          ))}
        </div>
      ))}
      <div className="dv-mini-sub">SE comparison</div>
      <div className="dv-mini-matrix">
        {p.matrix.map((m: any, i: number) => (
          <div key={i} className="dv-mini-mrow">
            <span className="dv-mini-mc">{m.c}</span>
            <span className="dv-se-tag" data-v={m.se.split(' ')[0].toLowerCase()}>{m.se}</span>
          </div>
        ))}
      </div>
      {p.rubric && <p className="dv-mini-note">{p.rubric}</p>}
      <p className="dv-mini-note">{p.determinationNote}</p>
    </div>
  );
}

export function IntelClassification({ pw }: { pw: any }) {
  const c = pw.classification;
  return (
    <div className="dv-mini">
      <KV k="Class" v={c.className} /><KV k="Regulation" v={c.regulation} />
      {c.productCode && c.productCode !== '—' && <KV k="Product code" v={c.productCode} />}
      {c.notifiedBodyRequired != null && <KV k="Notified body" v={c.notifiedBodyRequired ? 'Required' : 'Self-declaration'} />}
      {c.confidence && <KV k="Confidence" v={c.confidence} />}
      {c.ruleTrace && (
        <div>
          <div className="dv-mini-sub">Annex VIII rule trace</div>
          <div className="dv-ruletrace">
            {c.ruleTrace.map((r: any, i: number) => (
              <div key={i} className={'dv-rt-row' + (r.matched ? ' on' : '')}>
                <span className="dv-rt-mk" data-on={r.matched || undefined}>{r.matched ? '●' : '○'}</span>
                <span className="dv-rt-rule">{r.rule}</span><span className="dv-rt-desc">{r.desc}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {c.conformityRoute && (
        <div className="dv-mini-cr"><div className="dv-mini-sub">Conformity route</div><p>{c.conformityRoute}</p></div>
      )}
      {c.fdaEquivalent && (
        <div className="dv-mini-cr"><div className="dv-mini-sub">FDA-equivalent (cross-jurisdiction)</div><p>{c.fdaEquivalent}</p></div>
      )}
      <div className="dv-mini-sub">Special controls</div>
      <ul className="dv-controls compact">
        {c.specialControls.map((s: string, i: number) => <li key={i}><Ic n="checkCircle" />{s}</li>)}
      </ul>
    </div>
  );
}

export function IntelRisk({ pw }: { pw: any }) {
  return (
    <div className="dv-mini">
      <div className="dv-mini-stat"><b>{pw.risk.count}</b> risks {'·'} <b>{pw.risk.extreme}</b> extreme</div>
      {pw.risk.rows.slice(0, 4).map((r: any) => (
        <div key={r.id} className="dv-mini-risk">
          <span className="pd-risk-score" data-tone={tone515(r.l, r.i)}>{r.l * r.i}</span>
          <span className="dv-mini-hz">{r.hazard}</span>
        </div>
      ))}
    </div>
  );
}

export function IntelPerformance({ pw }: { pw: any }) {
  return (
    <div className="dv-mini">
      {pw.performance.groups.map((g: any) => {
        const pass = g.tests.filter((t: any) => t.pass).length;
        return (
          <div key={g.id} className="dv-mini-pg">
            <div className="dv-mini-pgh">{g.label}<span className="pg-badge" data-tone={pass === g.tests.length ? 'ok' : 'warn'}>{pass}/{g.tests.length}</span></div>
            {g.tests.map((t: any, i: number) => (
              <div key={i} className="dv-mini-test">
                <span className="dv-mini-tn">{t.test}</span><span className="pg-mono">{t.result}</span>
                <span className="dv-mini-tk" data-ok={t.pass}>{t.pass ? '✓' : '•'}</span>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

export function IntelGspr({ pw }: { pw: any }) {
  const g = pw.gspr;
  return (
    <div className="dv-mini">
      <div className="dv-gspr-bar">
        <span className="dv-gspr-seg" style={{ flex: g.conform }} data-tone="ok">{g.conform}</span>
        <span className="dv-gspr-seg" style={{ flex: g.partial }} data-tone="warn">{g.partial}</span>
        <span className="dv-gspr-seg" style={{ flex: g.gap }} data-tone="err">{g.gap}</span>
      </div>
      {g.sample.map((s: any, i: number) => (
        <div key={i} className="dv-mini-gspr">
          <span className="pg-mono dv-gspr-id">{s.id}</span>
          <span className="pg-badge" data-tone={s.status === 'conform' ? 'ok' : s.status === 'partial' ? 'warn' : 'err'}>{labelize(s.status)}</span>
        </div>
      ))}
    </div>
  );
}

export function IntelClinical({ pw }: { pw: any }) {
  return (
    <div className="dv-mini">
      <div className="dv-mini-stat">{pw.clinical.trial} {'·'} n={pw.clinical.n}</div>
      {pw.clinical.endpoints.map((e: any, i: number) => (
        <div key={i} className="dv-mini-ep">
          <span className="dv-mini-tk" data-ok={e.pass}>{e.pass ? '✓' : '•'}</span>
          <span className="dv-mini-epn">{e.ep}</span><span className="pg-mono">{e.result}</span>
        </div>
      ))}
    </div>
  );
}

export function IntelManufacturing({ pw }: { pw: any }) {
  return (
    <div className="dv-mini">
      <div className="dv-mini-sub">{pw.manufacturing.qms}</div>
      {pw.manufacturing.items.map((m: any, i: number) => (
        <div key={i} className="dv-mini-mfg">
          <span className="pd-tree-dot" data-status={m.status} /><span>{m.area}</span>
        </div>
      ))}
    </div>
  );
}

export function IntelEquivalence({ pw }: { pw: any }) {
  return (
    <div className="dv-mini">
      <div className="dv-mini-sub">{pw.equivalence.device}</div>
      {pw.equivalence.criteria.map((c: any, i: number) => (
        <div key={i} className="dv-mini-eq">
          <span className="dv-mini-tk" data-ok={c.equiv}>{c.equiv ? '✓' : '•'}</span>
          <b>{c.dim}</b> {c.detail}
        </div>
      ))}
    </div>
  );
}

export function IntelLiterature({ pw }: { pw: any }) {
  const l = pw.literature;
  return (
    <div className="dv-mini">
      <div className="dv-prisma compact">
        {(['identified', 'screened', 'included'] as const).map(k => (
          <div key={k} className="dv-prisma-step">
            <div className="dv-prisma-n">{l.prisma[k]}</div><div className="dv-prisma-l">{k}</div>
          </div>
        ))}
      </div>
      {l.appraisal.map((a: any, i: number) => (
        <div key={i} className="dv-mini-app">
          <span className="pg-badge" data-tone={a.grade === 'High' ? 'ok' : a.grade === 'Moderate' ? 'ai' : 'idle'}>{a.grade}</span>
          <span>{a.n} {'·'} {a.note}</span>
        </div>
      ))}
    </div>
  );
}

export function IntelPms({ pw }: { pw: any }) {
  return (
    <div className="dv-mini">
      {pw.pms.pmcf.map((a: any, i: number) => (
        <div key={i} className="dv-mini-mfg">
          <span className="pd-tree-dot" data-status={a.status === 'active' ? 'complete' : a.status === 'planned' ? 'draft' : 'not_started'} />
          <span>{a.activity}</span><span className="dv-mini-cad">{a.cadence}</span>
        </div>
      ))}
    </div>
  );
}

export function IntelCdx({ pw }: { pw: any }) {
  const c = pw.cdx;
  return (
    <div className="dv-mini">
      <KV k="Drug" v={c.drug} /><KV k="Biomarker" v={c.biomarker} />
      <p className="dv-mini-note">{c.bridging}</p>
      {c.status.map((s: any, i: number) => (
        <div key={i} className="dv-mini-mfg">
          <span className="pd-tree-dot" data-status="draft" /><span>{s.item}</span><span className="pd-chip">{s.state}</span>
        </div>
      ))}
    </div>
  );
}

export function IntelCerConformance({ pw }: { pw: any }) {
  const c = pw.cerconformance;
  if (!c) return null;
  const tone = c.valid ? 'ok' : c.summary.mandatoryFailed > 0 ? 'err' : 'warn';
  return (
    <div className="dv-mini">
      <div className="dv-mini-det" data-tone={tone}>
        <span className="ra-det-l">{c.framework}</span>
        <span className="dv-mini-detv">{c.valid ? 'Structurally complete' : c.summary.mandatoryFailed + ' mandatory element' + (c.summary.mandatoryFailed !== 1 ? 's' : '') + ' missing'}</span>
      </div>
      <div className="dv-rsim-stats">
        <span><b>{c.summary.passed}/{c.summary.total}</b> checks passed</span>
        {c.summary.mandatoryFailed > 0 && <span><b>{c.summary.mandatoryFailed}</b> mandatory failed</span>}
      </div>
      {c.checks.map((ch: any, i: number) => (
        <div key={i} className="dv-cer-check" data-ok={ch.ok}>
          <span className="dv-mini-tk" data-ok={ch.ok}>{ch.ok ? '✓' : '✕'}</span>
          <div className="dv-cer-check-body">
            <div className="dv-cer-check-req">{ch.req} <span className="pg-badge" data-tone={ch.sev === 'mandatory' ? 'idle' : 'ok'}>{ch.sev}</span></div>
            <div className="dv-cer-check-ref">{ch.ref}</div>
            {!ch.ok && <div className="dv-rsim-fix">{ch.detail}</div>}
          </div>
        </div>
      ))}
    </div>
  );
}

export function IntelGsprFull({ pw }: { pw: any }) {
  const g = pw.gsprfull;
  if (!g) return null;
  const conformant = g.clauses.filter((c: any) => c.status === 'conformant').length;
  const partial = g.clauses.filter((c: any) => c.status === 'partial').length;
  const gap = g.clauses.filter((c: any) => c.status === 'gap').length;
  const na = g.clauses.filter((c: any) => c.status === 'not_applicable').length;
  const tone = (s: string) => s === 'conformant' ? 'ok' : s === 'partial' ? 'warn' : s === 'gap' ? 'err' : 'idle';
  return (
    <div className="dv-mini">
      <div className="dv-mini-sub">{g.regulation} {'·'} Class {g.applicableClass}</div>
      <div className="dv-gspr-bar">
        <span className="dv-gspr-seg" style={{ flex: conformant }} data-tone="ok">{conformant} conform</span>
        <span className="dv-gspr-seg" style={{ flex: partial }} data-tone="warn">{partial} partial</span>
        <span className="dv-gspr-seg" style={{ flex: gap }} data-tone="err">{gap} gap</span>
        {na > 0 && <span className="dv-gspr-seg" style={{ flex: na }} data-tone="idle">{na} n/a</span>}
      </div>
      {g.clauses.map((cl: any, i: number) => (
        <div key={i} className="dv-gspr-full-row">
          <div className="dv-gspr-full-top">
            <span className="pg-mono dv-gspr-id">{cl.n}</span>
            <span className="dv-gspr-full-t">{cl.title}</span>
            <span className="pg-badge" data-tone={tone(cl.status)}>{labelize(cl.status)}</span>
          </div>
          {cl.applies && (
            <div className="dv-gspr-full-detail">
              <span className="dv-mini-note">{cl.method}</span>
              {cl.std && <span className="pg-mono dv-gspr-std">{cl.std}</span>}
              {cl.gap && <div className="dv-rsim-fix" style={{ marginTop: 3 }}><b>Gap: </b>{cl.gap}</div>}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export function IntelPostMarket({ pw }: { pw: any }) {
  const p = pw.postmarketdocs;
  if (!p) return null;
  const tone = (s: string) => s === 'draft' ? 'warn' : s === 'approved' ? 'ok' : s === 'not_started' ? 'idle' : s === 'not_applicable' ? 'idle' : 'warn';
  return (
    <div className="dv-mini">
      <div className="dv-mini-sub">MDR post-market documentation suite {'·'} 6 document types</div>
      {p.types.map((t: any, i: number) => (
        <div key={i} className="dv-pm-row">
          <div className="dv-pm-h">
            <span className="dv-pm-type">{t.title}</span>
            <span className="pg-badge" data-tone={tone(t.status)}>{labelize(t.status)}</span>
          </div>
          <div className="dv-pm-req">{t.req}</div>
          <div className="dv-pm-detail">
            <span>{t.cadence}</span>
            {t.due && <span className="dv-pm-due">Due: {t.due}</span>}
          </div>
          {t.note && <p className="dv-mini-note">{t.note}</p>}
        </div>
      ))}
    </div>
  );
}

export function IntelChangeAssessment({ pw }: { pw: any }) {
  const c = pw.changeAssessment;
  if (!c) return null;
  const decLabel: Record<string, string> = { letter_to_file: 'Letter-to-File', new_510k: 'New 510(k)', pma_supplement_or_de_novo: 'PMA supplement / De Novo' };
  const decTone: Record<string, string> = { letter_to_file: 'ok', new_510k: 'warn', pma_supplement_or_de_novo: 'err' };
  return (
    <div className="dv-mini">
      <div className="dv-mini-sub">Pending change</div>
      <div className="dv-mini-stat">{c.pending}</div>
      {c.fda && (
        <div>
          <div className="dv-mini-det" data-tone={decTone[c.fda.decision]}>
            <span className="ra-det-l">FDA decision</span>
            <span className="dv-mini-detv">{decLabel[c.fda.decision]}</span>
          </div>
          {c.fda.triggers.length > 0 && (
            <>
              <div className="dv-mini-sub" style={{ marginTop: 8 }}>Triggers</div>
              {c.fda.triggers.map((t: string, i: number) => (
                <div key={i} className="dv-mini-mfg"><span className="dv-mini-tk" data-ok={false}>{'•'}</span><span>{t}</span></div>
              ))}
            </>
          )}
          <p className="dv-mini-note">{c.fda.rationale}</p>
        </div>
      )}
      {c.eu && (
        <div>
          <div className="dv-mini-det" data-tone={c.eu.significant ? 'warn' : 'ok'}>
            <span className="ra-det-l">EU MDCG 2020-3</span>
            <span className="dv-mini-detv">{c.eu.significant ? 'Significant change' : 'Non-significant change'}</span>
          </div>
          {c.eu.triggers.length > 0 && c.eu.triggers.map((t: string, i: number) => (
            <div key={i} className="dv-mini-mfg"><span className="dv-mini-tk" data-ok={false}>{'•'}</span><span>{t}</span></div>
          ))}
        </div>
      )}
      <p className="dv-mini-note">{c.guidance}</p>
    </div>
  );
}
