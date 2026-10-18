# PM-02: milestone preservation contract

This D2 Projects repair builds on the local PM-01 atomic-generation candidate.
It adds no schema, provider, dependency or project screen.

- Serialize regeneration by locking the same-organization parent project before reading the old plan and locking its schedule milestones. All reads, writes and the returned view remain on PM-01's checked-out transaction client.
- Match existing milestones by a unique, nonempty key, the same canonical pathway/framework, and unchanged title, description, category, regulatory basis and dependency set. Planned dates and generated narrative are not requirement identity.
- Update matching rows in place. Keep IDs and all non-planning columns, including status, creation time, actual dates, assignments and task foreign-key references. Keep existing metadata, progress, completion time and notes without normalization or fabricated values.
- Completed rows remain unchanged, including their historical planned dates. For other matching rows, update only the due date and generated planning narrative; retain the original baseline and actual state. New milestones start as new, uncompleted work.
- Refuse removed milestones, changed pathways/requirements, duplicate or missing keys, and orphan schedule rows without a plan. A conflict changes no plan, milestone, goal or revision and tells the caller that explicit review is needed. Retirement and semantic migration are outside this slice.
- Append the complete previous plan and milestone rows, the generated proposal, version transition and preservation decisions to the existing revision detail. Existing revision rows are not edited. Optional caller-supplied reason is trimmed and stored; an absent or blank reason is null and is never synthesized as a human justification or approval.
- Preserve existing API responses on success. The existing generation route returns an actionable 409 for a preservation conflict. No automatic retry, approval, retirement or cross-pathway completion transfer is added.

This does not establish general serialization with amendment, goal reset or the background sweep, nor a baseline approval workflow. Evidence here qualifies only the exercised local paths.
