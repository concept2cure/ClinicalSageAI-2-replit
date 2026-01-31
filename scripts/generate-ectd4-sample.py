#!/usr/bin/env python3
"""
Generate a sample eCTD4 document and backbone JSON for CI smoke tests.
"""
import argparse
import json
from pathlib import Path
from ind_automation.compilers.ectd4_compiler import ECTD4Compiler


class MockCanvas:
    def __init__(self, study_id='SMOKE-001', module='2.6.2', section='Pharmacokinetics'):
        self.study_id = study_id
        self.module = module
        self.section = section
        self.subsection = None
        self.language = 'en'
        self.created_at = '2026-01-01T00:00:00Z'
        self.content_blocks = [{'text': 'Cmax 125.5 ng/mL', 'sdt_tag': 'pkCmaxValue'}]
        self.events = [
            {
                'id': 'evt-smoke-1',
                'timestamp': '2026-01-01T12:00:00Z',
                'type': 'AI_GENERATION',
                'user': {'id': 'ai_001', 'name': 'Concept2Cure AI'},
                'ai_context': {'confidence': 0.95, 'model': 'gpt-4-turbo', 'rag_source': 'study_report.pdf#page=12'}
            }
        ]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--module', default='2.6.2')
    parser.add_argument('--output', default='./test-artifacts')
    args = parser.parse_args()

    out_dir = Path(args.output)
    out_dir.mkdir(parents=True, exist_ok=True)

    canvas = MockCanvas(module=args.module)

    compiler = ECTD4Compiler(output_dir=str(out_dir))
    ectd_doc = compiler.compile(canvas)
    docx_path = compiler.generate_docx(ectd_doc, canvas)

    backbone = compiler.generate_backbone([ectd_doc])
    backbone_path = out_dir / 'ectd.json'
    backbone_path.write_text(json.dumps(backbone, indent=2))

    print('Generated:', docx_path)
    print('Backbone:', backbone_path)


if __name__ == '__main__':
    main()
