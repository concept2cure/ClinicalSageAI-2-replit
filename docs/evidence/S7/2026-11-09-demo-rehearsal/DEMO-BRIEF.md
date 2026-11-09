# CMC demo brief — 1:00 pm PDT, 2026-11-09

The app is running on **http://127.0.0.1:5000**. Sign in `jm.smith@concept2cure.pro` / `pass-word`.
Every rail destination was walked in a real browser 20 minutes ago: **zero failing API calls, zero console errors.**

## The click-path

1. **Projects** → `[Demo · Biotech] C2C-201 oral JAK1 inhibitor — atopic dermatitis (IND)`
2. The project page opens. In the rail, **Work areas → CMC / Module 3**.
3. The CMC area has two halves, chosen by the segmented control: **Module 3** and **Study records**.
   - *Module 3*: Overview · Quality by design · **Module 3 build** · Approvals & audit
   - *Study records*: **Substance & product** · **Specifications** · **Stability** · **Batch records**

## What is true in the data right now, and why it demos well

I set three method states on purpose, so the governance story has all of its halves.

| Analytical method | State | Demo use |
|---|---|---|
| HPLC-UV assay and related substances | **validated** under signature | the ordinary happy path |
| Dissolution (USP <711>, apparatus 2) | **validated** under signature | the approved specification |
| Karl Fischer water determination | **phase-appropriate**, signed, Phase 2 | *new today* — see below |
| XRPD identity and polymorph form | still in `validation` | **the refusal** |

**Specifications tab — 6 attributes.** Two are **Approved** under a real 21 CFR §11.50 signature. Press **Approve**
on *C2C-201 — solid form* and the platform refuses, in its own words:

> The analytical method "XRPD identity and polymorph form" is recorded as validation, which is neither validated
> nor shown suitable, so a limit measured by it cannot be approved (ICH Q2).

That is the line worth reading aloud. The screen used to *claim* that rule and the server never enforced it; it
does now, and it refuses **before** asking the signer for their password — nobody signs into a refusal.

**The differentiator, built today.** FDA asks at phase 1 for procedures that are scientifically sound and fit for
their use, with full validation by the pivotal phase. The register's one signed Validate act now records **which**
the signer is attesting — full ICH Q2(R2) validation, or suitability for a stated phase — and the approval gate
reads the *signature*, not a word typed in a dropdown. The Karl Fischer method is signed `phase-appropriate` for
Phase 2, and the water-content specification is approved on it. No competitor material I found does this.

**Stability tab — 3 studies, ICH Q1A(R2).** "6 recorded · 6 OOS", a 24-month retest claim, and per-study actions:
Result · **Estimate Q1E** · Trend · Shelf life · History. The Q1E estimate and the poolability test are
deterministic engines, not a model.

**Batch records — 3 batches, 1 open deviation, average yield 88%.** The **Eligible** column is computed from the
batch's own recorded, reviewed QC results. Press **Release** on an ineligible batch and it says why:

> 2 recorded results are not yet reviewed (DS-2502-R1, DS-2502-R2). A full release needs every result reviewed by
> a second person.

The drug-substance batch **has** been released under signature, so both sides are on screen.

**Module 3 build.** "21 sections in CTD §3.2 · 18 ready to compile", **Compile Module 3**, **Run contradiction
sweep**, and an **export readiness** panel that is fail-closed: it reports *"Not export ready — 0 of 21 sections
approved · 3 sections with no recorded source"* rather than a green tick it cannot justify.

## Three things I would not demo

- **Approvals & audit** shows "0 outstanding" agency questions — true, and an empty screen.
- **Module 3 build** reports sections approved as 0. Section approval is a separate signature from specification
  approval; I did not sign 21 sections.
- The **Quality by design** tab derives CQAs and CPPs from the registers rather than holding them as records. It
  reads well, but if the client asks "can I version and own a CQA?", the honest answer today is no — it is the
  first item of the roadmap you approved as P-113.

## Four defects I found and fixed in the last two hours, by walking it

1. **Batch Release posted to `/api/cmc/batch-records/NaN/release`** — the row id is a uuid and the client coerced
   it with `Number()`. Every Release press was a 500. Fixed.
2. **Batch release crashed with `require is not defined`** even on a correct id — a shared hash function reached
   `node:crypto` through a dynamic `require`, which does not exist in the server's ESM runtime. So that governed
   act had **never** completed. Fixed; a release now writes its signature and ledger hash.
3. **The Tasks tray answered 500** — my local database was behind on one migration another lane landed today.
   Applied.
4. **A stale Module 3 register link** showed a banner on the CMC overview. Cleared through the screen's own retry.

Items 1 and 2 were hiding each other: the broken id meant nobody ever reached the broken hash.
