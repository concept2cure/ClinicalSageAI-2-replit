#!/usr/bin/env python3
"""Generate an AI OS evidence pack from pilot metrics.

Metrics are evidence only when they name the run they were measured in:
"source_run": {"id": ..., "sha256": <hash of the run's raw output>}. Without
one the pack is labelled SAMPLE and makes no gate decision. Until 2026-10-15 the
committed sample metrics — invented numbers — produced a document titled
"Evidence Pack" ending "Overall pilot gate decision: PASS", and CI ran it as
"enforce release gates".

Usage:
  python scripts/generate_aios_evidence_pack.py \
    --metrics docs/aios/sample_evidence_metrics.json \
    --output docs/aios/AIOS_EVIDENCE_PACK_YYYYMMDD.md
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
from pathlib import Path
from typing import Any, Dict, List, Tuple

from aios_controls_parser import parse_exit_gates


class GateEvaluationError(ValueError):
    """Raised when gate evaluation receives invalid input."""


def gate_pass(metric_value: float, op: str, expected: float) -> bool:
    if op == ">=":
        return metric_value >= expected
    if op == "<=":
        return metric_value <= expected
    if op == "==":
        return metric_value == expected
    raise GateEvaluationError(f"Unsupported operator: {op}")


def source_run(metrics: Dict[str, Any]) -> str | None:
    """The recorded run the metrics come from, or None for sample input."""
    run = metrics.get("source_run")
    if isinstance(run, dict) and run.get("id") and run.get("sha256"):
        return f"{run['id']} (sha256 {str(run['sha256'])[:12]})"
    return None


def control_status(metrics: Dict[str, Any]) -> Dict[str, str]:
    statuses = {
        "AIOS-01": "Pass" if float(metrics.get("lineage_completeness_pct", 0)) >= 99 else "Fail",
        "AIOS-02": "Pass" if float(metrics.get("policy_coverage_pct", 0)) >= 100 else "Fail",
        "AIOS-03": "Pass" if float(metrics.get("version_drift_events", 1)) == 0 else "Fail",
        "AIOS-04": "Pass" if float(metrics.get("integrity_check_failures", 1)) == 0 else "Fail",
        "AIOS-05": "Pass" if float(metrics.get("tenant_boundary_violations", 1)) == 0 else "Fail",
        "AIOS-06": "Pass" if float(metrics.get("unapproved_changes", 1)) == 0 else "Fail",
        "AIOS-07": "Pass"
        if float(metrics.get("sev1_incidents", 1)) == 0
        and float(metrics.get("reliability_improvement_pct", 0)) >= 20
        and float(metrics.get("latency_regression_pct", 999)) <= 10
        else "Fail",
    }
    return statuses


def evaluate_gates(metrics: Dict[str, Any], gates: List[Tuple[str, str, float]]) -> tuple[list[str], bool]:
    gate_rows: list[str] = []
    overall_pass = True

    for metric, op, expected in gates:
        if metric not in metrics:
            raise GateEvaluationError(f"Missing required gate metric: {metric}")

        observed = float(metrics[metric])
        passed = gate_pass(observed, op, expected)
        overall_pass = overall_pass and passed
        gate_rows.append(f"| {metric} | {op} {expected} | {observed} | {'Pass' if passed else 'Fail'} |")

    return gate_rows, overall_pass


def build_markdown(metrics: Dict[str, Any], gates: List[Tuple[str, str, float]]) -> tuple[str, bool]:
    now = dt.datetime.now(dt.UTC).strftime("%Y-%m-%d")
    statuses = control_status(metrics)
    gate_rows, overall_pass = evaluate_gates(metrics, gates)

    control_rows = "\n".join(
        f"| {cid} | {status} | {metrics.get('evidence_link_prefix', 'TBD')}/{cid.lower()} |  |"
        for cid, status in statuses.items()
    )

    # Backslash escapes can't appear inside f-string expressions on
    # Python < 3.12, so pre-join the multi-row tables outside the
    # f-string and interpolate the result instead.
    gate_rows_block = "\n".join(gate_rows)
    source = source_run(metrics)
    title = "# AIOS Evidence Pack (Generated)" + ("" if source else " — SAMPLE, not evidence")
    gate_word = "PASS" if overall_pass else "FAIL"
    decision = gate_word if source else (
        f"NOT MADE — sample metrics with no source run; the gate logic evaluates them as {gate_word}."
    )
    markdown = f"""{title}

Generated: {now}
Source run: {source or "none — these metrics were not measured in a recorded run"}
Release ID: {metrics.get('release_id', 'TBD')}
Environment: {metrics.get('environment', 'staging')}

## Control Status Summary

| Control ID | Status | Evidence Link | Notes |
| --- | --- | --- | --- |
{control_rows}

## Pilot Metric Snapshot

- lineage_completeness_pct: {metrics.get('lineage_completeness_pct', 'n/a')}
- policy_coverage_pct: {metrics.get('policy_coverage_pct', 'n/a')}
- reliability_improvement_pct: {metrics.get('reliability_improvement_pct', 'n/a')}
- latency_regression_pct: {metrics.get('latency_regression_pct', 'n/a')}
- sev1_incidents: {metrics.get('sev1_incidents', 'n/a')}

## Exit Gate Validation

| Gate Metric | Threshold | Observed | Pass/Fail |
| --- | --- | --- | --- |
{gate_rows_block}

## Decision

Overall pilot gate decision: {decision}

## Notes

- Generated by `scripts/generate_aios_evidence_pack.py`.
- Attach control-level artifacts before compliance review.
"""

    return markdown, overall_pass


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Generate AIOS evidence pack markdown")
    parser.add_argument("--metrics", required=True, help="Path to JSON metrics input")
    parser.add_argument("--output", required=True, help="Path to markdown output")
    parser.add_argument(
        "--controls",
        default="docs/aios/AIOS_AUDIT_CONTROLS.yaml",
        help="Path to controls YAML containing exit_gates",
    )
    parser.add_argument(
        "--fail-on-gate-fail",
        action="store_true",
        help="Exit with non-zero status if any exit gate fails",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    metrics_path = Path(args.metrics)
    output_path = Path(args.output)

    metrics = json.loads(metrics_path.read_text(encoding="utf-8"))
    gates = parse_exit_gates(Path(args.controls))
    markdown, overall_pass = build_markdown(metrics, gates)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(markdown, encoding="utf-8")
    print(f"Wrote evidence pack to {output_path}")
    if args.fail_on_gate_fail and not overall_pass:
        print("AIOS exit-gate decision is FAIL")
        return 2
    if args.fail_on_gate_fail and source_run(metrics) is None:
        print("AIOS exit gates evaluated on sample metrics: no release gate was enforced.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
