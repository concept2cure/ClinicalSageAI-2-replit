# WO-9 Phase 1 — eCTD unblock

**Date:** 2026-09-03
**Branch:** `concept2cure-v2`
**Scope:** WO-9 Phase 1 Steps 0–6, plus the Section B XFA decision.

Phase 1 is data and verification. Two code changes landed: the DTD gate defect
found by Step 4, and the form onboarding JM authorised after Gate 1. Nothing
else was written.

> **Updated 2026-09-07.** §11 records what changed at the tip of `concept2cure-v2`
> after this report was pushed, and corrects two statements in §10. §§1–9 stand as
> the Gate 2 record and are not rewritten.

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

This environment's clone is shallow. After a fetch, `git status` can report the
branch thousands of commits behind; that is the shallow boundary deepening, not a
fork. Confirm with `git merge-base` against your last push before reacting.

### State at handoff

Phase 1 is closed out to the limit of what this environment allows. Four
commits on `concept2cure-v2`: `f9e3ab8`, `f85ce14`, `74d0ff2`, `63c1605e` — plus
the addendum in §11, which supersedes parts of this section.

Gate 1 answered and Gate 2 reached. Phase 2 began on 2026-09-07 with Click 1
(§13); Click 2 — the IND forms panel — followed on 2026-09-08 (§14). No
surfaces, route files, service modules or markdown files have been created for
either: both clicks extended what was already there.

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

Re-tested from this environment on 2026-09-07: all three hosts still refused.

### What is safe to touch, and what is not

Out of scope for WO-9, all of it still in the repo, none of it finished this
quarter: eCTD v4.0; EU/JP/CA/AU/CH regional backbones; NDA/BLA/MAA cockpits; ESG
gateway transmission; ICSR/MedDRA/PV; Veeva; CSR authoring; CMC Module 3
auto-draft; biostatistics; the MDX/eSTAR path; UI convergence and nav
restructuring.

Two specific traps:

**The 1571 and 3674 path changed after this section was written — read §11
before touching it.** At Gate 2 both rendered labeled reconstructions and this
section said not to "fix" that. Since then another session landed an XFA
datasets fill for both — Option B of the execution package's Section B — and JM
had chosen Option A. Whether that work stays is JM's decision, not the next
agent's: do not revert it on the strength of this document, and do not extend
it either. What holds unconditionally: never fabricate an AcroForm `fieldMap`
for either form. Both manifests correctly keep `fieldMap: {}`.

**Do not re-derive the form facts from the manifests.** That is exactly the loop
this work broke: a `0` produced by reading an encrypted PDF without decrypting it
was written into the manifests, and two later analyses trusted it. The measured
truth is §5, taken post-decrypt. If you need to re-verify, decrypt with pikepdf
and count terminal `/FT` fields recursively — the top-level `/Fields` array is
not the field count.

### A correction: the "failing test that is not yours" was already fixed

An earlier revision of this section reported `module3-extensions >
composeAppendices > marks 3.2.A.2 as not applicable for small molecules` as red
on the base branch. That was true when it was checked, against an intermediate
merge — and false by the time it was pushed. The fix (`166224ac2`, which renamed
and re-pinned the assertion) arrived in the final 53-commit merge before the
push, and only the eCTD and IND-forms suites were re-run after that merge, not
the orchestrator file. The statement shipped stale. The error was in the
verification, not the product. Do not go looking for that failure.

At the tip on 2026-09-07: eCTD + IND-forms 65 files / 562 tests; orchestrator
file 34/34 including the three DTD-gate fixture tests; eSTAR + shared filler
16 files / 245 tests. All pass.

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

---

## 11. Addendum — 2026-09-07, state of the tip

Written on returning to the environment after the handoff. Everything below was
measured at `concept2cure-v2` tip `2f52f091a` after a fresh `npm ci` (the
lockfile had changed upstream). §§1–9 are not rewritten; where the tip now
differs from the Gate 2 record, this section says so.

### What landed for 1571 and 3674

Commit `6b2d2717b` — *FDA 1571 and 3674 fill the official form, not a drawing
of it* — by another Claude session, authored after this report's push and merged
into the canonical branch about four hours before this addendum. It implements
**Option B** from the execution package's Section B: values are written into
the XFA `datasets` packet through a PDF incremental update, reusing the eSTAR
filler in `server/services/forms/fill-official-pdf.ts` (+338 lines since the
push, chiefly a new `resolveDataSomPath` and an `alsoWriteSomPaths` mechanism)
with a reviewed canonical→SOM-path map in `OFFICIAL_XFA_FIELD_MAPS`.

