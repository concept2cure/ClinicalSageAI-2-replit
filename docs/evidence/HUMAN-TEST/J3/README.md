# J3 — the one editor for documents other than the CSR: author, review, e-sign, freeze, file (2026-11-06)

Journey J3 of `../README.md`. Package F1 (repairs). Walked in the running app at 1440×900 and 390×844, as three people,
on a fresh database, as the runtime role with row-level security and the launch gate enforced. Every defect a tester
would hit is listed below with its fix commit, or with why it remains.

The CSR path is not repeated here: `../../DEMO/2026-11-05-csr-lifecycle/README.md`.

## What a tester can do now (each step done in the running app)

The documents: an **Investigator's Brochure** on the IND project C2C-101, a **510(k) Summary** on the device project
NeuroPanel-Dx, and a **controlled SOP** from Quality.

| # | Step | Who | What the app does | Shots |
|---|---|---|---|---|
| 1 | Project → **Author** → *Find or start a document in the editor* → ⋮ *More document actions* → **New document…** → title, CTD module M1, template *GLOBAL · Investigator's Brochure (IB)* → **Create document** | JM | "Document created · … (15 sections from GLOBAL · Investigator's Brochure (IB))", opened in the editor | `x-02-`, `x-04-`, `x-06-` |
| 2 | The same for the 510(k) project, template *US · 510(k) Summary* | JM | 8 sections: Submitter Information … Substantial Equivalence Conclusion | `x-41-`, `x-43-` |
| 3 | Quality → *Standard operating procedure* → choose the project, title, reason → **Create and open** | JM | The SOP's editing copy opens in the same editor: Purpose … Approval | `x-52-`, `x-53-`, `j3-f6-` |
| 4 | Write in a section; **Save** asks *Why this changed (at least 8 characters)*; save | JM | "Saved", a revision recorded; without a reason: "Not saved — say why…" | `x-07-` |
| 5 | Select text → **Comment** (end of the ribbon) → write → **Add comment** | JM | The comment rail lists it, anchored to the quote; **Resolve** asks for a reason and keeps the thread | `x-11-`, `x-12-`, `x-35-`, `x-36-` |
| 6 | **Track changes** on, type | JM | The insertion is an attributed suggestion; "1 suggested edit" | `x-13-` |
| 7 | **Document** view; ⬇ download → *Working copy (Word)* | JM | The whole document; a `.docx` marked "DRAFT — uncontrolled copy". Controlled export waits for freeze or approval | `x-14-`, `x-15-` |
| 8 | **Build document or section** → template, target, reason → **Preview build** → **Build document** | JM | Preview lists each section's disposition; the build saves the structure ("Structure is saved…") | `j3-f1-` |
| 9 | Build with **Draft empty eligible sections with AnA** (510(k)) | JM | "No AI provider is configured for this deployment, so this section cannot be drafted. Nothing was changed." | `x-44-`, `x-45-` |
| 10 | **Draft with AnA** in a section | JM | The conversation opens beside the canvas; the ask is answered "No AI provider is configured for this deployment, so AnA cannot answer. This is a server setting, not your connection." | `x-20-`, `x-21-` |
| 11 | **E-sign** → *Authorship* → reason, password | JM | "Authorship signature recorded … The 21 CFR Part 11 audit trail has a new entry." | `x-46-`, `x-47-` |
| 12 | ⋮ → **Send for review…** → reviewer, reason, due date | JM | One request, a route and a task for the reviewer; the author is never offered as reviewer | `x-23-`, `x-25-` |
| 13 | Project → **Review** → the review board → **Record review decision** → Approve | Rhea | The whole saved document is shown before the choice; "Your decision recorded — Approved" | `x-26-`, `x-27-`, `x-28-`, `x-30-` |
| 14 | Board → **Request changes…** (510(k)) → reason → *Record change request* | Rhea | Opens at "Request changes"; the author's ⋮ → Review tasks reads "Returned by Rhea Reviewer: …" | `j3-f4-`, `x-58-` |
| 15 | **E-sign** → *Review* | Rhea | "Review signature recorded …" | `x-31-esign-reviewer`, `x-33-esign-reviewer-after` |
| 16 | **E-sign** → *Approval*, with one comment unresolved | Ava | Refused first: "still has 1 unresolved comment…", with *Go back and resolve them* / *Approve it as it stands* | (described; the shot was overwritten by step 17) |
| 17 | After the author resolves the comment: **E-sign** → *Approval* | Ava | "Approval signature recorded …"; the document is **Approved** and **Frozen**; editing refused | `x-33-esign-approver-after` |
| 18 | **Place into filing** → submission, sequence 0000, code 1.14.4.1, reason | JM | "Placed as leaf 1.14.4.1 in sequence 0000 · original — server-confirmed (leaf #14…)" | `j3-f3-`, `x-56-` |
| 19 | The controlled SOP in the editor | JM | Freeze and E-sign are refused: "Reviewed and signed in Quality" (the full sentence on the controls) | `j3-f7-` |
| 20 | 390 wide: the editor, the review board, the signing dialog | all | No page-level horizontal overflow (0 px); the ribbon scrolls inside itself | `x-60-`–`x-63-` |

