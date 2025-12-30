#!/usr/bin/env python3
"""Create a minimal eCTD XML submission (sequence + module XML)
This script generates a minimal eCTD-like XML structure suitable for review and further enrichment.
It is NOT a full eCTD validator but provides a starting point for producing submission XML files.

Usage: python3 scripts/create_ectd_xml.py --study SAMPLE_STUDY --seq 0000 --title "Study title" --applicant "Sponsor Name"
"""
import os
import argparse
import shutil
import hashlib
import xml.etree.ElementTree as ET
from datetime import datetime

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


def build_structure(study, seq, title, applicant):
    base = os.path.join(BASE_DIR, study, 'ectd_xml')
    seqdir = os.path.join(base, f'seq{seq:04d}')
    if os.path.exists(seqdir):
        shutil.rmtree(seqdir)
    os.makedirs(seqdir, exist_ok=True)

    # create simple module directories
    modules = {'m1': 'm1', 'm4': 'm4', 'appendix': 'appendix'}
    for m in modules.values():
        os.makedirs(os.path.join(seqdir, m), exist_ok=True)

    # copy CSR PDF to m4
    csr_pdf = os.path.join(BASE_DIR, study, 'CSR_DRAFT.pdf')
    if os.path.exists(csr_pdf):
        shutil.copy2(csr_pdf, os.path.join(seqdir, 'm4', os.path.basename(csr_pdf)))

    # copy evidence package to appendix
    evzip = 'evidence_package.zip'
    if os.path.exists(evzip):
        shutil.copy2(evzip, os.path.join(seqdir, 'appendix', os.path.basename(evzip)))

    # generate index (submission.xml)
    submission = ET.Element('submission', attrib={'xmlns': 'urn:ietf:params:xml:ns:eCTD-1.0'})
    header = ET.SubElement(submission, 'header')
    ET.SubElement(header, 'document-type').text = 'eCTD-1'
    ET.SubElement(header, 'submission-date').text = datetime.utcnow().isoformat()+'Z'
    ET.SubElement(header, 'submission-title').text = title
    ET.SubElement(header, 'applicant').text = applicant

    # add module refs
    modules_el = ET.SubElement(submission, 'modules')
    for m in ['m1', 'm4', 'appendix']:
        mod = ET.SubElement(modules_el, 'module')
        ET.SubElement(mod, 'name').text = m
        # list files for the module
        list_el = ET.SubElement(mod, 'files')
        modpath = os.path.join(seqdir, m)
        for fname in sorted(os.listdir(modpath)) if os.path.exists(modpath) else []:
            f_el = ET.SubElement(list_el, 'file')
            ET.SubElement(f_el, 'href').text = os.path.join(m, fname)
            ET.SubElement(f_el, 'sha256').text = sha256(os.path.join(modpath, fname))

    # write submission.xml
    tree = ET.ElementTree(submission)
    subpath = os.path.join(seqdir, 'submission.xml')
    tree.write(subpath, encoding='utf-8', xml_declaration=True)

    # create a simple sequence manifest
    manifest = ET.Element('sequence', attrib={'xmlns': 'urn:ietf:params:xml:ns:eCTD-1.0'})
    ET.SubElement(manifest, 'sequence-number').text = str(int(seq))
    ET.SubElement(manifest, 'submission-title').text = title
    ET.SubElement(manifest, 'applicant').text = applicant
    ET.SubElement(manifest, 'created').text = datetime.utcnow().isoformat()+'Z'

    # add file entries
    files_el = ET.SubElement(manifest, 'files')
    for root, dirs, files in os.walk(seqdir):
        for f in files:
            fpath = os.path.join(root, f)
            rel = os.path.relpath(fpath, seqdir)
            fentry = ET.SubElement(files_el, 'file')
            ET.SubElement(fentry, 'href').text = rel.replace('\\', '/')
            ET.SubElement(fentry, 'sha256').text = sha256(fpath)

    tree = ET.ElementTree(manifest)
    tree.write(os.path.join(seqdir, 'sequence.xml'), encoding='utf-8', xml_declaration=True)

    # zip the seqdir
    shutil.make_archive(os.path.join(base, f'seq{seq:04d}'), 'zip', seqdir)
    print(f'Created eCTD XML package at {os.path.join(base, f"seq{seq:04d}.zip")}')
    return os.path.join(base, f'seq{seq:04d}.zip')


if __name__ == '__main__':
    p = argparse.ArgumentParser()
    p.add_argument('--study', required=True)
    p.add_argument('--seq', required=True, type=int)
    p.add_argument('--title', required=True)
    p.add_argument('--applicant', required=True)
    args = p.parse_args()
    out = build_structure(args.study, args.seq, args.title, args.applicant)
    print('Done:', out)