**JM chose Option A for these two forms (§5) before that commit landed.** The
two are in tension. This addendum records the state. The decision is JM's.

### Measured at the tip

| Form | `usedOfficialTemplate` at Gate 2 | at tip | output bytes | begins with the template verbatim |
|---|---|---|---|---|
| 1572 | true | true | 2 241 047 | no — the AcroForm path re-saves the document (expected) |
| 356h | true | true | 4 807 389 | no — same |
| 3454 | true | true | 1 541 295 | no — same |
| **1571** | **false** (reconstruction) | **true** | 2 922 047 | **yes** — template 2 919 985 B + 2 062 B appended |
| **3674** | **false** (reconstruction) | **true** | 3 528 197 | **yes** — template 3 526 775 B + 1 422 B appended |

Section B's stated hazard for Option B was a silently malformed dataset — a
form that "looks fine and is wrong". The sharpest form of that risk here is
encryption: both originals are AES-encrypted, and an incremental update that
appends an *unencrypted* stream to an encrypted document reads back as garbage
in any conforming viewer. Measured through pikepdf, which decrypts the way
Acrobat does:

```
FDA_1571  encrypted=true   plaintext in appended bytes: NO   decrypted datasets carries the value: YES
FDA_3674  encrypted=true   plaintext in appended bytes: NO   decrypted datasets carries the value: YES
```

The appended datasets stream is encrypted with the document key, and a
decrypting reader sees the filled values. That closes the encryption-layer
hazard. What remains unproven is Acrobat's own XFA runtime — initialize and
calculate scripts — which no engine in this environment runs. The commit says
so itself.

Fields the fill deliberately leaves for the sponsor, reported in
`unmappedFields` rather than implied complete — 1571: `ind_type`,
`phase_of_study`, `authorized_rep_name`, the sponsor-contact and US-agent
fields; 3674: the four certification checkboxes. The output is not flattened,
so it stays the live official form for the sponsor to finish and sign.

Manifests: `fieldMap` is still `{}` on both — no AcroForm map was fabricated,
so the WO-9 stop condition on that point is not breached. `fillSupported`
flipped to `true`; `reviewedBy` is still `null` and `assetTrusted` still
`false` on both. `getDocumentCoverage('US_IND').formsFullyBacked` now measures
`true`.

Where the implementation departs from Section B's stated Option B rule: it was
not a timeboxed spike on customer demand, and it does not fail closed on an
unplaced required field — the commit argues the unflattened output makes that
the sponsor's box rather than a fill failure. It does fail closed when no value
can be placed, when the template is absent, when the file is not dynamic XFA,
and on an ambiguous path, which resolves to `null` rather than a guess.

### The frozen MDX path

The filler is shared with eSTAR, so WO-9's stop condition — "`estar-fill` or
any MDX surface regressed" — was checked rather than assumed:

```
server/services/pathway-engines/estar + server/services/forms
  16 files, 245 tests, all pass
```

### This report's own work at the tip

```
eCTD + IND-forms suites             65 files / 562 tests   pass
orchestrator file                   34 / 34                pass  (DTD fixture tests 3/3)
1572 round-trip on committed asset  4 / 4
```

The DTD gate still passes `index-valid.xml` with zero findings and still fails
`index-invalid.xml` on all eight seeded codes.

### Still blocked, unchanged

Egress re-tested from this environment on 2026-09-07: `www.fda.gov`,
`www.ich.org` and `clinicaltrials.gov` all refused. `DATABASE_URL` unset.
Steps 2, 3 and 5 remain exactly as §2 describes.

### Correction to §10

§10 reported a pre-existing failure in `module3-extensions`. The fix
(`166224ac2`) was already in the tree when §10 was pushed; the orchestrator
file was not re-run after the final merge. §10 has been amended in place.

---

## 12. Decisions taken under delegation — 2026-09-07

JM delegated the open decisions with two criteria: best long-term client
results, and limited resources. These are the choices, the reasons, and what
was done. Every executable decision was implemented with its tests written
first and seen failing against the unchanged code.

### D1 — Option B stays for FDA 1571 and 3674; the reconstruction remains the fallback

Chosen because the client outcome is strictly better: a sponsor receives the
genuine FDA form, pre-populated from the program record, that opens in Acrobat
for them to finish and sign — instead of a labeled drawing nobody can file.
The work exists, its tests pass, the eSTAR path it shares a filler with is
unregressed, and the encryption-layer hazard was measured closed (§11). The
cost of keeping it is maintenance on template-edition changes, the same burden
the AcroForm maps already carry.

