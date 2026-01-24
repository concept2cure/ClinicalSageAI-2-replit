#!/usr/bin/env bash
set -e

# Ensure we're in the project root
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$DIR"

# Load environment variables (if you're using a .env file)
if [ -f .env ]; then
  export $(grep -v '^#' .env | xargs)
fi

echo "🔍 Running DeviceProfile API tests…"

# Run Jest for TS & JS files, in-band to avoid watch conflicts
npx jest --config jest.config.js --runInBand "$@"

echo "✅ All tests passed!"