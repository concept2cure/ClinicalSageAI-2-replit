# eCTD Co-Author Platform - Startup Instructions

## 🚀 Quick Start

To start the application with all dependencies properly installed:

```bash
./start-app.sh
```

This will:
1. Check and install all missing dependencies
2. Clean any corrupted packages
3. Start the development server

## 📦 Manual Dependency Installation

If you prefer to manually ensure dependencies are installed:

```bash
./startup-dependencies.sh
```

Then start the app normally:

```bash
npm run dev
```

## 🔧 Troubleshooting

### If the app fails to start:

1. **Complete Clean Install:**
   ```bash
   rm -rf node_modules package-lock.json
   npm install
   npm run dev
   ```

2. **If specific packages are missing:**
   ```bash
   npm install [package-name] --save
   ```

3. **Common missing packages:**
   - bcrypt
   - cheerio
   - jsonwebtoken
   - express-rate-limit
   - marked
   - All @tiptap/* packages

### Important Notes:

- The `startup-dependencies.sh` script includes ALL packages from package.json
- It automatically cleans corrupted packages (especially react-toastify and Vite cache)
- Critical packages are verified with specific versions to ensure compatibility
- The script is designed to handle Replit's storage limitations

## 🔄 Daily Startup Routine

Due to Replit's storage limitations, run this at the start of each work session:

```bash
./start-app.sh
```

This ensures all dependencies are present and the app starts successfully.

## ⚠️ OpenAI API Configuration

The OpenAI API quota is currently exceeded. To enable AI features:
1. Visit https://platform.openai.com/billing
2. Add credits to your OpenAI account
3. The API key is already configured in the environment

## 📋 Scripts Overview

- **start-app.sh** - Main startup script (runs dependencies + starts app)
- **startup-dependencies.sh** - Comprehensive dependency installer
- **install-critical-deps.sh** - Quick install for critical missing packages only

## 🛡️ Platform Stability

These startup scripts ensure:
- All 100+ npm packages are installed
- Corrupted packages are cleaned and reinstalled
- Vite cache is cleared to prevent build issues
- Critical imports are verified before starting
- The app starts with full functionality

---

**Note:** These scripts were created to address Replit's daily storage cleanup that removes npm packages, ensuring the platform remains stable and fully functional on every startup.