What it does not yet have is a named person who has opened a filled 1571 in
Acrobat and confirmed the boxes. That is not fabricated here: both manifests
keep `reviewedBy: null`, and the coverage report now says so (D3). The one
residual risk — Acrobat's own XFA runtime — is closed by that same review, a
few minutes' work for whoever has Acrobat, once per template edition.

Section B's Option B rule asked for a fail-closed spike, and the implementation
deliberately does not fail closed on an unplaced required field. Accepted, on
its own reasoning: the output is the live, unflattened form, so an empty box is
the sponsor's to complete, and `unmappedFields` names every one. The Click 2
surface must show that list; that is Phase 2's job.

### D2 — Stylesheet self-containment, built now; the files follow

The US regional backbone referenced `../util/style/us-regional.xsl` — the same
one-level-short path its DOCTYPE had already been corrected for — `index.xml`
carried no stylesheet reference at all, and nothing bundled a stylesheet into
any package. eValidator flags a reference a package cannot resolve, and Click
4's acceptance criterion cannot be met without one. That is a
submission-blocking defect, so it was fixed without waiting for the files:

- `dtd-bundler.ts` — the self-containment gate requires `ectd-2-0.xsl` for
  every region and `us-regional.xsl` for FDA, alongside the DTDs. One flag
  (`ECTD_REQUIRE_DTD`), one drop-point (`assets/ectd-dtd/`), one verdict.
  A caller that omits the stylesheet list cannot clear the gate by omission.
- `regional-packager.ts` — bundles `*.xsl` into `util/style/` and checksums
  them into `util/index-md5.txt`; the FDA PI now climbs two levels;
  `index.xml` carries `<?xml-stylesheet href="util/style/ectd-2-0.xsl"?>`.
- `ectd-structural-validator.ts` — warns on a stylesheet reference with
  nothing under `util/style/`, as it already did for DTDs.
- `checksum-manifest.ts` — `*.xsl` is in the default extension set, so an
  unlisted or tampered stylesheet is reported exactly like a DTD.

Only the FDA backbone emits a stylesheet PI, so only FDA requires the regional
stylesheet. Requiring one for a backbone that never references it would
over-block; the map is extended in the same change that adds a PI elsewhere.

The two `.xsl` files still need a network-permitted machine (§2). Until they
land, every package reports `selfContained: false` with the stylesheet names in
the blocker — the honest state, and exactly how the DTD gate has behaved.

### D3 — The coverage report tells clients two facts, not one

`getDocumentCoverage(...).formsFullyBacked` required `officialAssetTrusted`
for every form, and for the XFA forms that was earned by a code-reviewed map
plus a byte check — with no human reviewer at all — while its doc comment read
"installed and reviewed for filling". A client-facing readiness signal cannot
conflate those.

`formsFullyBacked` keeps its meaning: installed, integrity-verified, fillable.
Each required form now also carries `reviewer` (the manifest's `reviewedBy`, or
null), and the filing carries `formsHumanReviewed`. For US IND today that reads
backed, not yet human-reviewed. JM's Acrobat check on 1571 and 3674 flips it by
naming a reviewer on those two manifests, and nothing else does.

### Not done, and why

- **Vendoring the DTDs and stylesheets** — needs egress this environment does
  not have. The runbook, README and `checksums.txt` are updated so it is a
  checklist, not an investigation; two stale statements that the files are
  "not committed" and kept out by `.gitignore` were corrected — they are
  committed, per the README's own policy and the actual `.gitignore`.
- **Legal clearance** — FDA/ICH redistribution and the decrypted form assets.
  A conversation, not code. Flagged in §5 and §8; unchanged.
- **eValidator Basic** — Windows and a LORENZ ID.
- **Phase 2 clicks** — each one's definition of done is JM in a browser.
  Starting one without him closes nothing.

### Verified

Fifteen tests written first; fourteen failed against the unchanged code (the
fifteenth is a negative case that passes by construction until its positive
twin exists), then:

```
five affected test files          147 / 147
regression sweep                  197 files / 2213 tests   pass
  (ectd, submission-gateways, ind-forms, forms, estar, regulatory,
   orchestrator, HI-8 export hardening, ectd-compile spine)
typecheck, scoped                 0 errors — the 11 changed files plus their
                                  full transitive import closure, 9 GB heap
                                  (tsconfig.check.json aborts at its 6 GB heap
                                  on this 15 GB box; a memory limit, not a type
                                  error)
```

---

## 13. Phase 2, Click 1 — land in a drug program (2026-09-07)

