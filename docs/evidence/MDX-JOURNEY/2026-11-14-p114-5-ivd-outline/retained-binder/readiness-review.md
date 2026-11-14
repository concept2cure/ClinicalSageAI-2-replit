# Applicability is not a recorded release decision

Read-only source review, before the final mapper disposition. No production changes by this reviewer.

## What already exists

The mapper already distinguishes `required`, `undetermined` and `when-applicable`. Its existing convention does not make `when-applicable` a filing blocker. The raw FDA IVD form has a real no-contact answer and modification branches. The product's seven intake flags do not record those exact answers, and no explicit biocompatibility applicability receipt was found in this path.

The proposed change made IVD biocompatibility `when-applicable`, where the previous mapper always required a substantive section. That is a readiness-policy change, not only a more accurate form label.

## Source trace

- `server/services/pathway-engines/estar/estar-mapper.ts`, `mapToEstar`: collects absent `when-applicable` slots into `summary.checkApplicability`. `summary.ready` depends only on `missingRequired`, `undetermined` and contradictions. Its comment explicitly states that `when-applicable` does not block.
- `server/services/pathway-engines/estar/estar-filing-readiness.ts`, `assessContent`: passes only missing-required plus undetermined IDs into `normalize`. It drops `checkApplicability`. `assessEstarFilingReadiness` derives `contentReady` and `canFileNow` from this boolean; no human applicability receipt is consulted.
- `client/src/concept2cure/mdx/surfaces/EstarFilingPanel.tsx`, `ReadinessCard`: displays “Can file now” and “Content complete” from these results. It does not show the dropped applicability questions.
- The earlier proposed `ivd-mapper-outline-completion.test.ts` asserted `summary.ready === true` with the analytical/admin/labeling/SE fixture while biocompatibility had neither content nor an applicability answer. That test exposed the new permission; it was not evidence of a retained human review.
- `server/routes/510k-estar-routes.ts`, tracked submission PATCH: signing authority, reauthentication and retained artifact are checked. `server/services/pathway-engines/estar/estar-submission-service.ts`, `advanceEstarSubmission` / `applySignedFiling`: writes a signature bound to the retained artifact hash. These functions do not read the mapper's applicability questions. Recording a filing made outside the platform is not an implicit technical completeness review.

## Recommendation

Keep biocompatibility as a blocking content section for this bounded change until an explicit human applicability determination can be retained and checked. The section can contain the accountable reviewer's source-based no-contact justification where appropriate; requiring that record does not assert that every IVD needs a biocompatibility test. Keep accurate raw-form guidance, and do not infer no contact from unrelated intake flags or IVD classification.

The root accepted the finding and directed both implementation owners to preserve the always-required biocompatibility content gate and E1 mandatory flag. The actual no-contact form branch remains guidance; it is not a platform-held applicability approval. Final corrected qualification is still required.

`unsafe-intermediate/` preserves the passing test/cohort reports and exact source snapshots that produced the unsafe conclusion. The mapper snapshot matches the qualified five-file cohort SHA `5d9a332b5933a865c07d4d97f54c910b3af591f3598acad3053f17d4621bff1d`; the earlier single-file run's different `32f2441c…` hash is preserved as that run's pin, not misrepresented as this snapshot. The new test snapshot matches both runs and contains the earlier `ready === true` assertion with no biocompatibility content. A passing intermediate check does not make that behavior acceptable; these reports are explicitly rejected historical evidence.

Final source review: the corrected mapper no longer changes biocompatibility necessity. It inherits the original always-required slot; both the migrated IVD tree and shared blueprint mark E1 mandatory and explain the accountable applicability/evidence record. The final 18-path source freeze in this directory includes the corrected mapper, both content projections and the raw-form reader/PDF. The mapper worker owns the corrected readiness regression tests. This finding is closed for the bounded change.

No global `when-applicable` policy or signing gate is changed by this packet. Full release-readiness redesign is outside this retained-binder test scope.
