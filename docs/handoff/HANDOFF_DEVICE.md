# Session Handoff — Medical Device & Diagnostics Stream

**Commit to `docs/handoff/HANDOFF_DEVICE.md`.**

**Scope:** 510(k), De Novo, PMA, IVD. FDA eSTAR pathway.
**Last verified:** 2026-09-03 against the Phase 2 commit on `concept2cure-v2` (base `499f096`).

This file is self-contained. An agent working this stream needs no other handoff.

---

## 0. How a new agent starts

Paste exactly this as the first message of a new Claude Code session, and nothing else:

> Read `docs/handoff/HANDOFF_DEVICE.md` in full before anything else. Then read only
> the files it names. Do not read the whole repo. Do not propose work. Report what you
> understand the current state and the single next authorized action to be, and stop.

Do not paste a work order alongside it. The agent will start building before it knows
where things stand.

---

## 1. This stream's territory

**You may edit:**
- `server/services/pathway-engines/estar/`
- `server/services/pathway-engines/device-assembly/`
- `server/services/forms/`
- `assets/estar-templates/`
- `server/routes/510k-estar-routes.ts`
- `server/routes/510k-device-routes.ts`
- `client/src/concept2cure/mdx/` — the device and diagnostics surfaces, hooks and kit
  (added 2026-09-07 when JM made this stream a product to own; it was never in the
  platform stream's list, and its four honesty leaks were nobody's to fix)
- `client/src/concept2cure/v2/surfaces/DeviceSurfaces.tsx`

**You may not edit:**
- anything under `server/services/ectd/`, `server/services/ind-forms/`, or
  `assets/ectd-dtd/` — that is the biotech stream, running concurrently
- `client/src/concept2cure/v2/Shell.tsx`, `V2App.tsx`, `ConversationThread.tsx`,
  `AnaActivity.tsx`, or `styles/app-v2.css` — that is the platform stream

If your work appears to require a file outside your territory, **stop and report it.**
Do not edit it. Two streams are running.

---

## 2. Ground rules

1. **Branch `concept2cure-v2` only.** Never create a branch.
2. **No file proliferation.** Refactor in place. No `-v2`, `-new`, `-final` filenames.
3. **The machine room is sacred.** Editor, artifact lifecycle, provenance, review,
   submission, vault, audit chain, tenant isolation. Do not restructure any of it.
4. **Fail closed, never fabricate.** Never emit a plausible PDF, a fake validation
   pass, or a mock action that reads as real. Enforced by CI.
5. **Done means JM clicked it.** You report and stop. You do not declare completion.
6. **One click per session.** Do not chain. Do not start the next click early.
7. **A blocked step is blocked.** Report it. Do not route around an egress denial.
8. **No new dependency.** The XFA work on this stream was done on Node's built-in
   `crypto`. Hold that line.
9. **Proof goes in `docs/reports/`.** Adjectives are not proof.

---

## 3. Where truth lives

| Source | Use it for |
|---|---|
| `docs/reports/wo8-phase2-estar-demo-2026-09-03.md` | **The authoritative state of this stream** (Phase 2) |
| `docs/reports/wo8-phase1-estar-unblock-2026-09-03.md` | Phase 1 — the fill engine, the XFA finding, the field map |
| `docs/handoff/WO-08_MDX_510K_ESTAR_DEMO.md` | Phase 2 click sequence — **this file does not exist in the repository**; the clicks as shipped are §6 of the Phase 2 report |
| `assets/estar-templates/README.md` + `checksums.txt` | Vendored template provenance |
| `CLAUDE.md` | Repo law. Current and clean. |

**Where WO-08 and the proof report disagree, the proof report wins.** WO-08 §1.4–1.5
assume the eSTAR is a fillable AcroForm. That premise was measured and is false — see
§4 below. Do not act on those steps.

**Ignore `docs/design/ANA_CHATGPT_PARITY_UI_DESIGN.md`.** It names `ZenApp.tsx` and
`ZenSidebar.tsx` as canonical; both files no longer exist. The architecture it
describes was retired. Any root-level markdown older than 2026-08 is a snapshot, not
an instruction.

---

## 4. Current state — Phase 1 COMPLETE and verified; Phase 2 BUILT and proven structurally

> **2026-09-05 — read this before trusting anything below.** Until this date the
> production container never shipped `assets/`, so the official FDA eSTAR templates did not
> exist at runtime and EVERY produce answered 422 with "the official template is not
> vendored. Place it in assets/estar-templates/" — a path inside a container no client has.
> The whole official-eSTAR path worked only from a repo checkout. Every capability recorded
> below was real in development and unreachable in the deployed product. `Dockerfile.optimized`
> now copies `assets/`, and `deploy-migration-mechanism.contract.test.ts` asserts it, derived
> by scanning the server source for `process.cwd(), 'assets/…'` drop-points so a new one is
> covered the day it is written.

`estar-fill` returns `filled: true` with an empty `blockers` array for `510k-device`,
and the output PDF was read back field by field: **20 of 20 pass.**

**Templates.** Both nIVD and IVD eSTAR v7.0 are vendored at `assets/estar-templates/`,
pinned by SHA-256 in `checksums.txt`. `estar-template-registry.ts` has `version: '7.0'`
for `510k-device` and `510k-ivd`. The other seven descriptors remain `'unset'` — that
is correct, not an oversight.

**The original premise was wrong.** Both templates are Adobe LiveCycle **dynamic XFA**,
permission-encrypted (`/Filter /Standard`, V4 R4 AESV2, empty user password), with
`/NeedsRendering true` and an AcroForm `/Fields` array of length **zero**. The real
fields live in the `/XFA` packets. `listAcroFields()` threw; forcing the document open
with `ignoreEncryption` returned 0 fields. So `POST /api/510k/estar/scaffold-field-map`
was returning HTTP 500, and no `acroField` name could ever have matched.

