# g-arithmetic-followups — facts relied on

Step: follow-ups F13–F16 on dacbc67b (the within-document arithmetic check in
`server/services/ana/dossierReconciliation.ts` `checkFigureArithmetic`, surfaced
through `terminology-consistency.ts` and `writing-precision-gate.ts`).

No regulator text is relied on for this change. It changes how the platform
reads its own users' prose, not a regulatory requirement. The facts below are
conventions of writing. Each is labelled with its basis.

| # | Fact | Basis | Where it is used |
|---|------|-------|------------------|
| 1 | Many European languages write the decimal sign as a comma ("4,6 %" means 4.6 percent). EU product information is translated into those languages, and AnA drafts may be written in them. | **Recall** (general typographic convention; ISO 80000-1 allows either a comma or a point as the decimal sign). Not checked against regulator text. | `PCT` reads `\d+[.,]\d+` as a decimal; `percentOf` converts the comma to a point and takes the precision from the digits after it. |
| 2 | A percentage computed from n/N with n ≤ N cannot exceed 100, so "4,6 %" next to an n/N is never 46 % or 4,600 %. | Arithmetic. | Why the comma in a percentage is read as a decimal and never as a thousands separator. |
| 3 | Protocol amendments and document versions are commonly numbered "amendment 3/4", "version 2/3" and "v2/3" in clinical prose. Such a number is a revision identifier, not a count over a denominator. | **Recall** (common usage). Not regulator text. | `VERSION_BEFORE` / `notACount`: an n/N preceded by version, ver, amendment, amend, amdt, revision, rev or edition (with an optional "No."/"#"), or by a bare "v" touching the number ("v2/3"), is not recomputed. A spaced "v" ("10/20 (50%) v 3/4 (75%)") means versus, and "release" names a formulation ("extended release"), so neither suppresses the check (fix round 1). |
| 4 | An arm list can be checked against a total only when the text says the list is of that total. Wording such as "but only those who took study drug are shown" moves to another population, and there are too many such phrasings to list. | Reasoning about the check, from review finding F15. | `SAME_POPULATION_BRIDGE` is an allow-list: an empty bridge, "in/into/across/to/between/among the study/trial/arms/groups/cohorts" (optionally "equally"/"randomly"; determiners the/this/both/all/two/three/four, not "each"), "as follows", or "and (were) included/analysed in the FAS / full analysis set / ITT / mITT / intent-to-treat population / safety set". It replaces the deny-list `POPULATION_BRIDGE`. |

What is unchanged:

- The precision rule for percentages: |x − 100·n/N| ≤ 0.5·10^-d, with d the number of decimals stated. For FDA's AR-labeling rounding note, see dacbc67b.
- The month/year rule.
- The item deny-list `POPULATION_ITEM`. It applies to the items inside the parenthesis, not to the bridge.

Known limits, stated rather than hidden:

- A count that uses a point as the thousands separator ("1.234/2.468", the European form) is still not read as n/N. It produces no finding and no check.
- A bridge outside the allow-list ("612 subjects were randomized at the study's sites (…)") is now not summed. This is deliberate: when the check cannot tell whether the population is the same, it reports nothing rather than a false high-severity verdict.
- Per-arm wording ("150 subjects were randomized to each arm (…)", "… in each group (…)") states a count per arm, not the total. "each" is therefore not an allowed determiner in `SAME_POPULATION_BRIDGE` (fix round 1), and such a list is not summed. A per-arm count is not checked against its list at all; the check reports nothing rather than a false high-severity arm_sum.
- "v" and "release": an n/N after a bare "v" that touches the number ("v2/3") is treated as a version and not checked, so a "versus" written without a space ("Drug X 10/20 (50%) v3/4 (75%)") loses its second pair silently. "release" is not a version word, so a true release number written "release 2/3 (25%)" is recomputed as n/N.
- Oncology toxicity grades ("Grade 3/4 (12%)") are still read as n/N and give a false high-severity percent_of (stated 12, recomputed 75). This was already wrong before this step and is the same class as the version rule; the follow-up is to add "grade(s)" to the not-a-count prefixes in a later step. Not changed here.
