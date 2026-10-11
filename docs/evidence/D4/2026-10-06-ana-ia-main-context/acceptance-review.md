# Main chat live acceptance — pending

Use authorized test data and retain actual provider/model version, full replies,
SSE events, retrieved passages and the sealed turn record.

1. Begin a device plan, receive a question about intended use/market, then correct
   the product to an IVD for Japan. Continue without sending browser history.
   Verify that the stored correction informs routing and the reply; observe
   whether AnA avoids restarting intake or assuming US clearance.
2. Resume a named conversation with stale browser assumptions. Verify that the
   authoritative stored transcript is used. Repeat with an empty stored thread.
3. Fail the history read. Expect HISTORY_UNAVAILABLE, no model/tool/approval work,
   and a failed run. Retry after restoration: the failed read must not leave an
   additional unanswered question in the conversation.
4. Fail thread preparation and question persistence separately. Expect the
   appropriate static retryable error and no model or governed action.
5. Exercise an overlapping turn during question persistence. Verify that the
   current question occurs once and the prior clarification is retained. This
   confirms snapshot behavior, not serialized handling of every concurrent turn.
6. Start without a named conversation and send browser history. User/assistant
   turns may carry context; supplied system/tool roles must not gain authority.
7. Resume a stopped turn with prior tool metadata. Verify that tool carry-over
   and the incomplete-work warning remain present, and that no prior draft is
   applied without the existing governed approval/signature controls.

Local regressions verify these runtime controls using controlled dependencies.
Live judgment and regulatory correctness remain unverified.
