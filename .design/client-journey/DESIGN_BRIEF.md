# Design Brief: The client journey — features inside the work, not apps

Date 2026-10-25. Launch row D2. Owner: the founder. Design note and per-pass evidence:
`docs/design/CLIENT_JOURNEY_2026-10-25.md`, `docs/evidence/D2-CLIENT-JOURNEY/2026-10-25/`.
Placement of every feature: `INFORMATION_ARCHITECTURE.md` (this folder).

## Problem

The founder tested the product as a client and could not use it. In their words: "I have no idea what we're doing
with apps, what the apps do, how to use them, when to use them", and later, "I didn't know how to flow into an
actual document build." What was built are features of a regulatory project — things a person reaches for while
building a CSR, a protocol, an IND module or a CER — but the product presented them as an app store: a catalogue
of cards, each with a price tier and an Open button, each opening a screen of its own with no project, no
document and no next step.

A person arriving should understand three things without being taught: where their work is, what to do next,
and where the tool they need is. Today none of the three is answered.

The inventory of every catalogue entry and screen (139 items, each read in code and checked by a second reader)
shows how far this went:

- **67 of 139 are duplicates or older generations** of another item (CSR Author and CSR workflow, Protocol
  Designer and Protocol development, CMC Wizard and CMC / Module 3, five ways to submit a device, four stores of
  agency meetings, three CRL sources, three editors).
- **33 work on real data end to end.** 72 work in part, 17 render sample or demo data, 17 have no screen at all.
- **13 are places** a person goes to on their own. Everything else belongs inside a project step or a document.

## Solution

Two kinds of things, and only two:

1. **Places** — the few destinations a person goes to on their own: Home, Projects, Tasks, Communication, Vault,
   and the work areas CMC / Module 3, Quality, Reporting & analytics (and, when each is ready for release,
   Biostatistics and Risk-based monitoring).
2. **Features** — everything else. A feature has no front door. It appears **inside a project, at the step where
   it is needed**, and **inside a document, at the moment in its build where it is needed**, named for what it
   does there ("Compose Module 3 in CMC / Module 3", "Check this section against FDA's past objections").

The experience a client has:

> Home shows my projects and what is waiting for me. I open my IND. It opens on **Plan**: every document the IND
> needs, by phase, who has each one and by when. I press **Start** on the Investigator's Brochure: it opens in the
> editor from its template, and beside it are the tools for an IB — what each section still needs, the
> nonclinical studies it draws on, AnA to draft from my sources. When it is ready I **send it for review**; on
> **Review** I see it with everything else waiting for a decision. On **Submit** the approved documents go into
> the sequence, the forms are filled, and readiness says what is left. When the FDA writes back, **Respond** holds
> the letter and the answer.

The catalogue remains only as what it truly is: an administrator's view of the plan and its licences. The word
"app" leaves the product's vocabulary for these capabilities: a client sees a step, a document's tools, a place,
or AnA doing something; an administrator sees "features" in Plan & features.

## Experience Principles

1. **The work is the navigation** — a feature is found where the work needs it: the project's step, the
   document's build, AnA's suggestion. Never a list of apps. (Resolves *discoverability vs. focus*: the plan of
   work is the map, so nothing needs a catalogue to be found.)
