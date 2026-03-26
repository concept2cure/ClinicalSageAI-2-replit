import json
import subprocess
import tempfile
from pathlib import Path
import unittest

from scripts.aios_controls_parser import parse_control_ids, parse_exit_gates

ROOT = Path(__file__).resolve().parents[1]
GEN_SCRIPT = ROOT / "scripts" / "generate_aios_evidence_pack.py"
VAL_SCRIPT = ROOT / "scripts" / "validate_aios_audit_assets.py"
SAMPLE_METRICS = ROOT / "docs" / "aios" / "sample_evidence_metrics.json"


class TestAIOSAuditTooling(unittest.TestCase):
    def test_generate_evidence_pack_creates_expected_sections(self):
        with tempfile.TemporaryDirectory() as tmp_dir:
            out = Path(tmp_dir) / "evidence.md"
            cmd = [
                "python3",
                str(GEN_SCRIPT),
                "--metrics",
                str(SAMPLE_METRICS),
                "--output",
                str(out),
            ]
            subprocess.run(cmd, check=True, cwd=ROOT)
            text = out.read_text(encoding="utf-8")

        self.assertIn("# AIOS Evidence Pack (Generated)", text)
        self.assertIn("## Exit Gate Validation", text)
        self.assertIn("Overall pilot gate decision:", text)

    def test_generate_fails_when_gate_fails_with_flag(self):
        with tempfile.TemporaryDirectory() as tmp_dir:
            failing_metrics = Path(tmp_dir) / "failing_metrics.json"
            out = Path(tmp_dir) / "evidence.md"

            metrics = json.loads(SAMPLE_METRICS.read_text(encoding="utf-8"))
            metrics["sev1_incidents"] = 1
            failing_metrics.write_text(json.dumps(metrics), encoding="utf-8")

            cmd = [
                "python3",
                str(GEN_SCRIPT),
                "--metrics",
                str(failing_metrics),
                "--output",
                str(out),
                "--fail-on-gate-fail",
            ]
            result = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True)

        self.assertEqual(result.returncode, 2, result.stdout + result.stderr)
        self.assertIn("AIOS exit-gate decision is FAIL", result.stdout)


    def test_controls_parser_reads_ids_and_exit_gates(self):
        controls = ROOT / "docs" / "aios" / "AIOS_AUDIT_CONTROLS.yaml"
        control_ids = parse_control_ids(controls)
        gates = parse_exit_gates(controls)

        self.assertGreaterEqual(len(control_ids), 7)
        self.assertIn("AIOS-01", control_ids)
        self.assertTrue(any(metric == "sev1_incidents" for metric, _, _ in gates))

    def test_validate_assets_returns_success(self):
        cmd = ["python3", str(VAL_SCRIPT)]
        result = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn("validation passed", result.stdout.lower())


if __name__ == "__main__":
    unittest.main()
