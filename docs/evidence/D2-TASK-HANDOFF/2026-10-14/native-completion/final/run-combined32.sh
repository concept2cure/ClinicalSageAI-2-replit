#!/usr/bin/env bash
set -euo pipefail
cd /workspace/concept2cure
source /workspace/scratch/task-handoff-native/env.sh
export NODE_OPTIONS=--max-old-space-size=4096
export EMBEDDING_PROVIDER=local EMBEDDING_LOCAL_BASE_URL= LOCAL_AI_BASE_URL=
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
mapfile -t native_files < /workspace/scratch/task-handoff-native/prior-32-files.txt
npx vitest run --config vitest.db.config.ts "${native_files[@]}" --reporter=verbose --reporter=json --outputFile=/workspace/scratch/task-handoff-native/combined-32-after.json > /workspace/scratch/task-handoff-native/combined-32-after.log 2>&1
