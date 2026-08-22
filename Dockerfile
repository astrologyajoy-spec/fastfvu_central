# ===================================================================
# Multi-Stage Dockerfile for FastFVU Central Java FVU Engine
# Supports Node.js 18+ and OpenJDK 17 with NSDL TDS FVU JARs
# Compatible with Render, Cloud Run, Railway, and Docker Swarm
# ===================================================================

FROM node:18-bullseye-slim

# Install OpenJDK 17 JRE and necessary utilities
RUN apt-get update && apt-get install -y --no-install-recommends \
    openjdk-17-jre-headless \
    ca-certificates \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Verify Java installation
RUN java -version

# Set working directory
WORKDIR /app

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3000
ENV JAVA_TOOL_OPTIONS="-Dfile.encoding=UTF-8"

# Copy dependency manifests
COPY package*.json ./

# Install npm dependencies (including devDependencies needed for build)
RUN npm ci --include=dev

# Copy project source files
COPY . .

# Create directory for temp processing and ensure tools have permissions
RUN mkdir -p /app/temp /app/bin /app/fvu-tool && chmod -R 755 /app/bin /app/temp /app/fvu-tool

# Build the production assets and bundle the backend server with esbuild
RUN npm run build

# Prune devDependencies to keep container lean
RUN npm prune --omit=dev

# Expose port
EXPOSE 3000

# Healthcheck
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:3000/api/health || exit 1

# Start the full-stack server
CMD ["node", "dist/server.cjs"]
