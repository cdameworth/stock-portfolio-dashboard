# Railway Deployment Guide - Stock Portfolio Dashboard

This guide provides complete instructions for deploying the Stock Portfolio Dashboard to Railway.app.

## Table of Contents
1. [Prerequisites](#prerequisites)
2. [Quick Start](#quick-start)
3. [Manual Setup](#manual-setup)
4. [Environment Variables](#environment-variables)
5. [Database Migrations](#database-migrations)
6. [Monitoring & Logging](#monitoring--logging)
7. [Troubleshooting](#troubleshooting)

## Prerequisites

### Required
- Railway account (sign up at https://railway.app)
- Railway CLI installed: `npm install -g @railway/cli`
- Git repository for your code

### Optional but Recommended
- Stock Analytics API endpoint (external service)
- SigNoz account for observability (https://signoz.io)
- Google AdSense account for monetization

## Quick Start

### Option 1: Automated Setup (Recommended)

Run the setup script from the project root:

```bash
./.railway/setup-railway.sh
```

This script will:
1. Check for Railway CLI installation
2. Create or link to a Railway project
3. Add PostgreSQL and Redis services
4. Generate and set secure secrets
5. Configure environment variables
6. Optionally deploy the application

### Option 2: Deploy Button (Coming Soon)

[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/new/template)

## Manual Setup

### Step 1: Install Railway CLI

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login to Railway
railway login
```

### Step 2: Initialize Project

```bash
# Create a new Railway project
railway init --name stock-portfolio-dashboard

# Or link to existing project
railway link
```

### Step 3: Add Database Services

```bash
# Add PostgreSQL
railway add
# Select "PostgreSQL" from the list

# Add Redis
railway add
# Select "Redis" from the list
```

Railway will automatically create these services and expose connection variables:
- **PostgreSQL**: `DATABASE_URL`, `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`, `PGPASSWORD`
- **Redis**: `REDIS_URL`, `REDIS_HOST`, `REDIS_PORT`

### Step 4: Configure Environment Variables

#### Generate Secrets

```bash
# Generate Branca secret (32 characters base64)
openssl rand -base64 32

# Generate JWT secret (64 characters hex)
openssl rand -hex 64

# Generate session secret (64 characters hex)
openssl rand -hex 64
```

#### Set Variables via CLI

```bash
# Core application variables
railway variables set NODE_ENV=production
railway variables set BRANCA_SECRET="<generated-branca-secret>"
railway variables set JWT_SECRET="<generated-jwt-secret>"
railway variables set SESSION_SECRET="<generated-session-secret>"

# Observability
railway variables set OTEL_SERVICE_NAME=stock-portfolio-dashboard
railway variables set OTEL_SERVICE_VERSION=1.0.0
railway variables set SIGNOZ_ACCESS_TOKEN="<your-signoz-token>"
railway variables set OTEL_EXPORTER_OTLP_ENDPOINT=https://ingest.us.signoz.cloud:443/v1/traces

# External API
railway variables set STOCK_ANALYTICS_API_URL="<your-api-endpoint>"

# Optional: Advertising
railway variables set GOOGLE_AD_PUBLISHER_ID="ca-pub-your-id"
railway variables set ENABLE_ADS=true
```

#### Set Variables via Dashboard

1. Go to https://railway.app/dashboard
2. Select your project
3. Click on the application service
4. Go to "Variables" tab
5. Add the variables from `.env.railway`

### Step 5: Deploy

```bash
# Deploy the application
railway up

# View deployment logs
railway logs

# Get your application URL
railway domain
```

## Environment Variables

### Required Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `NODE_ENV` | Environment mode | `production` |
| `BRANCA_SECRET` | 32-char secret for tokens | Generated via openssl |
| `JWT_SECRET` | JWT signing secret | Generated via openssl |
| `SESSION_SECRET` | Session encryption key | Generated via openssl |
| `DATABASE_URL` | PostgreSQL connection | Auto-set by Railway |
| `REDIS_URL` | Redis connection | Auto-set by Railway |

### Optional Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `STOCK_ANALYTICS_API_URL` | External stock API | None |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | OpenTelemetry endpoint | SigNoz Cloud |
| `SIGNOZ_ACCESS_TOKEN` | SigNoz authentication | None |
| `GOOGLE_AD_PUBLISHER_ID` | AdSense publisher ID | None |
| `ENABLE_ADS` | Enable advertising | `false` |
| `EMAIL_PROVIDER` | Email service (ses/smtp/sendgrid) | None |
| `AWS_REGION` | AWS region for SES | `us-east-1` |
| `LOG_LEVEL` | Logging level | `info` |

### Railway-Provided Variables

Railway automatically sets these variables:
- `PORT` - Port to bind to (automatically assigned)
- `RAILWAY_ENVIRONMENT_NAME` - Environment name (production, staging, etc.)
- `RAILWAY_PROJECT_NAME` - Project name
- `RAILWAY_SERVICE_NAME` - Service name
- `RAILWAY_PUBLIC_DOMAIN` - Public domain for your service
- `RAILWAY_PRIVATE_DOMAIN` - Private domain for internal communication

### Referencing Service Variables

Use Railway's template syntax to reference variables from other services:

```bash
# Reference PostgreSQL database URL
DATABASE_URL=${{Postgres.DATABASE_URL}}

# Reference individual PostgreSQL variables
DB_HOST=${{Postgres.PGHOST}}
DB_PORT=${{Postgres.PGPORT}}
DB_NAME=${{Postgres.PGDATABASE}}

# Reference Redis URL
REDIS_URL=${{Redis.REDIS_URL}}

# Use Railway's public domain
BASE_URL=https://${{RAILWAY_PUBLIC_DOMAIN}}
```

## Database Migrations

### Run Migrations After Deployment

```bash
# Option 1: Via Railway CLI (from local machine)
railway run npm run migrate

# Option 2: Via Railway dashboard
# Go to your service → Settings → Deploy → Add a deploy command
# Set: "npm run migrate && npm start"
```

### One-Time Migration

```bash
# Connect to your Railway environment and run migrations
railway run npm run migrate
```

### Automatic Migrations on Deploy

Update your `railway.json` to run migrations on every deploy:

```json
{
  "$schema": "https://railway.com/railway.schema.json",
  "build": {
    "builder": "DOCKERFILE",
    "dockerfilePath": "application/Dockerfile"
  },
  "deploy": {
    "healthcheckPath": "/health",
    "healthcheckTimeout": 100,
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 10,
    "startCommand": "npm run migrate && npm start"
  }
}
```

## Architecture on Railway

```
┌─────────────────────────────────────────────┐
│           Railway Project                    │
│                                              │
│  ┌────────────────────┐                     │
│  │  Web Application   │                     │
│  │  (Node.js/Express) │                     │
│  │  Port: Auto        │                     │
│  │  Public Domain: ✓  │                     │
│  └─────────┬──────────┘                     │
│            │                                 │
│            ├───────────────┐                │
│            │               │                 │
│  ┌─────────▼────────┐  ┌──▼──────────────┐ │
│  │   PostgreSQL 16  │  │    Redis 7      │ │
│  │   (Private)      │  │    (Private)    │ │
│  │   Auto-backup    │  │    512MB RAM    │ │
│  └──────────────────┘  └─────────────────┘ │
│                                              │
└─────────────────────────────────────────────┘
```

### Service Configuration

**Application Service:**
- **Builder**: Dockerfile (application/Dockerfile)
- **Health Check**: `/health` endpoint
- **Timeout**: 100 seconds
- **Restart Policy**: On failure, max 10 retries
- **Resources**: 2GB RAM, 1 vCPU (configurable)
- **Scaling**: Can scale to multiple replicas

**PostgreSQL Service:**
- **Version**: PostgreSQL 16
- **Access**: Private network only
- **Backups**: Automatic daily backups
- **Resources**: 1GB RAM (configurable)

**Redis Service:**
- **Version**: Redis 7
- **Access**: Private network only
- **Persistence**: RDB + AOF
- **Resources**: 512MB RAM (configurable)

## Monitoring & Logging

### View Logs

```bash
# Stream logs in real-time
railway logs

# Stream logs with filtering
railway logs --filter "ERROR"

# View logs for specific service
railway logs --service stock-portfolio-app
```

### Railway Dashboard Monitoring

Access metrics via Railway dashboard:
1. Go to https://railway.app/dashboard
2. Select your project
3. Click on service
4. View "Metrics" tab for:
   - CPU usage
   - Memory usage
   - Network traffic
   - Request count

### External Monitoring (SigNoz)

If you configured SigNoz (recommended):
1. Traces are automatically sent to SigNoz Cloud
2. View distributed traces at https://signoz.io
3. Monitor API performance, errors, and latency
4. Set up alerts for critical issues

### Health Checks

Railway automatically monitors the `/health` endpoint:
- **Interval**: Every 30 seconds
- **Timeout**: 100 seconds (configurable in railway.json)
- **Failure Threshold**: 3 consecutive failures trigger restart

## Scaling

### Horizontal Scaling

```bash
# Scale to multiple replicas via Railway dashboard
# Go to: Service → Settings → Replicas
# Set desired replica count (requires paid plan)
```

### Vertical Scaling

```bash
# Adjust resources via Railway dashboard
# Go to: Service → Settings → Resources
# Adjust CPU and Memory limits
```

### Auto-Scaling (Enterprise Plan)

Railway Enterprise supports auto-scaling based on:
- CPU utilization
- Memory utilization
- Request rate

## Cost Estimation

### Railway Pricing (as of 2024)

**Starter Plan ($5/month):**
- $5 credit/month
- Pay-as-you-go for resources
- Estimated cost for this app: ~$15-25/month

**Resource Costs:**
- vCPU: ~$0.000463/minute ($20/month per vCPU)
- RAM: ~$0.000231/GB/minute ($10/month per GB)
- PostgreSQL: Included in resource usage
- Redis: Included in resource usage

### Cost Optimization Tips

1. **Use Shared Resources**: Start with smaller resource allocations
2. **Optimize Queries**: Reduce database load with proper indexing
3. **Enable Caching**: Use Redis effectively to reduce API calls
4. **Monitor Usage**: Review metrics weekly to optimize resource allocation
5. **Sleep Inactive Services**: Use Railway's sleep feature for development environments

## Troubleshooting

### Common Issues

#### 1. Build Fails

**Problem**: Docker build fails or times out

**Solution**:
```bash
# Check build logs
railway logs --deployment

# Verify Dockerfile is valid
docker build -t test -f application/Dockerfile .

# Check for missing dependencies in package.json
```

#### 2. Health Check Fails

**Problem**: Deployment shows "Health check failed"

**Solution**:
```bash
# Verify /health endpoint locally
curl http://localhost:5000/health

# Check health check timeout in railway.json
# Increase timeout if app needs more startup time

# Review application logs
railway logs --filter "health"
```

#### 3. Database Connection Issues

**Problem**: "Connection refused" or "Database not found"

**Solution**:
```bash
# Verify DATABASE_URL is set correctly
railway variables

# Check if PostgreSQL service is running
railway status

# Test database connection
railway run npm run health
```

#### 4. Environment Variables Not Loading

**Problem**: Application can't find environment variables

**Solution**:
```bash
# Verify variables are set
railway variables

# Check variable naming (case-sensitive)
# Verify syntax: ${{Postgres.DATABASE_URL}}

# Redeploy to pick up new variables
railway up --detach
```

#### 5. Out of Memory Errors

**Problem**: Application crashes with OOM errors

**Solution**:
```bash
# Increase memory allocation in Railway dashboard
# Go to: Service → Settings → Resources → Memory

# Check for memory leaks in code
# Review logs for memory usage patterns

# Consider horizontal scaling if needed
```

### Debug Mode

Run application locally with Railway environment:

```bash
# Run with Railway environment variables
railway run npm run dev

# Run with debug logging
railway run npm run dev -- --inspect

# Connect to Railway PostgreSQL from local machine
railway connect postgres
```

### Getting Help

- **Railway Documentation**: https://docs.railway.app
- **Railway Discord**: https://discord.gg/railway
- **GitHub Issues**: Create issue in this repository
- **Railway Status**: https://status.railway.app

## CI/CD Integration

### Automatic Deployments

Railway automatically deploys when you push to your connected Git repository:

1. Connect repository: Railway Dashboard → Service → Settings → Source
2. Select branch (e.g., `main`)
3. Configure deploy trigger (automatic or manual)

### GitHub Actions Integration

Create `.github/workflows/railway-deploy.yml`:

```yaml
name: Railway Deployment

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Install Railway CLI
        run: npm install -g @railway/cli

      - name: Deploy to Railway
        run: railway up --service stock-portfolio-app
        env:
          RAILWAY_TOKEN: ${{ secrets.RAILWAY_TOKEN }}
```

### Pre-Deployment Checks

Add pre-deployment validation:

```bash
# Add to railway.json
{
  "deploy": {
    "healthcheckPath": "/health",
    "restartPolicyType": "ON_FAILURE",
    "startCommand": "npm run validate && npm run migrate && npm start"
  }
}
```

## Security Best Practices

1. **Never commit secrets**: Use Railway variables, not `.env` files in Git
2. **Rotate secrets regularly**: Update BRANCA_SECRET, JWT_SECRET periodically
3. **Use private networking**: PostgreSQL and Redis should only be accessible privately
4. **Enable HTTPS only**: Railway provides automatic HTTPS
5. **Review logs regularly**: Monitor for suspicious activity
6. **Limit environment access**: Use Railway teams and permissions
7. **Enable 2FA**: Secure your Railway account with two-factor authentication

## Next Steps

1. ✅ Deploy application to Railway
2. ✅ Run database migrations
3. ✅ Configure custom domain (optional)
4. ✅ Set up monitoring alerts
5. ✅ Configure CI/CD pipeline
6. ✅ Test application thoroughly
7. ✅ Monitor resource usage and optimize

## Additional Resources

- [Railway Documentation](https://docs.railway.app)
- [Railway Templates](https://railway.app/templates)
- [Railway Pricing](https://railway.app/pricing)
- [Dockerfile Best Practices](https://docs.docker.com/develop/develop-images/dockerfile_best-practices/)
- [Node.js Production Best Practices](https://github.com/goldbergyoni/nodebestpractices)
