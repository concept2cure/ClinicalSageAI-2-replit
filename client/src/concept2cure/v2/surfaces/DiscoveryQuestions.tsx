import React from 'react';
import {
  DISCOVERY_OPTIONS,
  DISCOVERY_FIELD_LABELS,
  requiredDiscoveryFields,
  type OnboardingDiscoveryAnswers,
} from '@shared/types/onboarding-discovery';
import type { useOnboardingDiscovery } from '../useOnboardingDiscovery';
import '../styles/discovery-onboarding.css';

export const DISCOVERY_CONTEXT_FIELDS: Array<keyof OnboardingDiscoveryAnswers> = [
  'role', 'regulatoryExperience', 'businessContext', 'companyStage', 'companyGoal',
  'teamSize', 'collaborationModel', 'supportPreference', 'serviceScope',
];
export const DISCOVERY_PROJECT_FIELDS: Array<keyof OnboardingDiscoveryAnswers> = [
  'productModalities', 'developmentStage', 'projectName', 'projectGoal',
  'therapeuticAreas', 'indication', 'devicePurpose', 'firstDeliverable',
  'targetMarkets', 'targetDate', 'workflowNeeds', 'dataReadiness',
  'existingSystems', 'successCriteria', 'constraints',
];

type Discovery = ReturnType<typeof useOnboardingDiscovery>;
type Field = keyof OnboardingDiscoveryAnswers;
type Option = { value: string; label: string };

