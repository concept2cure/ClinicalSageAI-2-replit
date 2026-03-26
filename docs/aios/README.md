# AI OS Audit Assets

This folder contains machine-readable control definitions and evidence-pack artifacts for the Concept2Cure AI OS pilot.

## Files

- `AIOS_AUDIT_CONTROLS.yaml`: control IDs, owners, thresholds, and exit gates.
- `sample_evidence_metrics.json`: sample measured metrics payload.
- `AIOS_EVIDENCE_PACK_SAMPLE.md`: generated sample evidence pack from the metrics payload.
- `AIOS_EVIDENCE_SUMMARY_SAMPLE.json`: generated machine-readable summary from the same run.

## Regeneration

```bash
python3 scripts/generate_aios_evidence_pack.py \
  --metrics docs/aios/sample_evidence_metrics.json \
  --controls docs/aios/AIOS_AUDIT_CONTROLS.yaml \
  --output docs/aios/AIOS_EVIDENCE_PACK_SAMPLE.md \
  --summary-output docs/aios/AIOS_EVIDENCE_SUMMARY_SAMPLE.json
```

## Validation

```bash
python3 scripts/validate_aios_audit_assets.py \
  --controls docs/aios/AIOS_AUDIT_CONTROLS.yaml \
  --metrics docs/aios/sample_evidence_metrics.json \
  --evidence-pack docs/aios/AIOS_EVIDENCE_PACK_SAMPLE.md \
  --summary docs/aios/AIOS_EVIDENCE_SUMMARY_SAMPLE.json
```

Both commands are intended to run in CI as part of pilot governance checks.

The tooling expects PyYAML (`yaml`) to be available in the Python environment.

To hard-fail automation when release gates are not met:

```bash
python3 scripts/generate_aios_evidence_pack.py \
  --metrics docs/aios/sample_evidence_metrics.json \
  --controls docs/aios/AIOS_AUDIT_CONTROLS.yaml \
  --output docs/aios/AIOS_EVIDENCE_PACK_SAMPLE.md \
  --summary-output docs/aios/AIOS_EVIDENCE_SUMMARY_SAMPLE.json \
  --fail-on-gate-fail \
  --fail-on-control-fail
```

## Makefile Shortcuts

```bash
make aios-evidence
make aios-validate
make aios-test
make aios-gate
```
