import type { HelpArticle } from '../types';

/** Review, approval and e-signatures. Written from the editor's and the review board's code and checked on 2026-11-12. */
export const REVIEW_ARTICLES: readonly HelpArticle[] = [
  {
    slug: 'send-a-document-for-review',
    title: 'Send a document for review',
    collection: 'review',
    summary: 'Choose the reviewers, give a reason and a due date; each reviewer gets a task and the request is listed on the review board.',
    keywords: ['request review', 'reviewer', 'assign review', 'review route', 'due date', 'review task', 'peer review'],
    surfaces: ['document-authoring', 'review', 'tasks'],
    related: ['the-review-board', 'sign-a-document-electronically', 'the-review-step'],
    checked: '2026-11-12',
    body: `Open the document in the editor. Save the open section first.

1. Select **Send for review…** on the editor's bar (on a narrow screen it is under **More**).
2. Under **Reviewers**, tick the people to ask. A person who cannot review this document is shown unavailable, with the reason. The document's author is not offered, and someone whose review is already pending cannot be asked twice.
3. Give the **Reason for the request** (at least 8 characters). It is recorded on the document's audit trail and given to each reviewer in their task.
4. Add **Instructions to the reviewers** if they should know something.
5. Set **Review due** and the **Priority**. The due date is the end of that day in your time zone, and each reviewer is reminded before it.
6. Select **Send for review**.

**What is recorded.** In one step, a review request is recorded on the document for each reviewer, the review board lists it, and each reviewer gets a review task in **Tasks** with its due date. When you own the document, each reviewer is also given the Reviewer role on it, so they can comment and sign the review. The confirmation lists each request and task; **Open the Review board** goes to the board.

**Asking again.** A reviewer whose verdict is already recorded can be asked again after you revise. Their earlier verdict stays in the record and a new review is requested.

If the button is unavailable, hover over it for the reason. Sending a document for review needs an Owner or Author role on it.

To follow the review, open **Review tasks** in the editor: it shows the review route, who is named on it, and each task.`,
  },
  {
    slug: 'the-review-board',
    title: 'Use the review board and record a review decision',
    collection: 'review',
    summary: 'The review board lists documents in review; a reviewer records a verdict there: approve, request changes or decline.',
    keywords: ['review board', 'review queue', 'awaiting my review', 'requested by me', 'verdict', 'request changes', 'decline', 'reject', 'independent checks', 'hand back'],
    surfaces: ['review', 'project-home', 'tasks'],
    related: ['sign-a-document-electronically', 'the-review-step', 'resolve-comments-and-threads', 'approve-a-document'],
    checked: '2026-11-12',
    body: `Open the project's **Review** step and select **Review documents on the review board**. The board starts on the open project; the buttons at the top switch to every project.

**Choose what to see**

- **Awaiting my review**: documents where a review request names you.
- **Requested by me**: reviews you sent, with each reviewer's verdict.
- **All open**: every document in review.

The line at the top says how many documents await your review or are at your sign-off, or that nothing is waiting on you. The queue lists each document with where it stands: In review, Changes requested, Declined, Reviewers approved, sign-off pending, or Approved.

**Select a document** to see its **Review requests** (who was asked and what each has said), a passage of the document with **Open in editor**, and its **Comments**.

**Record your decision** when a review awaits you

1. Select **Record review decision**.
2. Read the complete saved document shown in the dialog.
3. Where the document needs them, select **Run independent checks**. They check the saved document and its recorded source links without calling a model. A blocking finding holds an approval. The scientific and clinical meaning still needs your reading.
4. Choose the **Decision**: **Approve**, **Request changes — send it back with a reason**, or **Decline — reject this document**.
5. Give the reason: required to request changes or decline (at least 8 characters), optional when you approve.
6. Select **Record approval**, **Record change request** or **Record rejection**.

The verdict is bound to the saved content you were shown. A change request gives the author your reason and returns the review route to its sender.

**Then sign.** A verdict is not an electronic signature. To close your review task, open the document and sign with **E-sign**, meaning **Review**. A document at your sign-off has **Open the document to sign**.

**If you cannot do the review**, open **Review tasks** in the editor and select **Hand back**.

The board also lists Vault versions sent for review. If it cannot be read, it says so; it does not show an empty queue.`,
  },
  {
    slug: 'resolve-comments-and-threads',
    title: 'Comment, resolve a thread, and reopen one resolved by mistake',
    collection: 'review',
    summary: 'Comments stay in the record when resolved, with who resolved them and why; a resolved thread can be reopened.',
    keywords: ['comment', 'thread', 'resolve', 'reopen', 'unresolve', 'reply', 'change request', 'annotation', 'undo resolve'],
    surfaces: ['document-authoring', 'review'],
    related: ['the-review-board', 'track-changes-and-alternatives', 'send-a-document-for-review'],
    checked: '2026-11-12',
    body: `**Add a comment in the editor**

1. Open the document and select **Comments** on the bar.
2. To comment on particular words, select them first and choose **Comment** on the ribbon. Otherwise the comment is on the open section.
3. Type the comment and select **Add comment**.

**Reply** adds to a thread. A comment on selected text shows the quoted words; if that text no longer exists in the draft, the comment is kept and says its highlight is gone.

**Resolve a comment**

1. Select **Resolve** on the comment.
2. Give a reason if you want one ("Reason for resolving" is optional).
3. Select **Resolve**.

The comment is not deleted. It stays in the record, marked resolved, with who resolved it, when, and the reason.

**Reopen one resolved by mistake.** In the editor's **Comments** panel, a resolved comment has **Reopen** beside its status. Select it and the thread is open again.

**On the review board**

- Under a document's **Comments**, add a comment or **Resolve** an open one.
- Under **Threads and change requests assigned to you**, open a thread to read it, reply, or select **Resolve thread**. Select **Request changes** before posting to send the reply as a formal change request, which creates a task to track the fix.
- Right after you resolve a thread or task there, a line confirms it with **Reopen**. Use it if you resolved the wrong one; the item returns to your list.

**Export review record** downloads every thread and comment on the document. The export is recorded in the audit trail.`,
  },
  {
    slug: 'approve-a-document',
    title: 'Approve a document',
    collection: 'review',
    summary: 'Approval is an electronic signature with the meaning Approval; it comes after review, and it freezes the document.',
    keywords: ['approve', 'approval', 'approver', 'sign-off', 'freeze', 'frozen', 'lock', 'final approval', 'figures'],
    surfaces: ['document-authoring', 'review'],
    related: ['sign-a-document-electronically', 'the-review-board', 'module-completion-on-the-author-step'],
    checked: '2026-11-12',
    body: `A document is approved by an approver's electronic signature. An Approval signature approves and freezes the document: its content can no longer be edited.

**Before you approve**

- **Review comes first.** If the document has not been reviewed, the signature is refused with "Review comes before approval", and offers **Send for review**.
- **You did not write it.** The document's creator signs as its author. Review and approval are signed by someone else.
- **Your role allows it.** A Reviewer role permits the review signature only. If you cannot approve, **E-sign** says why.

**Approve**

1. Open the document. From the review board, a document at your sign-off has **Open the document to sign**.
2. Select **E-sign** on the editor's bar.
3. Choose the meaning **Approval**.
4. Give the reason, enter your password and, if asked, your authenticator code.
5. Select **Sign and commit**.

**Questions you may be asked.** If the document is not settled, or a figure in it was not found in the source its section cites, the approval stops and asks. For each figure you choose **Go back and correct it** or **Keep it as written**. If you keep it, your signature records each one. Nothing is signed until you answer.

**After approval.** The document's status becomes Approved and its Save button reads **Frozen**. If the document is bound to filing sections and some could not be marked approved, a note under E-sign names them. Approved sections count towards **Module completion** on the Author step.

**Freeze** is a separate act on the bar: it seals the content with an author's or reviewer's signature, without approving it.`,
  },
  {
    slug: 'sign-a-document-electronically',
    title: 'Sign a document electronically',
    collection: 'review',
    summary: 'A signature records who signed, its meaning, the reason and the time; you re-enter your password for each one.',
    keywords: ['e-sign', 'esign', 'electronic signature', 'part 11', 'meaning', 'reason', 'password', 'authenticator', 'totp', 'signature record'],
    surfaces: ['document-authoring'],
    related: ['approve-a-document', 'the-review-board', 'versions-and-revision-history'],
    checked: '2026-11-12',
    body: `Open the document in the editor and select **E-sign** on the bar.

1. Check **You are signing**: the document's name, and your name as the signer.
2. Choose the **Signature meaning**:
   - **Authorship**: you authored this content.
   - **Review**: you reviewed this content.
   - **Approval**: you approve this content for use.
3. Enter the **Reason for this action** (at least 8 characters). It is stored word for word in the audit trail.
4. Enter your account **Password**. If your organisation requires an authenticator, enter the 6-digit **Authenticator code** as well. Both are asked for at every signature and are not stored.
5. Select **Sign and commit**.

Only the meanings you may sign are offered. The document's creator is offered Authorship; a reviewer is offered Review.

**What the signature records.** The confirmation, **Signature applied**, shows the record: the action, **Signed by** (your name and e-mail), the **Meaning**, the **Reason**, **When** it was signed and, where one is returned, the document's hash. The audit trail has a new entry. A signature cannot be undone.

**What each meaning does.** A Review signature closes your review task on the document's review route. An Approval signature approves and freezes the document.

**See a document's signatures.** Select **Signatures** on the editor's bar. Each one is listed with the signer's printed name, the meaning and the time it was executed.

**If it does not sign**

- "Password could not be verified": re-enter it. Nothing was signed.
- "Authenticator code could not be verified": each code works once; wait for the next.
- "Enrol an authenticator in Account to sign": your organisation requires one and you have none yet.`,
  },
  {
    slug: 'the-review-step',
    title: 'What the Review step shows',
    collection: 'review',
    summary: 'The project’s documents in review grouped by what they need, its tasks, its readiness, and its Quality records.',
    keywords: ['review tab', 'waiting on you', 'in review', 'changes requested', 'readiness', 'quality records', 'project review'],
    surfaces: ['project-home', 'review', 'quality'],
    related: ['the-review-board', 'send-a-document-for-review', 'module-completion-on-the-author-step', 'the-six-steps-of-a-project'],
    checked: '2026-11-12',
    body: `Open a project and select the **Review** step.

**Reviews** lists the documents in this project that were sent for review, grouped by what they need:

- **Waiting on you**: a review awaits you, or the document is at your sign-off.
- **In review**
- **Changes requested**
- **Declined**
- **Reviewers approved, awaiting sign-off**
- **Approved**

Each row shows the document, where it stands, your part in it ("Awaiting your review", "At your sign-off" or "Requested by you"), the reviewer, and the number of open comments. **Open document** opens that document in the editor. A group with nothing in it is not shown.

If nothing is out for review, the step says so: send a document for review from the editor and it is listed here. **Review documents on the review board** opens the full board, starting on this project.

**Tasks and approvals.** The project's tasks and approvals, by due date. **See all tasks in Tasks** opens the task list.

**Readiness.** Dossier readiness: the sections approved or locked, as the server counts them. It is the same figure the Author step shows above Module completion.

**Quality.** This project's quality records, as counts: open CAPAs, open change controls, nonconforming product awaiting disposition, and controlled documents authored here. **Manage quality records in Quality** opens Quality. This section appears when Quality is part of your organisation's product.

Verdicts and signatures are not recorded on this step. A verdict is recorded on the review board, and a signature in the editor.

A list that could not be read says so, with a retry. It is not shown as empty.`,
  },
];
