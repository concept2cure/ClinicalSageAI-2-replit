#!/usr/bin/env python3
"""Helpers for extracting AIOS gate and control metadata from controls YAML.

This parser intentionally supports only the constrained structure used by
`docs/aios/AIOS_AUDIT_CONTROLS.yaml` to avoid adding third-party dependencies.
"""

from __future__ import annotations

from pathlib import Path
import re
from typing import List, Tuple


_GATE_METRIC_RE = re.compile(r"^\s*-\s*metric:\s*(\S+)\s*$")
_GATE_OPERATOR_RE = re.compile(r'^\s*operator:\s*"?([<>=]{1,2})"?\s*$')
_GATE_VALUE_RE = re.compile(r"^\s*value:\s*([0-9]+(?:\.[0-9]+)?)\s*$")
_CONTROL_ID_RE = re.compile(r"^\s*-\s*id:\s*(AIOS-\d{2})\s*$")


def parse_control_ids(controls_path: Path) -> List[str]:
    control_ids: List[str] = []
    for line in controls_path.read_text(encoding="utf-8").splitlines():
        match = _CONTROL_ID_RE.match(line)
        if match:
            control_ids.append(match.group(1))
    return control_ids


def parse_exit_gates(controls_path: Path) -> List[Tuple[str, str, float]]:
    """Parse `exit_gates` into (metric, operator, value) tuples."""
    gates: List[Tuple[str, str, float]] = []
    lines = controls_path.read_text(encoding="utf-8").splitlines()

    in_exit_gates = False
    pending_metric: str | None = None
    pending_operator: str | None = None

    for raw_line in lines:
        line = raw_line.rstrip()

        if line.strip() == "exit_gates:":
            in_exit_gates = True
            continue

        if not in_exit_gates:
            continue

        metric_match = _GATE_METRIC_RE.match(line)
        if metric_match:
            if pending_metric is not None:
                raise ValueError("Malformed exit_gates block: missing operator/value")
            pending_metric = metric_match.group(1)
            pending_operator = None
            continue

        if pending_metric is None:
            if line.strip().startswith("-") or line.strip() == "":
                continue
            if re.match(r"^\S", line):
                break
            continue

        operator_match = _GATE_OPERATOR_RE.match(line)
        if operator_match:
            pending_operator = operator_match.group(1)
            continue

        value_match = _GATE_VALUE_RE.match(line)
        if value_match:
            if pending_operator is None:
                raise ValueError("Malformed exit_gates block: value without operator")
            gates.append((pending_metric, pending_operator, float(value_match.group(1))))
            pending_metric = None
            pending_operator = None
            continue

        if line.strip() and re.match(r"^\S", line):
            break

    if pending_metric is not None:
        raise ValueError("Malformed exit_gates block: incomplete gate entry")
    if not gates:
        raise ValueError("No exit gates found in controls file")

    return gates
