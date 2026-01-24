#!/bin/bash
if [ $# -ne 1 ]; then
  echo "Usage: ./run_knowledge_task.sh <taskKey>"
  echo "Available tasks: canadaImport, knowledgeEnhancement, journalMonitor, bulkCanadaImport"
  exit 1
fi

echo "Running task: $1"
node knowledge_scheduler.js run $1