**What was built** in `server/services/forms/fill-official-pdf.ts`:

- `isDynamicXfaPdf()` — detects `/NeedsRendering` and `/XFA`
- `listXfaFields()` — enumerates SOM path, widget type, the template's own caption, and
  whether the path exists in the `datasets` skeleton
- `fillXfaDatasets()` — writes into the `datasets` packet and emits a PDF **incremental
  update**: the original bytes are preserved verbatim, a new revision of the single
  `datasets` object is appended with a fresh cross-reference stream. Nothing else is
  disturbed. That is what keeps the output the real FDA form rather than a re-render.
- `readXfaDatasetsValues()` — reads back, for verification

Standard-security decryption (Algorithm 2 key derivation, per-object keys, AESV2 and
RC4) implemented on Node's built-in `crypto`. AESV3/V5 is explicitly rejected with a
named error rather than mis-decrypted.

**Independent verification.** Decrypted, inflated XFA packets are byte-identical to
`pypdf`'s extraction (nIVD `datasets` object 244, 17,408 bytes, sha256 `305e4363…`;
`template` object 5, 9,877,094 bytes, sha256 `c479abf5…`). The filled output was
re-read by `pypdf`, which resolves `/XFA` through the xref chain, confirming the
appended cross-reference stream is structurally valid.

**Two other defects found and fixed:**
- `listAcroFields` / `fillOfficialPdf` called `PDFDocument.load()` with no options
  while `ind-form-fill-service.ts:218` already passed `{ignoreEncryption: true}` for
  the same class of file. Both now pass it.
- `slugifyAcroFieldName` (`510k-estar-routes.ts:603`) collapsed every Adobe-authored
  name to `"0"`, because XFA names end in an occurrence index and it took `.pop()`.
  Every key collided into `0, 02, 03…`. It now takes the last non-index segment.

**Enumeration:**

| Descriptor | fieldCount | fillable | in `datasets` | captioned |
|---|---|---|---|---|
| `510k-device` (nIVD 7.0) | 1,318 | 574 | 454 | 411 |
| `510k-ivd` (IVD 7.0) | 1,577 | 656 | 538 | 459 |

**Field map:** 20 entries for `510k-device`, 19 for `510k-ivd`, in `estar-field-map.ts`.
Every path enumerated from the vendored template and verified present in its `datasets`
skeleton. None hand-typed. `510k-ivd` lacks `indicationsForUseCitation` because the IVD
template does not declare `root.Labeling.SpecificLabeling.LBTextField130` — the
generator rejected it rather than mapping a nonexistent path. That is correct behaviour.

**Fail-closed verified three ways:** missing template → 1 named blocker; unmapped
descriptor (`de_novo-device`) → 2 blockers; mapped path the template does not declare →
filled the real field, skipped the bogus one, warned, invented nothing.

**Tests:** `server/services/pathway-engines/estar` — 10 files, 91 tests, all passing.

### 4b. Phase 2 (2026-09-03, session B) — the official eSTAR is filled from governed records

Before this session the only caller of `POST /api/510k/estar/official` sent `data: {}`: every mapped field
was skipped and the user downloaded a blank official form under a plain "Downloaded" line. Now:

- `estar-administrative-data.ts` declares, per canonical key, the ONE governed source a value may come from
  (11 of 20 keys have one; 9 are user-supplied only), projects the org's records onto the keys with
  `store.column` provenance, and merges typed values underneath (governed wins; collisions reported).
- `POST /official` with `useProgramData: true` fills from those records and returns `fieldReport`
  (filled / blank / ignored); `fieldSources` travels into the artifact metadata. Without the flag it behaves
  exactly as before.
