import type { HelpArticle } from '../types';

/** Submission Center and eCTD. Written from the screens' code on 2026-11-12. */
export const SUBMISSION_ARTICLES: readonly HelpArticle[] = [
  {
    slug: 'add-a-market',
    title: 'Add a market to a project',
    collection: 'submission',
    summary: 'A market is one submission: one application type to one agency. Add it from the project’s Submit step.',
    keywords: ['market', 'region', 'second agency', 'new submission', 'maa', 'ema', 'fda', 'country', 'application number'],
    surfaces: ['project-home', 'submission-center'],
    related: ['the-six-steps-of-a-project', 'find-your-way-around-submission-center', 'build-an-ectd-sequence', 'assemble-a-device-estar'],
    checked: '2026-11-12',
    body: `A market is one submission: an application of one type to one agency, for example "IND · FDA (US)". A project can have several. Each is listed on the project's **Submit** step under **Markets**, with its latest sequence and whether that sequence is cleared to dispatch.

**To add a market**

1. Open the project and go to **Submit**.
2. Select **Add a market**. Submission Center opens on **Create a submission**, with the project already named.
3. Give the submission a **Title**.
4. Choose the **Application type** and the **Primary region**. Each region is labelled with what the platform supports for that application type; a region that is not offered cannot be chosen. A market the project already has is not preselected.
5. Check the **Client type**.
6. Give the **Reason for adding this market**. It is recorded with the market.
7. Select **Create submission**.

Adding the market writes its Module 1 and 3.2.R to the project, adds it to the project's markets, and creates its submission. Its sequences are created inside the submission.

**Who can add one.** Only the project's lead or an organisation manager. For anyone else **Add a market** is unavailable, and the page says why.

**After it is added.** The market's row offers **Build the … sequence in Submission Center**. Its application number is recorded on the row with **Record the number**, and a reason.

**Device and diagnostic projects** file on their own pathways, so **Add a market** is not offered there. Submit shows the pathway's own action instead, for example **Assemble the eSTAR** for a 510(k). A project that is authored here and filed elsewhere shows no market and says so.`,
  },
  {
    slug: 'find-your-way-around-submission-center',
    title: 'Find your way around Submission Center',
    collection: 'submission',
    summary: 'Submission Center lists your submissions and works one sequence at a time through its tabs.',
    keywords: ['submission center', 'submissions', 'planner', 'builder', 'sequences', 'validation', 'shadow review', 'dispatch', 'tabs', 'workspaces'],
    surfaces: ['submission-center'],
    demoScript: 'training-submission-day',
    related: ['add-a-market', 'build-an-ectd-sequence', 'when-a-sequence-is-cleared-to-dispatch'],
    checked: '2026-11-12',
    body: `Open **Submission Center** from the left sidebar, or from a project's **Submit** step with **See every sequence in Submission Center**. Opened from a project, it lists that project's submissions.

**Submissions** is the list: each submission's title, project, region, type, client and status (Planning, Active, Submitted or Archived). Select a row to work on it. **New submission** creates one; a submission always belongs to a project.

The other tabs work on the submission you selected, and most of them on one sequence of it, chosen in the **Sequence** picker:

- **Planner**: what the region requires for this application type: the agency, pathways, required Module 1 sections, agency forms and the gateway rules the package is checked against. If no profile is registered for a region, the tab says so; that is not a statement that nothing is required.
- **Builder**: the sequence's leaves, and where documents are placed.
- **Required deliverables**: which of the pathway's required deliverables are present or missing in this sequence.
- **Sequences**: every sequence of the submission and its stage, from Draft to Dispatched. Start a sequence here.
- **Validation**: the findings on the sequence.
- **Shadow review**: review runs on the sequence and their findings.
- **Dispatch**: whether the sequence is cleared to dispatch, and the signed steps that freeze and dispatch it.

For a device or diagnostic project, the Submissions tab also lists the device filings tracked on the eSTAR route, separately from eCTD submissions.

Three questions sit under the title for AnA: **Where does this submission stand?**, **What blocks dispatch?** and **Plan the next sequence**.`,
  },
  {
    slug: 'build-an-ectd-sequence',
    title: 'Build an eCTD sequence and place documents in it',
    collection: 'submission',
    summary: 'Start the sequence on the Sequences tab, then place each document as a leaf in the Builder, with a reason.',
    keywords: ['sequence', '0000', 'leaf', 'leaves', 'place', 'placement', 'section code', 'lifecycle operation', 'replace', 'append', 'amendment'],
    surfaces: ['submission-center', 'vault'],
    related: ['find-your-way-around-submission-center', 'when-a-sequence-is-cleared-to-dispatch', 'what-the-vault-controls'],
    checked: '2026-11-12',
    body: `A sequence is one delivery to the agency. Its documents are its leaves.

**Start a sequence**

1. In Submission Center, select the submission and open **Sequences**.
2. For a new submission, select **Start sequence 0000**. For a later one, choose its type (amendment, response, annual, variation or withdrawal) and select **Start sequence** with the next number, which is worked out for you.

Selecting a sequence's row makes it the working sequence for the other tabs.

**Place a project document**

1. Open **Builder**.
2. Select **Place a project document as a leaf**.
3. Under **Find a document**, search by title or module and choose the **Source document**.
4. Enter the **Section code**, for example 2.5 or m1.1.
5. Choose the **Lifecycle operation**. In an original sequence every leaf is New. In a later sequence, Replace, Append and Delete act on the leaf already filed for the same document in that section.
6. Where study tagging is asked for, record the study identity and file-tag your team reviewed.
7. Give the **Reason for this placement** (at least 8 characters).
8. Select **Place leaf in the sequence**.

Placing files a copy of the document's saved sections. Edits not yet saved do not travel with it.

**Place a file from the Vault.** Open the file's record in the Vault and select **Place into filing…**.

**Remove a leaf.** Select **Remove** on its row, give a reason, then **Remove leaf**.

Only approved documents are transmitted. A leaf whose document is not approved can be placed, but freeze and dispatch refuse it until it is.`,
  },
  {
    slug: 'when-a-sequence-is-cleared-to-dispatch',
    title: 'Check whether a sequence is cleared to dispatch',
    collection: 'submission',
    summary: 'Each sequence has one verdict, computed by the server: cleared to dispatch, or blocked, with what must close.',
    keywords: ['ready to send', 'readiness', 'dispatch readiness', 'validation', 'blocker', 'gate', 'findings', 'freeze', 'release signature', 'shadow review', 'submission readiness'],
    surfaces: ['project-home', 'submission-center', 'dispatch-readiness'],
    related: ['build-an-ectd-sequence', 'compile-and-download-a-sequence', 'find-your-way-around-submission-center'],
    checked: '2026-11-12',
    body: `Every sequence has one verdict on whether it can go out. It is computed on the server from the sequence's leaves and checks; nothing in it is a model's opinion. You see the same verdict in three places.

**On the project's Submit step.** Each market's row says one of:
- **Cleared to dispatch**, with a note of any check that was not assessed.
- **Dispatch blocked**, with the number of blockers. Under it, **What must close before dispatch** lists each thing in a sentence, for example "Place a document at section …" or "Approve …", with a button that opens where it is done. **Rule detail** shows the gates and rules behind them.
- **Clear except for the release signature**, which the dispatch e-signature applies.
- **No sequence yet**, or **No verdict** when a read failed. No verdict is never shown as cleared; select **Retry**.

**On the Validation tab** in Submission Center: the sequence's findings, each with its severity, section and rule. **Explain the findings (AI)** asks for a plain-language explanation; the findings stand on their own without it.

**On the Dispatch tab**: the question **Cleared to dispatch?**, answered Yes or Not yet, with what stands in the way.

**Freezing and dispatching**

A sequence moves Draft → Assembling → Validated → Frozen → Dispatched on the **Sequences** tab. The last two steps are signed:

1. At Validated, select **Freeze sequence (Part 11 e-signature)**.
2. At Frozen, select **Dispatch sequence (Part 11 e-signature)**.

Both stay unavailable while the gate blocks. The person who created the sequence cannot sign its freeze or dispatch; a different colleague with signing rights does. **Run dispatch QC** gives a checklist that never overrides the gate.`,
  },
  {
    slug: 'compile-and-download-a-sequence',
    title: 'Compile a sequence and download the package',
    collection: 'submission',
    summary: 'Validate and compile the eCTD, then download the package as a zip or its backbone XML.',
    keywords: ['compile', 'export', 'download', 'zip', 'package', 'backbone', 'index.xml', 'evalidator', 'history', 'ectd'],
    surfaces: ['ectd-compile', 'submission-center', 'project-home'],
    related: ['when-a-sequence-is-cleared-to-dispatch', 'build-an-ectd-sequence'],
    checked: '2026-11-12',
    body: `Compiling assembles a sequence into an eCTD package: its files, its backbone and their checksums.

**Open the compile screen**

- From a project's **Submit** step, select **Compile and download**. This compiles the submission of the project's own application type.
- For any other sequence, open it in Submission Center, go to **Dispatch** and select **Validate and compile this sequence**.

**Compile**

1. Check the **Region** and the submission type. When they are recorded on the sequence they are shown, not asked.
2. Select **Validate** to list the findings for that region, each with a suggested fix.
3. Select **Compile eCTD**.

The result says **Compilation complete** or **blocked**, counts errors and warnings, and says whether the package is submission-ready. If it is not, **Not yet submittable** lists why, in the server's words.

**Download**

1. Tick the confirmation of your review. It is your statement, sent with the export; it is not an e-signature.
2. Select **Download package (.zip)**.

**Download eCTD backbone XML** saves the backbone on its own. If no package was built, the backbone describes the authored content only and is a working document, not a sequence to transmit.

Below the result you can read the package's leaf hierarchy and lifecycle operations. **Compilation history** lists each compile. **Import eValidator report** attaches an agency validator's report to a compilation.

A package can also be downloaded from the **Dispatch** tab under **Package and transmit**. Until the sequence is frozen it is an inspection copy.

Device and diagnostic projects are not offered this screen; they are not filed as an eCTD sequence.`,
  },
  {
    slug: 'prepare-ind-forms',
    title: 'Prepare Forms 1571, 1572 and 3674 for an IND',
    collection: 'submission',
    summary: 'Build and check each FDA form from the project’s record, download its PDF, and attach the completed, signed form to a sequence.',
    clientTypes: ['biotech', 'pharma', 'cro'],
    keywords: ['1571', '1572', '3674', 'fda form', 'module 1', 'ind forms', 'cover letter', 'statement of investigator', 'clinicaltrials.gov certification'],
    surfaces: ['ind-checklist', 'project-home'],
    related: ['build-an-ectd-sequence', 'when-a-sequence-is-cleared-to-dispatch'],
    checked: '2026-11-12',
    body: `A US IND project offers its FDA forms on the **Submit** step: select **Prepare Forms 1571, 1572 and 3674 in IND forms**. Building the forms needs the regulatory-author role.

The **IND forms** screen shows the filing's module progress, its Module 1 forms and what blocks filing. The forms themselves are under **Build & render the FDA form PDFs**.

**Check the values.** The sponsor, drug and indication are read from the project's record. Add what the record does not hold, such as the IND number (blank for an original), the phase and the serial number.

**Build each form**

1. Select **Build & check** on the form's row. The field check says **required fields present**, or how many required fields are missing and which.
2. Select **PDF** to download the form.
3. Select **Save to dossier** to keep the built form with the project.

Some boxes on an official form are left for you to complete; the row says how many.

**Attach the completed form**

1. Complete and sign the form outside Concept2Cure.
2. Under "File completed, signed forms into", choose the **Target submission** and the **Sequence**. Nothing is filed until you choose.
3. Tick **I attest the file I attach is the completed, signed form**. It is recorded with the file, under your name and the time.
4. Select **Attach completed form** and choose the PDF.

Without the attestation the file is filed but not counted as the completed form: the platform cannot see a signature. An attached form counts as complete only when its recorded check found no required field missing.`,
  },
  {
    slug: 'assemble-a-device-estar',
    title: 'Assemble the eSTAR for a 510(k)',
    collection: 'submission',
    summary: 'A device project assembles its filing on the 510(k) and eSTAR screen, not as an eCTD sequence.',
    clientTypes: ['medtech', 'diagnostics'],
    keywords: ['estar', '510(k)', 'device', 'de novo', 'ivd', 'cdrh', 'predicate', 'tracked submissions', 'official estar'],
    surfaces: ['device-510k', 'project-home', 'submission-center'],
    related: ['add-a-market', 'find-your-way-around-submission-center'],
    checked: '2026-11-12',
    body: `A 510(k) is not filed as an eCTD sequence. On a 510(k) project's **Submit** step, select **Assemble the eSTAR**. The **510(k) and eSTAR** screen opens on the project.

**Write the sections.** **eSTAR sections** lists each section with its status and the number of blockers. Select a section to open it in the editor. Where AnA has a draft waiting for a section, the row shows it for you to accept or refine.

**Generate the official eSTAR**

1. Under **Official eSTAR**, read **Fields the template carries**. Governed values come from the project's records and are read-only. A value you enter there is written to this export only and is not stored.
2. Select **Generate official eSTAR (PDF)**. If it cannot be produced yet, the panel says **Not yet producible** and why.
3. Open the file in Adobe Acrobat and choose the submission type on the first page. The administrative sections stay hidden until the form reveals them.

**Export 510(k) package** is different: it downloads a draft zip of the section PDFs made from your authored content. It is not the official FDA eSTAR.

**Check filing readiness.** Under **eSTAR filing readiness**, mark each of the four FDA prerequisites your organisation holds with **Mark held**, and complete **Correspondent and declaration**. Under **Assess a submission**, choose Device or IVD and the submission; the result says whether it can file now, and what is missing.

**Track the filing.** After an assessment, select **Start tracking**. The filing appears under **Tracked submissions**, and in Submission Center. **Sign and file…** records the filing against the exact eSTAR that was produced, with your reason and signature.

Other device pathways have their own action on Submit, for example **Export the PMA package**.`,
  },
];
