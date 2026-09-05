# WO-9 Phase 1 — eCTD unblock

**Date:** 2026-09-03
**Branch:** `concept2cure-v2`
**Scope:** WO-9 Phase 1 Steps 0–6, plus the Section B XFA decision.

Phase 1 is data and verification. Two code changes landed: the DTD gate defect
found by Step 4, and the form onboarding JM authorised after Gate 1. Nothing
else was written.

---

## 1. Outcome

| Step | State |
|---|---|
| 0 — Branch sanity | Done. `concept2cure-v2`, no other branch created. |
| 1 — Read ground truth | Done. §3 below. |
| 2 — Vendor eCTD supportive files | **Blocked — egress.** Nothing vendored. |
| 3 — Fill checksum manifest | **Blocked** — depends on Step 2. Zero entries. |
| 4 — Prove the DTD gates | Done. **Gate was broken; fixed.** §4. |
| 5 — Corpus ingestion sweep | **Blocked — egress + no DATABASE_URL.** |
| 6 — Proof report | This file. Registry item not actionable — §7. |
| Section B — XFA decision | Resolved on measured facts. §5. |

Two stop conditions from WO-9 remain open, both on Step 2:
`assets/ectd-dtd/checksums.txt` still has zero filled entries, and no package
can be DTD self-contained.

---

## 2. The egress blocker

Every agency host is refused by this environment's network policy.

| Host | curl | first-party fetch |
|---|---|---|
| `www.fda.gov` | `CONNECT tunnel failed, response 403` | `EGRESS_BLOCKED` |
| `www.ich.org` | `CONNECT tunnel failed, response 403` | — |
| `clinicaltrials.gov` | `CONNECT tunnel failed, response 403` | — |

`/root/.ccr/README.md` classes a 403 as an organisation policy denial and
directs that it be reported rather than retried or routed around. No mirror was
used and no DTD was fabricated. `assets/ectd-dtd/README.md` already predicted
this: *"This build environment's egress policy blocks the agency sites — acquire
the files from a network-permitted machine and add them via PR."*

Steps 2, 3 and 5 require a network-permitted machine. They are not partially
done; they are not started.

---

## 3. Ground truth — what the code actually requires

**Filenames are load-bearing.** `dtd-bundler.ts` hard-codes them and the
packager's DOCTYPE declarations reference them verbatim.

| Constant | Value | Referenced by |
|---|---|---|
| `ICH_BACKBONE_DTD` | `ich-ectd-3-2.dtd` | `buildIndexXml` — `SYSTEM "util/dtd/ich-ectd-3-2.dtd"` |
| `REGIONAL_DTD.fda` | `us-regional-v3-3.dtd` | `buildFdaBackbone` — `SYSTEM "../../util/dtd/us-regional-v3-3.dtd"` |

`requiredDtdsForRegion('fda')` returns exactly those two. For US-only scope,
**two files** satisfy the gate.

**Manifest format** (`checksum-manifest.ts`): `SHA256_LINE = /^([0-9a-fA-F]{64})\s{1,2}(.+)$/`
— 64 hex chars, one or two spaces, filename. `#` comments and blank lines are
ignored. `verifyChecksumManifest` reports `mismatched`, `missingFiles` and
`unlistedFiles`, and `ok` is true only when all three are empty.

**How the self-containment gate decides** (`assessDtdReadiness`): it blocks only
when `requireDtd && environment === 'production' && !selfContained`. Staging and
`requireDtd:false` report without blocking. Measured on today's empty directory:

```
listVendoredDtds()             -> 0 files
requiredDtdsForRegion('fda')   -> [ich-ectd-3-2.dtd, us-regional-v3-3.dtd]
production + requireDtd=true   -> selfContained=false  cleared=false  1 blocker
production + requireDtd=false  -> cleared=true   (report-only, as documented)
staging    + requireDtd=true   -> cleared=true   (report-only, as documented)
verifyChecksumManifest()       -> ok=true, all lists empty (pre-vendoring state)
parseManifest(checksums.txt)   -> 0 entries
```

The gate fails closed correctly. It is the data that is absent.

### Two gaps between the work order and the code

**The supportive-file list is wider than anything the code consumes.**
`bundleVendoredDtds` copies `*.dtd` only. Nothing in the codebase reads
`valid-values.xml`, `form-type.xml`, or any stylesheet. Vendoring them satisfies
no gate that exists today.

**Stylesheets are referenced but never bundled.** `regional-packager.ts:262`
emits into the US regional backbone:

```xml
<?xml-stylesheet type="text/xsl" href="../util/style/us-regional.xsl"?>
```

