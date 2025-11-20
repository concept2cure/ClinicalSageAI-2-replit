#!/bin/bash
echo "TrialSage Knowledge Enhancement Status"
echo "====================================="
if [ -f "logs/knowledge_enhancement/scheduler.pid" ]; then
  PID=$(cat logs/knowledge_enhancement/scheduler.pid)
  if ps -p $PID > /dev/null; then
    echo "Scheduler is running with PID $PID"
    node knowledge_scheduler.js status
  else
    echo "Scheduler is not running (stale PID file)"
  fi
else
  echo "Scheduler is not running (no PID file found)"
fi
