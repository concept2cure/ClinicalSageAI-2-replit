# UI warning-growth remedy

Successor to the lead's normal push rejection at `9197e92c0`. Removes all four
assigned UI warning increases without changing rules, thresholds, suppressions
or warning baselines. Historical proof packets remain unchanged.

- Move the unchanged section-read comparison into the existing canonical read
  helper, preserving DocumentCanvas's exported API through re-export.
- Share the duplicated recorded exposure fixture in the conversation tests.
- Reuse the existing typed review-dialog fixture setup for prepared confirmations.
- Split the long access-test registration into coherent edit, list-session,
  whole-document ceremony and body-owner groups. All assertions remain.

One finite affected run passed **92 cases / six suites**, zero skips/failures
(25.41s), using Node 22.22.0, the existing config, heap 4096 and one worker.
`tests-node22.txt.gz` preserves the exact output including React act warnings.

Scoped ESLint compared the five changed files to exact HEAD: **zero errors and
six warnings before; zero errors and two after**. The remaining DocumentCanvas
function-length/complexity warnings were already present. All four assigned
max-lines/describe-length increases are gone. `lint-comparison.json` and the
retained detailed outputs record this; the intermediate send-review fixture
extraction still exceeding the limit is retained separately in `lint-current`.

`regression-files.json`, `result.json` and `source-pins.json` identify the
coverage and frozen inputs. `archives.json` pins deterministic gzip (`mtime=0`)
and decoded SHA-256 for exact archived proof bytes. No full 52-file rerun,
provider/server call, staging, commit or push was performed by this delegate.
Root owns the complete warning gate, compiler and publication.
