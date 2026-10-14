# Actual-plan fixture type follow-up

The first full compiler run found two TS2769 errors in the new actual-plan tests: RoleOptions does not support `exact`. The two role queries already use literal string names, which match exactly by default. Removing those two unsupported properties preserves every selected label and assertion and changes no production behavior.

The current 22-case actual-plan fixture passed with zero skips in 5.10 seconds. Scoped lint has zero errors and warnings. The corrected full compiler passed with zero errors; all 10,451 recorded input files were stable during that run. Original compiler failure and prior 191-case UI proof remain separate; their source pins are not rewritten. Raw red and green logs are retained losslessly.
