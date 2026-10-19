# Protocol signature facts and read qualification

Status: bounded read-only increment on `concept2cure-v2`, following the completed current-authority and resource-permission signing corrections. The earlier pre-reservation role-authority finding is superseded by those corrections and their separate evidence.

A matching signed-content digest establishes a content match. It does not establish the signer's independence or author claim at signing time. The reader must retain the original signer/name, signing time, declared meaning, reason, on-behalf-of identity, signature row/hash and content-binding basis/digest without retrospectively repairing or endorsing the historical record.

The existing signature-bearing facet receives an optional `qualification` for compatibility with older clients. Actual server reads populate four separate facts:

- `contentBinding`: `matches`, `changed` or `unverified`.
- `historicalSigningPolicy`: always `unassessed` in this increment, with a meaning-specific unknown-evidence reason.
- `currentContentQualification`: `unassessed` for matching content; `held` for changed, revoked or unverified binding, retaining the specific hold reason.
- `signatureReference`: the retained signature/signer identifiers, signature hash, binding basis and stored signed-content digest.

No positive assurance state, assurance schema, signature writer, qualification-review writer, data migration or historical repair route is introduced. Current live authorship, `is_valid`, signing dates, deployment cutoffs and caller-shaped metadata cannot manufacture signing-time assurance. Existing current-authority checks remain signing controls; their deployment alone cannot reconstruct evidence absent from the retained signature.

The declared meaning remains a historical fact. Authorship displays “Signing-time authorship-check evidence not recorded.” Approval, Review and Responsibility display “Signing-time independence evidence not recorded.” An unknown meaning retains its stored wording and displays “Signing-time policy-check evidence not recorded.” Every case separately states “Independent approval not verified from this signature record.” Authorship never becomes independent approval, and Review/Responsibility never become an approval declaration.

The workspace uses its existing `pde-review-meta` treatment and shared timestamp. Markdown keeps the signature manifestation and qualification before the protocol body; existing PDF/DOCX conversion requests receive that exact Markdown. Older signature-bearing DTOs get the same unassessed fallback, and arbitrary qualification metadata cannot grant a positive claim. `contentOnly` authoring imports omit status, signature and qualification prose without changing protocol content.

The finalized lifecycle and matching historical signature remain reachable from the existing workspace and Export drawer. Matching content retains the existing `signed` facet and export acceptance while carrying explicit unassessed qualification. Changed, revoked, missing or unreadable binding retains the existing controlled-export holds and named 409/503 errors. Signature absence remains `none`; unreadable stores remain `unavailable`, never fabricated unsigned or empty records.

Bounded verification must demonstrate actual contract failures before applying the read change, then preserve matching, changed and missing/contradictory binding behavior; exact retained fields/hashes; live-author changes; unrecognized hash-consistent metadata; distinct meanings; all three Export drawer formats; and `contentOnly` exclusions. Adversarial PGlite fixture construction occurs before each retained-read baseline and supplies no production repair capability. UI PDF/DOCX tests prove reachability, Markdown forwarding and Blob download, not rendered binary contents. Native historical preservation and final whole-repository validation remain separate checks. No clinical/scientific, agency or production qualification is inferred from these tests.
