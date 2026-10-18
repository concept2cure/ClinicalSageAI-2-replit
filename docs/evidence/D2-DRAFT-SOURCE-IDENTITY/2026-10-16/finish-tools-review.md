# D2 tooling review

The postmerge review binds the eight tool-owned sources at canonical commit `fa7ea5bc3598849ce59fe07c19d10fc79b204efc` in [finish-tools-review.json](finish-tools-review.json). No application or test source was changed during this review.

The advertised schema requires complete V2 version and SHA-256 identity fields and accepts absolute UTF-16 offsets beyond 80,000. Its safe-integer coordinate limits agree with the canonical runtime decoder; the decoder also enforces nonempty spans, 12,000-unit width, 48,000-unit aggregate and one to eight distinct document identities. Actual batch receipts preserve identity and coordinates while stripping source text. New writes cannot select the saved-only historical decoder by omitting identity fields.

The canonical merge preserves the existing upstream fixture extraction and the V2 registered controls. The extracted `authoringCounts` function is initialized before control registration, avoiding a temporal dead zone. The source identity decoder, V2 provenance marker and one source-store reservation remain in the canonical save service. Upstream’s single-body save composes that same writer, retains the stated change reason and invents no selected source references. Its reply still says a person must file the draft from the editor.

The postmerge focused log records 50 passing registered-tool, single-body save and schema tests across three files; all seven merge-bound source paths still match their recorded hashes. The lead’s frozen 43-file combined cohort qualifies the current tool/HTTP/tenant set. Prior 47/3 and 53/3 owner logs are retained as historical passes without a contemporaneous tool-owned before/after source manifest. The initial seven PGlite failures were fixture SQL parameter-type errors, not product fail-first evidence. The schema fail-first run records 10 intended failures and five controls.

Fresh postmerge lint passes all eight owned files and all three recursively discovered active evidence .mjs files: **11 files, zero errors and zero warnings**, with unchanged before/after hashes. Upstream’s fixture extraction resolved the earlier max-lines warning. Five .mts evidence sources remain outside the repository’s actual ESLint glob and receive no lint-pass claim. No lint configuration was changed.

PGlite uses real embedded PostgreSQL SQL and one connection. These checks do not establish native PostgreSQL concurrency, production RLS, provider delivery, model use, scientific review, agency acceptance or deployment. Owner counts overlap the combined cohort.
