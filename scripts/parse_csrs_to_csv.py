#!/usr/bin/env python3
"""Prepare CSR metadata for supervised evaluation without fabricating trial outcomes.

No NLP keyword heuristic may assign trial success. A boolean success label may
only be exported when a human adjudication is marked reviewed and has a source
reference, reviewer, and a defined criterion. All original input JSONs are
read-only; source objects and downstream original reports remain retained.
"""
import argparse
import json
from pathlib import Path
import pandas as pd


def _str(value):
    return value.strip() if isinstance(value, str) else ""


def _adjudication(record):
    review = record.get('success_adjudication')
    if not isinstance(review, dict):
        return {'success': None, 'label_status': 'unreviewed', 'label_source': '', 'label_criterion': '', 'label_reviewer': ''}
    raw = review.get('success')
    reviewed = review.get('reviewed') is True
    source = _str(review.get('source_reference'))
    criterion = _str(review.get('criterion'))
    reviewer = _str(review.get('reviewer'))
    if not reviewed or not source or not criterion or not reviewer or type(raw) is not bool:
        return {'success': None, 'label_status': 'unreviewed', 'label_source': '', 'label_criterion': '', 'label_reviewer': ''}
    return {'success': int(raw), 'label_status': 'reviewed', 'label_source': source, 'label_criterion': criterion, 'label_reviewer': reviewer}


def parse_csrs_to_csv(input_dir='data/processed_csrs', output_file='data/csr_dataset.csv'):
    """Read structured JSON, preserving unknown trial outcomes as missing labels.

    This is a metadata/export utility, not model training, scientific adjudication,
    or evidence admission. Do not use its output for efficacy conclusions.
    """
    input_path = Path(input_dir)
    if not input_path.is_dir():
        print(f'Input directory {input_dir} does not exist; no output written.')
        return None
    records = []
    for file_path in sorted(input_path.glob('*.json')):
        try:
            csr = json.loads(file_path.read_text(encoding='utf-8'))
            if not isinstance(csr, dict):
                raise ValueError('CSR JSON must contain an object')
            endpoints = csr.get('primary_endpoints')
            primary = _str(endpoints[0]) if isinstance(endpoints, list) and endpoints else ''
            phase = _str(csr.get('phase'))
            records.append({
                'nct_id': _str(csr.get('nct_id')) or file_path.stem,
                'indication': _str(csr.get('indication')),
                'phase': phase.removeprefix('Phase ').strip(),
                'sample_size': csr.get('sample_size'),
                'duration_weeks': csr.get('duration_weeks'),
                'dropout_rate': csr.get('dropout_rate'),
                'endpoint_primary': primary,
                'control_type': _str(csr.get('control_arm')),
                'blinding': _str(csr.get('blinding')),
                'failure_reason': _str(csr.get('failure_reason')),
                **_adjudication(csr),
            })
        except (ValueError, OSError, UnicodeError, TypeError) as exc:
            print(f'Ignored {file_path.name}: {exc}')
    if not records:
        print('No valid CSR JSON found; no output written.')
        return None
    df = pd.DataFrame.from_records(records)
    output = Path(output_file)
    output.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(output, index=False)
    reviewed = int((df.label_status == 'reviewed').sum())
    print(f'Exported {len(df)} CSR metadata records; {reviewed} reviewed outcome labels, {len(df)-reviewed} unreviewed. No labels inferred from prose.')
    return df


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='CSR metadata export (reviewed outcome labels only)')
    parser.add_argument('--input', default='data/processed_csrs')
    parser.add_argument('--output', default='data/csr_dataset.csv')
    args = parser.parse_args()
    parse_csrs_to_csv(args.input, args.output)
