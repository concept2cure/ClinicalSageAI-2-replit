
#!/bin/bash

echo "🏗️ Starting TrialSage structure reorganization..."

# Create the clean directory structure
mkdir -p trialsage-clean/{client,server,data,docs,scripts,uploads,tests}
mkdir -p trialsage-clean/server/{api,services,db,utils,config}
mkdir -p trialsage-clean/client/{src,public}

echo "📁 Created clean directory structure"

# Move client files (keep existing React structure)
echo "📱 Moving client files..."
cp -r client/* trialsage-clean/client/
cp -r public/* trialsage-clean/client/public/ 2>/dev/null || true

# Move server files (consolidate all backend)
echo "⚙️ Moving server files..."
cp -r server/* trialsage-clean/server/
cp -r backend/* trialsage-clean/server/ 2>/dev/null || true
cp -r api/* trialsage-clean/server/api/ 2>/dev/null || true

# Move Python services to server/services
cp -r ind_automation/* trialsage-clean/server/services/ 2>/dev/null || true
cp -r services/* trialsage-clean/server/services/ 2>/dev/null || true

# Move data files
echo "📊 Moving data files..."
cp -r data/* trialsage-clean/data/ 2>/dev/null || true
cp -r migrations/* trialsage-clean/data/ 2>/dev/null || true
cp -r sql/* trialsage-clean/data/ 2>/dev/null || true

# Move documentation
echo "📚 Moving documentation..."
cp -r docs/* trialsage-clean/docs/ 2>/dev/null || true
cp *.md trialsage-clean/docs/ 2>/dev/null || true

# Move essential scripts only
echo "🔧 Moving essential scripts..."
cp scripts/verify-database-connection.js trialsage-clean/scripts/
cp scripts/emergency-cleanup.sh trialsage-clean/scripts/
cp scripts/run_migrations.js trialsage-clean/scripts/
cp scripts/setup-rls.js trialsage-clean/scripts/

# Move uploads
cp -r uploads/* trialsage-clean/uploads/ 2>/dev/null || true

# Move tests
cp -r test/* trialsage-clean/tests/ 2>/dev/null || true
cp -r client/src/__tests__/* trialsage-clean/tests/ 2>/dev/null || true

# Copy essential root files
cp package.json trialsage-clean/
cp .replit trialsage-clean/
cp .gitignore trialsage-clean/
cp README.md trialsage-clean/
cp SECURITY_README.md trialsage-clean/ 2>/dev/null || true

echo "✅ Structure reorganization complete!"
echo "📍 New structure created in 'trialsage-clean' directory"
echo "🔍 Review the new structure before replacing the current one"
