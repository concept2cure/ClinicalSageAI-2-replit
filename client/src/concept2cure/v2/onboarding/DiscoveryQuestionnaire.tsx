import React, { useEffect, useState } from 'react';
import type { OnboardingDiscovery } from '@shared/types/onboarding-discovery';
import { I } from '../icons';
import '../styles/onboarding-discovery.css';

const USE_CASES = [
  ['projects', 'Organize projects'], ['vault', 'Manage source documents'],
  ['authoring', 'Author regulatory documents'], ['submission_center', 'Prepare submissions'],
  ['submission_readiness', 'Assess submission readiness'], ['qms', 'Control quality documents'],
  ['reporting', 'Report across programs'], ['cmc', 'Compose CMC / Module 3'],
] as const;
const SETUP_NEEDS = [
  ['invite_team', 'Invite a team'], ['review_roles', 'Set up reviewers and approvers'],
  ['mfa', 'Set up an authenticator'], ['session_policy', 'Review session policy'],
  ['sso_scim', 'Review SSO and provisioning'], ['agency_accounts', 'Configure agency accounts'],
  ['translation', 'Review translation settings'],
] as const;
const splitList = (s: string) => [...new Set(s.split(/[,;\n]/).map((v) => v.trim()).filter(Boolean))];

/** Keep separators while typing; a late read may replace only an unedited list. */
function ListInput({ id, label, values, onChange, hint }: {
  id: string; label: string; values: string[]; onChange: (v: string[]) => void; hint: string;
}) {
  const [raw, setRaw] = useState(values.join(', '));
  useEffect(() => {
    if (JSON.stringify(splitList(raw)) !== JSON.stringify(values)) setRaw(values.join(', '));
  }, [values, raw]);
  return <div className="ob-discovery-field">
    <label htmlFor={id}>{label}</label>
    <input id={id} className="ob-in" value={raw} maxLength={1200}
      aria-describedby={`${id}-hint`} onChange={(e) => { setRaw(e.target.value); onChange(splitList(e.target.value)); }} />
    <span id={`${id}-hint`} className="ob-discovery-hint">{hint} Separate entries with commas.</span>
  </div>;
}