**Session prompt:** open a seeded IND program; sponsor, product, indication and
IND number visible, every value read from the database; no fixtures, no
constants; report which surface owns it and what changed; stop when JM can
click it.

**Status: JM can click it.** Driven end to end in headless Chromium against a
real local PostgreSQL 16 built from the repo's own `install-fresh` and GA demo
seed. Screenshots in `docs/reports/wo9-click1/`.

### Which surface owns it

Registry id `project-home` → `client/src/concept2cure/v2/surfaces/ProjectHome.tsx`,
reached from the Projects portfolio (`/concept2cure/projects`, `Projects.tsx`,
`GET /api/c2c/projects`) by opening a program row, which publishes the
selection and navigates to `/concept2cure/project-home`. The landing reads
`GET /api/c2c/projects/:id` in `server/routes/c2c/projects.ts` — not the
biopharma router the registry's `apiPrefixes` might suggest, and not the
`/api/projects` legacy table.

### What was true before

Product and indication were already live from `regulatory_programs`. Sponsor
was not rendered. **The IND number could not be rendered because nothing in
the data model held one:** `regulatory_programs` had no such column,
`submissions` carries no application number and no program link, the eCTD
compile route stamps the program *code* into `us-regional.xml` as the
application number, and Form 1571's IND number is whatever the forms panel
user types. "IND number from the database" was therefore a schema change, not
a wiring change.

### What changed

1. **`regulatory_programs.application_number`** — nullable text, the
   agency-assigned IND / NDA / BLA / MAA number, distinct from the sponsor's
   own `code`. `migrations/20260907_regulatory_programs_application_number.sql`
   (additive, `IF NOT EXISTS`, replay-safe per RULE 1), registered in
   `C2C_MIGRATION_FILES` before the tenant sweep (`ci:migration-set-order`
   passes), Drizzle column in `shared/schema/programs.ts`, the contract
   fixture in `biopharma-programs-router-columns.contract.test.ts` (seen
   failing on the column-set mismatch before the fixture caught up), and the
   three golden journeys that create programs now replay the migration.
2. **Read model** — `GET /api/c2c/projects/:id` selects
   `p.application_number` and `o.name AS sponsor_name` through the
   organisations join (the sponsor of record in this data model). The create
   handler accepts an optional `applicationNumber`.
3. **Landing** — a "Program identity" row under the chips: Sponsor, Product,
   Indication, and the number labelled by program type (IND number / NDA
   number / BLA number / MAA number / Application number). Every value comes
   from the row; none from the navigation handoff, none derived from the
   title. Absence is stated — "not recorded", "not assigned" — never filled.
   Five tests, written first and seen failing against the reverted file.
4. **Seed** — `scripts/seed/ga-demo.d/111-ind-program.mjs` numbers the GA
   demo's two genuine IND programs, BX-256 (000256) and BX-512 Vorelinib
   (000512): six-digit agency format, deliberately low, echoing the code so
   they read as seeded. It numbers only `program_type = IND` rows whose number
   is null, never inserts, and leaves everything else alone.
5. **Console** — the dev report-only CSP inherited helmet's default
   `upgrade-insecure-requests`, which browsers ignore in report-only mode and
   log as a console error on every page. Dropped from the development policy
   only; the enforcing production policy keeps it. Tests pin both branches by
   re-importing the module under each `NODE_ENV`; the dev assertion was seen
   failing with the default restored.
6. **Tests adjusted to the new truth** — `projects-list.test.ts` pinned the
   string `sponsor_name` as a phantom column; the hazard was `p.sponsor_name`,
   so it now pins the alias-qualified forms and asserts the join and the new
   column.

### Verified

Authenticated API, BX-512:

```
code=BX-512  program_type=IND  product_name="Vorelinib · BX-512"
indication="KIT-mutant gastrointestinal stromal tumor · 4L+"
sponsor_name="Concept2Cure Therapeutics"  application_number="000512"
```

Browser (login → Projects → open Vorelinib → Project home), read from the DOM:

```
Sponsor      = Concept2Cure Therapeutics
Product      = Vorelinib · BX-512
Indication   = KIT-mutant gastrointestinal stromal tumor · 4L+
IND number   = 000512
```

The same row in `psql`. Console: no application errors. One failed request,
`fonts.googleapis.com`, reset by this sandbox's egress policy — it loads in a
normal environment, and it is a runtime dependency worth removing for
air-gapped deployments (noted, not changed).

What remains imported from `fixtures/project-home-data.tsx` is the lifecycle
stage catalogue — stage labels, blurbs and tool ids — not data about any
program. Every program fact on the landing is the database row.

