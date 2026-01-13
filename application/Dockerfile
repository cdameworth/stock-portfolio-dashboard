# Stock Portfolio Dashboard - Dockerfile for Railway
FROM node:20-alpine

WORKDIR /app

# Install curl for health checks
RUN apk add --no-cache curl

# Copy package files
COPY package*.json ./

# Install all dependencies including dev dependencies for build
RUN npm install --legacy-peer-deps && npm cache clean --force

# Copy application code
COPY . .

# Build React app
RUN npm run build:react || echo "React build skipped (may not be configured)"

# Create logs directory
RUN mkdir -p logs

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Change ownership of all app files to nodejs user
RUN chown -R nodejs:nodejs /app
USER nodejs

# Railway uses PORT environment variable (defaults to 3000)
ENV PORT=3000
EXPOSE $PORT

# Health check - increased start-period to allow for DB migrations and service initialization
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=5 \
  CMD curl -f http://localhost:3000/health || exit 1

# Start application
CMD ["npm", "start"]