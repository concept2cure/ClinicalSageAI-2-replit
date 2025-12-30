#!/usr/bin/env python3
"""Create a minimal eCTD-like submission bundle using available CSR and evidence.
This is a starter script to assemble folders and a simple index; not a full eCTD generator.
"""
import os
import shutil
import sys
from datetime import datetime

BASE = 'regulatory/CER/SAMPLE_STUDY/ectd_submission'

MODULES = {
    'm1': 'Administrative information and prescribing information',
    'm2': 'Quality (not used in this demo)',
    'm3': 'Nonclinical (not used in this demo)',
    'm4': 'Clinical study reports and evidence',
    'appendix': 'Appendices and supporting evidence'
}


def make_structure():
    if os.path.exists(BASE):
        shutil.rmtree(BASE)
    os.makedirs(BASE)
    for m in MODULES.keys():
        os.makedirs(os.path.join(BASE, m))
    # copy CSR PDF to m4
    csr_pdf = 'regulatory/CER/SAMPLE_STUDY/CSR_DRAFT.pdf'
    if os.path.exists(csr_pdf):
        shutil.copy2(csr_pdf, os.path.join(BASE, 'm4', os.path.basename(csr_pdf)))
    # copy evidence package to appendix
    evzip = 'evidence_package.zip'
    if os.path.exists(evzip):
        shutil.copy2(evzip, os.path.join(BASE, 'appendix', os.path.basename(evzip)))
    # create a simple submission index
    with open(os.path.join(BASE, 'submission_index.txt'), 'w') as fh:
        fh.write(f'Submission assembled: {datetime.utcnow().isoformat()}Z\n')
        for m, desc in MODULES.items():
            fh.write(f'{m}: {desc}\n')
        fh.write('\nContents:\n')
        for root, dirs, files in os.walk(BASE):
            for f in files:
                fh.write(os.path.join(root.replace(BASE+'/', ''), f) + '\n')
    # zip the folder
    shutil.make_archive(BASE, 'zip', BASE)
    print(f'Created eCTD package: {BASE}.zip')


if __name__ == '__main__':
    make_structure()
