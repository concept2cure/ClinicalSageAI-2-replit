# Mutants — round 15, door 1

Each line below is a one-line break to the shipped code, the suite that must
then fail, and what happened. The raw first run is `mutants-run1.txt`; the two
entries it reported as survivors are resolved here, and the script is not
committed (it rewrites source files in place).

| id | the break | verdict |
|---|---|---|
| M1 | `recordMayVouch`: drop `qualified.length > 0` | KILLED — "a record naming NO model is not approval" |
| M2 | `recordMayVouch`: drop the per-entry `m.model !== null` | **SURVIVED, and the check was removed.** `approvedEntryFor` matches on provider AND model, so an entry with no model name has no registry entry and is already unqualified. The check could never fail: it read as a guard and tested nothing. The test now pins WHY (`approvedEntryFor` is undefined, `qualifyServedModels` reports `qualified: false`) instead of asserting a tautology. |
| M3 | `creditMachineClaims`: drop the turn-record-store guard | KILLED — "refuses every claim as unverifiable where there is no turn-record store" (42P01) |
| M4 | `creditMachineClaims`: pass no `mayVouch` | KILLED — "refuses a claim from an unadmitted record" |
| M5 | `machine-claim-verify`: apply `mayVouch` BEFORE the text check | KILLED — "refuses an unverifiable claim WITHOUT naming a model": the reason would become the model's, implying the words were AnA's |
| M6 | `machine-claim-verify`: let a refused record still join `vouching` | KILLED — "a record the rule refuses does not raise the duplicate cap" |
| M7 | router: contributors from the verdict without the `clausesInAcceptedText > 0` gate | KILLED — "a verified claim that credits no clause names nobody" |
| M8 | router: remove the 403 | KILLED — "refuses the save, names the model, and writes nothing" |
| M9 | `governedSaveRefusal`: drop the unnamed-model fallback | KILLED — "says a model is unnamed rather than leaving a gap where its name goes" |
| M10 | `machineClaimReport`: include the turn record id | KILLED — "the saver is told the reason and the length, never the record's internals" |
| M11 | the disclosure: drop `uncredited` | KILLED — "discloses a machine author that was claimed and not credited" |
| M12 | client: clear the claim store before the request again | KILLED — "a 409 collision does not cost it" |
| M13 | client: drop `machineTextNote` from the confirmation | KILLED — "says which passages became the saver's own words, and why". *(Reported SURVIVED on the first run because the `-t` filter named a phrase from the assertion rather than the test; re-run with the test's own name and it fails.)* |
| M14 | router: pass every claim to the lineage gate, not only the credited ones | **EQUIVALENT MUTANT.** Checked rather than assumed: the whole door suite still passes, because `recordOccurrences` independently caps an uncredited claim's clause at zero — nothing vouches for it. Removing BOTH mechanisms fails 4 cases. The two are redundant by design, and the filter is kept as the clearer statement of intent. |

Nothing is reported as covered that was not seen to fail on the case it exists
to catch.
