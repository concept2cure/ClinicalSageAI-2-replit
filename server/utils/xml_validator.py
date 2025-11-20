# xml_validator.py – DTD validation for eCTD XML
# Requires: lxml
from lxml import etree
import os

class ValidationError(Exception):
    pass


def validate_xml(xml_path: str, dtd_file: str) -> list:
    """
    Validate an XML file against a DTD. Returns a list of error strings.
    """
    if not os.path.isfile(xml_path):
        raise FileNotFoundError(f"XML file not found: {xml_path}")
    if not os.path.isfile(dtd_file):
        raise FileNotFoundError(f"DTD file not found: {dtd_file}")

    parser = etree.XMLParser(dtd_validation=False, load_dtd=True)
    tree = etree.parse(xml_path, parser)
    dtd = etree.DTD(dtd_file)
    valid = dtd.validate(tree)
    if valid:
        return []
    # collect error log messages
    return [str(error) for error in dtd.error_log]


def validate_sequence_xml(sequence_id: str) -> dict:
    """
    Validate both index.xml and us-regional.xml for a given sequence.
    Returns dict with 'index' and 'regional' keys listing errors.
    """
    base = f"/mnt/data/ectd/{sequence_id}"
    index_path = os.path.join(base, 'index.xml')
    regional_path = os.path.join(base, 'us-regional.xml')
    dtd_dir = '/mnt/data/ectd/util/dtd'
    index_dtd = os.path.join(dtd_dir, 'index.dtd')
    regional_dtd = os.path.join(dtd_dir, 'us-regional.dtd')

    errors = {}
    errors['index'] = validate_xml(index_path, index_dtd)
    errors['regional'] = validate_xml(regional_path, regional_dtd)
    return errors