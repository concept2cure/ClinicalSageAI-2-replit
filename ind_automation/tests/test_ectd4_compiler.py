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


import zipfile
import pytest
from ind_automation.signatures.pki_signer import Part11Signature


class TestDigitalSignatures:
    """21 CFR Part 11 compliance tests."""
    
    def test_document_signature_creates_xades(self, tmp_path):
        """Signed documents must contain XAdES signature XML."""
        from ind_automation.compilers.ectd4_compiler import ECTD4Compiler
        
        # Use existing sample data pattern from earlier tests
        class MockCanvas:
            def __init__(self):
                self.study_id = "SIG-TEST-001"
                self.module = "2.6.2"
                self.section = "Pharmacokinetics"
                self.subsection = None
                self.language = "en"
                self.created_at = "2026-01-01T00:00:00Z"
                self.content_blocks = [
                    {"text": "Cmax was 125.5 ng/mL", "sdt_tag": "pkCmaxValue"}
                ]
                self.events = []
        
        canvas_doc = MockCanvas()
        compiler = ECTD4Compiler(output_dir=str(tmp_path))
        doc = compiler.compile(canvas_doc)
        docx = compiler.generate_docx(doc, canvas_doc)
        
        signer = Part11Signature()  # Test keys
        signed = signer.sign_document(docx, {
            "name": "Dr. Jane Smith",
            "role": "Medical Monitor",
            "user_id": "mon_001",
            "meaning": "Approved for IND submission"
        })
        
        with zipfile.ZipFile(signed) as z:
            assert '_signatures/signatures.xml' in z.namelist()
            sig_xml = z.read('_signatures/signatures.xml')
            assert b'XAdES' in sig_xml or b'XAdESSignatures' in sig_xml
            assert b'DigestValue' in sig_xml
            assert b'SignatureValue' in sig_xml
    
    def test_signature_tamper_detection(self, tmp_path):
        """Changing document after signing must invalidate signature."""
        signer = Part11Signature()
        
        # Create minimal docx for testing
        from docx import Document
        docx_path = tmp_path / "test.docx"
        doc = Document()
        doc.add_paragraph("Test content")
        doc.save(docx_path)
        
        signed = signer.sign_document(docx_path, {"name": "Test", "role": "QA"})
        
        # Verify initially valid
        initial_check = signer.verify_signature(signed)
        assert initial_check["document_hash_match"] is True
        
        # Tamper with document
        tampered_path = tmp_path / "tampered.docx"
        with zipfile.ZipFile(signed, 'r') as zin:
            with zipfile.ZipFile(tampered_path, 'w') as zout:
                for item in zin.namelist():
                    content = zin.read(item)
                    if item.endswith('.xml') and 'document' in item:
                        content = content.replace(b'Test content', b'TAMPERED')
                    zout.writestr(item, content)
        
        tamper_check = signer.verify_signature(tampered_path)
        assert tamper_check["document_hash_match"] is False
        assert tamper_check["valid"] is False

    def test_signature_creates_fhir_audit_event(self, tmp_path, sample_canvas_doc):
        """Signature must create traceable FHIR AuditEvent in backbone."""
        from ind_automation.compilers.ectd4_compiler import ECTD4Compiler

        compiler = ECTD4Compiler(output_dir=str(tmp_path))
        signer = Part11Signature()

        ectd_doc = compiler.compile(sample_canvas_doc)
        signed_path, audited_doc = compiler.sign_and_audit(ectd_doc, sample_canvas_doc, signer, {
            "name": "Dr. Smith",
            "role": "Principal Investigator",
            "user_id": "pi_001"
        })

        sig_events = [e for e in audited_doc.modification_history if isinstance(e.get('type'), dict) and e['type'].get('code') == '110107']
        assert len(sig_events) == 1

        event = sig_events[0]
        details = event["entity"][0]["detail"]
        cert_fp = [d for d in details if d["type"] == "certificate-fingerprint"]
        assert len(cert_fp) == 1
        assert len(cert_fp[0]["valueString"]) == 64  # SHA-256 hex

        hash_pre = [d for d in details if d["type"] == "hash-preimage"]
        assert len(hash_pre) == 1
        assert len(hash_pre[0]["valueString"]) == 64

    def test_signature_audit_references_correct_document(self, tmp_path, sample_canvas_doc):
        """Signature AuditEvent must reference actual document UUID."""
        from ind_automation.compilers.ectd4_compiler import ECTD4Compiler

        compiler = ECTD4Compiler(output_dir=str(tmp_path))
        signer = Part11Signature()

        ectd_doc = compiler.compile(sample_canvas_doc)
        signed_path, audited_doc = compiler.sign_and_audit(ectd_doc, sample_canvas_doc, signer, {
            "name": "Dr. Smith", "role": "PI", "user_id": "pi_001"
        })

        sig_event = [e for e in audited_doc.modification_history if isinstance(e.get('type'), dict) and e['type'].get('code') == '110107'][0]
        assert sig_event["entity"][0]["what"]["reference"] == f"urn:uuid:{audited_doc.document_id}"

    def test_signature_includes_tsa_timestamp(self, tmp_path, monkeypatch):
        """TSA token must be embedded in XAdES and AuditEvent must record TSA info."""
        from ind_automation.compilers.ectd4_compiler import ECTD4Compiler
        from ind_automation.signatures.pki_signer import TSASignature

        # Mock TSA response
        class FakeResp:
            status_code = 200
            content = b'FAKE_TSA_TOKEN'
        def fake_post(url, data=None, headers=None):
            return FakeResp()
        monkeypatch.setattr('requests.post', fake_post)

        compiler = ECTD4Compiler(output_dir=str(tmp_path))
        signer = TSASignature(tsa_url='http://timestamp.digicert.com')

        # Create a minimal canvas doc
        class Canvas:
            def __init__(self):
                self.study_id = 'TSA-001'
                self.module = '2.6.2'
                self.section = 'Pharmacokinetics'
                self.language = 'en'
                self.content_blocks = [{'text': 'TSA test', 'sdt_tag': 't'}]
                self.events = []
                self.created_at = '2026-01-01T00:00:00Z'
        canvas = Canvas()

        ectd_doc = compiler.compile(canvas)

        # Sign with TSA
        signed_path, audited_doc = compiler.sign_and_audit(ectd_doc, canvas, signer, {
            'name': 'TSA User', 'role': 'QA', 'user_id': 'tsa_01'
        })

        # Inspect signatures.xml
        import zipfile
        with zipfile.ZipFile(signed_path) as z:
            sig_xml = z.read('_signatures/signatures.xml')
            assert b'SignatureTimeStamp' in sig_xml or b'EncapsulatedTimeStamp' in sig_xml

        # Verify AuditEvent includes TSA details
        sig_events = [e for e in audited_doc.modification_history if isinstance(e.get('type'), dict) and e['type'].get('code') == '110107']
        assert len(sig_events) == 1
        event = sig_events[0]
        details = event['entity'][0]['detail']
        assert any(d.get('type') == 'tsa-token-present' and d.get('valueBoolean') for d in details)
        assert any(d.get('type') == 'tsa-provider' for d in details)
        assert any(d.get('type') == 'timestamp-rfc3161' for d in details)
