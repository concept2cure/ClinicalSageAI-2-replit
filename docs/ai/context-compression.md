# Context Compression

Goal: Provide agents only the relevant files to reduce token usage and hallucination risk.

## Recommended Tools

- Repomix (preferred): fast packing and filtering of repo content
- Gitingest: repository summarization and filtering

## Usage

### Option A: Repomix

1. Install (one-time):
   - npm i -g repomix
2. Run context pack:
   - scripts/ai/context-pack.sh

### Option B: Gitingest

1. Install (one-time):
   - pip install gitingest
2. Run context pack:
   - scripts/ai/context-pack.sh

## Output

The context pack is written to:

- .ai/context/repomix.json (Repomix)
- .ai/context/gitingest.json (Gitingest)

## Scope Profile (default)

The packer focuses on the most relevant areas for architecture and product work:

- server/
- client/src/
- shared/
- docs/adr/
- docs/architecture/
- package.json, tsconfig.json, drizzle.config.ts

Update the include list in scripts/ai/context-pack.sh if scope changes.
