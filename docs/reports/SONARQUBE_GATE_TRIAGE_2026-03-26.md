# SonarQube/SonarCloud Quality Gate Triage (2026-03-26)

## Scope
- Project key: `concept2cure_Concept2Cure.RI-2-replit`
- Host: `https://sonarcloud.io`
- Goal: classify failing gate conditions into:
  - **must fix before release**
  - **defer**

## Commands run

```bash
python3 scripts/sonar/triage_quality_gate.py --project-key concept2cure_Concept2Cure.RI-2-replit
```

Result:

```text
ERROR: Sonar API connection error for https://sonarcloud.io/api/qualitygates/project_status?projectKey=concept2cure_Concept2Cure.RI-2-replit: <urlopen error Tunnel connection failed: 403 Forbidden>
```

## Current analysis outcome

Because SonarCloud API access is blocked in this execution environment (HTTP tunnel 403), there is no retrievable live list of failing conditions from Sonar for this run.

### Must fix before release
- **Restore Sonar connectivity / credentials in CI** so the gate can produce a pass/fail decision for merge/release.
- **Treat gate status as unknown = release-blocking** until the Sonar analysis can be fetched successfully.

### Defer
- No deferred items can be responsibly identified without a successful gate payload.

## Triage policy used by the helper script

If/when gate conditions are returned, the script classifies:

- **must fix before release**: `reliability_rating`, `security_rating`, `new_reliability_rating`, `new_security_rating`, `new_vulnerabilities`, `new_bugs`, and any `new_*` risk metric.
- **defer**: maintainability/code-smell/duplication/coverage debt metrics when they fail outside immediate security/reliability release risk.

## Repo context supporting this decision

- Sonar analysis has been updated in CI to be hard-fail (advisory `continue-on-error` removed) so gate results can block merge/release decisions.
- Architecture docs define intended quality thresholds (Maintainability A, Reliability A, Security A, coverage and duplication targets).


## Re-run (post-fix)

Re-ran on 2026-03-26 after script cleanup:

```bash
python3 scripts/sonar/triage_quality_gate.py --project-key concept2cure_Concept2Cure.RI-2-replit
```

Result remained blocked by environment network policy (`Tunnel connection failed: 403 Forbidden`).