2. **Nothing is lost, nothing is doubled** — every capability in the catalogue gets a home in the product, and a
   duplicate is folded into its canonical capability only after each of its functions is shown to exist there or is
   carried over. A job is never offered twice under two names, and never dropped. (Resolves *breadth vs. trust*;
   the founder, 2026-10-25: "we must not lose any functionality that is in our apps catalog, but take all that and
   place it in the core product, and get away from calling the needed functionality and features apps.")
3. **Honest over impressive** — a feature that does not work on the client's real data is not offered in their
   journey; empty, failed and not-yet-available are said in plain words. (Resolves *"bring every feature to life"
   vs. what works today*: a feature comes to life by working, then by being placed.)

## Aesthetic Direction

- **Philosophy**: the existing Concept2Cure system, unchanged — "calm, intelligent, restrained; a reviewer's
  desk, not a marketing site" (`design-system/README.md`). The founder likes the current UI; this brief changes
  structure and wording, not the look.
- **Tone**: calm and authoritative. Confirms, never celebrates. Sentence case.
- **Reference points**: Claude (the conversation and the canvas) and Linear (a project's work, plainly listed).
- **Anti-references**: an app store or marketplace; dashboards of KPI tiles; tours, overlays and coach marks
  (one plain sentence in place instead).

## What already exists

Every row of this brief completes, reaches or converges something that exists. The full tables, with paths, what
each does and does not do, and the history searches run, are in `docs/design/CLIENT_JOURNEY_2026-10-25.md` (passes
1–3) and, per feature, in `INFORMATION_ARCHITECTURE.md`. The load-bearing pieces:

- **The plan of work per filing type**: `services/regulatory/pyramids/*` (IND, amendments, annual report, NDA, BLA,
  MAA, JNDA, 510(k), De Novo, PMA); the IND one projected with templates as `GET /api/authoring/ind-document-catalog`.
- **Document templates**: 21 built-in document templates (CSR, protocol ICH M11, SAP, ICF, IB, DSUR, PBRER, RMP,
  SmPC, QOS, Module 2 overviews, Module 3 DS/DP, 510(k) summary, GSPR, PER, IMPD, cover letter) and 200 IND templates
  (`server/services/authoring/builtin-authoring-templates.ts`, `ind-authoring-templates.ts`).
- **The one editor**: `editor/DocumentWorkbench.tsx`, shared by the Authoring surface and AnA's canvas, pinned by
  `scripts/ci/check-canvas-path.mjs`.
- **Device workstreams**: `shared/regulatory/work-packages.ts`, rendered by `ProjectMdxWorkflow.tsx`, each opening
  its existing feature — the model this brief extends to drug filings.
- **The task store and its one create**: `unified_tasks`, `POST /api/tasks/tasks`, `createAssignedTask`.
- **Entitlement and scope**: `shared/constants/launch-scope.ts`, `useSurfaceAvailable`, `LaunchScopeGate`.

## Existing Patterns

From the "what already exists" review (`docs/design/CLIENT_JOURNEY_2026-10-25.md`):

- **Tokens**: `design-system/colors_and_type.css` is canonical (warm cream canvas, terracotta `--accent-strong` the
  one strong colour, olive approval, amber review); `app-v2.css` shim names (`--accent-000/100/200`, `--dur`);
  only three files may declare tokens (`tests/ui/token-authority.test.ts`). Generated muted-text ramp for tinted
  surfaces (`surface-text-ramp.css`).
- **Type**: 13 px body; serif `.pj-title` for the project name (pinned by test); headings 13.5–15 px.
- **Components**: `EmptyState`/`ErrorState` (`dataConnect.tsx`), `useLiveData`/`useLiveRows`, the step tracker and
  band (`ProjectStages.tsx`), `.pj-sec` section cards, `.cdl-row` list rows, `C2CForm` drawer, `useDialog`,
  `GovernedConfirmDialog`/`EsignModal`, `useToast`, `I` icon map (Lucide only), `useSurfaceAvailable` for every
  door into another screen.
- **Motion**: 200 ms ease-out, no spring; honour reduced motion.

## Component Inventory

| Component | Status | Notes |
| --- | --- | --- |
| Left rail (places + Work areas) | Exists | Pass 1. |
| Home: projects, open items, Ask AnA, conversations | Modify | Open items listed by kind (sections to write, reviews, signatures) from TaskTray's reads; a three-item setup checklist for a new organisation. |
| Project tracker and band (six steps, what to do now, next) | Exists | Passes 2–3. |
| Plan step: what the filing needs, Assign, team, tasks | Exists | Pass 3 (`ProjectPlan.tsx`, `IndFilingPlan`, `PlanAssign.tsx`). |
| Project page layout: steps first, AnA composer and conversations in the open step's side column | Modify | `.pj-grid/.pj-side` exists on Author only; one composer extracted from Home's (three live composers today). |
| Document build tools beside the editor, by document type | Modify | The editor (`DocumentWorkbench`) knows a document's template; each type's existing features open from its side rail at the right phase (see the IA). |
| Feature door ("do this in X") | Exists | The pattern of passes 2–3: one button, named for the job, gated by `useSurfaceAvailable`, opening on the open project. |
| Plan & features (admin) | Modify | Cards name the step or document where each feature is used instead of an Open button. |
| Sequence in progress in the project header; Submit lists every sequence | Modify | `ProjectStatusLine`, `ProjectMarkets`. |
| Projects filtered by sponsor client (consultancies) | Modify | `.pj-toolbar`. |

No new visual component is needed. Every row above extends one that exists.

## Key Interactions

- **Open a project** → the steps, then the open step. A project with no documents opens on Plan; otherwise on
  Author. A step a person or AnA chose is never overridden.
- **Start a deliverable** (Plan) → creates the working copy from its template in this project and opens it in the
  editor; the row then says it is started and offers Open.
- **Assign** (Plan) → drawer: person, due date, note → one task in the task store, scoped to the project; the row
  says who has it and by when; their Home lists it.
- **Use a feature in a document** → from the editor's side rail, "for this document" tools appear by its type
  (an IB shows its section readiness; a CSR its E3 map and narratives; Module 3 opens CMC composition). Each opens
  on this project and this document, and returns to it.
- **Next step** → every step names the next one; a person can always go on without choosing from a list.
- **Ask AnA** → in every step's side column and on Home; AnA works inside the step, never as navigation.

## Responsive Behavior

Desktop first; phone for checking. At 390 px: no sideways scroll, 16 px gutters, the rail collapsed to icons, the
step tracker scrolls, the open step's side column stacks under the main column, list rows keep 44 px touch targets.

## Accessibility Requirements

WCAG 2.2 AA. Text contrast 4.5:1 in both themes (the generated ramp on tinted surfaces). The tracker is a `nav` with
`aria-current="step"`. Every disclosure (phases, deliverables) is a `details/summary` with a visible focus ring.
Drawers trap focus and restore it (`useDialog`). State is never colour alone: "Assigned: Dana Ruiz, due Nov 13",
not a dot. Status changes are announced (`role="status"`), failures as alerts.

## Founder decisions this brief needs

1. **Which features outside the release to bring in** (Rule 2: widening the launch scope is the founder's
   decision). The journey has places ready for them; each needs to work on a client's real data first. The
   candidates the inventory found closest to working, by where they would live:
   - Biostatistics (work area; its statistics engine works) and the SAP inside the protocol and CSR.
   - Risk-based monitoring (work area; partial: no way to start it for a project's study).
   - Investigator's Brochure readiness, Nonclinical / Module 4, Safety narratives, CSR section map, Prescribing
     information — document tools (each partial; see the IA for what each lacks).
   - Consistency check across documents (Review), FDA objection precedent (CSR/protocol check).
2. **No retirements.** The four items the inventory first marked for retirement — AnA Authoring Engine (demo
   data), Intelligence catalog (sample data), Codebase coverage (an internal tool), Submission Twin (a simulation)
   — are folded in instead: each function each one has is placed where it belongs (the IA names where), and only
   the empty shell is removed, with its replacement named by path.
3. **Convergence of the 67 duplicates** onto the canonical capability named in the IA, each with a function-by-
   function check that nothing is lost (`FUNCTION_PARITY.md`).
4. **Biostatistics screen and CMC adequacy** — the founder has said both will be addressed later.

## Out of Scope

- Any change to the visual design system or tokens.
- New regulatory capabilities, models or engines; this brief places and completes what exists.
- Server-side convergence of duplicate stores (agency meetings, CRL sources, protocol stores) — named in the IA,
  done as their own changes.
- Admitting any out-of-release feature without the founder's decision.
