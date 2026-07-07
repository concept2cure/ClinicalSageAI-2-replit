import React, { useState } from 'react';
import { I } from '../icons';
import '../styles/auth-entry.css';
import '../styles/translation-v2.css';

const INDUSTRIES = ['Biotech', 'Pharma', 'Medical device', 'IVD / diagnostics', 'CRO', 'Academic'];
const ROLES = ['Regulatory affairs', 'Clinical', 'Quality', 'CMC', 'Executive', 'Medical writing'];
const MODULES = [
  { id: 'mdx', label: 'Medical Device & Diagnostics' },
  { id: 'biopharma', label: 'Biotech & Pharma' },
  { id: 'global-ri', label: 'Global RI' },
  { id: 'cmc', label: 'CMC / Module 3' },
  { id: 'biostat', label: 'Biostatistics' },
  { id: 'safety', label: 'Safety / PV' },
];
const TXW_TARGETS = [
  { id: 'ja-JP', label: 'Japanese', flag: 'JP', agency: 'PMDA' },
  { id: 'zh-CN', label: 'Chinese', flag: 'CN', agency: 'NMPA' },
  { id: 'de-DE', label: 'German', flag: 'DE', agency: 'BfArM' },
  { id: 'fr-FR', label: 'French', flag: 'FR', agency: 'ANSM' },
  { id: 'ko-KR', label: 'Korean', flag: 'KR', agency: 'MFDS' },
  { id: 'pt-BR', label: 'Portuguese', flag: 'BR', agency: 'ANVISA' },
];
const TXW_REVIEW_ROLES = [
  { id: 'post_editor', label: 'Post-editor', sub: 'I edit machine drafts into reviewable text.' },
  { id: 'reviewer', label: 'Reviewer', sub: 'I verify a colleague\'s post-edit and sign off.' },
  { id: 'observer', label: 'Observer', sub: 'I read translated content; no edits or sign-off.' },
];

function Bar({ i, n }: { i: number; n: number }) {
  return (
    <div className="ob-bar">
      {Array.from({ length: n }).map((_, k) => <span key={k} className={k <= i ? 'on' : ''} />)}
    </div>
  );
}

export interface OnboardingWizardProps {
  onEnter: () => void;
  onConnectSource?: () => void;
}

