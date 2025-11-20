from pathlib import Path
import shutil, hashlib, zipfile, io, datetime, os
from lxml import etree

DTD_INDEX = "<!DOCTYPE ectd [<!ENTITY file 'index'>]>"  # placeholder

BASE = Path("ectd")
LEAFS = {
    "m1/1571.docx":        {"title": "Form 1571", "operation": "new"},
    "m1/1572.docx":        {"title": "Form 1572", "operation": "new"},
    "m1/3674.docx":        {"title": "Form 3674", "operation": "new"},
    "m3/module3.docx":     {"title": "Module 3 CMC", "operation": "new"},
    "m2/quality.docx":     {"title": "Module 2.3 Quality Summary", "operation": "new"},
    "m2/nonclinical.docx": {"title": "Module 2.4 Nonclinical Overview", "operation": "new"},
    "m2/clinical.docx":    {"title": "Module 2.5 Clinical Overview", "operation": "new"},
}

TEMPLATE_DIR = Path("templates/forms")
OUTPUT_DIR   = Path("output")

# --------------------------- helpers ---------------------------

def _md5(path: Path):
    h = hashlib.md5()
    h.update(path.read_bytes())
    return h.hexdigest()

def _leaf(parent, rel_path, title, checksum, operation):
    # Set the xlink namespace at the root level
    if parent.tag == "ectd" and "{http://www.w3.org/1999/xlink}" not in parent.nsmap:
        # Fix namespace handling in lxml
        nsmap = {"xlink": "http://www.w3.org/1999/xlink"}
        root_with_ns = etree.Element("ectd", nsmap=nsmap)
        # Copy existing children
        for child in parent:
            root_with_ns.append(child)
        # Replace original content
        parent.clear()
        for k, v in root_with_ns.attrib.items():
            parent.set(k, v)
        # Copy namespace
        parent.nsmap.update(nsmap)
    
    # Create leaf with proper attributes
    leaf = etree.SubElement(parent, "leaf", {
        "href": rel_path,
        "operation": operation,
        "checksum": checksum,
        "checksumType": "md5",
    })
    etree.SubElement(leaf, "title").text = title
    return leaf

# --------------------------- builder ---------------------------

def build_sequence(pid: str, serial: str):
    seq_dir = BASE / pid / serial
    seq_dir.mkdir(parents=True, exist_ok=True)
    # 1) copy leaf files
    for tgt, meta in LEAFS.items():
        src = (OUTPUT_DIR / tgt.split("/")[-1]).with_suffix(".docx")
        if not src.exists():
            # skip missing optional sections
            continue
        dest = seq_dir / tgt
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, dest)

    # 2) build index.XML
    root = etree.Element("ectd")
    seq_el = etree.SubElement(root, "sequence")
    seq_el.text = serial
    for rel, meta in LEAFS.items():
        dest = seq_dir / rel
        if dest.exists():
            _leaf(root, rel, meta["title"], _md5(dest), meta["operation"])

    index_path = seq_dir / "index.xml"
    xml_bytes = etree.tostring(root, pretty_print=True, xml_declaration=True, encoding="utf-8")
    index_path.write_bytes(xml_bytes)

    # 3) regional placeholder
    (seq_dir / "us-regional.xml").write_text("<regional/>")

    # 4) checksums file
    with open(seq_dir / "checksum.md5", "w") as f:
        for rel, meta in LEAFS.items():
            p = seq_dir / rel
            if p.exists():
                f.write(f"{_md5(p)}  {rel}\n")

    # 5) zip the entire application folder (not just sequence) so user sees tree
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for file in seq_dir.rglob("*"):
            zf.write(file, arcname=file.relative_to(BASE / pid))
    buf.seek(0)
    return buf
