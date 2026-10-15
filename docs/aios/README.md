# AI OS Audit Assets

This folder contains machine-readable control definitions and evidence-pack artifacts for the Concept2Cure AI OS pilot.

## Files

- `AIOS_AUDIT_CONTROLS.yaml`: control IDs, owners, thresholds, and exit gates.
- `sample_evidence_metrics.json`: sample metrics — invented, measured in no run. They
  exercise the generator and its gate logic only.
- `AIOS_EVIDENCE_PACK_SAMPLE.md`: the pack generated from them, titled SAMPLE, with no
  gate decision.

Metrics are evidence only when they carry `"source_run": {"id": ..., "sha256": ...}`
naming the run they were measured in; only then does a pack state a gate decision
(2026-10-15 — the sample pack read "Overall pilot gate decision: PASS").

## Regeneration

```bash
python3 scripts/generate_aios_evidence_pack.py \
  --metrics docs/aios/sample_evidence_metrics.json \
  --output docs/aios/AIOS_EVIDENCE_PACK_SAMPLE.md
```

## Validation

```bash
python3 scripts/validate_aios_audit_assets.py
```

Both run in CI. With the sample metrics they check the tooling, not a release.

To hard-fail automation when release gates are not met (metrics from a recorded run):

```bash
python3 scripts/generate_aios_evidence_pack.py \
  --metrics docs/aios/sample_evidence_metrics.json \
  --output docs/aios/AIOS_EVIDENCE_PACK_SAMPLE.md \
  --fail-on-gate-fail
```

## Makefile Shortcuts

```bash
make aios-evidence
make aios-validate
make aios-test
make aios-gate
```
