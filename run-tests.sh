#!/bin/bash

# Script to run frontend tests

echo "Starting frontend tests..."
cd client
NODE_OPTIONS=--experimental-vm-modules npx jest --config jest.config.js