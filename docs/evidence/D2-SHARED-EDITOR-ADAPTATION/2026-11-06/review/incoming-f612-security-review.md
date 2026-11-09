# Incoming f612 Quality integration review — 2026-11-06

Read-only review at merge `4b7798ea1f1a1eb3423f73e2b40d6e02171db14c`, incorporating canonical `f6127e72231bd9e9f302f596a672f58b1b40db15`. **The original incoming-tree native-stream blocker is resolved by the [later pinned source repair](native-stream-dispatch-security-review.md).** Reviewers ran no tests, compiler, browser, provider calls or git mutations.

The new native Quality context is admitted and appended to streaming messages at `stream.ts:1973`, but neither gateway request (`2552`, `3758`) supplies `beforeDispatch`. No wrapper or private token supplies it instead. The existing SDK guard consequently cannot repeat native actor/object/facts/disposition admission after later context, capacity or credential waits. Capture exact admitted native identity/digests and actual actor/project, then pass an exact reread/equality callback to both model calls; disappearing/superseded rows must refuse. A focused boundary regression is required.

Other reviewed paths retain native parent/project/object, current-fact, immutable digest and disposition checks. Authoring assembly already carries its manifest reread to the SDK guard. Saved Quality reports recheck exact retained parents and canonical run receipts; historical facts do not inherit current approval. No supported new ReportOS-to-artifact-registry writer was found: report runs/snapshots/dependencies and CRE native snapshots remain separate stores. The existing artifact intake still verifies its exact current registry/project/disposition/hash and creates a governed copy without inheriting approval/signature.

P100 leaves Quality project-door/QP3/mobile overflow and CMC/RBM/Biostatistics parity with their owners. The 45 component and 25 native selected pins have zero incoming intersections, but that does not qualify this new transitive source path. Prior gates and browser checks retain their own checkpoints.

[Exact incoming-source pins and limits](incoming-f612-security-review.json) retain 18 reviewed owners. Merge repair and current test/gate evidence belong to the lead and source owner.
