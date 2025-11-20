#!/bin/bash
# Start the knowledge enhancement scheduler in the background
echo "Starting knowledge enhancement scheduler..."
node knowledge_scheduler.js > logs/knowledge_enhancement/scheduler.log 2>&1 &
echo $! > logs/knowledge_enhancement/scheduler.pid
echo "Knowledge enhancement scheduler started with PID $(cat logs/knowledge_enhancement/scheduler.pid)"
