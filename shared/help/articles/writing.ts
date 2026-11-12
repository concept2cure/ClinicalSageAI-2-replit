import type { HelpArticle } from '../types';

/** Writing documents with AnA. Written from the editor's and the Author step's code and checked on 2026-11-12. */
export const WRITING_ARTICLES: readonly HelpArticle[] = [
  {
    slug: 'start-a-document',
    title: 'Start a document',
    collection: 'writing',
    summary: 'Create a working copy from a template on the Plan step, start one in the editor, or ask AnA to draft it.',
    keywords: ['new document', 'create document', 'template', 'working copy', 'blank document', 'find or start a document'],
    surfaces: ['project-home', 'document-authoring'],
    related: ['the-document-editor', 'draft-a-section-with-ana', 'assign-work'],
    checked: '2026-11-12',
    body: `Every document starts from its project. There are three ways.

**From a template, on the Plan step**

1. Open the project's **Plan** step and find the document under **What this filing needs**.
2. Select it to expand it. It shows what the document is and the template's limits.
3. Select **Create from template**. A working copy is created in the project.
4. Select the button that opens it. The document opens in the editor.

If the project already holds a working copy, the entry offers **Open …** with the document's name instead, so you do not create a second one.

**In the editor, from the Author step**

1. Open the project's **Author** step and select **Find or start a document in the editor**.
2. The editor opens with the project's documents in its outline. Select one to open it.
3. To start a new one, open **More** and choose **New document…**. Give the **Document title**, the **CTD module** if it has one, and what to **Start from**.

A project with no documents says so and offers the same two starts: create one, or **Ask AnA to draft**.

**With AnA.** Select **Work with AnA** on a document under What this filing needs, or ask in the composer at the top of the project page. AnA drafts into a working document, which appears in the conversation and opens in the same editor.

Documents you start are listed under **Documents** on the Author step, each with its status and **Open**.`,
  },
  {
    slug: 'the-document-editor',
    title: 'The document editor',
    collection: 'writing',
    summary: 'One editor for every document type: the outline, the section you are writing, and the panels for review, versions and filing.',
    keywords: ['editor', 'canvas', 'outline', 'section view', 'document view', 'save', 'reason for change', 'toolbar', 'frozen', 'read only'],
    surfaces: ['document-authoring'],
    related: ['start-a-document', 'draft-a-section-with-ana', 'versions-and-revision-history', 'send-a-document-for-review'],
    checked: '2026-11-12',
    body: `Every document type is written in the same editor. It opens from a document's **Open** button on the Author step, and beside the conversation when AnA drafts a document.

**The bar** shows the document's title, its status, the open section's version (for example "v3") and whether your changes are saved.

- **Section** and **Document** switch between editing one section and reading the whole document.
- The outline on the left lists the document's sections. The button at the far left hides or shows it.
- The **AnA** menu drafts and reviews. See "Draft a section with AnA".
- **Comments**, **Versions**, **Review tasks**, **Signatures** and **Audit trail** each open a panel beside the page.
- **Send for review…** and **File to vault…** start those acts.
- **More** holds **Sources**, **Vault**, **Exports** and **Access**, and **New document…** and **New section…**.

On a phone-width screen the panels and acts are all under **More**.

**Saving.** There is no autosave. When a section has changes, a field appears under the bar: **Why this changed**. Enter at least 8 characters and select **Save**. The reason is recorded with the revision. Until you save, the bar says "Unsaved changes — on this device only".

**When you cannot edit.** The Save button reads **Read only** when your access does not allow editing, and **Frozen** when the document has been frozen; hovering over it gives the reason.

**Formatting.** The ribbon above the text has paragraph styles, bold, italic and underline, lists, links, tables, find and replace, **Cite**, a cross-reference to another section, and **Track changes**.`,
  },
  {
    slug: 'draft-a-section-with-ana',
    title: 'Draft a section with AnA and cite its sources',
    collection: 'writing',
    summary: 'AnA drafts in the conversation or from the data room; her text arrives as a suggestion or a draft you accept, and Cite links text to a source.',
    keywords: ['ai draft', 'generate', 'draft with ana', 'draft from sources', 'review with ana', 'accept draft', 'grounding', 'citation', 'reference list', 'cite', 'ask for a source'],
    surfaces: ['document-authoring'],
    related: ['track-changes-and-alternatives', 'add-sources-to-the-data-room', 'find-and-open-project-files', 'meet-ana'],
    checked: '2026-11-12',
    body: `Open the section in the editor and open the **AnA** menu on the bar. AnA's text never replaces yours on its own: you accept it, or it waits as a tracked change.

**Draft with AnA** asks in the conversation. When AnA answers, select **Insert into … as tracked suggestion** under the answer. The text goes into the open section as suggestions you accept or reject, and then save.

**Draft from sources** drafts the section from the project's data room.

1. Choose the **Tone** and the **Region**. Add **Context** and **Requirements** if they help.
2. Select **Draft section**, or **Draft three alternatives** for a professional, a concise and a detailed text.
3. Read the result. A line above it says how many data room sources it was drafted from and how many can carry citations. If no source was relevant enough, it says the draft is not grounded in your evidence.
4. Edit the proposed content if you want to.
5. Select **Accept and record citations**. The section is saved with the source passages behind the text recorded. **Draft again** replaces the draft; **Discard** drops it.

Nothing is saved until you accept. Save your own unsaved changes first: accepting replaces the section's content.

AnA does not supply figures. The check on a draft names any figure the sources shown do not hold.

**Cite a source yourself.** Put the caret where the citation belongs and select **Cite** on the ribbon. Choose the source, add a page or table if you want one ("p. 142, Table 3"), and select **Insert**. The citation is numbered and the source joins the document's reference list. **Ask for a source** only asks AnA to suggest one; it does not insert a citation. **Sources**, under **More**, lists what the section cites.

**Review with AnA** has four asks: **Review section**, **Review document**, **Reconcile project evidence** and **Prepare targeted fixes**. AnA reads the saved record, and her fixes remain tracked changes for your review.`,
  },
  {
    slug: 'track-changes-and-alternatives',
    title: 'Track changes, suggested edits and alternatives',
    collection: 'writing',
    summary: 'Track changes turns edits into attributed suggestions; Offer alternatives has AnA draft up to three replacements for a passage.',
    keywords: ['track changes', 'suggestions', 'redline', 'accept', 'reject', 'alternatives', 'rewrite', 'rephrase', 'tracked change'],
    surfaces: ['document-authoring'],
    related: ['draft-a-section-with-ana', 'versions-and-revision-history', 'resolve-comments-and-threads'],
    checked: '2026-11-12',
    body: `**Track changes.** Tick **Track changes** on the ribbon. From then on, text edits within a paragraph are captured as suggestions under your name instead of being applied. Structural changes (joining or splitting paragraphs, table changes) and formatting apply directly and are not tracked.

**Review suggested edits**

1. When a section holds suggestions, the ribbon shows a count, for example **3 suggested edits**. Select it.
2. The **Suggested edits** strip lists each one. Select an entry to see it in the text.
3. Choose **Accept** or **Reject** for each, or **Accept all** or **Reject all**.
4. Save the section with your reason for change.

Text AnA adds from the conversation arrives the same way, attributed to AnA.

**Offer alternatives for a passage**

1. Select the passage and choose **Offer alternatives** on the ribbon.
2. Select **Draft three alternatives for this passage**. AnA drafts a professional, a concise and a detailed replacement for that passage only.
3. Compare them with the saved section, and choose one. It is added to the editor as a tracked change. Nothing is saved or accepted until you decide there.

**Alternatives for a whole section.** After **Draft three alternatives** under Draft from sources, each alternative is a separate draft with its own check. You can accept a whole alternative, which records its citations, or choose paragraphs and select **Add chosen paragraphs as tracked changes**. Paragraphs added that way carry no source citations.

To change a draft, type an instruction under **Your instruction**. The revision is a new draft listed under **Alternatives**; the text it revises is kept.`,
  },
  {
    slug: 'versions-and-revision-history',
    title: 'See a section’s versions and revert to one',
    collection: 'writing',
    summary: 'Every save is a revision with its author and reason; Versions shows the history, verifies it, and reverts.',
    keywords: ['version', 'history', 'revision', 'revert', 'restore', 'undo', 'ledger', 'compare', 'redline', 'audit trail'],
    surfaces: ['document-authoring'],
    related: ['the-document-editor', 'track-changes-and-alternatives', 'module-completion-on-the-author-step'],
    checked: '2026-11-12',
    body: `Each save of a section records a new revision, with who saved it and the reason they gave. The bar shows the open section's version, for example "v3".

**Open the history.** Select the version on the bar, or **Versions**. The **Revision history** panel lists the section's revisions, newest first. Each shows:

- the author and when it was saved;
- how the revision came about: created, edited, AI draft accepted, reverted or template applied;
- the start of its ledger link;
- the word-level changes against the revision before it.

**Verify the history.** Select **Verify ledger**. The revisions are linked in a chain, and this recomputes the whole chain from the stored content. The panel then says the ledger is intact and how many revisions were verified, or names where it is broken. If the check itself could not run, it says that; a failed check is not a verdict about the record.

**Revert**

1. Find the revision you want.
2. Select **Revert** on it.
3. The section's content is replaced with that revision's, and the revert is recorded as a new revision. Earlier revisions stay in the history.

Revert is unavailable when your access is read-only or the document is frozen.

**Audit trail** on the bar lists the events recorded on the document. **Download working copy (Word)**, under **More** on a narrow screen, gives you the current working text as a file.`,
  },
  {
    slug: 'module-completion-on-the-author-step',
    title: 'Read module completion on the Author step',
    collection: 'writing',
    summary: 'Module completion counts the sections approved or locked in each module, and each row opens the document it measures.',
    keywords: ['module completion', 'dossier readiness', 'progress', 'percent complete', 'ctd module', 'approved or locked', 'section status'],
    surfaces: ['project-home'],
    related: ['start-a-document', 'the-review-step', 'the-six-steps-of-a-project'],
    checked: '2026-11-12',
    body: `Open the project's **Author** step. Under **Documents** is **Module completion**: sections approved or locked, by module.

**Dossier readiness** leads it. It is the share of the project's own filing sections that are approved or locked. Empty headings that only hold other sections are not counted. The line under it gives the count ("12 of 40 sections approved or locked") and how many are in review and drafted. A market added to the project is measured on its own line. **How this is measured** says the same, with the time it was measured.

**Each module row** shows the module, its count, a bar and its figure.

- Select a row to open the editing copy of the filing it measures, at that module. The line under the row names the document it opens.
- If no single document can be opened, the row says why: for example that no editing copy exists yet, or that several documents are bound to the filing.
- **Section status** lists each counted section as Approved, Locked, In review, Drafted or Empty.

**What moves the figure.** A section counts once it is approved or locked. Drafting and review are shown, but do not count as complete.

The figures are counted by the server from the project's records. If the read fails, the step says so and shows no module as complete or not; a project with no sections yet says "No document sections yet".

**Ask AnA: critical path to filing** asks AnA what stands between the project and filing.`,
  },
];
