# Session Handoff — Biotech & Pharma Stream

**Commit to `docs/handoff/HANDOFF_BIOTECH.md`.**

**Scope:** IND, NDA, BLA. eCTD publishing, FDA forms, CTD authoring.
**Last verified:** 2026-09-04 on `concept2cure-v2` (§1 rewritten; the rest dates from 2026-09-03, commit `499f096`).

This file is self-contained. An agent working this stream needs no other handoff.

---

## 0. How a new agent starts

Paste exactly this as the first message of a new Claude Code session, and nothing else:

> Read `docs/handoff/HANDOFF_BIOTECH.md` in full before anything else. Then read only
> the files it names. Do not read the whole repo. Do not propose work. Report what you
> understand the current state and the single next authorized action to be, and stop.

---

## 1. READ THIS FIRST — partly unblocked as of 2026-09-04

**Superseded in part.** This section previously read "there is currently no authorized
coding work on this stream" and told an agent to stop. That was true when written. It is
no longer true, and an agent that stops on it today will idle in front of work that is
both possible and done.

### What is now vendored and working

| Asset | State | Evidence |
|---|---|---|
| FDA eSTAR nIVD + IVD templates | **vendored**, checksum-pinned | `assets/estar-templates/`, verified by `estar-fill.test.ts` |
| FDA 1571, 1572, 3454, 356h, 3674 PDFs | **vendored**, sha256 in sidecar manifests | `templates/forms/acroforms/` |
| Official fill, FDA 1571 + 3674 | **working** — dynamic XFA filled through the `datasets` packet | `ind-form-xfa-official.test.ts` |
| Official fill, 1572 / 3454 / 356h | **working** — AcroForm | their `*-official.test.ts` suites |
| US IND form backing | `getDocumentCoverage('US_IND').formsFullyBacked === true` | `tests/regulatory/registryCoverage.test.ts` |

The long-standing belief that FDA 1571 and 3674 could never be filled — recorded in
`docs/biotech/FDA_FORMS_FILL_STATUS.md` and in both sidecar manifests — was measured on
the AcroForm layer, which on those editions is genuinely empty. Their fields live in the
XFA packets: 1571 declares 283 of which 246 are fillable, 3674 declares 190 of which 178
are. Both documents have been corrected.

### What is still blocked, and on what

1. **eCTD DTDs and stylesheets.** `assets/ectd-dtd/` still holds only its README,
   `checksums.txt` and two fixtures — no `.dtd`. `www.fda.gov`, `www.ich.org` and
   `clinicaltrials.gov` are all refused by this environment's network policy
   (`CONNECT tunnel failed, response 403`). A 403 is an organisation policy denial: do
   not retry it, do not find a mirror, do not synthesize a DTD, do not approximate a
   stylesheet. The remedy is unchanged — acquire the files from a network-permitted
   machine and add them via PR.

2. **FDA 3455 and FDA 1574 have no vendored PDF.** Every other supported form does.
   Those two render the labelled draft, honestly, and will keep doing so until the
   official blanks are dropped into `templates/forms/acroforms/` with sidecar manifests.
   Same acquisition constraint as the DTDs.

3. **A named reviewer for the 1571 / 3674 manifests.** Both still carry
   `assetTrusted: false` and `reviewedBy: null`. Nothing depends on them today — those
   fields gate the manifest-carried AcroForm field map, which does not apply to a
   dynamic XFA form, whose map is code-reviewed in `official-field-maps.ts` and
   re-verified against the template at fill time. A person should still confirm the
   eight 1571 box assignments against the printed form before a real filing.

**So:** work that does not depend on the three items above is authorized. Work that does
is still blocked, and reporting that it is blocked remains the correct and complete
action for it.

### Note for the concurrent device stream

On 2026-09-04, at JM's direct instruction to complete the biotech/pharma workflow
"including the PDF or the Acrobat file from eSTAR", this session edited files §2 lists as
device-stream territory: `server/services/forms/fill-official-pdf.ts`,
`server/services/pathway-engines/estar/`. The changes are the XFA data-path resolver that
both streams' forms depend on, plus honesty fixes in the eSTAR fill and readiness. They
were rebased onto the device stream's own commits and its full suite passes. The territory
split in §2 otherwise stands.

---

## 2. This stream's territory

**You may edit:**
- `server/services/ectd/`
- `server/services/ind-forms/`
- `assets/ectd-dtd/`
- `templates/forms/acroforms/` and its sidecar manifests
- `scripts/ind-forms/`

**You may not edit:**
- `server/services/pathway-engines/estar/`, `server/services/forms/`, or
  `assets/estar-templates/` — that is the device stream, running concurrently
- `client/src/concept2cure/v2/Shell.tsx`, `V2App.tsx`, `ConversationThread.tsx`,
  `AnaActivity.tsx`, `styles/app-v2.css` — that is the platform stream

If your work appears to require a file outside your territory, **stop and report it.**

---

## 3. Ground rules