export function DiscoveryQuestionnaire({ stage, value, onChange, onAsk }: {
  stage: 'company' | 'project'; value: OnboardingDiscovery;
  onChange: (v: OnboardingDiscovery) => void; onAsk: (text: string) => void;
}) {
  const company = (patch: Partial<OnboardingDiscovery['company']>) => onChange({ ...value, company: { ...value.company, ...patch } });
  const user = (patch: Partial<OnboardingDiscovery['user']>) => onChange({ ...value, user: { ...value.user, ...patch } });
  const project = (patch: Partial<OnboardingDiscovery['project']>) => onChange({ ...value, project: { ...value.project, ...patch } });
  const setup = (patch: Partial<OnboardingDiscovery['setup']>) => onChange({ ...value, setup: { ...value.setup, ...patch } });
  const text = (id: string, label: string, content: string, update: (s: string) => void, options: { max: number; required?: boolean } = { max: 1000 }) => (
    <div className="ob-discovery-field"><label htmlFor={id}>{label}{options.required ? ' *' : ''}</label>
      <textarea id={id} className="ob-in" rows={3} maxLength={options.max} value={content}
        required={options.required} onChange={(e) => update(e.target.value)} /></div>
  );

  if (stage === 'company') return <div className="ob-discovery">
    <h2 className="ob-discovery-title">What are you here to achieve?</h2>
    <p className="scaf-note">Describe your work so we can guide setup. These answers belong to your organization and can be revisited here. Keep patient details and credentials out of these notes.</p>
    {text('ob-company-goals', 'Company goals', value.company.goals, (goals) => company({ goals }), { max: 1000, required: true })}
    <fieldset className="ob-discovery-choices"><legend>What will you use this workspace for? *</legend>
      {USE_CASES.map(([key, label]) => <label key={key}><input type="checkbox" checked={value.company.useCases.includes(key)}
        onChange={(e) => company({ useCases: e.target.checked ? [...value.company.useCases, key] : value.company.useCases.filter((v) => v !== key) })} />{label}</label>)}
    </fieldset>
    {value.company.useCases.includes('cmc') && <p className="scaf-note">Module 3 composition supports small-molecule US INDs. Your plan and product scope determine access.</p>}
    <div className="ob-discovery-grid">
      <div className="ob-discovery-field"><label htmlFor="ob-working-role">Your working role</label>
        <input id="ob-working-role" className="ob-in" maxLength={120} value={value.user.workingRole}
          placeholder="e.g. Regulatory lead, scientist, founder" onChange={(e) => user({ workingRole: e.target.value })} />
        <span className="ob-discovery-hint">This describes your work; it does not grant permissions.</span></div>
      <div className="ob-discovery-field"><label htmlFor="ob-sophistication">Experience with regulatory work</label>
        <select id="ob-sophistication" className="ob-in" value={value.user.sophistication}
          onChange={(e) => user({ sophistication: e.target.value as OnboardingDiscovery['user']['sophistication'] })}>
          <option value="not_stated">Not stated yet</option><option value="new">New to regulatory work</option>
          <option value="developing">Building my experience</option><option value="experienced">Experienced practitioner</option>
        </select></div>
      <div className="ob-discovery-field"><label htmlFor="ob-guidance">How would you like to be guided?</label>
        <select id="ob-guidance" className="ob-in" value={value.user.preferredGuidance}
          onChange={(e) => user({ preferredGuidance: e.target.value as OnboardingDiscovery['user']['preferredGuidance'] })}>
          <option value="not_stated">Decide later</option><option value="step_by_step">Step by step, with explanations</option>
          <option value="contextual">Context and options when needed</option><option value="concise">Concise guidance for an expert</option>
        </select></div>
      <div className="ob-discovery-field"><label htmlFor="ob-team-size">Expected team size</label>
        <input id="ob-team-size" className="ob-in" type="number" min={1} max={10000} value={value.setup.teamSize ?? ''}
          onChange={(e) => setup({ teamSize: e.target.value === '' ? null : Number(e.target.value) })} />
        <span className="ob-discovery-hint">A planning estimate; purchased seats are chosen later.</span></div>
    </div>
    {value.user.sophistication === 'new' && <p className="scaf-note">Start with a project and its source documents. You can ask AnA to explain pathways before choosing one.</p>}
    {value.user.sophistication === 'experienced' && <p className="scaf-note">Capture the target markets and filing pathways below so your organization's defaults reflect your work.</p>}
    <ListInput id="ob-therapeutic-areas" label="Therapeutic areas or clinical domains" values={value.company.therapeuticAreas}
      onChange={(therapeuticAreas) => company({ therapeuticAreas })} hint="e.g. Oncology, cardiology; leave blank if not applicable." />
    <div className="ob-discovery-grid">
      <ListInput id="ob-markets" label="Target markets" values={value.company.markets} onChange={(markets) => company({ markets })}
        hint="e.g. US, EU, UK; leave blank if undecided." />
      <ListInput id="ob-pathways" label="Planned regulatory pathways" values={value.company.pathways} onChange={(pathways) => company({ pathways })}
        hint="e.g. IND, 510(k), CTA; these are your plans, not a regulatory determination." />
    </div>
    <button className="sp-ask" onClick={() => onAsk('Help me clarify my onboarding goals and regulatory experience. Ask discovery questions one at a time; do not infer answers or save anything without my review.')}>{I.sparkles} Help me think this through</button>
  </div>;

  const isDevice = value.project.productType === 'device';
  const isIvd = value.project.productType === 'ivd';
  return <div className="ob-discovery">
    <h2 className="ob-discovery-title">Tell us about your first project</h2>
    <p className="scaf-note">Capture what you know now. Unknown fields can stay blank. These are planning notes; a project is created separately after activation.</p>
    <div className="ob-discovery-grid">
      <div className="ob-discovery-field"><label htmlFor="ob-project-name">Planned project name</label>
        <input id="ob-project-name" className="ob-in" maxLength={120} value={value.project.name} onChange={(e) => project({ name: e.target.value })} /></div>
      <div className="ob-discovery-field"><label htmlFor="ob-product-type">Product context</label>
        <select id="ob-product-type" className="ob-in" value={value.project.productType} onChange={(e) => project({
          productType: e.target.value as OnboardingDiscovery['project']['productType'],
          predicateDevice: e.target.value === 'device' ? value.project.predicateDevice : '',
          assayContext: e.target.value === 'ivd' ? value.project.assayContext : '',
        })}><option value="not_stated">Not decided / no product yet</option><option value="drug">Small-molecule drug</option>
          <option value="biologic">Biologic</option><option value="device">Medical device</option><option value="ivd">IVD / diagnostic</option></select></div>
    </div>
    {text('ob-project-goals', 'Project goal and intended outcome', value.project.goals, (goals) => project({ goals }))}
    {text('ob-indication', isDevice ? 'Intended use and target population' : isIvd ? 'Intended diagnostic use and population' : 'Indication and target population', value.project.indication, (indication) => project({ indication }), { max: 500 })}
    <div className="ob-discovery-grid">
      <div className="ob-discovery-field"><label htmlFor="ob-lifecycle">Current stage of work</label>
        <input id="ob-lifecycle" className="ob-in" maxLength={120} value={value.project.lifecycleStage} placeholder={isDevice || isIvd ? 'e.g. Design, verification, clinical evidence' : 'e.g. Discovery, preclinical, Phase 1'}
          onChange={(e) => project({ lifecycleStage: e.target.value })} /></div>
      <div className="ob-discovery-field"><label htmlFor="ob-target-date">Target milestone date</label>
        <input id="ob-target-date" className="ob-in" type="date" value={value.project.targetDate} onChange={(e) => project({ targetDate: e.target.value })} /></div>
    </div>
    {isDevice && text('ob-predicate', 'Predicate strategy or comparator device', value.project.predicateDevice, (predicateDevice) => project({ predicateDevice }), { max: 500 })}
    {isIvd && text('ob-assay', 'Assay, specimen and comparator context', value.project.assayContext, (assayContext) => project({ assayContext }), { max: 500 })}
    <fieldset className="ob-discovery-choices"><legend>Which setup tasks do you need help with?</legend>
      {SETUP_NEEDS.map(([key, label]) => <label key={key}><input type="checkbox" checked={value.setup.needs.includes(key)}
        onChange={(e) => setup({ needs: e.target.checked ? [...value.setup.needs, key] : value.setup.needs.filter((v) => v !== key) })} />{label}</label>)}
    </fieldset>
    <div className="ob-discovery-field"><label htmlFor="ob-approval-rigor">Preferred review process</label>
      <select id="ob-approval-rigor" className="ob-in" value={value.setup.approvalRigor ?? ''}
        onChange={(e) => setup({ approvalRigor: (e.target.value || null) as OnboardingDiscovery['setup']['approvalRigor'] })}>
        <option value="">Decide later</option><option value="single_reviewer">Single reviewer</option>
        <option value="regulated_dual_review">Dual review</option><option value="qa_lock">Quality review and lock</option>
        <option value="signoff_required">Formal sign-off</option>
      </select><span className="ob-discovery-hint">Records an industry-profile preference. Document approval and signing rules remain governed by their workflows.</span></div>
  </div>;
}
