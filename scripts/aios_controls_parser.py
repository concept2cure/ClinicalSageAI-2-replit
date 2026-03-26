#!/usr/bin/env python3
"""Helpers for extracting AIOS gate and control metadata from controls YAML."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Tuple

import yaml


@dataclass(frozen=True)
class ControlSpec:
    control_id: str
    name: str
    owner: str
    required_metrics: List[str]
    thresholds: Dict[str, float]


def _load_controls_doc(controls_path: Path) -> dict:
    payload = yaml.safe_load(controls_path.read_text(encoding="utf-8"))
    if not isinstance(payload, dict):
        raise ValueError("Controls YAML must parse to a mapping")
    return payload


def parse_control_ids(controls_path: Path) -> List[str]:
    return [control.control_id for control in parse_controls(controls_path)]


def parse_controls(controls_path: Path) -> List[ControlSpec]:
    payload = _load_controls_doc(controls_path)
    controls_raw = payload.get("controls", [])
    if not isinstance(controls_raw, list) or not controls_raw:
        raise ValueError("No controls found in controls file")

    controls: List[ControlSpec] = []
    for idx, raw in enumerate(controls_raw, start=1):
        if not isinstance(raw, dict):
            raise ValueError(f"Control at index {idx} is not a mapping")

        control_id = raw.get("id")
        if not isinstance(control_id, str) or not control_id:
            raise ValueError(f"Control at index {idx} missing string 'id'")

        name = raw.get("name")
        if not isinstance(name, str):
            raise ValueError(f"Control {control_id} missing string 'name'")

        owner = raw.get("owner")
        if not isinstance(owner, str):
            raise ValueError(f"Control {control_id} missing string 'owner'")

        required_metrics_raw = raw.get("required_metrics", [])
        if not isinstance(required_metrics_raw, list) or not required_metrics_raw:
            raise ValueError(f"Control {control_id} missing non-empty list 'required_metrics'")
        required_metrics = [str(metric) for metric in required_metrics_raw]

        thresholds_raw = raw.get("threshold", {})
        if not isinstance(thresholds_raw, dict) or not thresholds_raw:
            raise ValueError(f"Control {control_id} missing mapping 'threshold'")
        thresholds: Dict[str, float] = {str(metric): float(value) for metric, value in thresholds_raw.items()}

        controls.append(
            ControlSpec(
                control_id=control_id,
                name=name,
                owner=owner,
                required_metrics=required_metrics,
                thresholds=thresholds,
            )
        )

    return controls


def parse_exit_gates(controls_path: Path) -> List[Tuple[str, str, float]]:
    payload = _load_controls_doc(controls_path)
    gates_raw = payload.get("exit_gates", [])
    if not isinstance(gates_raw, list) or not gates_raw:
        raise ValueError("No exit gates found in controls file")

    gates: List[Tuple[str, str, float]] = []
    for idx, gate in enumerate(gates_raw, start=1):
        if not isinstance(gate, dict):
            raise ValueError(f"Gate at index {idx} is not a mapping")

        metric = gate.get("metric")
        operator = gate.get("operator")
        value = gate.get("value")
        if not isinstance(metric, str) or not metric:
            raise ValueError(f"Gate at index {idx} missing string 'metric'")
        if operator not in {">=", "<=", "=="}:
            raise ValueError(f"Gate {metric} has unsupported operator: {operator}")
        gates.append((metric, operator, float(value)))

    return gates
