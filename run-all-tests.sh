#!/bin/bash

# Script to run both frontend and backend tests

echo "========================================"
echo "Running Frontend Tests (Stage 9A)"
echo "========================================"
cd client
NODE_OPTIONS=--experimental-vm-modules npx jest --config jest.config.js

echo ""
echo "========================================"
echo "Running Backend Tests (Stage 9B)"
echo "========================================"
cd ../server
NODE_OPTIONS=--experimental-vm-modules npx jest --config jest.config.js

echo ""
echo "Tests completed! Check results above."