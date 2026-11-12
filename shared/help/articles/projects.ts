import type { HelpArticle } from '../types';

/** Projects and the plan. Checked in the running app on 2026-11-12 (human test J1, docs/evidence/HUMAN-TEST/J1/). */
export const PROJECTS_ARTICLES: readonly HelpArticle[] = [
  {
    slug: 'create-your-first-project',
    title: 'Create a project',
    collection: 'projects',
    summary: 'New project asks for the filing, then the project’s details, then shows what will be recorded before it is created.',
    keywords: ['new project', 'start a project', 'ind', '510(k)', 'filing type', 'wizard', 'objective'],
    surfaces: ['projects', 'project-home'],
    related: ['the-six-steps-of-a-project', 'project-objective', 'project-settings'],
    checked: '2026-11-12',
    body: `Open **Projects** and select **New project**. Creating a project takes three steps.

**1. Choose the filing type.** The filings for your organisation's client type come first ("Tailored for Medical Devices", for example). The tabs reach the other kinds of product: Pharma & Biotech, Medical Devices, Diagnostics & IVD, and Cross-Cutting Documents. Search finds a filing by name, agency or region. Filings marked "Author documents for this market" are written and approved here and filed elsewhere; the others are assembled and validated here as well.

**2. Configure the project.**
- **Client workspace**: the client that owns the project and its dossier.
- **Project name** (required) and **Product name**.
- **Indication**, as Form 1571 will state it; leave it blank if it is not settled.
- **Product type**: for an IND, choose drug or biologic. A filing that fixes the type (an NDA is a drug application) does not ask.
- For a device filing: the device class, product code, regulation number, review panel, the predicate device, the indications for use, and the product characteristics that add required content (software, cyber device, sterile, implantable and others).
- **Target submission date**: the program plan is scheduled back from it.
- **Objective** (optional): what the project must achieve and by when. It is recorded with its history.

**3. Review & create.** Everything that will be recorded is listed, including the client type and how the filing is recorded. Select **Create project**. The project opens on its page.

After it is created, share it with colleagues: select **Manage** on the project's **Team** card, beside the steps.`,
  },
  {
    slug: 'the-six-steps-of-a-project',
    title: 'The six steps of a project',
    collection: 'projects',
    summary: 'Plan, Evidence, Author, Review, Submit and Respond: what each step holds and what to do in it.',
    keywords: ['project page', 'project home', 'lifecycle', 'steps', 'tabs', 'workflow'],
    surfaces: ['project-home'],
    related: ['program-plan-and-workstreams', 'assign-work', 'add-a-market'],
    checked: '2026-11-12',
    body: `A project page is worked through six steps, shown as tabs on the project page.

- **Plan**: what this filing needs, who does it, and by when. **Due for you**, the documents the filing needs by phase, the program plan and its schedule, the team and the project's tasks.
- **Evidence**: the project's files (in the Vault) and the **data room**, the sources its documents are written from. Every file is read on upload and becomes a source you can trace.
- **Author**: the filing's documents. Draft a section with AnA or open a document and write it yourself; module completion shows how much is approved.
- **Review**: documents sent for review, the project's Quality records, and tasks and approvals.
- **Submit**: each market's submission. For an eCTD filing, build and validate the sequence; for a device filing, assemble the eSTAR or technical documentation.
- **Respond**: add the agency's letter, see the open communications, draft the answers with AnA, and start the response sequence.

The **About** card beside the steps holds the client, product, indication, the filing's facts, the project's **objective**, and the work areas this project uses. **Project settings** (top right) changes the description, priority and target date, or archives the project.`,
  },
  {
    slug: 'program-plan-and-workstreams',
    title: 'Read the program plan, its workstreams and its schedule',
    collection: 'projects',
    summary: 'The plan lists every task of the filing by phase, scheduled back from the target date, with a line from start to the agency’s decision.',
    keywords: ['plan', 'schedule', 'timeline', 'gantt', 'milestone', 'workstream', 'critical path', 'due date', 'on track', 'at risk'],
    surfaces: ['project-home'],
    related: ['assign-work', 'the-six-steps-of-a-project'],
    checked: '2026-11-12',
    body: `The **Program plan** on the Plan step is the filing's work breakdown: its phases, tasks, hours and dependencies come from Concept2Cure's engine; each task's status is your project's.

**The schedule** is planned back from the target submission date. Each task is due the working day before the work that depends on it starts. A task's length is the engine's typical duration, or its estimated hours at an eight-hour day. Working days are Monday to Friday; holidays are not counted.

**The schedule line** runs from the start of the work, through the submission, to the agency's review clock where one applies (for example "Study may proceed (day 30)" for an IND, or the MDUFA decision for a 510(k)). Each dot is a phase completing; the darker line is the critical path; a thin mark shows today. Hover over or focus a dot to see its date.

**Workstreams** list each phase with its lead, tasks done, completion date and a status word: Done, On track, At risk or Blocked. Open a workstream to see its tasks. A workstream's lead is the owner of the task that completes it.

**On Projects**, each card carries one line from the same plan: "On schedule · Pre-IND Engagement by Jan 28, 2027", "14 tasks past due · …", or "Not scheduled: no target date".

If a filing has no work breakdown yet, the Plan step says so, naming the filing; it does not invent one.`,
  },
  {
    slug: 'assign-work',
    title: 'Assign a document or task to someone',
    collection: 'projects',
    summary: 'Assign creates a task for one person with a due date; it appears in their tasks and under Due for you.',
    keywords: ['assign', 'owner', 'task', 'due for you', 'due date', 'delegate', 'responsible'],
    surfaces: ['project-home', 'tasks'],
    related: ['program-plan-and-workstreams', 'the-six-steps-of-a-project'],
    checked: '2026-11-12',
    body: `On the **Plan** step, open a document under **What this filing needs** and select **Assign**.

1. Choose the **Person** from your organisation.
2. Set the **Due date**.
3. Add a **Note** if they should know something (optional).
4. Select **Assign**.

The assignment creates a task. It appears:
- in that person's **Tasks** and on Home under their open items;
- under **Due for you** on the project's Plan step, for that person;
- on the project's task board.

The document's row then says "Assigned to …, due …". The line under it ("Work: … · task owner: …") is the plan task that produces the document, which has its own owner and date.

You can also **Create from template** to start the document, or **Work with AnA** to have AnA draft it.`,
  },
  {
    slug: 'project-objective',
    title: "Record and change a project's objective",
    collection: 'projects',
    summary: 'The objective says what the project must achieve; every version is kept with its source and reason.',
    keywords: ['objective', 'goal', 'success criteria', 'charter', 'version'],
    surfaces: ['project-home'],
    related: ['create-your-first-project', 'project-settings'],
    checked: '2026-11-12',
    body: `The project's **Objective** is shown on its About card. You can give one when you create the project, and change it at any time.

**To record or change it**, select **Edit** under the objective (or **Set the objective** if there is none).

1. **Objective**: what the project must achieve, for example "File the IND and reach study-may-proceed by Q3 2027".
2. **Success criteria** (optional).
3. **Taken from** and **Source**: where it comes from (the protocol, a registry entry, a publication, a data room file).
4. **Reason**: why it is recorded or changed. It goes into the audit trail.
5. Select **Record objective**.

Each change is a new **version**; earlier versions stay readable under the objective. **Ask AnA to propose it** asks AnA to draft an objective from the protocol and the public record for you to review.`,
  },
  {
    slug: 'project-settings',
    title: "Change a project's settings, or archive it",
    collection: 'projects',
    summary: 'Description, priority and target date change under a recorded reason; archiving keeps every document and record.',
    keywords: ['settings', 'priority', 'target date', 'archive', 'description', 'edit project'],
    surfaces: ['project-home'],
    related: ['project-objective', 'program-plan-and-workstreams'],
    checked: '2026-11-12',
    body: `Select **Project settings** at the top right of the project page.

**Change the description, priority or target submission date**

1. Change the fields.
2. Select **Review settings change**.
3. Give a **reason** (at least 8 characters; it is recorded word for word in the audit log) and type **yes** to confirm.
4. Select **Confirm and log**.

The change shows at once in the line under the project's name. Changing the target date records the new target; replanning the program plan's milestones is a separate action.

**Archive the project.** An archived project leaves the project list and takes no new market. Its documents and records are kept.

If your access does not allow changes, the settings are shown read-only and **Review settings change** stays unavailable.`,
  },
  {
    slug: 'find-projects',
    title: 'Find a project: search, filters, grid and list',
    collection: 'projects',
    summary: 'Search by title or code; filter by client, client type and pathway; switch between the grid and the list.',
    keywords: ['search', 'filter', 'list view', 'grid view', 'portfolio', 'projects page'],
    surfaces: ['projects'],
    related: ['program-plan-and-workstreams', 'create-your-first-project'],
    checked: '2026-11-12',
    body: `**Projects** lists your organisation's projects.

- **Search** matches a project's title or code. A search with no match says so.
- **Filters**: client, client type (Medical device & IVD, Biotech, Pharma) and pathway (IND, 510(k) and others), each with its count.
- **Grid** shows a card per project: its title, filing, agency and indication, the plan's one-line status, its code, when it was updated, and its due date.
- **List** shows the same projects as a table: client type, stage, dossier readiness, status, lead and target date. Under the list: active projects, average readiness and filings due within 60 days. On a phone the table scrolls sideways inside its frame.

Select a card or a row to open the project.`,
  },
];
