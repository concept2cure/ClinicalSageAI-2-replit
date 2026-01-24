#!/bin/bash

# Number of batches to run (each batch adds 50 records)
NUM_BATCHES=${1:-5}

echo "Running $NUM_BATCHES batches (50 trials each)..."

for ((i=1; i<=$NUM_BATCHES; i++)); do
  echo ""
  echo "=== Running Batch $i of $NUM_BATCHES ==="
  node run_one_batch.js
  
  # Add a small delay between batches
  if [ $i -lt $NUM_BATCHES ]; then
    echo "Waiting 3 seconds before next batch..."
    sleep 3
  fi
done

echo ""
echo "=== All $NUM_BATCHES batches complete ==="