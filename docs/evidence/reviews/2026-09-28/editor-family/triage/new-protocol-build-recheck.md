# Protocol-build review: re-check at `1f5c009b`

This is a read-only re-check of `new-protocol-build.md`, which was found at
`3c87da01`. It was run on 2026-09-28 at about 23:00 UTC, after the protocol
build lane (`…01M8bGFS`) landed its evening fixes. It is filed as returned.

- The agent re-ran each original probe against HEAD with `npx tsx`.
- The lane's 8 engine suites pass at HEAD, 219 of 219, and
  `ana-launch-scope.test.ts` passes 7 of 7.
- Nothing in the repository was edited.

**Summary.** 2 fixed, 4 partly fixed, 7 still open, and 3 new defects in
PB-1's class.

| id | status at HEAD | evidence | what remains |
|---|---|---|---|
| PB-1 | **PARTLY** | **Fixed:**<br>• Interim OC: at most 10 analyses (`85d7ce56`, `interim-oc.ts:73,168-170`). K=11 or 10000 gives `partial` in 1 ms; K=10 takes 0.9 s.<br>• BOIN: the table is capped at n=200 (`MAX_TABLE_N`) and elimination is found by bisection (`85d7ce56`, `dose-escalation.ts:60,279-308`). maxSampleSize 1e9 gives 200 rows in 2 ms.<br>• Enrollment: a work budget (`f4833a2d`, `enrollment-projection.ts:61,158-160,234`). 20000 × 50 sites went from 12 s to 1.0 s.<br>• MMRM: visits are capped at 100 on `/planning` only (`7f0ff2b2`, `planning-inputs.ts:49,146,151`). | **Multiplicity:** no family limit anywhere (`multiplicity-check.ts:357-369`; `study-design.ts:107` endpoints has no `.max`). Textbook Holm with 3000 endpoints takes 20.5 s.<br>**Multiplicity, NEW regression from `1ccf2f11`:** the recorded allocation runs `graphicalReject`, which copies the m×m matrix on every simulation (`multiplicity-check.ts:291-294`, `stats/multiplicity.ts:126`). 400 endpoints take 7.6 s; 800 take 30.1 s.<br>**MMRM:** no engine cap (`mmrm-sizing.ts:129` checks only visits ≥ 1). visits=400 takes 22.4 s, through POST `/mmrm`, `/persist` then GET `/:id/mmrm`, or AnA `review_mmrm_sizing`.<br>**Enrollment:** the budget ignores the fixed per-arrival cost. 100000 patients at 1 site (a 176-byte body) takes 17.0 s, where the comment says 1–2 s.<br>**AnA:** `industryRead` holds a pooled connection in an open transaction for the whole computation (`AnaToolExecutor.ts:20854-20869`). |
| PB-2 | **PARTLY** (substance fixed) | `1ccf2f11`:<br>• an allocation summing above alpha is a gap and is not simulated (`multiplicity-check.ts:252-254,304,351-352`);<br>• a valid allocation is simulated as recorded (`:282-300`);<br>• unequal Hochberg weights are a gap.<br>Probe: Holm 0.05 + 0.05 gives `partial` with an "allocation totals 0.1" gap and `procedure` null. | Wording only: `controlled` is weak control under the global null with independent p-values. The screen prints "controlled at alpha" (`ProtocolDevPlanningProjections.ts:222`). |
| PB-3 | **FIXED** | `1ccf2f11`: the conflict element is always stated false, with the fixed-τ² reason (`external-control-plan.ts:153-165`). The tool description and the AnA note agree. | — |
| PB-4 | **PARTLY** | `7f0ff2b2`:<br>• duplicate visit or activity ids are gapped, excluded from the totals, and make the totals lower bounds (`biospecimen-profile.ts:231-236`);<br>• a repeated cell counts once;<br>• frequency counts performed draws only. | Case (a): a pk/pd/biomarker activity with no specimen still does not make the totals lower bounds (`:223`, `:322-331`). Probe A: 20 mL, not a lower bound, the 550 mL reference "within". |
| PB-5 | **OPEN** | No commit touched the pane or the service. No client code calls `/documents/:id/redline`, `/deviations/trends` or `/documents/:id/spirit`. | All of it, including `README.md:34-36` and the service header claim. |
| PB-6 | **OPEN** | `ProtocolDevProjections.tsx:281-290` has no request token. | All of it. |
| PB-7 | **OPEN** | The `/planning` payload is still `{studyId, block, cleared}` (`study-design-planning.ts:71-82`). `7f0ff2b2` added `expected` and a 409 `STALE_BLOCK`, but the before-value is compared, not stored. `/persist` is unchanged. | Before and after values in the payload; the prior `metadata.design` for `/persist`. |
| PB-8 | **OPEN** | `readBoundDesign` selects only `study_design_id` (`protocol-industry-service.ts:80-109`). Neither `/planning` nor `/persist` checks for a finalized binding. | All of it. |
| PB-9 | **FIXED** | `759049b5` (`…01KiDof7`) adds the 16 names to `inScope`; the test passes 7 of 7. | An unclassified name is still allowed by default, but the test now catches any new one. |
| PB-10 | **OPEN** | The screen note still says "a default seed from the category table" (`ProtocolDevIndustryProjections.ts:106-108`). `ratingFrom` is not printed. | All of it. |
| PB-11 | **PARTLY** | Futility is fixed by `85d7ce56`: type I error is non-binding, and the binding figure is reported separately. The screen label is fixed by `0703a969`. | "Every engine is pure: no model, no clock, no RNG" (`protocol-industry-tool-defs.ts:9-10`). |
| PB-12 | **OPEN** | §0 has no row for the lane. | A row naming the D-row, and where the Rule 2 exception is recorded. |
| PB-13 | **OPEN** | The keys are unchanged (`ProtocolDevIndustryProjections.ts:46,53`; `ProtocolDevPlanningProjections.ts:280`; `ProtocolDevProjections.tsx:214,252`). | All of it. Duplicate activity ids are now listed, so the collision is reachable. |