There is no `assets/ectd-style/`, no `.xsl` file anywhere in the repository, and
no code that writes `util/style/`. Every FDA package will reference a stylesheet
it does not contain. That is a second self-containment hole, and the DTD gate
does not cover it — `assessDtdReadiness` only ever looks at `*.dtd`.

It is also the only stylesheet processing instruction the packager emits:
`index.xml` carries none. WO-9 Click 4's acceptance criterion is *"the compiled
`index.xml` opens in a browser via the ICH stylesheet."* As built, it cannot.
JM has confirmed the criterion stands and that both `ectd-2-0.xsl` and
`us-regional.xsl` are to be vendored into `util/style/` on the same trip as the
DTDs. **Bundling them will require a code change** — a style bundler, or an
extension to `dtd-bundler` — because nothing copies `.xsl` today.

### Version pin — unverified

`dtd-bundler.ts` pins `us-regional-v3-3.dtd` (FDA US Regional DTD v3.3) and
`ich-ectd-3-2.dtd` (ICH eCTD v3.2.2). **Neither was confirmed against the
agency's published page**, because the pages are unreachable. Do not assume v3.3
is still the mandated production version. Confirm at acquisition time; if FDA
publishes a different version, that is a discrepancy to report, not to
substitute silently.

---

## 4. Step 4 — the DTD gate was broken

Both fixtures were run through `validateDtdConformance`. The conformant fixture
failed.

```
index-valid.xml    3 findings (3 error)   expected PASS   -> GATE BROKEN
index-invalid.xml  11 findings (10 error) expected FAIL   -> OK
```

**Root cause: the validator scanned XML comments as markup.** Every check in
`validateDtdConformance` is a regex over the raw backbone string, and comments
were never stripped. This cut both ways.

*False positive.* `index-valid.xml` documents `DTD_LEAF_MISSING_ATTR` using a
literal `<leaf>` in its own header comment. The leaf scan matched it as leaf #0
with no attributes and raised three `DTD_LEAF_MISSING_ATTR` errors against a
conformant backbone:

```
leaf #0  inXmlComment=true   raw="<leaf>"              <- the comment
leaf #1  inXmlComment=false  raw="<leaf xlink:href=..."
leaf #2..#4                  the remaining real leaves
```

It also shifted `leaves[leafIdx]` at `ectd-validator-hardening.ts:308`, so every
subsequent finding was attributed to the wrong file.

*False negative, and the more serious of the two.* `index-invalid.xml` omits its
XML declaration deliberately, but the literal `<?xml ... ?>` inside its comment
satisfied `if (!/<\?xml/i.test(backboneXml))`. `DTD_NO_DECLARATION` never fired.
A backbone genuinely missing its declaration passed the gate. The same hazard
applied to the DOCTYPE and root-element checks.

**Why 379 passing tests did not catch it: nothing loaded the fixtures.**
`server/services/ectd` was 43/43 files and 379/379 tests green, with zero
references to `index-valid.xml` or `index-invalid.xml` anywhere in the
repository. The claim in `assets/ectd-dtd/README.md` that *"`fixtures/` contains
anonymized backbone XML samples that the validator unit tests reference"* was not
true — the orchestrator tests used inline strings. The gate had never been run
against its own acceptance case.

**Fix** (commit `f9e3ab8`): strip XML comments once at the top of
`validateDtdConformance` and run every check against the stripped text,
substituting a space rather than `''` so stripping cannot fuse adjacent tokens.
Fixtures were not modified.

**Verification, failing first.** The three new cases were written before the fix
and confirmed failing against the unfixed validator:

```
before fix:  Tests  3 failed | 4 passed
  x passes the vendored conformant backbone fixture with zero findings
  x does not read <leaf> inside an XML comment as a leaf
  x fails the vendored non-conformant backbone fixture on every seeded violation
      -> expected DTD_NO_DECLARATION from index-invalid.xml

after fix:   Tests  7 passed
```

The tests load the two vendored fixtures — the first thing in the repository to
do so — and pin both directions: `index-valid.xml` must yield zero findings, and
`index-invalid.xml` must still raise all eight seeded violation codes. If both
ever pass, the gate is not running.

Regression: **49 test files, 438 tests, all pass.**

---

## 5. Section B — the XFA decision, on measured facts

The Claude Code execution package opened with a correction stating that all five
official FDA forms are dynamic XFA with zero AcroForm fields, and that the
reviewed entries in `official-field-maps.ts` were authored against field names
the assets do not expose. **Both claims are wrong for three of the five forms.**
JM independently verified this and adopted the corrected reading.