- `GET /official-fields` previews what will be written, per field, with its source.
- `OfficialEstarPanel` is the one Generate control on both the 510(k) and the IVD surfaces: readiness gate,
  governed values read-only with their source in words, inputs for unsourced keys ("entered for this export
  only · not stored"), and the filled/blank/ignored report after the run.
- The device golden journey, red on `499f096` since W1-5, is green and asserts the success path.
- Second pass: an IVD program filing a 510(k) is produced on the IVD eSTAR (the 510(k) surface had a
  literal nIVD variant); the Generate control locks BEFORE the first click on an enforced entitlement
  denial (`GET /api/510k/estar/entitlement`); the 510(k) surface no longer crashes on an unreadable
  section-list body.

Proof: `docs/reports/wo8-phase2-estar-demo-2026-09-03.md`. 61 test files / 882 tests green across the eSTAR engine, forms, routes, MDX kit and the device golden journey.

---

## 5. The Acrobat question — what is now answered, and what is still JM's

Most of this section's original question has been answered without Acrobat, by reading the
template's own scripts. The write-up is `docs/reports/estar-acrobat-behaviour-2026-09-04.md`
and every claim in it is re-derived from the vendored binary on each test run by
`estar-field-map.template-behaviour.test.ts`.

**Answered.**

- The filled form opens looking blank, and nothing in the template unhides it. The whole
  9.88 MB template packet declares exactly one `initialize` event and it makes zero
  `presence = "visible"` assignments. Every reveal hangs off a `change`, `exit` or `click`.
- Nothing overwrites our values on open. The scripts that recompute the summary cells run on
  user activities, not on binding.
- The values are bound correctly. pdf.js, an independent XFA engine that runs no scripts,
  renders a written value at its exact node once its container's `presence` is flipped in a
  scratch copy, and on the shipped bytes it renders a written radio selection and overrides
  one FDA ships.
- The saved `form` packet cannot shadow the datasets write: it declares no node for any
  mapped field, and it stays byte-identical after a fill.
- Four of the twenty cells were being destroyed by the applicant's first click. Three of
  those are fixed: the two source fields FDA rebuilds them from are now written.

**Still JM's, and no agent may attempt it.** There is no Acrobat in the build environment.
The step from "only a `change` handler reveals this" to "Acrobat will not reveal it on open"
is an inference from XFA event semantics — a well-supported one, corroborated by FDA's own
Import Data button replaying those events by hand, but an inference. The specific things to
look at when the file is opened are listed in §6.

---

## 6. The product roadmap — owned by the stream, not clicked one at a time

**2026-09-07.** JM asked whether the device and diagnostics product is ready to sell as an
end-to-end 510(k) system — ideation to filed eSTAR, FDA letters back, responses and
resubmission — and, if not, made the answer this stream's to own. Four audits measured it
(`docs/reports/device-market-readiness-2026-09-07.md`). **The answer is no.** The platform
produces the real FDA form with 20 administrative boxes filled, 0 of 112 attachment slots
populated, no transmission, no letter loop, and four fixture leaks on the demo surface.
What is sellable today is governed authoring with eSTAR administrative pre-fill, audit trail
and tenant isolation.

The roadmap below replaces "JM names the click" for this stream. Work it in order; each
item is a session or more, ends with a proof in `docs/reports/`, and a row in §9. Rules
§2 still hold — fail closed, no new dependency, no file proliferation, seen failing first.

| # | item | why this order | status |
|---|---|---|---|
| 1 | **Make the demo path honest.** Remove the four leaks in report §3: the hardcoded "BX-204 · Stage 5 of 7 · 41 days" header, the ungated blocker count, the banner promising withheld rows, and `MDX_HEALTH` on an empty overview. | Disqualifying for any demo; WO-8 Phase 3 acceptance; an hour. | **done 2026-09-07** — `k510HonestEmptyState.test.tsx`, seen failing on all four first |
| 2 | **Predicate: select and persist.** `PUT /api/510k/device/profile` accepts `predicateDevices`; the 510(k) surface's selection writes it; the two predicate fields on the eSTAR fill from a user's action, not `seed-demo.ts`. SE comparison stays an authored section. | Unblocks the funnel's middle honestly without the absent ML service; removes a WO-8 stop condition ("depends on a seeded response"). | **done 2026-09-07** — `docs/reports/wo8-predicate-of-record-2026-09-07.md`. A *predicate of record*, distinct from the comparison checkboxes: claimed deliberately, audited by K-number, withdrawable, never claimable from a fixture row, and claimable from a reduced openFDA clearance |
| 3 | **Retain and bind the filed artifact (Part 11).** Store the delivered eSTAR bytes immutably with their sha256; make draft→filed a governed, signed transition bound to that hash with a server-stamped `filedAt`; make the unplaced-export audit actually propagate failure. | A regulated buyer's QA opens these before field coverage. | **done 2026-09-07** — `docs/reports/wo8-estar-retention-2026-09-07.md`, all three parts. The delivered eSTAR is retained through the canonical vault ingest, content-addressed, and withheld if it cannot be; the un-audited export is refused; filing is a signature — re-auth first, `filedAt` server-stamped, bound to the retained document's own stored hash, written through `persistGovernedActionSignature` on one transaction, with a signing form on the surface |
| 4 | **Embed attachments in the official eSTAR** (repo checklist item B4). A slot map (section → one of the 112/140 `AddAttachment` slots → its `/CHAPTER n/CHn.nn/` manifest token → its indicator); a multi-object incremental-update writer that allocates `/EmbeddedFile` + `/Filespec` objects under the template's AESV2 key and rewrites the catalog's `/Names /EmbeddedFiles`; the `form`-packet occurrence + `AttachmentName`; bytes sourced from authored sections (rendered) and vault evidence. | The keystone. Without it nothing the platform authors reaches the filed form. Largest PDF engineering left; keep it on `node:crypto` + `pdf-lib`. | **slices 1–4 of 5 done 2026-09-07** — `docs/reports/wo8-estar-attachments-2026-09-07.md`. A file is genuinely attached to the real FDA eSTAR now, with the form and its scripts intact: the writer takes a LIST of mixed-shape objects; `pdf-embedded-files.ts` enciphers the `/EmbeddedFile` + `/Filespec` pair; `pdf-object-store.ts` reads indirect objects out of compressed, enciphered object streams; `pdf-attach.ts` MERGES `/EmbeddedFiles` into the catalog's names dictionary beside the `/JavaScript` that is the form's behaviour. pypdf reads the result cold: the attachment listed with a matching sha256, 3 JavaScript entries, 20 XFA packets, the fill still there. And the slot map is read from the template rather than transcribed: **113 nIVD / 145 IVD slots** (corrected 2026-09-08 from 112/140) with their `/CHAPTER` tokens and FDA's own descriptions — the same counts the market-readiness audit reached from the opposite direction. **Slice 5 is specified in that report §4, and a measurement changed its shape**: `AttachmentManifest` is a DATASETS node (`root.AttachmentManifest`, seeded `***Start***`), so the token CDRH routes by is writable through the existing fill engine — no `form`-packet surgery. What remains genuinely unmeasurable here is whether CDRH's validator accepts a machine-assembled eSTAR; **one reference artifact from JM settles it** (see §7.3 below) |
| 5 | **A device-native FDA letter loop.** Letter intake as a file (text extraction exists), 510(k)-aware deficiency parsing (RTA, AI-hold, SE/NSE) mapped to `cerv2_510k_sections`, responses drafted through the existing `/ai/draft`, an amendment package on item 4, `additional_info` carrying content not just a status. | JM named it; it depends on 4. | open |
| 6 | **Transmission.** Prepare the package side for FDA ESG (S/MIME PKCS#7, or SFTP) and document the CDRH Portal upload; **blocked on FDA test accounts and certificates only JM can obtain.** | Last, and partly JM's. | blocked on JM |

Outside this stream, flagged not taken: `ENTITLEMENTS_ENFORCE` defaults to off with no
production startup assertion (`server/services/entitlements/require-entitlement.ts:61–67`) —
platform stream. And a testing hazard found on 2026-09-07: several suites mock
`auditService.logAction` as `async () => undefined`, a shape the real service cannot
produce. Two of them hid the fact that "an export is never delivered un-audited" was false.
The rest pass only because their paths do not read the outcome — which is a latent version
of the same defect, not a safe state.

The Acrobat walk-through of §5 remains JM's and remains open; nothing in this roadmap
depends on it, and item 4 will need it again once attachments embed.

## 7. Other JM-only tasks on this stream

0. **An eSTAR with one attachment, added in Acrobat and saved** (added 2026-09-07; sharpened
   2026-09-08 — it now settles FOUR questions, not one: whether a datasets-only manifest
   survives the LiveCycle runtime, whether CDRH needs the `form`-packet occupancy or routes by
   the manifest alone, whether Acrobat writes `/Desc`, and what the completeness indicators and
   the `form` packet's `checksum` become. See `docs/reports/wo8-estar-attachments-2026-09-07.md`
   §4b–4c.) The single most useful artifact anyone can hand this stream. Open the vendored
   `eSTAR-510k-non-ivd.pdf` in Acrobat Pro, press any one "Add Attachment" button, attach a
   small PDF, save. Its `datasets`, `form` and `/EmbeddedFiles` diff against the blank
   template IS the specification for the last slice of roadmap item 4 — what Acrobat writes
   for an occurrence, whether the `form` packet's `checksum` attribute changes, and what the
   completeness indicators become. Everything else about attachments has now been measured
   from the templates; this is the one thing that cannot be.


1. **Legal check** on redistributing FDA templates inside a commercial product. FDA
   materials are generally US Government works, but counsel has not confirmed it. If
   counsel says no, the fix is a directory move — point `ESTAR_TEMPLATE_DIR` out of
   tree. No code change required.
2. **Provenance.** The current eSTAR bytes came from JM's transfer, not a recorded FDA
   URL (agency hosts are egress-blocked in the build environment). If auditable
   provenance is required, re-download from FDA and confirm the SHA-256s in
   `checksums.txt` match.
3. **The Indications for Use citation on an IVD program.** The device intake form collects
   it for every program, and the IVD eSTAR template does not declare
   `Labeling.SpecificLabeling.LBTextField130`, so on an IVD filing the value is stored and
   never reaches the form. Nothing is misfiled and nothing is blank on the filed eSTAR — the
   IVD form simply does not ask the question — and the eSTAR preview omits the row for IVD,
   so it never claims otherwise. What is missing is a word to the operator at the point of
   entry. It was left alone deliberately: the only honest way to say it is to read which keys
   the descriptor's map carries, and the map is server-side, so the intake panel would have
   to take a second fetch to learn a fact about one field. Worth doing when the panel needs
   that fetch for another reason; not worth a fetch of its own.
   **2026-09-07 — the fill report now says it.** Measured on the vendored IVD template: a
   fully populated program's citation was projected, then vanished from the fill — absent
   from `data`, `fields`, the ignored list and `advisories`, while the report read
   "19 mapped, 19 filled, 0 blank". `resolveOfficialEstarFields` now emits one advisory for
   every governed fact the descriptor's map has no key for, naming the key, its home and its
   value, and `useEstarExport` already prints advisories in the export status line, so an
   IVD filer sees it at the moment of export. Seen failing first on the IVD template. The
   word at the point of ENTRY is still deferred, for the reason above.
4. **Name the click for every session.** The agent never chooses its own next task.

---

## 8. Do not

- Map more of the 434 remaining fillable nIVD paths. They are enumerated and available;
  they were left unmapped because nothing upstream supplies values for them yet. Mapping
  a field with no source is how fabrication starts.
- Set `version` on the seven `'unset'` descriptors. Those templates are not vendored.
- Add a dependency to solve a PDF problem.
- Create `config/ui-surface-registry.json`. It does not exist and is not the registry.
  The real ones are `shared/constants/ui-surface-registry.ts` and `.ui-v2.ts`.
- Re-download or mirror an egress-blocked host. A 403 is an organisation policy denial;
  report it.
- Write a new architecture document. There are already 939 markdown files in this repo.
- Add a governed source to `ESTAR_ADMINISTRATIVE_SOURCES` that is an inference (the session user as a
  contact, a portal e-mail as an applicant e-mail, a guessed address). A source is a column the platform
  holds for that fact, or `null`.
- Let a request value override a governed one. The precedence flag is typed as the literal `false` on purpose.
- Write the full `XXX (Class N) - <classification name>` composite into the Product Code
  selector to make FDA rebuild the Classification Name cell. It would put a string into a
  filed form that reads as a selection from FDA's 6,153-item catalog but was assembled here
  out of three separate columns. The bare product code asserts only what we hold; see
  `docs/reports/estar-acrobat-behaviour-2026-09-04.md` §4a.
- Vendor FDA's classification tables by scraping them out of the template's 800 KB script
  bodies. They are a snapshot dated inside the template, they would need re-deriving on every
  FDA revision, and nothing needs them.
- Write the applicant or correspondent telephone source fields, or parse the Declaration of
  Conformity address into the template's six address parts. Both are blocked on the shape of
  the stored data, not on the template — see §6. Constraining capture is the fix; a fill-time
  transformation of an operator's value is not.
- Write the pathway radio to make the form open revealed. It does not, and the reasons are
  measured and pinned in `estar-field-map.ts`.

---

## 9. Session log — append one row, never rewrite

| Date | Account | Authorized click | What was proven | Report |
|---|---|---|---|---|
| 2026-09-03 | A | WO-8 Phase 1 — unblock eSTAR fill | `filled: true`, 20/20 read-back, 91 tests pass | `docs/reports/wo8-phase1-estar-unblock-2026-09-03.md` |
| 2026-09-03 | B | WO-8 Phase 2 — device + diagnostic, whole stream (JM: "get medical device and diagnostic fully done now") | official eSTAR filled from governed records with per-field provenance on the 510(k) and IVD surfaces; device golden journey green; second pass: IVD 510(k) on the IVD eSTAR, entitlement lock before the first click, no crash on an unreadable section list; 62 test files / 898 tests green across the eSTAR engine, forms, routes, MDX kit and the device golden journey | `docs/reports/wo8-phase2-estar-demo-2026-09-03.md` |
| 2026-09-04 | C | WO-8 Phase 3 + Acrobat (JM: "get the medical device and diagnostic entire workflow completed, including the PDF or the Acrobat file from eSTAR… not adding new unnecessary features, getting what we have to actually work") | every administrative key has a governed home; De Novo and PMA produce; the template's own scripts read and pinned, settling why no `submissionType` is written; the two SOURCE fields FDA rebuilds the summary cells from are now written, so the applicant's first click rebuilds three values it used to erase; a refused save names its refusal; two keys on one form box can no longer collapse silently; PUT /profile is editor-gated and audited | `docs/reports/estar-acrobat-behaviour-2026-09-04.md` |
| 2026-09-05 | D | Audit + resolve (JM: "continue and resolve", "go to work") | An eight-lens adversarial audit of the whole device + diagnostic stream, three refuters per finding. Fixed: the production image never shipped the FDA templates, so no client could produce anything; the governed-write role gate named three roles the platform cannot grant and locked out every SSO-provisioned user, now ONE implementation in `middleware/orgMembership.ts`; a device program opened on the Diagnostics tab was produced on the IVD template; the seven intake device answers were stored and never read back, so every conditional section stayed undetermined; two ESLint errors whose documented honesty rule had no test. Packaging, role-vocabulary and duplication checks added, each shown failing first | `docs/reports/estar-acrobat-behaviour-2026-09-04.md` + this file |
| 2026-09-07 | E | Close the IVD assumption (JM chose it from the open list; Acrobat report §7 named it) | `estar-field-map.template-behaviour.test.ts` measures BOTH vendored templates, each on its own; every script fact the field map depends on holds identically on `eSTAR-510k-ivd.pdf`; the one textual difference is one space in the reveal guard, seen failing against the nIVD-verbatim string before the IVD line was pinned; 22/22 in the file, whole estar suite green; the IVD map's keys are pinned as a strict subset lacking only the citation the IVD form does not ask | `docs/reports/estar-acrobat-behaviour-2026-09-04.md` §7 |
| 2026-09-07 | E | Close the remaining IVD assumptions in `server/services/forms` (JM: "you choose") | Two more template-derived claims measured on the IVD form instead of inferred from nIVD: the saved `form` packet declares no node for any of the 21 leaves the IVD map writes and is byte-identical after a 19-field fill (seen failing on the pinned key count, 20 vs 19, before the IVD count was pinned); pdf.js renders the filled IVD eSTAR with the same page-1 selector behaviour as nIVD, and the two SOURCE writes carry the same string as their summary cells on both forms. Every test that reads a vendored template in `server/services/forms` now reads both. 29/29 and 12/12 in the two files; forms + estar + device golden journey green | `docs/reports/estar-acrobat-behaviour-2026-09-04.md` §7 |
| 2026-09-07 | E | The governed projection on the IVD form (JM: "continue", choice delegated) | Both governed-fill blocks (`estar-administrative-data` and `.governed-homes`) now run on both vendored templates; all 19 mapped governed values land on the IVD form. Found and fixed: a governed fact the descriptor's map has no key for (the IVD citation) was projected and then silently dropped from the fill report, which read 19/19/0 with no advisory; `resolveOfficialEstarFields` now reports it as an advisory (key, home, value), seen failing first on the IVD template; the client status line already prints advisories | `docs/handoff/HANDOFF_DEVICE.md` §7.3 |
| 2026-09-07 | E | Roadmap item 1 — make the demo path honest (JM: "this should be your product to own") | Four fixture leaks that bypassed the sample-mode gate are closed: no program selected now reads "No program selected" with no stage and no clock instead of "BX-204 · Stage 5 of 7 · 41 days"; the eSTAR blocker count goes through the same gate as the rows (0 sections · 0 blockers on an empty tenant); the shadow-service banner no longer promises example rows the gate withholds; the overview derives its health strip from the empty list instead of MDX_HEALTH. Guard test seen failing on all four before the fix; MDX client suite 42 files / 502 tests green. The market-readiness verdict and the owned roadmap are recorded | `docs/reports/device-market-readiness-2026-09-07.md`; §6 above |
| 2026-09-07 | E | Roadmap item 2 — predicate: select and persist | `PUT /api/510k/device/profile` now accepts `predicateDevices` behind the same role + entitlement + actor gates as the rest of the governed profile write, and the audit entry names WHICH predicate was claimed (or that it was withdrawn), not just that a field changed. The 510(k) panel states what the eSTAR will carry and every candidate row can claim it — including the reduced openFDA rows, which are real FDA clearance records and the only path while predicate intelligence is down. An example row can never be claimed: the control is disabled with the reason on it, through the same `useShowingSample` gate as the rows. Reading back keeps `unreadable` separate from `devices`, because the form fills from element [0] whatever it is. Found and fixed on the way: rendering the surface with LIVE predicate rows looped forever (rows re-derived every render → the seeding effect set state every render); no prior test had rendered that path. 35 / 34 / 11 in the three files, each seen failing first; 3 route files / 73 and MDX 43 files / 521 green; tsc clean | `docs/reports/wo8-predicate-of-record-2026-09-07.md` |
| 2026-09-07 | E | Roadmap item 3 (parts 1 and 3 of 3) — retain and bind the filed artifact | The official eSTAR is now retained BEFORE it is delivered: admitted into the program's governed vault through `ingestVaultDocument` — the one ingest, never a second path — versioned by its own delivered SHA-256, so identical bytes are idempotent and different bytes are a new version the upsert cannot overwrite. A retention that should have happened and did not withholds the file (500 ESTAR_NOT_RETAINED, no bytes); a stored hash that is not the delivered hash is refused; a legacy project with no program vault is said plainly and still delivered. The AV gate gained an explicit `origin` so a scanner this repo configures nowhere cannot take the export down with it — default unchanged, unreachable from any HTTP schema. Separately: `createAuditedUnplacedExport` claimed "an export must never be delivered un-audited" while awaiting a `logAction` that never rejects; it now inspects the outcome and refuses, and the test fake that hid it (`async () => undefined`, a shape the service cannot produce) is fixed in three suites. Route wiring proven failing against a stashed route file first. 163 files / 2031 tests, tsc clean, every pre-push gate green | `docs/reports/wo8-estar-retention-2026-09-07.md` |
| 2026-09-07 | E | Roadmap item 3 (part 2 of 3) — filing is a signature | `PATCH /submissions/:id` accepted a filing date the CLIENT chose, a free-text tracking number, and no link to any artifact; the most consequential act in the workflow asked for nothing. `filedAt` is gone from the request schema — the server stamps it, and recording a filing made elsewhere is an import, not a lifecycle transition. A filing now names the retained eSTAR and the server reads that row's hash ITSELF, org-scoped, so a filing cannot claim bytes nobody stored. `applySignedFiling` does the whole act on one transaction: resolve the artifact, UPDATE re-asserting org AND the status it was validated from (a row that moved matches nothing rather than being signed), then the ledger pair and an `electronic_signatures` row through the single write path, bound with a new explicit basis. Re-auth runs first and only for this transition, and records what was actually verified — `password+totp` only when a token was presented. On screen the unlabelled Filed button became a signing form fed by a new org-scoped `GET /retained-artifacts`, which cannot offer what the write would refuse; the repo's own dataGateContract test caught the first draft hand-rolling two alert panels. Two additive columns (RULE 1, before the sweep pair). Server tests proven failing against a stashed route+service (7 of 8), client against a stashed panel (4 of 4). 165 files / 2052 server, 276 files / 3334 client, tsc clean, every gate green | `docs/reports/wo8-estar-retention-2026-09-07.md` §5 |
| 2026-09-07 | E | Roadmap item 4 (slice 1 of 5) — the incremental-update writer | `appendIncrementalUpdate` took ONE object of ONE shape (a stream) with a hardcoded two-entry xref — right for the XFA `datasets` fill it was built for, and unable to express an attachment, which is at minimum an `/EmbeddedFile` stream, a `/Filespec` dictionary with no stream, and a replaced catalog. It now takes a list of mixed shapes, allocates numbers past `/Size`, and emits real contiguous-run `/Index` subsections; `nextFreeObjectNumber` is exported because linked objects must know their numbers before they are written. Two refusals pinned: a `/Length` that disagrees with its bytes (a silently truncated attachment is a file that opens and is wrong) and the same object number twice. Verified through pdf-lib rather than this module's own reader, and cross-checked with pypdf against the REAL encrypted FDA template — both new objects read back and the XFA form is intact (20 packets). pypdf's padding complaint on the deliberately-plaintext stream is the docstring's encryption warning, observed, and is slice 2's brief. 9 new tests seen failing first; the datasets fill unchanged at 48/48 against the real templates; tsc clean | `docs/reports/wo8-estar-attachments-2026-09-07.md` |
| 2026-09-07 | E | Roadmap item 4 (slice 2 of 5) — the attachment's objects, enciphered | The eSTAR templates are AESV2-encrypted, where every stream AND every string inside an object is enciphered under that object's own key — and getting it wrong does not fail: the file opens and the attachment is noise, which is what slice 1's probe watched pypdf report. `pdf-embedded-files.ts` builds the `/EmbeddedFile` + `/Filespec` pair with the encipherment applied: the stream under the stream's key, `/F` and `/UF` under the FILESPEC's key (a string's key comes from the object it sits in), `/Length` describing the ciphertext while `/Params /Size` and `/CheckSum` describe the plaintext, hex strings rather than literals over uniformly random bytes, and `application/pdf` escaped into the PDF name `application#2Fpdf`. Proven by round trip against the REAL template and cross-checked with pypdf: 44 bytes out, identical sha256, `/F` and `/UF` reading back as the file name, XFA intact at 20 packets, and no padding complaint this time. 9 new tests seen failing first; 6 files / 88 across forms, the acroform proof and the official-eSTAR route; tsc clean | `docs/reports/wo8-estar-attachments-2026-09-07.md` §3a |
| 2026-09-07 | E | Roadmap item 4 (slice 3 of 5) — the file is attached to the document | The catalog's `/Names` dictionary is not a top-level object in either template — nIVD 221 is entry 1 of ObjStm 272, deflated and enciphered — and it holds `/JavaScript`, which IS the form's behaviour. So `/EmbeddedFiles` could not be written over it; it had to be read and merged. `pdf-object-store.ts` reads indirect objects wherever they live: cross-reference streams with the PNG predictor undone (the templates use Up on 5-byte rows; without it every offset is a difference that still parses), `/Prev` followed, a classic `xref` table refused by name, and a compressed object decrypted under its CONTAINING stream's key. `pdf-attach.ts` rewrites only the names dictionary, carries every existing key across verbatim, enciphers the tree keys under the names dictionary's own number, sorts by plaintext key, and REFUSES a document that already has an `/EmbeddedFiles` tree rather than approximating a multi-level `/Kids` merge. Found on the way: `startxrefOffset` took the FIRST `startxref` in the last 4KB, which after an update is the OLDER one — so every replaced object read back at its previous revision, silently. One implementation now, taking the last match, with the chained-update regression pinned on both templates. End to end on the real template: filled, then attached, and pypdf reads the attachment with a matching sha256 beside 3 intact JavaScript entries, 20 XFA packets and the fill still in the datasets packet — the first attachment this platform has ever embedded in the official form. 32 new tests, seen failing first; 30 files / 357 across forms, the estar engine, the official-eSTAR route and the nine export contracts; tsc clean | `docs/reports/wo8-estar-attachments-2026-09-07.md` §3b–3c |
| 2026-09-07 | E | Roadmap item 4 (slice 4 of 5) — the slot map, measured | An attachment reaches CDRH as a routing token in `Verification.AttachmentManifest`, and FDA's own script says what one is: a description, and `"<<" + path + "|/CHAPTER 1/CH1.01/" + ">>"`. So a slot is the `AddAttachment` control, its chapter token and FDA's description — all three already in the template, so `estar-attachment-slots.ts` READS them rather than transcribing a table that could only drift from the file shipping beside it. Measured: 112 slots over 65 chapters (nIVD), 140 over 77 (IVD) — the same counts `device-market-readiness-2026-09-07.md` reached by counting controls, from the opposite direction. Three things a guess would have got wrong, each now pinned: the chapter paths are not `/CHAPTER n/CHn.nn/` (there is a `/CHAPTER 6A/CH6A.03/CH6A.03.01/`, and the deepest run four levels), the manifest's `.replace()` form is the DELETE path and maps only 15 of the indices so reading it finds an eighth of the slots and looks like an answer, and one append site per template is the labeling-type dropdown RE-ROUTING an already-attached file between four chapters — not a slot, excluded, with its real slot present on its own. 15 new tests seen failing first; 22 files / 336 across forms and the estar engine; tsc clean | `docs/reports/wo8-estar-attachments-2026-09-07.md` §3d |
| 2026-09-07 | E | Measurement — where the attachment manifest actually lives | Slice 5 was specified as `form`-packet surgery: an `instanceManager.addInstance` occurrence plus `AttachmentName`. The `form` packet carries a `checksum` attribute and what Acrobat writes into it on an attach has never been observed here, so that would have been guesswork. Measured instead: the manifest field is `root.Verification.AttachmentManifest`, type text, `inDatasets: true`, and its data node is `root.AttachmentManifest` seeded `***Start***` — in the DATASETS packet, which `fillXfaDatasets` already writes, with the template/data SOM mismatch being exactly the case `resolveDataSomPath` exists for. The token FDA's own script appends is built from the attachment's path in the document's file list, which slices 1–3 now put there. So the last slice is an append through the existing engine, not PDF surgery. The one thing that cannot be measured from the templates — whether CDRH's validator accepts a machine-assembled eSTAR — now has a named, one-file ask of JM (§7 item 0) | `docs/reports/wo8-estar-attachments-2026-09-07.md` §4 |
| 2026-09-08 | E | The eSTAR deletes an attachment we named wrong (found by an adversarial scout of the landed work) | A workflow surveyor tasked with REFUTING the manifest finding confirmed it and found something worse. `removeOrphanAttachments()` runs at BOTH `preSave` and `preSign` and DELETES any attachment whose `/EmbeddedFiles` name-tree key is not `yyyy-mm-dd`-shaped, in FDA's own words: "These attachments will be deleted, since they are not associated with any section of eSTAR." The end-to-end probe recorded in the wo8 report used the FILE NAME as that key, so the attachment it celebrated would have vanished the first time anyone saved the form — silently, and long after the export. The cause was that an attachment carries two different strings (`dataObject.name` = the name-tree key, `dataObject.path` = `/F`/`/UF`, which is what the MANIFEST references) and both fields were called `name`. Nothing in the shipped code was wrong; nothing stopped the mistake either. Now structural: `EmbeddedFileEntry.nameTreeKey`, and `attachmentDataObjectName(at, ordinal)` mints the shape the template mints for itself. `AttachmentValidation`'s five other refusals are checked before anything is built — duplicate path, 25 forbidden extensions, non-ASCII path, >124 characters, >1e9 bytes — reporting EVERY reason, not the first. The extension list is transcribed AND asserted against the template, which caught that the two templates carry the same 25 in a different order (`.exe` first in nIVD, second-to-last in IVD) — order carries no meaning, since the template's lookup is a substring search. 27 new tests seen failing first; 24 files / 393 across forms, the estar engine and the official-eSTAR route; tsc clean | `docs/reports/wo8-estar-attachments-2026-09-07.md` §3c |
| 2026-09-08 | E | A financial-disclosure section was satisfying the performance-testing slot | Same adversarial scout, in code nobody sent to review. `mapToEstar` matched the performance-testing slot on the title substring `clinical data`, and BOTH shipped rule packs title their financial-disclosure node "Financial certification or disclosure (21 CFR Part 54), where clinical data are relied on". Reproduced: scoring that node ALONE marks performance-testing present with sources ["A8"] and drops it from missingRequired — a governed readiness verdict telling a sponsor a required section is satisfied when they have authored no bench, animal or clinical testing at all, through filing-readiness, the cockpit, the dispatcher and assembleDeviceSubmission. The file's own biocompatibility note already states the rule this breaks: over-asking costs a reader a moment, under-asking costs a refusal to accept. Fixed with a narrow stated exclusion rather than by losing the phrase (a section titled "Clinical data" still matches; one about financial disclosure does not), which costs nothing on either outline since every real performance node is titled "… performance testing". Guarded twice: the named regression, and the WHOLE node-to-slot map for all 36 k510 and 32 De Novo nodes, empty arrays included — so a matcher edit shows its blast radius in a diff instead of moving a percentage nobody traced. Also examined and NOT changed: the `{xml}` has-content divergence the scout flagged is deliberate and already written down at section-content.ts:135-137. 4 new contract tests seen failing first; 21 files / 323 green; tsc clean | `docs/reports/estar-readiness-overmatch-2026-09-08.md` |
| 2026-09-08 | E | The slot reader was wrong three ways, and its corroboration was not corroboration | A design panel reviewing the attachment work read the READER rather than its output. Each defect reproduced before anything changed. (1) A slot's identity was its short name, and the name is not unique — nIVD declares `AddAttachment` twice (ReprocSterDocs and BiocompatibilityDocs), IVD declares five names twice, so 113 declarations became 112 entries and the nIVD BIOCOMPATIBILITY slot did not exist in the map at all. Outline node E1 Biocompatibility is mandatory in the shipped pack, so the one slot its content could route to was the one dropped. Identity is the full SOM path now. (2) Descriptions were hunted in a 1200-character window behind the append, so a description could come from a different handler than its chapter, and 3 nIVD / 2 IVD slots FDA does name reported null; the scan runs inside the control's own declaration now, zero nulls, asserted. (3) `ADAddAttachment910` (User Fee Form) writes CH1.04 for Health Canada and CH1.09 for FDA, and the reader silently returned the HEALTH CANADA chapter because it appears first — `chapters` is a list now and `resolveAttachmentSlot` refuses with `ambiguous_chapter` naming the radio this platform deliberately does not write. Also: 19 of the 165 appends are commented out and were being read as live routing. And the honest part — the report argued 112/140 was trustworthy because the market-readiness audit reached the same numbers independently; both counted distinct field NAMES, so they shared one mistake and agreed loudly about it. Two measurements agreeing is evidence only when they can fail differently. Both reports corrected. 18 assertions seen failing against the old reader; 291 estar tests green; tsc clean | `docs/reports/wo8-estar-attachments-2026-09-07.md` §3e |
| 2026-09-08 | E | The ambiguous-chapter refusal was itself too strict | The correction to the slot reader refused the User Fee Form slot outright, reasoning that the platform does not write `ApplicationType.ATRadioButton100` so it cannot choose between CH1.04 (Health Canada) and CH1.09 (FDA). The design panel caught it and the templates settle it: both SHIP `root.ApplicationType.ATRadioButton100 = "1"`, and the handler is `if (rawValue == 2) CH1.04 else CH1.09` — so computing the FDA chapter from the document's own value is not a guess, it is the same computation FDA's script performs on the same input. Refusing it cost a real slot: the User Fee Form is one of the two `mapToEstar` already reports as missingRequired. `resolveAttachmentSlot(slot, values)` now resolves when the deciding value is supplied and refuses `undecided_condition` when it is not, and the condition is transcribed into `CONDITIONAL_ATTACHMENT_SLOTS` AND asserted against both templates — every slot with more than one chapter must have an entry whose branches are exactly that slot's, so a future template that makes another control conditional fails the test instead of silently resolving to whichever branch appears first. 293 estar tests green; tsc clean. The panel's full specification for the last slice, the form-layer limits it cannot reach, and the four questions the Acrobat artifact settles are in the report §4-4c | `docs/reports/wo8-estar-attachments-2026-09-07.md` §3e, §4-4c |
| 2026-09-08 | E | Slice 5, prerequisites: the substantive signal, and /Desc | Two of the three defects the design panel said must be fixed before attachments are sourced. (1) `loadAuthoredDeviceSections` filtered on `isAuthored` ALONE — a non-empty body — and never applied `isSubstantive`, so a section still marked `drafted` would be rendered and filed into a named CDRH attachment slot. LATENT, not shipped: its only callers today build the DRAFT zip, where drafts belong, so narrowing what it RETURNS would have quietly emptied that package. The signal travels instead (`AuthoredDeviceSection.substantive`, the same `isSubstantive` the readiness path uses, not a second opinion) and the caller decides. The legacy branch could not answer at all because it never selected `status`; it does now, and `legacySectionsToAuthored` is split out so the rule is testable without a database. (2) `buildEmbeddedFileObjects` emitted no `/Desc` while FDA's handler sets `d[AttachmentIndex].description` on every one of the 113/145 controls; it is optional and its provenance is stated — `dataObject.description` ↔ `/Desc` is the Acrobat JavaScript API, not something measurable in this container — and omitted entirely rather than written empty. 4 new tests seen failing first; estar 31/31, forms 86/86, 214 files / 1881 across the estar engine, the export-governance and 510k routes and server/routes; tsc clean. Flagged, not touched: `server/routes/__tests__/chat-threads-read-honesty.test.ts` fails on this branch with my changes STASHED — pre-existing, and the chat stream's territory | `docs/reports/wo8-estar-attachments-2026-09-07.md` §4 |
| | | | | |

**Rule:** the last row with an empty "What was proven" cell is the open work. A session
that ends without filling it resumes that row rather than starting a new one.
