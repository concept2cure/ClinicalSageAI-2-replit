# Package-spine sweep — the method, as run

The sweep's verifiers and the two lenses still owed were run as multi-agent
workflow scripts that lived only in a session's scratch store. They are kept
here verbatim so the method is on the branch and the owed work can be run as-is
by any session (paste a script into the Workflow tool; pass `args` as shown).

- **Verifier** — one adversarial skeptic per finding, told to refute it:
  reproduce at HEAD with a probe on PGlite, the real route and the real
  packager; test the spec claim with an honest confidence; check scope; give
  the smallest fix and its blast radius. Every finding F00–F19 went through it
  (rounds 1–3); the returns are in [`VERDICTS.md`](VERDICTS.md). Invoked with
  `args: { findings: [{ id, title, severity, files, claim, reproduction, fixSketch }, …] }`.
- **Owed lenses** — validation parity and honest state never ran (both finders
  were cut off by usage limits on 2026-09-25/26), and F20 is unverified. The
  script runs both finders and the F20 verifier, then one skeptic per new
  finding. It was started on 2026-10-01 and stopped before it produced
  anything, when the session was asked to leave nothing outside the branch.
  **Not yet run.** No `args`.

The fixes themselves were built from [`PLANS.md`](PLANS.md) and the verdicts;
the build instructions given to implementing agents are realized in the
commits the README names, so they are not repeated here.

## The verifier

