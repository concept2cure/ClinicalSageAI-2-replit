#!/bin/bash

# ==========================================
# MASTER STARTUP PROTOCOL - Clinical Sage AI
# ==========================================

echo "🚀 Phase 1: Cleaning up existing processes..."
pkill -f "node" || true
pkill -f "tsx" || true
pkill -f "python" || true

echo "🤖 Phase 2: Handing off to Dev Guardian orchestration..."
npm run dev:guardian
