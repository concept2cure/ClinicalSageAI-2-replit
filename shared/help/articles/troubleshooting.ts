import type { HelpArticle } from '../types';

/** Troubleshooting: what the product says when something does not work, and what to do. Written from the screens' code, 2026-11-12. */
export const TROUBLESHOOTING_ARTICLES: readonly HelpArticle[] = [
  {
    slug: 'a-screen-shows-a-lock',
    title: 'A screen or feature shows a lock',
    collection: 'troubleshooting',
    summary: 'The lock panel says why a feature is unavailable: your subscription, a switch, your workspace, or this release.',
    keywords: ['locked', 'lock icon', 'not included', 'upgrade', 'subscription', 'plan', 'entitlement', 'not in this release', 'turned off', 'cannot open'],
    surfaces: ['apps', 'licensing', 'access-requests'],
    related: ['answer-access-requests', 'get-help-and-contact-support'],
    checked: '2026-11-12',
    body: `Select the locked item to open its panel. The line under the feature's name gives the reason, and the reasons are not interchangeable.

**Included from a higher subscription** ("Included from Professional", or "Not included in your subscription")

Your organisation's subscription does not include the feature. **Compare subscriptions** shows what each one includes. If you are not an administrator, select **Ask an administrator**.

**Turned off for this workspace**

An administrator disabled the feature for your organisation. An administrator can turn it back on in **Subscription & features**. Anyone else can ask them to, with **Ask an administrator**.

**Not offered for this workspace**

The feature is not part of the catalogue for your workspace's industry setting. Changing that setting is an administrator's action, not a subscription change.

**Not in this release**

The feature is built but is not part of the current release. No upgrade, setting or request enables it, and the panel offers none.

**Asking an administrator**

1. Add a note under **Why you need it (optional)**: the work the feature is needed for, and by when.
2. Select **Ask an administrator**.

The request goes to your organisation's administrators. If you open the panel again it tells you where the request stands: still with your administrators, declined, or approved. If it was approved and the feature is still locked, reload the page.`,
  },
  {
    slug: 'couldnt-load-try-again',
    title: '"Couldn\'t load …" with Try again',
    collection: 'troubleshooting',
    summary: 'A failed read is shown as a failure with a retry, never as an empty list; here is how to read the message.',
    keywords: ['error', 'could not load', 'failed', 'retry', 'empty', 'nothing shown', 'not found', 'blank screen', 'try again'],
    surfaces: ['home', 'projects', 'vault'],
    related: ['you-are-signed-out', 'a-screen-shows-a-lock', 'get-help-and-contact-support'],
    checked: '2026-11-12',
    body: `When Concept2Cure cannot read something, it says so: "Couldn't load your projects", "Couldn't load API keys", and so on. It does not show an empty list in its place. An empty list ("No requests waiting", "No audit entries yet") appears only when the read succeeded and there is nothing to show.

**What to do**

1. Select **Try again** (on some panels, **Retry**).
2. If it fails again, check your connection and reload the page.
3. If it still fails, select **Get help** in the account menu and say which screen and which message.

**When there is no retry**

Some messages name a cause that a retry cannot change, and offer none:

- **Your session has expired**: sign in again.
- **Not enabled for your organization**: the feature is not switched on for your organisation. See the article on locked features.
- **Not in this release**: that part of the product is not in the current release.
- **Your role cannot do this**: your access level does not allow it. Ask an administrator.
- **Not found in your organization**: the record does not exist in your organisation; check the link you followed.
- **Signature required**: the step needs your electronic signature.

**The ownership check was unavailable** is different: the check that a record belongs to your organisation could not run. It says nothing about the record itself, and **Try again** is offered.

**Part of a screen fails**

One part can fail while the rest loads. The part that failed carries its own message and its own retry; a count that depends on it is not shown as zero.`,
  },
  {
    slug: 'ana-cannot-answer',
    title: 'AnA says no AI provider is configured, or cannot answer',
    collection: 'troubleshooting',
    summary: 'What each of AnA’s refusals means, and whether your message was saved.',
    keywords: ['ana not working', 'no ai provider', 'ai unavailable', 'weekly limit', 'ana error', 'assistant down', 'cannot draft', 'conversation too long'],
    surfaces: ['conversation-thread', 'usage'],
    related: ['meet-ana', 'too-many-requests', 'you-are-signed-out'],
    checked: '2026-11-13',
    body: `When AnA cannot take a request she says why, and whether your message was saved. A message she refuses before she takes it is not saved; one she took and could not answer stays in the conversation without an answer. Earlier turns in the conversation stay as they were.

**"No AI provider is configured for this deployment, so AnA cannot answer."**

This is a setting of the server, not your connection and not your account. Trying again does not change it. Tell your administrator or your Concept2Cure contact. The editor says the same when a section cannot be drafted, and adds that nothing was changed.

Screens that show figures and verdicts still work: those come from Concept2Cure's engines, not from the model.

**"This organization has reached its weekly limit for AnA requests"**

The request was not sent or saved. An administrator can review the limit. **Usage & limits** in the account menu shows your organisation's usage.

**"Too many AnA requests in the last minute"**

The request was not taken or saved. Wait a moment and ask again.

**"Your sign-in could not be verified"**

Sign in again, then ask again.

**"AnA cannot accept this request with your current access"**

Sign in again, or ask an administrator to review your access.

**"AnA couldn't complete this request"**

Try again. If it keeps happening, select **Get help** in the account menu.`,
  },
  {
    slug: 'you-cannot-sign',
    title: 'You cannot sign or approve',
    collection: 'troubleshooting',
    summary: 'Signing needs a signing role, independence from the record, and your password and code at the moment of signing.',
    keywords: ['cannot sign', 'cannot approve', 'signature refused', 'no authority', 'separation of duties', 'author', 'approve own document', 'e-signature failed'],
    surfaces: ['project-home', 'admin-console'],
    related: ['access-levels-and-roles', 'session-policy-and-review-rules', 'set-up-an-authenticator-app'],
    checked: '2026-11-12',
    body: `A signature is refused for one of a few reasons, and the message says which. In every case nothing was signed.

**"Your role does not permit applying an electronic signature"**

Only members whose access level is Admin, Approver or Reviewer can sign. Ask an administrator to change your role (Admin, Members, **Change role**). Being shared on a project with Edit does not make you a signer.

**You wrote it, or you created it**

- An author cannot approve their own document. Another person with a signing role approves it.
- If you created a submission sequence, you cannot sign its freeze or dispatch. A different colleague with signing rights signs both steps.
- The exception is an organisation with a single member, where an administrator has ticked **Allow self-approval**. Each such approval is recorded as having no independent review.

**Not enough reviewers yet**

A document is reviewed before it is approved. Your organisation sets how many independent reviewers a version needs, from 1 to 5. A reviewer is never an author or the approver.

**Your password or code was not accepted**

Signing asks for your **Password** and, if you have an authenticator app, your **Authentication code**. They are checked at the moment of signing and are not taken from your session. Enter the current 6-digit code from the app.

If **Account** says your account needs an authenticator app for electronic signatures, set one up there first.

**"Your signing authority could not be checked"**

The check could not run, so nothing was signed. Try again. If it continues, contact your administrator.

**"Your session is not signed in any more"**

Sign in again and repeat the step. It was not completed.`,
  },
  {
    slug: 'you-are-signed-out',
    title: 'Your session expired, or you were signed out',
    collection: 'troubleshooting',
    summary: 'Sessions end after a period without activity, after 12 hours, or when a newer sign-in exceeds the session limit.',
    keywords: ['session expired', 'logged out', 'signed out', 'timeout', 'idle', 'sign in again', 'kicked out', 'session ended'],
    surfaces: ['admin-console'],
    related: ['sign-in-and-sign-out', 'session-policy-and-review-rules', 'couldnt-load-try-again'],
    checked: '2026-11-12',
    body: `When your session has ended, a screen says "Your session has expired" and asks you to sign in again. An action you had started says that it was not completed, for example "Sign in again; the task was not completed."

**Why a session ends**

- **No activity.** Your organisation sets an idle sign-out period. Where it has not, the platform default is 15 minutes.
- **Twelve hours.** Every session ends 12 hours after sign-in, whatever the activity. This cannot be changed.
- **Too many sessions.** Your organisation sets how many sessions one account may have open (5 unless it has set another number). A new sign-in beyond the limit closes the oldest session, so signing in on another device can end the session on this one.
- **You were removed from the organisation.** Access ends at your next request.

**What to do**

1. Sign in again with your e-mail and password, or your organisation's single sign-on.
2. Enter the verification code: from your authenticator app, or the one sent to your e-mail.
3. Return to what you were doing and repeat the step that was refused. Check the record first: the message says whether anything was changed.

**For administrators**

The idle period and the session limit are on the **Session policy** card (Admin, Settings). A change to the idle period applies at each person's next sign-in.`,
  },
  {
    slug: 'too-many-requests',
    title: '"Too many requests"',
    collection: 'troubleshooting',
    summary: 'The platform limits how many requests an account and an address may make in a period; wait and repeat the action.',
    keywords: ['rate limit', '429', 'throttled', 'too many', 'slow down', 'limit reached', 'wait a moment', 'quota'],
    surfaces: ['usage'],
    related: ['ana-cannot-answer', 'create-and-revoke-api-keys', 'get-help-and-contact-support'],
    checked: '2026-11-12',
    body: `Concept2Cure limits how many requests of some kinds can be made in a short period. When a limit is reached, the request is not taken and the screen says so, for example:

- "Too many AnA requests in the last minute, so this one was not taken. Wait a moment and ask again."
- "Too many conversation requests. Wait a moment, then retry loading this conversation."
- "Too many reports were run in a short time. Wait a minute and run it again."

**What to do**

Wait for the period the message names, then repeat the action. Nothing was changed by the refused request, and in a conversation your earlier turns are kept.

**See the limits**

1. Open **Usage & limits** in the account menu.
2. Select the **Rate limits** tab.

The table lists each limit, the number of requests allowed for a signed-in user and for an address, and the period. The limits are the ones the platform enforces, and they are the same for every subscription. Where administrators are not limited on a kind of request, the note under the table says so.

**A weekly limit is different.** "This organization has reached its weekly limit for AnA requests" is a limit on your organisation's use, not a short-term rate limit. Waiting a moment does not lift it; an administrator can review it.

**API keys** carry their own **Requests per minute**, set when the key is created.

If you reach a limit in ordinary work and waiting does not help, select **Get help** in the account menu.`,
  },
  {
    slug: 'an-upload-is-refused',
    title: 'An upload is refused',
    collection: 'troubleshooting',
    summary: 'Uploads are limited by file type and to 50 MB, and a file’s content must match its extension.',
    keywords: ['upload failed', 'file type', 'format', 'not allowed', 'too large', 'file size', 'supported formats', 'pdf', 'docx', 'zip', 'xpt'],
    surfaces: ['vault', 'project-home', 'conversation-thread'],
    related: ['couldnt-load-try-again', 'get-help-and-contact-support'],
    checked: '2026-11-12',
    body: `An upload is refused when the file's type is not accepted, when it is too large, or when its content does not match its extension. The message names the reason; nothing is stored.

**File types the Vault accepts**

- Documents: PDF, DOCX, DOC, RTF, PPTX
- Spreadsheets and data: XLSX, XLS, CSV, TSV, JSON, NDJSON, XML, XSL, XPT
- Text: TXT, MD
- Images: PNG, JPG, JPEG, GIF
- Archives: ZIP

A conversation with AnA and a project's data room accept the same types except RTF, PPTX and XSL.

**Size.** One file can be up to 50 MB. A larger file is refused with "The file exceeds the 50 MB ingest limit."

**What is read from a file**

Accepting a file is not the same as reading it. Text is read from PDF, DOCX and XLSX files and from text files. Images are read by OCR, which is not always accurate. An XPT file is read for its structure only: datasets, variables, labels and record counts. DOC, XLS and PPTX files are stored but their text is not read; convert them to DOCX, XLSX or PDF if AnA should work from their content.

**ZIP files**

In a conversation or the data room, a ZIP is opened in your browser and each file inside is uploaded and checked on its own. In the Vault, a ZIP is stored as one file and is not opened.

**Other uploads have their own rules**

- A company logo: PNG, JPEG or GIF, up to 2 MB.
- A letterhead to import: DOCX or PDF.
- An image placed in a document: up to 8 MB.

If a file of an accepted type and size is still refused, select **Get help** in the account menu and give the message shown.`,
  },
];
