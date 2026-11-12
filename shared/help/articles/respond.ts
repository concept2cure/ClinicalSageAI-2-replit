import type { HelpArticle } from '../types';

/** Responding to the agency. Written from the screens' code on 2026-11-12. */
export const RESPOND_ARTICLES: readonly HelpArticle[] = [
  {
    slug: 'add-the-agency-letter',
    title: "Add the agency's letter to a project",
    collection: 'respond',
    summary: 'Upload the letter on the Respond step, or log it in Communication; both write to the same agency inbox.',
    keywords: ['agency letter', 'information request', 'ir', 'crl', 'deficiency letter', 'fda letter', 'log communication', 'correspondence', 'upload letter'],
    surfaces: ['project-home', 'communication-center'],
    related: ['the-agency-inbox', 'record-questions-and-commitments', 'the-six-steps-of-a-project'],
    checked: '2026-11-12',
    body: `A letter from the agency is kept in two places at once: the project's data room, as a source AnA can read, and the project's agency inbox, where its answer is tracked.

**Upload the letter on the project**

1. Open the project and go to **Respond**.
2. Under **Add the agency's letter**, choose **The submission this letter concerns**, or leave it as "Not linked to a submission". A project with one submission is linked to it for you.
3. Select **Choose the letter file** and pick the file.

The page confirms that the letter is in the data room and logged in the agency inbox below. If the upload worked and the logging did not, it says so and offers **Log it again**.

The letter is logged as response required, at medium urgency. Its due date and issues are not guessed from the file; set them when you triage it.

**Or log it in Communication**

Use this when you want to record the details yourself, or there is no file.

1. Open **Communication** from the left sidebar, with the project open.
2. Select **Log communication**.
3. Fill in the **Communication type**, **Source** and **Source channel**. Optionally choose the **Letter in the data room** and the **Submission it concerns**.
4. Set the **Urgency** and **Response required?**, and where the letter states one, the **Response due** date.
5. Select **Log communication**.

It is saved to the project's agency inbox with an audit entry. The confirmation says when a response task was created with it.

A letter logged in Communication shows on the project's Respond step, and one added on Respond shows in Communication.`,
  },
  {
    slug: 'the-agency-inbox',
    title: 'Work through the agency inbox',
    collection: 'respond',
    summary: 'The inbox lists each agency communication with its due date and status; triage it, draft the answer, and close it.',
    keywords: ['inbox', 'agency inbox', 'communication', 'triage', 'close letter', 'response required', 'due date', 'needs response', 'fda loop'],
    surfaces: ['communication-center', 'project-home'],
    related: ['add-the-agency-letter', 'record-questions-and-commitments', 'draft-and-approve-responses'],
    checked: '2026-11-12',
    body: `A project has one agency inbox. You reach it in two places, and both show the same record:

- on the project's **Respond** step, under **The agency's open communications**;
- in **Communication**, on the **Agency inbox** tab. Its tab shows how many are open.

In Communication, **Everyone** shows every communication and **Needs response** shows the ones waiting for an answer. When an open communication is marked critical, the top of the page names it and how long is left to respond.

**What each communication shows**

- its type and source, and **response required** where an answer is owed;
- its status;
- the channel it came by, the date received, and its response clock;
- "letter in the data room" when the letter's file is linked, and the submission it concerns;
- the issues recorded on it, and its response task.

**What you can do on one**

- **Draft response with AnA** asks AnA to draft the answer. When the letter's file is linked, AnA works from the letter itself. When none is linked, AnA is told to work only from what is recorded and to say what the letter would be needed for.
- **Questions & responses** opens the letter's questions, each with its response and approval.
- **Triage** moves a new communication on from pending review. After that the button reads **Close letter**. Each change is recorded with an audit entry. If the letter cannot be closed yet, the reason is shown and nothing is stored.

Communication's other tabs are **FDA loop** (the project's submission items), **Meetings & commitments** and **Authority profiles**.

An inbox belongs to a project. With no project open, Communication asks you to open one from Projects.`,
  },
  {
    slug: 'record-questions-and-commitments',
    title: "Record a letter's questions and commitments",
    collection: 'respond',
    summary: 'Questions and commitments found in the letter’s text are proposed for you to check and record; nothing is recorded for you.',
    keywords: ['question', 'deficiency', 'commitment', 'pmr', 'pmc', 'rems', 'postmarketing', 'proposed', 'record question', 'owner', 'withdraw question', 'fulfilment'],
    surfaces: ['communication-center', 'project-home'],
    related: ['the-agency-inbox', 'draft-and-approve-responses', 'add-the-agency-letter'],
    checked: '2026-11-12',
    body: `Open a letter's **Questions & responses** in the agency inbox, on the project's Respond step or in Communication.

**Questions proposed from the letter**

When the letter's file is in the data room and its text has been read, the numbered questions found in it are listed. They are found in the text by rules, without AI. Where a letter numbers no question, the deficiencies found in it are listed instead.

1. Check a proposed question against the letter.
2. Select **Record**. The **Record a question** form opens with the number and text filled in.
3. Check the **Question number** and **Question text**, set the **Discipline** and **Severity**, and add the **CTD section** if the question cites one.
4. Give a **Reason** and select **Record question**.

If the letter's text could not be read, the page says so. Select **Record question** and enter each question as the agency numbered and worded it.

**On a recorded question** you can **Set owner** (who prepares the response), **Record section**, or **Withdraw question** if it was recorded in error. A withdrawn question stays in the record, needs no response and is left out of the response package. Each of these asks for a reason.

A letter that asks nothing can be marked with **Mark as needing no response**.

**Commitments**

- Commitments a letter imposes are proposed the same way: check each, then **Record** it with its type, due date and reason.
- A commitment made in an answer is recorded from that question with **Record commitment**, so it names the question.

Recorded commitments are tracked with their due dates in Communication under **Meetings & commitments**, and on the project's Respond step under **Commitments to the agency**. **Record fulfilment** records how one was met.`,
  },
  {
    slug: 'draft-and-approve-responses',
    title: 'Draft, approve and package the responses',
    collection: 'respond',
    summary: 'Write each response in the editor, approve it by e-signature, then download the response package and start the response sequence.',
    keywords: ['response', 'answer', 'draft', 'approve response', 'e-signature', 'response package', 'docx', 'response sequence', 'changed after approval'],
    surfaces: ['project-home', 'communication-center', 'submission-center'],
    related: ['record-questions-and-commitments', 'the-agency-inbox', 'build-an-ectd-sequence'],
    checked: '2026-11-12',
    body: `Each recorded question takes one response and one approval. Its state is shown beside it: No response, Draft, Approved, or Changed after approval.

**Draft with AnA.** On the letter, select **Draft response with AnA**. AnA is asked to answer each question the letter asks, quoting the question, and to use no question number or due date the letter does not state. Check every question number and due date in the draft against the letter before it goes to review.

**Write or edit a response**

1. In **Questions & responses**, select **Write response** (or **Edit response**) on the question.
2. Select **Open response in editor** and write the answer in the document editor. Save it there.
3. Back on the question, select **Refresh saved response** and read the preview.
4. Give the **Reason for this change** and select **Use saved editor response**.

Every text is kept as a revision under **History**, with who wrote it and why.

**Approve.** Select **Approve response** and sign. Your signature binds the question and the exact response text shown. If the text changes afterwards, the question reads **Changed after approval** and needs a new signature. If you cannot sign, the reason is shown beside the button.

**Download the package.** When every response is approved, select **Response package (.docx)**, or **Markdown**. Until then the page lists the questions still outstanding.

**Start the response sequence**

1. On the project's **Respond** step, under **Start a response sequence**, choose **The market the letter came from** if the project has more than one.
2. Select **Start a response sequence in Submission Center**. Submission Center opens on that submission's **Sequences** tab with the next sequence's type set to response. You create it there.

The response is then reviewed and placed in the sequence like any other document.`,
  },
];
