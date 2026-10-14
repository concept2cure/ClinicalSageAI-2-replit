import React from 'react';
import type { OnboardingDiscovery } from '@shared/types/onboarding-discovery';
import '../styles/onboarding-discovery.css';

export function DiscoveryReview({ value }: { value: OnboardingDiscovery }) {
  const rows = [
    ['Company goals', value.company.goals],
    ['Workspace uses', value.company.useCases.map((v) => ({ projects: 'Projects', vault: 'Vault', authoring: 'Authoring', submission_center: 'Submission Center', submission_readiness: 'Submission Readiness', qms: 'Quality documents', reporting: 'Reporting', cmc: 'CMC / Module 3' })[v]).join(', ')],
    ['Working role', value.user.workingRole],
    ['Experience', ({ new: 'New to regulatory work', developing: 'Building experience', experienced: 'Experienced practitioner', not_stated: 'Not stated' })[value.user.sophistication]],
    ['Guidance', ({ step_by_step: 'Step by step', contextual: 'Context and options', concise: 'Concise', not_stated: 'Not stated' })[value.user.preferredGuidance]],
    ['Therapeutic areas', value.company.therapeuticAreas.join(', ')],
    ['Target markets', value.company.markets.join(', ')],
    ['Planned pathways', value.company.pathways.join(', ')],
    ['First project', value.project.name],
    ['Project goals', value.project.goals],
    ['Product context', value.project.productType === 'not_stated' ? 'Not stated' : value.project.productType],
    ['Indication / intended use', value.project.indication],
    ['Current stage', value.project.lifecycleStage],
    ['Target milestone', value.project.targetDate],
    ...(value.project.productType === 'device' ? [['Predicate strategy', value.project.predicateDevice]] : []),
    ...(value.project.productType === 'ivd' ? [['Assay and comparator', value.project.assayContext]] : []),
    ['Team size estimate', value.setup.teamSize === null ? '' : String(value.setup.teamSize)],
    ['Setup help', value.setup.needs.map((v) => ({ invite_team: 'Team invitations', review_roles: 'Review roles', mfa: 'Authenticator', session_policy: 'Session policy', sso_scim: 'SSO and provisioning', agency_accounts: 'Agency accounts', translation: 'Translation' })[v]).join(', ')],
    ['Review preference', value.setup.approvalRigor?.replace(/_/g, ' ') ?? ''],
  ];
  return <div className="ob-discovery-summary" aria-label="Discovery review">
    <h2 className="ob-discovery-title">Your discovery context</h2>
    <p className="scaf-note">These are your stated plans and preferences. Project creation, permissions and security changes are completed through their own setup flows.</p>
    {rows.map(([label, content]) => <div className="ob-rev-row" key={label}><span className="k">{label}</span><span className="v">{content || 'Not stated'}</span></div>)}
  </div>;
}
