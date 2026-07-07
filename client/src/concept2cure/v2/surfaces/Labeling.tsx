import React, { useState, useMemo } from 'react';
import { I } from '../icons';
import { SampleTag, connected } from '../dataConnect';
import { AnswerLead } from '../AnswerLead';
import type { SurfaceViewProps } from '../surfaceViews';
import { C2CForm } from '../C2CForm';
import type { C2CFormConfig } from '../C2CForm';
import '../styles/project-home-v2.css';
import {
  LABEL_SYMBOLS, LABEL_UDI, LABEL_WARNINGS, LABEL_DOC, LABEL_ENUMS,
  LABEL_SECTIONS, LABEL_CHECKS, LABEL_TRANSLATIONS, STATUS_TONE,
} from '../fixtures/labeling-data';
import type { LabelTranslation } from '../fixtures/labeling-data';

/* ---- Labeling and IFU ---- */

export function Labeling({ onAsk }: SurfaceViewProps) {
  const sym = LABEL_SYMBOLS;
  const udi = LABEL_UDI;
  const warns = LABEL_WARNINGS;
  const doc = LABEL_DOC;
  const EN = LABEL_ENUMS;
  const symTone = (s: string) => s === 'placed' ? 'ok' : s === 'review' ? 'warn' : s === 'na' ? 'idle' : 'err';
  const [trans, setTrans] = useState<LabelTranslation[]>(LABEL_TRANSLATIONS);
  const [tForm, setTForm] = useState(false);
  const [toast, setToast] = useState('');
  const fire = (m: string) => { setToast(m); setTimeout(() => setToast(''), 2600); };

  const cov = useMemo(() => {
    const total = trans.length;
    const approved = trans.filter(t => t.status === 'approved').length;
    const btv = trans.filter(t => t.btv).length;
    return { total, approved, btv, pct: total ? Math.round(approved / total * 100) : 0 };
  }, [trans]);
  const openBlockers = warns.filter(w => !w.placed && w.blocker).length + sym.filter(s => s.blocker && s.status !== 'placed').length;

  const addTrans = (v: Record<string, string>) => {
    const id = 'TR-' + (v.language || 'xx').toLowerCase();
    if (trans.some(t => t.language === v.language)) { fire('A translation for ' + v.language + ' already exists'); setTForm(false); return; }
    const nt: LabelTranslation = { id, language: v.language, name: v.name || v.language, method: v.method || 'mt_postedited', btv: false, status: 'pending', _new: true };
    setTrans(ts => [...ts, nt]); setTForm(false);
    const api = (window as any).C2C_API;
    if (api && api.connected()) { api.post('/api/mdx/labeling/1/translations', { language: nt.language, translationMethod: nt.method, status: 'pending' }).catch(() => {}); }
    fire('Translation ' + v.language + ' added / status Pending');
  };
  const advTrans = (id: string) => setTrans(ts => ts.map(t => {
    if (t.id !== id) return t;
    const order = ['pending', 'in_progress', 'review', 'approved'];
    const i = order.indexOf(t.status);
    const nxt = i >= 0 && i < order.length - 1 ? order[i + 1] : t.status;
    const api = (window as any).C2C_API;
    if (api && api.connected()) { api.patch('/api/mdx/labeling/translations/' + id.replace('TR-', ''), { status: nxt }).catch(() => {}); }
    return { ...t, status: nxt, btv: nxt === 'approved' ? true : t.btv };
  }));

  const tTone: Record<string, string> = { approved: 'ok', review: 'warn', in_progress: 'ai', pending: 'idle', rejected: 'err' };

  const kindLabel = (EN.kind.find(k => k[0] === doc.kind) || [])[1] || doc.kind;

  const transFormConfig: C2CFormConfig = {
    eyebrow: 'Labeling / translation',
    title: 'Add translation',
    sub: 'Adds a target language to the ' + doc.device + ' ' + kindLabel + '.',
    governed: 'Translations are QC-gated: a back-translation check must pass before the language can reach Approved.',
    submitLabel: 'Add translation',
    fields: [
      { key: 'language', label: 'Language code', type: 'text', placeholder: 'e.g. pt, sv, cs', required: true },
      { key: 'name', label: 'Language name', type: 'text', placeholder: 'e.g. Portuguese', required: true },
      { key: 'method', label: 'Translation method', type: 'select', options: EN.method.map(m => ({ value: m[0], label: m[1] })), required: true },
    ],
  };

  return (
    <div className="page-inner">
      <SampleTag sample={true} />
      <div className="ph">
        <div>
          <div className="ph-eyebrow">{'Specialist / device / ' + kindLabel + ' v' + doc.version}</div>
          <h1 className="ph-title">Labeling and IFU</h1>
          <div className="ph-sub">
            Label, IFU and symbols authoring — ISO 15223-1 symbols, UDI placement (21 CFR 801.45 / GUDID), translations with back-translation QC, and warnings traced to the ISO 14971 risk file.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn ghost" onClick={() => onAsk('Check labeling compliance and reconcile warnings against the risk file')}>{I.sparkles} Ask AnA</button>
        </div>
      </div>

      <AnswerLead
        tone={openBlockers > 0 ? 'urgent' : 'calm'}
        eyebrow="Where the label package stands right now"
        headline={openBlockers > 0
          ? <><b>{openBlockers}</b> label item{openBlockers === 1 ? '' : 's'} {openBlockers === 1 ? 'is' : 'are'} still blocking — a required warning or symbol is not on the label yet.</>
          : cov.approved < cov.total
            ? <>The label content is controlled; <b>{cov.total - cov.approved}</b> of {cov.total} translations {cov.total - cov.approved === 1 ? 'is' : 'are'} still short of approved.</>
            : <>All {cov.total} translations are approved and the label content is reconciled to the risk file.</>}
        body={<>Translation coverage is <b>{cov.approved}/{cov.total}</b> approved ({cov.pct}%), <b>{cov.btv}</b> back-translation verified. Every warning is traced to the ISO 14971 hazard it controls, so a label change and a risk change can never drift apart.</>}
        reassure="I will draft the missing-language IFU, run the back-translation check, and flag any warning that no longer matches its hazard — you approve each one."
        action={openBlockers > 0
          ? { label: 'Resolve the label blocker', onClick: () => onAsk('Which label items are blocking and what resolves them?') }
          : { label: 'Add a translation', onClick: () => setTForm(true) }}
        secondary="Or work the symbols, warnings, UDI and translations below."
      />

      <div className="split2">
        <div className="sec">
          <div className="sec-hdr">
            <div className="sec-title">ISO 15223-1 symbols</div>
            <div className="sec-sub">{sym.filter(s => s.status === 'placed').length} placed / {sym.filter(s => s.status === 'needed').length} needed</div>
          </div>
          <div className="lbl-symgrid">
            {sym.map((s, i) => (
              <div key={i} className="lbl-sym" data-blocker={s.blocker || undefined}>
                <div className="lbl-sym-box"><span className="lbl-sym-ref">{s.ref}</span></div>
                <div className="lbl-sym-name">{s.name}</div>
                <span className={`lbl-dot tone-${symTone(s.status)}`} title={s.status} />
              </div>
            ))}
          </div>
        </div>
        <div className="sec">
          <div className="sec-hdr">
            <div className="sec-title">Warnings and precautions</div>
            <div className="sec-sub">traced to the risk file (ISO 14971)</div>
          </div>
          <div className="lbl-warns">
            {warns.map((w, i) => (
              <div key={i} className="lbl-warn" data-blocker={(!w.placed && w.blocker) || undefined}>
                <div className="lbl-warn-top">
                  <span className={`lbl-dot tone-${w.placed ? 'ok' : 'err'}`} />
                  <span className="lbl-warn-w">{w.w}</span>
                </div>
                <div className="lbl-warn-trace">
                  <button className="lbl-hz" onClick={() => onAsk(`Show ${w.hz} in the risk file and confirm this warning mitigates it`)}>{I.alertTriangle} {w.hz}</button>
                  <span className="lbl-warn-src">{w.src}</span>
                  {!w.placed && <span className="lbl-warn-flag">not on label</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="split2">
        <div className="sec">
          <div className="sec-hdr">
            <div className="sec-title">UDI placement</div>
            <div className="sec-sub">21 CFR 801.45 / {udi.issuing}</div>
          </div>
          <div className="lbl-udi">
            <div className="lbl-udi-carrier">
              <div className="lbl-udi-di"><span className="lbl-udi-k">UDI-DI</span><code>{udi.di}</code></div>
              <div className="lbl-udi-c">{udi.carrier}</div>
              <div className="lbl-udi-pi">{udi.pi.map((p, i) => <span key={i} className="lbl-udi-pichip">{p}</span>)}</div>
            </div>
            <div className="lbl-udi-place">
              {udi.placements.map((p, i) => (
                <div key={i} className="lbl-udi-row"><span className={`lbl-dot tone-${p.done ? 'ok' : 'err'}`} />{p.loc}{!p.done && <span className="lbl-warn-flag">pending</span>}</div>
              ))}
            </div>
          </div>
        </div>
        <div className="sec">
          <div className="sec-hdr"><div className="sec-title">Compliance checks</div></div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {LABEL_CHECKS.map((c, i) => (
              <div key={i} className="form-row">
                <span className="form-l" style={{ flex: 1, fontWeight: 500 }}>{c.k}</span>
                <span style={{ fontSize: 12, color: 'var(--text-300)' }}>{c.v}</span>
                <span className={`rd-chip tone-${c.tone}`}>{c.tone === 'ok' ? 'pass' : 'review'}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="sec">
        <div className="sec-hdr"><div className="sec-title">Label and IFU sections</div></div>
        <div className="ctable">
          {LABEL_SECTIONS.map((s, i) => (
            <div key={i} className="ct-row" style={{ gridTemplateColumns: '1fr 100px' }} data-blocker={s.blocker || undefined}>
              <div className="vn">{s.blocker && <span className="esig" style={{ color: 'var(--error)' }}>{I.alertTriangle}</span>}<span className="ct-strong">{s.s}</span></div>
              <div><span className={`rd-chip tone-${STATUS_TONE[s.status] || 'idle'}`}>{s.status}</span></div>
            </div>
          ))}
        </div>
      </div>

      <div className="sec">
        <div className="sec-hdr">
          <div className="sec-title">Translations and coverage</div>
          <div className="sec-sub">{cov.approved}/{cov.total} approved / {cov.btv} back-translation verified</div>
          <button className="btn ghost" style={{ marginLeft: 'auto' }} onClick={() => setTForm(true)}>{I.plus} Add translation</button>
        </div>
        <div className="lbl-cov-bar"><div className="lbl-cov-fill" style={{ width: cov.pct + '%' }} /></div>
        <div className="ctable" style={{ marginTop: 10 }}>
          {trans.map(t => (
            <div key={t.id} className="ct-row" style={{ gridTemplateColumns: '1.4fr 1fr 0.9fr 120px', alignItems: 'center' }} data-fresh={t._new || undefined}>
              <div className="vn"><span className="ct-strong">{t.name}</span> <span className="mono" style={{ fontSize: 11, color: 'var(--text-400)' }}>{t.language}</span></div>
              <div style={{ fontSize: 12, color: 'var(--text-300)' }}>
                {(EN.method.find(m => m[0] === t.method) || [])[1] || t.method}
                {t.btv && <span className="rd-chip tone-ok" style={{ marginLeft: 6, fontSize: 9 }}>back-trans verified</span>}
              </div>
              <div><span className={`rd-chip tone-${tTone[t.status] || 'idle'}`}>{(EN.transStatus.find(s => s[0] === t.status) || [])[1] || t.status}</span></div>
              <div style={{ textAlign: 'right' }}>{t.status !== 'approved' && <button className="btn ghost" style={{ height: 26 }} onClick={() => advTrans(t.id)}>{I.arrowRight} Advance</button>}</div>
            </div>
          ))}
        </div>
      </div>

      {tForm && <C2CForm config={transFormConfig} onCancel={() => setTForm(false)} onSubmit={addTrans} />}

      {toast && <div className="pdev-toast">{I.check} {toast}</div>}
    </div>
  );
}