### Found on the way, not changed

- **BX-301 is two different products.** The GA seed's BX-301 is a BLA for
  paroxysmal nocturnal hemoglobinuria; the IND-checklist seed describes BX-301
  as an anti-BCMA mAb IND in multiple myeloma. This module leaves BX-301 alone.
  The demo's IND program is Vorelinib.
- **The compile route still uses the program code as the application id**
  (`ectd-compile.ts`, `anchor.programCode`). Click 4 should prefer
  `application_number` so `us-regional.xml` carries the IND number the landing
  shows; the forms path (Click 2) should read the same column for Form 1571.
- **`anaDrivesScreens.test.tsx` (Vault) fails on the base branch** —
  verified identical with every client change of this click stashed.
- **This sandbox's PostgreSQL has no pgvector**, so `coauthor_documents` was
  never created here and the IND-checklist seed skips; the Part 11 audit files
  also did not apply, so some routes log `audit.tamper_proof_log does not
  exist`. Neither is on the Click 1 path. Both resolve on a database with
  pgvector.

### For JM

`npm run up`, then `npm run db:seed` (idempotent — it only adds the two IND
numbers to an existing demo database). Sign in, open Projects, open
**Vorelinib · KIT-mutant GIST (IND)**. The identity row is the click.

---

## 14. Phase 2, Click 2 — the IND forms panel (2026-09-08)

**Session prompt:** wire `IndFormsPanel.tsx` to `/api/ind-forms`; generate all
five forms; each renders with an on-screen statement of what it is and what the
sponsor must complete in Adobe; add the sponsor-upload path so a completed
official form can be attached and placed as a Module 1 leaf; do not attempt to
fill any XFA form; do not modify a form manifest; stop when JM can click it.

**Status: JM can click it.** Driven end to end in headless Chromium against the
same local PostgreSQL 16 Click 1 used. Screenshots in `docs/reports/wo9-click2/`.

### Which surface owns it

Registry ids `ind-checklist` / `ind-lifecycle` →
`client/src/concept2cure/v2/surfaces/IndLifecycle.tsx`, which embeds
`surfaces/IndFormsPanel.tsx` under heading "2a — Build & render the FDA form
PDFs". The panel drives `server/routes/ind-forms.routes.ts` (mounted
`/api/ind-forms`, JWT + `regulatory-author`).

### Two things were not true before

1. **Every value on the forms was typed into the panel.** Sponsor, drug,
   indication and IND number were six text inputs. Nothing connected them to
   the program record Click 1 had just made authoritative, so the sponsor name
   on a filed 1571 depended on who typed it into which panel.
2. **Nothing could file a signed form.** Three of the five Module 1 forms end in
   a signature and no server can produce one. The platform emitted the genuine
   FDA file with the program's data in it, the sponsor completed and signed it
   in Acrobat — and then it lived in a downloads folder. The sequence carried an
   m1.1 leaf with nothing behind it.

Section B of the execution package also asked for "an on-screen statement that
the official dynamic XFA form must be completed in Adobe". Since Option B landed
(§11, D1) that sentence would be false for 1571/3674: the output IS the official
form. The panel now says what is actually true per form, read from the engine.

### What changed

1. **The program record fills the forms.** `programToFormMetadata`
   (`form-context-assembler.ts`) maps a `regulatory_programs` row + its
   organisation onto the builders' metadata, routing the agency number by
   program type — an IND's number to the 1571's IND box, an NDA/ANDA/BLA's to
   356h's application number, and a type the FDA drug forms have no box for
   (MAA, 510K) contributes none. `/build`, `/pdf`, `/1572/pdf-all`,
   `/3455/pdf-all` and `/:formId/artifact` all merge it under what the caller
   stated; a blank input is dropped rather than written over a recorded value,
   and a request that NAMES an unresolvable program is refused 404 rather than
   answered from typed fields.
2. **The render plan, before the render.** `describeRenderPlan`
   (`ind-form-fill-service.ts`) reports, from the SAME gates `renderBuiltForm`
   applies, whether a form returns the official AcroForm, the official form
   through its XFA datasets, a reconstruction or a draft — with the template
   edition, the named reviewer (or null), the fields the platform writes, and
   the boxes left for the sponsor. A test renders each form and asserts the plan
   agreed. `GET /` carries the plans, memoised per templates directory (seven
   vendored forms are ~20 MB of digesting per call).
