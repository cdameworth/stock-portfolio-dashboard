# Stock Portfolio Dashboard - Dockerfile
FROM node:20-alpine

WORKDIR /app
RUN apk add --no-cache curl
# Copy package files
COPY package*.json ./

# Install all dependencies including dev dependencies for build
RUN npm install --legacy-peer-deps && npm cache clean --force

# Copy application code
COPY . .

# Create logs directory
RUN mkdir -p logs

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Change ownership only for essential directories
RUN chown -R nodejs:nodejs /app/logs 2>/dev/null || true && \
    chown nodejs:nodejs /app
USER nodejs

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

# Start application
CMD ["npm", "start"]