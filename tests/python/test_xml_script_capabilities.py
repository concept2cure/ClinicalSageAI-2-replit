import hashlib
from pathlib import Path
import sys
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from server.utils.write_ectd_xml import write_ectd_xml
from server.utils.write_eu_regional_xml import write_eu_regional_xml
from server.utils.xml_validator import validate_xml


def test_write_ectd_xml_supports_dict_documents_and_md5(tmp_path: Path) -> None:
    doc_path = tmp_path / "doc1.txt"
    doc_path.write_text("clinical payload", encoding="utf-8")
    expected_md5 = hashlib.md5(doc_path.read_bytes()).hexdigest()

    output_dir = tmp_path / "out"
    output_path = write_ectd_xml(
        sequence_id="0001",
        documents=[
            {"doc_id": "D1", "module": "m2.3", "title": "Quality Summary", "file_path": str(doc_path)},
        ],
        meta={"title": "My Submission"},
        output_dir=str(output_dir),
        strict_files=True,
    )

    root = ET.parse(output_path).getroot()
    title = root.find(".//{http://www.ich.org/ectd/v4.0}title")
    checksum = root.find(".//{http://www.ich.org/ectd/v4.0}checksum")
    assert title is not None and title.text == "My Submission"
    assert checksum is not None and checksum.text == expected_md5


def test_write_eu_regional_xml_supports_dict_documents(tmp_path: Path) -> None:
    output_dir = tmp_path / "eu-out"
    output_path = write_eu_regional_xml(
        sequence_id="0002",
        documents=[
            {"doc_id": "D2", "module": "m5.2", "title": "Clinical Study", "file_path": "/tmp/study.pdf"},
        ],
        meta={"applicant": "Acme Bio", "procedure_type": "Centralized"},
        output_dir=str(output_dir),
    )

    root = ET.parse(output_path).getroot()
    applicant = root.find(".//{http://eudamed.europa.eu/schema/cer/v1}applicant-name")
    doc_id = root.find(".//{http://eudamed.europa.eu/schema/cer/v1}doc-id")
    assert applicant is not None and applicant.text == "Acme Bio"
    assert doc_id is not None and doc_id.text == "D2"


def test_validate_xml_with_simple_dtd(tmp_path: Path) -> None:
    dtd_path = tmp_path / "sample.dtd"
    dtd_path.write_text(
        "<!ELEMENT root (item)>\n<!ELEMENT item (#PCDATA)>\n",
        encoding="utf-8",
    )
    xml_path = tmp_path / "sample.xml"
    xml_path.write_text("<root><item>ok</item></root>", encoding="utf-8")

    errors = validate_xml(str(xml_path), str(dtd_path))
    assert errors == []