3. **The sponsor-upload path.** `POST /:formId/official-upload` (multipart)
   stores the completed PDF through `storeRenderedLeafFile`
   (`rendered_from: 'ind_form_sponsor_upload'`) and places it with `upsertLeaf`
   at the section the FDA Module 1 catalogue gives — forms at m1.1, the
   financial pair at m1.3.4, taken from `module1HeadingForSectionKey`, the same
   function the transmit path uses, never a second table. Re-attaching replaces
   that form's leaf rather than filing it twice. It refuses: a file that is not
   a PDF **by its bytes**; a file byte-identical to the blank vendored template
   (attaching the blank form is attaching nothing); a program with no submission
   spine, or a spine with no sequence — which sequence a document is filed into
   is a regulatory decision and is never created as a side effect of an upload.
4. **The checklist reads the filed form.** `ind-checklist-view-assembler` marks
   1571/1572/3674 complete when a leaf typed `form_<n>` is backed by a
   `rendered_leaf_files` row **in this organisation** — read through that row,
   not the leaf, because `document_table` is a polymorphic reference with no FK.
5. **The panel.** The four recorded facts are shown read-only under "Read from
   the program record"; only what the record has no column for (phase, serial
   number) is typed. Each row states what the form will produce, how many boxes
   are left for the sponsor, and whether the asset has a named reviewer — D3's
   distinction, now on screen. An attach control files the signed form and the
   placement (section, sequence, size, SHA-256) survives reload because it is
   re-read from the server.
6. **Seed.** `111-ind-program.mjs` now also gives BX-256 and BX-512 the canonical
   `submissions` row and original sequence 0000 that self-serve intake creates,
   by the same identity convention (`ensureSubmissionSpine`). The GA demo seeded
   those programs before intake did that, so they had a program and no
   submission — nothing could be filed into them. Idempotent: verified by
   running the seed twice, second run created nothing.

### Fixed on the way — defects this work uncovered

- **A derived gate sat in the official-fill placeability gate.** Form 3674's
  `certification_selected` is computed from the three certification checkboxes
  and is `required`, but was not marked `qcOnly` — so it was in
  `requiredFields`, which `fillOfficialTemplate` uses to refuse a template that
  cannot place a required field. No template can ever carry a derived verdict,
  so any AcroForm edition of the 3674 would have been refused as unqualified.
  3455's `interest_type_selected` was already flagged for exactly this reason.
  Latent today (3674 fills through XFA), fixed with `BuiltForm.qcOnlyFields`
  exposing the distinction; seen failing first.
- **A missing authoring store erased real INDs.** The checklist assembler read
  `coauthor_documents` unguarded inside its bulk `Promise.all`. On a database
  where that store is not provisioned the whole assembly threw 42P01, the route
  degraded the ENTIRE response to `[]`, and an organisation holding real IND
  submissions was shown "No IND checklist yet". Identity comes from
  `submissions`; the authoring store only supplies section status. Now fails
  closed to "no section status", like the target-date read beside it. This is
  what the sandbox was hitting (no pgvector → no `coauthor_documents`), and it
  would hit any tenant whose authoring store lags the submission core.
- **An ambient `declare module '@/lib/queryClient'` shadowed the real module.**
  `client/src/types/api.d.ts` declared the module's types by hand — its own
  comment called itself "the authoritative type … so it must expose every member
  consumers import" — and had drifted: it typed `apiRequest` as
  `Promise<any>` where the implementation returns `Promise<Response>`, and it
  made a newly exported member invisible to the compiler. Removed; the real
  module types itself and **both** typecheck configurations now pass with zero
  errors (§13 recorded 7 pre-existing errors; they are gone).
- **Every toast named the form twice** — "FDA FDA_1571", because the engine's
  ids are canonical (`FDA_1571`) and were pasted after another "FDA". Pinned by
  a test that fails on any `FDA_` reaching the note line.
- **The migration manifest was out of sync**, from an upstream migration
  (`20260907_qc_testing_batch_attribution.sql`) added without running the sync.
  Verified pre-existing by re-running the gate with all of this work stashed.
  Synced; `db:sync-manifest:check` passes.
- **`storage/vault/` was not ignored.** The dev object store now holds sponsors'
  completed, signed FDA forms; it was untracked and therefore committable by
  accident. Ignored (`storage/ir-packs/` is tracked on purpose and unaffected).

### Verified

The official FDA 1571 the panel produces, read back through pikepdf — the
program's values are inside the genuine FDA file's XFA datasets:

```
Concept2Cure Therapeutics  present in datasets: True
Vorelinib                  present in datasets: True
000512                     present in datasets: True
gastrointestinal           present in datasets: True
```

Browser (login → Projects → Vorelinib → IND lifecycle), read from the DOM:

