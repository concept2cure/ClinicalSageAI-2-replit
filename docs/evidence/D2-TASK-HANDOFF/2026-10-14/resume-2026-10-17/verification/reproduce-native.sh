#!/usr/bin/env bash
# Run from the repository root with Node 22 and an already provisioned isolated
# native test database named concept2cure-ri_dbtest. Set actual owner/runtime
# credentials outside Git; the existing fixture guard verifies the target.
set -euo pipefail
: "${TEST_DATABASE_URL:?Set the isolated native test owner connection}"
: "${APP_DATABASE_URL:?Set the restricted app_service runtime connection}"
export CI=true
export NODE_ENV=test
export RLS_ENFORCE=on
export NODE_OPTIONS=--max-old-space-size=4096
export EMBEDDING_PROVIDER=local
export EMBEDDING_LOCAL_BASE_URL=
export LOCAL_AI_BASE_URL=
export OPENAI_API_KEY=
export OPENAI_BASE_URL=
export OPENAI_API_BASE=
export ANTHROPIC_API_KEY=
export ANTHROPIC_BASE_URL=
export AZURE_OPENAI_API_KEY=
export AZURE_OPENAI_ENDPOINT=
export GEMINI_API_KEY=
export GOOGLE_API_KEY=
export DEEPSEEK_API_KEY=
export XAI_API_KEY=
export GROQ_API_KEY=
export MISTRAL_API_KEY=
export COHERE_API_KEY=
npx vitest run --config vitest.db.config.ts \
  tests/db/document-catalog-recall.dbtest.ts \
  tests/db/document-catalog.dbtest.ts \
  tests/db/vault-fixity.dbtest.ts \
  tests/db/workflow-import-governance.dbtest.ts
npx vitest run --config vitest.db.config.ts tests/db/vault-versions.dbtest.ts
