/**
 * AnA demonstration scripts — the curated walkthroughs behind "give me the
 * full product demo" and "run the sales demonstration".
 *
 * ── What a script is ─────────────────────────────────────────────────────────
 * A demonstration is a PLAN, not a second execution path. Each step names a
 * talking point (`say`) and at most one move — a `navigate` into the screen
 * registry (./index.ts) or an `act` into the surface-action registry
 * (./surface-actions.ts). AnA runs the plan through the SAME tools every other
 * turn uses (`navigate_to`, `act_on_screen`), so every invariant holds
 * unchanged: schema-validated tool results are the only path to the screen,
 * budgets and take-over apply, governed work still stops and asks. The script
 * only decides the route and the story.
 *
 * ── `say` is a talking point, not copy ───────────────────────────────────────
 * AnA narrates in her own voice, grounded in the subscriber's real data (the
 * active surface publishes its context every turn). The `say` line is what a
 * stop must convey — she adapts it to who is watching and what is actually on
 * their screen, and never reads it verbatim like a teleprompter.
 *
 * ── Runtime params ───────────────────────────────────────────────────────────
 * A step may pin params (e.g. the intelligence tab). Steps that need live data
 * — which program to open, what to search — deliberately pin nothing: AnA
 * fills them at execution time from the surface context in front of her, and
 * the tools validate as always. Validation here checks what is checkable
 * statically: the target/action exists, pinned params are declared and legal.
 *
 * Pure data + pure functions, importable from both halves — same rules as the
 * two registries it composes.
 */

import { findNavigationTarget, resolveNavigation } from './index';
import { findSurfaceAction, resolveSurfaceAction } from './surface-actions';

export type DemoKind = 'training' | 'sales';

export interface DemoStep {
  /** The talking point this stop must convey (AnA's own words, adapted live). */
  say: string;
  /** Move into a screen (registry target id + optional pinned params). */
  navigate?: { target: string; params?: Record<string, string> };
  /** Operate the screen (surface-action id + optional pinned params). */
  act?: { actionId: string; params?: Record<string, string> };
}

export interface DemoScript {
  id: string;
  kind: DemoKind;
  title: string;
  /** Who this demonstration is for — steers AnA's register and emphasis. */
  audience: string;
  /** Honest length estimate for the picker copy. */
  minutes: number;
  description: string;
  steps: readonly DemoStep[];
}

// ─────────────────────────────────────────────────────────────────────────────
// SCRIPTS
// ─────────────────────────────────────────────────────────────────────────────

