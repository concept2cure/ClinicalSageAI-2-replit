import type { HelpArticle } from '../types';

/** Work areas. Written from each work area's screens on 2026-11-12. */
export const WORK_AREAS_ARTICLES: readonly HelpArticle[] = [
  {
    slug: 'work-areas-and-locked-features',
    title: 'Work areas, and what a lock on one means',
    collection: 'work-areas',
    summary: 'The sidebar lists the work areas; one your subscription does not include shows a lock and opens a panel that says why and what to do.',
    keywords: ['locked', 'lock icon', 'subscription', 'plan', 'tier', 'upgrade', 'not included', 'ask an administrator', 'access request', 'turned off'],
    surfaces: ['cmc', 'biostatistics', 'rbm', 'quality', 'insights', 'apps', 'licensing', 'access-requests'],
    related: ['cmc-module-3-work-area', 'biostatistics-work-area', 'risk-based-monitoring-work-area', 'reporting-and-analytics', 'what-is-concept2cure'],
    checked: '2026-11-12',
    body: `The left sidebar lists the places everyone uses (Home, Projects, Tasks, Communication, Vault, Submission Center) and, under **Work areas**, the specialist areas: **CMC / Module 3**, **Biostatistics**, **Risk-based monitoring**, **Quality** and **Reporting & analytics**.

**A lock beside a work area** means your organisation cannot open it at present. The entry stays selectable. Hovering over it gives the short reason, and selecting it opens a panel instead of the screen. The panel names the work area and states the reason:

- **Included from** a named subscription: your subscription does not include the feature.
- **Turned off for this workspace**: an administrator disabled it for your organisation.
- **Not offered for this workspace**: it is not part of the catalogue for your workspace's industry setting.

**If you are a member**

1. Add a note under **Why you need it** (optional).
2. Select **Ask an administrator**.

The request goes to your organisation's administrators. The panel then shows the date you asked, and does not offer a second request while the first is open. If the request is declined, the panel shows the date and the reason given. If it is approved and the work area is still locked, reload the page.

**Compare subscriptions** in the same panel opens the subscriptions page.

**If you are an administrator**

The panel offers the step that resolves the reason: **Compare subscriptions** for a subscription gap, or **Turn it back on in Subscription & features** for a feature that was switched off. Members' requests arrive under **Access requests**.

The same lock and panel appear when you reach a locked work area through search.

Inside Reporting & analytics, a single report can be locked in the same sense: its tile names the plan that includes it.`,
  },
  {
    slug: 'cmc-module-3-work-area',
    title: 'What the CMC / Module 3 work area holds',
    collection: 'work-areas',
    summary: 'The quality records kept while the study runs, and the Module 3 sections composed from them, as nine tabs in the order the work is done.',
    keywords: ['cmc', 'module 3', 'chemistry manufacturing controls', 'specifications', 'stability', 'batch records', 'drug substance', 'drug product', 'quality by design', '3.2.S', '3.2.P'],
    surfaces: ['cmc'],
    related: ['build-and-place-module-3', 'work-areas-and-locked-features'],
    checked: '2026-11-12',
    body: `Open **CMC / Module 3** under **Work areas**. It holds Module 3 for the open project's filing, and the quality records kept while the study runs. Most of it is per project: with no project open, a tab asks you to open one.

The tabs are in the order the work is done.

- **Overview**: how far Module 3 has got and what is blocking it. **Section approvals** lists each section with its completeness and state.
- **Substance & product**: the active substance and the finished product. How each is manufactured, its materials and reference standards, its impurities and its container.
- **Specifications**: each attribute's release and shelf-life limits with the analytical method behind them. A specification is approved under your signature.
- **Stability**: each study with its storage condition and batches, its results by timepoint, and the shelf life those results support.
- **Batch records**: each batch with its yield and deviations, released under your signature.
- **Change control**: changes to the substance, product or process, and the Module 3 sections that read the evidence each one touches.
- **Quality by design**: the control strategy and the ICH check over these records.
- **Module 3 build**: compile the sections, resolve contradictions, approve and export.
- **Approvals & audit**: who did what, and the agency's questions about Module 3.

Under the title, the first starter asks AnA "What do I do on" the open tab; the others are suggestions for that tab. Figures such as completeness, shelf life and the export verdict come from the engines over your records. AnA explains them.

**Which projects it composes.** Module 3 is composed here for a small-molecule drug filed as a US IND. For another kind of project, **Module 3 build** says that Module 3 is not composed here for this project, in the server's words, and offers no retry.

If the sidebar shows a lock beside CMC / Module 3, your subscription does not include it.`,
  },
  {
    slug: 'build-and-place-module-3',
    title: 'Compile Module 3, approve its sections and place it into a submission',
    collection: 'work-areas',
    summary: 'Compile the sections from the study records, clear contradictions, approve each section under signature, pass the export gate, then place it into an IND sequence.',
    keywords: ['compile module 3', 'contradiction sweep', 'export gate', 'approve section', 'place into submission', 'ind sequence', 'ectd', 'export readiness'],
    surfaces: ['cmc', 'ectd-compile'],
    related: ['cmc-module-3-work-area', 'work-areas-and-locked-features'],
    checked: '2026-11-12',
    body: `Open the project, then **CMC / Module 3** and its **Module 3 build** tab.

**1. Compile.** Select **Compile Module 3**. The sections are compiled from the study records on the other tabs.

**2. Sweep for contradictions.** Select **Run contradiction sweep**. **Contradictions** lists what the sweep found; until a sweep has run it says "Not swept yet". Resolve each one and record the resolution.

**3. Approve each section.** On the **Overview** tab, **Section approvals** lists every section with its completeness, its state and any inputs it is missing.

1. Select **Approve section** on a section's row. An incomplete section cannot be approved; **Open the build board** takes you back to record what is missing and recompile.
2. Choose the **Meaning of signature**, give a **Reason**, and enter your **Password** and, if you use one, your **Authenticator** code.
3. Select **Sign & approve**.

The signature, its meaning and your reason are recorded in the audit trail.

**4. Check the export gate.** Back on **Module 3 build**, **Export readiness** shows how many sections are approved, how many went stale after approval, and how many critical contradictions are open. Select **Check export gate**. The result is either "Final export gate passed" or "Final export refused" with the reason.

**5. Place it into the submission.** When the module is export ready:

1. Choose the submission and its **Sequence**.
2. Give the **Reason for this placement**.
3. Select **Place into the submission**.

Each approved section becomes a leaf of that IND sequence. Placing again into the same sequence updates its leaves; into a later sequence, they are filed as replacements. **Open the eCTD assembly** then takes you to the sequence's compilation.`,
  },
  {
    slug: 'risk-based-monitoring-work-area',
    title: 'What Risk-based monitoring holds, and how to start it for a project',
    collection: 'work-areas',
    summary: 'The study’s risk assessment, indicators, tolerance limits, central monitoring, site risk and monitoring plan, read from one board per project.',
    keywords: ['rbm', 'rbqm', 'ich e6', 'ract', 'kri', 'qtl', 'central monitoring', 'site risk', 'monitoring plan', 'patient profiles'],
    surfaces: ['rbm'],
    related: ['work-areas-and-locked-features', 'biostatistics-work-area', 'tasks-board'],
    checked: '2026-11-12',
    body: `Open **Risk-based monitoring** under **Work areas**. It covers risk-based quality management for a study under ICH E6(R3).

**Choose the project.** The **Project** selector at the top lists the projects that have monitoring. Another project is never opened automatically.

**The tabs**

- **Overview**: what needs attention across the indicators, limits and signals.
- **Risk review report**.
- **Risk assessment (RACT)**: the critical-to-quality factors and their risk scores.
- **Key risk indicators** and **Quality tolerance limits**.
- **Central monitoring**: the open signals.
- **Patient profiles**: subjects flagged for review.
- **Site risk** and **Site oversight**.
- **Monitoring plan**.

Every score is engine output, and the number behind each status is shown. **Linked to** opens the project, the Vault, Tasks and Biostatistics for the same project.

**Start monitoring for a project**

1. Open the project, then open **Risk-based monitoring**.
2. If the page says "Risk-based monitoring has not started for this project", select **Start risk-based monitoring**.

Starting records the default ICH E6(R3) risk assessment for the project, ready to tailor. No indicator, limit or score is recorded until you add or seed it.

**Seed the rest.** A tab with nothing recorded offers the step that fills it, for example **Seed the standard KRI library**, **Propose quality tolerance limits**, **Recompute site risk** or **Generate a risk-based monitoring plan**. Each one writes the defaults for this study, which you then tailor.

**AnA.** This work area has its own conversation with AnA, scoped to the selected study. Each tab offers starters such as "Which KRIs are amber or red right now".

If the board cannot be read, the page says so and offers a retry. It does not show sample data in its place.`,
  },
  {
    slug: 'biostatistics-work-area',
    title: 'What the Biostatistics work area holds',
    collection: 'work-areas',
    summary: 'Size and judge a study design on the statistical engine, run the design calculators, and write the statistical documents the design needs.',
    keywords: ['biostatistics', 'sample size', 'power', 'sap', 'statistical analysis plan', 'calculator', 'defensibility', 'dsmb charter', 'interim analysis', 'randomization'],
    surfaces: ['biostatistics'],
    related: ['size-a-design-and-open-its-document', 'work-areas-and-locked-features'],
    checked: '2026-11-12',
    body: `Open **Biostatistics** under **Work areas**. Every number on this page is computed by the statistical engine on the server. AnA refines the wording of a document; she does not produce the figures.

**The page, from the top**

- **Study design**: the project's saved study designs. Select one to load it into the engine.
- **Document**: the statistical document to produce, grouped as Design, Analysis, Reporting and Governance. The list includes the Sample Size Rationale, the Statistical Analysis Plan, the Protocol Statistical Section, the Interim Analysis Plan and the DSMB / DMC Charter.
- **Design inputs**: the track, agency, study type, endpoint, alpha, power and the values that endpoint needs. The engine re-sizes the design as you change them and shows the subjects, the power, its verdict, and the method and formula it used.
- The document itself, beside the inputs, regenerated whenever the design changes.
- **Statistical documents for this project**: the documents already saved.
- **Statistical defensibility**: a reviewer-risk assessment of a design.
- **Design calculators**: a set of deterministic calculators. Choose one, enter its inputs and select **Compute**.

**Worked examples.** The preset buttons in Design inputs load worked examples. Each is marked as a worked example, not your study, and the document says the same until you load your own design.

**AnA.** The starters under the title ask whether your sample size is defensible and what a reviewer will question first.

If the engine cannot size a design, the page says so and shows no document for it.

If the sidebar shows a lock beside Biostatistics, your subscription does not include it.`,
  },
  {
    slug: 'size-a-design-and-open-its-document',
    title: 'Size a study design and take its document into the editor',
    collection: 'work-areas',
    summary: 'Load the study design, choose the document, set the design inputs, then open the document in the editor.',
    keywords: ['sample size rationale', 'open in editor', 'statistical document', 'design inputs', 'sap section', 'worked example', 'save working document'],
    surfaces: ['biostatistics', 'document-authoring'],
    related: ['biostatistics-work-area'],
    checked: '2026-11-12',
    body: `Open the project, then **Biostatistics**.

1. Under **Study design**, select the design to load into the engine.
2. Under **Document**, choose what to produce, for example **Sample Size Rationale** or **Statistical Analysis Plan**.
3. Under **Design inputs**, set the **Track**, **Agency**, **Study type** and **Endpoint**, then **Alpha**, **Power** and the values the endpoint needs (an effect size, rates, a margin), **Attrition** and **Interims**.
4. Read the engine's result under the inputs: the number of subjects, the power, and its verdict on the design, with the method and formula used. Any warning is listed there.
5. Read the document beside the inputs. It is regenerated from the design each time an input changes. The line above it names the engine version.
6. Select **Open in editor**. The document is saved and opens in the document editor.

**Other actions on the document**

- **Refine with AnA** asks AnA to refine the wording of the chosen document.
- **Save as a working document** saves it without opening the editor. It then appears under **Statistical documents for this project**.

**If you are looking at a worked example.** The button reads **Copy example to editor**, and the document is marked as a worked example, not your study. Load your own design under **Study design** to size your study.

**If the button is unavailable.** A notice under the starters says why the document cannot be taken to the editor. When the engine did not size the design, the page says "No document — the design was not sized". The engine's reason is beside the design inputs.`,
  },
  {
    slug: 'reporting-and-analytics',
    title: 'What Reporting & analytics holds',
    collection: 'work-areas',
    summary: 'Governed reports for one project, built singly or as a standard pack, with their run history, schedules and bundles.',
    keywords: ['reports', 'analytics', 'readiness', 'standard pack', 'catalog', 'run history', 'schedules', 'bundles', 'dashboard', 'portfolio'],
    surfaces: ['insights', 'compliance-reports'],
    related: ['run-an-audit-and-compliance-report', 'work-areas-and-locked-features'],
    checked: '2026-11-12',
    body: `Open **Reporting & analytics** under **Work areas**. Its reports run over one project. Every value is computed from the governed record; nothing is estimated.

**Choose the project.** With no project open, the page asks "Which project is the report for?" and lists your organisation's projects. The one you choose stays open everywhere, as it does from Projects.

**The views**

- **Reports**: the **Standard packs** for your client type. A pack is a fixed set of governed reports; its card says what it is for and how many reports it holds.
- **Catalog**: every report type, to run one at a time.
- **Run history**: the reports that were run.
- **Schedules** and **Bundles**.

**Build a report**

- Select **Build the** pack named at the top right, or a card under **Standard packs**.
- Or use **Find a report**: type a report type, a market or a question, and select **Find**. The suggestions under the field run the same search. This is a search, not a conversation with AnA.

**What you may see instead of a report**

- **A lock on a report tile**, naming a plan: your subscription does not include that report.
- **View only**: running a governed report needs an editor role in your organisation.
- "has no readiness or reports here yet": the open project has no tracking record that readiness is computed from. Nothing from another project is shown in its place.

**Audit & compliance reports**, at the top right, opens the organisation-wide reports drawn from the audit trail and the organisation's own records. They do not need a project.

If the reporting page cannot be read, it says so and offers a retry.`,
  },
  {
    slug: 'run-an-audit-and-compliance-report',
    title: 'Run an audit and compliance report',
    collection: 'work-areas',
    summary: 'Choose a report, set its period and select Run report; the result is sealed and the run is recorded on the audit trail.',
    keywords: ['audit report', 'compliance report', 'audit trail report', 'inspection', 'period', 'sealed report', 'verify report', 'attestation'],
    surfaces: ['compliance-reports', 'insights'],
    related: ['reporting-and-analytics'],
    checked: '2026-11-12',
    body: `Open **Reporting & analytics** and select **Audit & compliance reports** at the top right. These are deterministic reports drawn from the organisation's own records.

1. Choose a report. Each card says what the report is for and what it is based on. The panel below lists its sections.
2. Set the period: **From** and **To** for a report over a range, or **As of** for a report at a date. Dates are UTC and inclusive.
3. Select **Run report**.

The result appears below. The report is sealed when it is run, and the run is recorded on the audit trail.

**If you cannot run reports.** A notice with a lock says who can, both above the cards and where the period form would be. You can still read what each report covers.

**If the run is refused.** The page shows the reason in place of a result: for example a period the report does not accept, or something the report needs that is not recorded. It does not show an empty report.

**Verify a saved report**, at the bottom of the page, takes a report saved from this screen and checks that its data still matches its seal.

**Company letterhead & legal documents**, at the top right, opens your organisation's setup.`,
  },
  {
    slug: 'tasks-board',
    title: 'Use the Tasks board',
    collection: 'work-areas',
    summary: 'Tasks lists every task across your projects, each labelled with where it came from, as a board, a critical path, analytics or a table.',
    keywords: ['tasks', 'task board', 'kanban', 'my tasks', 'critical path', 'new task', 'workflow', 'to do', 'blocked', 'archive task'],
    surfaces: ['tasks'],
    related: ['assign-work', 'the-six-steps-of-a-project', 'read-and-acknowledge-training'],
    checked: '2026-11-12',
    body: `Open **Tasks** in the left sidebar. It lists every task across your projects: the work planned on the board, and the work that comes from the project schedule, agency correspondence, tracked filings and Quality. **Where these tasks come from** counts them by source.

**Find your work**

- **All projects** and **All modules** filter the board.
- **My tasks** shows only the tasks assigned to you. Opened from the sidebar, the board shows everyone's.
- The summary at the top says what stands on the critical path and what is overdue.

**The four views**

- **Board**: columns for **To do**, **In progress**, **Blocked**, **In review** and **Done**.
- **Critical path**: the tasks that gate the milestone.
- **Analytics** and **Table**.

**Create a task**

1. Select **New task**.
2. Enter the **Title** and **Description**, and choose the **Project**, **Module**, **Task type**, **Priority**, **Status**, **Assignee** and **Due date**.
3. Set the flags that apply: **Critical path**, **Regulatory impact**, **Approval required**.
4. Select **Create task**.

**Start workflow** creates a set of tasks from a template for a project.

**Work a task.** Select a task to open it.

- **Advance** moves it to the next column; **Move back** returns it.
- A task that belongs to a document, a Quality record or a filing has a button that opens it where it lives, for example **Read and acknowledge** for a training task.
- Archiving a task removes it from the board and needs a reason. It cannot be restored from the board.

Advancing, moving back and archiving are recorded in the audit trail with your identity. A task marked **Approval required** is completed with your electronic signature.

**View only.** Creating and changing tasks needs an editor role in your organisation. Without it, the page says so and the tasks stay readable.`,
  },
];
