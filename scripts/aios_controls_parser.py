"""Lightweight YAML reader for `docs/aios/AIOS_AUDIT_CONTROLS.yaml`.

The controls YAML carries an `exit_gates` section that the evidence-pack
generator (`scripts/generate_aios_evidence_pack.py`) consumes to decide
whether a pilot has met its release thresholds. We expose a single helper
— `parse_exit_gates(path)` — that returns a list of `(metric, operator,
value)` tuples in declaration order. The generator already knows what to
do with each tuple.

We use the standard-library `yaml`? No: PyYAML is a third-party dep and
this script runs in the bare CI Python. Instead, parse just the subset of
YAML we need: a top-level `exit_gates` block of records with `metric`,
`operator`, `value` keys. That keeps the script's only dep boundary at
the Python standard library.
"""

from __future__ import annotations

from pathlib import Path
from typing import List, Tuple


def _strip_quotes(token: str) -> str:
    token = token.strip()
    if len(token) >= 2 and token[0] in {'"', "'"} and token[0] == token[-1]:
        return token[1:-1]
    return token


def parse_exit_gates(path: Path) -> List[Tuple[str, str, float]]:
    """Read `exit_gates` from the AIOS controls YAML.

    Returns one (metric, operator, value) tuple per gate. Lifts only the
    subset of YAML we actually need so the parser has no external deps.
    """
    if not path.exists():
        raise FileNotFoundError(f"AIOS controls file not found: {path}")

    text = path.read_text(encoding="utf-8")
    lines = text.splitlines()

    # Locate the `exit_gates:` header.
    start_idx: int | None = None
    for idx, line in enumerate(lines):
        if line.strip() == "exit_gates:":
            start_idx = idx + 1
            break
    if start_idx is None:
        raise ValueError(f"`exit_gates:` block not found in {path}")

    gates: List[Tuple[str, str, float]] = []
    current: dict[str, str] = {}

    for line in lines[start_idx:]:
        # Blank line ends a record but not the block (the next iteration
        # may pick up another record).
        if not line.strip():
            continue
        # A line with no indentation marks the end of the block.
        if not line.startswith(" "):
            break

        stripped = line.strip()
        if stripped.startswith("- "):
            # New record. Flush any pending one.
            if current:
                gates.append(_finalize(current, path))
                current = {}
            stripped = stripped[2:].strip()
            if not stripped:
                continue

        # Expect `key: value` form.
        if ":" not in stripped:
            raise ValueError(f"Malformed exit_gates entry in {path}: {line!r}")
        key, _, value = stripped.partition(":")
        current[key.strip()] = _strip_quotes(value)

    if current:
        gates.append(_finalize(current, path))

    return gates


def parse_control_ids(path: Path) -> List[str]:
    """Return the ordered list of control IDs declared in the controls YAML.

    Walks the `controls:` block and pulls every `- id: AIOS-NN` entry. Same
    no-third-party-deps approach as `parse_exit_gates`.
    """
    if not path.exists():
        raise FileNotFoundError(f"AIOS controls file not found: {path}")

    text = path.read_text(encoding="utf-8")
    lines = text.splitlines()

    start_idx: int | None = None
    for idx, line in enumerate(lines):
        if line.strip() == "controls:":
            start_idx = idx + 1
            break
    if start_idx is None:
        raise ValueError(f"`controls:` block not found in {path}")

    ids: List[str] = []
    for line in lines[start_idx:]:
        if not line.strip():
            continue
        # An unindented line ends the block.
        if not line.startswith(" "):
            break
        stripped = line.strip()
        if stripped.startswith("- id:"):
            value = stripped[len("- id:") :]
            ids.append(_strip_quotes(value))
        elif stripped.startswith("id:"):
            value = stripped[len("id:") :]
            ids.append(_strip_quotes(value))
    return ids


def _finalize(record: dict[str, str], path: Path) -> Tuple[str, str, float]:
    """Validate a record dict and produce the (metric, op, value) tuple."""
    missing = [k for k in ("metric", "operator", "value") if k not in record]
    if missing:
        raise ValueError(
            f"exit_gates record in {path} missing keys: {missing}. Record: {record}"
        )
    try:
        value = float(record["value"])
    except ValueError as exc:
        raise ValueError(
            f"exit_gates value must be numeric in {path}; got {record['value']!r}"
        ) from exc
    return record["metric"], record["operator"], value
