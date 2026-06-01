-- AnA tool-trace memory: a hidden metadata channel on chat messages.
--
-- Stores the structured record of the tools AnA ran during a turn (and a
-- one-line summary of each result) on the assistant message, separate from the
-- visible answer in `content`. It is summarized back into AnA's context on the
-- next turn so she remembers her prior investigation, and lets the UI
-- reconstruct the step timeline for past turns. Nullable and additive — no
-- backfill, no rewrite of existing rows.
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS metadata JSONB;