export const DEMO_SCRIPTS: readonly DemoScript[] = [
  {
    id: 'training-orientation',
    kind: 'training',
    title: 'Full product training',
    audience: 'A new subscriber team learning to run their regulatory work here.',
    minutes: 8,
    description:
      'The complete working tour: the portfolio, a real program, the vault, drafting, CMC, intelligence, review, the submission gateway, and tasking — each stop showing what the team actually does there.',
    steps: [
      {
        say: 'Welcome them to their workspace and set the frame: this is a working tour of their own tenant, on their real data, and they can interrupt with a question at any moment.',
      },
      {
        say: 'Open on the whole picture: mission control is the command board — every program and its cross-program readiness at a glance, the view a head of regulatory opens each morning.',
        navigate: { target: 'mission-control' },
      },
      {
        say: 'The Projects portfolio is the front door to a single program: every regulatory program with its workstream, stage, readiness, and blockers, and where you enter one to work.',
        navigate: { target: 'projects' },
      },
      {
        say: 'The portfolio works the way they do — show the list presentation for scanning many programs at once.',
        act: { actionId: 'projects.set-view', params: { view: 'list' } },
      },
      {
        say: 'Open one of their real programs (pick from the portfolio on screen) — opening a program scopes every project surface to it.',
        act: { actionId: 'projects.open-program' },
      },
      {
        say: 'Project home is the program cockpit: workstreams, recent drafts, the team, and the conversation thread with AnA all live here.',
        navigate: { target: 'project-home' },
      },
      {
        say: 'The Vault is the governed document store: the filing cabinet auto-classifies uploads into the dossier structure, and the data room tracks every source from captured to filed.',
        navigate: { target: 'vault' },
      },
      {
        say: 'Authoring is where documents get written: one editor for every document type, with AnA drafting sections, citing evidence, and keeping the version history governed.',
        navigate: { target: 'authoring' },
      },
      {
        say: 'The CMC workstream runs Module 3: build state, specifications, stability, and change control against the quality data.',
        navigate: { target: 'cmc' },
      },
      {
        say: 'Show them a register directly — open the specifications tab so they see the real Module 3 controls, not a slide of them.',
        act: { actionId: 'cmc.open-tab', params: { tab: 'specs' } },
      },
      {
        say: 'Quality is the controlled-document spine: the SOP register and change control, where approvals, revisions and read-and-understood training are all Part 11 ceremonies a person signs.',
        navigate: { target: 'quality' },
      },
      {
        say: 'Filter the change log to what is approved and waiting to be implemented — the live change-control pipeline, not a slide of it.',
        act: { actionId: 'quality.filter-changes', params: { stage: 'approved' } },
      },
      {
        say: 'Intelligence is the analytical layer — open the clinical group of the capability catalog and show how design, biostatistics, and evidence insight sit beside the work.',
        navigate: { target: 'intelligence', params: { intelligenceTab: 'clinical' } },
      },
      {
        say: 'The catalog spans the whole operation — switch to the quality & CMC group to show its breadth without leaving the screen.',
        act: { actionId: 'intelligence.open-group', params: { group: 'quality_cmc' } },
      },
      {
        say: 'And the analytical engines are hands-on, not slideware — the biostatistics workbench runs assurance, group-sequential design, sample size and multiplicity as deterministic calculators AnA can open and drive with the team.',
        navigate: { target: 'biostat-workbench' },
      },
      {
        say: 'Review is where governed judgments happen: readiness, approvals, and the Part 11 e-signature gates — AnA prepares everything, and a person always signs.',
        navigate: { target: 'review' },
      },
      {
        say: 'Jump straight to the next document awaiting a decision — the click a reviewer starts every morning with.',
        act: { actionId: 'review.open-queue' },
      },
      {
        say: 'The Submission Gateway is the final mile: pre-flight validation and the transmittal chain to the agency.',
        navigate: { target: 'submission-gateway' },
      },
      {
        say: 'Tasking keeps the team coordinated: the cross-program board with every open item and owner.',
        navigate: { target: 'tasking' },
      },
      {
        say: 'And it works the way each person does — filter the board to just their own tasks to show the personal view.',
        act: { actionId: 'tasking.filter', params: { mine: 'true' } },
      },
      {
        say: 'Close the loop: recap the route just driven, name the one or two screens most relevant to what this team does daily, and invite them to try the next task with you in Live Drive.',
      },
    ],
  },
  {
    id: 'training-submission-day',
    kind: 'training',
    title: 'Submission day walkthrough',
    audience: 'A regulatory operations team rehearsing how a sequence actually goes out.',
    minutes: 5,
    description:
      'The dispatch-day route: open the program, work the Submission Center — select the submission, its working sequence, and the validation workspace — clear the review queue, and end at the gateway. Freezing and dispatching stay with a person; this tour shows everything up to their signature.',
    steps: [
      {
        say: 'Frame the day: a sequence goes out today, and this is the exact route the team will drive — on their real program, with every governed gate left in human hands.',
      },
      {
        say: 'Start at the portfolio and open the program that is submitting (pick it from the list on screen).',
        navigate: { target: 'projects' },
      },
      {
        say: 'Open the program whose sequence ships today.',
        act: { actionId: 'projects.open-program' },
      },
      {
        say: 'The Submission Center is the operations cockpit — everything from planning to dispatch lives in one place.',
        navigate: { target: 'submissions' },
      },
      {
        say: 'Select the submission that is going out (pick it from the portfolio on screen).',
        act: { actionId: 'submissions.select-submission' },
      },
      {
        say: 'Open the sequences workspace to see the lifecycle of every sequence in this submission.',
        act: { actionId: 'submissions.set-workspace', params: { workspace: 'sequences' } },
      },
      {
        say: 'Pick the working sequence (from the list on screen) — the one the build and validation workspaces will act on.',
        act: { actionId: 'submissions.select-sequence' },
      },
      {
        say: 'Open validation: the pre-flight findings the team clears before anyone is asked to sign.',
        act: { actionId: 'submissions.set-workspace', params: { workspace: 'validation' } },
      },
      {
        say: 'Review is the judgment gate — jump to the next document still awaiting a decision so nothing rides along unapproved.',
        navigate: { target: 'review' },
      },
      {
        say: 'Open the queue at the next undecided document.',
        act: { actionId: 'review.open-queue' },
      },
      {
        say: 'Before dispatch, read filing risk on a marketing application: the NDA/BLA cockpit scores CTD readiness, the PDUFA review clock, and Refuse-to-File risk against the program’s real state.',
        navigate: { target: 'nda-cockpit' },
      },
      {
        say: 'Open the Refuse-to-File view — the specific deficiencies that bounce a submission on receipt, so the team clears them before anyone signs.',
        act: { actionId: 'nda-cockpit.open-tab', params: { tab: 'rtf' } },
      },
      {
        say: 'And the gateway: the transmittal chain and acknowledgments once a person has frozen and dispatched — the two acts that stay theirs, under a Part 11 signature.',
        navigate: { target: 'submission-gateway' },
      },
      {
        say: 'Close: recap the route, name where their sequence stands today, and offer to walk the validation findings together next.',
      },
    ],
  },
  {
    id: 'sales-flagship',
    kind: 'sales',
    title: 'Sales demonstration',
    audience: 'A prospect or stakeholder deciding whether this platform runs their regulatory operation.',
    minutes: 6,
    description:
      'The value story end to end: portfolio command, a live program, AI drafting, the governed vault, review readiness, and the submission gateway — what gets faster, what stays compliant, and why.',
    steps: [
      {
        say: 'Open with the thesis: one platform where the regulatory work is done, not tracked — AnA works the screens with the team, and everything governed stays governed.',
      },
      {
        say: 'Start at mission control: the entire portfolio and its cross-program readiness and blockers on one board — the view a head of regulatory opens instead of a status spreadsheet.',
        navigate: { target: 'mission-control' },
      },
      {
        say: 'From the portfolio, drop into one program — the project list, where picking a program scopes everything downstream to it automatically.',
        navigate: { target: 'projects' },
      },
      {
        say: 'Enter a real program (pick one from the portfolio on screen) — everything from here on is scoped to it automatically.',
        act: { actionId: 'projects.open-program' },
      },
      {
        say: 'The program home: the cockpit a director opens every morning — workstreams, drafts, team, and AnA in one view.',
        navigate: { target: 'project-home' },
      },
      {
        say: 'The headline capability: authoring. AnA drafts regulatory documents grounded in the program evidence, with provenance and a governed version history — this is where weeks become days.',
        navigate: { target: 'authoring' },
      },
      {
        say: 'Open one of their real documents (pick a title from the authoring tree on screen) so the drafting engine is shown on their own work, not a canned sample.',
        act: { actionId: 'authoring.open-document' },
      },
      {
        say: 'The Vault: uploads are captured with checksums and audit chains, auto-classified into the dossier, and every source is tracked from captured to filed — the data room diligence teams wish they had.',
        navigate: { target: 'vault' },
      },
      {
        say: 'Beyond their own vault: Deep Research runs multi-source regulatory research over live connectors, metered and governed — launching stays their click, never yours.',
        navigate: { target: 'deep-research' },
      },
      {
        say: 'Show the connector inventory — the org’s own sources with live configured status, credentials encrypted per-organization.',
        act: { actionId: 'deep-research.open-tab', params: { tab: 'connectors' } },
      },
      {
        say: 'For pharma programs the PDEV → IND engine tracks the whole pre-IND arc: four workstreams, readiness against threshold, and IND assembly with human-gated compilation.',
        navigate: { target: 'pdev' },
      },
      {
        say: 'Review readiness: the platform scores whether the submission would survive review, before the agency sees it.',
        navigate: { target: 'review-readiness' },
      },
      {
        say: 'For a marketing application, the NDA/BLA cockpit reads filing risk before you file: CTD readiness, the PDUFA review clock, and Refuse-to-File risk — the deficiencies that bounce a submission at the door, caught while they are still fixable.',
        navigate: { target: 'nda-cockpit' },
      },
      {
        say: 'Open the Refuse-to-File view — the specific gaps that get a submission rejected on receipt, scored against this program’s real state.',
        act: { actionId: 'nda-cockpit.open-tab', params: { tab: 'rtf' } },
      },
      {
        say: 'The Submission Gateway: pre-flight validation and the transmittal chain — the last mile lives here too, not in a vendor hand-off.',
        navigate: { target: 'submission-gateway' },
      },
      {
        say: 'Close on governance: 21 CFR Part 11 signatures, hash-chained audit, and the rule that AnA prepares while a person approves — then invite their questions and the next step.',
      },
    ],
  },
  {
    id: 'training-medtech',
    kind: 'training',
    title: 'Medtech product training',
    audience:
      'A device or diagnostics team learning to run their 510(k), PMA, De Novo, or EU MDR/IVDR work here.',
    minutes: 8,
    description:
      'The complete device working tour: the portfolio, the task workbench, the 510(k) pathway, the ISO 14971 risk file worked hands-on, design controls and V&V, the significant-change worklist, EU MDR clinical evaluation, and the submission packages — each stop showing what the team actually does there.',
    steps: [
      {
        say: 'Welcome them to their workspace and set the frame: this is a working tour of their own device programs, on their real data, and they can interrupt with a question at any moment.',
      },
      {
        say: 'The device portfolio is the front door: every device program with its pathway — 510(k), PMA, De Novo, MDR — its stage and its readiness in one place.',
        navigate: { target: 'device-workstream' },
      },
      {
        say: 'The device task workbench is where the day starts: every open item across their programs with its owner, so nothing waits on a shared drive or an email thread.',
        navigate: { target: 'device-tasks' },
      },
      {
        say: 'Pre-Submissions shape the pathway before you build it — the agency-meetings workspace tracks each Q-Sub / Pre-Sub with its briefing book and the FDA feedback, so the team designs to the agency’s answer instead of guessing it.',
        navigate: { target: 'agency-meetings' },
      },
      {
        say: 'The 510(k) pathway workspace: predicate intelligence, the substantial-equivalence matrix, and the eSTAR sections built as they go — this is where a submission takes shape, not a folder they assemble at the end.',
        navigate: { target: 'device-510k' },
      },
      {
        say: 'The ISO 14971 risk file is the discipline at the center of every device submission — hazards, severity and probability, and the controls that bring residual risk down.',
        navigate: { target: 'risk' },
      },
      {
        say: 'Work one hazard, do not slide it — open a hazard from their real file (pick one on screen) so they see its severity, probability, and controls the way they will actually use it.',
        act: { actionId: 'risk.select-hazard' },
      },
      {
        say: 'Switch to the residual matrix — the assessment after their controls. Accepting residual risk stays a signed human judgment; AnA shows the picture and never makes that call for them.',
        act: { actionId: 'risk.set-matrix-view', params: { view: 'residual' } },
      },
      {
        say: 'Design controls are the engineering backbone: requirements, verification and validation traced end to end — the spine an auditor follows and the team maintains here.',
        navigate: { target: 'device-engineering' },
      },
      {
        say: 'The validation center is where V&V evidence lands and its completeness is tracked against the plan — protocols, runs, and what is still open.',
        navigate: { target: 'device-validation' },
      },
      {
        say: 'The significant-change worklist is the call they make all the time: for each change, is it a letter-to-file or a new 510(k), and what is the EU MDR significant-change determination.',
        navigate: { target: 'change-assessment' },
      },
      {
        say: 'Open one change to show the real determination side by side (pick one on screen) — recording the decision stays a human act; AnA lays out the reasoning.',
        act: { actionId: 'change-assessment.select-change' },
      },
      {
        say: 'For Europe, the CER: clinical evaluation under EU MDR, with benefit-risk and GSPR reasoning — an uncharacterized dimension is never quietly treated as favourable.',
        navigate: { target: 'device-cer' },
      },
      {
        say: 'The submission packages are the final mile: eSTAR and eCTD pre-flight validation and the transmittal chain — the last step lives here too, not in a vendor hand-off.',
        navigate: { target: 'device-submission' },
      },
      {
        say: 'Close the loop: recap the route just driven, name the one or two screens most relevant to what this team does daily, and invite them to try the next task with you in Live Drive.',
      },
    ],
  },
  {
    id: 'sales-medtech',
    kind: 'sales',
    title: 'Medtech sales demonstration',
    audience:
      'A device or diagnostics prospect — 510(k), PMA, De Novo, or EU MDR/IVDR — deciding whether this platform runs their regulatory operation.',
    minutes: 6,
    description:
      'The device value story end to end: the program portfolio, the 510(k) pathway with predicate intelligence, design controls, the ISO 14971 risk file, EU MDR clinical evaluation, the significant-change worklist, and the submission packages — what gets faster, and what stays governed.',
    steps: [
      {
        say: 'Open with the thesis for device teams: one platform where the 510(k), PMA, De Novo and EU MDR work is done, not tracked — AnA works the screens with the team, and every governed determination stays a human sign-off.',
      },
      {
        say: 'Start at the device portfolio: every device program, its pathway and its readiness, in one place instead of a spreadsheet and a shared drive.',
        navigate: { target: 'device-workstream' },
      },
      {
        say: 'The 510(k) pathway: predicate intelligence, the substantial-equivalence matrix, and the eSTAR sections — the submission built as you go, not assembled at the end.',
        navigate: { target: 'device-510k' },
      },
      {
        say: 'Predicate intelligence in depth: real cleared devices, their review cycles and their risk profile. Running the search stays their click — AnA reads the board once it is there and never spends a metered search on its own.',
        navigate: { target: 'precedent-intelligence' },
      },
      {
        say: 'Design controls: the engineering backbone — requirements, verification and validation traced end to end, the spine an auditor follows.',
        navigate: { target: 'device-engineering' },
      },
      {
        say: 'The ISO 14971 risk file: the discipline at the center of every device submission — hazards, severity and probability, and the controls that bring residual risk down.',
        navigate: { target: 'risk' },
      },
      {
        say: 'Switch to the residual matrix — after the controls. Accepting residual risk is the one thing AnA never does for them: it stays a signed human judgment, and the screen shows exactly that.',
        act: { actionId: 'risk.set-matrix-view', params: { view: 'residual' } },
      },
      {
        say: 'For Europe, the CER: clinical evaluation under EU MDR, with the benefit-risk and GSPR reasoning laid out — an uncharacterized dimension is never quietly treated as favourable.',
        navigate: { target: 'device-cer' },
      },
      {
        say: 'The significant-change worklist: for each change, the FDA letter-to-file vs new-510(k) call and the EU MDR significant-change determination, side by side — recording the determination stays a human act.',
        navigate: { target: 'change-assessment' },
      },
      {
        say: 'The submission packages: eSTAR and eCTD pre-flight validation and the transmittal chain — the last mile lives here too, not in a vendor hand-off.',
        navigate: { target: 'device-submission' },
      },
      {
        say: 'Close on governance: 21 CFR Part 11 signatures, hash-chained audit, and the rule that holds across every pathway — AnA prepares while a person approves. Then invite their questions and the next step.',
      },
    ],
  },
] as const;

