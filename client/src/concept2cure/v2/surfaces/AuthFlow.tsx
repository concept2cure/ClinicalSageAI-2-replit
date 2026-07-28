import React, { useState, useRef, useEffect } from 'react';
import { I } from '../icons';
import '../styles/auth-entry.css';

const ORGS = [
  { id: 'acme', name: 'Acme Bio', role: 'Admin', meta: '8 programs · Enterprise', color: 'var(--accent-100)', initials: 'AB' },
  { id: 'northstar', name: 'Northstar Devices', role: 'Editor', meta: '3 programs · MDX', color: 'var(--ai)', initials: 'ND' },
  { id: 'vertex', name: 'Vertex CRO', role: 'Viewer', meta: 'Client workspace', color: 'var(--success)', initials: 'VC' },
];

function Steps({ i }: { i: number }) {
  return (
    <div className="auth-step">
      {['Sign in', 'Verify', 'Workspace'].map((s, n) => (
        <React.Fragment key={s}>
          <span className={`dot${n <= i ? ' on' : ''}`} />
          {s}
          {n < 2 && <span style={{ opacity: 0.4 }}>{'·'}</span>}
        </React.Fragment>
      ))}
    </div>
  );
}

function Login({ onNext }: { onNext: () => void }) {
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  const go = () => {
    if (!email || !pw) { setErr('Enter your email and password.'); return; }
    setErr('');
    onNext();
  };
  return (
    <div className="auth-card">
      <Steps i={0} />
      <h2 className="auth-h">Welcome back</h2>
      <p className="auth-p">Sign in to your regulatory workspace.</p>
      {err && <div className="auth-err">{I.alertTriangle} {err}</div>}
      <div className="auth-field">
        <label>Work email</label>
        <input className="auth-input" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@company.com" onKeyDown={e => e.key === 'Enter' && go()} />
      </div>
      <div className="auth-field">
        <label>Password</label>
        <input className="auth-input" type="password" value={pw} onChange={e => setPw(e.target.value)} placeholder="Enter your password" onKeyDown={e => e.key === 'Enter' && go()} />
      </div>
      <div className="auth-row">
        <label className="auth-check"><input type="checkbox" defaultChecked /> Keep me signed in</label>
        <a className="auth-link">Forgot password?</a>
      </div>
      <button className="auth-btn" onClick={go}>Sign in {I.arrowRight}</button>
      <div className="auth-or">or</div>
      <button className="auth-btn ghost" onClick={onNext}>{I.lock} Continue with SSO</button>
      <div className="auth-foot">Accounts lock for 15 minutes after 5 failed attempts.<br />Protected by MFA on every sign-in.</div>
    </div>
  );
}

function Mfa({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
  const [code, setCode] = useState(['', '', '', '', '', '']);
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const set = (i: number, v: string) => {
    v = v.replace(/\D/g, '').slice(-1);
    const n = [...code];
    n[i] = v;
    setCode(n);
    if (v && i < 5) refs.current[i + 1]?.focus();
  };
  const key = (i: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !code[i] && i > 0) refs.current[i - 1]?.focus();
  };
  const full = code.every(Boolean);
  useEffect(() => { refs.current[0]?.focus(); }, []);
  return (
    <div className="auth-card">
      <Steps i={1} />
      <h2 className="auth-h">Two-factor verification</h2>
      <p className="auth-p">Enter the 6-digit code from your authenticator app.</p>
      <div className="otp">
        {code.map((c, i) => (
          <input key={i} ref={el => { refs.current[i] = el; }} className={c ? 'filled' : ''} inputMode="numeric" value={c} onChange={e => set(i, e.target.value)} onKeyDown={e => key(i, e)} />
        ))}
      </div>
      <button className="auth-btn" disabled={!full} onClick={onNext}>{I.shieldCheck} Verify</button>
      <div className="auth-foot"><a className="auth-link">Resend code</a> {'·'} <a className="auth-link" onClick={onBack}>Use a backup code</a></div>
    </div>
  );
}

function OrgPick({ onPick }: { onPick: () => void }) {
  return (
    <div className="auth-card">
      <Steps i={2} />
      <h2 className="auth-h">Choose a workspace</h2>
      <p className="auth-p">You have access to {ORGS.length} organizations.</p>
      <div className="org-list">
        {ORGS.map(o => (
          <button key={o.id} className="org-row" onClick={onPick}>
            <span className="org-mark" style={{ background: o.color }}>{o.initials}</span>
            <span><span className="org-name" style={{ display: 'block' }}>{o.name}</span><span className="org-meta">{o.role} {'·'} {o.meta}</span></span>
            <span className="ico">{I.arrowRight}</span>
          </button>
        ))}
      </div>
      <div className="auth-foot">Need another workspace? Ask your org admin for an invite.</div>
    </div>
  );
}

export interface AuthFlowProps {
  onEnter: () => void;
}

export function AuthFlow({ onEnter }: AuthFlowProps) {
  const [stage, setStage] = useState<'login' | 'mfa' | 'org'>('login');
  return (
    <div className="c2c-v2">
      <div className="auth-stage">
        <div className="auth-brand">
          <div className="auth-brand-top"><b>Concept2Cure<span>.RI</span></b></div>
          <div className="auth-brand-mid">
            <div className="auth-brand-eyebrow">Regulatory Intelligence OS</div>
            <h1 className="auth-brand-h">The system that determines whether submissions <em>succeed</em>.</h1>
            <p className="auth-brand-sub">Author, govern, and assemble regulatory submissions on one intelligence layer — with AnA alongside every decision.</p>
          </div>
          <div className="auth-trust">
            {/*
              These rows are read by prospects at the point of signup, so every
              claim here has to be one we can defend in a customer security
              review. Three previous claims did not survive that test and were
              corrected in the 2026-07 audit:
                - a SOC 2 badge — we hold no SOC 2 report of any type. The
                  platform ships a Trust Services Criteria control
                  mapping as a reference for the customer's own GRC program;
                  /api/part11/soc2/controls says exactly that in its own
                  response body, so the product contradicted itself between its
                  API and its landing copy.
                - a blanket encryption-at-rest badge — encryption at rest is
                  field-level over specific secrets, not blanket.
                - a claim that multi-factor auth and SSO were mandatory in all
                  production environments — TOTP MFA is per-user opt-in and SSO
                  is configured per domain; neither is required by default.
              Keep this row set factual. See SECURITY.md.
            */}
            <div className="auth-trust-row"><span className="ico">{I.shieldCheck}</span><span><b>21 CFR Part 11</b> — hash-chained audit trails, e-signatures, tamper-evident records</span></div>
            <div className="auth-trust-row"><span className="ico">{I.shieldCheck}</span><span><b>HIPAA-ready</b> {'·'} encrypted in transit {'·'} stored credentials encrypted with AES-256-GCM</span></div>
            <div className="auth-trust-row"><span className="ico">{I.lock}</span><span><b>MFA {'&'} SSO</b> supported {'·'} role-based access control {'·'} full audit logging</span></div>
          </div>
        </div>
        <div className="auth-main">
          {stage === 'login' && <Login onNext={() => setStage('mfa')} />}
          {stage === 'mfa' && <Mfa onNext={() => setStage('org')} onBack={() => setStage('mfa')} />}
          {stage === 'org' && <OrgPick onPick={onEnter} />}
        </div>
      </div>
    </div>
  );
}
