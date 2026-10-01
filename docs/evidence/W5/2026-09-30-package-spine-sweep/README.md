# W5 evidence — package-model spine: FDA-acceptance sweep, 2026-09-24 to 2026-09-30

**Row moved:** D7 (one real sequence), workstream W5, engineering half.
**Session:** `…session_01LjrcEe8y3zUQxwX91zzTaM` (lane: package-model spine, `docs/work-orders/README.md` §0).

This file is the durable record of an adversarial sweep of what the package-model
spine (`POST /api/submission-ops/packages/:id/assemble` → `executeGovernedTransmit`)
hands FDA. It is committed before the findings are verified because two container
resets destroyed the sweep's working files, and the findings are the input to the
next round of work. **Every finding below is UNVERIFIED unless its status says
otherwise.** A finding is not a defect until a skeptic has reproduced it at HEAD
and tested its spec claim; several claims rest on the reviewers' recollection of
ICH/FDA specifications that this sandbox cannot fetch (agency hosts are refused).

## How the sweep ran

Six independent finder lenses over the spine: ICH backbone, FDA Module 1 regional
backbone, sequence lifecycle, ESG transmission, validation parity, honest state.
Each finder read the code and ran probes against the real route, PGlite and the
real packager. Four lenses completed (22 raw findings, 20 after merging two pairs
that described one defect). **Validation parity and honest state did not run** —
both finders, and every verifier, were cut off by account usage limits
(2026-09-25 and 2026-09-26). They are owed.

## Findings

| ID | Lens | Claimed | Finding | Status |
|---|---|---|---|---|
| F00 | backbone | high | The ICH heading tree stops 1–3 levels short of v3.2.2 (e.g. `m3-2-s-4-1-specification`, `m5-3-5-1-…` are never emitted), so deep Module 2–5 leaves file under their parent heading; a non-existent code such as `3.2.S.4.9` is accepted and filed under 3.2.S with 0 errors. | unverified |
| F01 | backbone | high | `index.xml` and `us-regional.xml` declare `xmlns:xlink="http://www.w3.org/1999/xlink"`; the ICH 3.2 and FDA 3.3 DTDs fix it (`#FIXED`) to `http://www.w3c.org/1999/xlink` — every backbone would be DTD-invalid. The repo's own `docs/ectd/SPEC_DIGEST.md` shows the w3c.org value. | unverified |
| F02 | backbone | high | `m3-2-s-drug-substance`, `m3-2-p-drug-product`, `m5-3-5-…` (and the 2.3.S/2.3.P/2.7.3 counterparts) are emitted without the attributes the DTD requires (substance, manufacturer, dosageform, indication); multiple substances/products/indications merge under one heading. | unverified |
| F03 | backbone | medium | This spine can never produce a Study Tagging File: `LeafBytes` has no study fields, so 4.2.x / 5.3.x study reports ship untagged. | unverified |
| F04 | m1-regional + lifecycle | high | Every follow-up is declared the Original of a new regulatory activity: `submission-id` is always the sequence's own number and sub-type always `fdasst1`; the assemble body has no field to say otherwise, and nothing checks submission type against application type (an IND accepts "Efficacy Supplement"). | unverified |
| F05 | m1-regional | high | `<application-number>` is written exactly as entered; the product's own example is `IND123456`, while FDA application numbers are six digits. | unverified |
| F06 | m1-regional | high | Module 1 headings are written flat under `<m1-regional>` in package order (no parent headings, not in section order), Form 1571 ships as a bare leaf with no `form-type`, and FDA is marked `regionConformant: true` by region alone. | unverified |
| F07 | m1-regional | high | `<applicant-info/>` is always empty on this spine although the recorded applicant id and name are required and described as carried by the backbone; `application-containing-files` is also absent. | unverified |
| F08 | m1-regional | medium | Submission-type words are matched by loose substring, so `IND` files as IND Safety Reports (fdast9), `report` as Annual Report, `supplement` as Efficacy Supplement, instead of being refused. | unverified |
| F09 | lifecycle | high | `modified-file` names a content file, not a leaf (`../0000/index.xml#<leafId>`). | **fixed upstream** in `09c4c15d` (IND lane, 2026-09-29) |
| F10 | lifecycle | high | A filed withdrawal never leaves the filed state: the delete entry carries no `leafKey`, so the fold keyed on `leafKey` drops nothing; the document can be withdrawn twice, replaced after withdrawal, and is refused ("already on file") when re-filed. | unverified |
| F11 | lifecycle | medium | An empty-section placeholder PDF ("[EMPTY SECTION] …") is filed to the agency and never superseded: the real document later files as `new` beside it. | unverified |
| F12 | lifecycle | medium | A document moved to another CTD section is filed `new` there while the filed copy stays current at the old section, with no finding. | unverified |
| F13 | lifecycle | medium | Cover letters and forms are diffed like dossier content: an unchanged cover letter is left out of a follow-up, and an edited one replaces sequence 0000's. | unverified |
| F14 | transmit | high | A send to FDA's ESG **test** environment (`staging`) is recorded as the package's real filed sequence. | unverified |
| F15 | transmit | high | The duplicate-send lock is keyed on the bundle's bytes, not its sequence; re-assembling while an earlier send of 0000 is unconfirmed sends 0000 a second time. | unverified |
| F16 | transmit | medium | The AS2 message: `AS2-To` defaults to `FDA-CESUB`, no Center/submission-type routing, no S/MIME signing or encryption (a signature is computed and dropped), and the MDN is not verified. | unverified |
| F17 | transmit | medium | The uploaded archive has no sequence folder: `index.xml` sits at the zip root and the payload is always `ectd.zip`. | unverified |
| F18 | transmit | low | Bundles over 1 GiB go to an SFTP path built from caller-typed sequence and application number, and a bare deposit is recorded as filed. | unverified |
| F19 | transmit + lifecycle | critical | A sequence is recorded FILED on the ESG's MDN (Ack1) or a bare SFTP deposit, and nothing un-files it when FDA rejects it at Ack3 or it is rolled back; a second bundle with the same sequence number also reports "recorded". | unverified |

