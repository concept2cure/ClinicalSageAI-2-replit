import type { HelpArticle } from '../types';

/** Quality. Written from the Quality work area's screens on 2026-11-12. */
export const QUALITY_ARTICLES: readonly HelpArticle[] = [
  {
    slug: 'quality-work-area',
    title: 'What the Quality work area holds',
    collection: 'quality',
    summary: 'Controlled documents and their training, change control, CAPA and the other quality records, as tabs of one work area.',
    keywords: ['qms', 'quality system', 'sop', 'registers', 'deviations', 'suppliers', 'internal audit', 'management review', 'complaints'],
    surfaces: ['quality'],
    related: ['create-and-approve-a-controlled-document', 'read-and-acknowledge-training', 'raise-a-change-request', 'capa-and-nonconformances'],
    checked: '2026-11-12',
    body: `Open **Quality** under **Work areas** in the left sidebar. It is one page with a tab for each register.

- **SOP register**: the controlled documents, with **Periodic review**, **Read-and-understood training** and **Training overdue, due or lapsing** below them.
- **Change control**: the change control log and its lifecycle stages.
- **CAPA**, **Complaints and MDR**, **Deviations**, **Nonconformances**, **Suppliers**, **Internal audits** and **Management reviews**: one register each.

**Whose records you see.** With a project open, Quality shows that project's controlled documents and their periodic review, changes, CAPAs and nonconformances. Training, deviations, suppliers, audits and management reviews are the organisation's. **Show the whole organisation** at the top right widens the view; the same button returns to the project.

**The figures.** Each register states its figures in one line under its heading, from the records as read. A register that could not be read says so and offers a retry; it does not show an empty list in its place.

**AnA.** The starters under the title ask AnA for a read-out on the open tab, a pre-inspection check, or where training is missing. AnA reads the registers as shown. She does not record, approve, sign or acknowledge for you: each of those is your own act, in the register.

**Training of record lives here.** A person's read-and-understood acknowledgement of a controlled document is recorded in the SOP register. The courses under **Help & training** teach how to use Concept2Cure; your progress through them is not recorded, and they are not training of record.`,
  },
  {
    slug: 'create-and-approve-a-controlled-document',
    title: 'Create a controlled document and take it to effective',
    collection: 'quality',
    summary: 'New controlled document opens a draft in the editor; it is sent on a review route and becomes effective when its QMS approver signs.',
    keywords: ['sop', 'procedure', 'policy', 'work instruction', 'document control', 'send for review', 'approve', 'effective', 'revise', 'retire', 'controlled copy', 'version history'],
    surfaces: ['quality'],
    related: ['quality-work-area', 'record-a-periodic-review', 'assign-training-and-read-coverage'],
    checked: '2026-11-12',
    body: `Controlled documents are listed on the **SOP register** tab of Quality. A document moves from Draft to Under review to Effective; later it is Superseded or Retired.

**Create the draft**

1. Select **New controlled document**.
2. Choose the **Project** that holds its editing copy, give a **Title**, and choose a **Template** and **Document type** (quality manual, policy, SOP, work instruction, form, specification, validation protocol or training curriculum).
3. **Document number** and **Next periodic review** are optional. Leave the number empty and the next one is assigned.
4. Give a **Reason** (at least 8 characters) and select **Create and open**.

The draft opens in the editor. Write and save its sections, then select **Back to Quality register**.

**Send it for review**

1. On the draft's row, select **Send for review**.
2. Name one or more **QMS approvers**, any **Reviewers**, and the **Approval due** date.
3. Select **Send for review**. The people named are told when it is their turn.

**Review route** on the row shows who is named and what each has done. Each reviewer signs the review before the approval.

**Approve**

The approver named sees **Approve** on the row. It opens the electronic signature: choose **Effective from**, then sign with your password and second factor. The author cannot approve their own document. A later effective day leaves the earlier version in force until then.

**After it is effective**

Each row shows two actions; **More** holds the rest.

- **Revise** opens a new draft with a reason for change. The version in force stays in force until the revision is approved.
- **Controlled copy** downloads the version in force with its approval signature; the issue is recorded.
- **History** lists the retained versions.
- **Retire** takes the document out of use, under your electronic signature.`,
  },
  {
    slug: 'record-a-periodic-review',
    title: 'Record a periodic review of a controlled document',
    collection: 'quality',
    summary: 'A periodic review is a signed statement that the version in force remains current, or that it requires revision.',
    keywords: ['periodic review', 'review due', 'overdue', 'next review date', 'remains current', 'revision required'],
    surfaces: ['quality'],
    related: ['create-and-approve-a-controlled-document', 'quality-work-area'],
    checked: '2026-11-12',
    body: `The **Periodic review** section, under the controlled documents on the **SOP register** tab, lists the documents due for review within 120 days. Overdue documents are marked **Overdue**. The register's **Next review** column shows the same date for every document.

**To record a review**

1. Select **Record review** on the document's row, in the Periodic review section or in the register (under **More** when it is not shown).
2. Choose the **Review outcome**:
   - **Remains current**: enter the **Next periodic review** date, after today and within five years.
   - **Revision required**: the document keeps the review date its approval set.
3. Select **Continue to sign**.
4. Sign with your electronic signature.

The review does not change the document or its approval. The last review is shown on the row: the version, when it was reviewed, by whom and the outcome.

**Revision required** does not open a revision. Open one with **Revise** in the register; approving the revision sets the next review date.

A document that is already under revision offers no review. Its row says "Revision open. Approving the revision sets the next review date."`,
  },
  {
    slug: 'read-and-acknowledge-training',
    title: 'Read a controlled document and acknowledge it',
    collection: 'quality',
    summary: 'Open the version in force, read it, tick the declaration and select Acknowledge this revision; your receipt is kept.',
    keywords: ['read and understood', 'training', 'acknowledge', 'acknowledgement', 'sop training', 'training record', 'receipt', 'gxp training', 'my training'],
    surfaces: ['quality', 'tasks'],
    related: ['assign-training-and-read-coverage', 'quality-work-area'],
    checked: '2026-11-12',
    body: `When you are assigned to train on a controlled document, you get a task for it. It appears on the **Tasks** board.

**To acknowledge a document**

1. Open the task and select **Read and acknowledge**. Or open **Quality**, find the document on the **SOP register** tab and select **Read and acknowledge** on its row. In the **Read-and-understood training** section, **My acknowledgement** opens the same reader.
2. Read the released text.
3. Tick **I have read and understood this released revision.**
4. Select **Acknowledge this revision**.

**My acknowledgement** then shows your receipt: its number, when you acknowledged, and the refresh date if one is recorded.

**What the acknowledgement is.** It is for your signed-in account only. It is a personal attestation that you read and understood the revision. It is not an electronic signature, and it does not assess competency. Nobody else, and not AnA, can acknowledge for you.

**A version approved for a later day.** When a new version is approved but not yet effective, the reader offers both: the version **In force** and the one that **Takes effect** later. You can acknowledge the new version before its effective date; the acknowledgement is recorded at once and counts from that date.

**If the text cannot be read.** The reader says that released text is unavailable, and offers no acknowledgement. A document owner must save and release the text first.

**Where you stand.** The **Read-and-understood training** section says, for each document you are assigned to, whether you are current on the version in force. **Training overdue, due or lapsing** lists what you have overdue, due or lapsing in the next 60 days.

This is the organisation's training of record. The courses under **Help & training** are product training and are not recorded.`,
  },
  {
    slug: 'assign-training-and-read-coverage',
    title: 'Assign training on a controlled document and read coverage',
    collection: 'quality',
    summary: 'Assign a document to job roles or named people, then read who has acknowledged the version in force and what is overdue.',
    keywords: ['training matrix', 'job roles', 'assign training', 'coverage', 'compliance', 'overdue training', 'lapsing', 'who must train', 'administrator'],
    surfaces: ['quality'],
    related: ['read-and-acknowledge-training', 'create-and-approve-a-controlled-document'],
    checked: '2026-11-12',
    body: `Training is assigned per controlled document, on the **SOP register** tab of Quality. SOPs, work instructions, quality manuals, policies, validation protocols and training curricula carry training.

**Job roles**

Select **Job roles** in the **Read-and-understood training** section. A job role is a job function people hold, such as QA reviewer. Only an administrator changes job roles and who holds them: **New job role**, **Add a person**, **Rename**, **Remove** and **Delete**, each with a reason of at least 8 characters. A role assigned to a document cannot be deleted until those assignments are withdrawn.

**Assign a document**

1. On the document's row, select **Training** (under **More** when it is not shown).
2. Select **Assign a job role** or **Assign a person**, choose one, and give a reason.
3. Select **Assign**.

Everyone who holds an assigned role, now or later, and everyone assigned by name, must read and acknowledge the version in force. **Withdraw** ends an assignment; its history is kept. Only an administrator, or a designated QMS approver who can edit, changes assignments.

**What an administrator sees**

- **Read-and-understood training** lists each document with "n of m acknowledged" and the latest acknowledgement, or says **Not assigned**, **No active assignees** or **Unavailable**. The heading carries the overall coverage figure. Coverage counts the people assigned who have acknowledged the version in force; it does not assess competency.
- **Training overdue, due or lapsing** names each person assigned whose training is overdue, or is due or lapses in the next 60 days, with the document and the date. Other members see their own rows only.
- When approving a document, the signature dialog says how many people are assigned and whether the chosen effective day leaves them a training period.

The courses under **Help & training** are product training. They are not recorded and do not count here.`,
  },
  {
    slug: 'raise-a-change-request',
    title: 'Raise a change request and take it through change control',
    collection: 'quality',
    summary: 'A change is raised as proposed, assessed, approved by a second person under signature, implemented, verified and closed.',
    keywords: ['change control', 'change request', 'change log', 'impact assessment', 'advance', 'approve change', 'link deviation', 'link capa', 'validation'],
    surfaces: ['quality'],
    related: ['quality-work-area', 'capa-and-nonconformances'],
    checked: '2026-11-12',
    body: `Open **Quality** and select the **Change control** tab. The **Change control log** lists each change with its number, title, type, class, status, target date and links. The line under the heading counts the open changes, those awaiting approval, in implementation and overdue. The stage filter narrows the log; **All** clears it.

**Raise the change**

1. Select **Raise change request**.
2. Enter the **Change number** (unique in your organisation) and **Title**.
3. Choose **What is changing** and the **Classification**: Minor, Major or Critical.
4. Describe the **Current state → proposed state** and give the **Reason for the change**.
5. **Risk**, **Impact assessment**, **Implementation plan** and **Target implementation date** can be completed now or later.
6. Select **Raise change**.

The change is recorded as Proposed.

**Take it through its stages**

- **Edit assessment** records the risk, impact assessment and implementation plan, with a reason for the edit. It can be edited until the change is approved; from then on it is what the approval signed.
- **Advance** moves the change to a next stage the log offers, with a reason for the move.
- **Approve** appears while the change is Under assessment. It takes the approver's electronic signature. The person who proposed the change cannot approve it.
- **Link a record** ties the change to the deviation, CAPA or validation record it touches. Select the change's number to read its assessment and linked records.

The stages are Proposed, Under assessment, Approved, In implementation, Verification and Closed; a change can also be Rejected or Cancelled. Every move is written to the audit trail under your name.

**Change-control documents and forms**, under the log, creates a controlled draft from a change-control template in the SOP register.

The **Explain the change procedure** starter asks AnA to explain the steps and what makes a change minor, major or critical.`,
  },
  {
    slug: 'capa-and-nonconformances',
    title: 'Raise a CAPA and record a nonconformance',
    collection: 'quality',
    summary: 'A nonconformance is recorded and dispositioned under signature; a CAPA is raised in a project and moved through to its effectiveness check.',
    keywords: ['capa', 'corrective action', 'preventive action', 'nonconformance', 'nonconforming product', 'disposition', 'effectiveness check', 'action items', 'nc'],
    surfaces: ['quality'],
    related: ['quality-work-area', 'raise-a-change-request'],
    checked: '2026-11-12',
    body: `Both registers are tabs of **Quality**.

**Record a nonconformance**

1. On the **Nonconformances** tab, select **Record nonconformance**.
2. Enter its **Number**, **Where it was found**, the **Product or material**, the **Lot or batch**, and **What was found**.
3. Select **Record**. It is recorded as awaiting disposition.

**Disposition it.** Select **Disposition** on its row, choose the disposition (use as is, rework, regrade, scrap or return to supplier), and select **Continue to sign**. You sign the disposition with your electronic signature; your reason is recorded as its rationale. A signed disposition is not changed.

**Raise a CAPA**

A CAPA belongs to a project, so open the project first. With no project open, the form says so and records nothing.

1. On the **CAPA** tab, select **Raise CAPA**. From a nonconformance, deviation, supplier, audit or management review, **Raise CAPA** on that record's row starts the CAPA with the record as its source.
2. Enter the **Title**, **Type** (corrective, preventive or both), **Raised from**, **Risk**, **Target close** and the **Problem statement**.
3. Select **Raise CAPA**. It is recorded as open, and its number is assigned for you.

**Work the CAPA**

- **Add action** adds an action item to its plan: the action type, due date, owner and what will be done. **Show action items** lists them; completing one asks for the evidence of completion.
- **Advance** moves the CAPA to its next state, with a reason: Investigation, Action planned, Action implemented, Effectiveness check, then Closed, effective or Closed, not effective. Closing needs the effectiveness check result.

Each write is recorded in the audit trail under your name. The first starter on either tab asks AnA for a read-out of the register.`,
  },
];
