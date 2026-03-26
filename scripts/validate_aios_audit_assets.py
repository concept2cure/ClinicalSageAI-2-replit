#!/usr/bin/env python3
"""Validate AI OS audit assets are internally consistent."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from aios_controls_parser import parse_control_ids, parse_controls, parse_exit_gates

REQUIRED_JSON_KEYS = {
    "release_id",
    "environment",
    "lineage_completeness_pct",
    "policy_coverage_pct",
    "reliability_improvement_pct",
    "latency_regression_pct",
    "sev1_incidents",
}

EXPECTED_SECTIONS = [
    "# AIOS Evidence Pack (Generated)",
    "## Control Status Summary",
    "## Exit Gate Validation",
    "Overall pilot gate decision:",
    "Overall control decision:",
]

SUMMARY_REQUIRED_KEYS = {
    "release_id",
    "environment",
    "decision",
    "controls_decision",
    "failed_controls",
    "controls",
    "gates",
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Validate AIOS audit assets")
    parser.add_argument("--controls", default="docs/aios/AIOS_AUDIT_CONTROLS.yaml", help="Path to controls YAML")
    parser.add_argument("--metrics", default="docs/aios/sample_evidence_metrics.json", help="Path to metrics JSON")
    parser.add_argument(
        "--evidence-pack",
        default="docs/aios/AIOS_EVIDENCE_PACK_SAMPLE.md",
        help="Path to generated evidence pack markdown",
    )
    parser.add_argument(
        "--summary",
        default="docs/aios/AIOS_EVIDENCE_SUMMARY_SAMPLE.json",
        help="Path to generated evidence summary JSON",
    )
    return parser.parse_args()


def main() -> int:
    root = Path(__file__).resolve().parents[1]
    args = parse_args()

    controls_path = root / args.controls
    metrics_path = root / args.metrics
    evidence_pack_path = root / args.evidence_pack
    summary_path = root / args.summary

    if not controls_path.exists():
        raise SystemExit(f"Missing controls YAML: {controls_path}")
    if not metrics_path.exists():
        raise SystemExit(f"Missing sample metrics JSON: {metrics_path}")
    if not evidence_pack_path.exists():
        raise SystemExit(f"Missing sample evidence pack markdown: {evidence_pack_path}")
    if not summary_path.exists():
        raise SystemExit(f"Missing summary JSON: {summary_path}")

    metrics = json.loads(metrics_path.read_text(encoding="utf-8"))
    missing = REQUIRED_JSON_KEYS - set(metrics)
    if missing:
        raise SystemExit(f"Missing required metrics keys: {sorted(missing)}")

    evidence_pack = evidence_pack_path.read_text(encoding="utf-8")
    for token in EXPECTED_SECTIONS:
        if token not in evidence_pack:
            raise SystemExit(f"Expected token missing from sample pack: {token}")

    controls = parse_controls(controls_path)
    control_ids = parse_control_ids(controls_path)
    if not control_ids:
        raise SystemExit("No control IDs parsed from controls YAML")

    for control in control_ids:
        if control not in evidence_pack:
            raise SystemExit(f"Control ID not found in evidence pack: {control}")

    if len(controls) != len(control_ids):
        raise SystemExit("Parsed controls count does not match parsed control IDs count")

    gates = parse_exit_gates(controls_path)
    for metric, _, _ in gates:
        if metric not in metrics:
            raise SystemExit(f"Gate metric missing from metrics JSON: {metric}")

    summary = json.loads(summary_path.read_text(encoding="utf-8"))
    summary_missing = SUMMARY_REQUIRED_KEYS - set(summary)
    if summary_missing:
        raise SystemExit(f"Summary missing required keys: {sorted(summary_missing)}")

    if len(summary["controls"]) != len(control_ids):
        raise SystemExit("Summary controls count does not match controls YAML")

    if len(summary["gates"]) != len(gates):
        raise SystemExit("Summary gates count does not match controls YAML exit_gates")

    summary_gate_metrics = {row["metric"] for row in summary["gates"]}
    control_gate_metrics = {metric for metric, _, _ in gates}
    if summary_gate_metrics != control_gate_metrics:
        raise SystemExit("Summary gate metrics do not match controls YAML exit_gates")

    expected_gate_decision = "PASS" if all(row.get("passed") for row in summary["gates"]) else "FAIL"
    if summary["decision"] != expected_gate_decision:
        raise SystemExit("Summary gate decision does not match gate pass/fail rows")

    failed_controls = [row.get("id") for row in summary["controls"] if row.get("status") != "Pass"]
    expected_controls_decision = "PASS" if not failed_controls else "FAIL"
    if summary["controls_decision"] != expected_controls_decision:
        raise SystemExit("Summary controls decision does not match control statuses")

    if sorted(summary["failed_controls"]) != sorted(failed_controls):
        raise SystemExit("Summary failed_controls does not match control status rows")

    print("AIOS audit assets validation passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
