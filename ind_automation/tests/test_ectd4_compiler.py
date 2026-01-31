"""
Pure eCTD 4.0 compliance tests.
Validates: FHIR AuditEvents, XMP metadata, 2-6-2 filenames, JSON backbone.
"""

import pytest
import json
from datetime import datetime
from ind_automation.compilers.ectd4_compiler import ECTD4Compiler


@pytest.fixture
def sample_canvas_doc():
    """Mock Canvas document for testing."""
    class MockCanvas:
        def __init__(self):
            self.study_id = "TEST-001"
            self.module = "2.6.2"
            self.section = "Pharmacokinetics"
            self.subsection = None
            self.language = "en"
            self.created_at = "2026-01-01T00:00:00Z"
            self.content_blocks = [
                {"text": "Cmax was 125.5 ng/mL", "sdt_tag": "pkCmaxValue"}
            ]
            self.events = [
                {
                    "id": "evt-001",
                    "timestamp": "2026-01-01T12:00:00Z",
                    "type": "AI_GENERATION",
                    "user": {"id": "ai_001", "name": "Concept2Cure AI"},
                    "ai_context": {
                        "confidence": 0.94,
                        "model": "gpt-4-turbo",
                        "rag_source": "study_report_001.pdf#page=10"
                    }
                }
            ]
    return MockCanvas()


class TestECTD4Compiler:
    """eCTD 4.0 native compliance."""

    def test_filename_no_m_prefix(self, sample_canvas_doc, tmp_path):
        compiler = ECTD4Compiler(output_dir=str(tmp_path))
        result = compiler.compile(sample_canvas_doc)

        assert not result.file_name.startswith("m"), f"Legacy 3.2.2 'm' prefix detected: {result.file_name}"
        assert result.file_name.startswith("2-6-2"), f"Wrong format, expected 2-6-2-*: {result.file_name}"
        assert result.file_name.endswith("-en.docx")

    def test_fhir_audit_event_structure(self, sample_canvas_doc, tmp_path):
        compiler = ECTD4Compiler(output_dir=str(tmp_path))
        result = compiler.compile(sample_canvas_doc)

        assert len(result.modification_history) == 1
        event = result.modification_history[0]

        assert event["resourceType"] == "AuditEvent"
        assert "agent" in event
        assert event["agent"][0]["who"]["identifier"]["value"] == "ai_001"
        assert "entity" in event

        details = event["entity"][0]["detail"]
        confidence = [d for d in details if d["type"] == "confidence-score"]
        assert len(confidence) == 1
        assert confidence[0]["valueDecimal"] == 0.94

    def test_xmp_not_custom_xml(self, sample_canvas_doc, tmp_path):
        compiler = ECTD4Compiler(output_dir=str(tmp_path))
        ectd_doc = compiler.compile(sample_canvas_doc)
        docx_path = compiler.generate_docx(ectd_doc, sample_canvas_doc)

        import zipfile
        with zipfile.ZipFile(docx_path) as z:
            assert 'docProps/custom.xml' not in z.namelist(), "Legacy custom.xml found (eCTD 3.2.2 artifact)"
            assert 'docProps/core.xml.xmp' in z.namelist(), "Missing XMP metadata (eCTD 4.0 required)"
            xmp = z.read('docProps/core.xml.xmp').decode('utf-8')
            assert '2.6.2' in xmp
            assert 'sha256' in xmp

    def test_json_backbone_not_xml(self, sample_canvas_doc, tmp_path):
        compiler = ECTD4Compiler(output_dir=str(tmp_path))
        ectd_doc = compiler.compile(sample_canvas_doc)
        backbone = compiler.generate_backbone([ectd_doc])

        assert backbone["ectdVersion"] == "4.0"
        assert "documents" in backbone
        assert isinstance(backbone["documents"], list)
        assert backbone["documents"][0]["documentType"] == "2.6.2"
        assert "modificationHistory" in backbone["documents"][0]

    def test_content_hash_integrity(self, sample_canvas_doc, tmp_path):
        compiler = ECTD4Compiler(output_dir=str(tmp_path))
        result = compiler.compile(sample_canvas_doc)

        assert len(result.content_hash) == 64
        assert all(c in '0123456789abcdef' for c in result.content_hash)

    def test_alcoa_plus_flags(self, sample_canvas_doc, tmp_path):
        compiler = ECTD4Compiler(output_dir=str(tmp_path))
        result = compiler.compile(sample_canvas_doc)

        assert result.data_integrity["attributable"] is True
        assert result.data_integrity["accurate"] is True
        assert result.data_integrity["complete"] is True
        assert result.data_integrity["schemaVersion"] == "ALCOA-v2-ectd4"

    def test_specification_level_2(self, sample_canvas_doc, tmp_path):
        compiler = ECTD4Compiler(output_dir=str(tmp_path))
        result = compiler.compile(sample_canvas_doc)

        assert result.specification_level == "2"
