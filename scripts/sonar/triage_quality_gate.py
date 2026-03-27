#!/usr/bin/env python3
"""Fetch SonarQube/SonarCloud quality gate status and triage failing conditions.

Usage:
  python scripts/sonar/triage_quality_gate.py \
    --project-key <key> [--host-url https://sonarcloud.io]

Auth:
  - If SONAR_TOKEN is set, use token auth.
  - Otherwise attempt anonymous access.
"""

from __future__ import annotations

import argparse
import base64
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from typing import Any


MUST_FIX_METRICS = {
    "alert_status",
    "reliability_rating",
    "security_rating",
    "new_reliability_rating",
    "new_security_rating",
    "new_vulnerabilities",
    "new_bugs",
    "security_hotspots_reviewed",
}

DEFER_METRICS = {
    "maintainability_rating",
    "new_maintainability_rating",
    "duplicated_lines_density",
    "new_duplicated_lines_density",
    "coverage",
    "new_coverage",
    "code_smells",
    "new_code_smells",
    "sqale_rating",
    "new_sqale_rating",
}


@dataclass
class TriageRow:
    metric_key: str
    status: str
    actual: str
    comparator: str
    error_threshold: str
    bucket: str


def _api_get(url: str, token: str | None = None) -> dict[str, Any]:
    req = urllib.request.Request(url)
    if token:
        raw = f"{token}:".encode("utf-8")
        auth = base64.b64encode(raw).decode("ascii")
        req.add_header("Authorization", f"Basic {auth}")
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8"))


def _bucket(metric: str) -> str:
    if metric in MUST_FIX_METRICS:
        return "must fix before release"
    if metric in DEFER_METRICS:
        return "defer"
    if metric.startswith("new_"):
        return "must fix before release"
    return "defer"


def build_triage(project_status: dict[str, Any]) -> tuple[str, list[TriageRow]]:
    status = project_status.get("status", "UNKNOWN")
    conditions = project_status.get("conditions", [])
    failing = [c for c in conditions if c.get("status") == "ERROR"]
    rows: list[TriageRow] = []
    for c in failing:
        metric = c.get("metricKey", "unknown")
        rows.append(
            TriageRow(
                metric_key=metric,
                status=str(c.get("status", "")),
                actual=str(c.get("actualValue", "n/a")),
                comparator=str(c.get("comparator", "")),
                error_threshold=str(c.get("errorThreshold", "")),
                bucket=_bucket(metric),
            )
        )
    return status, rows


def print_report(host: str, project_key: str, status: str, rows: list[TriageRow]) -> None:
    print(f"Sonar host: {host}")
    print(f"Project key: {project_key}")
    print(f"Quality gate status: {status}")
    print()

    if not rows:
        print("No failing gate conditions were returned.")
        return

    must_fix = [r for r in rows if r.bucket == "must fix before release"]
    defer = [r for r in rows if r.bucket == "defer"]

    def _emit(title: str, items: list[TriageRow]) -> None:
        print(title)
        if not items:
            print("- none")
            return
        for r in items:
            print(
                f"- {r.metric_key}: actual={r.actual} {r.comparator} threshold={r.error_threshold}"
            )

    _emit("must fix before release", must_fix)
    print()
    _emit("defer", defer)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--project-key", required=True)
    parser.add_argument("--host-url", default="https://sonarcloud.io")
    args = parser.parse_args()

    token = os.environ.get("SONAR_TOKEN")

    base = args.host_url.rstrip("/")
    params = urllib.parse.urlencode({"projectKey": args.project_key})
    url = f"{base}/api/qualitygates/project_status?{params}"

    try:
        payload = _api_get(url, token=token)
        project_status = payload["projectStatus"]
    except urllib.error.HTTPError as exc:
        print(f"ERROR: Sonar API HTTP error {exc.code} for {url}", file=sys.stderr)
        return 2
    except urllib.error.URLError as exc:
        print(f"ERROR: Sonar API connection error for {url}: {exc}", file=sys.stderr)
        return 3
    except KeyError:
        print("ERROR: Unexpected API payload (missing projectStatus)", file=sys.stderr)
        return 4

    status, rows = build_triage(project_status)
    print_report(base, args.project_key, status, rows)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
