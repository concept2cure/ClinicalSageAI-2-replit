#!/usr/bin/env python3
import argparse
import json
from pathlib import Path

def generate(evidence_dir: Path, output: Path):
    reports = list(evidence_dir.glob("evidence_report_*.json"))
    summary = {"reports": []}
    for r in reports:
        data = json.loads(r.read_text())
        summary["reports"].append({
            "id": data.get("test_run_id"),
            "conclusion": data.get("conclusion"),
            "gates": data.get("part_11_gates")
        })
    report_md = ["# ALCOA+ Compliance Report"]
    for r in summary["reports"]:
        report_md.append(f"\n## {r['id']} — {r['conclusion']}\n")
        for k,v in (r.get("gates") or {}).items():
            report_md.append(f"- **{k}**: {v.get('status')}\n")
    output.write_text("\n".join(report_md))

if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--evidence-dir", required=True)
    ap.add_argument("--output", required=True)
    args = ap.parse_args()
    generate(Path(args.evidence_dir), Path(args.output))
