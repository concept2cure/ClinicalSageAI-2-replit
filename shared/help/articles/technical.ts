import type { HelpArticle } from '../types';

/** Technical reference for administrators, IT and QA. Written from the code and the published policy text, 2026-11-12. */
export const TECHNICAL_ARTICLES: readonly HelpArticle[] = [
  {
    slug: 'how-your-data-is-handled',
    title: "How your organisation's data is handled",
    collection: 'technical',
    summary: 'Records are kept per organisation; AI processing serves your work and, by default, is not used to improve models.',
    keywords: ['privacy', 'security', 'tenant isolation', 'encryption', 'model training', 'ai data use', 'anthropic', 'gdpr', 'data residency', 'sub-processor'],
    surfaces: ['admin-console'],
    related: ['read-the-audit-trail', 'part-11-records-and-signatures', 'export-your-organisations-records'],
    checked: '2026-11-12',
    body: `This article states what the product does and what the Privacy Policy you accept at sign-up says. Your agreement with Concept2Cure governs where the two differ.

**Separation between organisations**

Every record belongs to one organisation. Each request runs in the signed-in person's organisation, and the separation is enforced in the database, row by row, as well as in the application.

**Where documents are kept**

Documents live in the **Vault** of the project they belong to. Files added to a project's data room are read on upload and become sources that drafts can be traced to.

**AI processing**

- Your content is processed by AI to provide the service.
- By default it is not used to improve AI models, and no content is retained for model improvement. Contributing de-identified patterns is an opt-in.
- AI processing by Anthropic's Claude is under terms that prevent Anthropic from using your content to train its models.
- Numbers, verdicts and compliance results come from deterministic engines. The model drafts and explains.

Administrators govern AI data use on the **Settings** tab of **Admin**, on the card **AI data use and reviewed derivatives**. When no placement policy is recorded, the card says the deployment defaults apply.

**What the Privacy Policy states**

- Data is encrypted at rest (AES-256) and in transit (TLS 1.3).
- Data is never sold. It is shared only with service providers under data processing agreements, your organisation's administrators, and regulatory authorities when the law requires.
- You have the right to access, rectify, delete, port and restrict processing of your data.
- Audit logs are retained for 7 years.`,
  },
  {
    slug: 'read-the-audit-trail',
    title: 'Read, search and export the audit trail',
    collection: 'technical',
    summary: 'The audit trail lists governed actions as hash-chained, append-only entries, and exports them as a signed bundle.',
    keywords: ['audit log', 'audit trail', 'history', 'hash chain', 'sha-256', 'export', 'inspection', 'who did what', '11.10(e)'],
    surfaces: ['audit-trail', 'admin-console', 'compliance-reports'],
    related: ['part-11-records-and-signatures', 'export-your-organisations-records', 'change-a-role-or-remove-a-member'],
    checked: '2026-11-12',
    body: `The audit trail is the organisation's record of governed actions: authoring, review, submission, Vault locks and electronic signatures. Entries are appended as the actions happen. Each entry carries a SHA-256 hash and the hash of the entry before it, so a changed or removed entry breaks the chain.

**Open it.** In **Admin**, select **Open the audit trail**. The foot of the Admin screen also shows the most recent administrative entries.

**What an entry records**

The list shows the entry's ID, when it happened, the actor, the event, the target, and whether it was signed. Select an entry for its detail: the record it concerns, the kind of event, the origin IP address, the **Reason for change** where one was given, the **Signature meaning** where it was signed, and the **Entry hash** and **Previous hash**.

**Find entries**

- **Search entries** matches the actor, event, target or entry ID.
- The filters narrow the list by kind, for example **E-sign**, **Authoring**, **Review** and **Submission**.
- **Hash chain** shows the entries as a chain.

**The chain's verdict.** The screen states whether the chain was verified on this read: "Hash chain intact", "Chain verification failed" or "Chain not verified". When it is not verified, the reason is given.

**Export.** **Export signed bundle** downloads the entries with a manifest and a signature, so the export can be checked independently. Exporting needs an administrator's session.

**Compliance reports** opens the reports drawn from the same records, each sealed and recorded on the audit trail when run.

**If it cannot be read.** The screen shows "Couldn't load the audit trail". The trail is never shown as empty when it could not be read. "No audit entries yet" appears only when the read succeeded and there are none.`,
  },
  {
    slug: 'part-11-records-and-signatures',
    title: '21 CFR Part 11: governed actions, signatures and versions',
    collection: 'technical',
    summary: 'What the product records when a governed record changes, and what an electronic signature asks for and binds.',
    keywords: ['part 11', '21 cfr 11', 'e-signature', 'electronic signature', 'reason for change', 'gxp', 'validation', 'gamp 5', 'csv', 'retention', 'separation of duties'],
    surfaces: ['audit-trail', 'admin-console'],
    related: ['read-the-audit-trail', 'you-cannot-sign', 'session-policy-and-review-rules'],
    checked: '2026-11-12',
    body: `This article describes the product's controls. Whether your use meets Part 11 also depends on your own procedures and validation.

**Governed actions**

A change to a governed record waits for a person. The person gives a **Reason for change**, which is recorded in the audit trail, and confirms. AnA can propose such a change in a conversation; it runs only when the person confirms it there.

**Electronic signatures**

Where a signature is required, the person:

1. chooses the **Meaning of signature**: Authorship, Review, Approval or Release;
2. enters their **Password**, and their **Authentication code** if an authenticator app is set up;
3. selects **Sign and run**.

Credentials are verified at the moment of signing and are not reused from the session. The audit entry shows the signature's meaning.

**Who can sign**

Only members whose access level is Admin, Approver or Reviewer can sign. An author cannot approve their own document. The person who created a submission sequence cannot sign its freeze or dispatch. The number of independent reviewers an approval needs is an organisation setting.

**The audit trail** is append-only and hash-chained, and states whether its chain verified.

**Access controls**

Sign-in asks for a second factor. Idle sign-out and concurrent sessions are set per organisation; every session ends after 12 hours.

**Retention**

The **Retention period** card (Admin, Settings) sets how long the Vault keeps a governed record. Shortening it needs the rule that permits it and a reason. A legal hold always prevents deletion.

**Validation documents**

The **GAMP 5 validation package** card on the same tab lists the validation master plan and the documents under it, each with the status its own header records. Every download is recorded in the audit trail.`,
  },
  {
    slug: 'create-and-revoke-api-keys',
    title: 'Create, review and revoke API keys',
    collection: 'technical',
    summary: 'An administrator creates a read-only key with fixed scopes and a request limit; the secret is shown once.',
    keywords: ['api key', 'token', 'integration', 'service account', 'scopes', 'revoke', 'rotate', 'rate limit', 'programmatic access'],
    surfaces: ['admin-console'],
    related: ['connect-claude-to-concept2cure', 'read-the-audit-trail', 'too-many-requests'],
    checked: '2026-11-12',
    body: `API keys let a service read your organisation's data within the scopes you choose. They are managed by administrators on the **API keys** tab of **Admin**.

**Create a key**

1. Select **Create API key**.
2. Enter a **Key name**.
3. Tick the **Read-only scopes** the service needs: csr:read, regulatory:read, endpoints:read, precedent:read, trial-design:read, documents:read. Scopes cannot be changed after creation.
4. Set **Expires at** if the key should expire. Leave it empty for a key with no expiration.
5. Set **Requests per minute**.
6. Enter a **Reason** (3 to 500 characters).
7. Select **Create API key**.

The full key is shown once, under **Store your API key**. Copy it and store it securely; it cannot be retrieved after the panel closes. Creation records your account, the scopes and your reason in the audit trail.

If the response could not be confirmed, check the key list before creating another, and revoke a key whose secret you do not hold.

**Review keys**

The list shows each key's prefix, name, scopes, owner, creation date, when rotation is due and when it was last used. **Usage** shows the key's status, total requests and last use.

**Revoke a key**

1. Select **Revoke** on the key's row.
2. Confirm with **Revoke key**.

Revocation is immediate and cannot be undone. Any service using the key stops authenticating at once. The revocation is recorded in the audit trail against you.

To replace a key, create a new one, move the service to it, then revoke the old one.

If the tab shows "Couldn't load API keys", no keys are reported. That is not a count of zero.`,
  },
  {
    slug: 'connect-claude-to-concept2cure',
    title: 'The Concept2Cure connector for Claude',
    collection: 'technical',
    summary: 'A remote MCP server lets a member work with their organisation’s Concept2Cure records from Claude, within approved scopes.',
    keywords: ['mcp', 'connector', 'claude', 'oauth', 'model context protocol', 'integration', 'skills', 'anthropic', 'remote server'],
    surfaces: ['admin-console'],
    related: ['create-and-revoke-api-keys', 'how-your-data-is-handled', 'part-11-records-and-signatures'],
    checked: '2026-11-12',
    body: `The connector gives Claude a scoped, audited view of your organisation's records in Concept2Cure. Claude drafts; Concept2Cure governs, validates and submits. Nothing the connector can do freezes, signs or transmits a submission.

**Turn it on or off (owner or administrator)**

1. Open **Admin** and select the **Settings** tab.
2. Find **Connector for Claude** and select **Turn on…** or **Turn off…**, then confirm.

While it is off, nobody can connect, and connections already made stop working. Each change is recorded in the audit trail. Every member can see whether it is on. The connector must also be enabled on your deployment.

**Connect (each member)**

1. In Claude, add a connector with your deployment's address followed by /mcp.
2. Sign in on the consent page with your Concept2Cure credentials, and your second factor when asked.
3. Approve the scopes requested.

**Scopes**

- **Read**: listings, readiness, validation, reference material and precedents.
- **Draft**: a cover letter composed from your records, and a drafted answer to an agency.
- **File**: places a draft into a sequence for review. A named person reviews and signs it in Concept2Cure.

**What IT should know**

- The connector is a remote MCP server using OAuth 2.1 with PKCE. Access tokens last one hour; refresh tokens last 30 days and rotate on every use.
- Every call runs inside the member's organisation. A record of another organisation is refused.
- Removing a member removes their connector grants.
- Every call, whether served, refused or denied, is written to the audit trail with the tool, the user, the client, the scopes and the outcome.
- Numbers and verdicts come from Concept2Cure's engines. One tool, the drafted agency answer, uses a model; it refuses when no AI provider is configured.

A Concept2Cure skills pack for Claude covers eCTD structure, ICH authoring checklists, FDA response letters and readiness review. Its skills need the connector, and each states what it will not do without it.`,
  },
  {
    slug: 'export-your-organisations-records',
    title: "Export your organisation's records",
    collection: 'technical',
    summary: 'The audit trail, compliance reports and Vault folders each have an export that is verified and recorded.',
    keywords: ['export', 'download', 'data portability', 'backup', 'offboarding', 'audit export', 'vault export', 'signed bundle', 'attestation'],
    surfaces: ['audit-trail', 'compliance-reports', 'vault'],
    related: ['read-the-audit-trail', 'how-your-data-is-handled', 'part-11-records-and-signatures'],
    checked: '2026-11-12',
    body: `Records are exported from the screen that holds them.

**The audit trail**

1. Open **Admin** and select **Open the audit trail**.
2. Select **Export signed bundle**.

The download holds the entries, a manifest and a signature, so its integrity can be checked outside Concept2Cure. It needs an administrator's session; without one the screen says "Admin session required to export the audit trail."

**Compliance reports**

From the audit trail, select **Compliance reports**. These are deterministic reports drawn from your organisation's own records. Each is sealed and recorded on the audit trail when it is run. Report periods are in UTC and inclusive.

**Vault folders**

In the **Vault**, a folder's **Export** control downloads the current version of each document in the folder, verified, with an index and the documents' audit trail.

**Company letterhead**

On the **Settings** tab of **Admin**, **Download saved Word letterhead** downloads the letterhead in use.

**When an export fails**

The screen states that the export failed and why. A failed export is never presented as an empty one. Try again; if it keeps failing, select **Get help** in the account menu.

**A complete copy of your organisation's data**

The product has no single control that downloads everything your organisation holds. If you need that, for example at the end of a contract, ask Concept2Cure support through **Get help**. The Privacy Policy sets out your rights to access and port your data.`,
  },
];
