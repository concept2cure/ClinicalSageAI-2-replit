#!/usr/bin/env python3
"""
C2C Regulatory Validation Agent

Scans eCTD directory structures, submission content, and regulatory
documents for compliance issues. Returns machine-readable findings
that the CI workflow posts as PR comments.

Usage:
  python agent.py ./ectd ./ectd-stubs
  python agent.py --help
"""

import os
import sys
import json
import glob
import re
from dataclasses import dataclass, asdict
from typing import List, Dict, Optional
from enum import Enum
from pathlib import Path

# ─────────────────────────────────────────────────────────────────────────────
# Types
# ─────────────────────────────────────────────────────────────────────────────

class Severity(Enum):
    CRITICAL = "critical"
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"
    INFO = "info"


@dataclass
class Finding:
    rule_id: str
    severity: str
    module: str
    section: str
    message: str
    suggestion: str
    auto_fixable: bool
    file_path: Optional[str] = None
    line_number: Optional[int] = None


# ─────────────────────────────────────────────────────────────────────────────
# eCTD Structure Rules
# ─────────────────────────────────────────────────────────────────────────────

ECTD_REQUIRED_MODULES = {
    "m1": "Module 1 — Administrative",
    "m2": "Module 2 — Summaries",
    "m3": "Module 3 — Quality (CMC)",
    "m4": "Module 4 — Nonclinical",
    "m5": "Module 5 — Clinical",
}

ECTD_MODULE2_SECTIONS = [
    "2.2-introduction",
    "2.3-quality-overall-summary",
    "2.4-nonclinical-overview",
    "2.5-clinical-overview",
    "2.6-nonclinical-summaries",
    "2.7-clinical-summaries",
]

REGULATORY_TERM_PATTERNS = {
    "IND": r"\bIND\b",
    "NDA": r"\bNDA\b",
    "BLA": r"\bBLA\b",
    "MAA": r"\bMAA\b",
    "eCTD": r"\beCTD\b",
    "ICH": r"\bICH\b",
    "CFR": r"\b21\s*CFR\b",
    "GMP": r"\bGMP\b",
    "GCP": r"\bGCP\b",
    "GLP": r"\bGLP\b",
}

# Statistical claim patterns to verify
STAT_PATTERNS = [
    (r"p\s*[<>=]+\s*(\d+\.?\d*)", "p-value"),
    (r"(\d+\.?\d*)%\s*CI", "confidence-interval"),
    (r"HR\s*[=:]\s*(\d+\.?\d*)", "hazard-ratio"),
    (r"OR\s*[=:]\s*(\d+\.?\d*)", "odds-ratio"),
    (r"RR\s*[=:]\s*(\d+\.?\d*)", "relative-risk"),
]


