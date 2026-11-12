import type { HelpArticle } from '../types';

/** Administration: members, access levels, sign-in and security settings. Written from the admin screens' code, 2026-11-12. */
export const ADMINISTRATION_ARTICLES: readonly HelpArticle[] = [
  {
    slug: 'invite-members',
    title: 'Invite people to your organisation',
    collection: 'administration',
    summary: 'An administrator invites a person by name, e-mail and access level; the person sets a password or accepts the invitation.',
    keywords: ['invite', 'add user', 'new member', 'colleague', 'setup link', 'seat', 'accept invitation', 'onboard'],
    surfaces: ['admin-console'],
    related: ['access-levels-and-roles', 'change-a-role-or-remove-a-member', 'set-up-your-organisation'],
    checked: '2026-11-12',
    body: `Inviting is done by an administrator, from **Admin** in the account menu (your name, at the bottom of the left sidebar). The screen is titled Admin and access.

**Invite a person**

1. On the **Members** tab, select **Invite member**.
2. Enter the **Full name** and **Email**, and choose the **Role**: Admin, Approver, Manager, Reviewer, Member or Viewer.
3. Add a **Job title** and **Department** if you wish.
4. Select **Send invite**.

Creating a member uses a licensed seat and is recorded in the audit trail with your name.

**What happens next** is shown under **Invitation handover**, for each person:

- **Email sent**: an invitation with a password setup link was sent. The person sets a password before signing in.
- **Share setup link**: no e-mail was sent. Copy the link shown and give it to the person privately. The link is shown only in this handover.
- **Awaiting consent**: the person already has a Concept2Cure account and must accept before they become a member.
- **Member added**: an existing account was added at once.
- **Invitation refused**: nothing was recorded; the reason is shown.

Until a person has set a password they are listed as **invited**. To replace a lost link, select the person and choose **Issue a new setup link**; the previous link stops working.

**Accepting an invitation**

- A new person opens the setup link, chooses a password, and signs in.
- A person who already has an account opens **Account** in the account menu and, under **Invitations**, selects **Accept invitation** or **Decline**. Their current session stays in the organisation it is in.`,
  },
  {
    slug: 'access-levels-and-roles',
    title: 'Access levels: what each role can do',
    collection: 'administration',
    summary: 'Six access levels decide what a member can do and whether they can sign; job title and reporting role do not change access.',
    keywords: ['role', 'roles', 'permissions', 'admin', 'approver', 'manager', 'reviewer', 'member', 'viewer', 'scopes', 'job role', 'reporting role', 'who can sign'],
    surfaces: ['admin-console'],
    related: ['change-a-role-or-remove-a-member', 'invite-members', 'you-cannot-sign'],
    checked: '2026-11-12',
    body: `Every member of an organisation holds one access level, called their role. An administrator chooses it when inviting the person and can change it later.

- **Admin**: administers the organisation (members, roles, settings, API keys) and may do everything a manager may. Signs electronic records.
- **Approver**: everything a manager may, and signs.
- **Manager**: manages every project, writes governed records and reads the audit trail. Does not sign.
- **Reviewer**: everything a member may, and signs.
- **Member**: writes governed records and creates projects. Does not sign.
- **Viewer**: reads only; writes nothing.

Only an admin, an approver or a reviewer can sign. An author cannot approve their own document, whatever their role.

**See the roles in use.** In **Admin**, the **Roles + scopes** tab shows each role with the number of members who hold it and its scopes. Scopes follow from the checks that enforce the role; they are not edited there.

**Job title and reporting role are not access.** The **Job title** and **Department** entered on an invitation describe the person. The **Reporting role** each person chooses in **Account** selects the reports offered to them; saving it leaves their access role unchanged.

**Other designations**

- **QMS approver**: on the Members tab, select a person and choose **Designate as QMS approver**, with a reason. While nobody is designated, members with the Approver role stand in.
- **Project access** is granted on each project, not here. See the article on sharing a project.`,
  },
  {
    slug: 'change-a-role-or-remove-a-member',
    title: "Change a member's role, or remove a member",
    collection: 'administration',
    summary: 'Both are done from the member’s panel on the Members tab, under a reason recorded in the audit trail.',
    keywords: ['change role', 'promote', 'demote', 'remove user', 'offboard', 'deactivate', 'leaver', 'revoke access'],
    surfaces: ['admin-console', 'audit-trail'],
    related: ['access-levels-and-roles', 'invite-members', 'read-the-audit-trail'],
    checked: '2026-11-12',
    body: `Open **Admin** from the account menu and stay on the **Members** tab. The list can be filtered to **All**, **Active**, **Invited** or **Disabled**. Select a person to open their panel: role, state, how they sign in, their second factor, when they were last seen, their role's scopes and their project access.

**Change a role**

1. Select **Change role**.
2. Choose the **New role**.
3. Enter the **Reason for the change**.
4. Select **Change role**.

The new role applies from the person's next request. The audit trail records the role before and after, your reason and your name.

**Remove a member**

1. Select **Remove from organization**.
2. Enter the **Reason for removal**.
3. Select **Remove member**.

The person loses access to the organisation at their next request and cannot sign in to it. Their account and everything they recorded are kept.

**Your own row.** You cannot change your own role or remove yourself; another administrator does that.

**See what a person did.** Select **Audit activity** in their panel to open the audit trail searched for that person.`,
  },
  {
    slug: 'record-company-details',
    title: "Record your company's details",
    collection: 'administration',
    summary: 'Company identity, letterhead and the organisation’s name are kept on the Settings tab of Admin and saved with a reason.',
    keywords: ['company name', 'legal name', 'address', 'contact', 'logo', 'letterhead', 'branding', 'organisation profile', 'client type'],
    surfaces: ['admin-console'],
    related: ['set-up-your-organisation', 'invite-members', 'session-policy-and-review-rules'],
    checked: '2026-11-12',
    body: `Open **Admin** from the account menu and select the **Settings** tab. Each card reads one setting and changes it under a reason that is written to the audit trail.

**Company identity (used on documents)**

1. Go to the card **Company identity, letterhead & legal documents** and select **Company identity**.
2. Enter the **Company legal name**, **Company address**, **Company contact details** (e-mail, telephone and website) and **Registration and legal details**.
3. Add a **Company logo** if you have one: PNG, JPEG or GIF, up to 2 MB.
4. Enter a **Reason for company document change** and select **Save company documents**.

These details are separate from the organisation's account and billing name. Only an organisation owner, an administrator or an assigned company-document custodian can change them. If your organisation requires independent review of identity changes, the card says so and the change is staged for another person to review.

The **Letterhead designer** on the same card sets the header, footer, fonts and page, and can import an existing Word or PDF letterhead. **Download unsaved Word proof** shows the layout before you save.

**Organisation name and client type**

On the card **Profile & client type**, change the **Organization name** (shown in the audit trail, signature manifests and export footers) or the client type, enter a **Reason for change**, and select **Save to organization**.`,
  },
  {
    slug: 'set-up-single-sign-on',
    title: 'Single sign-on and provisioning',
    collection: 'administration',
    summary: 'The SSO + provisioning tab shows what is configured; Concept2Cure sets up the identity provider and SCIM for your organisation.',
    keywords: ['sso', 'saml', 'oidc', 'scim', 'identity provider', 'idp', 'okta', 'entra', 'azure ad', 'provisioning', 'directory'],
    surfaces: ['admin-console'],
    related: ['sign-in-and-sign-out', 'set-up-an-authenticator-app', 'session-policy-and-review-rules'],
    checked: '2026-11-12',
    body: `Open **Admin** from the account menu and select the **SSO + provisioning** tab.

**What the tab shows**

- **The identity provider**: its kind (SAML/OIDC), its status, your organisation's domain and the number of users. When none is set up it reads "Not configured".
- **Local users**: people who sign in with an e-mail and password.
- **SCIM**: whether provisioning from your directory is enabled.

On the **Members** tab, the **SSO** column shows for each person whether they sign in through single sign-on or locally.

**Setting it up or changing it**

Single sign-on and SCIM provisioning are set up for your organisation by Concept2Cure. To add or change an identity provider, a provisioning token or the allowed addresses, ask your Concept2Cure contact. The tab says this under **Identity console**.

**Signing in with single sign-on**

On the sign-in page, a person selects **Use organization SSO** and enters the organisation identifier you give them.

**If the tab cannot be read**

The tab shows "Couldn't load SSO and provisioning" with **Try again**. That is a failed read; it does not mean single sign-on is off.`,
  },
  {
    slug: 'set-up-an-authenticator-app',
    title: 'Second factor at sign-in: set up an authenticator app',
    collection: 'administration',
    summary: 'Sign-in asks for a second factor; each person can replace the emailed code with an authenticator app from Account.',
    keywords: ['mfa', '2fa', 'two-factor', 'multi-factor', 'totp', 'authenticator', 'recovery codes', 'verification code', 'second factor'],
    surfaces: ['admin-console'],
    related: ['sign-in-and-sign-out', 'session-policy-and-review-rules', 'you-cannot-sign'],
    checked: '2026-11-12',
    body: `Password sign-in asks for a second factor: a code from the authenticator app when one is set up, otherwise a code sent to the person's e-mail. This is a fact about the product; no organisation setting turns it off.

**Set up an authenticator app (each person, for their own account)**

1. Open the account menu (your name) and select **Account**.
2. Under **Authenticator app**, select **Set up authenticator app**.
3. Scan the QR code with the app, or enter the **Key** by hand.
4. Enter the 6-digit **Code from the app** and select **Confirm**.

Nothing is switched on until a code from the app is confirmed. When it is, your **Recovery codes** are shown; keep them somewhere safe. A recovery code can be entered at sign-in in place of the app's code.

From then on, sign-in and electronic signatures ask for a code from the app.

**Remove it**

Select **Remove authenticator** and enter the current code from the app. A recovery code is not accepted for removal. If your account needs the app to sign, the panel says "Removing it stops you signing".

**What an administrator sees**

In **Admin**, the **Authenticator app** figure counts the members who have set one up. On the **Members** tab the **MFA** column reads "app" or "email" for each person, and a person's panel shows their **Second factor**. An administrator cannot set up the app for someone else.`,
  },
  {
    slug: 'session-policy-and-review-rules',
    title: 'Set the session policy and the review rules',
    collection: 'administration',
    summary: 'Idle sign-out, concurrent sessions and the number of independent reviewers are set on the Settings tab, each with a reason.',
    keywords: ['session timeout', 'idle', 'auto logout', 'concurrent sessions', 'security settings', 'reviewers', 'self-approval', 'approval rules', 'signature rules'],
    surfaces: ['admin-console'],
    related: ['you-are-signed-out', 'you-cannot-sign', 'access-levels-and-roles'],
    checked: '2026-11-12',
    body: `Open **Admin** from the account menu and select the **Settings** tab.

**Session policy**

1. **Idle sign-out**: 1 to 1,440 minutes. It applies to new sign-ins.
2. **Concurrent sessions**: 1 to 20 per account. A new sign-in beyond the limit closes the oldest session.
3. Enter a **Reason for the change** (at least 3 characters).
4. Select **Save session policy**.

The idle window applies at the next sign-in; sessions already open keep the window they started with. **Absolute lifetime** is 12 hours for every session. It is enforced by the platform and cannot be changed.

Where your organisation has not set a value, the card shows the platform default.

**Review and approval**

A document is always reviewed before it is approved. This card sets how.

1. **Independent reviewers**: how many people must review a version before it can be approved, from 1 to 5. A reviewer is never an author or the approver.
2. **One-person organization**: tick **Allow self-approval** to let a sole member approve and lock their own document. Each such act is recorded as having no independent review, and the allowance stops applying when a second member joins.
3. Enter a **Reason for the change** and select **Save review rules**.

The rules apply to every approval from then on. Approvals already recorded stand.

**Other cards on this tab** include agency gateway accounts, the retention period, legal holds, the connector for Claude and the validation package. Each is changed on its own card, under its own reason.`,
  },
  {
    slug: 'share-a-project',
    title: 'Share a project with a colleague',
    collection: 'administration',
    summary: 'Project sharing, opened from the Team card on the project page, gives a member Use or Edit on that project.',
    keywords: ['project access', 'share', 'team', 'grant', 'use', 'edit', 'revoke', 'private project', 'permissions'],
    surfaces: ['project-home', 'admin-console'],
    related: ['access-levels-and-roles', 'assign-work', 'the-six-steps-of-a-project'],
    checked: '2026-11-12',
    body: `Access to a project is granted on the project itself. Open the project, find the **Team** card on its page and select **Manage**. **Project sharing** is in the panel that opens.

The section first says how the project is seen: an organisation-visible project may be open to organisation members without an explicit share; a private project follows its recorded sharing and your organisation's policy.

**Share the project**

1. Choose the **Organization member**.
2. Choose the **New sharing role**: **Use** or **Edit**.
3. Select **Grant sharing**.

**Change or withdraw a share**

- Change the role beside a person's name and select **Save role**.
- Select **Revoke explicit share**, then **Confirm revoke share**.

After a share is revoked, the project's owner and creator, organisation management and organisation-visible access may still apply. Task and review assignments stay recorded.

**What sharing does not do.** Sharing applies to specific project actions. Approving and signing remain separate and follow the person's access level.

**Where an administrator sees it.** In **Admin**, a member's panel lists their **Project access**. It is read-only there.

If the section shows "Couldn't load project sharing", select **Retry sharing**. **Refresh sharing** re-reads the list at any time.`,
  },
  {
    slug: 'answer-access-requests',
    title: 'Answer a request for a locked feature',
    collection: 'administration',
    summary: 'Members ask for a feature they cannot open; administrators approve or decline each request with a reason.',
    keywords: ['access request', 'module', 'unlock', 'approve access', 'decline', 'locked feature', 'entitlement', 'queue'],
    surfaces: ['access-requests', 'apps'],
    related: ['a-screen-shows-a-lock', 'access-levels-and-roles'],
    checked: '2026-11-12',
    body: `When a member opens a feature their organisation's subscription does not include, or one that is turned off, the lock panel lets them **Ask an administrator**, with an optional note on why they need it. The request arrives in **Access requests**, in the account menu of every administrator.

**Answer a request**

1. Open **Access requests**. Each row shows who asked, the feature, when they asked and the answer so far.
2. Select **Approve** or **Decline** on the row.
3. Give a reason (at least 3 characters). It is stored with the decision and written to the audit trail.
4. Confirm.

An approval shows as granted only after the server has granted it; the page then says the feature is available to the workspace. If someone else answered the request first, the list is re-read and shows their answer.

**Filter the list.** The list shows requests that are **Waiting**, or **Everything** including those already answered.

**Reading an empty list.** "No requests waiting" means nobody is waiting. If the list could not be read, the page says "Could not load access requests" with **Try again**; that is a failed read, and requests may still be waiting.

**What a request cannot change.** A feature marked "Not in this release" is not enabled by any request, setting or subscription.

Features can also be turned on and off for the organisation in **Subscription & features**.`,
  },
];
