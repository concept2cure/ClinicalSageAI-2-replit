# TrialSage CER Worker
# Optimized container for PDF generation with puppeteer

# Use Node.js LTS as base
FROM node:20-slim

# Set working directory
WORKDIR /app

# Install dependencies required for Puppeteer
RUN apt-get update \
    && apt-get install -y wget gnupg ca-certificates procps libxss1 \
    && wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | apt-key add - \
    && sh -c 'echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" >> /etc/apt/sources.list.d/google.list' \
    && apt-get update \
    && apt-get install -y google-chrome-stable \
      --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production \
    && npm cache clean --force

# Copy application files
COPY worker/ ./worker/
COPY services/ ./services/
COPY shared/ ./shared/

# Set environment variables
ENV NODE_ENV production
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD true
ENV PUPPETEER_EXECUTABLE_PATH /usr/bin/google-chrome-stable
ENV MAX_BROWSER_INSTANCES 2
ENV LOG_LEVEL info

# Create directory for PDF output
RUN mkdir -p /tmp/cer-pdfs \
    && chmod 777 /tmp/cer-pdfs

# Add healthcheck
HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
  CMD wget -q --spider http://localhost:3001/health || exit 1

# Run with reduced privileges
USER node

# Command to run the worker
CMD ["node", "worker/index.js"]