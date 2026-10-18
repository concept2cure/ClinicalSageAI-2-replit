# Held-out scientific preview expectations

14 October 2026. The exact requests in `server/services/vault/__tests__/fixtures/scientific-source-facts-heldout.ts` were authored after the shared supported grammar was frozen and before invoking each request. They are independent from the core author's implementation/test suite. They are synthetic adversarial fixtures, not a domain-expert reviewed cohort or deployment qualification. The first run contained 17 requests. Four additional source-stated optional-qualifier variants were defined before their first execution, giving 21 requests.

The expected outcomes are fixed in the fixture source: repeated equal numbers cannot exchange assay/configuration (SFH01–02); unrecorded software, duplicate subjects, remote/clipped context and extra unknown qualifiers cannot establish context (SFH03–07); signs, exponents, range endpoints and integer/decimal changes must refuse transcription (SFH08–11); clipping bound markers or units must refuse binding (SFH12–13); each witness and the actual source text must bind its exact hashes (SFH14–15); unsupported semantic paths are invalid schema (SFH16). SFH04 explicitly tests a longer restricted population containing the shorter candidate population as a substring.

SFH17, independently requested by the lead before execution, places an earlier scalar `Cutoff: 0.1` in the same row as the named `Sensitivity: <=0.1 %`. The first occurrence cannot make the bounded result an exact scalar. Transcription must refuse, regardless of the additional context mismatch diagnostic.

SFH18–21 keep source-stated instrument, reagent version, analytical lot and device test condition but omit them from the candidate. Each must remain context not established, exercising the general omission rule across families rather than a software-only exception.

SFH22 was defined before its first execution: two clinical studies state the same randomized count. The candidate's complete DPL-301 frame exists remotely in the full document, while its exact value/witness anchor names DPL-302. Full-document parsing must not let the remote matching frame establish the local statement. The held-out corpus now contains 22 requests.

SFH23 is a positive counterpart defined before its first execution: `Cutoff: <=0.1; Sensitivity: 0.1 %`. The candidate exactly preserves the bounded cutoff as context and the exact sensitivity scalar as value. An unrelated contextual bound must not change the named result's written kind. This exercises correct property binding in both directions, rather than making the scalar guard reject every repeated number. The final held-out corpus contains 23 requests.

Every returned diagnostic stays read-only, not recorded and scientifically unassessed. This corpus tests source-statement binding only. No arithmetic, human acceptance, clinical validity, device qualification or agency filing verdict is inferred.