export function OnboardingWizard({ onEnter, onConnectSource }: OnboardingWizardProps) {
  const [step, setStep] = useState(0);
  const [org, setOrg] = useState('');
  const [industry, setIndustry] = useState('');
  const [role, setRole] = useState('');
  const [mods, setMods] = useState(['mdx', 'global-ri']);
  const [invites, setInvites] = useState(['', '', '']);
  const [txwOn, setTxwOn] = useState(true);
  const [txwLangs, setTxwLangs] = useState(['ja-JP']);
  const [txwRole, setTxwRole] = useState('post_editor');
  const [txwAutoOpen, setTxwAutoOpen] = useState(true);

  const toggle = (id: string) => setMods(m => m.includes(id) ? m.filter(x => x !== id) : [...m, id]);
  const toggleLang = (id: string) => setTxwLangs(l => l.includes(id) ? l.filter(x => x !== id) : [...l, id]);

  const enter = () => {
    try {
      localStorage.setItem('c2c_user_prefs', JSON.stringify({
        txwEnabled: txwOn, txwLangs, txwRole, txwAutoOpenSegments: txwAutoOpen,
      }));
    } catch (_) { /* storage unavailable */ }
    onEnter();
  };

  const steps = ['Welcome', 'Organization', 'Modules', 'Translation', 'Invite team', 'Ready'];

  return (
    <div className="c2c-v2">
      <div className="ob">
        <div className="ob-shell">
          <div className="ob-head">
            <div className="auth-brand-top"><b>Concept2Cure<span>.RI</span></b></div>
            <Bar i={step} n={steps.length} />
            <div className="ob-stepname">{step + 1} of {steps.length} {'·'} {steps[step]}</div>
          </div>

          <div className="ob-card">
            {step === 0 && <>
              <h2 className="auth-h">Welcome to your Regulatory Intelligence OS</h2>
              <p className="auth-p">A few quick steps to tailor your workspace. This takes about a minute — AnA will be ready on the other side.</p>
              <div className="ob-feats">
                <div className="ob-feat"><span className="ico">{I.sparkles}</span><div><b>AnA alongside every decision</b><span>Author, audit, and assemble with citations and governance.</span></div></div>
                <div className="ob-feat"><span className="ico">{I.shieldCheck}</span><div><b>Compliant from day one</b><span>21 CFR Part 11 audit trails and e-signatures, built in.</span></div></div>
                <div className="ob-feat"><span className="ico">{I.globe}</span><div><b>Every pathway, one platform</b><span>510(k), IND, NDA, BLA, MAA, CER and more.</span></div></div>
              </div>
              <button className="auth-btn" onClick={() => setStep(1)}>Get started {I.arrowRight}</button>
            </>}

            {step === 1 && <>
              <h2 className="auth-h">Tell us about your organization</h2>
              <p className="auth-p">This tailors defaults, templates, and AnA's context.</p>
              <div className="auth-field"><label>Organization name</label><input className="auth-input" value={org} onChange={e => setOrg(e.target.value)} placeholder="Acme Bio, Inc." /></div>
              <div className="auth-field"><label>Industry</label><div className="ob-chips">{INDUSTRIES.map(x => <button key={x} className={`ob-chip${industry === x ? ' on' : ''}`} onClick={() => setIndustry(x)}>{x}</button>)}</div></div>
              <div className="auth-field"><label>Your role</label><div className="ob-chips">{ROLES.map(x => <button key={x} className={`ob-chip${role === x ? ' on' : ''}`} onClick={() => setRole(x)}>{x}</button>)}</div></div>
              <div className="ob-nav"><button className="auth-btn ghost" onClick={() => setStep(0)}>Back</button><button className="auth-btn" disabled={!org || !industry || !role} onClick={() => setStep(2)}>Continue {I.arrowRight}</button></div>
            </>}

            {step === 2 && <>
              <h2 className="auth-h">Which modules do you use?</h2>
              <p className="auth-p">Turn on what you need now — add more anytime from Plans {'&'} licensing.</p>
              <div className="ob-mods">
                {MODULES.map(m => (
                  <button key={m.id} className={`ob-mod${mods.includes(m.id) ? ' on' : ''}`} onClick={() => toggle(m.id)}>
                    <span className="ob-mod-check">{mods.includes(m.id) && I.check}</span>{m.label}
                  </button>
                ))}
              </div>
              <div className="ob-nav"><button className="auth-btn ghost" onClick={() => setStep(1)}>Back</button><button className="auth-btn" disabled={!mods.length} onClick={() => setStep(3)}>Continue {I.arrowRight}</button></div>
            </>}

            {step === 3 && <>
              <h2 className="auth-h">Translation preferences</h2>
              <p className="auth-p">Set how you'll work with non-English regulatory content. You can change these anytime in your profile.</p>

              <div className="txw-ob-card">
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 14 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <h3 className="txw-ob-title">Show the Translation workspace in my editor</h3>
                    <p className="txw-ob-sub">Adds a <b>Trans</b> dock in the Document editor with segment-level bilingual review, glossary, and QA.</p>
                  </div>
                  <button className="txw-switch" data-on={txwOn || undefined} onClick={() => setTxwOn(v => !v)} aria-pressed={txwOn} aria-label="Enable translation workspace" />
                </div>
              </div>

              {txwOn && <>
                <div className="auth-field" style={{ marginTop: 16 }}>
                  <label>Target languages you regularly work with</label>
                  <div className="ob-chips">
                    {TXW_TARGETS.map(l => (
                      <button key={l.id} className={`ob-chip${txwLangs.includes(l.id) ? ' on' : ''}`} onClick={() => toggleLang(l.id)}>
                        {l.flag} {l.label} <span style={{ opacity: 0.7, fontSize: 11 }}>{'·'} {l.agency}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="auth-field">
                  <label>Your translation role</label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 6 }}>
                    {TXW_REVIEW_ROLES.map(r => (
                      <button key={r.id} className={`ob-chip${txwRole === r.id ? ' on' : ''}`} style={{ textAlign: 'left', padding: '10px 12px', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2 }} onClick={() => setTxwRole(r.id)}>
                        <span style={{ fontWeight: 600 }}>{r.label}</span>
                        <span style={{ fontSize: 11, opacity: 0.85, fontWeight: 400 }}>{r.sub}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="auth-field" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <button className="txw-switch" data-on={txwAutoOpen || undefined} onClick={() => setTxwAutoOpen(v => !v)} aria-pressed={txwAutoOpen} aria-label="Auto-open segments" />
                  <label style={{ margin: 0, fontSize: 12, color: 'var(--text-200)' }}>Open <b>Segments</b> view by default when I open the Trans dock</label>
                </div>
              </>}

              <div className="ob-nav" style={{ marginTop: 18 }}><button className="auth-btn ghost" onClick={() => setStep(2)}>Back</button><button className="auth-btn" onClick={() => setStep(4)}>Continue {I.arrowRight}</button></div>
            </>}

            {step === 4 && <>
              <h2 className="auth-h">Invite your team</h2>
              <p className="auth-p">Add colleagues now, or skip and invite them later from Admin.</p>
              {invites.map((v, i) => (
                <div className="auth-field" key={i}>
                  <input className="auth-input" type="email" value={v} placeholder="colleague@company.com" onChange={e => { const n = [...invites]; n[i] = e.target.value; setInvites(n); }} />
                </div>
              ))}
              <button className="auth-link" onClick={() => setInvites([...invites, ''])}>+ Add another</button>
              <div className="ob-nav" style={{ marginTop: 18 }}><button className="auth-btn ghost" onClick={() => setStep(3)}>Back</button><button className="auth-btn" onClick={() => setStep(5)}>Continue {I.arrowRight}</button></div>
            </>}

            {step === 5 && <>
              <div className="ob-done">{I.check}</div>
              <h2 className="auth-h" style={{ textAlign: 'center' }}>Workspace ready{org ? `, ${org.split(' ')[0]}` : ''}</h2>
              <p className="auth-p" style={{ textAlign: 'center' }}>AnA has your context and your modules are live.</p>
              <div className="auth-bring">
                <div className="auth-bring-h">{I.folder} Bring your documents</div>
                <div className="auth-bring-b">Concept2Cure works alongside Veeva Vault, SharePoint and OneDrive — connect a source and import runs detect, classify, and approve into governed artifacts. No rip-and-replace.</div>
                <button className="auth-btn ghost" onClick={() => { if (onConnectSource) { onConnectSource(); } else { enter(); } }}>Connect a document source {I.arrowRight}</button>
              </div>
              <button className="auth-btn" onClick={enter}>Enter workspace {I.arrowRight}</button>
              <div className="auth-foot">Want a tour first? Open <b>Training {'&'} enablement</b> anytime from the rail.</div>
            </>}
          </div>
        </div>
      </div>
    </div>
  );
}
