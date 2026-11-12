# D2: "Not applicable because …" on a CSR heading, in the one editor (2026-11-12)

Launch row D2, ledger package L1. Founder decision P-115, item 5 (`docs/LAUNCH_DEFINITION_OF_DONE.md`): *"Every
heading holds text. 'Not applicable' is a person's statement with a reason, never a default … The editor offers, on
a CSR heading, the 'Not applicable because …' act the assembly already has for §16."*

The founder, 2026-11-11: *"focus entirely on getting what we built surfaces correctly on the UI and working for GA.
Stay aligned with our roadmap and rules."*

## What a person could not do before

The scientific review refuses a clinical study report in which any heading is blank. The build drafts 69 of the 119
ICH E3 headings and leaves the rest (§3, §14, §15, §16 and their subheadings) to a person. To say that one of those
does not apply to the study, a person had to find it in the outline, open it, and type. In the Lumen account's
LMN-201 report that was 30 headings, one at a time, with nothing listing which they were.

## What already exists (RULE 3)

Nothing new was built: no route, service, table or screen. The act finishes the CSR document's "Build from the
study's data" section of the one editor.

| Path | What it does today | What it did not |
|---|---|---|
| `client/src/concept2cure/v2/surfaces/CsrRunBuilds.tsx` | The CSR document's build section: start, live view, stop and resume, section review, import | Offered nothing for a heading the build does not draft |
| `client/src/concept2cure/v2/surfaces/CsrAssemblyControl.tsx` | "Not applicable because …" for a §16 appendix of the assembled files; saved on the build | Wrote nothing into the document, so the signed record stayed blank |
| `server/services/csr/csr-assembly.ts` | Holds each appendix declaration and its reason (`notApplicable`) | |
| `GET /api/csr/jobs/:jobId/assembly` (`server/routes/csr-jobs.ts`) | Returns those declarations | |
| `GET /api/authoring/docs/:id/sections`, `PATCH /api/authoring/sections/:id` | The editor's own read and save: a revision, the person's reason for change, the stale-copy check | |
| `shared/authoring/csr-scientific-review.ts` | Refuses a blank section | Does not tell a heading that holds only subsections from one that holds text |

Searches run: `notApplicable`, `Not applicable`, `not_drafted`, `manual` (heading flag), `CsrDeclarable`,
`changeReason` across `client/src/concept2cure`, `server/routes`, `server/services/csr`, `server/services/authoring`
and `shared/authoring`; `git log --all --diff-filter=D` on `*NotApplicable*` (nothing deleted).

## What changed

- `client/src/concept2cure/v2/surfaces/CsrNotApplicable.tsx`, split out of `CsrRunBuilds.tsx` into the folder it
  came from (RULE 6), and placed in the build section under the section review.
- It lists the headings the build does not draft whose section **in this document** holds no text.
- A heading with no subheadings takes a reason. "State it in the document" saves
  "Not applicable to this study: *reason*" into that section through the editor's own save, with the reason as the
  reason for change. It is the person's text and a revision of the document. Nothing is written by default, and an
  empty reason offers no act.
- Where the build's assembly already declares that appendix not applicable, its reason is offered, so the report and
  the assembled files say the same thing. The person can change it.
- A refused save (for example, someone else saved the section first) shows the server's reason. A failed read of the
  document's sections is an alert, never an empty list.
- A heading that holds only its subsections is named, with no act: "not applicable" is not what it says.

## Tests: red first, then green

`client/src/concept2cure/v2/__tests__/csrCardReach.test.tsx`, three new cases, 29 of 29 pass:

1. the list names the blank headings and separates the headings that hold only subsections;
2. stating one sends exactly the document's section save, with the sentence, the reason for change and the copy's
   time;
3. a reason already declared in the assembly is offered, and a refused save is shown as an alert.

The component was written in the same step as its cases, so no red run preceded it. They were made to fail
afterwards: with the component removed from the build section, all 3 fail; with the reason for change altered, case
2 fails. Both were restored. The 13 CSR and study-data suites: 133 of 133. Neither source file has a lint warning.
A targeted `tsc` over the component and its test reports nothing.

## Opened in the running app

The stack as a Codespace builds it, with the stand-in model provider (no model key in this environment), signed in
through **Demo access** as the Lumen lead, on "LMN-201 RePreve Part B Clinical Study Report — SYNTHETIC".
`not-applicable.cjs` is the walk (it uses `../../DEMO/2026-11-10-showcase-walk/tour-lib.cjs`).

- The section reads "Headings the build does not draft · 49 hold no text in this document", then "30 headings can be
  stated not applicable here" (`list.jpg`).
- §16.1.8 and §16.1.11 were each given a reason and stated. Each heading left the list, and the document's own
  section then read "Not applicable to this study: …" when opened from the outline (`in-document.jpg`).
- No failed request and no console error.

## Found, and the founder's to decide

**19 headings of an ICH E3 report hold only their subsections** ("5 Ethics", "9 Investigational Plan",
"12 Safety Evaluation" and 16 more). Their own section in the document is blank, and the scientific review refuses
any blank section. Today a person must type something under each before the report can be reviewed.

The recommendation is that a heading holding only subsections counts as complete when each of its subsections does.
That changes what a governed review accepts, so it is not a session's change. It is recorded here and put to the
founder.

## Limits, stated

- **§14 and §16 content is not written into the document by this change.** P-115 item 5's second half (the import
  writes the engine's tables, the supplied appendix or the recorded declaration, labelled as engine content) is
  still owed. This act covers the person's statement only.
- **A statement made here is not copied back to the assembly.** The assembly's own declaration is still made in
  "Assemble CSR files". The two agree when a person states the same reason, and the offer of the assembly's reason
  makes that the easy path one way.
- **No real model drafted the headings beside it.** The build in the walk was the stand-in's.
- **A model-drafted CSR still cannot be approved, frozen or filed** (P-115 item 1, P-118).