1. **Branch `concept2cure-v2` only.** Never create a branch.
2. **No file proliferation.** Refactor in place.
3. **The machine room is sacred.** Editor, artifact lifecycle, provenance, review,
   submission, vault, audit chain, tenant isolation.
4. **Fail closed, never fabricate.** No fake validation pass, no invented DTD, no
   plausible-looking package.
5. **Done means JM clicked it.** You report and stop.
6. **One click per session.**
7. **A blocked step is blocked.** Report it.
8. **Proof goes in `docs/reports/`.**

---

## 4. Where truth lives

| Source | Use it for |
|---|---|
| `docs/reports/wo9-phase1-ectd-unblock-2026-09-03.md` | **The authoritative state of this stream** |
| `docs/handoff/WO-09_BIOTECH_IND_ECTD_DEMO.md` | Click sequence — but see the warning below |
| `assets/ectd-dtd/README.md` | Vendoring policy |
| `CLAUDE.md` | Repo law. Current and clean. |

**Where WO-09 and the proof report disagree, the proof report wins.** WO-09 §1.2
contains a premise about FDA form XFA status that was later measured and corrected —
see §7 below. Do not act on it.

**Ignore `docs/design/ANA_CHATGPT_PARITY_UI_DESIGN.md`.** It names `ZenApp.tsx` and
`ZenSidebar.tsx` as canonical; both files no longer exist. Any root-level markdown
older than 2026-08 is a snapshot, not an instruction.

---

## 5. Phase 1 state

| Step | State |
|---|---|
| 0 — Branch sanity | Done |
| 1 — Read ground truth | Done — §6 below |
| 2 — Vendor eCTD supportive files | **Blocked — egress** |
| 3 — Fill checksum manifest | **Blocked** — depends on Step 2 |
| 4 — Prove the DTD gates | **Done. The gate was broken and is now fixed** — §8 |
| 5 — Corpus ingestion sweep | **Blocked** — egress + no `DATABASE_URL` |
| 6 — Proof report | Written |

Two stop conditions remain open, both on Step 2: `assets/ectd-dtd/checksums.txt` has
zero filled entries, and no package can be DTD self-contained.

---

## 6. Ground truth — what the code actually requires

**Filenames are load-bearing.** `dtd-bundler.ts` hard-codes them and the packager's
DOCTYPE declarations reference them verbatim.

| Constant | Value | Referenced by |
|---|---|---|
| `ICH_BACKBONE_DTD` | `ich-ectd-3-2.dtd` | `buildIndexXml` — `SYSTEM "util/dtd/ich-ectd-3-2.dtd"` |
| `REGIONAL_DTD.fda` | `us-regional-v3-3.dtd` | `buildFdaBackbone` — `SYSTEM "../../util/dtd/us-regional-v3-3.dtd"` |

For US-only scope, **two files** satisfy the DTD gate.

**Manifest format** (`checksum-manifest.ts`): `/^([0-9a-fA-F]{64})\s{1,2}(.+)$/` — 64 hex
chars, one or two spaces, filename. `#` comments and blank lines ignored.
`verifyChecksumManifest` reports `mismatched`, `missingFiles`, `unlistedFiles`; `ok` is
true only when all three are empty.

**The gate fails closed correctly. It is the data that is absent.** Measured on today's
empty directory:

```
listVendoredDtds()             -> 0 files
requiredDtdsForRegion('fda')   -> [ich-ectd-3-2.dtd, us-regional-v3-3.dtd]
production + requireDtd=true   -> selfContained=false  cleared=false  1 blocker
production + requireDtd=false  -> cleared=true   (report-only, as documented)
staging    + requireDtd=true   -> cleared=true   (report-only, as documented)
parseManifest(checksums.txt)   -> 0 entries
```

### Two gaps between the work order and the code

**The supportive-file list is wider than anything the code consumes.**
`bundleVendoredDtds` copies `*.dtd` only. Nothing reads `valid-values.xml`,
`form-type.xml`, or any stylesheet. Vendoring them satisfies no gate that exists today.

**Stylesheets are referenced but never bundled.** `regional-packager.ts:262` emits
`<?xml-stylesheet type="text/xsl" href="../util/style/us-regional.xsl"?>` into the US
regional backbone. There is no `assets/ectd-style/`, no `.xsl` anywhere in the repo, and
no code that writes `util/style/`. **Every FDA package references a stylesheet it does
not contain.** `assessDtdReadiness` only inspects `*.dtd`, so the DTD gate does not
catch it.

WO-09 Click 4's acceptance criterion — *"the compiled `index.xml` opens in a browser via
the ICH stylesheet"* — **cannot be met as built.** JM has ruled that the criterion
stands and that both `ectd-2-0.xsl` and `us-regional.xsl` are to be vendored into
`util/style/` on the same trip as the DTDs. **Bundling them will require a code change**
— a style bundler, or an extension to `dtd-bundler` — because nothing copies `.xsl`
today. That code change is authorized only after the files exist.

### Version pin — unverified