/** Uses the existing wizard fields, cards and token palette. Answers are client context, not regulatory findings. */
function discoveryFields(d: Discovery) {
  const required = requiredDiscoveryFields(d.answers);
  const disabled = d.loading || d.busy || !d.canEdit || Boolean(d.error);
  const label = (key: Field) => DISCOVERY_FIELD_LABELS[key];
  const fieldLabel = (key: Field) => `${label(key)}${required.includes(key) ? ' *' : ''}`;
  const optionsFor = (key: keyof typeof DISCOVERY_OPTIONS): readonly Option[] => DISCOVERY_OPTIONS[key];

  const select = (key: keyof typeof DISCOVERY_OPTIONS & Field, hint?: string) => (
    <div className="npw-field" key={key}>
      <label className="npw-field-l" htmlFor={`discovery-${key}`}>{fieldLabel(key)}</label>
      <select
        id={`discovery-${key}`} className="ob-in" value={String(d.answers[key])}
        disabled={disabled} aria-required={required.includes(key)}
        onChange={(e) => d.setAnswer(key, e.target.value as OnboardingDiscoveryAnswers[typeof key])}
        aria-describedby={hint ? `discovery-${key}-hint` : undefined}
      >
        <option value="">Choose an answer</option>
        {optionsFor(key).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      {hint && <div className="npw-field-help" id={`discovery-${key}-hint`}>{hint}</div>}
    </div>
  );
  const text = (key: Field, hint: string, multiline = true) => (
    <div className="npw-field npw-field-wide" key={key}>
      <label className="npw-field-l" htmlFor={`discovery-${key}`}>{fieldLabel(key)}</label>
      {multiline ? (
        <textarea
          id={`discovery-${key}`} className="ob-in" rows={3} value={String(d.answers[key])}
          disabled={disabled} maxLength={2000}
          aria-required={required.includes(key)} aria-describedby={`discovery-${key}-hint`}
          onChange={(e) => d.setAnswer(key, e.target.value as OnboardingDiscoveryAnswers[typeof key])}
        />
      ) : (
        <input
          id={`discovery-${key}`} className="ob-in" value={String(d.answers[key])}
          type={key === 'targetDate' ? 'date' : 'text'} disabled={disabled}
          maxLength={key === 'projectName' ? 120 : 1000} aria-required={required.includes(key)}
          aria-describedby={`discovery-${key}-hint`}
          onChange={(e) => d.setAnswer(key, e.target.value as OnboardingDiscoveryAnswers[typeof key])}
        />
      )}
      <div className="npw-field-help" id={`discovery-${key}-hint`}>{hint}</div>
    </div>
  );
  const choices = (key: keyof typeof DISCOVERY_OPTIONS & Field, hint: string) => (
    <fieldset className="npw-flags npw-field-wide ob-discovery-choices" key={key} disabled={disabled}>
      <legend className="npw-field-l">{fieldLabel(key)}</legend>
      <p className="npw-field-help">{hint}</p>
      <div className="npw-flag-grid">
        {optionsFor(key).map((o) => {
          const selected = d.answers[key] as string[];
          return (
            <label className="npw-flag" key={o.value}>
              <input type="checkbox" checked={selected.includes(o.value)}
                onChange={(e) => d.setAnswer(key, (e.target.checked ? [...selected, o.value] : selected.filter((v) => v !== o.value)) as OnboardingDiscoveryAnswers[typeof key])} />
              <span className="npw-flag-l">{o.label}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
  return { select, text, choices, fieldLabel, disabled };
}

export function DiscoveryQuestions({ discovery: d, section }: { discovery: Discovery; section: 'context' | 'project' | 'security' }) {
  const { select, text, choices, fieldLabel, disabled } = discoveryFields(d);
  const isDrug = d.answers.productModalities.some((v) => ['small_molecule', 'biologic', 'cell_gene', 'combination'].includes(v));
  const isDevice = d.answers.productModalities.some((v) => ['medical_device', 'diagnostic', 'software', 'combination'].includes(v));

  return (
    <div className="ob-discovery" data-testid={`discovery-${section}`}>
      <div className="pj-seclbl">
        {section === 'context' ? 'Your company and working context' : section === 'project' ? 'Your first project and desired outcome' : 'Security requirements'}
      </div>
      <p className="scaf-note">
        {section === 'context'
          ? 'Tell us who you are setting up the workspace for and what they need. These answers are shared with your organization. Required questions are marked *.'
          : section === 'project'
            ? 'Questions adapt to your product and role. Use project-level context; leave patient identifiers, credentials and confidential records in the appropriate controlled systems.'
            : 'Record the controls your organization needs. Selecting a requirement does not configure or certify that control.'}
      </p>
      <div className="npw-grid">
        {section === 'context' && <>
          {select('role', 'Your role in this onboarding discovery; your reporting persona is a separate personal setting in Account.')}
          {select('regulatoryExperience', 'This determines the level of guidance in your next steps.')}
          {select('businessContext')}
          {select('companyStage')}
          {text('companyGoal', 'What should your company achieve with this workspace, and why now?')}
          {select('teamSize')}
          {select('collaborationModel')}
          {select('supportPreference')}
          {d.answers.businessContext === 'service_provider' && choices('serviceScope', 'Which services do you deliver to clients?')}
        </>}
        {section === 'project' && <>
          {text('projectName', 'A working name for the project. A project is created separately after setup.', false)}
          {choices('productModalities', 'Select all product types in scope. Combination products ask both medicine and device questions.')}
          {select('developmentStage')}
          {select('firstDeliverable')}
          {text('projectGoal', 'What decision, milestone or deliverable should this project support?')}
          {isDrug && <>
            <div className="npw-field npw-field-wide">
              <label className="npw-field-l" htmlFor="discovery-therapeuticAreas">{fieldLabel('therapeuticAreas')}</label>
              <input id="discovery-therapeuticAreas" className="ob-in" disabled={disabled}
                value={d.answers.therapeuticAreas.join(', ')} maxLength={2000} aria-required
                aria-describedby="discovery-therapeuticAreas-hint"
                onChange={(e) => d.setAnswer('therapeuticAreas', e.target.value.split(',').map((v) => v.trimStart()))} />
              <div id="discovery-therapeuticAreas-hint" className="npw-field-help">Separate areas with commas, for example oncology, immunology. This records your focus, not a clinical conclusion.</div>
            </div>
            {text('indication', 'Which indication, population and unmet need are you addressing?')}
          </>}
          {isDevice && text('devicePurpose', 'What is the intended use, intended user, setting of use and current classification knowledge?')}
          {choices('targetMarkets', 'Which jurisdictions matter for this project? These answers do not determine a legal pathway.')}
          {text('targetDate', 'Optional target milestone date.', false)}
          {choices('workflowNeeds', 'Choose the work you need first. Availability remains subject to your plan and launch scope.')}
          {select('dataReadiness')}
          {text('existingSystems', 'Optional: which repositories, systems or document formats will you bring? Do not enter credentials.')}
          {text('successCriteria', 'How will you judge success? Include the outcome and how your team will review it.')}
          {text('constraints', 'Optional: describe timelines, budget, evidence gaps, language or team constraints.')}
        </>}
        {section === 'security' && choices('securityNeeds', 'Record identity, access and data governance needs for the administrator to review.')}
      </div>
    </div>
  );
}