```js
export const meta = {
  name: 'package-spine-verify-inline',
  description: 'Adversarially verify D7 package-spine findings passed inline: reproduce at HEAD, test the spec claim, check scope, give the smallest fix',
  phases: [{ title: 'Verify', detail: 'one adversarial verifier per finding in args.findings' }],
}

const CONTEXT = `
You are verifying ONE finding from an adversarial sweep of the "package-model spine" of an eCTD publishing product (repo root = cwd):
  POST /api/submission-ops/packages/:id/assemble (server/routes/submission-ops.ts) -> leaf-pdf.ts, section-to-ctd.ts,
  package-sequence-lifecycle.ts -> lifecycle-operator.ts, package-leaf-bytes.ts -> submission-gateways/regional-packager.ts
  (+ ectd-packager/*), controlled-vocab/*; transmit: server/routes/mdx-submission-gateway.ts -> submission-gateways/governed-transmit.ts,
  recordFiledSequence (server/services/ectd/package-content-change.ts), fda-esg.ts, as2-transport.ts.
The packager, operator, vocab and transmit guard are SHARED with a second spine (sequence spine / ectd-compile / package-from-core) owned by the IND demo lane (session 01TtwRHm), which fixed modified-file = backbone#leafId on 2026-09-29 (commit 09c4c15d).
Template for a probe that needs the real route + real packager + real SQL: tests/submission-ops-package-spine.pglite.e2e.test.ts (and server/services/ectd/__tests__/stand-in-ghostscript.harness.ts for the production PDF/A toolchain).
The finding list is also recorded in docs/evidence/W5/2026-09-30-package-spine-sweep/README.md.

YOUR JOB — try to REFUTE the finding, in three steps:
1. REPRODUCE AT HEAD by running code. Write a probe under tests/zz-probes/verify-<finding id lowercased>/ (*.probe.test.ts), run it with npx vitest run <file>, quote the observed output. Delete that directory before you finish. Never modify tracked files. If the claimed wrong output does not appear, the finding is refuted on that point.
2. TEST THE REQUIREMENT. Agency hosts are unreachable. From your knowledge of ICH eCTD v3.2.2 (spec + DTD 3.2), FDA eCTD Module 1 / us-regional DTD 3.3 and its examples, FDA's eCTD Technical Conformance Guide and Validation Criteria, FDA ESG and 21 CFR 312/314 — and the repo's own vendored notes (docs/ectd/*, controlled-vocab comments) — decide whether the rule the finding relies on is real and whether FDA would reject, raise a high/medium validation error, misfile content, or be told something untrue. Be skeptical of invented rules, of confident-sounding element or attribute names, and of findings that describe allowed-but-unusual output. State your confidence honestly.
3. CHECK SCOPE. Is it already fixed at HEAD (git log/blame)? Is it a known procurement gap (DTDs, validator licence, ESG credentials) rather than a code defect? Is it owned by another lane per docs/work-orders/README.md section 0?
Verdict: "confirmed" only if step 1 reproduces AND step 2 holds with at least medium confidence; "partial" if some of it holds (say exactly which part); "refuted" otherwise.
Then give the SMALLEST correct fix and its blast radius (files; whether the other spine is affected; tests that pin current behaviour and would need to change).
BE ECONOMICAL: shared usage limits cut two earlier runs short. Grep first, read only the ranges you need, write one good probe.`

const VERDICT = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    verdict: { type: 'string', enum: ['confirmed', 'partial', 'refuted'] },
    reproduced: { type: 'boolean' },
    observed: { type: 'string', description: 'what your probe actually printed, quoted' },
    specConfidence: { type: 'string', enum: ['high', 'medium', 'low', 'none'] },
    specReasoning: { type: 'string' },
    scope: { type: 'string', description: 'fixed already? procurement gap? another lane? or in scope' },
    correctedClaim: { type: 'string', description: 'for partial/refuted: what is actually true' },
    severity: { type: 'string', enum: ['critical', 'high', 'medium', 'low', 'none'] },
    smallestFix: { type: 'string' },
    blastRadius: { type: 'string' },
  },
  required: ['id', 'verdict', 'reproduced', 'observed', 'specConfidence', 'specReasoning', 'scope', 'severity', 'smallestFix', 'blastRadius'],
}

const findings = Array.isArray(args && args.findings) ? args.findings : []
if (!findings.length) return { error: 'args.findings must be an array of finding objects' }
phase('Verify')
const verdicts = await parallel(findings.map((f) => () =>
  agent(`${CONTEXT}\n\nFINDING ${f.id}:\n${JSON.stringify(f, null, 1)}`,
    { label: `verify:${f.id}`, phase: 'Verify', schema: VERDICT })
))
const got = verdicts.filter(Boolean)
const lost = findings.filter((f) => !got.some((v) => v.id === f.id)).map((f) => f.id)
if (lost.length) log(`no verdict (agent failure) for: ${lost.join(', ')}`)
return { verdicts: got, lost }
```

## The owed lenses (not yet run)

```js
export const meta = {
  name: 'package-spine-owed-lenses',
  description: 'Run the owed validation-parity and honest-state lenses over the package-model spine, verify F20, then adversarially verify every new finding',
  phases: [
    { title: 'Find', detail: 'validation-parity finder, honest-state finder, F20 verifier' },
    { title: 'Verify', detail: 'one skeptic per new finding' },
  ],
}

const SPINE = `
The "package-model spine" of an eCTD publishing product (repo root = cwd, /home/user/ClinicalSageAI-2-replit; read CLAUDE.md first):
  assemble: POST /api/submission-ops/packages/:id/assemble (server/routes/submission-ops.ts) -> leaf-pdf.ts, section-to-ctd.ts,
  package-sequence-lifecycle.ts (planSequence), fda-sequence-identity.ts -> lifecycle-operator.ts, package-leaf-bytes.ts ->
  submission-gateways/regional-packager.ts (+ ectd-packager/*), controlled-vocab/*; internal validation: ectd-structural-validator.ts
  (validateEctdLeafs), ectd-validator-hardening.ts, pre-transmit-check / pre-transmit-findings; transmit: server/routes/mdx-submission-gateway.ts ->
  submission-gateways/governed-transmit.ts (+ governed-transmit-checks.ts), fda-esg.ts, as2-transport.ts; filed history:
  package-content-change.ts (recordFiledSequence), filed-sequence-rejection.ts; UI: client/src/concept2cure/v2/surfaces/GatewayTransmittals.tsx.
A sweep already verified and fixed many findings — read docs/evidence/W5/2026-09-30-package-spine-sweep/README.md (status table F00-F20)
and do NOT re-report those. Known procurement gaps (no vendored ICH/FDA DTDs or stylesheets, no ESG credentials, no S/MIME, no Ack3
ingestion) are not findings unless the product CLAIMS otherwise to the operator.
Template for a probe running the real route + real packager + PGlite: tests/submission-ops-package-spine.pglite.e2e.test.ts with its
harness in tests/support/. Write probes ONLY under tests/zz-probes/<your-label>/ (*.probe.test.ts), run with npx vitest run <file>,
delete that directory before you finish. Never modify tracked files. No state-changing git commands.
BE ECONOMICAL: grep first, read only the ranges you need; usage limits cut earlier runs short.`

const FINDINGS = {
  type: 'object',
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'short slug, e.g. VP-1 or HS-1' },
          title: { type: 'string' },
          severity: { type: 'string', enum: ['critical', 'high', 'medium', 'low'] },
          files: { type: 'array', items: { type: 'string' } },
          claim: { type: 'string', description: 'what is wrong, concretely, with the rule it breaks' },
          reproduction: { type: 'string', description: 'the probe and what it printed' },
          fixSketch: { type: 'string' },
        },
        required: ['id', 'title', 'severity', 'files', 'claim', 'reproduction', 'fixSketch'],
      },
    },
    notes: { type: 'string' },
  },
  required: ['findings'],
}

const VERDICT = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    verdict: { type: 'string', enum: ['confirmed', 'partial', 'refuted'] },
    reproduced: { type: 'boolean' },
    observed: { type: 'string' },
    specConfidence: { type: 'string', enum: ['high', 'medium', 'low', 'none'] },
    specReasoning: { type: 'string' },
    scope: { type: 'string' },
    correctedClaim: { type: 'string' },
    severity: { type: 'string', enum: ['critical', 'high', 'medium', 'low', 'none'] },
    smallestFix: { type: 'string' },
    blastRadius: { type: 'string' },
  },
  required: ['id', 'verdict', 'reproduced', 'observed', 'specConfidence', 'specReasoning', 'scope', 'severity', 'smallestFix', 'blastRadius'],
}

phase('Find')
const [parity, honest, f20] = await parallel([
  () => agent(`${SPINE}

LENS: VALIDATION PARITY. Where does this spine report a bundle as clean (validation errorCount 0, transmit guard cleared,
regionConformant, "pre-transmit checks passed") while FDA's eCTD validation (FDA eCTD Validation Criteria; eCTD Technical
Conformance Guide; ICH eCTD v3.2.2; PDF specifications for submissions) would reject it or raise a high-severity error — or
where our check is weaker than the rule it claims to enforce, or enforces a rule FDA does not have? Look at: what
validateEctdLeafs / ectd-validator-hardening / pre-transmit-check actually check vs what they say; PDF rules (version,
encryption/security, fonts embedded, file size limits, page size, hyperlinks/bookmarks, fast web view); file and folder naming
(length, characters, path length, depth); index-md5.txt and checksums; util/ folder contents; leaf titles; duplicate leaf IDs;
the m1 envelope checks; anything the product labels "submission-grade". Reproduce each with a probe on the real route/packager.
Report at most 8 findings, the most consequential first; each must cite the rule (with your honest confidence) and the probe output.`,
    { label: 'find:validation-parity', phase: 'Find', schema: FINDINGS }),
  () => agent(`${SPINE}

LENS: HONEST STATE. Does what this spine tells the operator (API responses and the GatewayTransmittals surface: toasts, labels,
counts, badges, empty states, error states) match what actually happened? Look for: a failed read rendered as an empty list or
zero; a success toast for something that did not happen or only partly happened (e.g. transmit "sent" vs MDN-only receipt, a
filed-history write that failed, a ledger write that failed); counts that describe something other than what shipped; a
"conformant"/"cleared"/"ready" label that rests on less than it implies; stale data shown as current after a change (identifiers,
contact, filed history, a technical rejection); warnings the server returns that the client drops (e.g. filedSequenceWarning,
contentWarning, ledgerWarning, filedSequenceConflict). Use the client tests' harness (client/src/concept2cure/v2/__tests__/
gatewayTransmittals.test.tsx) or server probes to reproduce. Report at most 8 findings, most consequential first, each with the
reproduction output.`,
    { label: 'find:honest-state', phase: 'Find', schema: FINDINGS }),
  () => agent(`${SPINE}

VERIFY ONE FINDING (try to refute it): F20 — "The us-regional 3.3 admin block never carries <form form-type=\\"fdaft…\\">; Form FDA
1571 ships only as an m1-1-forms leaf, sequence 0000 included." Reproduce at HEAD with a probe (map a Form 1571 artifact into a
1.1 section of an IND package, assemble 0000, read m1/us/us-regional.xml). Then test the requirement: what does FDA's us-regional
DTD 3.3 / Module 1 specification v2.3 say about <form form-type> (where it sits — admin submission-information vs m1-1-forms — and
whether it is required for a 1571), with your honest confidence and the repo's own records (docs/ectd/SPEC_DIGEST.md,
fdaFormsBlock in regional-packager.ts, the IND lane's ind-forms). Return your verdict as a single finding object in 'findings'
(id 'F20', with title/claim/severity reflecting your verdict and 'reproduction' quoting the probe) and put 'confirmed'/'partial'/
'refuted' plus your confidence at the start of 'notes'.`,
    { label: 'verify:F20', phase: 'Find', schema: FINDINGS }),
])

const fresh = [...(parity?.findings ?? []), ...(honest?.findings ?? [])]
log(`finders returned ${fresh.length} findings`)

phase('Verify')
const verdicts = await parallel(fresh.map((f) => () =>
  agent(`${SPINE}

YOUR JOB — try to REFUTE this finding, in three steps:
1. REPRODUCE AT HEAD by running code (probe under tests/zz-probes/verify-${String(f.id).toLowerCase()}/; quote the output; delete the dir).
2. TEST THE REQUIREMENT from your knowledge of ICH eCTD v3.2.2, FDA Module 1 / us-regional DTD 3.3, FDA's eCTD Technical
   Conformance Guide and Validation Criteria, PDF-for-submission specifications, 21 CFR Part 11 and the repo's own CLAUDE.md
   rules (fail closed, never fabricate, an error is never rendered as an empty result). Be skeptical of invented rules and of
   allowed-but-unusual behaviour. State your confidence honestly.
3. CHECK SCOPE: already fixed at HEAD? a procurement gap? another lane's files (docs/work-orders/README.md §0)?
Verdict "confirmed" only if step 1 reproduces AND step 2 holds with at least medium confidence. Then give the smallest correct fix and
its blast radius (files; the other spine; tests that pin current behaviour).

FINDING ${f.id}:
${JSON.stringify(f, null, 1)}`, { label: `verify:${f.id}`, phase: 'Verify', schema: VERDICT })
))

return { parity, honest, f20, verdicts: verdicts.filter(Boolean) }
```
