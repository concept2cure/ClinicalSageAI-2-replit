#!/bin/bash

# Start the continuous CSR upload service
# This script starts the continuous upload service that processes
# trials in batches of 50 at a time on a regular schedule

echo "Starting Continuous CSR Upload Service"
node continuous_csr_upload.js