### Measured, post-decrypt

Decrypted with pikepdf; terminal fields counted recursively by `/FT`.

| Form | Encryption | `/XFA` | `/NeedsRendering` | AcroForm fields | Pages | Verdict |
|---|---|---|---|---|---|---|
| **1572** | AES-256 (V5/R6) | **absent** | absent | **740** | 2 | Pure AcroForm |
| **356h** | AES-256 (V5/R6) | **absent** | absent | **1348** | 4 | Pure AcroForm |
| **3454** | AES-128 (V4/R4) | present | absent | **14** | 1 | Static XFA + AcroForm |
| 1571 | AES-128 (V4/R4) | present | **true** | **0** | 1 | Dynamic XFA — shell |
| 3674 | AES-128 (V4/R4) | present | **true** | **0** | 1 | Dynamic XFA — shell |

1572 and 356h carry no XFA whatsoever. 3454 is static XFA over a real AcroForm
layer — `/XFA` present but `/NeedsRendering` absent, so the page content is real
rather than an Adobe placeholder.

**On the 3454 count.** The top-level `/Fields` array holds **one** entry, an XFA
subform container (`topmostSubform[0]`) with no `/FT`. Recursing gives **14**
terminal fields — 8 text, 3 checkbox, 1 signature, plus the `invName1..6` list.
Both numbers are correct measurements of different things; **14** is the
fillable count, and it is what a filler targets.

### The real blocker was encryption, not XFA

`fillOfficialTemplate` calls `PDFDocument.load(bytes, { ignoreEncryption: true })`.
That opens the file without decrypting it, so every encrypted object stream
fails to parse and pdf-lib returns **0 fields for all five**. That zero was
written into each manifest as `xfaDynamic: true` and *"0 AcroForm fields are
exposed"*, and two subsequent analyses trusted the manifest instead of
re-measuring.

`docs/biotech/FDA_FORMS_FILL_STATUS.md` §2 had already recorded the correct
counts — 740, 1348, 14 — from a decrypted read. The measurements above reproduce
it independently.

### Permission bits

All five carry `/P -1036`. Low twelve bits `0b101111110100`:

| Bit | Meaning | State |
|---|---|---|
| 3 | print | ALLOWED |
| 4 | modify contents | DENIED |
| 5 | copy / extract | ALLOWED |
| 6 | modify annotations + fill form | ALLOWED |
| **9** | **fill in form fields** | **ALLOWED** |
| 10 | accessibility extract | ALLOWED |
| 11 | assemble document | DENIED |
| 12 | high-resolution print | ALLOWED |

Filling is within what FDA permits. Altering form content is not, and the
pipeline does not.

### Decision, as adopted

- **Onboarded via the existing `scripts/ind-forms/onboard-fda-form.ts`:** 1572,
  356h, 3454. No new code — the script already decrypts via pikepdf, hashes the
  decrypted bytes, and writes the reviewed manifest.
- **Option A only:** 1571 and 3674. Genuine dynamic XFA whose official page is an
  Adobe placeholder. Reconstruction plus sponsor-completed upload placed as a
  Module 1.2 leaf. Their assets and manifests are untouched.

### Asset hashes — encrypted original and decrypted asset

| Form | SHA-256 of encrypted original | bytes | SHA-256 of committed decrypted asset | bytes |
|---|---|---|---|---|
| 1572 | `ee666d77a034b4f4cc474fe99b50d0bf58fb57f4fecf26971682bc60cea40391` | 1 358 444 | `44e7562b9abd152b53bbac029c6ff59b1e4517479dc6fe34521a1281e1a526a0` | 1 325 833 |
| 356h | `ce09c72fa74fccf8c2f2fe37431c219832c523f35869e445982131cc072a903a` | 3 532 049 | `ddd72f781e3a089b67c8f25d9f1c4018c696c974e2de49e554c059fe94bc15dc` | 3 345 144 |
| 3454 | `aa5ea997b27393cb6ccb0bd8b6c37481e8b89fce683c0b60b82e481628f1992b` | 1 514 728 | `2be1c63bdef3c4465fc0ba2210855937ab3370beecdcc25f35b3a4d4515b66e5` | 1 509 803 |
| 1571 | `24adbff94268d02b4d23a85a0dc8b3f0f214326bdff11942d810d59755aeba4b` | 2 919 985 | not decrypted — unchanged | — |
| 3674 | `1ebcaeb1db0475f9d91cdb601347e94119d6ec2060f6e5b24543ecaab6425044` | 3 526 775 | not decrypted — unchanged | — |

