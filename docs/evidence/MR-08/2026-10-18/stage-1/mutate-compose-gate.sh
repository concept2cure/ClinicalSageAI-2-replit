#!/bin/bash
# Comment out each checkScanner rule in a copy of the gate and run --self-test:
# every mutation must make the self-test fail (exit 1) naming the case it guards.
R=/home/user/ClinicalSageAI-2-replit
W=$(mktemp -d -p "$(dirname "$0")" mut.XXXX)
mkdir -p $W/scripts/ci $W/.github/workflows $W/terraform/stack $W/server/config
ln -s $R/node_modules $W/node_modules
cp $R/.github/workflows/deploy-aws.yml $W/.github/workflows/
cp $R/terraform/stack/variables.tf $W/terraform/stack/
cp $R/server/config/platform-limits.ts $W/server/config/
declare -a RULES=(
  "if (host.kind === 'absent') {"
  "if (host.kind !== 'literal') {"
  "if (!scanner || scannerName === serviceName) {"
  "if (!test || (Array.isArray(test) && test.length === 0)) {"
  "if (Array.isArray(deps) || deps?.[scannerName]?.condition !== 'service_healthy') {"
  "if (scanner?.image !== expect.image) {"
  "if (String(senv.CLAMD_CONF_StreamMaxLength) !== expect.streamMaxLength) {"
  "if (String(senv.CLAMD_CONF_AlertExceedsMax) !== 'yes') {"
)
for rule in "${RULES[@]}"; do
  python3 - "$R/scripts/ci/check-compose-boot-contract.mjs" "$W/scripts/ci/check-compose-boot-contract.mjs" "$rule" <<'PY'
import sys
src,dst,rule=sys.argv[1:]
s=open(src).read()
assert s.count(rule)==1, rule
open(dst,'w').write(s.replace(rule, "if (false /* rule commented out */) {",1))
PY
  echo "=== rule disabled: $rule"
  node $W/scripts/ci/check-compose-boot-contract.mjs --self-test 2>&1 | grep -E "^FAIL|^ +expected|self-test:" 
  echo "self-test exit=${PIPESTATUS[0]}"
done
rm -rf $W