## Defects found, and their fixes

Each fix has a test that fails at trunk and passes with it, and was checked again in the running app.

| # | Step | Expected | Actual (before) | Fix |
|---|---|---|---|---|
| F1 | 8, Build document | The build saves and says so | **503** "The document build could not be verified or completed", though it had committed. After COMMIT the re-admission read the project on a connection whose tenant scope is transaction-local, so forced RLS returned no project | `7569f8f0` (`server/services/authoring/authoring-assembly.ts`) |
| F2 | 8, AnA in the build (IB) | The reason AnA will not draft | "This preparation template or unresolved regional scope…": the IB is not a preparation template; GLOBAL names no receiving agency | `716e6647`: the reason names the cause that applies; the refusal is unchanged |
| F3 | 18, Place into filing | A code the dialog accepts, or none | Prefilled "1" and refused it in red in the same breath | J4's `a036a648` (same fix, landed first) and J3's `c7893b2b` (the hint: "Enter the CTD code it is filed at…") |
| F4 | 14, Request changes… | Opens at Request changes | Opened at "Not stated — choose", exactly as Record review decision | `44d46363` |
| F5 | 13, the board | A preview of the document's text | "No section content yet." (the first section, an empty Title Page) | `7befffa0` |
| F6 | 3, the SOP in the editor | Section titles | "qms-purpose Purpose", "title_page Title Page" as numbers; and "These sections are stored in an order that differs…" on a document the product had just created | `636585c0` (`shared/regulatory/section-code.ts`) |
| F7 | 19, the SOP's bar | One line | The two-sentence QMS refusal wrapped into four lines in the bar | `b470f7f2` |
| F8 | under every section | "This section…" | "This document has no text yet." on an empty section of a written document; "…% of this document" for one section | `fe0e3f91` |
| F9 | 5, Comment with nothing selected | A word on what to do | Nothing happened | `d3ba7ea2` |
| F10 | 5, the comment rail | The author's name | "jm.smith@concept2cure.pro" | `1e341685` |
| F11 | every section | "1 revision" | "1 revisions" | `86aac9c9` |
| F12 | the 510(k)'s Project files rail (J1's handoff) | Vault and Data room | An "IND documents" lane on a device filing | `c9f51eac` |

## What remains (not fixed here), with the reason

The status column was added on 2026-11-09. A fixed row keeps its original text so the finding stays readable.

| # | What a tester sees | Why it stays | Status (2026-11-09) |
|---|---|---|---|
| R1 | At 1440 px the ribbon's **Comment** and **Track changes** sit past its right edge; the ribbon scrolls sideways | The ribbon is deliberately one scrolling row (`styles/rich-section-editor.css`, `.ed .rse-ribbon`); moving them is a layout decision for D4 | **Fixed.** `9273b055b` (D4-6: one row, with More formatting and AnA's actions as icons) and `b7fff28fd` (the ribbon spans the page); walked in the running app (`docs/evidence/DESIGN/D0/D0-15-running-app-walk/ribbon-after/`) |
| R2 | After "Request changes", opening the document shows nothing about it; the reason is under ⋮ → Review tasks | Showing it on open is a change to the editor's layout (D4) | **Fixed.** `da668fca6`: a review returned for changes is said where the document opens |
| R3 | The SOP shows **Place into filing** and "Unbound working copy … place the document into a filing", though Project home says quality documents are not part of the filing | Whether a controlled document may ever be filed is a product decision | Open: a founder decision |
| R4 | Quality's *New controlled document* does not preselect the project the page is opened for | Quality is J5's surface; told to J5 here | Open: J5's |
| R5 | "Filings in this project · FDA · IND — home filing" wraps one word per line in the editor's left column | Layout (D4) | **Fixed.** `4a281557c`: the line reads on one line, its button beneath |
| R6 | With the canvas open, the conversation's composer controls crowd and clip at 1440 px (`x-20-`) | The conversation lane's layout | **Fixed.** `dbc080553` (2026-11-06): the foot wraps into centred rows inside the column. Rechecked in the running app on 2026-11-09 at 1440 light and dark and at 1280, where every control sits inside the column and is visible (`docs/evidence/D4/2026-11-09-composer-beside-canvas/`) |
| R7 | An approval was accepted on an IB with 14 of 15 sections empty | Not a refusal to loosen; whether approval should require every section is the founder's decision | Open: a founder decision |
| R8 | New document lists all 469 templates on every project, and CTD module choices on a 510(k) | Filtering the catalog by client type is a product change | Open: a product change |
| R9 | The build preview tells an empty section "Preserve existing section and text … only if this saved section is empty" | Copy in the assembly plan; low | **Fixed.** `bba3a4336`: the preview says what the build will do (`docs/evidence/D4/2026-11-09-build-preview-words/`) |
| R10 | The decision dialog's receipt reads "Revision not recorded" | Low | **Fixed.** `f6694d692`: a revision is named only when the document has one (`docs/evidence/D4/2026-11-09-decision-receipt-revision/`) |

