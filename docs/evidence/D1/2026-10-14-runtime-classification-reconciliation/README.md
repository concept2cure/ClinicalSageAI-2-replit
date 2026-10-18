# D1: reconcile generated-directory inventory with the current production graph

Status: approved two-entry classification change applied; actual gate and its
existing self-test await the designated root runner slot because they invoke
esbuild. This phase does not claim a passing gate, image or production boot.

The earlier image-assets check failed because `RUNTIME_PATHS` still contained
`logs` and `output` entries unused by any module in the production bundle. Both
were classified as generated directories, not immutable assets. The exact
previous failure remains in the separate pinned-validator-download evidence.

Read-only source assessment showed that the literal `cwd/logs` writer lives in
an uncalled legacy error-handler module. Current index uses the shutdown module
and redacting Pino stdout logging. The `output` literal is a fallback filename
within AnA's tenant-scoped `tmp/<kind>/org-<id>/<uuid>` workspace; it is not a
current app-root output directory dependency. Existing generated scratch
classification and appuser ownership remain appropriate.

The change removes only those two stale data entries. Every discovery,
unclassified-path and stale-entry check, existing self-test, runtime writer,
Docker COPY, directory ownership and ignore remains unchanged. A newly reachable
literal path still requires its owner's explicit classification. This is an
inventory correction; no missing asset or detector is waived.

[manifest.json](manifest.json) pins the before/after classifier, current source
assessment inputs and the five unchanged validator-download files. The exact
approved patch and source assessment are retained. Earlier sealed evidence was
preserved. Root owns later runner scheduling, staging, commit and publication.
