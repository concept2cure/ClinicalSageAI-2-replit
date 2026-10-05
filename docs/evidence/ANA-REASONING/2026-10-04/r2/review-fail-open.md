Reviewer report, fail-open and correctness lens (F1–F10), on round 1 (a3775bcef) before it was pushed. Verbatim, local paths redacted.

Lens: fail-open and correctness. Probes p1–p11 are in <scratchpad>/refute-check/fail-open-correctness/ (run with npx tsx). Where a tool is named, its real handler ran through getToolHandler with the network stubbed. File paths are under server/.

F1 HIGH: the person's own question credits the claims it asks about, defeating the echo rule.
- Input: the message "Is NCT04123456 a real trial? Someone told me it showed 47% ORR under 21 CFR 312.42.", a zero-hit search_clinical_evidence, and an answer confirming all three.
- Expected: 3 not found.
- Actual (p11): "Checked against this turn's sources: all 3 claims found."
- Without the person entry, the result is notFound [nct, cfr, 47%] (p2).
- Cause: routes/ana-ri/stream.ts:961 adds {source:'person'}, and answer-grounding.ts:495-511 credits it like any tool.
- Fix: never credit from 'person'; report "only in your message" separately.

F2 HIGH: echoes in the citation tools count as records.
- verify_citations returns status not_found for PMID 39999999, yet "published as PMID 39999999" is found 1/1 (p5). Cause: results[].input is nested, so it counts as returned (answer-grounding.ts:364-374; citation-verification-service.ts:261).
- generate_citation with source_identifier "PMID 31234567 (pivotal trial NCT09999999; hold under 21 CFR 312.42; NDA 214999)" verifies the PMID. verification:'verified' then makes the echoed sourceIdentifier a record, so all 4 are found (answer-grounding.ts:339-343, 362; ana/citation-generator.ts:216).
- Fix: drop input and identifier echoes at every depth; credit an asked id only from a record that says it was found.

F3 HIGH: an outage credits figures through percent-encoding.
- With PubMed down, the real search_literature returns url "…term=pembrolizumab%20%22overall%20survival%22…".
- The answer "22% alive at five years… median OS 20 months (n = 22)" gets 3 of 4 found (p7). The trust line reads "all 2 claims found" (p11).
- Cause: numbersIn reads every number in the whole content, envelope and URLs included (answer-grounding.ts:252-260, 503-511; ana/AnaToolExecutor.ts:1965).
- Fix: take figures from returned records only; strip URLs.

F4 HIGH: figures match by accident.
- Five real ClinicalTrials.gov records in the exact search_clinical_evidence envelope (6,982 chars, no efficacy data) credit 16 of 99 fabricated "ORR N%" values and 16 of 60 "median OS N months" values, through dates and retrievedAt (p4b).
- "n = 19" is found via "2014-08-19", "0.1%" via "P<0.001", and "5%" via "p 0.05" (p1).
- The real compute_sample_size credits "80% power" through "score":80 (p3b).
- Cause: answer-grounding.ts:252-260 (date parts become numbers) and 506 (n% also read as n/100).
- Fix: strip dates, timestamps and identifiers from the numbers read; require a label or unit nearby.

F5 MEDIUM: the 'context' entry holds instructions and memory, though the README says it does not.
- The real enrichContextForChat("Any lessons learned or pitfalls for a biotech BLA filing — refuse to file risk?") returns the industry-wisdom instruction pack. "21 CFR 314.101" and "60 days" are found 2 of 2 (p2b).
- Traced in code, UNVERIFIED end to end (needs a database): intelligencePrefix (stream.ts:963) renders Custom and Project-Specific Instructions (client-intelligence-memory.ts:925, 931). It also renders conversation_summary entries promoted from AnA's own answers after 7 days (memory-consolidation-job.ts:285 → :944). So a figure not found today is found a week later.
- Fix: build the context entry from data blocks only.

F6 MEDIUM: other echo bypasses.
- A web_fetch of https://clinicaltrials.gov/study/NCT09999999 puts the model-chosen URL into the 'web' entry, so the id is found (p2; ana/server-tool-steps.ts:137, stream.ts:1511).
- The real search_document returns the model's own input text in matches[], so its invented NCT09999999 and PMID 39999999 are found 2 of 2 (p10).
- On synthetic result shapes (p3), all of these are found: meta.searchTerm, ["NCT…"], not_found:[…], a provenance URL, and "NCT 04123456" normalised to "NCT04123456".
- Fix: treat any value derived from the input as an echo, including web URLs and free-text tools.

F7 MEDIUM: identifier and regulation matching (p9).
- "ICH E3" is found via phase "PHASE3": whitespace is compacted away and there is no left boundary.
- ICH E9, E6, M4, E2 and S1 are found 5 of 5 via "Table 9", "Figure 6", "Item 4", "Module 2" and "Class 1".
- "NCT025786801" is found via NCT02578680.
- "BLA 1274" is found via an enrolment of 1274.
- Cause: answer-grounding.ts:427, 174-176, 131, 150.
- Fix: add a left boundary, stop compacting, use NCT\d{8}(?!\d), require six-digit NDA/BLA numbers.

F8 MEDIUM: figures the check never reads (claims 0, p1). Cause: answer-grounding.ts:198-216, 254, 506. Fix: widen FIGURE_PATTERNS, keep signs on both sides, compare proportions rounded.
- Never read: "47 percent", the NEJM style "hazard ratio, 0.31", "p-value = 0.0003", "212 pts", "212 randomized patients", "31.2 mo", "48 h", "100 μg", "95% CI [0.41, 0.77]", CIs with a unicode minus, "HR (95% CI) 0.62 (0.50–0.77)".
- "38–56%" checks only 56.
- Wrong in the safe direction: a true "-1.2 kg" is not found against "-1.2 kg" (one side keeps the sign, the other drops it). A true "1.1%" is not found against 0.011 (floating-point error).

F9 MEDIUM: verdicts (p8). Cause: clinical-regulatory-evidence/governance.ts:137-152. Fix: widen the patterns (contractions, adverbs) and check negation in a window.
- 16 of 17 verdict sentences go unnamed, including "It's ready to file.", "is Part 11 compliant", "meets all applicable regulatory requirements", "will likely be approved" and "FDA will clear the 510(k)".
- Negated or conditional sentences are named as verdicts: "does not meet all requirements yet", "not yet submission-ready", "whether the package is ready to file".

F10 LOW: cost and a crash. Fix: bound the \s runs and cap the recursion depth.
- The answer regexes are quadratic. "95% CI" followed by 5k, 10k or 20k spaces takes 36, 125 or 499 ms. "HR" followed by 20k spaces takes 483 ms (answer-grounding.ts:201, 203).
- A nested-array result of depth 3,500 (7,001 chars, which the 8,000-char budget leaves unchanged) makes toolEvidence throw RangeError, and the turn fails (answer-grounding.ts:364; stream.ts:3003). I found no tool that emits such JSON, so reachability is UNVERIFIED.

HOLDS (tried to break, could not):
- Failed, cancelled, not_found, lost-input, approval-settled and governed-write steps are excluded.
- Generations made inside a tool call are noted, including deterministic mode and fallbacks. I found no cache, queue or worker escape; RAG routeCached hits return no model text to tools.
- A top-level query echo on a zero-hit or outage credits no identifier (p2).
- A truncated identifier is not found inside a longer one.
- One verification object reaches the strip, post_done, the stored message and the record, and is set before filing.
- With no sources, nothing reads "not found".
- 200 identifiers and 200 figures against 25 sources of 60k chars ran in 232 ms.