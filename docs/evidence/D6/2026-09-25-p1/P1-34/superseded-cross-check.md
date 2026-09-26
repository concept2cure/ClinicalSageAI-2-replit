# P1-34 cross-check: the withdrawn registry against the register that landed (aa4d5552)

Their register (`tool-authorization.register.json`): 763 tools — 1 command, 21 conditional, 159 confirm, 552 read, 16 refuse, 14 self.
The withdrawn `propose-only-tools.ts` (this lane, same day, superseded): 46 proposals (7 reason tier), 23 refusals, 12 read-only exclusions.

Disagreements, handed to the lane that owns the register (session_01471vSK…; the file is inside its 24-hour window). Each is a judgment call the owning lane decides; the ones marked "I refuse" are acts this lane read as a person's own (attestation, determination, vote, approval class), which a chat confirmation cannot supply under 21 CFR 11.200:

| Disagreement | Tool |
|---|---|
| I refuse (a person's own act), they confirm | `approve_import` |
| I refuse (a person's own act), they conditional | `qms_change_transition` |
| I refuse (a person's own act), they confirm | `retire_qms_document` |
| I refuse (a person's own act), they conditional | `screen_subaward` |
| I refuse (a person's own act), they confirm | `set_coverage_qualifying_determination` |
| I refuse (a person's own act), they confirm | `submit_invention_disclosure` |
| I refuse (a person's own act), they (absent) | `when` |
| I exclude as read-only, they confirm | `package_ectd_for_region` |
| I exclude as read-only, they confirm | `run_in_container` |
| I exclude as read-only, they confirm | `run_python_script` |
| I exclude as read-only, they confirm | `run_shadow_review` |
| I exclude as read-only, they confirm | `start_deep_investigation` |

Also for that lane: `retire_qms_document` is `confirm` in the register while the HTTP door (P1-29, same day) requires the electronic signature; a chat confirmation with a reason is weaker than the door beside it (DP-32 stays partial until the AnA door refuses or signs).