class RegulatoryValidatorAgent:
    def __init__(self, scan_paths: List[str]):
        self.scan_paths = [Path(p) for p in scan_paths if Path(p).exists()]
        self.findings: List[Finding] = []

    # ─────────────────────────────────────────────────────────────────────────
    # Main entry
    # ─────────────────────────────────────────────────────────────────────────
    def validate(self) -> Dict:
        """Run all validation checks and return structured report."""
        self._check_ectd_structure()
        self._check_citation_integrity()
        self._check_statistical_claims()
        self._check_formatting_standards()
        self._check_file_naming()
        self._check_content_quality()
        return self._build_report()

    # ─────────────────────────────────────────────────────────────────────────
    # Check 1: eCTD directory structure
    # ─────────────────────────────────────────────────────────────────────────
    def _check_ectd_structure(self):
        for base in self.scan_paths:
            # Check for top-level module directories
            for module_id, module_name in ECTD_REQUIRED_MODULES.items():
                module_dir = base / module_id
                if not module_dir.exists():
                    # Only flag if this looks like an eCTD root
                    if any((base / m).exists() for m in ECTD_REQUIRED_MODULES):
                        self.findings.append(Finding(
                            rule_id="ECTD-STR-001",
                            severity=Severity.HIGH.value,
                            module="eCTD",
                            section=module_id,
                            message=f"Missing {module_name} directory: {module_dir}",
                            suggestion=f"Create {module_id}/ directory with required sub-sections",
                            auto_fixable=True,
                            file_path=str(base),
                        ))

            # Check Module 2 sub-sections
            m2_dir = base / "m2"
            if m2_dir.exists():
                for section in ECTD_MODULE2_SECTIONS:
                    matches = list(m2_dir.rglob(f"*{section}*"))
                    if not matches:
                        self.findings.append(Finding(
                            rule_id="ECTD-STR-002",
                            severity=Severity.MEDIUM.value,
                            module="eCTD",
                            section="m2",
                            message=f"Missing Module 2 section: {section}",
                            suggestion=f"Add {section} document to m2/",
                            auto_fixable=False,
                        ))

    # ─────────────────────────────────────────────────────────────────────────
    # Check 2: Citation integrity
    # ─────────────────────────────────────────────────────────────────────────
    def _check_citation_integrity(self):
        for base in self.scan_paths:
            for md_file in base.rglob("*.md"):
                content = md_file.read_text(errors="ignore")
                lines = content.split("\n")

                for i, line in enumerate(lines, 1):
                    # Claims with numbers but no citation
                    if re.search(r"\d+\.?\d*%", line) and not re.search(r"\[.*?\]|\(.*?et al", line):
                        # Skip headings and short lines
                        if len(line) > 60 and not line.startswith("#"):
                            self.findings.append(Finding(
                                rule_id="CIT-INT-001",
                                severity=Severity.HIGH.value,
                                module="Citation",
                                section=md_file.stem,
                                message=f"Statistical claim without citation: {line[:100]}...",
                                suggestion="Add source citation for numeric claim",
                                auto_fixable=False,
                                file_path=str(md_file),
                                line_number=i,
                            ))

                    # Broken cross-references
                    refs = re.findall(r"\[([^\]]+)\]\(([^\)]+)\)", line)
                    for ref_text, ref_target in refs:
                        if ref_target.startswith("#") or ref_target.startswith("http"):
                            continue
                        target_path = md_file.parent / ref_target
                        if not target_path.exists():
                            self.findings.append(Finding(
                                rule_id="CIT-INT-002",
                                severity=Severity.MEDIUM.value,
                                module="Citation",
                                section=md_file.stem,
                                message=f"Broken cross-reference: [{ref_text}]({ref_target})",
                                suggestion=f"Fix path or remove broken reference",
                                auto_fixable=False,
                                file_path=str(md_file),
                                line_number=i,
                            ))

    # ─────────────────────────────────────────────────────────────────────────
    # Check 3: Statistical claim validation
    # ─────────────────────────────────────────────────────────────────────────
    def _check_statistical_claims(self):
        for base in self.scan_paths:
            for md_file in base.rglob("*.md"):
                content = md_file.read_text(errors="ignore")

                for pattern, stat_type in STAT_PATTERNS:
                    for match in re.finditer(pattern, content):
                        value = float(match.group(1))

                        # p-value sanity
                        if stat_type == "p-value" and (value > 1 or value < 0):
                            self.findings.append(Finding(
                                rule_id="STAT-VAL-001",
                                severity=Severity.CRITICAL.value,
                                module="Statistics",
                                section=md_file.stem,
                                message=f"Invalid p-value: {value} (must be 0-1)",
                                suggestion="Verify p-value against source study data",
                                auto_fixable=False,
                                file_path=str(md_file),
                            ))

                        # Hazard ratio / odds ratio sanity
                        if stat_type in ("hazard-ratio", "odds-ratio", "relative-risk"):
                            if value > 100:
                                self.findings.append(Finding(
                                    rule_id="STAT-VAL-002",
                                    severity=Severity.MEDIUM.value,
                                    module="Statistics",
                                    section=md_file.stem,
                                    message=f"Unusually large {stat_type}: {value}",
                                    suggestion="Verify ratio against source data",
                                    auto_fixable=False,
                                    file_path=str(md_file),
                                ))

    # ─────────────────────────────────────────────────────────────────────────
    # Check 4: Formatting standards (ICH)
    # ─────────────────────────────────────────────────────────────────────────
    def _check_formatting_standards(self):
        for base in self.scan_paths:
            for md_file in base.rglob("*.md"):
                content = md_file.read_text(errors="ignore")
                lines = content.split("\n")

                # Check for proper heading hierarchy
                prev_level = 0
                for i, line in enumerate(lines, 1):
                    heading_match = re.match(r"^(#{1,6})\s", line)
                    if heading_match:
                        level = len(heading_match.group(1))
                        if level > prev_level + 1 and prev_level > 0:
                            self.findings.append(Finding(
                                rule_id="FMT-ICH-001",
                                severity=Severity.LOW.value,
                                module="Formatting",
                                section=md_file.stem,
                                message=f"Heading level skip: H{prev_level} -> H{level}",
                                suggestion="Use sequential heading levels per ICH standards",
                                auto_fixable=True,
                                file_path=str(md_file),
                                line_number=i,
                            ))
                        prev_level = level

    # ─────────────────────────────────────────────────────────────────────────
    # Check 5: File naming conventions
    # ─────────────────────────────────────────────────────────────────────────
    def _check_file_naming(self):
        for base in self.scan_paths:
            for f in base.rglob("*"):
                if f.is_file():
                    name = f.name
                    # eCTD file names should not contain spaces
                    if " " in name:
                        self.findings.append(Finding(
                            rule_id="FILE-NAM-001",
                            severity=Severity.MEDIUM.value,
                            module="File Naming",
                            section="General",
                            message=f"File name contains spaces: {name}",
                            suggestion="Replace spaces with hyphens or underscores",
                            auto_fixable=True,
                            file_path=str(f),
                        ))

                    # Check for special characters
                    if re.search(r"[^a-zA-Z0-9._\-/]", name):
                        self.findings.append(Finding(
                            rule_id="FILE-NAM-002",
                            severity=Severity.LOW.value,
                            module="File Naming",
                            section="General",
                            message=f"File name has special characters: {name}",
                            suggestion="Use only alphanumeric, dot, hyphen, underscore",
                            auto_fixable=True,
                            file_path=str(f),
                        ))

    # ─────────────────────────────────────────────────────────────────────────
    # Check 6: Content quality heuristics
    # ─────────────────────────────────────────────────────────────────────────
    def _check_content_quality(self):
        for base in self.scan_paths:
            for md_file in base.rglob("*.md"):
                content = md_file.read_text(errors="ignore")

                # Check for placeholder text
                placeholders = ["TBD", "TODO", "FIXME", "INSERT", "[PLACEHOLDER]", "XXX"]
                for ph in placeholders:
                    if ph in content:
                        self.findings.append(Finding(
                            rule_id="QUAL-PLH-001",
                            severity=Severity.HIGH.value,
                            module="Content Quality",
                            section=md_file.stem,
                            message=f"Placeholder text found: '{ph}'",
                            suggestion="Replace placeholder with actual content before submission",
                            auto_fixable=False,
                            file_path=str(md_file),
                        ))

                # Check minimum content length for regulatory sections
                if len(content.strip()) < 200 and md_file.stat().st_size > 0:
                    self.findings.append(Finding(
                        rule_id="QUAL-LEN-001",
                        severity=Severity.MEDIUM.value,
                        module="Content Quality",
                        section=md_file.stem,
                        message=f"Section appears too short ({len(content)} chars)",
                        suggestion="Ensure section meets minimum content requirements",
                        auto_fixable=False,
                        file_path=str(md_file),
                    ))

    # ─────────────────────────────────────────────────────────────────────────
    # Report builder
    # ─────────────────────────────────────────────────────────────────────────
    def _build_report(self) -> Dict:
        critical = [f for f in self.findings if f.severity == Severity.CRITICAL.value]
        high = [f for f in self.findings if f.severity == Severity.HIGH.value]
        medium = [f for f in self.findings if f.severity == Severity.MEDIUM.value]
        low = [f for f in self.findings if f.severity == Severity.LOW.value]

        return {
            "summary": {
                "total_findings": len(self.findings),
                "critical": len(critical),
                "high": len(high),
                "medium": len(medium),
                "low": len(low),
                "submission_ready": len(critical) == 0 and len(high) <= 3,
                "scanned_paths": [str(p) for p in self.scan_paths],
            },
            "findings": [asdict(f) for f in self.findings],
            "recommendations": self._recommendations(),
            "auto_fixes_available": len([f for f in self.findings if f.auto_fixable]),
        }

    def _recommendations(self) -> List[str]:
        recs = []
        by_module: Dict[str, List[Finding]] = {}
        for f in self.findings:
            by_module.setdefault(f.module, []).append(f)

        for module, findings in by_module.items():
            crits = [f for f in findings if f.severity == Severity.CRITICAL.value]
            if crits:
                recs.append(f"{module}: Address {len(crits)} critical issue(s) before submission")
            highs = [f for f in findings if f.severity == Severity.HIGH.value]
            if highs:
                recs.append(f"{module}: Review {len(highs)} high-priority finding(s)")

        if not recs:
            recs.append("No critical or high-priority issues found — proceed with review")

        return recs


