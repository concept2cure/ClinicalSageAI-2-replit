# Protected release setup runbook

**Repository:** `concept2cure/ClinicalSageAI-2-replit`  
**Protected/default branch:** `concept2cure-v2`  
**Required role:** repository Admin, or a custom role allowed to edit repository rules

This is the exact administrator handoff for WO-02. It must be run from an
authenticated environment. Never substitute workflow-file labels for names read
from live GitHub check runs. Do not merge or close pull requests, dismiss
reviews, delete branches, or change repository visibility while using it.

## Procedure

The operator needs repository **Admin** access (or a custom repository role
that includes editing repository rules) and an authenticated GitHub CLI token
with repository-administration access. For a private organization repository,
the token must also be authorized for the organization as applicable.

### 1. Capture current state without modifying it

Run the following commands and retain their JSON output as the WO-02 audit
record:

```bash
REPO=concept2cure/ClinicalSageAI-2-replit
BRANCH=concept2cure-v2

gh api "repos/$REPO" \
  --jq '{default_branch,allow_merge_commit,allow_squash_merge,allow_rebase_merge,allow_auto_merge,delete_branch_on_merge}'
gh api "repos/$REPO/rulesets"
gh api "repos/$REPO/branches/$BRANCH/protection" || true
gh api "repos/$REPO/actions/runs?branch=$BRANCH&per_page=20"
gh api -H 'Accept: application/vnd.github+json' \
  "repos/$REPO/commits/$BRANCH/check-runs?per_page=100" \
  --jq '.check_runs[] | [.name,.conclusion,.html_url] | @tsv'
gh api "repos/$REPO/pulls?state=all&base=$BRANCH&per_page=20" \
  --jq '.[] | [.number,.state,.html_url] | @tsv'
```

For each required category, select the exact context from a recent successful
run on `concept2cure-v2` or a representative pull request. Do not configure a
context that exists only as a workflow-file label, and do not select a matrix
prefix when GitHub reports expanded check-run names.

### 2. Resolve the repository-policy contradiction

The checked-in `AGENTS.md`, `CLAUDE.md`, and `.github/BRANCH_LOCK.md` prohibit
every branch other than `concept2cure-v2` and require direct commits to that
branch. GitHub cannot create a pull request whose head and base are the same
branch. Requiring pull requests therefore blocks all ordinary development
unless the repository's written single-branch policy is amended to permit
short-lived review heads (in-repository or fork-based) while keeping
`concept2cure-v2` as the sole product/release branch.

The repository owner must approve and record that policy decision before
turning on a pull-request requirement. WO-02 did not silently weaken either
policy.

### 3. Configure the protected product branch

First make the product branch the repository default if the read-only capture
showed a different value:

```bash
test "$(gh api "repos/$REPO" --jq .default_branch)" = "$BRANCH" || \
  gh api --method PATCH "repos/$REPO" -f default_branch="$BRANCH"
```

Create or update a repository ruleset targeting exactly
`refs/heads/concept2cure-v2`, set it to **Active**, and configure:

- **Restrict deletions:** enabled.
- **Block force pushes:** enabled (do not enable force pushes).
- **Require a pull request before merging:** enabled.
  - Required approvals: **1**.
  - Dismiss stale approvals when new commits are pushed: **enabled**.
  - Require approval of the most recent reviewable push by someone other than
    the pusher: **enabled**, if available for the repository plan.
  - Require conversation resolution before merging: **enabled**.
- **Require status checks before merging:** enabled.
  - Add the exact live contexts discovered in step 1 for CI/lint/typecheck,
    build/tests/integration, security contracts/scanning, blank-database
    provisioning and deploy migration, production boot under non-superuser RLS,
    and Tier 5 authenticated browser smoke.
  - Require branches to be up to date before merging: **enabled**, unless an
    enabled GitHub merge queue is the documented equivalent used for every
    merge.
- **Bypass:** no ordinary developer, write-role team, GitHub App, or broad
  organization role. Prefer no bypass actors. If GitHub requires an owner or
  administrator bypass, restrict it to a named emergency team, set bypass to
  pull requests only where supported, and document the actor IDs in the audit
  record.
- **Enforcement:** include administrators; do not allow administrators to opt
  out through legacy branch-protection settings.

Do not merge or close pull requests, dismiss reviews, delete branches, or
change repository visibility while applying this policy.

#### Copyable ruleset request

The following request avoids transcribing check names. Set `EVIDENCE_SHA` to a
commit from a recent representative pull request on which every required gate
ran, inspect the emitted table, and then build `CHECKS_JSON` by selecting the
exact names from that table. Abort if any required category is absent; first
repair or run the applicable workflow rather than inventing a context.

