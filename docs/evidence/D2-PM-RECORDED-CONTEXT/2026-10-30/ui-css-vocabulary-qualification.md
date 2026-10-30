# Existing CSS vocabulary correction

The new card component used the undefined class `pj-card-sub`. The actual unchanged pre-push gate correctly refused it; `pre-push-css-refusal.txt` retains that failed attempt. It is not a publication receipt.

Root replaced the four exact class-name strings with the existing `sec-sub` rule in `client/src/concept2cure/v2/styles/app-v2.css:2186`. No CSS rule, baseline exception, request, ownership logic, displayed content or test assertion was added or changed for this correction. The component contains no remaining `pj-card-sub` reference.

On the frozen successor source, using Node 22, 4096 MiB heap and standard repository configuration:

- `ui-css-vocabulary-focused.txt`: **81 passed / 5 files**, exit 0, **12.31s**. The **26** recorded-card cases are included in the 81, not an additional execution or count. The same two synthetic asynchronous React `act(...)` warnings remain retained.
- `ui-css-vocabulary-lint.txt`: five owned source/test files, exit 0, empty output, **0 errors / 0 warnings**.

This repeats focused qualification and adds no test cases to earlier counts. Source/test files remained frozen and the UI agent made no edits during verification. Root separately owns the actual browser/build and normal pre-push gate retry; no accepted publication, deployment or agency acceptance is inferred from this note.
