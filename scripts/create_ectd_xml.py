#!/usr/bin/env python3
"""Create an eCTD XML submission package from metadata.
Reads `ectd_metadata.yml` in the study folder and maps assets to leaf nodes.
Generates `submission.xml` and `sequence.xml` with file SHA256 checksums and zips the sequence.
"""
import os
import argparse
import shutil
import hashlib
import xml.etree.ElementTree as ET
from datetime import datetime

try:
    import yaml
except Exception:
    print('PyYAML is required. Install via `pip install pyyaml`')
    raise

ET.register_namespace('', 'urn:ietf:params:xml:ns:eCTD-1.0')
BASE_DIR = 'regulatory/CER'


def sha256(path):
    h = hashlib.sha256()
    with open(path, 'rb') as fh:
        while True:
            b = fh.read(8192)
            if not b:
                break
            h.update(b)
    return h.hexdigest()


def load_metadata(study):
    meta_path = os.path.join(BASE_DIR, study, 'ectd_metadata.yml')
    if not os.path.exists(meta_path):
        raise FileNotFoundError(f'Metadata file not found: {meta_path}')
    with open(meta_path) as fh:
        return yaml.safe_load(fh)


def build_from_metadata(study, metadata):
    seq = int(metadata.get('seq', 0))
    title = metadata.get('title', f'{study} submission')
    applicant = metadata.get('applicant', 'Unknown')

    base = os.path.join(BASE_DIR, study, 'ectd_xml')
    seqdir = os.path.join(base, f'seq{seq:04d}')
    if os.path.exists(seqdir):
        shutil.rmtree(seqdir)
    os.makedirs(seqdir, exist_ok=True)

    # Prepare modules mentioned in metadata
    modules = set([f.get('module', 'appendix') for f in metadata.get('files', [])])
    for m in modules:
        os.makedirs(os.path.join(seqdir, m), exist_ok=True)

    # Copy files into appropriate module folders as specified
    for item in metadata.get('files', []):
        src = item['src']
        module = item.get('module', 'appendix')
        dest_name = item.get('dest_name', os.path.basename(src))
        if not os.path.exists(src):
            print(f'Warning: source {src} not found, skipping')
            continue
        shutil.copy2(src, os.path.join(seqdir, module, dest_name))

    # Build submission.xml
    submission = ET.Element('submission', attrib={'xmlns': 'urn:ietf:params:xml:ns:eCTD-1.0'})
    header = ET.SubElement(submission, 'header')
    ET.SubElement(header, 'document-type').text = 'eCTD-1'
    ET.SubElement(header, 'submission-date').text = datetime.utcnow().isoformat()+'Z'
    ET.SubElement(header, 'submission-title').text = title
    ET.SubElement(header, 'applicant').text = applicant
    ET.SubElement(header, 'country').text = metadata.get('country', 'US')
    ET.SubElement(header, 'agency').text = metadata.get('agency', 'FDA')
    ET.SubElement(header, 'submission-type').text = metadata.get('submission_type', '510(k)')

    modules_el = ET.SubElement(submission, 'modules')

    # Add modules and leaf entries
    for m in sorted(modules):
        mod_el = ET.SubElement(modules_el, 'module')
        ET.SubElement(mod_el, 'name').text = m
        leaves_el = ET.SubElement(mod_el, 'leaves')
        # find files for this module
        module_path = os.path.join(seqdir, m)
        for fname in sorted(os.listdir(module_path)) if os.path.exists(module_path) else []:
            f_el = ET.SubElement(leaves_el, 'leaf')
            ET.SubElement(f_el, 'title').text = fname
            ET.SubElement(f_el, 'href').text = os.path.join(m, fname).replace('\\', '/')
            ET.SubElement(f_el, 'sha256').text = sha256(os.path.join(module_path, fname))

    subpath = os.path.join(seqdir, 'submission.xml')
    ET.ElementTree(submission).write(subpath, encoding='utf-8', xml_declaration=True)

    # Create sequence.xml with file manifest
    manifest = ET.Element('sequence', attrib={'xmlns': 'urn:ietf:params:xml:ns:eCTD-1.0'})
    ET.SubElement(manifest, 'sequence-number').text = str(seq)
    ET.SubElement(manifest, 'submission-title').text = title
    ET.SubElement(manifest, 'applicant').text = applicant
    ET.SubElement(manifest, 'created').text = datetime.utcnow().isoformat()+'Z'

    files_el = ET.SubElement(manifest, 'files')
    for root, dirs, files in os.walk(seqdir):
        for f in files:
            fpath = os.path.join(root, f)
            rel = os.path.relpath(fpath, seqdir).replace('\\', '/')
            fentry = ET.SubElement(files_el, 'file')
            ET.SubElement(fentry, 'href').text = rel
            ET.SubElement(fentry, 'sha256').text = sha256(fpath)

    ET.ElementTree(manifest).write(os.path.join(seqdir, 'sequence.xml'), encoding='utf-8', xml_declaration=True)

    # Zip the sequence
    shutil.make_archive(os.path.join(base, f'seq{seq:04d}'), 'zip', seqdir)
    print(f'Created eCTD XML package at {os.path.join(base, f"seq{seq:04d}.zip")}')
    return os.path.join(base, f'seq{seq:04d}.zip')


if __name__ == '__main__':
    p = argparse.ArgumentParser()
    p.add_argument('--study', required=True)
    p.add_argument('--meta', help='Path to metadata yaml inside study folder', default=None)
    args = p.parse_args()
    metadata = load_metadata(args.study) if args.meta is None else None
    if args.meta:
        import yaml as _yaml
        with open(args.meta) as fh:
            metadata = _yaml.safe_load(fh)
    out = build_from_metadata(args.study, metadata)
    print('Done:', out)
