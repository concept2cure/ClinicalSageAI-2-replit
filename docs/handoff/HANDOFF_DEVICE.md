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
- `server/services/forms/`
- `assets/estar-templates/`
- `server/routes/510k-estar-routes.ts`
- `client/src/concept2cure/v2/surfaces/DeviceSurfaces.tsx` (Phase 2 only)

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

## 5. The single open item on Phase 1 — JM only

**Open the filled eSTAR in Adobe Acrobat.** Confirm all 20 values display, and that the
form's own initialize/calculate scripts do not overwrite them on open.

There is no Acrobat in the build environment. What is proven is structural: the values
are in the `datasets` packet Acrobat binds to, the `template` packet is byte-identical
to the original, all ten XFA packets survive, and an independent library reads the
result through the xref chain. Whether Acrobat *renders* them has not been observed.

**No agent may attempt this, and no agent may treat it as a blocker it can solve.**

Until JM confirms it, Phase 1 is proven structurally but not visually, and Phase 2 does
not start.

---

## 6. Next authorized action

**None until JM names one.** Phase 2 is built and proven structurally (the report, §5). Two things only JM
can settle stand in front of any further click:

1. The Acrobat render check (§5) — still open, unchanged by Phase 2.
2. The reading of `client_workspaces` as the applicant (Phase 2 report §3 and §7): confirm it, or name the
   rule you want, before a customer files on it.

Candidates JM may name, in no order: persist the user-typed administrative values (a schema decision — a
column or a table — so a migration); De Novo / PMA descriptors (templates not vendored; §8 still applies);
the Q-Sub / IDE / 513(g) PreSTAR descriptors (template not vendored; §8 still applies). Idle is the correct state for a stream whose gate has not cleared. Do not substitute other work.

## 7. Other JM-only tasks on this stream

1. **Legal check** on redistributing FDA templates inside a commercial product. FDA
   materials are generally US Government works, but counsel has not confirmed it. If
   counsel says no, the fix is a directory move — point `ESTAR_TEMPLATE_DIR` out of
   tree. No code change required.
2. **Provenance.** The current eSTAR bytes came from JM's transfer, not a recorded FDA
   URL (agency hosts are egress-blocked in the build environment). If auditable
   provenance is required, re-download from FDA and confirm the SHA-256s in
   `checksums.txt` match.
3. **Name the click for every session.** The agent never chooses its own next task.

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

---

## 9. Session log — append one row, never rewrite

| Date | Account | Authorized click | What was proven | Report |
|---|---|---|---|---|
| 2026-09-03 | A | WO-8 Phase 1 — unblock eSTAR fill | `filled: true`, 20/20 read-back, 91 tests pass | `docs/reports/wo8-phase1-estar-unblock-2026-09-03.md` |
| 2026-09-03 | B | WO-8 Phase 2 — device + diagnostic, whole stream (JM: "get medical device and diagnostic fully done now") | official eSTAR filled from governed records with per-field provenance on the 510(k) and IVD surfaces; device golden journey green; second pass: IVD 510(k) on the IVD eSTAR, entitlement lock before the first click, no crash on an unreadable section list; 62 test files / 898 tests green across the eSTAR engine, forms, routes, MDX kit and the device golden journey | `docs/reports/wo8-phase2-estar-demo-2026-09-03.md` |
| | | | | |

**Rule:** the last row with an empty "What was proven" cell is the open work. A session
that ends without filling it resumes that row rather than starting a new one.
