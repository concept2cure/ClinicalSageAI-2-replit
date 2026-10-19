# The dossier says whether it has signed for its own claim

Slice 11 made the stability close-out a 21 CFR Part 11 signature. That created a
distinction the composed section could not express.

`shelf_life` is what §3.2.S.7.1 / §3.2.P.8.1 print as the proposed storage
period. Before the close-out was governed, every claim was an ordinary edit, so
there was nothing to distinguish and the sentence was honest as it stood:

```
A shelf life of 24 months at 25C/60%RH is proposed, subject to review of
the 3 recorded result(s) tabulated in the stability results table.
```

After it, that same sentence printed for **two different facts**: a period a
signer had accepted on a close-out, and a period a scientist had typed onto a
study still running. A reader of the dossier — a QA reviewer, an auditor, the
agency — could not tell the organisation's accepted claim from a working note.

---

## The change

Two edits, both deterministic from a recorded fact:

- **`mapStabilityPayload`** carries `shelfLifeAccepted` (whether the row has a
  close-out signer) and `shelfLifeSignedAt` into the canonical source payload.
  The signer's **id is deliberately not carried**: the section states the
  provenance of the claim, not who made it — the audit trail and the §11.50 row
  name the person for a reader who asks, and a name in the payload would be a
  second place for one fact, free to drift from the signature.
- **`shelfLifeSentence`** states which it is. `shelfLifeAccepted(sources, side)`
  requires the signature and the claim to be **on the same row**, so a signed
  study with a blank shelf life cannot lend its signature to another study's
  claim, and a signed drug-substance close-out cannot make the **product's**
  claim read as accepted.

## After, on the running product

Two programmes identical but for the signature — same claim, same three recorded
results, same condition — composed through `POST /api/cmc/module3-os/compile`
(`probe-provenance.sh`, `after.txt`):

```
── a running study, shelf life recorded by an ordinary edit ──
  A shelf life of 24 months at 25C/60%RH is proposed, recorded on a study that
  has not been closed out under signature, subject to review of the 3 recorded
  result(s) tabulated in the stability results table.

── the same study, closed out under a signature (HTTP 200) ──
  A shelf life of 24 months at 25C/60%RH is proposed, accepted on a signed study
  close-out, subject to review of the 3 recorded result(s) tabulated in the
  stability results table.
```

The only difference between the two programmes is the close-out, so the only
difference in the section is the provenance — which is what makes this a
measurement and not an illustration.

The probe also recorded something worth keeping: a programme with a stability
study and no material **does not compose a section at all**. The compile refuses
with *"This program records no drug substance, so whether its Module 3 is
composable here is not…"* rather than composing §3.2.P.8 over a product it has
no record of. The probe records the drug substance and drug product first, as a
real programme would.

## Shown failing first

`module3Composer.shelf-life-provenance.test.ts` (10 cases) against the version
that stated the claim without its provenance and the payload that carried no
signature: **6 fail** (`no-provenance-fails.txt`), including

```
× mapStabilityPayload carries the close-out signature > reports a closed-out study’s claim as accepted
    AssertionError: expected undefined to be true
× the composed §3.2.P.8 states the claim’s provenance > says a claim on a running study has not been signed for
    AssertionError: expected 'Stability studies for the drug produc…' to match
      /recorded on a study that has not been…/
× … > is not fooled by a signature on a study whose claim is blank
```

The last of those is the case that matters most: it fails on the naive
implementation (`sources.some(s => s.payload.shelfLifeAccepted)`) which would
read a signature from any study in the section, including one that accepted no
claim at all.

`module3Composer.stability-honesty.test.ts` — the four cases that pin what this
section may and may not assert — stays green: the sentence still names the data
the claim is subject to review of, and still refuses to assert stability from a
positive-sounding phrase.

## What is not claimed

- **The engine does not grade the claim.** Whether *this* period is supported by
  *that* coverage is the ICH Q1E verdict (URS-CMC-024), reported separately by
  the compliance report. This sentence states only whether the organisation has
  signed for the period it is printing — a claim can be accepted under signature
  and still fail Q1E, and the dossier then says both.
- **A section composed before 2026-10-19 says nothing about provenance.** The
  payload is written by the write-through at register-write time, so a
  programme's existing `cmc_source_objects` rows carry neither key until the
  study is written again. The sentence then reads as *not closed out under
  signature*, which for every study closed out before the ceremony existed is
  exactly true.
- **§3.2.S.7 is unchanged.** Its narrative does not print a shelf-life sentence;
  the drug-substance side states a re-test period through its own section rules.
  The payload carries the signature for both sides, and
  `shelfLifeAccepted(sources, 'drug_substance')` is ready for the day that
  section states one.

## In the OQ record

`OQ-CMC-41` builds two programmes with the same claim, the same three recorded
results and the same condition, signs one close-out, composes §3.2.P.8 for each,
and asserts that both state the period and its basis while only one says the
claim was accepted:

```
  OQ-CMC-37  pass
  OQ-CMC-38  pass
  OQ-CMC-39  pass
  OQ-CMC-40  pass
  OQ-CMC-41  pass
OQ-008 CMC / Module 3: 23 pass, 0 fail, 10 deviation, 8 not-executed
```

Without `OQ_RUN_PASSWORD` the step records *not executed* rather than passing:
with no signature to make, the two cases it compares would be identical, so
there would be nothing to observe.
