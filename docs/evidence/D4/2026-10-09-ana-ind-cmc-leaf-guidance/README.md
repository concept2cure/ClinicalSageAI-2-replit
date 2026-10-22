# Exact IND CMC leaf guidance — W3 / D4

Canonical branch: concept2cure-v2. Base: b879e9a9.
Source review: 2026-10-09. Backend authoring record only; no UI files edited.

## Delivered behavior

The existing canonical CTD overlay now contains exact authoring records for
three drug-substance identity leaves and nine pharmaceutical-development leaves.
Before this change, each of these requests inherited the broad S.1 or P.2
record. Now resolveRequirements and the actual AnA draftDocument gateway path
receive the requested leaf's own recorded content and report an exact match.
There is no parallel template registry, drafting engine, model or tool.

| Existing branch | Exact authoring leaves added |
|---|---|
| 3.2.S.1 | 3.2.S.1.1 Nomenclature; 3.2.S.1.2 Structure; 3.2.S.1.3 General Properties |
| 3.2.P.2.1 | 3.2.P.2.1.1 Drug Substance; 3.2.P.2.1.2 Excipients |
| 3.2.P.2.2 | 3.2.P.2.2.1 Formulation Development; 3.2.P.2.2.2 Overages; 3.2.P.2.2.3 Physicochemical and Biological Properties |
| 3.2.P.2 | 3.2.P.2.3 Manufacturing Process Development; 3.2.P.2.4 Container Closure System; 3.2.P.2.5 Microbiological Attributes; 3.2.P.2.6 Compatibility |

Two structural parents, P.2.1 and P.2.2, were added to the existing ICH heading
record so the new leaves have recognized parents. Those rows retain the existing
M4Q recall-basis convention; this batch does not add a new typed regulatory-basis
constant or upgrade every existing M4Q citation's confidence. The source review
below independently records the verified headings and current publication status.

All twelve authoring briefs preserve phase/modality uncertainty, source identities
and versions, missing evidence and completed-versus-planned work. Unsupported
identifiers, structures, values, overages, validation, suitability, sterility or
compatibility conclusions must not be invented. These instructions occur before
the specific content and survive the existing 900-character prose cap. The
record directs early IND drafting to available safety-relevant evidence, without
prescribing a complete marketing dossier.

The three S.1 identity leaves carry the existing IND/NDA/BLA necessity tags.
The nine P.2 leaves carry NDA/BLA tags and a false legacy initial-IND required
flag. They remain reachable by exact IND drafting and lifecycle prefix expansion.
Their applicability is unresolved until product/phase facts establish it; the
false initial flag does not waive content. No live readiness-rule profile or
completeness requirement set is changed by this delivery.

Every original overlay entry is unchanged. New entries sit beside their parent
groups, preserving the relative order of the original entries in the unsorted
guidance API. The specialized module-transcription helper and legacy nineteen-code
generation route are not expanded by this batch.

## Primary source review

| Source read on 2026-10-09 | Fact used |
|---|---|
| [FDA final M4Q, August 2001](https://www.fda.gov/media/71581/download), printed pp. 13–14, 21–23 | Verified numbering and subjects of all twelve leaves and the two parents. This organizes available quality information; it does not prescribe every study. |
| [FDA M4Q final-guidance page](https://www.fda.gov/regulatory-information/search-fda-guidance-documents/m4-ctd-quality) | FDA labels the August 2001 document final. |
| [21 CFR 312.23(a)(7)](https://www.ecfr.gov/current/title-21/chapter-I/subchapter-D/part-312/subpart-B/section-312.23) | IND CMC detail depends on phase, duration, dosage form and available information. Initial-phase detail differs from a final marketing dossier. |
| [FDA M4Q(R2), January 2026](https://www.fda.gov/regulatory-information/search-fda-guidance-documents/m4qr2-common-technical-document-registration-pharmaceuticals-human-use-quality) | The replacement is still draft and not for implementation. Its redesigned numbering is excluded from this delivery. |

The drafting instructions, source reconciliation tables, gap handling and
workflow safeguards are platform conventions inferred from these sources and
the governed authoring contract. They are not a claim that FDA prescribes each
suggested table or approves this template. Static source verification is not an
automatic guidance-update feed, or proof of disease/modality scientific expertise.

## Verification

Natural fail-first on the unmodified implementation: **26 failed, 1 passed** in
the new focused suite. The passing case preserved refusal to invent wholly
unindexed requirements; the failures exposed ancestor fallback instead of exact
leaf coverage and absent leaf-specific data limits. See focused-red.txt.

After the additive records: **27 passed** in the focused suite. Tests execute
the existing pure resolver and real draftDocument method with a gateway double,
checking each leaf's exact text, phase and missing-data limits, requirements-source metadata,
tenant/project request propagation and exclusion of draft M4Q(R2). This proves
wiring and recorded-content reachability, not live model performance qualification.

The bounded canonical CTD, record consistency, AnA prompt truth, requirement
snapshot, regional context and drafting regression selection passed **230 tests
across 10 files**. The first regression run found one expected maintenance
failure: S.1.1 was pinned as unmodeled by an older test. That expectation now
reflects its exact record, while QOS/A.1 still remain explicitly unchecked.

The requirements snapshot grows from 621 to 663 inputs. Forty-two inputs are new
leaf/container requests and their normalized/deeper forms. Eight existing hashes
change for Module 3, 3.2, P and S ancestor listings and their m-prefixed forms.
All unrelated original hashes remain pinned; see snapshot-changes.json.

Focused ESLint: zero errors, one existing authoring-guidance file-length warning.
The additional consistency-test lint and git diff --check pass. Build, full
pre-push and remote qualification belong to the coordinated delivery, not this
subtask receipt.

## Coverage denominator and remaining work

The reproducible inventory script from the prior IND audit now reports 127 exact
content records and 122 structural records, 249 total with no duplicate codes.
There are 203 terminal nodes: 103 with exact guidance and 100 structure-only.
Previously there were 193 terminal nodes, 93 exact and 100 structure-only. Twelve
new leaf records increase terminal exact coverage by ten because S.1 and P.2
become nonterminal parents. These are catalog counts across the encoded FDA
lifecycle, not an official initial-IND census or a qualification percentage.

Wholly unindexed section requirements remain explicitly unavailable. The existing
resolver intentionally permits unsupported deeper numbering to inherit a known
ancestor and labels it inherited rather than exact; this batch preserves that
contract and does not establish strict hierarchy validation. Scientific source
qualification, product applicability decisions, all therapeutic/modality
combinations, other structure-only leaves, regulatory currency and end-to-end
filing readiness remain open.
