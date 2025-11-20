# TrialSage Deployment Guide

## 🚨 Deployment Issue Resolution

This guide resolves the FastAPI deployment conflicts you encountered:

### Issues Fixed:

- ✅ Conflicting FastAPI dependencies in requirements.txt
- ✅ Multiple duplicate PyPDF2 entries
- ✅ Build command using npm instead of pip for Python project
- ✅ Run command optimized for hybrid Node.js/Python architecture

---

## 🚀 Deployment Instructions

### Method 1: Use the Automated Deployment Script

1. **Run the deployment script:**
   ```bash
   ./deploy.sh
   ```

This script will:

- Install Python dependencies without conflicts
- Install Node.js dependencies
- Build the application properly
- Verify deployment readiness

2. **Start the application:**
   ```bash
   npm run start
   ```

### Method 2: Manual Deployment Steps

If you prefer manual control:

1. **Install Python dependencies:**

   ```bash
   pip install --no-cache-dir -r server/services/python/requirements.txt
   ```

2. **Install Node.js dependencies:**

   ```bash
   npm ci --production=false
   ```

3. **Build the application:**

   ```bash
   npm run build
   ```

4. **Start the application:**
   ```bash
   npm run start
   ```

---

## 🔧 Dependency Conflict Resolution

The deployment conflicts were caused by:

- Multiple requirements.txt files with overlapping dependencies
- Deployment system processing npm commands for Python services
- Duplicate `pydantic-settings` entries across service requirements

**Solution:** The deployment script consolidates dependencies and uses the correct build sequence.

---

## 🐍 Python Service Architecture

Your TrialSage platform uses a hybrid architecture:

- **Primary:** Node.js/TypeScript server (port 5000)
- **Secondary:** Python FastAPI services (spawned as child processes)
- **Frontend:** React with Vite

The deployment script ensures both environments are properly configured.

---

## 💡 Deployment Best Practices

1. **Always use the deployment script** to avoid dependency conflicts
2. **Test locally first** with `./deploy.sh` before deploying to production
3. **Monitor logs** for Python service startup messages
4. **Verify both services** are running after deployment:
   - Node.js server: `http://localhost:5000`
   - Python health check: Available through Node.js proxy

---

## 🆘 Troubleshooting

If deployment still fails:

1. **Clear caches:**

   ```bash
   rm -rf node_modules/.cache
   rm -rf .npm
   pip cache purge
   ```

2. **Run dependency fix:**

   ```bash
   ./fix-dependencies.sh
   ```

3. **Check Python installation:**

   ```bash
   python --version
   pip --version
   ```

4. **Verify requirements:**
   ```bash
   pip check
   ```

---

## ✅ Success Indicators

Deployment is successful when you see:

- ✅ "Python dependencies installed successfully"
- ✅ "Node.js dependencies installed successfully"
- ✅ "Application built successfully"
- ✅ "Deployment preparation completed successfully!"

After starting with `npm run start`, you should see:

- Node.js server running on port 5000
- Python FastAPI backend startup messages
- Database connection successful messages