# ─────────────────────────────────────────────────────────────────────────────
# CLI entry point
# ─────────────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    if len(sys.argv) < 2 or "--help" in sys.argv:
        print("Usage: python agent.py <path1> [path2] ...")
        print("  Scans directories for regulatory compliance issues")
        sys.exit(0)

    paths = sys.argv[1:]
    agent = RegulatoryValidatorAgent(paths)
    report = agent.validate()

    # Write report file
    os.makedirs("reports", exist_ok=True)
    with open("reports/regulatory-validation.json", "w") as f:
        json.dump(report, f, indent=2)

    # Print summary to stdout
    s = report["summary"]
    print(f"\n{'='*60}")
    print(f"  C2C Regulatory Validation Report")
    print(f"{'='*60}")
    print(f"  Scanned: {', '.join(s['scanned_paths'])}")
    print(f"  Total findings: {s['total_findings']}")
    print(f"  Critical: {s['critical']}  High: {s['high']}  Medium: {s['medium']}  Low: {s['low']}")
    print(f"  Submission ready: {'YES' if s['submission_ready'] else 'NO'}")
    print(f"  Auto-fixable: {report['auto_fixes_available']}")
    print(f"{'='*60}")

    for rec in report["recommendations"]:
        print(f"  -> {rec}")

    print(f"\n  Full report: reports/regulatory-validation.json\n")

    # Exit non-zero if critical findings
    if s["critical"] > 0:
        sys.exit(1)