`dtd-bundler.ts` pins `us-regional-v3-3.dtd` (FDA US Regional v3.3) and
`ich-ectd-3-2.dtd` (ICH eCTD v3.2.2). **Neither was confirmed against the agency's
published page**, because the pages are unreachable. Do not assume v3.3 is still the
mandated production version. Confirm at acquisition time. If FDA publishes a different
version, that is a discrepancy to **report**, not to substitute silently.

---

## 7. FDA forms — the XFA question, resolved on measurement

An earlier premise held that all five vendored FDA forms were unfillable dynamic XFA.
That was measured with `pikepdf` and is **partly false**. The manifests' notes were
wrong; the real obstacle on two of them was encryption, not XFA:

| Form | `/Fields` | XFA in AcroForm | `/NeedsRendering` | Verdict |
|---|---|---|---|---|
| FDA 1572 | **740** | no | absent | Fillable AcroForm |
| FDA 356h | **1,348** | no | absent | Fillable AcroForm |
| FDA 3454 | 1 | yes | absent | Static XFA — fills after strip |
| FDA 1571 | 0 | yes | **true** | Dynamic XFA — reconstruction only |
| FDA 3674 | 0 | yes | **true** | Dynamic XFA — reconstruction only |

The 740 and 1,348 counts match the comments in
`server/services/ind-forms/official-field-maps.ts` exactly. The `/P -1036` permission
bits decode as: bit 9 fill-form-fields **allowed**, bit 6 annotate/fill **allowed**,
bit 4 modify denied, bit 11 assemble denied. **Filling is permitted by FDA.**

**JM's ruling:** onboard 1572, 356h and 3454 via the existing
`scripts/ind-forms/onboard-fda-form.ts` (it decrypts with pikepdf, hashes the decrypted
bytes, writes a manifest with `reviewedBy`/`reviewedAt`/`fieldMap`). For 1571 and 3674,
use reconstruction plus a sponsor-uploaded completed form placed as the Module 1.2 leaf.
Correct the false manifest notes. Record decrypted field counts, the `/P` decode, and
SHA-256 of both encrypted and decrypted assets in the proof report.

Status doc: `docs/biotech/FDA_FORMS_FILL_STATUS.md`.

**This work does not depend on egress** and may proceed if JM authorizes it as the
session's single click.

---

## 8. Step 4 — the DTD gate was broken and is fixed

Both fixtures were run through `validateDtdConformance`. The **conformant** fixture
failed:

```
index-valid.xml    3 findings (3 error)    expected PASS  -> GATE BROKEN
index-invalid.xml  11 findings (10 error)  expected FAIL  -> OK
```

**Root cause: the validator scanned XML comments as markup.** Every check is a regex
over the raw backbone string and comments were never stripped. `index-valid.xml`
documents `DTD_LEAF_MISSING_ATTR` using a literal `<leaf>` inside its own header
comment; the leaf scan matched it as leaf #0 with no attributes and raised three errors
against a conformant backbone. It also shifted `leaves[leafIdx]` at
`ectd-validator-hardening.ts:308`, so downstream indexing was off by one.

Fixed at `server/services/ectd/ectd-validator-hardening.ts:243` with a fixture test
loading both `assets/ectd-dtd/fixtures/index-valid.xml` and `index-invalid.xml`. Valid
must pass; invalid must fail.

---

## 9. Next authorized action

**None, unless JM says otherwise.**

Two things can unblock this stream, and both are JM's:

**(a) Vendor the files.** On a network-permitted machine, fetch from FDA and ICH — all
free — and add via PR:
- `ich-ectd-3-2.dtd`
- `us-regional-v3-3.dtd` (confirm the version is still current at acquisition)
- `ectd-2-0.xsl` and `us-regional.xsl` for `util/style/`
- then fill `assets/ectd-dtd/checksums.txt`

**(b) Authorize the FDA forms onboarding** (§7). It needs no network and is the only
substantive work available on this stream today.

If neither has happened: report the blockage, name what is needed, and stop.

---

## 10. Do not

- Retry, mirror, or route around an egress 403.
- Synthesize, approximate, or reconstruct a DTD or stylesheet from memory.
- Assume DTD v3.3 is current.
- Vendor `valid-values.xml` or `form-type.xml` expecting a gate to notice. No code
  reads them.
- Extend `dtd-bundler` to copy `.xsl` before the `.xsl` files exist.
- Create `config/ui-surface-registry.json`. It does not exist and is not the registry.
- Touch the eSTAR/device or client/v2 files. Two other streams are running.
- Write a new architecture document.

---

## 11. Session log — append one row, never rewrite

| Date | Account | Authorized click | What was proven | Report |
|---|---|---|---|---|
| 2026-09-03 | A | WO-9 Phase 1 Steps 0–6 + XFA decision | DTD gate defect found and fixed; vendoring blocked on egress; forms XFA status measured | `docs/reports/wo9-phase1-ectd-unblock-2026-09-03.md` |
| | | | | |

**Rule:** the last row with an empty "What was proven" cell is the open work.