Each onboarded manifest records `sha256` (decrypted bytes, what `readTemplate`
verifies), `sha256EncryptedOriginal`, `encryptionOfOriginal`,
`acroFormFieldCount`, and `acroFormFieldCountMeasuredOn: "decrypted asset,
pdf-lib getFields()"`. The false `xfaDynamic: true` and the "0 AcroForm fields
are exposed" note were replaced with the measured facts and an explanation of
how the wrong number arose.

### Verification

Every reviewed mapping resolves against the real committed assets:

```
FDA_1572   740 fields   8/8  mappings resolve
FDA_356H  1348 fields  11/11 mappings resolve
FDA_3454    14 fields   5/5  mappings resolve
```

All eight 1572 values round-trip into their mapped fields on the committed
asset — the first check of this kind against the real form rather than a
synthetic stand-in:

```
db_invest_name  db_loc_name  db_loc_address1  db_irb_name
db_irb_address1  db_lab_name  db_sub_inv_names  db_prot_name_code
-> 8/8 round-trip
```

End-to-end through `generateIndForm`:

```
FDA_1572  usedOfficialTemplate=true   2pp  2 241 086 bytes
FDA_356H  usedOfficialTemplate=true   4pp  4 807 389 bytes
FDA_3454  usedOfficialTemplate=true   1pp  1 541 295 bytes
FDA_1571  usedOfficialTemplate=false  1pp      5 869 bytes  (reconstruction)
FDA_3674  usedOfficialTemplate=false  1pp      4 260 bytes  (reconstruction)
```

IND-forms suite: 9 files, 56 tests, all pass.

### Two items flagged, not resolved

**`reviewedBy` attests to a human review.** It is set to
`jonmichaelpsmith@gmail.com` on all three onboarded manifests, on JM's explicit
instruction to onboard and following his independent verification of the field
counts. If a different reviewer of record is wanted, the manifests are the place
to change it.

**Redistribution of a decrypted FDA form is not legally cleared.** The committed
asset is now the decrypted file. Filling is permitted by the permission bits, but
decryption removes the permission wrapper the agency applied. This is the
twenty-minute conversation WO-9 §1.5 flagged and it has not happened. The
approach is the repository's own pre-existing design and JM directed it; it is
recorded here so it is not mistaken for cleared.

---

## 6. Step 5 — corpus ingestion

Not run. Blocked twice: `clinicaltrials.gov` returns 403, and `DATABASE_URL` is
unset in this environment. `scripts/ingest-corpus.ts`,
`docs/runbooks/corpus-ingestion.md` and the `ENABLE_CORPUS_INGESTION` gate all
exist as described. No row counts. This blocks the precedent and prediction
surfaces, not the demo path — those surfaces are honest cold-start and should
stay off the demo.

---

## 7. Registry update — not actionable as written

Step 6 asks that `config/ui-surface-registry.json` be updated with vendored DTD
versions. **That file does not exist.** The registry that does exist is
`shared/constants/ui-surface-registry.ts`, a UI surface contract — navTier,
layoutMode, uiKit, apiPrefixes, AnA tool families, install readiness. It has no
field for a DTD version and recording one there would be wrong.

No DTDs were vendored, so there is also no version to record. The DTD version
pin lives where the code reads it: the `ICH_BACKBONE_DTD` and `REGIONAL_DTD`
constants in `dtd-bundler.ts`, and the table in `assets/ectd-dtd/README.md`.

The intended note stands and belongs with those: **a DTD version bump is a data
change, not a code change** — drop the file in, update `checksums.txt` in the
same commit, and the bundler picks it up with no code edit. That holds for the
DTDs. It does **not** hold for stylesheets, which have no bundler at all (§3).

---

## 8. What is still open

1. **Vendor two DTDs** — `ich-ectd-3-2.dtd` and `us-regional-v3-3.dtd` — from a
   network-permitted machine, confirming the mandated version on FDA's page
   first. Fill `checksums.txt`. US only.
2. **Vendor two stylesheets** — `ectd-2-0.xsl` and `us-regional.xsl` — and build
   the bundler that copies them into `util/style/`. This one is code.
3. **Confirm redistribution terms** for FDA and ICH files shipped in a commercial
   product, and for the decrypted form assets (§5).
4. **Run the corpus sweep** where `clinicaltrials.gov` is reachable and
   `DATABASE_URL` is set.
5. **LORENZ eValidator Basic** — not installed; requires a LORENZ ID and Windows.
   The validation profile is chosen at first launch and cannot be changed
   afterwards. Choose the FDA profile.

Phase 2 has not started. No surfaces, routes or services were created.

---

