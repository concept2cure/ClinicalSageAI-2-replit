"""Regression checks: CSR outcome labels require human evidence adjudication."""
import json
import sys
from pathlib import Path
import tempfile
import unittest
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from parse_csrs_to_csv import parse_csrs_to_csv


class CsrDatasetSafetyTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.folder = Path(self.tmp.name)

    def _run(self, record):
        inputs = self.folder / 'inputs'
        inputs.mkdir(exist_ok=True)
        (inputs / 'record.json').write_text(json.dumps(record), encoding='utf-8')
        return parse_csrs_to_csv(inputs, self.folder / 'result.csv').iloc[0]

    def test_negated_significance_is_not_success(self):
        item = self._run({'outcome_summary': 'The primary endpoint was not statistically significant.'})
        self.assertEqual(item.label_status, 'unreviewed')
        self.assertTrue(pd.isna(item.success))

    def test_positive_headline_is_not_adjudication(self):
        item = self._run({'outcome_summary': 'Met endpoint; significant positive results'})
        self.assertEqual(item.label_status, 'unreviewed')

    def test_unsupported_review_does_not_label(self):
        item = self._run({'success_adjudication': {'success': True, 'reviewed': True}})
        self.assertEqual(item.label_status, 'unreviewed')

    def test_reviewed_negative_is_zero(self):
        item = self._run({'success_adjudication': {'success': False, 'reviewed': True, 'reviewer': 'Scientific reviewer', 'criterion': 'Primary endpoint met prespecified success rule', 'source_reference': 'final-analysis:T14'}})
        self.assertEqual(item.success, 0)
        self.assertEqual(item.label_status, 'reviewed')

    def test_reviewed_positive_is_one(self):
        item = self._run({'success_adjudication': {'success': True, 'reviewed': True, 'reviewer': 'Scientific reviewer', 'criterion': 'Primary endpoint met prespecified success rule', 'source_reference': 'final-analysis:T14'}})
        self.assertEqual(item.success, 1)
        self.assertEqual(item.label_source, 'final-analysis:T14')

    def test_integer_one_is_not_boolean_review(self):
        item = self._run({'success_adjudication': {'success': 1, 'reviewed': True, 'reviewer': 'X', 'criterion': 'Y', 'source_reference': 'Z'}})
        self.assertEqual(item.label_status, 'unreviewed')

    def test_source_file_is_preserved(self):
        record = {'nct_id': 'NCT00000000', 'outcome_summary': 'not significant'}
        original = json.dumps(record)
        self._run(record)
        self.assertEqual((self.folder / 'inputs' / 'record.json').read_text(), original)


if __name__ == '__main__':
    unittest.main()
