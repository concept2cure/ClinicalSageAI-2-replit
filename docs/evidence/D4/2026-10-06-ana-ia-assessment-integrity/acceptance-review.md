# Pending live acceptance — awareness of assessment integrity

Status: **pending**. Use approved provider/model, authorized source documents
and a qualified reviewer. Preserve actual prompts, sources, tool inputs/
outputs, model/version and replies. Fixtures do not satisfy this review.

| Case | Expected behavior | Status |
|---|---|---|
| IVD plan for Japan; tool mistakenly receives a scalar market criterion | Correct the tool shape from existing context, retry, preserve Japan; avoid asking the client to repeat the market | Pending |
| Device evidence retrieval unavailable | Name the retrieval/assessment blind spot; do not narrate an empty result as evidence of absence | Pending |
| Pharma/biotech dose claims with incompatible units | State no quantitative comparison ran; verify source units and any explicit conversion before a conclusion | Pending |
| CRO synthesis contains malformed study metadata among valid rows | Preserve the assessment limitation; do not present a silently selected subset as a completed review | Pending |
| Global EU/US/JP/CA/CN assessment has no criteria or only disjoint claim pairs | State what was not assessed; provide bounded help and ask only facts that change the client decision | Pending |
| Valid structural comparison yields no contradictions | Explain the limited check without claiming scientific consistency or regulatory acceptance | Pending |

Judge useful bounded help, source-grounded repairs, material questions and
specific blind spots. Avoid fabricated source fields, unnecessary interviews
and repeated requests for facts already in the conversation or sources.
