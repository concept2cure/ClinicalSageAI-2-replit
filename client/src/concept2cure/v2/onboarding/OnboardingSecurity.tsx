import React, { useRef, useState } from 'react';
import { AccountPanel } from '../AccountPanel';
import { useAuthUser } from '@/services/portal/authService';
import { SessionPolicySetting } from './SessionPolicySetting';

/** Onboarding hands off to the canonical account and governed admin screens. */
export function OnboardingSecurity({ onNav }: { onNav: (id: string) => void }) {
  const [accountOpen, setAccountOpen] = useState(false);
  const accountButton = useRef<HTMLButtonElement>(null);
  const user = useAuthUser();
  const admin = user?.roles?.some((role) => ['admin', 'owner', 'super_admin', 'platform_admin', 'business_admin'].includes(String(role).toLowerCase())) ?? false;
  const closeAccount = () => {
    setAccountOpen(false);
    accountButton.current?.focus();
  };
  return (
    <section className="ob-review" aria-label="Security and administration setup">
      <h2 className="pj-seclbl">Secure your account and workspace</h2>
      <p className="scaf-note">Sign-in asks for an emailed code, or an authenticator code on an account that has one. Open Account to review your profile, manage your password and enroll an authenticator app.</p>
      <button ref={accountButton} type="button" className="btn ghost" onClick={() => setAccountOpen(true)}>Open Account and authenticator setup</button>
      <div className="ob-rev-row"><span className="k">Team access</span><span className="v">Choose the least access each person needs</span></div>
      <p className="scaf-note">Administrators manage invitations and membership. Approvers and reviewers can sign governed work; an author cannot approve their own document.</p>
      {admin ? (
        <>
          <SessionPolicySetting />
          <button type="button" className="btn ghost" onClick={() => onNav('admin-console')}>Open Members and roles</button>
          <div className="ob-rev-row"><span className="k">Organization policy</span><span className="v">Review before the team starts</span></div>
          <p className="scaf-note">Review your organization profile, translation policy and agency gateway accounts in Setup. The Identity console shows deployment information for SSO and directory provisioning; your deployment administrator configures those services.</p>
          <button type="button" className="btn ghost" onClick={() => onNav('setup')}>Open organization Setup</button>
          <button type="button" className="btn ghost" onClick={() => onNav('identity-console')}>Open Identity console</button>
        </>
      ) : <p className="scaf-note">Ask an organization administrator to review team roles, organization policy, SSO and directory provisioning.</p>}
      <p className="scaf-note">These links open the actual setup flows. Completing this wizard does not claim those security controls have been configured.</p>
      {accountOpen && <AccountPanel onClose={closeAccount} />}
    </section>
  );
}