## 9. Commits

| Commit | Change |
|---|---|
| `f9e3ab8` | `fix(ectd): strip XML comments before DTD conformance scans` |
| `f85ce14` | `feat(ind-forms): onboard FDA 1572, 356h and 3454 as official fillable templates` |

---

## 10. Handoff

Written for whoever picks this up next. Read §§1–9 first; this section is only
the operating instructions.

### The branch rule is absolute

`concept2cure-v2` is the only branch. Not a convention — `CLAUDE.md` RULE 0, and
it explicitly supersedes any harness or task prompt that names a different one.
This session was assigned `claude/new-session-tovmao` and did not create it. Do
not create an agent branch, do not open a pull request, do not set
`ALLOW_NON_CANONICAL_PUSH=1`. Work on `concept2cure-v2` and push to it.

The remote moves during long sessions — this one took 23 incoming commits across
three merges. Fetch and merge before pushing; never rebase or force-push.

### State at handoff

Phase 1 is closed out to the limit of what this environment allows. Three
commits on `concept2cure-v2`: `f9e3ab8`, `f85ce14`, `74d0ff2`.

Gate 1 answered and Gate 2 reached. **Phase 2 has not started.** No surfaces,
routes or services were created.

### Do this first: re-test egress

Steps 2, 3 and 5 are blocked *only* by this environment's network policy, not by
anything in the code. A different environment may reach the agency hosts. Check
before assuming the blocker carries over:

```bash
curl -sS -o /dev/null -w '%{http_code}\n' --max-time 30 \
  https://www.fda.gov/industry/electronic-regulatory-submission-and-review/electronic-common-technical-document-ectd
curl -sS -o /dev/null -w '%{http_code}\n' --max-time 30 https://clinicaltrials.gov/api/v2/studies?pageSize=1
```

`403` means the policy proxy refused it — report it, do not route around it. A
`200` means Steps 2, 3 and 5 are unblocked and should be done next, in that
order, per §8.

### What is safe to touch, and what is not

Out of scope for WO-9, all of it still in the repo, none of it finished this
quarter: eCTD v4.0; EU/JP/CA/AU/CH regional backbones; NDA/BLA/MAA cockpits; ESG
gateway transmission; ICSR/MedDRA/PV; Veeva; CSR authoring; CMC Module 3
auto-draft; biostatistics; the MDX/eSTAR path; UI convergence and nav
restructuring.

Two specific traps:

**Do not "fix" the 1571 and 3674 reconstruction path.** Those two are genuine
dynamic XFA — 0 AcroForm fields, `/NeedsRendering true`, and their official page
is an Adobe placeholder with no content to overlay. The labeled reconstruction is
the honest ceiling and it is correct behaviour. Their assets and manifests are
deliberately untouched. Do not fabricate a `fieldMap` for either.

**Do not re-derive the form facts from the manifests.** That is exactly the loop
this work broke: a `0` produced by reading an encrypted PDF without decrypting it
was written into the manifests, and two later analyses trusted it. The measured
truth is §5, taken post-decrypt. If you need to re-verify, decrypt with pikepdf
and count terminal `/FT` fields recursively — the top-level `/Fields` array is
not the field count.

### A failing test that is not yours

`module3-extensions > composeAppendices > marks 3.2.A.2 as not applicable for
small molecules` fails on `concept2cure-v2` and did so before any of this work.
Verified by running the base branch's own unmodified test file. An incoming
commit changed the narrative to say "NOT ESTABLISHED" instead of "not
applicable" — a fail-closed improvement — updated the new
`tests/unit/module3-narrative-extension.test.ts`, and missed the older assertion
at `server/__tests__/services/submission-orchestrator.test.ts:187`. CMC Module 3
is out of WO-9 scope, so it was left alone. It is a one-line assertion update for
whoever owns that area.

Everything in WO-9 scope is green: 52 files, 435 tests, plus 7/7 on the DTD gate.

### Verifying this work still holds

```bash
npx vitest run --config vitest.config.ts server/services/ectd server/services/ind-forms
npx vitest run --config vitest.config.ts \
  server/__tests__/services/submission-orchestrator.test.ts -t "validateDtdConformance"
```

The second is the DTD gate. It must pass `index-valid.xml` with zero findings
**and** still fail `index-invalid.xml` on all eight seeded codes. If both
fixtures pass, the gate is not running — that is the failure mode this work
exists to prevent, and it is more important than a green tick.

### Session protocol

JM names the click. Do not propose the next task. One click per session, and it
ends when the click works in a browser or when the blocker is named precisely.
A passing test is not done. A proof report is not done.
