# D2: bounded reporting foundation expectation repair

The retained reporting-stash inventory found one unincorporated test correction: the foundation check still required the removed duplicate `regional_registry_readiness` provider. The current orchestrator uses canonical `submission_readiness` plus `regional_package_manifest`.

The unchanged Node test reproduced **12 passed / 1 failed**, then the corrected expectation passed **13/13**, no skips. The repair asserts the duplicate is absent and canonical readiness is present. The package-manifest, evaluator, package builder, registry, count and all other existing assertions remain. Test case count stays 13. No reporting implementation changed.

```sh
PATH=/home/agent/.npm/_npx/6d82ddbdd7da268b/node_modules/node/bin:$PATH \
  node --test tests/ops/report-os-foundation.test.mjs
```

`red.log`, `green.log`, `red-pins.json` and `final-pins.json` retain the actual results and source identity. This Node test reads source contracts; it does not execute a report engine, database query, scheduler or provider call.

The original stash `8555ddd92aab26cefbac9452222926e6523079c0` and its index/untracked parents remain retained without application, deletion or replay. Its full 59 tracked + 33 untracked path inventory is in the private control-tower report `/workspace/.codex-notes/reporting-stash-disposition.md`; no historical evidence was rewritten. No staging, commit or push was performed.