const SCRIPTS_BY_ID: ReadonlyMap<string, DemoScript> = new Map(
  DEMO_SCRIPTS.map((s) => [s.id, s]),
);

/** Look up a demonstration script by id. */
export function findDemoScript(id: string): DemoScript | undefined {
  return SCRIPTS_BY_ID.get(id);
}

/** Picker metadata for every script (no steps — those ship on demand). */
export function listDemoScripts(): Array<
  Pick<DemoScript, 'id' | 'kind' | 'title' | 'audience' | 'minutes' | 'description'> & {
    steps: number;
  }
> {
  return DEMO_SCRIPTS.map((s) => ({
    id: s.id,
    kind: s.kind,
    title: s.title,
    audience: s.audience,
    minutes: s.minutes,
    description: s.description,
    steps: s.steps.length,
  }));
}

/**
 * Statically validate one script: every step says something, makes at most one
 * move, and any move resolves against its registry (pinned params included;
 * an `act` that defers required params to runtime is legal — the tool call
 * validates them at execution). Returns the list of defects, empty when sound.
 */
export function validateDemoScript(script: DemoScript): string[] {
  const errors: string[] = [];
  if (!script.steps.length) errors.push(`Script "${script.id}" has no steps.`);
  script.steps.forEach((step, i) => {
    const where = `Script "${script.id}" step ${i + 1}`;
    if (!step.say || !step.say.trim()) errors.push(`${where} has no talking point.`);
    if (step.navigate && step.act) errors.push(`${where} makes two moves — one per step.`);
    if (step.navigate) {
      const res = resolveNavigation(step.navigate.target, step.navigate.params ?? {});
      if (!res.ok) errors.push(`${where}: ${res.error}`);
    }
    if (step.act) {
      const action = findSurfaceAction(step.act.actionId);
      if (!action) {
        errors.push(`${where}: unknown surface action "${step.act.actionId}".`);
      } else if (step.act.params && Object.keys(step.act.params).length > 0) {
        const res = resolveSurfaceAction(step.act.actionId, step.act.params);
        if (!res.ok) errors.push(`${where}: ${res.error}`);
      } else if (!findNavigationTarget(action.surfaceId)) {
        errors.push(`${where}: action surface "${action.surfaceId}" is not a registered screen.`);
      }
    }
  });
  return errors;
}

/** Validate every registered script — the totality gate the test suite pins. */
export function validateDemoScripts(): string[] {
  return DEMO_SCRIPTS.flatMap((s) => validateDemoScript(s));
}