```bash
EVIDENCE_SHA='<representative pull-request head SHA>'
gh api -H 'Accept: application/vnd.github+json' \
  "repos/$REPO/commits/$EVIDENCE_SHA/check-runs?per_page=100" \
  > /tmp/c2c-check-runs.json
jq -r '.check_runs[] | [.name, .conclusion, .app.slug, .html_url] | @tsv' \
  /tmp/c2c-check-runs.json

# Copy only exact .name values from the table above. Every selected check must
# have conclusion "success" and collectively cover every WO-02 category.
CHECKS_JSON='[
  {"context":"<exact live lint check name>"},
  {"context":"<exact live typecheck check name>"},
  {"context":"<exact live build check name>"},
  {"context":"<exact live test check name>"},
  {"context":"<exact live integration check name>"},
  {"context":"<exact live security-contract check name>"},
  {"context":"<exact live security-scanning check name>"},
  {"context":"<exact live blank-DB/deploy-migration check name>"},
  {"context":"<exact live non-superuser-RLS production-boot check name>"},
  {"context":"<exact live Tier-5 authenticated-browser check name>"}
]'

jq -e --argjson checks "$CHECKS_JSON" \
  --slurpfile evidence /tmp/c2c-check-runs.json '
  ($checks | length) >= 10 and
  ([$checks[].context] | all(type == "string" and
    length > 0 and (startswith("<exact live ") | not))) and
  ($checks | all(.context as $required |
    any($evidence[0].check_runs[];
      .name == $required and .conclusion == "success")))
' >/dev/null

jq -n --argjson checks "$CHECKS_JSON" '{
  name: "concept2cure-v2 protected release governance",
  target: "branch",
  enforcement: "active",
  bypass_actors: [],
  conditions: {ref_name: {
    include: ["refs/heads/concept2cure-v2"], exclude: []
  }},
  rules: [
    {type: "deletion"},
    {type: "non_fast_forward"},
    {type: "pull_request", parameters: {
      allowed_merge_methods: ["squash", "merge", "rebase"],
      dismiss_stale_reviews_on_push: true,
      require_code_owner_review: false,
      require_last_push_approval: true,
      required_approving_review_count: 1,
      required_review_thread_resolution: true
    }},
    {type: "required_status_checks", parameters: {
      do_not_enforce_on_create: false,
      required_status_checks: $checks,
      strict_required_status_checks_policy: true
    }}
  ]
}' > /tmp/concept2cure-v2-ruleset.json

# Review the complete payload and exact contexts before the sole mutating call.
jq . /tmp/concept2cure-v2-ruleset.json
gh api --method POST "repos/$REPO/rulesets" \
  --input /tmp/concept2cure-v2-ruleset.json
```

If an applicable ruleset already exists, do **not** create an overlapping
second ruleset. Retrieve it, preserve any additional verified controls, update
the JSON above accordingly, and replace the final request with:

```bash
RULESET_ID='<existing applicable ruleset ID>'
gh api --method PUT "repos/$REPO/rulesets/$RULESET_ID" \
  --input /tmp/concept2cure-v2-ruleset.json
```

An empty `bypass_actors` array makes the ruleset apply to administrators as
well as ordinary developers. If an unavoidable enterprise owner or emergency
actor must be added, stop and record its actor type, numeric ID, bypass mode,
approver, expiry/review date, and break-glass ticket before changing the
payload.

### 4. Read back and prove enforcement

After saving, retrieve the ruleset by its numeric ID and retain the response:

```bash
gh api "repos/$REPO/rulesets"
RULESET_ID='<id returned above>'
gh api "repos/$REPO/rulesets/$RULESET_ID"
gh api "repos/$REPO/rules/branches/$BRANCH"
test "$(gh api "repos/$REPO" --jq .default_branch)" = "$BRANCH"
```

The audit reviewer must verify from the response: active enforcement; exact
branch target; one approval; stale-review dismissal; last-push approval (when
available); conversation resolution; every exact status-check context; strict
update or merge-queue equivalence; deletion restriction; force-push blocking;
administrator coverage; and the complete bypass actor list.

Use this programmatic read-back as a minimum assertion, followed by human
review of every returned check context against the evidence table:

```bash
gh api "repos/$REPO/rulesets/$RULESET_ID" > /tmp/ruleset-readback.json
jq -e '
  .enforcement == "active" and
  .target == "branch" and
  (.conditions.ref_name.include == ["refs/heads/concept2cure-v2"]) and
  (.bypass_actors | length == 0) and
  any(.rules[]; .type == "deletion") and
  any(.rules[]; .type == "non_fast_forward") and
  any(.rules[]; .type == "pull_request" and
    .parameters.required_approving_review_count == 1 and
    .parameters.dismiss_stale_reviews_on_push == true and
    .parameters.require_last_push_approval == true and
    .parameters.required_review_thread_resolution == true) and
  any(.rules[]; .type == "required_status_checks" and
    .parameters.strict_required_status_checks_policy == true and
    (.parameters.required_status_checks | length) >= 10)
' /tmp/ruleset-readback.json
```

Then open a non-release sample pull request under the newly approved branch
model, confirm that GitHub blocks merge before approval/check completion and
after a stale approval, and record both the pull-request URL and the ruleset
URL:

- `https://github.com/concept2cure/ClinicalSageAI-2-replit/settings/rules`
- `https://github.com/concept2cure/ClinicalSageAI-2-replit/settings/branches`

No sample pull-request link is recorded here because this inspection could not
authenticate to GitHub and was prohibited from inventing one.
