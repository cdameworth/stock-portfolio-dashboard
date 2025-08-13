# Stock Portfolio Dashboard - Dockerfile
FROM node:18-alpine

WORKDIR /app
RUN apk add --no-cache curl
# Copy package files
COPY package*.json ./

# RUN npm ci --only=production && npm cache clean --force
RUN if [ -f package-lock.json ]; then \
      echo "Lockfile found -> npm ci"; npm ci --omit=dev; \
    else \
      echo "No lockfile -> npm install"; npm install --omit=dev; \
    fi && npm cache clean --force

# Copy application code
COPY . .

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Change ownership
RUN chown -R nodejs:nodejs /app
USER nodejs

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

# Start application
CMD ["npm", "start"]