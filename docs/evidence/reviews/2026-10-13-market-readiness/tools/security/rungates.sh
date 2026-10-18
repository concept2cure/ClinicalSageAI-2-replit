#!/bin/bash
cd <repo>
S=<scratch>/security
for g in ci:committed-secrets ci:no-dev-auth-in-prod ci:unauthenticated-fetch ci:path-containment ci:org-path-param-guards ci:jwt-verify-pinned ci:client-ip-single-source ci:server-error-leaks ci:discarded-audit-write ci:sign-ceremony ci:regulated-delete-audit ci:gateway-bypass ci:dead-audit-catch ci:session-scoped-rls-bypass ci:drizzle-tenant-scope ci:tenant-entry-points ci:tenant-isolation:no-regression check:security-patterns check:compliance-claims; do
  f=$S/gate-$(echo $g | tr ':' '_').log
  ( time timeout 300 nice -n 10 npm run --silent $g ) > $f 2>&1
  echo "exit=$?" >> $f
  echo "$g done: $(tail -1 $f)" >> $S/gates-summary.txt
done
echo ALLDONE >> $S/gates-summary.txt
