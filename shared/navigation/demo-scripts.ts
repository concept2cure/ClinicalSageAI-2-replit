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
  /* ── The three Live Drive scripts are cut to the LAUNCH CATALOG ────────────
     docs/LAUNCH_DEFINITION_OF_DONE.md row D2 — Projects, Vault, Authoring
     (incl. protocol development), Submission Center, Submission Readiness,
     QMS controlled documents — plus the shell surfaces (audit trail, Part 11
     console). Under LAUNCH_SCOPE_ENFORCE=on any other stop renders "Not in
     this release", and a demonstration that lands there fails in front of the
     person it was written for. __tests__/demo-scripts.test.ts holds every
     stop below to the catalog through the shell's own resolution.

     The talking points name the seeded demo programs — "[Demo · Biotech]
     C2C-101", an anti-IL-23 antibody IND, and "[Demo · MDX] NeuroPanel-Dx",
     an IVD 510(k) — without pinning ids: a stop with no params is filled from
     the on-screen context at run time, so the same script runs on a real
     tenant's own programs. */
  {
    id: 'training-orientation',
    kind: 'training',
    title: 'Full product training',
    audience: 'A new subscriber team learning to run their regulatory work here.',
    minutes: 8,
    description:
      'The complete working tour of the launch catalog: the Projects portfolio and a real program, the Vault, Authoring and the protocol workspace, the Submission Center, Submission Readiness, QMS controlled documents, and the audit trail — each stop showing what the team actually does there.',
    steps: [
      {
        say: 'Welcome them to their workspace and set the frame: this is a working tour of their own tenant, on their real data, through the six apps of this release, and they can interrupt with a question at any moment.',
      },
      {
        say: 'Projects is the front door: every regulatory program with its workstream, stage, readiness and blockers. In the demo workspace that is "[Demo · Biotech] C2C-101", an anti-IL-23 antibody IND, beside "[Demo · MDX] NeuroPanel-Dx", an IVD 510(k) — the same portfolio holds both.',
        navigate: { target: 'projects' },
      },
      {
        say: 'Open one of their real programs (pick it from the portfolio on screen — C2C-101 in the demo workspace). Opening a program scopes every project surface to it.',
        act: { actionId: 'projects.open-program' },
      },
      {
        say: 'Project home is the program cockpit: lifecycle stage, workstreams, recent drafts, the team, and the conversation thread with AnA all live here.',
        navigate: { target: 'project-home' },
      },
      {
        say: 'The Vault is the governed document store: uploads are checksummed and virus-scanned, auto-classified into the dossier structure, and every source is tracked from captured to filed — for C2C-101 that is the CTD tree; for NeuroPanel-Dx the device submission folders.',
        navigate: { target: 'vault' },
      },
      {
        say: 'Authoring is where documents get written: one editor for every document type, with AnA drafting sections from the linked evidence, tracked changes, a governed version history and Part 11 e-signature on approval.',
        navigate: { target: 'authoring' },
      },
      {
        say: 'Protocol development is the second Authoring workspace: the protocol as structured data — sections, objectives and endpoints, eligibility, the schedule of assessments, the risk register and milestones — with a deterministic completeness gate before anyone can finalize.',
        navigate: { target: 'protocol-dev' },
      },
      {
        say: 'The Submission Center is the operations cockpit: from planning a submission through its sequences, build and validation, up to dispatch — everything from one place, and freezing or dispatching stays a person’s signature.',
        navigate: { target: 'submissions' },
      },
      {
        say: 'Open the validation workspace so they see the pre-flight findings the team clears before anyone is asked to sign — real findings on the program’s real sequence, not a slide of them.',
        act: { actionId: 'submissions.set-workspace', params: { workspace: 'validation' } },
      },
      {
        say: 'Submission Readiness is the judgment layer: the dispatch gate for the program’s sequence, computed from stored facts — validation errors, unacknowledged shadow-review criticals and the release signature — with every blocker named until it is cleared.',
        navigate: { target: 'dispatch-readiness' },
      },
      {
        say: 'QMS controlled documents is the quality spine: the SOP register and change control, where approvals, revisions and read-and-understood training are Part 11 ceremonies a person signs.',
        navigate: { target: 'quality' },
      },
      {
        say: 'Filter the change log to what is approved and waiting to be implemented — the live change-control pipeline.',
        act: { actionId: 'quality.filter-changes', params: { stage: 'approved' } },
      },
      {
        say: 'End where an inspector would start: the audit trail. Every governed act on this tour — the register writes, the approvals, the signatures — is a hash-chained entry here, verified by the server, and it can never be switched off.',
        navigate: { target: 'audit-trail' },
      },
      {
        say: 'Close the loop: recap the route just driven, name the one or two apps most relevant to what this team does daily, and invite them to try the next task with you in Live Drive.',
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
      'The dispatch-day route: the Vault sources, the documents in Authoring, the review queue, the Submission Center’s sequence and validation workspaces, the readiness verdict, and the Part 11 record of it all. Freezing and dispatching stay with a person; this tour shows everything up to their signature.',
    steps: [
      {
        say: 'Frame the day: a sequence goes out today, and this is the exact route the team will drive — on their real program (C2C-101 in the demo workspace), with every governed gate left in human hands.',
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
        say: 'The Vault first: every source the sequence cites is filed, checksummed and classified into the dossier — the data room shows anything still captured but not yet filed.',
        navigate: { target: 'vault' },
      },
      {
        say: 'Authoring next: the documents going out, each with its governed version history and the approval signatures already manifest on the record.',
        navigate: { target: 'authoring' },
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
        say: 'The Submission Center: select the submission that is going out (pick it from the portfolio on screen), then its working sequence.',
        navigate: { target: 'submissions' },
      },
      {
        say: 'Select the submission that ships today.',
        act: { actionId: 'submissions.select-submission' },
      },
      {
        say: 'Open validation: the pre-flight findings the team clears before anyone is asked to sign.',
        act: { actionId: 'submissions.set-workspace', params: { workspace: 'validation' } },
      },
      {
        say: 'Submission Readiness gives the verdict: the dispatch gate for this sequence and the blockers it names — the go / no-go a person signs against.',
        navigate: { target: 'dispatch-readiness' },
      },
      {
        say: 'The Part 11 console shows how compliance is evidenced: the signer mode in force, the signature manifestations, and the audit-chain verifier — the record a reviewer will ask for.',
        navigate: { target: 'part11-console' },
      },
      {
        say: 'And the audit trail itself: the freeze and the dispatch will appear here under the person’s signature — the two acts that stay theirs. Close: recap the route, name where their sequence stands today, and offer to walk the validation findings together next.',
        navigate: { target: 'audit-trail' },
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
      'The value story end to end, in the founder’s pitch order: a real program, AI drafting in Authoring, the protocol as data, the governed Vault, the Submission Center, the readiness verdict, controlled documents, and the audit trail — what gets faster, what stays compliant, and why.',
    steps: [
      {
        say: 'Open with the thesis: one platform where the regulatory work is done, not tracked — AnA works the screens with the team, numbers and verdicts come from deterministic engines, and everything governed stays governed under a person’s signature.',
      },
      {
        say: 'Start at Projects: the whole portfolio, biotech and device side by side — "[Demo · Biotech] C2C-101", an anti-IL-23 antibody IND, and "[Demo · MDX] NeuroPanel-Dx", an IVD 510(k) — each with stage, readiness and blockers.',
        navigate: { target: 'projects' },
      },
      {
        say: 'Enter a real program (pick one from the portfolio on screen — C2C-101 for the biotech story). Everything from here on is scoped to it automatically.',
        act: { actionId: 'projects.open-program' },
      },
      {
        say: 'The headline capability: Authoring. AnA drafts regulatory documents grounded in the program evidence, with provenance on every claim and a governed version history — this is where weeks become days.',
        navigate: { target: 'authoring' },
      },
      {
        say: 'Open one of their real documents (pick a title from the authoring tree on screen) so the drafting engine is shown on their own work, not a canned sample.',
        act: { actionId: 'authoring.open-document' },
      },
      {
        say: 'The protocol as data, not a Word file: objectives and endpoints, eligibility, the schedule of assessments, risks and milestones as governed registers, and a completeness gate that refuses to finalize an incomplete protocol.',
        navigate: { target: 'protocol-dev' },
      },
      {
        say: 'The Vault: uploads captured with checksums and audit chains, auto-classified into the dossier, every source tracked from captured to filed — the data room diligence teams wish they had.',
        navigate: { target: 'vault' },
      },
      {
        say: 'The Submission Center: planning, sequences, the build and pre-flight validation — the last mile lives here too, not in a vendor hand-off.',
        navigate: { target: 'submissions' },
      },
      {
        say: 'Submission Readiness: the platform says whether the sequence is cleared to dispatch before the agency sees it — a deterministic verdict with every blocker named, never a model’s opinion.',
        navigate: { target: 'dispatch-readiness' },
      },
      {
        say: 'QMS controlled documents: the SOP register and change control under Part 11 ceremonies — the quality system and the regulatory work in one place, one audit trail.',
        navigate: { target: 'quality' },
      },
      {
        say: 'Close on governance, on the screen that proves it: the hash-chained audit trail, 21 CFR Part 11 signatures, and the rule that AnA prepares while a person approves — then invite their questions and the next step.',
        navigate: { target: 'audit-trail' },
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
