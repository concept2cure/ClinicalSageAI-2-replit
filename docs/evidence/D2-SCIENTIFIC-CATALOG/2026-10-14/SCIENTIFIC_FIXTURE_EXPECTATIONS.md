# Independent scientific source-context expectations

14 October 2026. Written before the scientific preview verifier is invoked. These are synthetic source-statement fixtures, not clinical datasets, original-page attestations, expert qualification, method validation or regulatory acceptance. The synthetic original-byte hash identifies the fixture input only; an application request still requires the server's actual Vault byte identity and extraction identity.

The expected outcomes below follow the published [contract](CONTRACT.md). `P` means transcription and a supported, unambiguous context both pass. `C` means exact transcription can pass but context must fail or remain not established; unsupported grammar must never become a pass. `T` means transcription/source binding fails. `N` means exact transcription may pass, while context remains not established because evidence or supported interpretation is absent. Every result remains `persisted:false`, `reviewState:not_recorded`, `scientificQualification:unassessed`.

| ID | Explicit source relationship / adverse candidate | Expected | Reason |
| --- | --- | --- | --- |
| SF01 | Study DPL-301 randomized total 300; candidate randomized total 300 | P | Exact supported clinical count frame, using the existing engine |
| SF02 | Same study randomized 300 and treated 292; candidate randomized 292 | C | A treated population cannot supply a randomized count |
| SF03 | Drug X and placebo randomized counts 150 and 145; candidate Drug X 145 | C | Arm identity cannot be exchanged |
| SF04 | Clinical candidate deliberately records an incomplete population frame | N | Missing clinical slots are not inferred |
| SF05 | Product P, API, batch L1, HPLC assay measured result 99.20% | P | Batch, material, method, property and measured-result role are explicit |
| SF06 | Batch L1/HPLC 99.20%; L2/titration 99.2%; candidate L1 anchored to L2 | C | Batch exchange is not justified by a similar number |
| SF07 | Same two batches; candidate HPLC anchored to titration | C | Method identity is part of the result |
| SF08 | Measured impurity 0.08%; limit <=0.10%; candidate measured 0.10% | T | Scalar cannot discard the bound/criterion marker |
| SF09 | Bound impurity limit <=0.10% with specification role | P | Bound and role are preserved without a pass/fail calculation |
| SF10 | Written assay 99.20%; candidate written 99.2% | T | Preview preserves the written value and trailing-zero precision |
| SF11 | Device D1 Rev A, firmware 1.2, method P-17 leakage measured 0.8 mL/min | P | Device/configuration/software/method/endpoint are stated |
| SF12 | Rev B firmware 1.3 leakage 1.1; candidate Rev A at Rev B value | C | Configuration exchange is forbidden |
| SF13 | Same result with candidate firmware 1.2 against source 1.3 | C | Software identity remains source-bound |
| SF14 | Measured burst 450 kPa; criterion minimum >=400 kPa; measured candidate 400 | T | An acceptance criterion cannot become a measured scalar |
| SF15 | Exact >=400 kPa acceptance-criterion candidate | P | No automatic device qualification is inferred |
| SF16 | Assay A sensitivity 95.0%, full analyte/specimen/reference/cutoff/population/denominator stated | P | Complete diagnostic result context |
| SF17 | Assay B sensitivity 99.2%; candidate Assay A at B value | C | Assay exchange must not pass |
| SF18 | Assay A plasma 92.0%; candidate serum at plasma value | C | Specimen is part of the diagnostic fact |
| SF19 | Assay A cutoff 0.8 sensitivity 90.0%; candidate cutoff 0.4 | C | Cutoff is part of the diagnostic fact |
| SF20 | Denominator 180 source; candidate denominator 200 | C | No denominator inference or reuse |
| SF21 | Reference standard R2 source; candidate standard R1 | C | Reference identity is material |
| SF22 | Symptomatic adults source; candidate asymptomatic adults | C | Population is material |
| SF23 | Positive agreement 95.0% versus comparison method PCR-X | P | Agreement remains agreement, not sensitivity |
| SF24 | Same comparator statement, candidate sensitivity/reference-standard basis | C | Comparator agreement cannot establish clinical sensitivity |
| SF25 | Minimal two-assay sentence has no analyte/specimen/cutoff/reference/population/denominator | N | A source label alone cannot complete mandatory context |
| SF26 | Assay A marker M, plasma, method EP17, LoD design, lot L1, LoD 0.2 ng/mL | P | Analytical matrix/method/design/lot/unit are explicit |
| SF27 | Lot L2 serum LoD 0.5; candidate lot L1/plasma | C | Analytical lot and matrix cannot be exchanged |
| SF28 | Within-laboratory CV 5.0%; candidate repeatability CV | C | Analytical design/property are distinct |
| SF29 | LoD written 2.0e-1 ng/mL; candidate 0.2 ng/mL | T | Numeric equivalence does not authorize rewriting source notation |
| SF30 | CMC source states a 10-20 um particle-size range | P | A range remains a range |
| SF31 | Same range, candidate scalar 10 um | T | A range endpoint cannot become a scalar result |
| SF32 | Source reports approximately 5.0%; candidate scalar 5.0% | T | Approximation cannot become an exact scalar |
| SF33 | Same approximation with approximate value kind | P | The approximation marker remains in the source-stated value |
| SF34 | All required context is a remote heading, while local result names no subject | N | Remote word co-occurrence is not a relation witness |
| SF35 | A large anchor covers two assays and values | N | A multi-subject quote is not an unambiguous relationship |
| SF36 | Japanese source / explicitly unsupported language-layout caveat | N | No claim of multilingual scientific parsing |
| SF37 | Low-confidence OCR has an exact textual number | N | Exact OCR text alone is not original scientific verification |
| SF38 | Wrong document UUID, byte hash, text hash, range or quote | T | Each source identity/anchor failure is independently tested |
| SF39 | Requested computed result with arithmetic metadata | T | Computation is unsupported; no model-derived number |
| SF40 | Body-supplied result/status/actor or unsupported locator | T | Candidate metadata cannot attest to the check or its original location |
| SF41 | Fully explicit ordinary narrative outside the initially admitted labelled row grammar | N | Source meaning is visible to a reader but not automatically established by this narrow parser |

