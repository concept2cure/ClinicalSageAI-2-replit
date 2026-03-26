import json
import subprocess
import tempfile
from pathlib import Path
import unittest

from scripts.aios_controls_parser import parse_control_ids, parse_controls, parse_exit_gates

ROOT = Path(__file__).resolve().parents[1]
GEN_SCRIPT = ROOT / "scripts" / "generate_aios_evidence_pack.py"
VAL_SCRIPT = ROOT / "scripts" / "validate_aios_audit_assets.py"
SAMPLE_METRICS = ROOT / "docs" / "aios" / "sample_evidence_metrics.json"
DEFAULT_CONTROLS = ROOT / "docs" / "aios" / "AIOS_AUDIT_CONTROLS.yaml"


class TestAIOSAuditTooling(unittest.TestCase):
    def test_generate_evidence_pack_creates_expected_sections(self):
        with tempfile.TemporaryDirectory() as tmp_dir:
            out = Path(tmp_dir) / "evidence.md"
            summary = Path(tmp_dir) / "summary.json"
            cmd = [
                "python3",
                str(GEN_SCRIPT),
                "--metrics",
                str(SAMPLE_METRICS),
                "--controls",
                str(DEFAULT_CONTROLS),
                "--output",
                str(out),
                "--summary-output",
                str(summary),
            ]
            subprocess.run(cmd, check=True, cwd=ROOT)
            text = out.read_text(encoding="utf-8")
            summary_obj = json.loads(summary.read_text(encoding="utf-8"))

        self.assertIn("# AIOS Evidence Pack (Generated)", text)
        self.assertIn("## Exit Gate Validation", text)
        self.assertIn("Overall pilot gate decision:", text)
        self.assertIn("decision", summary_obj)
        self.assertIn("gates", summary_obj)

    def test_generate_fails_when_gate_fails_with_flag(self):
        with tempfile.TemporaryDirectory() as tmp_dir:
            failing_metrics = Path(tmp_dir) / "failing_metrics.json"
            out = Path(tmp_dir) / "evidence.md"
            summary = Path(tmp_dir) / "summary.json"

            metrics = json.loads(SAMPLE_METRICS.read_text(encoding="utf-8"))
            metrics["sev1_incidents"] = 1
            failing_metrics.write_text(json.dumps(metrics), encoding="utf-8")

            cmd = [
                "python3",
                str(GEN_SCRIPT),
                "--metrics",
                str(failing_metrics),
                "--controls",
                str(DEFAULT_CONTROLS),
                "--output",
                str(out),
                "--summary-output",
                str(summary),
                "--fail-on-gate-fail",
            ]
            result = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True)

        self.assertEqual(result.returncode, 2, result.stdout + result.stderr)
        self.assertIn("AIOS exit-gate decision is FAIL", result.stdout)


    def test_generate_fails_when_control_fails_with_flag(self):
        with tempfile.TemporaryDirectory() as tmp_dir:
            failing_metrics = Path(tmp_dir) / "failing_metrics.json"
            out = Path(tmp_dir) / "evidence.md"
            summary = Path(tmp_dir) / "summary.json"

            metrics = json.loads(SAMPLE_METRICS.read_text(encoding="utf-8"))
            metrics["version_drift_events"] = 1
            failing_metrics.write_text(json.dumps(metrics), encoding="utf-8")

            cmd = [
                "python3",
                str(GEN_SCRIPT),
                "--metrics",
                str(failing_metrics),
                "--controls",
                str(DEFAULT_CONTROLS),
                "--output",
                str(out),
                "--summary-output",
                str(summary),
                "--fail-on-control-fail",
            ]
            result = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True)

        self.assertEqual(result.returncode, 3, result.stdout + result.stderr)
        self.assertIn("AIOS control decision is FAIL", result.stdout)

    def test_generate_control_status_uses_yaml_thresholds(self):
        with tempfile.TemporaryDirectory() as tmp_dir:
            temp_controls = Path(tmp_dir) / "controls.yaml"
            temp_controls.write_text(DEFAULT_CONTROLS.read_text(encoding="utf-8"), encoding="utf-8")

            # Raise one control threshold above sample metrics to force AIOS-01 fail.
            controls_text = temp_controls.read_text(encoding="utf-8")
            controls_text = controls_text.replace("lineage_completeness_pct: 99", "lineage_completeness_pct: 99.9", 1)
            temp_controls.write_text(controls_text, encoding="utf-8")

            out = Path(tmp_dir) / "evidence.md"
            summary = Path(tmp_dir) / "summary.json"
            cmd = [
                "python3",
                str(GEN_SCRIPT),
                "--metrics",
                str(SAMPLE_METRICS),
                "--controls",
                str(temp_controls),
                "--output",
                str(out),
                "--summary-output",
                str(summary),
            ]
            subprocess.run(cmd, check=True, cwd=ROOT)
            text = out.read_text(encoding="utf-8")

        self.assertIn("| AIOS-01 | Fail |", text)

    def test_controls_parser_reads_control_specs_and_exit_gates(self):
        control_ids = parse_control_ids(DEFAULT_CONTROLS)
        controls = parse_controls(DEFAULT_CONTROLS)
        gates = parse_exit_gates(DEFAULT_CONTROLS)

        self.assertGreaterEqual(len(control_ids), 7)
        self.assertEqual(len(control_ids), len(controls))
        self.assertIn("AIOS-01", control_ids)
        self.assertTrue(any(metric == "sev1_incidents" for metric, _, _ in gates))

    def test_validate_assets_returns_success(self):
        with tempfile.TemporaryDirectory() as tmp_dir:
            evidence = Path(tmp_dir) / "evidence.md"
            summary = Path(tmp_dir) / "summary.json"

            subprocess.run(
                [
                    "python3",
                    str(GEN_SCRIPT),
                    "--metrics",
                    str(SAMPLE_METRICS),
                    "--controls",
                    str(DEFAULT_CONTROLS),
                    "--output",
                    str(evidence),
                    "--summary-output",
                    str(summary),
                ],
                check=True,
                cwd=ROOT,
            )

            cmd = [
                "python3",
                str(VAL_SCRIPT),
                "--controls",
                str(DEFAULT_CONTROLS),
                "--metrics",
                str(SAMPLE_METRICS),
                "--evidence-pack",
                str(evidence),
                "--summary",
                str(summary),
            ]
            result = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True)

        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn("validation passed", result.stdout.lower())


if __name__ == "__main__":
    unittest.main()
