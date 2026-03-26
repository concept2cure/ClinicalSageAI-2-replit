# AI OS Audit Assets

This folder contains machine-readable control definitions and evidence-pack artifacts for the Concept2Cure AI OS pilot.

## Files

- `AIOS_AUDIT_CONTROLS.yaml`: control IDs, owners, thresholds, and exit gates.
- `sample_evidence_metrics.json`: sample measured metrics payload.
- `AIOS_EVIDENCE_PACK_SAMPLE.md`: generated sample evidence pack from the metrics payload.

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

Both commands are intended to run in CI as part of pilot governance checks.

To hard-fail automation when release gates are not met:

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