## Known limits without a model key

Real drafting does not happen: *Draft with AnA*, *Draft empty eligible sections with AnA*, *Offer alternatives* and
*Ask for a source*. Each refuses plainly ("No AI provider is configured for this deployment…") and changes nothing.
Template text is never shown as drafted. A GLOBAL (ICH) template is never drafted by AnA, key or not: it names no
receiving agency (F2).

## Setup and accounts

```
# PostgreSQL 16 with pgvector 0.6.0; an empty database j3
DATABASE_URL=postgres://postgres:…@127.0.0.1:5432/j3 APP_SERVICE_DB_PASSWORD=<12+ chars> node scripts/db/install-fresh.mjs   # exit 0
DATABASE_URL=… DATABASE_OWNER_URL=… APP_DATABASE_URL=postgres://app_service:…@…/j3 node scripts/db/deploy-migrate.mjs           # exit 0
node scripts/seed-admin.mjs                                     # JM Smith, jm.smith@concept2cure.pro (author)
ADMIN_EMAIL=rhea.reviewer@concept2cure.pro ADMIN_NAME='Rhea Reviewer' ADMIN_PASSWORD=… ADMIN_ORG_SLUG=concept2cure node scripts/seed-admin.mjs
ADMIN_EMAIL=ava.approver@concept2cure.pro  ADMIN_NAME='Ava Approver'  ADMIN_PASSWORD=… ADMIN_ORG_SLUG=concept2cure node scripts/seed-admin.mjs
# server, as the runtime role
NODE_ENV=development ALLOW_DEV_AUTH=1 PORT=5200 RLS_ENFORCE=on LAUNCH_SCOPE_ENFORCE=on \
  DATABASE_URL=postgres://app_service:…@127.0.0.1:5432/j3 ALLOWED_ORIGINS=http://127.0.0.1:5200,http://localhost:5200 npx tsx server/index.ts
DEMO_SEED_EMAIL=jm.smith@concept2cure.pro npm run demo:seed -- --pack all --base-url http://127.0.0.1:5200   # exit 0; manifests not committed
```

- **People.** JM Smith (author, `dev-login`), Rhea Reviewer (reviewer), Ava Approver (approver). Signers' passwords
  are the `ADMIN_PASSWORD` given to `seed-admin`; none is committed.
- **No model key.** The gateway has no provider.
- **Walk scripts.** `walk/*.cjs`, each one step, run as `node walk/<file>.cjs http://127.0.0.1:5200` with
  `J3_SIGNER_PASSWORD` for the signing steps; helpers in `common.cjs` (the CSR walk's sign-in).
- **Screenshots.** `screenshots/x-*` are the walk; `j3-f*-` are the re-checks after each fix. `x-27-` and `x-37-`
  show F5 and F3 before their fixes.

## What already exists (RULE 3)

Nothing was added. Every step is an existing path: `editor/DocumentWorkbench.tsx` (New document, sections, outline,
Document view), `editor/RichSectionEditor.tsx` (ribbon, comments, track changes), `editor/SendForReviewDialog.tsx`,
`surfaces/Review.tsx` and `ReviewDecisionDialog.tsx`, `surfaces/AuthoringFilingBar.tsx` (Freeze, E-sign),
`surfaces/AuthoringPlaceIntoFiling.tsx`, `/api/authoring/docs/:id/assembly/{preview,commit}`, Quality's
`/api/mdx/qms/documents`. Each fix completes the file it names in its `Completes:` trailer.
