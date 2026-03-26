# Makefile targets for developer environment
.PHONY: setup-services aios-evidence aios-validate aios-test aios-gate

setup-services:
	python -m pip install --upgrade pip
	pip install -r services/requirements.txt

aios-evidence:
	python3 scripts/generate_aios_evidence_pack.py \
		--metrics docs/aios/sample_evidence_metrics.json \
		--output docs/aios/AIOS_EVIDENCE_PACK_SAMPLE.md \
		--summary-output docs/aios/AIOS_EVIDENCE_SUMMARY_SAMPLE.json

aios-validate:
	python3 scripts/validate_aios_audit_assets.py

aios-test:
	python3 -m unittest tests/test_aios_audit_tooling.py -v


aios-gate:
	python3 scripts/generate_aios_evidence_pack.py \
		--metrics docs/aios/sample_evidence_metrics.json \
		--output docs/aios/AIOS_EVIDENCE_PACK_SAMPLE.md \
		--summary-output docs/aios/AIOS_EVIDENCE_SUMMARY_SAMPLE.json \
		--fail-on-gate-fail \
		--fail-on-control-fail
