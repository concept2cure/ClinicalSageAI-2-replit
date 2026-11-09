# Concept2Cure — startup instructions

**Codespaces + Neon + OpenAI:** [current recovery procedure](../operations/CODESPACES_NEON_OPENAI_RECOVERY.md).

The old Replit startup/dependency-repair instructions and the statement
"OpenAI API quota is currently exceeded" are **historical, not a live check**.

For `concept2cure-v2` on GitHub Codespaces:

1. Configure **`APP_DATABASE_URL`** as a repository-accessible Codespaces secret for the non-owner runtime role, pointing to the intended Neon branch/database. Keep `DATABASE_URL` / `DATABASE_OWNER_URL` out of the running app; they are optional and reserved for separate authorized database maintenance.
2. Use Node.js 22, `npm ci`, then `npm run codespaces:doctor`. Repair its named blockers; do not silently create a replacement local PostgreSQL database.
3. Start using `npm run dev`. Then run `npm run codespaces:doctor -- --check-app` to verify actual server dependencies and AnA readiness.
4. `--probe-openai` checks key authentication without a generation charge. `--probe-openai-usage` performs a small, deliberately billable API usage check. Neither allows an unqualified model to write regulated text.

A green Codespace startup banner, a working chat response, and `200 /healthz` are not evidence of a complete CSR, regulatory approval or successful export. Validate the same deployed project, document, independent review and exported/reopened artifact before another client demonstration.
