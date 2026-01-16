#!/bin/bash

# ==========================================
# MASTER STARTUP PROTOCOL - Clinical Sage AI
# ==========================================

echo "🚀 Phase 1: Cleaning up existing processes..."
pkill -f "node" || true
pkill -f "tsx" || true
pkill -f "python" || true

echo "📦 Phase 2: Verifying Dependencies..."
npm install --no-audit --no-fund

echo "🗄️ Phase 3: Synchronizing Database Schema..."
# Force push schema to ensure 'facts' and 'slug' columns exist
npx drizzle-kit push:pg --config=drizzle.config.ts || {
  echo "⚠️ Database push failed. Attempting alternative sync..."
  # If the above fails, we'll try to use the internal db:push script
  npm run db:push
}

echo "🌱 Phase 4: Seeding Critical Facts & Demo Data..."
npx tsx seed_facts.ts || echo "⚠️ Seeding failed, continuing anyway..."

echo "⚡ Phase 5: Starting Platform with Optimized Config..."
# Run the dev server
npm run dev
