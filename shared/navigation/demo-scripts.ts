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
        say: 'The Projects portfolio is the front door: every regulatory program with its workstream, stage, readiness, and blockers in one place.',
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
        say: 'Intelligence is the analytical layer — open the clinical group of the capability catalog and show how design, biostatistics, and evidence insight sit beside the work.',
        navigate: { target: 'intelligence', params: { intelligenceTab: 'clinical' } },
      },
      {
        say: 'The catalog spans the whole operation — switch to the quality & CMC group to show its breadth without leaving the screen.',
        act: { actionId: 'intelligence.open-group', params: { group: 'quality_cmc' } },
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
        say: 'Start at portfolio command: every program, its readiness and its blockers, visible in one place instead of a spreadsheet.',
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
        say: 'Review readiness: the platform scores whether the submission would survive review, before the agency sees it.',
        navigate: { target: 'review-readiness' },
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