The fixture module is `server/services/vault/__tests__/fixtures/scientific-source-facts.ts`; its test is separate from the verifier author's unit suite. Positive rows use explicit source relationships. Where the published supported grammar cannot interpret a positive narrative yet, the corpus keeps its intended expectation and records the limitation rather than changing the expected result to match implementation output.

Before verifier execution, the core owner froze the initial supported nonclinical form: exactly one line of explicit `Label: value` fields separated by semicolons. The corpus therefore encodes its nonclinical positive/adverse statements in that form, preserving every predeclared source value and semantic relationship. Numeric `asWritten` contains the exact number/marker and `unitAsWritten` the separate exact unit. Ordinary prose, remote headings and multirow anchors remain unsupported cases. This is a deliberate narrow parsing boundary, not broad narrative or table interpretation.

The first execution produced 41 passing and five failing requests. A diagnostic of the existing clinical engine identified a transport omission in SF01: its canonical randomized-total frame contains `population.allRandomized:true`. That annotation was added while keeping the predeclared study/population/arm/count and positive expectation unchanged. The scalar-stripped bound/range cases and Japanese-adjacent transcription failures remain substantive implementation findings; their expectations were not weakened. SF41 was added as an explicit narrow-grammar limitation before running that additional request.

An additional small held-out cohort is reserved for independent final review: ambiguous pronoun assignment, repeated identical values in separate assay rows, shifted decimal/sign/exponent substrings, absent software identity, and remote-label/header substitutions. Those expectations are also fixed before execution; their precise requests will be published with final independent evidence.
