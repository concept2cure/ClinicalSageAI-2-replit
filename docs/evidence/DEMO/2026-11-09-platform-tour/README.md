# The 1:00 pm PDT platform tour, walked on trunk with no model key (2026-11-09)

**Asked by:** the founder, for a demo to a prospective paying client today. The founder chose the platform tour,
run from the Codespace with no model key. **Walked at:** trunk `2b5361e4c7`, with the stack started as the Codespace
starts it:
- `NODE_ENV=development`, so launch scope is off;
- `deploy-migrate`;
- `demo:seed --pack all`.

## What was walked

`tour-b.cjs` and `tour-b.json`, at 1440 light. There are 16 stops; each records:
- a screenshot;
- API responses of 400 or above;
- console errors;
- visible error wording.

| Stop | Result |
|---|---|
| Home, Projects | pass |
| C2C-101 project page | pass |
| Module 2.5 Clinical Overview (6 of 6 sections drafted), section and Document view | pass |
| Vault, Submission Center (sequence 0000), CMC | pass |
| LMN-201 project, risk-based monitoring, Quality, Tasks | pass |
| NeuroPanel-Dx project and 510(k) Summary | pass |
| Reporting & analytics, Biostatistics | pass |

Every stop: 0 API failures, 0 console errors, no error wording.

- **With no model key, AnA answers:** "No AI provider is configured for this deployment, so AnA cannot answer. This
  is a server setting, not your connection." That is honest, but it is a dead end in a demo. The run of show avoids
  asking AnA, and avoids AnA's suggestion buttons and "Draft with AnA".

## Fixed for the demo (F1, red first)

The risk-based monitoring screens printed code to the reader:
- "buildAttentionFeed — ordered by severity — as of 2026-11-09T17:16:38.868Z";
- "rbm-engine — L x I banding";
- "(rbm-engine scoreRisk)";
- "scorePatientCohort — robust modified z-score — MIN_COHORT 5";
- "site-risk-engine";
- "monitoringTierFromRisk()";
- the framework code "ich_e6r3";
- raw ISO times.

They now name the method in words. The framework reads "ICH E6(R3)", and each time renders through the one timestamp
component (`GovernedTimestamp`).

- **Red at HEAD:** `red-at-head-rbm-attention-line.txt` and `red-at-head-rbm-engine-names.txt`.
- **Green:** the RBM suites pass, 7 files, 85 of 85. The new cases are in `rbmMethodsInWords.test.tsx`.
- **Walk:** `rbm-words.cjs` reads the five RBM tabs (Overview, Risk review report, RACT, Patient profiles, Site risk)
  in the running app. No identifier or raw ISO time remains.

## Seen, not changed (for after the demo)

- **The CMC demo project C2C-201 did not seed on this stack.** The error was `AMBIGUOUS_CLIENT_WORKSPACE`: the
  organisation has several client workspaces. A fresh Codespace has one, so C2C-201 should exist there.
- **The demo documents say they were seeded:** "seeded demonstration content … Not model-drafted — no AI provider is
  configured". This is honest; the founder knows the line is there.
- **Quality's figures still have uppercase labels** and a "WORKSTREAM" eyebrow. That is the Quality lane's D0 work.
