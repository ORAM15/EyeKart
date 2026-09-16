# ==============================================================================
# EyeKart Production Containerfile (Phase 3 Deployment Foundation)
# Platform: EyeKart Optical Commerce & Clinical Healthcare Platform
# Legal Entity: EYE KART HEALTHCARE LIMITED (Nairobi, Kenya)
# ==============================================================================

FROM node:20-alpine AS runner

WORKDIR /app

# Set default production environment variables
ENV NODE_ENV=production
ENV PORT=3001
ENV HOST=0.0.0.0
ENV TRUST_PROXY=true

# 1. Install production dependencies in server
COPY server/package*.json ./server/
RUN cd server && npm ci --omit=dev --ignore-scripts

# 2. Copy root configuration and package files
COPY package*.json ./
COPY favicon.ico ./
COPY index.html ./

# 3. Copy application assets and frontend Stitch panels
COPY assets ./assets
COPY Stitch ./Stitch

# 4. Copy backend application source
COPY server/src ./server/src

# Set ownership to unprivileged node user for security
RUN chown -R node:node /app
USER node

# Expose HTTP port
EXPOSE 3001

# Healthcheck against liveness probe
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:3001/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1));"

# Launch EyeKart production server
CMD ["node", "server/src/server.js"]
