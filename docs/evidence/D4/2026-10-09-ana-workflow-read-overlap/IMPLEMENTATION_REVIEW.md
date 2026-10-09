# Scoped implementation review

The independent read-only reviewer approved the production diff with no
material blocker. The reviewer made no edits and ran no verification process.

- Both original SQL literals, tenant/project argument arrays, and mappings are
  preserved exactly. The organization guard and unknown-type return remain.
- Each async task contains its original try/catch, covering synchronous query
  throws and asynchronous rejections. A failed read cannot discard its
  companion's evidence.
- Reads assign separate invocation-local arrays. The join completes before
  the unchanged deterministic workflow calculation and prompt builder run.
- Existing pool instrumentation scopes each statement independently and
  acquires separate clients. No transaction, connection, tenant setting or
  governance behavior is modified.
- Query count, per-turn workflow-promise sharing, caller deadline, workflow
  definitions and public signatures are unchanged. No cache or UI change.

The lead also reviewed the regressions. Deferred results and scripted timers
settle in `finally`, including when the old sequential implementation fails
the overlap assertions. The tests preserve readable status/prompt expectations,
failure survivors, absent/invalid-tenant guards and fresh scoped reads.

Timing evidence uses scripted database waits and is not a production benchmark.
The reader's existing fail-soft behavior remains; this speed change introduces
no new failure-reporting contract or cancellation mechanism.
