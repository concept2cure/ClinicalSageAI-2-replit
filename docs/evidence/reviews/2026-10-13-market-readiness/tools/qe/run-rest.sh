#!/bin/bash
cd <repo>
for i in 1 2 3 4; do
  echo "SHARD $i START $(date +%s)"
  timeout 900 env NODE_OPTIONS=--max-old-space-size=4096 ./node_modules/.bin/vitest run --config vitest.config.ts --maxWorkers=2 --shard=$i/4 --reporter=dot --reporter=json --outputFile=<scratch>/qe/vitest-rest-$i.json $(cat <scratch>/qe/rest-files.txt) > <scratch>/qe/vitest-rest-$i.log 2>&1
  echo "SHARD $i EXIT $? END $(date +%s)"
done
echo ALLDONE