```
Sponsor     = Concept2Cure Therapeutics
Drug        = Vorelinib · BX-512
Indication  = KIT-mutant gastrointestinal stromal tumor · 4L+
IND number  = 000512

FDA 1571  Returns the official FDA form (edition 2025-03-28) with the program's
          values written into it. Complete the remaining boxes and sign it in
          Adobe Acrobat. | 8 box(es) left for you to complete on the form.
          | This asset has no named reviewer yet.
FDA 1572  Returns the official FDA form (edition 2025-04-13) with the program's
          values filled in and flattened. | 2 box(es) left …
          | Asset reviewed by jonmichaelpsmith@gmail.com.

Build & check 1571 → "Form 1571 built — 2 required field(s) missing."
                     (sponsor_address, ind_type — the record holds neither)
Attach       1571 → "Completed FDA 1571 filed at m1.1 in sequence 0000."
After reload      → m1.1 · sequence 0000 · 2.8 MB · SHA-256 d6965e4d2ba8…
                    and the checklist chip above reads COMPLETE
```

The same placement in `psql`, with the retained bytes behind it:

```
leaf 2 · m1.1 · Form FDA 1571 (sponsor-completed) · rendered_leaf_files
        document_type form_1571 · sequence 0000 · Vorelinib · KIT-mutant GIST (IND)
file    form-fda-1571.pdf · ind_form_sponsor_upload · 2 921 999 B
        sha256 d6965e4d2ba84401… = the source pin on the leaf = the bytes uploaded
audit   ind_form.official_upload → submission_leaf 2, carrying both digests
disk    storage/vault/1/rendered-leaves/versions/…/form-fda-1571.pdf, digest identical
```

```
regression sweep              147 files / 1288 tests   pass
  (ind-forms, ind-lifecycle, ectd, submission-service, submission-gateways,
   the ind-forms route contract, the c2c project routes, the two client suites)
client suite, whole           296 files / 3540 tests   pass
typecheck (tsconfig.json)     0 errors
typecheck (tsconfig.check)    0 errors
ci:migration-set-order        OK — 252 migrations
ci:migration-drop-safety      OK — 24 DROPs, none re-created
db:sync-manifest:check        in sync
```

Console: no application errors. One failed request, `fonts.googleapis.com`,
reset by this sandbox's egress policy — the same runtime dependency §13 noted,
still worth removing for air-gapped deployments.

Fail-first, as the working agreement requires: `programToFormMetadata` (6),
`describeRenderPlan` (7), the sponsor-completed checklist case, the derived-gate
fix (3), the absent-authoring-store case, the panel's record/plan/attach
behaviour (4) and the form-naming fix were each seen failing against the
unchanged code before the change that makes them pass.

### Found on the way, not changed

- **Form 3455 and 1574 have no vendored template**, so their plan honestly reads
  `draft`. Only 1571, 1572, 3454, 356h and 3674 are installed. The five the work
  order names are all official.
- **`sponsor_address` is missing on every 1571** the record fills: the program
  record has no sponsor-address column, and the organisation's address is not
  read. The IND master-data sponsor registry holds one and `/pdf-from-records`
  already uses it — connecting the two is a follow-on, not this click.
- **Click 4 still stamps `anchor.programCode`** as the application id in
  `us-regional.xml` (§13). Now that a placed sequence exists for the demo
  programs, that is the next thing the compile will get wrong.
- **The upload replaces within a sequence, but has no lifecycle op across
  sequences.** Filing a corrected form into 0001 as a `replace` against 0000 is
  Click 6's subject and is deliberately not attempted here.

### For JM

`npm run up`, then `npm run db:seed` (idempotent — it adds the two IND numbers,
their submission rows and sequence 0000). Sign in, open Projects, open
**Vorelinib · KIT-mutant GIST (IND)**, then the IND lifecycle surface. The
Module 1 forms panel is the click: the four facts above the table come from the
database, each row says what it will produce, and "Attach completed form" files
a signed PDF into sequence 0000 at m1.1.

---

## 15. After Click 2 — the application number, and a gate that now blocks the freeze

Two follow-ups from §14's "found on the way", one fixed and one that is JM's
call. Neither is a new click.

### Fixed — the agency's number now reaches the agency's field

`applicationId` becomes `<application-number>` in the FDA us-regional backbone,
and `applicationRef` becomes `<ectd:application-number>` in the eCTD 4.0 draft
backbone. Both were stamped from the SPONSOR's internal program code
(`BX-512`), because when that code was written nothing in the data model held
an agency-assigned number. `regulatory_programs.application_number` does now
(Click 1), so a filing whose IND number is recorded carries it.

