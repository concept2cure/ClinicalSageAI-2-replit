# 1. BUILD STAGE
FROM node:18-alpine as builder

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci

# Copy source
COPY . .

# Build React Frontend
RUN npm run build:client

# Build TypeScript Backend
RUN npm run build:server

# 2. RUN STAGE
FROM node:18-alpine

WORKDIR /app

# Copy built assets from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/build ./build
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules

# Expose Port
EXPOSE 3000

# Start Command
CMD ["npm", "start"]