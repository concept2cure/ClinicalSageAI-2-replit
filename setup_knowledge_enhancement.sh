#!/bin/bash

# TrialSage Automated Knowledge Enhancement System Setup
# This script installs required dependencies and sets up
# the automated knowledge enhancement system.

echo "=================================================="
echo "TrialSage Automated Knowledge Enhancement System"
echo "=================================================="
echo ""
echo "Setting up the knowledge enhancement system..."

# Install required packages
echo "Installing required Node.js packages..."
npm install axios node-cron xml2js

# Create required directories
echo "Creating required directories..."
mkdir -p data/academic_sources
mkdir -p data/academic_sources/journal_articles
mkdir -p data/knowledge_structure
mkdir -p data/trial_registries
mkdir -p data/processed_knowledge
mkdir -p logs/knowledge_enhancement

# Check if scripts exist
if [ ! -f "knowledge_scheduler.js" ]; then
  echo "Error: knowledge_scheduler.js not found!"
  exit 1
fi

if [ ! -f "auto_knowledge_enhancement.js" ]; then
  echo "Error: auto_knowledge_enhancement.js not found!"
  exit 1
fi

if [ ! -f "journal_rss_monitor.js" ]; then
  echo "Error: journal_rss_monitor.js not found!"
  exit 1
fi

# Create monitoring script that will run at system startup
echo "Creating startup script..."
cat > start_knowledge_enhancement.sh << 'EOF'
#!/bin/bash
# Start the knowledge enhancement scheduler in the background
echo "Starting knowledge enhancement scheduler..."
node knowledge_scheduler.js > logs/knowledge_enhancement/scheduler.log 2>&1 &
echo $! > logs/knowledge_enhancement/scheduler.pid
echo "Knowledge enhancement scheduler started with PID $(cat logs/knowledge_enhancement/scheduler.pid)"
EOF

chmod +x start_knowledge_enhancement.sh

# Create script to check status
echo "Creating status check script..."
cat > check_knowledge_status.sh << 'EOF'
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
EOF

chmod +x check_knowledge_status.sh

# Create script to manually run tasks
echo "Creating manual task runner script..."
cat > run_knowledge_task.sh << 'EOF'
#!/bin/bash
if [ $# -ne 1 ]; then
  echo "Usage: ./run_knowledge_task.sh <taskKey>"
  echo "Available tasks: canadaImport, knowledgeEnhancement, journalMonitor, bulkCanadaImport"
  exit 1
fi

echo "Running task: $1"
node knowledge_scheduler.js run $1
EOF

chmod +x run_knowledge_task.sh

echo ""
echo "Setup complete!"
echo ""
echo "To start the knowledge enhancement system:"
echo "  ./start_knowledge_enhancement.sh"
echo ""
echo "To check status:"
echo "  ./check_knowledge_status.sh"
echo ""
echo "To run a task manually:"
echo "  ./run_knowledge_task.sh <taskKey>"
echo "  Available tasks: canadaImport, knowledgeEnhancement, journalMonitor, bulkCanadaImport"
echo ""
echo "For more information, see KNOWLEDGE_ENHANCEMENT_README.md"
echo "=================================================="