## What this sweep produced that is already fixed

**Lifecycle diff compared two stages of one document (found while building the
sweep's harness; not one of F00–F19).** With Ghostscript in the production image
(`Dockerfile.optimized`), the packager converts every leaf to PDF/A and the filed
manifest records the md5 of the CONVERTED bytes, while both spines plan the next
sequence against the md5 of the bytes they rendered or staged, BEFORE conversion.
Ghostscript stamps dates and a random document ID, so the two never matched: every
follow-up re-filed every unchanged document as `replace`, `NOTHING_TO_FILE` could
not fire, and the operator was told "0 left unchanged on file". This container has
no `gs`, so no suite could see it. Fixed by recording the digest of the bytes the
packager was handed (`sourceMd5`) whenever it changed them, carrying it through
both spines' manifest readers, and comparing like with like in the shared
operator.

Failing first, on the real route, PGlite and the real packager with a stand-in
Ghostscript that the real `finalizePdfA` path runs against
(`tests/submission-ops-package-spine.pglite.e2e.test.ts`,
`server/services/ectd/__tests__/stand-in-ghostscript.harness.ts`):

```
WITHOUT the fix: 2 failed | 2 passed (4)
  × WITH the production PDF/A toolchain: a follow-up in which nothing changed still files nothing
    → a sequence re-filing {"summary":{"new":0,"replace":3,"append":0,"delete":0,"unchanged":0},"omittedCount":0} unchanged documents: expected 200 to be 409
  × WITH the production PDF/A toolchain: only the edited document ships, as a replace of the leaf on file
    → expected { new: +0, replace: 3, … } to match object { replace: 1, new: +0, unchanged: 2 }
WITH the fix:    4 passed (4)
```

The no-toolchain control passes both before and after, which is exactly why the
defect was invisible.