The chain is the one the existing comment already described, with "recorded
identity" now able to mean what it should: **the recorded agency number, else
the program's own code, else a handle that says plainly it is unassigned.** A
blank or whitespace column is not a recorded number. One function
(`applicationIdFor`) decides it for the assembled package, the compilation
record and the draft backbone, so the three cannot disagree about what was
filed.

The legacy numeric path was stamping `IND-<projectId>` — a string shaped
exactly like an agency IND number, synthesised from a row id, for an
application the agency has never seen, under a comment claiming "recorded
identity we actually hold". Such a project has no program record and therefore
nothing recorded, so it now says so.

Seven tests, seen failing first on the two cases that mattered (a recorded
number ignored; `IND-7` invented) and passing by construction on the three that
pin the unchanged fallbacks.

### Also fixed — a regression this work introduced

`resolveProgramIdent` now reads the sponsor through a join on `organizations`,
and `tests/routes/ind-forms-artifact-ident.test.ts` fakes the drizzle builder
chain, which had no `leftJoin` link — five tests fell to a 500. Found by
running `tests/routes/` as well as `server/routes/__tests__/`; §14's sweep ran
only the latter. The fake now mirrors the real chain. The same pass removed a
duplicate query: the governed artifact path re-resolved an ident it had already
resolved in the same handler.

### For JM — a decision, not a defect

**The drug-NDA golden journey is red on `concept2cure-v2`, and it is not from
this work.** Commit `19a0747eb` ("block dispatch on a missing or broken release
signature") added a §11.70 transmit control to the composed dispatch gate and
did not update the journey. Verified upstream: none of this session's commits
touch dispatch, the release-signature gate or the journey, and no later commit
addresses it.

What it means in the product, which is the part worth JM's attention:
`transitionSequenceGoverned` applies the **whole** composed gate to `frozen` as
well as `dispatched`. So freezing an IND / NDA / BLA / MAA sequence now
requires a verified release signature first. That is not circular — the package
orchestrator never reads the sequence's status, so it can run and be signed
while the sequence is still draft — but it **reverses the order the product
previously worked in**: it is now sign the release, then freeze, where the
journey (and any existing operator habit) does freeze, then sign.

Two ways to resolve it, and the choice is a regulatory one:

1. **Keep the new order.** The gate is right and the journey is out of date: it
   must run the package orchestrator and sign the release before it freezes.
   Real work in a journey that drives real services, and it belongs with the
   commit that changed the order.
2. **Scope the gate to dispatch.** Its own module calls itself "the
   transmit-time re-check" and "the provable pre-transmit rule"; applying it at
   freeze may be wider than intended. One change in
   `transitionSequenceGoverned` composing the freeze verdict without the
   release-signature gate.

**JM chose (1): scope the gate to dispatch.** Done, and the journey is green.

`composeDispatchGatesForStep` states the membership in the one place gate
membership is asserted. The freeze case is expressed as "a release signature is
not REQUIRED" rather than "the gate is omitted", which is what keeps the gate's
second rule intact: an `invalid` verdict blocks unconditionally, so a TAMPERED
signature still blocks a freeze. Requiredness governs whether a signature must
be present, never whether a broken one may be ignored. Every other gate governs
both steps, pinned by a test that iterates them, so a gate added later cannot be
dropped from the freeze verdict by omission.

Freeze keeps the Part 11 signature it always had — `transitionSequenceGoverned`
Gate 1, bound to this sequence, this step, this actor and this leaf manifest —
so nothing about the freeze is less governed than before; only the *transmit*
re-check moved to transmit.

The readiness endpoint still reports the DISPATCH verdict, so the journey now
asserts what is true of it: exactly one blocker and it is the release signature
— which also proves no other gate objects — while the freeze that follows
succeeds. Those two facts together are the scoping. A journey that drives the
package orchestrator to a signed release, and so reaches a cleared dispatch
verdict, is recorded as the follow-on.

### Also fixed — a test that had gone blind

`chat-threads-read-honesty.test.ts` was failing on the branch for its own,
unrelated reason. `listThreadMessages` gained a step resolving WHICH store holds
a thread; the test's ownership mock still answered a shape from before that step
existed, so the handler 404'd and the transcript read whose failure the test
asserts was never reached. A read failure reported as "no such thread" is the
same fabrication the file was written against — an infrastructure error stated
as a fact about the user's data. The mock now matches the resolver, and the test
asserts the transcript read was actually called, which is the assertion that
would have caught the rot.
